-- print_jobs.meta: metadati leggibili del job (total, sconto, azienda, tipo, importo
-- cassa...) per il pannello "Cassa & Scontrini" in Amministrazione (spec Luca) — così
-- si vedono importi e stato senza dover parsare l'XML ePOS.
alter table public.print_jobs add column if not exists meta jsonb;
comment on column public.print_jobs.meta is 'Metadati leggibili del job (total, sconto, azienda, tipo, importo cassa) per il pannello Cassa & Scontrini.';
notify pgrst, 'reload schema';
