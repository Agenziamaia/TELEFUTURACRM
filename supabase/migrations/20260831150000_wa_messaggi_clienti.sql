-- I MESSAGGI WHATSAPP AI CLIENTI, RIFATTI (Luca 31/08, dal documento
-- «Messaggi WhatsApp per clienti telco»).
--
-- Cosa cambia rispetto a prima:
--   · si passa da 11 modelli a 50, e soprattutto da UN tono a DUE — «Lei» e
--     «tu» — che nel modale diventano due schede separate: il caller sceglie
--     come dare del cliente, il CRM ruota la variante dentro quella scelta;
--   · nasce lo scenario APPUNTAMENTO SALTATO, che prima non esisteva: il
--     cliente che non si presenta e non risponde riceveva i messaggi del
--     «non risposto», che parlano di un'altra cosa;
--   · entra il segnaposto {indirizzo} — l'indirizzo del negozio, che i testi
--     nuovi usano per farsi riconoscere («del punto vendita X di via Y»).
--     Si compila in Amministrazione → Negozi; finché è vuoto sparisce dal
--     messaggio insieme alla preposizione che lo precede, senza lasciare
--     buchi.
--
-- Restano com'erano i modelli di RICHIAMO e GENERICO: il documento non li
-- copre, e lasciare quegli scenari senza messaggi sarebbe peggio.
--
-- I vecchi modelli di «non risposto» e «appuntamento» non si cancellano: si
-- SPENGONO (attivo = false). Restano leggibili nel pannello e le statistiche
-- di invio (wa_template_invii) continuano a puntare a righe esistenti.

update wa_templates set attivo = false
 where scenario in ('nr', 'appuntamento') and gruppo in ('nr-primo-contatto', 'appuntamento-conferma');

