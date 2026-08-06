-- Mig. 184 — GNP Fastweb Consumer (Luca 06/08, punto 11b): con l'opzione GNP
-- selezionata la vendita chiede il NUMERO FISSO DEFINITIVO e l'OPERATORE di
-- provenienza (a scelta, come la regola TIM). Stessa famiglia delle regole
-- GNP del 04/08 (ordini 100-104). Idempotente per etichetta.
INSERT INTO public.catalog_campi_regole (etichetta, condizioni, campi, ordine, attivo)
SELECT 'GNP — numero fisso Fastweb Consumer (06/08)',
       '{"tipo":["Consumer"],"brand":["fastweb"],"opzioni":["GNP"],"categoria":["Fisso","FWA"]}'::jsonb,
       '[{"nome":"Numero Fisso Definitivo","nota":"il numero che si porta","tipo":"testo","attivo":true,"conferma":false},{"nome":"Operatore GNP","nota":"da quale operatore proviene","tipo":"scelta","attivo":true,"conferma":false}]'::jsonb,
       105, true
WHERE NOT EXISTS (SELECT 1 FROM public.catalog_campi_regole WHERE etichetta = 'GNP — numero fisso Fastweb Consumer (06/08)');
