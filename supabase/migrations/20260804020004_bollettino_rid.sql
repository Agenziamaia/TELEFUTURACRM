-- Mig. 162 — BOLLETTINO e RID MUTUAMENTE ESCLUSIVI SU ENERGIA (RV-07,
-- Luca 04/08/2026). Il meccanismo esiste gia' ed e' generico:
-- catalog_opzioni.gruppo_singolo + toggle di Registra Vendita (selezionando
-- un'opzione del gruppo si deselezionano le altre). Qui si marca
-- gruppo_singolo='pagamento' sulle opzioni Bollettino/RID della SOLA
-- categoria Energia: 32 righe attese (windtre 24, s4 8). Le 9 opzioni RID
-- di windtre Multi-Servizi/Assicurazioni NON hanno un Bollettino gemello e
-- NON si toccano (filtro per categoria). La regola campi "opzione RID" →
-- IBAN continua a funzionare: scegliendo Bollettino, RID si spegne e l'IBAN
-- sparisce dal form. Nessun contratto storico ha entrambe le opzioni
-- insieme: vincolo solo prospettico.
UPDATE public.catalog_opzioni k
SET gruppo_singolo = 'pagamento'
FROM public.catalog_offerte o
JOIN public.catalog_prodotti p ON p.id = o.prodotto_id
JOIN public.catalog_categorie c ON c.id = p.categoria_id
WHERE k.offerta_id = o.id
  AND c.nome = 'Energia'
  AND k.nome IN ('Bollettino', 'RID')
  AND k.gruppo_singolo IS DISTINCT FROM 'pagamento';

NOTIFY pgrst, 'reload schema';
