// @ts-nocheck
"use client";

// PRIMITIVE GRAFICHE della sezione Analisi (Luca 20/08): tutte fatte in casa
// (SVG + CSS), zero librerie. REGOLE DI FAMIGLIA:
// · ogni tooltip è un PORTALE su document.body (mai fixed dentro una card:
//   i transform degli hover la trasformano in containing block — lezione
//   ChipSonda della Home) e si apre ISTANTANEO su hover/tap;
// · i numeri grossi salgono con un conteggio animato (rAF, ease-out);
// · niente Date.now nei render: le animazioni partono dal mount.

import { useEffect, useId, useMemo, useRef, useState } from "react";
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
    const move = (e) => setPos({ x: e.clientX, y: e.clientY });
    const off = () => setPos(null);
    return (
        <span
            className={cn(block ? "block" : "inline-flex", "cursor-default", className)} style={style}
            onMouseEnter={move} onMouseMove={move} onMouseLeave={off}
            onClick={(e) => (pos ? off() : move(e))}
        >
            {children}
            {pos && typeof document !== "undefined" && createPortal(
                <div className="fixed z-[9999] pointer-events-none" style={{ left: pos.x, top: pos.y - 14, transform: "translate(-50%,-100%)" }}>
                    <div className="rounded-xl border border-white/15 bg-[#111527]/95 backdrop-blur-md px-3 py-2 shadow-2xl shadow-black/50 max-w-[300px]">
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
export function Ring({ value, max, colore = "var(--tf-818cf8)", size = 132, centro, sotto, tip }) {
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
                <div className="fixed z-[9999] pointer-events-none" style={{ left: hov.x, top: hov.y - 14, transform: "translate(-50%,-100%)" }}>
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
export function BarStack({ giorni, oggi = -1, media = null, h = 180, unit = "pt" }) {
    const [on, setOn] = useState(false);
    useEffect(() => { const t = setTimeout(() => setOn(true), 60); return () => clearTimeout(t); }, []);
    const max = Math.max(1, ...giorni.map((g) => g.tot), media || 0) * 1.08;
    return (
        <div>
            <div className="relative w-full" style={{ height: h }}>
                {[0.25, 0.5, 0.75].map((k) => <div key={k} className="absolute left-0 right-0 border-t border-white/[.05] pointer-events-none" style={{ bottom: `${k * 100}%` }} />)}
                {media > 0 && (
                    <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ bottom: `${Math.min(96, (media / max) * 100)}%` }}>
                        <div className="border-t border-dashed border-white/30" />
                        <span className="absolute right-0 -top-4 text-[9px] font-bold text-slate-400 bg-[#0d1022]/70 px-1 rounded">media {fmtPt(media)}/g</span>
                    </div>
                )}
                <div className="absolute inset-0 flex items-end gap-[3px]">
                    {giorni.map((g, i) => {
                        const manca = i === oggi && media > 0 && g.tot < media ? media - g.tot : 0;
                        return (
                            <Tip key={i} block className="flex-1 h-full flex flex-col justify-end min-w-0 group/bar" tip={
                                <div>
                                    <TipTitolo>{g.label}{i === oggi ? " · OGGI" : ""}</TipTitolo>
                                    <TipRiga l="totale" r={`${fmtPt(g.tot)} ${unit}`} />
                                    {g.parti.filter((p) => p.val > 0).map((p, j) => (
                                        <div key={j}>
                                            <TipRiga l={p.label} r={p.sub ? `${fmtPt(p.val)} ${unit} · ${p.sub}` : `${fmtPt(p.val)} ${unit}`} colore={p.colore} />
                                            {p.prodotti && <p className="text-[10px] text-slate-500 pl-3.5 max-w-[240px] leading-4">{p.prodotti}</p>}
                                        </div>
                                    ))}
                                    {manca > 0 && <TipRiga l="per stare in media" r={`+${fmtPt(manca)} ${unit}`} />}
                                    {!g.parti.length && <p className="text-[10px] text-slate-500">nessuna produzione</p>}
                                </div>
                            }>
                                <div className="w-full flex flex-col justify-end h-full">
                                    {manca > 0 && (
                                        <div className="w-full rounded-t-[4px] border border-dashed border-white/25 bg-white/[.04] transition-all duration-700" style={{ height: on ? `${(manca / max) * 100}%` : 0 }} />
                                    )}
                                    <div className={cn("w-full flex flex-col-reverse overflow-hidden transition-all duration-700 ease-out group-hover/bar:brightness-125", manca > 0 ? "" : "rounded-t-[4px]", i === oggi && "ring-1 ring-white/60")}
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
                    <span key={i} className={cn("flex-1 text-center text-[8px] tabular-nums min-w-0", i === oggi ? "text-white font-black" : "text-slate-600", !(i === oggi || g.n % 5 === 0 || g.n === 1) && "opacity-0")}>{g.n}</span>
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
                                style={{ width: on ? `${Math.max(2, (r.val / max) * 100)}%` : "0%", background: `linear-gradient(90deg, ${r.colore || "var(--tf-818cf8)"}66, ${r.colore || "var(--tf-818cf8)"})`, boxShadow: `0 0 8px ${r.colore || "var(--tf-818cf8)"}55` }} />
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
                    <span className={cn("relative block w-[17px] h-[17px] rounded-[5px] transition-transform hover:scale-125", i === oggi && "ring-2 ring-white/70")}
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
export function SogliaBar({ label, emoji, punti, pezzi, soglie = [], colore = "var(--tf-818cf8)", gate, malus, onClick, unit = "pt" }) {
    const [on, setOn] = useState(false);
    useEffect(() => { const t = setTimeout(() => setOn(true), 60); return () => clearTimeout(t); }, []);
    const ultima = soglie.length ? soglie[soglie.length - 1].soglia_da : 0;
    const max = Math.max(ultima * 1.07, punti * 1.06, 1);
    const pct = (v) => Math.min(100, (v / max) * 100);
    const presa = [...soglie].reverse().find((s) => punti >= s.soglia_da) || null;
    const prossima = soglie.find((s) => s.soglia_da > punti) || null;
    return (
        <div className={cn("rounded-xl px-3 py-2.5 bg-white/[.04] border border-white/[.06] transition-colors", onClick && "cursor-pointer hover:bg-white/[.08] hover:border-white/15")}
            onClick={onClick} title={onClick ? "Clicca per l'elenco contratti" : undefined}>
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <span className="text-xs font-bold text-slate-200 truncate">{emoji} {label}</span>
                <span className="text-sm font-black text-white tabular-nums shrink-0">{fmtPt(punti)} <span className="text-[9px] font-normal text-slate-500">{unit}</span>
                    {pezzi != null && <span className="ml-1.5 text-[10px] font-normal text-slate-500 tabular-nums">{fmtN(pezzi)} pz</span>}</span>
            </div>
            <div className="relative h-3.5 rounded-full bg-white/[.06]">
                <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-1000 ease-out"
                    style={{ width: on ? `${Math.max(punti > 0 ? 1.5 : 0, pct(punti))}%` : "0%", background: `linear-gradient(90deg, ${colore}55, ${colore})`, boxShadow: `0 0 10px ${colore}66` }} />
                {soglie.map((s) => {
                    const raggiunta = punti >= s.soglia_da;
                    const èProssima = prossima && s.tier === prossima.tier;
                    return (
                        <Tip key={s.tier} className="absolute -inset-y-1 w-4 -translate-x-1/2 items-center justify-center" style={{ left: `${pct(s.soglia_da)}%` }} tip={
                            <div>
                                <TipTitolo>Soglia {s.tier}</TipTitolo>
                                <TipRiga l="scatta a" r={fmtN(s.soglia_da)} colore={colore} />
                                <TipRiga l={raggiunta ? "presa" : "mancano"} r={raggiunta ? "✓" : fmtPt(s.soglia_da - punti)} />
                            </div>
                        }>
                            <span className={cn("block w-[3px] h-full rounded-full", èProssima && "animate-pulse")}
                                style={{ background: raggiunta ? "#fff" : "rgba(255,255,255,.28)", boxShadow: raggiunta ? `0 0 6px ${colore}` : undefined }} />
                        </Tip>
                    );
                })}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 min-h-[18px]">
                {presa ? <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black text-white" style={{ background: `${colore}cc` }}>S{presa.tier} presa</span>
                    : soglie.length > 0 && <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold text-slate-400 bg-white/5">sotto la S1</span>}
                {prossima && <span className="text-[10px] text-slate-400">mancano <b className="text-white tabular-nums">{fmtPt(prossima.soglia_da - punti)}</b> alla S{prossima.tier}</span>}
                {!prossima && presa && soglie.length > 0 && <span className="text-[10px] text-emerald-300 font-semibold">ultima soglia presa 👑</span>}
                {gate && <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold text-amber-300 bg-amber-400/10 border border-amber-400/25">⛔ {gate}</span>}
                {malus && <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold text-rose-300 bg-rose-400/10 border border-rose-400/25">🔻 {malus}</span>}
            </div>
        </div>
    );
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
                            style={{ transition: "stroke-dasharray 1s cubic-bezier(.22,1,.36,1), stroke-width .15s", filter: hov?.i === i ? `drop-shadow(0 0 6px ${s.colore})` : undefined, cursor: "default" }}
                            onMouseEnter={(e) => setHov({ i, x: e.clientX, y: e.clientY })}
                            onMouseMove={(e) => setHov({ i, x: e.clientX, y: e.clientY })}
                            onMouseLeave={() => setHov(null)}
                        />
                    );
                })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 pointer-events-none">{centro}</div>
            {hov && typeof document !== "undefined" && createPortal(
                <div className="fixed z-[9999] pointer-events-none" style={{ left: hov.x, top: hov.y - 14, transform: "translate(-50%,-100%)" }}>
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
