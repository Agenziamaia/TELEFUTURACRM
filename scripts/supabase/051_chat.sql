-- 051: chat interna tra gli account (app_users) — DM 1-a-1 + gruppi, con allegati.
-- Messaggistica aperta (chiunque puo' scrivere a chiunque). Le categorie (area/negozio/
-- ruolo) organizzano solo la rubrica lato UI, non limitano l'accesso.

create extension if not exists pgcrypto;

-- ── Tabelle ────────────────────────────────────────────────────────────────
create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'dm' check (type in ('dm','group')),
  title text,                    -- nome del gruppo (null per i DM)
  dm_key text unique,            -- 'minUUID|maxUUID': deduplica i DM fra due utenti
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table if not exists public.chat_participants (
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  is_admin boolean not null default false,      -- proprietario/moderatore del gruppo
  last_read_at timestamptz not null default now(),  -- guida i "non letti"
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_id uuid references public.app_users(id) on delete set null,
  body text,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

create table if not exists public.chat_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  url text not null,
  name text,
  mime text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_part_user on public.chat_participants(user_id);
create index if not exists idx_chat_msg_conv  on public.chat_messages(conversation_id, created_at desc);
create index if not exists idx_chat_conv_last on public.chat_conversations(last_message_at desc);

-- ── last_message_at bump on new message ─────────────────────────────────────
create or replace function public.chat_bump_conversation()
returns trigger language plpgsql as $$
begin
  update public.chat_conversations set last_message_at = now() where id = new.conversation_id;
  return new;
end $$;
drop trigger if exists trg_chat_bump on public.chat_messages;
create trigger trg_chat_bump after insert on public.chat_messages
  for each row execute function public.chat_bump_conversation();

-- ── RLS: allow-all anon (coerente con tutte le altre tabelle del progetto) ───
alter table public.chat_conversations enable row level security;
alter table public.chat_participants  enable row level security;
alter table public.chat_messages      enable row level security;
alter table public.chat_attachments   enable row level security;
drop policy if exists "chat_conv_all"  on public.chat_conversations;
create policy "chat_conv_all"  on public.chat_conversations for all using (true) with check (true);
drop policy if exists "chat_part_all"  on public.chat_participants;
create policy "chat_part_all"  on public.chat_participants  for all using (true) with check (true);
drop policy if exists "chat_msg_all"   on public.chat_messages;
create policy "chat_msg_all"   on public.chat_messages      for all using (true) with check (true);
drop policy if exists "chat_att_all"   on public.chat_attachments;
create policy "chat_att_all"   on public.chat_attachments   for all using (true) with check (true);

-- ── Realtime: aggiungi le tabelle alla publication (idempotente) ─────────────
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='chat_messages') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='chat_participants') then
    alter publication supabase_realtime add table public.chat_participants;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='chat_conversations') then
    alter publication supabase_realtime add table public.chat_conversations;
  end if;
end $$;

-- ── Storage: bucket per gli allegati chat ───────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-attachments','chat-attachments', true, 26214400,
        array['application/pdf','image/jpeg','image/png','image/webp','image/gif']::text[])
on conflict (id) do nothing;

drop policy if exists "chat_att_select" on storage.objects;
create policy "chat_att_select" on storage.objects for select using (bucket_id='chat-attachments');
drop policy if exists "chat_att_insert" on storage.objects;
create policy "chat_att_insert" on storage.objects for insert with check (bucket_id='chat-attachments');
drop policy if exists "chat_att_update" on storage.objects;
create policy "chat_att_update" on storage.objects for update using (bucket_id='chat-attachments');
drop policy if exists "chat_att_delete" on storage.objects;
create policy "chat_att_delete" on storage.objects for delete using (bucket_id='chat-attachments');

notify pgrst, 'reload schema';
