-- LE VENDITE COLLEGATE LE APPROVA L'ADMIN, NON L'AMMINISTRAZIONE
-- (Luca 31/08: «quelle devono arrivare solamente a me che sono l'admin,
-- altrimenti l'amministrativo non capisce niente»).
--
-- Una segnalazione di vendita collegata è una decisione di merito — quale
-- vendita si aggancia a quale lead del call center — non una pratica da
-- sbrigare: chi la deve prendere è uno solo. Con `target_role = 'direzione'`
-- il fulmine si accendeva anche all'amministrativo, che di quel collegamento
-- non sa niente.
--
-- Il codice che le crea adesso scrive 'admin'; qui si spostano le due già
-- aperte, che altrimenti resterebbero accese sulla scrivania sbagliata.
update admin_tasks
   set target_role = 'admin'
 where tipo = 'vendita_segnalata'
   and coalesce(done, false) = false
   and target_role = 'direzione';
