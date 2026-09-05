-- ═══ CHI HA COMPRATO STA SULLA DICHIARAZIONE ═════════════════════════════════
-- Luca 05/09: «come fanno a esserci degli usati comprati col CRM dove non sai
-- la società? Abbiamo fatto la dichiarazione di vendita dal CRM…».
--
-- Aveva ragione, e il dato non mancava: mancava di essere SCRITTO. Quando un
-- negozio compra un usato, il CRM intesta la dichiarazione a una società
-- precisa — `societaDelNegozio()` la ricava da `stores.azienda` e la stampa sul
-- documento che il cliente firma — e poi la colonna `azienda_acquisto` restava
-- vuota. Risultato misurato: dal 1° settembre NESSUN usato comprato aveva la
-- società, proprio nel primo mese che va davvero al commercialista.
--
-- Qui si recuperano quelli già comprati dentro il CRM: otto telefoni, tutti con
-- la dichiarazione firmata allegata. Non si deduce niente — si copia quello che
-- c'è scritto sul documento, cioè la società del negozio che l'ha intestato.
--
-- ⚠️ NON SI TOCCA CHI NON HA UN DOCUMENTO. I 67 telefoni dell'inventario fisico
-- del 3 agosto non sono stati comprati dal CRM: non hanno dichiarazione e non
-- risultano nel file dei documenti del vecchio gestionale. Per loro la società
-- resta vuota, che è un dato onesto — inventarla su una scrittura contabile no.

update public.usati u
   set azienda_acquisto = s.azienda
  from public.stores s
 where s.name = coalesce(u.store_acquisto, u.store)
   and s.azienda is not null
   and u.azienda_acquisto is null
   and u.allegato_dichiarazione is not null      -- il documento c'è davvero
   and coalesce(u.venditore, '') <> 'Import fase zero'
   and coalesce(u.note_tecnico, '') not ilike '%FASE ZERO%';
