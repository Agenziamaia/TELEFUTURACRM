-- 064: richieste di modifica contratto con approvazione amministrazione.
-- Lo store manager (o superiore) puo' modificare qualsiasi dato, ma la modifica
-- NON e' immediata: genera una richiesta che l'amministrazione approva o rifiuta.
create table if not exists public.contract_change_requests (
  id uuid primary key default gen_random_uuid(),
  contract_id text not null,
  requested_by uuid references public.app_users(id) on delete set null,
  requested_by_name text,
  changes jsonb not null default '{}'::jsonb,   -- { campo: { da, a } }
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references public.app_users(id) on delete set null,
  reviewed_by_name text,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);
-- La motivazione scritta dal richiedente vive dentro `changes` sotto la chiave
-- riservata "__meta" ({ note }), cosi' il payload resta autocontenuto.
create index if not exists idx_ccr_status on public.contract_change_requests(status, created_at desc);
create index if not exists idx_ccr_contract on public.contract_change_requests(contract_id);

alter table public.contract_change_requests enable row level security;
drop policy if exists "ccr_all" on public.contract_change_requests;
create policy "ccr_all" on public.contract_change_requests for all using (true) with check (true);

notify pgrst, 'reload schema';
