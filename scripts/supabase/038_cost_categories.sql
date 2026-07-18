-- 038: categorie per costi condivisi e costi negozio (Risorse, Affitti, ...)
CREATE TABLE IF NOT EXISTS public.cost_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL,          -- 'shared' | 'store'
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cost_categories_scope ON public.cost_categories(scope);

ALTER TABLE public.shared_costs      ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.cost_categories(id) ON DELETE SET NULL;
ALTER TABLE public.store_cost_items  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.cost_categories(id) ON DELETE SET NULL;

ALTER TABLE public.cost_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon cost_categories" ON public.cost_categories;
CREATE POLICY "Allow anon cost_categories" ON public.cost_categories FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
