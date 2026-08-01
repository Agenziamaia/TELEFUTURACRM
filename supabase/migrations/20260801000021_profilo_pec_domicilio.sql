-- 126: PROFILO — PEC e domicilio se diverso dalla residenza (Luca 01/08)
-- Nuovi dati personali sul profilo utente (icona in alto a destra), integrati
-- nel completamento al primo login come gli altri campi (pallino + avviso):
-- la PEC entra nei campi richiesti; il domicilio SOLO quando il flag
-- "diverso dalla residenza" e' attivo.
alter table public.app_users add column if not exists pec text;
alter table public.app_users add column if not exists domicilio_diverso boolean not null default false;
alter table public.app_users add column if not exists domicilio text;
notify pgrst, 'reload schema';
