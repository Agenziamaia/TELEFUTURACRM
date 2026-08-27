-- STATI NUOVI DELLE TASK (Luca 27/08 sera): «in corso» e «problema».
--
-- ⚠️ Il vincolo vecchio elencava i quattro stati storici, quindi il database
-- RIFIUTAVA i due nuovi: la tendina li proponeva, l'utente li sceglieva e il
-- salvataggio falliva — in silenzio, perché il codice non leggeva l'errore.
-- Trovato dal revisore prima che qualcuno ci sbattesse contro.
--
-- «problema» è quello che regge il giro di ritorno: chi riceve una task la
-- rimanda a chi gliel'ha data con la sua nota (outcome_note) e la spunta
-- «vista» azzerata.
alter table calendar_tasks drop constraint if exists calendar_tasks_status_check;
alter table calendar_tasks add constraint calendar_tasks_status_check
    check (status in ('da_fare', 'in_corso', 'fatta', 'sospesa', 'problema', 'abbandonata'));

-- gli esiti amministrabili (Amministrazione → Calendario): stessa lista, così
-- la tendina e il database dicono la stessa cosa
insert into calendario_esiti (tipo, chiave, etichetta, colore, attiva, ordine)
values ('task', 'in_corso', 'In corso', 'blue', true, 15),
       ('task', 'problema', 'Problema — rimandata al mittente', 'orange', true, 35)
on conflict (tipo, chiave) do update
   set etichetta = excluded.etichetta, colore = excluded.colore, attiva = true;
