-- 106: ESITI DEL CALENDARIO amministrabili (Luca 30/07). Per ogni TIPO di
-- evento — appuntamento in negozio (incoming), a domicilio (outgoing), task —
-- la lista degli esiti vive a DB e si gestisce da Amministrazione ->
-- Calendario. `chiave` e' il valore salvato sulle righe (appointments.status,
-- calendar_tasks.status) e NON si cambia dal pannello (la storia la usa);
-- etichetta, colore (palette fissa in codice), ordine e attiva sono la resa.
-- Seed = esiti storici in codice, identici per negozio e domicilio.
-- Tabella vuota o non raggiungibile = default di codice.
CREATE TABLE IF NOT EXISTS public.calendario_esiti (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL,          -- incoming | outgoing | task
  chiave TEXT NOT NULL,
  etichetta TEXT NOT NULL,
  colore TEXT NOT NULL DEFAULT 'slate',
  ordine INT NOT NULL DEFAULT 0,
  attiva BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tipo, chiave)
);
ALTER TABLE public.calendario_esiti ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon calendario_esiti" ON public.calendario_esiti;
CREATE POLICY "Allow anon calendario_esiti" ON public.calendario_esiti FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.calendario_esiti (tipo, chiave, etichetta, colore, ordine) VALUES
  ('incoming','scheduled','Programmato','blue',10),
  ('incoming','attivato','Attivato','emerald',20),
  ('incoming','ko','KO','rose',30),
  ('incoming','in_gestione','In Gestione','purple',40),
  ('incoming','da_richiamare','Da Richiamare','yellow',50),
  ('incoming','da_rifissare','Da Rifissare','amber',60),
  ('incoming','annullato','Annullato','orange',70),
  ('outgoing','scheduled','Programmato','blue',10),
  ('outgoing','attivato','Attivato','emerald',20),
  ('outgoing','ko','KO','rose',30),
  ('outgoing','in_gestione','In Gestione','purple',40),
  ('outgoing','da_richiamare','Da Richiamare','yellow',50),
  ('outgoing','da_rifissare','Da Rifissare','amber',60),
  ('outgoing','annullato','Annullato','orange',70),
  ('task','da_fare','Da fare','slate',10),
  ('task','fatta','Fatta','emerald',20),
  ('task','sospesa','Sospesa','amber',30),
  ('task','abbandonata','Abbandonata','rose',40)
ON CONFLICT (tipo, chiave) DO NOTHING;

NOTIFY pgrst, 'reload schema';
