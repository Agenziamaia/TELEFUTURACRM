-- ESITO ADMIN PER RIGA, sulle pratiche SCISSE (28/08/2026)
-- Luca: «sul 3P la fibra e il contratto DTV hanno due percorsi completamente
-- diversi, quindi sia l'esito del negozio sia quello dell'admin devono vivere
-- solo su quella scissione. Stessa cosa per il finanziamento col mobile MNP.
-- Il codice contratto è uno solo: va matchato con la categoria.»
--
-- L'esito NEGOZIO era già per riga (stati_categoria); quello ADMIN no: viveva
-- in `stato_admin`, una colonna sola, e finiva su entrambe le righe.
-- A oggi le pratiche scisse sono 168 (163 3P Sky + 5 mobile finanziamento+MNP).
alter table contracts add column if not exists stati_admin_categoria jsonb;
comment on column contracts.stati_admin_categoria is
  'Esito ADMIN per riga del Tracking quando la pratica è scissa (3P Sky = fisso+sky, mobile = mnp+finanziamento): un contratto solo, percorsi diversi. Chiave = categoria della riga. Assente = vale stato_admin.';

-- Gli eventi dello storico ora portano `cat` (la riga a cui appartengono):
-- è un campo dentro il jsonb `storia`, nessuna migrazione necessaria. Gli
-- eventi senza `cat` — tutto lo storico fino a oggi — valgono per tutte le
-- righe, come hanno sempre fatto.
