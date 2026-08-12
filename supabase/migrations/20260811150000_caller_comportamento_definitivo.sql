-- COMPORTAMENTO "DEFINITIVO" per gli stati caller (Luca 11/08): il CHECK della
-- mig. 119 accettava solo appuntamento/richiamo/non_risposto/neutro e il
-- pannello sembrava "buggato" (l'update falliva e la tendina tornava indietro).
-- 🏁 definitivo = esito che ARCHIVIA la pratica caller: fuori dal lavoro e dal
-- malus, si rivede col toggle 🗂 Archiviate.
ALTER TABLE public.caller_opzioni DROP CONSTRAINT IF EXISTS caller_opzioni_comportamento_check;
ALTER TABLE public.caller_opzioni ADD CONSTRAINT caller_opzioni_comportamento_check
  CHECK (comportamento IS NULL OR comportamento = ANY (ARRAY['appuntamento'::text, 'richiamo'::text, 'non_risposto'::text, 'neutro'::text, 'definitivo'::text]));
