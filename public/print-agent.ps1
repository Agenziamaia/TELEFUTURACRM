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
  # ── AUTO-RIAVVIO: ATTIVITA' PIANIFICATA che si riaccende da sola ─────────────
  # Il difetto storico (notte 01-02/09, decine di "negozio giu'"): la chiave Run
  # parte SOLO al login, quindi l'agente moriva a ogni logout/riavvio/sospensione e
  # il punto vendita restava muto finche' qualcuno non reinstallava a mano. Qui
  # usiamo un'ATTIVITA' PIANIFICATA che: (1) parte all'accesso, (2) si ricontrolla
  # ogni 5 minuti e si RILANCIA se e' morta, (3) si riavvia in caso di crash.
  # MultipleInstances=IgnoreNew => se e' gia' viva il rilancio viene ignorato: NIENTE
  # doppioni (l'altro flagello della notte). Niente admin: gira come l'utente, solo a
  # PC acceso e loggato (il registratore serve comunque solo a sessione aperta).
  # Se per qualsiasi motivo non si registra, RIPIEGO sulla vecchia chiave Run.
  $taskName = "TelefuturaPosAgent"
  $taskOk = $false
  try {
    $act  = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $argLine
    $tLog = New-ScheduledTaskTrigger -AtLogOn
    # ripetizione ogni 5 min (auto-heal). BUG noto di PowerShell: la ripetizione non
    # "prende" da New-ScheduledTaskTrigger, va copiata a mano sull'oggetto trigger.
    $tRep = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(2))
    $tRep.Repetition = (New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(2)) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)).Repetition
    $set  = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
    $prin = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $taskName -Action $act -Trigger @($tLog, $tRep) -Settings $set -Principal $prin -Force -ErrorAction Stop | Out-Null
    $taskOk = $true
    # con l'attivita' pianificata attiva, togli la vecchia chiave Run (se no doppioni al login).
    Remove-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name $taskName -ErrorAction SilentlyContinue
  } catch {
    Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name $taskName -Value ("powershell " + $argLine) -Force
  }

  # Chiudi eventuali agenti gia' in esecuzione (evita doppioni al re-install).
  Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
    Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -match 'TelefuturaPosAgent' } |
    ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force } catch { } }

  # Avvia subito.
  if ($taskOk) { try { Start-ScheduledTask -TaskName $taskName -ErrorAction Stop } catch { Start-Process powershell -WindowStyle Hidden -ArgumentList $argLine } }
  else { Start-Process powershell -WindowStyle Hidden -ArgumentList $argLine }

  Write-Host ""
  if ($taskOk) {
    Write-Host "  Installato come ATTIVITA' PIANIFICATA (parte all'accesso + si rilancia ogni 5 min se muore, si riavvia ai crash, niente doppioni) e GIA' in esecuzione." -ForegroundColor Green
  } else {
    Write-Host "  Installato (chiave Run, avvio all'accesso) e GIA' in esecuzione. [attivita' pianificata non disponibile su questo PC]" -ForegroundColor Yellow
  }
  Write-Host "  Negozio='$Negozio'  stampante='$FiscalUrl'  cassa='$CashIp'"
  Write-Host "  (Per rimuoverlo: schtasks /delete /tn TelefuturaPosAgent /f ; Remove-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name TelefuturaPosAgent -EA 0)"
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

