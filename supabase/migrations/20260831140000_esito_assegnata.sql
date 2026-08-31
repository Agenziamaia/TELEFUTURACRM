-- L'ESITO «ASSEGNATA» (Luca 31/08).
--
-- Il fatto: il direttore del call center ha importato delle liste e le ha
-- assegnate ai caller, e le pratiche sono finite in malus quasi subito. Il CRM
-- non ha sbagliato niente — le liste nascono con l'esito «Nuovo», e «Nuovo» ha
-- warning a 0 giorni e malus a 1. Ha sbagliato la REGOLA: una lista appena
-- assegnata non può essere in ritardo il giorno dopo.
--
-- Serviva distinguere due cose che finora avevano lo stesso nome:
--   · «Nuovo»      → una pratica che entra nel CRM e va lavorata subito;
--   · «Assegnata»  → un blocco di lead che arriva sulla scrivania di un caller
--                    e che gli si dà il tempo di aggredire.
-- Quindi un esito nuovo, e con i suoi tempi: da lavorare SUBITO (0), warning
-- dopo 2 giorni, malus dopo 3.
--
-- Passa dal CATALOGO (caller_opzioni), non da una costante nel codice: è da lì
-- che la sezione Call Center prende le voci delle tendine e la tabella delle
-- regole. Un esito scritto solo nel codice sarebbe un esito che il pannello
-- non sa gestire.
--
-- I giorni sono quelli del BADGE, non del calendario: warning e malus contano
-- solo le giornate in cui il caller ha timbrato (`lavorativiDopo` col set dei
-- badge). Chi non lavora non invecchia le sue pratiche. «Da lavorare» invece
-- guarda i giorni naturali, ed è giusto così: è un promemoria, non una penale
-- — e con 0 giorni scatta comunque subito, come chiesto.

-- ── ① IL CATALOGO ────────────────────────────────────────────────────────
insert into caller_opzioni (categoria, voce, ordine, attiva, comportamento)
values ('stato', 'Assegnata', 5, true, 'neutro')
on conflict (categoria, voce) do update
   set ordine = excluded.ordine, attiva = true, comportamento = excluded.comportamento;

-- ── ② LE REGOLE ──────────────────────────────────────────────────────────
-- malus giornaliero uguale a quello di «Nuovo» (5 €): cambia il tempo che si
-- concede, non quanto costa il ritardo.
insert into caller_regole (stato, giorni_lavorare, giorni_warning, giorni_malus, malus_giorno, esente)
values ('Assegnata', 0, 2, 3, 5.00, false)
on conflict (stato) do update
   set giorni_lavorare = excluded.giorni_lavorare,
       giorni_warning  = excluded.giorni_warning,
       giorni_malus    = excluded.giorni_malus,
       malus_giorno    = excluded.malus_giorno,
       esente          = excluded.esente,
       updated_at      = now();

-- ── ③ LE PRATICHE GIÀ ASSEGNATE ──────────────────────────────────────────
-- Tutte quelle che vengono da una lista e sono ancora ferme su «Nuovo»: sono
-- esattamente le liste assegnate di cui parla la segnalazione.
-- La riga di storico porta la data dell'ASSEGNAZIONE, non quella di oggi: il
-- conto dei giorni non si azzera, cambia solo il metro con cui si misura.
with da_convertire as (
  select id,
         coalesce((storico -> 0 ->> 'data'), data_chiamata::text, created_at::text) as quando
    from calls
   where stato = 'Nuovo' and lista_origine is not null
)
update calls c
   set stato = 'Assegnata',
       storico = coalesce(c.storico, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
         'data', d.quando, 'caller', 'Sistema', 'campo', 'Stato',
         'da', 'Nuovo', 'a', 'Assegnata (correzione: le liste assegnate hanno tempi propri)'))
  from da_convertire d
 where c.id = d.id;

-- ── ④ I MALUS NATI DALLA REGOLA SBAGLIATA ────────────────────────────────
-- Ogni episodio maturato mentre la pratica era «Nuovo» e veniva da una lista
-- assegnata: sono tutti figli del warning a 0 e del malus a 1 giorno, e vanno
-- annullati — compresi quelli già chiusi, perché la pratica è stata poi
-- lavorata ma il ritardo era stato misurato col metro sbagliato.
-- Si usa il TOMBSTONE (eliminato = true), la stessa strada del backfill del
-- match: l'episodio resta in traccia ma esce dalla sincronizzazione e
-- dall'archivio. I COMPENSATI non si toccano mai — e infatti non ce ne sono.
update caller_malus m
   set eliminato = true,
       eliminato_il = now(),
       eliminato_da = 'Backfill esito Assegnata 31/08'
  from calls c
 where c.id::text = m.call_id::text
   and m.stato_pratica = 'Nuovo'
   and c.lista_origine is not null
   and m.stato <> 'compensato'
   and m.eliminato is not true;
