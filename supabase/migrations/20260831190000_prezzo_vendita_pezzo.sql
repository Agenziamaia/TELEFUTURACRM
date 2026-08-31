-- ═══════════════════════════════════════════════════════════════════════════
-- A QUANTO L'HO VENDUTO (Luca 31/08)
--
-- «Nel momento in cui clicco sullo stato venduto la tabella si deve
--  modificare: mi deve dare il prezzo al quale l'ho venduto e il giorno in
--  cui l'ho venduto.»
--
-- Il giorno c'era (`venduto_il`). Il prezzo NO, e non stava da nessuna parte:
--   · `mag_unita.valore` è il valore di CARICO, quanto costava entrando
--   · `mag_movimenti.prezzo_unitario` esiste, ma per i pezzi con seriale un
--     movimento non si scrive: si marca il pezzo «venduto» e basta
--   · restava solo `contracts`, cioè risalire al contratto per ogni riga
-- Un magazzino che sa cosa è uscito ma non a quanto non risponde alla prima
-- domanda che gli si fa.
-- ═══════════════════════════════════════════════════════════════════════════

alter table mag_unita add column if not exists prezzo_vendita numeric;
comment on column mag_unita.prezzo_vendita is
  'Il prezzo a cui il pezzo è stato venduto (≠ `valore`, che è il costo di carico). Scritto da scaricaVendita.';
