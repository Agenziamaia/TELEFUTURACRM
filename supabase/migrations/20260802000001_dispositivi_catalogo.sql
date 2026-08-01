-- 133: CATALOGO DISPOSITIVI UNIVERSALE (Luca 02/08) — fonte UNICA per tutte
-- le tendine "modello telefono" del CRM. Alimentato da due fonti ufficiali
-- aggiornate di continuo (route /api/dispositivi/sync):
--   * Apple: api.ipsw.me/v4/devices (iPhone/iPad/Watch/Mac, esce il giorno
--     stesso dei nuovi modelli)
--   * Android: CSV ufficiale "supported devices" di Google Play (certified,
--     aggiornato piu' volte a settimana — telefoni e tablet)
-- Le tendine leggono da qui con RIPIEGO alle liste cablate a tabella vuota.
-- I listini commerciali degli operatori (bundle W3/VF in Registra Vendita)
-- NON c'entrano: quelli restano nel catalogo offerte.

create table if not exists public.dispositivi_catalogo (
  id uuid primary key default gen_random_uuid(),
  categoria text not null check (categoria in ('smartphone','tablet','watch','computer')),
  brand text not null,
  modello text not null,
  fonte text not null default '',
  attivo boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_dispositivi on public.dispositivi_catalogo (categoria, brand, modello);
create index if not exists idx_dispositivi_cat_brand on public.dispositivi_catalogo (categoria, brand);

-- LEZIONE mig. 119: RLS OFF sulle tabelle nuove
alter table public.dispositivi_catalogo disable row level security;

notify pgrst, 'reload schema';
