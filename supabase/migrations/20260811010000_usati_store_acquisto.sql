-- USATI: NEGOZIO D'ACQUISTO (MOD-34, Luca 10/08). La colonna `store` diventa
-- la DESTINAZIONE quando il telefono viene inviato (mig. 131): il negozio che
-- ha COMPRATO si perdeva. `store_acquisto` lo fotografa all'insert e non si
-- tocca piu' — alimenta la voce in timeline/dettagli e il filtro
-- "Negozio acquisto" dell'amministrazione.
ALTER TABLE public.usati ADD COLUMN IF NOT EXISTS store_acquisto text;

-- ── BACKFILL (regola CORRETTA da Luca via Verifiche, 10/08): il negozio
-- d'acquisto vale SOLO per i telefoni REGISTRATI DAL CRM (wizard, venditore
-- vero) e mai inviati altrove. Gli IMPORT (fase zero, magazzino) non hanno un
-- acquirente certo → restano NULL ("— sconosciuto"). ──
UPDATE public.usati
SET store_acquisto = store
WHERE store_acquisto IS NULL
  AND store IS NOT NULL AND store <> '' AND store <> 'Laboratorio'
  AND NOT (COALESCE(status_history, '{}'::jsonb) ? 'invio_in_negozio')
  AND COALESCE(note_tecnico, '') NOT ILIKE '%FASE ZERO%'
  AND COALESCE(venditore, '') <> ''
  AND COALESCE(venditore, '') NOT ILIKE '%import%';

NOTIFY pgrst, 'reload schema';
