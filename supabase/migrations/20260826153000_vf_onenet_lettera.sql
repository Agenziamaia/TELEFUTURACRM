-- VF lettera A · tabella 5.1 (wireline SHP/SMALL): le tre offerte OneNet
-- erano state AGGIUNTE al catalogo dopo il seed del tabellare (le note delle
-- righe dicevano «OneNet Ufficio/Azienda … non a catalogo») ma le righe pay
-- non sono mai nate → nel Calcolatore risultavano «senza commissioning»
-- (segnalazione Luca 26/08, 14 scoperte VF). Valori ESATTI dalla lettera
-- (novita_vodafone_tabelle.json, screenshot 04/08):
--   col 3  OneBusiness Smart / OneNet P.IVA Mini → base 65, 115/130/155/185/220/245, 1 pt
--   col 7  OneNet Ufficio / FW_Web Bus / FW_Unlimited Bus → base 200, 270/275/280/285/290/310, 3 pt
--   col 8  OneNet Azienda → base 200, 320/410/490/590/645/660, 4 pt
-- Convenzione VF business fisso: ragazzi = azienda identici (come le sorelle);
-- azienda prodotto NULL, ragazzi prodotto 'Fisso'. Zero vendite storiche con
-- questi nomi → nessun effetto retroattivo.
insert into pay_righe (brand, month, lato, pista, nome, tipo_cliente, categoria, prodotto, offerta, brand_vendita, moltiplicatore, punti, pay_base, pay_tiers, gettone, attivo, ordine, note)
select v.* from (values
  ('vodafone','2026-08-01'::date,'azienda','business_fisso','OneNet P.IVA Mini','Business','Fisso',null,'Onpi Mini','vodafone',false,1.00,65.00,'{115,130,155,185,220,245}'::numeric[],false,true,69,'Lettera 5.1 col.3 (con OneBusiness Smart) — riga nata 26/08: offerta aggiunta a catalogo dopo il seed'),
  ('vodafone','2026-08-01'::date,'ragazzi','business_fisso','OneNet P.IVA Mini','Business','Fisso','Fisso','Onpi Mini','vodafone',false,1.00,65.00,'{115,130,155,185,220,245}'::numeric[],false,true,49,'Lettera 5.1 col.3 (con OneBusiness Smart) — riga nata 26/08: offerta aggiunta a catalogo dopo il seed'),
  ('vodafone','2026-08-01'::date,'azienda','business_fisso','OneNet Ufficio','Business','Fisso',null,'One Net Ufficio','vodafone',false,3.00,200.00,'{270,275,280,285,290,310}'::numeric[],false,true,77,'Lettera 5.1 col.7 (con FW Web Bus / FW Unlimited Bus) — riga nata 26/08: offerta aggiunta a catalogo dopo il seed'),
  ('vodafone','2026-08-01'::date,'ragazzi','business_fisso','OneNet Ufficio','Business','Fisso','Fisso','One Net Ufficio','vodafone',false,3.00,200.00,'{270,275,280,285,290,310}'::numeric[],false,true,54,'Lettera 5.1 col.7 (con FW Web Bus / FW Unlimited Bus) — riga nata 26/08: offerta aggiunta a catalogo dopo il seed'),
  ('vodafone','2026-08-01'::date,'azienda','business_fisso','OneNet Azienda','Business','Fisso',null,'One Net Azienda','vodafone',false,4.00,200.00,'{320,410,490,590,645,660}'::numeric[],false,true,78,'Lettera 5.1 col.8 — riga nata 26/08: offerta aggiunta a catalogo dopo il seed'),
  ('vodafone','2026-08-01'::date,'ragazzi','business_fisso','OneNet Azienda','Business','Fisso','Fisso','One Net Azienda','vodafone',false,4.00,200.00,'{320,410,490,590,645,660}'::numeric[],false,true,55,'Lettera 5.1 col.8 — riga nata 26/08: offerta aggiunta a catalogo dopo il seed')
) as v(brand, month, lato, pista, nome, tipo_cliente, categoria, prodotto, offerta, brand_vendita, moltiplicatore, punti, pay_base, pay_tiers, gettone, attivo, ordine, note)
where not exists (
  select 1 from pay_righe r
  where r.brand = v.brand and r.month = v.month and r.lato = v.lato and r.offerta = v.offerta
);

-- Le note del seed dicevano «OneNet Ufficio/Azienda e FW Web Business non a
-- catalogo»: ora Ufficio/Azienda a catalogo ci sono (e pagano) — resta vero
-- solo per FW Web Business.
update pay_righe
   set note = 'FW Web Business non a catalogo (paga come OneNet Ufficio, lettera 5.1 col.7)'
 where brand = 'vodafone' and month = '2026-08-01'
   and note = 'OneNet Ufficio/Azienda e FW Web Business non a catalogo (270-660€, peso 3-4)';

-- «Fissa Wireless 5G» era DOPPIA a catalogo: sotto il prodotto FWA (coperta
-- dalla riga pay ragazzi, che la ancora a prodotto FWA) e sotto il prodotto
-- Fisso (mai matchata → scopertura fantasma). È un FWA per natura: si spegne
-- la copia sotto «Fisso». Zero vendite storiche con entrambe le copie.
update catalog_offerte o
   set attivo = false
 where o.id = 'f076ecb6-ea14-4d95-882f-b2ecb81cf2f0'   -- copia sotto prodotto "Fisso"
   and exists (select 1 from catalog_offerte fwa where fwa.id = '6937bce6-3305-41fb-a18d-2dd43bcfce56' and coalesce(fwa.attivo, true));
