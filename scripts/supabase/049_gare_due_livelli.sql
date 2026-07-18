-- 049: GARE A DUE LIVELLI, per brand e per mese (month = primo giorno del mese).
-- LATO AZIENDA (gare_azienda_*): le condizioni che l'OPERATORE dà a Telefutura (lettera di gara).
-- LATO RAGAZZI (gare_ragazzi_*): la gara interna semplificata per la squadra. Il brand ragazzi può
-- ACCORPARE brand azienda (es. 'vodafone' = Vodafone Store + VND insieme) e il reward per tier può
-- essere pay a tabella retroattivo, moltiplicatore o bonus.
-- Tabelle piatte e auto-descrittive (brand+month+pista leggibili in ogni riga): editabili via REST
-- anche da un agente AI. Sostituisce brand_soglie (vuota). Separazione per TABELLA: con il login,
-- i ragazzi leggeranno solo gare_ragazzi_*.

-- ---------- LATO AZIENDA ----------

CREATE TABLE IF NOT EXISTS public.gare_azienda_piste (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand TEXT NOT NULL,
  month DATE NOT NULL CHECK (month = date_trunc('month', month)::date),
  codice TEXT NOT NULL,
  nome TEXT NOT NULL,
  descrizione TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (brand, month, codice)
);

CREATE TABLE IF NOT EXISTS public.gare_azienda_soglie (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand TEXT NOT NULL,
  month DATE NOT NULL CHECK (month = date_trunc('month', month)::date),
  pista TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'pdv' CHECK (scope IN ('pdv','ragione_sociale')),
  cluster TEXT,
  store_name TEXT REFERENCES public.stores(name) ON UPDATE CASCADE ON DELETE CASCADE,
  tier INT NOT NULL CHECK (tier >= 1),
  soglia_valore NUMERIC(12,2) NOT NULL,
  soglia_um TEXT NOT NULL DEFAULT 'punti',
  reward_tipo TEXT CHECK (reward_tipo IN ('bonus','moltiplicatore','pay','sblocco')),
  reward_valore NUMERIC(12,2),
  reward_um TEXT,
  reward_descr TEXT,
  girata_ai_ragazzi BOOLEAN NOT NULL DEFAULT false,
  note TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (brand, month, pista) REFERENCES public.gare_azienda_piste(brand, month, codice)
    ON UPDATE CASCADE ON DELETE CASCADE,
  UNIQUE NULLS NOT DISTINCT (brand, month, pista, scope, cluster, store_name, tier)
);

CREATE TABLE IF NOT EXISTS public.gare_azienda_voci (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand TEXT NOT NULL,
  month DATE NOT NULL CHECK (month = date_trunc('month', month)::date),
  pista TEXT NOT NULL,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('punti','gettone','bonus','moltiplicatore','pay_ricorrente')),
  valore NUMERIC(12,2),
  um TEXT,
  condizione TEXT,
  scope TEXT NOT NULL DEFAULT 'pdv' CHECK (scope IN ('pdv','ragione_sociale')),
  girata_ai_ragazzi BOOLEAN NOT NULL DEFAULT false,
  note TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (brand, month, pista) REFERENCES public.gare_azienda_piste(brand, month, codice)
    ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.gare_azienda_regole (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand TEXT NOT NULL,
  month DATE NOT NULL CHECK (month = date_trunc('month', month)::date),
  pista TEXT,
  tipo TEXT NOT NULL CHECK (tipo IN ('malus','gate','storno')),
  condizione TEXT NOT NULL,
  effetto TEXT NOT NULL,
  valore NUMERIC(12,2),
  um TEXT,
  bersaglio TEXT,
  scope TEXT NOT NULL DEFAULT 'pdv' CHECK (scope IN ('pdv','ragione_sociale')),
  girata_ai_ragazzi BOOLEAN NOT NULL DEFAULT false,
  note TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (brand, month, pista) REFERENCES public.gare_azienda_piste(brand, month, codice)
    ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.gare_azienda_negozi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand TEXT NOT NULL,
  month DATE NOT NULL CHECK (month = date_trunc('month', month)::date),
  store_name TEXT NOT NULL REFERENCES public.stores(name) ON UPDATE CASCADE ON DELETE CASCADE,
  cluster TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (brand, month, store_name)
);

-- ---------- LATO RAGAZZI ----------
-- brand qui è il brand DELLA GARA RAGAZZI: può accorpare più brand azienda (es. 'vodafone' = vs+vnd).

