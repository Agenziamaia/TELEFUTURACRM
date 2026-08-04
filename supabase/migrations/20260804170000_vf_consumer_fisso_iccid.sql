-- Luca 04/08: su Vodafone CONSUMER, categoria Fisso, OGNI offerta deve
-- chiedere anche il Seriale della SIM del fisso (ICCID) come campo vendita —
-- speculare alla regola VF Business della mig. 152. Il nome "Seriale SIM
-- (ICCID)" è già rimappato a ICCID nel salvataggio (colItems).
INSERT INTO public.catalog_campi_regole (etichetta, condizioni, campi, ordine, attivo)
SELECT 'Fisso Vodafone Consumer — Seriale SIM (04/08)',
       '{"brand":["vodafone"],"tipo":["Consumer"],"categoria":["Fisso"]}'::jsonb,
       '[{"nome":"Seriale SIM (ICCID)","tipo":"testo","nota":"","attivo":true,"conferma":false}]'::jsonb,
       58, true
WHERE NOT EXISTS (SELECT 1 FROM public.catalog_campi_regole
                  WHERE etichetta = 'Fisso Vodafone Consumer — Seriale SIM (04/08)');
NOTIFY pgrst, 'reload schema';
