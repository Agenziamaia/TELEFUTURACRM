-- ① FIX PANNELLO (bug "provo a modificare e non funziona", Luca 11/08): il
--   trigger rls_auto_enable aveva acceso la RLS sulle tabelle pay SENZA
--   policy → ogni scrittura anon falliva in silenzio. Policy permissive
--   (modello CRM attuale; si stringeranno col progetto sicurezza).
DO $$ DECLARE t TEXT;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'pay_%' LOOP
    EXECUTE format('DROP POLICY IF EXISTS pay_allow_all ON %I', t);
    EXECUTE format('CREATE POLICY pay_allow_all ON %I FOR ALL USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;
-- ② CALENDARIO GARE (v2, direttiva Luca): il dato dei giorni è la base di
--   TUTTE le proiezioni di commissioning — vive dentro Gare, con l'ORA DI
--   SCATTO del giorno (prima di quell'ora il giorno corrente non conta come
--   trascorso) e il GIORNO del mese da cui la proiezione diventa visibile.
ALTER TABLE public.pay_giorni_lavorativi ALTER COLUMN giorni DROP NOT NULL;
ALTER TABLE public.pay_giorni_lavorativi ADD COLUMN IF NOT EXISTS ora_scatto INT NOT NULL DEFAULT 19 CHECK (ora_scatto BETWEEN 0 AND 23);
ALTER TABLE public.pay_giorni_lavorativi ADD COLUMN IF NOT EXISTS proiezione_dal INT NOT NULL DEFAULT 1 CHECK (proiezione_dal BETWEEN 1 AND 31);
