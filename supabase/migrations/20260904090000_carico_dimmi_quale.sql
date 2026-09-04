-- ═══════════════════════════════════════════════════════════════════════════
-- IL CARICO DICE QUALE ARTICOLO, SEMPRE — 04/09/2026
--
-- Luca, davanti allo schermo di Magliana: «quando questo accade, dobbiamo
-- sapere quale è l'articolo, se no non riusciamo ad andare avanti».
-- Vedi anche 20260904080000: quel guasto lì non era nemmeno un pezzo doppio.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.mag_carico_merce(p_negozio text, p_con_accettazione boolean, p_righe jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $fn$

declare
  v_chi        record;
  v_ufficio    constant text := 'Ufficio';
  v_in_ufficio boolean;
  v_r          jsonb;
  v_az         text;
  v_ddt_id     uuid;
  v_numero     integer;
  v_riga       integer;
  v_unita_id   uuid;
  v_ser        text;
  v_pezzi      numeric;
  v_tot        numeric := 0;
  v_docs       jsonb := '[]'::jsonb;
  v_quando     timestamptz := now();
  v_stato_u    text;
  v_aziende    text[];
  v_casse      text[];
  v_note       text[];
  v_seriali    text[] := '{}';
  v_scontro    text;
  v_vincolo    text;
  v_nota       text;
  v_desc       text;
  v_cod        text;
  v_n_ser      integer;
  v_uno        boolean;
begin
  select * into v_chi from mag_chi_carica();

  p_negozio := btrim(coalesce(p_negozio, ''));
  if p_negozio = '' then raise exception 'scegli dove sta entrando la merce'; end if;
  if not exists (select 1 from stores where name = p_negozio) then
    raise exception 'il negozio «%» non esiste', p_negozio;
  end if;
  v_in_ufficio := p_negozio = v_ufficio;
  p_con_accettazione := coalesce(p_con_accettazione, true) and not v_in_ufficio;

  if p_righe is null or jsonb_typeof(p_righe) <> 'array' or jsonb_array_length(p_righe) = 0 then
    raise exception 'non c''è niente da caricare';
  end if;

  -- ── LE SOCIETÀ ─────────────────────────────────────────────────────────
  /* PRIMA: LA SOCIETÀ DEVE ESISTERE. Vale anche in ufficio, dove prima non
     si controllava affatto: un pezzo nato con una società inventata è un
     pezzo che il giorno che si vende esce dallo scontrino in silenzio. */
  select array_agg(distinct btrim(x->>'azienda')) into v_aziende
    from jsonb_array_elements(p_righe) x;
  if array_position(v_aziende, null) is not null or array_position(v_aziende, '') is not null then
    raise exception 'ogni riga deve dire di quale società è la merce';
  end if;
  select string_agg(a, ', ') into v_scontro from unnest(v_aziende) a
   where not exists (select 1 from pos_rt where azienda = a);
  if v_scontro is not null then
    raise exception 'non esiste nessuna società «%» nel gestionale', v_scontro;
  end if;

  /* POI: DEVE AVERE UNA CASSA QUI. L'ufficio non vende, quindi lì entra la
     merce di tutte e due; un negozio no. */
  select array_agg(distinct azienda) into v_casse from pos_rt where negozio = p_negozio;
  if not v_in_ufficio then
    if v_casse is null then
      raise exception 'a % non c''è nessun registratore: qui la merce non si può vendere, e quindi non ha senso caricarla', p_negozio;
    end if;
    select string_agg(a, ', ') into v_scontro
      from unnest(v_aziende) a where not (a = any(v_casse));
    if v_scontro is not null then
      raise exception 'a % non c''è una cassa di %: quella merce, quando la vendi, non uscirebbe sullo scontrino', p_negozio, v_scontro;
    end if;
  end if;

  -- L'USATO NON ENTRA A MAGAZZINO (Luca 03/09): vive in Gestione Usati, e
  -- caricarlo qui vuol dire lo stesso telefono in due registri.
  perform mag_carico_no_usato(p_righe);

  -- ── OGNI RIGA DICE UNA COSA SOLA, E LA DICE PER INTERO ─────────────────
  for v_r in select x from jsonb_array_elements(p_righe) x loop
    v_desc := coalesce(nullif(btrim(coalesce(v_r->>'descrizione', '')), ''),
                       nullif(btrim(coalesce(v_r->>'codice', '')), ''), 'una riga');
    /* i seriali si contano DOPO averli ripuliti: è la stessa lettura che
       farà l'INSERT, e prima non lo era — gli spazi passavano il controllo
       e schiantavano sull'indice unico con un messaggio in inglese */
    select count(*) into v_n_ser from jsonb_array_elements_text(coalesce(v_r->'seriali', '[]'::jsonb)) s
     where btrim(s) <> '';
    v_pezzi := coalesce(nullif(btrim(coalesce(v_r->>'quantita', '')), '')::numeric, 0);
    v_uno := coalesce((v_r->>'uno_per_uno')::boolean,
                      jsonb_array_length(coalesce(v_r->'seriali', '[]'::jsonb)) > 0);

    if v_uno and v_pezzi > 0 then
      raise exception '«%» dice sia i numeri di serie sia una quantità: o si conta uno per uno, o a quantità', v_desc;
    end if;
    if v_uno and v_n_ser = 0 then
      raise exception '«%» si conta uno per uno ma non hai scritto nessun numero di serie', v_desc;
    end if;
    if not v_uno then
      if v_pezzi <= 0 then raise exception '«%»: quanti pezzi?', v_desc; end if;
      /* MEZZO TELEFONO NON ESISTE. `2.7` entrava a magazzino come 2,7 pezzi:
         basta scrivere 2,7 nel campo della quantità. */
      if v_pezzi <> trunc(v_pezzi) then
        raise exception '«%»: % pezzi non è un numero intero — i pezzi si contano a uno a uno', v_desc, v_pezzi;
      end if;
      if nullif(btrim(coalesce(v_r->>'codice', '')), '') is null then
        raise exception '«%»: la merce a quantità vuole il codice articolo', v_desc;
      end if;
    end if;
  end loop;

  -- ── I SERIALI ──────────────────────────────────────────────────────────
  select array_agg(btrim(s)) into v_seriali
    from jsonb_array_elements(p_righe) x,
         lateral jsonb_array_elements_text(coalesce(x->'seriali', '[]'::jsonb)) s
   where btrim(s) <> '';
  v_seriali := coalesce(v_seriali, '{}');

  if array_length(v_seriali, 1) is not null then
    select string_agg(d.s || coalesce(' — ' || a.descrizione, ''), ' · ') into v_scontro from (
      select s from unnest(v_seriali) s group by s having count(*) > 1 limit 5) d
      left join lateral (
        select ar.descrizione from jsonb_array_elements(p_righe) r
          left join mag_articoli ar on ar.codice = btrim(r->>'codice')
         where exists (select 1 from jsonb_array_elements_text(coalesce(r->'seriali','[]'::jsonb)) t
                        where btrim(t) = d.s)
         limit 1) a on true;
    if v_scontro is not null then
      raise exception 'lo stesso numero è scritto due volte nel carico: %', v_scontro;
    end if;
    -- La stessa regola dell'indice unico `mag_unita_seriale_viva`: un pezzo
    -- venduto o annullato si può ricaricare — un reso esiste — uno vivo no.
    /* SI DICE ANCHE COS'È E DOV'È. Un IMEI da solo non basta: con 22 pezzi
       sul bancone bisogna sapere QUALE scatola togliere, e sapere che quel
       pezzo risulta già a Garbatella cambia del tutto cosa si va a fare. */
    select string_agg(x.testo, ' · ') into v_scontro from (
      select u.seriale
             || coalesce(' — ' || a.descrizione, '')
             || coalesce(' [' || u.codice || ']', '')
             || coalesce(' · risulta a ' || u.negozio, '')
             || coalesce(' (' || u.stato || ')', '') as testo
        from mag_unita u
        left join mag_articoli a on a.codice = u.codice
       where u.seriale = any(v_seriali) and u.stato not in ('venduto', 'annullato')
       limit 5) x;
    if v_scontro is not null then
      raise exception 'questi pezzi sono già a magazzino, toglili dal carico: %', v_scontro;
    end if;
  end if;

  -- ── SOCIETÀ PER SOCIETÀ: UN DOCUMENTO CIASCUNA ─────────────────────────
  for v_az in select distinct btrim(x->>'azienda') from jsonb_array_elements(p_righe) x order by 1 loop
    v_ddt_id := null; v_numero := null; v_riga := 0;

    if not v_in_ufficio then
      insert into mag_ddt (da_negozio, a_negozio, azienda_da, azienda_a, tipo, stato,
                           causale, creato_da, accettato_da, accettato_il, chiuso_da, chiuso_il)
      values (v_ufficio, p_negozio, v_az, v_az, 'trasferimento',
              case when p_con_accettazione then 'in_transito' else 'accettato' end,
              case when p_con_accettazione
                   then 'Carico merce dall''ufficio — in attesa di accettazione'
                   else 'Carico merce dall''ufficio — consegnata' end,
              v_chi.nome,
              case when p_con_accettazione then null else v_chi.nome end,
              case when p_con_accettazione then null else v_quando end,
              case when p_con_accettazione then null else v_chi.nome end,
              case when p_con_accettazione then null else v_quando end)
      returning id, numero into v_ddt_id, v_numero;
      v_docs := v_docs || jsonb_build_object('numero', v_numero, 'azienda', v_az);
    end if;

    v_nota := case when v_in_ufficio then 'carico merce in ufficio'
                   else 'carico merce dall''ufficio — DDT n.' || v_numero end;

    for v_r in select x from jsonb_array_elements(p_righe) x
                where btrim(x->>'azienda') = v_az loop
      v_cod  := nullif(btrim(coalesce(v_r->>'codice', '')), '');
      v_desc := coalesce(nullif(btrim(coalesce(v_r->>'descrizione', '')), ''), 'ARTICOLO');
      v_uno  := coalesce((v_r->>'uno_per_uno')::boolean,
                         jsonb_array_length(coalesce(v_r->'seriali', '[]'::jsonb)) > 0);

      /* ④ L'ANAGRAFICA IMPARA, e lo fa QUI dove il permesso c'è. Dal browser
         questo UPDATE falliva sempre e in silenzio: chi correggeva «uno per
         uno» su un articolo lo ricorreggeva ogni volta, per sempre. */
      if v_cod is not null then
        update mag_articoli set ha_imei = v_uno
         where codice = v_cod and ha_imei is distinct from v_uno;
      end if;

      if v_uno then
        -- ══ MERCE CHE SI CONTA UNO PER UNO ══════════════════════════════
        -- UN PEZZO, UNA RIGA DI DOCUMENTO, col suo `unita_id`. È l'invariante
        -- su cui è costruito tutto il resto: l'accettazione, la stampa del
        -- DDT, l'export, la tabella «in viaggio».
        v_stato_u := case when p_con_accettazione then 'in_transito' else 'disponibile' end;
        for v_ser in select distinct btrim(s) from jsonb_array_elements_text(v_r->'seriali') s
                      where btrim(s) <> '' loop
          /* IL PEZZO NASCE SEMPRE COL DOCUMENTO ADDOSSO, anche nel carico
             diretto: è il trigger della storia a leggerlo lì, e senza il
             bottone «apri il documento di trasporto» non comparirebbe mai
             sulla scheda del pezzo. Un istante dopo, per il carico diretto,
             si azzera — la convenzione della casa è che `ddt_id` resta solo
             finché la merce viaggia. */
          insert into mag_unita (seriale, tipo_seriale, codice, descrizione, azienda,
                                 negozio, stato, valore, caricato_da, ddt_id)
          values (v_ser,
                  coalesce(nullif(btrim(coalesce(v_r->>'tipo_seriale', '')), ''), 'imei'),
                  v_cod, v_desc, v_az, p_negozio, v_stato_u,
                  nullif(v_r->>'costo', '')::numeric, v_chi.nome, v_ddt_id)
          returning id into v_unita_id;

          if not p_con_accettazione and v_ddt_id is not null then
            update mag_unita set ddt_id = null where id = v_unita_id;
          end if;

          if not v_in_ufficio then
            v_riga := v_riga + 1;
            insert into mag_ddt_righe (ddt_id, riga, codice, descrizione, unita_id, seriale,
                                       quantita, quantita_accettata, valore_unitario,
                                       negozio_da, negozio_a, azienda_da, azienda_a, stato,
                                       chiusa_il, chiusa_da)
            values (v_ddt_id, v_riga, v_cod, v_desc, v_unita_id, v_ser, 1,
                    case when p_con_accettazione then null else 1 end,
                    nullif(v_r->>'costo', '')::numeric,
                    v_ufficio, p_negozio, v_az, v_az,
                    case when p_con_accettazione then 'in_viaggio' else 'accettata' end,
                    case when p_con_accettazione then null else v_quando end,
                    case when p_con_accettazione then null else v_chi.nome end);
          end if;
          v_tot := v_tot + 1;
        end loop;

      else
        -- ══ MERCE CHE SI CONTA A QUANTITÀ ═══════════════════════════════
        v_pezzi := (v_r->>'quantita')::numeric;
        if not v_in_ufficio then
          v_riga := v_riga + 1;
          insert into mag_ddt_righe (ddt_id, riga, codice, descrizione, unita_id, seriale,
                                     quantita, quantita_accettata, valore_unitario,
                                     negozio_da, negozio_a, azienda_da, azienda_a, stato,
                                     chiusa_il, chiusa_da)
          values (v_ddt_id, v_riga, v_cod, v_desc, null, null, v_pezzi,
                  case when p_con_accettazione then null else v_pezzi end,
                  nullif(v_r->>'costo', '')::numeric,
                  v_ufficio, p_negozio, v_az, v_az,
                  case when p_con_accettazione then 'in_viaggio' else 'accettata' end,
                  case when p_con_accettazione then null else v_quando end,
                  case when p_con_accettazione then null else v_chi.nome end);
        end if;

        -- LA QUANTITÀ ENTRA SOLO SE È GIÀ ARRIVATA: col flag
        -- dell'accettazione la scrive `prendiInCarico`.
        if not p_con_accettazione then
          insert into mag_movimenti (codice, negozio, azienda, tipo, quantita,
                                     costo_unitario, operatore, ddt_id, nota)
          values (v_cod, p_negozio, v_az, 'carico', v_pezzi,
                  nullif(v_r->>'costo', '')::numeric, v_chi.nome, v_ddt_id, v_nota);
        end if;
        v_tot := v_tot + v_pezzi;
      end if;
    end loop;

    if not v_in_ufficio and v_riga = 0 then
      raise exception 'il documento di % sarebbe nato senza righe: carico annullato', v_az;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'pezzi', v_tot, 'documenti', v_docs,
                            'negozio', p_negozio, 'accettazione', p_con_accettazione);

