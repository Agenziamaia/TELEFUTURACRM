-- ═══════════════════════════════════════════════════════════════════════════
-- I TRASFERIMENTI: LE RIGHE DEL DOCUMENTO (Luca 31/08)
--
-- «C'è uno stato "in transito", però che significa in transito? Io invio un
--  prodotto da un negozio, in quel momento è in transito, va bene. Nel momento
--  in cui viene accettato va in disponibilità dell'altro negozio — ma il primo
--  negozio che l'ha inviato come lo vede quel prodotto? Non lo vede. Non c'è
--  uno storico dei prodotti che sono stati trasferiti.»
--
-- PERCHÉ OGGI NON LO VEDE, in una riga: il legame fra un pezzo e il suo DDT
-- vive in `mag_unita.ddt_id`, che tiene UN solo documento e viene AZZERATO
-- all'accettazione. Nel momento esatto in cui il trasferimento riesce, la
-- prova che sia mai avvenuto sparisce dalla riga del pezzo. `mag_eventi` (la
-- migrazione 20260831140000) racconta la storia di UN seriale; ma non c'è
-- niente che racconti la storia di UN DOCUMENTO, e soprattutto:
--   · la merce a QUANTITÀ — accessori e SIM, cioè 6.700 pezzi su 7.300, l'84%
--     del magazzino — non si può proprio trasferire: non ha un `ddt_id` dove
--     scriversi, quindi il DDT non la può nemmeno elencare;
--   · un DDT non è un elenco di pezzi: è un DOCUMENTO CON DELLE RIGHE, e una
--     riga ha una sua fine («ne sono arrivati 5 su 6») che il pezzo da solo
--     non sa raccontare.
--
-- QUESTA TABELLA È LA MEMORIA DEL DOCUMENTO. Le sue righe non si azzerano mai:
-- restano lì con negozio_da, negozio_a, società, quantità e come è finita.
-- È la risposta letterale alla domanda di Luca — il mittente filtra per
-- `negozio_da` e rivede tutto quello che ha spedito, per sempre.
--
-- NON APPLICATA: la legge Luca e la applica lui.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. IL DOCUMENTO SA CHE COS'È, E COME È FINITO ─────────────────────────
--    `stato` era un testo con tre valori di fatto (in_transito · accettato ·
--    annullato) e nessuno di loro sapeva dire «ne sono arrivati cinque su
--    sei». Non si mette un check: gli stati di questo CRM cambiano più in
--    fretta di quanto si scrivano le migrazioni, e un check li fa fallire in
--    silenzio a metà giornata. Il significato sta scritto qui e nel codice.
--
--      in_transito · partito, nessuno l'ha ancora preso in carico
--      accettato   · arrivato tutto (o venduto in viaggio: è arrivato lo stesso)
--      parziale    · chiuso CON DIFFERENZE, e le differenze sono nelle righe
--      rifiutato   · respinto in blocco, la merce è tornata al mittente
--      annullato   · revocato dal mittente prima dell'arrivo; il NUMERO resta
--                    bruciato — un progressivo con i buchi non è un progressivo
--      uscito      · uscito dal gruppo (reso a fornitore): non c'è chi accetti
alter table mag_ddt add column if not exists tipo text not null default 'trasferimento';
comment on column mag_ddt.tipo is
  'trasferimento (stessa società, due sedi) · cessione (società diverse: DDT + FATTURA) · gemelli (stesso locale, insegne diverse: la merce non si muove, cambia proprietario) · reso_fornitore (esce dal gruppo)';

-- chi ha chiuso il documento, e perché è finito com'è finito
alter table mag_ddt add column if not exists chiuso_il  timestamptz;
alter table mag_ddt add column if not exists chiuso_da  text;
alter table mag_ddt add column if not exists motivo     text;

