-- Integrazione WhatsApp (Evolution API self-hosted, multi-numero).
--
-- Modello DEDICATO, separato dalla chat interna del team (chat_*), perche' qui il
-- "altro capo" e' un CLIENTE (numero di telefono), non un utente del CRM.
-- La chat interna resta intatta; l'interfaccia WhatsApp riusa gli stessi
-- componenti a bolle, ma i dati stanno qui.
--
--   wa_instances     = un numero WhatsApp collegato (una sessione Evolution),
--                      di norma di proprieta' di un caller.
--   wa_conversations = un thread con un cliente su una certa istanza.
--   wa_messages      = i messaggi (in/out), con id WhatsApp e stato consegna.

create table if not exists public.wa_instances (
  id             uuid primary key default gen_random_uuid(),
  instance_name  text unique not null,          -- nome istanza su Evolution
  owner_user_id  uuid references public.app_users(id) on delete set null,
  display_name   text,                           -- etichetta mostrata nel CRM
  wa_number      text,                           -- numero collegato (dopo il QR)
  status         text not null default 'creata', -- creata | qr | connessa | disconnessa
  created_at     timestamptz not null default now()
);

create table if not exists public.wa_conversations (
  id               uuid primary key default gen_random_uuid(),
  instance_id      uuid not null references public.wa_instances(id) on delete cascade,
  customer_number  text not null,                -- numero del cliente (solo cifre)
  customer_name    text,                          -- nome dal profilo WhatsApp
  client_id        text references public.clients(id) on delete set null,
  assigned_user_id uuid references public.app_users(id) on delete set null,
  last_message_at  timestamptz,
  last_preview     text,
  unread           integer not null default 0,
  created_at       timestamptz not null default now(),
  unique (instance_id, customer_number)
);

create table if not exists public.wa_messages (
  id             uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.wa_conversations(id) on delete cascade,
  wa_message_id  text,                            -- id messaggio WhatsApp (idempotenza)
  direction      text not null,                   -- in | out
  body           text,
  media_url      text,
  media_mime     text,
  status         text,                            -- sent | delivered | read | failed
  sender_name    text,                            -- chi ha scritto (cliente o operatore)
  sent_by_user_id uuid references public.app_users(id) on delete set null,
  wa_timestamp   timestamptz,
  created_at     timestamptz not null default now()
);
create unique index if not exists wa_messages_waid_uq on public.wa_messages (wa_message_id) where wa_message_id is not null;
create index if not exists wa_conv_inst_idx on public.wa_conversations (instance_id, last_message_at desc);
create index if not exists wa_conv_client_idx on public.wa_conversations (client_id);
create index if not exists wa_msg_conv_idx on public.wa_messages (conversation_id, created_at);

alter table public.wa_instances     enable row level security;
alter table public.wa_conversations enable row level security;
alter table public.wa_messages      enable row level security;
drop policy if exists wa_instances_all     on public.wa_instances;
drop policy if exists wa_conversations_all  on public.wa_conversations;
drop policy if exists wa_messages_all       on public.wa_messages;
create policy wa_instances_all     on public.wa_instances     for all using (true) with check (true);
create policy wa_conversations_all on public.wa_conversations for all using (true) with check (true);
create policy wa_messages_all      on public.wa_messages      for all using (true) with check (true);
