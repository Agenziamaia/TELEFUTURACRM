-- ═══════════════════════════════════════════════════════════════════════════
-- IL MAGAZZINO VINCOLA LA VENDITA — MA SOLO DOVE LO DICE LUCA (31/08)
--
-- «Le modifiche su come si registra una vendita, e su quando questa deve
--  essere agganciata alla disponibilità del magazzino, devi applicarle
--  solamente ai negozi che sono partiti in test. Da domani mattina, quando
--  devono partire tutti, ti darò io l'ok e le abiliterai su tutti gli altri.»
--
-- Serviva un interruttore, non una deduzione. Legare la regola a «questo
-- negozio ha un magazzino caricato» sarebbe stato comodo ma sbagliato: il
-- magazzino di un negozio si può caricare per prepararlo, giorni prima di
-- volerci vendere sopra. Chi decide quando una regola comincia a fermare le
-- vendite è chi risponde delle vendite.
--
-- PER ACCENDERLI DOMANI — solo dove il magazzino c'è davvero:
--     update stores s set magazzino_vincolante = true
--      where exists (select 1 from mag_unita u where u.negozio = s.name);
--
-- ⚠️ NON usare `where is_ufficio is not true`: accenderebbe il vincolo anche
-- sugli undici negozi col magazzino VUOTO, e lì il campo IMEI non troverebbe
-- niente — qualunque cosa si scriva diventa rossa e la vendita si ferma. In
-- trenta giorni quegli undici hanno registrato 229 telefoni a rate, quasi otto
-- al giorno: sarebbero altrettante vendite bloccate al banco (revisore 31/08).
-- ═══════════════════════════════════════════════════════════════════════════

alter table stores add column if not exists magazzino_vincolante boolean not null default false;
comment on column stores.magazzino_vincolante is
  'true = in questo negozio la vendita di un telefono a rate esige che l''IMEI sia a magazzino. Acceso da Luca, negozio per negozio.';

update stores set magazzino_vincolante = true
 where name in ('Donna', 'Magliana W3', 'Magliana Multi', 'Promontori');
