-- CHI HA GUARDATO LA BUSSOLA (28/08/2026)
-- Il 27/08 due P.IVA sono finite sullo stesso codice e non si è potuto sapere
-- se chi le ha caricate avesse aperto la Direzione Inserimento, né cosa gli
-- fosse stato consigliato: non esisteva nessuna traccia. Da qui in poi ogni
-- consiglio mostrato lascia una riga.
create table if not exists direzione_consigli_log (
  id           uuid primary key default gen_random_uuid(),
  visto_il     timestamptz not null default now(),
  user_id      uuid,
  utente       text,
  negozio      text,
  brand        text,
  pista        text,
  consigliato  text,
  coda         text,
  seguito      boolean
);
comment on table direzione_consigli_log is
  'Chi ha aperto la Bussola, quando, su che pista e cosa gli è stato consigliato. Serve a distinguere un errore del motore da un inserimento fatto senza guardare.';
create index if not exists direzione_consigli_log_visto_idx on direzione_consigli_log (visto_il desc);
create index if not exists direzione_consigli_log_utente_idx on direzione_consigli_log (utente, visto_il desc);

-- ⚠️ le tabelle nuove nascono con RLS ON e ZERO policy: senza queste, ogni
-- insert dal CRM verrebbe rifiutato in silenzio (lezione wa_contatti).
alter table direzione_consigli_log enable row level security;
drop policy if exists dcl_all on direzione_consigli_log;
create policy dcl_all on direzione_consigli_log for all using (true) with check (true);
grant select, insert on direzione_consigli_log to anon, authenticated;
