-- 160: CALENDAR_TASKS.IS_DEMO SANATO (04/08). Il default storico era TRUE
-- (scripts/supabase/002_calendar.sql) e la creazione dal calendario non
-- settava il campo: 9 task VERE risultavano "demo" — una nuova esecuzione
-- della pulizia demo (scripts/supabase/060, `delete ... where is_demo`) le
-- avrebbe cancellate. Default a false + backfill una tantum; il codice del
-- calendario ora inserisce sempre is_demo = false esplicito.
ALTER TABLE public.calendar_tasks ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;
ALTER TABLE public.calendar_tasks ALTER COLUMN is_demo SET DEFAULT false;
UPDATE public.calendar_tasks SET is_demo = false WHERE is_demo;

NOTIFY pgrst, 'reload schema';
