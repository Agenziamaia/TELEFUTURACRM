-- 086: PERMESSI DI VISIBILITÀ per ruolo (pagina Amministrazione → Permessi).
-- Una riga = override esplicito (concessione O revoca) di una voce di menù per
-- un ruolo; perm_key = href della voce in src/lib/nav.ts. Nessuna riga = vale
-- il default di codice (la pagina Permessi mostra comunque tutta la matrice).
-- admin/dev ignorano la tabella: vedono sempre tutto.

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role TEXT NOT NULL,
  perm_key TEXT NOT NULL,
  allowed BOOLEAN NOT NULL,
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (role, perm_key)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon role_permissions" ON public.role_permissions;
CREATE POLICY "Allow anon role_permissions" ON public.role_permissions FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
