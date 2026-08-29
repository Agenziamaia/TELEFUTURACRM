-- LE CHIAVI DEI SERVIZI ESTERNI (Luca 29/08).
--
-- Il primo inquilino è l'indirizzo del canale Discord dove i negozi mandano il
-- report della sera. Un webhook non è un dato: è una CHIAVE — chi ce l'ha può
-- scrivere in quel canale a nome dell'azienda.
--
-- Perché nel database e non nelle variabili del server: le variabili si
-- cambiano solo entrando nella macchina, e ogni volta serve un deploy. Qui la
-- riga si cambia da sola e il codice la rilegge al volo. La variabile d'ambiente
-- resta comunque PRIORITARIA: se un domani qualcuno la imposta, vince lei.
--
-- ⚠️ La riga NON esce mai dal server: RLS accesa e NESSUNA policy, quindi dal
-- browser non la legge nessuno — nemmeno l'admin. Ci arriva solo il codice di
-- server con la chiave amministratore.

create table if not exists public.impostazioni_servizio (
  id                      smallint primary key default 1,
  discord_report_webhook  text,
  aggiornato_il           timestamptz default now(),
  aggiornato_da           text,
  constraint impostazioni_servizio_riga_unica check (id = 1)
);

insert into public.impostazioni_servizio (id) values (1) on conflict (id) do nothing;

alter table public.impostazioni_servizio enable row level security;

comment on table public.impostazioni_servizio is
  'Chiavi dei servizi esterni (Discord, ecc.). RLS accesa SENZA policy: dal browser non la legge nessuno, ci arriva solo il server con la chiave amministratore.';
