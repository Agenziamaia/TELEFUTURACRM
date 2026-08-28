/**
 * COSA CONTA COME PRODUZIONE — la regola, una volta sola.
 *
 * Stava dentro `src/app/(dashboard)/dashboard/_widgets.tsx`, che è `"use client"`:
 * da un route handler quelle esportazioni non sono chiamabili. Il server aveva
 * quindi due sole strade — copiarsi la regola, o non applicarla. Il report
 * serale, nato senza, contava anche le pratiche ANNULLATE: alle 20:00 mandava
 * sul canale un numero che la Home dello stesso negozio, nello stesso momento,
 * mostrava diverso.
 *
 * Qui vive una volta sola. `_widgets.tsx` la ri-esporta, così ogni import
 * esistente continua a funzionare identico.
 */

export type RigaProduzione = {
    id?: string | null;
    stato?: string | null;
    nascosta_gestione?: boolean | null;
    qty?: number | null;
    data?: string | null;
    data_registrazione?: string | null;
};

/** `CTR-` = pratica di un brand (una vendita vera). */
export const isCtr = (c: RigaProduzione) => String(c?.id || "").startsWith("CTR-");

/** `EXT-` = riga di marginalità (accessorio, SIM, kasko): NON è una vendita
 *  brand, e sommarla ai contratti gonfia il conto della giornata. */
export const isExt = (c: RigaProduzione) => String(c?.id || "").startsWith("EXT-");

/** Produzione del negozio: righe registrate NON annullate e non nascoste dalla
 *  gestione (le nascoste sono pratiche invalidate dalla direzione). */
export const validaProduzione = (c: RigaProduzione) =>
    !/annull/i.test(String(c?.stato || "")) && c?.nascosta_gestione !== true;

/** Pezzi di una riga di marginalità: le EXT portano la quantità in `qty`. */
export const qtyDi = (c: RigaProduzione) => Math.max(1, Number(c?.qty) || 1);

export const giornoDi = (c: RigaProduzione) =>
    String(c?.data || c?.data_registrazione || "").slice(0, 10);
