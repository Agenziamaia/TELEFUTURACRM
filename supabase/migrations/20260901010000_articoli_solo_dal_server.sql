-- ═══════════════════════════════════════════════════════════════════════════
-- IL PREZZO DEGLI ARTICOLI NON SI CAMBIA DAL BROWSER — 01/09/2026
--
-- Trovato mentre si unificavano le due schede Articoli: `mag_articoli` aveva
-- una sola policy, `tf_blindata`, che dice «basta avere un tf_uid», cioè
-- «basta essere loggati». Su ALL. Quindi qualunque venditore poteva, dalla
-- console del browser con la chiave anon che viaggia dentro il bundle:
--   · cambiare il PREZZO DI VENDITA di qualsiasi articolo — ed è quello che
--     la cassa stampa sullo scontrino, dal 1° settembre in quindici negozi;
--   · cambiare il COSTO, cioè il margine su cui si calcolano le gare;
--   · inventare articoli, o spegnere quelli veri.
--
-- Da oggi si scrive solo da `/api/magazzino/articoli`, che legge il RUOLO dal
-- database con l'id della sessione firmata e lascia passare amministrativo,
-- direttore generale, admin e dev — «dall'amministrativo in su» (Luca).
--
-- LA LETTURA RESTA A TUTTI: i ragazzi in negozio devono vedere gli articoli,
-- ed è metà del motivo per cui la scheda sta in Magazzino.
--
-- VERIFICATO PRIMA DI CHIUDERE, perché due volte in agosto una revoca ha
-- fermato i negozi: su `mag_articoli` non c'è NESSUN trigger e NESSUNA
-- funzione che ci scrive (`pg_trigger` e `pg_proc` interrogati), quindi non
-- esiste il caso «il trigger gira coi permessi di chi lo fa scattare e
-- fallisce». Gli import del gestionale usano la chiave amministratore.
-- ═══════════════════════════════════════════════════════════════════════════

-- la policy resta per la LETTURA, ma smette di autorizzare le scritture
drop policy if exists tf_blindata on public.mag_articoli;
create policy tf_articoli_lettura on public.mag_articoli for select
  using (((current_setting('request.jwt.claims', true))::json ->> 'tf_uid') is not null);

-- I PERMESSI PREDEFINITI DI SUPABASE concedono tutto: la policy da sola non
-- basta, va tolto il diritto sotto.
revoke insert, update, delete, truncate on public.mag_articoli from anon, authenticated;
grant select on public.mag_articoli to anon, authenticated;
