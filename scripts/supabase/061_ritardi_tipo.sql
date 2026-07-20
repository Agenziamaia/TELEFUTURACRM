-- 061: tipo di ritardo (Pre / Post apertura) sulla segnalazione ritardi.
alter table public.ritardi
  add column if not exists tipo text;   -- 'pre' | 'post' | null
notify pgrst, 'reload schema';