CREATE TABLE IF NOT EXISTS public.gare_ragazzi_soglie (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand TEXT NOT NULL,
  month DATE NOT NULL CHECK (month = date_trunc('month', month)::date),
  tier INT NOT NULL DEFAULT 1 CHECK (tier >= 1),
  nome TEXT NOT NULL,
  soglia_valore NUMERIC(12,2) NOT NULL,
  soglia_um TEXT NOT NULL DEFAULT 'punti',
  reward_tipo TEXT NOT NULL DEFAULT 'pay_tabella' CHECK (reward_tipo IN ('pay_tabella','moltiplicatore','bonus')),
  reward_valore NUMERIC(12,2),               -- es. 2 (x2 sul canone) o 300 (bonus €); NULL per pay_tabella
  reward_um TEXT,                            -- 'x'|'eur'
  reward_descr TEXT,                         -- es. 'moltiplicatore del canone'
  descrizione TEXT,
  premio_note TEXT,
  metric_id UUID REFERENCES public.target_metrics(id) ON DELETE SET NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (brand, month, tier)
);

CREATE TABLE IF NOT EXISTS public.gare_ragazzi_pay (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand TEXT NOT NULL,
  month DATE NOT NULL CHECK (month = date_trunc('month', month)::date),
  attivazione TEXT NOT NULL,
  importo NUMERIC(12,2) NOT NULL,
  retroattivo BOOLEAN NOT NULL DEFAULT true,
  tier_min INT NOT NULL DEFAULT 1,
  metric_id UUID REFERENCES public.target_metrics(id) ON DELETE SET NULL,
  note TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (brand, month, attivazione, tier_min)
);

-- ---------- INDICI ----------
CREATE INDEX IF NOT EXISTS idx_ga_piste_bm   ON public.gare_azienda_piste(brand, month);
CREATE INDEX IF NOT EXISTS idx_ga_soglie_bm  ON public.gare_azienda_soglie(brand, month);
CREATE INDEX IF NOT EXISTS idx_ga_voci_bm    ON public.gare_azienda_voci(brand, month);
CREATE INDEX IF NOT EXISTS idx_ga_regole_bm  ON public.gare_azienda_regole(brand, month);
CREATE INDEX IF NOT EXISTS idx_ga_negozi_bm  ON public.gare_azienda_negozi(brand, month);
CREATE INDEX IF NOT EXISTS idx_gr_soglie_bm  ON public.gare_ragazzi_soglie(brand, month);
CREATE INDEX IF NOT EXISTS idx_gr_pay_bm     ON public.gare_ragazzi_pay(brand, month);

-- ---------- COPY-FORWARD MENSILE (RPC: POST /rest/v1/rpc/gare_copy_month) ----------
CREATE OR REPLACE FUNCTION public.gare_copy_month(p_brand TEXT, p_from DATE, p_to DATE, p_livello TEXT DEFAULT 'tutto')
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE res JSONB := '{}'::jsonb;
BEGIN
  IF p_livello IN ('azienda','tutto') THEN
    IF EXISTS (SELECT 1 FROM gare_azienda_piste WHERE brand=p_brand AND month=p_to)
       OR EXISTS (SELECT 1 FROM gare_azienda_negozi WHERE brand=p_brand AND month=p_to) THEN
      res := res || '{"azienda":"saltato: mese destinazione non vuoto"}'::jsonb;
    ELSE
      INSERT INTO gare_azienda_negozi (brand, month, store_name, cluster, note)
        SELECT brand, p_to, store_name, cluster, note FROM gare_azienda_negozi WHERE brand=p_brand AND month=p_from;
      INSERT INTO gare_azienda_piste (brand, month, codice, nome, descrizione, sort_order)
        SELECT brand, p_to, codice, nome, descrizione, sort_order FROM gare_azienda_piste WHERE brand=p_brand AND month=p_from;
      INSERT INTO gare_azienda_soglie (brand, month, pista, scope, cluster, store_name, tier, soglia_valore, soglia_um,
                                       reward_tipo, reward_valore, reward_um, reward_descr, girata_ai_ragazzi, note, sort_order)
        SELECT brand, p_to, pista, scope, cluster, store_name, tier, soglia_valore, soglia_um,
               reward_tipo, reward_valore, reward_um, reward_descr, girata_ai_ragazzi, note, sort_order
        FROM gare_azienda_soglie WHERE brand=p_brand AND month=p_from;
      INSERT INTO gare_azienda_voci (brand, month, pista, nome, tipo, valore, um, condizione, scope, girata_ai_ragazzi, note, sort_order)
        SELECT brand, p_to, pista, nome, tipo, valore, um, condizione, scope, girata_ai_ragazzi, note, sort_order
        FROM gare_azienda_voci WHERE brand=p_brand AND month=p_from;
      INSERT INTO gare_azienda_regole (brand, month, pista, tipo, condizione, effetto, valore, um, bersaglio, scope, girata_ai_ragazzi, note, sort_order)
        SELECT brand, p_to, pista, tipo, condizione, effetto, valore, um, bersaglio, scope, girata_ai_ragazzi, note, sort_order
        FROM gare_azienda_regole WHERE brand=p_brand AND month=p_from;
      res := res || '{"azienda":"copiato"}'::jsonb;
    END IF;
  END IF;
  IF p_livello IN ('ragazzi','tutto') THEN
    IF EXISTS (SELECT 1 FROM gare_ragazzi_soglie WHERE brand=p_brand AND month=p_to)
       OR EXISTS (SELECT 1 FROM gare_ragazzi_pay WHERE brand=p_brand AND month=p_to) THEN
      res := res || '{"ragazzi":"saltato: mese destinazione non vuoto"}'::jsonb;
    ELSE
      INSERT INTO gare_ragazzi_soglie (brand, month, tier, nome, soglia_valore, soglia_um, reward_tipo, reward_valore,
                                       reward_um, reward_descr, descrizione, premio_note, metric_id, sort_order)
        SELECT brand, p_to, tier, nome, soglia_valore, soglia_um, reward_tipo, reward_valore,
               reward_um, reward_descr, descrizione, premio_note, metric_id, sort_order
        FROM gare_ragazzi_soglie WHERE brand=p_brand AND month=p_from;
      INSERT INTO gare_ragazzi_pay (brand, month, attivazione, importo, retroattivo, tier_min, metric_id, note, sort_order)
        SELECT brand, p_to, attivazione, importo, retroattivo, tier_min, metric_id, note, sort_order
        FROM gare_ragazzi_pay WHERE brand=p_brand AND month=p_from;
      res := res || '{"ragazzi":"copiato"}'::jsonb;
    END IF;
  END IF;
  RETURN res;
