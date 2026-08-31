-- ═══════════════════════════════════════════════════════════════════════════
-- LO STESSO TELEFONO USATO NON PUÒ ESSERE DUE COSE (revisore 31/08)
--
-- 54 seriali tornavano DUE righe da `cassa_seriali`: una da `mag_unita` —
-- l'usato importato dal gestionale col codice `RITUSATO.*` e un valore
-- simbolico — e una da `usati`, che è dove quel telefono vive davvero, col
-- prezzo di vendita vero.
--
-- `cercaSeriale` fa `.limit(1)` SENZA ordinamento: quale delle due tornasse
-- non lo decideva nessuno. Sparando l'IMEI di un usato poteva uscire la riga
-- sbagliata, e lo scontrino FISCALE stampava quel prezzo:
--     Samsung S26 Ultra   €0     invece di   €1.150
--     iPhone 15 Pro Max   €1     invece di   €950
--     Apple Watch 8       €1     invece di   €250
-- In gioco 19.573 €, il caso peggiore 1.479 € su un solo scontrino. È anche
-- la spiegazione dell'«iPhone 15 Pro a 1 €» che sembrava un dato sporco: non
-- lo era, era lo stesso telefono contato due volte.
--
-- Chi comanda su un usato è Gestione Usati: lì c'è il prezzo di acquisto, il
-- prezzo di vendita, lo stato e la storia. La riga di magazzino dello stesso
-- pezzo va nascosta finché quello è in vendita — e sparisce da sé quando
-- l'usato viene venduto.
-- ═══════════════════════════════════════════════════════════════════════════

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
    a.reparto
   from mag_unita u
   left join mag_articoli a on a.codice = u.codice
  where u.stato not in ('venduto', 'annullato')
    -- lo stesso pezzo è già in Gestione Usati: comanda quello
    and not exists (
      select 1 from usati s
       where s.imei = u.seriale and s.status = 'in_vendita'
    )
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
    7 as reparto
   from usati us
  where us.status = 'in_vendita' and us.imei is not null;

grant select on cassa_seriali to anon, authenticated;

-- ── E UN PEZZO CESTINATO DEVE POTER TORNARE ───────────────────────────────
-- `mag_unita_seriale_viva` era unique (seriale) where stato <> 'venduto':
-- copriva anche «annullato», quindi un telefono cestinato come «mai arrivato»
-- non si poteva più ricaricare quando arrivava — né a mano né dall'import,
-- che lo saltava in silenzio.
drop index if exists mag_unita_seriale_viva;
create unique index mag_unita_seriale_viva on mag_unita (seriale)
  where stato not in ('venduto', 'annullato');
