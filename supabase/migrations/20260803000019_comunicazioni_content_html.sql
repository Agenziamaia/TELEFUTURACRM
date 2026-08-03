-- Mig. 155 — TESTO RICCO nelle comunicazioni (Luca 03/08): l'EditorRicco
-- salva l'HTML formattato in content_html; content resta il testo puro per
-- compatibilita' (client vecchi, ricerche). Render SEMPRE via sanificaHtml.
ALTER TABLE public.comunicazioni ADD COLUMN IF NOT EXISTS content_html TEXT;
NOTIFY pgrst, 'reload schema';
