-- 028: Amministrazione utenti — aggiunge PEC e password (temporanea)
-- pec: indirizzo PEC del collaboratore.
-- password: password generata dall'admin (reset dalla scheda utente) da inviare all'utente.
--   NB: in chiaro per ora, come il resto del progetto in questa fase di setup.
--   Da migrare a hash quando si attiva l'autenticazione reale (Supabase Auth).

ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS pec TEXT;
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS password TEXT;

NOTIFY pgrst, 'reload schema';
