-- ═══════════════════════════════════════════════════════════════════════════
-- IL CARICO MERCE DIVENTA UN GESTO SOLO — 03/09/2026
--
-- La revisione ostile del carico appena consegnato ha trovato tre cose che
-- non si possono lasciare in piedi, e tutte e tre nascono dallo stesso posto:
-- il carico lo faceva il BROWSER, con quattro o cinque scritture separate.
--
--  ① LA MERCE SERIALIZZATA SPARIVA nel percorso «il negozio deve accettarla»
--     — che è quello acceso di default. Il browser scriveva UNA riga di
--     documento per articolo, con dentro tutti gli IMEI separati da virgola.
--     Ma tutta la macchina dei trasferimenti è costruita sull'invariante
--     opposto: `seriale` valorizzato ⇒ UN pezzo ⇒ `unita_id` valorizzato
--     (`pezziDi()` in trasferimenti.ts torna 1 appena vede un seriale).
--     All'accettazione, cinque telefoni contavano UNO, i pezzi non nascevano
--     in `mag_unita`, e il documento si chiudeva «accettato» senza un avviso.
--     Cinque iPhone = 4.500 € che non esistono più da nessuna parte. E il DDT
--     stampato diceva «totale beni 1» elencando cinque IMEI: un documento che
--     descrive merce diversa da quella nel pacco è un documento falso.
--
--  ② NESSUNA TRANSAZIONE. Cinque scritture in fila, `throw` alla prima che
--     va male, niente che torni indietro. Due degli stati raggiungibili non
--     avevano via d'uscita: un documento fantasma senza righe che resta «in
--     transito» per sempre bruciando un numero di protocollo, e — se la
--     seconda società falliva dopo la prima — un riprova che raddoppiava le
--     quantità della prima. Qui dentro, invece, o entra tutto o non entra
--     niente: una funzione è una transazione.
--
--  ③ IL PERMESSO ERA SOLO UN BOTTONE NASCOSTO. «Il carico lo possono fare
--     solo dall'amministrazione in su» (Luca, 03/09) valeva lato schermo;
--     dal database chiunque fosse loggato poteva scrivere pezzi e documenti
--     di qualunque negozio. Il ruolo adesso si legge QUI, da `app_users`, con
--     l'id della sessione firmata: dal browser non si può mentire su chi si è.
--
-- E due controlli che prima non c'erano affatto:
--  · LA SOCIETÀ DEVE AVERE UNA CASSA IN QUEL NEGOZIO. Caricare merce T1 a
--    Garbatella (che ha solo T2) è merce che alla vendita esce dallo
--    scontrino in silenzio — `scontrino/route.ts` scarta la riga con «non ha
--    un registratore in questo negozio». Meglio fermarla adesso.
--  · I SERIALI VIVI, con la stessa regola dell'indice unico: un telefono
--    venduto o annullato SI PUÒ ricaricare (un reso esiste), uno che è già a
--    scaffale no.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── CHI PUÒ TOCCARE IL MAGAZZINO ───────────────────────────────────────────
-- Lo specchio di `isAdminOrAbove()` in roles.ts. Sta in una funzione sola
-- perché le due RPC qui sotto devono rispondere la stessa cosa, sempre.
create or replace function public.mag_chi_carica()
returns table(uid uuid, nome text, ruolo text)
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid; v_nome text; v_ruolo text; v_attivo boolean;
begin
  v_uid := tf_uid();
  if v_uid is null then
    raise exception 'sessione non riconosciuta: rientra nel gestionale';
  end if;
  select full_name, role, coalesce(active, true) into v_nome, v_ruolo, v_attivo
    from app_users where id = v_uid;
  if v_ruolo is null or v_attivo is false then
    raise exception 'utente non attivo';
  end if;
  if v_ruolo not in ('amministrativo', 'direttore_generale', 'admin', 'dev') then
    raise exception 'il carico merce lo fa l''amministrazione: il tuo ruolo (%) non ci arriva', v_ruolo;
  end if;
  return query select v_uid, coalesce(v_nome, 'sconosciuto'), v_ruolo;
end $$;

revoke all on function public.mag_chi_carica() from public, anon, authenticated;

