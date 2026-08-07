-- CATALOG_VALORI (mig. 190, conto economico PV fase 5) — TARIFFE e VALORI
-- amministrati A FIANCO del catalogo 6 livelli, senza toccare le catalog_*
-- (regole CATALOGO_6_LIVELLI: contenuto intoccabile, side-table dedicata).
--
-- Usi previsti:
--  - TARIFFE KIPOINT: una riga per opzione Dimensione (XS-XL × destinazione,
--    via opzione_id) e per il Ritiro Pacco (via offerta_id): prezzo cliente +
--    margine Telefutura (fisso € o % sul prezzo). Seed dal file tariffe di
--    Luca quando arriva (runner dedicato, match per nome offerta+opzione).
--  - eventuali coefficienti bundle PER-OPZIONE in futuro (oggi il coefficiente
--    bundle Vodafone è GLOBALE in ce_parametri 'bundle_coeff_default').
create table if not exists public.catalog_valori (
  id uuid primary key default gen_random_uuid(),
  opzione_id  uuid references public.catalog_opzioni(id) on delete cascade,
  offerta_id  uuid references public.catalog_offerte(id) on delete cascade,
  prezzo         numeric,            -- tariffa cliente (NULL se il prezzo vive altrove)
  margine_tipo   text check (margine_tipo in ('fisso','percent')),
  margine_valore numeric,            -- € se fisso; % (0-100) se percent
  attivo boolean not null default true,
  note   text,
  updated_at timestamptz not null default now(),
  constraint catalog_valori_uno_dei_due check ((opzione_id is null) <> (offerta_id is null))
);
create unique index if not exists catalog_valori_opzione_uniq on public.catalog_valori (opzione_id) where opzione_id is not null;
create unique index if not exists catalog_valori_offerta_uniq on public.catalog_valori (offerta_id) where offerta_id is not null;
alter table public.catalog_valori disable row level security;

notify pgrst, 'reload schema';