# AUTO-AGGIORNAMENTO dell'AGENTE STESSO: scarica l'ultima versione e aggiorna la copia
# installata (LOCALAPPDATA). Ha effetto al PROSSIMO avvio del PC → i fix (es. il calcolo
# del resto cassa) arrivano da soli, SENZA reinstallare sul PC del negozio. Guardato:
# sostituisce solo se il download e' un agente COMPLETO e valido (mai file corrotto/parziale).
try {
  $installed = Join-Path $env:LOCALAPPDATA "TelefuturaPosAgent\agent.ps1"
  if (Test-Path $installed) {
    $tmpA = Join-Path $env:TEMP "pa_update.ps1"
    Invoke-WebRequest -UseBasicParsing -Uri "$Crm/print-agent.ps1" -OutFile $tmpA -TimeoutSec 30
    $new = Get-Content -Raw -LiteralPath $tmpA -ErrorAction Stop
    if ($new.Length -gt 3000 -and $new -match 'Telefutura POS Agent' -and $new -match 'function Invoke-Pagamico') {
      $cur = ""; try { $cur = Get-Content -Raw -LiteralPath $installed } catch { }
      if ($new -ne $cur) { Copy-Item -LiteralPath $tmpA -Destination $installed -Force; Write-Host "  (agente aggiornato: attivo al prossimo avvio)" -ForegroundColor DarkCyan }
    }
  }
} catch { }

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
  param([string]$DeviceUrl, [string]$RequestXml, [int]$TimeoutSec = 45)
  $oposName = "CUSTOM"
  if ($DeviceUrl -match '^custom://(.+)$') { $oposName = $Matches[1] }

  # SCARICA SEMPRE l'ultima cust-fp PRIMA di ogni stampa (non solo se manca): cosi'
  # un fix del driver deployato (es. il percorso FISCALE Custom) arriva all'agente
  # gia' in esecuzione SENZA reinstallarlo/riavviarlo. Se il download fallisce si
  # tiene la copia locale. Bug 01/09: agenti avviati prima del deploy fiscale
  # avevano lo stub vecchio -> "fiscal Custom non ancora abilitato" con soldi
  # incassati e nessuno scontrino.
  try { Invoke-WebRequest -UseBasicParsing -Uri "$Crm/cust-fp.ps1" -OutFile $custFp -TimeoutSec 15 } catch {
    if (-not (Test-Path $custFp)) { try { Invoke-WebRequest -UseBasicParsing -Uri "$Crm/cust-fp.ps1" -OutFile $custFp -TimeoutSec 30 } catch { } }
  }
  # Passa l'ePOS XML GREZZO al driver: tutta la logica (non_fiscal/fiscal) vive in
  # cust-fp.ps1, cosi' i futuri aggiornamenti NON richiedono di ritoccare l'agente.
  $xf = Join-Path $env:TEMP ("custxml_" + [guid]::NewGuid().ToString("N") + ".xml")
  $of = Join-Path $env:TEMP ("custout_" + [guid]::NewGuid().ToString("N") + ".txt")
  $ef = Join-Path $env:TEMP ("custerr_" + [guid]::NewGuid().ToString("N") + ".txt")
  $RequestXml | Set-Content -LiteralPath $xf -Encoding UTF8
  $ps32 = Join-Path $env:WINDIR "SysWOW64\WindowsPowerShell\v1.0\powershell.exe"
  try {
    # TIMEOUT DURO: se il driver OPOS si blocca (registratore occupato da SuiteMobile,
    # o dialogo modale invisibile perche' l'agente gira nascosto) il job NON deve piu'
    # inchiodare l'agente. Lo lanciamo come processo a se', con output su file, e se
    # sfora il timeout lo uccidiamo e restituiamo un errore -> l'agente prosegue.
    $argList = "-NoProfile -ExecutionPolicy Bypass -File `"$custFp`" -XmlFile `"$xf`" -OposName `"$oposName`""
    $p = Start-Process -FilePath $ps32 -ArgumentList $argList -WindowStyle Hidden -PassThru `
           -RedirectStandardOutput $of -RedirectStandardError $ef
    if (-not $p.WaitForExit($TimeoutSec * 1000)) {
      try { $p.Kill() } catch { }
      # ripulisci eventuali figli 32-bit rimasti appesi sul driver
      try {
        Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
          Where-Object { $_.CommandLine -match 'cust-fp\.ps1' } |
          ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force } catch { } }
      } catch { }
      return '{"ok":false,"msg":"timeout driver Custom: registratore occupato o driver bloccato (SuiteMobile aperto?)"}'
    }
    $out = ""; try { $out = Get-Content -LiteralPath $of -Raw -ErrorAction SilentlyContinue } catch { }
    $line = ($out -split "`r?`n" | Where-Object { $_ -match '"ok"\s*:' } | Select-Object -Last 1)
    if (-not $line) {
      $err = ""; try { $err = Get-Content -LiteralPath $ef -Raw -ErrorAction SilentlyContinue } catch { }
      $msg = ((($err) + " " + ($out)).Trim() -replace '"', "'" -replace '[\r\n]+', ' ')
      if (-not $msg) { $msg = "nessun esito dal driver Custom" }
      if ($msg.Length -gt 180) { $msg = $msg.Substring(0, 180) }
      $line = '{"ok":false,"msg":"' + $msg + '"}'
    }
    return $line
  } finally {
    foreach ($f in @($xf, $of, $ef)) { try { Remove-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue } catch { } }
  }
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
              # RESTO = incassato - richiesto. NON usare changeCoins/changeBanknotes:
              # vengono letti troppo presto (prima che la macchina finisca di erogare
              # il resto) → davano 0 anche pagando 50 su 10. inc/req sono nella STESSA
              # unita' di 'incassato' (che si vede giusto), quindi il resto si visualizza
              # corretto. La macchina (recycler) eroga comunque fisicamente inc-req.
              $res.resto = [math]::Round($inc - $req, 2)
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
