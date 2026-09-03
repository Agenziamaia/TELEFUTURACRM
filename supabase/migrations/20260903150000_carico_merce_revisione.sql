-- ═══════════════════════════════════════════════════════════════════════════
-- QUELLO CHE LA REVISIONE OSTILE HA TROVATO NEL CARICO — 03/09/2026, pomeriggio
--
-- Il carico atomico di stamattina regge dove doveva reggere (la transazione,
-- i permessi della RPC, il giro completo fino alla vendita), ma un revisore
-- indipendente l'ha preso a martellate e ha trovato sette cose vere. Sono
-- quasi tutte della stessa famiglia: **quello che entra dalla porta non è
-- controllato abbastanza**, e quando qualcosa va storto l'operatore vede un
-- messaggio scritto per un programmatore.
--
--  ① GLI SPAZI INTORNO AL SERIALE. Il controllo dei doppioni leggeva i
--     seriali GREZZI, l'INSERT li scriveva ripuliti. Un « 350069708113411 »
--     incollato da un foglio passava il controllo e schiantava sull'indice:
--     a schermo compariva, in inglese, `duplicate key value violates unique
--     constraint "mag_unita_seriale_viva"` — senza dire QUALE seriale.
--  ② LE RIGHE CHE SPARIVANO IN SILENZIO. `quantita: 2.7` entrava a magazzino
--     come 2,7 pezzi. Una riga con i seriali tutti vuoti veniva ignorata e il
--     carico diceva «ok» con un pezzo in meno di quelli chiesti. Una riga con
--     seriali E quantità caricava i seriali e buttava via la quantità: il
--     commento diceva «una riga non può essere tutte e due le cose», il
--     codice non lo controllava.
--  ③ LA SOCIETÀ INVENTATA. In ufficio la società non era controllata affatto:
--     `azienda: "T9"` faceva nascere pezzi di una società che non esiste, che
--     il giorno che si vendono escono dallo scontrino in silenzio. E il
--     controllo della cassa saltava del tutto per un magazzino senza
--     registratore (il Laboratorio).
--  ④ L'ANAGRAFICA NON IMPARAVA. Il carico correggeva `ha_imei` con un UPDATE
--     dal browser, contro la stessa tabella che tre righe sopra dichiaravo
--     non scrivibile dal browser. Falliva sempre, in silenzio: chi correggeva
--     «uno per uno» lo ricorreggeva ogni volta, per sempre. Adesso lo scrive
--     la RPC, che il permesso ce l'ha.
--  ⑤ LA STORIA DEL PEZZO RACCONTAVA IL FALSO. Il trigger, su INSERT, scriveva
--     sempre `documento = 'import'` e nessun id. Un telefono caricato oggi
--     diceva «entrato a magazzino — Mazzini» mentre stava ancora viaggiando,
--     e il bottone «apri il documento di trasporto» non compariva mai. Il
--     viaggio Ufficio → Mazzini, nella storia del pezzo, non esisteva.
--  ⑥ IL PREZZO DELL'ARTICOLO NUOVO. La rotta che già crea articoli lo vuole
--     obbligatorio — Luca, 29/08: «senza, in cassa quell'articolo non si può
--     vendere» — e lo tiene fra 0 e 100.000 €. La mia RPC lo lasciava
--     facoltativo e accettava 999.999.999 €: ho chiuso il buco del reparto e
--     ne ho riaperto uno accanto. Due porte, una regola.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ⑤ LA STORIA DEL PEZZO DICE DA DOVE ARRIVA ──────────────────────────────
create or replace function public.mag_registra_evento()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
    ev text; da text; doc text; docid text; nota text;
