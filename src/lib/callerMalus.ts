"use client";

// MOTORE "DA LAVORARE / WARNING / MALUS" del call center (Luca 31/07) — stessa
// filosofia del tracking Dragon PDA e del laboratorio usati: ogni stato ha
// soglie in GIORNI LAVORATIVI (lun-sab) e un malus giornaliero; superata la
// soglia malus l'importo matura finche' la pratica non viene ri-esitata.
// Episodi persistenti in caller_malus: in_corso → attivo (alla sanatoria) →
// compensato (quando pagato nelle gare di commissioning). I compensati non
// vengono MAI toccati dalla sincronizzazione.
import { supabase } from "@/lib/supabaseClient";

export type RegolaCaller = {
    stato: string;
    giorni_lavorare: number | null;
    giorni_warning: number | null;
    giorni_malus: number | null;
    malus_giorno: number;
    esente: boolean;
};

export type FaseCaller = "ok" | "da_lavorare" | "warning" | "malus";

export async function caricaRegoleCaller(): Promise<Map<string, RegolaCaller>> {
    const m = new Map<string, RegolaCaller>();
    try {
        const { data, error } = await supabase.from("caller_regole").select("*");
        if (error) return m;   // mig. 119 non ancora applicata: nessuna regola
        (data ?? []).forEach((r: Record<string, unknown>) => m.set(String(r.stato), {
            stato: String(r.stato),
            giorni_lavorare: r.giorni_lavorare == null ? null : Number(r.giorni_lavorare),
            giorni_warning: r.giorni_warning == null ? null : Number(r.giorni_warning),
            giorni_malus: r.giorni_malus == null ? null : Number(r.giorni_malus),
            malus_giorno: Number(r.malus_giorno) || 0,
            esente: !!r.esente,
        }));
    } catch { /* rete assente */ }
    return m;
}

const ymdLoc = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const giornoYmd = ymdLoc;

/** Giorni OPERATIVI trascorsi DOPO il giorno `da` fino ad `a` compreso.
 *  Con `operativi` (i giorni in cui il caller ha BADGIATO) conta SOLO quelli:
 *  i caller non seguono lun-sab, il giorno vale se timbrato — anche un minuto
 *  (Luca 31/07). Senza set: fallback lun-sab. */
export function lavorativiDopo(da: Date, a: Date, operativi?: Set<string> | null): number {
    let n = 0;
    const cur = new Date(da.getFullYear(), da.getMonth(), da.getDate());
    const fine = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    while (cur < fine) {
        cur.setDate(cur.getDate() + 1);
        if (operativi ? operativi.has(ymdLoc(cur)) : cur.getDay() !== 0) n++;
    }
    return n;
}

/** Il giorno che cade `n` giorni operativi dopo `da`; null se col set badge
 *  quei giorni non sono ancora maturati (il malus non e' iniziato). */
export function aggiungiLavorativi(da: Date, n: number, operativi?: Set<string> | null): Date | null {
    const d = new Date(da.getFullYear(), da.getMonth(), da.getDate());
    let rest = n, guardia = 0;
    const oggi = new Date();
    while (rest > 0) {
        d.setDate(d.getDate() + 1);
        if (++guardia > 730) return null;
        if (operativi && d > oggi) return null;   // il futuro non e' mai badgiato
        if (operativi ? operativi.has(ymdLoc(d)) : d.getDay() !== 0) rest--;
    }
    return d;
}

/** Giorni in cui ogni collaboratore ha BADGIATO l'inizio turno (shifts):
 *  Map nome → insieme di giorni "YYYY-MM-DD". null = tabella non leggibile. */
export async function caricaGiorniBadge(finestraGiorni = 120): Promise<Map<string, Set<string>> | null> {
    try {
        const dal = new Date(); dal.setDate(dal.getDate() - finestraGiorni);
        const { data, error } = await supabase.from("shifts").select("employee_name, started_at").gte("started_at", dal.toISOString()).limit(20000);
        if (error) return null;
        const m = new Map<string, Set<string>>();
        ((data ?? []) as { employee_name: string | null; started_at: string | null }[]).forEach((r) => {
            if (!r.employee_name || !r.started_at) return;
            const d = new Date(r.started_at);
            if (isNaN(d.getTime())) return;
            const set = m.get(r.employee_name) || new Set<string>();
            set.add(ymdLoc(d));
            m.set(r.employee_name, set);
        });
        return m;
    } catch { return null; }
}

