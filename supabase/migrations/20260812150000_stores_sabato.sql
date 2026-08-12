-- ORARIO DEDICATO DEL SABATO (esito Luca 12/08 sulla riga Tracking/chiusure:
-- «ci sono dei negozi che il sabato hanno un orario dedicato»). NULL = il
-- sabato segue l'orario della settimana; valorizzati = turno unico del sabato.
alter table stores add column if not exists sabato_apertura time;
alter table stores add column if not exists sabato_chiusura time;
comment on column stores.sabato_apertura is 'Apertura del sabato (NULL = come la settimana)';
comment on column stores.sabato_chiusura is 'Chiusura del sabato (NULL = come la settimana)';
