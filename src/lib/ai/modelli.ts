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
    /** prezzo per 1M token, in dollari */
    prezzo: { in: number; out: number };
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
        prezzo: { in: 0.14, out: 0.28 },
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
        prezzo: { in: 0.435, out: 0.87 },
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
 *  sbaglia, la spesa dell'AI viene contabilizzata storta. */
export function costoChiamata(idModello: string, tokenIn: number, tokenOut: number): number {
    const p = modelloAi(idModello).prezzo;
    return (tokenIn / 1e6) * p.in + (tokenOut / 1e6) * p.out;
}
