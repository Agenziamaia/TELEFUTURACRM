-- CASELLE EMAIL MULTI-UTENTE (Luca 26/08): una casella può essere intestata
-- a PIÙ persone (es. una condivisa tra due colleghi), come può già esserlo a
-- più punti vendita gemelli (negozio virgola-separato, convenzione WhatsApp).
-- owner_user_id resta il PRIMO intestatario (compatibilità con tutto ciò che
-- lo legge); gli altri stanno qui. La visibilità è l'unione: owner + membri
-- + chi ha uno dei negozi della casella.
create table if not exists email_account_users (
  account_id uuid not null references email_accounts(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  primary key (account_id, user_id)
);
alter table email_account_users disable row level security;
