-- 088: PONTE Caller -> Calendario (conferma Luca 26/07). Una pratica del call
-- center portata in stato appuntamento crea/aggiorna la riga in appointments
-- (il negozio la vede in calendario); qui il collegamento per non duplicare:
-- al 2°/3° appuntamento si AGGIORNA lo stesso evento invece di crearne un altro.
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS appointment_id BIGINT;
NOTIFY pgrst, 'reload schema';
