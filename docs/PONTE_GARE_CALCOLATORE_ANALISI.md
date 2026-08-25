# ⚠️ REGOLA DEL PONTE — Gare ↔ Calcolatore ↔ Analisi (Luca, 25/08/2026)

> **Vincolante per OGNI terminal/sessione che tocca la sezione Gare, di
> qualsiasi brand.** «Ogni volta che viene toccata la sezione gare deve
> esserci un ponte diretto che, senza bisogno di modifiche a mano, aggiorna
> in automatico Calcolatore e Analisi: database collegato tra calcolatore,
> gare e analisi — per valore in punteggi e valore economico.»

## Il principio (com'è garantito il ponte)

Il ponte NON è sincronizzazione: è **un'unica fonte e un unico motore**.
Chi rispetta queste tre regole non deve "allineare" niente — l'allineamento
è strutturale:

1. **I dati di gara vivono SOLO nelle tabelle pay** (`pay_piste`,
   `pay_soglie`, `pay_righe`, `pay_mappa_soglie`, `pay_target_pdv`) e nel
   **catalogo** (`catalog_*`). Mai costanti hardcodate in una vista.
2. **Il calcolo passa SOLO da `src/lib/commissioning.ts`**:
   `caricaTabellare` / `matchRigheAttivazione` (→ `matchComponenti` +
   `flagsComponenti`) / `puntiPerRighe` / `calcolaAvanzamento` /
   `payEuroAttivazione`. Gare, Calcolatore e Analisi chiamano le STESSE
   funzioni sugli STESSI dati: un cambio a una riga pay o a un flag si
   propaga ovunque da solo.
3. **Le scelte di vendita che pagano si esprimono come OPZIONI DI CATALOGO**
   (o campi vendita), mai come UI speciale di una sola pagina: Registra
   Vendita le raccoglie, `flagsComponenti`/le righe ancorate a `opzione` le
   pagano, il Calcolatore le offre come pillole **lette dal catalogo
   dell'offerta selezionata** — così un'opzione nuova compare ovunque senza
   toccare codice di vista.

## Checklist per chi tocca le Gare (OBBLIGATORIA, ogni consegna)

- [ ] Il nuovo pay/punteggio vive in `pay_righe` (o tabelle pay), non in
      una vista? Se serve un comportamento nuovo → estendere il MOTORE
      (`commissioning.ts`), mai duplicare il calcolo in una pagina.
- [ ] Se il pay dipende da una scelta di vendita: la scelta esiste a
      catalogo (opzione, eventuale `gruppo_singolo`+`obbligatoria`) o nei
      campi vendita? `flagsComponenti`/`opzione` la leggono?
- [ ] **Calcolatore**: selezionando quell'offerta, la scelta compare e il
      pay reagisce? (Le pillole sono data-driven dal catalogo: se non
      compare, la scelta NON è a catalogo — tornare al punto sopra.)
- [ ] **Analisi**: i punti/pezzi passano da `matchRigheAttivazione` +
      `puntiPerRighe`? (Quando nascerà l'Analisi a VALORE ECONOMICO, dovrà
      usare `payEuroAttivazione` — stesso motore, mai una copia.)
- [ ] Collaudo incrociato su una vendita vera: Gare, Calcolatore e Analisi
      raccontano lo stesso numero.

## Dove NON nascondere calcoli

- Viste gare (`gare/_views/*`): possono SIMULARE (es. declinazioni del
  fisso) ma SOLO chiamando il motore con opzioni simulate (`setPerOpz` →
  `matchComponenti`), mai rifacendo la matematica.
- Il Calcolatore è «un Registra Vendita riassunto»: catalogo vero + motore
  vero. Qualsiasi eccezione va motivata qui dentro.

Storia: nata il 25/08 quando il fisso W3 ha preso GA/GNP · FTTC/FTTH ·
Illimitate come determinanti del pay e il Calcolatore non le chiedeva (le
pillole nascevano dalle sole righe `opzione`). Fix: pillole dal catalogo.
