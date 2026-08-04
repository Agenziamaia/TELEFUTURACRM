-- Mig. 159 — GENERE 'novita' 💣 (Luca 04/08): quinto tipo di comunicazione con
-- esplosione one-shot alla prima apertura. Stesso pattern di mig. 154 (update):
-- DROP+ADD del CHECK con l'array esteso. Nessuna riga storica cambia significato.
ALTER TABLE public.comunicazioni DROP CONSTRAINT IF EXISTS comunicazioni_type_check;
ALTER TABLE public.comunicazioni ADD CONSTRAINT comunicazioni_type_check
    CHECK (type = ANY (ARRAY['info'::text, 'warning'::text, 'success'::text, 'update'::text, 'novita'::text]));
NOTIFY pgrst, 'reload schema';
