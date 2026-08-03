-- Mig. 153 — REFERENTE BUSINESS sugli appuntamenti (Luca 03/08/2026): il
-- calendario chiede per il business gli stessi dati dell'anagrafica clienti
-- (nome e cognome referente obbligatori, CF referente facoltativo) e li
-- salva sull'appuntamento.
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS referente_nome TEXT;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS referente_cognome TEXT;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS referente_cf TEXT;
NOTIFY pgrst, 'reload schema';
