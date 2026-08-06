# Piano — Creatore di slide dentro il CRM (riunioni mensili)

> Ragionamento validato con Luca il 06/08/2026 ("tieni da parte il ragionamento").
> Contesto: da Agosto 2026 i dati aziendali vivono nel CRM (Luglio = ultimo Excel);
> le riunioni mensili (inizio + metà mese) vanno generate dal gestionale.
> Riferimento processo/convenzioni: `Telefutura/Produzione_Mensile/GUIDA_Riunione_Mensile.md`.

## Riformulazione del bisogno
"Tutte le funzionalità di PowerPoint" ≠ clonare PowerPoint. Le funzioni usate davvero:
layout coerenti · numeri dai dati veri · testi/giudizi modificabili · presentare ·
esportare PPTX/PDF · IL RAGIONAMENTO (giudizi, priorità). Il builder deve essere forte
dove PowerPoint è debole (dati agganciati + regia generata) e accettare rigidità sul
disegno libero (niente canvas drag&drop: costi mesi e rompe la coerenza grafica).

## Strade valutate
- **A. Solo export PPTX da template** → vicolo cieco: le modifiche non tornano nel sistema.
- **B. OnlyOffice/motore office embedded** → infra pesante sul VPS, zero aggancio dati, grafica estranea.
- **C. Deck builder nativo a blocchi** ✅ SCELTA.
- **D. Status quo (deck generati da Claude via terminale, CRM archivia)** → rete di sicurezza/fase 0.

## Architettura scelta (C) — tre anime
1. **DATI**: endpoint `/api/riunione/dataset?mese=` che calcola il pacchetto riunione con le
   STESSE funzioni delle pagine (contracts, target Gare, caller, marginalità, conto economico PV).
   **SNAPSHOT, non live**: il dataset si congela nel deck (come le % gara in riunione);
   bottone esplicito "🔄 Aggiorna dati". Regole strutturali nell'endpoint, non nei prompt
   (es. Marta/Promontori MAI in classifiche). I gap riservati sulle soglie comunicate NON
   entrano mai nel CRM (restano nel flusso esterno con Claude).
2. **SLIDE**: deck = JSON di blocchi tipizzati (cover, riga-kpi, tabella-countdown,
   griglia-classifica, tabella-soglie, card-priorità, testo, immagine, grafico) renderizzati
   da componenti React col design system CRM. I layout ESISTONO GIÀ: sono quelli di
   `build_slides_crm.js` (deck Agosto 2026) da portare a componenti condivisi.
   Editor stile Gamma/Notion: testo inline, override celle, riordina/duplica/nascondi slide;
   blocco modificato a mano = flag "✋ manuale", sopravvive all'aggiorna-dati.
   **Presenta** = route fullscreen (frecce, TV/browser). **Export**: PPTX via pptxgenjs
   client-side (riuso layout 1:1), PDF via stampa.
3. **REGIA**: bottone "Genera bozza riunione" → snapshot + GUIDA_Riunione_Mensile come
   prompt versionato nel repo → Claude API compila i blocchi narrativi (giudizi ✅≥95% /
   🆗 92-94 / ⚠️ 75-91 / ⛔ <75, bande ±5 proiezione e ±10 mese, tono). Per blocco:
   "🔁 Rigenera" / "✏️ scrivi tu". Bozza attesa buona ~80%: le decisioni restano a Luca.
   Costo: centesimi/deck; chiave API in env; solo direzione.

## Fasi (una sessione ciascuna)
0. Pagina Riunioni (archivio deck) + endpoint dataset ← fondamento comune
1. Renderer + Presenta + export PPTX (deck read-only da dataset)
2. Editor a blocchi (testi, override, riordino)
3. Regia AI (bozza + rigenera blocco)
4. Grafici trend, tema chiaro stampa, template extra (call center, HR)

**Prerequisito**: conto economico per punto vendita (cantiere del 07/08) — serve alle
slide gare/utile. Permessi: capacità dedicate (gestisce=direzione · presenta · vede).
Obiettivo dichiarato: la riunione di Settembre 2026 presentata dal CRM.
