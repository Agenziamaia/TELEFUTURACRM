-- ═══ LA SPIA VERDE DICEVA LA COSA SBAGLIATA ═══════════════════════════════
--
-- L'hub leggeva `cron.job_run_details.status`. Quello dice che la RIGA SQL è
-- girata — e la riga SQL è `select net.http_post(...)`, che mette la chiamata
-- in coda e ritorna subito. Riesce SEMPRE: su 1.898 corse registrate, 1.898
-- «succeeded». La chiamata vera può andare in timeout, tornare 502 o non
-- partire, e il registro dei cron non se ne accorge.
--
-- Misurato stanotte, prima di questa migrazione: `otp-pulizia` risultava «in
-- salute, gira e non ha fallito» mentre circa tre chiamate su quattro non
-- arrivavano a destinazione. Peggio del silenzio: prima non si sapeva, adesso
-- c'era scritto verde. E Luca aveva chiesto esattamente il contrario —
-- «verificare che effettivamente funzionano».
--
-- L'esito vero sta in `net._http_response`, ma lì non c'è scritto CHI ha fatto
-- la chiamata (nessuna colonna con l'URL o il lavoro) e le righe spariscono
-- dopo poche ore. Quindi: ogni lavoro adesso scrive il numero della propria
-- chiamata in una tabella nostra, e un raccoglitore ci riporta dentro l'esito
-- finché è ancora leggibile.

-- ── 1. il quaderno delle chiamate ─────────────────────────────────────────
create table if not exists automatismi_chiamate (
    id          bigserial primary key,
    jobname     text not null,
    request_id  bigint,
    chiesto_il  timestamptz not null default now(),
    esito       text,                 -- ok | errore | scaduta | rifiutata | persa
    codice      int,
    errore      text,
    raccolto_il timestamptz
);
create index if not exists automatismi_chiamate_job_idx on automatismi_chiamate (jobname, chiesto_il desc);
create index if not exists automatismi_chiamate_aperte_idx on automatismi_chiamate (request_id) where esito is null;
comment on table automatismi_chiamate is
    'Una riga per ogni chiamata fatta da un lavoro automatico, con l''esito VERO della chiamata HTTP (non solo «la riga SQL è girata»).';

alter table automatismi_chiamate enable row level security;
drop policy if exists tf_automatismi_chiamate on automatismi_chiamate;
create policy tf_automatismi_chiamate on automatismi_chiamate for select
using (exists (select 1 from app_users me where me.id = tf_uid()
               and me.role in ('admin','dev','direttore_generale','amministrativo')));

-- ── 2. il registro di chi tocca gli automatismi ───────────────────────────
-- «resta scritto che è spento» era una promessa non mantenuta: si cambiava
-- `cron.job.active` e non restava traccia di chi, quando e perché.
create table if not exists automatismi_eventi (
    id        bigserial primary key,
    quando    timestamptz not null default now(),
    chi       uuid,
    azione    text not null,          -- orario | spento | acceso | parametri
    bersaglio text not null,
    dettaglio text
);
alter table automatismi_eventi enable row level security;
drop policy if exists tf_automatismi_eventi on automatismi_eventi;
create policy tf_automatismi_eventi on automatismi_eventi for select
using (exists (select 1 from app_users me where me.id = tf_uid()
               and me.role in ('admin','dev','direttore_generale','amministrativo')));

-- ── 3. il raccoglitore ────────────────────────────────────────────────────
create or replace function automatismi_raccogli()
returns int
language plpgsql security definer set search_path = public, net, pg_temp
as $$
declare n int;
begin
    update automatismi_chiamate c
       set esito = case
                     when r.timed_out then 'scaduta'
                     when r.error_msg is not null then 'errore'
                     when r.status_code between 200 and 299 then 'ok'
                     else 'rifiutata'
                   end,
           codice = r.status_code,
           errore = nullif(coalesce(r.error_msg,
                        case when coalesce(r.status_code, 0) >= 400 then left(r.content, 300) end), ''),
           raccolto_il = now()
      from net._http_response r
     where r.id = c.request_id and c.esito is null;
    get diagnostics n = row_count;

    -- la risposta vive poche ore: passate dodici, se non l'abbiamo raccolta
    -- non la raccoglieremo più. «persa» è onesto, «ok» sarebbe una bugia.
    update automatismi_chiamate
       set esito = 'persa', raccolto_il = now()
     where esito is null and chiesto_il < now() - interval '12 hours';

    delete from automatismi_chiamate where chiesto_il < now() - interval '90 days';
    return n;
end $$;
revoke all on function automatismi_raccogli() from public, anon;
grant execute on function automatismi_raccogli() to authenticated;

-- ── 4. i lavori imparano a firmare le proprie chiamate ────────────────────
-- ⚠️ E `otp-pulizia` prende la parola d'ordine: era l'unico dei cinque senza,
-- cioè una rotta aperta a Internet che a ogni giro apre una connessione IMAP
-- su ogni casella dei codici. Farla girare da fuori è la strada per farsi
-- bloccare dal provider e lasciare i negozi senza OTP.
do $$
declare parola text;
begin
    select parola_cron into parola from impostazioni_servizio where id = 1;
    if parola is null then raise exception 'manca la parola dei cron'; end if;

    perform cron.schedule('wa-triage', '*/10 * * * *', format($cmd$
      insert into automatismi_chiamate (jobname, request_id)
      select 'wa-triage', net.http_post(
        url := 'https://crm.telefuturasrl.com/api/whatsapp/triage',
        body := '{}'::jsonb,
        headers := '{"Content-Type": "application/json", "x-cron": "%s"}'::jsonb,
        timeout_milliseconds := 20000)
    $cmd$, parola));

    perform cron.schedule('email-triage', '5-59/10 * * * *', format($cmd$
      insert into automatismi_chiamate (jobname, request_id)
      select 'email-triage', net.http_post(
        url := 'https://crm.telefuturasrl.com/api/email/triage',
        body := '{}'::jsonb,
        headers := '{"Content-Type": "application/json", "x-cron": "%s"}'::jsonb,
        timeout_milliseconds := 20000)
    $cmd$, parola));

    perform cron.schedule('otp-pulizia', '2-59/10 * * * *', format($cmd$
      insert into automatismi_chiamate (jobname, request_id)
      select 'otp-pulizia', net.http_post(
        url := 'https://crm.telefuturasrl.com/api/passwords/pulizia-otp',
        body := '{}'::jsonb,
        headers := '{"Content-Type": "application/json", "x-cron": "%s"}'::jsonb,
        timeout_milliseconds := 20000)
    $cmd$, parola));

    perform cron.schedule('assenze-report-mensile', '0 5 1 * *', format($cmd$
      insert into automatismi_chiamate (jobname, request_id)
      select 'assenze-report-mensile', net.http_post(
        url := 'https://crm.telefuturasrl.com/api/assenze/report-mensile',
        body := '{}'::jsonb,
        headers := '{"Content-Type": "application/json", "x-cron": "%s"}'::jsonb,
        timeout_milliseconds := 60000)
    $cmd$, parola));

    perform cron.schedule('assenze-report-mensile-ritento', '0 9 1 * *', format($cmd$
      insert into automatismi_chiamate (jobname, request_id)
      select 'assenze-report-mensile-ritento', net.http_post(
        url := 'https://crm.telefuturasrl.com/api/assenze/report-mensile',
        body := '{}'::jsonb,
        headers := '{"Content-Type": "application/json", "x-cron": "%s"}'::jsonb,
        timeout_milliseconds := 60000)
    $cmd$, parola));

    -- il raccoglitore: SQL puro, nessuna chiamata, ogni cinque minuti
    perform cron.schedule('automatismi-raccolta', '*/5 * * * *', 'select automatismi_raccogli()');
end $$;

-- ── 5. quello che l'hub legge, adesso dice la verità ──────────────────────
-- I RUOLI ALLINEATI (rilievo del revisore): prima la tabella si apriva a
-- quattro ruoli, le funzioni a tre e il menu a due. Chi non vede la sezione
-- non deve poterla usare per un'altra strada: una lista sola, qui.
create or replace function automatismi_puo() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
    select exists (select 1 from app_users me where me.id = tf_uid() and me.role in ('admin','dev'));
$$;
revoke all on function automatismi_puo() from public, anon;
grant execute on function automatismi_puo() to authenticated;

drop policy if exists tf_automatismi on automatismi_config;
create policy tf_automatismi on automatismi_config for all
using (automatismi_puo()) with check (automatismi_puo());
drop policy if exists tf_automatismi_chiamate on automatismi_chiamate;
create policy tf_automatismi_chiamate on automatismi_chiamate for select using (automatismi_puo());
drop policy if exists tf_automatismi_eventi on automatismi_eventi;
create policy tf_automatismi_eventi on automatismi_eventi for select using (automatismi_puo());

drop function if exists automatismi_cron();
create or replace function automatismi_cron()
returns table (
    jobname text, schedule text, active boolean, rotta text,
    ultima_il timestamptz, ultima_esito text, ultimo_errore text,
    corse_7g bigint, ko_7g bigint, aperte bigint,
    sql_corse_7g bigint, sql_ko_7g bigint
)
language sql security definer set search_path = public, cron, pg_temp
as $$
    select j.jobname::text, j.schedule::text, j.active,
           substring(j.command from 'url := ''([^'']+)''')::text,
           v.ultima_il, v.ultima_esito, v.ultimo_errore,
           coalesce(v.corse, 0), coalesce(v.ko, 0), coalesce(v.aperte, 0),
           coalesce(s.corse, 0), coalesce(s.ko, 0)
      from cron.job j
      -- l'esito VERO della chiamata HTTP
      left join lateral (
           select count(*) filter (where c.esito is not null) as corse,
                  count(*) filter (where c.esito is not null and c.esito <> 'ok') as ko,
                  count(*) filter (where c.esito is null) as aperte,
                  max(c.chiesto_il) as ultima_il,
                  (array_agg(coalesce(c.esito, 'in corso') order by c.chiesto_il desc))[1]::text as ultima_esito,
                  (array_agg(c.errore order by c.chiesto_il desc) filter (where c.errore is not null))[1]::text as ultimo_errore
             from automatismi_chiamate c
            where c.jobname = j.jobname and c.chiesto_il > now() - interval '7 days'
      ) v on true
      -- e, accanto, se il guscio SQL è nemmeno partito
      left join lateral (
           select count(*) as corse, count(*) filter (where d.status not in ('succeeded','running','starting','sending')) as ko
             from cron.job_run_details d
            where d.jobid = j.jobid and d.start_time > now() - interval '7 days'
      ) s on true
     where automatismi_puo()
     order by j.jobname;
$$;
revoke all on function automatismi_cron() from public, anon;
grant execute on function automatismi_cron() to authenticated;

-- ── 6. l'andamento: quante chiamate al giorno e quante andate male ────────
-- «creando delle analisi e dando dei numeri… un po' come in AI» (Luca): un
-- totale non dice se sta peggiorando. Questa serie sì.
create or replace function automatismi_giorni(giorni int default 14)
returns table (giorno date, jobname text, ok bigint, ko bigint)
language sql security definer set search_path = public, pg_temp
as $$
    select (c.chiesto_il at time zone 'Europe/Rome')::date,
           c.jobname::text,
           count(*) filter (where c.esito = 'ok'),
           count(*) filter (where c.esito is not null and c.esito <> 'ok')
      from automatismi_chiamate c
     where automatismi_puo()
       and c.chiesto_il > now() - make_interval(days => greatest(1, least(90, giorni)))
     group by 1, 2 order by 1, 2;
$$;
revoke all on function automatismi_giorni(int) from public, anon;
grant execute on function automatismi_giorni(int) to authenticated;

-- ── 7. chi tocca, firma ───────────────────────────────────────────────────
create or replace function automatismi_pianifica(nome text, quando text)
returns text
language plpgsql security definer set search_path = public, cron, pg_temp
as $$
declare cmd text; prima text;
begin
    if not automatismi_puo() then raise exception 'non autorizzato'; end if;
    -- si prende il comando del lavoro DI POSTGRES: filtrare per username
    -- evita che, con un omonimo di un altro proprietario, cron.schedule ne
    -- crei un secondo invece di aggiornare questo — due invii, in silenzio
    select command, schedule into cmd, prima from cron.job where jobname = nome and username = current_user;
    if cmd is null then raise exception 'lavoro automatico sconosciuto: %', nome; end if;
    perform cron.schedule(nome, quando, cmd);
    insert into automatismi_eventi (chi, azione, bersaglio, dettaglio)
    values (tf_uid(), 'orario', nome, format('da «%s» a «%s»', prima, quando));
    return quando;
end $$;
revoke all on function automatismi_pianifica(text, text) from public, anon;
grant execute on function automatismi_pianifica(text, text) to authenticated;

create or replace function automatismi_interruttore(nome text, acceso boolean, perche text default null)
returns boolean
language plpgsql security definer set search_path = public, cron, pg_temp
as $$
declare idj bigint;
begin
    if not automatismi_puo() then raise exception 'non autorizzato'; end if;
    select jobid into idj from cron.job where jobname = nome and username = current_user;
    if idj is null then raise exception 'lavoro automatico sconosciuto: %', nome; end if;
    perform cron.alter_job(idj, active := acceso);
    insert into automatismi_eventi (chi, azione, bersaglio, dettaglio)
    values (tf_uid(), case when acceso then 'acceso' else 'spento' end, nome, nullif(perche, ''));
    return acceso;
end $$;
revoke all on function automatismi_interruttore(text, boolean, text) from public, anon;
grant execute on function automatismi_interruttore(text, boolean, text) to authenticated;
drop function if exists automatismi_interruttore(text, boolean);

-- chi ha toccato cosa, per l'hub
create or replace function automatismi_storia(quanti int default 20)
returns table (quando timestamptz, chi text, azione text, bersaglio text, dettaglio text)
language sql security definer set search_path = public, pg_temp
as $$
    select e.quando, coalesce(u.full_name, '—')::text, e.azione, e.bersaglio, e.dettaglio
      from automatismi_eventi e left join app_users u on u.id = e.chi
     where automatismi_puo()
     order by e.quando desc limit greatest(1, least(100, quanti));
$$;
revoke all on function automatismi_storia(int) from public, anon;
grant execute on function automatismi_storia(int) to authenticated;
