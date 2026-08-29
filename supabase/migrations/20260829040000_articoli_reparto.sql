-- ═══════════════════════════════════════════════════════════════════════════
-- IL REPARTO IVA DEGLI ARTICOLI (29/08) — senza, lo scontrino non esce
--
-- Il registratore telematico non conosce le aliquote: conosce i REPARTI, e la
-- mappa reparto→IVA sta in pos_reparti. Le viste di cassa mandavano `null`
-- per tutti i prodotti: in modalità fiscale ogni riga sarebbe finita fra le
-- «escluse», e un carrello di soli prodotti avrebbe ricevuto un rifiuto
-- secco «nessuna voce stampabile».
--
-- Come sono classificati oggi i 2.223 articoli (letto dal database):
--     22        1.890   IVA ordinaria
--     ART.36      310   regime del margine (la famiglia USATO)
--     ART.74       23   regime monofase (le SIM)
--
-- QUI SI RIEMPIE SOLO LA PARTE CERTA. «22» è senza ambiguità: reparto 2.
-- ART.36 e ART.74 NO: sono scelte fiscali, e sceglierle al posto di chi
-- risponde all'Agenzia delle Entrate sarebbe una leggerezza con dei soldi
-- veri dentro. Restano vuoti — quindi bloccati e ben visibili in
-- Amministrazione → Fiscalità → Articoli, dove si assegnano una volta sola.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.mag_articoli add column if not exists reparto smallint;

-- solo l'IVA ordinaria, e solo dove il reparto non è già stato deciso a mano
update public.mag_articoli
   set reparto = 2
 where reparto is null
   and trim(coalesce(iva_vendita,'')) = '22';

-- il catalogo di cassa impara il reparto
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
    a.reparto                 as reparto,
    a.iva_vendita             as regime_iva,
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
    null::text                as regime_iva,
    false                     as scarica_magazzino,
    i.prezzo_modificabile     as prezzo_modificabile,
    i.active                  as attivo
  from public.marg_items i
  left join public.marg_categories c on c.id = i.category_id
  where i.active;

notify pgrst, 'reload schema';
