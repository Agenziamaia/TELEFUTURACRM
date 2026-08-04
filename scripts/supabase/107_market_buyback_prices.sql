-- 107_market_buyback_prices.sql
-- Motore prezzi USATO (Francesco 04/08): cache locale dei prezzi di ricompra.
-- Il CRM NON interroga mai internet in tempo reale: un bottone admin "Sync"
-- popola queste tabelle; il front-end legge solo da qui (istantaneo).
--
-- Strategia "reverse pricing": si legge il prezzo di vendita del RICONDIZIONATO
-- (refurbed.it primario, trendevice.com fallback), si applica il margine
-- aziendale e si ottiene il prezzo massimo di ricompra per grado A/B/C.

-- ── Prezzi calcolati per modello/taglio ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.market_buyback_prices (
  id            BIGSERIAL PRIMARY KEY,
  categoria     TEXT NOT NULL DEFAULT 'smartphone',   -- smartphone|tablet|watch|computer
  brand         TEXT NOT NULL DEFAULT '',
  device_model  TEXT NOT NULL,                        -- es. "iPhone 14 Pro"
  storage       TEXT NOT NULL DEFAULT '',             -- es. "128GB" ('' = taglio unico/non noto)
  -- prezzo di ricompra MASSIMO (retail - margine) per grado
  grade_a_price NUMERIC(12,2),
  grade_b_price NUMERIC(12,2),
  grade_c_price NUMERIC(12,2),
  -- retail grezzo di riferimento (pre-margine) per trasparenza/debug
  retail_a      NUMERIC(12,2),
  retail_b      NUMERIC(12,2),
  retail_c      NUMERIC(12,2),
  market_source TEXT,                                 -- refurbed.it | trendevice.com
  margin_pct    NUMERIC(5,2),                         -- margine applicato al sync
  source_url    TEXT,
  last_updated  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (categoria, brand, device_model, storage)
);
CREATE INDEX IF NOT EXISTS idx_mbp_lookup
  ON public.market_buyback_prices (categoria, brand, device_model);

-- ── Impostazioni margine/refurb (regolabili da admin, niente hardcode) ──
CREATE TABLE IF NOT EXISTS public.pricing_settings (
  id                      INT PRIMARY KEY DEFAULT 1,
  margin_pct              NUMERIC(5,2) NOT NULL DEFAULT 40,   -- % sottratta al retail
  refurb_cost_smartphone  NUMERIC(10,2) NOT NULL DEFAULT 0,   -- costo fisso rigenerazione
  refurb_cost_tablet      NUMERIC(10,2) NOT NULL DEFAULT 0,
  refurb_cost_watch       NUMERIC(10,2) NOT NULL DEFAULT 0,
  refurb_cost_computer    NUMERIC(10,2) NOT NULL DEFAULT 0,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by              TEXT
);
INSERT INTO public.pricing_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ── Log dei sync (per il pannello admin: ultimo aggiornamento, esito) ──
CREATE TABLE IF NOT EXISTS public.price_sync_log (
  id             BIGSERIAL PRIMARY KEY,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at    TIMESTAMPTZ,
  devices_ok     INT NOT NULL DEFAULT 0,
  devices_failed INT NOT NULL DEFAULT 0,
  source         TEXT,
  by_user        TEXT,
  note           TEXT
);

-- ── RLS allow-all (coerente col resto del progetto: la sicurezza e' a livello app) ──
ALTER TABLE public.market_buyback_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_sync_log        ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='market_buyback_prices' AND policyname='p_mbp_all') THEN
    CREATE POLICY p_mbp_all ON public.market_buyback_prices FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pricing_settings' AND policyname='p_ps_all') THEN
    CREATE POLICY p_ps_all ON public.pricing_settings FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='price_sync_log' AND policyname='p_psl_all') THEN
    CREATE POLICY p_psl_all ON public.price_sync_log FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
