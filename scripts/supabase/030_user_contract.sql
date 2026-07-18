-- 030: dati contrattuali utente — tipo contratto, scadenza, costo azienda
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS contract_type TEXT;         -- Indeterminato/Determinato/Apprendistato/...
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS contract_end DATE;          -- scadenza (per determinato/apprendista)
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS company_cost NUMERIC(10,2); -- costo azienda

NOTIFY pgrst, 'reload schema';
