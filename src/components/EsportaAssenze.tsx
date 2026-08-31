"use client";

// L'EXPORT DELLE ASSENZE (Luca 31/08).
//
// «Mettimi un bottone di export, chiedimi il periodo — mese precedente, mese in
// corso o un intervallo — e dammi due tab: il dettaglio con le righe delle
// singole persone, e il riepilogo con nominativo, totale ore e giorni.»
//
// Due bottoni separati, uno per le ferie e uno per la malattia, perché sono due
// registri diversi e chi li chiede a fine mese li chiede separati (le ferie al
// consulente del lavoro, le malattie con i numeri di certificato).
//
// LE ORE. Un giorno di assenza vale 8 ore: è la giornata piena del contratto a
// tempo pieno, e le mezze giornate delle ferie fanno 4. Sta scritto qui e
// nell'intestazione del foglio, così chi legge il file sa da dove esce il
// numero e non deve indovinarlo.

import { useState } from "react";
import { Download, X } from "lucide-react";
import { scaricaXlsxMulti, type CellaXlsx } from "@/lib/exportXlsx";
import { cn } from "@/utils";

export const ORE_AL_GIORNO = 8;

export type RigaAssenza = {
    persona: string;
    negozio: string;
    dal: string;              // AAAA-MM-GG
    al: string;               // AAAA-MM-GG
    giorni: number;           // già al netto di domeniche e festivi
    extra?: Record<string, CellaXlsx>;   // colonne in più del registro (stato, certificato…)
};

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const itDate = (s: string) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "");
const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

/** Il periodo scelto, in date. Il mese si prende INTERO: chi esporta «agosto»
 *  vuole agosto, non «dal 1 a oggi». */
function periodoDi(scelta: "corrente" | "scorso" | "libero", da: string, a: string) {
    const oggi = new Date();
    if (scelta === "libero") return { da, a, nome: `${da || "inizio"}_${a || "oggi"}` };
    const base = new Date(oggi.getFullYear(), oggi.getMonth() - (scelta === "scorso" ? 1 : 0), 1);
    const fine = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    return { da: ymd(base), a: ymd(fine), nome: `${MESI[base.getMonth()]}_${base.getFullYear()}` };
}

