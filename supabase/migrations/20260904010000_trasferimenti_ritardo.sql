-- ═══════════════════════════════════════════════════════════════════════════
-- UN TRASFERIMENTO HA UN TEMPO MASSIMO — 04/09/2026
--
-- Luca: «voglio un modo legato a una tempistica massima, che per me
-- rappresenta 6 giorni lavorativi, entro il quale un trasferimento deve essere
-- accettato; altrimenti su magazzino bippa lo stesso pallino che abbiamo messo
-- per i trasferimenti problematici, e inoltre genera 5 euro di malus al giorno
-- dal settimo giorno lavorativo in poi se l'ordine non viene accettato o non
-- viene segnalato come un problema. Qui il pallino è solo per il negozio
-- oggetto del problema. E dal quarto giorno mettiamogli un bip che lampeggia
-- giallo, così capiscono.»
-- E sul chi paga: «fai solo lo store manager lì dove c'è; dove non c'è, segui
-- la sezione turni per capire chi c'era e chi non».
--
-- ── LA SCALA, E PERCHÉ AVVISA PRIMA DI PUNIRE ──────────────────────────────
--   giorni 1-3   niente
--   giorni 4-6   🟡 giallo che lampeggia: «guarda che stai per sforare»
--   dal 7°       🔴 rosso + 5 €/giorno
--   sempre       segnalare un PROBLEMA ferma tutto
-- Il giallo non è un ammorbidimento: è quello che rende la multa giusta.
-- Nessuno può dire «non lo sapevo» se per tre giorni gli ha lampeggiato.
--
-- E SEGNALARE È L'USCITA DI SICUREZZA, di proposito: se la merce non c'è, il
-- gesto giusto è dirlo, non subire in silenzio. Non è gratis — il problema
-- squilla al mittente e all'amministrazione e resta acceso finché non si
-- chiude — ma non costa soldi.
--
-- ⚠️ NON GUARDA INDIETRO. È la lezione del 25/08 (malus Sky: regola accesa →
-- 119 episodi retroattivi, 1.170 €) e del 28/08 (patto delle task: 860 € su
-- promemoria che le persone si erano scritte da sole). `decorrenza` dice da
-- quando vale, e un trasferimento nato prima non entra nel conto.
-- Per gli otto carichi «Import» fermi da giorni Luca ha deciso: «falli contare
-- da domani» — quindi il loro giorno 1 è la decorrenza, non la data in cui
-- sono nati. Lo fa `greatest(creato_il, decorrenza)`.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.mag_trasferimenti_regole (
    id             smallint primary key default 1,
    giorni_avviso  smallint not null default 4,   -- da qui lampeggia giallo
    giorni_max     smallint not null default 6,   -- entro qui va accettato
    malus_giorno   numeric  not null default 5,   -- dal 7° in poi, al giorno
    decorrenza     date,
    aggiornato_il  timestamptz not null default now(),
    aggiornato_da  text,
    constraint una_riga check (id = 1)
);
comment on table public.mag_trasferimenti_regole is
  'Il patto sui trasferimenti: quanti giorni per accettare, quanto costa il ritardo, e DA QUANDO vale. Un cambio di regole non è mai retroattivo.';

insert into public.mag_trasferimenti_regole (id, giorni_avviso, giorni_max, malus_giorno, decorrenza)
values (1, 4, 6, 5, current_date + 1)
on conflict (id) do nothing;

-- ── I GIORNI LAVORATIVI DI QUEL NEGOZIO ────────────────────────────────────
-- Non un calendario generico: un negozio chiuso la domenica non può accettare
-- niente la domenica, e fargli maturare 5 € è una multa per essere stato
-- chiuso. Il sabato è lavorativo (Luca 03/09) e resta tale anche dove
-- `sabato_apertura` è vuoto — su dodici negozi è compilato in quattro, e
-- «vuoto» lì vuol dire «non l'abbiamo scritto», non «chiuso».
create or replace function public.mag_giorni_lavorativi(p_da date, p_a date, p_negozio text)
returns integer
language sql stable security definer set search_path = public as $$
  with dom as (
    select bool_or(coalesce(domenica_aperta, false)) aperta
      from stores where split_part(name, ' ', 1) = split_part(p_negozio, ' ', 1))
  select count(*)::int
    from generate_series(p_da, p_a, interval '1 day') g(d)
   where g.d::date > p_da                                    -- il giorno di partenza non conta
     and (extract(dow from g.d) <> 0 or (select aperta from dom))
     and not exists (select 1 from giorni_festivi f where f.giorno = g.d::date)
$$;

