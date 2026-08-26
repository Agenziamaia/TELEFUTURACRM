-- Cron del TRIAGE AI WhatsApp (26/08/2026) — versione a repo del job creato
-- a mano via pooler lo stesso giorno (rilievo revisore G1: il job viveva solo
-- nel DB, invisibile al repo). Idempotente: si può rilanciare.
--
-- Ogni 10 minuti pg_cron chiama la route di produzione con un POST vuoto
-- (NIENTE force: vale come una chiamata normale, lock+debounce della lib
-- decidono). Il timeout 8s di pg_net tronca solo la CONNESSIONE: il route
-- handler Node continua e completa la corsa, l'esito resta leggibile in
-- wa_triage_stato.ultimo_esito (verificato dal revisore, G2).

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $do$
begin
  if exists (select 1 from cron.job where jobname = 'wa-triage') then
    perform cron.unschedule('wa-triage');
  end if;
  perform cron.schedule(
    'wa-triage',
    '*/10 * * * *',
    $job$select net.http_post(
      url := 'https://crm.telefuturasrl.com/api/whatsapp/triage',
      body := '{}'::jsonb,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 8000
    )$job$
  );
end
$do$;
