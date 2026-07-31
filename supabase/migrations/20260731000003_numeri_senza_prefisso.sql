-- Mig. 109 — Numeri SENZA prefisso in archivio (Luca 31/07/2026): si lavora
-- solo con l'Italia, il +39 non porta informazione. Le integrazioni lo
-- aggiungono al momento dell'invio (normalizzaE164 per Aircall, "39"+ per
-- WhatsApp), quindi in clients/calls/appointments i numeri stanno nudi:
-- solo cifre, senza +39/0039 e senza spazi.
-- Il registro telefonico grezzo (call_events) resta com'e': e' il log di
-- Aircall, il matching usa le ultime 9 cifre e la visualizzazione normalizza.

-- Stessa regola di numeroNazionale in src/lib/telefono.ts: via 00 iniziale,
-- via 39 SOLO se restano almeno 9 cifre — un cellulare di 10 cifre che
-- inizia per 391/392/393 non va scambiato per un numero prefissato.
create or replace function public.numero_nazionale(s text) returns text
language sql immutable as $$
    with d as (select regexp_replace(coalesce(s, ''), '\D', '', 'g') as v),
    e as (select case when v like '00%' then substr(v, 3) else v end as v from d)
    select case when v like '39%' and length(v) >= 11 then substr(v, 3) else v end from e
$$;

update public.clients set cellulare = public.numero_nazionale(cellulare)
where coalesce(cellulare, '') <> ''
  and public.numero_nazionale(cellulare) <> cellulare
  and length(public.numero_nazionale(cellulare)) >= 6;

update public.calls set numero = public.numero_nazionale(numero)
where coalesce(numero, '') <> ''
  and public.numero_nazionale(numero) <> numero
  and length(public.numero_nazionale(numero)) >= 6;

update public.calls set cellulare = public.numero_nazionale(cellulare)
where coalesce(cellulare, '') <> ''
  and public.numero_nazionale(cellulare) <> cellulare
  and length(public.numero_nazionale(cellulare)) >= 6;

update public.appointments set customer_phone = public.numero_nazionale(customer_phone)
where coalesce(customer_phone, '') <> ''
  and public.numero_nazionale(customer_phone) <> customer_phone
  and length(public.numero_nazionale(customer_phone)) >= 6;
