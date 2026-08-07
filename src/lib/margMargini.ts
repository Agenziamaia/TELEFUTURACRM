/**
 * MARGINALITÀ — listino legacy e calcolo margini, FONTE UNICA (cantiere conto
 * economico 07/08). Il catalogo storico viveva dentro Registra Vendita
 * (MARG_PRODUCTS_LEGACY): ora sta qui e RV lo importa; il motore del conto
 * economico (src/lib/contoEconomico.ts) usa le stesse voci per RICALCOLARE i
 * margini per nome — a DB le voci auto (Sim/Sost/Bundle) sono salvate con
 * margin=0 e il pannello marg_items è ancora senza costi: il campo salvato
 * non è la verità.
 *
 * Regole margine (identiche a RV/MargPOS):
 *   fixed → fixedMargin · pct → prezzo × pctMargin/100 · cost → prezzo − companyCost
 */

export type MargVoceLegacy = {
    id: string; name: string; price: number | null;
    type: "fixed" | "pct" | "cost";
    fixedMargin?: number; pctMargin?: number; companyCost?: number;
    hasQty?: boolean; needsModel?: boolean; needsImei?: boolean;
    isTelCash?: boolean; countsPhone?: boolean; linked?: boolean;
    icon?: string; brand?: string;
};
export type MargCatLegacy = { cat: string; grouped?: boolean; items: MargVoceLegacy[] };

// ── Catalogo storico (fotografia: margini per voce) — spostato 1:1 da RV ──
export const MARG_PRODUCTS_LEGACY: MargCatLegacy[] = [
    {
        cat: "📦 Prodotti", items: [{ id: "accessori", name: "Accessori", price: null, pctMargin: 24.59, hasQty: true, icon: "🎧", type: "pct" }, { id: "tel_senior", name: "Telefoni Senior", price: null, pctMargin: 12.30, needsModel: true, icon: "📱", type: "pct" }, { id: "earbuds", name: "Ear Buds", price: null, pctMargin: 40.98, icon: "🎵", type: "pct" }, { id: "vendita_usato", name: "Vendita Usato", price: null, pctMargin: 13.00, needsModel: true, needsImei: true, icon: "♻️", type: "pct" },
            { id: "plx", name: "PLX", price: null, fixedMargin: 8, hasQty: true, icon: "📦", type: "fixed" },
            { id: "cncp", name: "CN/CP", price: null, fixedMargin: 2, hasQty: true, icon: "💳", type: "fixed" },
            { id: "new_cover", name: "New Cover", price: null, fixedMargin: 8, hasQty: true, icon: "🔲", type: "fixed" },
            { id: "mem_pen", name: "Mem / Pen", price: null, fixedMargin: 11, icon: "💾", type: "fixed" },
            { id: "orologio", name: "Orologio Cash", price: null, fixedMargin: 25, icon: "⌚", type: "fixed" },
            { id: "miband", name: "Mi Band 6", price: null, fixedMargin: 15, icon: "⌚", type: "fixed" },
            { id: "powerbank", name: "PowerBank", price: null, fixedMargin: 8, icon: "🔋", type: "fixed" },
        ],
    },
    {
        cat: "🔧 Servizi", items: [
            { id: "assistenza", name: "Assistenza Tecnico", price: null, pctMargin: 81.97, icon: "🔧", type: "pct" },
            { id: "backup", name: "Backup", price: null, pctMargin: 81.97, icon: "💿", type: "pct" },
            { id: "riparazione", name: "Riparazione", price: null, pctMargin: 24.59, needsModel: true, icon: "🔨", type: "pct" },
            { id: "chiusura", name: "Chiusura Sim/Fisso", price: null, pctMargin: 81.97, icon: "✂️", type: "pct" },
            { id: "etelefono", name: "E.Telefono", price: null, pctMargin: 81.97, icon: "📞", type: "pct" },
            { id: "extra_acc", name: "Extra Acc. Compass", price: null, pctMargin: 65.00, icon: "🧭", type: "pct" },
            { id: "salva_scontrino", name: "Salva Scontrino", price: null, fixedMargin: 3, icon: "🧾", type: "fixed" },
        ],
    },
    {
        cat: "🛡️ Kasko", items: [
            { id: "extra_kasko", name: "Extra Margine Kasko", price: null, pctMargin: 40.00, icon: "🛡️", type: "pct" },
            { id: "plkasko", name: "PLKasko", price: null, pctMargin: 60.00, icon: "🏷️", type: "pct" },
            { id: "kasko_sv", name: "Kasko SV", price: null, pctMargin: 60.00, icon: "🔖", type: "pct" },
        ],
    },
    {
        cat: "📶 SIM", grouped: true, items: [
            { id: "sim_w3", name: "Sim Wind3", price: null, fixedMargin: -5, linked: true, icon: "📶", type: "fixed", brand: "windtre" },
            { id: "sost_w3", name: "Sost Wind3", price: 0, fixedMargin: -15, linked: true, icon: "🔄", type: "fixed", brand: "windtre" },
            { id: "sim_vf", name: "Sim Vodafone", price: null, fixedMargin: -7, linked: true, icon: "📶", type: "fixed", brand: "vodafone" },
            { id: "sost_vod", name: "Sost Vodafone", price: 0, fixedMargin: -10, linked: true, icon: "🔄", type: "fixed", brand: "vodafone" },
            { id: "sim_fw", name: "Sim Fastweb", price: 0, fixedMargin: -23, linked: true, icon: "📶", type: "fixed", brand: "fastweb" },
            { id: "sost_fw", name: "Sost Fastweb", price: 0, fixedMargin: 0, linked: true, icon: "🔄", type: "fixed", brand: "fastweb" },
            { id: "sim_tim", name: "Sim TIM", price: 0, fixedMargin: 0, linked: true, icon: "📶", type: "fixed", brand: "tim" },
            { id: "sost_tim", name: "Sost TIM", price: 0, fixedMargin: 0, linked: true, icon: "🔄", type: "fixed", brand: "tim" },
            { id: "sim_iliad", name: "Sim Iliad", price: 0, fixedMargin: -10, linked: true, icon: "📶", type: "fixed", brand: "iliad" },
            { id: "sim_sky", name: "Sim Sky", price: 0, fixedMargin: 0, linked: true, icon: "📶", type: "fixed", brand: "sky" },
            { id: "sim_ho", name: "Sim Ho.", price: 0, fixedMargin: 0, linked: true, icon: "📶", type: "fixed", brand: "ho" },
            { id: "sim_very", name: "Sim Very", price: 0, fixedMargin: -7, linked: true, icon: "📶", type: "fixed", brand: "very" },
            { id: "sost_very", name: "Sost Very", price: 0, fixedMargin: -7, linked: true, icon: "🔄", type: "fixed", brand: "very" },
            { id: "sim_kena", name: "Sim Kena", price: null, fixedMargin: 0, linked: true, icon: "📶", type: "fixed", brand: "kena" },
            { id: "sim_l", name: "Sim L", price: 0, fixedMargin: -15, linked: true, icon: "📶", type: "fixed", brand: "telefutura" },
            { id: "subentro", name: "Subentro/Reale Util.", price: 0, fixedMargin: -10, linked: true, icon: "🔄", type: "fixed", brand: "telefutura" },
        ],
    },
    {
        cat: "📲 ESIM", grouped: true, items: [
            { id: "esim_w3", name: "ESIM Windtre", price: 0, fixedMargin: 0, linked: true, icon: "📲", type: "fixed", brand: "windtre" },
            { id: "esim_sost_w3", name: "ESIM Sost Windtre", price: 0, fixedMargin: 0, linked: true, icon: "🔄", type: "fixed", brand: "windtre" },
            { id: "esim_vod", name: "ESIM Vodafone", price: 0, fixedMargin: 0, linked: true, icon: "📲", type: "fixed", brand: "vodafone" },
            { id: "esim_fw", name: "ESIM Fastweb", price: 0, fixedMargin: 0, linked: true, icon: "📲", type: "fixed", brand: "fastweb" },
            { id: "esim_sost_fw", name: "ESIM Sost Fastweb", price: 0, fixedMargin: 0, linked: true, icon: "🔄", type: "fixed", brand: "fastweb" },
        ],
    },
    // 6a categoria (richiesta Luca #10): registra IMEI + € (ricavo), margine 4%,
    // conta come +1 telefono venduto (countsPhone).
    {
        cat: "📱 Telefono Cash", items: [
            // isTelCash: blocco dedicato (modello da lista + IMEI + importo di vendita).
            // NON usa needsImei: quello e' il magazzino usato, qui l'IMEI non va collegato.
            { id: "telefono_cash", name: "Telefono Cash", price: null, pctMargin: 4.00, isTelCash: true, countsPhone: true, icon: "📱", type: "pct" },
        ],
    },
];

