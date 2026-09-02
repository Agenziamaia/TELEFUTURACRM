-- ═══ IL DOCUMENTO DELL'USATO NASCE INTERO, O NON NASCE ════════════════════
-- Rilievo della revisione ostile del 02/09, confermato leggendo il codice:
-- la rotta inseriva la TESTATA con una chiamata e la RIGA con un'altra. Sono
-- due transazioni: se la seconda falliva, restava un documento di trasporto
-- numerato, chiuso e VUOTO — senza descrizione, senza IMEI, senza quantità.
-- Cioè senza «natura, qualità e quantità dei beni», che è quello che la legge
-- chiede a un documento di trasporto.
--
-- E da lì non si usciva: al tentativo successivo la rotta trovava il documento
-- per via dell'indice unico e restituiva QUELLO, vuoto, per sempre.
--
-- ⚠️ E IL DOPPIO CLIC. I pulsanti non avevano un freno, e il controllo «esiste
-- già?» era una lettura seguita da una scrittura: due richieste ravvicinate
-- leggevano entrambe «non c'è» e inserivano entrambe. La seconda prendeva il
-- 23505 dell'indice unico, e la schermata diceva all'operatore «il documento
-- NON è stato emesso, segnalalo all'amministrazione» — mentre esisteva.
-- Qui l'unicità la fa il database, e chi arriva secondo si riprende il
-- documento del primo invece di un errore.

create or replace function public.tf_ddt_usato_crea(
    p_usato_id bigint,
    p_da text,
    p_a text,
    p_azienda_da text,
    p_azienda_a text,
    p_tipo text,
    p_causale text,
    p_descrizione text,
    p_seriale text,
    p_valore numeric,
    p_giorno date,
    p_creato_da text,
    p_note text
)
returns table (id uuid, numero int, anno int, azienda_da text, azienda_a text, gia boolean)
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_num int; v_anno int; v_ada text; v_aa text;
begin
    -- già emesso oggi per questo viaggio? si restituisce quello.
    select d.id, d.numero, d.anno, d.azienda_da, d.azienda_a
      into v_id, v_num, v_anno, v_ada, v_aa
      from public.mag_ddt d
     where d.usato_id = p_usato_id and d.da_negozio = p_da
       and d.a_negozio = p_a and d.viaggio_giorno = p_giorno;
    if found then
        return query select v_id, v_num, v_anno, v_ada, v_aa, true;
        return;
    end if;

    begin
        insert into public.mag_ddt (
            da_negozio, a_negozio, azienda_da, azienda_a, tipo, stato,
            usato_id, viaggio_giorno, causale, aspetto, trasporto, colli,
            creato_da, chiuso_da, chiuso_il, note)
        values (
            p_da, p_a, p_azienda_da, p_azienda_a, p_tipo, 'usato',
            p_usato_id, p_giorno, p_causale, 'Telefono usato', 'Mittente', 1,
            p_creato_da, 'gestione usati', now(), p_note)
        returning mag_ddt.id, mag_ddt.numero, mag_ddt.anno, mag_ddt.azienda_da, mag_ddt.azienda_a
             into v_id, v_num, v_anno, v_ada, v_aa;
    exception when unique_violation then
        -- ⚠️ IL DOPPIO CLIC ARRIVA QUI, e non è un errore: il documento c'è,
        -- l'ha appena fatto l'altra richiesta. Si restituisce quello.
        select d.id, d.numero, d.anno, d.azienda_da, d.azienda_a
          into v_id, v_num, v_anno, v_ada, v_aa
          from public.mag_ddt d
         where d.usato_id = p_usato_id and d.da_negozio = p_da
           and d.a_negozio = p_a and d.viaggio_giorno = p_giorno;
        return query select v_id, v_num, v_anno, v_ada, v_aa, true;
        return;
    end;

    -- ⚠️ STESSA TRANSAZIONE: se questa fallisce, cade anche la testata e non
    -- resta un numero bruciato su un documento senza merce.
    insert into public.mag_ddt_righe (
        ddt_id, riga, codice, descrizione, unita_id, seriale, quantita,
        valore_unitario, negozio_da, negozio_a, azienda_da, azienda_a, stato)
    values (
        v_id, 1, null, p_descrizione, null, p_seriale, 1,
        p_valore, p_da, p_a, v_ada, v_aa, 'in_viaggio');

    return query select v_id, v_num, v_anno, v_ada, v_aa, false;
end $$;

revoke all on function public.tf_ddt_usato_crea(bigint, text, text, text, text, text, text, text, text, numeric, date, text, text) from public, anon, authenticated;

comment on function public.tf_ddt_usato_crea is
  'Crea testata e riga del documento di trasporto di un usato in UNA transazione. ⚠️ Separate, un fallimento sulla riga lasciava un documento numerato e vuoto, irrecuperabile per via dell''indice unico. Il doppio clic non è un errore: restituisce il documento già fatto.';

-- ── ANNULLARE UN DOCUMENTO EMESSO PER SBAGLIO ─────────────────────────────
-- ⚠️ NON SI CANCELLA. Il numero è consumato nel registro annuale della società
-- e non si può riusare: il documento resta, marcato annullato, col motivo
-- scritto. È la stessa regola degli altri documenti di trasporto — che però
-- per gli usati non era applicabile, perché nascono nello stato `usato` e
-- l'annullamento del magazzino guarda solo `in_transito`.
create or replace function public.tf_ddt_usato_annulla(
    p_ddt_id uuid, p_motivo text, p_chi text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_usato bigint;
begin
    select usato_id into v_usato from public.mag_ddt where id = p_ddt_id;
    if v_usato is null then
        raise exception 'questo non è il documento di un telefono usato: si annulla dal magazzino';
    end if;
    update public.mag_ddt
       set stato = 'annullato',
           motivo = coalesce(p_motivo, 'annullato senza motivo indicato'),
           chiuso_da = p_chi, chiuso_il = now(),
           /* ⚠️ ANCHE LA FATTURA: se era una cessione fra società, il
              documento restava in eterno nell'elenco «da fatturare» e
              l'amministrazione avrebbe inseguito una fattura per un viaggio
              mai avvenuto. */
           fattura_stato = 'non_dovuta'
     where id = p_ddt_id and stato <> 'annullato';
    update public.mag_ddt_righe set stato = 'annullata' where ddt_id = p_ddt_id;
    return true;
end $$;

revoke all on function public.tf_ddt_usato_annulla(uuid, text, text) from public, anon, authenticated;

-- prova
do $$
declare a int; b int;
begin
    select count(*) into a from pg_proc where proname = 'tf_ddt_usato_crea';
    select count(*) into b from pg_proc where proname = 'tf_ddt_usato_annulla';
    raise notice 'crea: % · annulla: %', a, b;
    if a <> 1 or b <> 1 then raise exception 'funzioni mancanti: crea=% annulla=%', a, b; end if;
end $$;
