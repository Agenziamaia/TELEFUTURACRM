-- 052: RPC di supporto alla chat (inbox con conteggio non letti, crea/dedup DM, crea gruppo)

-- Inbox dell'utente: una riga per conversazione con ultimo messaggio, non letti,
-- e (per i DM) i dati dell'altro partecipante.
create or replace function public.chat_inbox(p_user_id uuid)
returns table (
  conversation_id uuid,
  type text,
  title text,
  last_message_at timestamptz,
  last_body text,
  last_sender_id uuid,
  unread int,
  other_id uuid,
  other_name text,
  other_role text,
  member_count int
)
language sql stable
set search_path = public
as $$
  with mine as (
    select p.conversation_id, p.last_read_at
      from public.chat_participants p
     where p.user_id = p_user_id
  ),
  lastmsg as (
    select distinct on (m.conversation_id)
           m.conversation_id, m.body as last_body, m.sender_id as last_sender_id
      from public.chat_messages m
     where m.conversation_id in (select conversation_id from mine)
       and m.deleted_at is null
     order by m.conversation_id, m.created_at desc
  ),
  unread as (
    select m.conversation_id, count(*)::int as unread
      from public.chat_messages m
      join mine on mine.conversation_id = m.conversation_id
     where m.created_at > mine.last_read_at
       and m.sender_id is distinct from p_user_id
       and m.deleted_at is null
     group by m.conversation_id
  ),
  other as (
    select p.conversation_id, u.id as other_id, u.full_name as other_name, u.role as other_role
      from public.chat_participants p
      join public.app_users u on u.id = p.user_id
     where p.conversation_id in (select conversation_id from mine)
       and p.user_id <> p_user_id
  ),
  cnt as (
    select conversation_id, count(*)::int as member_count
      from public.chat_participants
     where conversation_id in (select conversation_id from mine)
     group by conversation_id
  )
  select c.id, c.type, c.title, c.last_message_at,
         lm.last_body, lm.last_sender_id,
         coalesce(u.unread, 0),
         o.other_id, o.other_name, o.other_role,
         coalesce(cnt.member_count, 0)
    from public.chat_conversations c
    join mine on mine.conversation_id = c.id
    left join lastmsg lm on lm.conversation_id = c.id
    left join unread  u  on u.conversation_id  = c.id
    left join other   o  on o.conversation_id  = c.id and c.type = 'dm'
    left join cnt        on cnt.conversation_id = c.id
   order by c.last_message_at desc;
$$;

-- Trova o crea il DM fra due utenti (dedup via dm_key ordinato)
create or replace function public.chat_get_or_create_dm(p_me uuid, p_other uuid)
returns uuid
language plpgsql
set search_path = public
as $$
declare k text; cid uuid;
begin
  k := case when p_me < p_other then p_me::text || '|' || p_other::text
            else p_other::text || '|' || p_me::text end;
  select id into cid from public.chat_conversations where dm_key = k;
  if cid is null then
    insert into public.chat_conversations(type, dm_key, created_by) values ('dm', k, p_me)
      returning id into cid;
    insert into public.chat_participants(conversation_id, user_id)
      values (cid, p_me), (cid, p_other) on conflict do nothing;
  end if;
  return cid;
end $$;

-- Crea un gruppo con un titolo e una lista di membri (il creatore e' admin del gruppo)
create or replace function public.chat_create_group(p_me uuid, p_title text, p_members uuid[])
returns uuid
language plpgsql
set search_path = public
as $$
declare cid uuid; m uuid;
begin
  insert into public.chat_conversations(type, title, created_by) values ('group', p_title, p_me)
    returning id into cid;
  insert into public.chat_participants(conversation_id, user_id, is_admin) values (cid, p_me, true)
    on conflict do nothing;
  foreach m in array coalesce(p_members, '{}') loop
    if m <> p_me then
      insert into public.chat_participants(conversation_id, user_id) values (cid, m) on conflict do nothing;
    end if;
  end loop;
  return cid;
end $$;

grant execute on function public.chat_inbox(uuid)                       to anon, authenticated;
grant execute on function public.chat_get_or_create_dm(uuid, uuid)      to anon, authenticated;
grant execute on function public.chat_create_group(uuid, text, uuid[])  to anon, authenticated;

notify pgrst, 'reload schema';
