-- 033: elimina Telefonico, rinomina negozi (Multi/W3), modello costi negozi + costi condivisi

-- 1) Elimina la sede "Telefonico" (sostituita da "Ufficio")
DELETE FROM public.user_stores WHERE store_name = 'Telefonico';
DELETE FROM public.stores WHERE name = 'Telefonico';

-- 2) Rinomina: " Multi-brand" -> " Multi", " Wind3" -> " W3" (stores + associazioni)
UPDATE public.stores      SET name       = replace(name,' Multi-brand',' Multi') WHERE name       LIKE '% Multi-brand';
UPDATE public.stores      SET name       = replace(name,' Wind3',' W3')          WHERE name       LIKE '% Wind3';
UPDATE public.user_stores SET store_name = replace(store_name,' Multi-brand',' Multi') WHERE store_name LIKE '% Multi-brand';
UPDATE public.user_stores SET store_name = replace(store_name,' Wind3',' W3')          WHERE store_name LIKE '% Wind3';
UPDATE public.app_users   SET primary_store = replace(primary_store,' Multi-brand',' Multi') WHERE primary_store LIKE '% Multi-brand';
UPDATE public.app_users   SET primary_store = replace(primary_store,' Wind3',' W3')          WHERE primary_store LIKE '% Wind3';

-- 3) Voci di costo per negozio (ogni voce ha importo Azienda e Visibile)
CREATE TABLE IF NOT EXISTS public.store_cost_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  amount_azienda NUMERIC(10,2) DEFAULT 0,
  amount_visibile NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_store_cost_items_store ON public.store_cost_items(store_id);

-- 4) Catalogo costi condivisi
CREATE TABLE IF NOT EXISTS public.shared_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  amount_azienda NUMERIC(10,2) DEFAULT 0,
  amount_visibile NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5) Ripartizione % dei costi condivisi per negozio
CREATE TABLE IF NOT EXISTS public.store_shared_allocations (
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  shared_cost_id UUID NOT NULL REFERENCES public.shared_costs(id) ON DELETE CASCADE,
  percent NUMERIC(5,2) DEFAULT 0,
  PRIMARY KEY (store_id, shared_cost_id)
);

ALTER TABLE public.store_cost_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_shared_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon store_cost_items" ON public.store_cost_items;
CREATE POLICY "Allow anon store_cost_items" ON public.store_cost_items FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow anon shared_costs" ON public.shared_costs;
CREATE POLICY "Allow anon shared_costs" ON public.shared_costs FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow anon store_shared_allocations" ON public.store_shared_allocations;
CREATE POLICY "Allow anon store_shared_allocations" ON public.store_shared_allocations FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
