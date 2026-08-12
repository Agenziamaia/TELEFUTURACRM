-- POS: Coupon (ritiro usato → sconto) + Conti in sospeso (spec Francesco 12/08 sera).
--
-- COUPON: comprando un usato si può pagare il cliente con un "Codice Sconto" → si
-- genera UN codice unico di valore pari al prezzo di ritiro. Il cliente lo riporta e
-- lo usa in cassa: ABBASSA L'IMPONIBILE dello scontrino (è uno sconto, non un incasso).
-- Se lo scontrino è più basso del coupon, il residuo RIGENERA un nuovo coupon.
--
-- CONTI IN SOSPESO: la vendita si registra ma lo scontrino si fa DOPO (il cliente
-- torna a pagare). Si salva qui e si riprende da un pulsante in Registra Vendita.

-- ── Coupon ───────────────────────────────────────────────────────────────────
create table if not exists public.coupons (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,             -- codice unico consegnato al cliente
  valore         numeric not null,                 -- valore all'emissione (= prezzo ritiro)
  valore_residuo numeric not null,                 -- residuo spendibile
  stato          text not null default 'attivo',   -- attivo | usato | annullato
  negozio        text,                             -- negozio di emissione
  origine        text not null default 'usato',    -- usato | residuo | manuale
  usato_id       bigint references public.usati(id) on delete set null,  -- buyback d'origine
  parent_code    text,                             -- coupon padre se nato da un residuo
  cliente        text,                             -- nome cliente (per ricerca)
  created_by     text,
  created_at     timestamptz not null default now(),
  redeemed_at    timestamptz,
  redeemed_ref   text,                             -- riferimento vendita/scontrino
  constraint coupons_valore_pos   check (valore >= 0),
  constraint coupons_residuo_pos  check (valore_residuo >= 0),
  constraint coupons_stato_chk    check (stato in ('attivo','usato','annullato'))
);
create index if not exists coupons_negozio_stato_idx on public.coupons (negozio, stato);

alter table public.coupons enable row level security;
drop policy if exists coupons_all on public.coupons;
create policy coupons_all on public.coupons for all using (true) with check (true);

comment on table public.coupons is 'Coupon sconto (spec Francesco): generati dal ritiro usato, spesi in cassa abbassando l''imponibile; il residuo rigenera un nuovo coupon.';

-- ── Conti in sospeso (scontrino da emettere più tardi) ───────────────────────
create table if not exists public.vendite_sospese (
  id           uuid primary key default gen_random_uuid(),
  negozio      text,
  cliente      text,                               -- nome cliente (per ritrovarla)
  items        jsonb not null,                     -- righe scontrino [{productId,description,unitPrice,qty,reparto}]
  totale       numeric,
  azienda      text,                               -- ragione sociale scelta (T1/T2)
  note         text,
  stato        text not null default 'in_sospeso', -- in_sospeso | completata | annullata
  created_by   text,
  created_at   timestamptz not null default now(),
  completed_at timestamptz,
  constraint vendite_sospese_stato_chk check (stato in ('in_sospeso','completata','annullata'))
);
create index if not exists vendite_sospese_negozio_stato_idx on public.vendite_sospese (negozio, stato);

alter table public.vendite_sospese enable row level security;
drop policy if exists vendite_sospese_all on public.vendite_sospese;
create policy vendite_sospese_all on public.vendite_sospese for all using (true) with check (true);

comment on table public.vendite_sospese is 'Conti in sospeso: vendita registrata, scontrino da emettere più tardi (pulsante rosso in Registra Vendita).';

notify pgrst, 'reload schema';
