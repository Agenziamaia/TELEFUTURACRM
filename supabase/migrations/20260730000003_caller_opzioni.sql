-- 105: OPZIONI DEL CALL CENTER amministrabili (Luca 30/07). Stati/esiti,
-- provenienze, tipologie e obiettivi della sezione Caller vivono a DB e si
-- gestiscono da Amministrazione -> Call Center. Il seed replica le liste
-- storiche in codice SENZA gli stati "1°/2°/3° DTS" (eliminati su richiesta;
-- restano appuntamenti e richiami). Tabella vuota = default di codice.
CREATE TABLE IF NOT EXISTS public.caller_opzioni (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria TEXT NOT NULL,   -- stato | provenienza | tipologia | obiettivo
  voce TEXT NOT NULL,
  ordine INT NOT NULL DEFAULT 0,
  attiva BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (categoria, voce)
);
ALTER TABLE public.caller_opzioni ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon caller_opzioni" ON public.caller_opzioni;
CREATE POLICY "Allow anon caller_opzioni" ON public.caller_opzioni FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.caller_opzioni (categoria, voce, ordine) VALUES
  ('stato','Nuovo',10),
  ('stato','Cold NR1',20),('stato','Cold NR2',30),('stato','Cold NR3',40),
  ('stato','Hot NR1',50),('stato','Hot NR2',60),('stato','Hot NR3',70),
  ('stato','1° Appuntamento',80),('stato','2° Appuntamento',90),('stato','3° Appuntamento',100),
  ('stato','Da richiamare',110),('stato','Appuntamento telefonico',120),
  ('stato','Non interessato',130),('stato','Andato Non Interessato',140),('stato','Non andato',150),
  ('stato','Archiviato',160),('stato','Non ricontattare',170),
  ('provenienza','Interno',10),('provenienza','Esterno',20),('provenienza','Acquistato',30),('provenienza','Marketing',40),('provenienza','Segnalazione',50),
  ('tipologia','DTS',10),('tipologia','Outbound',20),('tipologia','Teleselling',30),
  ('obiettivo','Energia',10),('obiettivo','Sky',20),('obiettivo','CB',30),('obiettivo','Fisso',40),('obiettivo','Mobile',50),('obiettivo','Appuntamento',60)
ON CONFLICT (categoria, voce) DO NOTHING;

NOTIFY pgrst, 'reload schema';
