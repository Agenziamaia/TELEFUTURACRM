-- 084: richieste di ACCESSO AI DATI CLIENTE dal reparto Outbound.
-- Gli agenti vedono per intero solo i clienti che hanno inserito loro; degli
-- altri vedono solo nome/ragione sociale. Per il resto dei dati chiedono
-- l'autorizzazione all'amministrazione, che approva o rifiuta dalla pagina Clienti.

CREATE TABLE IF NOT EXISTS public.client_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  requested_by_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_by TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_car_requester ON public.client_access_requests(requested_by, status);

ALTER TABLE public.client_access_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon client_access_requests" ON public.client_access_requests;
CREATE POLICY "Allow anon client_access_requests" ON public.client_access_requests FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
