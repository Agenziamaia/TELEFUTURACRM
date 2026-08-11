-- BACKFILL contracts.tipo_cliente (MOD-30, Luca 10/08): il filtro "Tipo
-- cliente" di Ricerca Vendite legge questa colonna, ma 1261 righe storiche
-- sono nate senza (il dato viveva solo su clients.tipo). Si eredita dal
-- cliente collegato, nella forma gia' in uso ('Consumer'/'Business').
-- Le righe senza cliente (es. marginalita' interna) restano NULL e compaiono
-- solo col filtro spento. Idempotente.
UPDATE public.contracts c
SET tipo_cliente = initcap(cl.tipo)
FROM public.clients cl
WHERE c.client_id = cl.id
  AND (c.tipo_cliente IS NULL OR c.tipo_cliente = '')
  AND cl.tipo IN ('consumer', 'business');

NOTIFY pgrst, 'reload schema';
