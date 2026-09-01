-- ═══ IL REGISTRO DELLE RICHIESTE DI FIRMA ════════════════════════════════
-- Difetto trovato dal revisore, 01/09: la rotta che chiede «com'è andata la
-- firma?» si fidava del numero di richiesta mandato dal browser. Chiunque
-- avesse una sessione poteva chiedere lo stato di UNA QUALUNQUE richiesta
-- dell'account DocuSeal — che è condiviso — farsi scaricare il PDF firmato,
-- farselo spedire per email a un indirizzo scelto da lui e attaccarlo alla
-- scheda di un cliente a caso. Il documento c'era, il controllo di chi
-- potesse vederlo no.
--
-- Ora ogni richiesta che parte lascia una riga qui, e lo stato si legge SOLO
-- da questa riga: protocollo, email di destinazione e cliente NON arrivano
-- più dal browser. Il numero da solo non apre più niente.
--
-- Serve anche a due cose che il revisore ha visto subito dopo:
--  · `archiviata_il` impedisce di rispedire al cliente la stessa copia
--    firmata a ogni giro di controllo;
--  · la richiesta sopravvive alla chiusura del browser: se l'operatore chiude
--    la finestra a metà, la firma non si perde più nel nulla.
create table if not exists public.firme_richieste (
    submission_id bigint primary key,
    tipo          text        not null check (tipo in ('pratica', 'usato')),
    protocollo    text        not null,
    cliente_id    text,
    email         text        not null,
    negozio       text,
    canale        text,
    creata_da     text,
    creata_il     timestamptz not null default now(),
    firmata_il    timestamptz,
    archiviata_il timestamptz
);

create index if not exists firme_richieste_protocollo_idx on public.firme_richieste (protocollo);

-- Nessuna politica: ci scrive e ci legge solo il server con la chiave di
-- servizio. Dal browser questa tabella non esiste.
alter table public.firme_richieste enable row level security;
