-- 101: INCARICHI per la Gestione Usati (Luca 29/07) + numero WhatsApp.
-- Due nuove funzioni designabili: ordini RICAMBI assistenza e BONIFICI
-- d'acquisto usato. Sull'incarico nasce il numero WhatsApp personale del
-- designato: per i bonifici ISTANTANEI (solo urgenze) oltre al task ⚡
-- parte anche il messaggio WhatsApp automatico.
ALTER TABLE public.incarichi ADD COLUMN IF NOT EXISTS whatsapp TEXT NOT NULL DEFAULT '';
INSERT INTO public.incarichi (chiave, titolo, descrizione) VALUES
  ('ricambi',  'Ordini ricambi assistenza', 'Riceve il task ⚡ quando in Gestione Usati un ricambio viene messo DA ORDINARE su un telefono in assistenza.'),
  ('bonifici', 'Bonifici acquisto usato',   'Riceve il task ⚡ quando un acquisto si chiude con BONIFICO; se il bonifico è ISTANTANEO (solo urgenze) arriva anche il messaggio WhatsApp sul numero indicato.')
ON CONFLICT (chiave) DO NOTHING;
NOTIFY pgrst, 'reload schema';
