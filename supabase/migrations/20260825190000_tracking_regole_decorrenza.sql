-- DECORRENZA regole tracking (incidente malus sky 25/08/2026: l'attivazione
-- della regola sky a 8 €/g ha fatto ricostruire al backfill deterministico
-- 119 episodi RETROATTIVI da luglio — 1.170 €, compresi periodi azzerati
-- dall'amministrazione; annullati coi tombstone lo stesso giorno).
-- decorrenza = giorno da cui la regola della categoria è in vigore: i
-- contatori live e la ricostruzione non contano MAI giorni precedenti.
-- Il pannello Regole la timbra sulle sole righe modificate.
alter table tracking_regole add column if not exists decorrenza date;
-- sky: le regole nuove valgono dal 25/08 (mai sul passato)
update tracking_regole set decorrenza = '2026-08-25' where categoria = 'sky';
