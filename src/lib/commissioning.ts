/**
 * MOTORE PAY TABELLARE (cantiere GARE 10/08/2026).
 *
 * "Pagamento a tabella": ogni brand+mese ha delle PISTE (KPI: mobile, fisso,
 * business_mobile, ...) con una scala di SOGLIE di rete espressa in punti.
 * Le RIGHE pay sono ancorate al CATALOGO per nome (tipo_cliente / categoria /
 * prodotto / offerta, match gerarchico: il più specifico vince — stesso
 * modello di ce_compensi_brand): ogni attivazione valida porta `punti` alla
 * pista e viene pagata `pay_tiers[tier-1]` una volta in soglia (retroattivo
 * dal 1° pezzo), `pay_base` sotto la prima soglia ("di cui base").
 * Le righe `gettone=true` pagano SEMPRE `pay_base`, senza soglia (es. CB e
 * telefoni a rate W3 — "gettone unico a prescindere").
 *
 * REGOLA DI COPERTURA (Luca 10/08): un'offerta a catalogo SENZA riga pay non
 * genera commissioning — le scoperture vanno mostrate, mai pagate a zero in
 * silenzio. Il Calcolatore $$$ le elenca.
 *
 * Perimetro produzione (v1, da raffinare col cantiere): righe CTR- (pratiche
 * brand), no demo (filtro robusto in query), no nascosta_gestione, stati
 * annullati esclusi. Vendite a CRM solo da fine luglio 2026.
 */

import { supabase } from "@/lib/supabaseClient";
import { caricaTutte } from "@/lib/fetchTutte";

export type PayPista = { chiave: string; nome: string; um: string; ordine: number };
export type PaySoglia = { pista: string; tier: number; soglia_da: number; soglia_a: number | null };
export type PayRiga = {
    id: string; pista: string | null; nome: string;
    tipo_cliente: string | null; categoria: string | null; prodotto: string | null;
    offerta: string | null; opzione: string | null;
    punti: number; pay_base: number | null; pay_tiers: number[];
    gettone: boolean; attivo: boolean; note: string | null; ordine: number;
};
export type Tabellare = { brand: string; month: string; piste: PayPista[]; soglie: PaySoglia[]; righe: PayRiga[] };

export type ContrattoPay = {
    id: string; brand: string | null; negozio: string | null; venditore: string | null;
    data: string | null; stato: string | null; tipo_cliente: string | null;
    categoria: string | null; prodotto: string | null; offerta: string | null;
    nascosta_gestione: boolean | null;
};

/** contracts.brand (etichetta "WindTre"/"Very Mobile") → catalog_brands.id */
export function brandIdDaLabel(label: unknown): string | null {
    const k = String(label || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!k) return null;
    if (k.startsWith("windtre") || k === "w3") return "windtre";
    if (k.startsWith("vodafone")) return "vodafone";
    if (k.startsWith("fastweb")) return "fastweb";
    if (k.startsWith("sky")) return "sky";
    if (k.startsWith("tim")) return "tim";
    if (k.startsWith("iliad")) return "iliad";
    if (k.startsWith("very")) return "very";
    if (k.startsWith("ho")) return "ho";
    if (k.startsWith("kena")) return "kena";
    if (k.startsWith("dojo")) return "dojo";
    if (k.startsWith("s4")) return "s4";
    if (k.startsWith("kipoint")) return "kipoint";
    return null;
}

/** Primo e ultimo giorno del mese "YYYY-MM-01" (date TEXT, confronto lessicale). */
export function estremiMese(monthISO: string): { primo: string; ultimo: string } {
    const [y, m] = monthISO.split("-").map(Number);
    const fine = new Date(y, m, 0).getDate();
    const mm = String(m).padStart(2, "0");
    return { primo: `${y}-${mm}-01`, ultimo: `${y}-${mm}-${String(fine).padStart(2, "0")}` };
}

export async function caricaTabellare(brand: string, monthISO: string): Promise<Tabellare | null> {
    const [pisteRes, soglieRes, righeRes] = await Promise.all([
        supabase.from("pay_piste").select("chiave, nome, um, ordine").eq("brand", brand).eq("month", monthISO).order("ordine"),
        supabase.from("pay_soglie").select("pista, tier, soglia_da, soglia_a").eq("brand", brand).eq("month", monthISO).order("tier"),
        supabase.from("pay_righe").select("id, pista, nome, tipo_cliente, categoria, prodotto, offerta, opzione, punti, pay_base, pay_tiers, gettone, attivo, note, ordine")
            .eq("brand", brand).eq("month", monthISO).eq("attivo", true).order("ordine").limit(1000),
    ]);
    const piste = (pisteRes.data || []) as PayPista[];
    if (!piste.length) return null;
    const norm = (r: Record<string, unknown>): PayRiga => ({
        ...(r as unknown as PayRiga),
        punti: Number(r.punti || 0),
        pay_base: r.pay_base == null ? null : Number(r.pay_base),
        pay_tiers: Array.isArray(r.pay_tiers) ? (r.pay_tiers as unknown[]).map(Number) : [],
    });
    return {
        brand, month: monthISO, piste,
        soglie: ((soglieRes.data || []) as Record<string, unknown>[]).map(s => ({
            pista: String(s.pista), tier: Number(s.tier),
            soglia_da: Number(s.soglia_da), soglia_a: s.soglia_a == null ? null : Number(s.soglia_a),
        })),
        righe: ((righeRes.data || []) as Record<string, unknown>[]).map(norm),
    };
}

const eq = (a: unknown, b: unknown) =>
    String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

