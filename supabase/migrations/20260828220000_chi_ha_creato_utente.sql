-- «CHI HA INSERITO QUESTO UTENTE?» (Luca 28/08 sera) — non si poteva sapere.
--
-- Le schede del personale portano IBAN, RAL, costo azienda, contratto: si
-- sapeva QUANDO nasce una scheda (`created_at`) ma non per mano di chi, e
-- nemmeno chi l'ha modificata dopo. Su dati del genere è una lacuna, non un
-- dettaglio: alla prima domanda — questa — non c'era risposta.
alter table app_users add column if not exists created_by uuid;
alter table app_users add column if not exists updated_by uuid;
alter table app_users add column if not exists scheda_updated_at timestamptz;

comment on column app_users.created_by is 'Chi ha creato questa scheda (app_users.id). Vuoto per le schede nate prima del 28/08/2026.';
comment on column app_users.updated_by is 'Chi ha modificato per ultimo questa scheda.';
comment on column app_users.scheda_updated_at is 'Quando la scheda è stata modificata per l''ultima volta.';

create index if not exists app_users_created_by on app_users (created_by) where created_by is not null;
