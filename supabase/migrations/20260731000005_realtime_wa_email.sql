-- Mig. 111 — Notifiche messaggi (Luca 31/07/2026): i toast per WhatsApp e
-- mail ascoltano gli INSERT via realtime, quindi wa_messages ed
-- email_messages devono stare nella publication supabase_realtime
-- (chat_messages c'e' gia' dalla mig. 051).
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wa_messages') then
    alter publication supabase_realtime add table public.wa_messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'email_messages') then
    alter publication supabase_realtime add table public.email_messages;
  end if;
end $$;
