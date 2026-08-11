-- VERIFICHE, DELEGA (MOD-38, Luca 10/08): l'admin puo' delegare singole
-- verifiche a un utente (Francesco Latina). Il delegato vede SOLO le sue e
-- puo' verificarle o SEGNALARE una sistemazione — la segnalazione NON va a
-- Claude: entra in 'segnalazione_delegato' e torna all'ADMIN, che la puo'
-- correggere e inoltrare ('da_sistemare') oppure chiudere come verificata.
ALTER TABLE public.dev_updates ADD COLUMN IF NOT EXISTS delegato_a uuid;
ALTER TABLE public.dev_updates ADD COLUMN IF NOT EXISTS delegato_nome text;
ALTER TABLE public.dev_updates ADD COLUMN IF NOT EXISTS segnalazione_delegato text;
ALTER TABLE public.dev_updates ADD COLUMN IF NOT EXISTS segnalato_da text;

ALTER TABLE public.dev_updates DROP CONSTRAINT IF EXISTS dev_updates_stato_check;
ALTER TABLE public.dev_updates ADD CONSTRAINT dev_updates_stato_check
  CHECK (stato IN ('da_verificare','risposta_data','da_sistemare','segnalazione_delegato','verificata'));

NOTIFY pgrst, 'reload schema';
