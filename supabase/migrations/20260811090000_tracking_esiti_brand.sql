-- ESITI PER OPERATORE (Luca 10/08): il FISSO può avere esiti diversi a seconda
-- dell'operatore telefonico. brand NULL = lista generale della categoria;
-- brand valorizzato (minuscolo, es. 'windtre') = lista specifica che, se
-- esiste, VINCE sulla generale per le pratiche di quel brand.
ALTER TABLE public.tracking_esiti ADD COLUMN IF NOT EXISTS brand text;

-- il vincolo a 3 colonne tratterebbe (fisso, nuovo, negozio) generale e
-- brand-specifico come duplicati: si passa a un indice unico con COALESCE
ALTER TABLE public.tracking_esiti DROP CONSTRAINT IF EXISTS tracking_esiti_cat_chiave_lato_key;
CREATE UNIQUE INDEX IF NOT EXISTS tracking_esiti_cat_chiave_lato_brand_ux
  ON public.tracking_esiti (categoria, chiave, lato, COALESCE(brand, ''));