/* ① IL MESSAGGIO DEVE DIRE QUALE ARTICOLO, SEMPRE (Luca 04/09).
   «Un pezzo di questo carico risulta già a magazzino» davanti a 22 pezzi è un
   vicolo cieco: non si sa cosa togliere e non si va avanti. Peggio, il 04/09 a
   Magliana quel messaggio era pure FALSO — nessun pezzo era a magazzino, si era
   disallineata la numerazione dei documenti — e ha mandato a cercare per un'ora
   una cosa che non c'era. Quindi: si nomina il pezzo E l'articolo, e quando il
   colpo non è sui seriali si dice apertamente qual è il vincolo, invece di
   inventare una spiegazione plausibile. */
exception
  when unique_violation then
    get stacked diagnostics v_vincolo = constraint_name;

    select string_agg(x.testo, ' · ') into v_scontro from (
      select u.seriale
             || coalesce(' — ' || a.descrizione, '')
             || coalesce(' [' || u.codice || ']', '')
             || coalesce(' · ora a ' || u.negozio, '') as testo
        from mag_unita u
        left join mag_articoli a on a.codice = u.codice
       where u.seriale = any(v_seriali) and u.stato not in ('venduto', 'annullato')
       limit 5) x;
    if v_scontro is not null then
      raise exception 'questi pezzi risultano già a magazzino: %. Il carico non è partito.', v_scontro;
    end if;

    if v_vincolo = 'mag_ddt_numero_unico' then
      raise exception 'la numerazione dei documenti di % si è accavallata con uno già emesso. Riprova: il numero si rimette in pari da solo.', coalesce(v_az, 'questa società');
    end if;

    /* NESSUNA SPIEGAZIONE INVENTATA: si dice cosa ha rifiutato il database,
       così chi legge sa cosa segnalare e a chi. */
    raise exception 'il carico non è partito: il database ha rifiutato una riga doppia (%). Nessun pezzo è entrato — riprova, e se ricapita segnala questo codice all''amministrazione.', coalesce(v_vincolo, 'vincolo non identificato');
end 
$fn$;
revoke all on function public.mag_carico_merce(text, boolean, jsonb) from public, anon;
grant execute on function public.mag_carico_merce(text, boolean, jsonb) to authenticated;
