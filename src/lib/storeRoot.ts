/**
 * RADICE del punto vendita — i gemelli (Magliana Multi/W3, Acilia Multi/VS,
 * Collatina Multi/W3) si sommano sulla radice comune, come le colonne del
 * foglio 'Costi & Ricavi'. Stessa logica di amministrazione (StoreAggregate)
 * e del webhook Aircall: qui è la fonte condivisa per il conto economico.
 */

export function storeRoot(name: string): string {
    return String(name || "").trim().replace(/ (W3|Multi|VS)$/, "");
}

/** Le 12 colonne del conto economico, nell'ordine del foglio. */
export const CE_ROOTS_ORDINE = [
    "Magliana", "Donna", "Garbatella", "Libia", "Baleniere", "Promontori",
    "Acilia", "Castani", "Mazzini", "San Paolo", "Merulana", "Collatina",
] as const;
