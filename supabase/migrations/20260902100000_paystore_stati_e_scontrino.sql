-- ═══ GLI STATI CHE SERVONO DAVVERO ═════════════════════════════════════════
-- Luca 02/09: «"fatta" è troppo generico: dobbiamo mettere uno stato OK
-- AUTOMATICO e OK MANUALE. Ok automatico è verde, la ricarica è andata; ok
-- manuale è stata fatta manualmente. E "da fare" possiamo modificarlo in
-- SOSPESO, che dà più l'idea: sono le ricariche che hanno un problema sul
-- processo — o dove non esce lo scontrino, o dove lo scontrino viene messo in
-- pausa — e quelle vanno gestite manualmente.»
--
-- La differenza fra automatico e manuale non è un dettaglio contabile: dice
-- se il credito è partito da solo (e allora ci fidiamo del fornitore) o se
-- l'ha caricato una persona (e allora è la sua parola). Con l'API accesa il
-- primo diventa la norma e il secondo l'eccezione da guardare.
-- ⚠️ PRIMA SI TOGLIE IL VINCOLO, POI SI AGGIORNA. Al contrario il vecchio
-- vincolo — che di «sospeso» non sa niente — rifiuta l'aggiornamento stesso:
-- «new row violates check constraint», su una riga che stiamo proprio
-- portando al valore nuovo.
alter table public.paystore_ricariche drop constraint if exists paystore_ricariche_stato_check;
alter table public.paystore_ricariche alter column stato drop default;

update public.paystore_ricariche set stato = 'sospeso'    where stato in ('da_fare', 'manuale', 'da_inviare');
update public.paystore_ricariche set stato = 'ok_manuale' where stato in ('fatta', 'inviata');

alter table public.paystore_ricariche add constraint paystore_ricariche_stato_check
    check (stato in ('sospeso', 'ok_automatico', 'ok_manuale', 'fallita', 'annullata'));
alter table public.paystore_ricariche alter column stato set default 'sospeso';

comment on column public.paystore_ricariche.stato is
  'sospeso = da gestire a mano (processo non concluso: scontrino mancante, messo in pausa, o API non ancora collegata) · ok_automatico = eseguita dall''API · ok_manuale = caricata da una persona · fallita = il fornitore ha rifiutato · annullata = storno.';

-- ── LO STATO DELLO SCONTRINO, in una parola sola ──────────────────────────
-- Luca: «una colonna che è lo stato dello scontrino: per emesso è tutto ok,
-- un verde che non sia troppo appariscente; lì dove lo scontrino viene messo
-- in pausa me lo devi segnalare, lì dove lo scontrino non esce me lo devi
-- segnalare, perché l'amministrazione in quel caso va a fare una verifica.»
alter table public.paystore_ricariche
    add column if not exists scontrino_stato text
        check (scontrino_stato in ('emesso', 'errore', 'in_pausa'));

comment on column public.paystore_ricariche.scontrino_stato is
  'emesso = il registratore ha stampato · errore = il lavoro di stampa è fallito · in_pausa = la vendita è stata messa da parte, lo scontrino non è ancora uscito · null = non lo sappiamo (non abbiamo trovato il lavoro di stampa).';

-- quello che sappiamo già dalla colonna di ieri
update public.paystore_ricariche set scontrino_stato = 'emesso' where scontrino_emesso is true  and scontrino_stato is null;
update public.paystore_ricariche set scontrino_stato = 'errore' where scontrino_emesso is false and scontrino_stato is null;

create index if not exists paystore_ricariche_da_gestire
    on public.paystore_ricariche (creata_il desc) where stato = 'sospeso';
