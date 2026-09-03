-- ═══════════════════════════════════════════════════════════════════════════
-- LE CORREZIONI DELLA REVISIONE OSTILE — 03/09/2026 sera
--
-- Il patto dei 6 giorni è passato sotto un revisore indipendente (regola di
-- Luca sui soldi). Qui dentro c'è tutto quello che ha trovato e che si può
-- correggere senza decidere al posto suo. Ogni blocco dice CHE COSA ROMPEVA.
-- ═══════════════════════════════════════════════════════════════════════════

/* ── 1. IL REGISTRO DELLE MULTE ERA LEGGIBILE DA INTERNET ────────────────────
   `partita_persona` è una vista senza `security_invoker`: interrogandola si
   leggevano le cinque tabelle sotto CON I PERMESSI DEL PROPRIETARIO, saltando
   ogni RLS. E `anon` aveva SELECT. Con la sola chiave pubblica che sta nel
   bundle del browser si scaricava il registro delle multe di tutta l'azienda:
   misurato, 312 righe · 29 persone · 4.016 €. Nomi e cifre di gente vera.
   Il buco è più vecchio del patto — la vista esisteva già con quattro rami —
   ma il ramo dei trasferimenti ci finiva dentro anche lui.
   Nessuna riga di `src/` legge questa vista: si chiude senza rompere niente. */
alter view public.partita_persona set (security_invoker = on);
revoke all on public.partita_persona from anon;
revoke insert, update, delete, truncate on public.partita_persona from authenticated;

/* ── 2. LA SEZIONE MAGAZZINO NON VEDEVA IL PATTO ─────────────────────────────
   `mag_trasferimenti_regole` aveva RLS accesa e NESSUNA policy: dal browser
   tornava sempre zero righe. Quindi la pagina non conosceva la decorrenza,
   non chiedeva i giorni lavorativi, e il riquadro «Oltre i termini» contava
   zero PER SEMPRE. La regola esisteva solo per il pallino della sidebar, che
   passa da una rotta con la chiave di servizio. Il patto va letto da tutti:
   non c'è niente di riservato in «sei giorni, poi cinque euro». */
drop policy if exists mag_regole_lettura on public.mag_trasferimenti_regole;
create policy mag_regole_lettura on public.mag_trasferimenti_regole
    for select to public using (tf_uid() is not null);

/* ── 3. IL VENDITORE POTEVA SPOSTARE LA DATA DI PARTENZA ─────────────────────
   `tf_ddt_muovi` concede UPDATE su TUTTE le colonne a mittente e destinatario:
   `creato_il` compresa. Una riga dalla console del browser e il documento
   «riparte da oggi», la multa non è mai esistita. Una sanzione che il
   sanzionato può cancellare da solo non è una sanzione.
   L'anagrafica del documento (quando è nato, che numero ha, da dove a dove va)
   la può toccare solo il governo; lo stato e l'accettazione restano liberi. */
create or replace function public.mag_ddt_anagrafica_ferma()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
    if tf_e_governo() then return new; end if;
    if new.creato_il  is distinct from old.creato_il
       or new.numero     is distinct from old.numero
       or new.anno       is distinct from old.anno
       or new.da_negozio is distinct from old.da_negozio
       or new.a_negozio  is distinct from old.a_negozio then
        raise exception 'Di un documento di trasporto non si cambiano la data, il numero e il tragitto: chiedi all''amministrazione.'
            using errcode = 'check_violation';
    end if;
    return new;
end $$;
drop trigger if exists mag_ddt_anagrafica_ferma on public.mag_ddt;
create trigger mag_ddt_anagrafica_ferma before update on public.mag_ddt
    for each row execute function public.mag_ddt_anagrafica_ferma();

