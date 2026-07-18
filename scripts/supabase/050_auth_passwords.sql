-- 050: login reale su app_users con password cifrate (bcrypt/pgcrypto)
-- Sostituisce il mock login. Le password NON transitano mai in chiaro dal client:
-- la verifica avviene in una funzione SECURITY DEFINER (verify_login).
--
-- NOTA: 'Telefutura#2026' e' la password temporanea iniziale per TUTTI gli account
-- attivi. Al primo accesso e' obbligatorio cambiarla (must_change_password).

create extension if not exists pgcrypto;

-- 1) Colonne per l'hash e il cambio obbligatorio
alter table public.app_users
  add column if not exists password_hash text,
  add column if not exists must_change_password boolean not null default true;

-- 2) Seed della password temporanea per gli account attivi senza hash
--    (idempotente: non tocca chi ha gia' un hash)
update public.app_users
   set password_hash = crypt('Telefutura#2026', gen_salt('bf')),
       must_change_password = true
 where active
   and (password_hash is null or password_hash = '');

-- 3) verify_login: ritorna i campi "safe" dell'utente se email+password combaciano
--    (solo attivi). SECURITY DEFINER => l'anon client non legge mai gli hash.
create or replace function public.verify_login(p_email text, p_password text)
returns table (
  id uuid,
  full_name text,
  email text,
  role text,
  grade text,
  primary_store text,
  must_change_password boolean
)
language sql
security definer
set search_path = public, extensions
as $$
  select u.id, u.full_name, u.email, u.role, u.grade, u.primary_store, u.must_change_password
    from public.app_users u
   where u.active
     and lower(u.email) = lower(p_email)
     and u.password_hash is not null
     and u.password_hash = crypt(p_password, u.password_hash)
  limit 1;
$$;

-- 4) change_password: l'utente cambia la propria password verificando la vecchia
create or replace function public.change_password(p_email text, p_old text, p_new text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare ok boolean;
begin
  update public.app_users
     set password_hash = crypt(p_new, gen_salt('bf')),
         must_change_password = false,
         updated_at = now()
   where active
     and lower(email) = lower(p_email)
     and password_hash = crypt(p_old, password_hash)
  returning true into ok;
  return coalesce(ok, false);
end;
$$;

-- 5) admin_set_password: reset lato Amministrazione (rimette must_change_password=true)
create or replace function public.admin_set_password(p_user_id uuid, p_new text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update public.app_users
     set password_hash = crypt(p_new, gen_salt('bf')),
         must_change_password = true,
         updated_at = now()
   where id = p_user_id;
  return found;
end;
$$;

-- 6) Esecuzione via anon (coerente col modello anon-key dell'app)
grant execute on function public.verify_login(text, text)          to anon, authenticated;
grant execute on function public.change_password(text, text, text) to anon, authenticated;
grant execute on function public.admin_set_password(uuid, text)    to anon, authenticated;

notify pgrst, 'reload schema';
