-- IL PATTO NON GUARDA INDIETRO (28/08/2026)
-- Stessa famiglia dell'incidente malus Sky del 25/08 e del Tracking del 27/08:
-- una regola accesa oggi non può fabbricare debiti di ieri. Il patto dei due
-- giorni è stato acceso il 27/08 sera; senza decorrenza il motore stava
-- mostrando 860 € di malus su promemoria che le persone si erano scritte da
-- sole e ne avrebbe archiviati 640 € su task chiuse a luglio.
alter table task_regole add column if not exists decorrenza date;
comment on column task_regole.decorrenza is
  'Da quando vale il patto: le task nate prima non entrano nel conto. Un cambio di regole non è mai retroattivo.';
update task_regole set decorrenza = coalesce(decorrenza, '2026-08-27') where id = 1;

-- gli episodi già scritti su task precedenti si archiviano con la motivazione
update task_malus m set stato = 'archiviato',
       note = coalesce(note, '') || ' [annullato 28/08: task creata prima della decorrenza del patto]',
       updated_at = now()
  from calendar_tasks t
 where t.id = m.task_id and m.stato in ('in_corso', 'attivo')
   and t.created_at::date < '2026-08-27'::date;
