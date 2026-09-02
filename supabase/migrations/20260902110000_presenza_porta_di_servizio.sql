-- ═══ L'APPROVAZIONE AVEVA IL CANCELLO SUL RETRO APERTO ═══════════════════
-- Trovato dal ricognitore il 02/09. La richiesta di lavorare in un altro
-- punto vendita passa dal server (`/api/turni/presenza`, chiave di servizio),
-- che decide se la riga nasce «attiva» o «in_attesa». Ma `authenticated`
-- aveva l'INSERT libero sulla tabella e la politica controllava soltanto che
-- `user_id` fosse il proprio: dalla console del browser bastava scrivere
-- direttamente una riga `stato = 'attiva'` per la sede che si voleva, e
-- l'autorizzazione era saltata. La funzione che lo fa esisteva già ed era
-- ancora viva nel codice (`dichiaraPresenza`, senza più chiamanti).
--
-- Ora dal browser non si scrive più: la presenza la crea solo il server.
-- Restano la lettura della propria riga e quella della direzione.
revoke insert on public.presenza_negozio from authenticated;
revoke insert on public.presenza_negozio from anon;

drop policy if exists tf_presenza_mia on public.presenza_negozio;
create policy tf_presenza_mia_leggo on public.presenza_negozio
    for select to authenticated using (user_id = public.tf_uid());
