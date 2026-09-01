#!/usr/bin/env bash
# Deploy automatico di TELEFUTURACRM a ogni push su main.
# Lanciato dal listener webhook (/root/telefutura-hooks/telefutura-webhook-listener.js).
#
# Regole:
#  - un solo deploy alla volta (lock);
#  - npm ci solo se package-lock.json e' cambiato;
#  - il build viene RITENTATO fino a 3 volte con pausa (01/08): assorbe i
#    fallimenti TRANSITORI da pressione di memoria (build in concorrenza con gli
#    altri servizi del box). Solo dopo 3 tentativi si considera fallito;
#  - IL BUILD NON TOCCA IL SITO VIVO (01/09/2026, mattina dell'apertura delle
#    casse). Prima si costruiva dentro `.next`, cioe' esattamente la cartella da
#    cui il processo online sta servendo i negozi: per tutta la durata del build
#    Next non trovava piu' i suoi manifest e rispondeva "Internal Server Error"
#    su mezzo CRM. Misurato sul log di quella mattina: ultimo errore 07:04:04,
#    riavvio 07:04:39 — quarantacinque secondi di negozi fermi a ogni consegna.
#    Adesso si costruisce in `.next-build` (via NEXT_DIST_DIR, che
#    `next.config.ts` sa leggere) e solo alla fine si scambia la cartella: due
#    `mv`, cioe' un istante, e subito il riavvio.
#  - se il build fallisce NON si riavvia e NON si ricostruisce: `.next` non e'
#    mai stato toccato, quindi il sito sta gia' servendo l'ultima versione
#    buona. Si riporta indietro solo il codice sorgente.
set -uo pipefail
export HOME=/root   # pm2 deve puntare a /root/.pm2 (senza HOME finiva su /etc/.pm2 = daemon sbagliato, restart a vuoto)

APP_DIR=/root/TELEFUTURACRM
PM2_APP=telefutura-crm
LOG=/var/log/telefutura-deploy.log
DIST_NUOVO=.next-build     # dove costruisce, senza disturbare nessuno
DIST_VECCHIO=.next-old     # la versione precedente, tenuta da parte

log() { echo "[$(date -Is)] $*" >> "$LOG"; }

# Build con retry: assorbe i fallimenti transitori (memoria momentaneamente
# satura mentre girano gli altri servizi). Ritorna 0 se una prova riesce, 1 se
# falliscono tutte. Fra un tentativo e l'altro: sync + attesa, cosi' l'eventuale
# picco di memoria rientra.
#
# NEXT_DIST_DIR vale SOLO per questo comando: non va esportato, se no
# `pm2 restart --update-env` lo passerebbe anche a `next start`, che andrebbe a
# cercare i file in `.next-build` invece che in `.next`.
build_with_retry() {
  local tries=0 max=3
  while :; do
    tries=$((tries + 1))
    if NEXT_DIST_DIR="$DIST_NUOVO" npm run build >> "$LOG" 2>&1; then return 0; fi
    if [ "$tries" -ge "$max" ]; then return 1; fi
    log "build tentativo ${tries}/${max} fallito — probabile pressione memoria, riprovo tra 15s"
    sync
    sleep 15
  done
}

# Mette online quello che si e' appena costruito. Se `next.config.ts` non sa
# ancora leggere NEXT_DIST_DIR — cioe' se il build e' finito in `.next` come
# una volta — non c'e' niente da scambiare e si riavvia e basta: il deploy
# funziona lo stesso, semplicemente senza il vantaggio.
scambia_cartella() {
  if [ ! -d "$DIST_NUOVO" ]; then
    log "nessun $DIST_NUOVO: il build e' finito in .next come prima (next.config non legge NEXT_DIST_DIR). Riavvio e basta."
    return 0
  fi
  rm -rf "$DIST_VECCHIO"
  if [ -d .next ]; then
    mv .next "$DIST_VECCHIO" || { log "ERRORE: non riesco a spostare .next"; return 1; }
  fi
  if ! mv "$DIST_NUOVO" .next; then
    log "ERRORE: non riesco a mettere $DIST_NUOVO al posto di .next, rimetto la vecchia"
    [ -d "$DIST_VECCHIO" ] && mv "$DIST_VECCHIO" .next
    return 1
  fi
  return 0
}

# Riavvia il processo pm2; se NON esiste piu' in pm2 (es. dopo un riavvio del
# box senza che il processo fosse stato salvato) lo RICREA sulla porta giusta
# invece di fallire con "restart fallito". Poi salva SEMPRE la lista pm2, cosi'
# telefutura-crm sopravvive ai futuri riavvii/resurrect. Ritorna 0 solo se alla
# fine il processo risulta davvero presente e "online".
pm2_up() {
  if ! pm2 restart "$PM2_APP" --update-env >> "$LOG" 2>&1; then
    log "processo $PM2_APP assente in pm2 -> lo ricreo su PORT=3011"
    ( cd "$APP_DIR" && PORT=3011 pm2 start npm --name "$PM2_APP" -- start >> "$LOG" 2>&1 )
  fi
  pm2 save >> "$LOG" 2>&1
  pm2 jlist 2>/dev/null | node -e 'let d=JSON.parse(require("fs").readFileSync(0));let a=d.find(x=>x.name===process.argv[1]);process.exit(a&&a.pm2_env.status==="online"?0:1)' "$PM2_APP" 2>/dev/null
}

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

if build_with_retry; then
  T0=$(date +%s%3N)
  if scambia_cartella && pm2_up; then
    log "DEPLOY OK -> ${AFTER:0:7} (sito fermo per $(( $(date +%s%3N) - T0 )) ms)"
  else
    log "ERRORE: build ok ma non sono riuscito a metterlo online"
    exit 1
  fi
else
  log "BUILD FALLITO per ${AFTER:0:7} (dopo 3 tentativi): nessun riavvio."
  log "il sito non se n'e' accorto: .next non e' stato toccato, sta ancora servendo ${BEFORE:0:7}"
  rm -rf "$DIST_NUOVO"
  git reset --hard "$BEFORE" >> "$LOG" 2>&1
  exit 1
fi
