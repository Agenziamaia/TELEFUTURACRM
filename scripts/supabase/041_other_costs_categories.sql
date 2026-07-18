-- 041: Altri costi a categorie come i Costi condivisi (Risorse fissa + categorie libere)
-- Allinea other_costs allo schema di shared_costs; amount resta per compatibilità (deprecata)
ALTER TABLE public.other_costs ADD COLUMN IF NOT EXISTS amount_azienda NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.other_costs ADD COLUMN IF NOT EXISTS amount_visibile NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.other_costs ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.cost_categories(id) ON DELETE SET NULL;

UPDATE public.other_costs SET amount_azienda = COALESCE(amount, 0) WHERE amount_azienda IS NULL OR amount_azienda = 0;

-- categoria fissa "Risorse" per lo scope 'other'
INSERT INTO public.cost_categories (scope, name)
SELECT 'other', 'Risorse'
WHERE NOT EXISTS (SELECT 1 FROM public.cost_categories WHERE scope = 'other' AND name = 'Risorse');

-- le voci già collegate a un utente finiscono sotto Risorse
UPDATE public.other_costs
SET category_id = (SELECT id FROM public.cost_categories WHERE scope = 'other' AND name = 'Risorse')
WHERE user_id IS NOT NULL AND category_id IS NULL;

NOTIFY pgrst, 'reload schema';
