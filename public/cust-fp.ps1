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
# VINCOLI: gira a 32 bit (MiraOposDll e' x86, si rilancia da solo). Il registratore
# deve essere LIBERO: MIRA_FP_SERVER (server fiscale di SuiteMobile) lo tiene occupato
# in modo esclusivo, quindi lo CHIUDIAMO da soli prima di aprire (vedi sotto) - niente
# piu' "chiudi SuiteMobile a mano" su ogni PC.
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

# COMPATIBILITA' VERSIONI DLL (01/09): le MiraOposDll variano tra registratori. Es.
# Collatina W3 (v50.1.1.1) ha `comincia_scontrino_fiscale` a 2 arg (non 3) e
# `stampa_riga_pagamenti` a 3 arg (non 4). Scegliamo l'overload per numero di
# parametri via reflection (gli errori VERI del metodo non vengono mascherati).
function ContaArg($fp, [string]$nome) {
  return @($fp.GetType().GetMethods() | Where-Object { $_.Name -eq $nome } | ForEach-Object { $_.GetParameters().Count })
}
function CominciaFiscale($fp) {
  $c = ContaArg $fp "comincia_scontrino_fiscale"
  if ($c -contains 3) { $fp.comincia_scontrino_fiscale($false, "", "") }
  elseif ($c -contains 2) { $fp.comincia_scontrino_fiscale($false, "") }
  elseif ($c -contains 1) { $fp.comincia_scontrino_fiscale($false) }
  else { $fp.comincia_scontrino_fiscale() }
}
function PagamentoFiscale($fp, [double]$tot, [double]$amt, [string]$tipo) {
  $c = ContaArg $fp "stampa_riga_pagamenti"
  if ($c -contains 4) { $fp.stampa_riga_pagamenti($tot, $amt, $tipo, "") }
  else { $fp.stampa_riga_pagamenti($tot, $amt, $tipo) }
}
# CHIUSURA FISCALE giornaliera (Report Z) — metodo OPOS `chiusura_fiscale`.
# Firme viste: v68.1.1.1 (Acilia VS) = 0 arg. Scegliamo per arieta' via reflection.
# ⚠️ Un'arieta' NON prevista NON si tira a indovinare (un Report Z e' irreversibile):
# si lancia un errore chiaro e la chiusura resta a SuiteMobile.
function ChiusuraFiscale($fp) {
  $c = ContaArg $fp "chiusura_fiscale"
  if ($c -contains 0) { [void]$fp.chiusura_fiscale() }
  else { throw ("chiusura_fiscale: firma non gestita (arg: " + ($c -join ',') + ") - eseguire da SuiteMobile") }
}

try { $xml = Get-Content -Raw -LiteralPath $XmlFile } catch { Esito $false "xml illeggibile: $($_.Exception.Message)" ""; exit 1 }

# tipo documento dall'ePOS XML
$isFiscal = $xml -match '<printerFiscalReceipt'
# righe di testo (printNormal data="...") — de-escape XML
$lines = @()
foreach ($m in [regex]::Matches($xml, 'data="([^"]*)"')) {
  $lines += [System.Net.WebUtility]::HtmlDecode($m.Groups[1].Value)
}

# CHIUSURA FISCALE (Report Z) su registratore Custom — il CRM accoda
# <printerFiscalReport><zReport/>. Sul Custom la chiusura giornaliera e' il metodo
# OPOS chiusura_fiscale() (vedi ChiusuraFiscale). ⚠️ IRREVERSIBILE: una volta al
# giorno per cassa. Richiede SuiteMobile CHIUSA (una sola connessione al registratore).
$isZ = ($xml -match '<printerFiscalReport') -or ($xml -match '<zReport')

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

