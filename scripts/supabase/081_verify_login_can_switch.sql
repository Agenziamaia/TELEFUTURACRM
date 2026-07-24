-- Il selettore "Vedi come" non compariva a Luca: verify_login restituisce un
-- elenco fisso di colonne e can_switch_role (migrazione 080) non c'era, quindi
-- il permesso arrivava sempre vuoto al login.

create or replace function public.verify_login(p_email text, p_password text)
 returns table(
   id uuid, full_name text, email text, role text, grade text,
   primary_store text, must_change_password boolean, can_switch_role boolean
 )
 language sql
 security definer
 set search_path to 'public', 'extensions'
as $function$
  select u.id, u.full_name, u.email, u.role, u.grade, u.primary_store,
         u.must_change_password, coalesce(u.can_switch_role, false)
    from public.app_users u
   where u.active
     and lower(u.email) = lower(p_email)
     and u.password_hash is not null
     and u.password_hash = crypt(p_password, u.password_hash)
  limit 1;
$function$;
