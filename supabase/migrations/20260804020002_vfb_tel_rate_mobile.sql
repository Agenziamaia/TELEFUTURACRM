-- Mig. 160 — VODAFONE BUSINESS: Telefono a Rate e Mobile Ric. Auto
-- (RV-03/RV-04, conferme Luca 04/08/2026). Tre regole che NASCONDONO campi
-- ereditati dalle generali (attivo=false: il nome si prenota prima, claim-
-- then-skip di lib/campiRegole). Ordini 15/25/35: strettamente minori delle
-- regole generali 20 (Mobile GA), 30 (Mobile MNP), 40 (Telefono a Rate)
-- dopo la rinumerazione della mig. 158.

-- RV-03: Telefono a Rate VF Business ("Tel. Rate", offerte Easy Rent/Rata):
-- l'IMEI non si chiede, il telefono va in spedizione (conferma Luca: e'
-- l'IMEI, il Numero di Cellulare resta). Restano Numero di Cellulare,
-- Modello Terminale e Cod.Ins.
INSERT INTO public.catalog_campi_regole (etichetta, condizioni, campi, ordine, attivo)
SELECT 'Telefono a Rate Vodafone Business — niente IMEI, telefono in spedizione (04/08)',
       '{"tipo":["Business"],"brand":["vodafone"],"categoria":["Telefono a Rate"]}'::jsonb,
       '[{"nome":"IMEI","tipo":"testo","nota":"","attivo":false,"conferma":false}]'::jsonb,
       35, true
WHERE NOT EXISTS (SELECT 1 FROM public.catalog_campi_regole
                  WHERE etichetta = 'Telefono a Rate Vodafone Business — niente IMEI, telefono in spedizione (04/08)');

-- RV-04 (a): Mobile Ric. Auto VF Business, prodotto Mobile MNP: via il
-- Numero Provvisorio; restano Numero Definitivo (il numero che si porta),
-- Operatore di Provenienza e Seriale SIM (ICCID).
INSERT INTO public.catalog_campi_regole (etichetta, condizioni, campi, ordine, attivo)
SELECT 'Mobile MNP Vodafone Business — niente Numero Provvisorio (04/08)',
       '{"tipo":["Business"],"brand":["vodafone"],"categoria":["Mobile Ric. Auto"],"prodotto":["Mobile MNP"]}'::jsonb,
       '[{"nome":"Numero Provvisorio","tipo":"testo","nota":"","attivo":false,"conferma":false}]'::jsonb,
       25, true
WHERE NOT EXISTS (SELECT 1 FROM public.catalog_campi_regole
                  WHERE etichetta = 'Mobile MNP Vodafone Business — niente Numero Provvisorio (04/08)');

-- RV-04 (b): Mobile Ric. Auto VF Business, prodotto Mobile GA: via il
-- Numero di Cellulare (il numero business viene assegnato dopo). CONFERMA
-- Luca: "rimangono solamente ICCID e codice inserimento".
INSERT INTO public.catalog_campi_regole (etichetta, condizioni, campi, ordine, attivo)
SELECT 'Mobile GA Vodafone Business — niente Numero di Cellulare (04/08)',
       '{"tipo":["Business"],"brand":["vodafone"],"categoria":["Mobile Ric. Auto"],"prodotto":["Mobile GA"]}'::jsonb,
       '[{"nome":"Numero di Cellulare","tipo":"testo","nota":"","attivo":false,"conferma":false}]'::jsonb,
       15, true
WHERE NOT EXISTS (SELECT 1 FROM public.catalog_campi_regole
                  WHERE etichetta = 'Mobile GA Vodafone Business — niente Numero di Cellulare (04/08)');

NOTIFY pgrst, 'reload schema';
