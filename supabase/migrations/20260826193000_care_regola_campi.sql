-- Coda della Vodafone Care («eliminala dappertutto», Luca 26/08): la regola
-- campi di Registra Vendita «Verisure · Vodafone Care» citava ancora la Care
-- (ramo morto: i prodotti Care sono spenti). La regola resta per Verisure,
-- il ramo Care sparisce da etichetta e condizioni. Residuo trovato dal
-- revisore indipendente sulla migrazione 20260826190000.
update catalog_campi_regole
   set etichetta = 'Verisure',
       condizioni = jsonb_set(condizioni, '{prodotto}', '["Verisure"]'::jsonb)
 where id = 'e31b3c64-6ee2-4f31-849c-77243698c251'
   and condizioni->'prodotto' @> '"Vodafone Care"'::jsonb;
