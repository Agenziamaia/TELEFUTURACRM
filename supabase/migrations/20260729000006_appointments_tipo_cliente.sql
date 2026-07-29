-- Flag consumer/business sull'appuntamento (Luca 29/07): decide l'etichetta
-- del campo fiscale (CF vs P.IVA) nel form e nel dettaglio del calendario.
alter table public.appointments add column if not exists tipo_cliente text;
NOTIFY pgrst, 'reload schema';
