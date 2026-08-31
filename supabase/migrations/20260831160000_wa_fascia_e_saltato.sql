-- Rifiniture ai messaggi WhatsApp (revisione del 31/08).
--
-- ① «ALLE ORE 🕐 00:00». Tutti e quattordici i modelli di conferma chiedono
--    l'ORA, ma il CRM prende gli appuntamenti anche a FASCIA — «Mattina /
--    Pomeriggio» — e in quel caso salva la sola data: a database diventa
--    mezzanotte. Su 109 pratiche in stato appuntamento, 73 sono così: al
--    cliente sarebbe arrivato «Le confermo l'appuntamento per 📅 04/09 alle
--    ore 🕐 00:00». Il motore adesso considera mezzanotte come «ora assente»
--    (vedi fmtOra) e qui arrivano le due varianti che parlano di fascia: il
--    modale sceglie da sé quella giusta, perché preferisce sempre la variante
--    senza segnaposto mancanti.
--    Nota: la migrazione precedente aveva spento l'unico modello che copriva
--    il caso, il vecchio «Appuntamento — con fascia».
--
-- ② «NON ANDATO» ERA AGGANCIATO AL NOME. Lo scenario dell'appuntamento
--    saltato si accendeva confrontando la stringa «Non andato» — proprio la
--    cosa che il commento del codice vieta, perché gli esiti si rinominano
--    dal pannello in due click. Rinominato l'esito, il cliente che ha bucato
--    l'appuntamento avrebbe ricevuto il messaggio generico di presentazione.
--    Adesso l'aggancio è al COMPORTAMENTO, come per tutti gli altri.
--
-- ③ Ordine delle schede: «Lei» prima di «tu». Avevano gli stessi numeri e la
--    stessa ora di creazione al millisecondo, quindi l'ordine era casuale e
--    di fatto usciva prima il tono informale.

insert into wa_templates (gruppo, titolo, corpo, scenario, attivo, ordine) values
  ('conferma-lei', 'Lei — a fascia',
   'Buongiorno {nome} 👋 Le confermo l''appuntamento presso il negozio {negozio} di {indirizzo} 📍 per 📅 {data_appuntamento}, {fascia_appuntamento}. Per qualsiasi necessità può rispondere direttamente a questo messaggio 💬. La aspettiamo! ✅',
   'appuntamento', true, 5),
  ('conferma-lei', 'Lei — a fascia, promemoria',
   'Gentile {nome}, le ricordiamo l''appuntamento fissato per 📅 {data_appuntamento}, {fascia_appuntamento}, nel punto vendita {negozio} di {indirizzo} 📍 In caso di ritardo o necessità di modifica, può scriverci su WhatsApp. A presto!',
   'appuntamento', true, 6),
  ('conferma-tu', 'Tu — a fascia',
   'Ciao {nome} 👋 Ti confermo l''appuntamento presso il negozio {negozio} di {indirizzo} 📍 per 📅 {data_appuntamento}, {fascia_appuntamento}. Per qualsiasi necessità puoi rispondere direttamente a questo messaggio 💬. Ti aspettiamo! ✅',
   'appuntamento', true, 5),
  ('conferma-tu', 'Tu — a fascia, promemoria',
   'Ciao {nome} 👋, ti ricordiamo l''appuntamento fissato per 📅 {data_appuntamento}, {fascia_appuntamento}, nel punto vendita {negozio} di {indirizzo} 📍 In caso di ritardo o se vuoi modificare l''orario, scrivici pure qui 💬. A presto!',
   'appuntamento', true, 6);

-- ② il comportamento «saltato», come gli altri
alter table caller_opzioni drop constraint if exists caller_opzioni_comportamento_check;
alter table caller_opzioni add constraint caller_opzioni_comportamento_check
  check (comportamento is null or comportamento = any (array[
    'appuntamento', 'richiamo', 'non_risposto', 'saltato', 'neutro', 'definitivo']));
update caller_opzioni set comportamento = 'saltato'
 where categoria = 'stato' and voce = 'Non andato';

-- ③ «Lei» prima di «tu» nelle schede del modale
update wa_templates set ordine = ordine + 100 where gruppo like '%-tu';

-- ④ le concordanze: nei testi con il «Lei» i participi erano tutti femminili,
--    e a un cliente uomo arrivavano al femminile. Il documento stesso altrove
--    usa la doppia forma.
update wa_templates set corpo = replace(corpo, 'non è riuscito a venire e non l''ho trovata al telefono', 'non è riuscito/a a venire e non l''ho trovato/a al telefono') where corpo like '%non l''ho trovata al telefono%';
update wa_templates set corpo = replace(corpo, 'era impegnata', 'era impegnato/a') where corpo like '%era impegnata%';
update wa_templates set corpo = replace(corpo, 'essere richiamata', 'essere richiamato/a') where corpo like '%essere richiamata%';
update wa_templates set corpo = replace(corpo, 'essere ricontattata', 'essere ricontattato/a') where corpo like '%essere ricontattata%';
update wa_templates set corpo = replace(corpo, 'L''ho cercata', 'L''ho cercato/a') where corpo like '%L''ho cercata%';
update wa_templates set corpo = replace(corpo, 'non è riuscita a passare', 'non è riuscito/a a passare') where corpo like '%non è riuscita a passare%';
update wa_templates set corpo = replace(corpo, 'non l''abbiamo vista', 'non l''abbiamo visto/a') where corpo like '%non l''abbiamo vista%';
update wa_templates set corpo = replace(corpo, 'a raggiungerla', 'a raggiungerlo/a') where corpo like '%a raggiungerla%';
update wa_templates set corpo = replace(corpo, 'di accoglierla', 'di accoglierla/o') where corpo like '%di accoglierla%';
update wa_templates set corpo = replace(corpo, 'immagino abbia avuto un imprevisto', 'immagino tu abbia avuto un imprevisto') where gruppo like '%-tu' and corpo like '%immagino abbia avuto un imprevisto%';
