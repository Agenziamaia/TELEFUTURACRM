-- LATO AZIENDA dei tabellari pay (direttiva Luca 11/08, lettera Fastweb T2):
-- le tabelle pay ora hanno due lati — 'ragazzi' (quello che paga il motore/
-- Calcolatore) e 'azienda' (le lettere di gara vere). Quando un brand ha SOLO
-- il lato azienda, il ragazzi si DERIVA a percentuale: pay_piste.perc_ragazzi
-- (es. Fastweb: mobile 60%, fisso 70%) — regolabile dal pannello Tabellari
-- Gare. Le righe fuori pista (gettoni) non vengono scalate.
ALTER TABLE public.pay_piste  ADD COLUMN IF NOT EXISTS lato TEXT NOT NULL DEFAULT 'ragazzi' CHECK (lato IN ('ragazzi','azienda'));
ALTER TABLE public.pay_soglie ADD COLUMN IF NOT EXISTS lato TEXT NOT NULL DEFAULT 'ragazzi' CHECK (lato IN ('ragazzi','azienda'));
ALTER TABLE public.pay_righe  ADD COLUMN IF NOT EXISTS lato TEXT NOT NULL DEFAULT 'ragazzi' CHECK (lato IN ('ragazzi','azienda'));
ALTER TABLE public.pay_piste  ADD COLUMN IF NOT EXISTS perc_ragazzi NUMERIC(5,2);
ALTER TABLE public.pay_piste  DROP CONSTRAINT IF EXISTS pay_piste_brand_month_chiave_key;
ALTER TABLE public.pay_piste  ADD CONSTRAINT pay_piste_brand_month_chiave_lato_key UNIQUE (brand, month, chiave, lato);
ALTER TABLE public.pay_soglie DROP CONSTRAINT IF EXISTS pay_soglie_brand_month_pista_tier_key;
ALTER TABLE public.pay_soglie ADD CONSTRAINT pay_soglie_brand_month_pista_tier_lato_key UNIQUE (brand, month, pista, tier, lato);
