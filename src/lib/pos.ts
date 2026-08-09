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
