-- ═══════════════════════════════════════════════════════════════════════════
-- CHI PAGA IL RITARDO — riscritto il 04/09 dopo l'obiezione di Luca
--
-- «Il conto non può mai andare al punto vendita: spiegami meglio come lo
-- attribuiresti alle persone che ci lavorano.»
--
-- Ha ragione, e la risposta buona l'ha data lui stesso quando ha detto «segui
-- la sezione turni per capire chi c'era e chi non»: esiste
-- `presenza_negozio`, dove ogni persona dichiara ogni giorno dove sta
-- lavorando. Non è una deduzione, è una firma — 111 righe in quattro giorni,
-- 33 persone, tutti e dodici i negozi.
--
-- ── LA CATENA, IN ORDINE DI VERITÀ ─────────────────────────────────────────
--   ① lo STORE MANAGER della sede, dove c'è (otto negozi su dodici): la
--      responsabilità del negozio è sua e non cambia col giorno della settimana;
--   ② se non c'è, CHI HA DICHIARATO DI ESSERE LÌ quel giorno — la firma;
--   ③ se quel giorno nessuno ha dichiarato niente, gli ASSEGNATI alla sede
--      meno chi era in ferie: è il ripiego, e resta vero.
--
-- ── E SI PAGA GIORNO PER GIORNO ────────────────────────────────────────────
-- Il conto non si attribuisce a chi c'è OGGI, ma a chi c'era in OGNI giorno di
-- ritardo. Dove c'è lo store manager è la stessa cosa — è sempre lui — ma
-- dove non c'è cambia tutto: se il settimo giorno c'era Tizio e l'ottavo
-- Caio, ognuno risponde del suo. Attribuire tutto a chi capita di esserci il
-- giorno in cui il conto viene calcolato sarebbe una multa data dal caso.
--
-- ── E SE DAVVERO NON C'È NESSUNO ───────────────────────────────────────────
-- Non si inventa un debito e non si scrive «il negozio»: il trasferimento si
-- SEGNALA DA SOLO come problema. Così diventa rosso per il mittente e per
-- l'amministrazione, qualcuno guarda perché quel negozio non ha nessuno, e
-- intanto il conto è fermo. Oggi non succede — tutti e dodici i negozi hanno
-- gente assegnata — ma il giorno che succedesse deve gridare, non tacere.
-- ═══════════════════════════════════════════════════════════════════════════
drop function if exists public.mag_chi_paga(text, date);
create or replace function public.mag_chi_paga(p_negozio text, p_giorno date)
returns table(user_id uuid, persona text, ruolo text)
language plpgsql stable security definer set search_path = public as $$
declare v_sede text := lower(split_part(p_negozio, ' ', 1));
begin
    -- ① lo store manager della sede
    return query
        select u.id, u.full_name, 'store_manager'::text
          from user_stores s join app_users u on u.id = s.user_id
         where lower(split_part(s.store_name, ' ', 1)) = v_sede
           and u.role = 'store_manager' and coalesce(u.active, true);
    if found then return; end if;

    -- ② chi ha dichiarato di essere lì QUEL giorno
    return query
        select distinct u.id, u.full_name, 'presente'::text
          from presenza_negozio p join app_users u on u.id = p.user_id
         where lower(split_part(p.sede, ' ', 1)) = v_sede
           and p.data = p_giorno and coalesce(u.active, true);
    if found then return; end if;

    -- ③ gli assegnati alla sede, meno le ferie di quel giorno
    return query
        select u.id, u.full_name, 'assegnato'::text
          from user_stores s join app_users u on u.id = s.user_id
         where lower(split_part(s.store_name, ' ', 1)) = v_sede
           and coalesce(u.active, true)
           and not exists (
               select 1 from vacation_requests v
                where v.status = 'approved'
                  and (v.user_id = u.id
                       or (v.user_id is null
                           and lower(btrim(v.employee_name)) = lower(btrim(u.full_name))))
                  and p_giorno between v.date_from and v.date_to);
    -- se non torna niente, chi chiama lo saprà: la lista è vuota.
end $$;
revoke all on function public.mag_chi_paga(text, date) from public, anon, authenticated;

-- ── IL MOTORE: il conto si fa GIORNO PER GIORNO ────────────────────────────
create or replace function public.mag_matura_ritardi()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    r         record;
    v_reg     record;
    v_fine    date;
    v_g       date;
    v_lav     int;
    v_chi     record;
    v_conto   jsonb;
    v_key     text;
    v_ruoli   jsonb;
    v_top     text;
    v_nota    text;
    v_nessuno int := 0;
    v_scritti int := 0;