-- ═══ CREARE UN ARTICOLO SENZA USCIRE DAL CARICO ════════════════════════════
-- Luca: «se un articolo non esiste e non lo trova nella lista, gli chiede: lo
-- vuoi creare? E procede alla creazione come se il flusso partisse da lì».
-- Dal browser non si poteva: su `mag_articoli` `authenticated` ha SELECT e
-- basta, quindi la chiamata falliva SEMPRE, per chiunque, admin compreso.
--
-- IL REPARTO È OBBLIGATORIO, e non è pignoleria: un articolo senza reparto
-- IVA, quando lo si vende, ESCE DALLO SCONTRINO — `scontrino/route.ts` lo
-- scarta con «reparto IVA non assegnato». Merce venduta, riga assente.
--
-- E IL CODICE SI CONFRONTA SENZA GUARDARE LE MAIUSCOLE: in anagrafica ci sono
-- 909 codici minuscoli su 17.083. Chi ricrea a mano `cca12` come `CCA12` si
-- ritrova due articoli per lo stesso prodotto, con due giacenze separate.
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

-- ═══ IL CARICO ════════════════════════════════════════════════════════════
-- p_righe: [{codice, descrizione, azienda, quantita, seriali[], tipo_seriale,
--            costo}]
-- Le righe con `seriali` non vuoto sono merce che si conta uno per uno; le
-- altre si contano a quantità. Una riga non può essere tutte e due le cose.
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
  v_seriali    text[] := '{}';
  v_scontro    text;
  v_nota       text;
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

  -- ── LE SOCIETÀ CHE HANNO UNA CASSA QUI ─────────────────────────────────
  -- L'ufficio non vende: lì entra la merce di tutte e due. In un negozio no:
  -- la merce di una società senza registratore, alla vendita, esce dallo
  -- scontrino in silenzio.
  select array_agg(distinct azienda) into v_casse from pos_rt where negozio = p_negozio;
  select array_agg(distinct btrim(x->>'azienda')) into v_aziende
    from jsonb_array_elements(p_righe) x;
  if array_position(v_aziende, null) is not null or array_position(v_aziende, '') is not null then
    raise exception 'ogni riga deve dire di quale società è la merce';
  end if;
  if not v_in_ufficio and v_casse is not null then
    select string_agg(a, ', ') into v_scontro
      from unnest(v_aziende) a where not (a = any(v_casse));
    if v_scontro is not null then
      raise exception 'a % non c''è una cassa di %: quella merce, quando la vendi, non uscirebbe sullo scontrino', p_negozio, v_scontro;
    end if;
  end if;

  -- ── I SERIALI ──────────────────────────────────────────────────────────
  select array_agg(s) into v_seriali
    from jsonb_array_elements(p_righe) x,
         lateral jsonb_array_elements_text(coalesce(x->'seriali', '[]'::jsonb)) s;
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
  -- Un documento di trasporto ha un solo mittente fiscale. Non è una
  -- complicazione nostra: è la stessa regola dei trasferimenti.
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

      if jsonb_array_length(coalesce(v_r->'seriali', '[]'::jsonb)) > 0 then
        -- ══ MERCE CHE SI CONTA UNO PER UNO ══════════════════════════════
        -- UN PEZZO, UNA RIGA DI DOCUMENTO, col suo `unita_id`. È l'invariante
        -- su cui è costruito tutto il resto: l'accettazione, la stampa del
        -- DDT, l'export, la tabella «in viaggio».
        --
        -- E IL PEZZO NASCE SUBITO, anche quando deve essere accettato: nasce
        -- `in_transito` e col negozio di DESTINAZIONE già addosso, che è la
        -- convenzione della casa (un pezzo in viaggio porta già dove sta
        -- andando). Non è vendibile — `cassa_seriali` guarda `disponibile` —
        -- e all'accettazione `prendiInCarico` lo trova, lo mette a scaffale e
        -- gli azzera il documento. Se invece il negozio lo rifiuta,
        -- `rimandaIndietro` lo riporta in ufficio: la merce torna dov'era
        -- partita, che è esattamente quello che deve succedere.
        v_stato_u := case when p_con_accettazione then 'in_transito' else 'disponibile' end;
        for v_ser in select btrim(s) from jsonb_array_elements_text(v_r->'seriali') s
                      where btrim(s) <> '' loop
          insert into mag_unita (seriale, tipo_seriale, codice, descrizione, azienda,
                                 negozio, stato, valore, caricato_da, ddt_id, storia)
          values (v_ser,
                  coalesce(nullif(btrim(coalesce(v_r->>'tipo_seriale', '')), ''), 'imei'),
                  nullif(btrim(coalesce(v_r->>'codice', '')), ''),
                  coalesce(nullif(btrim(coalesce(v_r->>'descrizione', '')), ''), 'ARTICOLO'),
                  v_az, p_negozio, v_stato_u,
                  nullif(v_r->>'costo', '')::numeric, v_chi.nome,
                  case when p_con_accettazione then v_ddt_id else null end,
                  jsonb_build_array(jsonb_build_object(
                    'quando', v_quando, 'evento', 'carico', 'negozio', p_negozio,
                    'operatore', v_chi.nome, 'note', v_nota)))
          returning id into v_unita_id;

          if not v_in_ufficio then
            v_riga := v_riga + 1;
            insert into mag_ddt_righe (ddt_id, riga, codice, descrizione, unita_id, seriale,
                                       quantita, quantita_accettata, valore_unitario,
                                       negozio_da, negozio_a, azienda_da, azienda_a, stato,
                                       chiusa_il, chiusa_da)
            values (v_ddt_id, v_riga, nullif(btrim(coalesce(v_r->>'codice', '')), ''),
                    coalesce(nullif(btrim(coalesce(v_r->>'descrizione', '')), ''), 'ARTICOLO'),
                    v_unita_id, v_ser, 1,
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
        v_pezzi := coalesce(nullif(v_r->>'quantita', '')::numeric, 0);
        if v_pezzi <= 0 then
          raise exception '«%»: quanti pezzi?', coalesce(v_r->>'descrizione', v_r->>'codice');
        end if;
        if nullif(btrim(coalesce(v_r->>'codice', '')), '') is null then
          raise exception 'la merce a quantità vuole il codice articolo';
        end if;

        if not v_in_ufficio then
          v_riga := v_riga + 1;
          insert into mag_ddt_righe (ddt_id, riga, codice, descrizione, unita_id, seriale,
                                     quantita, quantita_accettata, valore_unitario,
                                     negozio_da, negozio_a, azienda_da, azienda_a, stato,
                                     chiusa_il, chiusa_da)
          values (v_ddt_id, v_riga, btrim(v_r->>'codice'),
                  coalesce(nullif(btrim(coalesce(v_r->>'descrizione', '')), ''), 'ARTICOLO'),
                  null, null, v_pezzi,
                  case when p_con_accettazione then null else v_pezzi end,
                  nullif(v_r->>'costo', '')::numeric,
                  v_ufficio, p_negozio, v_az, v_az,
                  case when p_con_accettazione then 'in_viaggio' else 'accettata' end,
                  case when p_con_accettazione then null else v_quando end,
                  case when p_con_accettazione then null else v_chi.nome end);
        end if;

        -- LA QUANTITÀ ENTRA SOLO SE È GIÀ ARRIVATA. Col flag
        -- dell'accettazione la scrive `prendiInCarico` quando il negozio la
        -- prende in carico: caricarla adesso vorrebbe dire averla a scaffale
        -- prima che qualcuno l'abbia vista.
        if not p_con_accettazione then
          insert into mag_movimenti (codice, negozio, azienda, tipo, quantita,
                                     costo_unitario, operatore, ddt_id, nota)
          values (btrim(v_r->>'codice'), p_negozio, v_az, 'carico', v_pezzi,
                  nullif(v_r->>'costo', '')::numeric, v_chi.nome, v_ddt_id, v_nota);
        end if;
        v_tot := v_tot + v_pezzi;
      end if;
    end loop;

    -- IL DOCUMENTO SENZA RIGHE NON DEVE NASCERE: resterebbe «in transito»
    -- per sempre — `prendiInCarico` lo rifiuta — bruciando un numero di
    -- protocollo. Se succede, è un errore nostro, e si annulla tutto.
    if not v_in_ufficio and v_riga = 0 then
      raise exception 'il documento di % sarebbe nato senza righe: carico annullato', v_az;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'pezzi', v_tot, 'documenti', v_docs,
                            'negozio', p_negozio, 'accettazione', p_con_accettazione);
end $$;

revoke all on function public.mag_carico_merce(text, boolean, jsonb) from public, anon;
grant execute on function public.mag_carico_merce(text, boolean, jsonb) to authenticated;
