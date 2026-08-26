-- REGOLE «NON UTILE» DEI PUNTI VENDITA (Luca 26/08 sera): quando un
-- collaboratore segna una email come spam, il MITTENTE viene registrato qui
-- (scope: la SUA casella) e l'AI lo riceve come regola — le prossime email
-- di quel mittente su quella casella vengono cestinate. La sezione «Non
-- utili» dell'Inbox elenca le segnalazioni della casella e permette di
-- ANNULLARLE (annullata_il): da lì in poi il mittente torna al triage
-- normale. Le regole GLOBALI del titolare restano in email_mittenti_bloccati.
create table if not exists email_regole_utente (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references email_accounts(id) on delete cascade,
  mittente text not null,               -- indirizzo esatto, lowercase
  creato_da uuid references app_users(id),
  creato_il timestamptz not null default now(),
  annullata_il timestamptz,
  annullata_da uuid references app_users(id),
  unique (account_id, mittente)
);
alter table email_regole_utente disable row level security;
