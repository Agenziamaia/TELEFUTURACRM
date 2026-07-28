-- Integrazione Email ("webmail" nel CRM). Una casella per NEGOZIO (come le
-- istanze WhatsApp): IMAP per leggere, SMTP per inviare. Le conversazioni
-- raggruppano per indirizzo del cliente; i messaggi si agganciano al cliente
-- per email. La password della casella e' cifrata (AES-256-GCM), mai in chiaro.

create table if not exists email_accounts (
    id            uuid primary key default gen_random_uuid(),
    negozio       text,                        -- negozio proprietario (visibilita' come WhatsApp)
    owner_user_id uuid references app_users(id) on delete set null,
    email_address text not null,
    display_name  text,
    imap_host     text not null,
    imap_port     int  not null default 993,
    smtp_host     text not null,
    smtp_port     int  not null default 465,
    username      text not null,               -- di solito = email_address
    pass_enc      text not null,               -- password cifrata (AES-256-GCM)
    status        text not null default 'attiva',
    last_error    text,
    last_uid      bigint not null default 0,   -- ultimo UID INBOX importato (fetch incrementale)
    created_at    timestamptz not null default now(),
    unique(email_address)
);

create table if not exists email_conversations (
    id              uuid primary key default gen_random_uuid(),
    account_id      uuid not null references email_accounts(id) on delete cascade,
    customer_email  text not null,
    customer_name   text,
    client_id       text references clients(id) on delete set null,
    subject         text,
    last_message_at timestamptz,
    last_preview    text,
    unread          int not null default 0,
    created_at      timestamptz not null default now(),
    unique(account_id, customer_email)
);

create table if not exists email_messages (
    id              uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references email_conversations(id) on delete cascade,
    account_id      uuid not null references email_accounts(id) on delete cascade,
    direction       text not null,             -- in | out
    message_id      text unique,               -- Message-ID dell'email
    in_reply_to     text,
    from_addr text, from_name text,
    to_addrs  text, cc_addrs  text,
    subject   text,
    body_text text, body_html text,
    attachments     jsonb not null default '[]'::jsonb,   -- [{name,url,mime,size}]
    status          text,                      -- sent | failed | null
    sent_by_user_id uuid references app_users(id) on delete set null,
    email_date      timestamptz,
    created_at      timestamptz not null default now()
);
create index if not exists email_msg_conv_idx on email_messages(conversation_id);

alter table email_accounts enable row level security;
alter table email_conversations enable row level security;
alter table email_messages enable row level security;
do $$ begin
    if not exists (select 1 from pg_policies where tablename='email_accounts' and policyname='email_accounts_all') then create policy email_accounts_all on email_accounts for all to public using (true) with check (true); end if;
    if not exists (select 1 from pg_policies where tablename='email_conversations' and policyname='email_conv_all') then create policy email_conv_all on email_conversations for all to public using (true) with check (true); end if;
    if not exists (select 1 from pg_policies where tablename='email_messages' and policyname='email_msg_all') then create policy email_msg_all on email_messages for all to public using (true) with check (true); end if;
end $$;

-- bucket allegati email (pubblico come gli altri media del CRM)
insert into storage.buckets (id, name, public) values ('email-attachments','email-attachments',true) on conflict (id) do nothing;
do $$ begin
    if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='email_att_insert') then create policy email_att_insert on storage.objects for insert to public with check (bucket_id='email-attachments'); end if;
    if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='email_att_select') then create policy email_att_select on storage.objects for select to public using (bucket_id='email-attachments'); end if;
end $$;
