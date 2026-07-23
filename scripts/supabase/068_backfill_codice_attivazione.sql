-- 068: recupera il codice attivazione dei contratti gia' inseriti.
--
-- Segnalazione 39 (NON RISOLTO, commento "I prodotti mobile windtre non mostrano
-- codice contratto"): la correzione vale per i contratti nuovi — quelli di oggi
-- riportano il codice — ma le righe salvate prima erano rimaste con "—", perche'
-- il codice veniva cercato solo con la chiave di Sky ("Codice Contratto").
--
-- Il dato non e' perduto: sta dentro `dettagli`, con il nome del campo di
-- origine. Qui viene recuperato con lo stesso ordine di ricerca usato dal
-- modulo di registrazione.
--
-- Vodafone e' escluso di proposito: non rilascia un codice contratto e non va
-- inventato (indicazione di Francesco).

update public.contracts
set codice_attivazione = coalesce(
      nullif(btrim(dettagli->>'Codice Contratto'), ''),
      nullif(btrim(dettagli->>'codice_contratto'), ''),
      nullif(btrim(dettagli->>'Cod. Contratto'), ''),
      nullif(btrim(dettagli->>'Cod.Cliente CB'), ''),
      nullif(btrim(dettagli->>'Cod. Contratto CB'), ''),
      nullif(btrim(dettagli->>'Cod.Cliente Cambio'), ''),
      nullif(btrim(dettagli->>'Codice Proposta'), ''),
      nullif(btrim(dettagli->>'Codice Ordine'), '')
    )
where lower(coalesce(brand, '')) <> 'vodafone'
  and coalesce(btrim(codice_attivazione), '') in ('', '—', '-')
  and dettagli is not null
  and coalesce(
      nullif(btrim(dettagli->>'Codice Contratto'), ''),
      nullif(btrim(dettagli->>'codice_contratto'), ''),
      nullif(btrim(dettagli->>'Cod. Contratto'), ''),
      nullif(btrim(dettagli->>'Cod.Cliente CB'), ''),
      nullif(btrim(dettagli->>'Cod. Contratto CB'), ''),
      nullif(btrim(dettagli->>'Cod.Cliente Cambio'), ''),
      nullif(btrim(dettagli->>'Codice Proposta'), ''),
      nullif(btrim(dettagli->>'Codice Ordine'), '')
    ) is not null;

notify pgrst, 'reload schema';
