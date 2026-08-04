-- Mig. 161 — SOSTITUZIONE SIM: STESSO VENTAGLIO DI OFFERTE OVUNQUE (RV-06,
-- conferma Luca 04/08/2026: "su tutte le categorie sostituzione SIM di
-- tutti i brand"). Si replica il pattern Iliad — Furto/Smarrimento (0),
-- Danneggiata (1), Esim (2), Volontaria (3) — su TUTTI i prodotti della
-- categoria. A DB oggi: iliad C+B, tim, ho, very, kena hanno gia' le 4;
-- windtre C+B, fastweb C+B, sky C hanno la sola offerta generica
-- "Sostituzione SIM"; vodafone Business ha "Sostituzione Sim"; vodafone
-- Consumer non ha alcuna offerta.

-- 1) Le offerte generiche si DISATTIVANO, MAI cancellare: il delete e'
--    CASCADE sulle opzioni e toglierebbe la voce dalla tendina filtri di
--    Ricerca Vendite (carica il catalogo senza filtro attivo), rendendo
--    infiltrabili le 23 righe storiche con offerta "Sostituzione SIM".
UPDATE public.catalog_offerte o
SET attivo = false
FROM public.catalog_prodotti p
JOIN public.catalog_categorie c ON c.id = p.categoria_id
WHERE o.prodotto_id = p.id
  AND c.nome = 'Sostituzione SIM'
  AND o.nome IN ('Sostituzione SIM', 'Sostituzione Sim')
  AND o.attivo;

-- 2) Le 4 offerte del pattern Iliad su tutti i prodotti della categoria
--    (dove esistono gia' vengono solo riattivate se spente).
INSERT INTO public.catalog_offerte (prodotto_id, nome, ordine, attivo)
SELECT p.id, x.nome, x.ordine, true
FROM public.catalog_prodotti p
JOIN public.catalog_categorie c ON c.id = p.categoria_id
CROSS JOIN (VALUES ('Furto/Smarrimento', 0), ('Danneggiata', 1), ('Esim', 2), ('Volontaria', 3)) AS x(nome, ordine)
WHERE c.nome = 'Sostituzione SIM'
ON CONFLICT (prodotto_id, nome) DO UPDATE SET attivo = true;

-- 3) La regola per-offerta del pannello che NASCONDE il Codice Contratto su
--    VF Business (match ESATTO sul nome offerta "Sostituzione Sim") va
--    agganciata ai 4 nomi nuovi, altrimenti su VFB il campo ricompare.
UPDATE public.catalog_campi_regole
SET condizioni = jsonb_set(condizioni, '{offerta}',
                           '["Furto/Smarrimento","Danneggiata","Esim","Volontaria"]'::jsonb)
WHERE id = 'fe88ddca-9543-4934-92f3-8bc2d71b369b'   -- etichetta '🎯 Offerta: Sostituzione Sim — Sostituzione SIM (Vodafone Business)'
  AND condizioni->'offerta' <> '["Furto/Smarrimento","Danneggiata","Esim","Volontaria"]'::jsonb;

NOTIFY pgrst, 'reload schema';
