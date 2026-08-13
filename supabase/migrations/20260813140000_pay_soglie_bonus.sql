-- BONUS per soglia (Luca 13/08, W3 rete): sulle assicurazioni il
-- raggiungimento della soglia paga un PREMIO A VOLUME per PDV (slide 8 GARA
-- AGOSTO: S1 0 · S2 500 · S3 750 €) — vive sulla soglia stessa, non sulle
-- righe prodotto. La tabella soglie del pannello lo mostra sotto la soglia.
alter table public.pay_soglie add column if not exists bonus numeric;
comment on column public.pay_soglie.bonus is
  'Premio a volume al raggiungimento della soglia (es. assicurazioni W3: 0/500/750 € per PDV). NULL = nessun bonus.';
notify pgrst, 'reload schema';
