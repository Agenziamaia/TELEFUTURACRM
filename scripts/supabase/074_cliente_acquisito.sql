-- 074: "Acquisito nel negozio di" per ogni cliente.
--
-- Segnalazione 56: nel dettaglio cliente deve comparire il negozio che ha
-- registrato il PRIMO contratto (o "Agenzia" se acquisito dall'agenzia). Il dato
-- e' storico: non cambia se in seguito un altro negozio registra un contratto
-- per lo stesso cliente.

alter table public.clients add column if not exists acquisito_da text;

comment on column public.clients.acquisito_da is
  'Negozio che ha acquisito il cliente (primo contratto), oppure "Agenzia". Storico: non si modifica ai contratti successivi.';

-- Backfill: il negozio del contratto piu' vecchio di ogni cliente.
update public.clients cl
set acquisito_da = sub.negozio
from (
  select distinct on (client_id) client_id, negozio
  from public.contracts
  where negozio is not null and btrim(negozio) <> ''
  order by client_id, created_at asc
) sub
where cl.id = sub.client_id
  and coalesce(btrim(cl.acquisito_da), '') = '';

notify pgrst, 'reload schema';
