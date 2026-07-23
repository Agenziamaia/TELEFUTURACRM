-- 069: esiti distinti per tipo di controllo sulla stessa pratica.
--
-- Segnalazione 66 (Francesco): "Sabrina Reale ha due verifiche da effettuare,
-- FINANZIAMENTO e MNP. Non e' possibile che se metto esito su uno dei due questo
-- si replica anche nell'altro. I due controlli devono essere distinti."
--
-- Con la doppia riga introdotta per la segnalazione 43, un contratto con
-- finanziamento + MNP compare due volte, ma entrambe le righe scrivevano sulla
-- stessa colonna stato_negozio: aggiornarne una cambiava anche l'altra.
--
-- Gli esiti per categoria vivono in una mappa { categoria: stato }.
-- stato_negozio resta la colonna principale (compatibilita' con il resto del
-- CRM e con lo `stato` del contratto) e vale come esito della categoria base.

alter table public.contracts
  add column if not exists stati_categoria jsonb not null default '{}'::jsonb;

comment on column public.contracts.stati_categoria is
  'Esito di lavorazione per tipo di controllo, es. {"mnp":"in_corso","finanziamento":"attivato"}. Una pratica con piu'' controlli compare su piu'' righe nel Tracking PDA e ogni riga ha il proprio esito.';

notify pgrst, 'reload schema';
