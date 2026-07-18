-- 040: sistema Target — gare, metriche normalizzate, target/paletti, categoria negozio

CREATE TABLE IF NOT EXISTS public.gare (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Metriche normalizzate: match_categorie = valori grezzi salvati in contracts.categoria che compongono la metrica.
-- exclude_prodotti = pattern (ILIKE) da escludere dal conteggio (es. 'sostituzione').
CREATE TABLE IF NOT EXISTS public.target_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  match_categorie TEXT[] DEFAULT '{}',
  match_brands TEXT[] DEFAULT '{}',
  exclude_prodotti TEXT[] DEFAULT '{}',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gara_id UUID REFERENCES public.gare(id) ON DELETE CASCADE,
  metric_id UUID REFERENCES public.target_metrics(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL,           -- 'user' | 'store' | 'store_category'
  subject_ref TEXT NOT NULL,            -- user_id | store_id | nome categoria
  kind TEXT NOT NULL DEFAULT 'target',  -- 'target' | 'paletto'
  value NUMERIC(12,2),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (gara_id, metric_id, subject_type, subject_ref, kind)
);
CREATE INDEX IF NOT EXISTS idx_targets_gara ON public.targets(gara_id);
CREATE INDEX IF NOT EXISTS idx_targets_subject ON public.targets(subject_type, subject_ref);

ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS store_category TEXT;

ALTER TABLE public.gare ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.target_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon gare" ON public.gare;
CREATE POLICY "Allow anon gare" ON public.gare FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow anon target_metrics" ON public.target_metrics;
CREATE POLICY "Allow anon target_metrics" ON public.target_metrics FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow anon targets" ON public.targets;
CREATE POLICY "Allow anon targets" ON public.targets FOR ALL USING (true) WITH CHECK (true);

-- Seed metriche (CB conta nel Mobile; Sostituzione SIM esclusa)
INSERT INTO public.target_metrics (name, match_categorie, exclude_prodotti, sort_order)
SELECT * FROM (VALUES
  ('Mobile', ARRAY['MOBILE','Mobile','SKY MOBILE'], ARRAY['sostituzione'], 1),
  ('Fisso', ARRAY['FISSO','Fisso','SKY FIBRA'], ARRAY[]::text[], 2),
  ('Energia', ARRAY['LUCE E GAS','ENERGIA','S4 ENERGIA','BARTON ENERGY','Luce & Gas'], ARRAY[]::text[], 3),
  ('Sky TV', ARRAY['SKY TV','Abbonamenti SKY'], ARRAY[]::text[], 4),
  ('Multi-servizi', ARRAY['MULTI-SERVIZI','Multi-servizi'], ARRAY[]::text[], 5),
  ('Soluzioni Digitali', ARRAY['SOLUZIONI DIGITALI'], ARRAY[]::text[], 6),
  ('POS', ARRAY['POS'], ARRAY[]::text[], 7)
) AS v(name, match_categorie, exclude_prodotti, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.target_metrics);

INSERT INTO public.gare (name, active)
SELECT 'Gara corrente', true WHERE NOT EXISTS (SELECT 1 FROM public.gare);

-- Categoria negozio pre-assegnata ai divisi
UPDATE public.stores SET store_category = 'Fr W3 + Multi Brand' WHERE name IN ('Magliana W3','Magliana Multi','Collatina W3','Collatina Multi');
UPDATE public.stores SET store_category = 'VS + Multibrand' WHERE name IN ('Acilia VS','Acilia Multi');

NOTIFY pgrst, 'reload schema';
