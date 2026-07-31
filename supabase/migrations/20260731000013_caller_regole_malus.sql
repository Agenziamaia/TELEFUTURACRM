-- Mig. 119 (Luca 31/07):
-- 1) COMPORTAMENTO degli stati caller configurabile dal pannello (prima gli
--    automatismi — WhatsApp sugli NR, data richiamo, ponte calendario sugli
--    appuntamenti — erano riconosciuti PER NOME nel codice).
-- 2) Motore DA LAVORARE / WARNING / MALUS stile Dragon PDA sulle pratiche del
--    call center: soglie in giorni lavorativi + malus giornaliero per stato
--    (caller_regole, seed dalla tabella di Luca) ed episodi persistenti
--    (caller_malus: in_corso -> attivo alla sanatoria -> compensato in gara).

alter table public.caller_opzioni add column if not exists comportamento text
    check (comportamento is null or comportamento in ('appuntamento','richiamo','non_risposto','neutro'));

update public.caller_opzioni set comportamento = 'non_risposto'
 where categoria = 'stato' and comportamento is null
   and voce in ('Cold NR1','Cold NR2','Cold NR3','Hot NR1','Hot NR2','Hot NR3');
update public.caller_opzioni set comportamento = 'richiamo'
 where categoria = 'stato' and comportamento is null
   and voce in ('Da richiamare','Appuntamento telefonico');
update public.caller_opzioni set comportamento = 'appuntamento'
 where categoria = 'stato' and comportamento is null
   and (voce like '%° Appuntamento' or voce like '%° DTS');
update public.caller_opzioni set comportamento = 'neutro'
 where categoria = 'stato' and comportamento is null;

create table if not exists public.caller_regole (
    stato text primary key,
    giorni_lavorare int,
    giorni_warning int,
    giorni_malus int,
    malus_giorno numeric(8,2) default 0,
    esente boolean not null default false,
    updated_at timestamptz default now()
);

insert into public.caller_regole (stato, giorni_lavorare, giorni_warning, giorni_malus, malus_giorno, esente) values
    ('Nuovo',                   0, 0, 1,  5, false),
    ('Cold NR1',                1, 2, 3,  5, false),
    ('Cold NR2',                1, 2, 3,  5, false),
    ('Cold NR3',                2, 3, 4,  5, false),
    ('Hot NR1',                 1, 1, 2, 10, false),
    ('Hot NR2',                 1, 1, 2, 10, false),
    ('Hot NR3',                 2, 2, 3, 10, false),
    ('1° Appuntamento',         1, 1, 2, 20, false),
    ('2° Appuntamento',         1, 2, 3, 15, false),
    ('3° Appuntamento',         1, 2, 3, 15, false),
    ('Cold Mai Risposto',       null, null, null, null, true),
    ('Hot Sparito',             null, null, null, null, true),
    ('Da richiamare',           0, 1, 2,  5, false),
    ('Appuntamento telefonico', 0, 0, 1, 10, false),
    ('Non interessato',         null, null, null, null, true),
    ('Andato Non Interessato',  null, null, null, null, true),
    ('Non ricontattare',        null, null, null, null, true)
on conflict (stato) do nothing;

create table if not exists public.caller_malus (
    id bigserial primary key,
    call_id text not null,
    stato_pratica text,
    caller text,
    dal date not null,
    al date,
    giorni int not null default 0,
    importo numeric(10,2) not null default 0,
    stato text not null default 'in_corso' check (stato in ('in_corso','attivo','compensato')),
    compensato_il timestamptz,
    compensato_da text,
    created_at timestamptz default now(),
    unique (call_id, dal)
);