-- IL RESO A FORNITORE non ha un negozio di destinazione: ha un soggetto
-- esterno. `a_negozio` è `not null` e resta l'etichetta breve; qui stanno i
-- dati veri, che sul documento SONO il destinatario — «Spett.le», partita IVA
-- e luogo di consegna. Separati come quelli di un negozio, e per la stessa
-- ragione: su un documento di trasporto un indirizzo o è preciso o si vede
-- che manca (revisore 31/08: senza questi campi il DDT di un reso usciva
-- intestato alla società che spedisce).
alter table mag_ddt add column if not exists destinatario            text;
alter table mag_ddt add column if not exists destinatario_piva       text;
alter table mag_ddt add column if not exists destinatario_indirizzo  text;   -- via
alter table mag_ddt add column if not exists destinatario_civico     text;
alter table mag_ddt add column if not exists destinatario_cap        text;
alter table mag_ddt add column if not exists destinatario_citta      text;
alter table mag_ddt add column if not exists destinatario_provincia  text;

-- LA FATTURA CHE DEVE SEGUIRE. Fra società diverse il DDT da solo non basta:
-- è una cessione fra due soggetti. Senza un posto dove segnarlo, «l'abbiamo
-- fatturata?» è una domanda a cui si risponde a memoria.
alter table mag_ddt add column if not exists fattura_stato text;   -- da_emettere | emessa | non_dovuta
alter table mag_ddt add column if not exists fattura_rif   text;
alter table mag_ddt add column if not exists fattura_il    date;

-- il valore del documento: serve alla fattura e a «quanta merce è uscita»
alter table mag_ddt add column if not exists valore numeric;

create index if not exists mag_ddt_da     on mag_ddt (da_negozio, creato_il desc);
create index if not exists mag_ddt_a      on mag_ddt (a_negozio, creato_il desc);
create index if not exists mag_ddt_stato  on mag_ddt (stato, creato_il desc);

-- ── 2. LE RIGHE ───────────────────────────────────────────────────────────
create table if not exists mag_ddt_righe (
    id        uuid primary key default gen_random_uuid(),
    ddt_id    uuid not null references mag_ddt(id) on delete cascade,
    riga      integer not null default 1,

    -- CHE COSA. `descrizione` è copiata, non presa in join: un documento di
    -- trasporto dice quello che diceva il giorno in cui è stato emesso, anche
    -- se l'anagrafica dell'articolo poi cambia nome.
    codice       text,
    descrizione  text not null,
    unita_id     uuid,      -- il pezzo con seriale, se ce l'ha
    seriale      text,

    -- QUANTO. Un pezzo con seriale è sempre 1; un accessorio è un numero.
    quantita            numeric not null default 1,
    quantita_accettata  numeric,          -- quanti ne sono arrivati DAVVERO
    valore_unitario     numeric,

    -- DA DOVE A DOVE, E DI CHI ERA. Ripetuti sulla riga apposta: è quello che
    -- resta quando `mag_unita.ddt_id` viene azzerato, ed è l'indice su cui il
    -- mittente ritrova la sua merce.
    negozio_da text not null, negozio_a text not null,
    azienda_da text,          azienda_a text,

    -- COME È FINITA
    --   in_viaggio           · partita, non ancora presa in carico
    --   accettata            · arrivata e messa a scaffale
    --   mancante             · il ricevente non l'ha trovata nel pacco
    --   rifiutata            · respinta (danneggiata, sbagliata)
    --   venduta_in_viaggio   · venduta prima che qualcuno accettasse il DDT
    --   annullata_in_viaggio · cestinata dall'amministrazione mentre viaggiava
    --   rientrata            · tornata al mittente (DDT annullato o rifiutato)
    --   ammanco              · nessuno l'ha più trovata: persa, e messa a perdita
    --   uscita               · uscita dal gruppo (reso a fornitore): non torna
    stato   text not null default 'in_viaggio',
    motivo  text,
    chiusa_il timestamptz,
    chiusa_da text,
    creato_il timestamptz not null default now()
);
create index if not exists mag_ddt_righe_doc     on mag_ddt_righe (ddt_id, riga);
create index if not exists mag_ddt_righe_da      on mag_ddt_righe (negozio_da, creato_il desc);
create index if not exists mag_ddt_righe_a       on mag_ddt_righe (negozio_a, creato_il desc);
create index if not exists mag_ddt_righe_seriale on mag_ddt_righe (seriale) where seriale is not null;
create index if not exists mag_ddt_righe_stato   on mag_ddt_righe (stato);