-- ── IL REGISTRO DEGLI EPISODI ──────────────────────────────────────────────
-- Stessa forma delle quattro sorelle (tracking, caller, usato, task): i suoi
-- stati, la sua compensazione e la sua lapide. Un malus che si vede e basta
-- non è un malus: è una decorazione.
create table if not exists public.mag_ddt_malus (
    id            uuid primary key default gen_random_uuid(),
    ddt_id        uuid not null references public.mag_ddt(id) on delete cascade,
    numero        integer,
    negozio       text not null,          -- chi doveva accettare
    user_id       uuid references public.app_users(id),
    persona       text not null,          -- il nome, o il negozio se non c'è nessuno
    ruolo         text,                   -- 'store_manager' | 'presente' | 'negozio'
    scadenza      date not null,          -- l'ultimo giorno utile
    data_fine     date,                   -- quando è stato accettato o segnalato
    giorni        integer not null default 0,
    malus_giorno  numeric not null default 5,
    importo       numeric not null default 0,
    stato         text not null default 'in_corso',
    compensato_il timestamptz, compensato_da text, note text,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    eliminato     boolean not null default false,
    eliminato_il  timestamptz, eliminato_da text,
    /* UN EPISODIO PER DOCUMENTO E PER PERSONA: due browser che aprono la
       sezione insieme scrivono la stessa riga, non due. */
    constraint mag_ddt_malus_unico unique (ddt_id, persona)
);
create index if not exists mag_ddt_malus_aperti on public.mag_ddt_malus (stato) where not eliminato;

alter table public.mag_ddt_malus enable row level security;
drop policy if exists mag_ddt_malus_lettura on public.mag_ddt_malus;
create policy mag_ddt_malus_lettura on public.mag_ddt_malus for select to public using (tf_uid() is not null);

revoke insert, update, delete, truncate on public.mag_ddt_malus from authenticated, anon;
revoke insert, update, delete, truncate on public.mag_trasferimenti_regole from authenticated, anon;
grant select on public.mag_ddt_malus, public.mag_trasferimenti_regole to authenticated, anon;
-- ── CHI PAGA IL RITARDO DI QUEL NEGOZIO, IN QUEL GIORNO ────────────────────
-- Luca 03/09: «fai solo lo store manager lì dove c'è; dove non c'è, segui la
-- sezione turni per capire chi c'era e chi non».
-- La sezione Turni non è una tabella di turni compilati a mano: le presenze
-- sono AUTOMATICHE dagli assegnati al negozio, e `turni_negozio` tiene solo le
-- eccezioni. Quindi «chi c'era» = chi è assegnato a quella SEDE, meno chi
-- quel giorno era in ferie o in malattia.
-- E la sede, non l'insegna: Magliana W3 e Magliana Multi sono un banco solo.
create or replace function public.mag_chi_paga(p_negozio text, p_giorno date)
returns table(user_id uuid, persona text, ruolo text)
language plpgsql stable security definer set search_path = public as $$
declare v_sede text := split_part(p_negozio, ' ', 1);
begin
    -- ① lo store manager, dove c'è
    return query
        select u.id, u.full_name, 'store_manager'::text
          from user_stores s join app_users u on u.id = s.user_id
         where split_part(s.store_name, ' ', 1) = v_sede
           and u.role = 'store_manager' and coalesce(u.active, true);
    if found then return; end if;

    -- ② se no, chi c'era: gli assegnati, meno ferie e malattie di quel giorno
    return query
        select u.id, u.full_name, 'presente'::text
          from user_stores s join app_users u on u.id = s.user_id
         where split_part(s.store_name, ' ', 1) = v_sede
           and coalesce(u.active, true)
           and not exists (
               /* le colonne vere sono `date_from`/`date_to`, e lo stato
                  approvato qui si chiama `approved`; l'aggancio è per id
                  quando c'è, per nome quando manca — `user_id` su questa
                  tabella è arrivato dopo e le vecchie righe non ce l'hanno */
               select 1 from vacation_requests v
                where v.status = 'approved'
                  and (v.user_id = u.id
                       or (v.user_id is null
                           and lower(btrim(v.employee_name)) = lower(btrim(u.full_name))))
                  and p_giorno between v.date_from and v.date_to);
    if found then return; end if;

    /* ③ E SE NON C'È NESSUNO, IL CONTO VA AL NEGOZIO. Non si perde: una riga
       intestata al punto vendita, che l'amministrazione vedrà e attribuirà.
       Un addebito che sparisce in silenzio perché non si è trovato un nome è
       il modo più veloce per accorgersi troppo tardi che la regola non
       funzionava. È la stessa scelta già fatta per le task di negozio. */
    return query select null::uuid, p_negozio, 'negozio'::text;
end $$;

