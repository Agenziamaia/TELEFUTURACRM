-- 083: chi ha FISSATO l'appuntamento (filtro "Fissato da" nel Calendario).
-- L'agente/consulente e' l'INCARICATO; created_by e' chi lo ha prenotato
-- (es. l'operatrice del call center). Gli appuntamenti storici restano NULL.
-- Il frontend scrive created_by in modo difensivo: se la colonna non c'e'
-- ancora (deploy prima della migrazione) ritenta l'insert senza.

ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS created_by TEXT;

NOTIFY pgrst, 'reload schema';
