-- REGOLE DI LETTERA per-mese (Luca 27/08: «il paletto business è 6 questo
-- mese ma poi cambierà: la Direzione deve seguire la lettera caricata in
-- Gare»): parametri numerici della lettera che non sono scale di soglia.
-- RLS OFF come il resto della famiglia pay_* (P0 censito).
create table if not exists pay_regole_lettera (
  month text not null,
  brand text not null,
  chiave text not null,
  valore numeric not null,
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (month, brand, chiave)
);
insert into pay_regole_lettera (month, brand, chiave, valore)
  values ('2026-08-01', 'windtre', 'paletto_piva_mobile', 6)
  on conflict (month, brand, chiave) do nothing;
