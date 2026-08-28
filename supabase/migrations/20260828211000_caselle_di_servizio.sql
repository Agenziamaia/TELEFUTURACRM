-- LE CASELLE DI SERVIZIO NON SONO LA POSTA DI NESSUNO (Luca 28/08 sera).
--
-- Una casella che riceve i codici usa e getta di Fastweb non deve comparire in
-- nessuna Inbox: né in quella di chi lavora nel negozio, né in quella della
-- direzione. Il CRM ci pesca dentro un numero alla volta, su richiesta, e lo
-- consegna a chi ha diritto di vedere quella credenziale.
--
-- Si poteva filtrare nelle schermate — ce ne sono cinque che leggono le
-- caselle — ma sarebbe bastato scordarsene UNA, oggi o fra sei mesi, per
-- rimettere i codici sotto gli occhi di tutti. Qui la regola è una sola: il
-- database non le consegna. Il pannello di amministrazione le governa dal
-- server, con la chiave amministratore.

create or replace function public.tf_mie_caselle()
returns setof uuid
language sql
stable security definer
set search_path to 'public'
as $function$
  with me as (select u.id, u.role, u.primary_store from app_users u where u.id = tf_uid() and coalesce(u.active, true)),
  miei as (
    select lower(trim(m.primary_store)) n from me m where coalesce(m.primary_store,'') <> ''
    union select lower(trim(us.store_name)) from user_stores us join me m on us.user_id = m.id
  )
  select a.id from email_accounts a, me
  where me.id is not null
    -- ⬇️ la riga nuova: le caselle di servizio restano fuori da tutto
    and coalesce(a.uso_sistema, false) = false
    and (
      -- direzione e amministrazione vedono tutte le caselle (come oggi)
      me.role in ('admin','dev','direttore_generale','amministrativo')
      or a.owner_user_id = me.id
      or exists (select 1 from email_account_users eu where eu.account_id = a.id and eu.user_id = me.id)
      or (a.owner_user_id is null and exists (
            select 1 from miei mm
            where mm.n = any (string_to_array(lower(replace(coalesce(a.negozio,''), ', ', ',')), ','))
               or split_part(mm.n, ' ', 1) = split_part(lower(trim(coalesce(a.negozio,''))), ' ', 1)))
    )
$function$;

-- le policy la chiamano: deve restare eseguibile dagli utenti loggati
-- (lezione del 28/08 mattina: revocarla in blocco acceca tutte le letture)
grant execute on function public.tf_mie_caselle() to authenticated, anon;
