-- 048: sezione GARE — soglie degli operatori e commissioning collegato, per brand e per mese
-- brand: w3 | vs (Vodafone Store) | vnd (Vodafone multi brand) | fastweb | sky | s4 | tim | dojo
-- payout_type: 'fisso' (€ una tantum al raggiungimento) | 'per_pezzo' (€ per ogni pezzo)
CREATE TABLE IF NOT EXISTS public.brand_soglie (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand TEXT NOT NULL,
  month DATE NOT NULL,
  name TEXT NOT NULL,
  threshold NUMERIC(12,2),
  payout NUMERIC(12,2),
  payout_type TEXT NOT NULL DEFAULT 'fisso',
  notes TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_brand_soglie_bm ON public.brand_soglie(brand, month);

ALTER TABLE public.brand_soglie ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon brand_soglie" ON public.brand_soglie;
CREATE POLICY "Allow anon brand_soglie" ON public.brand_soglie FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
