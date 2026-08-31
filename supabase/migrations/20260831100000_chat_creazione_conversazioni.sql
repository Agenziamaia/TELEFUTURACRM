-- LA CHAT NON CREAVA PIÙ NIENTE (Luca 31/08: «la funzione crea gruppo non
-- funziona: dopo aver selezionato le persone clicco e non me lo crea»).
--
-- Colpa della blindatura del 28/08 (034b4a3), e non del WITH CHECK — quello
-- era giusto e il commento diceva «creare una conversazione è lecito». Il
-- punto è il `RETURNING`: le tre funzioni fanno
--
--     insert into chat_conversations(...) returning id into cid;
--
-- e su un INSERT ... RETURNING PostgreSQL applica ANCHE la policy di lettura
-- alla riga che sta per restituire. La USING è «id in (le mie conversazioni)»,
-- cioè le conversazioni in cui sono partecipante — ma i partecipanti si
-- inseriscono un attimo DOPO, quindi in quell'istante la riga appena creata
-- non è mia e non è leggibile. Errore 42501, riprodotto:
--     new row violates row-level security policy for table "chat_conversations"
--
-- Non riguardava solo i gruppi: cadevano allo stesso modo il PRIMO messaggio a
-- una persona nuova (chat_get_or_create_dm, che sui DM già esistenti trovava
-- la riga e quindi sembrava funzionare) e il broadcast.
--
-- La cura non è allentare la policy — la chat resta privata — ma dare a
-- queste tre funzioni, che SONO la via ufficiale per creare una
-- conversazione, il diritto di crearla: SECURITY DEFINER.
-- E siccome `p_me` arriva dal client, con SECURITY DEFINER diventerebbe
-- un'identità da regalare: senza guardia chiunque potrebbe aprire una chat
-- «a nome di» un altro. Quindi ogni funzione verifica che chi chiama sia
-- davvero p_me — o che sia il server, che si autentica per conto suo
-- (la rotta /api/ai/action manda i broadcast con la service_role).

-- ⚠️ IL RUOLO DI CHI CHIAMA NON SI LEGGE CON `current_user`: dentro una
-- SECURITY DEFINER quello è il PROPRIETARIO della funzione (postgres), quindi
-- una guardia scritta così sarebbe sempre vera e non guarderebbe niente —
-- provato: un utente qualsiasi riusciva ad aprire un gruppo a nome di Luca.
-- Il ruolo vero resta nella GUC `role`, che `SET LOCAL ROLE` di PostgREST
-- imposta e che la SECURITY DEFINER non tocca.
create or replace function public.tf_chat_sono_io(p_me uuid) returns boolean
language plpgsql stable as $$
declare r text; j text;
begin
  if p_me is null then return false; end if;
  if p_me = public.tf_uid() then return true; end if;
  r := coalesce(current_setting('role', true), '');
  if r = 'service_role' then return true; end if;
  begin
    j := nullif(current_setting('request.jwt.claims', true), '');
    if j is not null and (j::json ->> 'role') = 'service_role' then return true; end if;
  exception when others then null;
  end;
  return false;
end $$;

create or replace function public.chat_get_or_create_dm(p_me uuid, p_other uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare k text; cid uuid;
begin
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
  if not public.tf_chat_sono_io(p_me) then
    raise exception 'chat: non puoi inviare a nome di un altro' using errcode = '42501';
  end if;
  if p_body is null or length(btrim(p_body)) = 0 then
    return 0;
  end if;
  foreach m in array coalesce(p_members, '{}') loop
    if m <> p_me then
      cid := public.chat_get_or_create_dm(p_me, m);
      insert into public.chat_messages(conversation_id, sender_id, body) values (cid, p_me, p_body);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

grant execute on function public.tf_chat_sono_io(uuid)                  to anon, authenticated, service_role;
grant execute on function public.chat_get_or_create_dm(uuid, uuid)      to anon, authenticated, service_role;
grant execute on function public.chat_create_group(uuid, text, uuid[])  to anon, authenticated, service_role;
grant execute on function public.chat_broadcast(uuid, uuid[], text)     to anon, authenticated, service_role;
