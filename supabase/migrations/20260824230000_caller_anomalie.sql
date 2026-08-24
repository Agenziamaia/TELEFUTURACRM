-- ATTIVATO ANOMALIA CON APPROVAZIONE (Luca 24/08): il caller lo PROPONE con
-- nota obbligatoria; la proposta arriva all'amministrazione che approva
-- collegando la VENDITA (senza vendita lo stato non genererebbe commissioning
-- in cooperation) oppure rifiuta con nota. La pratica cambia stato SOLO
-- all'approvazione.
create table if not exists public.caller_anomalie (
  id bigint generated always as identity primary key,
  call_id uuid not null,
  caller text not null,
  nota text not null,
  stato text not null default 'in_attesa' check (stato in ('in_attesa','approvata','rifiutata')),
  contract_id text,
  decisa_da text,
  decisa_il timestamptz,
  nota_decisione text,
  created_at timestamptz default now()
);
create index if not exists caller_anomalie_stato_idx on public.caller_anomalie (stato);
-- il trigger auto-RLS accende RLS sulle tabelle nuove: serve la policy
alter table public.caller_anomalie enable row level security;
drop policy if exists caller_anomalie_open on public.caller_anomalie;
create policy caller_anomalie_open on public.caller_anomalie for all using (true) with check (true);
