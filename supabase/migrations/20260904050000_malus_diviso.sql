-- ═══════════════════════════════════════════════════════════════════════════
-- IL RITARDO COSTA 5 € AL GIORNO **PER DOCUMENTO**, DIVISI FRA CHI C'ERA
--
-- Decisione di Luca, 04/09/2026, dopo che la revisione ha misurato l'effetto
-- della prima versione: 5 € A TESTA voleva dire che lo stesso identico ritardo
-- costava 5 €/giorno a Collatina (un solo store manager) e 15 €/giorno ad
-- Acilia (tre presenti). Chi lavora in un negozio senza store manager pagava
-- il triplo per la stessa colpa — e non è quello che il patto vuole dire.
--
-- Ora il documento costa 5 € al giorno e basta, ripartiti fra le persone in
-- forza QUEL giorno. Il conto è uguale per tutti i negozi a parità di ritardo.
--
-- ── LA RIPARTIZIONE È AL CENTESIMO ─────────────────────────────────────────
-- 5 / 3 = 1,6667: arrotondando ognuno a 1,67 il documento costerebbe 5,01.
-- Si divide in centesimi e i centesimi che avanzano si danno ai primi, in
-- ordine di `user_id`/nome — **ordine fisso**, perché il motore rigira a ogni
-- poll e due corse devono dare lo stesso identico risultato: se l'ordine
-- ballasse, l'importo di ognuno cambierebbe da un minuto all'altro.
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.mag_ddt_malus
    add column if not exists quota numeric(10,4);
comment on column public.mag_ddt_malus.quota is
    'La somma delle quote giornaliere prima dell''arrotondamento: serve a capire un importo che non è un multiplo tondo di 5.';

create or replace function public.mag_matura_ritardi()
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
    r         record;
    v_reg     record;
    v_rate    numeric;
    v_max     int;
    v_fine    date;
    v_susp_da date;
    v_susp_a  date;
    v_g       date;
    v_lav     int;
    v_oltre   boolean;
    v_chi     record;
    v_conto   jsonb;
    v_key     text;
    v_ruoli   jsonb;
    v_top     text;
    v_nota    text;
    v_quanti  int;
    v_base    int;      -- centesimi a testa
    v_resto   int;      -- centesimi che avanzano
    v_i       int;
    v_cent    int;
    v_nessuno int := 0;
    v_scritti int := 0;
