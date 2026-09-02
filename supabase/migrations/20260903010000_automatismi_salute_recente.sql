-- ═══ UN LAVORO RIPARATO NON È PIÙ GUASTO ══════════════════════════════════
-- Luca 03/09, guardando l'hub dopo la correzione: «queste automazioni stanno
-- ancora così» — badge rosso «guasto», con accanto un errore di timeout che
-- non succede più.
--
-- ⚠️ IL GIUDIZIO GUARDAVA SETTE GIORNI. Una sola chiamata caduta lunedì
-- lasciava la scheda rossa fino alla domenica dopo: chi ripara qualcosa non
-- vede nessuna differenza, e chi legge non sa dire se il guasto è di adesso o
-- di mercoledì scorso. Un cruscotto che dice «rotto» per una settimana dopo la
-- riparazione smette di essere creduto — e il giorno che si rompe davvero
-- nessuno ci fa caso.
--
-- Misurato mentre lo scrivo: il triage WhatsApp ha 51 chiamate cadute in sette
-- giorni ma solo 2 nell'ultima ora e mezza, e sono i due riavvii del deploy;
-- la posta ne ha 6 in sette giorni e ZERO da quando il timeout è stato alzato.
-- Entrambi rossi, entrambi sani.
--
-- Qui si aggiungono i conti RECENTI (ultime 24 ore) accanto a quelli
-- settimanali, che restano perché servono a dire «succede spesso».

-- ⚠️ SI CANCELLA E SI RIFÀ: Postgres non lascia cambiare il tipo restituito da
-- una funzione con `create or replace`, e qui si aggiungono tre colonne.
drop function if exists public.automatismi_cron();

create function public.automatismi_cron()
returns table(
    jobname text, schedule text, active boolean, rotta text,
    ultima_il timestamptz, ultima_esito text, ultimo_errore text,
    corse_7g bigint, ko_7g bigint, aperte bigint,
    sql_corse_7g bigint, sql_ko_7g bigint,
    corse_24h bigint, ko_24h bigint, ultimo_ko_il timestamptz)
language sql security definer
set search_path to 'public', 'cron', 'pg_temp'
as $function$
    select j.jobname::text, j.schedule::text, j.active,
           substring(j.command from 'url := ''([^'']+)''')::text,
           v.ultima_il, v.ultima_esito, v.ultimo_errore,
           coalesce(v.corse, 0), coalesce(v.ko, 0), coalesce(v.aperte, 0),
           coalesce(s.corse, 0), coalesce(s.ko, 0),
           coalesce(v.corse24, 0), coalesce(v.ko24, 0), v.ultimo_ko_il
      from cron.job j
      left join lateral (
           select count(*) filter (where c.esito is not null) as corse,
                  count(*) filter (where c.esito is not null and c.esito <> 'ok') as ko,
                  count(*) filter (where c.esito is null) as aperte,
                  -- ⚠️ GLI STESSI CONTI, MA DI OGGI: è la differenza fra «si è
                  -- rotto una volta» e «è rotto adesso».
                  count(*) filter (where c.esito is not null and c.chiesto_il > now() - interval '24 hours') as corse24,
                  count(*) filter (where c.esito is not null and c.esito <> 'ok' and c.chiesto_il > now() - interval '24 hours') as ko24,
                  max(c.chiesto_il) filter (where c.esito is not null and c.esito <> 'ok') as ultimo_ko_il,
                  max(c.chiesto_il) as ultima_il,
                  (array_agg(coalesce(c.esito, 'in corso') order by c.chiesto_il desc))[1]::text as ultima_esito,
                  (array_agg(c.errore order by c.chiesto_il desc) filter (where c.errore is not null))[1]::text as ultimo_errore
             from automatismi_chiamate c
            where c.jobname = j.jobname and c.chiesto_il > now() - interval '7 days'
      ) v on true
      left join lateral (
           select count(*) as corse, count(*) filter (where d.status not in ('succeeded','running','starting','sending')) as ko
             from cron.job_run_details d
            where d.jobid = j.jobid and d.start_time > now() - interval '7 days'
      ) s on true
     where automatismi_puo()
     order by j.jobname;
$function$;

do $$
declare n int;
begin
    select count(*) into n from information_schema.routines where routine_name='automatismi_cron';
    raise notice 'funzione aggiornata: %', n;
    if n <> 1 then raise exception 'la funzione non c e'; end if;
end $$;
