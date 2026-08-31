-- LE ASSEGNATE CHE ERANO GIÀ IN MANO ALLO STESSO CALLER (Luca 31/08).
--
-- Il caso che ha mandato: VALENTINA TIBALDI, stesso codice fiscale e stesso
-- numero, due righe, tutte e due di Tommaso. La vecchia viene dalla «Lista sms
-- Maggio 2026 W3» (26/08, ora «Da richiamare», con nove passaggi di storico),
-- la nuova dalla «Lista Aprile sms 2026 W3» (29/08, «Assegnata», due). È una
-- collisione lista-su-lista: chi riceve l'SMS di WindTre lo riceve ogni mese,
-- quindi compare in ogni estrazione mensile — e all'assegnazione nessuno se ne
-- accorge, perché il controllo dei doppioni è PROGETTATO ma non ancora scritto.
--
-- Misura di oggi: 459 pratiche ferme su «Assegnata», 251 con una gemella, 108
-- con una gemella ANCORA IN LAVORAZIONE. Di queste 108, 59 hanno la gemella
-- nelle mani dello STESSO caller e 50 in quelle di un altro.
--
-- QUI SI TOCCANO SOLO LE 59 DELLO STESSO CALLER, dove non c'è niente da
-- decidere: la stessa persona ha in mano due volte lo stesso cliente, e la
-- riga nuova non aggiunge nulla — anzi toglie lo storico, perché la
-- lavorazione sta sulla riga e non sul cliente. Le altre 50 NON si toccano:
-- una riassegnazione a un caller diverso può essere stata voluta, e non è una
-- decisione da prendere con una query.
-- Le gemelle CHIUSE da poco restano dove sono, come ha detto Luca.
--
-- L'assorbimento è il meccanismo che il CRM ha già: la riga sparisce dalla
-- coda del caller, non matura più malus (regola del 31/08) e la traccia resta
-- scritta — si torna indietro svuotando `assorbita_da`.

with ass as (
    select c.id, c.cf, c.numero, c.caller
      from calls c
     where c.stato = 'Assegnata' and coalesce(c.assorbita_da, '') = ''
), coppie as (
    select a.id as nuova, g.id as vecchia,
           row_number() over (partition by a.id order by g.created_at) as scelta
      from ass a
      join calls g
        on g.id <> a.id
       and coalesce(g.assorbita_da, '') = ''
       and g.caller = a.caller                       -- SOLO lo stesso caller
       and g.stato in ('Da richiamare', 'Appuntamento telefonico',
                       '1° Appuntamento', '2° Appuntamento', '3° Appuntamento',
                       'Cold NR1', 'Cold NR2', 'Cold NR3',
                       'Hot NR1', 'Hot NR2', 'Hot NR3')
       and (
             (coalesce(a.cf, '') <> '' and upper(coalesce(g.cf, '')) = upper(a.cf))
          or (length(regexp_replace(coalesce(a.numero, ''), '\D', '', 'g')) >= 9
              and right(regexp_replace(coalesce(g.numero, ''), '\D', '', 'g'), 9)
                = right(regexp_replace(coalesce(a.numero, ''), '\D', '', 'g'), 9))
           )
)
update calls c
   set assorbita_da = p.vecchia,
       updated_at = now()
  from coppie p
 where c.id = p.nuova and p.scelta = 1;
