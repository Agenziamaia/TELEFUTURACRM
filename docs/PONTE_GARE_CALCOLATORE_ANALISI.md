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
  vero (le pillole opzioni = `catalog_opzioni` dell'offerta ∪ i token delle
  righe pay ancorate a `opzione` — il secondo è il backstop per scelte che
  pagano ma non sono ancora a catalogo). Qualsiasi eccezione va motivata
  qui dentro.

## Eccezioni motivate (uniche ammesse, da rivedere se il motore cambia)

- `w3_commissioning.tsx` (pannello Commissioning): la CELLA fa
  `canone × Σmolt + flat` in loco e la modalità ragazzi ha `derivaTiers`,
  copia dichiarata della formula di `deriva()` del motore. Motivo: il
  pannello mostra l'intera matrice offerte×soglie×declinazioni e il motore
  non espone un'API per-cella; l'equivalenza numerica (arrotondamenti
  per-riga inclusi) è stata verificata dal revisore il 25/08 su azienda E
  ragazzi. ⚠️ Se si tocca `deriva()`/`payEuroAttivazione`, aggiornare
  ANCHE `derivaTiers` e ri-collaudare pannello↔Calcolatore.

## Glossario universale (Luca 25/08)

- **«Wireline» NON esiste nel gestionale: si dice FISSO.** Nomi piste, righe
  e note sono già stati bonificati (mig `20260825140000`). Quando si
  importano le **lettere di gara Vodafone e Fastweb** — probabilmente
  l'unico posto dove la parola ricompare — «Wireline» va SEMPRE mappata
  sulla pista **fisso** (chiavi già giuste: `fisso` / `business_fisso`),
  mai riportata nei testi a schermo.

Storia: nata il 25/08 quando il fisso W3 ha preso GA/GNP · FTTC/FTTH ·
Illimitate come determinanti del pay e il Calcolatore non le chiedeva (le
pillole nascevano dalle sole righe `opzione`). Fix: pillole dal catalogo.
