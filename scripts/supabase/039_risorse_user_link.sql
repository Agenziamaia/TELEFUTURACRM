-- 039: Risorse = voci di costo collegate a un utente (prende il suo costo) o manuali
ALTER TABLE public.shared_costs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.app_users(id) ON DELETE SET NULL;
ALTER TABLE public.other_costs  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.app_users(id) ON DELETE SET NULL;
-- categoria "Risorse" nei costi condivisi
INSERT INTO public.cost_categories (scope, name)
SELECT 'shared','Risorse' WHERE NOT EXISTS (SELECT 1 FROM public.cost_categories WHERE scope='shared' AND name='Risorse');
NOTIFY pgrst, 'reload schema';
