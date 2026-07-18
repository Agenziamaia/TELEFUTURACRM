-- 046: sistema costi MENSILE — ogni mese è una "corsa" indipendente
-- month = primo giorno del mese. Le righe esistenti diventano il mese corrente (luglio 2026).
ALTER TABLE public.store_cost_items ADD COLUMN IF NOT EXISTS month DATE NOT NULL DEFAULT date_trunc('month', now())::date;
ALTER TABLE public.shared_costs     ADD COLUMN IF NOT EXISTS month DATE NOT NULL DEFAULT date_trunc('month', now())::date;
ALTER TABLE public.other_costs      ADD COLUMN IF NOT EXISTS month DATE NOT NULL DEFAULT date_trunc('month', now())::date;
CREATE INDEX IF NOT EXISTS idx_store_cost_items_month ON public.store_cost_items(month);
CREATE INDEX IF NOT EXISTS idx_shared_costs_month ON public.shared_costs(month);
CREATE INDEX IF NOT EXISTS idx_other_costs_month ON public.other_costs(month);

-- registro dei mesi inizializzati
CREATE TABLE IF NOT EXISTS public.cost_months (
  month DATE PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now()
);
INSERT INTO public.cost_months (month)
SELECT date_trunc('month', now())::date
WHERE NOT EXISTS (SELECT 1 FROM public.cost_months WHERE month = date_trunc('month', now())::date);

-- snapshot dei costi delle persone per i mesi chiusi (congelato all'inizializzazione del mese successivo)
CREATE TABLE IF NOT EXISTS public.user_month_costs (
  month DATE NOT NULL,
  user_id UUID NOT NULL,
  full_name TEXT,
  role TEXT,
  store_names TEXT[] DEFAULT '{}',
  company_cost NUMERIC(12,2),
  visible_cost NUMERIC(12,2),
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (month, user_id)
);

ALTER TABLE public.cost_months ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon cost_months" ON public.cost_months;
CREATE POLICY "Allow anon cost_months" ON public.cost_months FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.user_month_costs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon user_month_costs" ON public.user_month_costs;
CREATE POLICY "Allow anon user_month_costs" ON public.user_month_costs FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
