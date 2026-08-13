-- Coupon: scadenza (spec Francesco — stato "scaduto" nella lista Amministrazione).
-- NULL = non scade, finché non si definisce una policy di validità.
alter table public.coupons add column if not exists scadenza timestamptz;
comment on column public.coupons.scadenza is 'Scadenza coupon (stato scaduto). NULL = non scade finché non c''è una policy di validità.';
notify pgrst, 'reload schema';
