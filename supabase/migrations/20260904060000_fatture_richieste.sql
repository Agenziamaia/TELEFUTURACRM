-- ═══════════════════════════════════════════════════════════════════════════
-- LA FATTURA: il processo che mancava
--
-- Luca, 04/09/2026: «quando viene un cliente business che vuole una fattura,
-- ad oggi non abbiamo il processo». Fin qui la cassa sapeva fare una cosa
-- sola — emettere lo scontrino — e chi chiedeva fattura veniva gestito a
-- voce, fuori dal CRM.
--
-- ── LA REGOLA FISCALE CHE REGGE TUTTO ──────────────────────────────────────
-- Se si emette fattura NON si emette scontrino: sarebbero due documenti per
-- la stessa operazione, e l'importo finirebbe due volte (una nei corrispettivi
-- del registratore, una nel fatturato). Quindi con la fattura richiesta il
-- registratore NON stampa niente e la vendita non entra nella chiusura Z.
--
-- ── MA I SOLDI SI INCASSANO LO STESSO ──────────────────────────────────────
-- Il cliente paga in negozio, contanti o carta, e quell'incasso deve stare nei
-- flussi di cassa come tutti gli altri. Per questo il flusso di pagamento
-- resta identico — cash machine compresa: `/api/vendita/incasso` e
-- `/api/vendita/scontrino` sono due chiamate separate, quindi si può incassare
-- davvero senza emettere niente.
--
-- ── E I DATI DEL CLIENTE SI CONGELANO QUI ──────────────────────────────────
-- Una fattura si fa con i dati di QUEL giorno: se il cliente cambia sede fra
-- la vendita e l'emissione, la fattura deve riportare quelli di allora. Per
-- questo la riga porta la sua copia dei dati e non un semplice rimando
-- all'anagrafica.
-- ═══════════════════════════════════════════════════════════════════════════

/* ── L'ANAGRAFICA IMPARA I DUE CAMPI CHE MANCAVANO ───────────────────────────
   Per la fattura elettronica servono il codice destinatario (7 caratteri) o in
   alternativa la PEC: senza uno dei due lo SdI non sa a chi consegnarla.
   `clients` non li aveva — con 339 clienti business già in archivio. */
alter table public.clients
    add column if not exists codice_destinatario text,
    add column if not exists pec text;
comment on column public.clients.codice_destinatario is
    'Codice destinatario SdI, 7 caratteri (6 per la PA). ''0000000'' quando si consegna via PEC o il cliente è un privato.';

create table if not exists public.fatture_richieste (
    id                  uuid primary key default gen_random_uuid(),
    /* la vendita da cui nasce: il link della notifica porta qui */
    contratto_id        text,
    negozio             text not null,
    /* quale delle due società fattura. La decide la MERCE, come lo scontrino:
       la si porta scritta perché al momento dell'emissione il carrello non
       esiste più. */
    societa             text,
    creato_da           text,
    created_at          timestamptz not null default now(),
    totale              numeric(12,2) not null,

    /* ── IL CLIENTE, CONGELATO ─────────────────────────────────────────── */
    client_id           text,
    cliente_tipo        text,                    -- business | consumer
    ragione_sociale     text,
    nome                text,
    cognome             text,
    cf_piva             text,
    codice_destinatario text,
    pec                 text,
    indirizzo           text,
    cap                 text,
    citta               text,
    email               text,
    telefono            text,

    /* ── COSA FATTURARE E COME È STATO INCASSATO ───────────────────────── */
    righe               jsonb not null default '[]'::jsonb,
    pagamenti           jsonb not null default '[]'::jsonb,

    /* ── L'ESITO ───────────────────────────────────────────────────────── */
    stato               text not null default 'da_fare',
    numero_fattura      text,
    fatta_il            timestamptz,
    fatta_da            text,
    note                text,
    constraint fatture_stato_noto check (stato in ('da_fare', 'fatta', 'annullata')),
    constraint fatture_totale_sensato check (totale >= 0 and totale <= 1000000)
);

