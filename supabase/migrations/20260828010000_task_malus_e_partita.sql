-- ══ IL MALUS DELLE TASK, E IL COLLO DI BOTTIGLIA SULLA PERSONA ══════════
-- Luca 28/08: «dove archiviare questi importi di malus generati nel
-- calendario? Li hai collegati agli utenti come quelli di tracking PDA?
-- Quelli dei caller sono collegati allo stesso modo? Devono essere tutti
-- alla pari, provenienti da diverse sezioni, che vanno poi in collo di
-- bottiglia sull'utente, dove andranno anche le commissioni.»
--
-- Stato dei fatti prima di oggi: tre archivi (malus_storico del Tracking,
-- caller_malus, usati_malus) con la STESSA forma — periodo, giorni,
-- importo, e i quattro stati in_corso/attivo/compensato/archiviato — ma con
-- il soggetto scritto come TESTO in tre colonne diverse (`venditore`,
-- `caller`, `tecnico`) e MAI un user_id. E nessun punto in cui si sommano.
--
-- Qui si fanno tre cose:
--   1. le REGOLE del patto delle task, amministrabili come le altre;
--   2. l'archivio `task_malus`, stessa forma delle sorelle ma con user_id
--      dalla nascita: non ripetiamo l'aggancio per nome;
--   3. la vista `partita_persona`, il collo di bottiglia: tutte le fonti
--      normalizzate su una riga per episodio, con l'utente risolto.

-- ── 1. LE REGOLE ────────────────────────────────────────────────────────
create table if not exists task_regole (
    id            int primary key default 1,
    giorni_malus  int not null default 2,       -- entro quanti giorni va lavorata
    malus_giorno  numeric not null default 5,   -- € per ogni giorno oltre
    salta_domenica boolean not null default true,
    aggiornato_il timestamptz not null default now(),
    aggiornato_da text,
    constraint task_regole_una_riga check (id = 1)
);
insert into task_regole (id) values (1) on conflict (id) do nothing;
alter table task_regole enable row level security;
drop policy if exists task_regole_all on task_regole;
create policy task_regole_all on task_regole for all to public using (true) with check (true);

-- ── 2. L'ARCHIVIO ───────────────────────────────────────────────────────
-- stessi quattro stati delle sorelle: in_corso (sta ancora maturando),
-- attivo (definitivo, aspetta compensazione), compensato, archiviato
create table if not exists task_malus (
    id            uuid primary key default gen_random_uuid(),
    task_id       bigint not null,
    user_id       uuid,                 -- ⚠️ QUI SÌ, dalla nascita
    persona       text not null,        -- il nome resta: gli storici si leggono
    assegnata_da  text,
    titolo        text,
    scadenza      date not null,
    data_fine     date,                 -- quando è stata finalmente lavorata
    giorni        int not null default 0,
    malus_giorno  numeric not null default 0,
    importo       numeric not null default 0,
    stato         text not null default 'in_corso'
                  check (stato in ('in_corso', 'attivo', 'compensato', 'archiviato')),
    compensato_il timestamptz,
    compensato_da text,
    note          text,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    eliminato     boolean not null default false,
    eliminato_il  timestamptz,
    eliminato_da  text,
    unique (task_id)
);
create index if not exists task_malus_persona on task_malus (user_id, stato);
alter table task_malus enable row level security;
drop policy if exists task_malus_all on task_malus;
create policy task_malus_all on task_malus for all to public using (true) with check (true);

-- ── 3. IL COLLO DI BOTTIGLIA ────────────────────────────────────────────
-- Una riga per episodio, da qualunque sezione arrivi, con la persona
-- risolta a user_id. Il join per NOME è il ponte verso il passato: le tre
-- tabelle storiche non hanno l'id, e riscriverle a posteriori sarebbe un
-- rischio che non serve — la vista lo fa al volo e mostra anche i buchi
-- (user_id nullo = nome che non corrisponde a nessun collaboratore).
create or replace view partita_persona as
    select 'tracking'::text as fonte, m.id::text as episodio_id,
           u.id as user_id, m.venditore as persona,
           m.data_inizio::date as dal, m.data_fine::date as al,
           m.giorni, m.importo, m.stato,
           m.contract_id as riferimento, m.negozio,
           m.created_at, coalesce(m.eliminato, false) as eliminato
      from malus_storico m
      left join app_users u on lower(btrim(u.full_name)) = lower(btrim(m.venditore))
    union all
    select 'caller', c.id::text,
           u.id, c.caller,
           c.dal, c.al, c.giorni, c.importo, c.stato,
           c.call_id, null,
           c.created_at, coalesce(c.eliminato, false)
      from caller_malus c
      left join app_users u on lower(btrim(u.full_name)) = lower(btrim(c.caller))
    union all
    select 'usato', s.id::text,
           u.id, s.tecnico,
           s.data_inizio, s.data_fine, s.giorni, s.importo, s.stato,
           s.imei, null,
           s.created_at, false
      from usati_malus s
      left join app_users u on lower(btrim(u.full_name)) = lower(btrim(s.tecnico))
    union all
    select 'task', t.id::text,
           t.user_id, t.persona,
           t.scadenza, t.data_fine, t.giorni, t.importo, t.stato,
           t.task_id::text, null,
           t.created_at, t.eliminato
      from task_malus t;
