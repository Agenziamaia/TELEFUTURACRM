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
    caricaTabellare, matchRigheAttivazione, puntiPerRighe, produzioneValidaGare,
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
    soglie: Record<string, number[]>;     // pista → scala (per-codice W3, di rete altrove)
    piste: Record<string, PistaAvz>;      // pista → avanzamento LIVE del codice
    targets: Record<string, number>;      // pista → target della direzione
};
export type Direzione = {
    brand: DirBrandId;
    monthISO: string;
    codici: CodiceDir[];
    nonAllocati: number;                  // vendite valide senza codice riconducibile
    pisteTab: { chiave: string; nome: string; um: string }[];   // dal tabellare, in ordine
    tab: Tabellare | null;
    sfridi: Record<string, number>;       // pista → % extra (interi)
    gl: { totali: number; trascorsi: number; mostraProiezione?: boolean } | null;
};

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
    const [tgtRes, sfrRes, glRes] = await Promise.all([
        supabase.from("direzione_targets").select("cod_gara, pista, target").eq("brand", brand).eq("month", monthISO),
        supabase.from("direzione_sfridi").select("pista, pct").eq("brand", brand).eq("month", monthISO),
        giorniLavorativiMese(monthISO).catch(() => null),
    ]);

    let codici: CodiceDir[] = [];
    let tab: Tabellare | null = null;
    let contratti: ContrattoPay[] = [];

    if (brand === "windtre") {
        const [pdvRes, t, ctr] = await Promise.all([
            supabase.from("pay_target_pdv")
                .select("cod_gara, negozio, cluster_mobile, soglie_mobile, soglie_fisso, soglie_piva")
                .eq("brand", "windtre").eq("month", monthISO).order("negozio"),
            caricaTabellareAzienda("windtre", monthISO),
            caricaContrattiMese("WindTre", monthISO),
        ]);
        tab = t; contratti = ctr;
        codici = (pdvRes.data || []).map((r) => ({
            cod_gara: String(r.cod_gara || ""),
            negozio: String(r.negozio || ""),
            cluster: r.cluster_mobile || null,
            token: String(r.negozio || "").split("+").map(norm).filter(Boolean),
            soglie: {
                ...(Array.isArray(r.soglie_mobile) && r.soglie_mobile.length ? { mobile: r.soglie_mobile.map(Number) } : {}),
                ...(Array.isArray(r.soglie_fisso) && r.soglie_fisso.length ? { fisso: r.soglie_fisso.map(Number) } : {}),
                ...(Array.isArray(r.soglie_piva) && r.soglie_piva.length ? { business_piva: r.soglie_piva.map(Number) } : {}),
            },
            piste: {}, targets: {},
        }));
    } else if (brand === "vodafone") {
        // le DUE realtà della lettera A: Vodafone Store (codici T1) e VND
        const [t, ctx] = await Promise.all([
            caricaTabellareAzienda("vodafone", monthISO).then((x) => x ?? caricaTabellare("vodafone", monthISO)),
            caricaContrattiContesto("vodafone", monthISO, "Vodafone"),
        ]);
        tab = t; contratti = ctx.contratti;
        const rete = scaleDiRete(tab);
        codici = [
            { cod_gara: "VS", negozio: "Vodafone Store (T1)", cluster: "lettera A", token: [...CTX_CODICI_T1].map(norm), soglie: rete, piste: {}, targets: {} },
            { cod_gara: "VND", negozio: "VND (multibrand)", cluster: "lettera A", token: [], catchAll: true, soglie: rete, piste: {}, targets: {} },
        ];
    } else if (brand === "fastweb") {
        const [t, ctx] = await Promise.all([
            caricaTabellareAzienda("fastweb", monthISO).then((x) => x ?? caricaTabellare("fastweb", monthISO)),
            caricaContrattiContesto("fastweb", monthISO, "Fastweb"),
        ]);
        tab = t; contratti = ctx.contratti;
        codici = [{ cod_gara: "T2", negozio: "Lettera Fastweb (T2)", cluster: null, token: [], catchAll: true, soglie: scaleDiRete(tab), piste: {}, targets: {} }];
    } else {
        const [t, ctr] = await Promise.all([
            caricaTabellareAzienda("sky", monthISO).then((x) => x ?? caricaTabellare("sky", monthISO)),
            caricaContrattiMese("Sky", monthISO),
        ]);
        tab = t; contratti = ctr;
        codici = [{ cod_gara: "SKY", negozio: "Sky", cluster: null, token: [], catchAll: true, soglie: scaleDiRete(tab), piste: {}, targets: {} }];
    }

    (tgtRes.data || []).forEach((t) => {
        const k = codici.find((x) => x.cod_gara === t.cod_gara);
        if (k) k.targets[String(t.pista)] = Number(t.target) || 0;
    });
    const sfridi: Record<string, number> = {};
    (sfrRes.data || []).forEach((s) => { sfridi[String(s.pista)] = Number(s.pct) || 0; });

    let nonAllocati = 0;
    if (tab) {
        for (const c of contratti) {
            if (!produzioneValidaGare(c)) continue;
            const set = matchRigheAttivazione(tab.righe, c, brandIdDaLabel(c.brand));
            if (!set.length) continue;
            const pista = String(set[0].pista || "");
            if (!pista) continue;
            const punti = puntiPerRighe(set);
            const k = codiceDi(c, codici);
            if (!k) { nonAllocati++; continue; }
            const p = k.piste[pista] || (k.piste[pista] = { punti: 0, pezzi: 0 });
            p.punti = Math.round((p.punti + punti) * 100) / 100;
            p.pezzi++;
        }
    }
    const glv = glRes ? { totali: Number(glRes.totali) || 0, trascorsi: Number(glRes.trascorsi) || 0, mostraProiezione: (glRes as { mostraProiezione?: boolean }).mostraProiezione } : null;
    return {
        brand, monthISO, codici, nonAllocati,
        pisteTab: (tab?.piste || []).map((p) => ({ chiave: p.chiave, nome: p.nome, um: p.um })),
        tab, sfridi, gl: glv,
    };
}

