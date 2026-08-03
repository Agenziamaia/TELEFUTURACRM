"use client";

/*
 * Editor PDF in-app (richiesta Francesco 03/08/2026): compilare a video i moduli
 * (disdette, moduli WindTre…) invece di stamparli in bianco e riempirli a mano.
 *
 * Come funziona:
 *  - le pagine del PDF vengono disegnate con pdf.js su <canvas> (nitide, scala 2×);
 *  - sopra ogni pagina c'e' un livello trasparente su cui l'utente APPOGGIA
 *    caselle di TESTO e SPUNTE (✓), spostabili al pixel per allinearle a righe e
 *    spazi del modulo;
 *  - "Stampa"/"Scarica": le annotazioni vengono STAMPATE dentro il PDF originale
 *    con pdf-lib (testo vettoriale vero, non uno screenshot), pronto da firmare.
 *
 * Le posizioni sono salvate in PERCENTUALE della pagina, cosi' restano corrette a
 * qualunque zoom e in stampa (mappate poi in punti PDF, origine in basso a sx).
 */

import { useEffect, useRef, useState, useCallback } from "react";
import {
  X, Type, CheckSquare, MousePointer2, Printer, Download,
  Trash2, ZoomIn, ZoomOut, Loader2, Minus, Plus, Undo2,
} from "lucide-react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

type Anno = {
  id: string;
  page: number;      // 0-based
  type: "text" | "check";
  xPct: number;      // left  come frazione della larghezza pagina (0..1), origine alto-sx
  yPct: number;      // top   come frazione dell'altezza pagina
  text?: string;     // solo per il testo
  sizePct: number;   // dimensione (font o lato spunta) come frazione dell'altezza pagina
};

type PageDim = { w: number; h: number };   // in PUNTI PDF (viewport a scala 1)

const RENDER_SCALE = 2;        // risoluzione canvas (nitidezza)
const DEFAULT_TEXT_SIZE = 0.017;  // ~14pt su A4 (842pt)
const DEFAULT_CHECK_SIZE = 0.020;
let _uid = 0;
const uid = () => `a${Date.now().toString(36)}${_uid++}`;

