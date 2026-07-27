-- 093: colonne ADDITIVE su contracts per le vendite del nuovo flusso a 6 livelli.
-- brand/prodotto/categoria legacy NON si toccano (regola: mai riscrivere lo storico).
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS tipo_cliente TEXT;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS offerta TEXT;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS opzioni JSONB;
NOTIFY pgrst, 'reload schema';
