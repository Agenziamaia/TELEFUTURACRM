-- ═══════════════════════════════════════════════════════════════════════════
-- UNA SOLA SCHERMATA PER CREARE UN ARTICOLO — 03/09/2026
--
-- Luca: «in creazione articoli qui non stiamo chiedendo il doppio codice…
-- devo poter mettere anche io due codici, il codice e la descrizione fra i due
-- devono essere quelli obbligatori, mentre il secondo codice è facoltativo…
-- lasciamo barcode al posto del codice EAN, ma mettimelo all'inizio…
-- allinea questa procedura a quella che c'è su giacenze: la procedura deve
-- essere esattamente la stessa».
--
-- C'erano DUE porte con due regole: la rotta `/api/magazzino/articoli` (usata
-- dagli Articoli) chiedeva descrizione e prezzo ma non il reparto e non
-- controllava il codice a barre; la RPC del carico chiedeva tutto. Adesso la
-- porta è una — questa — e la schermata pure. Cambia solo da DOVE arriva, e
-- quello si scrive, perché fra sei mesi «chi ha creato questo articolo e da
-- che parte» è una domanda che si fa.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.mag_crea_articolo(
  p_codice text, p_descrizione text, p_reparto smallint,
  p_ha_imei boolean default false, p_costo numeric default null,
  p_prezzo numeric default null, p_barcode text default null,
  p_marca text default null, p_gruppo text default null,
  p_origine text default 'carico merce')
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
  if p_reparto = 7 then
    raise exception 'il reparto 7 è il regime del margine, cioè l''usato: quello si registra in Gestione Usati, non a magazzino';
  end if;
  if p_prezzo is null then
    raise exception 'metti il prezzo di vendita: senza, in cassa quell''articolo non si può vendere';
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
          true, coalesce(nullif(btrim(p_origine), ''), 'CRM') || ' · ' || v_chi.nome);

  return jsonb_build_object('codice', v_cod, 'descrizione', btrim(p_descrizione),
                            'reparto', p_reparto, 'ha_imei', coalesce(p_ha_imei, false),
                            'costo_ultimo', p_costo, 'prezzo', p_prezzo, 'barcode', v_bar,
                            'marca', nullif(btrim(coalesce(p_marca, '')), ''));
end $$;

revoke all on function public.mag_crea_articolo(text, text, smallint, boolean, numeric, numeric, text, text, text, text) from public, anon;
grant execute on function public.mag_crea_articolo(text, text, smallint, boolean, numeric, numeric, text, text, text, text) to authenticated;

-- la vecchia, senza `p_origine`, va tolta: due funzioni con lo stesso nome e
-- un parametro di differenza sono il modo più veloce per chiamare quella
-- sbagliata senza accorgersene
drop function if exists public.mag_crea_articolo(text, text, smallint, boolean, numeric, numeric, text, text, text);
