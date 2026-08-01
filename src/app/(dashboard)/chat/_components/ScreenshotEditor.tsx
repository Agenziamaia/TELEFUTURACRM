"use client";

/* EDITOR SCREENSHOT (Luca 02/08) — stile WhatsApp: dopo la cattura si puo'
   RITAGLIARE un'area (tratteggio classico) e ANNOTARE con matita, cerchio,
   rettangolo e freccia in tre colori, con Annulla passo-passo. "Allega"
   produce il PNG finale che finisce tra gli allegati del messaggio.
   Tutto su canvas, zero dipendenze. */

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Undo2, Check, Crop, Pencil, Circle as CircleIcon, Square, MoveUpRight } from "lucide-react";

type Strumento = "matita" | "cerchio" | "rettangolo" | "freccia";
type Tratto = { tipo: Strumento; colore: string; punti: { x: number; y: number }[] };

const COLORI = ["#ef4444", "#facc15", "#3b82f6"];

export function ScreenshotEditor({ src, iniziaInRitaglio, onDone, onCancel }: {
    src: string; iniziaInRitaglio?: boolean;
    onDone: (file: File) => void; onCancel: () => void;
}) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [img, setImg] = useState<HTMLImageElement | null>(null);
    const [tratti, setTratti] = useState<Tratto[]>([]);
    const [strumento, setStrumento] = useState<Strumento>("matita");
    const [colore, setColore] = useState(COLORI[0]);
    const [ritaglio, setRitaglio] = useState(!!iniziaInRitaglio);
    const [selezione, setSelezione] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
    const drawing = useRef(false);

    useEffect(() => {
        const i = new Image();
        i.onload = () => setImg(i);
        i.src = src;
    }, [src]);

    const disegnaTratto = (ctx: CanvasRenderingContext2D, t: Tratto) => {
        ctx.strokeStyle = t.colore; ctx.lineWidth = Math.max(3, ctx.canvas.width / 300); ctx.lineCap = "round"; ctx.lineJoin = "round";
        const p = t.punti; if (!p.length) return;
        const a = p[0], b = p[p.length - 1];
        ctx.beginPath();
        if (t.tipo === "matita") { ctx.moveTo(a.x, a.y); p.forEach(q => ctx.lineTo(q.x, q.y)); }
        else if (t.tipo === "rettangolo") ctx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
        else if (t.tipo === "cerchio") ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
        else if (t.tipo === "freccia") {
            ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
            const ang = Math.atan2(b.y - a.y, b.x - a.x), L = Math.max(14, ctx.canvas.width / 60);
            ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - L * Math.cos(ang - 0.5), b.y - L * Math.sin(ang - 0.5));
            ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - L * Math.cos(ang + 0.5), b.y - L * Math.sin(ang + 0.5));
        }
        ctx.stroke();
    };

    const ridisegna = useCallback(() => {
        const c = canvasRef.current; if (!c || !img) return;
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        tratti.forEach(t => disegnaTratto(ctx, t));
        if (ritaglio && selezione) {
            const { x1, y1, x2, y2 } = selezione;
            const x = Math.min(x1, x2), y = Math.min(y1, y2), w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
            ctx.save();
            ctx.fillStyle = "rgba(0,0,0,0.45)";
            ctx.beginPath(); ctx.rect(0, 0, c.width, c.height); ctx.rect(x, y, w, h); ctx.fill("evenodd");
            ctx.setLineDash([10, 7]); ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(2, c.width / 500);
            ctx.strokeRect(x, y, w, h);
            ctx.restore();
        }
    }, [img, tratti, ritaglio, selezione]);
    useEffect(() => { ridisegna(); }, [ridisegna]);

    const coord = (e: React.PointerEvent) => {
        const c = canvasRef.current!; const r = c.getBoundingClientRect();
        return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
    };
    const giu = (e: React.PointerEvent) => {
        drawing.current = true;
        const p = coord(e);
        if (ritaglio) setSelezione({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
        else setTratti(t => [...t, { tipo: strumento, colore, punti: [p] }]);
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };
    const muovi = (e: React.PointerEvent) => {
        if (!drawing.current) return;
        const p = coord(e);
        if (ritaglio) setSelezione(s => s ? { ...s, x2: p.x, y2: p.y } : s);
        else setTratti(t => { const u = [...t]; const ult = u[u.length - 1]; if (!ult) return t; u[u.length - 1] = { ...ult, punti: strumento === "matita" ? [...ult.punti, p] : [ult.punti[0], p] }; return u; });
    };
    const su = () => { drawing.current = false; };

    const applicaRitaglio = () => {
        if (!selezione || !img) { setRitaglio(false); return; }
        const { x1, y1, x2, y2 } = selezione;
        const x = Math.max(0, Math.min(x1, x2)), y = Math.max(0, Math.min(y1, y2));
        const w = Math.min(img.naturalWidth - x, Math.abs(x2 - x1)), h = Math.min(img.naturalHeight - y, Math.abs(y2 - y1));
        if (w < 10 || h < 10) { setRitaglio(false); setSelezione(null); return; }
        const tmp = document.createElement("canvas");
        tmp.width = w; tmp.height = h;
        tmp.getContext("2d")!.drawImage(img, x, y, w, h, 0, 0, w, h);
        const nuova = new Image();
        nuova.onload = () => { setImg(nuova); setTratti([]); setSelezione(null); setRitaglio(false); };
        nuova.src = tmp.toDataURL("image/png");
    };

    const allega = () => {
        const c = canvasRef.current; if (!c) return;
        // esporta SENZA l'overlay del ritaglio
        const era = ritaglio; setRitaglio(false); setSelezione(null);
        setTimeout(() => {
            c.toBlob((blob) => {
                if (blob) onDone(new File([blob], `screenshot-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`, { type: "image/png" }));
                else if (era) setRitaglio(true);
            }, "image/png");
        }, 30);
    };

    const STRUMENTI: { id: Strumento; Icon: typeof Pencil; titolo: string }[] = [
        { id: "matita", Icon: Pencil, titolo: "Matita libera" },
        { id: "cerchio", Icon: CircleIcon, titolo: "Cerchia" },
        { id: "rettangolo", Icon: Square, titolo: "Rettangolo" },
        { id: "freccia", Icon: MoveUpRight, titolo: "Freccia" },
    ];

    return (
        <div className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-sm flex flex-col" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
            <div className="flex items-center gap-2 p-3 bg-[#0f111a]/95 border-b border-white/10 flex-wrap">
                <span className="text-sm font-bold text-white mr-2">✏️ Modifica screenshot</span>
                {STRUMENTI.map(({ id, Icon, titolo }) => (
                    <button key={id} title={titolo} onClick={() => { setRitaglio(false); setStrumento(id); }}
                        className={`p-2 rounded-lg border ${!ritaglio && strumento === id ? "bg-indigo-500/25 border-indigo-400/60 text-indigo-200" : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"}`}>
                        <Icon className="w-4 h-4" />
                    </button>
                ))}
                <button title="Ritaglia un'area (tratteggio)" onClick={() => { setRitaglio(v => !v); setSelezione(null); }}
                    className={`p-2 rounded-lg border ${ritaglio ? "bg-amber-500/25 border-amber-400/60 text-amber-200" : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"}`}>
                    <Crop className="w-4 h-4" />
                </button>
                <span className="w-px h-6 bg-white/10 mx-1" />
                {COLORI.map(c => (
                    <button key={c} onClick={() => setColore(c)} title="Colore"
                        className={`w-7 h-7 rounded-full border-2 ${colore === c ? "border-white scale-110" : "border-white/20"}`} style={{ background: c }} />
                ))}
                <span className="w-px h-6 bg-white/10 mx-1" />
                <button title="Annulla ultimo tratto" onClick={() => setTratti(t => t.slice(0, -1))} disabled={!tratti.length}
                    className="p-2 rounded-lg border bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 disabled:opacity-40"><Undo2 className="w-4 h-4" /></button>
                <span className="flex-1" />
                {ritaglio && selezione && (
                    <button onClick={applicaRitaglio} className="px-3 py-2 rounded-lg bg-amber-500 text-black text-xs font-black">✂ Applica ritaglio</button>
                )}
                <button onClick={allega} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold flex items-center gap-1.5"><Check className="w-4 h-4" /> Allega</button>
                <button onClick={onCancel} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-auto flex items-center justify-center p-4">
                <canvas ref={canvasRef}
                    onPointerDown={giu} onPointerMove={muovi} onPointerUp={su} onPointerLeave={su}
                    className="max-w-full max-h-full rounded-lg shadow-2xl touch-none"
                    style={{ cursor: ritaglio ? "crosshair" : "crosshair" }} />
            </div>
            <p className="text-center text-[11px] text-slate-500 pb-2">{ritaglio ? "Trascina per selezionare l'area, poi «Applica ritaglio»" : "Disegna sull'immagine — Annulla toglie l'ultimo tratto"}</p>
        </div>
    );
}
