"use client";

// REGOLE E MALUS DEL LABORATORIO USATO (Luca 31/07, mig. 113) — stesso
// impianto dello storico malus PDA (mig. 103): ogni periodo oltre soglia
// diventa un EPISODIO persistito in usati_malus; quando il telefono viene
// sanato (pronto/ko/venduto) l'episodio smette di maturare ma l'importo resta
// "attivo", in attesa di compensazione nella gara di commissioning dedicata.
//
// FASI (regole in usati_regole, modificabili solo dall'admin):
//  - lavorazione: dal passaggio IN LAVORAZIONE il tecnico ha N giorni per
//    esitare il telefono PRONTO oppure ordinare il ricambio. Il primo
//    ricambio NON di magazzino (da_ordinare/ordinato) chiude la fase: l'ha
//    esitata; un ricambio gia' in magazzino NON ferma l'orologio (il pezzo
//    ce l'ha, deve finire).
//  - riparazione: dal ricambio segnato ARRIVATO (arrivato_il) ha M giorni
//    per portare il telefono in PRONTO.
// Giorni LAVORATIVI lun-sab, come il PDA. Le date dei ricambi esistono dal
// 31/07 (stato_dal/arrivato_il): i movimenti precedenti non maturano nulla.
import { supabase } from "@/lib/supabaseClient";

export type RegoleUsato = {
    lavorazione: { giorni: number; malus: number };
    riparazione: { giorni: number; malus: number };
};
export const REGOLE_USATO_DEFAULT: RegoleUsato = {
    lavorazione: { giorni: 3, malus: 5 },
    riparazione: { giorni: 4, malus: 5 },
};

export async function caricaRegoleUsato(): Promise<RegoleUsato> {
    try {
        const { data, error } = await supabase.from("usati_regole").select("fase, giorni, malus_giorno");
        if (error || !data?.length) return REGOLE_USATO_DEFAULT;
        const out = { ...REGOLE_USATO_DEFAULT };
        for (const r of data as { fase: string; giorni: number; malus_giorno: number }[]) {
            if (r.fase === "lavorazione" || r.fase === "riparazione") {
                out[r.fase] = { giorni: Number(r.giorni) || 0, malus: Number(r.malus_giorno) || 0 };
            }
        }
        return out;
    } catch { return REGOLE_USATO_DEFAULT; }
}

export type EpisodioUsato = {
    id?: string;
    usato_id: number;
    imei: string;
    model: string;
    tecnico: string;
    fase: "lavorazione" | "riparazione";
    data_inizio: string;       // yyyy-mm-dd, primo giorno oltre soglia
    data_fine: string | null;  // null = matura ancora
    giorni: number;
    malus_giorno: number;
    importo: number;
    stato: "in_corso" | "attivo" | "compensato";
    compensato_il?: string | null;
    compensato_da?: string | null;
    compensato_note?: string | null;
};

type DeviceLike = {
    id: number; imei: string; model: string; status: string;
    status_history: Record<string, { date: Date; operatore: string }>;
    ricambi: { name: string; stato: string; stato_dal?: string | null; arrivato_il?: string | null }[];
};

const STATI_SANATO = ["pronto", "invio_in_negozio", "in_vendita", "venduto", "ko"];