/** Riferimento dell'invecchiamento: l'ULTIMA attivita' sulla pratica (ultimo
 *  esito o assegnazione); per richiami e appuntamenti la pratica invecchia
 *  solo DOPO la data fissata (finche' il richiamo e' nel futuro non sei in
 *  ritardo). */
export function dataRiferimento(
    c: { data_chiamata?: string; data_richiamo?: string; data_appuntamento?: string; storico?: { data: string }[] },
    stato: string, gruppoRichiamo: readonly string[], gruppoApp: readonly string[],
): Date | null {
    const date: Date[] = [];
    (c.storico || []).forEach((s) => { const d = new Date(s.data); if (!isNaN(d.getTime())) date.push(d); });
    if (c.data_chiamata) { const d = new Date(c.data_chiamata); if (!isNaN(d.getTime())) date.push(d); }
    if (!date.length) return null;
    let rif = new Date(Math.max(...date.map((d) => d.getTime())));
    const dopo = (v?: string) => {
        if (!v) return;
        const d = new Date(v.length === 10 ? v + "T12:00" : v);
        if (!isNaN(d.getTime()) && d > rif) rif = d;
    };
    if (gruppoRichiamo.includes(stato)) dopo(c.data_richiamo);
    if (gruppoApp.includes(stato)) dopo(c.data_appuntamento);
    return rif;
}

export function faseDi(giorni: number, r: RegolaCaller): FaseCaller {
    if (r.esente) return "ok";
    if (r.giorni_malus != null && giorni >= r.giorni_malus) return "malus";
    if (r.giorni_warning != null && giorni >= r.giorni_warning) return "warning";
    if (r.giorni_lavorare != null && giorni >= r.giorni_lavorare) return "da_lavorare";
    return "ok";
}

export type EpisodioCaller = {
    id: number; call_id: string; stato_pratica: string | null; caller: string | null;
    dal: string; al: string | null; giorni: number; importo: number;
    stato: "in_corso" | "attivo" | "compensato";
    compensato_il: string | null; compensato_da: string | null;
};

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Allinea gli episodi alle pratiche: aggiorna gli in_corso, chiude (→ attivo)
 *  quelli delle pratiche sanate, apre i nuovi. Torna l'archivio aggiornato. */
export async function sincronizzaMalusCaller(
    pratiche: { id: string; stato: string; caller: string; fase: FaseCaller; giorniMalus: number; malusGiorno: number; dalMalus: Date | null }[],
): Promise<EpisodioCaller[]> {
    try {
        const { data, error } = await supabase.from("caller_malus").select("*").order("dal", { ascending: false });
        if (error) return [];   // mig. 119 non ancora applicata
        const episodi = (data ?? []) as EpisodioCaller[];
        const oggi = ymd(new Date());
        const inMalus = new Map(pratiche.filter((p) => p.fase === "malus" && p.dalMalus).map((p) => [p.id, p]));
        for (const ep of episodi) {
            if (ep.stato !== "in_corso") continue;
            const p = inMalus.get(ep.call_id);
            if (p && ymd(p.dalMalus!) === ep.dal) {
                const giorni = Math.max(1, p.giorniMalus);
                const importo = Math.round(giorni * p.malusGiorno * 100) / 100;
                if (giorni !== ep.giorni || importo !== Number(ep.importo) || p.stato !== ep.stato_pratica) {
                    await supabase.from("caller_malus").update({ giorni, importo, stato_pratica: p.stato, caller: p.caller || null }).eq("id", ep.id);
                    ep.giorni = giorni; ep.importo = importo; ep.stato_pratica = p.stato;
                }
                inMalus.delete(ep.call_id);
            } else {
                await supabase.from("caller_malus").update({ stato: "attivo", al: oggi }).eq("id", ep.id);
                ep.stato = "attivo"; ep.al = oggi;
            }
        }
        for (const p of inMalus.values()) {
            const giorni = Math.max(1, p.giorniMalus);
            const importo = Math.round(giorni * p.malusGiorno * 100) / 100;
            // niente `stato` nel payload: sul conflitto un episodio gia' chiuso
            // NON viene riaperto; sull'inserimento vale il default in_corso
            const { data: ins } = await supabase.from("caller_malus")
                .upsert({ call_id: p.id, stato_pratica: p.stato, caller: p.caller || null, dal: ymd(p.dalMalus!), giorni, importo }, { onConflict: "call_id,dal" })
                .select().maybeSingle();
            if (ins) {
                const senza = episodi.filter((e) => e.id !== (ins as EpisodioCaller).id);
                senza.unshift(ins as EpisodioCaller);
                episodi.length = 0; episodi.push(...senza);
            }
        }
        return episodi;
    } catch { return []; }
}
