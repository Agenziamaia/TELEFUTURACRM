-- Richiesta di Luca: poter cambiare ruolo dal proprio account per controllare
-- il CRM come lo vedono gli altri (venditore, tecnico, store manager...).
--
-- E' un permesso per singolo account, non per ruolo: cosi' resta acceso solo
-- dove serve e si concede/revoca senza toccare il codice.
-- NB: e' solo un "guarda come", il ruolo vero a database non cambia mai.

alter table public.app_users
  add column if not exists can_switch_role boolean not null default false;

-- Per ora solo Luca (unico admin), come richiesto.
update public.app_users
   set can_switch_role = true
 where role = 'admin' and full_name ilike '%luca%perrotta%';
