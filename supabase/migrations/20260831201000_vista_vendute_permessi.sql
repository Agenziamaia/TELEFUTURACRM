-- La vista deve obbedire alle stesse regole delle tabelle che legge: con
-- `security_invoker` le policy RLS di `calls`, `clients` e `contracts` valgono
-- per CHI interroga, non per il proprietario della vista. Senza, una vista
-- sarebbe una porta di servizio aperta sopra la blindatura del 28/08.
alter view caller_pratiche_vendute set (security_invoker = on);
grant select on caller_pratiche_vendute to anon, authenticated, service_role;
