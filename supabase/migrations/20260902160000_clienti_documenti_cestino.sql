-- ═══ IL CESTINO DEI DOCUMENTI DEL CLIENTE ═════════════════════════════════
-- Luca, 02/09: «io come admin devo poter cancellare dei documenti all'interno
-- del fascicolo documenti dentro clienti».
--
-- Fino a oggi il fascicolo era di sola aggiunta, e c'era scritto nel codice:
-- «Solo AGGIUNTA: eliminare i documenti esistenti non è previsto». La ragione
-- era buona — lì dentro ci sono le carte d'identità dei clienti e i contratti
-- firmati — ma un fascicolo dove non si può togliere niente è un fascicolo che
-- si riempie di errori: la foto sbagliata, il documento del cliente sbagliato,
-- il file caricato due volte.
--
-- ⚠️ QUINDI SI TOGLIE DAL FASCICOLO, NON DAL MONDO. Cancellare per davvero un
-- documento d'identità caricato per errore sul cliente sbagliato è giusto;
-- cancellare per errore il contratto firmato di una vendita è un danno che non
-- si ripara. La riga esce dal fascicolo e viene copiata QUI, con chi l'ha
-- tolta, quando e perché — e il file, in magazzino, viene spostato in una
-- cartella «cestino/», così il suo indirizzo pubblico smette di funzionare ma
-- il file esiste ancora.

create table if not exists public.contract_attachments_cestino (
    id                uuid primary key default gen_random_uuid(),
    -- la riga com'era, per poterla rimettere identica
    attachment_id     uuid not null,
    client_id         uuid,
    contract_id       text,
    file_url          text not null,
    file_name         text,
    file_type         text,
    creato_il         timestamptz,
    -- dov'è finito il file in magazzino: serve a rimetterlo al suo posto
    storage_path      text,
    storage_cestino   text,
    -- chi, quando, perché
    eliminato_da      uuid,
    eliminato_da_nome text,
    eliminato_il      timestamptz not null default now(),
    motivo            text
);

comment on table public.contract_attachments_cestino is
  'I documenti tolti dal fascicolo di un cliente. Non è uno storico decorativo: è l''unica strada per rimettere a posto una cancellazione sbagliata, perché il file in magazzino viene spostato in «cestino/» e non distrutto.';

create index if not exists cac_client on public.contract_attachments_cestino (client_id, eliminato_il desc);
create index if not exists cac_url on public.contract_attachments_cestino (file_url);

-- ── LA SERRATURA ──────────────────────────────────────────────────────────
-- Come ogni tabella del CRM: si passa dal token della sessione, mai dalla
-- chiave anonima. Chi legge e scrive è la rotta, con la chiave di servizio.
alter table public.contract_attachments_cestino enable row level security;
drop policy if exists tf_blindata on public.contract_attachments_cestino;
create policy tf_blindata on public.contract_attachments_cestino
    for all
    using ((current_setting('request.jwt.claims', true)::json ->> 'tf_uid') is not null)
    with check ((current_setting('request.jwt.claims', true)::json ->> 'tf_uid') is not null);

revoke all on public.contract_attachments_cestino from anon;
grant select, insert, update, delete on public.contract_attachments_cestino to authenticated;

-- prova: la tabella c'è, è blindata, e anon non la vede
do $$
declare rls boolean; pol int; perm int;
begin
    select relrowsecurity into rls from pg_class where oid = 'public.contract_attachments_cestino'::regclass;
    select count(*) into pol from pg_policies where tablename = 'contract_attachments_cestino';
    select count(*) into perm from information_schema.role_table_grants
     where table_name = 'contract_attachments_cestino' and grantee = 'anon';
    raise notice 'cestino documenti · RLS: % · policy: % · permessi ad anon: % (devono essere 0)', rls, pol, perm;
    if not rls or pol = 0 or perm > 0 then
        raise exception 'il cestino dei documenti non è blindato: rls=% policy=% anon=%', rls, pol, perm;
    end if;
end $$;
