-- 043: allinea store_cost_items alle altre tabelle costi (user_id per voci-Risorsa)
-- La 039 aveva aggiunto user_id solo a shared_costs/other_costs: la select condivisa
-- di CategorizedCosts falliva (in silenzio) sulle voci dei negozi.
ALTER TABLE public.store_cost_items ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.app_users(id) ON DELETE SET NULL;
NOTIFY pgrst, 'reload schema';
