-- 158: ORARIO SPEZZATO (04/08). Doppia fascia con pausa pranzo sui punti
-- vendita: orario_apertura/orario_chiusura restano gli ESTREMI della giornata,
-- la pausa e' la novita' — entrambe NULL = orario continuato (comportamento
-- identico a oggi, nessuna riga esistente cambia significato).
-- Fascia mattina = apertura → pausa_inizio; pomeriggio = pausa_fine → chiusura.
-- La validazione (apertura < pausa_inizio < pausa_fine < chiusura) sta nella
-- UI (Amministrazione → Orari & Chiusure): niente CHECK a DB per non bloccare
-- gli inserimenti parziali.
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS orario_pausa_inizio TIME;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS orario_pausa_fine TIME;

NOTIFY pgrst, 'reload schema';