/**
 * Match gerarchico: la riga vale se OGNI suo campo non-null coincide col
 * contratto; vince quella con più campi valorizzati (più specifica), a
 * parità la prima per ordine. Nessun match = nessun commissioning (scopertura).
 */
export function matchRigaTabellare(
    righe: PayRiga[],
    c: { tipo_cliente?: string | null; categoria?: string | null; prodotto?: string | null; offerta?: string | null },
): PayRiga | null {
    let best: PayRiga | null = null;
    let bestScore = -1;
    for (const r of righe) {
        if (!r.attivo) continue;
        let score = 0;
        if (r.tipo_cliente != null) { if (!eq(r.tipo_cliente, c.tipo_cliente)) continue; score++; }
        if (r.categoria != null) { if (!eq(r.categoria, c.categoria)) continue; score++; }
        if (r.prodotto != null) { if (!eq(r.prodotto, c.prodotto)) continue; score++; }
        if (r.offerta != null) { if (!eq(r.offerta, c.offerta)) continue; score += 2; }   // l'offerta pesa di più
        if (score > bestScore || (score === bestScore && best && r.ordine < best.ordine)) {
            best = r; bestScore = score;
        }
    }
    return best;
}

/**
 * REGOLA GENERALE (Luca 10/08): le SOSTITUZIONI SIM — di TUTTI gli operatori —
 * non generano né commissioning né punti in gara. Escluse alla radice: non
 * sono "scoperture", sono fuori dal perimetro. I contracts scrivono il
 * prodotto ("Sostituzione SIM"), il catalogo anche la categoria.
 */
export function sostituzioneSim(c: { categoria?: string | null; prodotto?: string | null }): boolean {
    return /sostituzion/i.test(String(c.prodotto || "")) || /sostituzion/i.test(String(c.categoria || ""));
}

/** Perimetro v1 della produzione che conta per le gare. */
export function produzioneValidaGare(c: ContrattoPay): boolean {
    if (!String(c.id || "").startsWith("CTR-")) return false;   // solo pratiche brand
    if (c.nascosta_gestione === true) return false;
    if (/annull/i.test(String(c.stato || ""))) return false;
    if (sostituzioneSim(c)) return false;
    return true;
}

/** Contratti del brand nel mese (demo escluse in query, tetto 1000 superato). */
export async function caricaContrattiMese(brandLabelPrefix: string, monthISO: string): Promise<ContrattoPay[]> {
    const { primo, ultimo } = estremiMese(monthISO);
    const { data } = await caricaTutte<ContrattoPay>((from, to) =>
        supabase.from("contracts")
            .select("id, brand, negozio, venditore, data, stato, tipo_cliente, categoria, prodotto, offerta, nascosta_gestione")
            .ilike("brand", `${brandLabelPrefix}%`)
            .gte("data", primo).lte("data", ultimo)
            .or("is_demo.is.null,is_demo.eq.false")
            .order("id").range(from, to));
    return (data || []).filter(produzioneValidaGare);
}

export type AvanzamentoPista = {
    chiave: string; nome: string; punti: number; pezzi: number;
    tier: number;                       // 0 = sotto la prima soglia
    soglia: PaySoglia | null;           // soglia raggiunta
    prossima: PaySoglia | null;         // prossima da prendere
    mancano: number | null;             // punti alla prossima
};

export type Avanzamento = {
    piste: Record<string, AvanzamentoPista>;
    contati: number;                    // contratti agganciati a una riga
    scartati: { categoria: string | null; prodotto: string | null; offerta: string | null; n: number }[];
};

export function calcolaAvanzamento(tab: Tabellare, contratti: ContrattoPay[]): Avanzamento {
    const punti: Record<string, number> = {};
    const pezzi: Record<string, number> = {};
    const scartatiMap = new Map<string, { categoria: string | null; prodotto: string | null; offerta: string | null; n: number }>();
    let contati = 0;
    for (const c of contratti) {
        const riga = matchRigaTabellare(tab.righe, c);
        if (!riga) {
            const k = `${c.categoria}|${c.prodotto}|${c.offerta}`;
            const e = scartatiMap.get(k) || { categoria: c.categoria, prodotto: c.prodotto, offerta: c.offerta, n: 0 };
            e.n++; scartatiMap.set(k, e);
            continue;
        }
        contati++;
        if (riga.pista) {
            punti[riga.pista] = (punti[riga.pista] || 0) + riga.punti;
            pezzi[riga.pista] = (pezzi[riga.pista] || 0) + 1;
        }
    }
    const piste: Record<string, AvanzamentoPista> = {};
    for (const p of tab.piste) {
        const scala = tab.soglie.filter(s => s.pista === p.chiave).sort((a, b) => a.tier - b.tier);
        const val = Math.round((punti[p.chiave] || 0) * 100) / 100;
        let presa: PaySoglia | null = null;
        for (const s of scala) if (val >= s.soglia_da) presa = s;
        const prossima = scala.find(s => s.soglia_da > val) || null;
        piste[p.chiave] = {
            chiave: p.chiave, nome: p.nome, punti: val, pezzi: pezzi[p.chiave] || 0,
            tier: presa ? presa.tier : 0, soglia: presa, prossima,
            mancano: prossima ? Math.round((prossima.soglia_da - val) * 100) / 100 : null,
        };
    }
    return { piste, contati, scartati: [...scartatiMap.values()].sort((a, b) => b.n - a.n) };
}

/** € per attivazione della riga alla soglia data (0 = sotto soglia → base). */
export function payPerRiga(riga: PayRiga, tier: number): number | null {
    if (riga.gettone) return riga.pay_base;
    if (tier <= 0) return riga.pay_base;
    const t = riga.pay_tiers;
    if (!t.length) return riga.pay_base;
    return t[Math.min(tier, t.length) - 1];
}
