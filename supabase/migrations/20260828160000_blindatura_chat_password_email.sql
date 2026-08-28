-- BLINDATURA FASE C/2 (Luca 28/08) — chat interna, password aziendali, email.
--
-- Dopo WhatsApp, le altre tre aree dove «loggato» non basta:
--   · la CHAT INTERNA è privata: si vedono solo le conversazioni proprie
--   · le PASSWORD aziendali non devono passare dal browser: mai
--   · le EMAIL seguono le caselle che uno può davvero aprire

-- ── CHAT INTERNA: si vede solo ciò a cui si partecipa ────────────────────
create or replace function tf_mie_conversazioni() returns setof uuid
language sql stable security definer set search_path = public as $$
  select cp.conversation_id from chat_participants cp where cp.user_id = tf_uid()
$$;

drop policy if exists tf_blindata on chat_conversations;
create policy tf_blindata on chat_conversations for all
  using (id in (select tf_mie_conversazioni()))
  with check (tf_uid() is not null);   -- creare una conversazione è lecito

drop policy if exists tf_blindata on chat_participants;
create policy tf_blindata on chat_participants for all
  using (conversation_id in (select tf_mie_conversazioni()) or user_id = tf_uid())
  with check (tf_uid() is not null);

drop policy if exists tf_blindata on chat_messages;
create policy tf_blindata on chat_messages for all
  using (conversation_id in (select tf_mie_conversazioni()))
  with check (conversation_id in (select tf_mie_conversazioni()));

drop policy if exists tf_blindata on chat_attachments;
create policy tf_blindata on chat_attachments for all
  using (message_id in (select m.id from chat_messages m where m.conversation_id in (select tf_mie_conversazioni())))
  with check (message_id in (select m.id from chat_messages m where m.conversation_id in (select tf_mie_conversazioni())));

drop policy if exists tf_blindata on chat_reactions;
create policy tf_blindata on chat_reactions for all
  using (message_id in (select m.id from chat_messages m where m.conversation_id in (select tf_mie_conversazioni())))
  with check (message_id in (select m.id from chat_messages m where m.conversation_id in (select tf_mie_conversazioni())));

-- ── PASSWORD AZIENDALI: fuori dalla portata del browser ──────────────────
-- il CRM le mostra passando dalle sue funzioni di server (che decifrano e
-- registrano l'accesso): dal browser non si leggono più, punto.
drop policy if exists tf_blindata on password_credentials;
create policy tf_solo_server on password_credentials for all using (false) with check (false);
drop policy if exists tf_blindata on password_access_log;
create policy tf_solo_server on password_access_log for all using (false) with check (false);

-- ── EMAIL: le caselle che uno può davvero aprire ─────────────────────────
create or replace function tf_mie_caselle() returns setof uuid
language sql stable security definer set search_path = public as $$
  with me as (select u.id, u.role, u.primary_store from app_users u where u.id = tf_uid() and coalesce(u.active, true)),
  miei as (
    select lower(trim(m.primary_store)) n from me m where coalesce(m.primary_store,'') <> ''
    union select lower(trim(us.store_name)) from user_stores us join me m on us.user_id = m.id
  )
  select a.id from email_accounts a, me
  where me.id is not null and (
    -- direzione e amministrazione vedono tutte le caselle (come oggi)
    me.role in ('admin','dev','direttore_generale','amministrativo')
    or a.owner_user_id = me.id
    or exists (select 1 from email_account_users eu where eu.account_id = a.id and eu.user_id = me.id)
    or (a.owner_user_id is null and exists (
          select 1 from miei mm
          where mm.n = any (string_to_array(lower(replace(coalesce(a.negozio,''), ', ', ',')), ','))
             or split_part(mm.n, ' ', 1) = split_part(lower(trim(coalesce(a.negozio,''))), ' ', 1)))
  )
$$;

drop policy if exists tf_blindata on email_accounts;
create policy tf_blindata on email_accounts for all
  using (id in (select tf_mie_caselle()))
  with check (id in (select tf_mie_caselle()));

drop policy if exists tf_blindata on email_conversations;
create policy tf_blindata on email_conversations for all
  using (account_id in (select tf_mie_caselle()))
  with check (account_id in (select tf_mie_caselle()));

drop policy if exists tf_blindata on email_messages;
create policy tf_blindata on email_messages for all
  using (account_id in (select tf_mie_caselle()))
  with check (account_id in (select tf_mie_caselle()));

-- la PASSWORD della casella (pass_enc) non deve nemmeno essere richiedibile
-- dal browser: si toglie il diritto di leggere quella singola colonna
revoke select (pass_enc) on email_accounts from anon, authenticated;
