-- 073: retroattivo — Extra/Sostituzione attivi, e recupero del codice inserimento.
--
-- Segnalazione 52: tutti i contratti brand Extra e i prodotti "Sostituzione SIM"
-- (WindTre, Vodafone, Fastweb) devono risultare Attivo e, nel Tracking,
-- Completato ("attivato"). Non sono pratiche da lavorare.
--
-- Segnalazione 70: il codice inserimento generico non veniva salvato in
-- dettagli sotto "Cod.Ins.". Dove esiste con un altro nome (Cod.Ins. CB,
-- Cod.Ins. Cambio, dcCodIns...) lo si copia su "Cod.Ins." per renderlo visibile.
-- Nota: dove il codice non e' MAI stato salvato (molti MOBILE WindTre) non e'
-- recuperabile — quei contratti vanno completati a mano.

-- 52a: brand Extra
update public.contracts
set stato = 'Attivo', stato_negozio = 'attivato'
where lower(coalesce(brand,'')) = 'extra'
  and (stato is distinct from 'Attivo' or stato_negozio is distinct from 'attivato');

-- 52b: prodotti Sostituzione SIM di qualsiasi brand
update public.contracts
set stato = 'Attivo', stato_negozio = 'attivato'
where (prodotto ilike '%sostituzione%' or prodotto ilike 'sost %')
  and (stato is distinct from 'Attivo' or stato_negozio is distinct from 'attivato');

-- 70: porta il codice inserimento su "Cod.Ins." dove esiste con altro nome
update public.contracts
set dettagli = jsonb_set(dettagli, '{Cod.Ins.}', to_jsonb(coalesce(
      nullif(btrim(dettagli->>'Cod.Ins. CB'), ''),
      nullif(btrim(dettagli->>'Cod.Ins. Cambio'), ''),
      nullif(btrim(dettagli->>'dcCodIns'), ''),
      nullif(btrim(dettagli->>'Cod.Ins. RF'), ''),
      nullif(btrim(dettagli->>'Cod.Ins. Add-on'), '')
    )))
where dettagli is not null
  and coalesce(btrim(dettagli->>'Cod.Ins.'), '') = ''
  and coalesce(
      nullif(btrim(dettagli->>'Cod.Ins. CB'), ''),
      nullif(btrim(dettagli->>'Cod.Ins. Cambio'), ''),
      nullif(btrim(dettagli->>'dcCodIns'), ''),
      nullif(btrim(dettagli->>'Cod.Ins. RF'), ''),
      nullif(btrim(dettagli->>'Cod.Ins. Add-on'), '')
    ) is not null;

notify pgrst, 'reload schema';
