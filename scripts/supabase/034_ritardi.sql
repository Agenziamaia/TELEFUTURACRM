-- 034: ritardi collaboratori (solo staff di negozio; badge resta per il call center)
CREATE TABLE IF NOT EXISTS public.ritardi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_name TEXT NOT NULL,
  store TEXT DEFAULT '',
  date DATE NOT NULL,
  minutes INT,
  reason TEXT,
  reported_by TEXT,          -- chi ha segnalato (autodenuncia / store manager / direzione)
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ritardi_employee ON public.ritardi(employee_name);
CREATE INDEX IF NOT EXISTS idx_ritardi_store ON public.ritardi(store);
CREATE INDEX IF NOT EXISTS idx_ritardi_date ON public.ritardi(date DESC);

ALTER TABLE public.ritardi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon ritardi" ON public.ritardi;
CREATE POLICY "Allow anon ritardi" ON public.ritardi FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
