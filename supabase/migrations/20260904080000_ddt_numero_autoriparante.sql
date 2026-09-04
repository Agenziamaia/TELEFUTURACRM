-- ═══════════════════════════════════════════════════════════════════════════
-- IL NUMERO DEL DOCUMENTO NON PUÒ PIÙ BLOCCARE UN CARICO
--
-- Guasto del 04/09/2026, Magliana: un carico di 16 articoli e 22 pezzi per T2
-- rifiutato con «un pezzo di questo carico risulta già a magazzino», e
-- rifiutato a OGNI tentativo. Il messaggio era una pista falsa: nessun pezzo
-- era a magazzino.
--
-- La causa vera, misurata: il contatore `mag_ddt_progressivo` per T2/2026 era
-- fermo a **6**, ma in `mag_ddt` esisteva già un documento **numero 7**. La
-- numerazione proponeva 7, sbatteva contro `mag_ddt_numero_unico` e sollevava
-- una violazione di unicità — che il carico traduceva, sbagliando, in «pezzo
-- già a magazzino». T1 era allineato (23 = 23) e infatti funzionava.
--
-- Un contatore che si limita a incrementare non si riprende MAI da un
-- disallineamento: basta un documento nato con un numero scritto a mano, o
-- una riga entrata quando il trigger non c'era, e quella società non emette
-- più un documento. Da oggi il numero è il più alto fra il contatore e quello
-- realmente usato: se il contatore resta indietro, si rimette in pari da solo.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.mag_ddt_numera()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare y int; n int; az_a text; v_usato int;
begin
    if new.numero is not null and new.anno is not null then return new; end if;
    y := extract(year from coalesce(new.creato_il, now()))::int;

    if new.azienda_da is null then
        new.azienda_da := coalesce(
            (select coalesce(s.azienda, (select r.azienda from pos_rt r where r.negozio = s.name
                                          order by r.is_default desc nulls last limit 1))
               from stores s where s.name = new.da_negozio), 'T1');
    end if;
    if new.azienda_a is null then
        select coalesce(s.azienda, (select r.azienda from pos_rt r where r.negozio = s.name
                                      order by r.is_default desc nulls last limit 1))
          into az_a from stores s where s.name = new.a_negozio;
        new.azienda_a := coalesce(az_a, new.azienda_da, 'T1');
    end if;

    if new.causale is null or new.causale = '' or new.causale = 'Trasferimento tra punti vendita' then
        new.causale := case when new.azienda_da = new.azienda_a
            then 'Trasferimento tra sedi — beni propri'
            else 'Cessione tra società del gruppo' end;
    end if;

    new.anno := y;

    /* ⚠️ IL PIÙ ALTO FRA I DUE, SEMPRE.
       Il contatore dice quanti ne ha dati; il registro dice quali esistono
       davvero. Quando i due non concordano vince il registro, se no si
       ripropone un numero già usato — e quella società resta ferma. */
    select coalesce(max(numero), 0) into v_usato
      from mag_ddt where azienda_da = new.azienda_da and anno = y;

    insert into mag_ddt_progressivo (azienda, anno, ultimo)
    values (new.azienda_da, y, greatest(1, v_usato + 1))
    on conflict (azienda, anno) do update
       set ultimo = greatest(mag_ddt_progressivo.ultimo + 1, v_usato + 1)
    returning ultimo into n;

    new.numero := n;
    if new.inizio_trasporto is null then new.inizio_trasporto := now(); end if;
    return new;
end $$;

/* E si rimettono in pari i contatori di oggi, così la riga resta coerente
   anche a guardarla (T2 era 6 con il 7 già emesso). */
update mag_ddt_progressivo p
   set ultimo = greatest(p.ultimo, d.massimo)
  from (select azienda_da, anno, max(numero) as massimo from mag_ddt group by 1, 2) d
 where d.azienda_da = p.azienda and d.anno = p.anno and p.ultimo < d.massimo;