/** Target dalla soglia con lo SFRIDO della pista: intero, per ECCESSO
 *  («un extra che copre l'errore» — mai frazioni, mai ritocchi a mano). */
export function targetConSfrido(soglia: number, pct: number): number {
    return Math.ceil(Number(soglia) * (1 + (Number(pct) || 0) / 100));
}

/** Proiezione a fine mese sul ritmo dei giorni lavorativi (interi). */
export function proiezioneDir(dir: Direzione, punti: number): number | null {
    const gl = dir.gl;
    if (!gl || !gl.trascorsi || gl.trascorsi <= 0 || !gl.totali || punti <= 0) return null;
    return Math.max(Math.round(punti), Math.round((punti / gl.trascorsi) * gl.totali));
}

/** Consigli per una pista: i codici ordinati col favore al negozio di chi
 *  chiede (Luca: «se lavora a Magliana, priorità a Magliana»), poi dove
 *  manca DI PIÙ al target della direzione. Solo codici con un target. */
export function consigliaCodici(dir: Direzione, pista: string, negozioUtente?: string | null) {
    const nu = norm(negozioUtente);
    return dir.codici
        .filter((k) => (k.targets[pista] || 0) > 0)
        .map((k) => {
            const fatti = k.piste[pista]?.punti || 0;
            const target = k.targets[pista] || 0;
            return {
                ...k, fatti, target,
                mancano: Math.max(0, Math.round((target - fatti) * 100) / 100),
                mio: !!nu && k.token.some((t) => nu.startsWith(t) || t.startsWith(nu)),
            };
        })
        .sort((a, b) => (Number(b.mio) - Number(a.mio)) || (b.mancano - a.mancano));
}
