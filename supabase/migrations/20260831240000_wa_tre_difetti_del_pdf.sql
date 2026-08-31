-- TRE DIFETTI CHE IL PDF SI PORTAVA DIETRO (revisore 31/08).
--
-- I 50 testi sono ora fedeli all'originale carattere per carattere — il che
-- vuol dire che sono fedeli anche a tre sviste che nell'originale ci sono, e
-- che nel CRM fanno danno:
--
-- ① «del negozio WINDTRE di {indirizzo}»: nel PDF il marchio è scritto a mano,
--    ma questa riga non ha brand e vale per TUTTI. Un cliente Vodafone,
--    Fastweb, Sky o Tim che salta l'appuntamento si sentiva dire che il
--    negozio è WindTre. Dove il PDF ha messo un marchio, il CRM ha una
--    variabile.
-- ② «non è riuscito a venire e non l'ho trovata al telefono»: maschile e
--    femminile a due parole di distanza, nella stessa frase. Nel Lei di
--    cortesia concorda col pronome, che è femminile.
-- ③ «non sei riuscito/a a passare e immagino abbia avuto un imprevisto»: il
--    soggetto salta alla terza persona a metà frase. Era già stato corretto
--    («immagino TU abbia avuto») e il ritorno all'originale se l'è portato
--    via: non era una neutralizzazione di genere, era una correzione vera.

update wa_templates
   set corpo = replace(corpo, 'del negozio WINDTRE', 'del negozio {negozio}')
 where gruppo = 'saltato-lei' and titolo = 'Lei — amichevole';

update wa_templates
   set corpo = replace(corpo, 'non è riuscito a venire', 'non è riuscita a venire')
 where gruppo = 'saltato-lei' and titolo = 'Lei — amichevole';

update wa_templates
   set corpo = replace(corpo, 'immagino abbia avuto', 'immagino tu abbia avuto')
 where gruppo = 'saltato-tu' and titolo = 'Tu — variante 2';
