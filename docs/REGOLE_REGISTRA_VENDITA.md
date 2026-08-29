# Le regole di Registra Vendita

> **A cosa serve questo foglio.** Il 28/08/2026 Registra Vendita è stata
> riportata a una lingua sola: prima ogni riquadro era ridisegnato a mano dove
> serviva, e la stessa cosa aveva sei facce diverse. Chi tocca questa sezione
> da adesso in poi segue queste regole — se no fra un mese siamo al punto di
> partenza e il lavoro è stato buttato.
>
> **Le regole si possono cambiare.** Ma si cambiano *qui*, e si riadegua tutto
> quello che le seguiva: una regola valida a metà è peggio di nessuna regola.
>
> Vale per chiunque metta le mani sul file: persone e assistenti.

---

## 1. Non si scrivono stili a mano. Si usa la cassetta.

Il foglio di stile della sezione sta in **`src/app/globals.css`**, blocco
«REGISTRA VENDITA». **Non** dentro la pagina: il ramo del carrello esce prima
di montare un `<style>` di pagina, e lì le classi sparirebbero — è già successo,
e i bottoni tornavano bottoni grigi di sistema.

| Ti serve… | Usa | Non usare |
|---|---|---|
| un riquadro di dati | `.rvBox` + `.rvBoxT` | un `<div>` con fondo e bordo a mano |
| la card di una tappa | `.rvCard` + `.rvCardT` | idem |
| un sotto-riquadro neutro | `.rvSub` | idem |
| una scelta, un interruttore | `.rvPill` (+ `-on -si -no -sm`) e `.rvPillRow` | un `<button>` con bordo e fondo a mano |
| una pastiglia **su una banda colorata** | `.rvPillLuce` | `.rvPill` (sparirebbe) |
| l'azione principale di una schermata | `.rvAzione` (+ `-att` `-viola`) | un bottone verde a mano |
| un campo | `.rvIn` (+ `-ok -err -lock -alt -mod`) | un `<input>` vestito a mano |
| l'etichetta di un campo | `.rvLab` — e `.rvLabX` per la parte che non va urlata | un `<div>` a 10-11px |
| una domanda (finisce con «?») | `.rvDom` | `.rvLab`: non va in maiuscolo |
| una griglia di campi | `.rvG2` `.rvG3` `.rvG21` `.rvG1` | `gridTemplateColumns` a mano |
| un suggerimento (non ci si scrive dentro) | `.rvNota` + `-info -scelta -att -fatta` | un riquadro tratteggiato a mano |
| il semaforo di una scheda | `.rvBadge` + `-empty -warn -ok` | tre colori a mano |
| una tessera di prodotto | `.rvTessera` (+ `-on`) | idem |
| lo spazio dove si trascina un file | `.rvCarica` (+ `-pieno -sopra`) | idem |

**Se una classe non c'è, si aggiunge alla cassetta** — non si fa un'eccezione
inline. Un'eccezione inline è il seme della prossima sezione «rimasta indietro».

---

## 2. Il colore lo porta il contesto, non il singolo elemento

Il colore vive in **una variabile: `--rv-acc`**. La imposta il contenitore —
il form la mette dal brand scelto, una card di categoria dalla sua tinta — e
tutto quello che sta dentro la eredita.

- **Mai** scrivere il colore del brand dentro un bottone.
- Per tingere un blocco: `style={{"--rv-acc": ilColore}}` sul contenitore.

### Due trappole misurate, non teoriche

**a) `colore + "22"` non è un colore.** Attaccare la trasparenza in coda vale
solo su un esadecimale scritto per esteso. Qui i colori sono
`var(--tf-xxxxxx)`: la proprietà diventa invalida e **il browser la butta via
in silenzio**. Ne sono stati trovati cinque, tutti vivi: la tessera di un
prodotto scelto restava senza fondo, la pastiglia di categoria nel carrello
senza bordo.
→ Si usa `color-mix(in srgb, ${colore} 22%, transparent)`.
→ Si trova con `grep '+"[0-9a-f]\{2\}"'`.

**b) Non si calcola un colore in JavaScript.** Il tema si cambia **a caldo**,
e leggere l'esadecimale dal *nome* della variabile dà sempre il valore del tema
scuro: nel chiaro quattro colori di categoria su otto sono rimappati. Misurato:
la pastiglia di Customer Base finiva a **2,13 di contrasto**.
→ Il contrasto si risolve in CSS (`color-mix` sul fondo), non a runtime.

---

## 3. Il tema chiaro non è un ripensamento

`globals.css` ha regole `html.light` **con `!important`** più specifiche di
qualunque classe (`html.light .rvIn`, `html.light input:not(...)`). Una classe
di stato senza la sua variante chiara **non esiste** nel tema chiaro.

Chi aggiunge uno stato colorato aggiunge anche la riga `html.light`. Sempre.

**Ogni testo colorato va misurato in entrambi i temi**, non stimato. La soglia
è **4,5:1**. Ambra (`--tf-fbbf24`), verde (`--tf-34d399`) e ciano
(`--tf-22d3ee`) **non sono rimappati** nel chiaro: usati così, finiscono
sotto 2.

