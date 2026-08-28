// DIREZIONE INSERIMENTO v3 — lib condivisa (pannello Gare + widget Home).
// REGOLA DEL PONTE: i punti escono SOLO dal motore (matchRigheAttivazione +
// puntiPerRighe sul tabellare AZIENDA — con ripiego sul ragazzi dove
// l'azienda non esiste) e la produzione si alloca per CODICE DI INSERIMENTO,
// MAI per negozio che registra: la direzione ragiona per codice/canale.
//
// MULTI-BRAND (Luca 26/08 sera): ogni brand ha le sue REALTÀ —
//   WindTre  → i codici della lettera (pay_target_pdv, scale per-codice);
//   Vodafone → Vodafone Store (codici T1) e VND (il resto), scala di rete
//              della lettera A; i contratti arrivano da caricaContrattiContesto
//              (FW T1 dentro, MNP escluse — le stesse regole del Calcolatore);
//   Fastweb  → lettera T2 (canale unico);
//   Sky      → canale unico.
import { supabase } from "@/lib/supabaseClient";
import {
    caricaContrattiMese, caricaContrattiContesto, caricaTabellareAzienda,
    caricaTabellare, matchRigheAttivazione, matchRigheGaraParallela,
    puntiPerRighe, produzioneValidaGare,
    brandIdDaLabel, giorniLavorativiMese, CTX_CODICI_T1,
    type ContrattoPay, type Tabellare,
} from "@/lib/commissioning";

