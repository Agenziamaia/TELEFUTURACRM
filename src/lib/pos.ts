// Helper POS — scontrino fiscale (RT Epson) + cassa contanti (pagAmico) dal
// carrello di Registra Vendita.

/** Arrotondamento contanti DL 50/2017: al 5 centesimi più vicino.
 *  finali 1,2→giù · 3,4→su · 6,7→giù · 8,9→su. Solo per il pagamento in
 *  CONTANTI (il RT stampa la riga "arrotondamento"); carta/altro = importo esatto. */
export function arrotonda5(euro: number): number {
    return Math.round((Number(euro) || 0) * 20) / 20;
}

/** Tipi di pagamento del RT Epson (codici printRecTotal). Da rifinire coi codici
 *  "riscosso" definitivi (memo fiscale): 0 = contanti, 2 = carta. */
export const PAGAMENTO = {
    CONTANTI: { paymentType: 0, description: "CONTANTE" },
    CARTA: { paymentType: 2, description: "CARTA" },
    FINANZIAMENTO: { paymentType: 2, description: "FINANZIAMENTO" }, // non riscosso
} as const;

export type MetodoPagamento = keyof typeof PAGAMENTO;

/** Forme di pagamento del POS (spec Francesco #2) — max 3 per scontrino.
 *  `paymentType` = codice RT Epson della riga printRecTotal:
 *    0 = contanti · 2 = carta/elettronico · 4 = non riscosso/credito.
 *  ⚠️ CODICI DA CONFERMARE su scontrino reale (decidono la NATURA del pagamento
 *  stampata + i totali di chiusura Z). `riscosso=false` → importo NON incassato
 *  fisicamente (finanziamento/credito): niente cassa, va a credito sul documento.
 *  `cash=true` → guida la cassa automatica pagAmico. `autoRate` = come si collega
 *  in automatico ai telefoni a rate dei brand (spec: "Finanziato"→finanziamento,
 *  senza "Finanziato"→non riscosso/credito) — collegamento gestibile da admin. */
export interface FormaPagamento {
    code: string;
    label: string;
    short: string;      // etichetta breve per lo scontrino (larghezza RT limitata)
    paymentType: number;
    riscosso: boolean;
    cash?: boolean;
    autoRate?: "finanziato" | "rate";
    /** l'icona del pulsante */
    icona?: string;
    /** si può scegliere a mano? le altre le decide il carrello */
    manuale?: boolean;
}
// "Altro" è stato SOSTITUITO dal Coupon (spec Francesco 12/08): il coupon non è una
// forma di pagamento ma uno SCONTO che abbassa l'imponibile (vedi ScontrinoCassa +
// /api/vendita/coupon + lib/coupons). Le forme qui sono i tender veri.
/* SI SCELGONO A MANO SOLO TRE FORME (Luca 31/08): contanti, carta, bonifico.
   «Credito» e «finanziamento» restano — servono, e lo scontrino li sa emettere
   — ma non si scelgono più da un elenco: li deciderà il carrello, quando
   contiene una voce che li prevede. Finché quell'automatismo non c'è, toglierli
   dalla scelta a mano evita che qualcuno li prenda per sbaglio: uno scontrino
   «non riscosso» è merce uscita senza soldi. */
export const FORME_PAGAMENTO: FormaPagamento[] = [
    { code: "CONTANTI", label: "Contanti", short: "CONTANTE", paymentType: 0, riscosso: true, cash: true, icona: "💶", manuale: true },
    { code: "CARTA", label: "Carta", short: "CARTA", paymentType: 2, riscosso: true, icona: "💳", manuale: true },
    { code: "BONIFICO", label: "Bonifico", short: "BONIFICO", paymentType: 2, riscosso: true, icona: "🏦", manuale: true },
    { code: "NON_RISCOSSO", label: "Non Riscosso / Credito", short: "NON RISCOSSO", paymentType: 4, riscosso: false, autoRate: "rate", icona: "📄" },
    { code: "FINANZIAMENTO", label: "Finanziamento", short: "FINANZIAMENTO", paymentType: 4, riscosso: false, autoRate: "finanziato", icona: "🏛️" },
];
/** Le tre che l'operatore può premere. Le altre le decide il carrello. */
export const FORME_A_MANO = FORME_PAGAMENTO.filter((f) => f.manuale);
export const formaPagamento = (code: string): FormaPagamento | undefined =>
    FORME_PAGAMENTO.find((f) => f.code === code);
export const isFormaCash = (code: string): boolean => !!formaPagamento(code)?.cash;

/** Una riga di pagamento scelta al POS. */
export interface RigaPagamento { forma: string; importo: number; }

/** Una riga del carrello candidata allo scontrino. reparto/va_in_scontrino
 *  arrivano da marg_items (autoritativo lato server); qui il fallback per le
 *  voci manuali senza productId. */
export interface RigaScontrino {
    productId?: string | null;
    description: string;
    unitPrice: number;
    qty?: number;
    reparto?: number | null;
}

/** Totale (IVA inclusa) di una lista di righe. */
export function totaleRighe(righe: RigaScontrino[]): number {
    return +(righe.reduce((t, r) => t + (Number(r.unitPrice) || 0) * (Number(r.qty) > 0 ? Number(r.qty) : 1), 0)).toFixed(2);
}
