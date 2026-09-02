-- ═══ DUE CORREZIONI SUL DOCUMENTO DELL'USATO ══════════════════════════════
-- Rilievi della riverifica del 02/09.

-- 1. UN DOCUMENTO ANNULLATO NON DEVE BLOCCARE LA RIEMISSIONE.
--    La funzione cercava «esiste già un documento per questo viaggio?» senza
--    guardare lo stato: dopo un annullamento — magari proprio perché «il
--    telefono non è mai partito» — rifare lo stesso viaggio nello stesso
--    giorno restituiva IL DOCUMENTO ANNULLATO, e la schermata diceva «c'era
--    già». Il telefono sarebbe partito con un documento annullato, o senza.
--    ⚠️ E l'indice unico va rifatto di conseguenza: se resta com'è, la
--    riemissione lo violerebbe. Un documento annullato esce dall'unicità.
drop index if exists public.mag_ddt_usato_viaggio;
create unique index if not exists mag_ddt_usato_viaggio
    on public.mag_ddt (usato_id, da_negozio, a_negozio, viaggio_giorno)
    where usato_id is not null and stato <> 'annullato';

create or replace function public.tf_ddt_usato_crea(
    p_usato_id bigint, p_da text, p_a text, p_azienda_da text, p_azienda_a text,
    p_tipo text, p_causale text, p_descrizione text, p_seriale text,
    p_valore numeric, p_giorno date, p_creato_da text, p_note text
)
returns table (id uuid, numero int, anno int, azienda_da text, azienda_a text, gia boolean)
language plpgsql security definer set search_path = public
as $$
declare v_id uuid; v_num int; v_anno int; v_ada text; v_aa text;
begin
    select d.id, d.numero, d.anno, d.azienda_da, d.azienda_a
      into v_id, v_num, v_anno, v_ada, v_aa
      from public.mag_ddt d
     where d.usato_id = p_usato_id and d.da_negozio = p_da
       and d.a_negozio = p_a and d.viaggio_giorno = p_giorno
       and d.stato <> 'annullato';           -- ⚠️ un annullato non conta
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
        select d.id, d.numero, d.anno, d.azienda_da, d.azienda_a
          into v_id, v_num, v_anno, v_ada, v_aa
          from public.mag_ddt d
         where d.usato_id = p_usato_id and d.da_negozio = p_da
           and d.a_negozio = p_a and d.viaggio_giorno = p_giorno
           and d.stato <> 'annullato';
        -- ⚠️ SE NON LO RITROVA, NON SI FINGE RIUSCITO. Restituire una riga di
        -- NULL con `gia = true` faceva rispondere 200 alla rotta e la schermata
        -- non diceva niente: il telefono partiva e nessuno sapeva che la carta
        -- non c'era.
        if not found then
            raise exception 'il documento non è stato creato e non risulta emesso da nessun altro: riprova';
        end if;
        return query select v_id, v_num, v_anno, v_ada, v_aa, true;
        return;
    end;

    insert into public.mag_ddt_righe (
        ddt_id, riga, codice, descrizione, unita_id, seriale, quantita,
        valore_unitario, negozio_da, negozio_a, azienda_da, azienda_a, stato)
    values (
        v_id, 1, null, p_descrizione, null, p_seriale, 1,
        p_valore, p_da, p_a, v_ada, v_aa, 'in_viaggio');

    return query select v_id, v_num, v_anno, v_ada, v_aa, false;
end $$;

revoke all on function public.tf_ddt_usato_crea(bigint, text, text, text, text, text, text, text, text, numeric, date, text, text) from public, anon, authenticated;

-- 2. LO STATO DELLA RIGA ANNULLATA DEVE ESISTERE.
--    Scriveva «annullata», che non è fra gli stati che la schermata conosce
--    (STATI_RIGA in src/lib/trasferimenti.ts): nella vista Merce si leggeva
--    «• annullata» grigio invece di un'etichetta. «mai_partita» è quello
--    giusto, e vuol dire esattamente questo: il viaggio non è cominciato.
create or replace function public.tf_ddt_usato_annulla(
    p_ddt_id uuid, p_motivo text, p_chi text)
returns boolean
language plpgsql security definer set search_path = public
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
           fattura_stato = 'non_dovuta'
     where id = p_ddt_id and stato <> 'annullato';
    update public.mag_ddt_righe set stato = 'mai_partita' where ddt_id = p_ddt_id;
    return true;
end $$;

revoke all on function public.tf_ddt_usato_annulla(uuid, text, text) from public, anon, authenticated;

do $$
declare i int;
begin
    select count(*) into i from pg_indexes where indexname = 'mag_ddt_usato_viaggio';
    raise notice 'indice unico rifatto: %', i;
    if i <> 1 then raise exception 'indice mancante'; end if;
end $$;