END $$;

-- ---------- RLS (anon aperta come il resto del progetto) ----------
ALTER TABLE public.gare_azienda_piste ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon gare_azienda_piste" ON public.gare_azienda_piste;
CREATE POLICY "Allow anon gare_azienda_piste" ON public.gare_azienda_piste FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.gare_azienda_soglie ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon gare_azienda_soglie" ON public.gare_azienda_soglie;
CREATE POLICY "Allow anon gare_azienda_soglie" ON public.gare_azienda_soglie FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.gare_azienda_voci ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon gare_azienda_voci" ON public.gare_azienda_voci;
CREATE POLICY "Allow anon gare_azienda_voci" ON public.gare_azienda_voci FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.gare_azienda_regole ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon gare_azienda_regole" ON public.gare_azienda_regole;
CREATE POLICY "Allow anon gare_azienda_regole" ON public.gare_azienda_regole FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.gare_azienda_negozi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon gare_azienda_negozi" ON public.gare_azienda_negozi;
CREATE POLICY "Allow anon gare_azienda_negozi" ON public.gare_azienda_negozi FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.gare_ragazzi_soglie ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon gare_ragazzi_soglie" ON public.gare_ragazzi_soglie;
CREATE POLICY "Allow anon gare_ragazzi_soglie" ON public.gare_ragazzi_soglie FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.gare_ragazzi_pay ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon gare_ragazzi_pay" ON public.gare_ragazzi_pay;
CREATE POLICY "Allow anon gare_ragazzi_pay" ON public.gare_ragazzi_pay FOR ALL USING (true) WITH CHECK (true);

-- ---------- DISAMBIGUAZIONE col sistema Target interno ----------
COMMENT ON TABLE public.gare IS 'Sistema TARGET interni (obiettivi a persone/negozi + sblocco commissioning). NON è la sezione Gare brand: quella usa gare_azienda_* e gare_ragazzi_*.';
COMMENT ON TABLE public.gare_azienda_piste IS 'Sezione Gare, lato AZIENDA: piste della lettera di gara mensile dell''operatore. Figlie: gare_azienda_soglie / _voci / _regole.';
COMMENT ON TABLE public.gare_ragazzi_soglie IS 'Sezione Gare, lato RAGAZZI: soglie mensili di gruppo della gara interna. Il brand può accorpare brand azienda (es. vodafone = vs+vnd). Con reward_tipo=pay_tabella si applica gare_ragazzi_pay (retroattivo).';

-- ---------- SOSTITUZIONE brand_soglie (vuota) ----------
DROP TABLE IF EXISTS public.brand_soglie;

NOTIFY pgrst, 'reload schema';
