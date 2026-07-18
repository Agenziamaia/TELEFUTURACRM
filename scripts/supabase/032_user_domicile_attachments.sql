-- 032: domicilio (flag + campo) + allegati utente (tabella + bucket storage)

-- Domicilio diverso dalla residenza
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS different_domicile BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS domicile TEXT;

-- Allegati utente (documento + nota, consultabili sempre)
CREATE TABLE IF NOT EXISTS public.user_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  note TEXT,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_attachments_user ON public.user_attachments(user_id);

ALTER TABLE public.user_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon user_attachments" ON public.user_attachments;
CREATE POLICY "Allow anon user_attachments" ON public.user_attachments FOR ALL USING (true) WITH CHECK (true);

-- Bucket storage per gli allegati utente
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('user-attachments', 'user-attachments', true, 26214400)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Allow public select on user-attachments" ON storage.objects;
CREATE POLICY "Allow public select on user-attachments" ON storage.objects
  FOR SELECT USING (bucket_id = 'user-attachments');
DROP POLICY IF EXISTS "Allow anon insert on user-attachments" ON storage.objects;
CREATE POLICY "Allow anon insert on user-attachments" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'user-attachments');
DROP POLICY IF EXISTS "Allow anon delete on user-attachments" ON storage.objects;
CREATE POLICY "Allow anon delete on user-attachments" ON storage.objects
  FOR DELETE USING (bucket_id = 'user-attachments');

NOTIFY pgrst, 'reload schema';
