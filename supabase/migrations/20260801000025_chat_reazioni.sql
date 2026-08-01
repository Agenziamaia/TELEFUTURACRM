-- 130: CHAT INTERNA — reazioni emoji ai messaggi stile Telegram (Luca 01/08)
-- Una riga per (messaggio, utente, emoji): insert = metti la reazione,
-- delete = toglila — niente read-modify-write concorrente su jsonb.
-- FK con CASCADE cosi' PostgREST embedda le reazioni dentro chat_messages
-- e l'eliminazione di un messaggio si porta via le sue reazioni.

create table if not exists public.chat_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  user_id uuid not null,
  user_name text not null default '',
  emoji text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_chat_reactions on public.chat_reactions (message_id, user_id, emoji);
create index if not exists idx_chat_reactions_msg on public.chat_reactions (message_id);

-- LEZIONE mig. 119: RLS OFF sulle tabelle nuove
alter table public.chat_reactions disable row level security;

-- realtime: le reazioni compaiono in diretta a chi ha la chat aperta
-- (stesso pattern della mig. 111 per wa/email)
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_reactions') then
    alter publication supabase_realtime add table public.chat_reactions;
  end if;
end $$;

notify pgrst, 'reload schema';
