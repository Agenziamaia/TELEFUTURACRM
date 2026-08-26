-- DIREZIONE INSERIMENTO — POLITICHE delle categorie di GRUPPO (Luca 26/08
-- sera-3): su W3 i KPI che pesano PER CODICE sono mobile, fisso, customer
-- base (a punti), protetti e il paletto business; luce&gas, assicurazioni e
-- device sono target di GRUPPO — non importa dove si caricano, ma la
-- direzione può scegliere la POLITICA per pista:
--   modo 'proprio'  → ognuno carica sul codice del suo negozio (default;
--                     i multibrand sul loro codice ASSOCIATO — i codici MB
--                     restano a zero);
--   modo 'bilancia' → la Bussola indirizza sul codice più scarico, con
--                     scelta STABILE per finestra di 3-4 giorni (lun-gio /
--                     ven-dom) salvata in `dati` {finestra, scelto}.
-- La riga speciale pista='__associati__' porta in `dati` la mappa
-- {cod_multibrand: cod_franchising} per le categorie libere.
create table if not exists direzione_politiche (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  month date not null,
  pista text not null,
  modo text not null default 'proprio',
  dati jsonb,
  updated_at timestamptz not null default now(),
  updated_by text,
  unique (brand, month, pista)
);

-- stessa esposizione delle sorelle direzione_* (anon key; riordino RLS = P0
-- censito). La Bussola SCRIVE qui la scelta di finestra del "bilancia".
alter table direzione_politiche disable row level security;
