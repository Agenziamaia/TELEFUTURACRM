-- Mig. 120 (Luca 31/07): PROFILO PERSONALE.
-- 1) app_users.cf: il codice fiscale del collaboratore (mancava a sistema).
-- 2) profilo_richieste: le richieste di MODIFICA dei dati gia' presenti —
--    l'utente propone, l'amministrazione approva dal pannello Utenti.
--    (La prima compilazione di un campo vuoto scrive direttamente su
--    app_users, senza richiesta.)

alter table public.app_users add column if not exists cf text;

create table if not exists public.profilo_richieste (
    id bigserial primary key,
    user_id uuid not null,
    user_name text,
    campo text not null,
    etichetta text,
    valore_attuale text,
    valore_nuovo text not null,
    stato text not null default 'in_attesa' check (stato in ('in_attesa','approvata','rifiutata')),
    richiesta_il timestamptz default now(),
    gestita_da text,
    gestita_il timestamptz
);
