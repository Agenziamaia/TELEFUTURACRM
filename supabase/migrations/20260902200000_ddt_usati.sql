-- ═══ IL DOCUMENTO DI TRASPORTO DEI TELEFONI USATI ═════════════════════════
-- Luca 02/09: «nel momento in cui prendo un telefono usato e lo sposto da
-- acquistato a in transito, questo deve generare automaticamente un documento
-- di trasporto, e deve andare a finire dentro i trasferimenti nella sezione
-- magazzino. I telefoni usati non sono in magazzino — c'è una sezione a parte —
-- però un telefono che transita da un negozio all'altro deve comunque essere
-- accompagnato da un documento di trasporto. Stessa cosa quando l'usato è in
-- stato pronto e l'amministrativo decide di trasferirlo a un altro punto
-- vendita. A differenza degli altri, questo è un documento che MUORE: non deve
-- essere accettato, perché il negozio prende in carico il telefono dentro la
-- gestione usati, seguendo la sua timeline.»

-- ── IL LEGAME COL TELEFONO ────────────────────────────────────────────────
-- Serve a due cose: non emettere due volte lo stesso documento per lo stesso
-- viaggio, e poter risalire dal documento al telefono (e viceversa) senza
-- passare per il numero di serie, che su un usato è l'IMEI e su un articolo di
-- magazzino è un'altra cosa.
alter table public.mag_ddt
    add column if not exists usato_id bigint;

comment on column public.mag_ddt.usato_id is
  'Il telefono usato che questo documento accompagna. ⚠️ Un usato NON è in magazzino: il documento non muove nessuna giacenza e non ha righe agganciate a `mag_unita`.';

create index if not exists mag_ddt_usato on public.mag_ddt (usato_id) where usato_id is not null;

-- ⚠️ NON DUE DOCUMENTI PER LO STESSO VIAGGIO. Il documento nasce dentro il
-- cambio di stato: un doppio clic, una pagina riaperta o una correzione
-- «torna indietro e rimanda» ne creerebbero due, e due documenti di trasporto
-- per un telefono solo sono un problema in un controllo, non un dettaglio.
-- Uno per telefono, tratta e giorno.
--
-- ⚠️ IL GIORNO STA IN UNA COLONNA SUA, non calcolato dentro l'indice:
-- `creato_il::date` dipende dal fuso della sessione, quindi per Postgres non è
-- deterministico e in un indice non ci può stare («functions in index
-- expression must be marked IMMUTABLE»). Lo scrive chi crea il documento, con
-- il giorno di Roma.
alter table public.mag_ddt
    add column if not exists viaggio_giorno date;

create unique index if not exists mag_ddt_usato_viaggio
    on public.mag_ddt (usato_id, da_negozio, a_negozio, viaggio_giorno)
    where usato_id is not null;

-- prova
do $$
declare c int; i int;
begin
    select count(*) into c from information_schema.columns
     where table_name = 'mag_ddt' and column_name = 'usato_id';
    select count(*) into i from pg_indexes
     where tablename = 'mag_ddt' and indexname in ('mag_ddt_usato', 'mag_ddt_usato_viaggio');
    raise notice 'colonna usato_id: % · indici: %/2', c, i;
    if c <> 1 or i <> 2 then raise exception 'la colonna o gli indici non ci sono: col=% idx=%', c, i; end if;
end $$;
