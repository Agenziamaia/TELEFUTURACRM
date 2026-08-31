-- LE ASSEGNATE GIÀ CHIAMATE VANNO NEL CALDERONE DELLE «DA ESITARE»
-- (Luca 31/08: «se rimane assegnato dopo aver fatto una chiamata, di fatto
-- deve andare a finire dentro il calderone di quelle da esitare»).
--
-- Come ci sono finite: fino a oggi il motore delle chiamate faceva avanzare a
-- «Cold NR1» solo le pratiche in «Nuovo». «Assegnata» non era nella regola,
-- quindi una lead assegnata restava lì anche dopo un tentativo a vuoto — e
-- dall'elenco sembrava non lavorata. Da adesso «Assegnata» vale come «Nuovo»
-- (webhook Aircall), ma le 57 che hanno già una chiamata alle spalle non le
-- ri-esito io: le marco «da esitare», così tornano davanti al caller che le
-- ha chiamate e che sa com'è andata. Lo stato non lo tocca nessun automatismo.

update calls c
   set da_esitare = true
 where c.stato = 'Assegnata'
   and c.da_esitare is not true
   and exists (select 1 from jsonb_array_elements(c.storico) s
                where s->>'campo' = 'Chiamata Aircall');
