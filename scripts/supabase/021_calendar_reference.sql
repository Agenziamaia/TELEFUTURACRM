-- Calendar reference data: stores and operators (agents / meeting invitees)
-- Run after 002_calendar.sql. Used by Calendario for dropdowns and meeting recipients.

-- Stores (punti vendita)
CREATE TABLE IF NOT EXISTS public.calendar_stores (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Operators: agents + meeting users (name, store, brands for meeting filter)
CREATE TABLE IF NOT EXISTS public.calendar_operators (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  store TEXT NOT NULL,
  brands JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_operators_name_store ON public.calendar_operators(name, store);
CREATE INDEX IF NOT EXISTS idx_calendar_operators_store ON public.calendar_operators(store);
CREATE INDEX IF NOT EXISTS idx_calendar_operators_brands ON public.calendar_operators USING gin(brands);

ALTER TABLE public.calendar_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_operators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon calendar_stores" ON public.calendar_stores;
CREATE POLICY "Allow anon calendar_stores" ON public.calendar_stores FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon calendar_operators" ON public.calendar_operators;
CREATE POLICY "Allow anon calendar_operators" ON public.calendar_operators FOR ALL USING (true) WITH CHECK (true);

-- Seed default data (match previous mock)
INSERT INTO public.calendar_stores (name) VALUES
  ('Roma Centro (RM001)'),
  ('Roma Est (RM002)'),
  ('Milano Centrale (MI001)'),
  ('Milano Nord (MI002)'),
  ('Napoli Centro (NA001)')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.calendar_operators (name, store, brands) VALUES
  ('Luca Perotta', 'Roma Centro (RM001)', '["Wind3", "Vodafone"]'),
  ('Alessandro Sandri', 'Roma Est (RM002)', '["Wind3"]'),
  ('Marco Bianchi', 'Milano Centrale (MI001)', '["Tim", "Fastweb"]'),
  ('Giulia Rossi', 'Milano Nord (MI002)', '["Vodafone"]'),
  ('Venditore 1', 'Napoli Centro (NA001)', '["Wind3", "Tim"]')
ON CONFLICT (name, store) DO NOTHING;
