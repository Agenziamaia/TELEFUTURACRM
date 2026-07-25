-- 085: (a) ALLEGATI UTENTE per l'anagrafica (documenti, contratto di assunzione,
-- buste paga, altro) caricabili da admin/amministrativo/direzione generale;
-- (b) TASK URGENTI accanto alla campanella: cose DA FARE (es. "completa il nuovo
-- utente: costo, visibilita', brand"), distinte dalle Comunicazioni.

CREATE TABLE IF NOT EXISTS public.user_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'altro' CHECK (category IN ('documenti','contratto','buste_paga','altro')),
  file_url TEXT NOT NULL,
  file_name TEXT,
  uploaded_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_att ON public.user_attachments(user_id, category);

CREATE TABLE IF NOT EXISTS public.admin_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL DEFAULT 'generico',
  titolo TEXT NOT NULL,
  dettaglio TEXT,
  link TEXT,                              -- rotta interna da aprire (es. /amministrazione?sez=utenti)
  target_role TEXT NOT NULL DEFAULT 'admin',
  done BOOLEAN NOT NULL DEFAULT false,
  done_by TEXT,
  done_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_tasks_open ON public.admin_tasks(target_role, done);

ALTER TABLE public.user_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon user_attachments" ON public.user_attachments;
CREATE POLICY "Allow anon user_attachments" ON public.user_attachments FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.admin_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon admin_tasks" ON public.admin_tasks;
CREATE POLICY "Allow anon admin_tasks" ON public.admin_tasks FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
