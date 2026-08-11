-- ESITI ALLINEATI calendario ↔ caller (fix 10/08, caso Greco / 41 "Attivato
-- Anomalia"). Due cose:
--
-- 1) CENSIMENTO opzioni caller: "Attivato" e "Attivato Altro Negozio" sono
--    scritte dal match vendita (matchAppuntamento.ts) ma NON esistevano in
--    caller_opzioni → badge grigi e non filtrabili. "Attivato Anomalia" era
--    stata aggiunta a mano dal pannello. Le censiamo tutte (idempotente).
--
-- 2) RICONCILIAZIONE una-tantum: le pratiche il cui appuntamento risulta
--    attivato/attivato_diverso_negozio ma che sono rimaste su un altro stato
--    (es. "1° Appuntamento" o "Attivato Anomalia") passano ad "Attivato"/
--    "Attivato Altro Negozio" CON voce di storico. Da ora il sync live del
--    calendario impedisce che la forbice si riapra.

-- ── 1) censimento opzioni stato ──
INSERT INTO public.caller_opzioni (categoria, voce, ordine)
SELECT 'stato', v.voce, 900 + v.ord
FROM (VALUES ('Attivato', 1), ('Attivato Altro Negozio', 2), ('Attivato Anomalia', 3)) AS v(voce, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM public.caller_opzioni k WHERE k.categoria = 'stato' AND k.voce = v.voce);

-- ── 2) riconciliazione pratiche ↔ appuntamenti attivati ──
UPDATE public.calls c
SET stato = CASE WHEN a.status = 'attivato_diverso_negozio' THEN 'Attivato Altro Negozio' ELSE 'Attivato' END,
    storico = COALESCE(c.storico, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'data', now(),
      'caller', 'Sistema (riconciliazione esiti 10/08)',
      'campo', 'Stato',
      'da', c.stato,
      'a', CASE WHEN a.status = 'attivato_diverso_negozio' THEN 'Attivato Altro Negozio' ELSE 'Attivato' END,
      'dettagli', jsonb_build_object('origine', 'riconciliazione: appuntamento attivato sul calendario')
    ))
FROM public.appointments a
WHERE c.appointment_id IS NOT NULL
  AND a.id = c.appointment_id
  AND a.status IN ('attivato', 'attivato_diverso_negozio')
  AND COALESCE(c.stato, '') NOT IN ('Attivato', 'Attivato Altro Negozio');

NOTIFY pgrst, 'reload schema';
