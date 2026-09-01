-- ═══ IL REGISTRO NON SCRIVEVA UNA RIGA ═════════════════════════════════════
-- Luca, 01/09 a negozi aperti: «da stamattina hanno fatto delle ricariche…
-- dentro la sezione di PayStore devo vedere tutte le ricariche che vengono
-- scontrinate. E invece non ce le ho. Non c'è una cazzo di riga.»
--
-- La causa: `contract_id` l'avevo dichiarato `uuid`, ma gli id dei contratti
-- sono TESTO — «EXT-D07449D1». Ogni inserimento moriva su
-- «invalid input syntax for type uuid», e l'errore finiva in una console del
-- browser che nessuno guarda. Le ricariche uscivano regolarmente sullo
-- scontrino, col reparto giusto: mancava solo la riga nel registro, cioè
-- l'unica cosa che dice che quel credito va ancora caricato.
--
-- ⚠️ NON L'HO PROVATO SUI DATI VERI. Avevo verificato l'insert con dati
-- inventati, dove il `contract_id` lo passavo `null`: il tipo sbagliato non
-- si vedeva. Il primo contratto vero l'ha trovato in tre secondi.

alter table public.paystore_ricariche
    alter column contract_id type text using contract_id::text;

comment on column public.paystore_ricariche.contract_id is
  'La riga EXT- della vendita in `contracts`. È TESTO, non uuid: gli id dei contratti sono «EXT-XXXXXXXX».';

-- ── GLI STATI, COME LI HA DETTI LUCA ──────────────────────────────────────
-- «Da fare sarà lo stato di tutte le ricariche che scontrineremo fino a
-- quando non colleghiamo le API; poi aggiungiamo la possibilità di definire
-- lo stato come effettuata e andata a buon fine, piuttosto che fallita,
-- piuttosto che da fare.»
--
-- Il vecchio 'manuale' descriveva COME veniva fatta; questi descrivono se il
-- credito è partito, che è la sola domanda che conta quando il cliente ha già
-- pagato. `da_inviare` e `inviata` sparirebbero comunque con l'API: si
-- accorpano ora, prima che ci siano righe da migrare a mano.
update public.paystore_ricariche set stato = 'da_fare'  where stato in ('manuale', 'da_inviare');
update public.paystore_ricariche set stato = 'fatta'    where stato = 'inviata';

alter table public.paystore_ricariche drop constraint if exists paystore_ricariche_stato_check;
alter table public.paystore_ricariche add constraint paystore_ricariche_stato_check
    check (stato in ('da_fare', 'fatta', 'fallita', 'annullata'));
alter table public.paystore_ricariche alter column stato set default 'da_fare';

comment on column public.paystore_ricariche.stato is
  'da_fare = scontrinata, il credito non risulta ancora caricato (è lo stato di tutte finché non c''è l''API) · fatta = credito partito · fallita = non è partito, e il cliente ha già pagato · annullata = storno.';

-- chi ha cambiato lo stato a mano, e quando: finché le ricariche si fanno sul
-- terminale del fornitore, «fatta» è la parola di una persona, e va firmata
alter table public.paystore_ricariche
    add column if not exists stato_da text,
    add column if not exists stato_il timestamptz,
    add column if not exists nota text;

-- l'indice serviva agli stati vecchi
drop index if exists paystore_ricariche_stato;
create index if not exists paystore_ricariche_stato on public.paystore_ricariche (stato)
    where stato in ('da_fare', 'fallita');