---

## 4. Le specificità che mordono

- **`.rvIn:focus` vale (0,2,0).** Uno stato scritto come classe singola perde:
  il bordo rosso dell'errore spariva appena entravi nel campo per correggerlo.
  → Gli stati si scrivono raddoppiati — `.rvIn.rvIn-err` — e **dopo** il
  `:focus`.
- **L'ordine conta a parità di specificità.** `.rvPill-on` deve stare dopo
  `.rvPill:hover`, se no la pastiglia accesa non reagisce al mouse.

---

## 5. Le larghezze: il form non è largo quanto lo schermo

Gli tolgono spazio il menù di sinistra (256px) e la sidebar del carrello
(fino a 480px). **A 1100px di finestra col menù fissato al form restano
434px.** C'è anche un'inversione: allargando la finestra da 1024 a 1101px i
campi si **stringono del 31%**, perché entra la sidebar.

→ **Niente media query sul viewport** per le griglie di campi. Si usa
`auto-fit` con `minmax(min(100%, N), 1fr)`, che misura lo spazio vero.

---

## 6. Un modale sta in un portal. Sempre.

Le card hanno `backdrop-blur`, e **un elemento con un filtro di sfondo diventa
il riferimento dei figli in posizione fissa**: un modale reso lì dentro diventa
grande quanto il riquadro. Misurato: **420×130 invece di 1200×713**.

→ `createPortal(…, document.body)`. Nessuna eccezione.

---

## 7. Quello che il software dice deve essere vero

Non è grafica, è la regola che conta di più.

- **Un bottone verde promette.** Se il salvataggio può rifiutare, il bottone
  non è verde. Tutte le condizioni che bloccano stanno in **una funzione sola**
  (`cosaManca()` in `registra-vendita/page.tsx`): chi aggiunge una guardia al
  salvataggio la aggiunge **anche lì**, se no il bottone torna a mentire.
- **Si dice prima, non dopo.** Cosa manca si vede sopra i bottoni, con una riga
  per problema, e ogni riga porta dove si rimedia. Un elenco dentro un tooltip
  non esiste: sui monitor da negozio non c'è il passaggio del mouse.
- **Quando un numero non si sa, si dice perché.** «manca il costo d'acquisto»,
  non un trattino e mai un valore inventato: su questi numeri si decidono i
  premi.
- **Un'azione che cancella chiede conferma.** Ce n'era una che eliminava una
  vendita intera senza domande.
- **Una cosa che non si può fare non si finge cliccabile**: niente manina,
  niente reazione al passaggio.

---

## 8. La cassa (dal 29/08)

- **Non c'è in magazzino = non entra nel carrello.** Niente eccezioni: da qui
  esce uno scontrino fiscale. Il rifiuto è un **pop-up** che dice quale
  articolo e perché.
- **Il prezzo si corregge solo se l'articolo lo permette**
  (`prezzo_modificabile`). Chi decide è l'amministrazione.
- **Un pezzo di un altro negozio non si vende da qui**: prima il trasferimento.
  I negozi gemelli (Magliana, Acilia, Collatina) condividono il magazzino —
  `stessoMagazzino()`.
- **La giacenza non si scrive mai a mano**: si scrive un movimento e il saldo
  si muove da sé. Così non può esistere una giacenza senza una storia che la
  spieghi.
- **Lo scarico non fa fallire un salvataggio già andato a buon fine.** Un
  magazzino disallineato si sistema; una vendita persa no.

---

## 9. Prima di consegnare

1. `npm run build` — lancia da sé `npm run sicurezza`.
2. **Guardare il risultato**, nei due temi. Il modo: si estrae il blocco di
   stile, si incolla **tutto** `globals.css` (non solo le variabili: le regole
   `html.light` stanno lì) e si scatta con Chrome headless.
3. **Misurare i contrasti**, componendo davvero le trasparenze — un calcolo che
   le salta dà numeri sbagliati, è già capitato.
4. Marker `tf-build-check` in `src/app/layout.tsx`, push, verifica sul dominio.
5. **Un agente critico indipendente** sul lavoro fatto (regola di Luca, 21/08).

### Tre cose che il build **non** vede

- **`className` scritto due volte** nello stesso tag: vince l'ultimo, il primo
  sparisce senza un errore. Il file ha `@ts-nocheck` in testa.
  → `grep 'className=[^>]*className='`
- **Un commento JSX al posto di un valore**: `const x = {/* … */}` è un oggetto
  vuoto, e la pagina va in errore a schermo.
- **Metà del file non arriva a schermo.** I prodotti vengono **solo** dal
  catalogo del database; `getW3/getVF/getFW/getTIM/getIL/getEN` non sono mai
  chiamate, e con loro sono irraggiungibili `VFMobileGA`, `VFCB`, `TIMMobile`,
  `FWMobile`, `SimpleMobile`, `CompassDatiTNP`, `TnpSlot`, `YN`, `MiniC`, `RB`.
  → **Prima di rivestire qualcosa, controllare che sia raggiungibile.**
