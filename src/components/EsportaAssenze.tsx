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

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download, X } from "lucide-react";
import { scaricaXlsxMulti } from "@/lib/exportXlsx";
import { fogliAssenze, ORE_AL_GIORNO, type CellaFoglio as CellaXlsx, type RigaAssenza as RigaAssenzaLib } from "@/lib/assenze";
import { cn } from "@/utils";

export { ORE_AL_GIORNO };

export type RigaAssenza = RigaAssenzaLib;

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
    // `document` non esiste durante il render sul server: il portale si monta
    // solo quando la pagina è viva nel browser
    const [montato, setMontato] = useState(false);
    useEffect(() => setMontato(true), []);
    // ESC chiude, come nelle altre finestre del CRM
    useEffect(() => {
        if (!aperto) return;
        const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAperto(false); };
        document.addEventListener("keydown", esc);
        return () => document.removeEventListener("keydown", esc);
    }, [aperto]);
    const [scelta, setScelta] = useState<"corrente" | "scorso" | "libero">("scorso");
    const [da, setDa] = useState("");
    const [a, setA] = useState("");

    const periodo = periodoDi(scelta, da, a);
    const dati = aperto ? righe({ da: periodo.da, a: periodo.a }) : [];

    const esporta = async () => {
        if (scelta === "libero" && (!da || !a)) return;
        /* I FOGLI LI COSTRUISCE LA LIBRERIA CONDIVISA: gli stessi numeri devono
           uscire da qui e dall'email automatica del primo del mese. Due copie
           della stessa aritmetica divergono sempre. */
        await scaricaXlsxMulti(`${nomeFile}_${periodo.nome}`, fogliAssenze(dati, colonneExtra || []));
        setAperto(false);
    };

    return (
        <>
            <button onClick={() => setAperto(true)}
                title={`Esporta ${titolo.toLowerCase()} in Excel: un foglio di dettaglio e uno di riepilogo per persona`}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5" /> Excel
            </button>

            {/* LA FINESTRA SI APRE DAVANTI AGLI OCCHI, NON IN FONDO ALLA PAGINA
                (Luca 31/08: «devo scorrere per tre secondi fino alla fine»).
                Un `position: fixed` non si ancora allo schermo se un antenato
                ha un `filter`, un `transform` o un `backdrop-blur`: diventa
                assoluto rispetto a QUELLO, e qui il bottone vive dentro la
                barra dei filtri, che il blur ce l'ha. Portandola su `body` il
                problema non si ripresenta ovunque la si metta. */}
            {aperto && montato && createPortal(
                <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setAperto(false)}>
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
                                {scelta === "libero" && (!da || !a)
                                    ? "Scegli la data di inizio e quella di fine."
                                    : dati.length === 0
                                    ? "In questo periodo non c'è nessuna assenza da esportare."
                                    : <>Escono <b className="text-white">{dati.length}</b> {dati.length === 1 ? "riga" : "righe"} su <b className="text-white">{new Set(dati.map((r) => r.persona)).size}</b> {new Set(dati.map((r) => r.persona)).size === 1 ? "persona" : "persone"}, in due fogli: <b className="text-white">Dettaglio</b> e <b className="text-white">Riepilogo</b>.</>}
                            </p>
                                            <p className="text-[10px] text-slate-600">Nel dettaglio le date sono quelle vere dell&apos;assenza; i giorni sono solo quelli che cadono nel periodo. Un giorno vale {ORE_AL_GIORNO} ore, le mezze giornate restano frazioni (0,5), e nel riepilogo una giornata coperta da due assenze conta una volta sola.</p>
                        </div>
                        <div className="px-5 py-3 border-t border-white/10 flex items-center justify-end gap-2">
                            <button onClick={() => setAperto(false)} className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white">Annulla</button>
                            <button onClick={esporta} disabled={dati.length === 0 || (scelta === "libero" && (!da || !a))}
                                className="primary-btn text-xs px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-40">
                                <Download className="w-3.5 h-3.5" /> Scarica l&apos;Excel
                            </button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
}
