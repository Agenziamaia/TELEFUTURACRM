-- IL LATO AZIENDA È SOLO DELL'ADMIN (Luca 31/08).
--
-- «Tutte le informazioni che sono dentro il lato azienda di qualsiasi operatore
--  non devono essere pubblicate, non devono essere visibili, non devono essere
--  consultate. Quando ti fanno una domanda, a meno che non sia l'admin, tutto
--  deve fare riferimento al lato ragazzi. Così come il foglio Master è privato,
--  sempre e solo per l'admin.»
--
-- PERCHÉ NON BASTA FILTRARE I RISULTATI. Il filtro che ho scritto venerdì
-- toglie righe e colonne DOPO l'esecuzione, e per i negozi funziona: il nome
-- del punto vendita è nella riga. Qui no — «select sum(bonus) from pay_soglie
-- where lato = ''azienda''» restituisce UN NUMERO, senza portarsi dietro la
-- colonna `lato`. Non c'è niente da filtrare: il dato è già uscito.
--
-- QUINDI SI CAMBIA LIVELLO: non lo filtra il codice, non glielo fa vedere il
-- DATABASE. Due ruoli e due porte:
--
--   ai_lettore        → chiunque non sia admin. NON ha il permesso di leggere
--                       pay_soglie/pay_righe/pay_piste né le gare azienda:
--                       legge le VISTE qui sotto, che portano solo il lato
--                       ragazzi. Anche scrivendo «select * from
--                       public.pay_soglie» si prende un «permission denied».
--   ai_lettore_admin  → l'admin. Legge le tabelle vere.
--
-- IL TRUCCO CHE TIENE INSIEME LE DUE COSE: le viste stanno in uno schema
-- `ai_ragazzi` e si chiamano ESATTAMENTE come le tabelle. Con
-- `search_path = ai_ragazzi, public`, un `from pay_soglie` scritto dal modello
-- finisce sulla vista senza che lui debba saperne niente. Stesso SQL, dati
-- diversi a seconda di chi ha fatto la domanda.

-- ── il ruolo dell'admin ────────────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'ai_lettore_admin') then
    create role ai_lettore_admin nologin;
  end if;
  execute format('grant ai_lettore_admin to %I', current_user);
end $$;

alter role ai_lettore_admin bypassrls;
grant usage on schema public to ai_lettore_admin;
grant select on all tables in schema public to ai_lettore_admin;
alter default privileges in schema public grant select on tables to ai_lettore_admin;
-- nemmeno l'admin legge le credenziali da qui: una password non si consulta
revoke all on table public.password_credentials   from ai_lettore_admin;
revoke all on table public.password_access_log    from ai_lettore_admin;
revoke all on table public.email_accounts         from ai_lettore_admin;
revoke all on table public.impostazioni_servizio  from ai_lettore_admin;

-- ── lo schema con le viste «lato ragazzi» ──────────────────────────────────
/* Lo schema appartiene a ai_lettore_admin — è lui che possiede le viste (una
   vista gira coi diritti del proprietario, e sotto ci sono tabelle che
   ai_lettore non può leggere). A ai_lettore basta poterci entrare. */
create schema if not exists ai_ragazzi authorization ai_lettore_admin;
grant usage on schema ai_ragazzi to ai_lettore, ai_lettore_admin;

create or replace view ai_ragazzi.pay_soglie as
  select * from public.pay_soglie where lato is distinct from 'azienda';
create or replace view ai_ragazzi.pay_righe as
  select * from public.pay_righe  where lato is distinct from 'azienda';
create or replace view ai_ragazzi.pay_piste as
  select * from public.pay_piste  where lato is distinct from 'azienda';

/* Le viste appartengono a chi PUÒ leggere le tabelle sotto, altrimenti
   ai_lettore non vedrebbe niente lo stesso (una vista gira coi diritti del suo
   proprietario). */
alter view ai_ragazzi.pay_soglie owner to ai_lettore_admin;
alter view ai_ragazzi.pay_righe  owner to ai_lettore_admin;
alter view ai_ragazzi.pay_piste  owner to ai_lettore_admin;
grant select on ai_ragazzi.pay_soglie, ai_ragazzi.pay_righe, ai_ragazzi.pay_piste
  to ai_lettore, ai_lettore_admin;

-- ── e adesso si chiude la porta principale al lettore normale ──────────────
revoke all on table public.pay_soglie, public.pay_righe, public.pay_piste from ai_lettore;

