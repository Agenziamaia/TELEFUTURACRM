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
import { cn } from "@/utils";

type RigaGrezza = (string | number | null | undefined)[];
type VoceListino = { modello: string; prezzo: number | null; rate: { mesi: number; rata: number; anticipo?: number }[]; margine?: number | null };

const KEYWORDS: Record<string, string[]> = {
    // "sp cash" = prezzo di vendita cash nei listini WindTre (verificato sul
    // "Listino Terminali WINDTRE Prodotti ordinabili" del 22/07/2026)
    modello: ["prodotto", "modello terminale", "modello", "terminale", "descrizione", "device", "smartphone"],
    prezzo: ["sp cash", "prezzo listino", "prezzo di listino", "prezzo al pubblico", "listino", "prezzo", "cash", "costo"],
    rata: ["importo rata", "rata mensile", "rata", "canone"],
    mesi: ["n rate", "num rate", "numero rate", "mesi", "durata", "rate"],
    anticipo: ["anticipo", "contributo iniziale", "upfront"],
    // margine/sconto dealer gia' scritto nel file (W3: colonna "Sconto" = 0,05)
    margine: ["sconto", "margine", "provvigione"],
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
function grigliaDaPdf(righe: CellaPdf[][]): RigaGrezza[] {
    const out: RigaGrezza[] = [];
    let colonne: number[] | null = null;
    for (const r of righe) {
        if (!colonne) {
            const testi = r.map(i => i.s.toLowerCase());
            const match = Object.values(KEYWORDS).filter(ks => testi.some(t => ks.some(k2 => t.includes(k2)))).length;
            if (match >= 2 && r.length >= 2) colonne = r.map(i => i.x);
        }
        if (!colonne) { out.push(r.map(i => i.s)); continue; }
        const celle: string[] = new Array(colonne.length).fill("");
        for (const it of r) {
            let ci = 0;
            for (let c = 0; c < colonne.length; c++) if (it.x >= colonne[c] - 4) ci = c;
            celle[ci] = celle[ci] ? celle[ci] + " " + it.s : it.s;
        }
        out.push(celle);
    }
    return out;
}

/** Righe con coordinate di un PDF (usato sia dalla griglia sia dai blocchi). */
type CellaPdf = { x: number; y: number; s: string };
async function righePdf(file: File): Promise<CellaPdf[][]> {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const out: CellaPdf[][] = [];
    for (let p = 1; p <= doc.numPages; p++) {
        const tc = await (await doc.getPage(p)).getTextContent();
        const items: CellaPdf[] = (tc.items as { str?: string; transform?: number[] }[])
            .filter(i => i.str && i.str.trim() && i.transform)
            .map(i => ({ x: i.transform![4], y: i.transform![5], s: String(i.str).trim() }));
        items.sort((a, b) => b.y - a.y || a.x - b.x);
        const rows: CellaPdf[][] = [];
        for (const it of items) { const r = rows.find(rr => Math.abs(rr[0].y - it.y) < 3.5); if (r) r.push(it); else rows.push([it]); }
        rows.forEach(r => r.sort((a, b) => a.x - b.x));
        rows.forEach(r => out.push(r));
    }
    return out;
}

/** LISTINO "A BLOCCHI" (formato Vodafone & co., verificato sul listino
 *  principale del 23/07/2026 — 105 modelli, tutti con prezzo). Ogni terminale
 *  e' un riquadro che si apre con l'intestazione "PREZZO AL PUBBLICO":
 *   - il MODELLO sta nella colonna di sinistra, spezzato su piu' frammenti
 *     ("SAMSUNG GALAXY" + "A16 4G");
 *   - il PREZZO AL PUBBLICO e' il primo importo in € sotto l'intestazione,
 *     PRIMA della dicitura "RISPARMIO SUL PREZZO AL PUBBLICO" (quello e' lo
 *     sconto massimo: confonderlo col prezzo falserebbe tutti i margini);
 *   - i PIANI RATA stanno a destra (contributo iniziale, importo rata,
 *     totale con rate): i mesi si ricavano da totale/rata, deduplicati. */
function parseBlocchi(righe: CellaPdf[][]): VoceListino[] {
    const num = (t: string) => {
        const m = String(t).replace(/[\s€]/g, "").match(/^(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?$/);
        return m ? parseFloat(m[1].replace(/\./g, "") + "." + (m[2] || "0")) : null;
    };
    const aperture: number[] = [];
    righe.forEach((r, i) => { if (r.some(c => /^PREZZO AL PUBBLICO$/i.test(c.s))) aperture.push(i); });
    if (aperture.length < 3) return [];
    const voci: VoceListino[] = [];
    for (let b = 0; b < aperture.length; b++) {
        const start = aperture[b], end = b + 1 < aperture.length ? aperture[b + 1] : righe.length;
        let stopModello = end, prezzo: number | null = null, rigaPrezzo = -1;
        for (let i = start; i < end; i++) {
            if (/RISPARMIO SUL PREZZO/i.test(righe[i].map(c => c.s).join(" "))) { stopModello = i; break; }
        }
        for (let i = start; i < Math.min(end, stopModello + 1) && prezzo === null; i++) {
            for (const c of righe[i]) {
                if (c.x >= 125 && c.x <= 215 && c.s.includes("€")) {
                    const v = num(c.s);
                    if (v) { prezzo = v; rigaPrezzo = i; break; }
                }
            }
        }
        const frammenti: string[] = [];
        const fine = Math.min(end, Math.max(stopModello, rigaPrezzo >= 0 ? rigaPrezzo : start + 3));
        for (let i = start; i < fine; i++) righe[i].filter(c => c.x < 110).forEach(c => frammenti.push(c.s));
        const modello = frammenti.join(" ").replace(/\s+/g, " ").trim();
        if (!modello || modello.length < 3) continue;
        const piani = new Map<string, { mesi: number; rata: number; anticipo?: number }>();
        for (let i = start; i < end; i++) {
            const rata = righe[i].find(x => x.x >= 340 && x.x <= 360);
            const tot = righe[i].find(x => x.x >= 370 && x.x <= 395);
            const ant = righe[i].find(x => x.x >= 308 && x.x <= 335);
            const vr = rata ? num(rata.s) : null, vt = tot ? num(tot.s) : null, va = ant ? num(ant.s) : null;
            if (!vr || !vt || vr <= 0) continue;
            const mesi = Math.round(vt / vr);
            if (mesi < 2 || mesi > 60) continue;
            piani.set(`${mesi}|${vr}|${va || 0}`, { mesi, rata: vr, ...(va ? { anticipo: va } : {}) });
        }
        voci.push({ modello, prezzo, rate: [...piani.values()] });
    }
    return voci.filter(v => v.prezzo != null);
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
    const [col, setCol] = useState<{ modello: number; prezzo: number; rata: number; mesi: number; anticipo: number; margine: number }>({ modello: -1, prezzo: -1, rata: -1, mesi: -1, anticipo: -1, margine: -1 });
    const [busy, setBusy] = useState(false);
    const [errore, setErrore] = useState("");
    // listino a BLOCCHI riconosciuto: niente mappatura colonne, voci pronte
    const [vociBlocchi, setVociBlocchi] = useState<VoceListino[] | null>(null);
    const [forzaColonne, setForzaColonne] = useState(false);
    // margine sul prezzo al pubblico (Luca: "sul prezzo calcoliamo il 4%")
    const [margine, setMargine] = useState("4");
    // DUE LISTINI (Luca 05/08): "ordinabili" = telefoni in vigore acquistabili;
    // "magazzino" = non più ordinabili ma rateizzabili se ancora a stock.
    // L'unicità è per (brand, modello, lista): un caricamento non tocca l'altro.
    const [lista, setLista] = useState<"ordinabili" | "magazzino">("ordinabili");
    const [fatto, setFatto] = useState<null | { voci: number; conRate: number }>(null);

    const leggiFile = async (f: File) => {
        setErrore(""); setFatto(null); setFile(f); setVociBlocchi(null); setForzaColonne(false);
        try {
            let rows: RigaGrezza[];
            if (f.name.toLowerCase().endsWith(".pdf")) {
                const rp = await righePdf(f);
                if (!rp.length) { setErrore("Nessun testo nel PDF: se è una scansione (immagine) non è leggibile, serve il PDF originale del portale."); return; }
                const blocchi = parseBlocchi(rp);
                if (blocchi.length >= 3) { setVociBlocchi(blocchi); setRighe([]); return; }
                rows = grigliaDaPdf(rp);
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
                margine: indovinaColonna(headers, KEYWORDS.margine),
            });
        } catch (e) {
            setErrore("Non riesco a leggere il file: " + (e instanceof Error ? e.message : "formato non riconosciuto"));
        }
    };

    const headers = useMemo(() => (righe[headerIdx] || []).map((c, i) => String(c ?? `colonna ${i + 1}`)), [righe, headerIdx]);

    // righe dati → voci normalizzate (stesso modello = piani rata accumulati)
    const voci = useMemo<VoceListino[]>(() => {
        if (vociBlocchi && !forzaColonne) return vociBlocchi;
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
            // margine dal file: 0,05 e' una frazione → 5%; 5 e' gia' percentuale
            let margine = col.margine >= 0 ? parseEuro(r[col.margine]) : null;
            if (margine != null && margine > 0 && margine <= 1) margine = Math.round(margine * 10000) / 100;
            const k = modello.toLowerCase();
            const v: VoceListino = per.get(k) || { modello, prezzo: null, rate: [], margine: null };
            if (prezzo != null && v.prezzo == null) v.prezzo = prezzo;
            if (margine != null && v.margine == null) v.margine = margine;
            if (rata != null && mesi > 0) v.rate.push({ mesi, rata, ...(anticipo != null && anticipo > 0 ? { anticipo } : {}) });
            per.set(k, v);
        }
        return [...per.values()];
    }, [righe, headerIdx, col, vociBlocchi, forzaColonne]);

    const importa = async () => {
        if (busy || !voci.length) return;
        setBusy(true); setErrore("");
        try {
            const mrg = Math.max(0, parseFloat(String(margine).replace(",", ".")) || 0);
            const rows = voci.map(v => ({
                brand: brandName, modello: v.modello, prezzo: v.prezzo, lista,
                rate: v.rate, margine_pct: v.margine != null && v.margine > 0 ? v.margine : mrg,
                fonte: file?.name || "", aggiornato_da: gestore,
                aggiornato_il: new Date().toISOString(),
            }));
            for (let i = 0; i < rows.length; i += 500) {
                const { error } = await supabase.from("listini_terminali")
                    .upsert(rows.slice(i, i + 500), { onConflict: "brand,modello,lista" });
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
                            <p className="text-sm text-slate-400">{fatto.voci} modelli aggiornati · {fatto.conRate} con piani rata · margine {margine}% · fonte: {file?.name}</p>
                            <p className="text-xs text-slate-500">I prezzi compaiono sotto le tendine “Modello Terminale” di Registra Vendita.</p>
                            <button onClick={onClose} className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold">Chiudi</button>
                        </div>
                    ) : (
                        <>
                            {/* quale dei DUE listini si sta caricando (Luca 05/08) */}
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Quale listino?</span>
                                {([["ordinabili", "📦 Ordinabili (in vigore)"], ["magazzino", "🏬 Magazzino — non ordinabili, rateizzabili"]] as const).map(([id, lab]) => (
                                    <button key={id} type="button" onClick={() => setLista(id)}
                                        className={cn("px-3 py-1.5 rounded-full border text-xs font-bold transition-all",
                                            lista === id ? "border-emerald-500 bg-emerald-500/10 text-emerald-300" : "border-white/10 text-slate-400 hover:border-white/25")}>
                                        {lab}
                                    </button>
                                ))}
                            </div>
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
                            {/* Il CRM sa gia' leggere i due formati che usiamo: nessun
                                intervento tecnico per gli aggiornamenti periodici. */}
                            <div className="text-[11px] text-slate-500 leading-relaxed rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                                <b className="text-slate-400">Formati già riconosciuti</b><br />
                                • <b>Vodafone</b> — PDF a blocchi: prende il <i>prezzo al pubblico</i> di ogni riquadro (non il “risparmio”) e ricava i piani rata.<br />
                                • <b>WindTre</b> — Excel “Prodotti ordinabili”: colonna <i>Prodotto</i>, prezzo da <i>SP Cash</i>, margine dalla colonna <i>Sconto</i>.<br />
                                Basta ricaricare il file aggiornato: i modelli già presenti vengono sovrascritti, i nuovi aggiunti. Per formati diversi si mappano le colonne a mano.
                            </div>
                            <div className="hidden">
                            </div>
                            {errore && <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-xl px-3 py-2">{errore}</p>}
                            {vociBlocchi && !forzaColonne && (
                                <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
                                    <p className="text-sm text-emerald-200">
                                        ✅ Listino a blocchi riconosciuto: <b>{vociBlocchi.length} modelli</b> col prezzo al pubblico
                                        {vociBlocchi.filter(v => v.rate.length).length ? ` · ${vociBlocchi.filter(v => v.rate.length).length} con piani rata` : ""}
                                    </p>
                                    <button onClick={() => setForzaColonne(true)} className="text-[11px] text-slate-400 hover:text-white underline">mappa le colonne a mano</button>
                                </div>
                            )}
                            {(vociBlocchi || righe.length > 0) && (
                                <div className="flex items-end gap-3 flex-wrap">
                                    <label className="text-xs text-slate-400 flex flex-col gap-1">
                                        <span className="font-bold uppercase tracking-wider text-[10px] text-slate-500">Margine % sul prezzo</span>
                                        <input value={margine} onChange={e => setMargine(e.target.value.replace(/[^0-9.,]/g, ""))}
                                            className="glass-input text-sm rounded-lg py-1.5 px-2 w-24 font-mono" inputMode="decimal" />
                                    </label>
                                    <p className="text-[11px] text-slate-500 pb-2">
                                        Quanto guadagniamo sul prezzo: compare in Registra Vendita accanto al listino.
                                        {voci.some(v => v.margine) ? " Il file porta gia' la sua percentuale: questa vale solo per i modelli che ne sono privi." : ""}
                                    </p>
                                </div>
                            )}
                            {(righe.length > 0 && (!vociBlocchi || forzaColonne)) && (
                                <>
                                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                                        <SelCol campo="modello" label="Modello *" />
                                        <SelCol campo="prezzo" label="Prezzo listino" />
                                        <SelCol campo="rata" label="Importo rata" />
                                        <SelCol campo="mesi" label="N. mesi/rate" />
                                        <SelCol campo="anticipo" label="Anticipo" />
                                        <SelCol campo="margine" label="Sconto/margine %" />
                                    </div>
                                    {col.modello < 0 && <p className="text-sm text-amber-300">Scegli almeno la colonna del <b>modello</b>.</p>}
                                </>
                            )}
                            {voci.length > 0 && (
                                <>
                                    {(
                                        <div className="rounded-xl border border-white/10 overflow-hidden">
                                            <div className="px-3 py-2 bg-white/[0.04] text-[11px] font-bold uppercase tracking-wider text-slate-400">Anteprima — {voci.length} modelli riconosciuti</div>
                                            <div className="max-h-64 overflow-y-auto divide-y divide-white/5">
                                                {voci.slice(0, 15).map(v => (
                                                    <div key={v.modello} className="px-3 py-2 flex items-center gap-3 text-sm">
                                                        <span className="flex-1 text-slate-100 truncate">{v.modello}</span>
                                                        <span className="text-emerald-300 font-mono font-bold">{v.prezzo != null ? "€ " + v.prezzo.toLocaleString("it-IT", { minimumFractionDigits: 2 }) : "—"}</span>
                                                        <span className="text-[11px] text-slate-500">{v.margine ? `margine ${v.margine}% · ` : ""}{v.rate.length ? v.rate.map(r => `${r.mesi}×€${r.rata.toLocaleString("it-IT", { minimumFractionDigits: 2 })}${r.anticipo ? ` +ant.€${r.anticipo}` : ""}`).join(" / ") : "senza rate"}</span>
                                                    </div>
                                                ))}
                                                {voci.length > 15 && <div className="px-3 py-2 text-[11px] text-slate-500">…e altri {voci.length - 15} modelli</div>}
                                            </div>
                                        </div>
                                    )}
                                    <button onClick={importa} disabled={busy || !voci.length}
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