begin
    select * into v_reg from mag_trasferimenti_regole where id = 1;
    if v_reg.decorrenza is null then return jsonb_build_object('ok', true, 'spento', true); end if;

    for r in
        select d.id, d.numero, d.anno, d.a_negozio, d.creato_il, d.stato,
               d.problema_il, d.problema_chiuso_il, d.accettato_il, d.chiuso_il,
               greatest(d.creato_il::date, v_reg.decorrenza) as parte_il
          from mag_ddt d
         where coalesce(d.tipo, '') = 'trasferimento'
           and d.stato <> 'usato'
           and lower(split_part(d.a_negozio, ' ', 1)) <> 'laboratorio'
           and greatest(d.creato_il::date, v_reg.decorrenza) <= current_date
           and (d.stato in ('in_transito', 'parziale')
                or exists (select 1 from mag_ddt_malus m
                            where m.ddt_id = d.id and m.stato = 'in_corso'
                              and not coalesce(m.eliminato, false)))
    loop
        select malus_giorno, giorni_max into v_rate, v_max
          from mag_ddt_malus where ddt_id = r.id
           and not coalesce(eliminato, false) order by created_at limit 1;
        v_rate := coalesce(v_rate, v_reg.malus_giorno);
        v_max  := coalesce(v_max,  v_reg.giorni_max);

        v_fine := null;
        if r.stato not in ('in_transito', 'parziale') then
            v_fine := coalesce(r.accettato_il, r.chiuso_il, now())::date;
        end if;
        v_susp_da := r.problema_il::date;
        v_susp_a  := coalesce(r.problema_chiuso_il::date, current_date);

        v_conto := '{}'::jsonb;
        v_lav := 0;
        v_oltre := false;
        for v_g in select g::date from generate_series(r.parte_il + 1, coalesce(v_fine, current_date), interval '1 day') g loop
            if v_susp_da is not null and v_g >= v_susp_da and v_g <= v_susp_a then continue; end if;
            if mag_giorni_lavorativi(v_g - 1, v_g, r.a_negozio) = 0 then continue; end if;
            v_lav := v_lav + 1;
            if v_lav <= v_max then continue; end if;
            v_oltre := true;

            /* LA GIORNATA VALE 5 € IN TUTTO: si conta chi c'era, si divide in
               centesimi, e i centesimi che avanzano vanno ai primi in ordine
               fisso. */
            select count(*) into v_quanti from mag_chi_paga(r.a_negozio, v_g);
            if v_quanti = 0 then continue; end if;
            v_base  := (v_rate * 100)::int / v_quanti;
            v_resto := (v_rate * 100)::int % v_quanti;
            v_i := 0;
            for v_chi in select * from mag_chi_paga(r.a_negozio, v_g)
                          order by coalesce(user_id::text, persona) loop
                v_cent := v_base + (case when v_i < v_resto then 1 else 0 end);
                v_i := v_i + 1;
                v_key := coalesce(v_chi.user_id::text, 'nome:' || v_chi.persona);
                v_ruoli := coalesce(v_conto -> v_key -> 'ruoli', '{}'::jsonb);
                v_ruoli := jsonb_set(v_ruoli, array[v_chi.ruolo],
                             to_jsonb(coalesce((v_ruoli ->> v_chi.ruolo)::int, 0) + 1));
                v_conto := jsonb_set(v_conto, array[v_key], jsonb_build_object(
                    'user_id', v_chi.user_id, 'persona', v_chi.persona, 'ruoli', v_ruoli,
                    'giorni', coalesce((v_conto -> v_key ->> 'giorni')::int, 0) + 1,
                    'cent',   coalesce((v_conto -> v_key ->> 'cent')::int, 0) + v_cent));
            end loop;
        end loop;

        if v_conto = '{}'::jsonb then
            if not v_oltre then
                update mag_ddt_malus set stato = 'archiviato', giorni = 0, importo = 0,
                       note = coalesce(note, '') || ' [rientrato nei termini]', updated_at = now()
                 where ddt_id = r.id and stato = 'in_corso' and not coalesce(eliminato, false);
            end if;
            continue;
        end if;

        for v_chi in select value as v from jsonb_each(v_conto) loop
            select k into v_top from jsonb_each_text(v_chi.v -> 'ruoli') e(k, n)
             order by n::int desc,
                      case k when 'store_manager' then 1 when 'presente' then 2 else 3 end
             limit 1;
            select string_agg(k || ' ' || n || (case when n::int = 1 then ' giorno' else ' giorni' end), ' · '
                              order by n::int desc, case k when 'store_manager' then 1 when 'presente' then 2 else 3 end)
              into v_nota from jsonb_each_text(v_chi.v -> 'ruoli') e(k, n);

            insert into mag_ddt_malus
                (ddt_id, numero, negozio, user_id, persona, ruolo, scadenza,
                 data_fine, giorni, malus_giorno, giorni_max, quota, importo, stato, note)
            values (r.id, r.numero, r.a_negozio,
                    nullif(v_chi.v ->> 'user_id', '')::uuid,
                    v_chi.v ->> 'persona', v_top, r.parte_il,
                    v_fine, (v_chi.v ->> 'giorni')::int, v_rate, v_max,
                    (v_chi.v ->> 'cent')::int / 100.0,
                    round((v_chi.v ->> 'cent')::int / 100.0, 2),
                    case when v_fine is null then 'in_corso' else 'chiuso' end, v_nota)
            on conflict (ddt_id, coalesce(user_id::text, persona)) do update
               set giorni = excluded.giorni, importo = excluded.importo, quota = excluded.quota,
                   data_fine = excluded.data_fine, ruolo = excluded.ruolo,
                   persona = excluded.persona, note = excluded.note,
                   stato = excluded.stato, updated_at = now()
             where mag_ddt_malus.stato in ('in_corso', 'chiuso')
               and not coalesce(mag_ddt_malus.eliminato, false)
               and (mag_ddt_malus.giorni, mag_ddt_malus.importo, mag_ddt_malus.stato, mag_ddt_malus.data_fine)
                   is distinct from (excluded.giorni, excluded.importo, excluded.stato, excluded.data_fine);
            v_scritti := v_scritti + 1;
        end loop;
    end loop;

    for r in
        select d.id, d.a_negozio from mag_ddt d
         where d.stato in ('in_transito', 'parziale')
           and d.problema_il is null
           and coalesce(d.tipo, '') = 'trasferimento'
           and d.stato <> 'usato'
           and lower(split_part(d.a_negozio, ' ', 1)) <> 'laboratorio'
           and greatest(d.creato_il::date, v_reg.decorrenza) + 1 <= current_date
           and mag_giorni_lavorativi(greatest(d.creato_il::date, v_reg.decorrenza), current_date, d.a_negozio) > v_reg.giorni_max
           and not exists (select 1 from mag_chi_paga(d.a_negozio, current_date))
    loop
        update mag_ddt set problema_il = now(), problema_da = 'il gestionale',
               problema_nota = 'nessuno risulta assegnato o presente in questo negozio: il patto dei ' ||
                               v_reg.giorni_max || ' giorni non si può applicare a nessuno'
         where id = r.id and problema_il is null;
        v_nessuno := v_nessuno + 1;
    end loop;

    return jsonb_build_object('ok', true, 'episodi', v_scritti, 'senza_nessuno', v_nessuno);
end $$;
revoke all on function public.mag_matura_ritardi() from public, anon, authenticated;
