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

# Parsing numerico INVARIANTE: il CRM manda i decimali col punto ("10.00"), ma i PC
# negozio sono in locale IT (virgola) -> [double]"10.00" sbaglierebbe. Forziamo il
# punto e la cultura invariante.
function ToNum([string]$s) {
  if (-not $s) { return 0.0 }
  return [double]::Parse(($s -replace ',', '.'), [Globalization.CultureInfo]::InvariantCulture)
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

# NOME OPOS AUTO (Promontori 31/08): l'agente passa "CUSTOM" per default, ma su
# certi PC il dispositivo OPOS FiscalPrinter e' registrato con un altro nome (es.
# "Custom Fiscal Printer"). Se il nome dato NON e' fra quelli registrati, si usa
# il primo FiscalPrinter presente nel registro — cosi' l'agente apre quello giusto
# senza configurarlo per negozio. Se il nome dato c'e', resta com'e' (negozi ok).
try {
  $__bases = @("HKLM:\SOFTWARE\WOW6432Node\OLEforRetail\ServiceOPOS\FiscalPrinter","HKLM:\SOFTWARE\OLEforRetail\ServiceOPOS\FiscalPrinter")
  $__devs = @(); foreach ($__b in $__bases) { if (Test-Path $__b) { $__devs += (Get-ChildItem $__b -ErrorAction SilentlyContinue).PSChildName } }
  if ($__devs.Count -gt 0 -and ($__devs -notcontains $OposName)) { $OposName = $__devs[0] }
} catch { }

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
    # ── PERCORSO FISCALE CUSTOM (bozza 01/09 — DA VALIDARE sul registratore reale) ──
    # Il CRM invia ePOS Epson (printerFiscalReceipt). Qui lo traduciamo nelle chiamate
    # OPOS Custom ESATTAMENTE come fa SuiteMobile (decompilato MiraOposDll):
    #   comincia_scontrino_fiscale -> per riga scrivi_riga_scontrino(reparto come vatInfo,
    #   prezzo in EURO: il driver lo *100 da solo) -> stampa_riga_pagamenti (richiede
    #   is_rt=true; il nome pagamento -> DirectIO 3004 contanti / 3006 carte / 3005 $NR$
    #   non riscosso) -> chiudi_scontrino_fiscale (fa la chiusura DirectIO 30112+3013).
    # DORMIENTE finche' il negozio e' in test_mode: in quel caso il CRM manda non_fiscal
    # e qui NON si arriva. NON attivare il fiscale su un Custom senza una prova reale.
    $fp.is_rt = $true

    $items = @()
    foreach ($mm in [regex]::Matches($xml, '<printRecItem\b[^>]*/>')) {
      $t = $mm.Value
      $items += [pscustomobject]@{
        desc  = [System.Net.WebUtility]::HtmlDecode([regex]::Match($t, 'description="([^"]*)"').Groups[1].Value)
        qty   = (ToNum ([regex]::Match($t, 'quantity="([^"]*)"').Groups[1].Value))
        price = (ToNum ([regex]::Match($t, 'unitPrice="([^"]*)"').Groups[1].Value))
        dept  = [int]([regex]::Match($t, 'department="([^"]*)"').Groups[1].Value)
      }
    }
    $pays = @()
    foreach ($mm in [regex]::Matches($xml, '<printRecTotal\b[^>]*/>')) {
      $t = $mm.Value
      $pays += [pscustomobject]@{
        desc   = [System.Net.WebUtility]::HtmlDecode([regex]::Match($t, 'description="([^"]*)"').Groups[1].Value)
        amount = (ToNum ([regex]::Match($t, 'payment="([^"]*)"').Groups[1].Value))
        ptype  = [int]([regex]::Match($t, 'paymentType="([^"]*)"').Groups[1].Value)
      }
    }

    if ($items.Count -eq 0) {
      Esito $false "fiscale: nessuna riga (printRecItem) nel documento" $mat
    } else {
      $tot = 0.0
      foreach ($it in $items) { $q = $(if ($it.qty -gt 0) { $it.qty } else { 1.0 }); $tot += $it.price * $q }

      $fp.comincia_scontrino_fiscale($false, "", "")
      foreach ($it in $items) {
        $q = $(if ($it.qty -gt 0) { $it.qty } else { 1.0 })
        $fp.scrivi_riga_scontrino("", [string]$it.desc, [double]$it.price, [double]$q, [double]$it.dept, "", $false)
      }
      if ($pays.Count -eq 0) {
        $fp.stampa_riga_pagamenti([double]$tot, [double]$tot, "CONTANTI", "")
      } else {
        foreach ($p in $pays) {
          $tp = switch ([int]$p.ptype) {
            0       { "CONTANTI" }
            2       { if ($p.desc) { [string]$p.desc } else { "CARTE" } }
            4       { '$NR$' + $(if ($p.desc) { [string]$p.desc } else { "CREDITO" }) }
            default { if ($p.desc) { [string]$p.desc } else { "CONTANTI" } }
          }
          $fp.stampa_riga_pagamenti([double]$tot, [double]$p.amount, [string]$tp, "")
        }
      }
      $ns = 0; $bc = ""
      [void]$fp.chiudi_scontrino_fiscale("", "1", $false, [ref]$ns, "", [ref]$bc, $false)
      Esito $true ("fiscale stampato" + $(if ($ns) { " (n. $ns)" } else { "" })) $mat
    }
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
