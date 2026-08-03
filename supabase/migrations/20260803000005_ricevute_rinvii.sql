-- 141: RINVII TRACCIATI sulle comunicazioni (03/08). Il "Più tardi" del
-- pop-up prima viveva solo nel localStorage del dispositivo: il mittente
-- non poteva sapere quante comunicazioni fossero state rinviate. Ora ogni
-- rinvio scrive rinviato_il (ultimo) e incrementa il contatore rinvii.
ALTER TABLE public.comunicazioni_ricevute ADD COLUMN IF NOT EXISTS rinviato_il TIMESTAMPTZ;
ALTER TABLE public.comunicazioni_ricevute ADD COLUMN IF NOT EXISTS rinvii INT NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';
