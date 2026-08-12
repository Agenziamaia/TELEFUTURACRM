-- UNDO dell'import tabellare (esito Luca 12/08 su "copia-mese": «non ho un
-- pulsante che mi consente di cancellare nel momento in cui faccio un import
-- sbagliato: deve riportarmi allo stato precedente, non cancellare tutto»).
-- Ogni "Copia da <mese>" registra QUI gli id esatti che ha inserito: l'annulla
-- cancella solo quelli — tutto ciò che c'era prima o è stato aggiunto dopo
-- (la "base del setting") resta al suo posto.
create table if not exists pay_import_log (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  month date not null,
  lato text not null default 'ragazzi',
  fonte text,                            -- il mese da cui si è copiato (es. "2026-07")
  piste_ids uuid[] not null default '{}',
  soglie_ids uuid[] not null default '{}',
  righe_ids uuid[] not null default '{}',
  annullato boolean not null default false,
  creato_il timestamptz not null default now()
);

create index if not exists pay_import_log_brand_mese
  on pay_import_log (brand, month, lato, creato_il desc);

-- il trigger rls_auto_enable accende RLS su ogni tabella nuova: senza policy
-- i salvataggi anon falliscono in silenzio (già successo sulle pay_*)
alter table pay_import_log enable row level security;
drop policy if exists pay_import_log_allow_all on pay_import_log;
create policy pay_import_log_allow_all on pay_import_log
  for all using (true) with check (true);
