-- ═══ VIA GLI OPERATORI CHE PAYSTORE NON HA ═══════════════════════════════════
-- Luca 05/09: «per gli PayStore, gli operatori che non ci sono toglili dal
-- catalogo».
--
-- Daily Telecom, Spusu e WithU sono a listino in Registra Vendita ma NON
-- esistono nel catalogo di PayStore: verificato prodotto per prodotto sul
-- catalogo di produzione, e infatti nessuno dei tre ha un `paystore_product_id`.
--
-- ⚠️ NON È UNA PULIZIA ESTETICA. Una voce che si può vendere e che non si può
-- erogare è la peggiore delle tre: il negozio la batte, il cliente paga, lo
-- scontrino esce — e il credito non partirà MAI, perché a PayStore quel
-- prodotto non c'è. Un errore che si scopre in negozio, con la persona davanti.
-- Nessuna delle tre è mai stata venduta (zero ricariche in archivio): si
-- toglie prima che succeda.
--
-- ⚠️ SI SPEGNE, NON SI CANCELLA. `active = false` le toglie dal banco e lascia
-- la voce dov'è: se un giorno PayStore le aggiunge, si riaccende una riga
-- invece di ricostruirla — e se qualcuna fosse già stata usata in passato, i
-- documenti che la nominano restano leggibili.

update public.marg_items
   set active = false
 where paystore_operatore in ('daily', 'spusu', 'withu')
   and active is not false;
