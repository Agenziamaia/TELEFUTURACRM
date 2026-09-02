-- ═══ LE CREDENZIALI PAYSTORE, UNA PER NEGOZIO E PER SOCIETÀ ═══════════════
-- Luca 02/09: «sono arrivate tutte le credenziali API di PayStore, sono
-- veramente tante — ne hanno creata una per ogni punto vendita, diviso per
-- società».
--
-- Sono 16 terne (client id, client secret, signing key). Fino a ieri il CRM ne
-- conosceva UNA sola, nelle variabili d'ambiente del server: bastava per il
-- collaudo, non basta più. Sedici segreti non stanno nelle variabili
-- d'ambiente, e in un file del progetto non ci vanno mai.
--
-- ⚠️ QUALE CREDENZIALE USA UNA RICARICA. La coppia (negozio, società). La
-- società non è quella del negozio: è quella della CASSA su cui è uscito lo
-- scontrino — a Donna ci sono due registratori, e infatti l'archivio ha 14
-- ricariche battute come Telefutura e 15 come Telefutura 2, dallo stesso
-- bancone. Ogni riga di `paystore_ricariche` porta già quel dato (misurato:
-- zero righe senza società), quindi la credenziale si sceglie da lì.
--
-- ⚠️ I SEGRETI SONO CIFRATI A RIPOSO, con lo stesso cifrario delle password
-- delle caselle di posta e dei codici a due fattori (AES-256-GCM, chiave nelle
-- variabili d'ambiente del server). Al browser non arrivano mai: la tabella si
-- legge solo dal server, e la schermata mostra «configurata», non il valore.

create table if not exists public.paystore_credenziali (
    id              uuid primary key default gen_random_uuid(),
    negozio         text not null,
    azienda         text not null,
    /* l'identificativo che usa PayStore nei suoi fogli: serve a ritrovare la
       riga quando le rigenerano, e a spiegare a chi guarda da dove viene */
    identificativo  text,
    client_id       text not null,
    -- cifrati: qui dentro non c'è niente in chiaro
    secret_cifrato  text not null,
    signing_cifrata text not null,
    attivo          boolean not null default true,
    nota            text,
    creato_da       uuid,
    creato_il       timestamptz not null default now(),
    aggiornato_il   timestamptz not null default now()
);

comment on table public.paystore_credenziali is
  'Le credenziali API di PayStore, una per negozio e per società. ⚠️ `secret_cifrato` e `signing_cifrata` sono cifrati (AES-256-GCM): non si leggono dal browser e non si stampano da nessuna parte.';
comment on column public.paystore_credenziali.azienda is
  'La società della CASSA, non quella del negozio: a Donna lo stesso bancone batte su due registratori di due società diverse.';

-- una sola credenziale viva per negozio e società
create unique index if not exists paystore_cred_uniq
    on public.paystore_credenziali (negozio, azienda) where attivo;

alter table public.paystore_credenziali enable row level security;
drop policy if exists tf_blindata on public.paystore_credenziali;
/* ⚠️ NESSUNA POLICY DI LETTURA. Non è una dimenticanza: questa tabella la
   legge solo il server con la chiave di servizio, che le policy non le guarda.
   Una policy «basta essere dentro il CRM» qui vorrebbe dire che chiunque abbia
   una sessione può scaricarsi i segreti di pagamento dell'azienda. */
revoke all on public.paystore_credenziali from anon, authenticated;

do $$
declare pol int; perm int;
begin
    select count(*) into pol from pg_policies where tablename = 'paystore_credenziali';
    select count(*) into perm from information_schema.role_table_grants
     where table_name = 'paystore_credenziali' and grantee in ('anon', 'authenticated');
    raise notice 'credenziali PayStore · policy: % · permessi a anon/authenticated: % (devono essere 0)', pol, perm;
    if perm > 0 then raise exception 'la tabella dei segreti è raggiungibile dal browser: % permessi', perm; end if;
end $$;
