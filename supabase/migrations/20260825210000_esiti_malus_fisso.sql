-- MALUS DEGLI ESITI AMMINISTRATIVI (Luca 25/08 sera): «Non Conforme genera
-- un malus definitivo e poi un giornaliero finché non viene gestita».
-- · malus_fisso: € una tantum all'assegnazione dell'esito (malus_giorno,
--   il €/giorno, esisteva già)
-- · malus_decorrenza: timbrata dal pannello a ogni modifica dei € — i valori
--   valgono solo in avanti (lezione incidente sky dello stesso giorno): un
--   esito assegnato prima della configurazione non paga la una tantum e il
--   giornaliero conta solo i giorni dalla configurazione in poi.
alter table tracking_esiti add column if not exists malus_fisso numeric;
alter table tracking_esiti add column if not exists malus_decorrenza date;
