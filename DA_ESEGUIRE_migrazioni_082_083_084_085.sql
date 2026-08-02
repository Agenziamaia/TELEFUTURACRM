-- 082: CATALOGO MARGINALITÀ amministrabile (pannello in Amministrazione).
-- Sostituirà le liste hardcoded MARG_PRODUCTS di Registra Vendita al redesign del flusso.
-- Per ogni voce: IVA, regime margine (costo fisso -> utile = prezzo - costo azienda;
-- percent -> utile = prezzo × %), valore VISIBILE ai collaboratori (alimenterà le gare)
-- separato dal dato azienda, brand collegato (per l'auto-aggiunta dal flusso brand).

CREATE TABLE IF NOT EXISTS public.marg_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'prodotti' CHECK (kind IN ('prodotti','servizi')),
  sort_order INT DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marg_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES public.marg_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  brand TEXT,                          -- brand collegato (etichetta: WindTre, Vodafone, S4, Dojo, …); NULL = generico
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 22,
  cost_mode TEXT NOT NULL DEFAULT 'costo_fisso' CHECK (cost_mode IN ('costo_fisso','percent_margine')),
  company_cost NUMERIC(10,2),          -- regime costo_fisso: utile = prezzo vendita - costo azienda
  margin_percent NUMERIC(5,2),         -- regime percent: utile = prezzo vendita × % / 100
  default_price NUMERIC(10,2),         -- prezzo proposto (NULL = libero alla cassa)
  visible_value NUMERIC(10,2),         -- valore VISIBILE ai collaboratori (per gare/commissioning)
  auto_link BOOLEAN NOT NULL DEFAULT false,  -- si auto-aggiunge al carrello dal flusso brand (es. SIM)
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (category_id, name)
);
CREATE INDEX IF NOT EXISTS idx_marg_items_cat ON public.marg_items(category_id);

ALTER TABLE public.marg_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon marg_categories" ON public.marg_categories;
CREATE POLICY "Allow anon marg_categories" ON public.marg_categories FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.marg_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon marg_items" ON public.marg_items;
CREATE POLICY "Allow anon marg_items" ON public.marg_items FOR ALL USING (true) WITH CHECK (true);

-- Seed: fotografia delle voci oggi in Registra Vendita (MARG_PRODUCTS), con brand
-- pre-associato dove evidente. Costi/IVA/valori visibili da popolare dal pannello.
DO $$
DECLARE cid UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM public.marg_categories) THEN RETURN; END IF;

  INSERT INTO public.marg_categories (name, kind, sort_order) VALUES ('Prodotti','prodotti',0) RETURNING id INTO cid;
  INSERT INTO public.marg_items (category_id, name, sort_order) VALUES
    (cid,'PLX',0),(cid,'CN/CP',1),(cid,'New Cover',2),(cid,'Mem / Pen',3),(cid,'Orologio Cash',4),(cid,'Mi Band 6',5),(cid,'PowerBank',6),
    (cid,'Vendita Usato',7),  -- e' un PRODOTTO (decisione Luca): pesca dal magazzino usati del negozio
    (cid,'Accessori',8),(cid,'Telefoni Senior',9),(cid,'Ear Buds',10);  -- prodotti, non servizi (decisione Luca)

  INSERT INTO public.marg_categories (name, kind, sort_order) VALUES ('Servizi','servizi',1) RETURNING id INTO cid;
  INSERT INTO public.marg_items (category_id, name, sort_order) VALUES
    (cid,'Assistenza Tecnico',0),(cid,'Backup',1),(cid,'Riparazione',2),(cid,'Chiusura Sim/Fisso',3),
    (cid,'E.Telefono',4),(cid,'Extra Acc. Compass',5),(cid,'Salva Scontrino',6);

  INSERT INTO public.marg_categories (name, kind, sort_order) VALUES ('Kasko','servizi',2) RETURNING id INTO cid;
  INSERT INTO public.marg_items (category_id, name, sort_order) VALUES
    (cid,'Extra Margine Kasko',0),(cid,'PLKasko',1),(cid,'Kasko SV',2);

  INSERT INTO public.marg_categories (name, kind, sort_order) VALUES ('SIM','prodotti',3) RETURNING id INTO cid;
  INSERT INTO public.marg_items (category_id, name, brand, auto_link, sort_order) VALUES
    (cid,'Sim Wind3','WindTre',true,1),
    (cid,'Sim Vodafone','Vodafone',true,17),
    (cid,'Sim Fastweb','Fastweb',true,2),
    (cid,'Sost Fastweb','Fastweb',false,3),
    (cid,'Sim Iliad','Iliad',true,4),
    (cid,'Sim Sky','Sky',true,5),
    (cid,'Sim Ho.','Ho. Mobile',true,6),
    (cid,'Sim TIM','TIM',true,7),
    (cid,'Sost TIM','TIM',false,8),
    (cid,'Sost Vodafone','Vodafone',false,9),
    (cid,'Sost Wind3','WindTre',false,10),
    (cid,'Sim Very','Very Mobile',true,11),
    (cid,'Sost Very','Very Mobile',false,12),
    (cid,'Sim Kena','Kena Mobile',true,18),
    (cid,'Sim L',NULL,false,13),
    (cid,'Subentro/Reale Util.',NULL,false,15);

  INSERT INTO public.marg_categories (name, kind, sort_order) VALUES ('ESIM','prodotti',4) RETURNING id INTO cid;
  INSERT INTO public.marg_items (category_id, name, brand, sort_order) VALUES
    (cid,'ESIM Vodafone','Vodafone',0),(cid,'ESIM Fastweb','Fastweb',1),(cid,'ESIM Sost Fastweb','Fastweb',2),
    (cid,'ESIM Windtre','WindTre',3),(cid,'ESIM Sost Windtre','WindTre',4);

  INSERT INTO public.marg_categories (name, kind, sort_order) VALUES ('Telefono Cash','prodotti',5) RETURNING id INTO cid;
  INSERT INTO public.marg_items (category_id, name, sort_order) VALUES (cid,'Telefono Cash',0);