# ── LIBERA IL REGISTRATORE (fix permanente 02/09) ────────────────────────────
# MIRA_FP_SERVER e' il server fiscale Mira che SuiteMobile lascia acceso: tiene la
# connessione ESCLUSIVA al registratore, percio' la nostra apri_stampante fallisce con
# "apertura fallita: MiraOposException" (visto a W3, Merulana, Acilia Multi). Il nostro
# driver NON ne ha bisogno (i negozi senza MIRA_FP_SERVER stampano regolarmente, es.
# Baleniere) e chiuderlo NON lo fa ripartire (verificato a W3: non e' un servizio).
# NB (Acilia Multi 02/09): chiuderlo e aprire SUBITO non basta - il registratore
# impiega un attimo a RILASCIARE la connessione. Quindi: chiudi, aspetta che il
# processo sparisca + un margine, e ritenta l'apertura fino a 3 volte.
function LiberaRegistratore {
  try {
    $smp = Get-Process -Name MIRA_FP_SERVER -ErrorAction SilentlyContinue
    if ($smp) {
      $smp | Stop-Process -Force -ErrorAction SilentlyContinue
      for ($i = 0; $i -lt 15; $i++) {
        if (-not (Get-Process -Name MIRA_FP_SERVER -ErrorAction SilentlyContinue)) { break }
        Start-Sleep -Milliseconds 200
      }
      Start-Sleep -Milliseconds 1200   # margine perche' il registratore rilasci la connessione
      return $true
    }
  } catch { }
  return $false
}

$fp = $null
$openErr = $null
$smVisto = $false
for ($try = 1; $try -le 3; $try++) {
  if (LiberaRegistratore) { $smVisto = $true }
  try {
    $fp = New-Object MiraOposDll.FiscalPrinter('', 0, '', $true)
    $fp.tipo_stampante = 'CUSTOM'
    $fp.custom_kube = $true
    $fp.apri_stampante($OposName, '', $false)
    if (-not $fp.stampante_abilitata) { Esito $false "registratore non abilitato (OPOS '$OposName')" ""; exit 1 }
    $openErr = $null
    break
  } catch {
    $ex = $_.Exception; while ($ex.InnerException) { $ex = $ex.InnerException }
    $openErr = $ex.Message
    try { if ($fp) { $fp.chiudi_stampante() } } catch { }
    $fp = $null
    Start-Sleep -Milliseconds 700
  }
}
if ($openErr) {
  $hint = if ($smVisto) { " (MIRA_FP_SERVER chiuso ma registratore ancora occupato dopo 3 tentativi)" } else { " (nessun MIRA_FP_SERVER attivo: registratore occupato da altro o in errore)" }
  Esito $false ("apertura fallita: " + $openErr + $hint) ""
  exit 1
}

$mat = ""
try { $mat = [string]$fp.matricola_fiscale } catch { }

try {
  if ($isZ) {
    # ── CHIUSURA FISCALE / REPORT Z CUSTOM ──────────────────────────────────
    # Chiusura giornaliera: stampa il Report Z e trasmette i corrispettivi ad AE.
    # E' l'equivalente Custom di <printerFiscalReport><zReport/> dell'Epson.
    $fp.is_rt = $true
    ChiusuraFiscale $fp
    $num = ""
    try { $num = [string]$fp.dammi_numero_chiusurafp90x() } catch { }
    Esito $true ("chiusura Z eseguita" + $(if ($num) { " (n. $num)" } else { "" })) $mat
  } elseif ($isFiscal) {
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

      CominciaFiscale $fp
      foreach ($it in $items) {
        $q = $(if ($it.qty -gt 0) { $it.qty } else { 1.0 })
        $fp.scrivi_riga_scontrino("", [string]$it.desc, [double]$it.price, [double]$q, [double]$it.dept, "", $false)
      }
      if ($pays.Count -eq 0) {
        PagamentoFiscale $fp ([double]$tot) ([double]$tot) "CONTANTI"
      } else {
        foreach ($p in $pays) {
          $tp = switch ([int]$p.ptype) {
            0       { "CONTANTI" }
            2       { if ($p.desc) { [string]$p.desc } else { "CARTE" } }
            4       { '$NR$' + $(if ($p.desc) { [string]$p.desc } else { "CREDITO" }) }
            default { if ($p.desc) { [string]$p.desc } else { "CONTANTI" } }
          }
          PagamentoFiscale $fp ([double]$tot) ([double]$p.amount) ([string]$tp)
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
