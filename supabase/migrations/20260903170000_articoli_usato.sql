-- ═══════════════════════════════════════════════════════════════════════════
-- L'USATO NON È MERCE DI MAGAZZINO, E ADESSO LO DICE L'ANAGRAFICA — 03/09/2026
--
-- Luca, guardando la ricerca del carico: «attenzione che tra gli articoli
-- compaiono anche gli usati, non avevamo detto di averli tolti? Fanno
-- confusione, l'usato vive in un'altra sezione».
--
-- Ha ragione, ed è una regola che c'è già dal 02/09: un usato è un bene in
-- regime del margine con una sua timeline (acquisto → laboratorio → vendita)
-- e un suo malus tecnico. Vive in Gestione Usati. Due registri per lo stesso
-- oggetto vuol dire due verità che divergono.
--
-- IL PROBLEMA È CHE LA REGOLA ERA SCRITTA IN TRE POSTI DIVERSI: l'import la
-- applicava sui suoi file (`Iva A. = ART.36`, `Gruppo = USATO`, codici
-- `RITUSATO*`), le famiglie della schermata Articoli ne usavano una versione
-- più corta (gruppo + codice), e la ricerca del carico non ne applicava
-- nessuna — quindi su 17.083 articoli attivi ne offriva 3.237 che non si
-- possono caricare per definizione: uno su cinque.
--
-- QUI DIVENTA UNA COLONNA SOLA, calcolata dal database. Chi deve escludere
-- l'usato scrive `usato = false` e non deve più ricordarsi quali sono i tre
-- indizi — che è la stessa lezione delle dieci regole diverse per dire
-- «stesso negozio».
--
-- I TRE INDIZI, misurati sui dati veri (03/09):
--   · `gruppo = USATO`            3.221
--   · codice `RITUSATO…`          3.038   (il RITiro dell'USATO)
--   · reparto 7 / `ART.36`          315   (regime del margine)
-- Insieme fanno 3.237, e l'unione conta: otto articoli hanno SOLO il reparto
-- («MAC M1», «I PAD 6A GEN», «TCL306»…) e tre hanno solo il gruppo («I PHONE
-- XR 128», due «KM0IPHONE-16» — questi col reparto 2, che è un errore di
-- anagrafica ma usati restano).
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.mag_articoli
  add column if not exists usato boolean
  generated always as (
    lower(coalesce(gruppo, '')) = 'usato'
    or lower(coalesce(codice, '')) like 'ritusato%'
    or reparto = 7
    or upper(coalesce(iva_acquisto, '')) = 'ART.36'
  ) stored;

comment on column public.mag_articoli.usato is
  'Calcolata: gruppo USATO, codice RITUSATO*, reparto 7 o IVA ART.36. Un usato non entra mai a magazzino — vive in Gestione Usati (regola Luca 02/09).';

create index if not exists mag_articoli_usato on public.mag_articoli (usato) where not usato;

-- ── E LA PORTA DEL CARICO LO RIFIUTA, non solo la ricerca ──────────────────
-- Nascondere l'usato dalla tendina non basta: la RPC è chiamabile lo stesso e
-- un codice si può incollare. Un usato caricato a magazzino è lo stesso
-- telefono in due registri, con due giacenze che si scaricano da sole.
--
-- NON metto un divieto generale su `mag_movimenti`: dieci pezzi usati hanno
-- GIÀ una giacenza (sfuggiti al filtro dell'import del 02/09), e un divieto
-- secco impedirebbe anche di correggerli. Si chiude la porta nuova, non le
-- vecchie che servono a riparare.
create or replace function public.mag_carico_no_usato(p_righe jsonb)
returns void
language plpgsql stable security definer set search_path = public as $$
declare v_scontro text;
begin
  select string_agg(format('%s (%s)', a.descrizione, a.codice), ', ') into v_scontro
    from (select distinct btrim(x->>'codice') c from jsonb_array_elements(p_righe) x) r
    join mag_articoli a on a.codice = r.c
   where a.usato;
  if v_scontro is not null then
    raise exception 'l''usato non entra a magazzino: % — vive in Gestione Usati', v_scontro;
  end if;
end $$;

revoke all on function public.mag_carico_no_usato(jsonb) from public, anon, authenticated;


-- ── L'ARTICOLO NUOVO HA DUE CODICI, E NON PUÒ NASCERE USATO ────────────────
-- Luca, guardando la scheda: «la creazione dell'articolo è sbagliata, perché
-- in realtà quando crei un articolo i codici sono DUE e poi c'è la
-- descrizione — vatti a vedere come è composto un articolo importato da Suite
-- Mobile rispetto a un telefono».
--
-- Guardato. Un telefono del listino: codice interno `0TSAGAA5OU7127`, codice
-- a barre `8032325398960`, e poi «Samsung Galaxy A57 5G 256GB Awesome Gray».
-- Il 77% del listino generale ha tutti e due i codici. Chiederne uno solo
-- vuol dire un articolo che al banco, col lettore, non si trova.
--
-- E IL CODICE A BARRE DEV'ESSERE SUO: se è già di un altro articolo, il
-- lettore pescherebbe quello sbagliato — che in cassa vuol dire vendere una
-- cosa e scaricarne un'altra.
create or replace function public.mag_crea_articolo(
  p_codice text, p_descrizione text, p_reparto smallint,
  p_ha_imei boolean default false, p_costo numeric default null,
  p_prezzo numeric default null, p_barcode text default null,
  p_marca text default null, p_gruppo text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_chi record; v_cod text; v_gia text; v_bar text;
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
  /* IL REPARTO DELL'USATO NON SI CREA DA QUI: un articolo in regime del
     margine è un usato, e l'usato vive in Gestione Usati. */
  if p_reparto = 7 then
    raise exception 'il reparto 7 è il regime del margine, cioè l''usato: quello si registra in Gestione Usati, non a magazzino';
  end if;
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

  /* IL SECONDO CODICE. Un articolo vero ne ha due: quello interno
     (`0TSAGAA5OU7127`) e il codice a barre (`8032325398960`) — 77% del listino
     generale ce l'ha. Se è già di un altro articolo, il lettore al banco
     pescherebbe quello sbagliato. */
  v_bar := nullif(btrim(coalesce(p_barcode, '')), '');
  if v_bar is not null then
    select codice into v_gia from mag_articoli where barcode = v_bar limit 1;
    if v_gia is not null then
      raise exception 'il codice a barre % è già di «%»: col lettore uscirebbe quello', v_bar, v_gia;
    end if;
  end if;

  insert into mag_articoli (codice, descrizione, reparto, ha_imei, costo_ultimo, prezzo,
                            barcode, marca, gruppo, attivo, fonte)
  values (v_cod, btrim(p_descrizione), p_reparto, coalesce(p_ha_imei, false),
          p_costo, p_prezzo, v_bar,
          nullif(btrim(coalesce(p_marca, '')), ''), nullif(btrim(coalesce(p_gruppo, '')), ''),
          true, 'carico merce · ' || v_chi.nome);

  return jsonb_build_object('codice', v_cod, 'descrizione', btrim(p_descrizione),
                            'reparto', p_reparto, 'ha_imei', coalesce(p_ha_imei, false),
                            'costo_ultimo', p_costo, 'prezzo', p_prezzo, 'barcode', v_bar);
end $$;

revoke all on function public.mag_crea_articolo(text, text, smallint, boolean, numeric, numeric, text, text, text) from public, anon;
grant execute on function public.mag_crea_articolo(text, text, smallint, boolean, numeric, numeric, text, text, text) to authenticated;