/* ── 4. L'EPISODIO RICORDA IL PATTO SOTTO CUI È NATO ─────────────────────────
   `importo` e `giorni` si ricalcolavano da zero a ogni corsa CON I PARAMETRI DI
   OGGI: alzare il malus da 5 a 10 € ri-prezzava all'indietro anche i giorni già
   maturati (misurato: 30 € diventavano 60 €). È l'incidente Sky del 25/08 in
   un'altra forma — lì una regola accesa oggi fabbricava debiti di ieri, qui una
   regola ritoccata oggi riscrive il prezzo di ieri.
   Rimedio senza costruire uno storico: il patto si CONGELA sulla riga alla
   prima maturazione, e da lì in poi quell'episodio usa i suoi numeri. */
alter table public.mag_ddt_malus
    add column if not exists giorni_max int;
update public.mag_ddt_malus set giorni_max = 6 where giorni_max is null;

/* ── 5. LA CHIAVE ERA IL NOME, E I NOMI SI CORREGGONO ────────────────────────
   `unique (ddt_id, persona)`: bastava sistemare un nominativo in anagrafica
   (nel repo c'è perfino uno script che lo fa) e la corsa dopo creava una
   SECONDA riga per la stessa persona, lasciando viva la prima. Misurato: 60 €
   invece di 30 per lo stesso documento. La chiave dev'essere la persona, non
   come la si scrive oggi. */
do $$
declare v_nome text;
begin
    select conname into v_nome from pg_constraint
     where conrelid = 'public.mag_ddt_malus'::regclass and contype = 'u';
    if v_nome is not null then
        execute format('alter table public.mag_ddt_malus drop constraint %I', v_nome);
    end if;
end $$;
create unique index if not exists mag_ddt_malus_chiave
    on public.mag_ddt_malus (ddt_id, coalesce(user_id::text, persona));

create or replace function public.mag_in_ferie(p_user uuid, p_nome text, p_giorno date)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
    select exists (
        select 1 from vacation_requests v
         where v.status = 'approved'
           and (v.user_id = p_user
                or (v.user_id is null and lower(btrim(v.employee_name)) = lower(btrim(p_nome))))
           and p_giorno between v.date_from and v.date_to)
$$;
revoke all on function public.mag_in_ferie(uuid, text, date) from public, anon, authenticated;

/* ── 6. LO STORE MANAGER IN FERIE PAGAVA LO STESSO ───────────────────────────
   Il ramo ① non guardava le ferie: Marta Ferraro (Castani) risultava debitrice
   per il 10–12/09, che ha approvato come ferie. E non è teoria — il DDT n.11
   diretto a Castani è in transito adesso e il suo primo giorno pagante cade
   dentro quelle ferie. Se il conto si fa giorno per giorno, «chi non c'era non
   paga» deve valere per tutti, manager compreso: se è in ferie si scende al
   ramo successivo, cioè a chi era davvero in negozio.

   ── 7. UNA PRESENZA RITIRATA FACEVA PAGARE ─────────────────────────────────
   `presenza_negozio.stato` può essere 'chiusa' — la dichiarazione è stata
   ritirata. Il ramo ② non lo filtrava, mentre tutto il resto del CRM sì.
   Ad Acilia il 01/09 uscivano 5 persone invece di 3 (+67 % sull'importo), e
   fra queste Luca stesso per una richiesta che aveva ritirato lui. */
