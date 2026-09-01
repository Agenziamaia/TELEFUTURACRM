-- ═══ DA QUALE DISPOSITIVO È STATA FIRMATA ════════════════════════════════
-- Luca, 01/09, guardando la prima firma vera: «perché a sinistra c'è la firma
-- della nostra collaboratrice?». Il registro lo diceva — «User agent: Windows
-- NT 10.0, Chrome» — ma bisognava aprire il PDF e leggerlo riga per riga.
--
-- L'SMS va al telefono del cliente; se poi il link lo apre il negozio dal
-- proprio PC e si fa dettare il codice, la firma che resta sul documento non è
-- del cliente, e l'OTP non verifica più niente. Nessun controllo può
-- impedirlo: il codice ce l'ha in mano il cliente ed è libero di leggerlo ad
-- alta voce. Ma si può RENDERE VISIBILE, e ciò che si vede si corregge.
alter table public.firme_richieste add column if not exists dispositivo text;
alter table public.firme_richieste add column if not exists indirizzo_ip text;

comment on column public.firme_richieste.dispositivo is
  'sistema e browser da cui è stata raccolta la firma, letti dal registro DocuSeal: un computer, in negozio, vuol dire che ha firmato il banco';
