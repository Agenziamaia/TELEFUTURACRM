-- 058: tag cliccabili nei messaggi di chat.
-- Un messaggio puo' referenziare record del CRM (cliente / contratto / appuntamento):
-- chi lo riceve clicca il tag e viene portato direttamente alla scheda corrispondente.
-- Formato: [{ "type": "cliente|contratto|appuntamento", "id": "...", "label": "..." }]
alter table public.chat_messages
  add column if not exists refs jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
