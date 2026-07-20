-- 062: archiviazione documenti "OLD" (pdf non piu' aggiornati).
alter table public.documentation
  add column if not exists archived boolean not null default false;
notify pgrst, 'reload schema';
