-- SKY RAGAZZI → MODELLO DERIVATO (Luca 25/08 sera: «non vedo la possibilità
-- di impostare una % per ribaltare il commissioning sui ragazzi dentro
-- Sky»). Era l'unico tabellare ragazzi storico a numeri propri: la % e la
-- mappa soglie dell'azienda erano inerti. Conversione:
--  ① i pay ragazzi ATTUALI si congelano in pay_ragazzi_tiers sulle righe
--     azienda gemelle (✍️ manuali per riga: NON cambia un centesimo);
--  ② per le promo 3P 35,90 Cinema/Sport si creano le righe azienda gemelle
--     (valori azienda = Triple Play generica: per l'azienda nulla cambia,
--     il match diventa solo più specifico);
--  ③ spariscono piste e righe del lato ragazzi (le SOGLIE ragazzi manuali
--     restano in pay_soglie e continuano a vincere);
--  ④ da qui la casella «% pay ai ragazzi» e la mappa per soglia funzionano
--     anche su Sky — business compresi (finché Luca non imposta la %, i
--     business derivano al 100% dell'azienda, visibile nel pannello).
-- Idempotente.

-- ② righe azienda gemelle per le promo 35,90 (valori aziendali della 3P generica)
insert into pay_righe (brand, month, lato, pista, nome, tipo_cliente, categoria, prodotto, offerta, moltiplicatore, punti, pay_base, pay_tiers, gettone, attivo, note, ordine)
select v.* from (values
    ('sky', '2026-08-01'::date, 'azienda', 'sky', 'Triple Play · promo 35,90 Cinema', 'Consumer', 'Fisso', '3P', 'Sky TV + Sky Cinema + Sky Fibra a 35,90€', false, 3.0, null::numeric, '{65,160,235,280,340,365,380,400}'::numeric[], false, true, 'Gemella della Triple Play generica (stessi valori azienda): esiste per portare il pay ragazzi specifico della promo 35,90.', 60),
    ('sky', '2026-08-01'::date, 'azienda', 'sky', 'Triple Play · promo 35,90 Sport',  'Consumer', 'Fisso', '3P', 'Sky TV + Sky Sport + Sky Fibra a 35,90€',  false, 3.0, null::numeric, '{65,160,235,280,340,365,380,400}'::numeric[], false, true, 'Gemella della Triple Play generica (stessi valori azienda): esiste per portare il pay ragazzi specifico della promo 35,90.', 61)
) as v(brand, month, lato, pista, nome, tipo_cliente, categoria, prodotto, offerta, moltiplicatore, punti, pay_base, pay_tiers, gettone, attivo, note, ordine)
where not exists (select 1 from pay_righe r where r.brand = v.brand and r.month = v.month and r.lato = v.lato and r.nome = v.nome);

-- ① pay ragazzi attuali → pay_ragazzi_tiers sulle gemelle azienda
update pay_righe set pay_ragazzi_tiers = x.tiers::numeric[]
from (values
    ('Sky TV Only',                      '{180,180,200,290}'),
    ('Sky TV Only · promo 14,99',        '{120,140,160,195}'),
    ('Sky Glass 43"',                    '{110,135,155,225}'),
    ('Sky Glass 55"',                    '{110,135,155,225}'),
    ('Sky Glass 65"',                    '{110,135,155,225}'),
    ('Only Sky Wifi',                    '{135,135,190,200}'),
    ('Only Sky Wifi (legacy)',           '{135,135,190,200}'),
    ('Triple Play',                      '{270,300,310,320}'),
    ('Triple Play · promo 35,90 Cinema', '{270,300,310,400}'),
    ('Triple Play · promo 35,90 Sport',  '{270,300,310,400}'),
    ('Triple Play (legacy 35,80)',       '{270,300,310,400}'),
    ('Sky Mobile MNP',                   '{10,32,34,36}'),
    ('Sky Mobile GA · Ric. automatica',  '{21,22,24,25}'),
    ('Sky Mobile GA · Ricarica pura',    '{3,3,3,3}')
) as x(nome, tiers)
where pay_righe.brand = 'sky' and pay_righe.month = '2026-08-01' and pay_righe.lato = 'azienda' and pay_righe.nome = x.nome;

-- ③ via il tabellare ragazzi statico (le pay_soglie lato ragazzi RESTANO)
delete from pay_righe where brand = 'sky' and month = '2026-08-01' and lato = 'ragazzi';
delete from pay_piste where brand = 'sky' and month = '2026-08-01' and lato = 'ragazzi';
