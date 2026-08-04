-- Mig. 177 — Fulmine ⚡ reattivo (Luca 04/08): admin_tasks e richieste_disdette
-- entrano nella publication realtime, così il badge si aggiorna all'istante
-- quando una task viene completata o una disdetta cambia stato (prima solo
-- polling a 60s: il pallino restava acceso per minuti). Idempotente.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                   WHERE pubname = 'supabase_realtime' AND tablename = 'admin_tasks') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_tasks;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                   WHERE pubname = 'supabase_realtime' AND tablename = 'richieste_disdette') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.richieste_disdette;
    END IF;
END $$;