export function EsportaAssenze({ titolo, colonneExtra, righe, nomeFile }: {
    /** «Ferie» o «Malattia»: finisce nel nome del file e nel titolo della finestra */
    titolo: string;
    /** le colonne in più del registro, nell'ordine in cui devono uscire */
    colonneExtra?: string[];
    /** tutte le righe disponibili: qui dentro si filtra per periodo */
    righe: (periodo: { da: string; a: string }) => RigaAssenza[];
    nomeFile: string;
}) {
    const [aperto, setAperto] = useState(false);
    const [scelta, setScelta] = useState<"corrente" | "scorso" | "libero">("scorso");
    const [da, setDa] = useState("");
    const [a, setA] = useState("");

    const periodo = periodoDi(scelta, da, a);
    const dati = aperto ? righe({ da: periodo.da, a: periodo.a }) : [];

    const esporta = async () => {
        if (scelta === "libero" && (!da || !a)) return;
        const extra = colonneExtra || [];
        const dettaglio: CellaXlsx[][] = dati.map((r) => [
            r.persona, r.negozio, itDate(r.dal), itDate(r.al), r.giorni, Math.round(r.giorni * ORE_AL_GIORNO * 100) / 100,
            ...extra.map((c) => r.extra?.[c] ?? ""),
        ]);
        /* IL RIEPILOGO: una riga per persona, come lo chiede chi paga. Le
           mezze giornate restano frazioni — 3,5 giorni sono 3,5, non 4. */
        const per = new Map<string, { persona: string; negozio: string; giorni: number; righe: number }>();
        for (const r of dati) {
            const v = per.get(r.persona) || { persona: r.persona, negozio: r.negozio, giorni: 0, righe: 0 };
            v.giorni = Math.round((v.giorni + r.giorni) * 100) / 100;
            v.righe++;
            if (!v.negozio) v.negozio = r.negozio;
            per.set(r.persona, v);
        }
        const riepilogo: CellaXlsx[][] = [...per.values()]
            .sort((x, y) => y.giorni - x.giorni || x.persona.localeCompare(y.persona))
            .map((v) => [v.persona, v.negozio, v.righe, v.giorni, Math.round(v.giorni * ORE_AL_GIORNO * 100) / 100]);

        await scaricaXlsxMulti(`${nomeFile}_${periodo.nome}`, [
            {
                nome: "Dettaglio",
                intestazioni: ["Collaboratore", "Negozio", "Dal", "Al", "Giorni", `Ore (${ORE_AL_GIORNO}h/giorno)`, ...extra],
                righe: dettaglio,
            },
            {
                nome: "Riepilogo",
                intestazioni: ["Collaboratore", "Negozio", "Assenze", "Giorni totali", `Ore totali (${ORE_AL_GIORNO}h/giorno)`],
                righe: riepilogo,
            },
        ]);
        setAperto(false);
    };

    return (
        <>
            <button onClick={() => setAperto(true)}
                title={`Esporta ${titolo.toLowerCase()} in Excel: un foglio di dettaglio e uno di riepilogo per persona`}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5" /> Excel
            </button>

            {aperto && (
                <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setAperto(false)}>
                    <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl border border-white/10 bg-[#141824] shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-5 pt-4 pb-2">
                            <h3 className="text-white font-semibold">⬇️ Esporta {titolo}</h3>
                            <button onClick={() => setAperto(false)} aria-label="Chiudi" className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="px-5 pb-4 space-y-3">
                            <div className="flex flex-wrap gap-2">
                                {([["scorso", "Mese scorso"], ["corrente", "Mese in corso"], ["libero", "Scegli il periodo"]] as const).map(([k, l]) => (
                                    <button key={k} onClick={() => setScelta(k)}
                                        className={cn("px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors",
                                            scelta === k ? "border-indigo-400/60 bg-indigo-500/15 text-indigo-100" : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-white hover:bg-white/10")}>
                                        {l}
                                    </button>
                                ))}
                            </div>
                            {scelta === "libero" ? (
                                <div className="flex flex-wrap items-end gap-2">
                                    <label className="flex flex-col gap-1">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Dal</span>
                                        <input type="date" value={da} onChange={(e) => setDa(e.target.value)} className="glass-input !h-9 text-sm" />
                                    </label>
                                    <label className="flex flex-col gap-1">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Al</span>
                                        <input type="date" value={a} onChange={(e) => setA(e.target.value)} className="glass-input !h-9 text-sm" />
                                    </label>
                                </div>
                            ) : (
                                <p className="text-[11px] text-slate-400">Dal {itDate(periodo.da)} al {itDate(periodo.a)}, mese intero.</p>
                            )}
                            <p className="text-[11px] text-slate-400">
                                {dati.length === 0
                                    ? "In questo periodo non c'è nessuna assenza da esportare."
                                    : <>Escono <b className="text-white">{dati.length}</b> {dati.length === 1 ? "riga" : "righe"} su <b className="text-white">{new Set(dati.map((r) => r.persona)).size}</b> {new Set(dati.map((r) => r.persona)).size === 1 ? "persona" : "persone"}, in due fogli: <b className="text-white">Dettaglio</b> e <b className="text-white">Riepilogo</b>.</>}
                            </p>
                            <p className="text-[10px] text-slate-600">Le assenze a cavallo del periodo entrano per la parte che ci cade dentro. Un giorno vale {ORE_AL_GIORNO} ore; le mezze giornate restano frazioni (0,5).</p>
                        </div>
                        <div className="px-5 py-3 border-t border-white/10 flex items-center justify-end gap-2">
                            <button onClick={() => setAperto(false)} className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white">Annulla</button>
                            <button onClick={esporta} disabled={dati.length === 0 || (scelta === "libero" && (!da || !a))}
                                className="primary-btn text-xs px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-40">
                                <Download className="w-3.5 h-3.5" /> Scarica l&apos;Excel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
