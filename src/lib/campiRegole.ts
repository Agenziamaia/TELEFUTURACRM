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
        /** match ESATTO sul nome offerta (03/08): e' la chiave delle regole
         *  per-offerta del pannello Catalogo — vincono sulle generali perche'
         *  hanno ordine piu' basso e i loro campi "prenotano" il nome */
        offerta?: string[];
        offertaContiene?: string[]; offertaNon?: string[]; opzioni?: string[];
        /** la regola scatta solo se NESSUNA di queste opzioni è attiva (05/08) */
        opzioniNon?: string[];
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
            offertaContiene: r.offertaContiene, offertaNon: r.offertaNon, opzioni: r.opzioni, opzioniNon: r.opzioniNon,
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
        if (c.offerta && c.offerta.indexOf(offertaNome) === -1) return;   // match esatto (03/08)
        if (c.offertaNon && c.offertaNon.indexOf(offertaNome) !== -1) return;
        if (c.offertaContiene) {
            const low = (offertaNome || "").toLowerCase();
            if (!c.offertaContiene.some((s) => low.indexOf(s.toLowerCase()) !== -1)) return;
        }
        if (c.opzioni) {
            if (!c.opzioni.some((o) => opzNomi.indexOf(o) !== -1)) return;
        }
        // opzioniNon (Luca 05/08, caso "Numero Fisso senza GNP"): la regola
        // scatta SOLO se nessuna delle opzioni elencate è selezionata
        if (c.opzioniNon && c.opzioniNon.some((o) => opzNomi.indexOf(o) !== -1)) return;
        (r.campi || []).forEach((cmp) => {
            if (visti[cmp.nome]) return;
            // il nome si PRENOTA anche da nascosto (03/08): cosi' la regola
            // per-offerta puo' TOGLIERE un campo ereditato dalle generali
            // mettendolo attivo=false — prima il nascosto non bloccava nulla
            visti[cmp.nome] = true;
            if (cmp.attivo === false) return;    // campo NASCOSTO: non si chiede più
            out.push(cmp);
        });
    });
    return out;
}

/** CAT-02 (04/08): il WIDGET REALE che Registra Vendita usa per un campo.
 *  RV decide prima per NOME (override cablate: Codice Inserimento, GNP,
 *  Operatore GNP, Modello Terminale) e solo dopo per tipo, quindi il tipo
 *  grezzo salvato a DB puo' non corrispondere alla casella che il venditore
 *  vede. Il pannello Catalogo usa questa funzione per il badge del tipo
 *  (etichetta + title esplicativo) e non mentire piu' sui campi. */
export function tipoEffettivo(
    nome: string, tipo: string, valori?: string[],
): { label: string; title: string } {
    const n = (nome || "").trim();
    if (n === "Codice Inserimento") return {
        label: "codice negozio",
        title: "Widget deciso da Registra Vendita per questo nome: tendina dei codici negozio del brand, precompilata dal codice di sessione. Il tipo dichiarato qui non viene usato.",
    };
    if (/^gnp$/i.test(n)) return {
        label: "scelta Sì/No",
        title: "Widget deciso da Registra Vendita per questo nome: tendina Sì/No; con valore diverso da Sì il campo \"Operatore GNP\" viene azzerato e nascosto.",
    };
    if (/^operatore gnp$/i.test(n)) return {
        label: "tendina operatori",
        title: "Widget deciso da Registra Vendita per questo nome: tendina degli operatori GNP; se nella stessa selezione c'è anche il campo GNP, compare solo con GNP = Sì.",
    };
    if (n === "Modello Terminale") return {
        label: "tendina terminali",
        title: "Widget deciso da Registra Vendita per questo nome: tendina con ricerca sul listino terminali del brand (mostra prezzo/margine).",
    };
    if (tipo === "scelta") {
        if (valori && valori.length) return {
            label: "tendina custom",
            title: "Tendina con i valori dichiarati sul campo: " + valori.join(", "),
        };
        if (n === "Operatore di Provenienza") return {
            label: "tendina operatori",
            title: "Widget deciso da Registra Vendita per questo nome: tendina degli operatori di provenienza (fornitori energia o brand mobili a seconda della categoria).",
        };
        return {
            label: "scelta — senza valori",
            title: "ATTENZIONE: campo \"scelta\" senza valori dichiarati e senza override per nome: in Registra Vendita la tendina risulterebbe VUOTA e, se obbligatoria, bloccherebbe la vendita. Aggiungi i valori (uno per riga) dall'editor.",
        };
    }
    return { label: tipo, title: "" };
}