const norm = (s: unknown) => String(s || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");

export const DIR_BRANDS = [
    { id: "windtre", label: "WindTre", color: "#ff8b2c" },
    { id: "vodafone", label: "Vodafone", color: "#e60000" },
    { id: "fastweb", label: "Fastweb", color: "#f2c200" },
    { id: "sky", label: "Sky", color: "#8b5cf6" },
] as const;
export type DirBrandId = typeof DIR_BRANDS[number]["id"];

export type PistaAvz = { punti: number; pezzi: number };
export type CodiceDir = {
    cod_gara: string;
    negozio: string;                      // etichetta della realtà (PV lettera W3, canale VF…)
    cluster: string | null;
    token: string[];                      // prefissi normalizzati per l'allocazione del Cod.Ins.
    catchAll?: boolean;                   // prende ciò che nessun token ha preso (VND, canali unici)
    multibrand?: boolean;                 // W3: codice MB-* — resta a ZERO, carica sull'associato
    soglie: Record<string, number[]>;     // pista → scala (per-codice W3, di rete altrove)
    piste: Record<string, PistaAvz>;      // pista → avanzamento LIVE del codice
    targets: Record<string, number>;      // pista → target della direzione
    tiersScelti: Record<string, number | null>;   // pista → soglia cliccata (null = a mano)
    cbPunti?: number;                     // W3: punti CUSTOMER BASE (gara parallela partnership)
    businessPezzi?: number;               // W3: pezzi business del codice (paletto 6)
};
export type PoliticaPista = { modo: string; dati?: Record<string, unknown> | null };
export type Direzione = {
    brand: DirBrandId;
    monthISO: string;
    codici: CodiceDir[];
    nonAllocati: number;                  // vendite valide senza codice riconducibile
    pisteTab: { chiave: string; nome: string; um: string }[];   // dal tabellare, in ordine
    tab: Tabellare | null;
    sfridi: Record<string, number>;       // pista → % extra (interi)
    gl: { totali: number; trascorsi: number; mostraProiezione?: boolean } | null;
    // W3 (Luca 26/08 sera-3): l'operatore pesa PER CODICE solo su alcune
    // piste; le altre sono target di GRUPPO con una politica di caricamento
    kpiCodice: string[];                  // piste mostrate per-codice
    pisteGruppo: string[];                // piste di gruppo (politica proprio/bilancia)
    politiche: Record<string, PoliticaPista>;   // pista → politica (+ '__associati__')
    palettoBusiness: number;              // W3: pezzi P.IVA mobile del paletto — dalla LETTERA del mese
};

// W3: cosa pesa per codice (dettato Luca 26/08 sera-3); TUTTO il resto del
// tabellare (non parallelo) è di GRUPPO — così luce&gas, assicurazioni,
// telefoni&device e le piste future ci cascano da sole (revisore: device
// era rimasta orfana con la lista fissa)
const W3_KPI_CODICE = ["mobile", "fisso", "cb", "protetti"];
const PARALLELE_DIR = new Set(["partnership", "business_piva", "smartphone_cb"]);
/** Il PALETTO BUSINESS della lettera W3: 6 pezzi business per codice, pena
 *  il malus 30% sulla gara mobile del punto vendita. (In Gare non è ancora
 *  censito come gate — qui almeno si monitora.) */
export const W3_PALETTO_BUSINESS = 6;

/** Il codice di un contratto: prefissi dei token (verso corto ≥4 char e
 *  univoco compreso — caso «Donna» agosto), poi l'eventuale catch-all. */
function codiceDi(c: ContrattoPay, codici: CodiceDir[]): CodiceDir | null {
    const ci = norm((c as { cod_ins?: string | null }).cod_ins);
    if (ci) {
        for (const k of codici) if (k.token.some((t) => t && ci.startsWith(t))) return k;
        if (ci.length >= 4) {
            const corti = codici.filter((k) => k.token.some((t) => t.startsWith(ci)));
            if (corti.length === 1) return corti[0];
        }
    }
    return codici.find((k) => k.catchAll) || null;
}

/** Scala di RETE per pista dal tabellare (per i brand senza scale per-codice). */
function scaleDiRete(tab: Tabellare | null): Record<string, number[]> {
    const out: Record<string, number[]> = {};
    (tab?.soglie || []).forEach((s) => {
        (out[s.pista] = out[s.pista] || [])[Number(s.tier) - 1] = Number(s.soglia_da);
    });
    Object.keys(out).forEach((p) => { out[p] = out[p].filter((v) => Number.isFinite(v)); if (!out[p].length) delete out[p]; });
    return out;
}

export async function caricaDirezione(brand: DirBrandId, monthISO: string): Promise<Direzione> {
    const [tgtRes, sfrRes, polRes, glRes, regRes] = await Promise.all([
        supabase.from("direzione_targets").select("cod_gara, pista, target, tier").eq("brand", brand).eq("month", monthISO),
        supabase.from("direzione_sfridi").select("pista, pct").eq("brand", brand).eq("month", monthISO),
        supabase.from("direzione_politiche").select("pista, modo, dati").eq("brand", brand).eq("month", monthISO),
        giorniLavorativiMese(monthISO).catch(() => null),
        // parametri della LETTERA del mese (Luca 27/08: il paletto business
        // «è 6 questo mese ma poi cambierà» — segue l'upload in Gare)
        supabase.from("pay_regole_lettera").select("chiave, valore").eq("brand", brand).eq("month", monthISO),
    ]);
    const regoleLettera: Record<string, number> = {};
    (regRes.data || []).forEach((r) => { regoleLettera[String(r.chiave)] = Number(r.valore); });

    let codici: CodiceDir[] = [];
    let tab: Tabellare | null = null;
    let contratti: ContrattoPay[] = [];

    if (brand === "windtre") {
        const [pdvRes, t, ctr] = await Promise.all([
            supabase.from("pay_target_pdv")
                .select("cod_gara, negozio, cluster_mobile, soglie_mobile, soglie_fisso, soglie_piva, extra")
                .eq("brand", "windtre").eq("month", monthISO).order("negozio"),
            caricaTabellareAzienda("windtre", monthISO),
            caricaContrattiMese("WindTre", monthISO),
        ]);
        tab = t; contratti = ctr;
        codici = (pdvRes.data || []).map((r) => {
            // il TARGET PARTNERSHIP del codice vive in extra.pr (pannello 🏅):
            // premio pieno al 100%, ridotto tra 80 e 99% → la scala CB vera è
            // [80% del target, target] (Luca 26/08 notte: «è inutile che mi
            // fai scrivere a mano un target che esiste già»)
            const prTarget = Number((r.extra as { pr?: { target?: number | null } } | null)?.pr?.target) || 0;
            return {
                cod_gara: String(r.cod_gara || ""),
                negozio: String(r.negozio || ""),
                cluster: r.cluster_mobile || null,
                multibrand: String(r.cod_gara || "").startsWith("MB-"),
                token: String(r.negozio || "").split("+").map(norm).filter(Boolean),
                soglie: {
                    ...(Array.isArray(r.soglie_mobile) && r.soglie_mobile.length ? { mobile: r.soglie_mobile.map(Number) } : {}),
                    ...(Array.isArray(r.soglie_fisso) && r.soglie_fisso.length ? { fisso: r.soglie_fisso.map(Number) } : {}),
                    ...(Array.isArray(r.soglie_piva) && r.soglie_piva.length ? { business_piva: r.soglie_piva.map(Number) } : {}),
                    ...(prTarget > 0 ? { cb: [Math.ceil(prTarget * 0.8), prTarget] } : {}),
                    // W3 Protetti: ALMENO UNO per non prendere il malus
                    protetti: [1],
                },
                piste: {}, targets: {}, tiersScelti: {},
            };
        });
    } else if (brand === "vodafone") {
        // le DUE realtà della lettera A: Vodafone Store (codici T1) e VND
        const [t, ctx] = await Promise.all([
            caricaTabellareAzienda("vodafone", monthISO).then((x) => x ?? caricaTabellare("vodafone", monthISO)),
            caricaContrattiContesto("vodafone", monthISO, "Vodafone"),
        ]);
        tab = t; contratti = ctx.contratti;
        const rete = scaleDiRete(tab);
        codici = [
            { cod_gara: "VS", negozio: "Vodafone Store (T1)", cluster: "lettera A", token: [...CTX_CODICI_T1].map(norm), soglie: rete, piste: {}, targets: {}, tiersScelti: {} },
            { cod_gara: "VND", negozio: "VND (multibrand)", cluster: "lettera A", token: [], catchAll: true, soglie: rete, piste: {}, targets: {}, tiersScelti: {} },
        ];
    } else if (brand === "fastweb") {
        const [t, ctx] = await Promise.all([
            caricaTabellareAzienda("fastweb", monthISO).then((x) => x ?? caricaTabellare("fastweb", monthISO)),
            caricaContrattiContesto("fastweb", monthISO, "Fastweb"),
        ]);
        tab = t; contratti = ctx.contratti;
        codici = [{ cod_gara: "T2", negozio: "Lettera Fastweb (T2)", cluster: null, token: [], catchAll: true, soglie: scaleDiRete(tab), piste: {}, targets: {}, tiersScelti: {} }];
    } else {
        const [t, ctr] = await Promise.all([
            caricaTabellareAzienda("sky", monthISO).then((x) => x ?? caricaTabellare("sky", monthISO)),
            caricaContrattiMese("Sky", monthISO),
        ]);
        tab = t; contratti = ctr;
        codici = [{ cod_gara: "SKY", negozio: "Sky", cluster: null, token: [], catchAll: true, soglie: scaleDiRete(tab), piste: {}, targets: {}, tiersScelti: {} }];
    }

    (tgtRes.data || []).forEach((t) => {
        const k = codici.find((x) => x.cod_gara === t.cod_gara);
        if (k) {
            k.targets[String(t.pista)] = Number(t.target) || 0;
            k.tiersScelti[String(t.pista)] = t.tier != null ? Number(t.tier) : null;
        }
    });
    const sfridi: Record<string, number> = {};
    (sfrRes.data || []).forEach((s) => { sfridi[String(s.pista)] = Number(s.pct) || 0; });

    let nonAllocati = 0;
    if (tab) {
        for (const c of contratti) {
            if (!produzioneValidaGare(c)) continue;
            const k0 = codiceDi(c, codici);
            const set = matchRigheAttivazione(tab.righe, c, brandIdDaLabel(c.brand));
            if (!set.length) continue;
            const pista = String(set[0].pista || "");
            if (!pista) continue;
            // W3: il PALETTO BUSINESS = attivazioni P.IVA della pista MOBILE
            // (LA definizione del malus30Mobile del motore/Calcolatore —
            // revisore 26/08: contare i business di qualsiasi pista dava
            // falsi verdi su una penale del 30%)
            if (brand === "windtre" && k0 && pista === "mobile" && /business/i.test(String(c.tipo_cliente || ""))) {
                k0.businessPezzi = (k0.businessPezzi || 0) + 1;
            }
            const punti = puntiPerRighe(set);
            const k = k0;
            if (!k) { nonAllocati++; continue; }
            const p = k.piste[pista] || (k.piste[pista] = { punti: 0, pezzi: 0 });
            p.punti = Math.round((p.punti + punti) * 100) / 100;
            p.pezzi++;
            // W3: la CUSTOMER BASE «va a punti» (Luca 26/08 sera-3) — i punti
            // sono quelli della gara parallela Partnership sugli stessi eventi
            if (brand === "windtre") {
                const pp = matchRigheGaraParallela(tab.righe, c, "partnership");
                if (pp.length) k.cbPunti = Math.round(((k.cbPunti || 0) + puntiPerRighe(pp)) * 100) / 100;
            }
        }
    }
    const politiche: Record<string, PoliticaPista> = {};
    (polRes.data || []).forEach((r) => { politiche[String(r.pista)] = { modo: String(r.modo || "proprio"), dati: (r.dati as Record<string, unknown>) || null }; });
    const glv = glRes ? { totali: Number(glRes.totali) || 0, trascorsi: Number(glRes.trascorsi) || 0, mostraProiezione: (glRes as { mostraProiezione?: boolean }).mostraProiezione } : null;
    const pisteTab = (tab?.piste || []).map((p) => ({ chiave: p.chiave, nome: p.nome, um: p.um }));
    const kpiCodice = brand === "windtre"
        ? W3_KPI_CODICE.filter((k) => pisteTab.some((p) => p.chiave === k))
        : pisteTab.map((p) => p.chiave);
    // gruppo = tutto il resto (non parallelo, non per-codice) che abbia una
    // CORSA — le piste senza soglie (es. «Telefoni & device», vive in
    // pay_piste dal seed lettera per il conteggio TNP) sono dismesse: il
    // Master le nasconde con la stessa regola («via la barra senza corsa»)
    // e qui non sono un target (Luca 26/08 notte-6: «non esiste, toglilo»)
    const conCorsa = new Set((tab?.soglie || []).map((s) => s.pista));
    const pisteGruppo = brand === "windtre"
        ? pisteTab.filter((p) => !W3_KPI_CODICE.includes(p.chiave) && !PARALLELE_DIR.has(p.chiave) && conCorsa.has(p.chiave)).map((p) => p.chiave)
        : [];
    return {
        brand, monthISO, codici, nonAllocati,
        pisteTab, tab, sfridi, gl: glv,
        kpiCodice, pisteGruppo, politiche,
        palettoBusiness: Number(regoleLettera["paletto_piva_mobile"]) || W3_PALETTO_BUSINESS,
    };
}

/** Finestra del «bilancia» (Luca 26/08 notte-8): vale FINO ALLA DATA scelta
 *  dalla direzione col calendario (dati.fino); senza data (o scaduta) la
 *  scelta vale per il giorno corrente e domani si ricalcola. */
const ymdOggi = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export function finestraBilancia(fino?: string | null): { label: string } {
    if (fino && fino >= ymdOggi()) return { label: `fino al ${fino.slice(8, 10)}/${fino.slice(5, 7)}` };
    return { label: "solo per oggi" };
}

/** Il codice consigliato dal «bilancia»: il FRANCHISING più scarico, scelto
 *  una volta e PERSISTITO in direzione_politiche.dati {fino, scelto} —
 *  stabile fino alla data del calendario (o fino a fine giornata se la
 *  direzione non ha dato una data). */
export async function codiceBilancia(dir: Direzione, pista: string): Promise<{ codice: CodiceDir; fino: string } | null> {
    const franchising = dir.codici.filter((k) => !k.multibrand && !k.catchAll);
    if (!franchising.length) return null;
    const pol = dir.politiche[pista];
    const dati = (pol?.dati || {}) as { fino?: string; scelto?: string };
    const oggi = ymdOggi();
    if (dati.scelto && dati.fino && dati.fino >= oggi) {
        const k = franchising.find((x) => x.cod_gara === dati.scelto);
        if (k) return { codice: k, fino: dati.fino };
    }
    // scelta nuova: il più scarico ADESSO; vale fino alla data della
    // direzione se ancora valida, altrimenti solo per oggi
    const scelto = [...franchising].sort((a, b) => (a.piste[pista]?.punti || 0) - (b.piste[pista]?.punti || 0))[0];
    const fino = dati.fino && dati.fino >= oggi ? dati.fino : oggi;
    await supabase.from("direzione_politiche")
        .update({ dati: { ...dati, fino, scelto: scelto.cod_gara }, updated_at: new Date().toISOString() })
        .eq("brand", dir.brand).eq("month", dir.monthISO).eq("pista", pista)
        .then(() => null, () => null);
    return { codice: scelto, fino };
}

/** Il codice ASSOCIATO di un multibrand per le categorie libere (mappa
 *  in politiche['__associati__'].dati {cod_mb: cod_franchising}). */
export function codiceAssociato(dir: Direzione, codMb: string): CodiceDir | null {
    const mappa = (dir.politiche["__associati__"]?.dati || {}) as Record<string, string>;
    const cod = mappa[codMb];
    return cod ? dir.codici.find((k) => k.cod_gara === cod) || null : null;
}

/** Target dalla soglia con lo SFRIDO della pista: intero, per ECCESSO
 *  («un extra che copre l'errore» — mai frazioni, mai ritocchi a mano).
 *  ARITMETICA INTERA (revisore 26/08): Math.ceil(370*1.10) dava 408 invece
 *  di 407 — il floating point gonfiava di +1 i prodotti esatti. */
export function targetConSfrido(soglia: number, pct: number): number {
    const n = Math.round(Number(soglia)) * (100 + Math.round(Number(pct) || 0));
    return Math.floor(n / 100) + (n % 100 > 0 ? 1 : 0);
}

/** Proiezione a fine mese sul ritmo dei giorni lavorativi (interi).
 *  Gated da gl.mostraProiezione come l'Analisi (revisore 26/08). */
export function proiezioneDir(dir: Direzione, punti: number): number | null {
    const gl = dir.gl;
    if (!gl || !gl.mostraProiezione || !gl.trascorsi || gl.trascorsi <= 0 || !gl.totali || punti <= 0) return null;
    return Math.max(Math.round(punti), Math.round((punti / gl.trascorsi) * gl.totali));
}

/* ═══ QUANTO VALE QUELLO CHE STO INSERENDO ═══════════════════════════════
   Mobile, fisso e Customer Base di W3 non vanno a pezzi ma a PUNTI, e i
   punti cambiano con quello che c'è dentro l'attivazione (Luca 28/08). Il
   widget deve poterlo chiedere e sommarlo: le voci sono le righe del
   tabellare azienda, e i punti si sommano esattamente come fa il motore
   (`puntiPerRighe` è una somma di `punti`; i moltiplicatori riguardano gli
   euro, non i punti). La Customer Base pesca dalla pista PARTNERSHIP, che
   è dove stanno i suoi punti veri. */
export type VocePunti = { id: string; nome: string; punti: number; base: boolean; gruppo?: string };

/* CONSUMER O BUSINESS (Luca 28/08): «mi ha messo le opzioni microbusiness
   anche dopo che ho selezionato consumer», e lo stesso sul fisso. Il campo
   `tipo_cliente` delle righe W3 è quasi sempre vuoto, quindi non basta: il
   business si riconosce dal NOME della voce — P.IVA, Microbusiness e, in
   casa WindTre, tutta la linea «Professional». */
const PAROLE_BIZ = /(business|p\.?\s?iva|micro|professional)/i;

/* Le due parole che identificano una voce, troncate: serve a riconoscere che
   «Telefono finanziato · GA» e «Telefono in finanziamento» sono la stessa
   cosa. Fuori le paroline di servizio e le sigle corte. */
const STOP = new Set(["in", "di", "il", "la", "lo", "e", "ed", "con", "su", "per", "da", "del", "della", "al", "alla", "un", "una", "a", "ga", "gnp", "cb", "vs"]);
function chiaveVoce(nome: string): string {
    // via QUALSIASI parentesi: «Telefono finanziato · GA (+1,25 in soglia)» e
    // «Telefono in finanziamento» sono la stessa voce, e la parentesi bastava
    // a farle sembrare diverse
    return nome.replace(/\([^)]*\)/g, " ").toLowerCase()
        .replace(/[^a-zàèéìòù0-9\s]/g, " ")
        .split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w))
        // QUATTRO parole, non due: con due, «Cambio offerta MIA Easy Pay» e
        // «Cambio offerta Mobile Microbusiness» — stesso valore, 4 punti —
        // finivano fuse in una sola voce, e sul business spariva la prima
        // TRE parole: con due «Cambio offerta MIA Easy Pay» e «Cambio offerta
        // Mobile Microbusiness» (stesso valore) si fondevano; con quattro
        // tornava il doppione del telefono finanziato
        .map((w) => w.slice(0, 6)).slice(0, 3).join("|");
}
function vaCol(nome: string, tipoRiga: string | null | undefined, tc: string): boolean {
    if (!tc) return true;
    const t = String(tipoRiga || "").toLowerCase();
    if (t) return t.startsWith(tc);            // la riga lo dichiara: comanda lei
    return tc === "business" ? true : !PAROLE_BIZ.test(nome);
}
export function vociPunti(dir: Direzione, pista: string, tipoCliente?: "consumer" | "business" | ""): VocePunti[] {
    if (dir.brand !== "windtre") return [];
    const pistaRighe = pista === "cb" ? "partnership" : pista;
    if (!["mobile", "fisso", "partnership"].includes(pistaRighe)) return [];
    const tc = (tipoCliente || "").toLowerCase();
    const righe = (dir.tab?.righe || [])
        .filter((r) => String(r.pista || "") === pistaRighe && r.attivo !== false && Number(r.punti || 0) > 0);
    const viste = new Map<string, number>();
    const out: VocePunti[] = [];
    for (const r of righe) {
        const base = String(r.componente || "") === "base";
        // nome corto: via il «+ » iniziale, il «×canone» e le parentesi lunghe
        const nome = String(r.nome || "voce")
            .replace(/^\+\s*/, "").replace(/\s*×canone\s*/i, "")
            .replace(/\s*\((?:incl\.|conteggio)[^)]*\)/gi, "").trim();
        /* LA BASE NON SI SCEGLIE (Luca 28/08): «togli GA base e dalla per
           scontata, tanto meno di 0,75 non c'è niente — loro selezionano solo
           le opzioni che accrescono il valore». Restava anche il rischio di
           sommare due basi (GA base + GA base Underground = 1,5 punti, che
           non esiste). Il suo valore entra comunque nel conto, da solo. */
        // ⚠️ TUTTE le basi, non solo quella principale: «GA base Underground»
        //    è componente `base_underground` e restava in lista, sommabile
        //    alla base vera (Luca 28/08)
        if (base || /^base/.test(String(r.componente || ""))) continue;
        if (!vaCol(nome, r.tipo_cliente, tc)) continue;
        /* DOPPIONI (Luca 28/08: «telefono finanziato è doppione»). Il
           tabellare ha più righe per la stessa cosa — «Telefono finanziato ·
           GA» e «Telefono in finanziamento», tutte e due 1,25 — perché al
           motore servono ancore diverse. A chi carica serve UNA voce. La
           chiave è il valore più le prime due parole che contano, troncate:
           così «finanziato» e «finanziamento» si riconoscono uguali. */
        const chiave = `${r.punti}|${chiaveVoce(nome)}`;
        const gia = viste.get(chiave);
        if (gia !== undefined) {
            if (nome.length < out[gia].nome.length) out[gia] = { ...out[gia], nome };  // vince il nome più corto
            continue;
        }
        viste.set(chiave, out.length);
        /* DUE SCAFFALI SULLA CUSTOMER BASE (Luca 28/08): «differenziamo i
           cambi piano dai telefoni, altrimenti è una sbrodolata di opzioni
           che nessuno seleziona». */
        const gruppo = pistaRighe !== "partnership" ? undefined
            : /telefono|device|rate|finanziam/i.test(`${r.nome} ${r.prodotto || ""}`) ? "📱 Telefono"
                : "🔄 Cambio piano e add-on";
        out.push({ id: String(r.id), nome, punti: Number(r.punti || 0), base, gruppo });
    }
    // dalla più pesante: quello che vale di più si vede per primo
    return out.sort((a, b) => (b.punti - a.punti) || a.nome.localeCompare(b.nome, "it"));
}

