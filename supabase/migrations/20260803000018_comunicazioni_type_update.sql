-- Mig. 154 — TIPO "update" nelle comunicazioni (Luca 03/08): l'editor offre
-- 🚀 Update dal 03/08 sera ma il CHECK a DB conosceva solo info/warning/success
-- → "violates check constraint comunicazioni_type_check" al primo invio vero.
ALTER TABLE public.comunicazioni DROP CONSTRAINT IF EXISTS comunicazioni_type_check;
ALTER TABLE public.comunicazioni ADD CONSTRAINT comunicazioni_type_check
  CHECK (type = ANY (ARRAY['info'::text, 'warning'::text, 'success'::text, 'update'::text]));
NOTIFY pgrst, 'reload schema';
