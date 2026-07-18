-- 036: ripartizione costi condivisi = % unica per negozio sul TOTALE; + Altri Costi (solo admin)

-- % del totale costi condivisi di cui il negozio si fa carico
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS shared_percent NUMERIC(5,2) DEFAULT 0;

-- Non serve più la ripartizione per singola voce
DROP TABLE IF EXISTS public.store_shared_allocations;

-- Altri costi: solo admin, NON ripartiti, NON visibili ai negozi
CREATE TABLE IF NOT EXISTS public.other_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  amount NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.other_costs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon other_costs" ON public.other_costs;
CREATE POLICY "Allow anon other_costs" ON public.other_costs FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
