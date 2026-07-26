-- 090: LAVORAZIONE IN SERIE del caller (richiesta Luca 26/07).
-- Il caller lavora spesso liste omogenee: qui salva Brand, Obiettivo,
-- Provenienza e Tipologia una volta sola e accende l'interruttore. Finche' e'
-- ON, le pratiche generate dalle sue chiamate (ponte Aircall) e i suoi
-- inserimenti nascono gia' con le 4 voci; OFF = selezione manuale come prima.
-- A DB (non nel browser) cosi' vale su ogni dispositivo E lato server.
CREATE TABLE IF NOT EXISTS public.caller_presets (
  user_id UUID PRIMARY KEY REFERENCES public.app_users(id) ON DELETE CASCADE,
  attivo BOOLEAN NOT NULL DEFAULT false,
  brand TEXT DEFAULT '',
  obiettivo TEXT DEFAULT '',
  provenienza TEXT DEFAULT '',
  tipologia TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.caller_presets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon caller_presets" ON public.caller_presets;
CREATE POLICY "Allow anon caller_presets" ON public.caller_presets FOR ALL USING (true) WITH CHECK (true);
NOTIFY pgrst, 'reload schema';
