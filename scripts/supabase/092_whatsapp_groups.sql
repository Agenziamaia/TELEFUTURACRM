-- Supporto gruppi WhatsApp nel modello wa_*.
-- Un gruppo non ha un numero cliente: si identifica col suo JID (<id>@g.us).
-- Aggiungiamo:
--   is_group  -> distingue la conversazione di gruppo dalla 1-a-1
--   chat_jid  -> indirizzo WhatsApp completo per inviare (numero@s.whatsapp.net
--                per i singoli, <id>@g.us per i gruppi). Cosi' l'invio non deve
--                indovinare il suffisso.

alter table wa_conversations add column if not exists is_group boolean not null default false;
alter table wa_conversations add column if not exists chat_jid text;

comment on column wa_conversations.is_group is 'true = conversazione di gruppo WhatsApp';
comment on column wa_conversations.chat_jid is 'JID WhatsApp completo: <numero>@s.whatsapp.net oppure <id>@g.us';
