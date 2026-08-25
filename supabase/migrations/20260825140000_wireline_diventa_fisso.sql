-- LINGUAGGIO UNIVERSALE (Luca 25/08): «OVUNQUE nel gestionale la parola
-- Wireline si sostituisce con Fisso» — così la pista si chiama uguale su
-- tutti gli operatori. Le CHIAVI interne (fisso/business_fisso) erano già
-- pulite: si rinominano solo i testi visibili. Nelle lettere di gara VF/FW
-- «wireline» resta il nome del gestore: all'import va mappata su Fisso
-- (nota nel doc del ponte). Senza filtro month: vale per tutti i mesi.
update pay_piste set nome = replace(replace(nome, 'Wireline', 'Fisso'), 'wireline', 'fisso')
 where nome ilike '%wireline%';

update pay_righe set nome = replace(replace(nome, 'Wireline', 'Fisso'), 'wireline', 'fisso')
 where nome ilike '%wireline%';

update pay_righe set note = replace(replace(note, 'Wireline', 'Fisso'), 'wireline', 'fisso')
 where note ilike '%wireline%';
