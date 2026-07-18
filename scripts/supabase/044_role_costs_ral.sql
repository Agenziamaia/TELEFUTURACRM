-- 044: regole di costo visibile per ruolo/grado (modificabili da UI) + RAL annua sull'utente
-- grade '' = ruolo senza gradi. unit: 'mese' (importo mensile) | 'ora' (€/h × ore sett. × 52 ÷ 12).
-- Precedenza: il costo impostato sulla singola persona (app_users.costo_gara) vince sulla regola.
CREATE TABLE IF NOT EXISTS public.role_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL,
  grade TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT 'mese',
  value NUMERIC(10,2),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (role, grade)
);

ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS ral_annua NUMERIC(12,2);

ALTER TABLE public.role_costs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon role_costs" ON public.role_costs;
CREATE POLICY "Allow anon role_costs" ON public.role_costs FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
