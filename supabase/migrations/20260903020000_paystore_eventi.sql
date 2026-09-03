-- ═══ LA STORIA DI UNA RICARICA ════════════════════════════════════════════
-- Luca 03/09: «un dettaglio completo della ricarica, di quello che c'è intorno
-- nel caso in cui sia stata venduta accompagnata, eventuali cambiamenti,
-- eventuali errori generati, e risottomissioni, con il dettaglio anche
-- dell'utente, del giorno e dell'orario in cui sono state fatte modifiche ed
-- invii a PayStore».
--
-- ⚠️ OGGI QUELLA STORIA NON ESISTE. La riga porta solo l'ULTIMO stato, l'ULTIMO
-- errore, l'ULTIMO tentativo: ogni correzione cancella quella prima. Se un
-- negozio sbaglia il numero, l'amministrazione lo corregge e la ricarica parte,
-- domani nessuno sa più che il numero era un altro — e se il credito è finito
-- sulla SIM sbagliata, la prova di com'è andata non c'è.
--
-- ⚠️ E QUI DENTRO CI SONO NUMERI DI TELEFONO DI CLIENTI: la tabella è chiusa
-- al browser, si legge solo dal server come il registro delle ricariche.

create table if not exists public.paystore_eventi (
    id          bigserial primary key,
    ricarica_id uuid not null references public.paystore_ricariche(id) on delete cascade,
    quando      timestamptz not null default now(),
    chi         text,                    -- il nome di chi l'ha fatto, o «motore»
    tipo        text not null,           -- modifica | stato | invio | riconciliata
    /* il dettaglio, in chiaro e leggibile: «numero: 3331234567 → 3339876543».
       Un registro che si legge solo con una query non lo legge nessuno. */
    testo       text not null,
    dati        jsonb                    -- il grezzo, per quando serve di più
);

comment on table public.paystore_eventi is
  'Tutto quello che è successo a una ricarica: correzioni, cambi di stato, invii a PayStore e loro esito. ⚠️ La riga della ricarica porta solo l''ultimo di ognuno: senza questa tabella una correzione cancella quella prima, e su un credito finito sul numero sbagliato non resta nessuna prova.';

create index if not exists paystore_eventi_ricarica on public.paystore_eventi (ricarica_id, quando desc);

alter table public.paystore_eventi enable row level security;
revoke all on public.paystore_eventi from anon, authenticated;
revoke all on sequence public.paystore_eventi_id_seq from anon, authenticated;

do $$
declare c int;
begin
    select count(*) into c from information_schema.tables where table_name='paystore_eventi';
    raise notice 'registro eventi: %', c;
    if c <> 1 then raise exception 'tabella non creata'; end if;
end $$;
