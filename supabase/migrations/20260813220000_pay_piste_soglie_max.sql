-- SOGLIE RAGAZZI TAGLIATE (Luca 13/08, modello W3): sul lato azienda la pista
-- può dichiarare soglie_max = quante soglie vedono i ragazzi nel derivato
-- (le prime N della STESSA scala: la loro S1 è la nostra S1, l'ultima diventa
-- aperta; i pay_tiers delle righe si tagliano uguale). NULL = tutte.
alter table public.pay_piste add column if not exists soglie_max int;
comment on column public.pay_piste.soglie_max is
  'Solo lato azienda: quante soglie vede il derivato ragazzi (prime N, S1=S1, ultima aperta). NULL = tutte. W3: mobile 3, fisso 3.';
notify pgrst, 'reload schema';
