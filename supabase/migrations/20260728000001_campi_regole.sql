-- 094: STRATO DATI amministrabile — le regole dei CAMPI che il Registra
-- Vendita chiede per ogni combinazione (brand/tipo/categoria/prodotto/
-- offerta/opzioni) escono dal codice ed entrano a DB, gestibili da
-- Amministrazione -> Catalogo -> Campi. Regola d'oro (Luca 28/07): MAI
-- eliminare un campo usato in passato — si NASCONDE (attivo=false) e i
-- dati storici nei dettagli restano intatti.
-- condizioni: jsonb con SOLO le chiavi presenti (brand[], tipo[],
-- categoria[], prodotto[], offertaContiene[], offertaNon[], opzioni[]).
-- campi: jsonb [{nome, tipo: testo|numero|data|scelta, nota, conferma, attivo}].
CREATE TABLE IF NOT EXISTS public.catalog_campi_regole (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  etichetta TEXT NOT NULL DEFAULT '',
  condizioni JSONB NOT NULL DEFAULT '{}'::jsonb,
  campi JSONB NOT NULL DEFAULT '[]'::jsonb,
  ordine INT NOT NULL DEFAULT 0,
  attivo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.catalog_campi_regole ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon catalog_campi_regole" ON public.catalog_campi_regole;
CREATE POLICY "Allow anon catalog_campi_regole" ON public.catalog_campi_regole FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.catalog_campi_regole (id, etichetta, condizioni, campi, ordine) VALUES
  ('32983a53-f8d4-4869-88b4-95168ba8aee1', 'Tutte le vendite', '{}'::jsonb, '[{"nome":"Codice Inserimento","tipo":"testo","nota":"","conferma":false,"attivo":true}]'::jsonb, 0),
  ('02b944a7-cbc5-4483-ba5d-11a066ccee4d', 'brand windtre — Mobile Wallet · Mobile Ric. Auto · Telefono a Rate · Fisso · Energia · Multi-Servizi', '{"brand":["windtre"],"categoria":["Mobile Wallet","Mobile Ric. Auto","Telefono a Rate","Fisso","Energia","Multi-Servizi"]}'::jsonb, '[{"nome":"Codice Contratto","tipo":"testo","nota":"","conferma":false,"attivo":true}]'::jsonb, 1),
  ('c539a265-dfd3-44c0-be85-2d2ca5e5b07e', 'Mobile Wallet · Mobile Ric. Auto — Mobile GA', '{"categoria":["Mobile Wallet","Mobile Ric. Auto"],"prodotto":["Mobile GA"]}'::jsonb, '[{"nome":"Numero di Cellulare","tipo":"testo","nota":"","conferma":false,"attivo":true},{"nome":"Seriale SIM (ICCID)","tipo":"testo","nota":"19 cifre","conferma":false,"attivo":true}]'::jsonb, 2),
  ('ee050442-e568-488e-95b3-21cb4e5b076c', 'Mobile Wallet · Mobile Ric. Auto — Mobile MNP', '{"categoria":["Mobile Wallet","Mobile Ric. Auto"],"prodotto":["Mobile MNP"]}'::jsonb, '[{"nome":"Numero Provvisorio","tipo":"testo","nota":"","conferma":false,"attivo":true},{"nome":"Numero Definitivo","tipo":"testo","nota":"il numero che si porta","conferma":false,"attivo":true},{"nome":"Operatore di Provenienza","tipo":"scelta","nota":"","conferma":false,"attivo":true},{"nome":"Seriale SIM (ICCID)","tipo":"testo","nota":"19 cifre","conferma":false,"attivo":true}]'::jsonb, 3),
  ('dac547e8-e383-4116-93bb-72f239bec63e', 'Telefono a Rate', '{"categoria":["Telefono a Rate"]}'::jsonb, '[{"nome":"Numero di Cellulare","tipo":"testo","nota":"","conferma":false,"attivo":true},{"nome":"IMEI","tipo":"testo","nota":"15 cifre","conferma":false,"attivo":true},{"nome":"Modello Terminale","tipo":"testo","nota":"","conferma":false,"attivo":true},{"nome":"Importo Rata","tipo":"numero","nota":"in euro","conferma":true,"attivo":true}]'::jsonb, 4),
  ('dd9d0993-7d0c-4fe2-9f5e-fed785ed84d5', 'Telefono a Rate — Finanziato · Finanziato CB', '{"categoria":["Telefono a Rate"],"prodotto":["Finanziato","Finanziato CB"]}'::jsonb, '[{"nome":"Codice Pratica Finanziamento","tipo":"testo","nota":"","conferma":false,"attivo":true}]'::jsonb, 5),
  ('60392bc9-36d2-4f9d-94cd-ccee152c8af8', 'Fisso', '{"categoria":["Fisso"]}'::jsonb, '[{"nome":"Numero Fisso Provvisorio","tipo":"testo","nota":"","conferma":false,"attivo":true},{"nome":"Numero Fisso Definitivo","tipo":"testo","nota":"","conferma":false,"attivo":true}]'::jsonb, 6),
  ('16c3b3d6-7a97-402e-8102-d73422457d04', 'Fisso — FWA', '{"categoria":["Fisso"],"prodotto":["FWA"]}'::jsonb, '[{"nome":"Seriale SIM (ICCID)","tipo":"testo","nota":"19 cifre, SIM del router","conferma":false,"attivo":true}]'::jsonb, 7),
  ('d7410f6e-de6b-40f8-a797-305f7d52b594', 'offerta contiene “Indoor”', '{"offertaContiene":["Indoor"]}'::jsonb, '[{"nome":"IMEI","tipo":"testo","nota":"15 cifre, dispositivo FWA","conferma":false,"attivo":true}]'::jsonb, 8),
  ('9887de9b-cf66-441d-ba15-fcdb0f05a330', 'offerta contiene “Conv/Con Super Fibra”', '{"offertaContiene":["Conv","Con Super Fibra"]}'::jsonb, '[{"nome":"Numero Fisso di Convergenza","tipo":"testo","nota":"","conferma":false,"attivo":true}]'::jsonb, 9),
  ('e55ecb5c-f147-459c-a7fc-f5824685c4b2', 'opzione GNP', '{"opzioni":["GNP"]}'::jsonb, '[{"nome":"Operatore GNP","tipo":"scelta","nota":"","conferma":false,"attivo":true},{"nome":"Numero Fisso da Portare","tipo":"testo","nota":"","conferma":false,"attivo":true}]'::jsonb, 10),
  ('a81cfa3c-d2d4-4cef-8351-8f0097ec0472', 'opzione Linea Aggiuntiva', '{"opzioni":["Linea Aggiuntiva"]}'::jsonb, '[{"nome":"N. Fisso Portabilità 2° Linea","tipo":"testo","nota":"","conferma":false,"attivo":true}]'::jsonb, 11),
  ('fd125407-57ce-46fb-a35e-d56a464744d1', 'Energia', '{"categoria":["Energia"]}'::jsonb, '[{"nome":"Operatore di Provenienza","tipo":"scelta","nota":"","conferma":false,"attivo":true}]'::jsonb, 12),
  ('2d69e47a-959d-4153-b07f-2b23dc2210bb', 'Energia — Luce', '{"categoria":["Energia"],"prodotto":["Luce"]}'::jsonb, '[{"nome":"POD","tipo":"testo","nota":"codice punto di prelievo","conferma":false,"attivo":true}]'::jsonb, 13),
  ('aabf87a1-c7d5-4085-8760-fdebf4b4f971', 'Energia — Gas', '{"categoria":["Energia"],"prodotto":["Gas"]}'::jsonb, '[{"nome":"PDR","tipo":"testo","nota":"14 cifre","conferma":false,"attivo":true}]'::jsonb, 14),
  ('f7f24896-3283-4730-8947-4039a313ba37', 'opzione RID', '{"opzioni":["RID"]}'::jsonb, '[{"nome":"IBAN","tipo":"testo","nota":"","conferma":false,"attivo":true}]'::jsonb, 15),
  ('eca56e89-34ed-461c-a415-cbf6c101355c', 'Sostituzione SIM', '{"categoria":["Sostituzione SIM"]}'::jsonb, '[{"nome":"Numero di Cellulare","tipo":"testo","nota":"","conferma":false,"attivo":true},{"nome":"ICCID Nuova SIM","tipo":"testo","nota":"19 cifre","conferma":false,"attivo":true},{"nome":"Codice Contratto","tipo":"testo","nota":"","conferma":false,"attivo":true}]'::jsonb, 16),
  ('93bdc065-98dd-4ed5-8d41-4ed1057cfd26', 'TV', '{"categoria":["TV"]}'::jsonb, '[{"nome":"Codice Contratto","tipo":"testo","nota":"","conferma":false,"attivo":true}]'::jsonb, 17),
  ('7fff97a7-3937-45fa-8010-3eff5244bb06', 'Customer Base', '{"categoria":["Customer Base"]}'::jsonb, '[{"nome":"Numero di Cellulare","tipo":"testo","nota":"","conferma":false,"attivo":true}]'::jsonb, 18),
  ('a90ad8fb-d507-4e75-ac8e-05f69b6c1818', 'Consumer — Customer Base — offerta NON CL0/CL1/CL2/CL3', '{"tipo":["Consumer"],"categoria":["Customer Base"],"offertaNon":["CL0","CL1","CL2","CL3"]}'::jsonb, '[{"nome":"Codice Contratto","tipo":"testo","nota":"","conferma":false,"attivo":true}]'::jsonb, 19),
  ('c570820a-7599-45d7-aed1-634d33de9b75', 'Business — Customer Base', '{"tipo":["Business"],"categoria":["Customer Base"]}'::jsonb, '[{"nome":"Codice Contratto","tipo":"testo","nota":"","conferma":false,"attivo":true}]'::jsonb, 20),
  ('4e5491d4-be01-4413-a439-d69996adbc92', 'opzione Reload Open', '{"opzioni":["Reload Open"]}'::jsonb, '[{"nome":"IMEI","tipo":"testo","nota":"15 cifre","conferma":false,"attivo":true}]'::jsonb, 21),
  ('6966d070-0a12-42e1-ba94-ba7dfa587245', 'Kasko Facile', '{"prodotto":["Kasko Facile"]}'::jsonb, '[{"nome":"Seriale Kasko","tipo":"testo","nota":"","conferma":false,"attivo":true},{"nome":"IMEI Dispositivo","tipo":"testo","nota":"15 cifre","conferma":false,"attivo":true},{"nome":"Modello Terminale","tipo":"testo","nota":"","conferma":false,"attivo":true},{"nome":"Numero di Cellulare","tipo":"testo","nota":"","conferma":false,"attivo":true}]'::jsonb, 22),
  ('e31b3c64-6ee2-4f31-849c-77243698c251', 'Verisure · Vodafone Care', '{"prodotto":["Verisure","Vodafone Care"]}'::jsonb, '[{"nome":"Numero di Telefono","tipo":"testo","nota":"","conferma":false,"attivo":true}]'::jsonb, 23),
  ('77d56e49-9cad-45c2-91bb-53194dcddee2', 'Telepass', '{"prodotto":["Telepass"]}'::jsonb, '[{"nome":"Seriale Telepass","tipo":"testo","nota":"","conferma":false,"attivo":true},{"nome":"Recapito","tipo":"testo","nota":"","conferma":false,"attivo":true}]'::jsonb, 24),
  ('3541bfff-e9bb-4e3c-b76c-6a0bb18f564c', 'opzione Twin', '{"opzioni":["Twin"]}'::jsonb, '[{"nome":"Seriale Telepass Twin","tipo":"testo","nota":"","conferma":true,"attivo":true}]'::jsonb, 25),
  ('5fd54549-e7da-4c4a-aa3d-d970eb9f8f44', 'POS', '{"categoria":["POS"]}'::jsonb, '[{"nome":"Matricola POS","tipo":"testo","nota":"","conferma":true,"attivo":true},{"nome":"IBAN di Accredito","tipo":"testo","nota":"","conferma":true,"attivo":true}]'::jsonb, 26),
  ('d9934b8b-290c-4a96-b13f-9c27071f891f', 'Assicurazioni', '{"prodotto":["Assicurazioni"]}'::jsonb, '[{"nome":"Data Decorrenza","tipo":"data","nota":"","conferma":true,"attivo":true}]'::jsonb, 27)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
