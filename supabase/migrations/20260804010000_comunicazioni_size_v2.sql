-- Mig. 158 — TAGLIE v2 delle comunicazioni (Luca 04/08): piccola = ex normale,
-- normale = ex grande, GRANDE nuova = popup quasi-fullscreen (in bacheca la
-- card resta normale con testi extra-large). La rimappatura avviene in UN solo
-- CASE per evitare doppi salti; il DEFAULT passa a 'piccola' perche' calendario
-- (inviti riunione, avvisi annullamento) e api/ai/action inseriscono SENZA size.
-- IDEMPOTENTE: la rimappatura gira solo finche' il default della colonna e'
-- ancora 'normale' (semantica vecchia) — al secondo giro non tocca nulla.
DO $$
BEGIN
    IF (SELECT column_default FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'comunicazioni' AND column_name = 'size') LIKE '%normale%' THEN
        UPDATE public.comunicazioni SET size = CASE size
            WHEN 'grande'  THEN 'normale'
            WHEN 'normale' THEN 'piccola'
            ELSE 'piccola'
        END;
        ALTER TABLE public.comunicazioni ALTER COLUMN size SET DEFAULT 'piccola';
    END IF;
END $$;

-- CHECK sui 3 valori (mig. 147 aveva creato la colonna senza vincolo)
ALTER TABLE public.comunicazioni DROP CONSTRAINT IF EXISTS comunicazioni_size_check;
ALTER TABLE public.comunicazioni ADD CONSTRAINT comunicazioni_size_check
    CHECK (size = ANY (ARRAY['piccola'::text, 'normale'::text, 'grande'::text]));

NOTIFY pgrst, 'reload schema';
