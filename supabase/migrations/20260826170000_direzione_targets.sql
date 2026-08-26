-- DIREZIONE INSERIMENTO v2 (Luca 26/08, dettato completo): non più la mappa
-- statica negozio→codice, ma TARGET DELLA DIREZIONE per CODICE DI
-- INSERIMENTO e pista — dove i target dei ragazzi sono agglomerati per
-- semplicità ma l'azienda ragiona per codice (W3: i codici della lettera,
-- da pay_target_pdv). Il widget in Home legge l'avanzamento per codice
-- (produzione allocata per Cod.Ins., NON per negozio che registra) e
-- indirizza la vendita sul codice dove manca di più, col favore al negozio
-- di chi chiede. La vecchia tabella direzione_inserimento resta a DB
-- (componente sostituito).
create table if not exists direzione_targets (
  id uuid primary key default gen_random_uuid(),
  brand text not null,                  -- v1: 'windtre' (VF è a gruppo unico: non serve)
  month date not null,                  -- primo del mese
  cod_gara text not null,               -- codice della lettera (pay_target_pdv.cod_gara)
  pista text not null,                  -- chiave pista del tabellare (mobile, fisso, business_piva, lucegas, cb, …)
  target numeric not null default 0,    -- punti (o pezzi, per le piste a pezzi) chiesti dalla direzione
  note text,
  updated_at timestamptz not null default now(),
  updated_by text,
  unique (brand, month, cod_gara, pista)
);

-- Supabase accende la RLS da sola sulle tabelle nuove: il CRM lavora ad anon
-- key (il riordino RLS è il cantiere P0 già censito) — senza questo alter il
-- pannello non scrive e il widget non legge. Nessun dato sensibile: target
-- operativi di produzione.
alter table direzione_targets disable row level security;
