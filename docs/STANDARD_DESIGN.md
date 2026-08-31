# Il minimo, per una schermata di questo CRM

> Luca, 31/08/2026, guardando la sezione AI: **«Riesci a tenere questo come
> minimo? Questo va bene, non possiamo mai generare contenuti in termini di
> design inferiori.»**

Questa non è una guida di stile con le preferenze di qualcuno. È una **soglia**:
sotto non si consegna. Il riferimento vivo è `/amministrazione?sez=ai`, e il
codice sta in `src/app/(dashboard)/amministrazione/_views/ai_admin.tsx`.

Il giorno prima la stessa sezione era stata consegnata disegnata a mano, e la
reazione è stata: *«molto old style, non è in linea con il design e la user
experience del CRM; ci passo sopra e non dice quanto abbiamo speso quel giorno,
non posso filtrare per utente, non posso verificare QUANDO hanno speso»*. Tutte
e tre le cose erano vere, e tutte e tre nascevano dalla stessa scelta sbagliata:
**aver ridisegnato a mano quello che il CRM ha già.**

---

## 1. Gli strumenti esistono. Si usano quelli.

`src/app/(dashboard)/analisi/_charts.tsx` contiene tutto:

| Serve a | Componente |
|---|---|
| un valore contro un tetto o un obiettivo | `Ring` |
| il giorno per giorno, diviso per categoria | `BarStack` |
| un andamento nel tempo | `AreaChart` |
| una composizione (le fette di un totale) | `Donut`, `StackMix` |
| una classifica fra persone o cose | `RaceBars` |
| la variazione rispetto a prima | `Delta` |
| una spiegazione al passaggio del mouse | `Tip`, `TipRiga`, `TipTitolo` |
| la densità su un calendario | `HeatCal` |
| soglie e scaglioni delle gare | `SogliaBar`, `AnelloScaglioni`, `ScalaSoglie` |
| un numero che si anima | `Num`, `useCountUp` |

**Mai riscriverli.** Una barra fatta con un `div` e una percentuale è il segnale
che qualcosa è andato storto: non avrà il tooltip, non avrà l'animazione, e fra
sei mesi sarà l'unica cosa nel CRM che si comporta in modo diverso.

> ⚠️ `_charts.tsx` è JavaScript con i default nei parametri, e TypeScript ne
> deduce tipi strettissimi e sbagliati (`media: null`, `colore` obbligatorio
> ovunque). Non storpiare le chiamate per accontentarlo: importa con
> `import * as G from ".../_charts"` e ridichiara i componenti che ti servono.
> C'è l'esempio in cima a `ai_admin.tsx`.

> ⚠️ `fmtEuro` arrotonda all'unità, perché in Analisi si parla di migliaia. Se
> la tua schermata parla di **centesimi** (la spesa dell'AI, per dire) mostrerà
> «0 €» su tutto: serve un formattatore con i decimali, e sotto il centesimo si
> scrive «<0,01 €» invece di un falso zero.

## 2. Ogni numero deve poter essere interrogato

Se un numero è sullo schermo, passandoci sopra deve dire **da cosa è composto**.
Un totale che non si apre costringe chi guarda a venire a chiederlo — e allora
tanto valeva non metterlo.

## 3. Il periodo si sceglie, sempre

Lo stesso selettore di Analisi: **Mese** (con le frecce avanti e indietro),
**Periodo** (due date), **Oggi**. Tre valori fissi in una tendina non sono un
selettore di periodo: sono tre valori fissi.

E accanto al periodo scelto va **il confronto con quello precedente di pari
lunghezza**. «Quanto era prima» è metà della risposta a «quanto è adesso».

## 4. I filtri valgono su tutta la schermata

Se la sezione parla di persone, ci deve essere il filtro per persona; se parla
di negozi, quello per negozio. E quando è attivo **ogni riquadro deve parlare di
quello**, non solo il primo: un filtro che agisce a metà è peggio di nessun
filtro, perché il resto della pagina mente.

## 5. La lingua visiva

- Testata: `rounded-3xl border-white/10 bg-[#0d1022]/80`, classe `an-scuro`, e
  le due aurore (`anAurora`) in `blur-3xl`
- Card: `glass-card an-card rounded-2xl`
- Numeri: `tabular-nums` — senza, le cifre ballano quando cambiano
- Ingresso: `an-in` sul contenitore

## 6. Guardala prima di consegnarla

**Il build verde non dice niente su com'è fatta.** Prima di consegnare una
schermata nuova:

1. crea una pagina di prova sotto `src/app/m/` (l'unica rotta senza login)
2. montaci il componente con dati finti ma **realistici** — se i dati veri sono
   centesimi, non metterci migliaia
3. fotografala con un browser vero e **guardala**

⚠️ Se la pagina di prova deve sostituire una chiamata API, fallo **fuori dal
componente**: gli effetti dei figli girano prima di quelli del genitore, e la
schermata chiamerà l'API vera prima che tu possa intercettarla.

---

## In una riga

Il CRM lo guardano cinquanta persone tutti i giorni. Una schermata che sembra di
un'altra epoca fa sembrare vecchio tutto il resto — e una che non risponde alle
domande ovvie (quanto, quando, chi) costringe a chiederle a mano, che è
esattamente il lavoro che doveva risparmiare.
