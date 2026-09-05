-- ═══ LA SOCIETÀ DEI TELEFONI DELL'INVENTARIO ═════════════════════════════════
-- Luca 05/09: «compila il campo della società secondo le regole che abbiamo
-- appena definito».
--
-- LA REGOLA, confermata da lui poco fa: la società che compra un usato è quella
-- del NEGOZIO, sempre — anche nei quattro locali che ne ospitano due (Magliana,
-- Acilia, Collatina, Donna), dove compra Telefutura. È la stessa regola che il
-- CRM applica già a ogni acquisto: `societaDelNegozio()` la usa per intestare la
-- dichiarazione che il cliente firma.
--
-- PERCHÉ SERVE ADESSO. Restavano 68 telefoni senza società: quelli
-- dell'inventario fisico del 3 agosto, che non sono passati dal CRM e non erano
-- nel file dei documenti del vecchio gestionale. Trentadue di loro sono ANCORA
-- DA VENDERE (8.548 € a listino): venduti in settembre o ottobre sarebbero
-- finiti nel file mensile per il commercialista senza la società che li ha
-- comprati — cioè senza la colonna per cui quel file esiste.
--
-- ⚠️ È UNA RICOSTRUZIONE, E RESTA SCRITTO CHE LO È. Per questi telefoni non
-- esiste un documento d'acquisto: la società non viene da una carta, viene
-- dalla regola. Chi guarda la scheda fra sei mesi deve poterlo sapere, perché
-- «dedotto dal negozio» e «letto sulla dichiarazione firmata» non hanno lo
-- stesso peso davanti a un controllo. La traccia va in `status_history`, dove
-- il CRM tiene già la storia dei passaggi.

update public.usati u
   set azienda_acquisto = s.azienda,
       status_history = coalesce(u.status_history, '{}'::jsonb) || jsonb_build_object(
           'societa_ricostruita', jsonb_build_object(
               'date', now(),
               'operatore', 'ricostruzione 05/09 — società dedotta dal negozio '
                   || coalesce(u.store_acquisto, u.store)
                   || ': questo telefono viene dall''inventario del 3 agosto e non ha un documento d''acquisto.'
           ))
  from public.stores s
 where s.name = coalesce(u.store_acquisto, u.store)
   and s.azienda is not null
   and u.azienda_acquisto is null;
