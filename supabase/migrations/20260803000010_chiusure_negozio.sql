-- 146: CHIUSURE STRAORDINARIE dei punti vendita (03/08). Es. chiusura
-- estiva: dal giorno X al giorno Y il negozio e' chiuso — si settano dal
-- pannello Amministrazione → Orari & Chiusure e la sezione Turni le mostra.
CREATE TABLE IF NOT EXISTS public.chiusure_negozio (
  id BIGSERIAL PRIMARY KEY,
  store TEXT NOT NULL,
  dal DATE NOT NULL,
  al DATE NOT NULL,
  motivo TEXT NOT NULL DEFAULT '',
  creato_da TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.chiusure_negozio ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon chiusure_negozio" ON public.chiusure_negozio;
CREATE POLICY "Allow anon chiusure_negozio" ON public.chiusure_negozio FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
