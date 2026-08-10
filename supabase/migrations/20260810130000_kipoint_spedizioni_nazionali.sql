-- KIPOINT SPEDIZIONI NAZIONALI (MOD-15, listino Luca 10/08)
--
-- Prodotto "Nazionali" sotto la categoria Spedizioni (l'Internazionale si farà
-- in un secondo momento; il vecchio prodotto "Spedizione" Italia/Europa/ExtraUE
-- resta com'è — convivenza, si deciderà poi). Offerte = 8 FASCE DI PESO "TBASE
-- a-b kg": il nome codifica il range per il simulatore volumetrico del Registra
-- Vendita (h×l×p/6000 vs peso reale → fascia). Opzioni = servizi/assicurazioni/
-- supplementi REPLICATI IDENTICI su ogni fascia (così cambiando fascia le
-- selezioni sopravvivono: __opzioni è keyed per nome). Prezzi in catalog_valori
-- (mig. 190): una riga per fascia (offerta_id) e una per opzione (opzione_id);
-- margine NULL → lo imposta Luca dal pannello. Idempotente.
--
-- NB listino: RFS 0-20 kg = 3€ e Suppl. SCS 5-10 kg = 2€ forniti a voce (erano
-- assenti/azzerati negli screenshot). Il supplemento SCS 10-20 kg NON esiste
-- nel listino ricevuto: se serve, si aggiunge dal pannello Catalogo.

-- ── 1) prodotto "Nazionali" ────────────────────────────────────────────────
insert into public.catalog_prodotti (brand_id, tipo_cliente, categoria_id, nome, ordine, attivo)
select 'kipoint', 'Consumer', c.id, 'Nazionali', 0, true
from public.catalog_categorie c
where c.nome = 'Spedizioni'
  and not exists (
    select 1 from public.catalog_prodotti p
    where p.brand_id = 'kipoint' and p.tipo_cliente = 'Consumer'
      and p.categoria_id = c.id and p.nome = 'Nazionali');

-- ── 2) offerte = fasce TBASE (ordine progressivo: l'ordinamento della UI
--       è per "ordine" con localeCompare come spareggio — senza, "10-20"
--       verrebbe prima di "2-5") ──────────────────────────────────────────
with prod as (
  select p.id from public.catalog_prodotti p
  join public.catalog_categorie c on c.id = p.categoria_id
  where p.brand_id='kipoint' and p.tipo_cliente='Consumer' and c.nome='Spedizioni' and p.nome='Nazionali'
), fasce(nome, ordine) as (values
  ('TBASE 0-2 kg', 0), ('TBASE 2-5 kg', 1), ('TBASE 5-10 kg', 2), ('TBASE 10-20 kg', 3),
  ('TBASE 20-30 kg', 4), ('TBASE 30-50 kg', 5), ('TBASE 50-70 kg', 6), ('TBASE 70-100 kg', 7)
)
insert into public.catalog_offerte (prodotto_id, nome, ordine, attivo)
select prod.id, f.nome, f.ordine, true from prod, fasce f
where not exists (select 1 from public.catalog_offerte o where o.prodotto_id = prod.id and o.nome = f.nome);

-- ── 3) opzioni IDENTICHE su ogni fascia ────────────────────────────────────
--   servizi liberi (cumulabili) · RFS una sola (gruppo rfs) · assicurazione
--   una sola (gruppo assicurazione) · supplemento SCS uno solo (gruppo supp_scs)
with prod as (
  select p.id from public.catalog_prodotti p
  join public.catalog_categorie c on c.id = p.categoria_id
  where p.brand_id='kipoint' and p.tipo_cliente='Consumer' and c.nome='Spedizioni' and p.nome='Nazionali'
), offs as (
  select o.id from public.catalog_offerte o join prod on o.prodotto_id = prod.id
), opz(nome, gruppo, ordine) as (values
  ('Consegna al piano',                        null::text,       0),
  ('CAP disagiati',                            null,             1),
  ('Non sovrapponibile',                       null,             2),
  ('Contrassegno fino a 516€',                 null,             3),
  ('Consegna notturna',                        null,             4),
  ('Giorno stabilito',                         null,             5),
  ('Consegna programmata',                     null,             6),
  ('Consegna di sabato',                       null,             7),
  ('RFS 0-20 kg',                              'rfs',            8),
  ('RFS 21-100 kg',                            'rfs',            9),
  ('Assicurazione fino a 258€',                'assicurazione', 10),
  ('Assicurazione fino a 516€',                'assicurazione', 11),
  ('Assicurazione fino a 1549€',               'assicurazione', 12),
  ('Assicurazione fino a 2582€',               'assicurazione', 13),
  ('Suppl. Sardegna/Calabria/Sicilia 0-5 kg',  'supp_scs',      14),
  ('Suppl. Sardegna/Calabria/Sicilia 5-10 kg', 'supp_scs',      15),
  ('Suppl. Sardegna/Calabria/Sicilia 20-30 kg','supp_scs',      16),
  ('Suppl. Sardegna/Calabria/Sicilia 30-50 kg','supp_scs',      17),
  ('Suppl. Sardegna/Calabria/Sicilia oltre 50 kg','supp_scs',   18)
)
insert into public.catalog_opzioni (offerta_id, nome, tipo, gruppo_singolo, ordine, attivo)
select offs.id, z.nome, null, z.gruppo, z.ordine, true from offs, opz z
where not exists (select 1 from public.catalog_opzioni k where k.offerta_id = offs.id and k.nome = z.nome);

