-- ═══ DI CHI ERA IL TELEFONO QUANDO L'ABBIAMO COMPRATO ═════════════════════
-- Luca 02/09: «noi compriamo i telefoni da una società e li vendiamo a
-- un'altra: per esempio a Magliana gli usati vengono spesso venduti come
-- Telefutura 2, ma la maggior parte vengono comprati con Telefutura 1. Nel
-- momento in cui viene venduto un usato dobbiamo verificare qual è la società
-- che lo ha comprato, e quando c'è disparità fra le due lo registriamo: serve
-- un file per il commercialista con prezzo di vendita, società che ha
-- comprato, società che ha venduto, quando l'abbiamo comprato e quando
-- l'abbiamo venduto — così lui si aggiusta la contabilità e ci dice gli importi
-- da fatturare da una società all'altra».
--
-- ⚠️ QUESTO DATO NON ESISTEVA. `usati` non aveva NESSUNA colonna che dicesse di
-- chi è il telefono: la si deduceva dal negozio, e quattro negozi su otto
-- (Acilia, Magliana, Donna, Collatina) ospitano due società alla cassa. Su 141
-- telefoni la deduzione era una scommessa.
--
-- ⚠️ E NON SI INVENTA. Il file «Recap Storico Usati» del vecchio gestionale la
-- dice per 405 telefoni; di quelli, 207 sono in Gestione Usati oggi. Gli altri
-- 74 restano SENZA società d'acquisto, e la scheda lo dirà: un campo vuoto è un
-- dato onesto, una società indovinata su un documento fiscale no.

alter table public.usati
    add column if not exists azienda_acquisto text,
    add column if not exists negozio_acquisto_gest text,
    add column if not exists doc_acquisto text,
    add column if not exists azienda_vendita text;

comment on column public.usati.azienda_acquisto is
  'La società che ha COMPRATO il telefono (T1/T2). ⚠️ Non si deduce dal negozio: quattro punti vendita ospitano due società alla cassa. Viene dal documento di acquisto.';
comment on column public.usati.azienda_vendita is
  'La società che lo ha VENDUTO, cioè quella della cassa su cui è uscito lo scontrino. Se diversa da azienda_acquisto, il telefono va nel file per il commercialista.';
comment on column public.usati.doc_acquisto is
  'Il documento di acquisto del vecchio gestionale (tipo e numero), per ritrovarlo in contabilità.';

create index if not exists usati_azienda_acquisto on public.usati (azienda_acquisto) where azienda_acquisto is not null;

