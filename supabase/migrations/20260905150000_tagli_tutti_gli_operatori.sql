-- ═══ IL LISTINO INTERO, ALLINEATO AL CATALOGO DI PAYSTORE ════════════════════
-- Luca 05/09: «ci sono tanti altri operatori di cui non abbiamo i prezzi su
-- Registra Vendita, fai una verifica e allinea tutti rispetto ai listini di
-- PayStore, così evitiamo problemi».
--
-- Il problema è concreto: un operatore che compare in Registra Vendita ma non
-- ha nessun taglio è una voce che il negozio vede e non può usare — e se
-- qualcuno inventa un importo, la ricarica si vende, il cliente paga e il
-- credito non parte mai, perché PayStore quel taglio non ce l'ha.
--
-- VERIFICA FATTA sul catalogo di produzione (`/catalog/pricelists`, prodotto per
-- prodotto). I cinque operatori che avevano già i tagli erano ESATTI, uno per
-- uno: TIM, Vodafone, WindTre, Fastweb, Iliad. Non è stato cambiato niente lì.
-- ho., Very e Poste sono stati caricati poco fa. Restavano questi sette, tutti
-- già agganciati al prodotto giusto e tutti senza un solo importo:
--
--   Kena Mobile   5, 10, 15, 25, 50
--   CoopVoce      5, 10, 20, 50
--   Digi Mobil    5, 10, 15, 20
--   Lycamobile    5, 10, 20, 30, 50
--   Tiscali       5, 10, 20, 50
--   1Mobile       5, 10, 15, 30, 50
--   Optima        5, 10, 20, 50
--
-- ⚠️ E TRE NOSTRI PAYSTORE NON LI HA: Daily Telecom, Spusu e WithU non
-- esistono nel loro catalogo e non hanno nemmeno un prodotto agganciato. Non si
-- toccano da qui — restano visibili in Registra Vendita e la decisione è di
-- Luca: se un negozio ne vende una, il credito non potrà mai partire.

insert into public.paystore_tagli (operatore, valore, etichetta, ordine, attivo, origine)
select v.operatore, v.valore,
       trim(to_char(v.valore, 'FM999990')) || ' €',
       (v.valore * 100)::int,
       true, 'catalogo PayStore 05/09'
  from (values
        ('kena', 5), ('kena', 10), ('kena', 15), ('kena', 25), ('kena', 50),
        ('coopvoce', 5), ('coopvoce', 10), ('coopvoce', 20), ('coopvoce', 50),
        ('digi', 5), ('digi', 10), ('digi', 15), ('digi', 20),
        ('lyca', 5), ('lyca', 10), ('lyca', 20), ('lyca', 30), ('lyca', 50),
        ('tiscali', 5), ('tiscali', 10), ('tiscali', 20), ('tiscali', 50),
        ('unomobile', 5), ('unomobile', 10), ('unomobile', 15), ('unomobile', 30), ('unomobile', 50),
        ('optima', 5), ('optima', 10), ('optima', 20), ('optima', 50)
       ) as v(operatore, valore)
 where not exists (
        select 1 from public.paystore_tagli t
         where t.operatore = v.operatore and t.valore = v.valore);
