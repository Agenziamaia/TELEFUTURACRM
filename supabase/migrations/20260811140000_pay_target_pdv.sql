-- MOTORE AZIENDA W3 (ok Luca 11/08 "vai procedi, ti confermo tutto"):
-- ① pay_target_pdv = il foglio target MENSILE di Wind3, una riga per PDV
--    (COD_GARA) con cluster e SOGLIE personalizzate per punto vendita —
--    si importa ogni mese con scripts/import_target_w3.js;
-- ② pay_righe.moltiplicatore = la riga non paga € fissi ma un MOLTIPLICATORE
--    del canone mensile dell'offerta (catalog_offerte.canone_mensile) —
--    è il modello W3: pay = canone × moltiplicatore della soglia.
CREATE TABLE IF NOT EXISTS public.pay_target_pdv (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month DATE NOT NULL CHECK (month = date_trunc('month', month)::date),
  brand TEXT NOT NULL DEFAULT 'windtre',
  cod_gara TEXT NOT NULL,
  negozio TEXT,
  ragione_sociale TEXT,
  peso_mobile NUMERIC(5,2), peso_biz NUMERIC(5,2), peso_fix NUMERIC(5,2),
  cluster_mobile TEXT, soglie_mobile NUMERIC(10,2)[],
  cluster_piva TEXT, soglie_piva NUMERIC(10,2)[],
  cluster_fisso TEXT, soglie_fisso NUMERIC(10,2)[],
  extra JSONB,
  UNIQUE (month, brand, cod_gara)
);
ALTER TABLE public.pay_righe ADD COLUMN IF NOT EXISTS moltiplicatore BOOLEAN NOT NULL DEFAULT false;
