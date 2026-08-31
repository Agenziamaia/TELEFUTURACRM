-- LA PAROLA D'ORDINE DEI LAVORI AUTOMATICI (31/08).
--
-- Due lavori girano da soli ogni dieci minuti — il triage delle chat e quello
-- della posta — e chiamano le rotte del CRM senza presentare niente:
--
--   headers := '{"Content-Type": "application/json"}'
--
-- Finché quelle rotte erano aperte a tutti, funzionava. Ma erano aperte a
-- tutti: chiunque su Internet faceva partire una corsa di classificazione, e
-- ogni corsa costa denaro vero e può far cestinare chat in automatico.
--
-- Chiudendole con la sola sessione avrei spento i due lavori — cioè il triage
-- che il CRM ha appena acceso. Quindi si dà loro una parola d'ordine: le
-- rotte accettano O una sessione firmata (una persona) O questa parola (un
-- lavoro automatico).
--
-- ⚠️ VIVE NEL DATABASE, non in una variabile d'ambiente: una variabile si
-- cambia solo entrando nella macchina e ogni volta serve un rilascio. Qui la
-- si ruota quando si vuole, aggiornando insieme la riga e i due comandi.
-- La tabella è già chiusa a chiave: non la legge nemmeno l'assistente AI.

alter table impostazioni_servizio add column if not exists parola_cron text;

update impostazioni_servizio
   set parola_cron = coalesce(parola_cron, encode(gen_random_bytes(24), 'hex')),
       aggiornato_il = now(), aggiornato_da = 'parola dei cron 31/08'
 where id = 1;

comment on column impostazioni_servizio.parola_cron is
  'La parola con cui i lavori automatici (cron) si presentano alle rotte del CRM. Ruotandola vanno aggiornati insieme i comandi in cron.job, altrimenti i lavori si fermano in silenzio.';

-- ── e i due comandi imparano a presentarla ───────────────────────────────
do $$
declare parola text;
begin
  select parola_cron into parola from impostazioni_servizio where id = 1;

  perform cron.unschedule('wa-triage');
  perform cron.schedule('wa-triage', '*/10 * * * *', format($cmd$
    select net.http_post(
      url := 'https://crm.telefuturasrl.com/api/whatsapp/triage',
      body := '{}'::jsonb,
      headers := '{"Content-Type": "application/json", "x-cron": "%s"}'::jsonb,
      timeout_milliseconds := 8000)
  $cmd$, parola));

  perform cron.unschedule('email-triage');
  perform cron.schedule('email-triage', '5-59/10 * * * *', format($cmd$
    select net.http_post(
      url := 'https://crm.telefuturasrl.com/api/email/triage',
      body := '{}'::jsonb,
      headers := '{"Content-Type": "application/json", "x-cron": "%s"}'::jsonb,
      timeout_milliseconds := 8000)
  $cmd$, parola));
end $$;
