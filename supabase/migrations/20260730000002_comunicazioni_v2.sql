-- 104: COMUNICAZIONI v2 (Luca 30/07). Dalla pagina si potevano solo LEGGERE:
-- ora si creano, in due generi:
--   bacheca = notifica sulla campanella; si traccia CHI l'ha aperta (letture)
--   popup   = anche modale al centro sopra tutto (subito se loggato, al primo
--             login altrimenti) con pulsante CONFERMA; si traccia chi conferma
-- Destinatari per RUOLO (target_roles NULL = tutti). Chi puo' crearle e verso
-- quali ruoli si amministra da Permessi (righe cap:/comunicazioni:* in
-- role_permissions — nessuna migrazione dati: default in codice).
ALTER TABLE public.comunicazioni ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'bacheca';
ALTER TABLE public.comunicazioni ADD COLUMN IF NOT EXISTS target_roles TEXT[];
ALTER TABLE public.comunicazioni ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.comunicazioni ADD COLUMN IF NOT EXISTS created_by_name TEXT;

-- Ricevute: una riga per (comunicazione, utente) — quando ha letto e quando
-- ha confermato. Sostituisce il "letto" solo-localStorage per la parte server.
CREATE TABLE IF NOT EXISTS public.comunicazioni_ricevute (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comunicazione_id BIGINT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT,
  letto_il TIMESTAMPTZ,
  confermato_il TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (comunicazione_id, user_id)
);
CREATE INDEX IF NOT EXISTS comunicazioni_ricevute_com_idx ON public.comunicazioni_ricevute (comunicazione_id);
CREATE INDEX IF NOT EXISTS comunicazioni_ricevute_user_idx ON public.comunicazioni_ricevute (user_id);

ALTER TABLE public.comunicazioni_ricevute ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon comunicazioni_ricevute" ON public.comunicazioni_ricevute;
CREATE POLICY "Allow anon comunicazioni_ricevute" ON public.comunicazioni_ricevute FOR ALL USING (true) WITH CHECK (true);

-- Realtime sugli INSERT: il popup compare subito a chi e' loggato. Se la
-- publication non lo accetta resta comunque il ricontrollo periodico.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.comunicazioni;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
