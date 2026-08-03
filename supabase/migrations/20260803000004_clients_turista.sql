-- 140: FLAG TURISTA sull'anagrafica cliente (03/08). Cliente di passaggio
-- SENZA codice fiscale italiano: in Registra Vendita il CF non e' richiesto
-- col flag attivo, ma la vendita e' limitata a WindTre PRIVATO (categorie
-- Mobile Wallet e Customer Base) oppure Marginalita'. Il flag resta salvato
-- sull'anagrafica e ricompare al lookup delle vendite successive.
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS turista BOOLEAN NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
