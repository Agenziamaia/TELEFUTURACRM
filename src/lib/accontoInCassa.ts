/* ═══ L'ACCONTO SI INCASSA IN REGISTRA VENDITA ════════════════════════════
 *
 * Deciso col committente e poi tradito da una scorciatoia mia: avevo messo
 * dentro la pratica la scelta della forma di pagamento e il numero dello
 * scontrino, cioè un secondo posto dove si decide come si incassa. Luca:
 * «ci eravamo detti che dopo la firma il processo mi porta in Registra
 * Vendita, così non dobbiamo creare diversi processi per fare scontrini e
 * decidere pagamenti — mettiamo tutto dentro Registra Vendita, nel carrello».
 *
 * Quindi la pratica NON incassa: sceglie quanto, e passa la mano. L'acconto
 * entra nel carrello come una riga qualsiasi, insieme a quello che il cliente
 * compra oggi, e si fa un pagamento solo. Quando la vendita è registrata,
 * Registra Vendita torna a scrivere sulla pratica che l'acconto è incassato.
 *
 * Il passaggio di consegne vive nella memoria del browser: è un gesto solo,
 * dallo stesso operatore, sullo stesso computer — e se il browser la perde,
 * la pratica resta «acconto da incassare» e si vede, invece di sparire. */

const CHIAVE = "crm_pratica_in_cassa";

export type AccontoInCassa = {
    praticaId: string;
    protocollo: string;
    sezione: string;
    voce: string;              // Acconto-Accessorio | Acconto-Cliente | Acconto-Assistenza
    importo: number;
    clienteId: string | null;
    clienteEtichetta: string;
    negozio: string;
    operatore: string;
    quando: number;
};

export function mandaInCassa(d: Omit<AccontoInCassa, "quando">): boolean {
    try { localStorage.setItem(CHIAVE, JSON.stringify({ ...d, quando: Date.now() })); return true; }
    catch { return false; }
}

/** Quello che aspetta la cassa. Dopo dodici ore non è più «adesso»: si
 *  scorda, così un residuo di ieri non si attacca alla vendita di oggi. */
export function accontoDaIncassare(): AccontoInCassa | null {
    try {
        const raw = localStorage.getItem(CHIAVE);
        if (!raw) return null;
        const d = JSON.parse(raw) as AccontoInCassa;
        if (!d || !d.praticaId || !(d.importo > 0)) return null;
        if (Date.now() - (Number(d.quando) || 0) > 12 * 3600 * 1000) { localStorage.removeItem(CHIAVE); return null; }
        return d;
    } catch { return null; }
}

export function scordaAcconto() {
    try { localStorage.removeItem(CHIAVE); } catch { /* niente da scordare */ }
}
