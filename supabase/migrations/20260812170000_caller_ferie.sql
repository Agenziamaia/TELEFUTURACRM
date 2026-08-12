-- FERIE AZIENDALI del call center (esito Luca 12/08 sulla riga caller badge):
-- «periodo di ferie che è per tutti dal 12 al 19 agosto compresi». Nei giorni
-- di ferie il countdown delle pratiche resta congelato per tutti — anche per
-- chi ha il badge presunto (direttore_cc, che si dà per assodato lun-sab).
create table if not exists caller_ferie (
  id uuid primary key default gen_random_uuid(),
  dal date not null,
  al date not null,
  nota text,
  created_at timestamptz not null default now()
);

alter table caller_ferie enable row level security;
drop policy if exists caller_ferie_allow_all on caller_ferie;
create policy caller_ferie_allow_all on caller_ferie
  for all using (true) with check (true);

insert into caller_ferie (dal, al, nota)
select '2026-08-12', '2026-08-19', 'Ferie aziendali di agosto (Luca 12/08)'
where not exists (select 1 from caller_ferie where dal = '2026-08-12' and al = '2026-08-19');
