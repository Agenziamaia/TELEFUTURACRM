-- 045: spese fisse standard per negozio (sempre presenti) + allegati negozio con nome
-- Voci fisse: Affitto, Assicurazione, Utenze, Allarme, TARI, Tassa insegna.
ALTER TABLE public.store_cost_items ADD COLUMN IF NOT EXISTS is_fixed BOOLEAN NOT NULL DEFAULT false;

INSERT INTO public.store_cost_items (store_id, label, amount_azienda, amount_visibile, is_fixed)
SELECT s.id, v.label, 0, 0, true
FROM public.stores s
CROSS JOIN (VALUES ('Affitto'), ('Assicurazione'), ('Utenze'), ('Allarme'), ('TARI'), ('Tassa insegna')) AS v(label)
WHERE NOT EXISTS (
  SELECT 1 FROM public.store_cost_items i
  WHERE i.store_id = s.id AND i.label = v.label AND i.is_fixed = true
);

CREATE TABLE IF NOT EXISTS public.store_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.store_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon store_attachments" ON public.store_attachments;
CREATE POLICY "Allow anon store_attachments" ON public.store_attachments FOR ALL USING (true) WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public, file_size_limit)
SELECT 'store-attachments', 'store-attachments', true, 20971520
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'store-attachments');
DROP POLICY IF EXISTS "Allow public select on store-attachments" ON storage.objects;
CREATE POLICY "Allow public select on store-attachments" ON storage.objects
  FOR SELECT USING (bucket_id = 'store-attachments');
DROP POLICY IF EXISTS "Allow anon insert on store-attachments" ON storage.objects;
CREATE POLICY "Allow anon insert on store-attachments" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'store-attachments');
DROP POLICY IF EXISTS "Allow anon delete on store-attachments" ON storage.objects;
CREATE POLICY "Allow anon delete on store-attachments" ON storage.objects
  FOR DELETE USING (bucket_id = 'store-attachments');

NOTIFY pgrst, 'reload schema';
