-- Mig. 179 — W3 CONSUMER FISSO SENZA GNP (Luca 05/08): ogni offerta della
-- categoria Fisso, quando l'opzione GNP NON è selezionata, chiede il campo
-- "Numero Fisso". Usa la condizione nuova `opzioniNon` del motore (05/08):
-- col chip GNP spuntato la regola tace e valgono le regole GNP (Provv+Def).
INSERT INTO public.catalog_campi_regole (etichetta, condizioni, campi, ordine, attivo)
SELECT 'Fisso WindTre Consumer senza GNP — Numero Fisso (05/08)',
       '{"brand":["windtre"],"tipo":["Consumer"],"categoria":["Fisso"],"opzioniNon":["GNP"]}'::jsonb,
       '[{"nome":"Numero Fisso","tipo":"testo","nota":"","attivo":true,"conferma":false}]'::jsonb,
       104, true
WHERE NOT EXISTS (SELECT 1 FROM public.catalog_campi_regole
                  WHERE etichetta = 'Fisso WindTre Consumer senza GNP — Numero Fisso (05/08)');
NOTIFY pgrst, 'reload schema';
