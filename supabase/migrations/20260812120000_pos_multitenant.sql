-- POS multi-societario (spec Francesco #1): nello stesso negozio si fattura con PIÙ
-- ragioni sociali su RT diversi. Uno scontrino appartiene a UNA sola azienda → un
-- carrello con prodotti di aziende diverse va spezzato in più scontrini, ognuno al
-- suo RT con i suoi reparti.

-- Mappa negozio + azienda -> RT (stampante fiscale) + P.IVA/ragione sociale.
create table if not exists public.pos_rt (
  negozio          text not null,
  azienda          text not null,              -- codice interno azienda (es. 'T1','T2')
  rt_url           text not null,              -- base URL stampante fiscale (es. http://192.168.1.50)
  piva             text,
  ragione_sociale  text,
  is_default       boolean not null default false,  -- azienda di default del negozio
  created_at       timestamptz not null default now(),
  primary key (negozio, azienda)
);
alter table public.pos_rt enable row level security;
drop policy if exists pos_rt_all on public.pos_rt;
create policy pos_rt_all on public.pos_rt for all using (true) with check (true);

-- Prodotto -> azienda che lo EMETTE (quale ragione sociale/RT). NULL = azienda di
-- default del negozio. (Es. Francesco: "PLX sta sulla cassa T1", non su quella in prova.)
alter table public.marg_items add column if not exists azienda text;

comment on table public.pos_rt is 'Multi-societario POS: negozio+azienda -> RT + P.IVA (spec Francesco #1).';
comment on column public.marg_items.azienda is 'Ragione sociale che emette questo prodotto (codice azienda in pos_rt). NULL = default del negozio.';

-- Seed Donna: Telefutura 2 (.50, default) + Telefutura 1 (.219). P.IVA T1 da confermare.
insert into public.pos_rt (negozio, azienda, rt_url, piva, ragione_sociale, is_default) values
  ('Donna','T2','http://192.168.1.50','10916221004','Telefutura 2 S.R.L.', true),
  ('Donna','T1','http://192.168.1.219', null, 'Telefutura S.R.L.', false)
on conflict (negozio, azienda) do nothing;

notify pgrst, 'reload schema';