insert into wa_templates (gruppo, titolo, corpo, scenario, attivo, ordine) values
('nr-lei', 'Lei — amichevole', 'Buongiorno {nome} 👋 Sono {caller} del negozio {negozio} di {indirizzo} 📍. Ho provato a chiamarla per darle un breve aggiornamento. Quando le è più comodo sentirci: questa mattina o nel pomeriggio? Può rispondermi direttamente qui 💬. Grazie!', 'nr', true, 10),
  ('nr-lei', 'Lei — informale e naturale', 'Salve {nome} ✨ Sono {caller} del punto vendita {negozio} di {indirizzo} 📍 L''ho cercata poco fa, ma probabilmente era impegnata. Mi scriva pure qui quando ha due minuti, oppure mi indichi l''orario in cui preferisce essere richiamata.', 'nr', true, 20),
  ('nr-lei', 'Lei — con priorità reale', 'Buongiorno {nome} 👋, sono {caller} del negozio {negozio} di {indirizzo} 📍 Avrei bisogno di sentirla brevemente per completare un aggiornamento relativo alla sua linea. Appena può, mi risponda qui oppure mi indichi se preferisce essere richiamata al mattino o nel pomeriggio. Grazie!', 'nr', true, 30),
  ('nr-lei', 'Lei — variante 1', 'Buongiorno {nome} 👋, sono {caller} di {negozio}, {indirizzo} 📍 Ho cercato di contattarla poco fa. Quando le è comodo, può rispondermi qui 💬 o indicarmi l''orario migliore per richiamarla.', 'nr', true, 40),
  ('nr-lei', 'Lei — variante 2', 'Salve {nome} ✨ La contatto dal punto vendita {negozio} di {indirizzo} 📍. Non sono riuscito/a a raggiungerla telefonicamente; mi lasci pure un messaggio quando è disponibile.', 'nr', true, 50),
  ('nr-lei', 'Lei — variante 3', 'Gentile {nome}, sono {caller} del negozio {negozio}. Avrei bisogno di parlarle brevemente. Può richiamarmi oppure scrivermi qui 💬 quando ha un momento? Grazie 😊', 'nr', true, 60),
  ('nr-lei', 'Lei — variante 4', 'Buongiorno {nome} 👋! Ho provato a sentirla dal negozio {negozio} di {indirizzo} 📍. Se preferisce, mi indichi direttamente su WhatsApp una fascia oraria comoda per essere ricontattata 🕐', 'nr', true, 70),
  ('nr-lei', 'Lei — variante 5', 'Salve {nome} ✨, le scrive {caller} di {negozio}. Vorrei darle un breve aggiornamento e non sono riuscito/a a trovarla al telefono. Preferisce sentirci al mattino o nel pomeriggio?', 'nr', true, 80),
  ('nr-lei', 'Lei — variante 6', 'Buongiorno {nome} 👋, la cercavo dal punto vendita {negozio}, {indirizzo} 📍 Quando riesce, mi risponda a questo messaggio: sarò felice di aggiornarla.', 'nr', true, 90),
  ('nr-tu', 'Tu — amichevole', 'Ciao {nome} 👋 Sono {caller} del negozio {negozio} di {indirizzo} 📍. Ho provato a chiamarti per darti un breve aggiornamento. Quando ti è più comodo sentirci: questa mattina o nel pomeriggio? Puoi rispondermi direttamente qui 💬. Grazie!', 'nr', true, 10),
  ('nr-tu', 'Tu — informale e naturale', 'Ciao {nome} 👋! Ti ha cercato {caller} del punto vendita {negozio} di {indirizzo} 📍 Probabilmente eri impegnato/a. Quando sei libero/a, mandami pure un messaggio oppure dimmi a che ora preferisci essere richiamato/a.', 'nr', true, 20),
  ('nr-tu', 'Tu — con priorità reale', 'Ciao {nome} 👋, sono {caller} del negozio {negozio} di {indirizzo} 📍 Avrei bisogno di sentirti brevemente per completare un aggiornamento relativo alla tua linea. Appena puoi, rispondimi qui oppure dimmi se preferisci essere richiamato/a al mattino o nel pomeriggio. Grazie!', 'nr', true, 30),
  ('nr-tu', 'Tu — variante 1', 'Ciao {nome} 👋, sono {caller} di {negozio}, {indirizzo} 📍 Ho provato a chiamarti poco fa. Quando ti è comodo, scrivimi qui o dimmi l''orario migliore per richiamarti.', 'nr', true, 40),
  ('nr-tu', 'Tu — variante 2', 'Ciao {nome} 👋 Ti contatto dal punto vendita {negozio} di {indirizzo} 📍. Non sono riuscito/a a raggiungerti; lasciami pure un messaggio quando sei disponibile.', 'nr', true, 50),
  ('nr-tu', 'Tu — variante 3', 'Ciao {nome} 👋, sono {caller} del negozio {negozio}. Avrei bisogno di parlarti brevemente. Puoi richiamarmi oppure scrivermi qui 💬 quando hai un momento? Grazie 😊', 'nr', true, 60),
  ('nr-tu', 'Tu — variante 4', 'Buongiorno {nome} 👋! Ho provato a sentirti dal negozio {negozio} di {indirizzo} 📍. Se preferisci, indicami su WhatsApp una fascia oraria comoda per richiamarti 🕐', 'nr', true, 70),
  ('nr-tu', 'Tu — variante 5', 'Ciao {nome} 👋, ti scrive {caller} di {negozio}. Vorrei darti un breve aggiornamento e non sono riuscito/a a trovarti al telefono. Preferisci sentirci al mattino o nel pomeriggio?', 'nr', true, 80),
  ('nr-tu', 'Tu — variante 6', 'Ciao {nome} 👋, ti cercavo dal punto vendita {negozio}, {indirizzo} 📍 Quando riesci, rispondimi a questo messaggio così posso aggiornarti.', 'nr', true, 90),
  ('saltato-lei', 'Lei — amichevole', 'Buongiorno {nome} 👋 Sono {caller} del negozio {negozio} di {indirizzo} 📍. Avevamo un appuntamento, ma ho visto che non è riuscito a venire e non l''ho trovata al telefono. Nessun problema: se desidera, possiamo concordare insieme un nuovo giorno e un orario più comodo 📅', 'saltato', true, 10),
  ('saltato-lei', 'Lei — comprensiva', 'Salve {nome} ✨! La aspettavamo oggi nel nostro punto vendita {negozio} di {indirizzo} 📍, ma immagino abbia avuto un imprevisto 😊 Ho provato anche a contattarla telefonicamente. Mi scriva pure qui quando vuole riprogrammare l''appuntamento.', 'saltato', true, 20),
  ('saltato-lei', 'Lei — con priorità', 'Buongiorno {nome} 👋, sono {caller} del negozio {negozio} di {indirizzo} 📍. Non vedendola arrivare all''appuntamento, ho provato a chiamarla senza riuscire a raggiungerla 📞 Se desidera riprogrammarlo, mi scriva appena può: controllerò subito le disponibilità più vicine e le proporrò due alternative.', 'saltato', true, 30),
  ('saltato-lei', 'Lei — variante 1', 'Buongiorno {nome} 👋 Oggi l''aspettavamo presso {negozio}, in {indirizzo} 📍. Non essendo riuscito/a a contattarla, le scrivo qui: se vuole, possiamo fissare un nuovo appuntamento.', 'saltato', true, 40),
  ('saltato-lei', 'Lei — variante 2', 'Salve {nome} ✨, sono {caller} di {negozio}. Ho notato che non è riuscita a passare per l''appuntamento e immagino abbia avuto un imprevisto. Mi indichi pure quando preferisce riprogrammarlo.', 'saltato', true, 50),
  ('saltato-lei', 'Lei — variante 3', 'Gentile {nome}, non l''abbiamo vista all''appuntamento previsto nel nostro negozio di {indirizzo} 📍 e non siamo riusciti a raggiungerla 📞 Se desidera, troviamo insieme una nuova disponibilità.', 'saltato', true, 60),
  ('saltato-lei', 'Lei — variante 4', 'Buongiorno {nome} 👋! Nessun problema per l''appuntamento di oggi 😊 Quando le è possibile, mi scriva qui e le propongo un nuovo giorno e orario presso {negozio}.', 'saltato', true, 70),
  ('saltato-lei', 'Lei — variante 5', 'Salve {nome} ✨, ho provato a chiamarla dopo l''appuntamento presso {negozio}. Se desidera fissare una nuova data, mi risponda qui: verifico le disponibilità più vicine e le propongo due alternative 🕐', 'saltato', true, 80),
  ('saltato-lei', 'Lei — variante 6', 'Buongiorno {nome} 👋, la contatto da {negozio}, {indirizzo} 📍. Non siamo riusciti a incontrarci come previsto; mi faccia sapere se desidera spostare l''appuntamento. Sarò lieto/a di aiutarla 😊', 'saltato', true, 90),
  ('saltato-tu', 'Tu — amichevole', 'Ciao {nome} 👋 Sono {caller} del negozio {negozio} di {indirizzo} 📍. Avevamo un appuntamento, ma ho visto che non sei riuscito/a a venire e non ti ho trovato al telefono. Nessun problema: scrivimi quando puoi e scegliamo insieme un nuovo giorno.', 'saltato', true, 10),
  ('saltato-tu', 'Tu — comprensiva', 'Ciao {nome} 👋! Oggi ti aspettavamo nel punto vendita {negozio} di {indirizzo} 📍, ma immagino sia successo un imprevisto 😊 Ho provato anche a chiamarti. Se vuoi recuperare l''appuntamento, dimmi pure quando ti farebbe più comodo passare.', 'saltato', true, 20),
  ('saltato-tu', 'Tu — con priorità', 'Ciao {nome} 👋, sono {caller} del negozio {negozio} di {indirizzo} 📍. Non vedendoti arrivare all''appuntamento, ho provato a contattarti 📞 Se vuoi riprogrammarlo, scrivimi appena riesci: controllo subito le disponibilità più vicine e ti propongo due alternative.', 'saltato', true, 30),
  ('saltato-tu', 'Tu — variante 1', 'Ciao {nome} 👋 Oggi ti aspettavamo presso {negozio}, in {indirizzo} 📍. Non essendo riuscito/a a contattarti, ti scrivo qui: se vuoi, possiamo fissare un nuovo appuntamento.', 'saltato', true, 40),
  ('saltato-tu', 'Tu — variante 2', 'Ciao {nome} 👋, sono {caller} di {negozio}. Ho visto che non sei riuscito/a a passare e immagino abbia avuto un imprevisto. Dimmi pure quando preferisci riprogrammare.', 'saltato', true, 50),
  ('saltato-tu', 'Tu — variante 3', 'Ciao {nome} 👋, non ti abbiamo visto all''appuntamento previsto nel nostro negozio di {indirizzo} 📍 e non siamo riusciti a raggiungerti 📞 Se vuoi, troviamo insieme una nuova disponibilità.', 'saltato', true, 60),
  ('saltato-tu', 'Tu — variante 4', 'Buongiorno {nome} 👋! Nessun problema per l''appuntamento di oggi 😊 Quando puoi, scrivimi qui e ti propongo un nuovo giorno e orario presso {negozio}.', 'saltato', true, 70),
  ('saltato-tu', 'Tu — variante 5', 'Ciao {nome} 👋, ho provato a chiamarti dopo l''appuntamento presso {negozio}. Se vuoi fissare una nuova data, rispondimi qui: controllo le disponibilità più vicine e ti propongo due alternative 🕐', 'saltato', true, 80),
  ('saltato-tu', 'Tu — variante 6', 'Ciao {nome} 👋, ti contatto da {negozio}, {indirizzo} 📍. Non siamo riusciti a incontrarci come previsto; fammi sapere se vuoi spostare l''appuntamento. Ti aiuto volentieri 😊', 'saltato', true, 90),
  ('conferma-lei', 'Lei — cordiale', 'Buongiorno {nome} 👋 Le confermo l''appuntamento presso il negozio {negozio}, in {indirizzo} 📍, per 📅 {data_appuntamento} alle ore 🕐 {ora_appuntamento}. Per qualsiasi necessità può rispondere direttamente a questo messaggio 💬. La aspettiamo! ✅', 'appuntamento', true, 10),
  ('conferma-lei', 'Lei — calda e accogliente', 'Salve {nome} ✨! Il suo appuntamento è confermato per 📅 {data_appuntamento} alle 🕐 {ora_appuntamento} presso {negozio}, in {indirizzo} 📍 Saremo lieti di accoglierla. Se dovesse avere un imprevisto, ci avvisi pure qui.', 'appuntamento', true, 20),
  ('conferma-lei', 'Lei — promemoria chiaro', 'Gentile {nome}, le ricordiamo l''appuntamento fissato per 📅 {data_appuntamento} alle ore 🕐 {ora_appuntamento} nel punto vendita {negozio} di {indirizzo} 📍 In caso di ritardo o necessità di modifica, può scriverci su WhatsApp. A presto!', 'appuntamento', true, 30),
  ('conferma-lei', 'Lei — variante 1', 'Buongiorno {nome} 👋 ✅ Appuntamento confermato per 📅 {data_appuntamento} alle 🕐 {ora_appuntamento} presso {negozio}, {indirizzo} 📍. Per qualsiasi variazione può scriverci qui 💬. A presto!', 'appuntamento', true, 40),
  ('conferma-lei', 'Lei — variante 2', 'Salve {nome} ✨ La aspettiamo 📅 {data_appuntamento} alle ore 🕐 {ora_appuntamento} nel punto vendita {negozio} di {indirizzo} 📍. Se ha bisogno di modificare l''orario, ci avvisi con un messaggio.', 'appuntamento', true, 50),
  ('conferma-lei', 'Lei — variante 3', 'Gentile {nome}, questo è il promemoria del suo appuntamento: 📅 {data_appuntamento}, ore 🕐 {ora_appuntamento}, presso {negozio} — {indirizzo} 📍. A presto!', 'appuntamento', true, 60),
  ('conferma-lei', 'Lei — variante 4', 'Buongiorno {nome} 👋, abbiamo riservato per lei l''appuntamento di 📅 {data_appuntamento} alle 🕐 {ora_appuntamento} nel negozio {negozio}, in {indirizzo} 📍 ✅ Restiamo disponibili qui su WhatsApp.', 'appuntamento', true, 70),
  ('conferma-tu', 'Tu — cordiale', 'Ciao {nome} 👋 Ti confermo l''appuntamento presso il negozio {negozio}, in {indirizzo} 📍, per 📅 {data_appuntamento} alle ore 🕐 {ora_appuntamento}. Per qualsiasi necessità puoi rispondere direttamente a questo messaggio 💬. Ti aspettiamo! ✅', 'appuntamento', true, 10),
  ('conferma-tu', 'Tu — calda e accogliente', 'Ciao {nome} 👋! Il tuo appuntamento è confermato per 📅 {data_appuntamento} alle 🕐 {ora_appuntamento} presso {negozio}, in {indirizzo} 📍 Saremo felici di accoglierti. Se dovessi avere un imprevisto, avvisaci pure qui.', 'appuntamento', true, 20),
  ('conferma-tu', 'Tu — promemoria chiaro', 'Ciao {nome} 👋, ti ricordiamo l''appuntamento fissato per 📅 {data_appuntamento} alle ore 🕐 {ora_appuntamento} nel punto vendita {negozio} di {indirizzo} 📍 In caso di ritardo o se vuoi modificare l''orario, scrivici pure qui 💬. A presto!', 'appuntamento', true, 30),
  ('conferma-tu', 'Tu — variante 1', 'Ciao {nome} 👋 ✅ Appuntamento confermato per 📅 {data_appuntamento} alle 🕐 {ora_appuntamento} presso {negozio}, {indirizzo} 📍. Per qualsiasi variazione puoi scriverci qui 💬. A presto!', 'appuntamento', true, 40),
  ('conferma-tu', 'Tu — variante 2', 'Ciao {nome} 👋 Ti aspettiamo 📅 {data_appuntamento} alle ore 🕐 {ora_appuntamento} nel punto vendita {negozio} di {indirizzo} 📍. Se hai bisogno di modificare l''orario, avvisaci con un messaggio.', 'appuntamento', true, 50),
  ('conferma-tu', 'Tu — variante 3', 'Ciao {nome} 👋, ecco il promemoria del tuo appuntamento: 📅 {data_appuntamento}, ore 🕐 {ora_appuntamento}, presso {negozio} — {indirizzo} 📍. A presto!', 'appuntamento', true, 60),
  ('conferma-tu', 'Tu — variante 4', 'Buongiorno {nome} 👋, abbiamo riservato per te l''appuntamento di 📅 {data_appuntamento} alle 🕐 {ora_appuntamento} nel negozio {negozio}, in {indirizzo} 📍 ✅ Restiamo disponibili qui su WhatsApp.', 'appuntamento', true, 70)
;
