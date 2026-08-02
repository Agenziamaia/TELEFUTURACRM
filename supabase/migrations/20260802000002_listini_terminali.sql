-- 135: LISTINI TERMINALI per brand (Luca 02/08)
-- Prezzi di listino e piani rate dei telefoni, importati dai listini
-- ufficiali degli operatori caricati in Documentazione (parser xlsx/csv).
-- Servono per: margine esatto sul terminale in Registra Vendita e, in
-- prospettiva, gli scontrini fiscali (progetto Rahib) con le rate.
create table if not exists public.listini_terminali (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  modello text not null,
  prezzo numeric(10,2),
  rate jsonb not null default '[]',
  fonte text not null default '',
  aggiornato_da text not null default '',
  aggiornato_il timestamptz not null default now(),
  unique (brand, modello)
);
create index if not exists idx_listini_terminali_modello on public.listini_terminali (modello);
alter table public.listini_terminali disable row level security;
notify pgrst, 'reload schema';
