-- Mig. 156 — INCARICHI PER RUOLO (Luca 03/08): oltre ai designati singoli si
-- designa un RUOLO intero. La risoluzione ruolo→persone avviene AL MOMENTO
-- dell'evento (lib/incarichi.designatiIncarico): un utente creato in futuro
-- con un ruolo designato entra nell'incarico automaticamente.
ALTER TABLE public.incarichi ADD COLUMN IF NOT EXISTS ruoli TEXT[] NOT NULL DEFAULT '{}';
NOTIFY pgrst, 'reload schema';
