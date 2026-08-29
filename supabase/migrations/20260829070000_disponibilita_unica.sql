-- ═══════════════════════════════════════════════════════════════════════════
-- IL MAGAZZINO È UNO SOLO (Luca 29/08, segnalazione di Francesco)
--
-- «Il magazzino è l'unica fonte, è l'unica sezione dove vive veramente il
--  magazzino, dove c'è tutto e dove si movimenta la merce. Poi Registra
--  Vendita attinge a quello in termini di database.»
--
-- Ha ragione, e c'era una crepa: il magazzino tiene la merce in DUE forme,
-- che fin qui non si parlavano.
--     · mag_unita     — il pezzo con un seriale: un telefono, un modem.
--                       Una riga per pezzo, perché ogni pezzo è diverso.
--     · mag_giacenze  — la quantità: venti cover uguali sono un numero, non
--                       venti righe.
-- La sezione Magazzino sa leggere solo la prima; la cassa leggeva solo la
-- seconda. Due mezzi magazzini che si ignoravano.
--
-- Questa vista è LA disponibilità: chi vuole sapere «quanti ne ho» chiede a
-- lei e basta, senza sapere in che forma sono tenuti.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.mag_disponibilita as
  select codice, negozio, azienda,
         sum(quantita)                                   as quantita,
         sum(case when forma='serializzato' then quantita else 0 end) as pezzi_con_seriale,
         sum(case when forma='quantita'     then quantita else 0 end) as pezzi_a_quantita
    from (
      -- le quantità: accessori, materiale di consumo
      select g.codice, g.negozio, g.azienda, g.quantita, 'quantita' as forma
        from public.mag_giacenze g
      union all
      -- i pezzi con un seriale, contati: solo quelli ancora in casa
      select u.codice, u.negozio, coalesce(u.azienda,'T1') as azienda,
             count(*)::numeric, 'serializzato' as forma
        from public.mag_unita u
       where u.codice is not null
         and u.stato in ('disponibile','in_arrivo')
       group by u.codice, u.negozio, coalesce(u.azienda,'T1')
    ) t
   group by codice, negozio, azienda;

notify pgrst, 'reload schema';
