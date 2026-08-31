-- ═══════════════════════════════════════════════════════════════════════════
-- IL CESTINO DEL MAGAZZINO (Luca 31/08)
--
-- «Solamente l'amministrativo deve avere la possibilità di cancellare dei
--  prodotti all'interno del magazzino, tramite un cestino.»
--
-- Non si cancella niente davvero: un pezzo passa allo stato «annullato» con
-- la sua storia (chi, quando, perché), una quantità riceve una RETTIFICA.
-- Il magazzino è la base dello scontrino fiscale: una riga che sparisce senza
-- lasciare traccia è un buco nell'inventario che nessuno può più spiegare.
--
-- MA IL PEZZO ANNULLATO NON DEVE RESTARE VENDIBILE. `cassa_seriali` filtrava
-- `stato <> 'venduto'`: sparando l'IMEI di un pezzo appena cestinato la cassa
-- lo avrebbe trovato lo stesso, e il cestino sarebbe stato una bugia.
-- `mag_disponibilita` invece era già a posto (guarda solo disponibile e
-- in_arrivo), quindi le giacenze non contavano già più quel pezzo — che è
-- proprio il modo in cui i due numeri divergono senza che nessuno lo veda.
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
  -- «venduto» e «annullato» sono usciti dal magazzino, per strade diverse:
  -- il primo è stato incassato, il secondo non c'era. Nessuno dei due si vende.
  where u.stato not in ('venduto', 'annullato')
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