/* CHIUNQUE PUÒ LEGGERE E SCRIVERE, NESSUNO PUÒ CANCELLARE (revisore 31/08).
   La chiave anon viaggia dentro il bundle del browser: `delete` concesso a
   anon vuol dire che chiunque apra gli strumenti per sviluppatori può far
   sparire le righe di un documento di trasporto — cioè proprio quello che
   questa tabella esiste per impedire («le sue righe non si azzerano mai»).
   È la stessa lezione della migrazione 20260831210000 su `mag_eventi`.
   L'applicazione ha bisogno di INSERT e UPDATE (emettere, accettare, chiudere
   una differenza), non di DELETE: un documento sbagliato si annulla, non si
   cancella. Se un giorno servisse cancellare davvero, lo fa chi ha la chiave
   di servizio. */
alter table mag_ddt_righe enable row level security;
drop policy if exists mag_ddt_righe_allow_all on mag_ddt_righe;
drop policy if exists mag_ddt_righe_lettura on mag_ddt_righe;
drop policy if exists mag_ddt_righe_scrittura on mag_ddt_righe;
drop policy if exists mag_ddt_righe_modifica on mag_ddt_righe;
create policy mag_ddt_righe_lettura   on mag_ddt_righe for select using (true);
create policy mag_ddt_righe_scrittura on mag_ddt_righe for insert with check (true);
create policy mag_ddt_righe_modifica  on mag_ddt_righe for update using (true) with check (true);
grant select, insert, update on mag_ddt_righe to anon, authenticated;
revoke delete on mag_ddt_righe from anon, authenticated;

-- ── 3. LA SOCIETÀ DELLA MERCE, NON QUELLA DEL NEGOZIO ─────────────────────
--    Regola §8a: LA SOCIETÀ SEGUE LA MERCE. Dalla migrazione 20260831200000 il
--    trigger `mag_ddt_numera` la indovina bene da solo — guarda di chi è la
--    merce che il negozio ha in casa, non più `stores.azienda` — ma resta una
--    STIMA: a Donna Olimpia convivono T1 e T2, e «quella con più pezzi» non è
--    «quella dei pezzi che sto spedendo adesso». Chi lo sa per certo è
--    l'operatore, che quei pezzi li ha appena spuntati: per questo la sezione
--    Trasferimenti scrive sempre `azienda_da` esplicito, e il trigger calcola
--    solo quando il campo arriva vuoto. Qui si scrive il perché, così chi
--    legge la tabella non lo deve indovinare.
comment on column mag_ddt.azienda_da is
  'La società PROPRIETARIA della merce che parte — non quella del negozio: a Donna Olimpia convivono T1 e T2 e la merce resta di chi è. Se arriva NULL la deduce il trigger mag_ddt_numera, che dalla 20260831200000 guarda di chi è la merce a scaffale: è una buona stima, ma resta una stima. Chi lo sa per certo è l''operatore che ha appena spuntato i pezzi, e la sezione Trasferimenti lo scrive sempre esplicito. Un DDT trasporta merce di UNA sola società: due società = due documenti.';

comment on column mag_ddt.azienda_a is
  'La società che riceve. La scrive la sezione Trasferimenti con lo stesso valore che ha mostrato all''operatore («la merce passa da X a Y»): lasciarla calcolare al trigger faceva uscire due esiti fiscali diversi sulla stessa tratta a minuti di distanza, perché la sua ricerca sui pezzi del negozio di arrivo non filtra lo stato e un pezzo in transito porta già il negozio di destinazione.';

notify pgrst, 'reload schema';
