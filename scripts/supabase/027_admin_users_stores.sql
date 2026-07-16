-- 027: Amministrazione — anagrafica Negozi + Utenti (modello a due livelli)
-- Livello 1 = role (ruolo funzionale), Livello 2 = grade (grado).
-- Associazioni utente -> negozi (M:N) e utente -> brand (M:N).
-- NB: le identità nelle tabelle legacy (contracts.venditore, shifts.employee_name,
--     calls.caller, appointments.agente...) sono stringhe. app_users.match_name
--     e user_stores.store_name restano TEXT per agganciare l'attività esistente
--     senza dover migrare subito tutte le colonne a FK.
-- NB2: policy "anon" aperte come nel resto del progetto (RLS reale = milestone successiva).

-- ---------- NEGOZI ----------
CREATE TABLE IF NOT EXISTS public.stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  code TEXT,
  company TEXT,                 -- Telefutura / Telefutura 2SRL
  address TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ---------- UTENTI ----------
CREATE TABLE IF NOT EXISTS public.app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  match_name TEXT,              -- nome usato nelle tabelle legacy (default = full_name)
  email TEXT UNIQUE,
  phone TEXT,
  role TEXT NOT NULL,           -- Livello 1: venditore, store_manager, supervisore, caller,
                               --            direttore_cc, agente, direttore_ob, amministrativo, admin
  grade TEXT,                   -- Livello 2 (dipende dal ruolo)
  primary_store TEXT,           -- negozio principale (comodità)
  active BOOLEAN NOT NULL DEFAULT true,
  hire_date DATE,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_users_role ON public.app_users(role);
CREATE INDEX IF NOT EXISTS idx_app_users_match_name ON public.app_users(match_name);
CREATE INDEX IF NOT EXISTS idx_app_users_active ON public.app_users(active);

-- ---------- ASSOCIAZIONI ----------
CREATE TABLE IF NOT EXISTS public.user_stores (
  user_id UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  store_name TEXT NOT NULL,
  PRIMARY KEY (user_id, store_name)
);

CREATE TABLE IF NOT EXISTS public.user_brands (
  user_id UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  brand TEXT NOT NULL,
  PRIMARY KEY (user_id, brand)
);

-- ---------- RLS (temporaneo: anon aperto, come il resto del progetto) ----------
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_brands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon stores" ON public.stores;
CREATE POLICY "Allow anon stores" ON public.stores FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon app_users" ON public.app_users;
CREATE POLICY "Allow anon app_users" ON public.app_users FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon user_stores" ON public.user_stores;
CREATE POLICY "Allow anon user_stores" ON public.user_stores FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon user_brands" ON public.user_brands;
CREATE POLICY "Allow anon user_brands" ON public.user_brands FOR ALL USING (true) WITH CHECK (true);

-- ---------- SEED NEGOZI (i 13 reali; "Telefonico" = hub/magazzino) ----------
INSERT INTO public.stores (name, company) VALUES
  ('Magliana', 'Telefutura'),
  ('Donna', 'Telefutura'),
  ('Libia', 'Telefutura'),
  ('Collatina', 'Telefutura'),
  ('Mazzini', 'Telefutura'),
  ('San Paolo', 'Telefutura'),
  ('Garbatella', 'Telefutura'),
  ('Promontori', 'Telefutura'),
  ('Acilia', 'Telefutura'),
  ('Baleniere', 'Telefutura'),
  ('Castani', 'Telefutura'),
  ('Merulana', 'Telefutura'),
  ('Telefonico', 'Telefutura')
ON CONFLICT (name) DO NOTHING;

-- ---------- SEED UTENTE ADMIN ----------
INSERT INTO public.app_users (full_name, match_name, email, role, grade, active)
VALUES ('Luca Perotta', 'Luca Perotta', 'admin@test.com', 'admin', NULL, true)
ON CONFLICT (email) DO NOTHING;

-- ---------- Ricarica la cache dello schema (PostgREST) ----------
NOTIFY pgrst, 'reload schema';
