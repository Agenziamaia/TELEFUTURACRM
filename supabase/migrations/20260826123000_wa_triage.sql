-- TRIAGE AI delle chat WhatsApp (26/08/2026) — vedi src/lib/ai/waTriage.ts.
-- Una riga per conversazione: lo stato deciso dal modello leggendo la chat
-- (rispondere / attesa_cliente / programmata / niente), il perché in una riga
-- ("azione"), l'eventuale data di rinvio, e il fingerprint dell'ultimo
-- messaggio letto (ultimo_msg_ts): un messaggio più nuovo del fingerprint
-- rende la riga STANTIA e il widget ripiega sulle euristiche finché il motore
-- non riclassifica. "versione" = versione del prompt: alzarla riclassifica tutto.

create table if not exists wa_triage (
  conversation_id uuid primary key references wa_conversations(id) on delete cascade,
  stato text not null check (stato in ('rispondere','attesa_cliente','programmata','niente')),
  azione text,
  rinvio_fino timestamptz,
  ultimo_msg_ts timestamptz not null,
  versione int not null default 1,
  modello text,
  errore text,
  classificato_il timestamptz not null default now()
);
create index if not exists wa_triage_stato_idx on wa_triage (stato);

-- riga singola di stato del motore: lock (in_corsa_da) + debounce
-- (ultima_corsa) + diagnostica leggibile (ultimo_esito)
create table if not exists wa_triage_stato (
  id int primary key,
  in_corsa_da timestamptz,
  ultima_corsa timestamptz,
  ultimo_esito text
);
insert into wa_triage_stato (id) values (1) on conflict do nothing;

-- Supabase ora ACCENDE la RLS da sola sulle tabelle nuove: il CRM lavora ad
-- anon key su tutto (route e client; il riordino RLS è il cantiere P0 già
-- censito) — senza questo alter la route non scrive e il widget non legge.
-- Stessa esposizione di wa_messages: nessun dato nuovo.
alter table wa_triage disable row level security;
alter table wa_triage_stato disable row level security;
