-- 059: il badge "non letti" restava a 1 anche dopo aver letto.
-- Causa: last_read_at veniva scritto con l'orologio del BROWSER, mentre
-- chat_messages.created_at usa l'orologio del DATABASE. Con anche pochi secondi
-- di scarto (il client indietro rispetto al server) i messaggi risultano sempre
-- piu' recenti del segnalibro di lettura => non letti per sempre.
-- Soluzione: marcare la lettura lato server con now().
create or replace function public.chat_mark_read(p_conversation uuid, p_user uuid)
returns timestamptz
language sql
security definer
set search_path = public
as $$
  update public.chat_participants
     set last_read_at = now()
   where conversation_id = p_conversation and user_id = p_user
  returning last_read_at;
$$;

grant execute on function public.chat_mark_read(uuid, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
