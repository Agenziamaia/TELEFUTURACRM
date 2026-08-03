-- Mig. 149 — ORDINE MERCE (Luca 03/08/2026), due cose:
-- 1) EVASIONE PARZIALE: la quantita' INVIATA per riga (es. 6 su 10 richiesti,
--    ne mancano 4). Via la matita che cambiava la quantita' ordinata: i casi
--    sono tre — evasa per intero, parziale, non disponibile.
ALTER TABLE public.merchandise_order_items ADD COLUMN IF NOT EXISTS qty_sent INTEGER;

-- 2) INCARICO "Nuovo ordine merce": alla creazione di un ordine parte il
--    task ⚡ ai designati (assegnabili da Utenti → Incarichi), come per le
--    ferie e la chiusura linea. Fulmine gia' attivo: il punto E' il task.
INSERT INTO public.incarichi (chiave, titolo, descrizione, fulmine) VALUES
  ('ordine_merce', 'Nuovo ordine merce',
   'Quando un negozio crea un ordine in Ordine Merce, ai designati arriva il task ⚡ con negozio e contenuto. Senza designati non parte nessun task.',
   true)
ON CONFLICT (chiave) DO NOTHING;
