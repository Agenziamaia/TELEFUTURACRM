"use client";

// CARICA L'AVANZAMENTO UFFICIALE (Luca 29/08).
//
// Il file che manda l'operatore è quasi sempre fatto così: una riga per codice
// di inserimento, una colonna per pista. Quindi si chiede solo due cose — a
// quale data è fermo, e che cosa c'è in ogni colonna — e si mostra l'anteprima
// prima di salvare. Lo stesso gesto dell'import delle liste caller.
//
// Il foglio si legge col codice, non con l'intelligenza artificiale: qui si
// muovono numeri che decidono dove si carica una vendita e quanto vale un
// premio, e un modello che sbaglia una cifra non lo scopre nessuno.

import { useState } from "react";
import { Upload, X, Check, Loader2 } from "lucide-react";
import { salvaAvanzamento, pulisciGriglia, trovaIntestazione, proponiMappa, righeDaGriglia, COL_CODICE, COL_IGNORA, type RigaUfficiale } from "@/lib/avanzamentoUfficiale";
import { cn } from "@/utils";

const IGNORA = COL_IGNORA;
const CODICE = COL_CODICE;

export function CaricaAvanzamento({ brand, monthISO, piste, chi, onFatto, onChiudi }: {
    brand: string; monthISO: string;
    piste: { chiave: string; nome: string }[];
    chi?: string | null;
    onFatto: () => void; onChiudi: () => void;
}) {
    const [nomeFile, setNomeFile] = useState("");
    const [griglia, setGriglia] = useState<string[][]>([]);
    const [intestazioni, setIntestazioni] = useState<string[]>([]);
    const [mappa, setMappa] = useState<string[]>([]);      // colonna → CODICE | chiave pista | IGNORA
    const [al, setAl] = useState("");
    const [busy, setBusy] = useState(false);
    const [errore, setErrore] = useState<string | null>(null);
    const [fatto, setFatto] = useState<number | null>(null);

    const opzioni = [IGNORA, CODICE, ...piste.map((p) => p.nome)];

    const leggi = async (f: File) => {
        setErrore(null); setNomeFile(f.name);
        try {
            const XLSX = await import("xlsx");
            const buf = await f.arrayBuffer();
            const wb = XLSX.read(buf, { type: "array" });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const righe = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false }) as unknown[][];
            const pulite = pulisciGriglia(righe);
            if (!pulite.length) { setErrore("Il foglio è vuoto."); return; }
            const { head, corpo } = trovaIntestazione(pulite);
            setIntestazioni(head);
            setGriglia(corpo);
            setMappa(proponiMappa(head, piste));
        } catch (e) {
            setErrore("File non leggibile: " + (e instanceof Error ? e.message : "formato non riconosciuto") + ". Serve un Excel (.xlsx) o un CSV.");
        }
    };

    const righeUfficiali: RigaUfficiale[] = righeDaGriglia(griglia, mappa, piste);

    const salva = async () => {
        if (!al) { setErrore("Serve la data a cui è fermo l'avanzamento."); return; }
        setBusy(true); setErrore(null);
        const r = await salvaAvanzamento({ brand, monthISO, al, righe: righeUfficiali, fileName: nomeFile, chi: chi || undefined });
        setBusy(false);
        if (!r.ok) { setErrore(r.errore); return; }
        setFatto(r.n);
        onFatto();
    };

    return (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onChiudi}>
            <div className="w-full max-w-3xl max-h-[88vh] flex flex-col rounded-2xl border border-white/10 bg-[#141824] shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 pt-4 pb-2">
                    <div>
                        <h3 className="text-white font-semibold">📊 Avanzamento ufficiale dell&apos;operatore</h3>
                        <p className="text-[11px] text-slate-500 mt-0.5">Vale come verità fino alla sua data; dopo quella data conta quello che registrano i ragazzi.</p>
                    </div>
                    <button onClick={onChiudi} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5"><X className="w-5 h-5" /></button>
                </div>

                <div className="px-5 py-3 flex flex-wrap items-end gap-3 border-b border-white/5">
                    <label className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">File dell&apos;operatore</span>
                        <span className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-slate-300 cursor-pointer hover:bg-white/10 flex items-center gap-2">
                            <Upload className="w-4 h-4" /> {nomeFile || "Scegli un Excel"}
                            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) leggi(f); }} />
                        </span>
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Aggiornato al</span>
                        <input type="date" value={al} onChange={(e) => setAl(e.target.value)} className="glass-input !h-9 text-sm" />
                    </label>
                    {righeUfficiali.length > 0 && (
                        <span className="text-[11px] text-emerald-300 pb-2">{righeUfficiali.length} valori pronti</span>
                    )}
                </div>

                {errore && <p className="mx-5 my-2 text-[11px] text-rose-200 bg-rose-500/10 border border-rose-500/25 rounded-lg px-3 py-2">{errore}</p>}
                {fatto != null && <p className="mx-5 my-2 text-[11px] text-emerald-200 bg-emerald-500/10 border border-emerald-500/25 rounded-lg px-3 py-2">✅ Salvati {fatto} valori. Lo scarto compare sulle piste dei codici.</p>}

                {intestazioni.length > 0 && (
                    <div className="flex-1 overflow-auto px-5 py-3">
                        <p className="text-[11px] text-slate-500 mb-2">Dì che cosa c&apos;è in ogni colonna: una è il codice di inserimento, le altre sono le piste.</p>
                        <table className="w-full text-[11px]">
                            <thead>
                                <tr>{intestazioni.map((h, i) => (
                                    <th key={i} className="p-1 align-top">
                                        <span className="block text-slate-400 truncate mb-1" title={h}>{h || `col. ${i + 1}`}</span>
                                        <select value={mappa[i] || IGNORA} onChange={(e) => setMappa((m) => m.map((v, j) => (j === i ? e.target.value : v)))}
                                            className={cn("glass-input !h-7 !px-1 text-[10px] w-full", (mappa[i] && mappa[i] !== IGNORA) && "!border-indigo-400/50")}>
                                            {opzioni.map((o) => <option key={o} value={o}>{o}</option>)}
                                        </select>
                                    </th>
                                ))}</tr>
                            </thead>
                            <tbody>
                                {griglia.slice(0, 8).map((r, i) => (
                                    <tr key={i} className="border-t border-white/5">
                                        {intestazioni.map((_, j) => <td key={j} className="p-1 text-slate-300 truncate max-w-[120px]">{r[j] || ""}</td>)}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {griglia.length > 8 && <p className="text-[10px] text-slate-600 mt-1">…e altre {griglia.length - 8} righe.</p>}
                    </div>
                )}

                <div className="px-5 py-3 border-t border-white/10 flex items-center justify-end gap-2">
                    <button onClick={onChiudi} className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white">Annulla</button>
                    <button onClick={salva} disabled={busy || !al || righeUfficiali.length === 0}
                        className="primary-btn text-xs px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-40">
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        Salva l&apos;avanzamento
                    </button>
                </div>
            </div>
        </div>
    );
}
