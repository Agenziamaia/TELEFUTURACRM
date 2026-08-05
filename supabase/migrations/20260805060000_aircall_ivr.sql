-- Mig. 183 — AIR-04 (Luca 05/08): il percorso della chiamata nel registro.
-- Il cliente chiama il numero unico e SCEGLIE il punto vendita nell'IVR; se il
-- negozio non risponde la chiamata cascata al call center. Finora la scelta
-- IVR non veniva salvata (evento call.ivr_option_selected non sottoscritto):
-- le perse del centralino e le risposte del CC restavano senza negozio.
--  - ivr_scelta: titolo dell'opzione IVR scelta dal cliente (grezzo);
--  - risposta_cc: true se ha risposto un operatore del call center — il
--    negozio vede la chiamata col badge "ha risposto il Call Center".
-- Idempotente.
ALTER TABLE public.call_events ADD COLUMN IF NOT EXISTS ivr_scelta text;
ALTER TABLE public.call_events ADD COLUMN IF NOT EXISTS risposta_cc boolean DEFAULT false;
