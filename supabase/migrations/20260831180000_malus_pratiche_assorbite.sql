-- I DOPPIONI NON DEVONO LASCIARE MALUS (segnalazione di Tommaso, 31/08).
--
-- Il caso: Cesare Moscati era già stato lavorato da Tommaso su una pratica
-- arrivata dalla lista di maggio. Poi la stessa persona è ricomparsa nelle
-- liste di giugno e di aprile, assegnate dopo: il CRM ha fatto la cosa giusta
-- — ha riconosciuto il codice fiscale e ha ASSORBITO i doppioni nella riga
-- vinta, che è il motivo per cui il caller non se li ritrova davanti — ma
-- l'episodio di malus nato prima dell'assorbimento restava lì, e la
-- sincronizzazione lo chiudeva come «attivo», cioè DOVUTO.
-- Risultato: un caller pagava per una pratica che non poteva nemmeno vedere.
--
-- Da adesso la sincronizzazione li annulla invece di chiuderli (callerMalus).
-- Qui si sanano quelli già maturati: 11 episodi, 70 €, su tre caller.
-- Tombstone come sempre — l'episodio resta in traccia, esce dal conto. I
-- compensati non si toccano mai.

update caller_malus m
   set eliminato = true,
       eliminato_il = now(),
       eliminato_da = 'Pratica assorbita da una gemella (backfill 31/08)'
  from calls c
 where c.id::text = m.call_id::text
   and c.assorbita_da is not null
   and m.eliminato is not true
   and m.stato <> 'compensato';
