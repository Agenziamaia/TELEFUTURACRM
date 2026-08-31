-- LA POSTA PERSONALE SOTTO CODICE (Luca 31/08).
--
-- «È personale nei confronti di tutti e di eventuali ruoli che gestiscono
--  quella persona.»
--
-- Il lucchetto davanti a WhatsApp esiste dal 27/08 e fa due cose insieme:
-- chiede un codice a chi apre, E toglie il numero dagli occhi di tutti gli
-- altri. La seconda metà è quella che conta davvero — un codice che protegge
-- solo l'interfaccia non protegge niente, perché il dato resta leggibile a
-- chiunque interroghi il database.
--
-- Qui si fa lo stesso per la posta, e nello stesso punto: `tf_mie_caselle()`,
-- la funzione da cui dipendono TUTTE le regole delle tabelle email
-- (email_accounts, email_conversations, email_messages). Una riga sola, e la
-- casella sparisce ovunque: inbox, chat omnicanale, triage, contatori.
--
-- ⚠️ CHI RESTA FUORI, DA OGGI, SE IL LUCCHETTO È ACCESO:
--   · direttore_generale e amministrativo — che oggi vedono tutte le caselle.
--     Sono esattamente «i ruoli che gestiscono quella persona» di cui parla
--     Luca: è per loro che il lucchetto esiste.
--   · chiunque sia iscritto come membro di quella casella.
-- Restano dentro solo il TITOLARE e admin/dev — come per WhatsApp, perché
-- sono loro a governare i lucchetti e ad azzerarli quando qualcuno dimentica
-- il codice.
--
-- ⚠️ E ATTENZIONE A UN EFFETTO COLLATERALE VERO: alcune caselle intestate a
-- una persona sono di fatto AZIENDALI — amministrazione@telefuturasrl.com è
-- intestata a Sandra e ha quasi settemila conversazioni. Accendere il
-- lucchetto a quella persona nasconde quella posta anche alla direzione. È il
-- comportamento richiesto, ma va acceso sapendolo: si accende persona per
-- persona dalla rotellina, e di default è spento per tutti.

create or replace function public.tf_mie_caselle()
returns setof uuid
language sql stable security definer set search_path = public
as $function$
  with me as (
    select u.id, u.role, u.primary_store
    from app_users u where u.id = tf_uid() and coalesce(u.active, true)
  ),
  miei as (
    select lower(trim(m.primary_store)) n from me m where coalesce(m.primary_store,'') <> ''
    union select lower(trim(us.store_name)) from user_stores us join me m on us.user_id = m.id
  ),
  /* I TITOLARI COL LUCCHETTO ACCESO sulla posta: le loro caselle personali
     non le vede nessun altro, per nessun motivo (salvo admin e dev). Stessa
     forma di `protetti` in tf_wa_istanze — chi legge una delle due funzioni
     riconosce l'altra. */
  protetti as (
    select u.id from app_users u
    where tf_cap(u.id, u.role, 'cap:/chat:codice_email', false)
  )
  select a.id from email_accounts a, me
  where me.id is not null
    -- le caselle di servizio restano fuori da tutto
    and coalesce(a.uso_sistema, false) = false
    /* IL LUCCHETTO BATTE QUALUNQUE PERIMETRO, e viene prima di ogni altra
       condizione: se la casella è di un titolare protetto, l'unico che la
       vede è lui (admin e dev passano dal ramo sotto). */
    and (a.owner_user_id is null
         or a.owner_user_id = me.id
         or me.role in ('admin','dev')
         or a.owner_user_id not in (select id from protetti))
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

comment on function public.tf_mie_caselle() is
  'Le caselle email che l''utente corrente può vedere. È il perno di TUTTE le regole delle tabelle email: cambiarla cambia insieme inbox, omnichat, triage e contatori. Dal 31/08 conosce il lucchetto (cap:/chat:codice_email): una casella personale protetta la vedono solo il titolare e admin/dev.';
