-- ═══ LA LETTERA DI GARA LETTA DALL'AI ═══════════════════════════════════════
-- Luca 04/09/2026: «gli diciamo di leggere la lettera di gara nuova che gli
-- alleghiamo e a quel punto di compilare i dati della tabella con i nuovi
-- valori del mese, e di fare anche un pdf con i cambiamenti rispetto alla
-- lettera precedente».
--
-- La proposta NON scrive mai da sola sulle tabelle della gara: qui dentro vive
-- come bozza finché una persona non la approva. Queste tabelle decidono i
-- compensi: un numero letto male da un PPTX si propagherebbe su Analisi,
-- Calcolatore e pagamenti senza che nessuno se ne accorga.
create table if not exists public.gare_ai_proposte (
    id          uuid primary key default gen_random_uuid(),
    brand       text not null,
    month       date not null,
    lato        text not null default 'azienda',      -- si parte sempre dall'azienda
    stato       text not null default 'bozza',        -- bozza | applicata | scartata
    lettera_id  uuid references public.gare_lettere(id) on delete set null,
    lettera_nome text,
    mese_base   date,                                  -- il mese da cui è partito il confronto
    modello     text,
    -- il diff: una riga per ogni modifica proposta, con vecchio e nuovo valore
    diff        jsonb not null default '[]'::jsonb,
    riassunto   text,
    avvisi      jsonb not null default '[]'::jsonb,    -- cosa il modello NON è riuscito a leggere
    creata_da   text,
    created_at  timestamptz not null default now(),
    decisa_da   text,
    decisa_il   timestamptz,
    -- cosa è stato davvero scritto quando è stata applicata (per poter tornare indietro)
    applicato   jsonb
);

create index if not exists gare_ai_proposte_brand_month on public.gare_ai_proposte (brand, month desc, created_at desc);
create index if not exists gare_ai_proposte_stato on public.gare_ai_proposte (stato) where stato = 'bozza';

alter table public.gare_ai_proposte enable row level security;

-- stessa porta delle altre tabelle di gara: chi entra nel CRM legge, il server
-- (service_role) scrive. I permessi veri li applica la sezione, come per il
-- resto delle gare.
drop policy if exists gare_ai_proposte_read on public.gare_ai_proposte;
create policy gare_ai_proposte_read on public.gare_ai_proposte
    for select to authenticated using (true);

drop policy if exists gare_ai_proposte_write on public.gare_ai_proposte;
create policy gare_ai_proposte_write on public.gare_ai_proposte
    for all to authenticated using (true) with check (true);

comment on table public.gare_ai_proposte is
  'Proposte di aggiornamento del mese di gara lette dall''AI dalla lettera dell''operatore. Restano bozze finché una persona non le approva: non scrivono mai da sole su gare_azienda_*.';
