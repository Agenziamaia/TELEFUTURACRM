-- SOSPENSIONE + LICENZIAMENTO CON DATA (MOD-33, Luca 10/08):
--   data_licenziamento — se impostata e <= oggi l'utente e' licenziato a tutti
--     gli effetti (il login lo nega e allinea status/active al primo tentativo);
--     una data futura = licenziamento PROGRAMMATO (resta attivo fino ad allora).
--   sospeso_dal — da quel giorno l'utente non puo' accedere al CRM finche'
--     l'amministrazione non lo riattiva (campo azzerato). NULL = non sospeso.
-- Il blocco e' doppio: route di login (server) + guardia sulle sessioni gia'
-- aperte (AuthContext, a ogni cambio pagina).
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS data_licenziamento date;
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS sospeso_dal date;

NOTIFY pgrst, 'reload schema';
