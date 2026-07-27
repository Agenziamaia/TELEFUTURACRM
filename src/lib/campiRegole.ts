/**
 * STRATO DATI amministrabile (tabella catalog_campi_regole, mig. 094).
 * Le regole dei campi vivono a DB e si gestiscono da Amministrazione →
 * Catalogo → Campi vendita; questo modulo le tiene in uno store di modulo
 * e risolve i campi per la selezione corrente. Se il DB non è ancora
 * arrivato (o la tabella fosse vuota) si usa il generato dall'artifatto
 * (catalogoVendita.CAMPI_REGOLE): il flusso di vendita non resta mai
 * senza campi. Regola d'oro: i campi usati in passato NON si eliminano,
 * si NASCONDONO (attivo=false) — i dati storici nei dettagli restano.
 */

import { CAMPI_REGOLE, type CampoVendita } from "./catalogoVendita";

export interface CampoDb extends CampoVendita { attivo?: boolean }
export interface RegolaDb {
    id?: string;
    etichetta?: string;
    condizioni: {
        brand?: string[]; tipo?: string[]; categoria?: string[]; prodotto?: string[];
        offertaContiene?: string[]; offertaNon?: string[]; opzioni?: string[];
    };
    campi: CampoDb[];
    ordine?: number;
    attivo?: boolean;
}

let CORRENTI: RegolaDb[] | null = null;

/** Iniettate al caricamento (Registra Vendita / pannello admin). */
export function impostaRegoleCampi(rows: RegolaDb[] | null | undefined) {
    CORRENTI = rows && rows.length ? rows : null;
}

function regoleAttive(): RegolaDb[] {
    if (CORRENTI) return CORRENTI.filter((r) => r.attivo !== false);
    return CAMPI_REGOLE.map((r) => ({
        condizioni: {
            brand: r.brand, tipo: r.tipo, categoria: r.categoria, prodotto: r.prodotto,
            offertaContiene: r.offertaContiene, offertaNon: r.offertaNon, opzioni: r.opzioni,
        },
        campi: r.campi,
    }));
}

/** Campi richiesti per la selezione corrente (stessa semantica dell'artifatto). */
export function risolviCampi(
    brandId: string, tipoCliente: string, categoria: string,
    prodottoNome: string, offertaNome: string, opzNomi: string[],
): CampoVendita[] {
    const out: CampoVendita[] = [];
    const visti: Record<string, boolean> = {};
    regoleAttive().forEach((r) => {
        const c = r.condizioni || {};
        if (c.brand && c.brand.indexOf(brandId) === -1) return;
        if (c.tipo && c.tipo.indexOf(tipoCliente) === -1) return;
        if (c.categoria && c.categoria.indexOf(categoria) === -1) return;
        if (c.prodotto && c.prodotto.indexOf(prodottoNome) === -1) return;
        if (c.offertaNon && c.offertaNon.indexOf(offertaNome) !== -1) return;
        if (c.offertaContiene) {
            const low = (offertaNome || "").toLowerCase();
            if (!c.offertaContiene.some((s) => low.indexOf(s.toLowerCase()) !== -1)) return;
        }
        if (c.opzioni) {
            if (!c.opzioni.some((o) => opzNomi.indexOf(o) !== -1)) return;
        }
        (r.campi || []).forEach((cmp) => {
            if (cmp.attivo === false) return;    // campo NASCOSTO: non si chiede più
            if (visti[cmp.nome]) return;
            visti[cmp.nome] = true;
            out.push(cmp);
        });
    });
    return out;
}
