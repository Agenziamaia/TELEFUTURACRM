-- REGOLE TEMPORALI del match vendita ↔ appuntamento (Luca 24/08): la
-- finestra era cablata a 30 giorni nel codice — ora si governa dal pannello
-- Amministrazione → Call Center. Riga singola (id=1).
create table if not exists public.caller_match_config (
  id int primary key default 1 check (id = 1),
  finestra_giorni int not null default 30,
  updated_at timestamptz default now()
);
insert into public.caller_match_config (id) values (1) on conflict (id) do nothing;
-- il trigger auto-RLS accende RLS sulle tabelle nuove: serve la policy
alter table public.caller_match_config enable row level security;
drop policy if exists caller_match_config_open on public.caller_match_config;
create policy caller_match_config_open on public.caller_match_config for all using (true) with check (true);
