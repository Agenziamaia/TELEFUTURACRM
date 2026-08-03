-- Mig. 152 — FISSO VODAFONE BUSINESS (Luca 03/08/2026): oltre a codici e
-- numero fisso definitivo si chiedono anche il SERIALE SIM e il GNP; con
-- GNP = Si' si apre il solo campo "Operatore GNP" (come il consumer).
-- Prima-vince sul nome: per i prodotti FWA il Seriale SIM resta quello
-- delle regole FWA (ord 7-9), qui copre fibra e gli altri fissi VB.
INSERT INTO public.catalog_campi_regole (etichetta, condizioni, campi, ordine, attivo)
SELECT 'Fisso Vodafone Business — Seriale SIM + GNP (03/08)',
       '{"tipo":["Business"],"brand":["vodafone"],"categoria":["Fisso"]}'::jsonb,
       '[{"nome":"Seriale SIM (ICCID)","tipo":"testo","nota":"Barcode 📷"},
         {"nome":"GNP","tipo":"scelta","nota":"Numero che arriva da altro operatore?"},
         {"nome":"Operatore GNP","tipo":"scelta","nota":"appare solo con GNP = Sì"}]'::jsonb,
       10, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.catalog_campi_regole
  WHERE etichetta = 'Fisso Vodafone Business — Seriale SIM + GNP (03/08)'
);
NOTIFY pgrst, 'reload schema';
