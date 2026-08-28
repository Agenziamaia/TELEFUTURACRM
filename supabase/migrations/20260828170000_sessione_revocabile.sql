-- USCITA CHE VALE DAVVERO (Luca 28/08 sera).
--
-- Il permesso di sessione dura 7 giorni ed era impossibile annullarlo: chi
-- usciva dal CRM (o veniva licenziato) restava tecnicamente valido fino alla
-- scadenza. Qui si aggiunge un CONTATORE per persona: il permesso porta
-- dentro il numero con cui è stato emesso, e se il numero non combacia più
-- non vale niente. Uscire, licenziare o sospendere lo fa avanzare.
alter table app_users add column if not exists session_epoch integer not null default 0;
