-- Registra Vendita, fisso W3 (Luca 25/08 sera): «prima scelta GA o GNP,
-- seconda FTTC/FTTH/FTTH Extra, poi tutte le altre».
-- ① Rame 100/200 SPENTA («ricade sotto FTTH», non serve più come opzione).
-- ② Ordini riscritti così i gruppi obbligatori vengono per primi e in fila:
--    attivazione (GA 1, GNP 2) → tecnologia (FTTC 3, FTTH 4, FTTH Extra 5);
--    le altre opzioni restano coi loro ordini (compaiono dopo, nella riga
--    delle facoltative). Idempotente.
update catalog_opzioni o
   set attivo = false
  from catalog_offerte off
  join catalog_prodotti p on p.id = off.prodotto_id
 where off.id = o.offerta_id and p.brand_id = 'windtre' and o.nome = 'Rame 100/200';

update catalog_opzioni o
   set ordine = case o.nome when 'GA' then 1 when 'GNP' then 2 when 'FTTC' then 3 when 'FTTH' then 4 when 'FTTH Extra' then 5 end
  from catalog_offerte off
  join catalog_prodotti p on p.id = off.prodotto_id
 where off.id = o.offerta_id and p.brand_id = 'windtre'
   and o.nome in ('GA', 'GNP', 'FTTC', 'FTTH', 'FTTH Extra')
   and o.gruppo_singolo in ('attivazione', 'tecnologia');
