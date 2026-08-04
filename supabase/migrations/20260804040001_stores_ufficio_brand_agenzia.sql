-- 159: STORES — FLAG UFFICIO, BRAND DEL NEGOZIO, PV VIRTUALE "AGENZIA" (04/08).
-- (a) is_ufficio: toglie "Ufficio" e "Ufficio Commerciale" dalla sezione Turni
--     e da Orari & Chiusure SENZA toccare le righe: sono primary_store di 9
--     utenti attivi, base delle caselle email e "Ufficio Commerciale" e'
--     semantica dell'anagrafica clienti (clients.acquisito_da, mig. 108).
--     Le 9 persone degli uffici restano selezionabili come coperture.
-- (b) brand_negozio ('windtre' | 'vodafone' | 'multibrand' | NULL): logo del
--     punto vendita nella sezione Turni. NON si usa stores.brands, riservata
--     alle comunicazioni mirate (popolarla attiverebbe il targeting brand).
-- (c) "Agenzia": punto vendita VIRTUALE per registrare i contratti della
--     outbound — active=true e selezionabile ovunque, ma is_ufficio=true
--     quindi fuori da Turni e Orari & Chiusure.
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS is_ufficio BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS brand_negozio TEXT;

UPDATE public.stores SET is_ufficio = true WHERE name IN ('Ufficio', 'Ufficio Commerciale');

-- PV virtuale "Agenzia": guard anti-doppio sul nome (name e' comunque UNIQUE).
-- Colonne NOT NULL di stores: name e active (verificato a DB il 04/08); si
-- replicano i default delle righe esistenti — company Telefutura, orari
-- 09:30–19:30 (mig. 144) — il resto resta ai default di colonna.
INSERT INTO public.stores (name, company, active, is_ufficio, orario_apertura, orario_chiusura)
SELECT 'Agenzia', 'Telefutura', true, true, '09:30'::time, '19:30'::time
WHERE NOT EXISTS (SELECT 1 FROM public.stores WHERE name = 'Agenzia');

-- SEED brand_negozio, solo dove non gia' amministrato (WHERE ... IS NULL =
-- rieseguibile senza sovrascrivere modifiche fatte poi dal pannello Negozi).
-- Fonti: suffisso del nome per le coppie ( W3 /  VS /  Multi), store_category
-- per le righe certe, risposte di Luca del 04/08 per i 7 negozi senza dati.
UPDATE public.stores SET brand_negozio = 'windtre'
 WHERE brand_negozio IS NULL AND (name LIKE '% W3'
    OR store_category = 'Franchising W3'
    OR name IN ('Mazzini', 'Libia', 'San Paolo'));
UPDATE public.stores SET brand_negozio = 'vodafone'
 WHERE brand_negozio IS NULL AND (name LIKE '% VS'
    OR store_category = 'Vodafone Store'
    OR name IN ('Castani', 'Merulana'));
UPDATE public.stores SET brand_negozio = 'multibrand'
 WHERE brand_negozio IS NULL AND (name LIKE '% Multi'
    OR store_category = 'Multi Brand Puri'
    OR name IN ('Donna', 'Donna Olimpia', 'Garbatella'));
-- "Agenzia" e i due uffici restano NULL → icona generica 🏬.

NOTIFY pgrst, 'reload schema';
