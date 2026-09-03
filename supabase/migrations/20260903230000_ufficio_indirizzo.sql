-- ═══════════════════════════════════════════════════════════════════════════
-- L'UFFICIO HA UN INDIRIZZO — 03/09/2026
--
-- Il carico merce parte SEMPRE dall'Ufficio, quindi `da_negozio = 'Ufficio'`
-- su ogni documento che nasce da lì. Ma in `stores` l'Ufficio non aveva né
-- via, né civico, né CAP, né città: `cosaMancaPerEmettere` lo marcava
-- «indirizzo incompleto» e la sezione avvisava, a ragione, che un documento
-- di trasporto emesso così NON SAREBBE VALIDO. Il mittente è un elemento
-- obbligatorio del DDT.
--
-- QUAL È L'INDIRIZZO. Non l'ho inventato: è l'unico che l'azienda ha in tutto
-- il gestionale, e ci arrivano quattro strade indipendenti —
--   · sede legale di TELEFUTURA S.R.L.    → Via della Magliana, 263 · 00146 Roma (RM)
--   · sede legale di TELEFUTURA 2 S.R.L.  → la stessa
--   · il negozio «Laboratorio»            → Via della Magliana 263 · 00146 Roma (RM)
--   · il negozio «Magliana»               → la stessa
-- L'Ufficio è il magazzino dell'azienda, e sta dove sta l'azienda.
--
-- Se il civico fosse un altro — un magazzino sul retro, un altro numero — si
-- cambia in Amministrazione → Negozi in dieci secondi: questa migrazione
-- scrive solo dove non c'è niente, quindi non sovrascriverà mai una
-- correzione fatta a mano.
-- ═══════════════════════════════════════════════════════════════════════════
update public.stores s
   set address   = coalesce(s.address,   regexp_replace(a.sede, ',\s*\d+\s*$', '')),
       civico    = coalesce(s.civico,    substring(a.sede from '(\d+)\s*$')),
       cap       = coalesce(s.cap,       a.cap),
       citta     = coalesce(s.citta,     a.citta),
       provincia = coalesce(s.provincia, a.provincia)
  from public.aziende a
 where s.name = 'Ufficio' and a.codice = 'T1'
   and (s.address is null or s.civico is null or s.cap is null or s.citta is null);
