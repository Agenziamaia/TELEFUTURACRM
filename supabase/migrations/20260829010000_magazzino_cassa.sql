-- ═══════════════════════════════════════════════════════════════════════════
-- DA CRM A SOFTWARE DI CASSA — le fondamenta del magazzino (Luca 28/08 notte)
--
-- «Dal primo settembre diventerà anche il software di cassa. Dobbiamo migrare
--  l'attuale flusso di prodotti in marginalità in quello che è il vero e
--  proprio magazzino, dove vai a scaricare il prodotto, dove c'è il costo di
--  acquisto rispetto al prezzo di vendita, quindi sai già qual è il ricavo.»
--
-- COSA C'È GIÀ (verificato sul database, non supposto):
--   · mag_articoli — 2.223 articoli con costo_ultimo, prezzo, barcode, gruppo,
--     sottogruppo, marca. È l'anagrafica: cosa esiste, non cosa abbiamo.
--   · mag_unita — i pezzi SERIALIZZATI (un telefono = un IMEI). VUOTA.
--   · marg_items — 44 voci di marginalità con IVA, reparto fiscale e azienda,
--     ma con i costi tutti a NULL: il margine vero oggi non lo sa nessuno.
--   · pos_rt (15 casse), pos_reparti (8 reparti IVA): la parte fiscale c'è.
--
-- IL BUCO: non esiste il concetto di QUANTITÀ. Per un telefono va bene una
-- riga per pezzo, ma per venti cover uguali no. Senza le quantità la frase
-- «scarico il prodotto dal magazzino» non ha un posto dove succedere.
--
-- Questa migrazione aggiunge le due cose che mancano — le quantità e i
-- movimenti — e NON tocca niente di esistente: mag_articoli, mag_unita,
-- marg_items e le casse restano come sono.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. LA GIACENZA: quanti pezzi di un articolo ci sono, in quale negozio ──
--    Una riga per articolo×negozio. Non è la verità assoluta: è il saldo dei
--    movimenti, e si ricostruisce da quelli (vedi mag_movimenti).
create table if not exists public.mag_giacenze (
  codice     text not null references public.mag_articoli(codice) on delete cascade,
  negozio    text not null,
  quantita   numeric not null default 0,
  -- la soglia sotto la quale il negozio va riordinato: la decide l'admin,
  -- serve al pannello «cosa sta finendo»
  soglia_min numeric,
  -- l'ultima volta che qualcuno ha CONTATO davvero (inventario): distingue
  -- «il saldo dice 3» da «tre li ho visti io»
  contata_il timestamptz,
  contata_da text,
  updated_at timestamptz not null default now(),
  primary key (codice, negozio)
);
create index if not exists mag_giacenze_negozio on public.mag_giacenze (negozio);
-- «cosa sta finendo»: solo le righe sotto soglia, senza scorrere tutto
create index if not exists mag_giacenze_sotto_soglia on public.mag_giacenze (negozio)
  where soglia_min is not null and quantita <= soglia_min;

-- ── 2. I MOVIMENTI: perché la giacenza è quella che è ──────────────────────
--    Ogni carico, scarico, rettifica e trasferimento lascia una riga. La
--    giacenza è un saldo comodo, questa è la storia — e senza storia nessuno
--    può rispondere a «e questi tre dove sono finiti?».
create table if not exists public.mag_movimenti (
  id          uuid primary key default gen_random_uuid(),
  codice      text not null references public.mag_articoli(codice) on delete cascade,
  negozio     text not null,
  -- carico: arriva merce · scarico: venduta · rettifica: l'inventario corregge
  -- trasferimento_out/in: viaggia fra negozi · reso: torna indietro
  tipo        text not null check (tipo in ('carico','scarico','rettifica','trasferimento_out','trasferimento_in','reso')),
  quantita    numeric not null,          -- SEMPRE positiva: è il tipo a dire il verso
  -- il costo del pezzo IN QUEL MOMENTO: il costo di listino cambia nel tempo,
  -- ma il margine di una vendita di agosto va calcolato col costo di agosto
  costo_unitario  numeric,
  prezzo_unitario numeric,               -- a quanto è stato venduto davvero
  -- da dove arriva il movimento
  contract_id text,                      -- la vendita che l'ha generato
  ddt_id      uuid,                      -- il trasferimento fra negozi
  seriale     text,                      -- se il pezzo è serializzato
  nota        text,
  operatore   text,
  creato_il   timestamptz not null default now()
);
create index if not exists mag_movimenti_articolo on public.mag_movimenti (codice, negozio, creato_il desc);
create index if not exists mag_movimenti_vendita  on public.mag_movimenti (contract_id) where contract_id is not null;
create index if not exists mag_movimenti_giorno   on public.mag_movimenti (creato_il desc);

