/**
 * Tassonomia unica dei contratti — sorgente di verita' per TUTTO il CRM.
 *
 * Il problema che risolve: finora la categoria di un contratto era il titolo del
 * menu del singolo brand, scritto tale e quale a database. Lo stesso servizio
 * prendeva nomi diversi a seconda del brand:
 *
 *      energia   ->  "LUCE E GAS" (WindTre) | "ENERGIA" (Fastweb) | "S4 ENERGIA" (Energy)
 *      fisso     ->  "FISSO" (WindTre, Vodafone) | "SKY FIBRA" (Sky)
 *      mobile    ->  "MOBILE" (quasi tutti) | "SKY MOBILE" (Sky)
 *
 * Chiedere "tutta la fibra casa" era quindi impossibile senza scrivere codice
 * per ogni brand, e ogni brand nuovo restava fuori in silenzio.
 *
 * Il modello ha QUATTRO assi indipendenti:
 *
 *   1. BRAND      chi vende            WindTre, Vodafone, Fastweb, Sky, ...
 *   2. CATEGORIA  cosa si vende        mobile, fisso, energia, tv, ...   <- uguale per tutti i brand
 *   3. PRODOTTO   come lo chiama il brand   "MOBILE GA", "SKY FIBRA", "CASA PRO"
 *   4. CONTROLLI  cosa va verificato   mnp, finanziamento, rata          <- piu' d'uno per pratica
 *
 * Cosi' "fibra di WindTre", "tutta la fibra" e "tutto WindTre" sono la stessa
 * interrogazione con un filtro diverso, senza codice dedicato.
 */

// ─── Asse 2: categorie di servizio, condivise da tutti i brand ───────────────

// Le categorie coincidono con le metriche di target (tabella target_metrics),
// che sono le categorie di reporting decise dall'ufficio. Cosi' un contratto e
// il suo obiettivo contano la stessa cosa per costruzione, senza liste di nomi
// da tenere allineate a mano.
export type CategoriaId =
    | "mobile"
    | "fisso"
    | "energia"
    | "tv"
    | "digitale"
    | "multi_servizi"
    | "pos"
    | "extra";

export interface CategoriaDef {
    id: CategoriaId;
    label: string;
    desc: string;
    color: string;
    icon: string;
}

export const CATEGORIE: CategoriaDef[] = [
    { id: "mobile", label: "Mobile", desc: "SIM e offerte mobili", color: "#3b82f6", icon: "📱" },
    { id: "fisso", label: "Fisso / Fibra", desc: "Linee fisse, fibra e FWA", color: "#0ea5e9", icon: "🏠" },
    { id: "energia", label: "Energia", desc: "Luce e gas", color: "#10b981", icon: "⚡" },
    { id: "tv", label: "TV", desc: "Pay TV e intrattenimento", color: "#ef4444", icon: "📺" },
    { id: "digitale", label: "Soluzioni Digitali", desc: "Servizi digitali e cloud", color: "#22d3ee", icon: "💻" },
    { id: "multi_servizi", label: "Multi-Servizi", desc: "Assicurazioni e pacchetti multi-servizio", color: "#ec4899", icon: "🛡️" },
    { id: "pos", label: "POS", desc: "Terminali di pagamento", color: "#f59e0b", icon: "🏧" },
    { id: "extra", label: "Extra", desc: "Prodotti e servizi a marginalita'", color: "#94a3b8", icon: "💰" },
];

export function categoriaDef(id: string | null | undefined): CategoriaDef {
    return CATEGORIE.find((c) => c.id === id) ?? {
        id: "extra" as CategoriaId,
        label: String(id || "—"),
        desc: "Categoria non riconosciuta",
        color: "#94a3b8",
        icon: "•",
    };
}

// ─── Asse 4: controlli, ortogonali alla categoria ────────────────────────────
// Una pratica mobile puo' essere allo stesso tempo una portabilita' e un
// finanziamento: sono due verifiche distinte sulla stessa vendita.

export type ControlloId = "mnp" | "finanziamento" | "rata";

export const CONTROLLI: { id: ControlloId; label: string; color: string }[] = [
    { id: "mnp", label: "MNP", color: "#6366f1" },
    { id: "finanziamento", label: "Finanziamento", color: "#f59e0b" },
    { id: "rata", label: "Rata", color: "#64748b" },
];

// ─── Mappatura: da cosa scrive il brand alla categoria condivisa ─────────────