begin
    if TG_OP = 'INSERT' then
        /* UN PEZZO CHE NASCE IN VIAGGIO NON È «ENTRATO A MAGAZZINO». Il carico
           merce fa nascere i pezzi già `in_transito`, col negozio di
           DESTINAZIONE addosso (convenzione della casa): senza questo ramo la
           storia diceva che il telefono era arrivato mentre stava ancora sul
           furgone, e il documento non si poteva aprire da lì.
           Il mittente lo si chiede al documento, che è l'unico a saperlo. */
        if new.ddt_id is not null then
            select da_negozio into da from mag_ddt where id = new.ddt_id;
        end if;
        insert into mag_eventi (seriale, unita_id, quando, evento, negozio, negozio_da,
                                azienda, operatore, documento, documento_id, note)
        values (new.seriale, new.id, coalesce(new.caricato_il, now()),
                case when new.stato = 'in_transito' then 'trasferimento_inviato' else 'carico' end,
                new.negozio, da, new.azienda, new.caricato_da,
                case when new.ddt_id is not null then 'ddt' else 'import' end,
                new.ddt_id::text,
                case when new.stato = 'in_transito' then 'partito con un DDT'
                     when new.ddt_id is not null then 'caricato con un DDT'
                     else 'entrato a magazzino' end);
        return new;
    end if;

    -- lo stato racconta quasi tutto
    if new.stato is distinct from old.stato then
        if new.stato = 'venduto' then
            ev := 'vendita'; doc := 'contratto'; docid := new.contract_id::text;
            nota := 'venduto';
        elsif new.stato = 'annullato' then
            ev := 'annullato'; nota := 'tolto dal magazzino';
        elsif new.stato = 'in_transito' then
            ev := 'trasferimento_inviato'; doc := 'ddt'; docid := new.ddt_id::text;
            da := old.negozio; nota := 'partito con un DDT';
        elsif old.stato = 'in_transito' and new.stato = 'disponibile' then
            ev := 'trasferimento_accettato'; doc := 'ddt'; docid := old.ddt_id::text;
            da := old.negozio; nota := 'accettato e messo a scaffale';
        else
            ev := 'correzione'; nota := old.stato || ' → ' || new.stato;
        end if;
    elsif new.negozio is distinct from old.negozio then
        ev := 'trasferimento_accettato'; da := old.negozio; doc := 'ddt';
        docid := coalesce(new.ddt_id, old.ddt_id)::text;
        nota := 'cambiato punto vendita';
    elsif new.azienda is distinct from old.azienda then
        ev := 'correzione'; nota := 'società: ' || coalesce(old.azienda,'—') || ' → ' || coalesce(new.azienda,'—');
    else
        return new;   -- niente che valga la pena raccontare
    end if;

    insert into mag_eventi (seriale, unita_id, evento, negozio, negozio_da, azienda, operatore, documento, documento_id, note)
    values (new.seriale, new.id, ev, new.negozio, da, new.azienda,
            coalesce(new.venduto_da, new.caricato_da), doc, nullif(docid,''), nota);
    return new;
end $$;