create or replace function public.mag_chi_paga(p_negozio text, p_giorno date)
returns table(user_id uuid, persona text, ruolo text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_sede text := lower(split_part(p_negozio, ' ', 1));
begin
    -- ① lo store manager della sede, se quel giorno non era in ferie
    return query
        select u.id, u.full_name, 'store_manager'::text
          from user_stores s join app_users u on u.id = s.user_id
         where lower(split_part(s.store_name, ' ', 1)) = v_sede
           and u.role = 'store_manager' and coalesce(u.active, true)
           and not public.mag_in_ferie(u.id, u.full_name, p_giorno);
    if found then return; end if;

    -- ② chi ha dichiarato di essere lì quel giorno, e non l'ha ritirata
    return query
        select distinct u.id, u.full_name, 'presente'::text
          from presenza_negozio p join app_users u on u.id = p.user_id
         where lower(split_part(p.sede, ' ', 1)) = v_sede
           and p.data = p_giorno and p.stato = 'attiva'
           and coalesce(u.active, true);
    if found then return; end if;

    -- ③ gli assegnati alla sede, meno le ferie approvate
    return query
        select u.id, u.full_name, 'assegnato'::text
          from user_stores s join app_users u on u.id = s.user_id
         where lower(split_part(s.store_name, ' ', 1)) = v_sede
           and coalesce(u.active, true)
           and not public.mag_in_ferie(u.id, u.full_name, p_giorno);
end $$;
revoke all on function public.mag_chi_paga(text, date) from public, anon, authenticated;


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
         /* SOLO I TRASFERIMENTI. Il filtro `tipo <> 'usato'` non ha mai escluso
            niente: `tipo` vale 'trasferimento' o 'cessione', gli usati si
            riconoscono dallo STATO. Le cessioni, che nessuno deve accettare,
            finivano dentro il patto. */
         where coalesce(d.tipo, '') = 'trasferimento'
           and d.stato <> 'usato'
         /* LE SEDI TECNICHE STANNO FUORI. Al Laboratorio non è assegnato
            nessuno: ogni documento che ci arriva si auto-segnalerebbe come
            problema, e un allarme che suona sempre non è un allarme. */
           and lower(split_part(d.a_negozio, ' ', 1)) <> 'laboratorio'
           and greatest(d.creato_il::date, v_reg.decorrenza) <= current_date
           and (d.stato in ('in_transito', 'parziale')
                or exists (select 1 from mag_ddt_malus m
                            where m.ddt_id = d.id and m.stato = 'in_corso'
                              and not coalesce(m.eliminato, false)))
    loop
        /* IL PATTO SI CONGELA ALLA PRIMA MATURAZIONE: se l'episodio esiste già,
           vale il prezzo sotto cui è nato, non quello di stasera. */
        select malus_giorno, giorni_max into v_rate, v_max
          from mag_ddt_malus where ddt_id = r.id
           and not coalesce(eliminato, false) order by created_at limit 1;
        v_rate := coalesce(v_rate, v_reg.malus_giorno);
        v_max  := coalesce(v_max,  v_reg.giorni_max);

        /* FINE = quando il documento smette di essere in viaggio. */
        v_fine := null;
        if r.stato not in ('in_transito', 'parziale') then
            v_fine := coalesce(r.accettato_il, r.chiuso_il, now())::date;
        end if;

        /* IL PROBLEMA SOSPENDE, NON IMMUNIZZA.
           Prima si guardava solo `problema_il`: segnalavi un problema,
           l'amministrazione lo risolveva, il documento restava lì e il conto
           NON RIPARTIVA PIÙ. Anzi spariva pure dal rosso, perché i pallini
           guardano `problema_il && !problema_chiuso_il`: invisibile ovunque.
           Ora i giorni dentro la finestra del problema non si contano, e alla
           chiusura l'orologio riprende da dove si era fermato. */
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
            /* ARCHIVIARE SOLO SE È DAVVERO RIENTRATO NEI TERMINI.
               Prima bastava che il conto fosse vuoto: se il negozio restava
               senza personale, un debito già maturato veniva azzerato con la
               nota falsa «rientrato nei termini» — e siccome `archiviato` è
               protetto, non tornava più. Un cambio di organico cancellava soldi
               già dovuti. Ora, se è tardi ma non c'è nessuno, l'episodio resta
               com'è e il documento si auto-segnala più sotto. */
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
                 data_fine, giorni, malus_giorno, giorni_max, importo, stato, note)
            values (r.id, r.numero, r.a_negozio,
                    nullif(v_chi.v ->> 'user_id', '')::uuid,
                    v_chi.v ->> 'persona', v_top, r.parte_il,
                    v_fine, (v_chi.v ->> 'giorni')::int, v_rate, v_max,
                    round((v_chi.v ->> 'giorni')::int * v_rate, 2),
                    case when v_fine is null then 'in_corso' else 'chiuso' end, v_nota)
            on conflict (ddt_id, coalesce(user_id::text, persona)) do update
               set giorni = excluded.giorni, importo = excluded.importo,
                   data_fine = excluded.data_fine, ruolo = excluded.ruolo,
                   persona = excluded.persona, note = excluded.note,
                   stato = excluded.stato, updated_at = now()
             /* NON SI TOCCA: quello che è stato compensato o archiviato, quello
                che sta nel cestino, e quello che è in uno stato che il motore
                non conosce (prima bastava una blacklist: un episodio cestinato
                continuava a crescere sotto il flag, e uno «annullato» tornava
                vivo). E se non è cambiato NIENTE non si riscrive la riga: la
                rotta gira a ogni poll di 48 persone, erano ~34.500 riscritture
                inutili al giorno di tutte le righe. */
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
revoke all on function public.mag_giorni_lavorativi(date, date, text) from public, anon;

