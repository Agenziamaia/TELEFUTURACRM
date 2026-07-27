-- 102: FERIE A MEZZA GIORNATA (Luca 29/07): richiedibile SOLO su un giorno
-- singolo, con fascia mattina o pomeriggio. NULL = giornata intera.
ALTER TABLE public.vacation_requests ADD COLUMN IF NOT EXISTS half_day TEXT;
NOTIFY pgrst, 'reload schema';
