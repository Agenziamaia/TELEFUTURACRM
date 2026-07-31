-- 106: coda di stampa per la stampante fiscale Epson RT (protocollo ePOS/fpMate).
-- Il cloud NON raggiunge il LAN del negozio (IP privato 192.168.1.50): un agente
-- nel negozio ritira i job da /api/print/next, li inoltra a /cgi-bin/fpmate.cgi
-- sulla stampante e riporta l'esito a /api/print/result. Qui vive solo la coda.

create extension if not exists pgcrypto;

create table if not exists public.print_jobs (
  id          uuid primary key default gen_random_uuid(),
  negozio     text,                                   -- destinazione (quale agente lo ritira); null = qualsiasi
  device_url  text not null default 'http://192.168.1.50', -- base URL della stampante sul LAN
  kind        text not null default 'status',         -- status | test | non_fiscal | raw
  request_xml text not null,                          -- XML ePOS/fpMate SENZA busta SOAP (l'agente la aggiunge)
  status      text not null default 'pending' check (status in ('pending','sent','done','error')),
  result      text,                                   -- risposta stampante o messaggio d'errore
  attempts    int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_print_jobs_pending on public.print_jobs(status, negozio, created_at);

-- RLS allow-all coerente col resto del progetto; l'autorizzazione vera è il
-- token PRINT_AGENT_TOKEN controllato a livello di API route.
alter table public.print_jobs enable row level security;
drop policy if exists print_jobs_all on public.print_jobs;
create policy print_jobs_all on public.print_jobs for all using (true) with check (true);

notify pgrst, 'reload schema';
