-- 125: CHIUSURA LINEA — ticketing disdette operatori (Luca 01/08)
-- Sostituisce lo scambio moduli su WhatsApp/Email con ticket tracciati.
-- Stati: in_attesa | da_integrare | gestita. Id leggibile DS-<progressivo>.
-- La timeline della scheda cliente legge gli eventi dal campo storico (jsonb).
-- "Riga in piu'" negli Incarichi: designati che ricevono il task ⚡ a ogni
-- invio o reintegro (fulmine attivo di default, spegnibile dalla sezione).

create sequence if not exists public.disdette_seq start 101;

create table if not exists public.richieste_disdette (
  id text primary key default ('DS-' || nextval('public.disdette_seq')),
  client_id text not null references public.clients(id),
  consulente text not null default '',
  negozio text not null default '',
  brand text not null default '',
  status text not null default 'in_attesa' check (status in ('in_attesa','da_integrare','gestita')),
  files jsonb not null default '[]'::jsonb,
  note_consulente text not null default '',
  feedback_admin text not null default '',
  is_programmata boolean not null default false,
  data_programmata date,
  storico jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_disdette_client on public.richieste_disdette (client_id);
create index if not exists idx_disdette_status on public.richieste_disdette (status);

-- LEZIONE mig. 119: su questo Supabase le CREATE TABLE nascono con RLS ON
alter table public.richieste_disdette disable row level security;

insert into public.incarichi (chiave, titolo, descrizione, assegnatari, fulmine) values
  ('chiusura_linea', 'Chiusura Linea (disdette)',
   'I designati ricevono il task ⚡ a ogni invio o reintegro di una richiesta di disdetta. Senza designati non parte nessun task.',
   '{}'::uuid[], true)
on conflict (chiave) do nothing;

notify pgrst, 'reload schema';
