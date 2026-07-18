-- 047: visibilità negozi ≠ attribuzione costo
-- user_stores = su quali negozi CADE il costo della persona.
-- user_store_visibility = quali negozi la persona DEVE VEDERE (target, avanzamenti, problemi),
-- senza alcun impatto sui costi. Servirà anche ai permessi con l'auth reale.
CREATE TABLE IF NOT EXISTS public.user_store_visibility (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.app_users(id) ON DELETE CASCADE,
  store_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, store_name)
);
ALTER TABLE public.user_store_visibility ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon user_store_visibility" ON public.user_store_visibility;
CREATE POLICY "Allow anon user_store_visibility" ON public.user_store_visibility FOR ALL USING (true) WITH CHECK (true);
NOTIFY pgrst, 'reload schema';