export default function PdfFillEditor({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [dims, setDims] = useState<PageDim[]>([]);
  const [zoom, setZoom] = useState(1.15);        // px per punto PDF a video
  const [tool, setTool] = useState<"select" | "text" | "check">("select");
  const [annos, setAnnos] = useState<Anno[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const bytesRef = useRef<Uint8Array | null>(null);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const pageBoxRefs = useRef<(HTMLDivElement | null)[]>([]);
  const drag = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null);

  // ── carica + disegna il PDF ────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true); setErr(null);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`impossibile scaricare il PDF (${res.status})`);
        const raw = new Uint8Array(await res.arrayBuffer());
        bytesRef.current = raw;

        const pdfjs: any = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        // copia dei byte per pdf.js (che puo' "detachare" il buffer)
        const doc = await pdfjs.getDocument({ data: raw.slice() }).promise;
        const nextDims: PageDim[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const vp1 = page.getViewport({ scale: 1 });
          nextDims.push({ w: vp1.width, h: vp1.height });
        }
        if (!alive) return;
        setDims(nextDims);
        setLoading(false);
        // disegno dopo il mount dei canvas
        requestAnimationFrame(async () => {
          for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i);
            const vp = page.getViewport({ scale: RENDER_SCALE });
            const cv = canvasRefs.current[i - 1];
            if (!cv) continue;
            cv.width = Math.floor(vp.width);
            cv.height = Math.floor(vp.height);
            const ctx = cv.getContext("2d");
            if (!ctx) continue;
            await page.render({ canvasContext: ctx, viewport: vp }).promise;
          }
        });
      } catch (e: any) {
        if (alive) { setErr(e?.message || "Errore nel caricamento del PDF"); setLoading(false); }
      }
    })();
    return () => { alive = false; };
  }, [url]);

  const selected = annos.find((a) => a.id === selId) || null;

  const patch = useCallback((id: string, p: Partial<Anno>) => {
    setAnnos((prev) => prev.map((a) => (a.id === id ? { ...a, ...p } : a)));
  }, []);
  const remove = useCallback((id: string) => {
    setAnnos((prev) => prev.filter((a) => a.id !== id));
    setSelId((s) => (s === id ? null : s));
  }, []);

  // ── posiziona un nuovo elemento cliccando sulla pagina ─────────────────────
  const onPageClick = (e: React.MouseEvent, pageIdx: number) => {
    if (tool === "select") return;
    const box = pageBoxRefs.current[pageIdx];
    if (!box) return;
    const r = box.getBoundingClientRect();
    const xPct = (e.clientX - r.left) / r.width;
    const yPct = (e.clientY - r.top) / r.height;
    const id = uid();
    if (tool === "text") {
      setAnnos((p) => [...p, { id, page: pageIdx, type: "text", xPct, yPct, text: "", sizePct: DEFAULT_TEXT_SIZE }]);
    } else {
      setAnnos((p) => [...p, { id, page: pageIdx, type: "check", xPct, yPct, text: "x", sizePct: DEFAULT_CHECK_SIZE }]);
    }
    setSelId(id);
    setTool("select");
    // focus sul testo appena creato
    if (tool === "text") setTimeout(() => document.getElementById(id)?.focus(), 30);
  };

  // ── drag di un elemento (in modalita' Seleziona) ───────────────────────────
  const onAnnoPointerDown = (e: React.PointerEvent, a: Anno) => {
    if (tool !== "select") return;
    e.stopPropagation();
    setSelId(a.id);
    const box = pageBoxRefs.current[a.page];
    if (!box) return;
    const r = box.getBoundingClientRect();
    drag.current = { id: a.id, dx: e.clientX - (r.left + a.xPct * r.width), dy: e.clientY - (r.top + a.yPct * r.height), moved: false };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onAnnoPointerMove = (e: React.PointerEvent, a: Anno) => {
    const d = drag.current;
    if (!d || d.id !== a.id) return;
    const box = pageBoxRefs.current[a.page];
    if (!box) return;
    const r = box.getBoundingClientRect();
    d.moved = true;
    const xPct = Math.min(1, Math.max(0, (e.clientX - d.dx - r.left) / r.width));
    const yPct = Math.min(1, Math.max(0, (e.clientY - d.dy - r.top) / r.height));
    patch(a.id, { xPct, yPct });
  };
  const onAnnoPointerUp = (e: React.PointerEvent) => {
    drag.current = null;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  const changeSize = (delta: number) => {
    if (!selected) return;
    patch(selected.id, { sizePct: Math.min(0.08, Math.max(0.006, selected.sizePct + delta)) });
  };

  // ── STAMPA le annotazioni dentro il PDF originale (pdf-lib) ─────────────────
  const buildFilled = useCallback(async (): Promise<Uint8Array> => {
    const base = bytesRef.current;
    if (!base) throw new Error("PDF non caricato");
    const pdf = await PDFDocument.load(base.slice());
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const pages = pdf.getPages();
    const safe = (s: string) => { try { font.widthOfTextAtSize(s, 10); return s; } catch { return s.replace(/[^\x00-\xFF]/g, ""); } };
    for (const a of annos) {
      const pg = pages[a.page];
      if (!pg) continue;
      const { width, height } = pg.getSize();
      const size = a.sizePct * height;
      const xTop = a.xPct * width;
      const yTop = height - a.yPct * height; // origine PDF in basso: converto il "top"
      if (a.type === "text" && a.text) {
        // Il testo a video ha line-height 1.2: c'e' un mezzo-interlinea sopra
        // (~0.1em) + l'ascent (~0.78em) → la baseline della 1ª riga sta ~0.88em
        // sotto il top del box. Stesso modello in stampa = allineamento coerente.
        let y = yTop - size * 0.88;
        for (const ln of a.text.split("\n")) {
          const t = safe(ln);
          if (t) pg.drawText(t, { x: xTop, y, size, font, color: rgb(0, 0, 0) });
          y -= size * 1.2;
        }
      } else if (a.type === "check") {
        // spunta disegnata a due segmenti (✓ non e' in WinAnsi): sempre stampabile
        const th = Math.max(1, size * 0.10);
        pg.drawLine({ start: { x: xTop, y: yTop - size * 0.55 }, end: { x: xTop + size * 0.33, y: yTop - size * 0.92 }, thickness: th, color: rgb(0, 0, 0) });
        pg.drawLine({ start: { x: xTop + size * 0.33, y: yTop - size * 0.92 }, end: { x: xTop + size * 0.95, y: yTop - size * 0.12 }, thickness: th, color: rgb(0, 0, 0) });
      }
    }
    return pdf.save();
  }, [annos]);

  const download = async () => {
    try {
      setBusy(true);
      const out = await buildFilled();
      const blob = new Blob([out as BlobPart], { type: "application/pdf" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = (name || "modulo").replace(/\.pdf$/i, "") + " - compilato.pdf";
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 4000);
    } catch (e: any) { setErr(e?.message || "Errore in fase di salvataggio"); }
    finally { setBusy(false); }
  };

  const print = async () => {
    // apro la scheda SUBITO (gesto utente) per non farla bloccare dal popup
    // blocker, poi ci carico il PDF compilato quando e' pronto.
    const win = window.open("", "_blank");
    try {
      setBusy(true);
      const out = await buildFilled();
      const blob = new Blob([out as BlobPart], { type: "application/pdf" });
      const href = URL.createObjectURL(blob);
      if (win) { win.location.href = href; }
      else { const a = document.createElement("a"); a.href = href; a.target = "_blank"; a.click(); }
      setTimeout(() => URL.revokeObjectURL(href), 60000);
    } catch (e: any) { win?.close(); setErr(e?.message || "Errore in fase di stampa"); }
    finally { setBusy(false); }
  };

  const toolBtn = (active: boolean) =>
    `flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border transition-colors ${
      active ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-300" : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
    }`;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/80 backdrop-blur-sm">
      {/* Barra strumenti */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-[#0f111a] flex-wrap">
        <span className="font-bold text-white mr-2 truncate max-w-[240px]" title={name}>{name}</span>

        <div className="flex items-center gap-1.5 mr-1">
          <button onClick={() => setTool("select")} className={toolBtn(tool === "select")} title="Seleziona e sposta">
            <MousePointer2 className="w-4 h-4" /> Sposta
          </button>
          <button onClick={() => setTool("text")} className={toolBtn(tool === "text")} title="Aggiungi testo: poi clicca dove scrivere">
            <Type className="w-4 h-4" /> Testo
          </button>
          <button onClick={() => setTool("check")} className={toolBtn(tool === "check")} title="Aggiungi spunta ✓: poi clicca sulla casella">
            <CheckSquare className="w-4 h-4" /> Spunta
          </button>
        </div>

        {/* Dimensione elemento selezionato */}
        {selected && (
          <div className="flex items-center gap-1 mr-1 pl-2 border-l border-white/10">
            <span className="text-xs text-slate-400 mr-1">Dimensione</span>
            <button onClick={() => changeSize(-0.003)} className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10"><Minus className="w-3.5 h-3.5" /></button>
            <button onClick={() => changeSize(0.003)} className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10"><Plus className="w-3.5 h-3.5" /></button>
            <button onClick={() => remove(selected.id)} className="p-1.5 ml-1 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-400 hover:bg-rose-500/25" title="Elimina elemento"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        )}

        <div className="flex items-center gap-1 pl-2 border-l border-white/10">
          <button onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.15).toFixed(2)))} className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10"><ZoomOut className="w-4 h-4" /></button>
          <span className="text-xs text-slate-400 w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))} className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10"><ZoomIn className="w-4 h-4" /></button>
        </div>

        {annos.length > 0 && (
          <button onClick={() => { setAnnos([]); setSelId(null); }} className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 ml-1" title="Cancella tutte le annotazioni">
            <Undo2 className="w-3.5 h-3.5" /> Pulisci
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button onClick={download} disabled={busy || loading} className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold bg-white/5 border border-white/10 text-white hover:bg-white/10 disabled:opacity-50">
            <Download className="w-4 h-4" /> Scarica
          </button>
          <button onClick={print} disabled={busy || loading} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-500 hover:bg-indigo-600 text-white disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />} Stampa
          </button>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-slate-400"><X className="w-5 h-5" /></button>
        </div>
      </div>

      {/* Suggerimento */}
      <div className="px-4 py-1.5 text-[11px] text-slate-400 bg-[#0f111a]/70 border-b border-white/5">
        {tool === "text" && "Clicca sul modulo dove vuoi scrivere, poi digita. In « Sposta » trascini il testo per allinearlo alle righe."}
        {tool === "check" && "Clicca sulla casella da spuntare. In « Sposta » puoi riposizionare la ✓."}
        {tool === "select" && "Trascina testo e spunte per allinearli. Seleziona un elemento per cambiarne la dimensione o eliminarlo. Poi « Stampa »."}
      </div>

      {/* Area pagine */}
      <div className="flex-1 overflow-auto p-6 flex flex-col items-center gap-6">
        {loading && (
          <div className="flex items-center gap-3 text-slate-300 mt-20"><Loader2 className="w-6 h-6 animate-spin" /> Caricamento del documento…</div>
        )}
        {err && (
          <div className="mt-20 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm max-w-md text-center">{err}</div>
        )}
        {!loading && !err && dims.map((d, pi) => {
          const wPx = d.w * zoom;
          const hPx = d.h * zoom;
          return (
            <div
              key={pi}
              ref={(el) => { pageBoxRefs.current[pi] = el; }}
              onClick={(e) => onPageClick(e, pi)}
              className="relative shadow-2xl bg-white shrink-0"
              style={{ width: wPx, height: hPx, cursor: tool === "select" ? "default" : "crosshair" }}
            >
              <canvas ref={(el) => { canvasRefs.current[pi] = el; }} style={{ width: wPx, height: hPx, display: "block" }} />
              {/* annotazioni della pagina */}
              {annos.filter((a) => a.page === pi).map((a) => {
                const isSel = a.id === selId;
                const fontPx = a.sizePct * hPx;
                if (a.type === "text") {
                  return (
                    <div key={a.id}>
                      {/* corpo del testo: si clicca per scrivere (caret libero) */}
                      <div
                        id={a.id}
                        contentEditable
                        suppressContentEditableWarning
                        spellCheck={false}
                        onClick={(e) => e.stopPropagation()}
                        onFocus={() => setSelId(a.id)}
                        onInput={(e) => patch(a.id, { text: (e.target as HTMLElement).innerText })}
                        style={{
                          position: "absolute",
                          left: a.xPct * wPx,
                          top: a.yPct * hPx,
                          fontSize: fontPx,
                          lineHeight: 1.2,
                          fontFamily: "Helvetica, Arial, sans-serif",
                          color: "#000",
                          whiteSpace: "pre",
                          outline: isSel ? "1.5px dashed #6366f1" : "1px solid transparent",
                          outlineOffset: 2,
                          background: isSel ? "rgba(99,102,241,0.06)" : "transparent",
                          cursor: "text",
                          minWidth: 6,
                          padding: 0,
                        }}
                      />
                      {/* maniglia per spostare (compare quando selezionato) */}
                      {isSel && (
                        <div
                          onPointerDown={(e) => onAnnoPointerDown(e, a)}
                          onPointerMove={(e) => onAnnoPointerMove(e, a)}
                          onPointerUp={onAnnoPointerUp}
                          onClick={(e) => e.stopPropagation()}
                          title="Trascina per spostare"
                          style={{
                            position: "absolute",
                            left: a.xPct * wPx - 18,
                            top: a.yPct * hPx - 2,
                            width: 16,
                            height: 16,
                            borderRadius: 4,
                            background: "#6366f1",
                            color: "#fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 11,
                            lineHeight: 1,
                            cursor: "move",
                            touchAction: "none",
                            userSelect: "none",
                            boxShadow: "0 1px 4px rgba(0,0,0,.4)",
                          }}
                        >✥</div>
                      )}
                    </div>
                  );
                }
                // spunta
                return (
                  <div
                    key={a.id}
                    onPointerDown={(e) => onAnnoPointerDown(e, a)}
                    onPointerMove={(e) => onAnnoPointerMove(e, a)}
                    onPointerUp={onAnnoPointerUp}
                    onClick={(e) => { e.stopPropagation(); setSelId(a.id); }}
                    style={{
                      position: "absolute",
                      left: a.xPct * wPx,
                      top: a.yPct * hPx,
                      width: fontPx,
                      height: fontPx,
                      cursor: tool === "select" ? "move" : "pointer",
                      outline: isSel ? "1.5px dashed #6366f1" : "none",
                      touchAction: "none",
                    }}
                  >
                    <svg viewBox="0 0 100 100" width={fontPx} height={fontPx} style={{ display: "block" }}>
                      <polyline points="12,52 38,84 92,14" fill="none" stroke="#000" strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
