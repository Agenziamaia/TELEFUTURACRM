-- DIREZIONE INSERIMENTO v3 (Luca 26/08 sera): lo SFRIDO per pista — l'extra
-- percentuale (3-6%…) che copre l'errore fisiologico: cliccando una soglia
-- il target diventa soglia × (1 + sfrido%) arrotondato per ECCESSO all'intero
-- (mai frazioni, mai ritocchi a mano). Vale per (brand, mese, pista).
create table if not exists direzione_sfridi (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  month date not null,
  pista text not null,
  pct numeric not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  unique (brand, month, pista)
);

-- stessa esposizione di direzione_targets (anon key, riordino RLS = P0 censito)
alter table direzione_sfridi disable row level security;
