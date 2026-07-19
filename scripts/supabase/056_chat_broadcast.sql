-- 056: invio "broadcast" — lo stesso messaggio a piu' persone (es. tutto un negozio)
-- ma consegnato come CHAT PRIVATA INDIVIDUALE a ciascuno (non un gruppo):
-- ognuno risponde solo al mittente. Riusa chat_get_or_create_dm per deduplicare i DM.
create or replace function public.chat_broadcast(p_me uuid, p_members uuid[], p_body text)
returns int
language plpgsql
set search_path = public
as $$
declare m uuid; cid uuid; n int := 0;
begin
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

grant execute on function public.chat_broadcast(uuid, uuid[], text) to anon, authenticated;

notify pgrst, 'reload schema';
