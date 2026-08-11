-- DOMENICA PER NEGOZIO (Luca 11/08): finora la domenica era chiusa per tutti
-- per assunzione. Il flag dice se il punto vendita e' OPERATIVO di domenica:
-- per quei negozi la domenica conta come giorno lavorativo nel calendario
-- chiusure del Tracking (warning/malus). Si imposta da Amministrazione →
-- Orari & Chiusure.
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS domenica_aperta boolean NOT NULL DEFAULT false;
