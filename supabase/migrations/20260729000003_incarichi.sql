-- 100: INCARICHI — funzioni operative assegnabili a persone specifiche
-- (Luca 29/07). Primo incarico: la GESTIONE FERIE. Pensato per la rivendita
-- del CRM: il cliente decide chi è designato e se, oltre al pallino sulla
-- sezione, deve arrivare anche il task nel fulmine ⚡ (e a chi).
CREATE TABLE IF NOT EXISTS public.incarichi (
  chiave TEXT PRIMARY KEY,
  titolo TEXT NOT NULL,
  descrizione TEXT NOT NULL DEFAULT '',
  assegnatari UUID[] NOT NULL DEFAULT '{}',
  fulmine BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.incarichi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon incarichi" ON public.incarichi;
CREATE POLICY "Allow anon incarichi" ON public.incarichi FOR ALL USING (true) WITH CHECK (true);
INSERT INTO public.incarichi (chiave, titolo, descrizione) VALUES
  ('ferie', 'Gestione richieste ferie', 'I designati vedono il pallino sulla sezione Ferie a ogni nuova richiesta; con il fulmine attivo ricevono anche il task ⚡.')
ON CONFLICT (chiave) DO NOTHING;

-- i task del fulmine possono essere indirizzati a UNA persona: NULL = come
-- oggi (visibili a tutto il pack direzionale)
ALTER TABLE public.admin_tasks ADD COLUMN IF NOT EXISTS target_user_id UUID;
NOTIFY pgrst, 'reload schema';
