-- ARCHIVIATO nei malus del call center (Luca 21/08 sera): quarto stato per i
-- malus di caller LICENZIATI/SOSPESI non recuperati — la partita e' chiusa ma
-- il credito resta in traccia (si compensa se mai escono crediti a favore
-- della persona). Il CHECK originale (mig. 119) ammetteva solo
-- in_corso/attivo/compensato e avrebbe respinto la sync.
-- malus_storico (Tracking PDA) non ha CHECK sullo stato: nessun intervento.
alter table public.caller_malus drop constraint if exists caller_malus_stato_check;
alter table public.caller_malus add constraint caller_malus_stato_check
  check (stato in ('in_corso','attivo','compensato','archiviato'));
