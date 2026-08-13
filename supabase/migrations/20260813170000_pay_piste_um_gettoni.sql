-- um «gettoni» per le piste a livelli (Bonus Completezza VF, Luca 13/08):
-- il CHECK ammetteva solo punti/pezzi e l'insert della pista falliva (23514).
alter table public.pay_piste drop constraint if exists pay_piste_um_check;
alter table public.pay_piste add constraint pay_piste_um_check
  check (um = any (array['punti'::text, 'pezzi'::text, 'gettoni'::text]));
notify pgrst, 'reload schema';
