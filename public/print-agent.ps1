# ─────────────────────────────────────────────────────────────────────────────
# Telefutura POS Agent — UN agente locale per PC negozio. All'avvio del PC si
# collega al CRM cloud (coda print_jobs, HTTPS in uscita: passa dal firewall) e
# pilota i dispositivi del negozio sul LAN. Sostituisce il ruolo di SuiteMobile.
# Non serve installare nulla: PowerShell c'e' su ogni Windows.
#   • STAMPANTE FISCALE Epson RT (ePOS/fpMate)  → job fiscal_receipt/status/test/non_fiscal/raw
#   • CASSA AUTOMATICA  pagAmico (TCP 9100)      → job cash_collect
#
# INSTALLA (una riga in PowerShell) — parte a OGNI accesso al PC, in background:
#   powershell -ExecutionPolicy Bypass -Command "iwr https://crm.telefuturasrl.com/print-agent.ps1 -OutFile $env:TEMP\pa.ps1; & $env:TEMP\pa.ps1 -Install -Token 'IL_TOKEN' -Negozio 'Donna Olimpia' -FiscalUrl 'http://192.168.1.50' -CashIp '192.168.1.201'"
#
# Solo per una sessione (finestra aperta, senza installare): togli -Install.
# ─────────────────────────────────────────────────────────────────────────────
param(
  [string]$Crm = "https://crm.telefuturasrl.com",
  [string]$Token = $env:PRINT_AGENT_TOKEN,
  [string]$Negozio = "",
  [string]$FiscalUrl = "",              # base URL stampante fiscale (es. http://192.168.1.50)
  [string]$CashIp = "",                 # IP cassa pagAmico (es. 192.168.1.201)
  [int]$IntervalSec = 4,
  [switch]$Install                      # registra l'agente come attivita' pianificata all'avvio
)

