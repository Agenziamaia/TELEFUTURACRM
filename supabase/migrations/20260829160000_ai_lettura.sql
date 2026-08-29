-- L'ASSISTENTE LEGGE IL DATABASE, MA SOLO LEGGERE (Luca 29/08).
--
-- «Mi piacerebbe che l'AI avesse contesto pieno sul CRM.» Giusto: scrivere un
-- tool a mano per ogni domanda non scala, e invecchia. Però una query scritta
-- da un modello non è codice che abbiamo revisionato: va eseguita in una stanza
-- da cui non si può fare danno.
--
-- LA STANZA. Un ruolo `ai_lettore` che ha SOLO il permesso di leggere, e uno
-- schema `ai` tutto suo dove può possedere la sua funzione. La funzione gira
-- CON I DIRITTI DI QUEL RUOLO (security definer + proprietà), non con quelli
-- del server che la chiama: anche se il modello scrivesse un DELETE, il
-- database lo rifiuterebbe. Dentro, la transazione è dichiarata di sola
-- lettura e c'è un tetto di tempo, così una query pesante non blocca il CRM.
--
-- ⚠️ Le tabelle davvero riservate (password, chiavi, caselle di posta) non
-- sono nemmeno concesse in lettura: non è il codice a nasconderle, è il
-- database a non fargliele vedere. Se un giorno qualcuno sbaglia un filtro
-- nell'applicazione, qui sotto non cambia niente.
--
-- ⚠️ Perché uno schema separato e non `public`: per possedere una funzione in
-- uno schema bisogna potervi creare oggetti, e a un ruolo di sola lettura quel
-- permesso su `public` non si dà. Con uno schema suo il problema non esiste.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'ai_lettore') then
    create role ai_lettore nologin;
  end if;
  execute format('grant ai_lettore to %I', current_user);
end $$;

create schema if not exists ai authorization ai_lettore;

/* ⚠️ IL RUOLO SCAVALCA LE RLS, E VA DETTO CHIARO.
   Le RLS del CRM sono scritte per gli utenti del browser: un ruolo di servizio
   non ha un `tf_uid`, quindi con le RLS attive non vedrebbe NIENTE (provato:
   tutte le query tornavano vuote). È la stessa scelta già fatta per la chiave
   amministratore che usa tutto il server.
   Il patto è quello scritto in docs/SICUREZZA.md §3: chi scavalca le RLS ha il
   DOVERE di applicare i permessi PRIMA di restituire i dati. Qui lo fa
   `permessiDati.ts`, che toglie righe e colonne fuori portata DOPO l'esecuzione.
   Quello che il database continua a garantire da sé — e che nessun errore
   dell'applicazione può aggirare — sono le TABELLE: password, caselle di posta
   e chiavi dei servizi non gli sono proprio concesse. */
alter role ai_lettore bypassrls;

grant usage on schema public to ai_lettore;
grant select on all tables in schema public to ai_lettore;
alter default privileges in schema public grant select on tables to ai_lettore;

-- ...tranne quello che non deve vedere mai.
revoke all on table public.password_credentials   from ai_lettore;
revoke all on table public.password_access_log    from ai_lettore;
revoke all on table public.email_accounts         from ai_lettore;
revoke all on table public.impostazioni_servizio  from ai_lettore;

drop function if exists ai.interroga(text);

create function ai.interroga(q text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  risultato jsonb;
begin
  -- la grammatica: una sola SELECT, niente altro. Il confine vero restano i
  -- permessi del ruolo; questo serve a dare un errore CHIARO invece di un
  -- «permission denied» che il modello non saprebbe interpretare.
  if q !~* '^\s*(select|with)\s' then
    raise exception 'Solo interrogazioni: la richiesta deve cominciare con SELECT o WITH.';
  end if;
  if q ~* ';\s*\S' then
    raise exception 'Una interrogazione per volta.';
  end if;

  set local transaction_read_only = on;
  set local statement_timeout = '8s';

  execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (%s) t', q) into risultato;
  return risultato;
end $$;

alter function ai.interroga(text) owner to ai_lettore;

revoke all on function ai.interroga(text) from public, anon, authenticated;
grant usage on schema ai to service_role;
grant execute on function ai.interroga(text) to service_role;

comment on function ai.interroga(text) is
  'Esegue UNA interrogazione dell''assistente AI con i diritti del ruolo ai_lettore (solo SELECT), in transazione di sola lettura e con un tetto di 8 secondi. Chiamabile solo dal server.';

-- IL PONTE. Il client Supabase chiama solo funzioni dello schema `public`, e
-- lo schema `ai` non è esposto — meglio così: la stanza chiusa resta chiusa.
-- Questa non fa niente di suo, gira dentro `ai.interroga` che è dove stanno i
-- chiavistelli.
create or replace function public.ai_interroga(q text)
returns jsonb
language sql
security invoker
set search_path = public, ai, pg_temp
as $$ select ai.interroga(q) $$;

revoke all on function public.ai_interroga(text) from public, anon, authenticated;
grant execute on function public.ai_interroga(text) to service_role;

comment on function public.ai_interroga(text) is
  'Ponte verso ai.interroga: il client Supabase vede solo lo schema public. I controlli stanno tutti nella funzione vera.';
