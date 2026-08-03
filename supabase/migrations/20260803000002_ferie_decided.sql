-- 138: CHI HA DECISO le ferie (03/08). Approvata o rifiutata, la richiesta
-- porta con se' decisore e momento della decisione: cosi' lo Storico
-- Approvazioni puo' mostrare l'ESITO vero delle ferie (prima ci arrivava solo
-- la task "Completata" del fulmine, che non dice se erano approvate o no).
ALTER TABLE public.vacation_requests ADD COLUMN IF NOT EXISTS decided_by TEXT;
ALTER TABLE public.vacation_requests ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
