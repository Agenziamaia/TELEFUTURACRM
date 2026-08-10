-- SEZIONE VERIFICHE (MOD-36, Luca 10/08): il registro degli update di sviluppo
-- e delle questioni in sospeso, esitabile dall'admin nel CRM (/verifiche,
-- bottone in header). Flusso:
--   tipo 'update'  → stato da_verificare → (Luca clicca) → verificata
--   tipo 'sospeso' → da_verificare (serve una risposta) → risposta_data
--                    (Luca ha scritto la risposta) → verificata (chiusa)
-- Claude aggiorna questa tabella A OGNI SESSIONE (nuovi update + sospesi) e
-- rilegge stati e risposte all'avvio.
CREATE TABLE IF NOT EXISTS public.dev_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL DEFAULT 'update' CHECK (tipo IN ('update','sospeso')),
  titolo text NOT NULL,
  dettaglio text,
  domanda text,
  link text,
  stato text NOT NULL DEFAULT 'da_verificare' CHECK (stato IN ('da_verificare','risposta_data','verificata')),
  risposta text,
  sessione text,
  creato_il timestamptz NOT NULL DEFAULT now(),
  verificato_il timestamptz,
  verificato_da text
);

ALTER TABLE public.dev_updates ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY dev_updates_all ON public.dev_updates FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
