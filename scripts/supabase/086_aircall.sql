-- Integrazione Aircall (centralino cloud) — log chiamate per caller e negozi.
--
-- Le chiamate arrivano dai webhook di Aircall e vengono registrate qui, collegate
-- al cliente (per numero) e al negozio/utente (per numero Aircall). Tabella
-- separata dalla `calls` del flusso caller: quella e' il lavoro sul lead, questa
-- e' il registro telefonico grezzo (durata, esito, registrazione).

-- 1) mappatura identita'
alter table public.app_users add column if not exists aircall_user_id bigint;
alter table public.stores    add column if not exists aircall_number_id bigint;

-- 2) registro chiamate
create table if not exists public.call_events (
  id             uuid primary key default gen_random_uuid(),
  aircall_call_id bigint unique,             -- id chiamata su Aircall (idempotenza)
  direction      text,                        -- inbound | outbound
  status         text,                        -- initial | answered | done | ...
  from_number    text,
  to_number      text,
  cliente_num    text,                        -- numero del cliente (l'altro capo)
  aircall_user_id bigint,                     -- agente Aircall che ha gestito
  agente_nome    text,
  aircall_number_id bigint,                   -- numero Aircall coinvolto (-> negozio)
  negozio        text,                        -- negozio derivato dal numero
  answered       boolean not null default false,
  duration_sec   integer,
  recording_url  text,                        -- dato sensibile: mostrato solo ai ruoli alti
  missed         boolean not null default false,
  started_at     timestamptz,
  answered_at    timestamptz,
  ended_at       timestamptz,
  client_id      text references public.clients(id) on delete set null,
  raw            jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists call_events_client_idx on public.call_events (client_id);
create index if not exists call_events_num_idx     on public.call_events (cliente_num);
create index if not exists call_events_started_idx on public.call_events (started_at desc);
create index if not exists call_events_user_idx    on public.call_events (aircall_user_id);

alter table public.call_events enable row level security;
drop policy if exists call_events_all on public.call_events;
create policy call_events_all on public.call_events for all using (true) with check (true);
