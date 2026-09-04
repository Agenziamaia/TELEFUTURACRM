-- ═══ LA SOCIETÀ DI UNA RICARICA, LETTA SUL DOCUMENTO ═════════════════════════
-- Luca 04/09, davanti al pannello «chi firmerebbe cosa»: «non riesco a capire
-- da dove vengono questi errori… qui i negozi hanno solo una cassa, per cui
-- l'aggancio è unico ed è sempre lo stesso».
--
-- DA DOVE VENIVANO. La società si scrive sulla ricarica solo quando il carrello
-- era di SOLE ricariche: con un carrello misto la decide la merce, e al momento
-- della vendita non si sa ancora (`api/vendita/paystore/route.ts`). Il ripiego
-- che il registro fa dopo — leggerla dallo scontrino — si arrende appena nella
-- finestra compaiono due società, e nei quattro banconi doppi (Magliana,
-- Collatina, Donna, Acilia) succede quasi sempre. Otto ricariche restavano
-- «scoperte»: il pannello diceva «non so quale plafond usare».
--
-- LA RISPOSTA C'ERA, e non è un'ipotesi: **lo scontrino porta stampato il
-- NUMERO ricaricato**. Fra i due documenti dello stesso minuto, quello che
-- contiene quel numero è il suo, e la sua società è quella giusta.
-- E dove il negozio ha una cassa sola non c'è proprio niente da indovinare.
--
-- Misurato: la prima regola risolve 7 righe su 8, la seconda l'ottava —
-- Baleniere, l'unica senza scontrino perché il registratore aveva fallito.
-- Tutte e otto risultano Telefutura, che è quello che Luca si aspettava.
--
-- ⚠️ NON SI SCRIVE MAI UNA SOCIETÀ «PROBABILE». Se il documento col numero non
-- si trova E il negozio ne ha due, la riga resta vuota: su un plafond, indovinare
-- vuol dire scaricare denaro sul conto della società sbagliata.

begin;

-- ── 1. dal documento fiscale che porta stampato quel numero ────────────────
with dal_documento as (
    select r.id,
           (select distinct p.meta->>'azienda'
              from print_jobs p
             where p.kind in ('fiscal_receipt', 'fiscal')
               and p.status = 'done'
               and p.created_at between r.creata_il - interval '10 minutes'
                                   and r.creata_il + interval '10 minutes'
               and split_part(p.negozio, ' ', 1) = split_part(coalesce(r.negozio, ''), ' ', 1)
               and p.request_xml like '%' || r.numero || '%'
             limit 2) as azienda
      from paystore_ricariche r
     where r.azienda is null and coalesce(r.numero, '') <> ''
)
update paystore_ricariche r
   set azienda = d.azienda
  from dal_documento d
 where d.id = r.id and d.azienda is not null and r.azienda is null;

-- ── 2. e dove il negozio ha una società sola, non c'è niente da indovinare ──
with una_sola as (
    select split_part(negozio, ' ', 1) as sede, min(azienda) as azienda
      from pos_rt group by 1 having count(distinct azienda) = 1
)
update paystore_ricariche r
   set azienda = u.azienda
  from una_sola u
 where u.sede = split_part(coalesce(r.negozio, ''), ' ', 1)
   and r.azienda is null;

commit;