-- ── 3. IL SALDO SI AGGIORNA DA SÉ ─────────────────────────────────────────
--    La giacenza non si scrive mai a mano: la muove il movimento. Così non
--    può esistere una giacenza che non sia spiegata da una storia.
create or replace function public.mag_applica_movimento() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_delta numeric;
begin
  v_delta := case new.tipo
    when 'carico' then new.quantita
    when 'trasferimento_in' then new.quantita
    when 'reso' then new.quantita
    when 'scarico' then -new.quantita
    when 'trasferimento_out' then -new.quantita
    when 'rettifica' then new.quantita   -- la rettifica porta il segno nel suo verso
    else 0 end;
  insert into public.mag_giacenze (codice, negozio, quantita, updated_at)
  values (new.codice, new.negozio, v_delta, now())
  on conflict (codice, negozio) do update
    set quantita = public.mag_giacenze.quantita + excluded.quantita,
        updated_at = now();
  return new;
end $$;
drop trigger if exists trg_mag_applica_movimento on public.mag_movimenti;
create trigger trg_mag_applica_movimento after insert on public.mag_movimenti
  for each row execute function public.mag_applica_movimento();

-- La rettifica è l'unico movimento che può essere negativo (l'inventario
-- toglie); tutti gli altri sono positivi e il verso lo dà il tipo.
alter table public.mag_movimenti drop constraint if exists mag_movimenti_qta_positiva;
alter table public.mag_movimenti add constraint mag_movimenti_qta_positiva
  check (tipo = 'rettifica' or quantita > 0);

-- ── 4. COSA VENDE LA CASSA: prodotti e servizi in un elenco solo ──────────
--    La cassa non deve sapere che i prodotti stanno in una tabella e i
--    servizi in un'altra: chiede «cosa posso vendere» e riceve una lista.
--    I PRODOTTI hanno una giacenza e uno scarico; i SERVIZI no.
create or replace view public.cassa_catalogo as
  -- PRODOTTI: dall'anagrafica del magazzino
  select
    'p:' || a.codice          as id,
    'prodotto'                as natura,
    a.codice                  as codice,
    a.barcode                 as barcode,
    a.descrizione             as nome,
    coalesce(nullif(a.sottogruppo,''), nullif(a.gruppo,''), 'Altro') as famiglia,
    a.marca                   as marca,
    a.gruppo                  as gruppo,
    a.prezzo                  as prezzo,
    -- un costo maggiore di 5.000 € su un accessorio è un codice a barre finito
    -- nel campo sbagliato (ne esiste uno, verificato): non lo si spaccia per costo
    case when a.costo_ultimo between 0 and 5000 then a.costo_ultimo end as costo,
    null::numeric             as iva,
    null::smallint            as reparto,
    true                      as scarica_magazzino,
    a.attivo                  as attivo
  from public.mag_articoli a
  where a.attivo
  union all
  -- SERVIZI: dalle voci di marginalità che NON sono merce
  select
    's:' || i.id::text        as id,
    'servizio'                as natura,
    null                      as codice,
    null                      as barcode,
    i.name                    as nome,
    coalesce(c.name,'Servizi') as famiglia,
    i.brand                   as marca,
    coalesce(c.name,'Servizi') as gruppo,
    i.default_price           as prezzo,
    i.company_cost            as costo,
    i.vat_rate                as iva,
    i.reparto                 as reparto,
    false                     as scarica_magazzino,
    i.active                  as attivo
  from public.marg_items i
  left join public.marg_categories c on c.id = i.category_id
  where i.active;

-- ── 5. RLS: la regola del repo — policy SUBITO, se no le scritture anon
--       falliscono in silenzio (già successo sulle pay_* e sulle mag_*) ────
alter table public.mag_giacenze  enable row level security;
drop policy if exists mag_giacenze_allow_all on public.mag_giacenze;
create policy mag_giacenze_allow_all on public.mag_giacenze for all using (true) with check (true);
alter table public.mag_movimenti enable row level security;
drop policy if exists mag_movimenti_allow_all on public.mag_movimenti;
create policy mag_movimenti_allow_all on public.mag_movimenti for all using (true) with check (true);

notify pgrst, 'reload schema';
