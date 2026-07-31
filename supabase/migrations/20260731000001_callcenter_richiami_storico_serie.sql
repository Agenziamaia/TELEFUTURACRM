-- Mig. 107 — Call Center (richieste Luca 31/07/2026):
--   1) richiami telefonici nel CALENDARIO (nuovo type 'richiamo' + link su calls)
--   2) registro telefonico agganciato alla pratica (call_events.call_id) per
--      ricerche, filtri e consultazione AI sullo storico chiamate
--   3) preset "Serie" con origine del lead interno (negozio + mese/anno)
-- Da eseguire A MANO nel SQL Editor di Supabase: il deploy non tocca il DB.
-- Il codice e' difensivo: senza questa migrazione tutto il resto continua a
-- funzionare, ma i richiami NON vanno in calendario (il vincolo 1a li blocca).

-- 1a) il vincolo su appointments.type non conosceva 'richiamo'
alter table public.appointments drop constraint if exists appointments_type_check;
alter table public.appointments add constraint appointments_type_check
  check (type in ('incoming', 'outgoing', 'self_generated', 'richiamo'));

-- 1b) link pratica -> evento richiamo (il ri-fissaggio AGGIORNA lo stesso
--     evento invece di duplicarlo; l'eliminazione della pratica lo porta via)
alter table public.calls
  add column if not exists richiamo_event_id bigint references public.appointments(id) on delete set null;

-- 2) link registro telefonico -> pratica
alter table public.call_events
  add column if not exists call_id uuid references public.calls(id) on delete set null;
create index if not exists call_events_call_idx on public.call_events (call_id);

-- 3) origine del lead interno nel preset Serie (stesse info delle liste del
--    direttore: da quale negozio e mese/anno si sta attingendo)
alter table public.caller_presets
  add column if not exists negozio_provenienza text not null default '',
  add column if not exists mese_provenienza    text not null default '',
  add column if not exists anno_provenienza    text not null default '';
