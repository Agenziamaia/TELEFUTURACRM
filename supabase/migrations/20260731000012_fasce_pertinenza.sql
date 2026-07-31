-- Mig. 118 (Luca 31/07):
-- 1) FASCE ORARIE sugli appuntamenti: in alternativa all'orario preciso si
--    sceglie Mattina (10:00-13:00) o Pomeriggio (16:00-19:30). La fascia vive
--    sull'evento di calendario e sulla pratica del call center.
-- 2) NEGOZIO DI PERTINENZA sulle pratiche caller: il punto vendita congruo
--    per il cliente (per i lead interni coincide col negozio di provenienza).

alter table public.appointments add column if not exists fascia text
    check (fascia is null or fascia in ('mattina','pomeriggio'));

alter table public.calls add column if not exists fascia_appuntamento text
    check (fascia_appuntamento is null or fascia_appuntamento in ('mattina','pomeriggio'));
alter table public.calls add column if not exists fascia_richiamo text
    check (fascia_richiamo is null or fascia_richiamo in ('mattina','pomeriggio'));
alter table public.calls add column if not exists negozio_pertinenza text;

-- backfill: per i lead INTERNI la pertinenza e' il negozio di provenienza
update public.calls
   set negozio_pertinenza = negozio_provenienza
 where (negozio_pertinenza is null or negozio_pertinenza = '')
   and provenienza = 'Interno'
   and negozio_provenienza is not null and negozio_provenienza <> '';
