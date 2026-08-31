-- IL CALDERONE DIVISO IN DUE (31/08).
--
-- Luca: «non riesco a capire la differenza tra questi due, WhatsApp mi sembra
-- troppo basso, significa che il resto è tutto mail?»
--
-- No: «Motori (prima del 31/08)» erano le righe scritte PRIMA che i due
-- motori si firmassero — dentro c'erano sia WhatsApp sia Email, mescolati e
-- indistinguibili. Il chip «Triage WhatsApp» accanto conteneva solo le poche
-- righe di stasera. Sembrava che WhatsApp costasse niente perché quasi tutta
-- la sua spesa era nel calderone.
--
-- ⚠️ MA SI PUÒ RICOSTRUIRE, e in modo verificabile: i due cron girano a
-- minuti diversi — `*/10` per le chat (minuti 0,10,20…) e `5-59/10` per la
-- posta (minuti 5,15,25…) — e la riga si scrive alla fine della corsa. Il
-- minuto è la firma di chi l'ha scritta.
--
-- La prova che non è un'ipotesi: sui minuti della decina, 459 righe cadono
-- sullo 0 e 122 sul 5 — i due picchi di partenza — e le altre si distribuiscono
-- nei minuti immediatamente successivi, che sono le corse che durano un po'.
-- Nessuna riga cade dove non dovrebbe.
--
-- ⚠️ RESTA UNA RICOSTRUZIONE, non un dato registrato: una corsa lunga
-- iniziata al minuto 0 e finita al 6 finirebbe fra le email. Per questo si
-- scrive `funzione = 'ricostruito_da_orario'`: chi guarderà quei numeri deve
-- poter sapere che sono dedotti. Da stasera in poi i motori si firmano da
-- soli e il problema non si ripresenta.

update ai_usage
   set sezione = case when (extract(minute from created_at)::int % 10) < 5
                      then 'triage_whatsapp' else 'triage_email' end,
       funzione = 'ricostruito_da_orario',
       automatica = true
 where sezione = 'motore_storico';
