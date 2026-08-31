-- ═══ I TAGLI SI LEGGONO, NON SI TOCCANO DAL BROWSER ════════════════════════
-- La policy di prima era `for all ... using (tf_uid is not null)`: con `for
-- all` e senza `with check`, l'INSERT resta chiuso ma UPDATE e DELETE no —
-- cioè chiunque sia loggato nel CRM avrebbe potuto svuotare il listino dei
-- tagli dalla console del browser. Non è un dato segreto, ma è
-- CONFIGURAZIONE: la cambia l'amministrazione da una schermata, e domani la
-- riscrive l'API del fornitore. Dal browser si legge e basta.
drop policy if exists tf_blindata on public.paystore_tagli;
create policy tf_blindata on public.paystore_tagli
  for select to public
  using (((current_setting('request.jwt.claims', true))::json ->> 'tf_uid') is not null);
