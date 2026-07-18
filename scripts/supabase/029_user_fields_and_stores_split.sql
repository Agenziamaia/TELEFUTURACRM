-- 029: campi extra utente (iban, residenza, società, stato, ore) + split negozi
-- status: 'attivo' | 'licenziato'. I licenziati restano a sistema (log/attività per sempre),
--   solo nascosti dalla lista di default.

ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS iban TEXT;
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS address TEXT;             -- residenza
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS company TEXT;             -- società di assunzione
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'attivo';
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS weekly_hours INT;         -- 20/24/30/36/40

CREATE INDEX IF NOT EXISTS idx_app_users_status ON public.app_users(status);

-- Split negozi (franchise / multi-brand come punti vendita separati)
DELETE FROM public.stores WHERE name IN ('Magliana', 'Acilia', 'Collatina');
INSERT INTO public.stores (name, company) VALUES
  ('Magliana Wind3', 'Telefutura'),
  ('Magliana Multi-brand', 'Telefutura'),
  ('Acilia VS', 'Telefutura'),
  ('Acilia Multi-brand', 'Telefutura'),
  ('Collatina Wind3', 'Telefutura'),
  ('Collatina Multi-brand', 'Telefutura')
ON CONFLICT (name) DO NOTHING;

NOTIFY pgrst, 'reload schema';