-- ── IL MOTORE ──────────────────────────────────────────────────────────────
-- Materializza gli episodi e li tiene aggiornati. Lo chiama la rotta dei
-- pallini, che tutti interrogano ogni due minuti: così il conto è sempre di
-- oggi senza bisogno di un cron.
create or replace function public.mag_matura_ritardi()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    r        record;
    v_reg    record;
    v_giorni int;
    v_oltre  int;
    v_chi    record;
    v_nuovi  int := 0;
    v_chiusi int := 0;
begin
    select * into v_reg from mag_trasferimenti_regole where id = 1;
    if v_reg.decorrenza is null then return jsonb_build_object('ok', true, 'spento', true); end if;

    for r in
        select d.id, d.numero, d.a_negozio, d.creato_il, d.stato,
               d.problema_il, d.problema_chiuso_il, d.accettato_il, d.chiuso_il,
               greatest(d.creato_il::date, v_reg.decorrenza) as parte_il
          from mag_ddt d
         where d.tipo <> 'usato'
           and greatest(d.creato_il::date, v_reg.decorrenza) <= current_date
           /* i documenti già chiusi entrano solo se hanno un episodio aperto
              da fermare: sul resto non c'è più niente da maturare */
           and (d.stato in ('in_transito', 'parziale')
                or exists (select 1 from mag_ddt_malus m where m.ddt_id = d.id and m.stato = 'in_corso'))
    loop
        /* IL PROBLEMA FERMA IL CONTO, e anche l'accettazione. Si ferma al
           giorno in cui è successo, non a oggi: il ritardo è quello che c'è
           stato, non quello che ci sarebbe stato. */
        declare v_fine date := null;
        begin
            if r.problema_il is not null then v_fine := r.problema_il::date;
            elsif r.stato not in ('in_transito', 'parziale') then
                v_fine := coalesce(r.accettato_il, r.chiuso_il, now())::date;
            end if;

            v_giorni := mag_giorni_lavorativi(r.parte_il, coalesce(v_fine, current_date), r.a_negozio);
            v_oltre  := greatest(0, v_giorni - v_reg.giorni_max);

            if v_oltre = 0 then
                /* dentro i termini: se c'era un episodio aperto per un giro
                   precedente, si azzera — non si lascia un debito che i fatti
                   hanno smentito */
                update mag_ddt_malus set stato = 'archiviato', giorni = 0, importo = 0,
                       note = coalesce(note, '') || ' [rientrato nei termini]', updated_at = now()
                 where ddt_id = r.id and stato = 'in_corso';
                continue;
            end if;

            for v_chi in select * from mag_chi_paga(r.a_negozio, current_date) loop
                insert into mag_ddt_malus
                    (ddt_id, numero, negozio, user_id, persona, ruolo, scadenza,
                     data_fine, giorni, malus_giorno, importo, stato)
                values (r.id, r.numero, r.a_negozio, v_chi.user_id, v_chi.persona, v_chi.ruolo,
                        r.parte_il, v_fine, v_oltre, v_reg.malus_giorno,
                        round(v_oltre * v_reg.malus_giorno, 2),
                        case when v_fine is null then 'in_corso' else 'chiuso' end)
                on conflict (ddt_id, persona) do update
                   /* un episodio compensato o archiviato NON si riapre: quello
                      è già stato deciso da una persona */
                   set giorni = excluded.giorni, importo = excluded.importo,
                       data_fine = excluded.data_fine,
                       stato = case when mag_ddt_malus.stato in ('compensato', 'archiviato')
                                    then mag_ddt_malus.stato else excluded.stato end,
                       updated_at = now()
                 where mag_ddt_malus.stato not in ('compensato', 'archiviato');
                if v_fine is null then v_nuovi := v_nuovi + 1; else v_chiusi := v_chiusi + 1; end if;
            end loop;
        end;
    end loop;

    return jsonb_build_object('ok', true, 'in_corso', v_nuovi, 'chiusi', v_chiusi);
end $$;

revoke all on function public.mag_matura_ritardi() from public, anon, authenticated;
revoke all on function public.mag_chi_paga(text, date) from public, anon, authenticated;
-- I GIORNI LAVORATIVI DI TANTI DOCUMENTI IN UNA CHIAMATA SOLA. La rotta dei
-- pallini la chiamano tutti ogni due minuti: una query per documento sarebbero
-- tredici andate e ritorno a testa, per un numero che cambia una volta al
-- giorno.
create or replace function public.mag_giorni_lavorativi_molti(p_righe jsonb)
returns table(i integer, n integer)
language sql stable security definer set search_path = public as $$
  select (x->>'i')::int,
         mag_giorni_lavorativi((x->>'da')::date, current_date, x->>'negozio')
    from jsonb_array_elements(p_righe) x
$$;
revoke all on function public.mag_giorni_lavorativi_molti(jsonb) from public, anon;
grant execute on function public.mag_giorni_lavorativi_molti(jsonb) to authenticated;
