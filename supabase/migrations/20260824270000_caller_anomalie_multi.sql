-- ANOMALIE MULTI-VENDITA (Luca 24/08 sera): una proposta può collegare
-- PIÙ vendite (marginalità, più operatori). contract_id resta (compat:
-- prima vendita), l'elenco completo vive in contract_ids.
alter table public.caller_anomalie
    add column if not exists contract_ids jsonb not null default '[]'::jsonb;
