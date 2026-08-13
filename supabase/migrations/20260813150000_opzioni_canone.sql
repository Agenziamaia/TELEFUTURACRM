-- CANONE SULLE OPZIONI (Luca 13/08, cantiere W3): alcune opzioni di Registra
-- Vendita sono pagate A CANONE dalla lettera di gara (es. 2°Linea business:
-- canone 10 €, conteggiata 1,5 in soglia) e non a gettone one-shot — il
-- pannello Canoni le mostra nella sezione «Opzioni a canone».
alter table public.catalog_opzioni add column if not exists canone_mensile numeric;
comment on column public.catalog_opzioni.canone_mensile is
  'Canone mensile dell''opzione quando la lettera la paga a moltiplicatore (es. 2°Linea W3 = 10 €). NULL = opzione a gettone/one-shot.';
notify pgrst, 'reload schema';
