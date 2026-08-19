-- Reparti & IVA del registratore telematico — sorgente unica editabile (spec Luca).
-- Il REPARTO decide l'aliquota/natura IVA sul documento fiscale (l'RT è programmato di
-- conseguenza). Prima la mappa era hardcoded in marginalita.tsx (const REPARTI): ora è
-- una tabella editabile da Amministrazione → Reparti & IVA, e il menù Reparto in
-- Catalogo la legge da qui. Mappa GLOBALE (i RT del negozio vanno allineati a questa).
create table if not exists public.pos_reparti (
  reparto     int primary key check (reparto >= 1 and reparto <= 40),
  descrizione text,
  aliquota    numeric,        -- % IVA (es. 22, 10, 4); NULL quando è a natura (non IVA)
  natura      text,           -- codice natura IVA (N1..N7) per le voci non imponibili/esenti
  attivo      boolean not null default true,
  updated_at  timestamptz not null default now()
);

alter table public.pos_reparti enable row level security;
drop policy if exists pos_reparti_all on public.pos_reparti;
create policy pos_reparti_all on public.pos_reparti for all using (true) with check (true);

comment on table public.pos_reparti is 'Mappa reparto -> aliquota/natura IVA (sorgente unica, editabile da Amministrazione). Gli RT del negozio vanno programmati uguali.';

-- Seed dalla mappa storica (dagli schermi SuiteMobile) — 1..10 configurati, 11..40 liberi.
insert into public.pos_reparti (reparto, descrizione, aliquota, natura) values
  (1, 'Non soggetta',            null, 'N2'),
  (2, 'IVA 22%',                 22,   null),
  (3, 'IVA 4%',                  4,    null),
  (4, 'Regime del margine',      null, 'N5'),
  (5, 'Esclusa',                 null, 'N1'),
  (6, 'IVA 4% (2)',              4,    null),
  (7, 'Usato · regime margine',  null, 'N5'),
  (8, 'C/VOD · non soggetta',    null, 'N2'),
  (9, 'Non imponibile',          null, 'N3'),
  (10,'Esente VOD · non sogg.',  null, 'N2')
on conflict (reparto) do nothing;

insert into public.pos_reparti (reparto, descrizione, attivo)
  select g, 'Reparto ' || g, false from generate_series(11, 40) g
on conflict (reparto) do nothing;

notify pgrst, 'reload schema';
