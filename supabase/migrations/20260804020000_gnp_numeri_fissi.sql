-- Mig. 158 — GNP E NUMERI FISSI (design confermato da Luca 04/08/2026, CAT-01).
-- Nuovo assetto dei campi "numero fisso":
--   • SENZA opzione GNP: NESSUN numero fisso su windtre (C+B), vodafone (C+B)
--     e sky; gli ALTRI brand con categoria Fisso restano come oggi (Numero
--     Fisso Definitivo sempre) tramite la nuova regola "Fisso altri brand".
--   • CON opzione GNP: windtre C+B e vodafone Consumer → Provvisorio +
--     Definitivo; vodafone Business e sky → SOLO Definitivo.
--   • "Numero Fisso da Portare" ELIMINATO dalla regola "opzione GNP" (il
--     numero portato E' il Definitivo); resta "Operatore GNP".
--   • VF Business: la GNP diventa OPZIONE — chip GNP su tutte le offerte
--     Fisso/FWA che non lo hanno; dalla regola mig. 152 spariscono i campi
--     "GNP" e "Operatore GNP" (resta il Seriale SIM ICCID).
--   • W3 Business: chip GNP sulle 8 offerte Fisso/FWA.
-- I campi si RIMUOVONO (non si nascondono) dalle regole toccate: per il
-- claim-then-skip di lib/campiRegole un campo nascosto prenota il nome e
-- bloccherebbe per sempre le nuove regole GNP a ordine maggiore.
-- Nessun UPDATE su contracts: i dettagli storici sono copie per nome.

-- ────────────────────────────────────────────────────────────────────────
-- 1) RINUMERAZIONE ordini (id verificati a DB il 04/08): via i duplicati
--    8/8, 9/9, 10/10 (ordinamento non deterministico tra RV e pannello) e
--    scala ×10 per lasciare spazio alle regole "prima di" delle mig.
--    159-160 (15/25/35/55) senza creare nuovi duplicati. L'ordine RELATIVO
--    resta identico; le regole per-offerta del pannello (ordine negativo)
--    non si toccano. Idempotente: riassegna sempre gli stessi valori.
UPDATE public.catalog_campi_regole r
SET ordine = v.ord
FROM (VALUES
  ('02b944a7-cbc5-4483-ba5d-11a066ccee4d'::uuid,  10),  -- brand windtre — Codice Contratto (era 1)
  ('c539a265-dfd3-44c0-be85-2d2ca5e5b07e'::uuid,  20),  -- Mobile GA (era 2)
  ('ee050442-e568-488e-95b3-21cb4e5b076c'::uuid,  30),  -- Mobile MNP (era 3)
  ('dac547e8-e383-4116-93bb-72f239bec63e'::uuid,  40),  -- Telefono a Rate (era 4)
  ('dd9d0993-7d0c-4fe2-9f5e-fed785ed84d5'::uuid,  50),  -- Telefono a Rate — Finanziato (era 5)
  ('60392bc9-36d2-4f9d-94cd-ccee152c8af8'::uuid,  60),  -- Fisso (base, era 6)
  ('16c3b3d6-7a97-402e-8102-d73422457d04'::uuid,  70),  -- Fisso — FWA Consumer (era 7)
  ('d7410f6e-de6b-40f8-a797-305f7d52b594'::uuid,  80),  -- offerta contiene "Indoor" (era 8)
  ('377283eb-c0c9-4d43-a504-3ea6a6b5b298'::uuid,  85),  -- Fisso — FWA Business non W3 (era 8, duplicato)
  ('b8bac32a-71d2-4729-bc64-dd7e4f57593d'::uuid,  90),  -- Fisso — FWA Business W3 (era 9)
  ('9887de9b-cf66-441d-ba15-fcdb0f05a330'::uuid,  95),  -- offerta contiene "Conv/Con Super Fibra" (era 9, duplicato)
  ('e55ecb5c-f147-459c-a7fc-f5824685c4b2'::uuid, 105),  -- opzione GNP (era 10)
  ('0254859e-764d-45cb-a2b1-4033601b5a03'::uuid, 110),  -- Fisso VF Business — Seriale SIM + GNP (era 10, duplicato)
  ('a81cfa3c-d2d4-4cef-8351-8f0097ec0472'::uuid, 115),  -- opzione Linea Aggiuntiva (era 11)
  ('fd125407-57ce-46fb-a35e-d56a464744d1'::uuid, 120),  -- Energia (era 12)
  ('2d69e47a-959d-4153-b07f-2b23dc2210bb'::uuid, 130),  -- Energia — Luce (era 13)
  ('aabf87a1-c7d5-4085-8760-fdebf4b4f971'::uuid, 140),  -- Energia — Gas (era 14)
  ('f7f24896-3283-4730-8947-4039a313ba37'::uuid, 150),  -- opzione RID (era 15)
  ('eca56e89-34ed-461c-a415-cbf6c101355c'::uuid, 160),  -- Sostituzione SIM (era 16)
  ('93bdc065-98dd-4ed5-8d41-4ed1057cfd26'::uuid, 170),  -- TV (era 17)
  ('7fff97a7-3937-45fa-8010-3eff5244bb06'::uuid, 180),  -- Customer Base (era 18)
  ('a90ad8fb-d507-4e75-ac8e-05f69b6c1818'::uuid, 190),  -- Consumer CB non CL0-3 (era 19)
  ('c570820a-7599-45d7-aed1-634d33de9b75'::uuid, 200),  -- Business CB (era 20)
  ('4e5491d4-be01-4413-a439-d69996adbc92'::uuid, 210),  -- opzione Reload Open (era 21)
  ('6966d070-0a12-42e1-ba94-ba7dfa587245'::uuid, 220),  -- Kasko Facile (era 22)
  ('e31b3c64-6ee2-4f31-849c-77243698c251'::uuid, 230),  -- Verisure · Vodafone Care (era 23)
  ('77d56e49-9cad-45c2-91bb-53194dcddee2'::uuid, 240),  -- Telepass (era 24)
  ('3541bfff-e9bb-4e3c-b76c-6a0bb18f564c'::uuid, 250),  -- opzione Twin (era 25)
  ('5fd54549-e7da-4c4a-aa3d-d970eb9f8f44'::uuid, 260),  -- POS (era 26)
  ('d9934b8b-290c-4a96-b13f-9c27071f891f'::uuid, 270)   -- Assicurazioni (era 27)
) AS v(id, ord)
WHERE r.id = v.id AND r.ordine <> v.ord;

