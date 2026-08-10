-- ALLEGATO CONTRATTO AMMINISTRABILE (MOD-31, Luca 10/08): lo step Allegati di
-- Registra Vendita chiede il contratto secondo una regola del CATALOGO, non
-- piu' hardcoded. Colonna a 3 stati su OGNI livello (brand → categoria →
-- prodotto → offerta, il piu' specifico vince; NULL = eredita dal livello
-- sopra; default finale = obbligatorio):
--   'obbligatorio' — senza contratto la vendita non si salva
--   'facoltativo'  — casella presente, mai bloccante
--   'assente'      — nessuna casella (il contratto non esiste)
-- Documento d'identita' resta sempre obbligatorio, "altro" sempre facoltativo.

ALTER TABLE public.catalog_brands    ADD COLUMN IF NOT EXISTS contratto_richiesto text CHECK (contratto_richiesto IN ('obbligatorio','facoltativo','assente'));
ALTER TABLE public.catalog_categorie ADD COLUMN IF NOT EXISTS contratto_richiesto text CHECK (contratto_richiesto IN ('obbligatorio','facoltativo','assente'));
ALTER TABLE public.catalog_prodotti  ADD COLUMN IF NOT EXISTS contratto_richiesto text CHECK (contratto_richiesto IN ('obbligatorio','facoltativo','assente'));
ALTER TABLE public.catalog_offerte   ADD COLUMN IF NOT EXISTS contratto_richiesto text CHECK (contratto_richiesto IN ('obbligatorio','facoltativo','assente'));

-- SEED: fotografa le regole gia' decise (idempotente, non tocca scelte fatte)
UPDATE public.catalog_brands SET contratto_richiesto = 'assente'
  WHERE id = 'iliad' AND contratto_richiesto IS NULL;          -- Iliad: il contratto non esiste (Luca 06/08)
UPDATE public.catalog_brands SET contratto_richiesto = 'facoltativo'
  WHERE id = 'sky' AND contratto_richiesto IS NULL;            -- Sky non rilascia contratti (Luca 04/08)
UPDATE public.catalog_categorie SET contratto_richiesto = 'assente'
  WHERE lower(nome) LIKE '%assicura%' AND contratto_richiesto IS NULL; -- assicurazioni senza contratto (Luca 10/08)

NOTIFY pgrst, 'reload schema';
