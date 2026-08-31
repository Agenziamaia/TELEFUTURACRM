-- ═══ I TAGLI SOTTO LA STESSA REGOLA DI TUTTO IL RESTO ══════════════════════
-- La policy scritta stamattina era `to authenticated using (true)`: più larga
-- del resto del CRM, dove si legge solo con un token che porta `tf_uid` —
-- cioè con una sessione VERA del gestionale, non con la sola chiave pubblica.
-- Non è un buco teorico: la chiave anonima sta nel browser di chiunque apra
-- il sito, e con quella si sarebbe letto il listino.
-- Qui i tagli non sono un segreto, ma due regole diverse per la stessa cosa
-- sono il modo in cui, fra sei mesi, la più larga finisce su una tabella che
-- invece un segreto ce l'ha.
drop policy if exists paystore_tagli_lettura on public.paystore_tagli;
drop policy if exists tf_blindata on public.paystore_tagli;
create policy tf_blindata on public.paystore_tagli
  for all to public
  using (((current_setting('request.jwt.claims', true))::json ->> 'tf_uid') is not null);
