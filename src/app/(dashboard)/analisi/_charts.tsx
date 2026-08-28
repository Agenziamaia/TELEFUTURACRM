// @ts-nocheck
"use client";

// PRIMITIVE GRAFICHE della sezione Analisi (Luca 20/08): tutte fatte in casa
// (SVG + CSS), zero librerie. REGOLE DI FAMIGLIA:
// · ogni tooltip è un PORTALE su document.body (mai fixed dentro una card:
//   i transform degli hover la trasformano in containing block — lezione
//   ChipSonda della Home) e si apre ISTANTANEO su hover/tap;
// · i numeri grossi salgono con un conteggio animato (rAF, ease-out);
// · niente Date.now nei render: le animazioni partono dal mount.

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/utils";

export const fmtN = (v, dec = 0) =>
    Number(v || 0).toLocaleString("it-IT", { minimumFractionDigits: dec, maximumFractionDigits: dec });
// punti: interi senza decimali, altrimenti 1-2 decimali "veri"
export const fmtPt = (v) => {
    const n = Math.round(Number(v || 0) * 100) / 100;
    return n % 1 === 0 ? fmtN(n) : fmtN(n, Math.round(n * 10) % 10 === 0 ? 1 : 2);
};
// valore venduto: euro pieni (il dettaglio ai centesimi qui non serve)
export const fmtEuro = (v) => `${fmtN(Math.round(Number(v) || 0))} €`;