-- ── 4) prezzi FASCE in catalog_valori (margine NULL: lo setta Luca) ────────
with prod as (
  select p.id from public.catalog_prodotti p
  join public.catalog_categorie c on c.id = p.categoria_id
  where p.brand_id='kipoint' and p.tipo_cliente='Consumer' and c.nome='Spedizioni' and p.nome='Nazionali'
), prezzi(nome, prezzo) as (values
  ('TBASE 0-2 kg', 9.00), ('TBASE 2-5 kg', 11.50), ('TBASE 5-10 kg', 13.90), ('TBASE 10-20 kg', 16.50),
  ('TBASE 20-30 kg', 19.00), ('TBASE 30-50 kg', 24.90), ('TBASE 50-70 kg', 29.50), ('TBASE 70-100 kg', 38.90)
)
insert into public.catalog_valori (offerta_id, prezzo, attivo, note)
select o.id, pz.prezzo, true, 'Listino Kipoint nazionale (Luca 10/08)'
from public.catalog_offerte o
join prod on o.prodotto_id = prod.id
join prezzi pz on pz.nome = o.nome
where not exists (select 1 from public.catalog_valori v where v.offerta_id = o.id);

-- ── 5) prezzi OPZIONI in catalog_valori (per OGNI istanza per-fascia) ──────
with prod as (
  select p.id from public.catalog_prodotti p
  join public.catalog_categorie c on c.id = p.categoria_id
  where p.brand_id='kipoint' and p.tipo_cliente='Consumer' and c.nome='Spedizioni' and p.nome='Nazionali'
), zp(nome, prezzo) as (values
  ('Consegna al piano', 5.00), ('CAP disagiati', 5.00), ('Non sovrapponibile', 11.00),
  ('Contrassegno fino a 516€', 3.00), ('Consegna notturna', 12.00), ('Giorno stabilito', 6.00),
  ('Consegna programmata', 6.00), ('Consegna di sabato', 12.00),
  ('RFS 0-20 kg', 3.00), ('RFS 21-100 kg', 6.00),
  ('Assicurazione fino a 258€', 5.00), ('Assicurazione fino a 516€', 8.00),
  ('Assicurazione fino a 1549€', 12.00), ('Assicurazione fino a 2582€', 15.00),
  ('Suppl. Sardegna/Calabria/Sicilia 0-5 kg', 1.00), ('Suppl. Sardegna/Calabria/Sicilia 5-10 kg', 2.00),
  ('Suppl. Sardegna/Calabria/Sicilia 20-30 kg', 2.50), ('Suppl. Sardegna/Calabria/Sicilia 30-50 kg', 3.50),
  ('Suppl. Sardegna/Calabria/Sicilia oltre 50 kg', 4.50)
)
insert into public.catalog_valori (opzione_id, prezzo, attivo, note)
select k.id, zp.prezzo, true, 'Listino Kipoint nazionale (Luca 10/08)'
from public.catalog_opzioni k
join public.catalog_offerte o on o.id = k.offerta_id
join prod on o.prodotto_id = prod.id
join zp on zp.nome = k.nome
where not exists (select 1 from public.catalog_valori v where v.opzione_id = k.id);

-- ── 6) campi DESTINATARIO (regola per-prodotto: NON tocca il vecchio
--       "Spedizione" né Click and Collect). I 3 campi "dal simulatore" sono
--       facoltativi: li compila da solo il simulatore del Registra Vendita. ──
insert into public.catalog_campi_regole (etichetta, condizioni, campi, ordine, attivo)
select
  '🎯 Kipoint Spedizioni Nazionali — destinatario + peso (10/08)',
  '{"brand":["kipoint"],"categoria":["Spedizioni"],"prodotto":["Nazionali"]}'::jsonb,
  '[{"nome":"Nome e Cognome Destinatario","tipo":"testo","nota":"","conferma":false,"attivo":true},
    {"nome":"Indirizzo Destinatario","tipo":"testo","nota":"via e NUMERO CIVICO","conferma":false,"attivo":true},
    {"nome":"CAP Destinatario","tipo":"testo","nota":"","conferma":false,"attivo":true},
    {"nome":"Città Destinatario","tipo":"testo","nota":"","conferma":false,"attivo":true},
    {"nome":"Telefono Destinatario","tipo":"testo","nota":"","conferma":false,"attivo":true},
    {"nome":"Peso reale (kg)","tipo":"testo","nota":"dal simulatore","conferma":false,"attivo":true,"facoltativo":true},
    {"nome":"Dimensioni (cm)","tipo":"testo","nota":"H×L×P, dal simulatore","conferma":false,"attivo":true,"facoltativo":true},
    {"nome":"Peso tassabile (kg)","tipo":"testo","nota":"max(reale, volumetrico)","conferma":false,"attivo":true,"facoltativo":true}]'::jsonb,
  least(0, (select min(ordine) from public.catalog_campi_regole)) - 1,
  true
where not exists (
  select 1 from public.catalog_campi_regole
  where etichetta = '🎯 Kipoint Spedizioni Nazionali — destinatario + peso (10/08)');

notify pgrst, 'reload schema';
