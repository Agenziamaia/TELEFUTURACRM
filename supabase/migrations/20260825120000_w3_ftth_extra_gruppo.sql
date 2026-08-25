-- FTTH Extra DENTRO il gruppo «tecnologia» (revisore 25/08: due vendite di
-- agosto hanno FTTH Extra senza FTTH — col gate obbligatorio il venditore
-- sarebbe costretto a una dichiarazione ridondante o contraddittoria,
-- FTTC + FTTH Extra compresa). La scelta diventa una sola tra
-- FTTC | FTTH | FTTH Extra; il pay non cambia: la componente ftth si
-- accende sia da FTTH sia da FTTH Extra. «Rame 100/200» resta fuori
-- (semantica da chiarire con Luca). Idempotente.
update catalog_opzioni o
   set gruppo_singolo = 'tecnologia', obbligatoria = true
  from catalog_offerte off
  join catalog_prodotti p on p.id = off.prodotto_id
 where off.id = o.offerta_id and p.brand_id = 'windtre' and o.nome = 'FTTH Extra';
