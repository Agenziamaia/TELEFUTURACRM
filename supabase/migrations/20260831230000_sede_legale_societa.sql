-- ═══════════════════════════════════════════════════════════════════════════
-- LA SEDE LEGALE DELLE DUE SOCIETÀ — 31/08/2026
--
-- Dati dati da Luca. Senza questi, ogni documento di trasporto usciva col
-- blocco rosso «Documento non ancora valido. Mancano: la sede legale…» —
-- il meccanismo funzionava, mancava solo il dato.
--
-- Le due società hanno la STESSA sede legale (Via della Magliana 263): non è
-- un errore di copiatura, sono due soggetti che convivono allo stesso
-- indirizzo. Il documento le distingue dalla partita IVA, che è diversa.
--
-- Il codice fiscale resta NULL di proposito: per una S.R.L. coincide con la
-- partita IVA, e il generatore lo sa già (`mit?.codice_fiscale ? … : piva`).
-- Scriverlo due volte vorrebbe dire due posti dove sbagliarlo.
-- ═══════════════════════════════════════════════════════════════════════════

update aziende set
    ragione_sociale = 'TELEFUTURA S.R.L.',
    sede = 'Via della Magliana, 263',
    cap = '00146', citta = 'Roma', provincia = 'RM'
where codice = 'T1';

update aziende set
    ragione_sociale = 'TELEFUTURA 2 S.R.L.',
    sede = 'Via della Magliana, 263',
    cap = '00146', citta = 'Roma', provincia = 'RM'
where codice = 'T2';
