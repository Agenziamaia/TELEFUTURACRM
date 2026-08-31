// QUALE CERVELLO USA L'ASSISTENTE (Luca 28/08 sera).
//
// Fino a oggi il modello era uno per tutti, deciso nel codice. Ora si sceglie
// per persona dal pannello Permessi, e a chi si vuole si dà la libertà di
// cambiarlo da sé nella sua pagina.
//
// ⚠️ maxTokens NON è un dettaglio di prestazioni: è la differenza fra una
// risposta e il silenzio. I modelli che RAGIONANO scrivono prima il
// ragionamento, e quello consuma il tetto: con un tetto basso il pensiero se lo
// mangia tutto e all'utente arriva una risposta VUOTA — lezione già pagata sul
// triage WhatsApp. Per questo ogni modello si porta dietro il suo tetto minimo.

export type ModelloAi = {
    id: string;
    nome: string;              // come lo chiamiamo noi
    descrizione: string;
    /** prezzo per 1M token, in dollari.
     *  `in` = input NUOVO (cache miss) · `inCache` = input già visto, che
     *  costa una frazione · `out` = risposta, ragionamento compreso. */
    prezzo: { in: number; inCache: number; out: number };
    /** il tetto minimo di risposta: sotto questo, i modelli che ragionano tacciono */
    tettoMin: number;
    /** ragiona prima di rispondere (e quindi consuma tetto per pensare) */
    ragiona?: boolean;
};

export const MODELLI_AI: ModelloAi[] = [
    {
        id: "deepseek-v4-flash",
        nome: "Veloce",
        descrizione: "Risponde subito e costa poco. Va bene per quasi tutto: domande, testi, ricerche nel CRM.",
        /* ⚠️ LISTINO CORRETTO IL 31/08, e lo scarto era grosso. Qui c'era
           0.14/0.28 — vecchio — e il pannello diceva 0,32 € mentre DeepSeek
           ne fatturava 0,65. Coi prezzi veri il conto torna: sui token di
           oggi (1.207.747 in + 621.931 out) fanno 0,676 $ contro i 0,65 del
           loro cruscotto. Un registro dei costi che sbaglia del doppio è
           peggio di non averlo: fa prendere decisioni sbagliate con
           sicurezza. */
        prezzo: { in: 0.22, inCache: 0.007, out: 0.66 },
        /* 3000 e non 1500: questo repo aveva GIÀ misurato che anche il
           «Veloce» pensa prima di rispondere — «con 700 se li mangiava tutti,
           ~730 di ragionamento + ~160 di risposta» (omnichat) e «~300-1200 per
           chat» (triage WhatsApp). Il tetto ufficiale non può essere sotto un
           pavimento già dimostrato insufficiente altrove. */
        tettoMin: 3000,
        ragiona: true,
    },
    {
        id: "deepseek-v4-pro",
        nome: "Approfondito",
        descrizione: "Ragiona prima di rispondere: più lento e circa tre volte più caro, ma regge analisi e conti complicati.",
        prezzo: { in: 0.66, inCache: 0.022, out: 1.98 },
        tettoMin: 4000,
        ragiona: true,
    },
];

export const MODELLO_DI_SISTEMA = "deepseek-v4-flash";

export const modelloAi = (id: string | null | undefined): ModelloAi =>
    MODELLI_AI.find((m) => m.id === id) || MODELLI_AI.find((m) => m.id === MODELLO_DI_SISTEMA)!;

/** Il tetto da usare: mai sotto quello che il modello richiede per parlare. */
export function tettoPer(idModello: string | null | undefined, richiesto?: number): number {
    const m = modelloAi(idModello);
    return Math.max(m.tettoMin, richiesto || 0);
}

/** Costo in dollari di una chiamata, col listino DEL MODELLO USATO: se qui si
 *  sbaglia, la spesa dell'AI viene contabilizzata storta — ed è successo, con
 *  un listino vecchio che dimezzava il conto.
 *
 *  ⚠️ LA CACHE CONTA MOLTISSIMO: un token di domanda già visto costa 0,007
 *  invece di 0,22 — trenta volte meno. Sul triage, dove il preambolo è
 *  identico per sessanta chat di fila, ignorarla vuol dire SOVRASTIMARE.
 *  Chi non passa `tokenInCache` ottiene il conto prudente (tutto a prezzo
 *  pieno), che è il comportamento giusto quando il dato non c'è. */
export function costoChiamata(idModello: string, tokenIn: number, tokenOut: number, tokenInCache = 0): number {
    const p = modelloAi(idModello).prezzo;
    const cache = Math.max(0, Math.min(tokenInCache, tokenIn));
    const nuovi = Math.max(0, tokenIn - cache);
    return (nuovi / 1e6) * p.in + (cache / 1e6) * p.inCache + (tokenOut / 1e6) * p.out;
}

/* ⚠️ E C'È UNA FASCIA ORARIA. DeepSeek raddoppia i prezzi in alcune ore del
   giorno («peak»): quello sopra è il listino ridotto, ed è quello che combacia
   con la nostra fattura di oggi — quindi giriamo quasi sempre in fascia
   ridotta, il che ha senso per due motori che lavorano di notte e un
   assistente usato in orario italiano. Se un mese il conto risultasse più
   alto del previsto, la fascia è la prima cosa da guardare. */
