-- FIX BLOCCANTE (revisore 25/08 notte): il vecchio tabellare ragazzi pagava
-- le 3P promo 29,90/27,90 con la riga generica «3P» [270,300,310,320]; le
-- righe azienda SPECIFICHE delle promo (che vincono il match) erano rimaste
-- senza pay_ragazzi_tiers → derivavano al 100% dei valori azienda
-- [65,135,200,235…]: 92 vendite di agosto a ~−110€/pezzo per i ragazzi.
-- Si congela il manuale storico anche su di loro. E si allinea
-- brand_vendita='sky' sulle 2 gemelle 35,90 (coerenza col seed).
update pay_righe set pay_ragazzi_tiers = '{270,300,310,320}'::numeric[]
 where brand = 'sky' and month = '2026-08-01' and lato = 'azienda'
   and nome in ('Triple Play · promo 29,90', 'Triple Play · promo 27,90')
   and pay_ragazzi_tiers is null;

update pay_righe set brand_vendita = 'sky'
 where brand = 'sky' and month = '2026-08-01' and lato = 'azienda'
   and nome in ('Triple Play · promo 35,90 Cinema', 'Triple Play · promo 35,90 Sport')
   and brand_vendita is null;
