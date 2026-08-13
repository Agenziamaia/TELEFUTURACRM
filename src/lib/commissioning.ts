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

export type PayPista = { chiave: string; nome: string; um: string; ordine: number; perc_ragazzi?: number | null };
export type PaySoglia = { pista: string; tier: number; soglia_da: number; soglia_a: number | null };
export type PayRiga = {
    id: string; pista: string | null; nome: string;
    tipo_cliente: string | null; categoria: string | null; prodotto: string | null;
    offerta: string | null; opzione: string | null;
    brand_vendita: string | null;               // NULL = qualsiasi brand di vendita
    // token di provenienza separati da virgola ("iliad,coop,poste"): la riga
    // vale SOLO per le vendite con quell'Operatore di Provenienza (prefisso
    // normalizzato). NULL = qualsiasi. Es. TIM MNP +10€, Kena STAR (Luca 12/08).
    provenienza?: string | null;
    moltiplicatore?: boolean;                   // true = i tiers sono MOLTIPLICATORI del canone dell'offerta (modello W3)
    punti: number; pay_base: number | null; pay_tiers: number[];
    gettone: boolean; attivo: boolean; note: string | null; ordine: number;
};
// derivato: il lato ragazzi non esiste a DB — è il lato AZIENDA scalato con
// pay_piste.perc_ragazzi (Luca 11/08: es. Fastweb mobile 60%, fisso 70%).
export type Tabellare = { brand: string; month: string; piste: PayPista[]; soglie: PaySoglia[]; righe: PayRiga[]; derivato?: boolean };

