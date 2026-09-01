-- LA CHIAVE DI DOCUSEAL (01/09).
--
-- Sta qui e non in una variabile d'ambiente per la stessa ragione della parola
-- dei cron: una variabile si cambia solo entrando nella macchina e ogni volta
-- serve un rilascio. `impostazioni_servizio` e' gia' la cassaforte del CRM —
-- chiusa in lettura a tutti, assistente AI compreso — e la chiave si ruota
-- aggiornando una riga.
--
-- ⚠️ NON deve MAI uscire verso il browser: DocuSeal si chiama solo dal server.
-- Con questa chiave si creano richieste di firma a nome di Telefutura e si
-- leggono i documenti firmati dai clienti.
alter table impostazioni_servizio add column if not exists docuseal_api_key text;

comment on column impostazioni_servizio.docuseal_api_key is
  'Chiave API di DocuSeal (header X-Auth-Token). Solo lato server: crea richieste di firma a nome di Telefutura e legge i documenti firmati dai clienti.';