/* ── conteggio animato ─────────────────────────────────────────────────── */
export function useCountUp(value, dur = 850) {
    const [n, setN] = useState(0);
    const prev = useRef(0);
    useEffect(() => {
        const from = prev.current, to = Number(value) || 0;
        prev.current = to;
        if (from === to) { setN(to); return; }
        let raf; const t0 = performance.now();
        const step = (t) => {
            const k = Math.min(1, (t - t0) / dur);
            const e = 1 - Math.pow(1 - k, 3);
            setN(from + (to - from) * e);
            if (k < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [value, dur]);
    return n;
}

export function Num({ v, dec = 0, punti = false, euro = false, className }) {
    const n = useCountUp(v);
    return <span className={cn("tabular-nums", className)}>{euro ? fmtEuro(n) : punti ? fmtPt(n) : fmtN(n, dec)}</span>;
}

/* ── tooltip a portale (hover/tap istantaneo) ──────────────────────────── */
export function Tip({ children, tip, block = false, className, style }) {
    const [pos, setPos] = useState(null);
    // FLIP (Luca 27/08: il tooltip del day-by-day usciva dallo schermo in
    // alto): se sopra al cursore non c'è spazio per tutto il tip, si apre
    // SOTTO; e il centro resta dentro i bordi laterali
    const boxTip = useRef(null);
    const [flip, setFlip] = useState(false);
    useLayoutEffect(() => {
        if (!pos) { if (flip) setFlip(false); return; }
        const h = boxTip.current?.offsetHeight || 0;
        const vuole = pos.y - 14 - h < 8;
        if (vuole !== flip) setFlip(vuole);
    });
    const move = (e) => setPos({ x: e.clientX, y: e.clientY });
    const off = () => setPos(null);
    const vw = typeof window !== "undefined" ? window.innerWidth : 1600;
    const cx = pos ? Math.min(Math.max(pos.x, 165), vw - 165) : 0;
    return (
        <span
            className={cn(block ? "block" : "inline-flex", "cursor-default", className)} style={style}
            onMouseEnter={move} onMouseMove={move} onMouseLeave={off}
            onClick={(e) => (pos ? off() : move(e))}
        >
            {children}
            {pos && typeof document !== "undefined" && createPortal(
                <div ref={boxTip} className="fixed z-[9999] pointer-events-none an-scuro"
                    style={{ left: cx, top: flip ? pos.y + 18 : pos.y - 14, transform: flip ? "translate(-50%,0)" : "translate(-50%,-100%)" }}>
                    <div className="rounded-xl border border-white/15 bg-[#111527]/95 backdrop-blur-md px-3 py-2 shadow-2xl shadow-black/50 max-w-[300px] max-h-[calc(100vh-28px)] overflow-hidden">
                        {tip}
                    </div>
                </div>, document.body)}
        </span>
    );
}
export const TipRiga = ({ l, r, colore }) => (
    <div className="flex items-center justify-between gap-4 text-[11px] leading-5 whitespace-nowrap">
        <span className="text-slate-400 flex items-center gap-1.5">
            {colore && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colore }} />}{l}
        </span>
        <span className="font-bold text-white tabular-nums">{r}</span>
    </div>
);
export const TipTitolo = ({ children }) => (
    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1 whitespace-nowrap">{children}</p>
);

/* ── anello di soglia (progress ring animato) ──────────────────────────── */
export function Ring({ value, max, colore = "#818cf8", size = 132, centro, sotto, tip }) {
    const r = (size - 14) / 2, C = 2 * Math.PI * r;
    const [on, setOn] = useState(false);
    useEffect(() => { const t = setTimeout(() => setOn(true), 60); return () => clearTimeout(t); }, []);
    const k = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
    const uid = useId().replace(/[:]/g, "");
    const anello = (
        <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="9" />
                <defs>
                    <linearGradient id={`g${uid}`} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor={colore} stopOpacity=".55" />
                        <stop offset="100%" stopColor={colore} />
                    </linearGradient>
                </defs>
                <circle
                    cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#g${uid})`} strokeWidth="9"
                    strokeLinecap="round" strokeDasharray={C} strokeDashoffset={on ? C * (1 - k) : C}
                    style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(.22,1,.36,1)", filter: `drop-shadow(0 0 6px ${colore})` }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-3">{centro}</div>
        </div>
    );
    return (
        <div className="flex flex-col items-center gap-1.5">
            {tip ? <Tip tip={tip}>{anello}</Tip> : anello}
            {sotto}
        </div>
    );
}

/* ── area chart con crosshair (serie cumulata giorno per giorno) ───────── */
// serie: [{ x: label, y: number, det?: [{l,r,colore}] }]; ghost: seconda serie
// tratteggiata (es. mese scorso) sulla stessa scala; oggi: indice evidenziato.
export function AreaChart({ serie, ghost, oggi = -1, colore = "var(--tf-818cf8)", h = 170, unit = "pt" }) {
    const uid = useId().replace(/[:]/g, "");
    const ref = useRef(null);
    const [hov, setHov] = useState(null);   // { i, x, y } in coordinate client
    const W = 600, H = 150, PAD = 6;
    const maxY = Math.max(1, ...serie.map((p) => p.y), ...(ghost || []).map((p) => p.y));
    const px = (i, n) => PAD + (W - 2 * PAD) * (n <= 1 ? 0 : i / (n - 1));
    const py = (v) => H - PAD - (H - 2 * PAD) * (v / maxY);
    const liscia = (pts) => {
        if (pts.length < 2) return "";
        let d = `M ${pts[0][0]} ${pts[0][1]}`;
        for (let i = 1; i < pts.length; i++) {
            const p0 = pts[i - 1], p1 = pts[i], pm = pts[i - 2] || p0, p2 = pts[i + 1] || p1;
            const c1 = [p0[0] + (p1[0] - pm[0]) / 6, p0[1] + (p1[1] - pm[1]) / 6];
            const c2 = [p1[0] - (p2[0] - p0[0]) / 6, p1[1] - (p2[1] - p0[1]) / 6];
            d += ` C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${p1[0]} ${p1[1]}`;
        }
        return d;
    };
    const pts = serie.map((p, i) => [px(i, serie.length), py(p.y)]);
    const gpts = (ghost || []).map((p, i) => [px(i, (ghost || []).length), py(p.y)]);
    const linea = liscia(pts);
    const area = pts.length >= 2 ? `${linea} L ${pts[pts.length - 1][0]} ${H} L ${pts[0][0]} ${H} Z` : "";
    const [on, setOn] = useState(false);
    useEffect(() => { const t = setTimeout(() => setOn(true), 80); return () => clearTimeout(t); }, []);

    const muovi = (e) => {
        const box = ref.current?.getBoundingClientRect(); if (!box || !serie.length) return;
        const i = Math.max(0, Math.min(serie.length - 1, Math.round(((e.clientX - box.left) / box.width) * (serie.length - 1))));
        setHov({ i, x: box.left + (box.width * (serie.length <= 1 ? 0 : i / (serie.length - 1))), y: box.top + (pts[i][1] / H) * box.height });
    };
    return (
        <div ref={ref} className="relative w-full select-none" style={{ height: h }}
            onMouseMove={muovi} onMouseLeave={() => setHov(null)} onClick={muovi}>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full block">
                <defs>
                    <linearGradient id={`a${uid}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={colore} stopOpacity=".38" />
                        <stop offset="100%" stopColor={colore} stopOpacity="0" />
                    </linearGradient>
                </defs>
                {[0.25, 0.5, 0.75].map((k) => (
                    <line key={k} x1={PAD} x2={W - PAD} y1={H * k} y2={H * k} stroke="rgba(255,255,255,.05)" strokeWidth="1" />
                ))}
                {gpts.length >= 2 && <path d={liscia(gpts)} fill="none" stroke="rgba(255,255,255,.28)" strokeWidth="1.6" strokeDasharray="5 5" style={{ opacity: on ? 1 : 0, transition: "opacity .9s .3s" }} />}
                {area && <path d={area} fill={`url(#a${uid})`} style={{ opacity: on ? 1 : 0, transition: "opacity 1s .1s" }} />}
                {linea && (
                    <path d={linea} fill="none" stroke={colore} strokeWidth="2.6" strokeLinecap="round"
                        pathLength="1" strokeDasharray="1" strokeDashoffset={on ? 0 : 1}
                        style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(.22,1,.36,1)", filter: `drop-shadow(0 0 5px ${colore})` }} />
                )}
                {oggi >= 0 && oggi < pts.length && (
                    <circle cx={pts[oggi][0]} cy={pts[oggi][1]} r="4.5" fill={colore} stroke="#0b0e1c" strokeWidth="2" className="animate-pulse" />
                )}
                {hov && <line x1={pts[hov.i][0]} x2={pts[hov.i][0]} y1={PAD} y2={H - PAD} stroke="rgba(255,255,255,.3)" strokeWidth="1" />}
                {hov && <circle cx={pts[hov.i][0]} cy={pts[hov.i][1]} r="5" fill="#fff" stroke={colore} strokeWidth="3" />}
            </svg>
            {hov && typeof document !== "undefined" && createPortal(
                <div className="fixed z-[9999] pointer-events-none an-scuro" style={{ left: hov.x, top: hov.y - 14, transform: "translate(-50%,-100%)" }}>
                    <div className="rounded-xl border border-white/15 bg-[#111527]/95 backdrop-blur-md px-3 py-2 shadow-2xl shadow-black/50">
                        <TipTitolo>{serie[hov.i].x}</TipTitolo>
                        <TipRiga l={`totale`} r={`${fmtPt(serie[hov.i].y)} ${unit}`} colore={colore} />
                        {(serie[hov.i].det || []).map((d, j) => <TipRiga key={j} l={d.l} r={d.r} colore={d.colore} />)}
                        {ghost && ghost[hov.i] != null && <TipRiga l="mese scorso" r={`${fmtPt(ghost[hov.i].y)} ${unit}`} />}
                    </div>
                </div>, document.body)}
        </div>
    );
}

/* ── barre GIORNALIERE impilate per categoria (Luca 21/08: «il cumulato è
   un trend in crescita che non dice niente») ──────────────────────────────
   giorni: [{ n, label, tot, parti: [{ label, val, colore, sub? }] }]
   media: linea tratteggiata di riferimento (produzione media per giorno
   lavorativo); il giorno di OGGI pulsa e mostra il tratto che manca alla
   media come proiezione del giorno. */
export function BarStack({ giorni, oggi = -1, media = null, h = 180, unit = "pt", oraScatto = null }) {
    const [on, setOn] = useState(false);
    useEffect(() => { const t = setTimeout(() => setOn(true), 60); return () => clearTimeout(t); }, []);
    const max = Math.max(1, ...giorni.map((g) => g.tot), media || 0) * 1.08;
    // 🏆 record del periodo: un bersaglio quotidiano concreto (revisione 21/08)
    const record = giorni.reduce((mx, g, i) => (g.tot > (giorni[mx]?.tot || 0) ? i : mx), 0);
    const cRecord = giorni[record]?.tot > 0 ? record : -1;
    const ggDi = (g) => { const n = parseInt(String(g.label || "")); return Number.isFinite(n) ? n : g.n; };
    return (
        <div>
            <div className="relative w-full" style={{ height: h }}>
                {[0.25, 0.5, 0.75].map((k) => <div key={k} className="absolute left-0 right-0 border-t border-white/[.05] pointer-events-none" style={{ bottom: `${k * 100}%` }} />)}
                {media > 0 && (
                    <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ bottom: `${Math.min(96, (media / max) * 100)}%` }}>
                        <div className="border-t border-dashed border-white/30" />
                        <span className="absolute right-0 -top-4 text-[9px] font-bold text-slate-400 bg-[#0d1022]/70 px-1 rounded an-scuro">media {fmtPt(media)}/g</span>
                    </div>
                )}
                <div className="absolute inset-0 flex items-end gap-[3px]">
                    {giorni.map((g, i) => {
                        const manca = i === oggi && media > 0 && g.tot < media ? media - g.tot : 0;
                        return (
                            <Tip key={i} block className="flex-1 h-full flex flex-col justify-end min-w-0 group/bar" tip={
                                <div>
                                    <TipTitolo>{g.label}{i === oggi ? " · OGGI" : ""}{i === cRecord ? " · 🏆 record" : ""}</TipTitolo>
                                    <TipRiga l="totale" r={`${fmtPt(g.tot)} ${unit}`} />
                                    {g.parti.filter((p) => p.val > 0).map((p, j) => (
                                        <div key={j}>
                                            <TipRiga l={p.label} r={p.sub ? `${fmtPt(p.val)} ${unit} · ${p.sub}` : `${fmtPt(p.val)} ${unit}`} colore={p.colore} />
                                            {p.prodotti && <p className="text-[10px] text-slate-500 pl-3.5 max-w-[240px] leading-4">{p.prodotti}</p>}
                                        </div>
                                    ))}
                                    {manca > 0 && <TipRiga l="per stare in media" r={`+${fmtPt(manca)} ${unit}`} />}
                                    {!g.parti.length && <p className="text-[10px] text-slate-500">nessuna produzione</p>}
                                    {/* ORA DI SCATTO (Luca 26/08): quello di oggi si vede
                                        subito qui, ma entra in contatori, anelli e
                                        proiezioni solo allo scatto — quando la giornata
                                        viene considerata lavorata. Dirlo dove si guarda. */}
                                    {i === oggi && (
                                        <p className="text-[10px] text-amber-300/90 mt-1.5 pt-1.5 border-t border-white/10 max-w-[240px] leading-4">
                                            ⏳ Quello di oggi lo vedi già qui. Alle {oraScatto == null ? 19 : oraScatto}:00 la giornata viene contata come lavorata: entra nei contatori, negli anelli e nella produzione, e le proiezioni si aggiornano.
                                        </p>
                                    )}
                                </div>
                            }>
                                <div className="w-full flex flex-col justify-end h-full">
                                    {manca > 0 && (
                                        <div className="w-full rounded-t-[4px] border border-dashed border-white/25 bg-white/[.04] transition-all duration-700" style={{ height: on ? `${(manca / max) * 100}%` : 0 }} />
                                    )}
                                    <div className={cn("w-full flex flex-col-reverse overflow-hidden transition-all duration-700 ease-out group-hover/bar:brightness-125", manca > 0 ? "" : "rounded-t-[4px]", i === oggi && "ring-1 ring-white/60", i === cRecord && "ring-1 ring-amber-300/80")}
                                        style={{ height: on ? `${(g.tot / max) * 100}%` : "0%", minHeight: g.tot > 0 ? 3 : 0 }}>
                                        {g.parti.filter((p) => p.val > 0).map((p, j) => (
                                            <div key={j} className="w-full" style={{ height: `${(p.val / g.tot) * 100}%`, background: p.colore, boxShadow: `0 0 6px ${p.colore}44` }} />
                                        ))}
                                    </div>
                                </div>
                            </Tip>
                        );
                    })}
                </div>
            </div>
            <div className="flex gap-[3px] mt-1">
                {giorni.map((g, i) => (
                    <span key={i} className={cn("flex-1 text-center text-[8px] tabular-nums min-w-0", i === oggi ? "text-white font-black" : i === cRecord ? "text-amber-300 font-bold" : "text-slate-600", !(i === oggi || i === cRecord || ggDi(g) % 5 === 0 || i === 0) && "opacity-0")}>{ggDi(g)}</span>
                ))}
            </div>
        </div>
    );
}

/* ── classifica a barre (race bars) ────────────────────────────────────── */
export function RaceBars({ righe, unit = "pt", max: maxProp, vuoto = "Nessun dato nel periodo." }) {
    const [on, setOn] = useState(false);
    useEffect(() => { const t = setTimeout(() => setOn(true), 60); return () => clearTimeout(t); }, []);
    const max = maxProp ?? Math.max(1, ...righe.map((r) => r.val));
    if (!righe.length) return <p className="text-xs text-slate-500 py-4 text-center">{vuoto}</p>;
    const medaglie = ["🥇", "🥈", "🥉"];
    return (
        <div className="space-y-1.5">
            {righe.map((r, i) => (
                <Tip key={r.k ?? i} block tip={
                    <div>
                        <TipTitolo>{r.label}</TipTitolo>
                        {(r.det || [{ l: unit, r: fmtPt(r.val) }]).map((d, j) => <TipRiga key={j} l={d.l} r={d.r} colore={d.colore} />)}
                    </div>
                }>
                    <div className={cn(
                        "group grid grid-cols-[26px_minmax(90px,1fr)_3fr_auto] items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-white/5",
                        r.me && "ring-1 ring-indigo-400/50 bg-indigo-500/10",
                    )}>
                        <span className="text-sm text-center">{medaglie[i] || <span className="text-[11px] text-slate-500 font-bold">{i + 1}º</span>}</span>
                        <span className={cn("text-xs font-semibold truncate", r.me ? "text-indigo-200" : "text-slate-200")}>
                            {r.label}{r.sub && <span className="ml-1.5 text-[10px] font-normal text-slate-500">{r.sub}</span>}
                        </span>
                        <span className="relative h-3 rounded-full bg-white/5 overflow-hidden">
                            <span className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out group-hover:brightness-125"
                                style={{ width: on ? `${Math.max(2, (r.val / max) * 100)}%` : "0%", background: `linear-gradient(90deg, ${r.colore || "#818cf8"}66, ${r.colore || "#818cf8"})`, boxShadow: `0 0 8px ${r.colore || "#818cf8"}55` }} />
                        </span>
                        <span className="text-xs font-bold text-white tabular-nums pl-1">{fmtPt(r.val)}<span className="ml-1 text-[9px] text-slate-500 font-normal">{unit}</span></span>
                    </div>
                </Tip>
            ))}
        </div>
    );
}

/* ── barra mix 100% con segmenti hover ─────────────────────────────────── */
export function StackMix({ parti, unit = "pezzi" }) {
    const tot = parti.reduce((s, p) => s + p.val, 0);
    if (!tot) return <p className="text-xs text-slate-500 py-2 text-center">Nessun dato.</p>;
    return (
        <div>
            <div className="flex h-5 w-full rounded-full overflow-hidden bg-white/5">
                {parti.filter((p) => p.val > 0).map((p, i) => (
                    <Tip key={i} className="h-full transition-all hover:brightness-125 hover:scale-y-125 origin-center"
                        style={{ width: `${(p.val / tot) * 100}%`, minWidth: 8 }} tip={
                            <div>
                                <TipTitolo>{p.emoji} {p.label}</TipTitolo>
                                <TipRiga l={unit} r={fmtN(p.val)} colore={p.colore} />
                                <TipRiga l="quota" r={`${fmtN((p.val / tot) * 100, 1)}%`} />
                            </div>
                        }>
                        <span className="block h-full w-full" style={{ background: p.colore }} />
                    </Tip>
                ))}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                {parti.filter((p) => p.val > 0).map((p, i) => (
                    <span key={i} className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                        <span className="w-2 h-2 rounded-full" style={{ background: p.colore }} />{p.emoji} {p.label} <b className="text-slate-200 tabular-nums">{fmtN(p.val)}</b>
                    </span>
                ))}
            </div>
        </div>
    );
}

/* ── calendario a intensità (un quadretto per giorno) ──────────────────── */
export function HeatCal({ giorni, colore = "var(--tf-818cf8)", oggi = -1, unit = "punti" }) {
    const max = Math.max(1, ...giorni.map((g) => g.val));
    return (
        <div className="flex flex-wrap gap-[5px]">
            {giorni.map((g, i) => (
                <Tip key={i} tip={
                    <div>
                        <TipTitolo>{g.label}</TipTitolo>
                        <TipRiga l={unit} r={fmtPt(g.val)} colore={colore} />
                        {(g.det || []).map((d, j) => <TipRiga key={j} l={d.l} r={d.r} colore={d.colore} />)}
                        {g.chiuso && <p className="text-[10px] text-slate-500 mt-0.5">giorno non lavorativo</p>}
                    </div>
                }>
                    <span className={cn("relative block w-[17px] h-[17px] rounded-[5px] transition-transform hover:scale-125 origin-left", i === oggi && "ring-2 ring-white/70")}
                        style={{ background: g.chiuso && !g.val ? "rgba(255,255,255,.04)" : colore, opacity: g.chiuso && !g.val ? 1 : 0.12 + 0.88 * (g.val / max) }}>
                        <span className="absolute inset-0 grid place-items-center text-[7px] font-bold text-white/70">{g.n}</span>
                    </span>
                </Tip>
            ))}
        </div>
    );
}

/* ── BARRA DELLE SOGLIE (Master, Luca 21/08): una pista di gara come corsa
   orizzontale — tacche alle soglie (S1..S8), riempimento animato, la
   prossima soglia pulsa; tutto hoverabile, il click apre il drill. ──────── */
export function SogliaBar({ label, emoji, punti, pezzi, soglie = [], colore = "#818cf8", gate, malus, nota, proiezione = null, onClick, unit = "pt", targetDir = null, targetFonte = null, bruciati = 0 }) {
    const [on, setOn] = useState(false);
    // larghezza vera della barra: serve a decidere quali valori si possono
    // stampare sotto senza accavallarsi (vedi `mostrati`)
    const rif2 = useRef(null);
    const [larg, setLarg] = useState(0);
    useLayoutEffect(() => {
        const el = rif2.current; if (!el || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(([e]) => setLarg(e.contentRect.width));
        ro.observe(el); return () => ro.disconnect();
    }, []);
    useEffect(() => { const t = setTimeout(() => setOn(true), 60); return () => clearTimeout(t); }, []);
    // il PROSPECT guida le considerazioni (Luca 21/08): barra piena = attuale,
    // coda a strisce = proiezione fine mese
    const proj = proiezione != null && proiezione > punti ? Math.round(proiezione * 100) / 100 : null;
    // punti BRUCIATI (Direzione): caricati oltre target+sfrido, non recuperano —
    // coda ROSSA sfumata dopo la proiezione utile (Luca 27/08)
    const rosso = Number(bruciati) > 0 ? Math.round(Number(bruciati) * 100) / 100 : 0;
    const ultima = soglie.length ? soglie[soglie.length - 1].soglia_da : 0;
    const max = Math.max(ultima * 1.07, punti * 1.06, (proj || 0) * 1.04, (targetDir || 0) * 1.05, ((proj || punti) + rosso) * 1.03, 1);
    const pct = (v) => Math.min(100, (v / max) * 100);
    const presa = [...soglie].reverse().find((s) => punti >= s.soglia_da) || null;
    const prossima = soglie.find((s) => s.soglia_da > punti) || null;
    const rif = proj ?? punti;   // le valutazioni si fanno sul prospect
    const presaProj = [...soglie].reverse().find((s) => rif >= s.soglia_da) || null;
    const prossimaProj = soglie.find((s) => s.soglia_da > rif) || null;
    return (
        <div className={cn("rounded-xl px-3 py-2.5 bg-white/[.04] border border-white/[.06] transition-colors", onClick && "cursor-pointer hover:bg-white/[.08] hover:border-white/15")}
            onClick={onClick} title={onClick ? "Clicca per l'elenco contratti" : undefined}>
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <span className="text-xs font-bold text-slate-200 truncate">{emoji} {label}</span>
                <span className="text-sm font-black text-white tabular-nums shrink-0">{fmtPt(punti)} <span className="text-[9px] font-normal text-slate-500">{unit}</span>
                    {proj && <span className="ml-1 text-[10px] font-bold tabular-nums" style={{ color: colore }}>🔮 {fmtPt(proj)}</span>}
                    {pezzi != null && <span className="ml-1.5 text-[10px] font-normal text-slate-500 tabular-nums">{fmtN(pezzi)} pz</span>}</span>
            </div>
            <div ref={rif2} className="relative h-3.5 rounded-full bg-white/[.06]">
                {proj && (
                    <Tip className="absolute inset-y-0 rounded-r-full overflow-hidden" style={{ left: `${pct(punti)}%`, width: on ? `${Math.max(0, pct(proj) - pct(punti))}%` : 0, transition: "width 1.2s .2s cubic-bezier(.22,1,.36,1)" }} tip={
                        <div><TipTitolo>🔮 Proiezione fine mese</TipTitolo>
                            <TipRiga l="di questo passo" r={`${fmtPt(proj)} ${unit}`} colore={colore} />
                            <TipRiga l="fatti finora" r={`${fmtPt(punti)} ${unit}`} />
                            {presaProj && <TipRiga l="in proiezione" r={`S${presaProj.tier} presa`} />}
                        </div>
                    }>
                        <span className="block w-full h-full" style={{ background: `repeating-linear-gradient(45deg, ${colore}55 0 5px, ${colore}18 5px 10px)` }} />
                    </Tip>
                )}
                {rosso > 0 && (
                    <Tip className="absolute inset-y-0 rounded-r-full overflow-hidden" style={{ left: `${pct(rif)}%`, width: on ? `${Math.max(0, pct(rif + rosso) - pct(rif))}%` : 0, transition: "width 1.2s .35s cubic-bezier(.22,1,.36,1)" }} tip={
                        <div><TipTitolo>🔥 Punti bruciati</TipTitolo>
                            <TipRiga l="oltre il target sfridato" r={`${fmtPt(rosso)} ${unit}`} colore="#f43f5e" />
                            <TipRiga l="non recuperano" r="dedotti dalla proiezione utile" />
                        </div>
                    }>
                        <span className="block w-full h-full" style={{ background: "linear-gradient(90deg, #f43f5ebb, #f43f5e26)", boxShadow: "inset 0 0 8px #f43f5e44" }} />
                    </Tip>
                )}
                <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-1000 ease-out"
                    style={{ width: on ? `${Math.max(punti > 0 ? 1.5 : 0, pct(punti))}%` : "0%", background: `linear-gradient(90deg, ${colore}55, ${colore})`, boxShadow: `0 0 10px ${colore}66` }} />
                {soglie.map((s) => {
                    const raggiunta = punti >= s.soglia_da;
                    const inProj = !raggiunta && rif >= s.soglia_da;
                    const èProssima = prossimaProj && s.tier === prossimaProj.tier;
                    return (
                        <Tip key={s.tier} className="absolute -inset-y-1 w-4 -translate-x-1/2 items-center justify-center z-10" style={{ left: `${pct(s.soglia_da)}%` }} tip={
                            <div>
                                <TipTitolo>Soglia {s.tier}</TipTitolo>
                                <TipRiga l="scatta a" r={fmtN(s.soglia_da)} colore={colore} />
                                <TipRiga l={raggiunta ? "presa" : "mancano (reali)"} r={raggiunta ? "✓" : fmtPt(s.soglia_da - punti)} />
                                {inProj && <TipRiga l="in proiezione" r="✓ ci arrivi" />}
                            </div>
                        }>
                            <span className={cn("block w-[3px] h-full rounded-full", èProssima && "animate-pulse")}
                                style={{ background: raggiunta ? "#fff" : inProj ? `${colore}` : "rgba(255,255,255,.28)", boxShadow: raggiunta || inProj ? `0 0 6px ${colore}` : undefined }} />
                        </Tip>
                    );
                })}
                {/* 🎯 TARGET DIREZIONE (sfrido incluso, Luca 27/08): tacca
                    smeraldo distinta — le soglie di lettera restano bianche */}
                {targetDir != null && targetDir > 0 && (
                    <Tip className="absolute -inset-y-1.5 w-4 -translate-x-1/2 items-center justify-center z-20" style={{ left: `${pct(targetDir)}%` }} tip={
                        <div>
                            <TipTitolo>🎯 {targetFonte === "pannello" ? "Target di rete" : "Target direzione"}</TipTitolo>
                            <TipRiga l={targetFonte === "pannello" ? "impostato in Gare → Target" : "sfrido incluso"} r={fmtN(targetDir)} colore="#34d399" />
                            <TipRiga l={punti >= targetDir ? "raggiunto" : "mancano"} r={punti >= targetDir ? "✓" : fmtPt(targetDir - punti)} />
                        </div>
                    }>
                        <span className="block w-[4px] h-full rounded-full"
                            style={{ background: "linear-gradient(180deg, #34d399, #10b981)", boxShadow: "0 0 8px #34d399" }} />
                    </Tip>
                )}
            </div>
            {soglie.length > 0 && (
                <div className="relative h-3 mt-0.5">
                    {/* GREEDY: il criterio non è «quante soglie» ma la distanza
                        vera in pixel. Con soglie a 80 e 140 su una scala che
                        arriva a 1.240 i due numeri distano il 5% — 10px su una
                        barra da 200 — e si accavallano a QUALSIASI larghezza.
                        Si stampa solo chi dista ≥32px dall'ultimo stampato. */}
                    {(() => {
                        const larghezza = larg || 400;
                        let ultimo = -99;
                        return soglie.filter((s) => {
                            const x = (pct(s.soglia_da) / 100) * larghezza;
                            if (x - ultimo < 32) return false;
                            ultimo = x; return true;
                        }).map((s) => (
                            <span key={s.tier} className="absolute -translate-x-1/2 text-[8px] text-slate-500 tabular-nums whitespace-nowrap" style={{ left: `${pct(s.soglia_da)}%` }}>{fmtN(s.soglia_da)}</span>
                        ));
                    })()}
                    {targetDir != null && targetDir > 0 && (
                        <span className="absolute -translate-x-1/2 text-[8px] font-bold text-emerald-400 tabular-nums whitespace-nowrap" style={{ left: `${pct(targetDir)}%` }}>🎯{fmtN(targetDir)}</span>
                    )}
                </div>
            )}
            <div className="sb-chips mt-1 flex flex-wrap items-center gap-1.5 min-h-[18px]">
                {presa ? <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black text-white" style={{ background: `${colore}cc` }}>S{presa.tier} presa</span>
                    : soglie.length > 0 && <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold text-slate-400 bg-white/5">sotto la S1</span>}
                {proj && presaProj && (!presa || presaProj.tier > presa.tier) && <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black text-white border border-white/20" style={{ background: `repeating-linear-gradient(45deg, ${colore}aa 0 4px, ${colore}55 4px 8px)` }}>🔮 S{presaProj.tier} in proiezione</span>}
                {prossimaProj && <span className="text-[10px] text-slate-400">{proj ? "in proiezione " : ""}mancano <b className="text-white tabular-nums">{fmtPt(prossimaProj.soglia_da - rif)}</b> alla S{prossimaProj.tier}</span>}
                {!prossimaProj && presaProj && soglie.length > 0 && <span className="text-[10px] text-emerald-300 font-semibold">{proj ? "in proiezione " : ""}ultima soglia presa 👑</span>}
                {gate && <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold text-amber-300 bg-amber-400/10 border border-amber-400/25">⛔ {gate}</span>}
                {malus && <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold text-rose-300 bg-rose-400/10 border border-rose-400/25">🔻 {malus}</span>}
                {nota && <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold text-slate-300 bg-white/5 border border-white/10">{nota}</span>}
            </div>
        </div>
    );
}

/* ═══ ANELLO A SCAGLIONI (Rete, 28/08) ══════════════════════════════════
   La sezione Rete non risponde a «quanti punti abbiamo fatto» — quello è un
   numero e si scrive — ma a «quale scaglione stiamo prendendo, quale ci
   scappa, siamo sopra o sotto il target». Su una scala lineare quella
   domanda è illeggibile proprio quando conta: con soglie a 80/140/300/620
   il salto S1→S2 vale il 10% del giro e S3→S4 il 52%, così le due soglie
   che si rincorrono a inizio mese diventano due trattini appiccicati.
   Qui il cerchio è diviso in SETTORI UGUALI, uno per scaglione (0→S1,
   S1→S2, … , «oltre»), separati da un taglio in cui vive la tacca della
   soglia: dentro il settore la posizione è lineare, ma ogni scaglione pesa
   uguale. Il prezzo — l'angolo non è più proporzionale ai punti — si paga
   tenendo il NUMERO VERO al centro e aprendo la SogliaBar lineare nel
   drill: la barra del Master non si butta, cambia mestiere.
   · arco pieno = fatto · coda a righe = proiezione fine mese
   · tacche nei tagli = soglie (bianca presa, colore in proiezione, spenta)
   · TARGET = segno di FORMA DIVERSA (stelo + rombo smeraldo), libero di
     cadere dentro un settore: n soglie e 1 target non competono mai
   · anello interno più chiaro = LA QUOTA DEL MIO PUNTO VENDITA sul totale
     di rete di quel KPI (regola unica: tinta piena = rete, chiara = io)  */
const TAU = Math.PI * 2;
const cl01 = (v) => Math.max(0, Math.min(1, v));
const polo = (cc, r, f) => { const a = f * TAU - Math.PI / 2; return [cc + r * Math.cos(a), cc + r * Math.sin(a)]; };
const arco = (cc, r, f0, f1) => {
    let d = f1 - f0;
    if (d <= 0.0009) return "";
    if (d >= 0.9995) d = 0.9995;
    const [x0, y0] = polo(cc, r, f0), [x1, y1] = polo(cc, r, f0 + d);
    return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${d > 0.5 ? 1 : 0} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
};
const radiale = (cc, r0, r1, f) => {
    const [x0, y0] = polo(cc, r0, f), [x1, y1] = polo(cc, r1, f);
    return `M${x0.toFixed(2)},${y0.toFixed(2)} L${x1.toFixed(2)},${y1.toFixed(2)}`;
};
const ancoraT = (f) => { const a = ((f % 1) + 1) % 1; if (a < .035 || a > .965 || Math.abs(a - .5) < .035) return "middle"; return a < .5 ? "start" : "end"; };
const dyT = (f) => { const a = ((f % 1) + 1) % 1; if (a < .07 || a > .93) return -1.5; if (Math.abs(a - .5) < .07) return 8.5; return 3; };
const esa = (h) => [1, 3, 5].map((i) => parseInt(String(h).slice(i, i + 2), 16));
const schiarisci = (c, t = 0.6) => {
    try { return "#" + esa(c).map((v) => Math.round(v + (255 - v) * t).toString(16).padStart(2, "0")).join(""); }
    catch { return "#cbd5e1"; }
};

/** settori uguali per scaglione: [{v0, v1, tier, f0, f1}] */
function settoriScaglioni(perni, punti, proiezione, target) {
    const out = []; let prev = 0;
    for (const v of perni) { out.push({ v0: prev, v1: v, w: 1 }); prev = v; }
    // il settore «oltre» è più stretto: è una coda, non uno scaglione da prendere
    const oltre = Math.max(prev * 1.25, (proiezione || punti) * 1.06, punti * 1.06, (target || 0) * 1.08, prev + 1);
    out.push({ v0: prev, v1: oltre, tier: null, w: 0.6 });
    const GAP = 0.0125, totW = out.reduce((a, x) => a + x.w, 0), utile = 1 - GAP * out.length;
    let f = GAP / 2;
    for (const s of out) { s.f0 = f; s.f1 = f + utile * s.w / totW; f = s.f1 + GAP; }
    return out;
}
const fDi = (sec, v) => {
    for (let i = 0; i < sec.length; i++) { const s = sec[i]; if (v <= s.v1 || i === sec.length - 1) return s.f0 + cl01((v - s.v0) / (s.v1 - s.v0)) * (s.f1 - s.f0); }
    return 0;
};

export function AnelloScaglioni({
    punti = 0, proiezione = null, soglie = [], target = null, mio = null,
    colore = "#818cf8", parti = null, unit = "pt", tip, onClick, importante = false, allarme = false,
}) {
    const [on, setOn] = useState(false);
    useEffect(() => { const t = setTimeout(() => setOn(true), 80); return () => clearTimeout(t); }, []);
    const uid = useId().replace(/:/g, "");
    const V = 220, cc = V / 2, r = 84, sw = 16;             // geometria in viewBox fisso
    const perni = soglie.length ? soglie.map((x) => x.soglia_da) : (target > 0 ? [target] : []);
    const sec = settoriScaglioni(perni, punti, proiezione, target);
    const proj = proiezione != null && proiezione > punti ? proiezione : punti;
    const chiaro = schiarisci(colore);
    const rif = proj;
    const prossimaProj = soglie.find((s) => s.soglia_da > rif) || null;
    const quota = mio != null && punti > 0 ? cl01(mio / punti) : 0;
    const fatti = sec.map((g) => [g.f0, g.f0 + cl01((punti - g.v0) / (g.v1 - g.v0)) * (g.f1 - g.f0)]).filter(([a, b]) => b - a > 0.0009);
    const lungo = fatti.reduce((s, [a, b]) => s + (b - a), 0);
    // «prendi la fetta iniziale dell'arco già disegnato»: serve alla quota del
    // mio PV e alle parti colorate (S4: luce e gas dentro lo stesso anello)
    const fetta = (da, quanto) => {
        const out = []; let salta = lungo * da, resto = lungo * quanto;
        for (const [a0, b0] of fatti) {
            let a = a0; let d = b0 - a0;
            if (salta > 0) { const t = Math.min(d, salta); a += t; d -= t; salta -= t; }
            if (d <= 0 || resto <= 0.0009) continue;
            const p = Math.min(d, resto); out.push([a, a + p]); resto -= p;
        }
        return out;
    };
    const miei = quota > 0 ? fetta(0, quota) : [];
    const tot2 = (parti || []).reduce((sm, p) => sm + (Number(p.v) || 0), 0);
    let acc2 = 0;
    const fette2 = (parti && tot2 > 0) ? parti.map((p) => {
        const q0 = acc2 / tot2, q1 = (acc2 + (Number(p.v) || 0)) / tot2;
        acc2 += Number(p.v) || 0;
        return { ...p, tratti: fetta(q0, q1 - q0) };
    }) : [];
    const rM = r - sw / 2 - 7, swM = 5.4;
    // le etichette dei valori sono HTML in overlay, ancorate VERSO L'ESTERNO:
    // centrarle sul raggio ne metterebbe metà sopra il tratto
    const posLab = (f) => {
        const a = f * TAU - Math.PI / 2, cx = Math.cos(a), cy = Math.sin(a);
        const tx = cx > 0.25 ? "6px" : cx < -0.25 ? "calc(-100% - 6px)" : "-50%";
        const ty = cy > 0.25 ? "6px" : cy < -0.25 ? "calc(-100% - 6px)" : "-50%";
        return { left: `${50 + 50 * cx}%`, top: `${50 + 50 * cy}%`, transform: `translate(${tx}, ${ty})` };
    };
    const anello = (
        <div className={cn("tf-anello", importante && "tf-imp", allarme && "tf-alert")} onClick={onClick}>
            <svg viewBox={`0 0 ${V} ${V}`}>
                <defs>
                    <linearGradient id={`gs${uid}`} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor={colore} stopOpacity=".58" /><stop offset="100%" stopColor={colore} />
                    </linearGradient>
                    <pattern id={`hs${uid}`} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                        <rect width="9" height="9" fill={colore} fillOpacity=".13" /><rect width="4.4" height="9" fill={colore} fillOpacity=".55" />
                    </pattern>
                </defs>
                {sec.map((g, i) => {
                    const d = g.f1 - g.f0;
                    const ka = cl01((punti - g.v0) / (g.v1 - g.v0)), kp = cl01((proj - g.v0) / (g.v1 - g.v0));
                    return (
                        <g key={`s${i}`}>
                            <path d={arco(cc, r, g.f0, g.f1)} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={sw} />
                            {kp > ka && <path d={arco(cc, r, g.f0 + ka * d, g.f0 + (on ? kp : ka) * d)} fill="none" stroke={`url(#hs${uid})`} strokeWidth={sw} />}
                            {ka > 0 && !fette2.length && <path d={arco(cc, r, g.f0, g.f0 + (on ? ka : 0) * d)} fill="none" stroke={`url(#gs${uid})`} strokeWidth={sw}
                                style={{ filter: `drop-shadow(0 0 6px ${colore}99)` }} />}
                        </g>
                    );
                })}
                {/* ARCO A DUE TINTE: le parti che compongono lo stesso punteggio */}
                {fette2.map((p, i) => (
                    <g key={`p${i}`}>
                        {p.tratti.map(([a, b], j) => (
                            <path key={j} d={arco(cc, r, a, on ? b : a)} fill="none" stroke={p.colore} strokeWidth={sw}
                                style={{ filter: `drop-shadow(0 0 6px ${p.colore}99)` }} />
                        ))}
                    </g>
                ))}
                {/* LA MIA QUOTA: anello interno, stessa tinta più chiara */}
                {quota > 0 && (
                    <g>
                        {sec.map((g, i) => { const d = g.f1 - g.f0, ka = cl01((punti - g.v0) / (g.v1 - g.v0)); return ka > 0 ? <path key={`m${i}`} d={arco(cc, rM, g.f0, g.f0 + ka * d)} fill="none" stroke="rgba(255,255,255,.09)" strokeWidth={swM} /> : null; })}
                        {miei.map(([a, b], i) => <path key={`q${i}`} d={arco(cc, rM, a, on ? b : a)} fill="none" stroke={chiaro} strokeWidth={swM} strokeLinecap="round"
                            style={{ filter: `drop-shadow(0 0 4px ${chiaro}bb)` }} />)}
                    </g>
                )}
                {/* SOGLIE: la tacca vive nel taglio fra due scaglioni */}
                {soglie.map((s, i) => {
                    const st = punti >= s.soglia_da ? "presa" : rif >= s.soglia_da ? "proj" : "futura";
                    const a = sec[i].f1 + 0.0062;
                    const col = st === "presa" ? "#ffffff" : st === "proj" ? colore : "rgba(255,255,255,.30)";
                    return <path key={`t${s.tier}`} d={radiale(cc, r - sw / 2 - 2, r + sw / 2 + 2, a)} stroke={col} strokeWidth={3.2} strokeLinecap="round"
                        className={prossimaProj && s.tier === prossimaProj.tier ? "animate-pulse" : undefined}
                        style={st !== "futura" ? { filter: `drop-shadow(0 0 4px ${colore})` } : undefined} />;
                })}
                {/* TARGET: forma diversa, non un colore diverso */}
                {target > 0 && (() => {
                    const f = fDi(sec, target), r0 = r - sw / 2 - 4, r1 = r + sw / 2 + 4;
                    const [dx, dy] = polo(cc, r1 + 5, f), s2 = 4.4;
                    return (
                        <g>
                            <path d={radiale(cc, r0, r1, f)} stroke="#34d399" strokeWidth={3.2} strokeLinecap="round" style={{ filter: "drop-shadow(0 0 5px #34d399)" }} />
                            <path d={`M${dx.toFixed(1)},${(dy - s2).toFixed(1)} L${(dx + s2).toFixed(1)},${dy.toFixed(1)} L${dx.toFixed(1)},${(dy + s2).toFixed(1)} L${(dx - s2).toFixed(1)},${dy.toFixed(1)} Z`}
                                fill="#34d399" stroke="#0f111a" strokeWidth={1.2} style={{ filter: "drop-shadow(0 0 6px #34d399)" }} />
                        </g>
                    );
                })()}
            </svg>
            <div className="tf-anello-centro">
                <span className="num">{unit === "pz" ? fmtN(punti) : fmtPt(punti)}</span>
                <span className="cap">{unit === "pz" ? "pezzi rete" : "punti rete"}</span>
                {mio != null && punti > 0 && <span className="mio" style={{ color: chiaro }}>{fmtN(quota * 100, 1)}%&nbsp;mio</span>}
            </div>
            {/* etichette dei valori: le accende il CSS quando ci stanno davvero */}
            {soglie.map((s, i) => {
                const st = punti >= s.soglia_da ? "presa" : rif >= s.soglia_da ? "proj" : "futura";
                return <span key={`l${s.tier}`} className="tf-lab" style={{ ...posLab(sec[i].f1 + 0.0062), color: st === "presa" ? "#fff" : st === "proj" ? colore : "#64748b" }}>S{s.tier}·{fmtN(s.soglia_da)}</span>;
            })}
            {target > 0 && <span className="tf-lab" style={{ ...posLab(fDi(sec, target)), color: "#34d399" }}>🎯{fmtN(target)}</span>}
            {/* il glifo dice l'allarme anche senza movimento e senza colore */}
            {allarme && <span className="tf-bang" title="Proiezione sotto il target">!</span>}
        </div>
    );
    return tip ? <Tip className="block" tip={tip}>{anello}</Tip> : anello;
}

/* ── scala delle soglie (S1..Sn) ───────────────────────────────────────── */
export function ScalaSoglie({ soglie, punti, colore }) {
    return (
        <div className="flex items-center gap-1 flex-wrap justify-center">
            {soglie.map((s) => {
                const presa = punti >= s.soglia_da;
                return (
                    <span key={s.tier} className={cn(
                        "px-1.5 py-0.5 rounded-md text-[9px] font-bold border transition-all",
                        presa ? "text-white border-transparent" : "text-slate-500 border-white/10 bg-white/5",
                    )} style={presa ? { background: `${colore}cc`, boxShadow: `0 0 6px ${colore}66` } : undefined}>
                        S{s.tier}·{fmtN(s.soglia_da)}
                    </span>
                );
            })}
        </div>
    );
}

/* ── torta a ciambella con spicchi hover ───────────────────────────────── */
// slices: [{ label, val, colore, emoji?, det?: [{l,r,colore}] }]
export function Donut({ slices, size = 150, spessore = 17, centro, unit = "pt" }) {
    const vive = slices.filter((s) => s.val > 0);
    const tot = vive.reduce((s, x) => s + x.val, 0);
    const r = (size - spessore) / 2, C = 2 * Math.PI * r;
    const [on, setOn] = useState(false);
    const [hov, setHov] = useState(null);   // { i, x, y }
    useEffect(() => { const t = setTimeout(() => setOn(true), 60); return () => clearTimeout(t); }, []);
    if (!tot) return <p className="text-xs text-slate-500 py-4 text-center">Nessun dato.</p>;
    let acc = 0;
    return (
        <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={spessore} />
                {vive.map((s, i) => {
                    const len = (s.val / tot) * C, start = acc; acc += len;
                    return (
                        <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none"
                            stroke={s.colore} strokeWidth={hov?.i === i ? spessore + 4 : spessore}
                            strokeDasharray={`${on ? Math.max(0, len - 2) : 0} ${C}`} strokeDashoffset={-start}
                            style={{ transition: "stroke-dasharray 1s cubic-bezier(.22,1,.36,1), stroke-width .15s", filter: hov?.i === i ? `drop-shadow(0 0 7px ${s.colore})` : `drop-shadow(0 0 4px ${s.colore}55)`, cursor: "default" }}
                            onMouseEnter={(e) => setHov({ i, x: e.clientX, y: e.clientY })}
                            onMouseMove={(e) => setHov({ i, x: e.clientX, y: e.clientY })}
                            onMouseLeave={() => setHov(null)}
                        />
                    );
                })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 pointer-events-none">{centro}</div>
            {hov && vive[hov.i] && typeof document !== "undefined" && createPortal(
                <div className="fixed z-[9999] pointer-events-none an-scuro" style={{ left: hov.x, top: hov.y - 14, transform: "translate(-50%,-100%)" }}>
                    <div className="rounded-xl border border-white/15 bg-[#111527]/95 backdrop-blur-md px-3 py-2 shadow-2xl shadow-black/50">
                        <TipTitolo>{vive[hov.i].emoji} {vive[hov.i].label}</TipTitolo>
                        <TipRiga l={unit} r={fmtPt(vive[hov.i].val)} colore={vive[hov.i].colore} />
                        <TipRiga l="quota" r={`${fmtN((vive[hov.i].val / tot) * 100, 1)}%`} />
                        {(vive[hov.i].det || []).map((d, j) => <TipRiga key={j} l={d.l} r={d.r} colore={d.colore} />)}
                    </div>
                </div>, document.body)}
        </div>
    );
}

/* ── variazione vs periodo precedente ──────────────────────────────────── */
export function Delta({ v, pct = false, euro = false }) {
    if (v == null || !isFinite(v) || Math.abs(v) < 0.005) return <span className="text-[10px] text-slate-500">＝</span>;
    const su = v > 0;
    return (
        <span className={cn("text-[10px] font-bold tabular-nums", su ? "text-emerald-300" : "text-rose-300")}>
            {su ? "▲" : "▼"} {euro ? fmtEuro(Math.abs(v)) : fmtPt(Math.abs(v))}{pct ? "%" : ""}
        </span>
    );
}
