# ─────────────────────────────────────────────────────────────────────────────
# DRIVER Custom FP90X — pilota il registratore telematico Custom (corner Vodafone)
# tramite il driver OPOS gia' installato da SuiteMobile (MiraOposDll), SENZA
# password/fpMate. Invocato dall'agente POS per i negozi con registratore Custom.
#
# Sequenza ricavata dai sorgenti SuiteMobile (MIRA_FP_SERVER -> avvia_stampante_fiscale):
#   tipo_stampante='CUSTOM' + custom_kube=true -> apri_stampante('CUSTOM','',false)
#   -> OPOS Open/ClaimDevice(100)/DeviceEnabled ; non fiscale = comincia_scontrino_nonfiscale
#   -> stampa_testo_semplice_nonfiscale (PrintNormal) -> chiudi_scontrino_nonfiscale.
#
# VINCOLI:
#   - gira a 32 bit (MiraOposDll e' x86): si rilancia da solo in SysWOW64;
#   - il registratore deve essere LIBERO: MIRA_FP_SERVER di SuiteMobile CHIUSO
#     (una sola connessione alla volta verso la cassa) -> l'agente lo gestisce.
#
# USO:  powershell -File cust-fp.ps1 -JobFile <job.json> [-OposName CUSTOM]
#   job.json = { "kind":"non_fiscal", "lines":["riga1","riga2", ...] }
# Stampa su stdout, ULTIMA riga = esito JSON: {"ok":true,"msg":"...","matricola":"..."}
# ─────────────────────────────────────────────────────────────────────────────
param(
  [string]$JobFile,
  [string]$Fpnet = "C:\mirasolutions\SuiteMobile\PDV\fpnet",
  [string]$OposName = "CUSTOM"
)
$ErrorActionPreference = "Stop"

# ── rilancio a 32 bit se necessario ──────────────────────────────────────────
if ([IntPtr]::Size -ne 4) {
  $ps32 = Join-Path $env:WINDIR "SysWOW64\WindowsPowerShell\v1.0\powershell.exe"
  & $ps32 -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -JobFile $JobFile -Fpnet $Fpnet -OposName $OposName
  exit $LASTEXITCODE
}

function Esito([bool]$ok, [string]$msg, [string]$mat) {
  (@{ ok = $ok; msg = $msg; matricola = $mat } | ConvertTo-Json -Compress)
}

try { $job = Get-Content -Raw -LiteralPath $JobFile | ConvertFrom-Json }
catch { Esito $false "job illeggibile: $($_.Exception.Message)" ""; exit 1 }

try {
  Set-Location $Fpnet
  [Reflection.Assembly]::LoadFrom((Join-Path $Fpnet "MiraOposDll.dll")) | Out-Null
} catch { Esito $false "MiraOposDll non caricata: $($_.Exception.Message)" ""; exit 1 }

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
  switch ("$($job.kind)") {
    "non_fiscal" {
      $fp.comincia_scontrino_nonfiscale()
      foreach ($l in @($job.lines)) {
        $fp.stampa_testo_semplice_nonfiscale([string]$l, $false, $false, $false)
      }
      $fp.chiudi_scontrino_nonfiscale()
      Esito $true "non_fiscal stampato" $mat
    }
    "fiscal_receipt" {
      # Percorso FISCALE Custom: da implementare e collaudare PRIMA del go-live
      # fiscale (comincia_scontrino_fiscale / scrivi_riga_scontrino /
      # stampa_riga_pagamenti / chiudi_scontrino_fiscale). Finche' i negozi
      # Custom restano in TEST mode, il CRM invia solo non_fiscal.
      Esito $false "fiscal Custom non ancora abilitato (tenere il negozio in test mode)" $mat
    }
    default { Esito $false "kind non gestito: $($job.kind)" $mat }
  }
} catch {
  $ex = $_.Exception; while ($ex.InnerException) { $ex = $ex.InnerException }
  try { $fp.chiudi_scontrino_nonfiscale() } catch { }
  try { $fp.resetta_stampante() } catch { }
  Esito $false "stampa fallita: $($ex.Message)" $mat
} finally {
  try { $fp.chiudi_stampante() } catch { }
}
