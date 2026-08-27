// COPERTURE NEGOZI (Luca 27/08) — la logica condivisa tra la sezione Turni
// e il widget dell'amministrazione: presenze AUTOMATICHE dagli assegnati,
// sedi multi-punto fuse in un calderone unico, ferie/malattie che tolgono
// dal turno, e la verifica «scoperto/coperto» per giorno.
import { supabase } from "@/lib/supabaseClient";

/** SEDE FISICA: i negozi che condividono la prima parola del nome (Acilia
 *  Multi + Acilia VS, Collatina Multi + Collatina W3, Magliana Multi +
 *  Magliana W3) sono la stessa porta: squadra unica, orari separati.
 *  Il raggruppamento scatta SOLO se la prima parola è condivisa da ≥2
 *  negozi: «San Paolo» resta «San Paolo». */
export function gruppaSedi<T extends { name: string }>(negozi: T[]): { sede: string; negozi: T[] }[] {
    const perParola = new Map<string, T[]>();
    negozi.forEach((n) => {
        const p = String(n.name || "").trim().split(/\s+/)[0] || n.name;
        const arr = perParola.get(p) || [];
        arr.push(n);
        perParola.set(p, arr);
    });
    const out: { sede: string; negozi: T[] }[] = [];
    const visti = new Set<string>();
    negozi.forEach((n) => {
        const p = String(n.name || "").trim().split(/\s+/)[0] || n.name;
        if (visti.has(p)) return;
        visti.add(p);
        const gruppo = perParola.get(p) || [n];
        out.push(gruppo.length >= 2 ? { sede: p, negozi: gruppo } : { sede: n.name, negozi: [n] });
    });
    return out;
}

/** La sede di un negozio, coerente con gruppaSedi (serve a mappare le
 *  assenze — che arrivano col nome del negozio — sulla riga fusa). */
export function sedeDiStore(store: string, sedi: { sede: string; negozi: { name: string }[] }[]): string {
    const hit = sedi.find((s) => s.negozi.some((n) => n.name === store));
    return hit ? hit.sede : store;
}

export type AssenzaGiorno = { persona: string; store: string | null; tipo: "ferie" | "malattia" };

/** Ferie APPROVATE e malattie che coprono il giorno (yyyy-mm-dd).
 *  Una malattia senza date_to è ancora aperta: copre fino a oggi. */
export async function assenzeDelGiorno(ymd: string): Promise<AssenzaGiorno[]> {
    const [fer, mal] = await Promise.all([
        supabase.from("vacation_requests").select("employee_name, store, date_from, date_to, status")
            .eq("status", "approved").lte("date_from", ymd).gte("date_to", ymd),
        supabase.from("sickness_absences").select("employee_name, store, date_from, date_to")
            .lte("date_from", ymd),
    ]);
    const out: AssenzaGiorno[] = [];
    (fer.data || []).forEach((r) => out.push({ persona: String(r.employee_name || ""), store: r.store, tipo: "ferie" }));
    (mal.data || []).forEach((r) => {
        if (r.date_to && String(r.date_to) < ymd) return;   // chiusa prima del giorno
        out.push({ persona: String(r.employee_name || ""), store: r.store, tipo: "malattia" });
    });
    return out.filter((a) => a.persona);
}

export type SedeScoperta = { sede: string; data: string; assenti: AssenzaGiorno[] };

/** La verifica del widget (Sandra): per ogni giorno della finestra, le SEDI
 *  con almeno un'assenza che NON hanno né una copertura a turno (una riga
 *  turni_negozio non-esclusione su un negozio della sede) né il flag
 *  «coperto così» (coperture_ok). I festivi e le domeniche non contano. */
export async function sediScoperte(giorni: string[]): Promise<SedeScoperta[]> {
    if (!giorni.length) return [];
    const [st, fest] = await Promise.all([
        supabase.from("stores").select("name, is_ufficio").order("name"),
        supabase.from("giorni_festivi").select("giorno"),
    ]);
    const festivi = new Set((fest.data || []).map((f) => String(f.giorno)));
    const sedi = gruppaSedi(((st.data || []) as { name: string; is_ufficio?: boolean | null }[]).filter((n) => !n.is_ufficio));
    const da = [...giorni].sort()[0];
    const a = [...giorni].sort().slice(-1)[0];
    const [turniR, okR, ferR, malR] = await Promise.all([
        supabase.from("turni_negozio").select("store, data, tipo").gte("data", da).lte("data", a),
        supabase.from("coperture_ok").select("store, data").gte("data", da).lte("data", a),
        supabase.from("vacation_requests").select("employee_name, store, date_from, date_to")
            .eq("status", "approved").lte("date_from", a).gte("date_to", da),
        supabase.from("sickness_absences").select("employee_name, store, date_from, date_to").lte("date_from", a),
    ]);
    const out: SedeScoperta[] = [];
    for (const ymd of giorni) {
        if (festivi.has(ymd)) continue;
        if (new Date(ymd + "T12:00").getDay() === 0) continue;   // domenica
        const assenze: AssenzaGiorno[] = [];
        (ferR.data || []).forEach((r) => {
            if (String(r.date_from) <= ymd && String(r.date_to) >= ymd && r.employee_name) assenze.push({ persona: r.employee_name, store: r.store, tipo: "ferie" });
        });
        (malR.data || []).forEach((r) => {
            if (String(r.date_from) <= ymd && (!r.date_to || String(r.date_to) >= ymd) && r.employee_name) assenze.push({ persona: r.employee_name, store: r.store, tipo: "malattia" });
        });
        if (!assenze.length) continue;
        const perSede = new Map<string, AssenzaGiorno[]>();
        assenze.forEach((asn) => {
            if (!asn.store) return;   // senza negozio non c'è vetrina da coprire
            const sede = sedeDiStore(asn.store, sedi);
            const arr = perSede.get(sede) || [];
            arr.push(asn);
            perSede.set(sede, arr);
        });
        for (const [sede, assenti] of perSede) {
            const gruppo = sedi.find((s) => s.sede === sede)?.negozi.map((n) => n.name) || [sede];
            const coperta = (turniR.data || []).some((t) => t.data === ymd && t.tipo !== "escluso" && gruppo.includes(String(t.store)))
                || (okR.data || []).some((o) => o.data === ymd && (gruppo.includes(String(o.store)) || o.store === sede));
            if (!coperta) out.push({ sede, data: ymd, assenti });
        }
    }
    return out;
}
