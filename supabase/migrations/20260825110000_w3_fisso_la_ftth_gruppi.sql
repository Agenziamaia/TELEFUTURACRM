-- FISSO W3 — componenti dimenticate della lettera (Luca 25/08 sera):
-- ① la componente L.A (+1 ×canone quando l'acquisizione è una GNP) non era
--    mai stata seminata: 12 vendite di agosto con l'opzione GNP spuntata non
--    prendevano il moltiplicatore; il flag si accende dall'opzione GNP già
--    a catalogo (con la sua tendina «Operatore GNP» obbligatoria, RV-05).
-- ② il dato FTTH/FTTC e GA/GNP diventa OBBLIGATORIO in Registra Vendita col
--    meccanismo dei gruppi singoli (pattern kit Protecta): gruppo
--    «attivazione» (GA | GNP) su tutte le offerte fisso/FWA W3, gruppo
--    «tecnologia» (FTTH | FTTC) sulle offerte fisso internet (dove FTTH già
--    esiste). GA e FTTC sono opzioni NEUTRE: nessun flag, solo il dato.
-- ③ riga documentale SPENTA per l'extra 40 € migrazioni vs FTTH Extra/FWA
--    Outdoor (lettera EXTRA: fuori soglia; evento oggi non registrabile).
-- Idempotente.

-- ── ② catalogo: GA accanto a GNP (gruppo attivazione, obbligatorio) ──────
insert into catalog_opzioni (offerta_id, nome, tipo, gruppo_singolo, ordine, attivo, obbligatoria)
select o.offerta_id, 'GA', o.tipo, 'attivazione', greatest(o.ordine - 1, 0), true, true
  from catalog_opzioni o
  join catalog_offerte off on off.id = o.offerta_id
  join catalog_prodotti p on p.id = off.prodotto_id
 where p.brand_id = 'windtre' and o.nome = 'GNP' and o.attivo = true
   and not exists (select 1 from catalog_opzioni x where x.offerta_id = o.offerta_id and x.nome = 'GA');

update catalog_opzioni o
   set gruppo_singolo = 'attivazione', obbligatoria = true
  from catalog_offerte off
  join catalog_prodotti p on p.id = off.prodotto_id
 where off.id = o.offerta_id and p.brand_id = 'windtre' and o.nome = 'GNP';

-- ── ② catalogo: FTTC accanto a FTTH (gruppo tecnologia, obbligatorio) ────
insert into catalog_opzioni (offerta_id, nome, tipo, gruppo_singolo, ordine, attivo, obbligatoria)
select o.offerta_id, 'FTTC', o.tipo, 'tecnologia', o.ordine, true, true
  from catalog_opzioni o
  join catalog_offerte off on off.id = o.offerta_id
  join catalog_prodotti p on p.id = off.prodotto_id
 where p.brand_id = 'windtre' and o.nome = 'FTTH' and o.attivo = true
   and not exists (select 1 from catalog_opzioni x where x.offerta_id = o.offerta_id and x.nome = 'FTTC');

update catalog_opzioni o
   set gruppo_singolo = 'tecnologia', obbligatoria = true
  from catalog_offerte off
  join catalog_prodotti p on p.id = off.prodotto_id
 where off.id = o.offerta_id and p.brand_id = 'windtre' and o.nome = 'FTTH';

-- ── ① riga pay L.A (lettera FISSO: 1,0 su tutte e 5 le soglie) ───────────
insert into pay_righe (brand, month, lato, pista, nome, componente, moltiplicatore, punti, pay_base, pay_tiers, gettone, attivo, note, ordine)
select 'windtre', '2026-08-01', 'azienda', 'fisso',
       '+ L.A ×canone (GNP: linea attiva da altro operatore)', 'la',
       true, 0, null, '{1,1,1,1,1}'::numeric[], false, true,
       'Lettera FISSO: +1 sul moltiplicatore quando l''acquisizione è una GNP — si accende dall''opzione GNP di Registra Vendita (gruppo Attivazione). Nessun punto extra in soglia.',
       coalesce((select max(ordine) + 1 from pay_righe where brand = 'windtre' and month = '2026-08-01' and lato = 'azienda' and pista = 'fisso'), 1)
 where not exists (select 1 from pay_righe where brand = 'windtre' and month = '2026-08-01' and lato = 'azienda' and pista = 'fisso' and componente = 'la');

-- ── ③ riga documentale migrazioni vs Fibra (spenta, come il Bollettino) ──
insert into pay_righe (brand, month, lato, pista, nome, componente, moltiplicatore, punti, pay_base, pay_tiers, gettone, attivo, note, ordine)
select 'windtre', '2026-08-01', 'azienda', 'fisso',
       'Migrazione vs FTTH Extra / FWA Outdoor — extra 40 €', null,
       false, 0, 40, '{}'::numeric[], true, false,
       'Documentale (spenta): lettera EXTRA — 40 € per le migrazioni verso Fibra FTTH Extra e FWA Outdoor, fuori dal conteggio di gara (per lettera le migrazioni verso Fibra si pagano col solo contrattuale). Evento oggi non registrabile come acquisizione.',
       coalesce((select max(ordine) + 1 from pay_righe where brand = 'windtre' and month = '2026-08-01' and lato = 'azienda' and pista = 'fisso'), 1)
 where not exists (select 1 from pay_righe where brand = 'windtre' and month = '2026-08-01' and lato = 'azienda' and pista = 'fisso' and nome like 'Migrazione vs FTTH Extra%');
