-- CHT-02 (04/08): modifica e cancellazione messaggi WhatsApp.
--   edited_at  = quando il testo e' stato modificato (dal CRM o dal telefono)
--   deleted_at = quando e' stato "eliminato per tutti" (la riga RESTA a DB,
--                la UI mostra il segnaposto "Messaggio eliminato")
--   body_prev  = testo ORIGINALE prima della prima modifica (audit: non viene
--                sovrascritto dalle modifiche successive)
-- Righe storiche: NULL = mai toccate, nessun cambio di significato.
ALTER TABLE public.wa_messages ADD COLUMN IF NOT EXISTS edited_at  timestamptz;
ALTER TABLE public.wa_messages ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.wa_messages ADD COLUMN IF NOT EXISTS body_prev  text;

NOTIFY pgrst, 'reload schema';
