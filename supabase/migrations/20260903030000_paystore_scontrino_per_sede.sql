-- ═══ «SCONTRINO NON RISULTA» SU RICARICHE CHE LO SCONTRINO CE L'HANNO ═════
-- Luca 03/09, con una cliente in negozio: «da qui risulta che lo scontrino non
-- è stato emesso, ma in realtà abbiamo la cliente con lo scontrino in mano».
--
-- ⚠️ IL NEGOZIO SI CONFRONTAVA A LETTERE. Lo scontrino porta l'INSEGNA —
-- «Magliana W3», «Collatina Multi», «Acilia VS» — mentre la ricarica porta il
-- nome corto del punto vendita: «Magliana». Il confronto esatto non trovava
-- mai niente, e la riga restava senza stato: «non risulta».
--
-- La riga della cliente: ricarica creata alle 16:02:15.780, scontrino stampato
-- alle 16:02:12.024 — tre secondi PRIMA, `status = done` — ma su «Magliana W3».
--
-- ⚠️ E NON È UN CASO ISOLATO: 44 righe su 46 senza stato hanno uno scontrino
-- emesso nella loro finestra. Da oggi il codice confronta per SEDE
-- (`stessoMagazzino`); qui si ricuciono quelle già sbagliate.
--
-- ⚠️ SI SCRIVE SOLO DOVE LA RISPOSTA È CERTA: un solo scontrino nella finestra,
-- e nello stesso locale. Dove ce ne sono due con esiti diversi non si indovina:
-- la riga resta senza stato, e chi la guarda decide.

with coppie as (
    select r.id,
           count(*) filter (where j.status = 'done')    as emessi,
           count(*) filter (where j.status <> 'done')   as falliti
      from public.paystore_ricariche r
      join public.print_jobs j
        on lower(split_part(j.negozio, ' ', 1)) = lower(split_part(r.negozio, ' ', 1))
       and j.created_at between r.creata_il - interval '5 minutes'
                            and r.creata_il + interval '1 minute'
     where r.scontrino_stato is null and r.negozio is not null
     group by r.id
)
update public.paystore_ricariche r
   set scontrino_stato = case when c.emessi > 0 and c.falliti = 0 then 'emesso'
                              when c.emessi = 0 and c.falliti > 0 then 'errore' end,
       scontrino_emesso = (c.emessi > 0 and c.falliti = 0)
  from coppie c
 where r.id = c.id
   -- ⚠️ solo dove è tutto d'accordo: emessi E falliti insieme = non si sa
   and (c.emessi = 0) <> (c.falliti = 0);

do $$
declare senza int; emessi int; errori int;
begin
    select count(*) filter (where scontrino_stato is null),
           count(*) filter (where scontrino_stato = 'emesso'),
           count(*) filter (where scontrino_stato = 'errore')
      into senza, emessi, errori from public.paystore_ricariche;
    raise notice 'senza stato: % - emessi: % - errore: %', senza, emessi, errori;
end $$;