# ── Installazione come attivita' pianificata (auto-start a ogni accesso) ─────
if ($Install) {
  if (-not $Token) { Write-Error "Token mancante per l'installazione."; exit 1 }
  $dest = Join-Path $env:LOCALAPPDATA "TelefuturaPosAgent\agent.ps1"
  New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
  Copy-Item -Path $MyInvocation.MyCommand.Path -Destination $dest -Force
  # Scarica anche il driver Custom (registratori Vodafone via OPOS locale).
  try { Invoke-WebRequest -UseBasicParsing -Uri "$Crm/cust-fp.ps1" -OutFile (Join-Path (Split-Path $dest) "cust-fp.ps1") -TimeoutSec 30 } catch { }
  $argLine = "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$dest`" -Crm `"$Crm`" -Token `"$Token`" -Negozio `"$Negozio`" -FiscalUrl `"$FiscalUrl`" -CashIp `"$CashIp`""
  # Avvio automatico a ogni ACCESSO — chiave Run dell'UTENTE: nessun permesso admin.
  Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "TelefuturaPosAgent" -Value ("powershell " + $argLine) -Force
  # Chiudi eventuali agenti gia' in esecuzione (evita doppioni al re-install).
  Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
    Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -match 'TelefuturaPosAgent' } |
    ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force } catch { } }
  # Avvia subito, nascosto.
  Start-Process powershell -WindowStyle Hidden -ArgumentList $argLine
  Write-Host ""
  Write-Host "  Installato (avvio automatico all'accesso, SENZA admin) e GIA' in esecuzione." -ForegroundColor Green
  Write-Host "  Negozio='$Negozio'  stampante='$FiscalUrl'  cassa='$CashIp'"
  Write-Host "  (Per rimuoverlo: Remove-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name TelefuturaPosAgent)"
  Write-Host ""
  exit 0
}

if (-not $Token) { Write-Error "Token mancante. Usa -Token '...' oppure imposta `$env:PRINT_AGENT_TOKEN"; exit 1 }
$headers = @{ Authorization = "Bearer $Token" }
$nextUrl = "$Crm/api/print/next"
if ($Negozio) { $nextUrl += "?negozio=$([uri]::EscapeDataString($Negozio))" }

Write-Host ""
Write-Host "  Telefutura POS Agent AVVIATO" -ForegroundColor Cyan
Write-Host "  CRM=$Crm  negozio='$Negozio'  stampante='$FiscalUrl'  cassa='$CashIp'  ogni ${IntervalSec}s"
Write-Host ""

# Driver Custom (registratori Vodafone via OPOS locale): sta accanto all'agente.
$scriptDir = Split-Path -Parent $PSCommandPath
$custFp = Join-Path $scriptDir "cust-fp.ps1"
# AUTO-AGGIORNAMENTO del driver Custom a ogni avvio dell'agente: gli aggiornamenti
# (es. il percorso FISCALE) arrivano da soli, senza tornare sul PC del negozio.
try { Invoke-WebRequest -UseBasicParsing -Uri "$Crm/cust-fp.ps1" -OutFile $custFp -TimeoutSec 30 | Out-Null } catch { }

# ── Stampante fiscale Epson (ePOS/fpMate) ────────────────────────────────────
function Invoke-Epson {
  param([string]$BaseUrl, [string]$RequestXml)
  $soap = '<?xml version="1.0" encoding="utf-8"?>' + "`n" +
          '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">' + "`n" +
          '<s:Body>' + "`n" + $RequestXml + '</s:Body>' + "`n" + '</s:Envelope>' + "`n"
  $printerUrl = $BaseUrl.TrimEnd('/') + "/cgi-bin/fpmate.cgi"
  $pr = Invoke-WebRequest -UseBasicParsing -Uri $printerUrl -Method Post -Body $soap `
        -ContentType "text/xml; charset=UTF-8" -Headers @{ SOAPAction = '""' } -TimeoutSec 40
  return $pr.Content
}

# ── Registratore Custom (Vodafone) — OPOS locale via MiraOposDll ─────────────
# Nessun HTTP: il device_url non-http (es. "custom" o "custom://<nomeOPOS>") indica
# un registratore Custom. Estrae il testo dall'ePOS XML e delega a cust-fp.ps1 (32b).
function Invoke-CustomOpos {
  param([string]$DeviceUrl, [string]$RequestXml)
  $oposName = "CUSTOM"
  if ($DeviceUrl -match '^custom://(.+)$') { $oposName = $Matches[1] }

  if (-not (Test-Path $custFp)) {
    try { Invoke-WebRequest -UseBasicParsing -Uri "$Crm/cust-fp.ps1" -OutFile $custFp -TimeoutSec 30 } catch { }
  }
  # Passa l'ePOS XML GREZZO al driver: tutta la logica (non_fiscal/fiscal) vive in
  # cust-fp.ps1, cosi' i futuri aggiornamenti NON richiedono di ritoccare l'agente.
  $xf = Join-Path $env:TEMP ("custxml_" + [guid]::NewGuid().ToString("N") + ".xml")
  $RequestXml | Set-Content -LiteralPath $xf -Encoding UTF8
  try {
    $ps32 = Join-Path $env:WINDIR "SysWOW64\WindowsPowerShell\v1.0\powershell.exe"
    $out = & $ps32 -NoProfile -ExecutionPolicy Bypass -File $custFp -XmlFile $xf -OposName $oposName 2>&1
    return (($out | Where-Object { $_ -match '"ok"\s*:' } | Select-Object -Last 1))
  } finally { try { Remove-Item -LiteralPath $xf -Force } catch { } }
}

# ── Cassa pagAmico (TCP 9100) — protocollo ricostruito e validato live ───────
function Invoke-Pagamico {
  param([string]$Ip, [double]$Importo, [int]$TimeoutSec = 180)
  $res = @{ ok = $false; incassato = 0.0; resto = 0.0; sottoscorta = $false; errore = $false; msg = "" }
  $cents = [math]::Round($Importo * 100)
  $cmd = 'IN' + ([string]$cents).PadLeft(6, '0')
  $sock = $null
  try {
    $sock = New-Object Net.Sockets.Socket([Net.Sockets.AddressFamily]::InterNetwork, [Net.Sockets.SocketType]::Stream, [Net.Sockets.ProtocolType]::Tcp)
    $sock.Connect($Ip, 9100)
    [void]$sock.Send([Text.Encoding]::ASCII.GetBytes($cmd))
    $buf = New-Object byte[] 4096
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    $done = $false
    while (-not $done -and (Get-Date) -lt $deadline) {
      if ($sock.Poll(1000000, [Net.Sockets.SelectMode]::SelectRead)) {
        $n = $sock.Receive($buf)
        if ($n -gt 0) {
          $resp = [Text.Encoding]::ASCII.GetString($buf, 0, $n)
          try {
            $o = $resp | ConvertFrom-Json
            $req = [double]$o.amountRequested
            $inc = [double]$o.collectedAmount
            if ($req -gt 0 -and $inc -ge $req) {
              $res.ok = $true; $res.incassato = $inc
              $res.resto = [double]$o.changeCoins + [double]$o.changeBanknotes
              $done = $true
            }
          } catch { }
        }
      }
    }
    if (-not $done) { [void]$sock.Send([Text.Encoding]::ASCII.GetBytes('AN')); $res.errore = $true; $res.msg = "timeout/annullato" }
    $sock.Shutdown([Net.Sockets.SocketShutdown]::Both)
  } catch {
    $res.errore = $true; $res.msg = $_.Exception.Message
  } finally {
    if ($sock) { try { $sock.Close() } catch { } }
  }
  return $res
}

# ── Loop principale ──────────────────────────────────────────────────────────
while ($true) {
  try {
    $r = Invoke-RestMethod -Uri $nextUrl -Headers $headers -Method Get -TimeoutSec 20
    if ($r.job) {
      $job = $r.job
      Write-Host ("[{0}] job {1} ({2})" -f (Get-Date -Format HH:mm:ss), $job.id, $job.kind)
      $ok = $false; $resp = ""
      try {
        if ($job.kind -eq "cash_collect") {
          $payload = $job.request_xml | ConvertFrom-Json
          $ip = if ($CashIp) { $CashIp } elseif ($job.device_url) { ($job.device_url -replace '^\w+://', '' -replace ':.*$', '') } else { "" }
          if (-not $ip) { throw "IP cassa non configurato (usa -CashIp)" }
          $cash = Invoke-Pagamico -Ip $ip -Importo ([double]$payload.amount)
          $ok = $cash.ok -and -not $cash.errore
          $resp = ($cash | ConvertTo-Json -Compress)
          if ($ok) { Write-Host ("   incassato {0} resto {1}" -f $cash.incassato, $cash.resto) -ForegroundColor Green }
        } else {
          # Multi-societario: usa il RT indicato dal CRM per QUESTO job (azienda giusta);
          # -FiscalUrl resta solo come fallback se il job non specifica il device.
          $base = if ($job.device_url) { $job.device_url } else { $FiscalUrl }
          if ($base -match '^https?://') {
            # Epson RT via fpMate (HTTP)
            $resp = Invoke-Epson -BaseUrl $base -RequestXml $job.request_xml
            # la stampante risponde 200 anche sugli errori: l'esito VERO e' success="true|false"
            if ($resp -match 'success="true"')      { $ok = $true }
            elseif ($resp -match 'success="false"') { $ok = $false }
            else                                    { $ok = $true }   # comandi senza success esplicito
          } else {
            # Registratore Custom (Vodafone): OPOS locale, nessun HTTP.
            $resp = Invoke-CustomOpos -DeviceUrl $base -RequestXml $job.request_xml
            try { $ok = [bool]((($resp | ConvertFrom-Json)).ok) } catch { $ok = $false }
          }
        }
      } catch { $ok = $false; $resp = $_.Exception.Message }

      $body = @{ id = $job.id; ok = $ok; response = $resp } | ConvertTo-Json -Compress
      Invoke-RestMethod -Uri "$Crm/api/print/result" -Headers $headers -Method Post -Body $body -ContentType "application/json" -TimeoutSec 20 | Out-Null
      if ($ok) { Write-Host "   OK" -ForegroundColor Green }
      else     { Write-Host ("   ERRORE: {0}" -f $resp) -ForegroundColor Red }
    }
  } catch {
    Write-Host ("poll error: {0}" -f $_.Exception.Message) -ForegroundColor DarkYellow
  }
  Start-Sleep -Seconds $IntervalSec
}
