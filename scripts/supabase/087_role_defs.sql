-- 087: RUOLI amministrabili da UI (Amministrazione → Utenti → Ruoli).
-- Una riga = un ruolo PERSONALIZZATO (is_custom=true) creato dall'admin, oppure
-- un OVERRIDE di un ruolo di sistema (stesso id, is_custom=false): etichetta,
-- area (pv|cc|ob|sede) e gradi diventano modificabili senza toccare il codice.
-- I ruoli di sistema non si eliminano (portano permessi/costi/gating); gli
-- override sì (si torna al codice). I custom si eliminano solo senza persone.

CREATE TABLE IF NOT EXISTS public.role_defs (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  area TEXT NOT NULL DEFAULT 'sede' CHECK (area IN ('pv','cc','ob','sede')),
  grades JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{id,label}]
  is_custom BOOLEAN NOT NULL DEFAULT true,
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.role_defs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon role_defs" ON public.role_defs;
CREATE POLICY "Allow anon role_defs" ON public.role_defs FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
