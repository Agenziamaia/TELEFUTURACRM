-- MATCH VENDITE ↔ APPUNTAMENTI — struttura (mig. 192, cantiere 08/08)
--
-- Fino a oggi non esisteva alcun legame tra una vendita e l'appuntamento che
-- l'ha generata. Regole decise con Luca: ponte = CF; finestra 30gg dalla data
-- appuntamento fissata; gemelli per sede fisica; l'esito "attivato" arriva SOLO
-- dal match con una vendita registrata (mai più a mano dal negozio).

-- 1) legame vendita → appuntamento (una riga contratto punta all'appuntamento
--    che l'ha attivata; NULL = vendita senza appuntamento)
alter table public.contracts
  add column if not exists appointment_id bigint;
create index if not exists contracts_appointment_id_idx on public.contracts(appointment_id) where appointment_id is not null;

-- 2) legame pratica caller → vendita (per far sparire la riga dal "da lavorare"
--    e per il commissioning caller futuro)
alter table public.calls
  add column if not exists contract_id text;
create index if not exists calls_contract_id_idx on public.calls(contract_id) where contract_id is not null;

-- 3) TOMBSTONE su caller_malus (stesso pattern di malus_storico dei venditori):
--    il backfill e il match devono poter ANNULLARE un malus caller in modo
--    definitivo; senza questo la sync deterministica lo ricreerebbe.
alter table public.caller_malus
  add column if not exists eliminato boolean not null default false,
  add column if not exists eliminato_il timestamptz,
  add column if not exists eliminato_da text;

-- 4) lookup rapido degli appuntamenti per CF (banner in Registra Vendita e match)
create index if not exists appointments_cf_upper_idx on public.appointments(upper(cf_piva));

notify pgrst, 'reload schema';
