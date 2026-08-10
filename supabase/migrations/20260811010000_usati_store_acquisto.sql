-- USATI: NEGOZIO D'ACQUISTO (MOD-34, Luca 10/08). La colonna `store` diventa
-- la DESTINAZIONE quando il telefono viene inviato (mig. 131): il negozio che
-- ha COMPRATO si perdeva. `store_acquisto` lo fotografa all'insert e non si
-- tocca piu' — alimenta la voce in timeline/dettagli e il filtro
-- "Negozio acquisto" dell'amministrazione.
ALTER TABLE public.usati ADD COLUMN IF NOT EXISTS store_acquisto text;

-- ── BACKFILL best-effort dello storico ──
-- 1) import "fase zero": il negozio VERO sta nella nota d'import
--    ("Import FASE ZERO ... (inventario reale Donna)")
UPDATE public.usati
SET store_acquisto = substring(note_tecnico from 'inventario reale ([^)]+)')
WHERE store_acquisto IS NULL
  AND note_tecnico ~ 'inventario reale [^)]+';

-- 2) righe MAI inviate a un altro negozio (nessun evento invio_in_negozio in
--    cronologia): store e' ancora quello d'acquisto. "Laboratorio" escluso
--    (import magazzino legacy: negozio d'acquisto sconosciuto → resta NULL).
UPDATE public.usati
SET store_acquisto = store
WHERE store_acquisto IS NULL
  AND store IS NOT NULL AND store <> '' AND store <> 'Laboratorio'
  AND NOT (COALESCE(status_history, '{}'::jsonb) ? 'invio_in_negozio');

NOTIFY pgrst, 'reload schema';