export type ContrattoPay = {
    id: string; brand: string | null; negozio: string | null; venditore: string | null;
    data: string | null; stato: string | null; tipo_cliente: string | null;
    categoria: string | null; prodotto: string | null; offerta: string | null;
    nascosta_gestione: boolean | null;
    cod_ins: string | null;                     // codice inserimento (dettagli "Cod.Ins.")
    provenienza: string | null;                 // dettagli "Operatore di Provenienza"
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

async function caricaTabellareLato(brand: string, monthISO: string, lato: string): Promise<Tabellare | null> {
    const [pisteRes, soglieRes, righeRes] = await Promise.all([
        supabase.from("pay_piste").select("chiave, nome, um, ordine, perc_ragazzi").eq("brand", brand).eq("month", monthISO).eq("lato", lato).order("ordine"),
        supabase.from("pay_soglie").select("pista, tier, soglia_da, soglia_a").eq("brand", brand).eq("month", monthISO).eq("lato", lato).order("tier"),
        supabase.from("pay_righe").select("id, pista, nome, tipo_cliente, categoria, prodotto, offerta, opzione, brand_vendita, provenienza, moltiplicatore, punti, pay_base, pay_tiers, gettone, attivo, note, ordine")
            .eq("brand", brand).eq("month", monthISO).eq("lato", lato).eq("attivo", true).order("ordine").limit(1000),
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

/**
 * Tabellare RAGAZZI di un brand/mese. Se a DB c'è solo il lato AZIENDA (la
 * lettera vera), il ragazzi si DERIVA scalando base e tiers di ogni riga con
 * la percentuale della SUA pista (pay_piste.perc_ragazzi; righe fuori pista
 * = gettoni non scalati). Cambi la lettera o le % dal pannello → il ragazzi
 * si aggiorna da solo.
 */
export async function caricaTabellare(brand: string, monthISO: string): Promise<Tabellare | null> {
    const [ragazzi, azienda, mappa] = await Promise.all([
        caricaTabellareLato(brand, monthISO, "ragazzi"),
        caricaTabellareLato(brand, monthISO, "azienda"),
        caricaMappaSoglie(brand, monthISO),
    ]);
    if (!azienda) return ragazzi;
    const percDi = new Map(azienda.piste.map(p => [p.chiave, p.perc_ragazzi == null ? 100 : Number(p.perc_ragazzi)]));
    const scala = (v: number | null, pista: string | null) =>
        v == null ? null : Math.round(v * ((pista ? percDi.get(pista) ?? 100 : 100) / 100) * 100) / 100;
    const deriva = (r: PayRiga): PayRiga => {
        // MAPPA SOGLIE (Luca 12/08, modello W3): dove esiste, ogni soglia
        // NOSTRA pesca il valore azienda della soglia LORO mappata e applica
        // la % di quella soglia (settata per pista, mai per prodotto) —
        // la perc_ragazzi di pista non si somma, la mappa la sostituisce.
        const m = r.pista ? mappa.get(r.pista) : undefined;
        if (m && m.size && !r.gettone) {
            const tiers: number[] = [];
            const nMax = Math.max(...Array.from(m.keys()));
            for (let tn = 1; tn <= nMax; tn++) {
                const voce = m.get(tn);
                const az = voce ? r.pay_tiers[voce.tier_loro - 1] : undefined;
                tiers.push(voce == null || az == null ? (null as unknown as number)
                    : Math.round(az * (voce.perc / 100) * 100) / 100);
            }
            return { ...r, pay_base: scala(r.pay_base, r.pista), pay_tiers: tiers };
        }
        return {
            ...r,
            pay_base: scala(r.pay_base, r.pista),
            pay_tiers: r.pay_tiers.map(v => scala(v, r.pista) as number),
        };
    };
    // PISTE SOLO AZIENDA (Luca 13/08, gara business W3 «di rete, resta solo
    // all'azienda»): perc_ragazzi = 0 marca la pista che NON si deriva mai
    // ai ragazzi — sparisce dal loro tabellare invece di comparire a 0€.
    const soloAzienda = (p: PayPista) => Number(p.perc_ragazzi ?? 100) === 0;
    if (!ragazzi) {
        // il ragazzi può avere SOLO gettoni senza piste (es. W3 dopo l'abbandono
        // del vecchio tabellare): ripescali e affiancali al derivato. E può avere
        // SOGLIE PROPRIE senza piste (esito Luca 12/08: la % di derivazione
        // scala solo i pay, le soglie ragazzi si settano a mano) — dove ci sono,
        // vincono su quelle azienda della stessa pista.
        const [orfani, soglieRag] = await Promise.all([
            caricaRigheOrfane(brand, monthISO),
            caricaSoglieLato(brand, monthISO, "ragazzi"),
        ]);
        const manuali = new Set(soglieRag.map(s => s.pista));
        const pisteDer = azienda.piste.filter(p => !soloAzienda(p));
        const chiaviDer = new Set(pisteDer.map(p => p.chiave));
        return {
            ...azienda, derivato: true,
            piste: pisteDer,
            soglie: [...azienda.soglie.filter(s => chiaviDer.has(s.pista) && !manuali.has(s.pista)), ...soglieRag],
            righe: [...azienda.righe.filter(r => !r.pista || chiaviDer.has(r.pista)).map(deriva), ...orfani],
        };
    }
    // DERIVAZIONE PARZIALE (allineamento Luca 11/08): le piste azienda che il
    // ragazzi NON ha si derivano (× perc_ragazzi, 100 se non impostata) — così
    // il Calcolatore mostra mappato tutto ciò che l'azienda copre e le
    // "scoperture" diventano la lista vera di ciò che manca su ogni brand.
    const chiaviRag = new Set(ragazzi.piste.map(p => p.chiave));
    const pisteApp = azienda.piste.filter(p => !chiaviRag.has(p.chiave) && !soloAzienda(p));
    if (!pisteApp.length) return ragazzi;
    const chiaviApp = new Set(pisteApp.map(p => p.chiave));
    // le soglie ragazzi (anche manuali, sulle piste derivate) vincono sempre
    const pisteSoglieRag = new Set(ragazzi.soglie.map(s => s.pista));
    return {
        ...ragazzi, derivato: true,
        piste: [...ragazzi.piste, ...pisteApp],
        soglie: [...ragazzi.soglie, ...azienda.soglie.filter(sg => chiaviApp.has(sg.pista) && !pisteSoglieRag.has(sg.pista))],
        righe: [...ragazzi.righe, ...azienda.righe.filter(r => r.pista && chiaviApp.has(r.pista)).map(deriva)],
    };
}

/** Mappa soglie loro↔nostre + % (pay_mappa_soglie): pista → (tier_nostro → voce). */
export type VoceMappaSoglie = { tier_loro: number; perc: number };
export async function caricaMappaSoglie(brand: string, monthISO: string): Promise<Map<string, Map<number, VoceMappaSoglie>>> {
    const out = new Map<string, Map<number, VoceMappaSoglie>>();
    const { data } = await supabase.from("pay_mappa_soglie").select("pista, tier_nostro, tier_loro, perc")
        .eq("brand", brand).eq("month", monthISO);
    ((data || []) as Record<string, unknown>[]).forEach(r => {
        const pista = String(r.pista);
        if (!out.has(pista)) out.set(pista, new Map());
        out.get(pista)!.set(Number(r.tier_nostro), { tier_loro: Number(r.tier_loro), perc: Number(r.perc) });
    });
    return out;
}

/** Solo le soglie di un lato (per il ragazzi con soglie manuali senza piste). */
async function caricaSoglieLato(brand: string, monthISO: string, lato: string): Promise<PaySoglia[]> {
    const { data } = await supabase.from("pay_soglie").select("pista, tier, soglia_da, soglia_a")
        .eq("brand", brand).eq("month", monthISO).eq("lato", lato).order("tier");
    return ((data || []) as Record<string, unknown>[]).map(s => ({
        pista: String(s.pista), tier: Number(s.tier),
        soglia_da: Number(s.soglia_da), soglia_a: s.soglia_a == null ? null : Number(s.soglia_a),
    }));
}

/** Righe ragazzi senza pista madre (gettoni orfani, normalizzate). */
async function caricaRigheOrfane(brand: string, monthISO: string): Promise<PayRiga[]> {
    const { data } = await supabase.from("pay_righe")
        .select("id, pista, nome, tipo_cliente, categoria, prodotto, offerta, opzione, brand_vendita, provenienza, moltiplicatore, punti, pay_base, pay_tiers, gettone, attivo, note, ordine")
        .eq("brand", brand).eq("month", monthISO).eq("lato", "ragazzi").eq("attivo", true).order("ordine").limit(1000);
    return ((data || []) as Record<string, unknown>[]).map(r => ({
        ...(r as unknown as PayRiga),
        punti: Number(r.punti || 0),
        pay_base: r.pay_base == null ? null : Number(r.pay_base),
        pay_tiers: Array.isArray(r.pay_tiers) ? (r.pay_tiers as unknown[]).map(Number) : [],
    }));
}

/** Tabellare AZIENDA così com'è (per il pannello e le analisi lato azienda). */
export const caricaTabellareAzienda = (brand: string, monthISO: string) => caricaTabellareLato(brand, monthISO, "azienda");

const eq = (a: unknown, b: unknown) =>
    String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

/**
 * Match gerarchico: la riga vale se OGNI suo campo non-null coincide col
 * contratto; vince quella con più campi valorizzati (più specifica), a
 * parità la prima per ordine. Nessun match = nessun commissioning (scopertura).
 * brandVendita: brand della VENDITA (catalog_brands.id) — nei contesti misti
 * (lettera A VS che paga anche i pezzi Fastweb) le righe con brand_vendita
 * valorizzato valgono SOLO per quel brand (VF e FW condividono nomi offerta).
 */
/** normalizza un operatore di provenienza per il confronto ("CoopVoce" → "coopvoce") */
const normProv = (v: unknown) => String(v || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
/** la riga con provenienza vale solo se la vendita arriva da uno dei suoi token
 *  (prefisso normalizzato: "coop" prende "CoopVoce", "poste" prende "PosteMobile") */
function provenienzaOk(tokens: string, vendita: unknown): boolean {
    const pv = normProv(vendita);
    if (!pv) return false;
    return tokens.split(",").map(normProv).filter(Boolean).some(t => pv.startsWith(t));
}

export function matchRigaTabellare(
    righe: PayRiga[],
    c: { tipo_cliente?: string | null; categoria?: string | null; prodotto?: string | null; offerta?: string | null; provenienza?: string | null },
    brandVendita?: string | null,
): PayRiga | null {
    let best: PayRiga | null = null;
    let bestScore = -1;
    for (const r of righe) {
        if (!r.attivo) continue;
        if (r.brand_vendita && brandVendita && !eq(r.brand_vendita, brandVendita)) continue;
        let score = 0;
        if (r.tipo_cliente != null) { if (!eq(r.tipo_cliente, c.tipo_cliente)) continue; score++; }
        if (r.categoria != null) { if (!eq(r.categoria, c.categoria)) continue; score++; }
        if (r.prodotto != null) { if (!eq(r.prodotto, c.prodotto)) continue; score++; }
        if (r.offerta != null) { if (!eq(r.offerta, c.offerta)) continue; score += 2; }   // l'offerta pesa di più
        // PROVENIENZA (Luca 12/08): la riga vincolata alla provenienza vale solo
        // per quelle vendite, e a parità di ancora vince sulla riga generica
        // (TIM MNP +10€ da Iliad/Coop/Poste, Kena STAR da Iliad/FW/Coop/Poste)
        if (r.provenienza != null && r.provenienza.trim() !== "") {
            if (!provenienzaOk(r.provenienza, c.provenienza)) continue;
            score += 2;
        }
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

/**
 * Vendite FUORI dalle gare per regola aziendale: sostituzioni SIM (tutti gli
 * operatori) e le SIM Easy Control ("va considerata come una sostituzione" —
 * Luca 11/08). Né commissioning né punti, e nel Calcolatore non sono
 * "scoperture" ma escluse dichiarate.
 */
export function esclusaDalleGare(c: { categoria?: string | null; prodotto?: string | null; offerta?: string | null }): boolean {
    if (sostituzioneSim(c)) return true;
    // "vanno trattate come una sostituzione" (Luca 11/08): Easy Control (VF)
    // e Smart Security (W3) — né commissioning né punti.
    if (/^(easy control|smart security)$/i.test(String(c.offerta || "").trim())) return true;
    return false;
}

/** Perimetro v1 della produzione che conta per le gare. */
export function produzioneValidaGare(c: ContrattoPay): boolean {
    if (!String(c.id || "").startsWith("CTR-")) return false;   // solo pratiche brand
    if (c.nascosta_gestione === true) return false;
    if (/annull/i.test(String(c.stato || ""))) return false;
    if (esclusaDalleGare(c)) return false;
    return true;
}

/** CUTOFF dell'ora di scatto (esito Luca 12/08 sul Calendario gare): prima
 *  dell'ora di scatto le vendite di OGGI non esistono per il perimetro gare —
 *  niente commissioning, niente proiezioni: la produzione resta ferma al
 *  giorno precedente e allo scatto la giornata entra tutta insieme (coerente
 *  con "trascorsi" di giorniLavorativiMese, che conta oggi solo dopo l'ora).
 *  Ritorna il giorno da escludere ("YYYY-MM-DD") o null se si conta tutto. */
export async function cutoffProduzione(monthISO: string): Promise<string | null> {
    const oggi = new Date();
    const ymdOggi = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, "0")}-${String(oggi.getDate()).padStart(2, "0")}`;
    if (!ymdOggi.startsWith(monthISO.slice(0, 7))) return null;    // mese diverso da oggi: niente da tagliare
    const { data } = await supabase.from("pay_giorni_lavorativi").select("ora_scatto").eq("month", monthISO).maybeSingle();
    const ora = data?.ora_scatto == null ? 19 : Number(data.ora_scatto);
    return oggi.getHours() < ora ? ymdOggi : null;
}

/** Contratti del brand nel mese (demo escluse in query, tetto 1000 superato).
 *  Le vendite di oggi entrano solo dopo l'ora di scatto (cutoffProduzione). */
export async function caricaContrattiMese(brandLabelPrefix: string, monthISO: string): Promise<ContrattoPay[]> {
    const { primo, ultimo } = estremiMese(monthISO);
    const escludiOggi = await cutoffProduzione(monthISO);
    type Raw = ContrattoPay & { dettagli?: Record<string, unknown> | null };
    const { data } = await caricaTutte<Raw>((from, to) =>
        supabase.from("contracts")
            .select("id, brand, negozio, venditore, data, stato, tipo_cliente, categoria, prodotto, offerta, nascosta_gestione, dettagli")
            .ilike("brand", `${brandLabelPrefix}%`)
            .gte("data", primo).lte("data", ultimo)
            .or("is_demo.is.null,is_demo.eq.false")
            .order("id").range(from, to) as unknown as PromiseLike<{ data: Raw[] | null; error: { message?: string } | null }>);
    return (data || []).map(r => {
        const d = (r.dettagli || {}) as Record<string, unknown>;
        const cod = d["Cod.Ins."] ?? d["Codice Inserimento"] ?? null;
        // categoria_catalogo (flusso catalogo): la categoria VERA del catalogo
        // ("Mobile Ric. Auto"/"Mobile Wallet") — la colonna porta la macro
        // ("Mobile") e non basta alle righe pay ancorate alla categoria.
        const catCat = d["categoria_catalogo"];
        const { dettagli: _d, ...resto } = r;
        const prov = d["Operatore di Provenienza"];
        return {
            ...resto,
            categoria: catCat ? String(catCat) : r.categoria,
            cod_ins: cod == null ? null : String(cod),
            provenienza: prov == null ? null : String(prov),
        };
    }).filter(c => produzioneValidaGare(c) && (!escludiOggi || String(c.data || "").slice(0, 10) !== escludiOggi));
}

/**
 * CONTESTI VF/FW (mappa di Luca 10/08, "dropzone (1).pdf" + correzione 10/08
 * notte): T1 = Telefutura (Vodafone Store), T2 = Telefutura 2 (multibrand
 * VND). LATO RAGAZZI — che è quello che il motore paga — TUTTO il Vodafone
 * conta e paga come Vodafone Store (lettera A): la distinzione VND esiste
 * solo LATO AZIENDA (cantiere futuro sui PDF delle lettere). Il Fastweb
 * invece si SPLITTA anche lato ragazzi, col CODICE DI INSERIMENTO (il
 * negozio del codice, non quello di attribuzione):
 *   - FW codici dei 4 VS (Acilia/Baleniere/Castani/Merulana) → "vodafone"
 *     (ricade nella lettera A e nel commissioning VS)
 *   - FW codici Donna/Magliana/Garbatella/Promontori → "fastweb" (T2)
 * Le chiavi contesto SONO le chiavi brand delle tabelle pay. Codice assente →
 * ripiego sul negozio di attribuzione (prima parola); irriconoscibile → null.
 */
const CTX_VF_T1 = ["acilia", "baleniere", "castani", "merulana"];
const CTX_FW_T2 = ["donna", "magliana", "garbatella", "promontori"];

export function contestoVfFw(brandId: string | null, codice: string | null, negozio?: string | null, categoria?: string | null): string | null {
    // LATO RAGAZZI (11/08): ogni brand paga col SUO tabellare — Vodafone
    // sempre lettera A, Fastweb sempre tabellare Fastweb — CON UNA ECCEZIONE
    // (task Luca 11/08): l'ENERGIA Fastweb venduta coi codici dei Vodafone
    // Store (T1) paga il tabellare a soglie della lettera A (pista luce/gas
    // del contesto vodafone); l'energia T2 resta a gettone flat sul fastweb.
    // Lo split T1/T2 completo coi codici servirà al lato AZIENDA (cantiere PDF).
    // FW T1 = calderone unico con Vodafone (task Luca 11/08): TUTTO il
    // Fastweb venduto coi codici dei Vodafone Store paga la lettera A.
    if (brandId === "fastweb") {
        const ref = String(codice || "").trim().toLowerCase() || String(negozio || "").trim().toLowerCase();
        if (CTX_VF_T1.some(x => ref.startsWith(x))) return "vodafone";
    }
    return brandId;
}
export const CTX_CODICI_T1 = CTX_VF_T1;
export const CTX_CODICI_FW_T2 = CTX_FW_T2;

/** Etichette leggibili dei contesti pay. */
export const CONTESTI_LABEL: Record<string, string> = {
    vodafone: "Vodafone · lettera A (lato ragazzi vale per tutte le attivazioni VF)",
    fastweb: "Fastweb (lato ragazzi: tutte le attivazioni FW; MNP/OLO da Vodafone escluse)",
};

/**
 * Contratti del MESE che allocano nel contesto pay richiesto. Per i contesti
 * VF/FW carica i brand coinvolti e smista col codice inserimento; per gli
 * altri brand equivale a caricaContrattiMese. nonAllocate = vendite VF/FW
 * del perimetro senza codice/negozio riconducibile a un contesto.
 */
export async function caricaContrattiContesto(
    contesto: string, monthISO: string, prefixAltriBrand?: string,
): Promise<{ contratti: ContrattoPay[]; nonAllocate: number; escluseVodafone: number }> {
    // il contesto vodafone (lettera A) include anche l'ENERGIA Fastweb dei VS
    const fonti: string[] =
        contesto === "vodafone" ? ["Vodafone", "Fastweb"] :
        contesto === "fastweb" ? ["Fastweb"] : [prefixAltriBrand || contesto];
    const tutti = (await Promise.all(fonti.map(p => caricaContrattiMese(p, monthISO)))).flat();
    let escluseVodafone = 0;
    const contratti = tutti.filter(c => {
        // REGOLE LETTERE (agosto): Fastweb T2 — MNP/OLO di provenienza
        // VODAFONE fuori da target e compenso; lettera A Vodafone Store —
        // MNP di provenienza Vodafone/Fastweb/Ho. escluse (mobile).
        const prov = String(c.provenienza || "");
        if (contesto === "fastweb" && /vodafone/i.test(prov)) { escluseVodafone++; return false; }
        if (contesto === "vodafone" && /mnp/i.test(String(c.prodotto || "")) && /vodafone|fastweb|\bho\b|ho\./i.test(prov)) { escluseVodafone++; return false; }
        return contestoVfFw(brandIdDaLabel(c.brand), c.cod_ins, c.negozio, c.categoria) === contesto;
    });
    return { contratti, nonAllocate: 0, escluseVodafone };
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
        const riga = matchRigaTabellare(tab.righe, c, brandIdDaLabel(c.brand));
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

/**
 * GIORNI LAVORATIVI del mese (Prospect, Luca 11/08): lun-sab meno i
 * giorni_festivi; pay_giorni_lavorativi tiene l'override manuale del totale.
 * trascorsi = giorni lavorativi da inizio mese a OGGI incluso (0 se il mese
 * deve ancora iniziare, = totali se è finito).
 */
export async function giorniLavorativiMese(monthISO: string): Promise<{
    totali: number; trascorsi: number; override: boolean;
    oraScatto: number; proiezioneDal: number; mostraProiezione: boolean;
    congelati: number[]; festivi: string[];
}> {
    const { primo, ultimo } = estremiMese(monthISO);
    const [ov, fest] = await Promise.all([
        supabase.from("pay_giorni_lavorativi").select("giorni, ora_scatto, proiezione_dal, congelati").eq("month", monthISO).maybeSingle(),
        supabase.from("giorni_festivi").select("data").gte("data", primo).lte("data", ultimo),
    ]);
    const festivi = new Set((fest.data || []).map(f => String((f as { data: string }).data).slice(0, 10)));
    const [y, m] = monthISO.split("-").map(Number);
    const nGiorni = new Date(y, m, 0).getDate();
    const oraScatto = ov.data?.ora_scatto == null ? 19 : Number(ov.data.ora_scatto);
    const proiezioneDal = ov.data?.proiezione_dal == null ? 1 : Number(ov.data.proiezione_dal);
    // GIORNI CONGELATI (Luca 13/08): tutti i negozi chiusi — fuori dal
    // conteggio (totali e trascorsi) esattamente come i festivi
    const congelati = new Set(((ov.data?.congelati as number[] | null) || []).map(Number));
    const oggi = new Date();
    const oggiISO = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, "0")}-${String(oggi.getDate()).padStart(2, "0")}`;
    let totali = 0, trascorsi = 0;
    for (let g = 1; g <= nGiorni; g++) {
        const iso = `${y}-${String(m).padStart(2, "0")}-${String(g).padStart(2, "0")}`;
        const dow = new Date(y, m - 1, g).getDay();
        if (dow === 0 || festivi.has(iso) || congelati.has(g)) continue;   // domeniche, festivi e congelati fuori
        totali++;
        // ORA DI SCATTO (Luca 11/08): il giorno corrente conta come trascorso
        // solo dopo quell'ora — prima, le proiezioni non lo considerano.
        if (iso < oggiISO || (iso === oggiISO && oggi.getHours() >= oraScatto)) trascorsi++;
    }
    const overrideGiorni = ov.data?.giorni == null ? null : Number(ov.data.giorni);
    if (overrideGiorni != null) {
        trascorsi = Math.min(trascorsi, overrideGiorni);
        totali = overrideGiorni;
    }
    // la proiezione si mostra solo dal giorno scelto del mese (mesi passati: sempre)
    const meseCorrente = oggiISO.slice(0, 7) === monthISO.slice(0, 7);
    const mostraProiezione = !meseCorrente ? true : oggi.getDate() >= proiezioneDal;
    return {
        totali, trascorsi, override: overrideGiorni != null, oraScatto, proiezioneDal, mostraProiezione,
        congelati: [...congelati].sort((a, b) => a - b), festivi: [...festivi].sort(),
    };
}

/** € per attivazione della riga alla soglia data (0 = sotto soglia → base). */
export function payPerRiga(riga: PayRiga, tier: number): number | null {
    if (riga.gettone) return riga.pay_base;
    if (tier <= 0) return riga.pay_base;
    const t = riga.pay_tiers;
    if (!t.length) return riga.pay_base;
    return t[Math.min(tier, t.length) - 1];
}
