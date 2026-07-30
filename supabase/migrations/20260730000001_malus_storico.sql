-- 103: STORICO MALUS (30/07). Il malus del Tracking PDA era solo un calcolo
-- al volo: appena il negozio aggiornava la pratica, il maturato spariva
-- (caso Magliana W3, finanziamento liquidato dopo il malus). Da qui in poi
-- ogni periodo di malus e' un EPISODIO archiviato: quando la pratica viene
-- sanata smette di maturare ma quanto generato resta.
-- Un episodio per (pratica, categoria, data inizio): data_fine NULL = sta
-- ancora maturando. Stato del ciclo di vita:
--   in_corso   = sta maturando adesso
--   attivo     = chiuso, non ancora scalato dai pagamenti gare
--   compensato = scalato (dal futuro commissioning o a mano dall'admin)
CREATE TABLE IF NOT EXISTS public.malus_storico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id TEXT NOT NULL,
  categoria TEXT NOT NULL,
  brand TEXT,
  negozio TEXT,
  venditore TEXT,
  nominativo TEXT,
  data_inizio DATE NOT NULL,
  data_fine DATE,
  giorni INT NOT NULL DEFAULT 1,
  malus_euro NUMERIC NOT NULL DEFAULT 0,
  importo NUMERIC NOT NULL DEFAULT 0,
  stato TEXT NOT NULL DEFAULT 'in_corso',
  compensato_il DATE,
  compensato_da TEXT,
  compensato_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (contract_id, categoria, data_inizio)
);
CREATE INDEX IF NOT EXISTS malus_storico_venditore_idx ON public.malus_storico (venditore);
CREATE INDEX IF NOT EXISTS malus_storico_aperti_idx ON public.malus_storico (contract_id, categoria) WHERE data_fine IS NULL;

ALTER TABLE public.malus_storico ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon malus_storico" ON public.malus_storico;
CREATE POLICY "Allow anon malus_storico" ON public.malus_storico FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
