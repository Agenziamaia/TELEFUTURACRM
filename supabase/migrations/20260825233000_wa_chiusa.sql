-- Chat WhatsApp «concluse» (Luca 25/08 sera): una conversazione si può
-- chiudere a mano (nessuna risposta necessaria) — sparisce dagli alert del
-- widget; un nuovo messaggio VERO del cliente la riapre (il webhook azzera
-- chiusa_il sugli inbound).
alter table wa_conversations add column if not exists chiusa_il timestamptz;
