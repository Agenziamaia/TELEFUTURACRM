-- CHIUSURA LINEA v2 (Luca 06/08) — due interventi:
--
-- 1) CICLO DI VERIFICA: dopo 35 giorni dalla gestione la pratica passa allo
--    stato "da_verificare" e torna in mano a chi l'ha sottomessa (task ⚡).
--    Se il consulente non la verifica entro 3 giorni matura un malus di
--    5€/giorno; alla verifica passa a "conclusa".
--    Flusso: in_attesa → (da_integrare → in_attesa) → gestita → [35gg] →
--    da_verificare → conclusa. La promozione a da_verificare è LAZY (al
--    load della pagina), nessun cron: la guardia sull'update (status=gestita)
--    evita doppie promozioni concorrenti.
--
-- 2) ALLEGATI NELLA SCHEDA CLIENTE: i PDF delle disdette vivevano solo nel
--    jsonb richieste_disdette.files — la scheda cliente legge
--    contract_attachments (per client_id, mig. 20260806010000). Da ora ogni
--    upload disdetta scrive ANCHE lì (contract_id null: allegato del cliente);
--    qui il backfill dello storico, idempotente per file_url.

-- 1a) stati nuovi nel CHECK
alter table public.richieste_disdette
  drop constraint if exists richieste_disdette_status_check;
alter table public.richieste_disdette
  add constraint richieste_disdette_status_check
  check (status in ('in_attesa','da_integrare','gestita','da_verificare','conclusa'));

-- 1b) date del ciclo: gestita_il (parte il conto dei 35gg), verifica_dal
--     (parte il conto dei 3gg di franchigia malus), verificata_il (chiusura)
alter table public.richieste_disdette
  add column if not exists gestita_il timestamptz,
  add column if not exists verifica_dal timestamptz,
  add column if not exists verificata_il timestamptz;

-- 1c) backfill gestita_il dallo storico jsonb (evento tipo 'chiusura'):
--     le gestite esistenti entrano nel ciclo da subito — se hanno già
--     35 giorni verranno promosse al primo load, con malus che parte
--     SOLO da quel momento (franchigia 3gg dalla promozione, mai retroattiva)
update public.richieste_disdette rd
   set gestita_il = coalesce(
     (select max((e->>'quando')::timestamptz)
        from jsonb_array_elements(rd.storico) e
       where e->>'tipo' = 'chiusura'),
     rd.updated_at)
 where rd.status = 'gestita'
   and rd.gestita_il is null;

-- 2) backfill allegati storici delle disdette in contract_attachments
--    (contract_id null = documento del cliente; file_type 'disdetta')
insert into public.contract_attachments (contract_id, client_id, file_url, file_name, file_type)
select null, rd.client_id, f->>'url', coalesce(f->>'name', 'documento disdetta'), 'disdetta'
  from public.richieste_disdette rd,
       jsonb_array_elements(rd.files) f
 where f->>'url' is not null
   and not exists (
     select 1 from public.contract_attachments ca
      where ca.file_url = f->>'url');

notify pgrst, 'reload schema';
