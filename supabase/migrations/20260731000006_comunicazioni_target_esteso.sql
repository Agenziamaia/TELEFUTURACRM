-- Mig. 112 — Comunicazioni: destinatari estesi (Luca 31/07/2026).
-- Oltre ai ruoli (mig. 104) si mira a NEGOZI (le persone che li compongono),
-- PERSONE singole e BRAND. Il brand passa dal negozio: stores.brands elenca i
-- brand trattati da ciascun punto vendita (i "Multi" ne hanno piu' d'uno) —
-- da compilare in Amministrazione; finche' e' vuoto il target per brand non
-- raggiunge nessuno.
alter table public.comunicazioni
  add column if not exists target_stores text[],
  add column if not exists target_users  uuid[],
  add column if not exists target_brands text[];

alter table public.stores
  add column if not exists brands text[] not null default '{}';
