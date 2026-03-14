-- Backfill storia so Da Lavorare / Warning / Malus spread correctly.
-- When storia is empty, ggAgg = 999 so every contract is Malus and Da Lavorare/Warning stay 0.
-- This sets one "inserimento" event per contract with data = created_at (DD/MM/YYYY),
-- so ggAgg = working days since creation and the rules produce a realistic spread.

UPDATE public.contracts c
SET storia = jsonb_build_array(
  jsonb_build_object(
    'data',   to_char(COALESCE(c.created_at::date, now()::date), 'DD/MM/YYYY'),
    'tipo',   'inserimento',
    'testo',  'Contratto registrato — stato iniziale: Nuovo',
    'utente', 'Sistema',
    'ruolo',  'sistema'
  )
)
WHERE (c.storia IS NULL OR c.storia = '[]'::jsonb OR jsonb_array_length(COALESCE(c.storia, '[]'::jsonb)) = 0);
