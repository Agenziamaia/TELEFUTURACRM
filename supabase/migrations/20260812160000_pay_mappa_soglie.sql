-- MAPPA SOGLIE loro ↔ nostre + % girata ai ragazzi (esito Luca 12/08 sul
-- recap Gare, modello WindTre): l'azienda ha soglie per punto vendita (1-4
-- mobile, 1-5 fisso), i ragazzi hanno soglie totali proprie. Per ogni soglia
-- NOSTRA (ragazzi) si sceglie quale soglia LORO (lettera/Target) le
-- corrisponde e la percentuale di commissioning girata — settata per pista
-- (categoria) e soglia, mai per prodotto.
create table if not exists pay_mappa_soglie (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  month date not null,
  pista text not null,
  tier_nostro int not null,          -- soglia dei ragazzi (S1..Sn)
  tier_loro int not null,            -- soglia della lettera/Target che le corrisponde
  perc numeric not null default 100, -- % del pay azienda girata su questa soglia
  unique (brand, month, pista, tier_nostro)
);

-- il trigger rls_auto_enable accende RLS su ogni tabella nuova: senza policy
-- i salvataggi anon falliscono in silenzio (già successo sulle pay_*)
alter table pay_mappa_soglie enable row level security;
drop policy if exists pay_mappa_soglie_allow_all on pay_mappa_soglie;
create policy pay_mappa_soglie_allow_all on pay_mappa_soglie
  for all using (true) with check (true);
