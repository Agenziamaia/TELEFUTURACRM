-- ═══════════════════════════════════════════════════════════════════════════
-- LE POWER BANK ESCONO DA «ACCESSORI» (Luca 29/08)
--
-- «Mi sono appena reso conto che le opzioni delle powerbank stavano dentro
--  gli accessori: sarebbe meglio dividerle e dargli la categoria dedicata.»
--
-- Le quattro voci ci sono già e hanno la loro storia: si SPOSTANO, non si
-- ricreano — stessi id, così niente si perde per strada.
--
-- «Accessori» resta con otto voci: i quattro auricolari, la pochette, il
-- laccio, l'orologio e la new cover. Ear Buds e Orologio Cash restano lì
-- dentro per scelta di Luca, «per snellire la barra».
-- ═══════════════════════════════════════════════════════════════════════════

insert into cassa_gruppi (nome, icona, ordine)
select 'Power Bank', '🔋', 15
where not exists (select 1 from cassa_gruppi where nome = 'Power Bank');

update cassa_gruppo_voci v
   set gruppo_id = (select id from cassa_gruppi where nome = 'Power Bank'),
       ordine = case v.codice when 'POWER5000' then 10 when 'POWER10000' then 20
                              when 'POWER20000' then 30 else 40 end,
       -- il codice non è un nome: sul pulsante ci va la taglia
       etichetta = case v.codice when 'POWER5000' then 'Power Bank 5.000'
                                 when 'POWER10000' then 'Power Bank 10.000'
                                 when 'POWER20000' then 'Power Bank 20.000'
                                 else 'Power Bank MagSafe' end
 where v.codice in ('POWER5000','POWER10000','POWER20000','POWERMAGSAFE');
