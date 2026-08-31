-- IL CONTO PARTE DAL PRIMO GIORNO DI BADGE (Luca 31/08, caso Lorenzini).
--
-- MAURO LORENZINI, LRNMRA66C27H501W: il richiamo era fissato per domenica
-- 30 agosto. Il caller quel giorno non ha timbrato — non poteva — e il lunedì
-- si è ritrovato la pratica già in penale, senza averla mai vista in warning.
--
-- Le parole di Luca: «se non ha badgiato, la logica è: dal momento in cui
-- badgio mi vanno da lavorare. Se l'appuntamento era per lunedì e lunedì non
-- può venire al lavoro, deve rimanere sospeso, e il giorno conta per la
-- transizione in malus solo se ha badgiato.»
--
-- La regola nuova, già nel motore: il giorno segnato sul calendario non è il
-- giorno in cui la pratica diventa sua — quello è il PRIMO giorno di badge da
-- lì in poi, ed è il giorno in cui la lavora, non un giorno di ritardo. Se da
-- allora non ha ancora timbrato (ferie, malattia, riposo) la pratica resta
-- sospesa e non matura niente.
--
-- QUI SI CORREGGE UN EPISODIO SOLO, e va detto perché. Un ricalcolo
-- retroattivo su tutti sarebbe sbagliato: la data di riferimento SI SPOSTA
-- ogni volta che la pratica viene rilavorata, quindi giudicare un episodio
-- vecchio con il riferimento di oggi produce falsi positivi — provato, ne
-- usciva mezza dozzina che con la regola nuova sarebbero comunque dovuti.
-- Le altre segnalazioni si verificano una per una, come le manda il call
-- center.
update caller_malus
   set eliminato = true,
       eliminato_il = now(),
       eliminato_da = 'richiamo fissato di domenica: il primo giorno di badge è il giorno in cui si lavora, non un giorno di ritardo'
 where id = 1083 and coalesce(eliminato, false) = false;
