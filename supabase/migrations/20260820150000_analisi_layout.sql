-- Layout dei widget della sezione Analisi, per utente (Luca 20/08: aree Io e
-- Negozio modulari come la Home — ordine sparso, taglie, aggiunte).
-- Forma: {"io": ["id@taglia", ...], "negozio": ["id@taglia", ...]}
alter table app_users add column if not exists analisi_layout jsonb;
