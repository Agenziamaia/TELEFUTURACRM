#!/usr/bin/env bash
# Deploy automatico di TELEFUTURACRM a ogni push su main.
# Lanciato dal listener webhook (/root/telefutura-hooks/telefutura-webhook-listener.js).
#
# Regole:
#  - un solo deploy alla volta (lock);
#  - npm ci solo se package-lock.json e' cambiato;
#  - se il build fallisce NON si riavvia: si torna al commit precedente e si
#    ricostruisce, cosi' il sito resta online con l'ultima versione buona.
set -uo pipefail

APP_DIR=/root/TELEFUTURACRM
PM2_APP=telefutura-crm
LOG=/var/log/telefutura-deploy.log

log() { echo "[$(date -Is)] $*" >> "$LOG"; }

exec 9>/var/lock/telefutura-deploy.lock
if ! flock -n 9; then
  log "deploy gia' in corso, esco"
  exit 0
fi

cd "$APP_DIR" || { log "ERRORE: $APP_DIR non accessibile"; exit 1; }

BEFORE=$(git rev-parse HEAD)
LOCK_BEFORE=$(git rev-parse "HEAD:package-lock.json" 2>/dev/null || echo none)
log "--- avvio deploy (da ${BEFORE:0:7}) ---"

if ! git fetch origin main >> "$LOG" 2>&1; then
  log "ERRORE: git fetch fallito"
  exit 1
fi

if ! git reset --hard origin/main >> "$LOG" 2>&1; then
  log "ERRORE: git reset fallito"
  exit 1
fi

AFTER=$(git rev-parse HEAD)
LOCK_AFTER=$(git rev-parse "HEAD:package-lock.json" 2>/dev/null || echo none)

if [ "$BEFORE" = "$AFTER" ]; then
  log "nessun commit nuovo (${AFTER:0:7}), niente da fare"
  exit 0
fi
log "aggiornato a ${AFTER:0:7} — $(git log --oneline -1)"

if [ "$LOCK_BEFORE" != "$LOCK_AFTER" ]; then
  log "package-lock.json cambiato -> npm ci"
  if ! npm ci >> "$LOG" 2>&1; then
    log "ERRORE: npm ci fallito, torno a ${BEFORE:0:7}"
    git reset --hard "$BEFORE" >> "$LOG" 2>&1
    exit 1
  fi
fi

if npm run build >> "$LOG" 2>&1; then
  if pm2 restart "$PM2_APP" --update-env >> "$LOG" 2>&1; then
    log "DEPLOY OK -> ${AFTER:0:7}"
  else
    log "ERRORE: build ok ma pm2 restart fallito"
    exit 1
  fi
else
  log "BUILD FALLITO per ${AFTER:0:7}: nessun riavvio."
  log "ripristino ${BEFORE:0:7} e ricostruisco per non lasciare .next rotto"
  git reset --hard "$BEFORE" >> "$LOG" 2>&1
  if npm run build >> "$LOG" 2>&1; then
    pm2 restart "$PM2_APP" --update-env >> "$LOG" 2>&1
    log "ripristinata la versione precedente ${BEFORE:0:7}"
  else
    log "ATTENZIONE: fallito anche il build di ripristino, serve intervento manuale"
  fi
  exit 1
fi
