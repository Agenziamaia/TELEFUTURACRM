-- VERIFICHE, TASK (MOD-39, Luca 10/08): dal pannello l'admin puo' aggiungere
-- una TASK per Claude in qualsiasi momento (anche da telefono): tipo 'task',
-- nasce in stato 'da_sistemare' (= in carico a Claude, non ancora fatta);
-- quando Claude la svolge la porta a 'da_verificare' col dettaglio di cosa ha
-- fatto — e Luca la esita come ogni altro update.
ALTER TABLE public.dev_updates DROP CONSTRAINT IF EXISTS dev_updates_tipo_check;
ALTER TABLE public.dev_updates ADD CONSTRAINT dev_updates_tipo_check
  CHECK (tipo IN ('update','sospeso','task'));

NOTIFY pgrst, 'reload schema';