function d0(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function toISO(d: Date): string { const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
/** Giorni lavorativi in (a, b], lun-sab — stessa aritmetica del PDA. */
function lavorativiTra(a: Date, b: Date): number {
    let n = 0; const cur = d0(a); const to = d0(b);
    while (cur < to) { cur.setDate(cur.getDate() + 1); if (cur.getDay() !== 0) n++; }
    return n;
}
/** La data del giorno lavorativo numero `n` dopo `a` (n>=1). */
function dopoLavorativi(a: Date, n: number): Date {
    const cur = d0(a); let fatti = 0;
    while (fatti < n) { cur.setDate(cur.getDate() + 1); if (cur.getDay() !== 0) fatti++; }
    return cur;
}

/** Scadenza corrente del dispositivo per il box in scheda (null = nessuna fase aperta). */
export function scadenzaCorrente(d: DeviceLike, regole: RegoleUsato):
    | { fase: "lavorazione" | "riparazione"; scadenza: Date; oltre: number; importo: number; tecnico: string }
    | null {
    const ep = calcolaFasi(d, regole).find((f) => !f.fine);
    if (!ep) return null;
    const soglia = regole[ep.fase].giorni;
    const scadenza = dopoLavorativi(ep.inizio, soglia);
    const oltre = Math.max(0, lavorativiTra(ep.inizio, new Date()) - soglia);
    return { fase: ep.fase, scadenza, oltre, importo: oltre * regole[ep.fase].malus, tecnico: ep.tecnico };
}

type FaseAperta = { fase: "lavorazione" | "riparazione"; inizio: Date; fine: Date | null; tecnico: string };

// Ricostruzione deterministica delle finestre di fase dalla cronologia.
function calcolaFasi(d: DeviceLike, _regole: RegoleUsato): FaseAperta[] {
    const out: FaseAperta[] = [];
    const inLav = d.status_history["in_lavorazione"];
    const sanatoDate = STATI_SANATO
        .map((s) => d.status_history[s]?.date)
        .filter((x): x is Date => !!x && !isNaN(x.getTime()));
    const sanato = (dopo: Date): Date | null => {
        const c = sanatoDate.filter((x) => x > dopo).sort((a, b) => a.getTime() - b.getTime());
        return c[0] || null;
    };
    if (inLav?.date && !isNaN(inLav.date.getTime()) && d.status !== "ko" || inLav?.date && d.status === "ko") {
        const inizio = inLav.date;
        // il primo ricambio NON di magazzino chiude la lavorazione (esitata)
        const primoOrdine = d.ricambi
            .filter((r) => r.stato !== "in_magazzino" && r.stato_dal)
            .map((r) => new Date(r.stato_dal!))
            .filter((x) => !isNaN(x.getTime()) && x > inizio)
            .sort((a, b) => a.getTime() - b.getTime())[0] || null;
        const fineSanato = sanato(inizio);
        const fine = [primoOrdine, fineSanato].filter(Boolean).sort((a, b) => a!.getTime() - b!.getTime())[0] || null;
        out.push({ fase: "lavorazione", inizio, fine, tecnico: inLav.operatore || "" });
    }
    // riparazione: dal primo ricambio ARRIVATO ancora "aperto" (telefono non sanato dopo)
    const arrivi = d.ricambi
        .filter((r) => r.arrivato_il)
        .map((r) => new Date(r.arrivato_il!))
        .filter((x) => !isNaN(x.getTime()))
        .sort((a, b) => a.getTime() - b.getTime());
    if (arrivi.length) {
        const inizio = arrivi[0];
        const fine = sanato(inizio);
        out.push({ fase: "riparazione", inizio, fine, tecnico: inLav?.operatore || "" });
    }
    return out;
}

/** Episodi derivati (solo quelli OLTRE soglia). */
export function calcolaEpisodi(d: DeviceLike, regole: RegoleUsato): EpisodioUsato[] {
    const out: EpisodioUsato[] = [];
    for (const f of calcolaFasi(d, regole)) {
        const soglia = regole[f.fase].giorni;
        const malus = regole[f.fase].malus;
        if (!soglia || !malus) continue;
        const fine = f.fine || new Date();
        const oltre = lavorativiTra(f.inizio, fine) - soglia;
        if (oltre <= 0) continue;
        out.push({
            usato_id: d.id, imei: d.imei, model: d.model, tecnico: f.tecnico,
            fase: f.fase,
            data_inizio: toISO(dopoLavorativi(f.inizio, soglia)),
            data_fine: f.fine ? toISO(f.fine) : null,
            giorni: oltre, malus_giorno: malus, importo: oltre * malus,
            stato: f.fine ? "attivo" : "in_corso",
        });
    }
    return out;
}

/** Allinea usati_malus con gli episodi derivati (mai toccare i compensati). */
export async function sincronizzaMalusUsato(devices: DeviceLike[], regole: RegoleUsato): Promise<EpisodioUsato[]> {
    const derivati = devices.flatMap((d) => calcolaEpisodi(d, regole));
    try {
        const { data: esistenti, error } = await supabase.from("usati_malus").select("*");
        if (error) return derivati; // mig. 113 non applicata: si mostra il derivato
        const byKey = new Map((esistenti as EpisodioUsato[]).map((e) => [`${e.usato_id}|${e.fase}|${e.data_inizio}`, e]));
        for (const ep of derivati) {
            const ex = byKey.get(`${ep.usato_id}|${ep.fase}|${ep.data_inizio}`);
            if (ex?.stato === "compensato") continue;
            if (!ex) {
                await supabase.from("usati_malus").insert(ep);
            } else if (ex.giorni !== ep.giorni || ex.importo !== ep.importo || ex.stato !== ep.stato || ex.data_fine !== ep.data_fine) {
                await supabase.from("usati_malus").update({
                    giorni: ep.giorni, importo: ep.importo, stato: ep.stato, data_fine: ep.data_fine,
                    tecnico: ep.tecnico || ex.tecnico, model: ep.model, imei: ep.imei,
                }).eq("id", ex.id!);
            }
        }
        const { data: finali } = await supabase.from("usati_malus").select("*").order("data_inizio", { ascending: false });
        return (finali as EpisodioUsato[]) ?? derivati;
    } catch { return derivati; }
}
