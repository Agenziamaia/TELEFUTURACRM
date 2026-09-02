-- ═══ LE RICARICHE SENZA TAGLIO ════════════════════════════════════════════
-- Luca, 02/09, fotografando quattro righe con un trattino nella colonna
-- TAGLIO: «nonostante ieri pensassi che avessimo fatto dei fix su questo
-- argomento, sembrerebbe che ci siano ancora delle ricariche dove non è
-- selezionato il taglio di ricarica».
--
-- MISURATO PRIMA DI TOCCARE: sono NOVE in tutto, e nessuna nasce da una
-- vendita fatta oggi al banco. Lo dice la loro stessa nota:
--   · 4 «recuperata dalla vendita: il registro non scriveva (contract_id uuid
--     invece che testo)» — l'incidente del primo giorno;
--   · 4 «ripresa a mano: nate mentre lo stato iniziale non era ancora
--     allineato al vincolo» — le quattro che avevo ricostruito io;
--   · 1 «venduta con la SIM prima che la vendita si portasse dentro il numero».
-- Sono tutte righe RICOSTRUITE dopo il fatto: di quelle vendite si conosceva
-- l'importo, non l'etichetta del taglio che il negozio aveva premuto.
--
-- Il taglio però si può ritrovare: se nel listino di quell'operatore esiste
-- UN SOLO taglio attivo con quell'importo, è per forza quello.

update public.paystore_ricariche r
   set taglio = g.etichetta
  from public.paystore_tagli g
 where r.taglio is null
   and g.operatore = r.operatore
   and g.valore = r.importo
   and g.attivo
   and (select count(*) from public.paystore_tagli h
         where h.operatore = r.operatore and h.valore = r.importo and h.attivo) = 1;

-- ⚠️ DUE RESTANO SENZA, ED È GIUSTO COSÌ: 23 € su Vodafone e 26 € su WindTre
-- non sono tagli — sono somme di tagli (il compositore permette di sommare più
-- pezzi). Scriverci dentro un'etichetta inventata sarebbe peggio del trattino:
-- direbbe che il negozio ha premuto un tasto che non esiste. Restano nulle, e
-- la pagina ora le marca «ricostruita» spiegando il perché, invece di mostrare
-- un trattino muto che sembra un difetto.

comment on column public.paystore_ricariche.taglio is
  'L''etichetta del taglio premuto in Registra Vendita. È NULLA solo sulle righe ricostruite dopo il fatto (recupero dallo scontrino o dalla vendita), dove si conosce l''importo e non il tasto premuto: in quel caso la pagina scrive «ricostruita» e la nota dice da dove viene.';

-- prova: quante ne restano, e che siano solo somme di tagli
do $$
declare n int; noti int;
begin
    select count(*) into n from public.paystore_ricariche where taglio is null;
    select count(*) into noti from public.paystore_ricariche r
      where r.taglio is null
        and exists (select 1 from public.paystore_tagli g
                     where g.operatore = r.operatore and g.valore = r.importo and g.attivo);
    raise notice 'senza taglio: % · di cui con un taglio corrispondente nel listino: % (devono essere 0)', n, noti;
    if noti > 0 then
        raise exception 'ci sono ancora % righe che avrebbero un taglio nel listino', noti;
    end if;
end $$;
