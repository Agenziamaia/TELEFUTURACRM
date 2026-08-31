-- CERCARE UNA PRATICA DAL NUMERO DI TELEFONO (Luca 31/08: «ho provato a mettere
-- un numero di cellulare che non era il provvisorio ma il definitivo, quindi
-- c'era una portabilità, e non mi ha trovato la pratica»).
--
-- Il filtro guardava solo `clients.cellulare`, cioè il numero in anagrafica.
-- Ma il numero che il cliente ti dà al telefono, in una portabilità, è quello
-- DEFINITIVO — che vive nei dettagli della pratica, insieme al provvisorio e
-- a una ventina di altri campi (fisso, convergenza, cambio SIM, GNP…).
--
-- Il problema tecnico: i numeri stanno su DUE tabelle — anagrafica e dettagli
-- del contratto — e PostgREST non sa mettere in OR una condizione su una
-- tabella agganciata con una sulla tabella principale (è la stessa trappola
-- della segnalazione 36: legge «clients» come colonna e risponde PGRST100).
-- La via pulita è una COLONNA CALCOLATA: una funzione che prende la riga del
-- contratto e restituisce tutti i suoi numeri in una stringa sola. PostgREST
-- la espone come se fosse una colonna vera e ci si può filtrare sopra.
--
-- I campi NON sono un elenco fisso: si prende ogni valore dei dettagli la cui
-- CHIAVE parla di numeri e che contenga almeno sei cifre. Così un campo nuovo
-- su una scheda nuova è già cercabile, senza tornare qui. Il vincolo delle sei
-- cifre tiene fuori le risposte «Sì» di MNP e i nomi degli operatori; le
-- chiavi tengono fuori IMEI, ICCID e importi.
-- Misurato sui dati veri: 20 chiavi, 2.717 valori, zero falsi positivi.
--
-- Le cifre si isolano da entrambe le parti: qui i separatori diventano spazi,
-- nel CRM si toglie tutto ciò che non è cifra da quello che si digita. Così
-- «333 123 4567», «+39 3331234567» e «333-123-4567» trovano la stessa pratica.
-- Lo spazio fra un numero e l'altro impedisce che una ricerca scavalchi il
-- confine fra due numeri diversi.
--
-- Diritti: la funzione NON è security definer. Il pezzo che legge l'anagrafica
-- passa dalle stesse regole del resto — chi non può vedere quel cliente non se
-- lo ritrova cercabile da qui.

create or replace function public.numeri_telefono(c public.contracts) returns text
language sql stable as $$
  select regexp_replace(
    concat_ws(' ',
      (select concat_ws(' ', cl.cellulare, cl.telefono_fisso)
         from public.clients cl where cl.id = c.client_id),
      (select string_agg(d.value, ' ')
         from jsonb_each_text(coalesce(c.dettagli, '{}'::jsonb)) d
        where d.key ~* '(num|cell|tel|mnp|linea|gnp|msisdn|fisso|portab)'
          and d.value ~ '[0-9]{6,}')
    ), '[^0-9]+', ' ', 'g');
$$;

comment on function public.numeri_telefono(public.contracts) is
  'Colonna calcolata: tutti i numeri di telefono della pratica (anagrafica + dettagli), sole cifre separate da spazi. Serve al filtro «numero» di Ricerca vendite.';

grant execute on function public.numeri_telefono(public.contracts) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