/** I punti che l'attivazione vale COMUNQUE, senza scegliere niente: la riga
 *  base della pista (0,75 sul mobile W3, 1 sul fisso). Zero dove una base non
 *  esiste — la Customer Base, dove ogni voce è un evento a sé. */
export function puntiBase(dir: Direzione, pista: string): number {
    if (dir.brand !== "windtre") return 0;
    const pistaRighe = pista === "cb" ? "partnership" : pista;
    const b = (dir.tab?.righe || []).find((r) => String(r.pista || "") === pistaRighe
        && r.attivo !== false && String(r.componente || "") === "base" && Number(r.punti || 0) > 0);
    return Number(b?.punti || 0);
}

export type Strategia = "vicino" | "scoperto";
/** Le PRIORITÀ esplicite di un KPI (Luca 27/08-6): l'ordine dei codici che
 *  la direzione vuole servire PRIMA — vincono su strategia e spareggi
 *  finché non chiudono il loro target. In politiche[pista].dati.priorita. */
export function prioritaDi(dir: Direzione, pista: string): string[] {
    const arr = (dir.politiche[pista]?.dati as { priorita?: unknown } | null)?.priorita;
    return Array.isArray(arr) ? arr.map(String) : [];
}
/** La strategia di riempimento di un KPI (Luca 27/08-5, impostabile nel
 *  pannello): 'vicino' = si CHIUDE prima il codice più vicino al target
 *  (default — Libia a 5/6 prima di Collatina a 0/6); 'scoperto' = si
 *  riempie il più lontano (livella). */
