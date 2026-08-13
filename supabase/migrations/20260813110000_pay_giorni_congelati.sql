-- GIORNI CONGELATI del calendario gare (task Luca 13/08): giorni del mese in
-- cui tutti i negozi sono chiusi (es. 13-17 agosto) selezionabili dal
-- Calendario gare — escono dal conteggio automatico dei giorni lavorativi
-- (totali E trascorsi) come i festivi, così il numero non va più scritto a
-- mano e le proiezioni restano precise.
alter table public.pay_giorni_lavorativi
  add column if not exists congelati int[] not null default '{}';
comment on column public.pay_giorni_lavorativi.congelati is
  'Giorni del mese (1-31) congelati per le gare: tutti i negozi chiusi, esclusi dal conteggio dei giorni lavorativi come i festivi.';
notify pgrst, 'reload schema';
