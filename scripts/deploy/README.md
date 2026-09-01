# Deploy automatico

**Il server e' `gold` — 204.168.157.151**, non il vecchio VPS 46.224.1.225 che
questa pagina nominava: li' il log dei deploy e' fermo al 13 agosto e il
dominio non ci punta piu' da un pezzo. L'app gira come `telefutura-crm` in pm2
(`next start -p 3011 -H 127.0.0.1`, fork mode) dietro Caddy.

Copia versionata di quello che gira sul server. **Se modifichi qui, ricopia sul box**:

| File nel repo | Percorso sul server |
|---|---|
| `telefutura-webhook-listener.js` | `/root/telefutura-hooks/telefutura-webhook-listener.js` |
| `telefutura-deploy-on-push.sh` | `/root/scripts/telefutura-deploy-on-push.sh` |

## Come funziona

1. Push su `main` → GitHub chiama il webhook
2. Il listener (pm2: `telefutura-webhook-listener`, porta 9101, solo `127.0.0.1`)
   verifica la firma HMAC con `/root/.config/telefutura-webhook-secret`
3. Se `repository.full_name` e' fra quelli ammessi e il ref e' `refs/heads/main`,
   lancia `telefutura-deploy-on-push.sh`
4. Lo script: `git fetch` + `reset --hard`, `npm ci` **solo** se e' cambiato
   `package-lock.json`, poi il build **in una cartella a parte** e infine lo
   scambio + `pm2 restart telefutura-crm`

## Il build non tocca il sito vivo (dal 01/09/2026)

Il build va in `.next-build` (`NEXT_DIST_DIR`, che `next.config.ts` sa leggere)
e solo alla fine si scambiano le cartelle: `.next` → `.next-old`,
`.next-build` → `.next`. Due `mv`, poi il riavvio.

**Perche'.** Prima si costruiva dentro `.next`, cioe' esattamente la cartella
da cui il processo online serve i negozi. Per tutta la durata del build Next
non trovava piu' i suoi manifest (`the client reference manifest for route
"/magazzino" does not exist`) e mezzo CRM rispondeva **Internal Server Error**.
Misurato la mattina dell'apertura delle casse: ultimo errore 07:04:04, riavvio
07:04:39 — **45 secondi** di negozi fermi a **ogni** consegna, e succedeva da
sempre (158 occorrenze in archivio).

Misurato dopo la modifica, sulla prima consegna vera:
`DEPLOY OK -> 4389fb1 (sito fermo per 564 ms)`, e 24 richieste dall'esterno
durante il deploy, **zero fallite**.

**La variabile non va esportata.** `NEXT_DIST_DIR` si passa SOLO al comando di
build: se finisse nell'ambiente di `pm2 restart --update-env`, `next start`
andrebbe a cercare i file in `.next-build` invece che in `.next`.

Se `next.config.ts` non sapesse leggerla, il build finirebbe in `.next` come
una volta: lo script se ne accorge, lo scrive nel log e riavvia lo stesso.

Log: `/var/log/telefutura-webhook.log` (consegne) e `/var/log/telefutura-deploy.log` (deploy).

## Storia: perche' era rotto

Restava fermo per **due** motivi indipendenti, entrambi silenziosi:

1. Il repo e' passato da `Rahib9045/TELEFUTURACRM` a `Agenziamaia/TELEFUTURACRM`.
   GitHub inviava il nome nuovo, il listener confrontava con quello vecchio e
   scartava ogni push (`ignore: repo=Agenziamaia/TELEFUTURACRM`). I `git push`
   continuavano a funzionare grazie al redirect di GitHub, quindi sembrava tutto a
   posto. Ora sono ammessi entrambi i nomi.
2. `telefutura-deploy-on-push.sh` **non esisteva sul server**. Anche col nome
   giusto il listener avrebbe scritto `accepted` e lanciato `bash` su un file
   mancante, senza fare nulla — con il log che dichiarava successo.

Risultato: per giorni ogni deploy e' stato manuale via SSH, e le correzioni
risultavano "fatte" nel repo ma non erano mai arrivate ai negozi.

## Se un build fallisce

Lo script **non riavvia** l'app e **non ricostruisce niente**: `.next` non e'
mai stato toccato, quindi il sito sta gia' servendo l'ultima versione buona.
Si riporta indietro solo il codice sorgente. In
`/var/log/telefutura-deploy.log` resta `BUILD FALLITO per <sha>`.

Prima invece un build fallito costava **due** build e altrettanta sosta:
ricostruiva la versione precedente per non lasciare `.next` a meta'.

La copia dello script precedente sta sul server accanto all'originale:
`/root/scripts/telefutura-deploy-on-push.sh.prima-del-01-09`.