-- ────────────────────────────────────────────────────────────────────────
-- 2) Regola base "Fisso" (60392bc9): RIMUOVI Numero Fisso Provvisorio e
--    Numero Fisso Definitivo dal jsonb (il Provvisorio era gia' nascosto:
--    da nascosto avrebbe prenotato il nome per sempre). Resta vuota come
--    ancora storica. Idempotente.
UPDATE public.catalog_campi_regole
SET campi = COALESCE(
  (SELECT jsonb_agg(c) FROM jsonb_array_elements(campi) AS c
   WHERE c->>'nome' NOT IN ('Numero Fisso Provvisorio', 'Numero Fisso Definitivo')),
  '[]'::jsonb)
WHERE id = '60392bc9-36d2-4f9d-94cd-ccee152c8af8'   -- etichetta 'Fisso'
  AND campi::text LIKE '%Numero Fisso%';

-- ────────────────────────────────────────────────────────────────────────
-- 3) Regola "Fisso altri brand": i brand fisso NON windtre/vodafone/sky
--    continuano a chiedere sempre il Definitivo (a DB oggi hanno prodotti
--    Fisso solo fastweb, iliad e tim; gli altri elencati sono futuri).
INSERT INTO public.catalog_campi_regole (etichetta, condizioni, campi, ordine, attivo)
SELECT 'Fisso altri brand — Numero Fisso Definitivo sempre (04/08)',
       '{"brand":["fastweb","iliad","tim","s4","dojo","ho","very","kena"],"categoria":["Fisso"]}'::jsonb,
       '[{"nome":"Numero Fisso Definitivo","tipo":"testo","nota":"","attivo":true,"conferma":false}]'::jsonb,
       65, true
WHERE NOT EXISTS (SELECT 1 FROM public.catalog_campi_regole
                  WHERE etichetta = 'Fisso altri brand — Numero Fisso Definitivo sempre (04/08)');

-- ────────────────────────────────────────────────────────────────────────
-- 4) Regole GNP per brand/tipo: i numeri fissi compaiono SOLO col chip GNP.
--    (la categoria "FWA" oggi non esiste — FWA e' un prodotto di Fisso — ma
--    resta nella condizione per copertura futura, come da decisione)
INSERT INTO public.catalog_campi_regole (etichetta, condizioni, campi, ordine, attivo)
SELECT 'GNP — numeri fissi WindTre + Vodafone Consumer (04/08)',
       '{"tipo":["Consumer"],"brand":["windtre","vodafone"],"categoria":["Fisso","FWA"],"opzioni":["GNP"]}'::jsonb,
       '[{"nome":"Numero Fisso Provvisorio","tipo":"testo","nota":"","attivo":true,"conferma":false},
         {"nome":"Numero Fisso Definitivo","tipo":"testo","nota":"il numero che si porta","attivo":true,"conferma":false}]'::jsonb,
       100, true
WHERE NOT EXISTS (SELECT 1 FROM public.catalog_campi_regole
                  WHERE etichetta = 'GNP — numeri fissi WindTre + Vodafone Consumer (04/08)');

