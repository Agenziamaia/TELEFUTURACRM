-- 145: CORSI nel registro ferie (03/08). L'amministrazione registra anche i
-- CORSI di formazione (＋ Corsi): stessa tabella delle ferie con tipo
-- dedicato, colore diverso in calendario, esclusi dai contatori ferie.
ALTER TABLE public.vacation_requests ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'ferie';

NOTIFY pgrst, 'reload schema';
