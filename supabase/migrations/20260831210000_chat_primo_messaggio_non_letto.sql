-- IL PRIMO MESSAGGIO A CHI NON TI HA MAI SCRITTO ARRIVAVA GIÀ LETTO
-- (revisore 31/08).
--
-- `chat_participants.last_read_at` ha come valore di fabbrica `now()`. Quando
-- si apre una conversazione nuova — un primo messaggio diretto, un gruppo, un
-- broadcast — la riga del destinatario nasce nella STESSA transazione del
-- messaggio, e dentro una transazione `now()` è una costante: quindi
-- `created_at > last_read_at` è falso, e per il CRM quel messaggio è già stato
-- letto. Niente pallino, fuori dal filtro «Non letti», e nel pannello «chi ha
-- letto» il destinatario risulta averlo letto senza aver aperto niente.
--
-- Colpiva esattamente il caso che ha segnalato il collaboratore: la prima
-- volta che scrivi a qualcuno.
--
-- La riparazione è una riga: chi entra in una conversazione non ha letto
-- niente. `-infinity` invece del momento di adesso.

create or replace function public.chat_get_or_create_dm(p_me uuid, p_other uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
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
    -- chi apre la conversazione l'ha letta (è lui che scrive); l'altro no
    insert into public.chat_participants(conversation_id, user_id, last_read_at)
      values (cid, p_me, now()), (cid, p_other, '-infinity') on conflict do nothing;
  end if;
  return cid;
end $function$;

create or replace function public.chat_create_group(p_me uuid, p_title text, p_members uuid[])
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare cid uuid; m uuid;
begin
  perform public.tf_chat_identita();
  if not public.tf_chat_sono_io(p_me) then
    raise exception 'chat: non puoi creare un gruppo a nome di un altro' using errcode = '42501';
  end if;
  insert into public.chat_conversations(type, title, created_by) values ('group', p_title, p_me)
    returning id into cid;
  insert into public.chat_participants(conversation_id, user_id, is_admin, last_read_at)
    values (cid, p_me, true, now()) on conflict do nothing;
  foreach m in array coalesce(p_members, '{}') loop
    if m <> p_me then
      insert into public.chat_participants(conversation_id, user_id, last_read_at)
        values (cid, m, '-infinity') on conflict do nothing;
    end if;
  end loop;
  return cid;
end $function$;
