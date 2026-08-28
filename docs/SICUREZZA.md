# 🔒 SICUREZZA DEL CRM — le regole da rispettare sempre

> Scritto il 28/08/2026, dopo la blindatura ordinata da Luca.
> **Chi lavora su questo repo — persona o assistente — deve leggere questa pagina
> prima di aggiungere una funzione di server, una tabella o una schermata.**

## Cos'era il problema (perché queste regole esistono)

Fino al 28/08 il browser parlava col database usando la **chiave pubblica** —
quella scritta dentro la pagina, visibile a chiunque con «ispeziona». Le tabelle
non avevano regole vere: chiunque **nel mondo**, senza account, poteva scaricare
rubrica clienti, contratti, chat WhatsApp, chat interne, email e password
aziendali. Alcune funzioni permettevano perfino di **cambiare la password di
tutti i dipendenti** e di **cancellare i contratti firmati**.

Ora esiste un impianto che regge. Ma un impianto si perde in una settimana se
ogni modifica non lo rispetta: **una sola funzione nuova senza lucchetto
riapre la porta.** Da qui le regole.

## Come funziona adesso, in tre righe

1. **Al login** il server rilascia due cose: un *cookie di sessione firmato*
   (`tf_s`, non falsificabile) e, su richiesta, un *lasciapassare* per il
   database (`/api/auth/token`) che dice **chi sei**.
2. **Il browser** usa il lasciapassare a ogni richiesta: le regole del database
   filtrano per identità (`tf_uid`). Senza lasciapassare non esce niente.
3. **Il server** usa la chiave amministratore (`supabaseAdmin`), che vede tutto:
   per questo ogni funzione di server **deve** verificare la sessione, sempre.

## Le cinque regole

### 1. Ogni funzione in `src/app/api/**` chiede la sessione
```ts
const _s = richiedeSessione(request);
if (!_s) return rispostaSessioneNonValida();
```
Se una route deve restare pubblica (webhook con token, login, upload da QR),
va **motivata** nell'elenco `SENZA_SESSIONE` dentro `scripts/guardia-sicurezza.mjs`.
Non esistono eccezioni silenziose.

### 2. L'identità si prende dalla sessione, mai dal browser
```ts
const userId = _s.id;                    // ✅ chi è davvero
const { userId } = await request.json(); // ❌ chi DICE di essere
```
Con la chiave amministratore, fidarsi dell'id dichiarato significa che un
venditore può dichiararsi admin e leggere tutta l'azienda. Se un id arriva dal
client perché è il **bersaglio** dell'operazione (di chi resettare la password),
rinominalo (`userId: bersaglio`) e verifica sempre i permessi di chi agisce.

### 3. `supabaseAdmin` non entra mai in una schermata
Nel browser si usa `supabase` (`@/lib/supabaseClient`), che porta il
lasciapassare dell'utente. `supabaseAdmin` sta solo in `src/app/api/**` e in
librerie usate dal server.

### 4. Ogni tabella nuova nasce chiusa
Nella migrazione che la crea:
```sql
alter table nuova_tabella enable row level security;
create policy tf_blindata on nuova_tabella for all
  using ((current_setting('request.jwt.claims', true)::json ->> 'tf_uid') is not null)
  with check ((current_setting('request.jwt.claims', true)::json ->> 'tf_uid') is not null);
```
Se contiene dati che **non tutti** devono vedere (chat, email, provvigioni,
documenti), serve una regola *fine* come quelle già scritte per WhatsApp
(`tf_wa_istanze`), chat interna (`tf_mie_conversazioni`) ed email
(`tf_mie_caselle`). Se contiene segreti (password, chiavi), la tabella si chiude
del tutto (`using (false)`) e ci si passa solo dal server.

### 5. I segreti non diventano mai `NEXT_PUBLIC_`
Tutto ciò che è `NEXT_PUBLIC_` finisce dentro la pagina, leggibile da chiunque.
I segreti vivono nel `.env` del server: `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_JWT_SECRET`, `EMAIL_ENC_KEY`, i token dei webhook.

## La guardia automatica

```bash
npm run sicurezza     # controlla le regole 1, 2, 3, 5
```
Gira **da sola prima di ogni build**: se una regola viene violata, la build
fallisce e il deploy non parte. Non è un promemoria, è un cancello.

Quello che la guardia **non** può controllare (va fatto a mano, sul database):
- che una tabella nuova abbia davvero la sua regola;
- che una funzione SQL `security definer` non sia eseguibile da `public`
  (`revoke execute on function ... from public` — attenzione: revocare da `anon`
  non basta se il permesso è su `public`);
- che le funzioni **usate dalle policy** restino eseguibili dagli utenti loggati
  (revocarle blocca tutte le letture: successo il 28/08).

Dopo ogni modifica alle regole del database, la controprova si fa impersonando
un utente vero:
```sql
begin;
select set_config('request.jwt.claims', '{"tf_uid":"<id-utente>"}', true);
set local role authenticated;
select count(*) from tabella_da_controllare;
rollback;
```
Interrogare come proprietario del database **non prova niente**: il proprietario
scavalca ogni regola.

## Cosa resta da fare (debito dichiarato)

- **Scritture**: le letture sono filtrate, le scritture no — un dipendente
  loggato può ancora modificare dati non suoi. Serve passare le scritture dal
  server, sezione per sezione (`for select` + route dedicate).
- **Uscita**: il logout non invalida il cookie lato server (manca
  `/api/auth/logout` e un contatore di sessione su `app_users`).
- **Chiave dedicata**: `EMAIL_ENC_KEY` firma le sessioni *e* cifra password
  email e codici 2FA. Serve una `SESSIONE_SECRET` separata per poterla ruotare.
- **Archivi file**: i file restano scaricabili da chi conosce l'indirizzo esatto
  (i bucket sono pubblici); l'elenco e la cancellazione sono già chiusi. Il passo
  successivo è renderli privati con collegamenti a scadenza.
