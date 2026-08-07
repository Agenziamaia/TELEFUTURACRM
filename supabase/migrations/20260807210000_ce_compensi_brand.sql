-- LISTINO COMPENSI BRAND (mig. 189, conto economico PV fase 4)
--
-- I contracts non hanno campi €: il ricavo di una vendita brand nasce da qui.
-- Modello a coefficienti con MATCH GERARCHICO: la riga attiva e valida per
-- data col maggior numero di campi non-null combacianti vince (brand →
-- +tipo_cliente → +categoria → +prodotto → +offerta → +opzione); contratti
-- senza match = bucket "non valorizzato" (mai zero silenzioso). I cambi
-- listino NON riscrivono lo storico: si chiude la riga con mese_a e se ne
-- apre una nuova con mese_da.
create table if not exists public.ce_compensi_brand (
  id uuid primary key default gen_random_uuid(),
  brand        text not null,        -- etichetta contracts.brand: 'WindTre','Vodafone','Sky',...
  tipo_cliente text,                 -- NULL = qualsiasi (vale per tutti i campi sotto)
  categoria    text,
  prodotto     text,
  offerta      text,
  opzione      text,                 -- match su contracts.opzioni[].nome (es. 'Bundle 99.99')
  compenso     numeric not null,     -- € per pezzo (regime 'fisso')
  regime       text not null default 'fisso' check (regime in ('fisso','pct_canone','a_soglia')),
  mese_da      date,                 -- validità (NULL = da sempre)
  mese_a       date,                 -- (NULL = per sempre)
  attivo       boolean not null default true,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists ce_compensi_brand_idx on public.ce_compensi_brand (brand, attivo);
alter table public.ce_compensi_brand disable row level security;

notify pgrst, 'reload schema';
