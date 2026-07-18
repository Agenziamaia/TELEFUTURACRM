-- 053: "ultimo accesso" (last seen) + ricevute di consegna/lettura per la chat.
-- last_seen_at su app_users: aggiornato periodicamente dal client mentre e' online.
-- last_delivered_at su chat_participants: quando il client del destinatario riceve
-- il messaggio (consegnato). La lettura usa gia' last_read_at.

alter table public.app_users
  add column if not exists last_seen_at timestamptz;

alter table public.chat_participants
  add column if not exists last_delivered_at timestamptz;

notify pgrst, 'reload schema';