export function strategiaDi(dir: Direzione, pista: string): Strategia {
    return dir.politiche[pista]?.modo === "scoperto" ? "scoperto" : "vicino";
}

/** Consigli per una pista: i codici sotto target ordinati per STRATEGIA
 *  (vicino/scoperto), col negozio di chi chiede come spareggio; i
 *  completati in coda. Solo codici con un target. */
// «è il negozio in cui lavoro?» — stesso match dei token dell'allocazione
export function èMioCodice(k: { token: string[] }, negozio?: string | null): boolean {
    const nu = norm(negozio);
    return !!nu && k.token.some((t) => nu.startsWith(t) || t.startsWith(nu));
}

export function consigliaCodici(dir: Direzione, pista: string, negozioUtente?: string | null, strategia: Strategia = "vicino", punti = 0) {
    const prio = prioritaDi(dir, pista);
    const rankDi = (cod: string, mancano: number) => {
        const i = prio.indexOf(cod);
        return i >= 0 && mancano > 0 ? i : Infinity;   // prioritario finché non chiude
    };
    // la CB W3 «va a punti»: i fatti sono i punti PARTNERSHIP, non la
    // pista a pezzi (bug visto da Luca in prova: barre a zero)
    const cbW3 = dir.brand === "windtre" && pista === "cb";
    /* LE DUE PRIORITÀ ZERO (Luca 28/08). Prima c'era un solo scalino — la
       S1 nuda — e subito dopo si passava al target, che su un altro codice
       può essere la S2. Sbagliato: «Mazzini deve raggiungere lo sfrido della
       soglia 1, che è più importante della soglia 2 di Collatina».
         ⓪   tutte le S1 NUDE (per la CB: l'80% del target Partnership)
         ⓪·1 tutti gli SFRIDI delle S1 (per la CB: il 100%)
         ①…  da qui in poi priorità della direzione e strategia, come prima.
       Solo W3: le scale Vodafone sono di RETE duplicate sui canali, lì una
       «S1 per codice» non esiste (revisore 27/08). */
    const faseT1 = dir.brand === "windtre" && (pista === "mobile" || pista === "fisso" || cbW3);
    return dir.codici
        .filter((k) => (k.targets[pista] || 0) > 0)
        .map((k) => {
            const fatti = cbW3 ? (k.cbPunti || 0) : (k.piste[pista]?.punti || 0);
            const target = k.targets[pista] || 0;
            const s1 = faseT1 ? Number((k.soglie[pista] || [])[0]) || 0 : 0;
            const mancanoS1 = s1 > 0 ? Math.max(0, Math.round((s1 - fatti) * 100) / 100) : 0;
            // ⓪·1 — lo scalino dello SFRIDO. Sulla CB il «100%» è già la
            // seconda soglia (le sue soglie sono 80% e 100% del target
            // Partnership); sulle altre piste si applica lo sfrido di pista.
            const s1Sfr = !faseT1 || !s1 ? 0
                : cbW3 ? (Number((k.soglie[pista] || [])[1]) || targetConSfrido(s1, dir.sfridi[pista] || 0))
                    : targetConSfrido(s1, dir.sfridi[pista] || 0);
            const mancanoS1Sfr = s1Sfr > 0 ? Math.max(0, Math.round((s1Sfr - fatti) * 100) / 100) : 0;
            return {
                ...k, fatti, target,
                mancano: Math.max(0, Math.round((target - fatti) * 100) / 100),
                mio: èMioCodice(k, negozioUtente),
                s1, mancanoS1, sottoS1: mancanoS1 > 0,
                s1Sfr, mancanoS1Sfr, sottoS1Sfr: mancanoS1 <= 0 && mancanoS1Sfr > 0,
            };
        })
        .sort((a, b) => {
            const aFatto = a.mancano <= 0, bFatto = b.mancano <= 0;
            if (aFatto !== bFatto) return aFatto ? 1 : -1;              // i completati in coda
            // ⓪ FASE T1: chi è sotto la S1 nuda passa davanti a tutto;
            //    dentro la fase: il MIO negozio, poi le priorità del capo,
            //    poi la S1 più vicina a chiudersi
            /* UN'ATTIVAZIONE NON SI SPACCHETTA (Luca 28/08): «se ho quattro
               punti fissi, a Libia ne mancano due e a Mazzini tre e mezzo, ha
               molto più senso caricarlo su Mazzini». Dentro la fase, chi si
               CHIUDE con questa attivazione passa avanti, e fra quelli si
               prende il traguardo più alto: è quello che spreca meno punti
               oltre la soglia. Senza punti dichiarati vale l'ordine di prima. */
            const chiude = (m: number) => punti > 0 && m > 0 && m <= punti;
            if (a.sottoS1 !== b.sottoS1) return a.sottoS1 ? -1 : 1;
            if (a.sottoS1 && b.sottoS1) {
                if (a.mio !== b.mio) return a.mio ? -1 : 1;
                const pr1 = rankDi(a.cod_gara, a.mancanoS1) - rankDi(b.cod_gara, b.mancanoS1);
                if (pr1) return pr1;
                const ca = chiude(a.mancanoS1), cb2 = chiude(b.mancanoS1);
                if (ca !== cb2) return ca ? -1 : 1;
                if (ca && cb2) return b.mancanoS1 - a.mancanoS1;   // il più alto fra quelli che si chiudono
                const d1 = a.mancanoS1 - b.mancanoS1;
                if (d1) return d1;
            }
            // ⓪·1 gli SFRIDI delle S1: vengono prima di qualunque target più
            //     alto (la S2 di un altro codice non vale lo sfrido di questo)
            if (a.sottoS1Sfr !== b.sottoS1Sfr) return a.sottoS1Sfr ? -1 : 1;
            if (a.sottoS1Sfr && b.sottoS1Sfr) {
                if (a.mio !== b.mio) return a.mio ? -1 : 1;
                const pr2 = rankDi(a.cod_gara, a.mancanoS1Sfr) - rankDi(b.cod_gara, b.mancanoS1Sfr);
                if (pr2) return pr2;
                const ca2 = chiude(a.mancanoS1Sfr), cb3 = chiude(b.mancanoS1Sfr);
                if (ca2 !== cb3) return ca2 ? -1 : 1;
                if (ca2 && cb3) return b.mancanoS1Sfr - a.mancanoS1Sfr;
                const d2 = a.mancanoS1Sfr - b.mancanoS1Sfr;
                if (d2) return d2;
            }
            const pr = rankDi(a.cod_gara, a.mancano) - rankDi(b.cod_gara, b.mancano);
            if (pr) return pr;                                          // ① priorità esplicite
            // ② col «riempi il più scoperto» il negozio del RICHIEDENTE vince
            //    finché ha capienza (Luca 27/08; i completati sono già in coda);
            //    col «chiudi il più vicino» la strategia SCAVALCA il negozio
            if (strategia === "scoperto" && a.mio !== b.mio) return a.mio ? -1 : 1;
            const diff = strategia === "vicino" ? (a.mancano - b.mancano) : (b.mancano - a.mancano);
            return diff || (Number(b.mio) - Number(a.mio));             // ③ strategia ④ negozio
        });
}