/* LE GARE AZIENDA: qui non c'è un lato da filtrare, sono azienda per intero —
   quanto l'operatore paga a Telefutura, le soglie della trattativa, le voci
   della lettera. Non si aprono affatto.
   `pay_mappa_soglie` traduce le nostre soglie nelle loro: stessa materia.
   I COSTI (other_costs, shared_costs, store_cost_items) sono il conto
   dell'azienda, non il compenso di nessuno: fuori anche quelli. */
revoke all on table public.gare_azienda_regole, public.gare_azienda_soglie,
  public.gare_azienda_voci, public.pay_mappa_soglie, public.pay_regole_lettera,
  public.other_costs, public.shared_costs, public.store_cost_items
  from ai_lettore;

-- ── la porta dell'admin ────────────────────────────────────────────────────
/* ⚠️ IN UNO SCHEMA SUO, e non è un dettaglio. Al primo tentativo l'avevo messa
   in `ai`, che appartiene a ai_lettore: l'`alter owner` falliva in silenzio e
   la funzione restava di postgres — cioè girava da superuser. Provato: da
   quella porta si leggevano le PASSWORD (86 righe) e le caselle di posta.
   Un percorso «per l'admin» non deve essere un percorso senza limiti. */
create schema if not exists ai_admin authorization ai_lettore_admin;
grant usage on schema ai_admin to ai_lettore_admin;

drop function if exists ai.interroga_admin(text);
drop function if exists ai_admin.interroga(text);

create function ai_admin.interroga(q text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare risultato jsonb;
begin
  if q !~* '^\s*(select|with)\s' then
    raise exception 'Solo interrogazioni: la richiesta deve cominciare con SELECT o WITH.';
  end if;
  if q ~* ';\s*\S' then
    raise exception 'Una interrogazione per volta.';
  end if;
  set local transaction_read_only = on;
  set local statement_timeout = '8s';
  execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (%s) t', q) into risultato;
  return risultato;
end $$;

alter function ai_admin.interroga(text) owner to ai_lettore_admin;
revoke all on function ai_admin.interroga(text) from public, anon, authenticated;
grant execute on function ai_admin.interroga(text) to service_role;

comment on function ai_admin.interroga(text) is
  'Come ai.interroga, ma coi diritti di ai_lettore_admin: vede anche il lato azienda e le gare azienda. La chiama il server SOLO quando chi fa la domanda è admin.';

-- ── e la porta di tutti gli altri passa dalle viste ────────────────────────
drop function if exists ai.interroga(text);

create function ai.interroga(q text)
returns jsonb
language plpgsql
security definer
-- ⚠️ `ai_ragazzi` PRIMA di `public`: così «from pay_soglie» trova la vista
--    filtrata. È qui che il lato azienda sparisce, senza che il modello lo sappia.
set search_path = ai_ragazzi, public, pg_temp
as $$
declare risultato jsonb;
begin
  if q !~* '^\s*(select|with)\s' then
    raise exception 'Solo interrogazioni: la richiesta deve cominciare con SELECT o WITH.';
  end if;
  if q ~* ';\s*\S' then
    raise exception 'Una interrogazione per volta.';
  end if;
  set local transaction_read_only = on;
  set local statement_timeout = '8s';
  execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (%s) t', q) into risultato;
  return risultato;
end $$;

alter function ai.interroga(text) owner to ai_lettore;
revoke all on function ai.interroga(text) from public, anon, authenticated;
grant execute on function ai.interroga(text) to service_role;

comment on function ai.interroga(text) is
  'Interrogazione dell''assistente per chi NON è admin: gira come ai_lettore, che sul lato azienda non ha proprio il permesso di leggere. Le viste ai_ragazzi.* rimappano pay_soglie/pay_righe/pay_piste al solo lato ragazzi.';

-- ── il ponte, che ora sceglie la porta ─────────────────────────────────────
create or replace function public.ai_interroga(q text, admin boolean default false)
returns jsonb
language sql
security invoker
set search_path = public, ai, ai_admin, pg_temp
as $$ select case when admin then ai_admin.interroga(q) else ai.interroga(q) end $$;

revoke all on function public.ai_interroga(text, boolean) from public, anon, authenticated;
grant execute on function public.ai_interroga(text, boolean) to service_role;

comment on function public.ai_interroga(text, boolean) is
  'Ponte per il client Supabase. `admin` lo decide il SERVER dal ruolo nella sessione firmata, mai il browser e mai il modello.';
