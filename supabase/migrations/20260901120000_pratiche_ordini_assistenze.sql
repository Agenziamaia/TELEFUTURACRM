-- ═══ ORDINI CLIENTE E ASSISTENZE ═══════════════════════════════════════════
--
-- Due sezioni, una tabella. La proposta iniziale erano due tabelle gemelle
-- (ordini_cliente e assistenze) ma il 90% delle colonne era identico: cliente,
-- firma, acconto, note interne, approvvigionamento, storia. Due tabelle uguali
-- vogliono dire due volte ogni regola, e la seconda volta si sbaglia. Qui la
-- colonna `sezione` divide le due viste e i due permessi; il resto e' comune.
--
-- La TIPOLOGIA comanda i campi (sei valori, elencati in src/lib/pratiche.ts):
--   ordini:     ord_accessorio · ord_telefono
--   assistenze: riparazione · backup · backup_rotto · ass_tecnico

create table if not exists pratiche (
    id               uuid primary key default gen_random_uuid(),
    protocollo       text not null unique,
    sezione          text not null check (sezione in ('ordini','assistenze')),
    tipologia        text not null,
    client_id        text references clients(id),
    cliente          jsonb not null default '{}'::jsonb,   -- copia dei dati al momento dell'apertura
    negozio          text not null,
    operatore        text not null,
    stato            text not null,
    valore           numeric not null default 0,           -- costo totale o preventivo, secondo la tipologia
    approvvigionamento text,                               -- disponibile | altro_negozio | da_ordinare | ordinato
    note_interne     text,                                 -- MAI verso il cliente
    dispositivo      jsonb,                                -- brand, modello, colore, pin, accessori, condizioni, difetto
    imei             text,
    acconto          jsonb,                                -- importo, forma, voce, scontrino, incassato_il
    firma            jsonb,                                -- via, otp, allegati, firmata_il, controllo
    buono            jsonb,                                -- se la lavorazione non si conclude
    tracking         text,
    avviso_pronto_il timestamptz,                          -- da qui decorrono i 14 e i 90 giorni
    storia           jsonb not null default '[]'::jsonb,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);
create index if not exists pratiche_sezione_idx on pratiche (sezione, stato);
create index if not exists pratiche_negozio_idx on pratiche (negozio, created_at desc);
create index if not exists pratiche_client_idx on pratiche (client_id);
-- la vista «Da ordinare» dell'amministrazione vive su questo indice
create index if not exists pratiche_approvv_idx on pratiche (approvvigionamento) where approvvigionamento in ('da_ordinare','altro_negozio');

comment on table pratiche is
    'Ordini cliente e assistenze: una riga per pratica. `sezione` divide le due viste, `tipologia` comanda quali campi sono obbligatori.';
comment on column pratiche.note_interne is
    'Note visibili SOLO a negozio e amministrazione: non finiscono nel modulo firmato dal cliente ne'' nelle email che gli arrivano.';
comment on column pratiche.avviso_pronto_il is
    'Quando e'' partito l''avviso di pronta consegna. Da QUESTA data decorrono i 14 giorni per il ritiro e i 90 oltre i quali il dispositivo si intende ceduto: senza, i termini non decorrono da niente.';

create table if not exists pratiche_righe (
    id           uuid primary key default gen_random_uuid(),
    pratica_id   uuid not null references pratiche(id) on delete cascade,
    tipo         text not null default 'articolo' check (tipo in ('articolo','ricambio')),
    codice       text,                                  -- mag_articoli.codice, vuoto se scritta a mano
    descrizione  text not null,
    qta          numeric not null default 1,
    prezzo       numeric not null default 0,
    note         text,
    stato        text not null default 'pending',
    da_magazzino boolean not null default false,
    fornitore    text,
    created_at   timestamptz not null default now()
);
create index if not exists pratiche_righe_idx on pratiche_righe (pratica_id);

-- ── chi vede e chi scrive ────────────────────────────────────────────────
-- Lettura e scrittura a chi e' dentro il CRM: sono pratiche di negozio, e un
-- cliente puo' passare a ritirare in un punto vendita diverso da quello che
-- l'ha aperta. La cancellazione no: quella e' roba di direzione.
alter table pratiche enable row level security;
alter table pratiche_righe enable row level security;
drop policy if exists tf_pratiche_rw on pratiche;
create policy tf_pratiche_rw on pratiche for all
using (tf_uid() is not null) with check (tf_uid() is not null);
drop policy if exists tf_pratiche_del on pratiche;
create policy tf_pratiche_del on pratiche for delete
using (exists (select 1 from app_users me where me.id = tf_uid()
               and me.role in ('admin','dev','direttore_generale','amministrativo')));
drop policy if exists tf_pratiche_righe_rw on pratiche_righe;
create policy tf_pratiche_righe_rw on pratiche_righe for all
using (tf_uid() is not null) with check (tf_uid() is not null);

-- ── il protocollo ────────────────────────────────────────────────────────
-- ORD-26-0001 / ASS-26-0001, progressivo per anno e per sezione. In funzione e
-- non nel browser: due negozi che aprono una pratica nello stesso secondo
-- devono prendere due numeri diversi.
create sequence if not exists pratiche_ord_seq;
create sequence if not exists pratiche_ass_seq;
create or replace function pratica_protocollo(sez text)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare n bigint; pre text;
begin
    if sez = 'ordini' then pre := 'ORD'; n := nextval('pratiche_ord_seq');
    else pre := 'ASS'; n := nextval('pratiche_ass_seq'); end if;
    return pre || '-' || to_char(now(), 'YY') || '-' || lpad(n::text, 4, '0');
end $$;
revoke all on function pratica_protocollo(text) from public, anon;
grant execute on function pratica_protocollo(text) to authenticated;