END $$;

NOTIFY pgrst, 'reload schema';
-- 083: chi ha FISSATO l'appuntamento (filtro "Fissato da" nel Calendario).
-- L'agente/consulente e' l'INCARICATO; created_by e' chi lo ha prenotato
-- (es. l'operatrice del call center). Gli appuntamenti storici restano NULL.
-- Il frontend scrive created_by in modo difensivo: se la colonna non c'e'
-- ancora (deploy prima della migrazione) ritenta l'insert senza.

ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS created_by TEXT;

NOTIFY pgrst, 'reload schema';
-- 084: richieste di ACCESSO AI DATI CLIENTE dal reparto Outbound.
-- Gli agenti vedono per intero solo i clienti che hanno inserito loro; degli
-- altri vedono solo nome/ragione sociale. Per il resto dei dati chiedono
-- l'autorizzazione all'amministrazione, che approva o rifiuta dalla pagina Clienti.

CREATE TABLE IF NOT EXISTS public.client_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  requested_by_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_by TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_car_requester ON public.client_access_requests(requested_by, status);

ALTER TABLE public.client_access_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon client_access_requests" ON public.client_access_requests;
CREATE POLICY "Allow anon client_access_requests" ON public.client_access_requests FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
-- 085: (a) ALLEGATI UTENTE per l'anagrafica (documenti, contratto di assunzione,
-- buste paga, altro) caricabili da admin/amministrativo/direzione generale;
-- (b) TASK URGENTI accanto alla campanella: cose DA FARE (es. "completa il nuovo
-- utente: costo, visibilita', brand"), distinte dalle Comunicazioni.

CREATE TABLE IF NOT EXISTS public.user_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'altro' CHECK (category IN ('documenti','contratto','buste_paga','altro')),
  file_url TEXT NOT NULL,
  file_name TEXT,
  uploaded_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_att ON public.user_attachments(user_id, category);

CREATE TABLE IF NOT EXISTS public.admin_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL DEFAULT 'generico',
  titolo TEXT NOT NULL,
  dettaglio TEXT,
  link TEXT,                              -- rotta interna da aprire (es. /amministrazione?sez=utenti)
  target_role TEXT NOT NULL DEFAULT 'admin',
  done BOOLEAN NOT NULL DEFAULT false,
  done_by TEXT,
  done_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_tasks_open ON public.admin_tasks(target_role, done);

ALTER TABLE public.user_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon user_attachments" ON public.user_attachments;
CREATE POLICY "Allow anon user_attachments" ON public.user_attachments FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.admin_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon admin_tasks" ON public.admin_tasks;
CREATE POLICY "Allow anon admin_tasks" ON public.admin_tasks FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
