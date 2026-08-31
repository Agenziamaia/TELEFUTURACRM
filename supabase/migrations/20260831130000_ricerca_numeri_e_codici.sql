-- Rifiniture ai due filtri di Ricerca vendite (revisione del 31/08).
--
-- ① I NUMERI DELLA PORTABILITÀ SCRITTI IN FORMA BREVE NON SI TROVAVANO.
--    La scheda di Registra vendita scrive «N. Provvisorio» e «N. Definitivo»
--    (Fastweb, Vodafone, Iliad, TIM, Very, ho., Kena…), e la chiave breve non
--    combaciava con nessuna delle parole cercate: 40 numeri su 37 pratiche
--    fuori dal pagliaio, e 21 pratiche senza NESSUN numero raggiungibile.
--    Cioè proprio il caso segnalato — «c'era una portabilità e non me l'ha
--    trovata» — restava rotto per metà degli operatori.
--    Aggiunte le forme brevi «N. Provvisorio»/«N. Definitivo», «recapito» e
--    «utenza»; escluso «seriale», che
--    con la parola «tel» dentro portava dentro i Seriali Telepass.
-- ② La soglia delle sei cifre si misurava sul valore GREZZO: un numero scritto
--    «333 123 4567» ha corse di sole 3-4 cifre e usciva dal conto. Ora si
--    misura sulle cifre, come è giusto.
--
-- ③ IL CODICE DELL'OPERATORE NON STA SOLO IN `codice_attivazione`: la scheda
--    lo scrive anche nei dettagli come «Codice Contratto» (1.223 pratiche),
--    e su 32 di queste è l'UNICO posto in cui esiste — invisibili alla
--    ricerca. Su Iliad la versione nei dettagli è pure più completa: in
--    `codice_attivazione` sta tagliata a 18 caratteri.
--    Stessa forma dei numeri: una colonna calcolata che raccoglie il codice
--    nostro, quello dell'operatore e ogni sua copia nei dettagli.

create or replace function public.numeri_telefono(c public.contracts) returns text
language sql stable as $$
  select regexp_replace(
    concat_ws(' ',
      (select concat_ws(' ', cl.cellulare, cl.telefono_fisso)
         from public.clients cl where cl.id = c.client_id),
      (select string_agg(d.value, ' ')
         from jsonb_each_text(coalesce(c.dettagli, '{}'::jsonb)) d
        where d.key ~* '(num|cell|tel|mnp|linea|gnp|msisdn|fisso|portab|recapit|utenza|^n\.?\s*(prov|def))'
          and d.key !~* 'serial'
          and length(regexp_replace(d.value, '[^0-9]', '', 'g')) >= 6)
    ), '[^0-9]+', ' ', 'g');
$$;

create or replace function public.codici_contratto(c public.contracts) returns text
language sql stable as $$
  select concat_ws(' ', c.id, nullif(btrim(c.codice_attivazione), '—'),
    (select string_agg(btrim(d.value), ' ')
       from jsonb_each_text(coalesce(c.dettagli, '{}'::jsonb)) d
      where d.key ~* '(cod(ice)?[ _.]*contratto)'
        -- «-» e i trattini soli non sono un codice: lasciati dentro, bastava
        -- digitare un trattino per farsi restituire l'intera tabella
        and length(regexp_replace(d.value, '[^A-Za-z0-9]', '', 'g')) >= 4));
$$;

comment on function public.codici_contratto(public.contracts) is
  'Colonna calcolata: il codice del CRM, quello dell''operatore e le sue copie nei dettagli. Serve al filtro «codice contratto» di Ricerca vendite.';

grant execute on function public.numeri_telefono(public.contracts)  to anon, authenticated, service_role;
grant execute on function public.codici_contratto(public.contracts) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
