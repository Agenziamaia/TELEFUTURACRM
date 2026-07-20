-- 063: delega verifica pratica (Tracking PDA). Uno store manager/admin puo' delegare
-- la verifica di un contratto a un collaboratore; il delegato e lo SM vedono la pratica.
alter table public.contracts
  add column if not exists delegated_to uuid references public.app_users(id) on delete set null,
  add column if not exists delegated_by uuid references public.app_users(id) on delete set null;
create index if not exists idx_contracts_delegated_to on public.contracts(delegated_to);
notify pgrst, 'reload schema';
