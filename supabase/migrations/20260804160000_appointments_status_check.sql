-- Esito "No Show" sul calendario (Luca 04/08): il CHECK rigido su
-- appointments.status elencava solo i 7 stati originari e rifiutava
-- no_show — che pero' esiste in calendario_esiti dal pannello admin.
-- Gli esiti sono AMMINISTRABILI a DB (Amministrazione → Calendario Esiti):
-- un elenco cablato nel constraint tornera' a esplodere alla prossima voce
-- nuova, quindi il CHECK si TOGLIE — la fonte di verita' e' calendario_esiti
-- e il picker della UI propone solo quelle voci. (Pattern gia' visto col
-- CHECK di comunicazioni.type, mig. 154/159.)
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
NOTIFY pgrst, 'reload schema';
