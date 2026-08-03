-- Mig. 151 — FLUSSO PDA (Luca 03/08/2026): Gestione PDA e' la scrivania del
-- back office per le pratiche che arrivano da INVIA PDA (id 'PDA-%'), non per
-- le vendite di Registra Vendita. All'invio parte il task ⚡ ai designati
-- dell'incarico qui sotto (assegnabili da Utenti → Incarichi).
INSERT INTO public.incarichi (chiave, titolo, descrizione, fulmine) VALUES
  ('pda_inviata', 'PDA inviata dagli agenti',
   'Quando un agente invia una PDA da Invia PDA, ai designati (back office) arriva il task ⚡ con agente e contenuto: la pratica e'' da lavorare in Gestione PDA. Senza designati non parte nessun task.',
   true)
ON CONFLICT (chiave) DO NOTHING;
