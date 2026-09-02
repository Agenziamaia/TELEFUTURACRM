-- ─────────────────────────────────────────────────────────────────────────────
-- Bacheca supporto: stato locale dei PC negozio + segnalazioni.
-- Alimentata dall'EXE "Telefutura Cassa" su ogni PC (POST /api/agent/report).
-- Il cloud non vede lo stato LOCALE (agente vivo? registratore libero? cassa in
-- rete?): qui lo raccogliamo, cosi' il supporto ha una bacheca live dei 15 negozi.
-- ─────────────────────────────────────────────────────────────────────────────

-- Una riga per negozio: l'ultimo stato locale ricevuto (upsert a ogni heartbeat).
create table if not exists public.agent_status (
  negozio               text primary key,
  agente                boolean,
  registratore_libero   boolean,
  cassa                 boolean,
  crm                   boolean,
  pc                    text,
  versione              text,
  updated_at            timestamptz not null default now()
);

-- Append-only: azioni fatte dallo staff (riavvio, libera cassa) e segnalazioni.
create table if not exists public.agent_reports (
  id                    uuid primary key default gen_random_uuid(),
  negozio               text not null,
  tipo                  text not null,           -- 'azione' | 'problema'
  nota                  text,
  agente                boolean,
  registratore_libero   boolean,
  cassa                 boolean,
  crm                   boolean,
  pc                    text,
  risolto               boolean not null default false,
  created_at            timestamptz not null default now()
);

create index if not exists agent_reports_negozio_idx on public.agent_reports (negozio, created_at desc);
create index if not exists agent_reports_aperti_idx on public.agent_reports (created_at desc) where risolto = false;

-- RLS on, nessuna policy pubblica: solo il server (service_role) legge/scrive,
-- come le altre tabelle blindate. La bacheca passa da una route server.
alter table public.agent_status  enable row level security;
alter table public.agent_reports enable row level security;
