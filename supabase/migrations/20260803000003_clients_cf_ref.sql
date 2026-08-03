-- 139: CODICE FISCALE del REFERENTE per i clienti business (03/08). Oltre a
-- nome e cognome del referente si registra il suo CF: obbligatorio quando si
-- compila l'anagrafica in Registra Vendita e in Invio PDA; facoltativo nel
-- Caller (il caller potrebbe non averlo al telefono).
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS cf_ref TEXT;

NOTIFY pgrst, 'reload schema';
