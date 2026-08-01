-- 131: USATO — i telefoni in "arrivo in negozio" intestati alla DESTINAZIONE
-- (Luca 01/08, test Eros/Baleniere): il codice ora scrive store = negozio di
-- destinazione al momento dell'invio; qui si allineano le righe gia' in
-- invio_in_negozio rimaste intestate al negozio d'origine.
update public.usati
   set store = target_store
 where status = 'invio_in_negozio'
   and target_store is not null
   and store is distinct from target_store;
notify pgrst, 'reload schema';
