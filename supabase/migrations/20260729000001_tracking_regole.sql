-- 098: REGOLE DEL TRACKING PDA amministrabili (Luca 29/07).
-- Una riga per categoria; per ciascuna delle TRE variabili le soglie in
-- giorni LAVORATIVI delle tre fasce (NULL = quella variabile non fa
-- scattare quella fascia) + il malus giornaliero in euro:
--   senza_* : pratica MAI aggiornata (giorni dall'inserimento)
--   succ_*  : ferma DOPO un aggiornamento (giorni dall'ultimo evento)
--   compl_* : NON completata (giorni dall'inserimento)
-- Il seed replica ESATTAMENTE le soglie storiche in codice; le regole
-- speciali per stato (P.IVA irreperibile, stati Sky, stati critici) restano
-- in codice e sono elencate come note fisse nella tabella delle regole.
CREATE TABLE IF NOT EXISTS public.tracking_regole (
  categoria TEXT PRIMARY KEY,
  senza_lavorare INT, senza_warning INT, senza_malus INT,
  succ_lavorare INT,  succ_warning INT,  succ_malus INT,
  compl_lavorare INT, compl_warning INT, compl_malus INT,
  malus_euro NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.tracking_regole ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon tracking_regole" ON public.tracking_regole;
CREATE POLICY "Allow anon tracking_regole" ON public.tracking_regole FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.tracking_regole (categoria, senza_lavorare, senza_warning, senza_malus, succ_lavorare, succ_warning, succ_malus, compl_lavorare, compl_warning, compl_malus, malus_euro) VALUES
  ('mnp',           2,  5,  6,   2,  5,  6,   NULL,  5, NULL,  5),
  ('fisso',         5, 10, 15,   5, 10, 15,   NULL, 20, NULL, 10),
  ('finanziamento', 2,  4,  6,   2,  4,  6,   NULL, NULL, NULL, 10),
  ('piva',          2,  4,  6,   2,  4,  6,   NULL, 10, NULL,  5),
  ('energia',       5, 10, 15,   5, 10, 15,   NULL, NULL, NULL, 10),
  ('sky',           2,  4,  4,   NULL, 10, 10, NULL, NULL, NULL, 5)
ON CONFLICT (categoria) DO NOTHING;
NOTIFY pgrst, 'reload schema';
