-- 100: richieste di modifica/cancellazione ritardi con approvazione amministrazione.
-- Segnalazione #111 (manu): lo store manager deve poter MODIFICARE un ritardo e
-- CHIEDERE la CANCELLAZIONE, ma nessuna delle due e' immediata: genera una
-- richiesta che l'amministrazione (amministrativo/direzione) approva o rifiuta.
-- "In entrambi i casi deve arrivare la richiesta in amministrazione."
-- Stesso schema di 064_contract_change_requests (coda approvazioni gia' nota).
create table if not exists public.ritardi_change_requests (
  id uuid primary key default gen_random_uuid(),
  ritardo_id text not null,                     -- id del ritardo (text: niente FK, robusto a cancellazioni)
  tipo text not null check (tipo in ('modifica','cancellazione')),
  employee_name text,                           -- snapshot: mostra la richiesta anche se il ritardo cambia/sparisce
  store text,
  changes jsonb not null default '{}'::jsonb,   -- solo 'modifica': { campo: { da, a } } + "__meta": { note }
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_by uuid references public.app_users(id) on delete set null,
  requested_by_name text,
  reviewed_by uuid references public.app_users(id) on delete set null,
  reviewed_by_name text,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_rcr_status on public.ritardi_change_requests(status, created_at desc);
create index if not exists idx_rcr_ritardo on public.ritardi_change_requests(ritardo_id);

alter table public.ritardi_change_requests enable row level security;
drop policy if exists "rcr_all" on public.ritardi_change_requests;
create policy "rcr_all" on public.ritardi_change_requests for all using (true) with check (true);

notify pgrst, 'reload schema';
