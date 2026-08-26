-- VF: decisioni di Luca (26/08 pomeriggio) sulle 10 «offerte senza
-- commissioning» rimaste dopo il giro OneNet. Zero vendite storiche su
-- tutte le voci toccate (verificato su offerta top-level E dettagli
-- ->>'Offerta') → nessun effetto retroattivo.

-- ① YOUNG ×4: fuori da lettera e listino luglio (la U18 esiste già) → spente.
update catalog_offerte set attivo = false
 where id in ('86d9ca93-b4a7-4532-b79b-59a012bfaecd',   -- Ric.Auto · Mobile MNP
              '858608d5-857e-47ae-a8a1-66232cf88b67',   -- Ric.Auto · Mobile GA
              '5d318ad4-aaa9-49d0-830d-1518ea33438e',   -- Wallet · Mobile GA
              'e4516ad7-dd5b-469b-bfc5-d8ba0f086e39');  -- Wallet · Mobile MNP

-- ② RED DATA NOW ×2: le colonne dati business della lettera 5.2 sono
--    «Dati Smart»/«Dati Comfort», già a catalogo e pagate → spenta.
update catalog_offerte set attivo = false
 where id in ('bb41f65b-360f-48fa-b0c5-c55ffcde13cc',   -- Mobile GA
              '5351e200-ce8c-4cf3-9c44-188728167c66');  -- Mobile MNP

-- ③ DATA BUSINESS S: voluta a mano l'11/08 (nome di negozio della SIM dati
--    small) → paga COME la colonna «Dati Smart» della lettera 5.2
--    (clone della riga: base 15, 20/25/30/35/40/45, 1 punto, entrambi i lati).
insert into pay_righe (brand, month, lato, pista, nome, tipo_cliente, categoria, prodotto, offerta, brand_vendita, moltiplicatore, punti, pay_base, pay_tiers, gettone, attivo, ordine, note)
select v.* from (values
  ('vodafone','2026-08-01'::date,'azienda','business_mobile','Data Business S (= Dati Smart)','Business',null,null,'Data Business S','vodafone',false,1.00,15.00,'{20,25,30,35,40,45}'::numeric[],false,true,94,'Nome a catalogo (11/08) della SIM dati small: paga come la colonna Dati Smart della lettera 5.2 (Luca 26/08)'),
  ('vodafone','2026-08-01'::date,'ragazzi','business_mobile','Data Business S (= Dati Smart)','Business',null,null,'Data Business S','vodafone',false,1.00,15.00,'{20,25,30,35,40,45}'::numeric[],false,true,45,'Nome a catalogo (11/08) della SIM dati small: paga come la colonna Dati Smart della lettera 5.2 (Luca 26/08)')
) as v(brand, month, lato, pista, nome, tipo_cliente, categoria, prodotto, offerta, brand_vendita, moltiplicatore, punti, pay_base, pay_tiers, gettone, attivo, ordine, note)
where not exists (select 1 from pay_righe r where r.brand=v.brand and r.month=v.month and r.lato=v.lato and r.offerta=v.offerta);

-- ④ VODAFONE CARE: «non esiste più, eliminala dappertutto» (correzione Luca
--    26/08 — annullato il primo ordine «come una Kasko»). Spente l'offerta
--    sotto Customer Base/Cambio Offerta E i due prodotti vuoti di
--    Multi-Servizi (Consumer e Business). Zero vendite storiche.
update catalog_offerte set attivo = false
 where id = '572b7b80-d22e-4f0e-b6a5-23372975c392';    -- offerta (Consumer · CB · Cambio Offerta)
update catalog_prodotti set attivo = false
 where id in ('912a70f6-f5fa-46ba-8cb6-046fa4bf45c5',  -- prodotto Multi-Servizi Consumer (vuoto)
              '1c068cd8-4800-45bb-8d26-3583a5eb5df2'); -- prodotto Multi-Servizi Business (vuoto)

-- ⑤ CAMBIO OFFERTA BUSINESS: resta a catalogo (voce operativa) ma la lettera
--    A non remunera il CB business → riga DICHIARATA a 0 € / 0 punti: sparisce
--    dalle scoperte senza mentire.
insert into pay_righe (brand, month, lato, pista, nome, tipo_cliente, categoria, prodotto, offerta, brand_vendita, moltiplicatore, punti, pay_base, pay_tiers, gettone, attivo, ordine, note)
select v.* from (values
  ('vodafone','2026-08-01'::date,'azienda',null,'CB business — non remunerato','Business','Customer Base','Cambio Offerta','Cambio Offerta','vodafone',false,0.00,0.00,'{}'::numeric[],true,true,95,'La lettera A non paga il cambio offerta business: 0 € e 0 punti dichiarati, la voce resta per l''operatività (Luca 26/08)'),
  ('vodafone','2026-08-01'::date,'ragazzi',null,'CB business — non remunerato','Business','Customer Base','Cambio Offerta','Cambio Offerta','vodafone',false,0.00,0.00,'{}'::numeric[],true,true,67,'La lettera A non paga il cambio offerta business: 0 € e 0 punti dichiarati, la voce resta per l''operatività (Luca 26/08)')
) as v(brand, month, lato, pista, nome, tipo_cliente, categoria, prodotto, offerta, brand_vendita, moltiplicatore, punti, pay_base, pay_tiers, gettone, attivo, ordine, note)
where not exists (select 1 from pay_righe r where r.brand=v.brand and r.month=v.month and r.lato=v.lato and r.tipo_cliente='Business' and r.offerta='Cambio Offerta');
