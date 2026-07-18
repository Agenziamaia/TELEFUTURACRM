-- 042: regole di sblocco commissioning legate ai paletti (per gara)
-- Una regola = insieme di paletti (metric_ids; vuoto = TUTTI) che, se raggiunti, sbloccano percent% della gara.
-- Le % delle regole soddisfatte si SOMMANO, con tetto 100%.
CREATE TABLE IF NOT EXISTS public.gara_unlock_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gara_id UUID REFERENCES public.gare(id) ON DELETE CASCADE,
  name TEXT,
  metric_ids UUID[] NOT NULL DEFAULT '{}',
  percent NUMERIC(5,2) NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_unlock_rules_gara ON public.gara_unlock_rules(gara_id);

ALTER TABLE public.gara_unlock_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon gara_unlock_rules" ON public.gara_unlock_rules;
CREATE POLICY "Allow anon gara_unlock_rules" ON public.gara_unlock_rules FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
