-- SICUREZZA — cerotto Fase 1.1 (mig. 194, rischio ZERO), audit 08/08.
--
-- Chiude due esposizioni senza alcun uso legittimo dal browser (client anon):
--  1) TRUNCATE su TUTTE le tabelle public concesso ad anon/authenticated →
--     con la sola anon key (pubblica) si potevano SVUOTARE le tabelle. L'app
--     non fa MAI TRUNCATE (l'API REST di Supabase non lo espone): revoca sicura.
--  2) rls_auto_enable() eseguibile da anon/public → 0 riferimenti nel codice.
--
-- I runner (ruolo postgres via pooler) bypassano i grant: diagnostica e
-- migrazioni non sono impattate. Il resto del piano (vault, admin_set_password,
-- RLS restrittiva, auth server) richiede la service_role key e va a fasi.

revoke truncate on all tables in schema public from anon, authenticated;
revoke execute on function public.rls_auto_enable() from anon, public;

notify pgrst, 'reload schema';
