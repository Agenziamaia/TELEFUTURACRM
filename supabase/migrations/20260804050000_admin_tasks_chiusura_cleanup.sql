-- Mig. — PULIZIA TASK CHIUSURA LINEA ARRETRATE (Luca 04/08/2026, CHL-01).
-- Il designato dell'incarico (direttore commerciale) fino a oggi NON aveva il
-- fulmine in header: le admin_tasks tipo 'chiusura_linea' si sono accumulate
-- senza che NESSUNO potesse vederle. Col fulmine esteso a tutti diventerebbero
-- di colpo un arretrato doppione (le stesse richieste sono gia' in_attesa
-- nella pagina col nuovo preset "da lavorare"): si azzerano d'ufficio.
-- Confermato da Luca: niente task retroattive. Idempotente per costruzione.
UPDATE public.admin_tasks
   SET done = true, done_by = '—', done_at = now()
 WHERE tipo = 'chiusura_linea' AND done = false;

-- Col fulmine per TUTTI i ~45 utenti attivi ogni client interroga le proprie
-- task personali ogni 60s: indice mirato sulla coppia usata dalla query.
CREATE INDEX IF NOT EXISTS idx_admin_tasks_target_user_done
    ON public.admin_tasks (target_user_id, done);

NOTIFY pgrst, 'reload schema';
