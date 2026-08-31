-- IL REPORT DEL PRIMO DEL MESE IMPARA LA PAROLA D'ORDINE (31/08 sera).
--
-- La rotta /api/assenze/report-mensile era rimasta l'unica aperta a chiunque
-- su Internet: era nata alle 18:14, la «parola dei cron» è arrivata alle 18:39
-- e ha messo in sicurezza gli altri due lavori, non lei.
--
-- Il danno peggiore non era la mail di troppo. Il registro `report_assenze_
-- inviati` serve a non spedire due volte: una chiamata da fuori avrebbe segnato
-- il mese come «inviato» e il giro vero delle 07:00 sarebbe saltato, lasciando
-- il consulente del lavoro senza il file — senza che nessuno se ne accorgesse.
--
-- Da adesso la rotta accetta O una sessione di amministrazione O questa parola,
-- e i due comandi la presentano. Stessa parola degli altri lavori: ruotandola
-- vanno riscritti insieme tutti i comandi in cron.job.
do $$
declare parola text;
begin
  select parola_cron into parola from impostazioni_servizio where id = 1;
  if parola is null then
    raise exception 'manca impostazioni_servizio.parola_cron: applicare prima 20260831250000_parola_dei_cron.sql';
  end if;

  perform cron.unschedule('assenze-report-mensile') where exists (select 1 from cron.job where jobname = 'assenze-report-mensile');
  perform cron.unschedule('assenze-report-mensile-ritento') where exists (select 1 from cron.job where jobname = 'assenze-report-mensile-ritento');

  perform cron.schedule('assenze-report-mensile', '0 5 1 * *', format($cmd$
    select net.http_post(
      url := 'https://crm.telefuturasrl.com/api/assenze/report-mensile',
      body := '{}'::jsonb,
      headers := '{"Content-Type": "application/json", "x-cron": "%s"}'::jsonb,
      timeout_milliseconds := 60000)
  $cmd$, parola));

  perform cron.schedule('assenze-report-mensile-ritento', '0 9 1 * *', format($cmd$
    select net.http_post(
      url := 'https://crm.telefuturasrl.com/api/assenze/report-mensile',
      body := '{}'::jsonb,
      headers := '{"Content-Type": "application/json", "x-cron": "%s"}'::jsonb,
      timeout_milliseconds := 60000)
  $cmd$, parola));
end $$;