INSERT INTO public.catalog_campi_regole (etichetta, condizioni, campi, ordine, attivo)
SELECT 'GNP — numeri fissi WindTre Business (04/08)',
       '{"tipo":["Business"],"brand":["windtre"],"categoria":["Fisso","FWA"],"opzioni":["GNP"]}'::jsonb,
       '[{"nome":"Numero Fisso Provvisorio","tipo":"testo","nota":"","attivo":true,"conferma":false},
         {"nome":"Numero Fisso Definitivo","tipo":"testo","nota":"il numero che si porta","attivo":true,"conferma":false}]'::jsonb,
       101, true
WHERE NOT EXISTS (SELECT 1 FROM public.catalog_campi_regole
                  WHERE etichetta = 'GNP — numeri fissi WindTre Business (04/08)');

INSERT INTO public.catalog_campi_regole (etichetta, condizioni, campi, ordine, attivo)
SELECT 'GNP — numero fisso Vodafone Business (04/08)',
       '{"tipo":["Business"],"brand":["vodafone"],"categoria":["Fisso","FWA"],"opzioni":["GNP"]}'::jsonb,
       '[{"nome":"Numero Fisso Definitivo","tipo":"testo","nota":"il numero che si porta","attivo":true,"conferma":false}]'::jsonb,
       102, true
WHERE NOT EXISTS (SELECT 1 FROM public.catalog_campi_regole
                  WHERE etichetta = 'GNP — numero fisso Vodafone Business (04/08)');

INSERT INTO public.catalog_campi_regole (etichetta, condizioni, campi, ordine, attivo)
SELECT 'GNP — numero fisso Sky (04/08)',
       '{"brand":["sky"],"categoria":["Fisso","FWA"],"opzioni":["GNP"]}'::jsonb,
       '[{"nome":"Numero Fisso Definitivo","tipo":"testo","nota":"il numero che si porta","attivo":true,"conferma":false}]'::jsonb,
       103, true
WHERE NOT EXISTS (SELECT 1 FROM public.catalog_campi_regole
                  WHERE etichetta = 'GNP — numero fisso Sky (04/08)');

-- ────────────────────────────────────────────────────────────────────────
-- 5) Regola "opzione GNP" (e55ecb5c): via "Numero Fisso da Portare" (il
--    numero portato E' il Definitivo delle regole sopra); resta "Operatore
--    GNP". RIMOZIONE, non nascondere. Idempotente.
UPDATE public.catalog_campi_regole
SET campi = COALESCE(
  (SELECT jsonb_agg(c) FROM jsonb_array_elements(campi) AS c
   WHERE c->>'nome' <> 'Numero Fisso da Portare'),
  '[]'::jsonb)
WHERE id = 'e55ecb5c-f147-459c-a7fc-f5824685c4b2'   -- etichetta 'opzione GNP'
  AND campi::text LIKE '%Numero Fisso da Portare%';

-- ────────────────────────────────────────────────────────────────────────
-- 6) Regola mig. 152 "Fisso Vodafone Business — Seriale SIM + GNP" (0254859e):
--    la GNP su VF Business diventa opzione → via i campi "GNP" e "Operatore
--    GNP" (l'Operatore arrivera' dalla regola "opzione GNP" col chip attivo);
--    resta il Seriale SIM (ICCID). Idempotente.
UPDATE public.catalog_campi_regole
SET campi = COALESCE(
  (SELECT jsonb_agg(c) FROM jsonb_array_elements(campi) AS c
   WHERE c->>'nome' NOT IN ('GNP', 'Operatore GNP')),
  '[]'::jsonb)
WHERE id = '0254859e-764d-45cb-a2b1-4033601b5a03'   -- etichetta 'Fisso Vodafone Business — Seriale SIM + GNP (03/08)'
  AND campi::text LIKE '%Operatore GNP%';

-- ────────────────────────────────────────────────────────────────────────
-- 7) Opzione GNP a catalogo dove manca: 8 offerte W3 Business Fisso/FWA e
--    6 offerte VF Business (Fissa Comfort, Fissa Extra, Onpi TW Plus, Onpi
--    Premium, One Biz, Fissa Wireless 5G — su Fissa Smart c'e' gia').
--    Senza chip a catalogo la condizione opzioni:["GNP"] non puo' scattare.
INSERT INTO public.catalog_opzioni (offerta_id, nome, tipo, gruppo_singolo, ordine, attivo)
SELECT o.id, 'GNP', NULL, NULL,
       COALESCE((SELECT MAX(k.ordine) + 1 FROM public.catalog_opzioni k WHERE k.offerta_id = o.id), 0),
       true
FROM public.catalog_offerte o
JOIN public.catalog_prodotti p ON p.id = o.prodotto_id
JOIN public.catalog_categorie c ON c.id = p.categoria_id
WHERE c.nome = 'Fisso'
  AND p.tipo_cliente = 'Business'
  AND p.brand_id IN ('windtre', 'vodafone')
  AND NOT EXISTS (SELECT 1 FROM public.catalog_opzioni k
                  WHERE k.offerta_id = o.id AND k.nome = 'GNP');

NOTIFY pgrst, 'reload schema';
