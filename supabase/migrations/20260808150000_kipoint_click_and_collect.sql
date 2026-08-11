-- KIPOINT — categoria "Click and Collect" (mig. 195, Luca 08/08)
--
-- Kipoint ha due categorie: "Spedizioni" (già esistente) e "Click and Collect".
-- Click and Collect = 2 prodotti (Spedizioni, Ritiri), ognuno con 3 offerte
-- (Amazon, Vinted, Altro) e un solo campo vendita: "Lettera di Vettura".
-- Nessuna logica speciale: il flusso segue il catalogo 6 livelli come gli
-- altri brand (Registra Vendita lo renderizza da solo).

-- categoria
insert into public.catalog_categorie (id, nome, ordine, attivo)
select gen_random_uuid(), 'Click and Collect', 102, true
 where not exists (select 1 from public.catalog_categorie where nome = 'Click and Collect');

-- prodotti (Consumer) sotto Click and Collect
insert into public.catalog_prodotti (id, brand_id, tipo_cliente, categoria_id, nome, ordine, attivo)
select gen_random_uuid(), 'kipoint', 'Consumer', c.id, p.nome, p.ordine, true
  from public.catalog_categorie c
  join (values ('Spedizioni', 0), ('Ritiri', 1)) as p(nome, ordine) on c.nome = 'Click and Collect'
 where not exists (
   select 1 from public.catalog_prodotti x
    where x.brand_id = 'kipoint' and x.nome = p.nome and x.tipo_cliente = 'Consumer' and x.categoria_id = c.id);

-- offerte: Amazon, Vinted, Altro per entrambi i prodotti
insert into public.catalog_offerte (id, prodotto_id, nome, ordine, attivo)
select gen_random_uuid(), pr.id, o.nome, o.ordine, true
  from public.catalog_prodotti pr
  join public.catalog_categorie c on c.id = pr.categoria_id and c.nome = 'Click and Collect'
  join (values ('Amazon', 0), ('Vinted', 1), ('Altro', 2)) as o(nome, ordine) on true
 where pr.brand_id = 'kipoint'
   and not exists (select 1 from public.catalog_offerte f where f.prodotto_id = pr.id and f.nome = o.nome);

-- campo vendita unico "Lettera di Vettura" (obbligatorio) per la categoria
insert into public.catalog_campi_regole (id, etichetta, condizioni, campi, ordine, attivo)
select gen_random_uuid(), 'Kipoint — Click and Collect',
       '{"brand":["kipoint"],"categoria":["Click and Collect"]}'::jsonb,
       '[{"nome":"Lettera di Vettura","nota":"","tipo":"testo","attivo":true,"conferma":false}]'::jsonb,
       10, true
 where not exists (
   select 1 from public.catalog_campi_regole where etichetta = 'Kipoint — Click and Collect');

notify pgrst, 'reload schema';
