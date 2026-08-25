-- W3 · scheda RAGAZZI (Luca 25/08): le soglie dei ragazzi vanno da 1 a 3 —
-- il gas ne mostrava 5 (la scala azienda della lettera) perché lucegas era
-- l'unica pista senza soglie_max. Allineata a mobile/fisso: il motore taglia
-- le soglie e i pay derivati alle prime 3 (ultima aperta). La scala azienda
-- resta intatta a 5: il taglio vale solo per il lato ragazzi derivato.
update pay_piste
   set soglie_max = 3
 where brand = 'windtre'
   and lato = 'azienda'
   and chiave = 'lucegas'
   and soglie_max is null;
