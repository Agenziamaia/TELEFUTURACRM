-- GRUPPO OPZIONI OBBLIGATORIO (Luca 14/08, caso Protecta): l'opzione marcata
-- obbligatoria rende il suo gruppo (gruppo_singolo) A SCELTA OBBLIGATORIA in
-- Registra Vendita — la vendita non è completa finché una del gruppo non è
-- selezionata. Feature generale: vale per qualunque offerta futura.
alter table public.catalog_opzioni add column if not exists obbligatoria boolean not null default false;
comment on column public.catalog_opzioni.obbligatoria is
  'Il gruppo (gruppo_singolo) di questa opzione richiede una scelta in Registra Vendita (es. Protecta: kit e pagamento).';
notify pgrst, 'reload schema';
