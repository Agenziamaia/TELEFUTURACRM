-- IL GIRO DI RITORNO (Luca 28/08 sera).
--
-- «Deve diventare la loro coscienza, conoscerli meglio di quanto loro
--  conoscano se stessi. Lo useranno anche per cose extra-lavorative, per
--  lasciarsi appunti in qualsiasi momento della giornata.»
--
-- Una coscienza è esattamente questo: un sistema che ti ripresenta le tue cose
-- nel momento in cui contano. Il ciclo è:
--     lasci una cosa in due secondi → la ritrovi quando serve, senza averla
--     cercata → e quindi lasci la prossima.
--
-- Senza la restituzione, un posto dove scrivere si abbandona in due settimane.
-- Con la restituzione diventa insostituibile in un mese — e non è replicabile
-- altrove, perché il valore non sta nel modello ma nelle tracce lasciate qui.
--
-- ⚠️ Il ritorno vive DENTRO il CRM. Mai una notifica push, mai una mail: la
-- stessa identica informazione, spostata di canale, smette di essere «ritrovo
-- le mie cose» e diventa «l'azienda mi scrive di sabato sera».

create table if not exists ai_appunti (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  testo text not null,
  -- quando riportarglielo davanti. Vuoto = non c'è promessa: resta lì e basta.
  ricorda_il timestamptz,
  -- già restituito? (così non torna due volte)
  restituito_at timestamptz,
  -- da dove è stato scritto: aiuta a ricordarsi il contesto
  origine text,
  created_at timestamptz not null default now()
);

create index if not exists ai_appunti_user on ai_appunti (user_id, created_at desc);
-- quelli da restituire: pochi, e si cercano a ogni apertura
create index if not exists ai_appunti_da_restituire on ai_appunti (user_id, ricorda_il)
  where ricorda_il is not null and restituito_at is null;

-- ── LA ROBA DI UNO NON SI MESCOLA CON QUELLA DI UN ALTRO ─────────────────
-- Stessa regola dello spazio dell'assistente: è il database a non consegnare
-- gli appunti altrui, non l'educazione della schermata. Nemmeno l'admin entra:
-- un posto dove qualcuno può affacciarsi non è un posto dove si scrive quello
-- che si pensa davvero.
alter table ai_appunti enable row level security;
drop policy if exists tf_mio on ai_appunti;
create policy tf_mio on ai_appunti for all
  using (user_id = (current_setting('request.jwt.claims', true)::json ->> 'tf_uid')::uuid)
  with check (user_id = (current_setting('request.jwt.claims', true)::json ->> 'tf_uid')::uuid);

comment on table ai_appunti is
  'Gli appunti che una persona lascia all''assistente, e che l''assistente le riporta davanti al momento giusto. Privati per costruzione (RLS), mai notificati fuori dal CRM.';
