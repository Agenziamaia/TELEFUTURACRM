"use client";

/* IMPORT LISTINO TERMINALI (Luca 02/08) — dal brand in Documentazione si
   carica il listino ufficiale dell'operatore (xlsx/xls/csv): il parser
   riconosce da solo le colonne (modello, prezzo, rata, mesi, anticipo),
   si puo' correggere la mappatura a mano, si vede l'anteprima e si
   importa in `listini_terminali` (upsert per brand+modello; piu' righe
   dello stesso modello = piu' piani rata). L'originale viene archiviato
   nel bucket. I prezzi alimentano il suggerimento 💰 sotto le tendine
   "Modello Terminale" di Registra Vendita e, domani, gli scontrini. */

import { useMemo, useRef, useState } from "react";
import { X, FileSpreadsheet, Loader2, Check } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type RigaGrezza = (string | number | null | undefined)[];
type VoceListino = { modello: string; prezzo: number | null; rate: { mesi: number; rata: number; anticipo?: number }[] };

const KEYWORDS: Record<string, string[]> = {
    modello: ["modello", "terminale", "device", "descrizione", "prodotto", "smartphone", "modello terminale"],
    prezzo: ["prezzo listino", "prezzo di listino", "listino", "prezzo", "costo"],
    rata: ["importo rata", "rata mensile", "rata", "canone"],
    mesi: ["n rate", "num rate", "numero rate", "mesi", "durata", "rate"],
    anticipo: ["anticipo", "contributo iniziale", "upfront"],
};

