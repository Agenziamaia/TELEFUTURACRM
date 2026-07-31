-- Mig. 108 — Anagrafiche create dal call center (caso Eugenio Barbieri,
-- Luca 31/07/2026): chi nasce dal flusso Caller deve avere un "gestito da"
-- (il caller che l'ha creata) e una sede di acquisizione ("Ufficio
-- Commerciale"), distinta dai negozi — così i filtri tipo "SMS di compleanno
-- solo a chi è passato in negozio" possono escludere i clienti solo-commerciale.
-- Da eseguire A MANO nel SQL Editor di Supabase (o via script con ok di Luca).

-- 1) chi ha creato l'anagrafica (nome del caller; vuoto = flussi negozio)
alter table public.clients
  add column if not exists creato_da text not null default '';

-- 2) BACKFILL dei clienti già nati dal flusso caller: nessuna vendita,
--    nessun negozio di acquisizione, almeno una pratica del call center
--    agganciata per CF/P.IVA o per coda numerica del cellulare. Il creatore
--    è il caller della pratica più recente.
with candidati as (
  select cl.id,
         (select c.caller from public.calls c
          where coalesce(c.caller, '') <> ''
            and (
              (coalesce(cl.cf_piva, '') <> ''
               and (upper(coalesce(c.cf, '')) = upper(cl.cf_piva)
                    or upper(coalesce(c.piva, '')) = upper(cl.cf_piva)))
              or (length(regexp_replace(coalesce(cl.cellulare, ''), '\D', '', 'g')) >= 6
                  and right(regexp_replace(coalesce(c.cellulare, ''), '\D', '', 'g'), 9)
                      = right(regexp_replace(cl.cellulare, '\D', '', 'g'), 9))
            )
          order by c.data_chiamata desc nulls last
          limit 1) as caller
  from public.clients cl
  where coalesce(cl.acquisito_da, '') = ''
    and coalesce(cl.creato_da, '') = ''
    and not exists (select 1 from public.contracts k where k.client_id = cl.id)
)
update public.clients cl
set creato_da = m.caller,
    acquisito_da = 'Ufficio Commerciale'
from candidati m
where cl.id = m.id and m.caller is not null;
