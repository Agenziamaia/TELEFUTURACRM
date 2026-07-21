# Deploy automatico (VPS 46.224.1.225)

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
   `package-lock.json`, `npm run build`, `pm2 restart telefutura-crm`

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

Lo script **non riavvia** l'app: torna al commit precedente, ricostruisce e
riavvia quello, cosi' il CRM resta online con l'ultima versione buona. In
`/var/log/telefutura-deploy.log` resta `BUILD FALLITO per <sha>`.
