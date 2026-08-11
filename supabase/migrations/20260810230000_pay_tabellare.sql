-- ============================================================
-- PAY TABELLARE (cantiere GARE 10/08/2026)
-- Il "pagamento a tabella" dei ragazzi: raggiunta una soglia di
-- rete, ogni attivazione viene pagata a tabella secondo il tipo
-- di offerta. Le righe sono ANCORATE AL CATALOGO per nome
-- (tipo_cliente / categoria / prodotto / offerta), stesso match
-- gerarchico di ce_compensi_brand: o l'offerta ha la sua riga o
-- non genera commissioning (scoperture visibili nel Calcolatore).
--   - pay_piste : i KPI del brand nel mese (mobile, fisso, ...)
--   - pay_soglie: la scala soglie della pista (range di punti)
--   - pay_righe : € per attivazione per soglia + punti in soglia
-- I "gettoni unici" (pagati a prescindere dalla soglia, es. CB e
-- telefoni a rate W3) sono righe con gettone=true (importo in
-- pay_base, pista facoltativa).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pay_piste (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand TEXT NOT NULL,              -- catalog_brands.id (windtre, vodafone, ...)
  month DATE NOT NULL CHECK (month = date_trunc('month', month)::date),
  chiave TEXT NOT NULL,             -- mobile, fisso, business_mobile, ...
  nome TEXT NOT NULL,
  um TEXT NOT NULL DEFAULT 'punti' CHECK (um IN ('punti','pezzi')),
  ordine INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (brand, month, chiave)
);

CREATE TABLE IF NOT EXISTS public.pay_soglie (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand TEXT NOT NULL,
  month DATE NOT NULL CHECK (month = date_trunc('month', month)::date),
  pista TEXT NOT NULL,              -- pay_piste.chiave
  tier INT NOT NULL CHECK (tier >= 1),
  soglia_da NUMERIC(12,2) NOT NULL, -- limite inferiore incluso
  soglia_a NUMERIC(12,2),           -- limite superiore incluso; NULL = ultima (>=)
  UNIQUE (brand, month, pista, tier)
);

CREATE TABLE IF NOT EXISTS public.pay_righe (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand TEXT NOT NULL,
  month DATE NOT NULL CHECK (month = date_trunc('month', month)::date),
  pista TEXT,                       -- NULL = fuori pista (solo gettone)
  nome TEXT NOT NULL,               -- etichetta visibile ("Mobile Pro · Ric.Auto MNP")
  tipo_cliente TEXT,                -- Consumer | Business | NULL = jolly
  categoria TEXT,                   -- nome categoria catalogo | NULL = jolly
  prodotto TEXT,                    -- nome prodotto catalogo | NULL = jolly
  offerta TEXT,                     -- nome offerta catalogo | NULL = jolly
  opzione TEXT,                     -- nome opzione richiesta | NULL = nessuna
  punti NUMERIC(8,2) NOT NULL DEFAULT 0,      -- "valore per soglia" della attivazione
  pay_base NUMERIC(10,2),                     -- "di cui base" sotto la 1ª soglia (o importo del gettone)
  pay_tiers NUMERIC(10,2)[] NOT NULL DEFAULT '{}',  -- € per attivazione a S1..Sn
  gettone BOOLEAN NOT NULL DEFAULT false,     -- true = paga a prescindere dalla soglia
  attivo BOOLEAN NOT NULL DEFAULT true,
  note TEXT,
  ordine INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pay_piste_bm  ON public.pay_piste(brand, month);
CREATE INDEX IF NOT EXISTS idx_pay_soglie_bm ON public.pay_soglie(brand, month);
CREATE INDEX IF NOT EXISTS idx_pay_righe_bm  ON public.pay_righe(brand, month);

-- RLS: come le altre tabelle gare (config letta dal client; le
-- scritture passeranno dietro il layer sicuro col progetto sicurezza)
ALTER TABLE public.pay_piste  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pay_soglie ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pay_righe  ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pay_piste_all  ON public.pay_piste;
DROP POLICY IF EXISTS pay_soglie_all ON public.pay_soglie;
DROP POLICY IF EXISTS pay_righe_all  ON public.pay_righe;
CREATE POLICY pay_piste_all  ON public.pay_piste  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY pay_soglie_all ON public.pay_soglie FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY pay_righe_all  ON public.pay_righe  FOR ALL USING (true) WITH CHECK (true);

-- Copy-forward mensile (come gare_copy_month)
CREATE OR REPLACE FUNCTION public.pay_copy_month(p_brand TEXT, p_from DATE, p_to DATE)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE res JSONB := '{}'::jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM pay_piste WHERE brand=p_brand AND month=p_to)
     OR EXISTS (SELECT 1 FROM pay_righe WHERE brand=p_brand AND month=p_to) THEN
    RETURN '{"esito":"saltato: mese destinazione non vuoto"}'::jsonb;
  END IF;
  INSERT INTO pay_piste (brand, month, chiave, nome, um, ordine)
    SELECT brand, p_to, chiave, nome, um, ordine FROM pay_piste WHERE brand=p_brand AND month=p_from;
  INSERT INTO pay_soglie (brand, month, pista, tier, soglia_da, soglia_a)
    SELECT brand, p_to, pista, tier, soglia_da, soglia_a FROM pay_soglie WHERE brand=p_brand AND month=p_from;
  INSERT INTO pay_righe (brand, month, pista, nome, tipo_cliente, categoria, prodotto, offerta, opzione,
                         punti, pay_base, pay_tiers, gettone, attivo, note, ordine)
    SELECT brand, p_to, pista, nome, tipo_cliente, categoria, prodotto, offerta, opzione,
           punti, pay_base, pay_tiers, gettone, attivo, note, ordine
    FROM pay_righe WHERE brand=p_brand AND month=p_from;
  res := jsonb_build_object('esito','copiato');
  RETURN res;
END $$;