/* ── 8. «VAI A CERCARE IL DDT N. 4» E NE TROVA DUE ───────────────────────────
   I numeri dei documenti ripartono per anno: oggi cinque numeri esistono già
   in doppia copia. Il riferimento che mando alla persona deve essere quello
   che le fa trovare IL suo documento. */
create or replace view public.partita_persona as
 SELECT 'tracking'::text AS fonte, m.id::text AS episodio_id, u.id AS user_id,
        m.venditore AS persona, m.data_inizio AS dal, m.data_fine AS al,
        m.giorni, m.importo, m.stato, m.contract_id AS riferimento, m.negozio,
        m.created_at, false AS eliminato
   FROM malus_storico m
   LEFT JOIN app_users u ON lower(btrim(u.full_name)) = lower(btrim(m.venditore))
  WHERE COALESCE(m.eliminato, false) = false
UNION ALL
 SELECT 'caller'::text, c.id::text, u.id, c.caller, c.dal, c.al, c.giorni,
        c.importo, c.stato, c.call_id, NULL::text, c.created_at, false
   FROM caller_malus c
   LEFT JOIN app_users u ON lower(btrim(u.full_name)) = lower(btrim(c.caller))
  WHERE COALESCE(c.eliminato, false) = false
UNION ALL
 SELECT 'usato'::text, s.id::text, u.id, s.tecnico, s.data_inizio, s.data_fine,
        s.giorni, s.importo, s.stato, s.imei, NULL::text, s.created_at, false
   FROM usati_malus s
   LEFT JOIN app_users u ON lower(btrim(u.full_name)) = lower(btrim(s.tecnico))
UNION ALL
 SELECT 'task'::text, t.id::text, t.user_id, t.persona, t.scadenza, t.data_fine,
        t.giorni, t.importo, t.stato, t.task_id::text, NULL::text, t.created_at, false
   FROM task_malus t
  WHERE COALESCE(t.eliminato, false) = false
UNION ALL
 SELECT 'trasferimento'::text, d.id::text, COALESCE(d.user_id, u.id), d.persona,
        d.scadenza, d.data_fine, d.giorni, d.importo, d.stato,
        ('DDT n. ' || d.numero || '/' || COALESCE(dd.anno, EXTRACT(year FROM d.created_at)::int))::text,
        d.negozio, d.created_at, false
   FROM mag_ddt_malus d
   LEFT JOIN app_users u ON lower(btrim(u.full_name)) = lower(btrim(d.persona))
   LEFT JOIN mag_ddt dd ON dd.id = d.ddt_id
  WHERE COALESCE(d.eliminato, false) = false
    AND d.stato <> 'archiviato';
alter view public.partita_persona set (security_invoker = on);
revoke all on public.partita_persona from anon;
