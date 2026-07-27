-- 099: DATA DI NASCITA su TUTTE le anagrafiche (Luca 29/07).
-- Mai richiesta in creazione: si AUTOCOMPILA dal codice fiscale quando viene
-- archiviato (parser in src/lib/cf.ts, omocodia inclusa). Per i dipendenti
-- nasce anche la colonna del codice fiscale (prima non esisteva).
ALTER TABLE public.clients   ADD COLUMN IF NOT EXISTS data_nascita DATE;
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS codice_fiscale TEXT;
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS data_nascita DATE;
NOTIFY pgrst, 'reload schema';
