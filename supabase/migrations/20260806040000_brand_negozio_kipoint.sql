-- BRAND × NEGOZIO + KIPOINT (Luca 06/08)
--
-- 1) MATRICE store_brand_rules: per ogni (negozio, brand) decide se il negozio
--    VEDE il brand in Registra Vendita e se può REGISTRARE vendite. Senza riga
--    vale il default del brand (catalog_brands.default_abilitato): i brand
--    storici restano liberi per tutti, i brand "a matrice" (Kipoint) esistono
--    solo dove c'è la riga. Si amministra da Amministrazione → Catalogo.
--
-- 2) BRAND KIPOINT: spedizioni e ritiro pacchi — abilitato SOLO a Collatina
--    e Libia. Due categorie nuove ("Spedizioni", "Ritiro Pacco") + prodotti
--    skeleton nel catalogo: dimensioni/destinazioni le rifinisce Luca dal
--    pannello. La marginalità (coefficienti) è il cantiere di domani.

-- 1a) matrice
create table if not exists public.store_brand_rules (
  store text not null,
  brand text not null,            -- id di catalog_brands (slug catalogo)
  vede boolean not null default true,
  registra boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (store, brand)
);
alter table public.store_brand_rules disable row level security;

-- 1b) default per brand: true = visibile ovunque salvo riga contraria;
--     false = visibile SOLO dove esiste una riga con vede=true
alter table public.catalog_brands
  add column if not exists default_abilitato boolean not null default true;

-- 2a) brand Kipoint (a matrice: default spento)
insert into public.catalog_brands (id, nome, colore1, colore2, ordine, attivo, default_abilitato)
values ('kipoint', 'Kipoint', '#0a58ca', '#4d8fe8', 11, true, false)
on conflict (id) do update set default_abilitato = false;

-- 2b) abilitazione: Collatina (entrambi i punti vendita) e Libia
insert into public.store_brand_rules (store, brand, vede, registra) values
  ('Collatina Multi', 'kipoint', true, true),
  ('Collatina W3',    'kipoint', true, true),
  ('Libia',           'kipoint', true, true)
on conflict (store, brand) do nothing;

-- 2c) categorie nuove (globali). CAT_MACRO_ID non le conosce → macro "extra".
insert into public.catalog_categorie (id, nome, ordine, attivo)
select gen_random_uuid(), v.nome, v.ordine, true
  from (values ('Spedizioni', 100), ('Ritiro Pacco', 101)) as v(nome, ordine)
 where not exists (select 1 from public.catalog_categorie c where c.nome = v.nome);

-- 2d) prodotti skeleton Kipoint (Consumer; il Business si aggiunge dal pannello)
insert into public.catalog_prodotti (id, brand_id, tipo_cliente, categoria_id, nome, ordine, attivo)
select gen_random_uuid(), 'kipoint', 'Consumer', c.id, p.nome, p.ordine, true
  from public.catalog_categorie c
  join (values ('Spedizioni', 'Spedizione', 0), ('Ritiro Pacco', 'Ritiro Pacco', 0)) as p(cat, nome, ordine)
    on p.cat = c.nome
 where not exists (
   select 1 from public.catalog_prodotti x
    where x.brand_id = 'kipoint' and x.nome = p.nome and x.tipo_cliente = 'Consumer');

-- 2e) offerte skeleton della Spedizione: destinazioni; le dimensioni come
--     opzioni mutuamente esclusive (gruppo 'dimensione')
insert into public.catalog_offerte (id, prodotto_id, nome, ordine, attivo)
select gen_random_uuid(), pr.id, o.nome, o.ordine, true
  from public.catalog_prodotti pr
  join (values ('Spedizione Italia', 0), ('Spedizione Europa', 1), ('Spedizione Extra UE', 2)) as o(nome, ordine) on true
 where pr.brand_id = 'kipoint' and pr.nome = 'Spedizione' and pr.tipo_cliente = 'Consumer'
   and not exists (select 1 from public.catalog_offerte f where f.prodotto_id = pr.id and f.nome = o.nome);

insert into public.catalog_opzioni (id, offerta_id, nome, tipo, gruppo_singolo, ordine, attivo)
select gen_random_uuid(), f.id, d.nome, null, 'dimensione', d.ordine, true
  from public.catalog_offerte f
  join public.catalog_prodotti pr on pr.id = f.prodotto_id and pr.brand_id = 'kipoint' and pr.nome = 'Spedizione'
  join (values ('Dimensione XS', 0), ('Dimensione S', 1), ('Dimensione M', 2), ('Dimensione L', 3), ('Dimensione XL', 4)) as d(nome, ordine) on true
 where not exists (select 1 from public.catalog_opzioni k where k.offerta_id = f.id and k.nome = d.nome);

notify pgrst, 'reload schema';