create index if not exists fatture_richieste_da_fare
    on public.fatture_richieste (created_at desc) where stato = 'da_fare';
create index if not exists fatture_richieste_contratto
    on public.fatture_richieste (contratto_id);

alter table public.fatture_richieste enable row level security;

/* CHI LEGGE: il governo vede tutto (è l'amministrazione che le emette); gli
   altri vedono le richieste dei negozi a cui sono assegnati, così il
   venditore può controllare che la sua sia arrivata. */
drop policy if exists fatture_lettura on public.fatture_richieste;
create policy fatture_lettura on public.fatture_richieste
    for select to public using (
        tf_e_governo()
        or exists (select 1 from user_stores s
                    where s.user_id = tf_uid()
                      and lower(split_part(s.store_name, ' ', 1))
                        = lower(split_part(fatture_richieste.negozio, ' ', 1))));

/* CHI SCRIVE: la richiesta la crea chi vende, e basta essere loggati. */
drop policy if exists fatture_crea on public.fatture_richieste;
create policy fatture_crea on public.fatture_richieste
    for insert to public with check (tf_uid() is not null);

/* CHI ESITA: solo il governo. Il venditore non deve poter marcare «fatta» una
   fattura che non ha emesso lui — e nemmeno cancellarla. */
drop policy if exists fatture_esita on public.fatture_richieste;
create policy fatture_esita on public.fatture_richieste
    for update to public using (tf_e_governo()) with check (tf_e_governo());

revoke delete, truncate on public.fatture_richieste from authenticated, anon;
grant select, insert, update on public.fatture_richieste to authenticated;

/* ── L'ESITO PASSA DA QUI, NON DA UNA UPDATE LIBERA ──────────────────────────
   Segnare «fatta» vuol dire chiudere anche la notifica dell'amministrazione:
   se le due cose si possono fare separatamente, prima o poi una resta indietro
   e la coda mostra un lavoro già fatto. */
create or replace function public.fattura_esita(
    p_id uuid, p_numero text default null, p_note text default null, p_annulla boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_chi text; v_riga record;
begin
    if not tf_e_governo() then
        raise exception 'Solo l''amministrazione può esitare una fattura.' using errcode = 'insufficient_privilege';
    end if;
    select full_name into v_chi from app_users where id = tf_uid();
    select * into v_riga from fatture_richieste where id = p_id;
    if not found then raise exception 'Richiesta di fattura non trovata.'; end if;
    if v_riga.stato <> 'da_fare' then
        raise exception 'Questa richiesta è già stata esitata (%).', v_riga.stato;
    end if;
    if not p_annulla and coalesce(btrim(p_numero), '') = '' then
        raise exception 'Serve il numero della fattura emessa.';
    end if;

    update fatture_richieste
       set stato = case when p_annulla then 'annullata' else 'fatta' end,
           numero_fattura = case when p_annulla then null else btrim(p_numero) end,
           note = coalesce(nullif(btrim(p_note), ''), note),
           fatta_il = now(), fatta_da = coalesce(v_chi, 'amministrazione')
     where id = p_id;

    update admin_tasks set done = true, done_by = coalesce(v_chi, 'amministrazione'), done_at = now()
     where tipo = 'fattura_richiesta' and not coalesce(done, false)
       and link like '%' || p_id::text || '%';

    return jsonb_build_object('ok', true);
end $$;
revoke all on function public.fattura_esita(uuid, text, text, boolean) from public, anon;
grant execute on function public.fattura_esita(uuid, text, text, boolean) to authenticated;

/* ── E `anon` NON CI ENTRA PROPRIO ───────────────────────────────────────────
   La RLS lo ferma già (provato: zero righe senza credenziali), ma il GRANT
   che Supabase dà a tutto lo schema resta. Sono i dati fiscali di clienti
   veri: due lucchetti, non uno. Stessa medicina usata su `partita_persona`,
   che con un lucchetto solo si leggeva da internet. */
revoke all on public.fatture_richieste from anon;
