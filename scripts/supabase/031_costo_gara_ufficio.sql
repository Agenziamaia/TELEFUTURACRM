-- 031: costo gara (utente) + costo negozio + sede "Ufficio" (call center + back office)
-- company_cost (già esistente) = costo azienda, informazione INTERNA.
-- costo_gara = costo ATTRIBUITO al collaboratore, visibile nello schema costi/ricavi del punto vendita.

ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS costo_gara NUMERIC(10,2);

-- costo attribuito al punto vendita (per lo schema costi/ricavi)
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS cost NUMERIC(10,2);

-- "Ufficio": punto vendita per call center + back office
INSERT INTO public.stores (name, company) VALUES ('Ufficio', 'Telefutura')
ON CONFLICT (name) DO NOTHING;

NOTIFY pgrst, 'reload schema';
