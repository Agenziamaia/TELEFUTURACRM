-- EX NON CONFORME (Luca 27/08): quando il negozio RI-ESITA una pratica che
-- l'admin aveva marcato Non Conforme, l'esito admin passa DA SOLO a
-- «EX Non Conforme» — la pratica è marchiata (resta nel filtro non conformi
-- finché non torna in uno stato definitivo) ma rivive il ciclo normale e il
-- malus giornaliero smette di maturare (quanto generato resta archiviato).
-- Qui l'esito nelle liste amministrabili, per ogni categoria che ha il NC.
insert into tracking_esiti (categoria, brand, lato, chiave, etichetta, colore, bg, ordine, attiva, completata)
select te.categoria, te.brand, te.lato, 'ex_non_conforme', 'EX Non Conforme',
       'var(--tf-fbbf24)', 'var(--tf-451a03)', te.ordine + 1, true, false
from tracking_esiti te
where te.lato = 'admin' and te.chiave = 'non_conforme'
  and not exists (
    select 1 from tracking_esiti x
    where x.categoria = te.categoria and coalesce(x.brand, '') = coalesce(te.brand, '')
      and x.lato = 'admin' and x.chiave = 'ex_non_conforme');
