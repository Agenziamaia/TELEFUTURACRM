-- Tracking PDA: store stato negozio, stato admin, and history (storia)
-- Run after 018_add_details_jsonb.sql

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS stato_negozio TEXT DEFAULT 'nuovo',
  ADD COLUMN IF NOT EXISTS stato_admin TEXT DEFAULT 'da_verificare',
  ADD COLUMN IF NOT EXISTS storia JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.contracts.stato_negozio IS 'Store-side status (nuovo, contattare_cliente, in_corso, attivato, etc.)';
COMMENT ON COLUMN public.contracts.stato_admin IS 'Admin outcome (da_verificare, in_lavorazione, non_conforme, confermato, pagato, stornato)';
COMMENT ON COLUMN public.contracts.storia IS 'Array of events: { data, tipo, testo, utente, ruolo }';
