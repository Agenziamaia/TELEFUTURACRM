# ─────────────────────────────────────────────────────────────────────────────
# Telefutura POS Agent — gira su un PC del NEGOZIO (stessa rete dei dispositivi).
# Ritira i job dal CRM in cloud (HTTPS in uscita: passa sempre dal firewall) e li
# esegue sui dispositivi LOCALI, poi riporta l'esito. Sostituisce il ruolo di
# SuiteMobile nel pilotare l'hardware. Non serve installare nulla: PowerShell c'è
# su ogni Windows.
#
# Gestisce:
#   • STAMPANTE FISCALE  Epson RT  (ePOS/fpMate via HTTP)  → job kind fiscal_receipt/status/test/non_fiscal/raw
#   • CASSA AUTOMATICA   pagAmico  (TCP 9100)              → job kind cash_collect
#   (Custom BIG: in arrivo — kind custom_fiscal)
#
# Avvio manuale:
#   powershell -ExecutionPolicy Bypass -File agent.ps1 -Token "IL_TOKEN" -Negozio "Donna Olimpia" -FiscalUrl "http://192.168.1.50" -CashIp "192.168.1.201"
#
# Installazione (parte a OGNI avvio del PC, in background):
#   powershell -ExecutionPolicy Bypass -File agent.ps1 -Install -Token "IL_TOKEN" -Negozio "Donna Olimpia" -FiscalUrl "http://192.168.1.50" -CashIp "192.168.1.201"
# ─────────────────────────────────────────────────────────────────────────────
param(
  [string]$Crm = "https://crm.telefuturasrl.com",
  [string]$Token = $env:PRINT_AGENT_TOKEN,
  [string]$Negozio = "",
  [string]$FiscalUrl = "",              # base URL stampante fiscale del negozio (es. http://192.168.1.50)
  [string]$CashIp = "",                 # IP cassa automatica pagAmico del negozio (es. 192.168.1.201)
  [int]$IntervalSec = 5,
  [switch]$Install                      # registra l'agente come attività pianificata all'avvio
)

# ── Installazione come attività pianificata (auto-start) ─────────────────────
if ($Install) {
  if (-not $Token) { Write-Error "Token mancante per l'installazione."; exit 1 }
  $scriptPath = $MyInvocation.MyCommand.Path
  $argLine = "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`" -Crm `"$Crm`" -Token `"$Token`" -Negozio `"$Negozio`" -FiscalUrl `"$FiscalUrl`" -CashIp `"$CashIp`""
  $action  = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $argLine
  $trigger = New-ScheduledTaskTrigger -AtLogOn
  $set     = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartInterval (New-TimeSpan -Minutes 1) -RestartCount 999
  Register-ScheduledTask -TaskName "TelefuturaPosAgent" -Action $action -Trigger $trigger -Settings $set -Force | Out-Null
  Write-Host "Installato. L'agente partirà a ogni accesso al PC (attività 'TelefuturaPosAgent')." -ForegroundColor Green
  Write-Host "Avvio subito anche adesso..." -ForegroundColor Green
  Start-ScheduledTask -TaskName "TelefuturaPosAgent"
  exit 0
}

if (-not $Token) { Write-Error "Token mancante. Usa -Token '...' oppure imposta `$env:PRINT_AGENT_TOKEN"; exit 1 }
$headers = @{ Authorization = "Bearer $Token" }
$nextUrl = "$Crm/api/print/next"
if ($Negozio) { $nextUrl += "?negozio=$([uri]::EscapeDataString($Negozio))" }

Write-Host "Telefutura POS Agent avviato — CRM=$Crm  negozio='$Negozio'  fiscale='$FiscalUrl'  cassa='$CashIp'  ogni ${IntervalSec}s."

# ── Fiscale Epson (ePOS/fpMate) ──────────────────────────────────────────────
function Invoke-Epson {
  param([string]$BaseUrl, [string]$RequestXml)
  $soap = '<?xml version="1.0" encoding="utf-8"?>' + "`n" +
          '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">' + "`n" +
          '<s:Body>' + "`n" + $RequestXml + '</s:Body>' + "`n" + '</s:Envelope>' + "`n"
  $printerUrl = $BaseUrl.TrimEnd('/') + "/cgi-bin/fpmate.cgi"
  $pr = Invoke-WebRequest -UseBasicParsing -Uri $printerUrl -Method Post -Body $soap `
        -ContentType "text/xml; charset=UTF-8" -Headers @{ SOAPAction = '""' } -TimeoutSec 30
  return $pr.Content
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
      $ok = $true; $resp = ""
      try {
        if ($job.kind -eq "cash_collect") {
          # request_xml contiene un JSON {"amount": 12.5}
          $payload = $job.request_xml | ConvertFrom-Json
          $ip = if ($CashIp) { $CashIp } elseif ($job.device_url) { ($job.device_url -replace '^\w+://', '' -replace ':.*$', '') } else { "" }
          if (-not $ip) { throw "IP cassa non configurato (usa -CashIp)" }
          $cash = Invoke-Pagamico -Ip $ip -Importo ([double]$payload.amount)
          $ok = $cash.ok -and -not $cash.errore
          $resp = ($cash | ConvertTo-Json -Compress)
        } else {
          # default: stampante fiscale Epson. L'agente usa la SUA stampante
          # ($FiscalUrl) se configurata, altrimenti il device_url del job.
          $base = if ($FiscalUrl) { $FiscalUrl } else { $job.device_url }
          $resp = Invoke-Epson -BaseUrl $base -RequestXml $job.request_xml
        }
      } catch { $ok = $false; $resp = $_.Exception.Message }

      $body = @{ id = $job.id; ok = $ok; response = $resp } | ConvertTo-Json -Compress
      Invoke-RestMethod -Uri "$Crm/api/print/result" -Headers $headers -Method Post -Body $body -ContentType "application/json" -TimeoutSec 20 | Out-Null
      if ($ok) { Write-Host "   OK" -ForegroundColor Green } else { Write-Host ("   ERRORE: {0}" -f $resp) -ForegroundColor Red }
    }
  } catch {
    Write-Host ("poll error: {0}" -f $_.Exception.Message) -ForegroundColor DarkYellow
  }
  Start-Sleep -Seconds $IntervalSec
}
