-- 035: separa Ufficio Commerciale (call center + back office) da Ufficio amministrativo

-- 1) Rinomina l'attuale "Ufficio" -> "Ufficio Commerciale"
UPDATE public.stores      SET name       = 'Ufficio Commerciale' WHERE name       = 'Ufficio';
UPDATE public.user_stores SET store_name = 'Ufficio Commerciale' WHERE store_name = 'Ufficio';
UPDATE public.app_users   SET primary_store = 'Ufficio Commerciale' WHERE primary_store = 'Ufficio';

-- 2) Nuova sede "Ufficio" per gli amministrativi
INSERT INTO public.stores (name, company) VALUES ('Ufficio','Telefutura') ON CONFLICT (name) DO NOTHING;

-- 3) Sposta gli amministrativi (grado amministrazione) nella sede "Ufficio"
DELETE FROM public.user_stores us USING public.app_users u
  WHERE us.user_id = u.id AND u.role = 'amministrativo' AND u.grade = 'amministrazione';
INSERT INTO public.user_stores (user_id, store_name)
  SELECT id, 'Ufficio' FROM public.app_users WHERE role = 'amministrativo' AND grade = 'amministrazione'
  ON CONFLICT DO NOTHING;
UPDATE public.app_users SET primary_store = 'Ufficio' WHERE role = 'amministrativo' AND grade = 'amministrazione';

-- 4) L'ufficio amministrativo come costo condiviso (da ripartire fra i negozi)
INSERT INTO public.shared_costs (label, amount_azienda, amount_visibile)
SELECT 'Ufficio Amministrativo', 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.shared_costs WHERE label = 'Ufficio Amministrativo');

NOTIFY pgrst, 'reload schema';
