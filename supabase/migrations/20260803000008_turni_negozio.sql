-- 144: TURNI DI NEGOZIO (03/08). Chi sta in quale punto vendita, giorno per
-- giorno: orari di apertura/chiusura sui negozi (base di riferimento,
-- modificabili dal pannello Turni) e tabella dei turni con orario — anche
-- mezzi turni o coperture. La preselezione arriva dagli assegnati al negozio.
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS orario_apertura TIME;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS orario_chiusura TIME;
UPDATE public.stores SET orario_apertura = COALESCE(orario_apertura, '09:30'::time),
                         orario_chiusura = COALESCE(orario_chiusura, '19:30'::time);

CREATE TABLE IF NOT EXISTS public.turni_negozio (
  id BIGSERIAL PRIMARY KEY,
  store TEXT NOT NULL,
  data DATE NOT NULL,
  persona TEXT NOT NULL,
  inizio TIME NOT NULL,
  fine TIME NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'giornata',   -- giornata | mattina | pomeriggio | personalizzato
  creato_da TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (store, data, persona, inizio)
);
ALTER TABLE public.turni_negozio ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon turni_negozio" ON public.turni_negozio;
CREATE POLICY "Allow anon turni_negozio" ON public.turni_negozio FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
