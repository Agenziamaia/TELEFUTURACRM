-- TRIAGE AI delle EMAIL (26/08/2026, fase 2 del progetto Email-come-WhatsApp)
-- — vedi src/lib/ai/emailTriage.ts. Gemello di wa_triage: una riga per
-- conversazione email con lo stato deciso dal modello (rispondere /
-- da_leggere / niente / spazzatura), il perché in una riga, il fingerprint
-- dell'ultimo messaggio letto e l'eventuale AZIONE AUTOMATICA eseguita
-- (lo spam/phishing viene CESTINATO — direttiva Luca 26/08: «cancellale» —
-- tranne che sulle caselle protette, dove finisce in quarantena Spam).

create table if not exists email_triage (
  conversation_id uuid primary key references email_conversations(id) on delete cascade,
  stato text not null check (stato in ('rispondere','da_leggere','niente','spazzatura')),
  azione text,
  azione_auto text check (azione_auto in ('cestinata','quarantena')),
  azione_auto_il timestamptz,
  ripristinata_il timestamptz,          -- l'admin l'ha ripescata dal registro
  ultimo_msg_ts timestamptz not null,
  versione int not null default 1,
  modello text,
  errore text,
  classificato_il timestamptz not null default now()
);
create index if not exists email_triage_stato_idx on email_triage (stato);
create index if not exists email_triage_auto_idx on email_triage (azione_auto) where azione_auto is not null;

create table if not exists email_triage_stato (
  id int primary key,
  in_corsa_da timestamptz,
  ultima_corsa timestamptz,
  ultimo_esito text
);
insert into email_triage_stato (id) values (1) on conflict do nothing;

-- casella PROTETTA: l'AI non cestina mai (quarantena Spam al posto del
-- cestino). Governabile dal Pannello Email; seed sulla casella di
-- amministrazione (direttiva Luca 26/08: «tranne l'email di amministrazione
-- al momento»).
alter table email_accounts add column if not exists ai_protetta boolean not null default false;
update email_accounts set ai_protetta = true where email_address = 'amministrazione@telefuturasrl.com';

-- stessa postura del resto del CRM (anon key, riordino RLS = P0 censito)
alter table email_triage disable row level security;
alter table email_triage_stato disable row level security;

-- cron gemello di wa-triage: ogni 10 minuti, sfalsato di 5 per non
-- accavallare i due motori sullo stesso processo Node
create extension if not exists pg_cron;
create extension if not exists pg_net;
do $do$
begin
  if exists (select 1 from cron.job where jobname = 'email-triage') then
    perform cron.unschedule('email-triage');
  end if;
  perform cron.schedule(
    'email-triage',
    '5-59/10 * * * *',
    $job$select net.http_post(
      url := 'https://crm.telefuturasrl.com/api/email/triage',
      body := '{}'::jsonb,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 8000
    )$job$
  );
end
$do$;
