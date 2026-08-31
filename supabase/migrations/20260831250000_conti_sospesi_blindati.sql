-- ═══════════════════════════════════════════════════════════════════════════
-- I CONTI IN SOSPESO SI TOCCANO SOLO DAL SERVER — 31/08/2026
--
-- La rotta `/api/vendita/sospendi` è stata blindata stamattina: legge, sospende
-- e chiude solo dentro il perimetro di chi chiede. Ma la porta accanto era
-- spalancata — il revisore l'ha attraversata davvero, dentro una transazione
-- annullata, col lasciapassare di uno store manager qualsiasi:
--   · select  → TUTTI i conti aperti di TUTTI i negozi, col cliente e l'importo
--   · update  → conto di un altro negozio marcato annullato
--   · delete  → conti aperti cancellati
-- Cioè: il difetto che Luca ha segnalato si riproduceva identico saltando la
-- rotta, e in più si potevano far sparire dei soldi da incassare.
--
-- La riparazione non è una policy più furba. Questa tabella la tocca UNA cosa
-- sola — la rotta, che usa il ruolo di servizio — quindi al browser non serve
-- alcun permesso: nessuno. Una porta che non esiste non si sfonda.
-- ═══════════════════════════════════════════════════════════════════════════

revoke all on public.vendite_sospese from anon, authenticated;

-- ── CHI HA CHIUSO IL CONTO ───────────────────────────────────────────────
-- `created_by` è nullo su tutte le righe e non esisteva un `closed_by`: i
-- 209,90 € di Donna annullati il 31/08 alle 14:41 non hanno un nome accanto.
-- Su un registratore di cassa, «chi» non è un dettaglio.
alter table public.vendite_sospese add column if not exists closed_by text;
comment on column public.vendite_sospese.closed_by is
  'Chi ha completato o annullato il conto: preso dalla sessione firmata, mai dal corpo della richiesta.';
