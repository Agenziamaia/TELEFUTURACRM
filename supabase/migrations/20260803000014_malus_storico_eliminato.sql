-- Mig. 150 — ELIMINA MALUS dall'archivio (Luca 03/08/2026): l'admin puo'
-- togliere QUALSIASI episodio. NON e' un DELETE: la ricostruzione dello
-- storico e' deterministica e re-inserirebbe la riga al giro dopo — quindi
-- l'episodio resta a DB come TOMBSTONE (eliminato=true), sparisce da archivio,
-- contatori e badge, e la sync lo vede e non lo fa rinascere.
ALTER TABLE public.malus_storico ADD COLUMN IF NOT EXISTS eliminato BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.malus_storico ADD COLUMN IF NOT EXISTS eliminato_il TIMESTAMPTZ;
ALTER TABLE public.malus_storico ADD COLUMN IF NOT EXISTS eliminato_da TEXT;
NOTIFY pgrst, 'reload schema';
