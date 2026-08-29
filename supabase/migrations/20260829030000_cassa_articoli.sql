-- ═══════════════════════════════════════════════════════════════════════════
-- L'ARTICOLO COME LO VUOLE LA CASSA (Luca 29/08, prima del via a Donna Olimpia)
--
-- «I valori principali che definiscono un articolo sono due: un articolo ha
--  due codici, e poi può avere un seriale — che nella maggior parte dei casi
--  è un IMEI. Sono gli unici articoli, i telefoni e i modem, ad avere anche
--  questo terzo campo.»
--
-- «Ci saranno degli articoli che hanno un prezzo di vendita modificabile e
--  altri che invece hanno un prezzo di vendita che non è modificabile. Questo
--  varrà anche per i servizi.»
--
-- Due aggiunte, nient'altro:
--   1. il prezzo si può bloccare (articoli E servizi)
--   2. si cerca per IMEI, non solo per codice
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. IL PREZZO BLOCCATO ─────────────────────────────────────────────────
--    Vero = il venditore può correggerlo in cassa (uno sconto, un fuori
--    tutto). Falso = il prezzo è quello e basta: si vede, non si tocca.
--    Il valore di partenza è «modificabile»: bloccare è una decisione, e le
--    decisioni le prende l'amministrazione, non un default.
alter table public.mag_articoli add column if not exists prezzo_modificabile boolean not null default true;
alter table public.marg_items   add column if not exists prezzo_modificabile boolean not null default true;

-- il costo d'acquisto e il prezzo di vendita dei SERVIZI: oggi marg_items li
-- ha (company_cost, default_price) ma sono tutti vuoti — restano dove sono,
-- si riempiono dall'amministrazione.

-- ── 2. LA RICERCA PER SERIALE ─────────────────────────────────────────────
--    In cassa si spara l'IMEI e deve uscire IL pezzo, con il suo negozio e il
--    suo stato. I pezzi serializzati vivono in mag_unita (telefoni e modem
--    nuovi) e in usati (l'usato in vendita): la cassa non deve sapere in
--    quale delle due — chiede un seriale e riceve un pezzo.
create or replace view public.cassa_seriali as
  select
    u.seriale                       as seriale,
    'nuovo'                         as provenienza,
    u.codice                        as codice,
    u.descrizione                   as nome,
    u.negozio                       as negozio,
    u.stato                         as stato,
    u.valore                        as prezzo,
    a.costo_ultimo                  as costo,
    coalesce(a.prezzo_modificabile, true) as prezzo_modificabile,
    u.id::text                      as riferimento
  from public.mag_unita u
  left join public.mag_articoli a on a.codice = u.codice
  where u.stato <> 'venduto'
  union all
  -- l'usato: un telefono ritirato e rimesso in vendita. Il costo è quello che
  -- gli abbiamo dato al cliente, il prezzo quello di vendita.
  select
    us.imei                         as seriale,
    'usato'                         as provenienza,
    null                            as codice,
    us.model                        as nome,
    us.store                        as negozio,
    us.status                       as stato,
    us.sale_price                   as prezzo,
    us.purchase_price               as costo,
    true                            as prezzo_modificabile,
    us.id::text                     as riferimento
  from public.usati us
  where us.status = 'in_vendita' and us.imei is not null;

-- ── 3. il catalogo di cassa impara il prezzo bloccato ─────────────────────
--    `create or replace` non sa aggiungere una colonna in mezzo: si ricrea.
--    Nessuno dipende ancora da questa vista (il codice che la legge non è
--    ancora collegato), quindi la sostituzione è indolore.
drop view if exists public.cassa_catalogo;
create view public.cassa_catalogo as
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
    case when a.costo_ultimo between 0 and 5000 then a.costo_ultimo end as costo,
    null::numeric             as iva,
    null::smallint            as reparto,
    true                      as scarica_magazzino,
    a.prezzo_modificabile     as prezzo_modificabile,
    a.attivo                  as attivo
  from public.mag_articoli a
  where a.attivo
  union all
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
    i.prezzo_modificabile     as prezzo_modificabile,
    i.active                  as attivo
  from public.marg_items i
  left join public.marg_categories c on c.id = i.category_id
  where i.active;

notify pgrst, 'reload schema';
