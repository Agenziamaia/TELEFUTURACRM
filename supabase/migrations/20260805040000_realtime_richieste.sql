-- Mig. 180 — Fulmine ⚡ davvero live (Luca 05/08): i contatori sintetici del
-- fulmine leggono ANCHE contract_change_requests (modifiche contratto da
-- approvare) e client_access_requests (accessi ai dati cliente), ma quelle
-- tabelle non erano nella publication realtime: il pallino si muoveva solo
-- col polling a 60s. Ora entrano in publication (e UrgentTasks le ascolta).
-- Idempotente.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                   WHERE pubname = 'supabase_realtime' AND tablename = 'contract_change_requests') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.contract_change_requests;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                   WHERE pubname = 'supabase_realtime' AND tablename = 'client_access_requests') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.client_access_requests;
    END IF;
END $$;
