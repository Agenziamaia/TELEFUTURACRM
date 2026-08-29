-- ═══════════════════════════════════════════════════════════════════════════
-- LA SOCIETÀ SEGUE LA MERCE, E OGNI ARTICOLO HA UN REPARTO (revisore 29/08)
--
-- Tre difetti trovati la mattina dell'apertura di Donna Olimpia, tutti dello
-- stesso ceppo: il magazzino sapeva cose che alla cassa non arrivavano.
--
--  1. LA SOCIETÀ. mag_movimenti.azienda ha `default 'T1'` e nessuno gliela
--     passava: vendendo una SIM Fastweb (109 pezzi, tutti di Telefutura 2) la
--     giacenza di T2 restava ferma e a T1 nasceva una riga a −1 che nessuno
--     vedeva. Merce che esce da un inventario e ricavo che entra nella
--     fattura dell'altra società: due contabilità che non tornano più.
--     Le viste ora PORTANO la società, così la riga di carrello sa di chi è.
--
--  2. IL REPARTO IVA. 804 pezzi su 1.796 (il 45% del magazzino) non erano
--     stampabili su scontrino perché `reparto` era NULL. Non è una scelta da
--     inventare: il regime sta già scritto nell'anagrafica che ci ha dato il
--     fornitore, e in pos_reparti ci sono già i reparti con la natura giusta.
--       · ART.74 (SIM e ricariche, regime monofase: l'IVA la versa
--         l'operatore a monte)  → reparto 1 «Non soggetta», natura N2
--       · ART.36 (beni usati, regime del margine) → reparto 7 «Usato ·
--         regime margine», natura N5
--     ⚠️ DA CONFERMARE CON L'AMMINISTRAZIONE: in marg_items le stesse voci
--     («Sim Fastweb», «Sim Wind3», «Sost Vodafone») sono a reparto 2 = IVA
--     22%. La stessa SIM battuta dalla scorciatoia esce al 22%, battuta dal
--     magazzino esce non soggetta. Una delle due è sbagliata: qui si segue
--     l'anagrafica, che è il documento del fornitore.
--
--  3. LA SCORCIATOIA CHE NON SCARICA. Le voci a marginalità («New Cover»,
--     «Sim Fastweb») stanno come pulsanti sopra la ricerca, ma non hanno un
--     codice articolo: si vendono senza toccare il magazzino, mentre lo
--     stesso pezzo esiste a scaffale. Due strade per la stessa merce, una
--     sola scarica. `codice_magazzino` le lega: dove il gemello c'è, il
--     pulsante diventa quell'articolo — giacenza controllata e pezzo tolto.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. I REPARTI CHE MANCAVANO ────────────────────────────────────────────
update mag_articoli set reparto = 1
 where reparto is null and upper(btrim(iva_vendita)) = 'ART.74';

update mag_articoli set reparto = 7
 where reparto is null and upper(btrim(iva_vendita)) = 'ART.36';

-- ── 2. IL PONTE FRA LA SCORCIATOIA E L'ARTICOLO ───────────────────────────
alter table marg_items add column if not exists codice_magazzino text
    references mag_articoli(codice) on update cascade on delete set null;
comment on column marg_items.codice_magazzino is
  'Il gemello a magazzino di questa voce: quando c''e, premere la scorciatoia vende QUELL''articolo (giacenza controllata, pezzo scaricato) invece di una riga di solo margine.';

-- il legame che si puo dedurre senza inventare niente: stesso nome esatto.
-- Le altre le assegna l''amministrazione da Fiscalita -> Articoli.
update marg_items i set codice_magazzino = a.codice
  from mag_articoli a
 where i.codice_magazzino is null
   and a.attivo
   and lower(btrim(a.descrizione)) = lower(btrim(i.name));

-- ── 3. LA SOCIETÀ NELLE VISTE DI CASSA ────────────────────────────────────
-- `create or replace` non sa aggiungere colonne in mezzo: si rifà da capo.
drop view if exists cassa_catalogo;
create view cassa_catalogo as
 select 'p:'::text || a.codice as id,
    'prodotto'::text as natura,
    a.codice, a.barcode,
    a.descrizione as nome,
    coalesce(nullif(a.sottogruppo,''), nullif(a.gruppo,''), 'Altro') as famiglia,
    a.marca, a.gruppo, a.prezzo,
    case when a.costo_ultimo >= 0 and a.costo_ultimo <= 5000 then a.costo_ultimo else null end as costo,
    null::numeric as iva,
    a.reparto,
    a.iva_vendita as regime_iva,
    true as scarica_magazzino,
    a.prezzo_modificabile,
    a.attivo,
    a.azienda
   from mag_articoli a
  where a.attivo
union all
 select 's:'::text || i.id::text as id,
    'servizio'::text as natura,
    -- il ponte con il magazzino: dove il gemello esiste, la scorciatoia
    -- porta il suo codice e da lì in poi si comporta da articolo vero
    i.codice_magazzino as codice,
    null::text as barcode,
    i.name as nome,
    coalesce(c.name,'Servizi') as famiglia,
    i.brand as marca,
    coalesce(c.name,'Servizi') as gruppo,
    i.default_price as prezzo,
    i.company_cost as costo,
    i.vat_rate as iva,
    i.reparto,
    null::text as regime_iva,
    (i.codice_magazzino is not null) as scarica_magazzino,
    i.prezzo_modificabile,
    i.active as attivo,
    null::text as azienda
   from marg_items i
   left join marg_categories c on c.id = i.category_id
  where i.active;

drop view if exists cassa_seriali;
create view cassa_seriali as
 select u.seriale,
    'nuovo'::text as provenienza,
    u.codice,
    u.descrizione as nome,
    u.negozio, u.stato,
    u.valore as prezzo,
    a.costo_ultimo as costo,
    coalesce(a.prezzo_modificabile, true) as prezzo_modificabile,
    u.id::text as riferimento,
    coalesce(u.azienda, a.azienda) as azienda,
    -- un pezzo senza codice articolo non ha reparto: senza, non si stampa
    a.reparto
   from mag_unita u
   left join mag_articoli a on a.codice = u.codice
  where u.stato <> 'venduto'
union all
 select us.imei as seriale,
    'usato'::text as provenienza,
    null::text as codice,
    us.model as nome,
    us.store as negozio, us.status as stato,
    us.sale_price as prezzo,
    us.purchase_price as costo,
    true as prezzo_modificabile,
    us.id::text as riferimento,
    null::text as azienda,
    -- l'usato è regime del margine per definizione (art. 36)
    7 as reparto
   from usati us
  where us.status = 'in_vendita' and us.imei is not null;

grant select on cassa_catalogo, cassa_seriali to anon, authenticated;
