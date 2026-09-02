# ─────────────────────────────────────────────────────────────────────────────
# deploy-cassa.ps1 — script che Action1 esegue su OGNI PC negozio per installare
# il pannello "Telefutura Cassa". Gira come SYSTEM (Action1). NON lancia la GUI da
# SYSTEM (isolamento sessione 0): installa i file + due scorciatoie (Avvio automatico
# per ogni utente al login, e Desktop per aprirlo a mano). Parte al prossimo login;
# oppure lo staff clicca l'icona sul desktop.
#
# Action1 deve caricare INSIEME: questo script + TelefuturaCassa.exe (stessa cartella).
# ─────────────────────────────────────────────────────────────────────────────
$ErrorActionPreference = 'Stop'

$src = Join-Path $PSScriptRoot 'TelefuturaCassa.exe'
if (-not (Test-Path $src)) { Write-Error "TelefuturaCassa.exe non trovato accanto allo script"; exit 1 }

# 1) copia in una cartella stabile
$dir = Join-Path $env:ProgramData 'TelefuturaCassa'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$dest = Join-Path $dir 'TelefuturaCassa.exe'
Copy-Item -LiteralPath $src -Destination $dest -Force

# 2) scorciatoia in AVVIO AUTOMATICO (tutti gli utenti) -> parte a ogni login
$ws = New-Object -ComObject WScript.Shell
$startup = Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\StartUp'
New-Item -ItemType Directory -Force -Path $startup | Out-Null
$lnk1 = $ws.CreateShortcut((Join-Path $startup 'Telefutura Cassa.lnk'))
$lnk1.TargetPath = $dest; $lnk1.WorkingDirectory = $dir; $lnk1.Description = 'Stato cassa e supporto'; $lnk1.Save()

# 3) scorciatoia sul DESKTOP pubblico -> lo staff lo apre quando vuole
$desktop = Join-Path $env:Public 'Desktop'
if (Test-Path $desktop) {
  $lnk2 = $ws.CreateShortcut((Join-Path $desktop 'Stato Cassa.lnk'))
  $lnk2.TargetPath = $dest; $lnk2.WorkingDirectory = $dir; $lnk2.Description = 'Stato cassa e supporto'; $lnk2.Save()
}

Write-Host "OK: Telefutura Cassa installato in $dest (parte al prossimo login; icona sul desktop)."
exit 0
