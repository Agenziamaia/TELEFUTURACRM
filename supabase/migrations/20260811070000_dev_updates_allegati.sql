-- VERIFICHE, ALLEGATI (MOD-42, Luca 10/08): task, proposte, segnalazioni e
-- approvazioni possono portare file (screenshot!) — array [{url, name}] su
-- bucket contracts, path verifiche/*.
ALTER TABLE public.dev_updates ADD COLUMN IF NOT EXISTS allegati jsonb NOT NULL DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
