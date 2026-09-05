-- ═══ I TAGLI DI ho., VERY E POSTE ════════════════════════════════════════════
-- Luca 05/09: «per quanto riguarda i tagli, tu hai i tagli corretti di quei 3
-- operatori che offre PayStore?» — e poi ce li ha esportati dal loro portale.
--
-- I tre operatori erano venduti nei negozi ma non avevano NESSUN taglio a
-- listino nel CRM: chi voleva vendere una ricarica ho. non aveva un importo da
-- premere. L'aggancio al prodotto PayStore invece c'era già ed è giusto
-- (ho → 6, very → 5, poste → 4), quindi mancava solo la lista degli importi.
--
-- ⚠️ DUE FONTI INDIPENDENTI, E COINCIDONO. Chiesti all'API di PayStore
-- (`/catalog/pricelists`) e letti da Luca sul loro portale: stessi numeri, uno
-- per uno. Su un listino che decide cosa un negozio può vendere, una fonte sola
-- non basta — un importo di troppo è una ricarica che si vende e poi non parte,
-- col cliente che ha già pagato.
--
--   ho.          5, 10, 15, 20, 25, 30, 50
--   Very Mobile  5, 10, 15, 20, 25, 50
--   PosteMobile  5, 10, 15, 20, 50

insert into public.paystore_tagli (operatore, valore, etichetta, ordine, attivo, origine)
select v.operatore, v.valore,
       trim(to_char(v.valore, 'FM999990')) || ' €',
       (v.valore * 100)::int,
       true, 'catalogo PayStore 05/09'
  from (values
        ('ho', 5), ('ho', 10), ('ho', 15), ('ho', 20), ('ho', 25), ('ho', 30), ('ho', 50),
        ('very', 5), ('very', 10), ('very', 15), ('very', 20), ('very', 25), ('very', 50),
        ('poste', 5), ('poste', 10), ('poste', 15), ('poste', 20), ('poste', 50)
       ) as v(operatore, valore)
 where not exists (
        select 1 from public.paystore_tagli t
         where t.operatore = v.operatore and t.valore = v.valore);
