-- ═══════════════════════════════════════════════════════════════════════════
-- LO STESSO OROLOGIO VENDIBILE DUE VOLTE, LA SECONDA A UN EURO — 02/09/2026
--
-- Caricando il magazzino di Collatina Multi è saltato fuori che l'Apple Watch
-- SE2 `SD34XK5J3QN` compariva DUE volte in cassa:
--   · una come «usato»,  185,00 €  (riga in `usati`)
--   · una come «nuovo»,    1,00 €  (unità di magazzino)
--
-- La vista un doppione così lo esclude già: il ramo «nuovo» salta i seriali
-- che stanno in `usati` come `in_vendita`. Ma il confronto era
-- `s.imei = u.seriale`, cioè SENSIBILE ALLE MAIUSCOLE — e in `usati` quel
-- codice è scritto minuscolo (`sd34xk5j3qn`) mentre il gestionale, e quindi il
-- magazzino, lo scrive maiuscolo. Su 28 seriali presenti in tutti e due i
-- registri, 27 venivano soppressi e uno no: l'unico in tutto il CRM, e bastava
-- una lettera.
--
-- SI CORREGGE IL CONFRONTO, NON IL DATO. Riscrivere la riga di `usati` avrebbe
-- chiuso QUESTO caso e lasciato la trappola armata per il prossimo: i seriali
-- arrivano da tre strade diverse — il gestionale, il lettore di codici e le
-- dita di chi ritira un usato — e nessuna delle tre garantisce le maiuscole.
--
-- È una correzione che può solo NASCONDERE un doppione, mai far sparire merce
-- vera: sopprime di più, mai di meno.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.cassa_seriali as
 select u.seriale,
    'nuovo'::text as provenienza,
    u.codice,
    u.descrizione as nome,
    u.negozio,
    u.stato,
    u.valore as prezzo,
    a.costo_ultimo as costo,
    coalesce(a.prezzo_modificabile, true) as prezzo_modificabile,
    u.id::text as riferimento,
    coalesce(u.azienda, a.azienda) as azienda,
    a.reparto
   from mag_unita u
     left join mag_articoli a on a.codice = u.codice
  where (u.stato <> all (array['venduto'::text, 'annullato'::text]))
    and not (exists ( select 1
           from usati s
          where upper(btrim(s.imei)) = upper(btrim(u.seriale)) and s.status = 'in_vendita'::text))
union all
 select us.imei as seriale,
    'usato'::text as provenienza,
    null::text as codice,
    us.model as nome,
    us.store as negozio,
    us.status as stato,
    us.sale_price as prezzo,
    us.purchase_price as costo,
    true as prezzo_modificabile,
    us.id::text as riferimento,
    null::text as azienda,
    7 as reparto
   from usati us
  where us.status = 'in_vendita'::text and us.imei is not null;
