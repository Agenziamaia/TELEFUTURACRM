-- Segnalazione 74: poter rispondere a un messaggio preciso, stile WhatsApp.
-- Il messaggio di risposta punta a quello citato; se l'originale viene
-- eliminato la citazione si svuota (la risposta resta).

alter table public.chat_messages
  add column if not exists reply_to uuid references public.chat_messages(id) on delete set null;

create index if not exists chat_messages_reply_to_idx
  on public.chat_messages (reply_to) where reply_to is not null;
