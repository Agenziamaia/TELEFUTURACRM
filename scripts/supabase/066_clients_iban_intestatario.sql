-- 066: IBAN e intestatario diverso in anagrafica cliente.
--
-- Segnalazione 19 (Manu): "in fase di creazione anagrafica ho inserito l'iban
-- del cliente, ricercando l'anagrafica l'iban non risulta salvato".
-- Motivo: la tabella clients NON ha mai avuto una colonna iban. Il campo era
-- presente nel form di Registra Contratto e nel PDA, ma al salvataggio veniva
-- semplicemente scartato: nessun errore, nessun dato.
--
-- Segnalazione 20 (Manu): sotto l'IBAN serve un flag "diverso intestatario"
-- che apre nome, cognome e codice fiscale dell'intestatario del conto.

alter table public.clients add column if not exists iban text;
alter table public.clients add column if not exists intestatario_diverso boolean not null default false;
alter table public.clients add column if not exists intestatario_nome text;
alter table public.clients add column if not exists intestatario_cognome text;
alter table public.clients add column if not exists intestatario_cf text;

notify pgrst, 'reload schema';
