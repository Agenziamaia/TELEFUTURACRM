-- ═══ IL LEGAME FRA L'OPERATORE E LA SUA VOCE DI CATALOGO ═══════════════════
-- Il pannello PayStore deve sapere QUALE voce di `marg_items` usare per la
-- ricarica di un certo operatore: è quella voce a portare il reparto 1 e
-- l'esenzione IVA fino allo scontrino.
--
-- ⚠️ NON PER NOME. Legarsi a «Ricarica TIM» vorrebbe dire che il giorno in cui
-- qualcuno rinomina la voce dal pannello Marginalità — cosa che può fare, ed è
-- giusto che possa — le ricariche TIM smettono di trovare il loro reparto. Il
-- guasto sarebbe silenzioso fino alla cassa. Una colonna esplicita regge il
-- rename.
alter table public.marg_items
  add column if not exists paystore_operatore text;

comment on column public.marg_items.paystore_operatore is
  'Operatore ricaricabile (tim, vodafone, …) di cui questa voce porta il dato fiscale. Solo per le voci PayStore.';

create unique index if not exists marg_items_paystore_operatore_uniq
  on public.marg_items (paystore_operatore) where paystore_operatore is not null;

update public.marg_items m set paystore_operatore = v.op
from (values
  ('Ricarica TIM','tim'), ('Ricarica Vodafone','vodafone'), ('Ricarica WindTre','windtre'),
  ('Ricarica Iliad','iliad'), ('Ricarica Fastweb Mobile','fastweb'), ('Ricarica ho. Mobile','ho'),
  ('Ricarica Very Mobile','very'), ('Ricarica Kena Mobile','kena'), ('Ricarica PosteMobile','poste'),
  ('Ricarica CoopVoce','coopvoce'), ('Ricarica Lycamobile','lyca'), ('Ricarica Spusu','spusu'),
  ('Ricarica Tiscali Mobile','tiscali'), ('Ricarica 1Mobile','unomobile'), ('Ricarica Digi Mobil','digi'),
  ('Ricarica Optima Mobile','optima'), ('Ricarica WithU Mobile','withu'), ('Ricarica Daily Telecom','daily')
) as v(nome, op)
where m.name = v.nome and m.brand = 'PayStore';
