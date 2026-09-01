-- ═══════════════════════════════════════════════════════════════════════════
-- LE COMUNICAZIONI NON SI CANCELLANO PIÙ DAL BROWSER — 01/09/2026
--
-- Luca, stamattina: «io non ho cancellato un cazzo, quindi qualcuno ha
-- cliccato sul pulsante sbagliato». Tre comunicazioni sparite fra ieri sera e
-- oggi — due del 31/08 e una di stamattina. Che fossero state CREATE e poi
-- CANCELLATE lo dice il contatore della tabella: fra l'ultima riga viva (67) e
-- quella successiva (71) mancano i numeri 68, 69 e 70. Numeri consumati, righe
-- che non esistono più.
--
-- COM'ERA POSSIBILE. Su `comunicazioni` c'era una sola policy, `tf_blindata`,
-- su ALL: «basta avere un tf_uid», cioè «basta essere loggati». Quindi
-- qualunque utente, dalla console del browser con la chiave anon che viaggia
-- dentro il bundle, poteva cancellare qualsiasi comunicazione di chiunque. E
-- nell'interfaccia il cestino compariva su OGNI comunicazione a quattro ruoli
-- (amministrativo, admin, dev, direttore generale) più l'autore: un clic, una
-- conferma, e spariva per tutti — insieme alle ricevute di lettura, cioè anche
-- alla prova che qualcuno l'aveva letta.
--
-- LA REGOLA DECISA DA LUCA: l'ADMIN cancella qualsiasi cosa, quando vuole.
-- Tutti gli altri solo LE PROPRIE, e solo ENTRO 10 MINUTI dalla creazione —
-- il tempo di accorgersi di un errore di battitura, non di riscrivere la
-- storia. La regola vive in `/api/comunicazioni/elimina`, che legge il ruolo
-- dal database con l'id della sessione firmata: dal browser non si può mentire
-- su chi si è.
--
-- E RESTA SCRITTO CHI FA COSA (Luca: «metti in piedi anche un sistema dove
-- possiamo controllare chi fa cosa anche su comunicazioni»). Il registro qui
-- sotto tiene il TITOLO e il CONTENUTO dentro di sé, non solo l'id: una riga
-- di registro che rimanda a una comunicazione cancellata non servirebbe a
-- niente. Così, se domani ne sparisce un'altra, si sa chi, quando e cosa
-- c'era scritto.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.comunicazioni_log (
  id             bigserial primary key,
  comunicazione_id integer,                    -- niente FK: la riga deve sopravvivere alla cancellazione
  azione         text not null,                -- creata | eliminata | modificata
  chi            uuid,                         -- chi l'ha fatto
  chi_nome       text,
  quando         timestamptz not null default now(),
  titolo         text,                         -- fotografia: resta anche se la comunicazione non c'è più
  kind           text,
  autore_nome    text,                         -- chi l'aveva scritta
  creata_il      timestamptz,                  -- quando era stata scritta
  destinatari    integer,                      -- quante persone la vedevano
  letture        integer,                      -- quante l'avevano già letta quando è sparita
  contenuto      text,                         -- il testo, per poterla riscrivere
  motivo         text                          -- es. «riunione annullata»
);

create index if not exists comunicazioni_log_quando on public.comunicazioni_log (quando desc);
create index if not exists comunicazioni_log_com on public.comunicazioni_log (comunicazione_id);

alter table public.comunicazioni_log enable row level security;

-- LA LETTURA È PER TUTTI I LOGGATI: un registro che solo chi cancella può
-- leggere non è un controllo. La SCRITTURA solo dal server.
drop policy if exists comunicazioni_log_lettura on public.comunicazioni_log;
create policy comunicazioni_log_lettura on public.comunicazioni_log for select
  using (((current_setting('request.jwt.claims', true))::json ->> 'tf_uid') is not null);

revoke insert, update, delete, truncate on public.comunicazioni_log from anon, authenticated;
grant select on public.comunicazioni_log to anon, authenticated;

-- ── E ADESSO SI CHIUDE LA PORTA ────────────────────────────────────────────
-- La policy resta per leggere, scrivere e modificare: si toglie SOLO il
-- diritto di cancellare, che è quello che ha fatto il danno. Le comunicazioni
-- si continuano a creare e correggere dal browser come prima.
revoke delete on public.comunicazioni from anon, authenticated;
revoke delete on public.comunicazioni_ricevute from anon, authenticated;

-- VERIFICATO PRIMA DI CHIUDERE, perché due volte in agosto una revoca ha
-- fermato i negozi: su `comunicazioni` e `comunicazioni_ricevute` non c'è
-- nessun trigger che cancelli, e le uniche due strade di cancellazione nel
-- codice sono il cestino di Comunicazioni e l'annullamento di una riunione in
-- Calendario — tutte e due passano ora dall'API, che usa la chiave
-- amministratore e non è toccata da questa revoca.
