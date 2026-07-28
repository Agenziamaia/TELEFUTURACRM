-- 101: cartelle stile Gmail per l'Email del CRM.
-- Flag a livello THREAD (email_conversations) + tabella bozze (Bozze/Drafts).
-- Posta in arrivo/Inviati si derivano (direction dei messaggi); Speciali/Spam/
-- Cestino/Archivia sono flag sulla conversazione.
alter table public.email_conversations
  add column if not exists starred  boolean not null default false,
  add column if not exists spam     boolean not null default false,
  add column if not exists trashed  boolean not null default false,
  add column if not exists archived boolean not null default false;

create table if not exists public.email_drafts (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.email_accounts(id) on delete cascade,
  to_addr     text,
  subject     text,
  body        text,
  reply_to_conversation_id uuid references public.email_conversations(id) on delete set null,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists idx_email_drafts_acc on public.email_drafts(account_id, updated_at desc);

alter table public.email_drafts enable row level security;
drop policy if exists email_drafts_all on public.email_drafts;
create policy email_drafts_all on public.email_drafts for all to public using (true) with check (true);

notify pgrst, 'reload schema';
