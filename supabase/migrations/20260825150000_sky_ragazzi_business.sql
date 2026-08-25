-- SKY lato RAGAZZI — buchi trovati dall'audit 25/08 (segnalazione Luca:
-- «vendita senza punteggio in Analisi» = Sky Fibra Business ad Acilia
-- Multi): il tabellare ragazzi non aveva NESSUNA riga Business né Prova
-- Sky. Si seminano con i PUNTI dell'azienda (il conteggio in soglia è lo
-- stesso evento) e il PAY VUOTO: per la regola di copertura gli importi
-- ragazzi li decide Luca dal pannello Gare → Sky → lato Ragazzi (righe
-- editabili) — mai € inventati. Idempotente.
insert into pay_righe (brand, month, lato, pista, nome, tipo_cliente, categoria, prodotto, offerta, moltiplicatore, punti, pay_base, pay_tiers, gettone, attivo, note, ordine)
select v.* from (values
    ('sky', '2026-08-01'::date, 'ragazzi', 'sky', 'Sky Wifi Business',      'Business', 'Fisso', 'Fibra',                null::text,          false, 1.0,  null::numeric, '{}'::numeric[], false, true, 'Seminata dall''audit 25/08: importo ragazzi da definire (l''azienda paga 50/120/150/180/230…). Senza importo la riga conta i punti ma non genera pay.', 90),
    ('sky', '2026-08-01'::date, 'ragazzi', 'sky', 'Offerta Uffici',         'Business', 'TV',    'TV Uffici',            null,                false, 2.0,  null, '{}'::numeric[], true,  true, 'Seminata dall''audit 25/08: gettone ragazzi da definire (azienda 200 €).', 91),
    ('sky', '2026-08-01'::date, 'ragazzi', 'sky', 'Sky Bar',                'Business', 'TV',    'Sky Bar',              null,                false, 4.0,  null, '{}'::numeric[], true,  true, 'Seminata dall''audit 25/08: gettone ragazzi da definire (azienda 600 €).', 92),
    ('sky', '2026-08-01'::date, 'ragazzi', 'sky', 'Sky Hotel · 0-3 stanze', 'Business', 'TV',    'Sky Hotel',            'Da 0 a 3 Stanze',   false, 1.5,  null, '{}'::numeric[], true,  true, 'Seminata dall''audit 25/08: gettone ragazzi da definire (azienda 60 €).', 93),
    ('sky', '2026-08-01'::date, 'ragazzi', 'sky', 'Sky Hotel · 4+ stanze',  'Business', 'TV',    'Sky Hotel',            'Over 4 Stanze',     false, 2.0,  null, '{}'::numeric[], true,  true, 'Seminata dall''audit 25/08: gettone ragazzi da definire (azienda 240 €).', 94),
    ('sky', '2026-08-01'::date, 'ragazzi', 'sky', 'Prova Sky TV (attivato)','Consumer', 'TV',    'Sky Glass e Prova Sky','Prova Sky',         false, 0.5,  null, '{}'::numeric[], false, true, 'Seminata dall''audit 25/08: importo ragazzi da definire (azienda 5 €).', 95)
) as v(brand, month, lato, pista, nome, tipo_cliente, categoria, prodotto, offerta, moltiplicatore, punti, pay_base, pay_tiers, gettone, attivo, note, ordine)
where not exists (
    select 1 from pay_righe r
    where r.brand = v.brand and r.month = v.month and r.lato = v.lato and r.nome = v.nome
);
