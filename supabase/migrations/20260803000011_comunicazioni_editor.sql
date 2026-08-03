-- 147: COMUNICAZIONI con ALLEGATI e DIMENSIONE (03/08). Gli allegati si
-- aprono anche PRIMA di confermare (popup e bacheca); la size "grande" e'
-- per le comunicazioni importanti/incentivanti, col corpo decorato per tipo.
ALTER TABLE public.comunicazioni ADD COLUMN IF NOT EXISTS allegati JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.comunicazioni ADD COLUMN IF NOT EXISTS size TEXT NOT NULL DEFAULT 'normale';

NOTIFY pgrst, 'reload schema';
