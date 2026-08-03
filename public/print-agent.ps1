# ─────────────────────────────────────────────────────────────────────────────
# Agente di stampa Telefutura — gira su un PC del NEGOZIO (stessa rete della
# stampante fiscale). Ritira i job dal CRM in cloud (HTTPS in uscita: passa
# sempre dal firewall) e li inoltra alla stampante sul LAN via /cgi-bin/fpmate.cgi,
# poi riporta l'esito. Non serve installare nulla: PowerShell c'e' su ogni Windows.
#
# Avvio (una riga sola, incolla in PowerShell):
#   powershell -ExecutionPolicy Bypass -Command "iwr https://crm.telefuturasrl.com/print-agent.ps1 -OutFile $env:TEMP\pa.ps1; & $env:TEMP\pa.ps1 -Token 'IL_TOKEN'"
# ─────────────────────────────────────────────────────────────────────────────
param(
  [string]$Crm = "https://crm.telefuturasrl.com",
  [string]$Token = $env:PRINT_AGENT_TOKEN,
  [string]$Negozio = "",
  [int]$IntervalSec = 4
)

if (-not $Token) { Write-Error "Token mancante. Usa -Token '...' oppure imposta `$env:PRINT_AGENT_TOKEN"; exit 1 }
$headers = @{ Authorization = "Bearer $Token" }
$nextUrl = "$Crm/api/print/next"
if ($Negozio) { $nextUrl += "?negozio=$([uri]::EscapeDataString($Negozio))" }

Write-Host ""
Write-Host "  Agente di stampa Telefutura AVVIATO" -ForegroundColor Cyan
Write-Host "  CRM=$Crm  negozio='$Negozio'  controllo ogni ${IntervalSec}s"
Write-Host "  Lascia questa finestra APERTA. Ctrl+C per fermare." -ForegroundColor Yellow
Write-Host ""

while ($true) {
  try {
    $r = Invoke-RestMethod -Uri $nextUrl -Headers $headers -Method Get -TimeoutSec 20
    if ($r.job) {
      $job = $r.job
      Write-Host ("[{0}] job {1} ({2}) -> {3}" -f (Get-Date -Format HH:mm:ss), $job.id, $job.kind, $job.device_url)

      # busta SOAP identica a quella del SDK epson.fiscalPrint
      $soap = '<?xml version="1.0" encoding="utf-8"?>' + "`n" +
              '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">' + "`n" +
              '<s:Body>' + "`n" + $job.request_xml + '</s:Body>' + "`n" + '</s:Envelope>' + "`n"
      $printerUrl = $job.device_url.TrimEnd('/') + "/cgi-bin/fpmate.cgi"

      $ok = $false; $resp = ""
      try {
        $pr = Invoke-WebRequest -UseBasicParsing -Uri $printerUrl -Method Post -Body $soap `
              -ContentType "text/xml; charset=UTF-8" -Headers @{ SOAPAction = '""' } -TimeoutSec 40
        $resp = $pr.Content
        # la stampante risponde 200 anche sugli errori: l'esito VERO e' success="true|false"
        if ($resp -match 'success="true"')      { $ok = $true }
        elseif ($resp -match 'success="false"') { $ok = $false }
        else                                    { $ok = $true }   # comandi senza success esplicito
      } catch { $ok = $false; $resp = $_.Exception.Message }

      $body = @{ id = $job.id; ok = $ok; response = $resp } | ConvertTo-Json -Compress
      Invoke-RestMethod -Uri "$Crm/api/print/result" -Headers $headers -Method Post `
        -Body $body -ContentType "application/json" -TimeoutSec 20 | Out-Null

      if ($ok) { Write-Host "   OK (stampante ha accettato)" -ForegroundColor Green }
      else     { Write-Host ("   ERRORE: {0}" -f ($resp -replace '\s+', ' ').Substring(0, [Math]::Min(200, ($resp -replace '\s+', ' ').Length))) -ForegroundColor Red }
    }
  } catch {
    Write-Host ("poll error: {0}" -f $_.Exception.Message) -ForegroundColor DarkYellow
  }
  Start-Sleep -Seconds $IntervalSec
}
