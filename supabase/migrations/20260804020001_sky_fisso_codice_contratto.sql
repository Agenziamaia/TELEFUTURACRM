-- Mig. 159 — FISSO SKY: CODICE CONTRATTO (RV-01/RV-02, Luca 04/08/2026).
-- Il flusso legacy Sky chiedeva il Codice Contratto sul fisso (tvCC/fibraCC);
-- col passaggio al catalogo del 27/07 si e' perso, perche' la regola che lo
-- da' sul Fisso e' ristretta a brand windtre. Questa regola lo ripristina per
-- sky, categoria Fisso, SENZA condizione tipo: copre Consumer (3P, Sky Fibra)
-- e Business (Fibra). Effetto collaterale voluto: contracts.codice_attivazione
-- torna popolato per il fisso Sky (Registra Vendita legge dettagli
-- ["Codice Contratto"]). Ordine 55: prima della regola base Fisso (60, dopo
-- la rinumerazione della mig. 158). I numeri fissi Sky sono gia' regolati
-- dal design GNP della mig. 158 (senza GNP nessun numero, col chip GNP solo
-- il Definitivo): qui non si toccano.
INSERT INTO public.catalog_campi_regole (etichetta, condizioni, campi, ordine, attivo)
SELECT 'Fisso Sky — Codice Contratto (04/08)',
       '{"brand":["sky"],"categoria":["Fisso"]}'::jsonb,
       '[{"nome":"Codice Contratto","tipo":"testo","nota":"","attivo":true,"conferma":false}]'::jsonb,
       55, true
WHERE NOT EXISTS (SELECT 1 FROM public.catalog_campi_regole
                  WHERE etichetta = 'Fisso Sky — Codice Contratto (04/08)');

NOTIFY pgrst, 'reload schema';
