-- Mig. 178 — DUE LISTINI PER BRAND (Luca 05/08): WindTre ha il listino dei
-- telefoni ORDINABILI (in vigore) e quello dei telefoni NON più ordinabili ma
-- rateizzabili da magazzino. La colonna `lista` distingue i due; l'unicità
-- passa a (brand, modello, lista) così i due caricamenti non si pestano.
ALTER TABLE public.listini_terminali
    ADD COLUMN IF NOT EXISTS lista TEXT NOT NULL DEFAULT 'ordinabili';

DO $$
DECLARE c record;
BEGIN
    FOR c IN
        SELECT con.conname FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        WHERE rel.relname = 'listini_terminali' AND con.contype = 'u'
    LOOP
        EXECUTE format('ALTER TABLE public.listini_terminali DROP CONSTRAINT %I', c.conname);
    END LOOP;
END $$;

ALTER TABLE public.listini_terminali
    ADD CONSTRAINT listini_terminali_brand_modello_lista_key UNIQUE (brand, modello, lista);

NOTIFY pgrst, 'reload schema';