/** "1.299,00 €" / "1299.00" / "€ 33,99" → numero (null se non e' un numero). */
function parseEuro(v: unknown): number | null {
    if (v == null) return null;
    if (typeof v === "number") return isFinite(v) ? Math.round(v * 100) / 100 : null;
    let s = String(v).replace(/[€\s]/g, "").trim();
    if (!s) return null;
    if (s.includes(".") && s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    else if (s.includes(",")) s = s.replace(",", ".");
    const n = parseFloat(s);
    return isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** PDF DIGITALE → griglia righe/colonne (Luca 02/08: "i listini sono in
 *  PDF"). Si estrae il testo con le coordinate (pdfjs, worker statico in
 *  /public), si raggruppano gli item per riga (stessa y, tolleranza) e le
 *  COLONNE si ancorano alle x della riga d'intestazione (quella che matcha
 *  le parole chiave). Le pagine successive riusano le stesse colonne.
 *  Le scansioni (immagini) non hanno testo: errore chiaro all'utente. */
async function parsePdfRighe(file: File): Promise<RigaGrezza[]> {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const out: RigaGrezza[] = [];
    let colonne: number[] | null = null;
    for (let pag = 1; pag <= doc.numPages; pag++) {
        const page = await doc.getPage(pag);
        const tc = await page.getTextContent();
        type It = { x: number; y: number; s: string };
        const items: It[] = (tc.items as { str?: string; transform?: number[] }[])
            .filter(i => i.str && i.str.trim() && i.transform)
            .map(i => ({ x: i.transform![4], y: i.transform![5], s: String(i.str).trim() }));
        items.sort((a, b) => b.y - a.y || a.x - b.x);
        const rows: It[][] = [];
        for (const it of items) {
            const r = rows.find(rr => Math.abs(rr[0].y - it.y) < 3.5);
            if (r) r.push(it); else rows.push([it]);
        }
        rows.forEach(r => r.sort((a, b) => a.x - b.x));
        if (!colonne) {
            for (const r of rows) {
                const testi = r.map(i => i.s.toLowerCase());
                const match = Object.values(KEYWORDS).filter(ks => testi.some(t => ks.some(k2 => t.includes(k2)))).length;
                if (match >= 2 && r.length >= 2) { colonne = r.map(i => i.x); break; }
            }
        }
        for (const r of rows) {
            if (!colonne) { out.push(r.map(i => i.s)); continue; }
            const celle: string[] = new Array(colonne.length).fill("");
            for (const it of r) {
                let ci = 0;
                for (let c = 0; c < colonne.length; c++) if (it.x >= colonne[c] - 4) ci = c;
                celle[ci] = celle[ci] ? celle[ci] + " " + it.s : it.s;
            }
            out.push(celle);
        }
    }
    if (!out.length) throw new Error("nessun testo nel PDF: se è una scansione (immagine) non è leggibile, serve il PDF originale");
    return out;
}

function indovinaColonna(headers: string[], chiavi: string[]): number {
    const low = headers.map(h => String(h || "").toLowerCase().trim());
    for (const k of chiavi) { const i = low.findIndex(h => h === k); if (i >= 0) return i; }
    for (const k of chiavi) { const i = low.findIndex(h => h.includes(k)); if (i >= 0) return i; }
    return -1;
}

export function ImportListino({ brandId, brandName, gestore, onClose }: {
    brandId: string; brandName: string; gestore: string; onClose: () => void;
}) {
    const fileRef = useRef<HTMLInputElement | null>(null);
    const [file, setFile] = useState<File | null>(null);
    const [righe, setRighe] = useState<RigaGrezza[]>([]);
    const [headerIdx, setHeaderIdx] = useState(0);
    const [col, setCol] = useState<{ modello: number; prezzo: number; rata: number; mesi: number; anticipo: number }>({ modello: -1, prezzo: -1, rata: -1, mesi: -1, anticipo: -1 });
    const [busy, setBusy] = useState(false);
    const [errore, setErrore] = useState("");
    const [fatto, setFatto] = useState<null | { voci: number; conRate: number }>(null);

    const leggiFile = async (f: File) => {
        setErrore(""); setFatto(null); setFile(f);
        try {
            let rows: RigaGrezza[];
            if (f.name.toLowerCase().endsWith(".pdf")) {
                rows = await parsePdfRighe(f);
            } else {
                const XLSX = await import("xlsx");
                const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
                const sheet = wb.Sheets[wb.SheetNames[0]];
                rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as RigaGrezza[];
            }
            if (!rows.length) { setErrore("File vuoto o non leggibile."); return; }
            // intestazione = prima riga che matcha almeno 2 parole chiave
            let hIdx = 0;
            for (let i = 0; i < Math.min(rows.length, 12); i++) {
                const hs = (rows[i] || []).map(c => String(c ?? "").toLowerCase());
                const punteggio = Object.values(KEYWORDS).filter(ks => hs.some(h => ks.some(k => h.includes(k)))).length;
                if (punteggio >= 2) { hIdx = i; break; }
            }
            const headers = (rows[hIdx] || []).map(c => String(c ?? ""));
            setRighe(rows); setHeaderIdx(hIdx);
            setCol({
                modello: indovinaColonna(headers, KEYWORDS.modello),
                prezzo: indovinaColonna(headers, KEYWORDS.prezzo),
                rata: indovinaColonna(headers, KEYWORDS.rata),
                mesi: indovinaColonna(headers, KEYWORDS.mesi),
                anticipo: indovinaColonna(headers, KEYWORDS.anticipo),
            });
        } catch (e) {
            setErrore("Non riesco a leggere il file: " + (e instanceof Error ? e.message : "formato non riconosciuto"));
        }
    };

    const headers = useMemo(() => (righe[headerIdx] || []).map((c, i) => String(c ?? `colonna ${i + 1}`)), [righe, headerIdx]);

    // righe dati → voci normalizzate (stesso modello = piani rata accumulati)
    const voci = useMemo<VoceListino[]>(() => {
        if (!righe.length || col.modello < 0) return [];
        const per = new Map<string, VoceListino>();
        for (let i = headerIdx + 1; i < righe.length; i++) {
            const r = righe[i] || [];
            const modello = String(r[col.modello] ?? "").trim();
            if (!modello || modello.length < 2) continue;
            const prezzo = col.prezzo >= 0 ? parseEuro(r[col.prezzo]) : null;
            const rata = col.rata >= 0 ? parseEuro(r[col.rata]) : null;
            const mesi = col.mesi >= 0 ? Math.round(parseEuro(r[col.mesi]) || 0) : 0;
            const anticipo = col.anticipo >= 0 ? parseEuro(r[col.anticipo]) : null;
            const k = modello.toLowerCase();
            const v = per.get(k) || { modello, prezzo: null, rate: [] };
            if (prezzo != null && v.prezzo == null) v.prezzo = prezzo;
            if (rata != null && mesi > 0) v.rate.push({ mesi, rata, ...(anticipo != null && anticipo > 0 ? { anticipo } : {}) });
            per.set(k, v);
        }
        return [...per.values()];
    }, [righe, headerIdx, col]);

    const importa = async () => {
        if (busy || !voci.length) return;
        setBusy(true); setErrore("");
        try {
            const rows = voci.map(v => ({
                brand: brandName, modello: v.modello, prezzo: v.prezzo,
                rate: v.rate, fonte: file?.name || "", aggiornato_da: gestore,
                aggiornato_il: new Date().toISOString(),
            }));
            for (let i = 0; i < rows.length; i += 500) {
                const { error } = await supabase.from("listini_terminali")
                    .upsert(rows.slice(i, i + 500), { onConflict: "brand,modello" });
                if (error) throw new Error(error.message);
            }
            // archivio dell'originale nel bucket (per ritrovare la fonte)
            if (file) {
                const path = `listini/${brandId}/${Date.now()}_${file.name.replace(/[^\w.\-]/g, "_")}`;
                await supabase.storage.from("documentation").upload(path, file, { upsert: false }).catch(() => { });
            }
            setFatto({ voci: rows.length, conRate: rows.filter(r => (r.rate as unknown[]).length > 0).length });
        } catch (e) {
            setErrore("Import fallito: " + (e instanceof Error ? e.message : "riprova"));
        } finally { setBusy(false); }
    };

    const SelCol = ({ campo, label }: { campo: keyof typeof col; label: string }) => (
        <label className="text-xs text-slate-400 flex flex-col gap-1">
            <span className="font-bold uppercase tracking-wider text-[10px] text-slate-500">{label}</span>
            <select value={col[campo]} onChange={e => setCol(p => ({ ...p, [campo]: Number(e.target.value) }))}
                className="glass-input text-xs rounded-lg py-1.5 px-2 bg-[#0f111a]">
                <option value={-1}>— non presente —</option>
                {headers.map((h, i) => <option key={i} value={i}>{h || `colonna ${i + 1}`}</option>)}
            </select>
        </label>
    );

    return (
        <div className="fixed inset-0 z-[1300] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="glass-panel w-full max-w-3xl max-h-[88vh] overflow-hidden flex flex-col shadow-2xl border-white/10">
                <div className="flex-none px-5 py-4 border-b border-white/10 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-emerald-400" /> Importa listino — {brandName}</h3>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/10"><X size={20} /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {fatto ? (
                        <div className="text-center py-10 space-y-3">
                            <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center"><Check className="w-7 h-7 text-emerald-400" /></div>
                            <p className="text-white font-bold">Listino {brandName} importato</p>
                            <p className="text-sm text-slate-400">{fatto.voci} modelli aggiornati · {fatto.conRate} con piani rata · fonte: {file?.name}</p>
                            <p className="text-xs text-slate-500">I prezzi compaiono sotto le tendine “Modello Terminale” di Registra Vendita.</p>
                            <button onClick={onClose} className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold">Chiudi</button>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center gap-3 flex-wrap">
                                <input ref={fileRef} type="file" accept=".pdf,.xlsx,.xls,.csv" className="hidden"
                                    onChange={e => { const f = e.target.files?.[0]; if (f) leggiFile(f); }} />
                                <button onClick={() => fileRef.current?.click()}
                                    className="px-4 py-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 text-sm font-bold hover:bg-emerald-500/20">
                                    {file ? "Cambia file…" : "Scegli il file del listino…"}
                                </button>
                                {file && <span className="text-xs text-slate-400">{file.name}</span>}
                                <span className="text-[11px] text-slate-500">PDF del listino ufficiale (digitale, non scansione) — oppure Excel/CSV</span>
                            </div>
                            {errore && <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-xl px-3 py-2">{errore}</p>}
                            {righe.length > 0 && (
                                <>
                                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                                        <SelCol campo="modello" label="Modello *" />
                                        <SelCol campo="prezzo" label="Prezzo listino" />
                                        <SelCol campo="rata" label="Importo rata" />
                                        <SelCol campo="mesi" label="N. mesi/rate" />
                                        <SelCol campo="anticipo" label="Anticipo" />
                                    </div>
                                    {col.modello < 0 ? (
                                        <p className="text-sm text-amber-300">Scegli almeno la colonna del <b>modello</b>.</p>
                                    ) : (
                                        <div className="rounded-xl border border-white/10 overflow-hidden">
                                            <div className="px-3 py-2 bg-white/[0.04] text-[11px] font-bold uppercase tracking-wider text-slate-400">Anteprima — {voci.length} modelli riconosciuti</div>
                                            <div className="max-h-64 overflow-y-auto divide-y divide-white/5">
                                                {voci.slice(0, 15).map(v => (
                                                    <div key={v.modello} className="px-3 py-2 flex items-center gap-3 text-sm">
                                                        <span className="flex-1 text-slate-100 truncate">{v.modello}</span>
                                                        <span className="text-emerald-300 font-mono font-bold">{v.prezzo != null ? "€ " + v.prezzo.toLocaleString("it-IT", { minimumFractionDigits: 2 }) : "—"}</span>
                                                        <span className="text-[11px] text-slate-500">{v.rate.length ? v.rate.map(r => `${r.mesi}×€${r.rata.toLocaleString("it-IT", { minimumFractionDigits: 2 })}${r.anticipo ? ` +ant.€${r.anticipo}` : ""}`).join(" / ") : "senza rate"}</span>
                                                    </div>
                                                ))}
                                                {voci.length > 15 && <div className="px-3 py-2 text-[11px] text-slate-500">…e altri {voci.length - 15} modelli</div>}
                                            </div>
                                        </div>
                                    )}
                                    <button onClick={importa} disabled={busy || !voci.length || col.modello < 0}
                                        className="w-full py-3 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-emerald-600 to-green-600 hover:brightness-110 disabled:opacity-40 flex items-center justify-center gap-2">
                                        {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Import in corso…</> : `Importa ${voci.length} modelli nel listino ${brandName}`}
                                    </button>
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