-- ── ⑥ L'ARTICOLO NUOVO SEGUE LE REGOLE DELLA PORTA ACCANTO ─────────────────
create or replace function public.mag_crea_articolo(
  p_codice text, p_descrizione text, p_reparto smallint,
  p_ha_imei boolean default false, p_costo numeric default null,
  p_prezzo numeric default null, p_barcode text default null,
  p_marca text default null, p_gruppo text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_chi record; v_cod text; v_gia text;
begin
  select * into v_chi from mag_chi_carica();

  v_cod := btrim(coalesce(p_codice, ''));
  if v_cod = '' then raise exception 'il codice non può essere vuoto'; end if;
  if btrim(coalesce(p_descrizione, '')) = '' then raise exception 'la descrizione non può essere vuota'; end if;
  if p_reparto is null or p_reparto < 1 or p_reparto > 40 then
    raise exception 'scegli il reparto IVA: senza, l''articolo non esce sullo scontrino quando lo vendi';
  end if;
  if not exists (select 1 from pos_reparti where reparto = p_reparto and attivo) then
    raise exception 'il reparto % non è fra quelli attivi', p_reparto;
  end if;

  /* IL PREZZO È OBBLIGATORIO come nella rotta che già crea articoli (Luca
     29/08: «senza, in cassa quell'articolo non si può vendere»). Due porte
     per la stessa cosa devono chiedere le stesse cose, se no la porta più
     larga diventa la scorciatoia per aggirare l'altra. */
  if p_prezzo is null then
    raise exception 'metti il prezzo: senza, in cassa quell''articolo non si può vendere';
  end if;
  if p_prezzo < 0 or p_prezzo > 100000 then
    raise exception 'il prezzo (% €) è fuori scala: dev''essere fra 0 e 100.000', p_prezzo;
  end if;
  if p_costo is not null and (p_costo < 0 or p_costo > 100000) then
    raise exception 'il costo (% €) è fuori scala: dev''essere fra 0 e 100.000', p_costo;
  end if;

  select codice into v_gia from mag_articoli where lower(codice) = lower(v_cod) limit 1;
  if v_gia is not null then
    raise exception 'il codice % esiste già in anagrafica (come «%»): cercalo invece di ricrearlo', v_cod, v_gia;
  end if;

  insert into mag_articoli (codice, descrizione, reparto, ha_imei, costo_ultimo, prezzo,
                            barcode, marca, gruppo, attivo, fonte)
  values (v_cod, btrim(p_descrizione), p_reparto, coalesce(p_ha_imei, false),
          p_costo, p_prezzo, nullif(btrim(coalesce(p_barcode, '')), ''),
          nullif(btrim(coalesce(p_marca, '')), ''), nullif(btrim(coalesce(p_gruppo, '')), ''),
          true, 'carico merce · ' || v_chi.nome);

  return jsonb_build_object('codice', v_cod, 'descrizione', btrim(p_descrizione),
                            'reparto', p_reparto, 'ha_imei', coalesce(p_ha_imei, false),
                            'costo_ultimo', p_costo, 'prezzo', p_prezzo);
end $$;

revoke all on function public.mag_crea_articolo(text, text, smallint, boolean, numeric, numeric, text, text, text) from public, anon;
grant execute on function public.mag_crea_articolo(text, text, smallint, boolean, numeric, numeric, text, text, text) to authenticated;

-- ── ① ② ③ ④ IL CARICO, CON LA PORTA STRETTA ───────────────────────────────
create or replace function public.mag_carico_merce(
  p_negozio text, p_con_accettazione boolean, p_righe jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
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
    select string_agg(s, ', ') into v_scontro from (
      select s from unnest(v_seriali) s group by s having count(*) > 1 limit 5) d;
    if v_scontro is not null then
      raise exception 'lo stesso seriale due volte nel carico: %', v_scontro;
    end if;
    -- La stessa regola dell'indice unico `mag_unita_seriale_viva`: un pezzo
    -- venduto o annullato si può ricaricare — un reso esiste — uno vivo no.
    select string_agg(seriale, ', ') into v_scontro from (
      select seriale from mag_unita
       where seriale = any(v_seriali) and stato not in ('venduto', 'annullato')
       limit 5) d;
    if v_scontro is not null then
      raise exception 'questi seriali sono già a magazzino: %', v_scontro;
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

/* ① IL MESSAGGIO CHE ARRIVA IN NEGOZIO È IN ITALIANO E DICE QUAL È.
   Fra il mio controllo e la scrittura c'è un istante, e in quell'istante un
   altro carico può aver preso lo stesso seriale: a quel punto parla
   l'indice, e parlava in inglese col nome di un vincolo. */
exception
  when unique_violation then
    select string_agg(seriale, ', ') into v_scontro from (
      select seriale from mag_unita
       where seriale = any(v_seriali) and stato not in ('venduto', 'annullato')
       limit 5) d;
    if v_scontro is not null then
      raise exception 'questi seriali risultano già a magazzino: %. Il carico non è partito.', v_scontro;
    end if;
    raise exception 'un pezzo di questo carico risulta già a magazzino. Il carico non è partito.';
end $$;

revoke all on function public.mag_carico_merce(text, boolean, jsonb) from public, anon;
grant execute on function public.mag_carico_merce(text, boolean, jsonb) to authenticated;