/** Normalizzazione nome voce (identica a RV `_margNorm`). */
export const margNorm = (x: unknown): string => String(x || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Margine UNITARIO di una voce dati regime e prezzo (identico a RV:318/calcMargLabel). */
export function margineUnitario(voce: { type?: string; fixedMargin?: number; pctMargin?: number; companyCost?: number }, prezzo: number): number {
    if (voce.type === "fixed") return voce.fixedMargin || 0;
    if (voce.type === "pct") return prezzo * (voce.pctMargin || 0) / 100;
    if (voce.type === "cost") return prezzo - (voce.companyCost || 0);
    return 0;
}

export type MargPannelloItem = {
    name: string; cost_mode?: string | null;
    company_cost?: number | null; margin_percent?: number | null;
};

/**
 * Risolutore per NOME voce: pannello marg_items (se coi valori compilati) →
 * listino legacy → null. Stessa precedenza di caricaMargCatalogo in RV.
 */
export function regimeVoce(nome: string, pannello: MargPannelloItem[] | null | undefined):
    { type: "fixed" | "pct" | "cost"; fixedMargin?: number; pctMargin?: number; companyCost?: number } | null {
    const chiave = margNorm(nome);
    const it = (pannello || []).find(i => margNorm(i.name) === chiave);
    if (it) {
        if (it.cost_mode === "costo_fisso" && it.company_cost != null) return { type: "cost", companyCost: Number(it.company_cost) };
        if (it.cost_mode !== "costo_fisso" && it.margin_percent != null) return { type: "pct", pctMargin: Number(it.margin_percent) };
    }
    for (const c of MARG_PRODUCTS_LEGACY) {
        const legacy = c.items.find(v => margNorm(v.name) === chiave);
        if (legacy) return { type: legacy.type, fixedMargin: legacy.fixedMargin, pctMargin: legacy.pctMargin };
    }
    return null;
}