const SI = ["sì", "si", "true", "1"];

function testo(v: unknown): string {
    return String(v ?? "").trim().toLowerCase();
}

/**
 * Deduce la categoria condivisa da brand + categoria del brand + prodotto.
 * L'ordine dei controlli conta: "SKY FIBRA" deve dare `fisso`, non `tv`.
 */
export function categoriaDi(
    brand: string | null | undefined,
    categoriaBrand: string | null | undefined,
    prodotto?: string | null,
): CategoriaId {
    const b = testo(brand);
    const c = testo(categoriaBrand);
    const p = testo(prodotto);
    const tutto = `${c} ${p}`;

    // Il brand "Extra" raccoglie le vendite a marginalita': accessori, SIM
    // sciolte, riparazioni. Non e' una pratica da attivare, non entra nei target.
    if (b === "extra" || c.startsWith("prodotto")) return "extra";

    // POS: terminale di pagamento (metrica di target dedicata). Prima del mobile,
    // altrimenti "terminale" del telefono lo intercetterebbe.
    if (/\bpos\b/.test(tutto)) return "pos";

    // Energia: piu' nomi per lo stesso servizio (LUCE E GAS / ENERGIA / S4 ENERGIA).
    if (/(luce|gas|energia|energy)/.test(tutto)) return "energia";

    // Fisso e fibra, compresa quella di Sky, che il brand chiama "SKY FIBRA".
    if (/(fisso|fibra|fwa)/.test(tutto)) return "fisso";

    // Multi-servizi: assicurazioni, protezioni, pacchetti (WindTre "MULTI-SERVIZI").
    if (/(multi.?serviz|assicura|polizza|kasko|protec)/.test(tutto)) return "multi_servizi";

    if (/(digital|backup|cloud|security)/.test(tutto)) return "digitale";

    // Mobile, compreso "SKY MOBILE".
    if (/(mobile|sim)/.test(tutto)) return "mobile";

    // Sky senza altre indicazioni: il prodotto storico e' la TV.
    if (/(tv|sky)/.test(tutto) || b === "sky") return "tv";

    return "extra";
}

/**
 * Controlli richiesti da una pratica, letti dai dettagli di registrazione.
 *
 * Regole confermate dall'ufficio:
 *  - MNP           quando il campo MNP e' "Si"
 *  - Finanziamento SOLO se "Tipo TNP" o "Tipo CB" iniziano per "Finanziamento"
 *  - Rata          "Rata 0", "Rata 5G": rateizzazione, NON un finanziamento
 */
export function controlliDi(dettagli: Record<string, unknown> | null | undefined): ControlloId[] {
    const d = dettagli || {};
    const out: ControlloId[] = [];

    if (SI.includes(testo(d.MNP ?? d.mnp))) out.push("mnp");

    const tipi = ["Tipo TNP", "Tipo CB", "tnpTipo", "cbTnpTipo"].map((k) => testo(d[k]));
    if (tipi.some((t) => t.startsWith("finanziamento"))) out.push("finanziamento");
    else if (tipi.some((t) => t.startsWith("rata"))) out.push("rata");

    return out;
}

/**
 * Righe da mostrare nel Tracking PDA per una pratica.
 *
 * Combinazioni dettate da Francesco:
 *   solo Mobile                  -> Mobile
 *   Mobile + MNP                 -> MNP
 *   Mobile + Rata                -> Mobile         (la rata non e' un controllo a se')
 *   Mobile + Rata + MNP          -> MNP
 *   Mobile + Finanziamento       -> Finanziamento
 *   Mobile + Finanziamento + MNP -> due righe: MNP e Finanziamento
 *
 * Le categorie non mobile restano una riga sola.
 */
export function righeTracking(categoria: CategoriaId, controlli: ControlloId[]): string[] {
    if (categoria !== "mobile") return [categoria];
    const out: string[] = [];
    if (controlli.includes("finanziamento")) out.push("finanziamento");
    if (controlli.includes("mnp")) out.push("mnp");
    return out.length ? out : ["mobile"];
}

/** Etichetta e colore di una riga del Tracking, categoria o controllo che sia. */
export function badgeDi(id: string): { label: string; color: string } {
    const ctrl = CONTROLLI.find((c) => c.id === id);
    if (ctrl) return { label: ctrl.label, color: ctrl.color };
    const cat = categoriaDef(id);
    return { label: cat.label, color: cat.color };
}
