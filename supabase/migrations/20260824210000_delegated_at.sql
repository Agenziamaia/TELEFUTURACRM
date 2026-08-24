-- QUANDO è stata fatta la delega/riassegnazione (Luca 24/08: riprovando il
-- 📦 su Verdile il popup non diceva che le pratiche erano GIÀ in carico a
-- Goretti — serve la data/ora da mostrare). Scritta dalla riassegnazione in
-- scheda utente e dalle deleghe del Tracking (singola e massiva).
alter table public.contracts add column if not exists delegated_at timestamptz;
