-- L'EMAIL DELLE ASSENZE, IL PRIMO DI OGNI MESE (Luca 31/08).
--
-- «Al primo di ogni mese dobbiamo inviare un'email con l'export delle ferie e
-- quello della malattia a telefuturasrl@hotmail.com e a
-- studioandreavincioni@gmail.com. Nel testo dobbiamo dire di fare attenzione
-- che ci sono due tab per ogni foglio, uno di dettaglio e uno di riepilogo.»
--
-- Il mese che parte è quello APPENA CHIUSO: il primo settembre esce agosto,
-- intero. I numeri sono gli stessi del bottone Excel — stessa libreria.
--
-- IL REGISTRO SERVE A NON MANDARLA DUE VOLTE. Il cron può ripetere, la rete
-- può cadere a metà: di ogni mese resta una riga, e la rotta se la trova
-- «inviato» non fa niente. È anche il posto dove si legge se un mese NON è
-- partito, e perché.
create table if not exists report_assenze_inviati (
    mese           date primary key,          -- il primo del mese spedito
    esito          text not null,             -- inviato | errore
    errore         text,
    destinatari    text,
    righe_ferie    integer,
    righe_malattia integer,
    inviato_il     timestamptz default now()
);

comment on table report_assenze_inviati is
  'Un rigo per mese spedito dal report automatico delle assenze: serve a non mandarlo due volte e a vedere i mesi non partiti.';

alter table report_assenze_inviati enable row level security;
drop policy if exists tf_blindata on report_assenze_inviati;
create policy tf_blindata on report_assenze_inviati for all
  using (public.tf_uid() is not null) with check (public.tf_uid() is not null);

-- ── IL CRON ─────────────────────────────────────────────────────────────────
-- Il database gira a UTC: le 05:00 UTC sono le 07:00 di Roma d'estate e le
-- 06:00 d'inverno — in tutti e due i casi prima che qualcuno apra la posta.
-- Il secondo giro delle 09:00 UTC è la rete di sicurezza: se il primo è
-- fallito riprova, e se era andato a buon fine non fa niente (il registro qui
-- sopra glielo dice).
select cron.unschedule('assenze-report-mensile') where exists (select 1 from cron.job where jobname = 'assenze-report-mensile');
select cron.unschedule('assenze-report-mensile-ritento') where exists (select 1 from cron.job where jobname = 'assenze-report-mensile-ritento');

select cron.schedule('assenze-report-mensile', '0 5 1 * *', $$
  select net.http_post(
    url := 'https://crm.telefuturasrl.com/api/assenze/report-mensile',
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 60000)
$$);

select cron.schedule('assenze-report-mensile-ritento', '0 9 1 * *', $$
  select net.http_post(
    url := 'https://crm.telefuturasrl.com/api/assenze/report-mensile',
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 60000)
$$);
