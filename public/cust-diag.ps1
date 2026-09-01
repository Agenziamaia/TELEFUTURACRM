# DIAGNOSTICA versione MiraOposDll — SOLA LETTURA (non apre il registratore, non
# stampa). Elenca le firme dei metodi fiscali della FiscalPrinter di QUESTO PC, per
# capire quale versione del driver ha (es. Collatina W3 ha un overload diverso di
# comincia_scontrino_fiscale). Gira a 32 bit (MiraOposDll e' x86).
param([string]$Fpnet = "C:\mirasolutions\SuiteMobile\PDV\fpnet")
$ErrorActionPreference = "Stop"
if ([IntPtr]::Size -ne 4) {
  $ps32 = Join-Path $env:WINDIR "SysWOW64\WindowsPowerShell\v1.0\powershell.exe"
  & $ps32 -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -Fpnet $Fpnet
  exit $LASTEXITCODE
}
if (-not (Test-Path (Join-Path $Fpnet "MiraOposDll.dll"))) {
  try {
    $hit = Get-ChildItem (Join-Path $env:LOCALAPPDATA "Apps\2.0") -Recurse -Filter "MiraOposDll.dll" -ErrorAction SilentlyContinue |
      ForEach-Object { $_.DirectoryName } | Sort-Object -Unique |
      Where-Object { Test-Path (Join-Path $_ "POS.Devices.OPOSFiscalPrinter.dll") } | Select-Object -First 1
    if ($hit) { $Fpnet = $hit }
  } catch { }
}
Write-Output "FPNET: $Fpnet"
try {
  $dll = Join-Path $Fpnet "MiraOposDll.dll"
  Write-Output ("DLL VER: " + (Get-Item $dll).VersionInfo.FileVersion + "  (" + [Math]::Round((Get-Item $dll).Length/1024) + " KB)")
  Set-Location $Fpnet
  [Reflection.Assembly]::LoadFrom($dll) | Out-Null
} catch { Write-Output "ERR load: $($_.Exception.Message)"; exit 1 }
$t = [MiraOposDll.FiscalPrinter]
foreach ($mn in @("comincia_scontrino_fiscale","scrivi_riga_scontrino","stampa_riga_pagamenti","chiudi_scontrino_fiscale","apri_stampante","comincia_scontrino_nonfiscale")) {
  $found = $false
  $t.GetMethods() | Where-Object { $_.Name -eq $mn } | ForEach-Object {
    $found = $true
    $p = (($_.GetParameters() | ForEach-Object { $_.ParameterType.Name + " " + $_.Name }) -join ", ")
    Write-Output ("  " + $mn + "(" + $p + ")")
  }
  if (-not $found) { Write-Output ("  " + $mn + " -> NON ESISTE") }
}
Write-Output "== FINE DIAGNOSTICA =="
