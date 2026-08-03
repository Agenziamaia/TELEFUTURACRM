-- 137: MOTIVO sulla richiesta di accesso ai dati cliente (03/08). Chi chiede
-- l'accesso deve spiegare PERCHE': il motivo si scrive al momento della
-- richiesta (campo obbligatorio nel modale della pagina Clienti) e resta
-- visibile all'amministrazione sulla richiesta pendente e nello storico.
ALTER TABLE public.client_access_requests ADD COLUMN IF NOT EXISTS motivo TEXT;

NOTIFY pgrst, 'reload schema';
