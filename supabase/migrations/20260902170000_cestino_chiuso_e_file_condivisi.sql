-- ═══ DUE BUCHI NEL CESTINO DEI DOCUMENTI ══════════════════════════════════
-- Revisione ostile del commit `bcab7d66`.

-- ── 1 · LA RETE DI SICUREZZA NON AVEVA IL LUCCHETTO ───────────────────────
-- La tabella del cestino è «l'unica strada per rimettere a posto una
-- cancellazione sbagliata» — e la si poteva svuotare da qualunque sessione del
-- CRM. Il `grant` scritto nella migrazione dava a `authenticated` anche DELETE
-- e UPDATE, e i permessi di default del progetto ci avevano aggiunto TRUNCATE,
-- che scavalca la RLS del tutto.
--
-- Chi non può nemmeno cancellare un documento (42 persone su 48) poteva
-- cancellare la prova che qualcun altro l'aveva fatto. Qui dentro si scrive
-- solo attraverso la rotta, che usa la chiave di servizio: al browser non
-- serve nessun permesso di scrittura.

revoke insert, update, delete, truncate on public.contract_attachments_cestino from authenticated;
revoke all on public.contract_attachments_cestino from anon;

drop policy if exists tf_blindata on public.contract_attachments_cestino;
-- ⚠️ SOLA LETTURA, e solo dentro il CRM. La scrittura passa dalla chiave di
-- servizio, che le policy non le guarda.
create policy tf_sola_lettura on public.contract_attachments_cestino
    for select
    using ((current_setting('request.jwt.claims', true)::json ->> 'tf_uid') is not null);

-- ── 2 · LO STESSO FILE SERVE ANCHE ALTROVE ────────────────────────────────
-- Lo stesso oggetto di magazzino è puntato dagli Usati (`allegato_documento`,
-- `allegato_dichiarazione`: il percorso nudo) e dalle Pratiche (dentro il JSON
-- della firma). Misurato: 116 allegati degli Usati e 5 delle Pratiche puntano
-- a file che compaiono anche nel fascicolo di un cliente — fra cui il registro
-- firme di una pratica viva.
--
-- La rotta guardava solo le stringhe di `contract_attachments`, che sono
-- scritte in un'altra forma («/api/file/<deposito>/<percorso>»), quindi non li
-- vedeva mai: spostava il file, e quelle due schermate smettevano di aprirlo
-- senza dire niente a nessuno.
--
-- Il controllo sta qui e non nel codice perché `pratiche.firma` è `jsonb`: dal
-- client non si può cercare dentro, e una ricerca sbagliata avrebbe risposto
-- «nessuno lo usa» proprio nel caso da proteggere.

create or replace function public.documento_in_uso_altrove(p_bucket text, p_path text)
returns text
language sql
stable
security definer
set search_path = public
as $$
    select case
        when p_bucket = 'usati_attachments' and exists (
            select 1 from public.usati u
             where u.allegato_documento = p_path or u.allegato_dichiarazione = p_path
        ) then 'un veicolo usato'
        when p_bucket = 'pratiche-allegati' and exists (
            select 1 from public.pratiche p where p.firma::text like '%' || p_path || '%'
        ) then 'una pratica'
        else null
    end;
$$;

comment on function public.documento_in_uso_altrove is
  'Dice se un file di magazzino serve anche a un''altra sezione (Usati, Pratiche). Serve prima di spostarlo nel cestino: toglierlo dal fascicolo di un cliente non deve rompere il registro firme di una pratica viva.';

revoke all on function public.documento_in_uso_altrove(text, text) from public, anon;
grant execute on function public.documento_in_uso_altrove(text, text) to authenticated, service_role;

-- ── LE PROVE ──────────────────────────────────────────────────────────────
do $$
declare
    scrivibile int; pol int; n_usati int; n_prat int; esito text;
begin
    select count(*) into scrivibile from information_schema.role_table_grants
     where table_name = 'contract_attachments_cestino' and grantee = 'authenticated'
       and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');
    select count(*) into pol from pg_policies where tablename = 'contract_attachments_cestino';
    raise notice 'cestino · permessi di scrittura ad authenticated: % (devono essere 0) · policy: %', scrivibile, pol;
    if scrivibile > 0 then
        raise exception 'il cestino è ancora scrivibile dal browser: % permessi', scrivibile;
    end if;

    -- la funzione risponde davvero su un file condiviso vero
    select count(*) into n_usati from public.usati where allegato_documento is not null;
    select public.documento_in_uso_altrove('usati_attachments',
        (select allegato_documento from public.usati where allegato_documento is not null limit 1)) into esito;
    raise notice 'usati con allegato: % · la funzione risponde: %', n_usati, coalesce(esito, 'NULL');
    if n_usati > 0 and esito is distinct from 'un veicolo usato' then
        raise exception 'la funzione non riconosce un allegato degli usati che esiste davvero';
    end if;

    select count(*) into n_prat from public.pratiche where firma is not null;
    raise notice 'pratiche con firma: %', n_prat;
    -- un percorso che non esiste non deve MAI dare un falso positivo
    if public.documento_in_uso_altrove('contracts', 'percorso/che/non/esiste.pdf') is not null then
        raise exception 'la funzione dice che un file inesistente è in uso';
    end if;
end $$;
