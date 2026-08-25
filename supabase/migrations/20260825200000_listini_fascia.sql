-- FASCIA del listino terminali (cantiere gare Fastweb, 25/08/2026).
-- Il «Listino Terminali» Fastweb classifica ogni modello con una fascia di
-- prezzo (L/M/H) stampata sul pdf: serve all'extra gara telefoni per
-- preselezionare la fascia in Registra Vendita (L=Low, H=High, M spaccata
-- sul taglio dei 400 € della lettera; Apple/S26/Fold8 comandano per modello).
ALTER TABLE public.listini_terminali ADD COLUMN IF NOT EXISTS fascia TEXT;
