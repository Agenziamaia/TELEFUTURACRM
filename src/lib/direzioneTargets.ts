// DIREZIONE INSERIMENTO v2 — lib condivisa (pannello Gare + widget Home).
// REGOLA DEL PONTE: i punti escono SOLO dal motore (matchRigheAttivazione +
// puntiPerRighe sul tabellare AZIENDA — i punti gara W3 sono unici) e la
// produzione si alloca per CODICE DI INSERIMENTO (dettagli Cod.Ins., come il
// Calcolatore vista azienda), MAI per negozio che registra: la direzione
// ragiona per codice.
import { supabase } from "@/lib/supabaseClient";
import {
    caricaContrattiMese, caricaTabellareAzienda, matchRigheAttivazione,
    puntiPerRighe, produzioneValidaGare, brandIdDaLabel,
    type ContrattoPay, type Tabellare,
} from "@/lib/commissioning";

const norm = (s: unknown) => String(s || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");

export type PistaAvz = { punti: number; pezzi: number };
export type CodiceDir = {
    cod_gara: string;
    negozio: string;                      // nome della lettera (può essere aggregato: "Promontori + Garbatella")
    cluster: string | null;
    token: string[];                      // prefissi normalizzati per l'allocazione del Cod.Ins.
    soglie: Record<string, number[]>;     // pista → scala del CODICE (da pay_target_pdv, dove esiste)
    piste: Record<string, PistaAvz>;      // pista → avanzamento LIVE del codice
    targets: Record<string, number>;      // pista → target della direzione
};
export type Direzione = {
    monthISO: string;
    codici: CodiceDir[];
    nonAllocati: number;                  // vendite valide senza codice riconducibile
    pisteTab: { chiave: string; nome: string; um: string }[];   // dal tabellare, in ordine
    tab: Tabellare | null;
};

/** Il codice di un contratto: il Cod.Ins. inizia col nome del punto vendita
 *  della lettera; gli aggregati multibrand ("Promontori + Garbatella")
 *  matchano su CIASCUN nome. Vale anche il verso corto («Donna» →
 *  «Donna Olimpia», visto nei dati di agosto: 4 vendite) ma SOLO se il
 *  prefisso è di almeno 4 caratteri e identifica UN codice solo. */
function codiceDi(c: ContrattoPay, codici: CodiceDir[]): CodiceDir | null {
    const ci = norm((c as { cod_ins?: string | null }).cod_ins);
    if (!ci) return null;
    for (const k of codici) if (k.token.some((t) => t && ci.startsWith(t))) return k;
    if (ci.length >= 4) {
        const corti = codici.filter((k) => k.token.some((t) => t.startsWith(ci)));
        if (corti.length === 1) return corti[0];
    }
    return null;
}

export async function caricaDirezione(monthISO: string): Promise<Direzione> {
    const [pdvRes, tgtRes, tab, contratti] = await Promise.all([
        supabase.from("pay_target_pdv")
            .select("cod_gara, negozio, cluster_mobile, soglie_mobile, soglie_fisso, soglie_piva")
            .eq("brand", "windtre").eq("month", monthISO).order("negozio"),
        supabase.from("direzione_targets").select("cod_gara, pista, target")
            .eq("brand", "windtre").eq("month", monthISO),
        caricaTabellareAzienda("windtre", monthISO),
        caricaContrattiMese("WindTre", monthISO),
    ]);
    const codici: CodiceDir[] = (pdvRes.data || []).map((r) => ({
        cod_gara: String(r.cod_gara || ""),
        negozio: String(r.negozio || ""),
        cluster: r.cluster_mobile || null,
        token: String(r.negozio || "").split("+").map(norm).filter(Boolean),
        soglie: {
            ...(Array.isArray(r.soglie_mobile) && r.soglie_mobile.length ? { mobile: r.soglie_mobile.map(Number) } : {}),
            ...(Array.isArray(r.soglie_fisso) && r.soglie_fisso.length ? { fisso: r.soglie_fisso.map(Number) } : {}),
            ...(Array.isArray(r.soglie_piva) && r.soglie_piva.length ? { business_piva: r.soglie_piva.map(Number) } : {}),
        },
        piste: {},
        targets: {},
    }));
    (tgtRes.data || []).forEach((t) => {
        const k = codici.find((x) => x.cod_gara === t.cod_gara);
        if (k) k.targets[String(t.pista)] = Number(t.target) || 0;
    });
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
    return {
        monthISO,
        codici,
        nonAllocati,
        pisteTab: (tab?.piste || []).map((p) => ({ chiave: p.chiave, nome: p.nome, um: p.um })),
        tab,
    };
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
