-- Rifiniture alla guardia della chat (revisione del 31/08).
--
-- ① IL MESSAGGIO DICEVA LA COSA SBAGLIATA. Se il lasciapassare non arriva —
--    sessione vecchia, secret assente — `tf_uid()` è null e l'utente leggeva
--    «non puoi creare un gruppo a nome di un altro», che non è il suo
--    problema: il suo problema è che deve rientrare.
-- ② IL SECONDO RAMO SI FIDAVA DI UN DATO CHE NON AVEVA VERIFICATO: bastava
--    una claim `role: service_role` per passare, anche col ruolo vero `anon`.
--    Via PostgREST non è raggiungibile — una claim `role` fa cambiare ruolo
--    per davvero, e il token del CRM è firmato dal server con `authenticated`
--    fisso — ma una guardia non deve credere a quello che le viene detto
--    quando può guardarlo: resta la sola GUC `role`, che è il ruolo vero.

create or replace function public.tf_chat_sono_io(p_me uuid) returns boolean
language plpgsql stable as $$
begin
  if p_me is null then return false; end if;
  if p_me = public.tf_uid() then return true; end if;
  return coalesce(current_setting('role', true), '') = 'service_role';
end $$;

create or replace function public.tf_chat_identita() returns void
language plpgsql stable as $$
begin
  if public.tf_uid() is null and coalesce(current_setting('role', true), '') <> 'service_role' then
    raise exception 'chat: la sessione non è più valida, esci e rientra' using errcode = '42501';
  end if;
end $$;

create or replace function public.chat_get_or_create_dm(p_me uuid, p_other uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare k text; cid uuid;
begin
  perform public.tf_chat_identita();
  if not public.tf_chat_sono_io(p_me) then
    raise exception 'chat: non puoi aprire una conversazione a nome di un altro' using errcode = '42501';
  end if;
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

create or replace function public.chat_create_group(p_me uuid, p_title text, p_members uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid; m uuid;
begin
  perform public.tf_chat_identita();
  if not public.tf_chat_sono_io(p_me) then
    raise exception 'chat: non puoi creare un gruppo a nome di un altro' using errcode = '42501';
  end if;
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

create or replace function public.chat_broadcast(p_me uuid, p_members uuid[], p_body text)
returns integer language plpgsql security definer set search_path = public as $$
declare m uuid; cid uuid; n int := 0;
begin
  perform public.tf_chat_identita();
  if not public.tf_chat_sono_io(p_me) then
    raise exception 'chat: non puoi inviare a nome di un altro' using errcode = '42501';
  end if;
  if p_body is null or length(btrim(p_body)) = 0 then return 0; end if;
  foreach m in array coalesce(p_members, '{}') loop
    if m <> p_me then
      cid := public.chat_get_or_create_dm(p_me, m);
      insert into public.chat_messages(conversation_id, sender_id, body) values (cid, p_me, p_body);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

grant execute on function public.tf_chat_identita() to anon, authenticated, service_role;
