-- REGISTRA VENDITA — WindTre Fisso (Luca 08/08)
--
-- Tre regole per-offerta (stessa meccanica del pannello Catalogo → "Personalizza
-- per questa offerta": condizione "offerta" ESATTA + ordine negativo, così
-- prenotano il nome campo PRIMA delle regole generali — vedi lib/campiRegole).
--
--  MOD-16  "Voce Casa" (prodotto Fisso): con la vendita si consegna il telefono
--          FWA → serve registrarne l'IMEI. Aggiunge il campo "IMEI" (15 cifre).
--          NB: Voce Casa NON è in categoria "Telefono a Rate", quindi il telefono
--          NON viene conteggiato come rata (nessun "Importo Rata"/Tipo TNP=Rata):
--          resta solo il dato IMEI. Lo scarico magazzino + note di credito è un
--          altro cantiere (feature nuova, non ancora definita).
--
--  MOD-18  "Super Internet Casa Outdoor 5G" e "…Outdoor 5G Conv" (prodotto FWA):
--          NON devono chiedere l'ICCID. Le offerte FWA ereditano "Seriale SIM
--          (ICCID)" dalla regola generale "Fisso — FWA" (id 16c3b3d6, ordine 70);
--          una regola per-offerta con lo STESSO nome campo ma attivo=false e
--          ordine minore lo NASCONDE solo su queste due offerte (le Indoor
--          continuano a chiederlo). Nome campo identico all'originale, altrimenti
--          non "prende il posto" e l'ICCID ricomparirebbe.
--
-- Idempotente: ogni INSERT è protetto da NOT EXISTS sull'etichetta. L'ordine è
-- (min corrente − 1) come fa il pannello, ricalcolato ad ogni riga → sempre sotto
-- tutte le altre. Regola d'oro: i campi storici delle vendite già fatte NON si
-- toccano (nascondere ≠ cancellare).

-- MOD-16 — Voce Casa: abilita IMEI (telefono FWA consegnato)
INSERT INTO public.catalog_campi_regole (etichetta, condizioni, campi, ordine, attivo)
SELECT
  '🎯 Offerta: Voce Casa — Fisso (WindTre) · IMEI telefono FWA (08/08)',
  '{"brand":["windtre"],"categoria":["Fisso"],"prodotto":["Fisso"],"offerta":["Voce Casa"]}'::jsonb,
  '[{"nome":"IMEI","tipo":"testo","nota":"15 cifre — telefono FWA consegnato","conferma":false,"attivo":true}]'::jsonb,
  LEAST(0, (SELECT MIN(ordine) FROM public.catalog_campi_regole)) - 1,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.catalog_campi_regole
  WHERE etichetta = '🎯 Offerta: Voce Casa — Fisso (WindTre) · IMEI telefono FWA (08/08)'
);

-- MOD-18 — Super Internet Casa Outdoor 5G: nascondi ICCID
INSERT INTO public.catalog_campi_regole (etichetta, condizioni, campi, ordine, attivo)
SELECT
  '🎯 Offerta: Super Internet Casa Outdoor 5G — FWA (WindTre) · no ICCID (08/08)',
  '{"brand":["windtre"],"categoria":["Fisso"],"prodotto":["FWA"],"offerta":["Super Internet Casa Outdoor 5G"]}'::jsonb,
  '[{"nome":"Seriale SIM (ICCID)","tipo":"testo","nota":"","conferma":false,"attivo":false}]'::jsonb,
  LEAST(0, (SELECT MIN(ordine) FROM public.catalog_campi_regole)) - 1,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.catalog_campi_regole
  WHERE etichetta = '🎯 Offerta: Super Internet Casa Outdoor 5G — FWA (WindTre) · no ICCID (08/08)'
);

-- MOD-18 — Super Internet Casa Outdoor 5G Conv: nascondi ICCID
INSERT INTO public.catalog_campi_regole (etichetta, condizioni, campi, ordine, attivo)
SELECT
  '🎯 Offerta: Super Internet Casa Outdoor 5G Conv — FWA (WindTre) · no ICCID (08/08)',
  '{"brand":["windtre"],"categoria":["Fisso"],"prodotto":["FWA"],"offerta":["Super Internet Casa Outdoor 5G Conv"]}'::jsonb,
  '[{"nome":"Seriale SIM (ICCID)","tipo":"testo","nota":"","conferma":false,"attivo":false}]'::jsonb,
  LEAST(0, (SELECT MIN(ordine) FROM public.catalog_campi_regole)) - 1,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.catalog_campi_regole
  WHERE etichetta = '🎯 Offerta: Super Internet Casa Outdoor 5G Conv — FWA (WindTre) · no ICCID (08/08)'
);

NOTIFY pgrst, 'reload schema';
