-- 105: layout Home personalizzabile (dashboard fase 4). Ogni utente puo'
-- riordinare i blocchi della Home; l'ordine (array di chiavi) vive qui e lo
-- segue su ogni dispositivo. Vuoto/null = ordine di default.
alter table public.app_users
  add column if not exists dashboard_layout jsonb;

notify pgrst, 'reload schema';
