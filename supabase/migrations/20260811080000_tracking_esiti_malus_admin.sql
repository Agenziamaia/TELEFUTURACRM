-- MALUS SUGLI ESITI AMMINISTRATIVI (Luca 10/08 via Verifiche): quando la
-- verifica amministrazione marca una pratica (es. NON CONFORME), puo' maturare
-- un malus €/GIORNO lavorativo configurabile PER CATEGORIA dal pannello
-- Amministrazione → Tracking PDA → Esiti amministrazione. NULL = nessun malus.
ALTER TABLE public.tracking_esiti ADD COLUMN IF NOT EXISTS malus_giorno numeric;

NOTIFY pgrst, 'reload schema';