create temp table _sto (imei text, azienda text, negozio text, doc text, dta date) on commit drop;
insert into _sto values
('357300547349483','T2','Multi - Circonvallazione Ostiense 259','RU 1','2026-01-22'),
('352603484845859','T2','Multi - Circonvallazione Ostiense 259','RU 14','2026-08-26'),
('354125562826153','T2','Acilia Sky','RU 66','2025-10-06'),
('351364391439598','T2','Acilia Sky','RU 69','2025-10-20'),
('352310190118809','T2','Acilia Sky','RU 21','2026-07-18'),
('351080472741906','T2','Acilia Sky','RU 20','2026-07-13'),
('354125562967973','T2','Multi - Promontori','RU 60','2025-07-30'),
('861159070597887','T2','Multi - Promontori','RU 9','2025-01-27'),
('354125562956216','T2','Multi - Promontori','RU 51','2025-07-16'),
('RFAY717NWKH','T2','Multi - Promontori','RU 3','2026-01-03'),
('354246517235637','T2','Multi - Promontori','RU 50','2026-08-25'),
('350070124386912','T2','Multi - Promontori','RU 51','2026-08-25'),
('354246517233756','T2','Multi - Promontori','RU 27','2026-05-25'),
('353843249649621','T2','Multi - Promontori','RU 24','2026-04-28'),
('352334371419034','T2','Multi - Promontori','RU 52','2026-08-27'),
('354246517312402','T2','Multi - Promontori','RU 49','2026-08-25'),
('352334371417111','T2','Multi - Promontori','RU 48','2026-08-25'),
('864846075457003','T2','Multi - Promontori','RU 47','2026-08-24'),
('863566089214502','T2','Multi - Promontori','RU 46','2026-08-24'),
('352334371035012','T2','Multi - Promontori','RU 45','2026-08-12'),
('352334371183234','T2','Multi - Promontori','RU 44','2026-07-29'),
('352334371182996','T2','Multi - Promontori','RU 43','2026-07-29'),
('352334371183010','T2','Multi - Promontori','RU 41','2026-07-14'),
('354246515884774','T2','Multi - Promontori','RU 20','2026-04-16'),
('352334371168771','T2','Multi - Promontori','RU 37','2026-06-22'),
('354246517309218','T2','Multi - Promontori','RU 29','2026-05-25'),
('354246517312485','T2','Multi - Promontori','RU 30','2026-05-25'),
('354246517186533','T2','Multi - Promontori','RU 32','2026-05-26'),
('354246517311594','T2','Multi - Promontori','RU 31','2026-05-26'),
('354246517185709','T2','Multi - Promontori','RU 19','2026-04-14'),
('354246517182557','T2','Multi - Promontori','RU 18','2026-04-14'),
('865094063789686','T2','Multi - Via della Magliana 263','RU 159','2025-07-16'),
('356703857160955','T2','Multi - Via della Magliana 263','RU 162','2025-07-19'),
('866502060553862','T2','Multi - Via della Magliana 263','RU 185','2024-10-07'),
('354125564446232','T2','Multi - Via della Magliana 263','RU 249','2025-11-06'),
('358819430841974','T2','Multi - Via della Magliana 263','RU 181','2025-08-27'),
('358165605779437','T2','Multi - Via della Magliana 263','RU 276','2024-12-22'),
('353854139187457','T2','Multi - Via della Magliana 263','RU 65','2025-02-28'),
('865249071697855','T2','Multi - Via della Magliana 263','RU 164','2025-07-21'),
('350992326343666','T2','Multi - Via della Magliana 263','RU 241','2025-10-29'),
('865784061097690','T2','Multi - Via della Magliana 263','RU 220','2025-09-30'),
('356785110325756','T2','Multi - Via della Magliana 263','RU 274','2025-12-10'),
('356192500778316','T2','Multi - Via della Magliana 263','RU 261','2025-11-26'),
('350069708113411','T2','Multi - Via della Magliana 263','RU 5','2026-01-13'),
('350636278030363','T2','Multi - Via della Magliana 263','RU 7','2026-01-15'),
('353730790231869','T2','Multi - Via della Magliana 263','RU 11','2026-01-22'),
('350966324163045','T2','Multi - Via della Magliana 263','RU 96','2026-07-28'),
('350798020817511','T2','Multi - Via della Magliana 263','RU 97','2026-07-28'),
('350967922602871','T2','Multi - Via della Magliana 263','RU 87','2026-07-14'),
('354267952210547','T2','Multi - Via della Magliana 263','RU 120','2026-08-31'),
('350424811662954','T2','Multi - Via della Magliana 263','RU 79','2026-06-22'),
('866257067742147','T2','Multi - Via della Magliana 263','RU 118','2026-08-27'),
('865254077537675','T2','Multi - Via della Magliana 263','RU 117','2026-08-26'),
('864287051460994','T2','Multi - Via della Magliana 263','RU 116','2026-08-24'),
('864436041432452','T2','Multi - Via della Magliana 263','RU 115','2026-08-24'),
('350480902117936','T2','Multi - Via della Magliana 263','RU 114','2026-08-21'),
('351044514286338','T2','Multi - Via della Magliana 263','RU 113','2026-08-20'),
('359058519624956','T2','Multi - Via della Magliana 263','RU 111','2026-08-11'),
('351133752225221','T2','Multi - Via della Magliana 263','RU 112','2026-08-11'),
('353994104866717','T2','Multi - Via della Magliana 263','RU 110','2026-08-06'),
('866381084399549','T2','Multi - Via della Magliana 263','RU 109','2026-08-06'),
('355888308217115','T2','Multi - Via della Magliana 263','RU 108','2026-08-06'),
('866068059609073','T2','Multi - Via della Magliana 263','RU 107','2026-08-03'),
('356716088220554','T2','Multi - Via della Magliana 263','RU 105','2026-08-01'),
('860907065442324','T2','Multi - Via della Magliana 263','RU 104','2026-08-01'),
('864794046667567','T2','Multi - Via della Magliana 263','RU 103','2026-08-01'),
('350048582963091','T2','Multi - Via della Magliana 263','RU 101','2026-07-30'),
('DLXTM0FKHND6','T2','Multi - Via della Magliana 263','RU 94','2026-07-24'),
('351788367573933','T2','Multi - Via della Magliana 263','RU 93','2026-07-22'),
('864573059728387','T2','Multi - Via della Magliana 263','RU 86','2026-07-11'),
('355350435757943','T2','Multi - Via della Magliana 263','RU 76','2026-06-17'),
('356781406953310','T2','Multi - Via della Magliana 263','RU 74','2026-06-12'),
('351490264991942','T2','Multi - Via della Magliana 263','RU 55','2026-04-17'),
('354246517169190','T2','Multi - Via della Magliana 263','RU 54','2026-04-16'),
('354246517187101','T2','Multi - Via della Magliana 263','RU 50','2026-04-14'),
('354246517187796','T2','Multi - Via della Magliana 263','RU 48','2026-04-10'),
('861585061096788','T2','Multi - Via della Magliana 263','RU 38','2026-03-19'),
('352273369183808','T2','Multi - Collatina','RU 21','2026-08-11'),
('354246517186855','T2','Multi - Collatina','RU 15','2026-06-04'),
('351490264993666','T1','Wind3 - Via della Magliana 263','RU 23','2024-12-07'),
('358819430865437','T1','Wind3 - Via della Magliana 263','RU 33','2025-08-30'),
('351732277940089','T1','Wind3 - Via della Magliana 263','RU 43','2025-12-12'),
('865784064628814','T1','Wind3 - Via della Magliana 263','RU 11','2026-08-29'),
('350288533783616','T1','Vodafone - Via Merulana 262','RU 3','2025-03-28'),
('350288534152910','T1','Vodafone - Via Merulana 262','RU 5','2025-07-25'),
('353780674800115','T1','Wind3 - Viale Libia 34','RU 26','2026-07-07'),
('350038449050562','T1','Wind3 - Viale Libia 34','RU 1','2026-01-10'),
('358819430806829','T1','Wind3 - Viale Libia 34','RU 30','2025-08-30'),
('350288534476574','T1','Vodafone - Via Delle Baleniere','RU 50','2025-03-29'),
('350288534476616','T1','Vodafone - Via Delle Baleniere','RU 49','2025-03-28'),
('354125561890150','T1','Vodafone - Via Delle Baleniere','RU 230','2025-11-27'),
('354125562969177','T1','Vodafone - Via Delle Baleniere','RU 118','2025-07-19'),
('354125562967338','T1','Vodafone - Via Delle Baleniere','RU 117','2025-07-19'),
('350288534476715','T1','Vodafone - Via Delle Baleniere','RU 54','2025-04-03'),
('350288534152290','T1','Vodafone - Via Delle Baleniere','RU 36','2025-03-08'),
('354125562967270','T1','Vodafone - Via Delle Baleniere','RU 124','2025-07-26'),
('350288534475691','T1','Vodafone - Via Delle Baleniere','RU 53','2025-04-01'),
('350288534157455','T1','Vodafone - Via Delle Baleniere','RU 46','2025-03-25'),
('350288534475477','T1','Vodafone - Via Delle Baleniere','RU 56','2025-04-04'),
('354125564452750','T1','Vodafone - Via Delle Baleniere','RU 194','2025-10-01'),
('861213070104580','T1','Vodafone - Via Delle Baleniere','RU 112','2025-07-18'),
('354125562968336','T1','Vodafone - Via Delle Baleniere','RU 133','2025-07-30'),
('350929870856180','T1','Vodafone - Via Delle Baleniere','RU 9','2026-01-20'),
('354125566994353','T1','Vodafone - Via Delle Baleniere','RU 16','2026-01-28'),
('354125566983950','T1','Vodafone - Via Delle Baleniere','RU 15','2026-01-28'),
('352334371176758','T1','Vodafone - Via Delle Baleniere','RU 253','2026-08-27'),
('352334371183275','T1','Vodafone - Via Delle Baleniere','RU 218','2026-07-17'),
('353936440659751','T1','Vodafone - Via Delle Baleniere','RU 252','2026-08-27'),
('352334371518439','T1','Vodafone - Via Delle Baleniere','RU 250','2026-08-25'),
('352334371170355','T1','Vodafone - Via Delle Baleniere','RU 245','2026-08-12'),
('352334371522316','T1','Vodafone - Via Delle Baleniere','RU 242','2026-08-10'),
('352334371164010','T1','Vodafone - Via Delle Baleniere','RU 241','2026-08-10'),
('350056598949020','T1','Vodafone - Via Delle Baleniere','RU 239','2026-08-08'),
('350504687218963','T1','Vodafone - Via Delle Baleniere','RU 238','2026-08-08'),
('352334371523850','T1','Vodafone - Via Delle Baleniere','RU 236','2026-08-08'),
('352334371374155','T1','Vodafone - Via Delle Baleniere','RU 234','2026-08-06'),
('352334371117117','T1','Vodafone - Via Delle Baleniere','RU 233','2026-08-06'),
('354246517238847','T1','Vodafone - Via Delle Baleniere','RU 70','2026-03-21'),
('354246517161395','T1','Vodafone - Via Delle Baleniere','RU 71','2026-03-21'),
('352334371163657','T1','Vodafone - Via Delle Baleniere','RU 224','2026-07-25'),
('350046301039094','T1','Vodafone - Via Delle Baleniere','RU 223','2026-07-24'),
('352334371183259','T1','Vodafone - Via Delle Baleniere','RU 220','2026-07-21'),
('354246517187952','T1','Vodafone - Via Delle Baleniere','RU 106','2026-04-17'),
('354246517180734','T1','Vodafone - Via Delle Baleniere','RU 107','2026-04-18'),
('354246517168994','T1','Vodafone - Via Delle Baleniere','RU 108','2026-04-18'),
('354246517168986','T1','Vodafone - Via Delle Baleniere','RU 109','2026-04-18'),
('352334371405371','T1','Vodafone - Via Delle Baleniere','RU 213','2026-07-13'),
('352334371405595','T1','Vodafone - Via Delle Baleniere','RU 212','2026-07-11'),
('352334371172278','T1','Vodafone - Via Delle Baleniere','RU 208','2026-07-09'),
('354246517694148','T1','Vodafone - Via Delle Baleniere','RU 200','2026-06-30'),
('354246517168838','T1','Vodafone - Via Delle Baleniere','RU 118','2026-04-28'),
('352334371134674','T1','Vodafone - Via Delle Baleniere','RU 184','2026-06-20'),
('354246517165438','T1','Vodafone - Via Delle Baleniere','RU 92','2026-04-08'),
('354246517307295','T1','Vodafone - Via Delle Baleniere','RU 89','2026-04-07'),
('354246517234838','T1','Vodafone - Via Delle Baleniere','RU 168','2026-06-09'),
('354246517224979','T1','Vodafone - Via Delle Baleniere','RU 167','2026-06-09'),
('354246517524105','T1','Vodafone - Via Delle Baleniere','RU 163','2026-06-05'),
('862216080082737','T1','Vodafone - Via Delle Baleniere','RU 150','2026-05-20'),
('354246517529567','T1','Vodafone - Via Delle Baleniere','RU 147','2026-05-18'),
('350266802868763','T1','Vodafone - Via Delle Baleniere','RU 120','2026-04-28'),
('354246517185246','T1','Vodafone - Via Delle Baleniere','RU 113','2026-04-22'),
('354246517168721','T1','Vodafone - Via Delle Baleniere','RU 111','2026-04-20'),
('354246517185725','T1','Vodafone - Via Delle Baleniere','RU 104','2026-04-16'),
('354246517186657','T1','Vodafone - Via Delle Baleniere','RU 103','2026-04-16'),
('354246517310950','T1','Vodafone - Via Delle Baleniere','RU 102','2026-04-15'),
('354246517187127','T1','Vodafone - Via Delle Baleniere','RU 101','2026-04-15'),
('354246517186939','T1','Vodafone - Via Delle Baleniere','RU 100','2026-04-15'),
('354246517165461','T1','Vodafone - Via Delle Baleniere','RU 99','2026-04-15'),
('354246517169174','T1','Vodafone - Via Delle Baleniere','RU 96','2026-04-11'),
('354246517169075','T1','Vodafone - Via Delle Baleniere','RU 97','2026-04-11'),
('354246517167178','T1','Vodafone - Via Delle Baleniere','RU 95','2026-04-11'),
('354246517169232','T1','Vodafone - Via Delle Baleniere','RU 93','2026-04-09'),
('354246517308970','T1','Vodafone - Via Delle Baleniere','RU 86','2026-04-04'),
('354246517167269','T1','Vodafone - Via Delle Baleniere','RU 87','2026-04-04'),
('350288535808817','T1','Vodafone - Via Delle Baleniere','RU 83','2026-04-01'),
('354246515966266','T1','Vodafone - Via Delle Baleniere','RU 59','2026-03-04'),
('359609721786171','T1','Vodafone - Via Delle Baleniere','RU 57','2026-03-03'),
('353053114830989','T1','Wind3 - Piazza Mazzini','RU 25','2025-12-22'),
('863644087451762','T1','Wind3 - Piazza Mazzini','RU 8','2026-07-31'),
('352334371055994','T1','Vodafone - Acilia','RU 17','2026-07-17'),
('352334371516078','T1','Vodafone - Acilia','RU 29','2026-08-07'),
('352334371524015','T1','Vodafone - Acilia','RU 31','2026-08-24'),
('352334371051779','T1','Vodafone - Acilia','RU 14','2026-07-02'),
('352334371183176','T1','Vodafone - Acilia','RU 40','2026-08-31'),
('352334371417715','T1','Vodafone - Acilia','RU 39','2026-08-31'),
('352334371525855','T1','Vodafone - Acilia','RU 38','2026-08-31'),
('352334371519239','T1','Vodafone - Acilia','RU 37','2026-08-28'),
('352334371170397','T1','Vodafone - Acilia','RU 36','2026-08-28'),
('352334371525772','T1','Vodafone - Acilia','RU 35','2026-08-26'),
('352334371509933','T1','Vodafone - Acilia','RU 34','2026-08-25'),
('352334371516672','T1','Vodafone - Acilia','RU 32','2026-08-25'),
('352334371416733','T1','Vodafone - Acilia','RU 30','2026-08-19'),
('352334371515971','T1','Vodafone - Acilia','RU 28','2026-08-01'),
('352334371414894','T1','Vodafone - Acilia','RU 27','2026-07-30'),
('352334371418697','T1','Vodafone - Acilia','RU 26','2026-07-30'),
('352334371416774','T1','Vodafone - Acilia','RU 25','2026-07-30'),
('352334371416691','T1','Vodafone - Acilia','RU 24','2026-07-30'),
('352334371418770','T1','Vodafone - Acilia','RU 22','2026-07-28'),
('354246517442159','T1','Vodafone - Acilia','RU 20','2026-07-21'),
('354246517442068','T1','Vodafone - Acilia','RU 21','2026-07-21'),
('352334370982396','T1','Vodafone - Acilia','RU 19','2026-07-21'),
('352334370981851','T1','Vodafone - Acilia','RU 18','2026-07-20'),
('352334371404499','T1','Vodafone - Acilia','RU 16','2026-07-16'),
('352334371023471','T1','Vodafone - Acilia','RU 15','2026-07-07'),
('354246517442209','T1','Vodafone - Acilia','RU 11','2026-06-19'),
('354246517441482','T1','Vodafone - Acilia','RU 10','2026-06-19'),
('354246517441136','T1','Vodafone - Acilia','RU 9','2026-06-19'),
('354246517235678','T1','Vodafone - Acilia','RU 8','2026-06-12'),
('354246517234903','T1','Vodafone - Acilia','RU 5','2026-05-15'),
('359977831710021','T1','Vodafone - Via dei Castani','RU 3','2024-01-29'),
('350024062948951','T1','Vodafone - Via dei Castani','RU 22','2026-08-10'),
('867715075673959','T1','Vodafone - Via dei Castani','RU 21','2026-08-08'),
('354120360619389','T1','Vodafone - Via dei Castani','RU 14','2026-04-08'),
('869149080369213','T1','Vodafone - Via dei Castani','RU 13','2026-04-03'),
('350070125147073','T1','Vodafone - Via dei Castani','RU 9','2026-03-12'),
('352623851923824','T1','Wind3 - San Paolo','RU 5','2026-04-01'),
('4S44MM','T1','Wind3 - Via di Donna Olimpia','RU 164','2024-11-09'),
('352648381426626','T1','Wind3 - Via di Donna Olimpia','RU 189','2025-08-23'),
('350997798454917','T1','Wind3 - Via di Donna Olimpia','RU 224','2025-12-22'),
('356692114313434','T1','Wind3 - Via di Donna Olimpia','RU 216','2025-12-06'),
('863644087576683','T1','Wind3 - Via di Donna Olimpia','RU 59','2026-08-25'),
('358127960228814','T1','Wind3 - Via di Donna Olimpia','RU 58','2026-08-25'),
('352404913425060','T1','Wind3 - Via di Donna Olimpia','RU 56','2026-08-12'),
('354831984757971','T1','Wind3 - Via di Donna Olimpia','RU 97','2025-04-14'),
('866724070496284','T1','Wind3 - Via di Donna Olimpia','RU 108','2025-04-30'),
('866556062468842','T1','Wind3 - Via di Donna Olimpia','RU 50','2026-05-25'),
('350016388618847','T1','Wind3 - Via di Donna Olimpia','RU 48','2026-05-14');

update public.usati u
   set azienda_acquisto      = s.azienda,
       negozio_acquisto_gest = s.negozio,
       doc_acquisto          = s.doc,
       /* ⚠️ LA DATA D'ACQUISTO NON SI SOVRASCRIVE SE C'È GIÀ: quella del CRM
          è stata scritta da chi ha registrato l'acquisto, e il gestionale
          vecchio riporta la data del DOCUMENTO, che può essere un'altra. */
       purchase_date         = coalesce(u.purchase_date, s.dta)
  from _sto s
 where u.imei = s.imei;

do $$
declare n int; t1 int; t2 int; senza int;
begin
    select count(*) filter (where azienda_acquisto is not null),
           count(*) filter (where azienda_acquisto = 'T1'),
           count(*) filter (where azienda_acquisto = 'T2'),
           count(*) filter (where azienda_acquisto is null)
      into n, t1, t2, senza from public.usati;
    raise notice 'con societa'' d''acquisto: % (T1 %, T2 %) - senza: %', n, t1, t2, senza;
    if n = 0 then raise exception 'non e stata scritta nessuna societa'''; end if;
end $$;
