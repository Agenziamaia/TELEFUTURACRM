-- ═══ L'HUB DEGLI AUTOMATISMI (Luca 31/08) ═════════════════════════════════
--
-- «Creami una sezione dedicata agli automatismi. Nel futuro ne costruiremo
-- tanti, quindi crealo già come Hub: da qui voglio vedere in ogni sezione i
-- relativi automatismi e funzionamenti, e voglio poter modificare tempistiche,
-- destinatari e tutto ciò che è possibile modificare, nonché verificare che
-- effettivamente funzionano.»
--
-- Oggi i lavori automatici vivono in tre posti diversi e nessuno li guarda
-- insieme: l'orario sta dentro `cron.job` (schema di sistema, che il browser
-- non può nemmeno leggere), i destinatari dentro il codice di una rotta, e
-- «ha funzionato?» si scopre solo quando qualcuno si lamenta che non è
-- arrivato niente. Questa migrazione dà tre cose all'hub:
--
--   1. un posto dove scrivere i parametri modificabili;
--   2. una finestra SICURA su cron.job — senza il comando, che contiene la
--      parola d'ordine dei lavori: chi guarda l'hub non deve poterla leggere;
--   3. un modo per cambiare l'orario senza toccare il database a mano.

-- ── 1. i parametri modificabili ───────────────────────────────────────────
create table if not exists automatismi_config (
    id            text primary key,          -- l'id dell'automatismo nel registro del codice
    parametri     jsonb not null default '{}'::jsonb,
    acceso        boolean not null default true,
    aggiornato_il timestamptz not null default now(),
    aggiornato_da text
);
comment on table automatismi_config is
    'Parametri modificabili dei lavori automatici (destinatari, soglie, orari): la riga esiste solo se qualcuno ha cambiato qualcosa, altrimenti valgono i valori scritti nel registro del codice.';

alter table automatismi_config enable row level security;
drop policy if exists tf_automatismi on automatismi_config;
-- solo chi amministra: qui dentro ci sono destinatari di email e orari di
-- lavori che spediscono documenti del personale
create policy tf_automatismi on automatismi_config for all
using (exists (select 1 from app_users me where me.id = tf_uid()
               and me.role in ('admin','dev','direttore_generale','amministrativo')))
with check (exists (select 1 from app_users me where me.id = tf_uid()
               and me.role in ('admin','dev','direttore_generale','amministrativo')));

-- ── 2. la finestra sicura su cron ─────────────────────────────────────────
-- ⚠️ NIENTE `command`: dentro c'è la parola d'ordine con cui i lavori si
-- presentano alle rotte. Esce l'indirizzo chiamato (che è pubblico) e basta.
create or replace function automatismi_cron()
returns table (
    jobname text, schedule text, active boolean, rotta text,
    ultima_il timestamptz, ultima_esito text, corse_7g bigint, ko_7g bigint
)
language sql security definer set search_path = public, cron, pg_temp
as $$
    select j.jobname::text,
           j.schedule::text,
           j.active,
           substring(j.command from 'url := ''([^'']+)''')::text as rotta,
           s.ultima_il, s.ultima_esito, coalesce(s.corse, 0), coalesce(s.ko, 0)
      from cron.job j
      left join lateral (
           select max(d.start_time) as ultima_il,
                  (array_agg(d.status order by d.start_time desc))[1]::text as ultima_esito,
                  count(*) as corse,
                  count(*) filter (where d.status <> 'succeeded') as ko
             from cron.job_run_details d
            where d.jobid = j.jobid and d.start_time > now() - interval '7 days'
      ) s on true
     where exists (select 1 from app_users me where me.id = tf_uid()
                   and me.role in ('admin','dev','direttore_generale','amministrativo'))
     order by j.jobname;
$$;
revoke all on function automatismi_cron() from public;
grant execute on function automatismi_cron() to authenticated, anon;
comment on function automatismi_cron() is
    'Stato dei lavori automatici per l''hub Automatismi: orario, acceso/spento, indirizzo chiamato e come sono andate le ultime corse. Il comando NON esce: contiene la parola d''ordine.';

-- ── 3. cambiare l'orario, senza perdere il comando ────────────────────────
-- Riscrive SOLO la pianificazione, tenendo il comando esistente (parola
-- d'ordine compresa): è la cosa che Luca vuole poter fare dall'hub, ed è anche
-- l'unica che si può sbagliare in modo silenzioso — un comando riscritto a
-- mano senza la parola spegne il lavoro senza dirlo a nessuno.
create or replace function automatismi_pianifica(nome text, quando text)
returns text
language plpgsql security definer set search_path = public, cron, pg_temp
as $$
declare cmd text; ok boolean;
begin
    if not exists (select 1 from app_users me where me.id = tf_uid()
                   and me.role in ('admin','dev','direttore_generale')) then
        raise exception 'non autorizzato';
    end if;
    select command into cmd from cron.job where jobname = nome;
    if cmd is null then raise exception 'lavoro automatico sconosciuto: %', nome; end if;
    -- la pianificazione la valida pg_cron stesso: se la stringa non è un cron
    -- valido, schedule() solleva e la riga vecchia resta dov'era
    perform cron.schedule(nome, quando, cmd);
    return quando;
end $$;
revoke all on function automatismi_pianifica(text, text) from public;
grant execute on function automatismi_pianifica(text, text) to authenticated;

-- ── 4. accendere e spegnere ───────────────────────────────────────────────
create or replace function automatismi_interruttore(nome text, acceso boolean)
returns boolean
language plpgsql security definer set search_path = public, cron, pg_temp
as $$
begin
    if not exists (select 1 from app_users me where me.id = tf_uid()
                   and me.role in ('admin','dev','direttore_generale')) then
        raise exception 'non autorizzato';
    end if;
    if not exists (select 1 from cron.job where jobname = nome) then
        raise exception 'lavoro automatico sconosciuto: %', nome;
    end if;
    perform cron.alter_job((select jobid from cron.job where jobname = nome), active := acceso);
    return acceso;
end $$;
revoke all on function automatismi_interruttore(text, boolean) from public;
grant execute on function automatismi_interruttore(text, boolean) to authenticated;
