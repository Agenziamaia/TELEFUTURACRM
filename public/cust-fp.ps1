# ─────────────────────────────────────────────────────────────────────────────
# DRIVER Custom FP90X — pilota il registratore telematico Custom (corner Vodafone)
# tramite il driver OPOS gia' installato da SuiteMobile (MiraOposDll), SENZA
# password/fpMate. Invocato dall'agente POS per i negozi con registratore Custom.
#
# L'agente passa l'ePOS XML GREZZO (lo stesso che il CRM manda alle Epson): qui lo
# interpretiamo. Cosi' tutta la logica di stampa (non fiscale ORA, fiscale in futuro)
# vive in questo file, e gli aggiornamenti arrivano da soli (l'agente lo ri-scarica
# a ogni avvio) senza dover tornare sul PC del negozio.
#
# Sequenza dai sorgenti SuiteMobile: tipo_stampante='CUSTOM' + custom_kube=true ->
#   apri_stampante('CUSTOM','',false) -> OPOS Open/ClaimDevice(100)/DeviceEnabled ;
#   non fiscale = comincia_scontrino_nonfiscale -> stampa_testo_semplice_nonfiscale
#   (PrintNormal) -> chiudi_scontrino_nonfiscale.
#
# VINCOLI: gira a 32 bit (MiraOposDll e' x86, si rilancia da solo); il registratore
# deve essere LIBERO (MIRA_FP_SERVER di SuiteMobile chiuso).
#
# USO:  powershell -File cust-fp.ps1 -XmlFile <ePOS.xml> [-OposName CUSTOM]
# stdout, ULTIMA riga = esito JSON: {"ok":true,"msg":"...","matricola":"..."}
# ─────────────────────────────────────────────────────────────────────────────
param(
  [string]$XmlFile,
  [string]$Fpnet = "C:\mirasolutions\SuiteMobile\PDV\fpnet",
  [string]$OposName = "CUSTOM"
)
$ErrorActionPreference = "Stop"

# ── rilancio a 32 bit se necessario ──────────────────────────────────────────
if ([IntPtr]::Size -ne 4) {
  $ps32 = Join-Path $env:WINDIR "SysWOW64\WindowsPowerShell\v1.0\powershell.exe"
  & $ps32 -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -XmlFile $XmlFile -Fpnet $Fpnet -OposName $OposName
  exit $LASTEXITCODE
}

function Esito([bool]$ok, [string]$msg, [string]$mat) {
  (@{ ok = $ok; msg = $msg; matricola = $mat } | ConvertTo-Json -Compress)
}

try { $xml = Get-Content -Raw -LiteralPath $XmlFile } catch { Esito $false "xml illeggibile: $($_.Exception.Message)" ""; exit 1 }

# tipo documento dall'ePOS XML
$isFiscal = $xml -match '<printerFiscalReceipt'
# righe di testo (printNormal data="...") — de-escape XML
$lines = @()
foreach ($m in [regex]::Matches($xml, 'data="([^"]*)"')) {
  $lines += [System.Net.WebUtility]::HtmlDecode($m.Groups[1].Value)
}

# Auto-rileva la cartella del driver: se in $Fpnet manca MiraOposDll (es. store
# ClickOnce come Castani/Acilia, dove i DLL stanno in AppData\Local\Apps\2.0 con un
# path che CAMBIA a ogni aggiornamento dell'app), cerca la cartella che contiene
# MiraOposDll + il suo OPOS (POS.Devices.OPOSFiscalPrinter) insieme.
if (-not (Test-Path (Join-Path $Fpnet "MiraOposDll.dll"))) {
  try {
    $hit = Get-ChildItem (Join-Path $env:LOCALAPPDATA "Apps\2.0") -Recurse -Filter "MiraOposDll.dll" -ErrorAction SilentlyContinue |
      ForEach-Object { $_.DirectoryName } | Sort-Object -Unique |
      Where-Object { Test-Path (Join-Path $_ "POS.Devices.OPOSFiscalPrinter.dll") } | Select-Object -First 1
    if ($hit) { $Fpnet = $hit }
  } catch { }
}

try { Set-Location $Fpnet; [Reflection.Assembly]::LoadFrom((Join-Path $Fpnet "MiraOposDll.dll")) | Out-Null }
catch { Esito $false "MiraOposDll non caricata (fpnet=$Fpnet): $($_.Exception.Message)" ""; exit 1 }

$fp = $null
try {
  $fp = New-Object MiraOposDll.FiscalPrinter('', 0, '', $true)
  $fp.tipo_stampante = 'CUSTOM'
  $fp.custom_kube = $true
  $fp.apri_stampante($OposName, '', $false)
  if (-not $fp.stampante_abilitata) { Esito $false "registratore non abilitato (OPOS '$OposName')" ""; exit 1 }
} catch {
  $ex = $_.Exception; while ($ex.InnerException) { $ex = $ex.InnerException }
  Esito $false "apertura fallita: $($ex.Message)" ""
  try { if ($fp) { $fp.chiudi_stampante() } } catch { }
  exit 1
}

$mat = ""
try { $mat = [string]$fp.matricola_fiscale } catch { }

try {
  if ($isFiscal) {
    # Percorso FISCALE Custom: da implementare/collaudare PRIMA del go-live fiscale
    # (comincia_scontrino_fiscale / scrivi_riga_scontrino / stampa_riga_pagamenti /
    # chiudi_scontrino_fiscale). Finche' i negozi Custom restano in TEST mode il CRM
    # invia solo non_fiscal, quindi qui non si arriva.
    Esito $false "fiscal Custom non ancora abilitato (tenere il negozio in test mode)" $mat
  } else {
    $fp.comincia_scontrino_nonfiscale()
    foreach ($l in $lines) { $fp.stampa_testo_semplice_nonfiscale([string]$l, $false, $false, $false) }
    $fp.chiudi_scontrino_nonfiscale()
    Esito $true "non_fiscal stampato" $mat
  }
} catch {
  $ex = $_.Exception; while ($ex.InnerException) { $ex = $ex.InnerException }
  try { $fp.chiudi_scontrino_nonfiscale() } catch { }
  try { $fp.resetta_stampante() } catch { }
  Esito $false "stampa fallita: $($ex.Message)" $mat
} finally {
  try { $fp.chiudi_stampante() } catch { }
}
