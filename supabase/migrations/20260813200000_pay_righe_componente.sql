-- COMPONENTI ADDITIVE del tabellare (cantiere Gare W3 da zero, 13/08/2026):
-- la lettera WindTre paga ogni attivazione come SOMMA di componenti — sul
-- mobile GA base (o base Underground) + MNP + Tied + P.IVA, sul fisso
-- attivazione base + convergenza + linea aggiuntiva + P.IVA + FTTH + FWA +
-- opzioni. Le righe con `componente` valorizzato sono componenti: il motore
-- sceglie la base della pista e somma le extra applicabili alla vendita
-- (attributi dedotti da categoria/prodotto/offerta/tipo cliente del catalogo).
-- NULL = riga intera classica (pick-one): tutti gli altri brand non cambiano.
alter table public.pay_righe add column if not exists componente text;
comment on column public.pay_righe.componente is
  'Modello additivo W3: base | base_underground | mnp | tied | piva | conv | la | ftth | fwa | opzioni. NULL = riga intera (pick-one classico).';
notify pgrst, 'reload schema';
