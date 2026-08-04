-- SEC-02 (04/08): AUDIT PASSWORD — storico modifiche credenziali.
-- La tabella password_access_log e' nata ad hoc FUORI dalle migrations (oggi
-- a DB: id, credential_id, user_id, action, accessed_at — 34 righe, tutte
-- action='reveal' e user_id NULL): tutto qui e' idempotente e non assume
-- nulla di pregresso.
-- (a) CREATE TABLE IF NOT EXISTS per gli ambienti freschi.
-- (b) details jsonb: brand/categoria/negozio per il filtro della pagina e
--     diff dei soli campi NON segreti (access_type, username, category,
--     store) vecchio→nuovo; della PASSWORD si registra SOLO il marcatore
--     'modificata' — MAI il valore, nemmeno mascherato (decisione Luca 04/08).
-- (c) user_id (uuid di app_users) assicurato; NIENTE FK: il log deve
--     sopravvivere a qualunque pulizia di utenti o credenziali.
-- (d) via ogni FK ad hoc su credential_id: la route DELETE oggi purgava il
--     log per aggirarla — dopo questa migrazione lo storico sopravvive
--     all'eliminazione della credenziale.

CREATE TABLE IF NOT EXISTS public.password_access_log (
    id            BIGSERIAL PRIMARY KEY,
    credential_id BIGINT,
    user_id       UUID,
    action        TEXT NOT NULL DEFAULT 'reveal',
    accessed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    details       JSONB
);

ALTER TABLE public.password_access_log ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.password_access_log ADD COLUMN IF NOT EXISTS details JSONB;

-- Sgancio della FK ad hoc su credential_id (nome non garantito perche' la
-- tabella non e' mai passata dalle migrations): loop vuoto = gia' sganciata.
DO $$
DECLARE fk RECORD;
BEGIN
    FOR fk IN
        SELECT c.conname
          FROM pg_constraint c
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
         WHERE c.conrelid = 'public.password_access_log'::regclass
           AND c.contype = 'f'
           AND a.attname = 'credential_id'
    LOOP
        EXECUTE format('ALTER TABLE public.password_access_log DROP CONSTRAINT %I', fk.conname);
    END LOOP;
END $$;

-- Lettura dello storico: cronologico inverso + aggancio per credenziale.
CREATE INDEX IF NOT EXISTS idx_password_access_log_accessed_at
    ON public.password_access_log (accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_password_access_log_credential
    ON public.password_access_log (credential_id);

NOTIFY pgrst, 'reload schema';
