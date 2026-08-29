-- ═══════════════════════════════════════════════════════════════════════════
-- LA eSIM WINDTRE ESISTE (Luca 29/08)
--
-- «La ESIM Wind3 ad oggi non esiste, va creata.» Non c'era nel magazzino di
-- Donna — lì c'è solo la SOSTITUTIVA — ma nel listino generale c'è eccome, e
-- con l'import dell'anagrafica è entrata: `0U4K01C1017001` «eSIM WindTre»,
-- 10 €, ART.74, reparto 1 (non soggetta, come tutte le SIM).
-- Non è stata «creata»: è stata trovata. Nel listino ce n'è anche una seconda,
-- `0U4K01C1017002` «eSIM WindTre Wind»: se è quella giusta si cambia una riga.
--
-- A Donna ha ZERO pezzi, quindi il pulsante nascerà spento: è la regola —
-- quello che non c'è non si vende — e si accende da sé al primo carico.
-- ═══════════════════════════════════════════════════════════════════════════

update marg_items set codice_magazzino = '0U4K01C1017001'
 where name = 'ESIM Windtre'
   and codice_magazzino is null
   and exists (select 1 from mag_articoli where codice = '0U4K01C1017001' and attivo);
