-- VERIFICHE, terzo esito (MOD-36b, Luca 10/08): oltre a "verificata", l'admin
-- puo' marcare un update "DA SISTEMARE" scrivendo cosa non va (nel campo
-- risposta). Claude le rilegge a inizio sessione, sistema, e riporta la voce
-- a 'da_verificare' con la nota di cosa ha corretto.
ALTER TABLE public.dev_updates DROP CONSTRAINT IF EXISTS dev_updates_stato_check;
ALTER TABLE public.dev_updates ADD CONSTRAINT dev_updates_stato_check
  CHECK (stato IN ('da_verificare','risposta_data','da_sistemare','verificata'));

NOTIFY pgrst, 'reload schema';