begin
    select * into v_reg from mag_trasferimenti_regole where id = 1;
    if v_reg.decorrenza is null then return jsonb_build_object('ok', true, 'spento', true); end if;

    for r in
        select d.id, d.numero, d.a_negozio, d.creato_il, d.stato,
               d.problema_il, d.accettato_il, d.chiuso_il,
               greatest(d.creato_il::date, v_reg.decorrenza) as parte_il
          from mag_ddt d
         where coalesce(d.tipo, '') <> 'usato'
           and greatest(d.creato_il::date, v_reg.decorrenza) <= current_date
           and (d.stato in ('in_transito', 'parziale')
                or exists (select 1 from mag_ddt_malus m where m.ddt_id = d.id and m.stato = 'in_corso'))
    loop
        v_fine := null;
        if r.problema_il is not null then v_fine := r.problema_il::date;
        elsif r.stato not in ('in_transito', 'parziale') then
            v_fine := coalesce(r.accettato_il, r.chiuso_il, now())::date;
        end if;

        /* Si cammina GIORNO PER GIORNO. Per ogni giorno lavorativo oltre il
           termine si chiede chi c'era, e a ognuno si mette in conto la sua
           giornata — tenendo memoria ANCHE del titolo con cui ha pagato:
           un giorno si può essere lì di persona e un altro solo di nome. */
        v_conto := '{}'::jsonb;
        v_lav := 0;
        for v_g in select g::date from generate_series(r.parte_il + 1, coalesce(v_fine, current_date), interval '1 day') g loop
            if mag_giorni_lavorativi(v_g - 1, v_g, r.a_negozio) = 0 then continue; end if;
            v_lav := v_lav + 1;
            if v_lav <= v_reg.giorni_max then continue; end if;
            for v_chi in select * from mag_chi_paga(r.a_negozio, v_g) loop
                v_key := coalesce(v_chi.user_id::text, 'nome:' || v_chi.persona);
                v_ruoli := coalesce(v_conto -> v_key -> 'ruoli', '{}'::jsonb);
                v_ruoli := jsonb_set(v_ruoli, array[v_chi.ruolo],
                             to_jsonb(coalesce((v_ruoli ->> v_chi.ruolo)::int, 0) + 1));
                v_conto := jsonb_set(v_conto, array[v_key], jsonb_build_object(
                    'user_id', v_chi.user_id, 'persona', v_chi.persona, 'ruoli', v_ruoli,
                    'giorni', coalesce((v_conto -> v_key ->> 'giorni')::int, 0) + 1));
            end loop;
        end loop;

        if v_conto = '{}'::jsonb then
            update mag_ddt_malus set stato = 'archiviato', giorni = 0, importo = 0,
                   note = coalesce(note, '') || ' [rientrato nei termini]', updated_at = now()
             where ddt_id = r.id and stato = 'in_corso';
            continue;
        end if;

        for v_chi in select value as v from jsonb_each(v_conto) loop
            /* il titolo che vale è quello con cui ha pagato PIÙ giorni, e la
               nota racconta il resto: così nessuno legge «assegnato» quando
               per metà dei giorni era in negozio davvero */
            select k into v_top from jsonb_each_text(v_chi.v -> 'ruoli') e(k, n)
             order by n::int desc,
                      case k when 'store_manager' then 1 when 'presente' then 2 else 3 end
             limit 1;
            select string_agg(k || ' ' || n || (case when n::int = 1 then ' giorno' else ' giorni' end), ' · ' order by n::int desc, case k when 'store_manager' then 1 when 'presente' then 2 else 3 end)
              into v_nota from jsonb_each_text(v_chi.v -> 'ruoli') e(k, n);

            insert into mag_ddt_malus
                (ddt_id, numero, negozio, user_id, persona, ruolo, scadenza,
                 data_fine, giorni, malus_giorno, importo, stato, note)
            values (r.id, r.numero, r.a_negozio,
                    nullif(v_chi.v ->> 'user_id', '')::uuid,
                    v_chi.v ->> 'persona', v_top, r.parte_il,
                    v_fine, (v_chi.v ->> 'giorni')::int, v_reg.malus_giorno,
                    round((v_chi.v ->> 'giorni')::int * v_reg.malus_giorno, 2),
                    case when v_fine is null then 'in_corso' else 'chiuso' end, v_nota)
            on conflict (ddt_id, persona) do update
               set giorni = excluded.giorni, importo = excluded.importo,
                   data_fine = excluded.data_fine, ruolo = excluded.ruolo,
                   note = excluded.note,
                   stato = case when mag_ddt_malus.stato in ('compensato', 'archiviato')
                                then mag_ddt_malus.stato else excluded.stato end,
                   updated_at = now()
             where mag_ddt_malus.stato not in ('compensato', 'archiviato');
            v_scritti := v_scritti + 1;
        end loop;
    end loop;

    for r in
        select d.id, d.a_negozio from mag_ddt d
         where d.stato in ('in_transito', 'parziale')
           and d.problema_il is null
           and coalesce(d.tipo, '') <> 'usato'
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
