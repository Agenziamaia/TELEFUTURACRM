-- ═══ I PREZZI CHE VANNO AL COMMERCIALISTA, CORRETTI A MANO ════════════════
-- Luca 02/09: «dammi la possibilità proprio in questo pannello amministrativo
-- di modificare a mano se volessi tutti i prezzi, evidenziando però quelli che
-- sono stati modificati già da te seguendo la regola; dopo di che quelle
-- modifiche devono essere le ufficiali e il file che viene mandato deve
-- contenere quelle modifiche».
--
-- ⚠️ TRE VALORI DIVERSI PER LO STESSO TELEFONO, e vanno tenuti separati:
--   1. `purchase_price` / `sold_price` — quello che è successo davvero. Non si
--      tocca mai da qui: è l'archivio, e serve a sapere quanto abbiamo speso e
--      incassato.
--   2. la regola dei 100 € — un calcolo, non un dato: si rifà ogni volta.
--   3. QUESTE COLONNE — la decisione di una persona, che vince su tutto.
-- Sovrascrivere l'archivio con la cifra del commercialista vorrebbe dire
-- perdere per sempre il margine vero; ricalcolare la regola sopra una correzione
-- a mano vorrebbe dire cancellarla al primo caricamento della pagina.
--
-- ⚠️ E SI SA SEMPRE CHI. Questi numeri diventano una fattura fra due società:
-- fra sei mesi qualcuno chiederà da dove viene, e la risposta dev'essere sulla
-- riga, non nella memoria di chi c'era.

alter table public.usati
    add column if not exists costo_contabile      numeric,
    add column if not exists vendita_contabile    numeric,
    add column if not exists prezzi_corretti_da   text,
    add column if not exists prezzi_corretti_il   timestamptz;

comment on column public.usati.costo_contabile is
  'Il costo d''acquisto come va nel file del commercialista, se una persona l''ha deciso a mano. NULL = vale la regola (mai sotto 100 €, e vuoto se il costo non è registrato). ⚠️ Non è `purchase_price`: quello resta la cifra vera.';
comment on column public.usati.vendita_contabile is
  'Il prezzo di vendita come va nel file, se corretto a mano. NULL = vale `sold_price`.';
comment on column public.usati.prezzi_corretti_da is
  'Chi ha corretto i prezzi contabili di questo telefono. Finisce anche in una colonna del file: il commercialista deve poter distinguere un numero nostro da un numero deciso da noi.';

create index if not exists usati_prezzi_corretti on public.usati (prezzi_corretti_il) where prezzi_corretti_il is not null;

do $$
declare c int;
begin
    select count(*) into c from information_schema.columns
     where table_name='usati' and column_name in ('costo_contabile','vendita_contabile','prezzi_corretti_da','prezzi_corretti_il');
    raise notice 'colonne contabili: %/4', c;
    if c <> 4 then raise exception 'colonne mancanti: %', c; end if;
end $$;
