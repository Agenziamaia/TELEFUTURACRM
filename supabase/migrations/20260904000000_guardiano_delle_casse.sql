-- IL GUARDIANO DELLE CASSE (04/09/2026).
--
-- La cassa Multi di Magliana è rimasta muta per ore la sera del 3 settembre:
-- l'agente di stampa non era ripartito dopo lo spegnimento serale. Il CRM lo
-- SAPEVA — /api/print/health dava quel negozio «down» — ma quell'informazione
-- non arrivava a nessuno. Dal banco «cassa spenta» e «CRM che non parla con la
-- cassa» sono indistinguibili, e ce ne si accorge quando un cliente ha già
-- pagato.
--
-- Da qui un lavoro ogni 5 minuti che guarda la coda di stampa e, se in un
-- negozio abilitato c'è un documento fermo da più di qualche minuto, scrive su
-- WhatsApp a chi deve intervenire. Il segnale NON è «l'agente non risponde» —
-- di notte è normale, i PC sono spenti — ma «qualcuno ha provato a vendere e
-- non è uscito niente»: vale a qualunque ora e non ha bisogno di fasce orarie.
--
-- `pos_allarmi` tiene l'episodio aperto: un avviso per guasto, più quello di
-- rientro. Un allarme che si ripete ogni cinque minuti smette di essere letto
-- alla terza volta.

create table if not exists pos_allarmi (
  negozio          text primary key,
  aperto_il        timestamptz not null default now(),
  ultimo_avviso_il timestamptz,
  chiuso_il        timestamptz,
  dettaglio        text
);
comment on table pos_allarmi is
  'Episodi di cassa ferma, uno per negozio. chiuso_il NULL = episodio in corso: '
  'finché è aperto non si manda un altro avviso per lo stesso guasto.';

-- scritta e letta solo dal server (chiave di servizio): nessuna policy, quindi
-- dal browser non si vede — è un registro di servizio, non un dato di negozio.
alter table pos_allarmi enable row level security;

-- A CHI SI SCRIVE. Numeri separati da virgola: cambiare il tecnico di turno non
-- deve voler dire toccare il software.
alter table impostazioni_servizio add column if not exists wa_allarme_casse text;
comment on column impostazioni_servizio.wa_allarme_casse is
  'Numeri WhatsApp avvisati quando una cassa non stampa, separati da virgola.';
update impostazioni_servizio
   set wa_allarme_casse = '8801404932702'
 where id = 1 and coalesce(wa_allarme_casse, '') = '';

-- IL LAVORO PERIODICO. La parola d'ordine si legge dal database e si mette nel
-- comando con format(): così non finisce dentro un file di migrazione — il repo
-- è pubblico. Stessa parola degli altri lavori: ruotandola vanno riscritti
-- insieme tutti i comandi in cron.job.
do $$
declare parola text;
begin
  select parola_cron into parola from impostazioni_servizio where id = 1;
  if parola is null then
    raise exception 'manca impostazioni_servizio.parola_cron: applicare prima 20260831250000_parola_dei_cron.sql';
  end if;

  perform cron.unschedule('pos-watchdog') where exists (select 1 from cron.job where jobname = 'pos-watchdog');

  perform cron.schedule('pos-watchdog', '*/5 * * * *', format($cmd$
    insert into automatismi_chiamate (jobname, request_id)
    select 'pos-watchdog', net.http_post(
      url := 'https://crm.telefuturasrl.com/api/pos/watchdog',
      body := '{}'::jsonb,
      headers := '{"Content-Type": "application/json", "x-cron": "%s"}'::jsonb,
      timeout_milliseconds := 60000)
  $cmd$, parola));
end $$;
