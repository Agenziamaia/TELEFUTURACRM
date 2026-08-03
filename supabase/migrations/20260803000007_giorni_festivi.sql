-- 143: GIORNI FESTIVI (03/08). I "giorni rossi" del calendario: mai contati
-- nei giorni EFFETTIVI di ferie (insieme alle domeniche, mai lavorative),
-- evidenziati nel calendario ferie e amministrabili dal pannello (bottone
-- "Festivi" della sezione Ferie, amministrativo in su).
CREATE TABLE IF NOT EXISTS public.giorni_festivi (
  giorno DATE PRIMARY KEY,
  nome TEXT NOT NULL DEFAULT ''
);
ALTER TABLE public.giorni_festivi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon giorni_festivi" ON public.giorni_festivi;
CREATE POLICY "Allow anon giorni_festivi" ON public.giorni_festivi FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.giorni_festivi (giorno, nome) VALUES
  ('2025-01-01','Capodanno'),('2025-01-06','Epifania'),('2025-04-21','Lunedì dell''Angelo'),
  ('2025-04-25','Liberazione'),('2025-05-01','Festa del Lavoro'),('2025-06-02','Festa della Repubblica'),
  ('2025-06-29','SS. Pietro e Paolo (Roma)'),('2025-08-15','Ferragosto'),('2025-11-01','Ognissanti'),
  ('2025-12-08','Immacolata'),('2025-12-25','Natale'),('2025-12-26','Santo Stefano'),
  ('2026-01-01','Capodanno'),('2026-01-06','Epifania'),('2026-04-06','Lunedì dell''Angelo'),
  ('2026-04-25','Liberazione'),('2026-05-01','Festa del Lavoro'),('2026-06-02','Festa della Repubblica'),
  ('2026-06-29','SS. Pietro e Paolo (Roma)'),('2026-08-15','Ferragosto'),('2026-11-01','Ognissanti'),
  ('2026-12-08','Immacolata'),('2026-12-25','Natale'),('2026-12-26','Santo Stefano'),
  ('2027-01-01','Capodanno'),('2027-01-06','Epifania'),('2027-03-29','Lunedì dell''Angelo'),
  ('2027-04-25','Liberazione'),('2027-05-01','Festa del Lavoro'),('2027-06-02','Festa della Repubblica'),
  ('2027-06-29','SS. Pietro e Paolo (Roma)'),('2027-08-15','Ferragosto'),('2027-11-01','Ognissanti'),
  ('2027-12-08','Immacolata'),('2027-12-25','Natale'),('2027-12-26','Santo Stefano'),
  ('2028-01-01','Capodanno'),('2028-01-06','Epifania'),('2028-04-17','Lunedì dell''Angelo'),
  ('2028-04-25','Liberazione'),('2028-05-01','Festa del Lavoro'),('2028-06-02','Festa della Repubblica'),
  ('2028-06-29','SS. Pietro e Paolo (Roma)'),('2028-08-15','Ferragosto'),('2028-11-01','Ognissanti'),
  ('2028-12-08','Immacolata'),('2028-12-25','Natale'),('2028-12-26','Santo Stefano')
ON CONFLICT (giorno) DO NOTHING;

NOTIFY pgrst, 'reload schema';
