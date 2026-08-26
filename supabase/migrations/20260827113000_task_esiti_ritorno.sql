-- TASK ASSEGNATE con RITORNO (Luca 27/08 notte): chi assegna una task a
-- un'altra persona deve vedersela TORNARE indietro quando viene chiusa,
-- con le note dell'assegnatario. outcome_note/created_by esistono già:
-- qui il timestamp dell'esito e la spunta «vista» di chi l'ha assegnata.
alter table calendar_tasks add column if not exists esito_at timestamptz;
alter table calendar_tasks add column if not exists esito_visto boolean not null default false;
-- le task già chiuse in passato non devono ripresentarsi come ritorni nuovi
update calendar_tasks set esito_visto = true where status <> 'da_fare' and esito_visto = false;
