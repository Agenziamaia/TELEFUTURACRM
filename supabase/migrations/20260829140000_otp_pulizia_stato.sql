-- QUANDO È GIRATA L'ULTIMA PULIZIA DEI CODICI (Luca 29/08).
--
-- La rotta /api/passwords/pulizia-otp la chiama il cron, e come le altre rotte
-- periodiche del CRM non ha una sessione: è una macchina che chiama. Restando
-- aperta, però, qualcuno potrebbe martellarla — e ogni giro apre una
-- connessione IMAP su ogni casella dei codici. I server di posta le contano, e
-- oltre una certa soglia bloccano: il risultato sarebbe che i negozi non
-- ricevono più i codici.
--
-- Questa riga sola serve a dire «l'ultimo giro è di un minuto fa, lascia
-- perdere». Stesso principio del lock/debounce del triage.

create table if not exists public.otp_pulizia_stato (
  id            smallint primary key default 1,
  ultima_corsa  timestamptz,
  ultimo_esito  text,
  constraint otp_pulizia_stato_riga_unica check (id = 1)
);

insert into public.otp_pulizia_stato (id) values (1) on conflict (id) do nothing;

-- RLS DICHIARATA (regola del progetto: ogni tabella nuova nasce con RLS).
-- Nessuno la legge dal browser: ci passa solo il server con la chiave
-- amministratore, che le RLS le scavalca per disegno.
alter table public.otp_pulizia_stato enable row level security;

comment on table public.otp_pulizia_stato is
  'Una riga sola: quando è girata l''ultima pulizia delle mail dei codici usa e getta. Serve a non far ripartire il giro troppo spesso — ogni giro apre una connessione IMAP su ogni casella.';
