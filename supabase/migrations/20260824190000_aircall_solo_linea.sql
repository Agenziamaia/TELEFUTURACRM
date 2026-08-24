-- LINEA "SOLO CALLER" per utente (Luca 24/08, caso Sheekel Eban): lui usa
-- Aircall anche per chiamate che NON sono attività da call center — il ponte
-- verso le pratiche Caller deve scattare SOLO per le chiamate (in e out)
-- sulla sua linea dedicata 06 9480 1577. Se la colonna è valorizzata (cifre
-- del numero di linea), il webhook filtra; vuota = comportamento normale.
alter table public.app_users add column if not exists aircall_solo_linea text;
comment on column public.app_users.aircall_solo_linea is
  'Se valorizzata (cifre della linea Aircall), il ponte Caller considera solo le chiamate su quella linea';
