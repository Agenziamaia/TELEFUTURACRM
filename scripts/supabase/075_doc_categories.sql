-- Segnalazione 73: sezioni/categorie della Documentazione modificabili dal
-- ruolo Direttore Commerciale in su (prima erano fisse nel codice: Canvass,
-- Modulistica, Operativa). Ora vivono nel DB, cosi' si possono aggiungere,
-- rinominare e rimuovere per creare raccolte di informazioni per ciascun brand.
--
-- brand_id NULL = categoria globale (vale per tutti i brand).
-- brand_id valorizzato = categoria specifica di quel brand.
-- cat_key = chiave stabile usata da documentation.category_id.

create table if not exists public.doc_categories (
  id           bigint generated always as identity primary key,
  brand_id     text,
  cat_key      text not null,
  name         text not null,
  descrizione  text,
  sort         int  not null default 100,
  archived     boolean not null default false,
  created_at   timestamptz not null default now()
);

-- unicita' per (brand, chiave): evita categorie doppie. coalesce cosi' le
-- globali (brand_id null) sono uniche fra loro sulla chiave.
create unique index if not exists doc_categories_brand_key_uq
  on public.doc_categories (coalesce(brand_id, ''), cat_key);

-- Seed: le 3 categorie storiche come globali (idempotente).
insert into public.doc_categories (brand_id, cat_key, name, descrizione, sort)
values
  (null, 'canvass',     'Canvass Attuale',           'Offerte e listini aggiornati',   10),
  (null, 'modulistica', 'Modulistica Utile',         'Moduli compilabili e template',  20),
  (null, 'operativa',   'Documentazione Operativa',  'Procedure, guide e manuali',     30)
on conflict (coalesce(brand_id, ''), cat_key) do nothing;

alter table public.doc_categories enable row level security;
drop policy if exists doc_categories_all on public.doc_categories;
create policy doc_categories_all on public.doc_categories for all using (true) with check (true);
