// @ts-nocheck
"use client";

// WIDGET SINGOLI della Home (Luca 17/08): ogni widget è indipendente, si
// aggiunge/toglie da solo, si ridimensiona (1 blocco / 2 blocchi / mezza
// pagina) e si mette in ordine sparso — stile widget iPhone. Qui vivono il
// registro, i renderer e le regole di conteggio.
//
// REGOLA DEI NUMERI (direttiva Luca 17/08): la Home dei punti vendita mostra
// la PRODUZIONE DEL NEGOZIO CHE REGISTRA la vendita (colonna `negozio`), MAI
// l'allocazione per codice di inserimento (quella è roba azienda, vive in
// Gare/Calcolatore). Store manager → tutto il punto vendita; consulente →
// solo il suo individuale (colonna `venditore`).
//
// COME SI AGGIUNGE UN WIDGET (struttura voluta da Luca, tenerla pulita):
// 1. scrivi il componente qui sotto (riceve { ctx, size } — size 1|2|4);
// 2. registralo: id fisso in FISSI con label/icona/taglie/gruppo (i gruppi
//    della galleria: performance · confronto · statistiche · comunicazione ·
//    squadra · strumenti — se serve un gruppo nuovo, aggiungilo in GRUPPI
//    della page), oppure gestisci un prefisso dinamico in infoWidget/
//    renderWidget (come "brand:" e "confronto:");
// 3. la disponibilità per ruolo si dichiara nel registro (soloAdmin,
//    livelli, nonPer) — niente if sparsi nelle pagine.
// I widget futuri già immaginati: business Vodafone, badge/presenze per i
// caller, qualità (KO/annullati), storico personale.

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { roleLabel, BRAND_COLORS , areaOf } from "@/lib/roles";
import { matchRigheAttivazione, puntiPerRighe, contestoVfFw, brandIdDaLabel } from "@/lib/commissioning";
import { trkBrandKey, TRK_BRAND_COLORS, TRK_BRAND_LOGOS } from "@/lib/brandAssets";
import { BussolaWidget } from "@/components/DirezioneInserimento";
import { SelectOpzioni } from "@/components/SelectPersona";
import { waIstanzeVisibili } from "@/lib/waVisibilita";
import { cn } from "@/utils";
import {
    FileText, Users, CheckCircle2, Clock, Store as StoreIcon, TrendingUp,
    AlertTriangle, ArrowRight, Loader2, Compass, Target as TargetIcon, Zap,
    Megaphone, Trophy, Search, Plus, ChevronDown, ChevronUp, CalendarClock,
    LogIn, EyeOff, Eye, ShoppingBag, Signal, Crown, Swords, MessageCircle,
} from "lucide-react";

// ── Regole di conteggio (UNICHE: le usa anche lo script di riscontro) ───────
export const isCtr = (c) => String(c?.id || "").startsWith("CTR-");
export const isExt = (c) => String(c?.id || "").startsWith("EXT-");
// produzione del negozio = righe registrate NON annullate e non nascoste
// dalla gestione (le nascoste sono pratiche invalidate dalla direzione)
export const validaProduzione = (c) => !/annull/i.test(String(c?.stato || "")) && c?.nascosta_gestione !== true;
// pezzi marginalità: le righe EXT portano la quantità in dettagli.qty
export const qtyDi = (c) => Math.max(1, Number(c?.qty) || 1);
export const giornoDi = (c) => String(c?.data || c?.data_registrazione || "").slice(0, 10);

const norm = (s) => (s || "").trim().toLowerCase();
const STATO_COLOR = (s = "") => {
    const k = s.toLowerCase();
    if (k.includes("attiv")) return "var(--tf-22c55e)";
    if (k.includes("lavorazione") || k.includes("nuovo")) return "var(--tf-f59e0b)";
    if (k.includes("annull")) return "var(--tf-ef4444)";
    if (k.includes("sospes")) return "var(--tf-f97316)";
    return "var(--tf-64748b)";
};
const chartBrandColor = (b) => BRAND_COLORS[b]?.color || TRK_BRAND_COLORS[trkBrandKey(b)] || "var(--tf-6366f1)";
const colDiBrand = (b) => TRK_BRAND_COLORS[trkBrandKey(b)] || "var(--tf-818cf8)";
const MARG_COLOR = "var(--tf-ec4899)";

const groupCount = (list, keyFn, peso = () => 1) => {
    const m = {};
    list.forEach((c) => { const k = keyFn(c) || "—"; m[k] = (m[k] || 0) + peso(c); });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
};

/** Proiezione a fine mese sul ritmo dei giorni lavorativi del Calendario gare.
 *  Se OGGI non è ancora "scattato" (ora < ora di scatto, o giorno non
 *  lavorativo) i pezzi di oggi restano fuori dalla base di calcolo: base e
 *  giorni trascorsi viaggiano sempre appaiati. */
export function proiezioneFineMese(ctx, pezzi, pezziOggi) {
    const gl = ctx.gl;
    if (!gl || !ctx.periodoEMeseCorrente || !gl.mostraProiezione || gl.trascorsi <= 0) return null;
    const base = pezzi - (ctx.oggiContato ? 0 : pezziOggi);
    if (base <= 0) return null;
    return Math.max(pezzi, Math.round((base / gl.trascorsi) * gl.totali));
}

// ── Pezzi condivisi di UI ───────────────────────────────────────────────────
export function WidgetShell({ icon: Icon, title, accent = "var(--tf-818cf8)", action, children, logo }) {
    return (
        <div className="glass-card overflow-hidden flex flex-col h-full">
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    {logo ? <img src={logo} alt="" className="h-4 w-auto max-w-[52px] object-contain shrink-0" /> : Icon ? <Icon className="w-4 h-4 shrink-0" style={{ color: accent }} /> : null}
                    <h3 className="text-[13px] font-bold text-slate-200 tracking-wide truncate">{title}</h3>
                </div>
                <div className="shrink-0">{action}</div>
            </div>
            {/* flex-col: i widget possono dare flex-1 alle loro liste per
                riempire la card a qualsiasi altezza (Home a Tetris, 25/08) */}
            <div className="flex-1 min-h-0 flex flex-col">{children}</div>
        </div>
    );
}

function ChipScope({ ctx }) {
    return <span className="text-[10px] text-slate-500 truncate max-w-[130px] inline-block align-middle">{ctx.scopeLabel}</span>;
}

function BarChart({ icon, title, rows, total, colorFor, accent, size }) {
    const LIMIT = size >= 4 ? 12 : 4;
    const [exp, setExp] = useState(false);
    const shown = exp ? rows : rows.slice(0, LIMIT);
    const Icon = icon;
    return (
        <WidgetShell icon={Icon} title={title} accent={accent}>
            <div className="p-4 space-y-3 flex-1 min-h-0 overflow-y-auto">
                {rows.length === 0 ? <p className="text-sm text-slate-500 py-2">Nessun dato nel periodo.</p> :
                    shown.map(([label, n]) => (
                        <div key={label}>
                            <div className="flex items-center justify-between text-xs mb-1.5">
                                <span className="text-slate-300 truncate">{label}</span>
                                <span className="font-mono font-semibold text-slate-400">{n}</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                                <div className="h-full rounded-full transition-all" style={{ width: `${total ? Math.min((n / total) * 100, 100) : 0}%`, background: colorFor ? colorFor(label) : accent }} />
                            </div>
                        </div>
                    ))}
                {rows.length > LIMIT && (
                    <div className="flex justify-end -mb-1">
                        <button onClick={() => setExp((v) => !v)} className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-200 transition-colors">
                            {exp ? <>Mostra meno <ChevronUp className="w-3.5 h-3.5" /></> : <>Tutti ({rows.length}) <ChevronDown className="w-3.5 h-3.5" /></>}
                        </button>
                    </div>
                )}
            </div>
        </WidgetShell>
    );
}

/** Barrette per giorno — su un MESE o su un PERIODO dal–al (max 62 giorni):
 *  oggi evidenziato, giorni non lavorativi spenti. */
function Sparkline({ perGiorno, ym, range, color, ctx }) {
    let giorniISO = [];
    if (range) {
        const d = new Date(range.da + "T12:00:00");
        while (giorniISO.length <= 62) {
            const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            giorniISO.push(iso);
            if (iso === range.a) break;
            d.setDate(d.getDate() + 1);
        }
        if (giorniISO[giorniISO.length - 1] !== range.a) return null;   // periodo troppo lungo per le barrette
    } else if (ym) {
        const [y, m] = ym.split("-").map(Number);
        const n = new Date(y, m, 0).getDate();
        giorniISO = Array.from({ length: n }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`);
    } else return null;
    const max = Math.max(1, ...Object.values(perGiorno));
    const fest = new Set(ctx.gl?.festivi || []);
    const cong = new Set(ctx.gl?.congelati || []);
    const ymCorrente = ctx.oggiISO.slice(0, 7);
    return (
        <div className="flex items-end gap-[2px] h-9" title="Pezzi per giorno">
            {giorniISO.map((iso) => {
                const g = Number(iso.slice(8, 10));
                const v = perGiorno[iso] || 0;
                const dow = new Date(iso + "T12:00:00").getDay();
                const spento = dow === 0 || (iso.slice(0, 7) === ymCorrente && (fest.has(iso) || cong.has(g)));
                const oggi = iso === ctx.oggiISO;
                return (
                    <div key={iso} className="flex-1 min-w-[2px] rounded-sm transition-all" title={`${g}/${Number(iso.slice(5, 7))}: ${v}`}
                        style={{
                            height: v ? `${Math.max(14, (v / max) * 100)}%` : "3px",
                            background: v ? color : "rgba(148,163,184,.15)",
                            opacity: spento && !v ? 0.25 : oggi ? 1 : v ? 0.85 : 0.5,
                            outline: oggi ? `1px solid ${color}` : "none", outlineOffset: 1,
                        }} />
                );
            })}
        </div>
    );
}

function ProgressBar({ value, max, color }) {
    const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
    return (
        <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: `linear-gradient(90deg, color-mix(in srgb, ${color} 55%, transparent), ${color})` }} />
        </div>
    );
}

function MedalRow({ rank, nome, n, max, color, isMe, mostra }) {
    const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;
    return (
        <div className={cn("rounded-lg px-2 py-1.5", isMe ? "bg-indigo-500/10" : "bg-white/[0.02]")}>
            <div className="flex items-center gap-2 text-xs mb-1">
                <span className="w-5 text-center shrink-0">{medal || <span className="text-slate-500 font-bold">{rank}</span>}</span>
                <span className={cn("truncate flex-1", isMe ? "text-indigo-200 font-bold" : "text-slate-300")}>{nome}{isMe ? " · tu" : ""}</span>
                <span className="font-mono font-bold text-slate-200">{mostra ?? n}</span>
            </div>
            <div className="ml-7 h-1 rounded-full bg-white/[0.05] overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${max ? (n / max) * 100 : 0}%`, background: color }} />
            </div>
        </div>
    );
}

/** Chip con SONDA a bolla immediata (il title nativo è lento — stessa
 *  lezione del Commissioning): hover o tap mostrano subito il perché.
 *  ⚠️ La bolla vive in un PORTAL sul body: dentro la card non funzionava —
 *  .glass-card:hover ha un transform, che per position:fixed diventa il
 *  containing block, e l'overflow-hidden della card la tagliava via
 *  (segnalazione Luca 19/08 «passandoci il mouse non succede niente»). */
function ChipSonda({ testo, righe, tono = "ambra" }) {
    const [tip, setTip] = useState(null);
    const muovi = (e) => setTip({ x: Math.min(e.clientX + 12, (typeof window !== "undefined" ? window.innerWidth : 1200) - 290), y: Math.min(e.clientY + 14, (typeof window !== "undefined" ? window.innerHeight : 800) - 40 - righe.length * 18) });
    const cls = tono === "ambra" ? "bg-amber-500/10 border-amber-500/20 text-amber-300" : "bg-white/[0.04] border-white/5 text-slate-300";
    return (
        <span className={cn("relative inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-bold cursor-help", cls)}
            onMouseEnter={muovi} onMouseMove={muovi} onMouseLeave={() => setTip(null)}
            onClick={(e) => { e.stopPropagation(); tip ? setTip(null) : muovi(e); }}>
            {testo}
            {tip && typeof document !== "undefined" && createPortal(
                <span className="fixed z-[90] max-w-[300px] rounded-lg border border-white/10 bg-slate-900/95 shadow-2xl px-3 py-2 text-[11px] font-normal text-slate-200 whitespace-pre-wrap leading-relaxed pointer-events-none"
                    style={{ left: tip.x, top: tip.y }}>
                    {righe.join("\n")}
                </span>, document.body)}
        </span>
    );
}

const fmtEuro = (n) => Math.round(Number(n) || 0).toLocaleString("it-IT") + " €";
export const valoreDi = (c) => Number(c?.prezzo) || 0;   // dettagli.price = TOTALE riga (già ×qty)

/** Chip riepilogo: oggi / proiezione / record / confronto mese scorso. */
function ChipsPerformance({ ctx, oggiN, proiezione, best, meseScorso, pezzi, color }) {
    const chips = [];
    if (ctx.includeOggi) {
        chips.push(
            <span key="oggi" className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold", oggiN > 0 ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-slate-500")}>
                {oggiN > 0 && <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" /></span>}
                oggi +{oggiN}{!ctx.oggiContato && oggiN > 0 ? <span className="font-normal text-emerald-400/60">· conta dalle {ctx.gl?.oraScatto ?? 19}</span> : null}
            </span>
        );
    }
    if (proiezione != null && proiezione > pezzi) {
        chips.push(<span key="pr" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold border border-dashed" style={{ color, borderColor: `color-mix(in srgb, ${color} 45%, transparent)` }}>≈ {proiezione} a fine mese</span>);
    }
    if (best) {
        chips.push(<span key="rec" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold bg-amber-500/10 text-amber-300">🏆 record {best.n} ({best.label})</span>);
    }
    if (meseScorso != null && meseScorso > 0) {
        const rif = proiezione ?? pezzi;
        const su = rif >= meseScorso;
        chips.push(<span key="vs" className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold", su ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300")}>{su ? "↗" : "↘"} {ctx.meseScorsoLabel}: {meseScorso}</span>);
    }
    if (!chips.length) return null;
    return <div className="flex flex-wrap gap-1.5">{chips}</div>;
}

/** Corpo comune dei widget di produzione (brand e marginalità). */
function CorpoProduzione({ ctx, size, righe, pesa, color, unita, dettaglioL }) {
    const pezzi = righe.reduce((a, c) => a + pesa(c), 0);
    const oggiN = righe.filter((c) => giornoDi(c) === ctx.oggiISO).reduce((a, c) => a + pesa(c), 0);
    const proiezione = proiezioneFineMese(ctx, pezzi, oggiN);
    const perGiorno = {};
    righe.forEach((c) => { const g = giornoDi(c); if (g) perGiorno[g] = (perGiorno[g] || 0) + pesa(c); });
    let best = null;
    Object.entries(perGiorno).forEach(([iso, n]) => { if (!best || n > best.n) best = { n, label: `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}` }; });
    return { pezzi, oggiN, proiezione, perGiorno, best };
}

function BloccoNumero({ pezzi, proiezione, unita, color }) {
    return (
        <div className="flex items-end justify-between gap-2">
            <div>
                <p className="text-4xl font-black text-white leading-none tabular-nums">{Number(pezzi).toLocaleString("it-IT")}</p>
                <p className="text-[11px] text-slate-500 mt-1">{unita}</p>
            </div>
            {proiezione != null && proiezione > pezzi && (
                <div className="text-right">
                    <p className="text-lg font-black leading-none tabular-nums" style={{ color }}>≈{proiezione}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">fine mese</p>
                </div>
            )}
        </div>
    );
}

// ── WIDGET Wind3: KPI di gara divisi per categoria (Luca 17/08) ─────────────
// Niente "numero di contratti": punti mobili, punti fissi, telefoni GA/CB,
// operazioni CB, Reload, punti assicurazioni, luce&gas, Protecta. I punti li
// calcola il MOTORE gare (matchRigheAttivazione+puntiPerRighe) sulle vendite
// del mese caricate con caricaContrattiMese (perimetro gare, ora di scatto),
// ma AGGREGATE SUL NEGOZIO CHE REGISTRA — mai sul codice di inserimento.
const fmtPunti = (n) => (Math.round(n * 100) / 100).toLocaleString("it-IT");

function kpiW3(ctx, scopeFn) {
    const w3 = ctx.w3;
    if (!w3 || !Array.isArray(w3.packs)) return null;
    const per = {
        // pezzi = registrato nel perimetro (quadra con Ricerca Vendite);
        // punti = agganciato dal motore. Vendite senza riga pay → sonda ⚠.
        puntiMobile: 0, pezziMobile: 0, simReg: 0, puntiFisso: 0, pezziFisso: 0, fisReg: 0,
        puntiAss: 0, pezziAss: 0, senzaPay: 0, senzaPayCombo: {},
        telGa: 0, telGaFin: 0, telCb: 0, telCbFin: 0, opCb: 0, reload: 0, luce: 0, gas: 0, kit: 0,
        puntiGiorno: {}, puntiPersona: {},
    };
    // un pacchetto per mese del periodo: ogni mese matcha col SUO tabellare
    w3.packs.forEach((pack) => {
        if (!pack.tab) {
            const nMf = pack.rows.filter(scopeFn).filter((c) => /^(mobile |fisso)/i.test(String(c.categoria || ""))).length;
            if (nMf) per.senzaPayCombo[`(${pack.ym}: tabellare del mese non configurato)`] = nMf;
        }
        return pack.rows.filter(scopeFn).forEach((c) => {
        const cat = String(c.categoria || "");
        const prod = String(c.prodotto || "");
        const opz = String(c.opzioni || "");
        const isMob = /^mobile /i.test(cat);
        const isFis = /^fisso/i.test(cat);
        if (isMob) per.simReg++;
        if (isFis) per.fisReg++;
        if (/^telefono a rate/i.test(cat)) {
            // rateizzati col "di cui finanziati" (prodotti: Tel. Rate[ CB] /
            // Finanziato[ CB]) — richiesta Luca 17/08
            const fin = /^finanziato/i.test(prod);
            if (/cb\s*$/i.test(prod)) { per.telCb++; if (fin) per.telCbFin++; }
            else { per.telGa++; if (fin) per.telGaFin++; }
        }
        if (/^customer base/i.test(cat)) per.opCb++;
        if (/reload/i.test(opz)) per.reload++;
        if (/\bkit\b/i.test(opz)) per.kit++;
        if (/^energia/i.test(cat)) { if (/gas/i.test(prod)) per.gas++; else per.luce++; }
        const set = pack.tab ? matchRigheAttivazione(pack.tab.righe, c, brandIdDaLabel(c.brand)) : [];
        if (set.length) {
            const pista = set[0].pista; const p = puntiPerRighe(set);
            if (pista === "mobile") { per.puntiMobile += p; per.pezziMobile++; }
            else if (pista === "fisso") { per.puntiFisso += p; per.pezziFisso++; }
            else if (pista === "assicurazioni") { per.puntiAss += p; per.pezziAss++; }
            if (pista === "mobile" || pista === "fisso") {
                const g = giornoDi(c);
                if (g) per.puntiGiorno[g] = (per.puntiGiorno[g] || 0) + p;
                const chi = ctx.level === "global" ? (c.negozio || "—") : (c.venditore || "—");
                per.puntiPersona[chi] = (per.puntiPersona[chi] || 0) + p;
            }
        } else if (isMob || isFis) {
            per.senzaPay++;
            const k = `${prod} / ${String(c.offerta || "")}`;
            per.senzaPayCombo[k] = (per.senzaPayCombo[k] || 0) + 1;
        }
        });
    });
    return per;
}

function TileKpi({ label, value, sub, proj, color }) {
    return (
        <div className="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2.5">
            <div className="text-[9px] uppercase tracking-widest font-bold text-slate-500 mb-1">{label}</div>
            <div className="flex items-end justify-between gap-1">
                <span className="text-2xl font-black text-white leading-none tabular-nums">{value}</span>
                {proj != null && <span className="text-[11px] font-bold tabular-nums" style={{ color }} title="Proiezione a fine mese sul ritmo dei giorni lavorativi">≈{proj}</span>}
            </div>
            {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
        </div>
    );
}

function WidgetW3({ ctx, size }) {
    const color = colDiBrand("WindTre");
    const logo = TRK_BRAND_LOGOS.windtre;
    // memo sui DATI (ctx.w3 ha identità stabile dalla page): il motore non
    // rigira a ogni re-render — lezione incidente 17/08 (main thread saturo)
    const per = useMemo(() => kpiW3(ctx, ctx.scopeVendita), [ctx.w3, ctx.level, ctx.visKey, ctx.negoziKey, ctx.user?.name]); // eslint-disable-line react-hooks/exhaustive-deps
    const ymW3 = ctx.w3?.ym || ctx.ymShown;
    const proj = (v, dec = false) => {
        if (!ctx.gl || !ctx.periodoEMeseCorrente || !ctx.gl.mostraProiezione || ctx.gl.trascorsi <= 0 || !v) return null;
        const p = (v / ctx.gl.trascorsi) * ctx.gl.totali;
        const r = dec ? Math.round(p * 10) / 10 : Math.round(p);
        return r > v ? r.toLocaleString("it-IT") : null;
    };
    // vendite di OGGI registrate dal negozio (vive: nei punti entrano all'ora di scatto)
    const oggiN = ctx.includeOggi ? ctx.mine.filter((c) => isCtr(c) && validaProduzione(c) && /^windtre/i.test(c.brand || "") && giornoDi(c) === ctx.oggiISO).length : 0;
    // gamification: posizione del consulente per PUNTI dentro il suo negozio
    const rank = useMemo(() => {
        if (!per || ctx.level !== "own" || !ctx.w3?.rows) return null;
        const perStore = kpiW3({ ...ctx, level: "store" }, (c) => ctx.inMyStores(c.negozio));
        if (!perStore) return null;
        const cl = Object.entries(perStore.puntiPersona).sort((a, b) => b[1] - a[1]);
        const i = cl.findIndex(([n]) => norm(n) === norm(ctx.user?.name));
        return (i >= 0 && cl.length > 1) ? { pos: i + 1, su: cl.length } : null;
    }, [per, ctx.w3, ctx.level, ctx.visKey, ctx.user?.name]); // eslint-disable-line react-hooks/exhaustive-deps
    const caricamento = !per;
    const squadra = per ? Object.entries(per.puntiPersona).sort((a, b) => b[1] - a[1]) : [];
    const senzaPayRigheW3 = per ? ["Registrate ma senza punti in gara:", ...Object.entries(per.senzaPayCombo).map(([k, n]) => `${n}× ${k}`)] : [];
    const tabellaL = per ? [
        ["Punti Mobile", fmtPunti(per.puntiMobile), proj(per.puntiMobile, true), `${per.simReg} SIM registrate`],
        ["Punti Fisso", fmtPunti(per.puntiFisso), proj(per.puntiFisso, true), `${per.fisReg} linee registrate`],
        ["Punti Assicurazioni", fmtPunti(per.puntiAss), proj(per.puntiAss, true), `${per.pezziAss} polizze`],
        ["Telefoni GA", per.telGa, proj(per.telGa), `di cui fin. ${per.telGaFin}`],
        ["Telefoni CB", per.telCb, proj(per.telCb), `di cui fin. ${per.telCbFin}`],
        ["Operazioni CB", per.opCb, proj(per.opCb), null],
        ["Reload", per.reload, proj(per.reload), null],
        ["Luce", per.luce, proj(per.luce), null],
        ["Gas", per.gas, proj(per.gas), null],
        ["Protecta (kit)", per.kit, proj(per.kit), null],
    ] : [];
    return (
        <WidgetShell logo={logo} icon={Signal} title="WindTre" accent={color}
            action={<div className="flex items-center gap-2">{rank && <span className="text-[10px] font-bold text-amber-300 bg-amber-500/10 rounded px-1.5 py-0.5">🏅 {rank.pos}° su {rank.su}</span>}<ChipScope ctx={ctx} /></div>}>
            {caricamento ? (
                <div className="p-6 flex items-center justify-center gap-2 text-slate-500 text-xs"><Loader2 className="w-4 h-4 animate-spin" /> Calcolo punti…</div>
            ) : (
                <div className={cn("p-4 flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto", size >= 4 && "md:grid md:grid-cols-2 md:gap-5")}>
                    <div className="flex flex-col gap-3">
                        <div className={cn("grid gap-2", size >= 2 ? "grid-cols-2" : "grid-cols-1")}>
                            <TileKpi label="Punti Mobile" value={fmtPunti(per.puntiMobile)} sub={`${per.simReg} SIM`} proj={proj(per.puntiMobile, true)} color={color} />
                            <TileKpi label="Punti Fisso" value={fmtPunti(per.puntiFisso)} sub={`${per.fisReg} linee`} proj={proj(per.puntiFisso, true)} color={color} />
                            {size >= 2 && <TileKpi label="Punti Assic." value={fmtPunti(per.puntiAss)} sub={`${per.pezziAss} polizze`} proj={proj(per.puntiAss, true)} color={color} />}
                            {size >= 2 && <TileKpi label="Luce & Gas" value={per.luce + per.gas} sub={`${per.luce} luce · ${per.gas} gas`} proj={proj(per.luce + per.gas)} color={color} />}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {ctx.includeOggi && (
                                <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold", oggiN > 0 ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-slate-500")}>
                                    {oggiN > 0 && <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" /></span>}
                                    oggi +{oggiN}{!ctx.oggiContato && <span className="font-normal opacity-60">· nei punti dalle {ctx.gl?.oraScatto ?? 19}</span>}
                                </span>
                            )}
                            <ChipSonda tono="neutro" testo={<>📱 GA <b className="font-mono text-slate-100">{per.telGa}</b> <span className="text-slate-500">fin {per.telGaFin}</span></>} righe={["Telefoni rateizzati su nuova attivazione (GA):", `${per.telGa} totali, di cui ${per.telGaFin} finanziati.`, "Il pay dei device arriva col cantiere analisi (listino)."]} />
                            <ChipSonda tono="neutro" testo={<>📱 CB <b className="font-mono text-slate-100">{per.telCb}</b> <span className="text-slate-500">fin {per.telCbFin}</span></>} righe={["Telefoni rateizzati su cliente già attivo (CB):", `${per.telCb} totali, di cui ${per.telCbFin} finanziati.`]} />
                            <ChipSonda tono="neutro" testo={<>🔁 Op. CB <b className="font-mono text-slate-100">{per.opCb}</b></>} righe={["Operazioni Customer Base registrate nel periodo", "(cambi offerta e attività sui clienti già attivi)."]} />
                            <ChipSonda tono="neutro" testo={<>🔄 Reload <b className="font-mono text-slate-100">{per.reload}</b></>} righe={["Vendite con opzione Reload", "(Reload, Reload EU, Forever, Plus, Exchange, Open)."]} />
                            {size >= 2 && <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.04] border border-white/5 px-2 py-1 text-[11px] text-slate-300">🛡 Protecta <b className="font-mono text-slate-100">{per.kit}</b></span>}
                            {per.senzaPay > 0 && <ChipSonda testo={`⚠ ${per.senzaPay} senza punti`} righe={senzaPayRigheW3} />}
                        </div>
                        {size >= 2 && <Sparkline perGiorno={per.puntiGiorno} ym={ctx.rangeShown ? null : ymW3} range={ctx.rangeShown} color={color} ctx={ctx} />}
                    </div>
                    {size >= 4 && (
                        <div className="space-y-1.5 md:border-l md:border-white/5 md:pl-5">
                            {squadra.length > 1 && (<>
                                <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 flex items-center gap-1.5"><Crown className="w-3 h-3 text-amber-400" /> {ctx.level === "global" ? "Negozi (punti)" : "Squadra (punti)"}</div>
                                {squadra.slice(0, 5).map(([nome, p], i) => (
                                    <MedalRow key={nome} rank={i + 1} nome={nome} n={p} mostra={fmtPunti(p)} max={squadra[0][1]} color={color} isMe={ctx.level !== "global" && norm(nome) === norm(ctx.user?.name)} />
                                ))}
                            </>)}
                            <div className="pt-1 text-[10px] uppercase tracking-widest font-bold text-slate-500">Tutti i numeri</div>
                            {tabellaL.map(([lbl, v, pr, sub]) => (
                                <div key={lbl} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-white/[0.02]">
                                    <span className="text-slate-300">{lbl}{sub ? <span className="text-slate-500"> · {sub}</span> : null}</span>
                                    <span className="font-mono font-bold text-slate-100">{v}{pr != null && <span className="font-normal ml-1.5" style={{ color }}>≈{pr}</span>}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </WidgetShell>
    );
}

// ── WIDGET Vodafone: KPI di gara (Luca 17/08) ───────────────────────────────
// Punti mobili/fissi dal motore (tabellare azienda VF), telefoni col "di cui
// finanziati", Rete Sicura su GA e su CB, luce/gas contando ANCHE l'energia
// Fastweb (nei Vodafone Store è la stessa gara — infatti l'energia dei VS
// viaggia col brand Fastweb). Il business avrà un widget dedicato.
function kpiVF(ctx, scopeFn) {
    const vf = ctx.vf;
    if (!vf || !Array.isArray(vf.packs)) return null;
    const per = {
        // pezzi = REGISTRATO nel perimetro (per quadrare con Ricerca Vendite);
        // punti = quello che il motore aggancia. Il business ha le sue piste
        // (business_mobile/fisso) e viene contato A PARTE ma sempre mostrato —
        // fix 19/08: prima spariva dal tile (caso Magliana 6 fissi → 3).
        puntiMobile: 0, simReg: 0, puntiFisso: 0, fisReg: 0,
        bizMobN: 0, bizMobP: 0, bizFisN: 0, bizFisP: 0,
        mobSenzaPay: 0, fisSenzaPay: 0, senzaPayCombo: {}, esclLettera: 0,
        fwGaraN: 0, telP: 0, capTaglio: 0,
        telGa: 0, telGaFin: 0, telCb: 0, telCbFin: 0, opCb: 0,
        rsGa: 0, rsCb: 0, luce: 0, gas: 0,
        puntiGiorno: {}, puntiPersona: {},
    };
    // FASTWEB nella gara Vodafone (Luca 19/08): TUTTO il Fastweb allocato coi
    // codici di inserimento dei Vodafone Store (T1: Acilia/Baleniere/Castani/
    // Merulana) conta nella lettera A — mobile, fisso ed energia. Lo smista
    // contestoVfFw, la STESSA funzione del Calcolatore. Il T2 resta fuori.
    // Un pacchetto per mese del periodo: ogni mese matcha col SUO tabellare.
    vf.packs.forEach((pack) => {
        const fwGara = (pack.rowsFw || []).filter(scopeFn).filter((c) => contestoVfFw("fastweb", c.cod_ins, c.negozio, c.categoria) === "vodafone");
        per.fwGaraN += fwGara.length;
        [...pack.rows.filter(scopeFn), ...fwGara].forEach((c) => {
        const cat = String(c.categoria || "");
        const prod = String(c.prodotto || "");
        const off = String(c.offerta || "");
        const opz = String(c.opzioni || "");
        const isMob = /^mobile /i.test(cat);
        const isFis = /^fisso/i.test(cat);
        const isCb = /^customer base/i.test(cat);
        if (isMob) per.simReg++;
        if (isFis) per.fisReg++;
        if (/^telefono a rate/i.test(cat)) {
            const fin = /^finanziato/i.test(prod);
            if (/cb\s*$/i.test(prod)) { per.telCb++; if (fin) per.telCbFin++; }
            else { per.telGa++; if (fin) per.telGaFin++; }
        }
        if (isCb) per.opCb++;
        // Rete Sicura: come OPZIONE sulle attivazioni (GA) e anche come
        // PRODOTTO Customer Base (attivata su cliente già attivo — fix 19/08)
        if (/rete sicura/i.test(opz)) { if (isCb) per.rsCb++; else per.rsGa++; }
        else if (isCb && /rete sicura/i.test(prod + " " + off)) per.rsCb++;
        if (/^energia/i.test(cat)) { if (/gas/i.test(prod)) per.gas++; else per.luce++; }
        // esclusioni della lettera A sul mobile: MNP di provenienza
        // Vodafone/Fastweb/Ho. sono fuori da target e punteggio (stessa regola
        // di caricaContrattiContesto) — restano nei pezzi, sonda col perché
        if (isMob && /mnp/i.test(prod) && /vodafone|fastweb|\bho\b|ho\./i.test(String(c.provenienza || ""))) {
            per.esclLettera++; per.mobSenzaPay++;
            const k = `${prod} / ${off} — esclusa da lettera (MNP da ${c.provenienza})`;
            per.senzaPayCombo[k] = (per.senzaPayCombo[k] || 0) + 1;
            return;
        }
        // brand della VENDITA al matcher (come il Calcolatore): le righe del
        // tabellare VF hanno il gate brand_vendita — le FW T1 devono prendere
        // le righe «FW» (Wallet 1,5 ecc.), non quelle native Vodafone
        const set = pack.tab ? matchRigheAttivazione(pack.tab.righe, c, brandIdDaLabel(c.brand)) : [];
        if (set.length) {
            const pista = set[0].pista; const p = puntiPerRighe(set);
            if (pista === "mobile") { per.puntiMobile += p; if (/^telefono a rate/i.test(cat)) per.telP += p; }
            else if (pista === "fisso") per.puntiFisso += p;
            else if (pista === "business_mobile") { per.bizMobN++; per.bizMobP += p; }
            else if (pista === "business_fisso") { per.bizFisN++; per.bizFisP += p; }
            if (/^(mobile|fisso|business_mobile|business_fisso)$/.test(pista || "")) {
                const g = giornoDi(c);
                if (g) per.puntiGiorno[g] = (per.puntiGiorno[g] || 0) + p;
                const chi = ctx.level === "global" ? (c.negozio || "—") : (c.venditore || "—");
                per.puntiPersona[chi] = (per.puntiPersona[chi] || 0) + p;
            }
        } else if (isMob || isFis) {
            // SIM/linee registrate che la gara non paga (es. SIM dati, o
            // mobile Fastweb senza righe nel tabellare): sonda, mai sparire
            if (isMob) per.mobSenzaPay++; else per.fisSenzaPay++;
            const k = `${prod} / ${off}${/fastweb/i.test(String(c.brand || "")) ? " (FW)" : ""}`;
            per.senzaPayCombo[k] = (per.senzaPayCombo[k] || 0) + 1;
        }
        });
    });
    // CAP 35% (lettera VF, §Pista Mobile Consumer): gli smartphone valgono
    // fino al 35% del valore delle SIM. Correzione Luca 19/08 sera: il cap
    // vale sul TOTALE DEL GRUPPO — si applica SOLO alla vista rete (admin),
    // mai ai conteggi individuali di negozi e consulenti. Nel motore
    // (calcolaAvanzamento) resta: lì il conteggio è sempre di gruppo.
    if (ctx.level === "global" && per.telP > 0) {
        const sim = per.puntiMobile - per.telP;
        const ammessi = Math.round(sim * 0.35 * 100) / 100;
        if (per.telP > ammessi) {
            per.capTaglio = Math.round((per.telP - ammessi) * 100) / 100;
            per.puntiMobile = Math.round((sim + ammessi) * 100) / 100;
        }
    }
    return per;
}

function WidgetVodafone({ ctx, size }) {
    const color = colDiBrand("Vodafone");
    const logo = TRK_BRAND_LOGOS.vodafone;
    const per = useMemo(() => kpiVF(ctx, ctx.scopeVendita), [ctx.vf, ctx.level, ctx.visKey, ctx.negoziKey, ctx.user?.name]); // eslint-disable-line react-hooks/exhaustive-deps
    const ymVf = ctx.vf?.ym || ctx.ymShown;
    const proj = (v, dec = false) => {
        if (!ctx.gl || !ctx.periodoEMeseCorrente || !ctx.gl.mostraProiezione || ctx.gl.trascorsi <= 0 || !v) return null;
        const p = (v / ctx.gl.trascorsi) * ctx.gl.totali;
        const r = dec ? Math.round(p * 10) / 10 : Math.round(p);
        return r > v ? r.toLocaleString("it-IT") : null;
    };
    const oggiN = ctx.includeOggi ? ctx.mine.filter((c) => isCtr(c) && validaProduzione(c) && /^vodafone/i.test(c.brand || "") && giornoDi(c) === ctx.oggiISO).length : 0;
    const rank = useMemo(() => {
        if (!per || ctx.level !== "own" || !ctx.vf?.rows) return null;
        const perStore = kpiVF({ ...ctx, level: "store" }, (c) => ctx.inMyStores(c.negozio));
        if (!perStore) return null;
        const cl = Object.entries(perStore.puntiPersona).sort((a, b) => b[1] - a[1]);
        const i = cl.findIndex(([n]) => norm(n) === norm(ctx.user?.name));
        return (i >= 0 && cl.length > 1) ? { pos: i + 1, su: cl.length } : null;
    }, [per, ctx.vf, ctx.level, ctx.visKey, ctx.user?.name]); // eslint-disable-line react-hooks/exhaustive-deps
    const squadra = per ? Object.entries(per.puntiPersona).sort((a, b) => b[1] - a[1]) : [];
    const senzaPay = per ? per.mobSenzaPay + per.fisSenzaPay : 0;
    const senzaPayRighe = per ? ["Registrate ma senza punti in gara:", ...Object.entries(per.senzaPayCombo).map(([k, n]) => `${n}× ${k}`)] : [];
    const tabellaL = per ? [
        ["Punti Mobile", fmtPunti(per.puntiMobile), proj(per.puntiMobile, true), `${per.simReg} SIM registrate`],
        ["Punti Fisso", fmtPunti(per.puntiFisso), proj(per.puntiFisso, true), `${per.fisReg} linee registrate`],
        ["Business Mobile", fmtPunti(per.bizMobP), null, `${per.bizMobN} SIM`],
        ["Business Fisso", fmtPunti(per.bizFisP), null, `${per.bizFisN} linee`],
        ["Telefoni GA", per.telGa, proj(per.telGa), `di cui fin. ${per.telGaFin}`],
        ["Telefoni CB", per.telCb, proj(per.telCb), `di cui fin. ${per.telCbFin}`],
        ["Rete Sicura GA", per.rsGa, proj(per.rsGa), null],
        ["Rete Sicura CB", per.rsCb, proj(per.rsCb), null],
        ["Operazioni CB", per.opCb, proj(per.opCb), null],
        ["Luce (con FW)", per.luce, proj(per.luce), null],
        ["Gas (con FW)", per.gas, proj(per.gas), null],
    ] : [];
    return (
        <WidgetShell logo={logo} icon={Signal} title="Vodafone" accent={color}
            action={<div className="flex items-center gap-2">{rank && <span className="text-[10px] font-bold text-amber-300 bg-amber-500/10 rounded px-1.5 py-0.5">🏅 {rank.pos}° su {rank.su}</span>}<ChipScope ctx={ctx} /></div>}>
            {!per ? (
                <div className="p-6 flex items-center justify-center gap-2 text-slate-500 text-xs"><Loader2 className="w-4 h-4 animate-spin" /> Calcolo punti…</div>
            ) : (
                <div className={cn("p-4 flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto", size >= 4 && "md:grid md:grid-cols-2 md:gap-5")}>
                    <div className="flex flex-col gap-3">
                        <div className={cn("grid gap-2", size >= 2 ? "grid-cols-2" : "grid-cols-1")}>
                            <TileKpi label="Punti Mobile" value={fmtPunti(per.puntiMobile)} sub={`${per.simReg} SIM${per.bizMobN ? ` · 💼 ${per.bizMobN} biz (${fmtPunti(per.bizMobP)} pt)` : ""}`} proj={proj(per.puntiMobile, true)} color={color} />
                            <TileKpi label="Punti Fisso" value={fmtPunti(per.puntiFisso)} sub={`${per.fisReg} linee${per.bizFisN ? ` · 💼 ${per.bizFisN} biz (${fmtPunti(per.bizFisP)} pt)` : ""}`} proj={proj(per.puntiFisso, true)} color={color} />
                            {size >= 2 && <TileKpi label="Rete Sicura" value={per.rsGa + per.rsCb} sub={`${per.rsGa} GA · ${per.rsCb} CB`} proj={proj(per.rsGa + per.rsCb)} color={color} />}
                            {size >= 2 && <TileKpi label="Luce & Gas" value={per.luce + per.gas} sub={`${per.luce} luce · ${per.gas} gas (con FW)`} proj={proj(per.luce + per.gas)} color={color} />}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {ctx.includeOggi && (
                                <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold", oggiN > 0 ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-slate-500")}>
                                    {oggiN > 0 && <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" /></span>}
                                    oggi +{oggiN}{!ctx.oggiContato && <span className="font-normal opacity-60">· nei punti dalle {ctx.gl?.oraScatto ?? 19}</span>}
                                </span>
                            )}
                            <ChipSonda tono="neutro" testo={<>📱 GA <b className="font-mono text-slate-100">{per.telGa}</b> <span className="text-slate-500">fin {per.telGaFin}</span></>} righe={["Telefoni su nuova attivazione (GA):", `${per.telGa} totali, di cui ${per.telGaFin} finanziati.`, "In pista mobile: rateale 0,5 pt · finanziato 1 pt", "(col cap del 35% sulla vista di rete)."]} />
                            <ChipSonda tono="neutro" testo={<>📱 CB <b className="font-mono text-slate-100">{per.telCb}</b> <span className="text-slate-500">fin {per.telCbFin}</span></>} righe={["Telefoni su cliente già attivo (CB):", `${per.telCb} totali, di cui ${per.telCbFin} finanziati.`, "Stessi punti dei GA (0,5 rateale · 1 finanziato)."]} />
                            <ChipSonda tono="neutro" testo={<>🔁 Op. CB <b className="font-mono text-slate-100">{per.opCb}</b></>} righe={["Operazioni Customer Base (cambi offerta, MM4M,", "traslochi…): pay one-shot nei Gettoni delle Regole."]} />
                            {size < 2 && <ChipSonda tono="neutro" testo={<>🛡 R.Sicura <b className="font-mono text-slate-100">{per.rsGa + per.rsCb}</b></>} righe={[`Rete Sicura: ${per.rsGa} su attivazioni (GA) · ${per.rsCb} su clienti attivi (CB).`]} />}
                            {/* Luce&Gas visibile a OGNI taglia (Luca 23/08, caso Bazzucchi:
                                alla taglia 1 l'energia non compariva da nessuna parte) */}
                            {size < 2 && (per.luce + per.gas) > 0 && <ChipSonda tono="neutro" testo={<>⚡ L&G <b className="font-mono text-slate-100">{per.luce + per.gas}</b></>} righe={[`Luce & Gas della gara: ${per.luce} luce · ${per.gas} gas,`, "compresa l'energia Fastweb sui codici T1 dei Vodafone Store."]} />}
                            {per.fwGaraN > 0 && <ChipSonda tono="neutro" testo={<>🟨 FW in gara <b className="font-mono text-slate-100">{per.fwGaraN}</b></>} righe={["Vendite Fastweb sui codici dei Vodafone Store (T1):", "per la lettera A contano qui — mobile, fisso ed energia.", "Il Fastweb T2 (multibrand) resta nella sua gara."]} />}
                            {per.capTaglio > 0 && <ChipSonda testo={`✂️ cap 35%: −${fmtPunti(per.capTaglio)}`} righe={["Lettera Vodafone: gli smartphone (0,5 rateale · 1 finanziato)", "valgono fino al 35% del valore delle SIM.", `Telefoni ${fmtPunti(per.telP)} pt · contati ${fmtPunti(per.telP - per.capTaglio)} pt`]} />}
                            {senzaPay > 0 && <ChipSonda testo={`⚠ ${senzaPay} senza punti`} righe={senzaPayRighe} />}
                        </div>
                        {size >= 2 && <Sparkline perGiorno={per.puntiGiorno} ym={ctx.rangeShown ? null : ymVf} range={ctx.rangeShown} color={color} ctx={ctx} />}
                    </div>
                    {size >= 4 && (
                        <div className="space-y-1.5 md:border-l md:border-white/5 md:pl-5">
                            {squadra.length > 1 && (<>
                                <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 flex items-center gap-1.5"><Crown className="w-3 h-3 text-amber-400" /> {ctx.level === "global" ? "Negozi (punti)" : "Squadra (punti)"}</div>
                                {squadra.slice(0, 5).map(([nome, p], i) => (
                                    <MedalRow key={nome} rank={i + 1} nome={nome} n={p} mostra={fmtPunti(p)} max={squadra[0][1]} color={color} isMe={ctx.level !== "global" && norm(nome) === norm(ctx.user?.name)} />
                                ))}
                            </>)}
                            <div className="pt-1 text-[10px] uppercase tracking-widest font-bold text-slate-500">Tutti i numeri</div>
                            {tabellaL.map(([lbl, v, pr, sub]) => (
                                <div key={lbl} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-white/[0.02]">
                                    <span className="text-slate-300">{lbl}{sub ? <span className="text-slate-500"> · {sub}</span> : null}</span>
                                    <span className="font-mono font-bold text-slate-100">{v}{pr != null && <span className="font-normal ml-1.5" style={{ color }}>≈{pr}</span>}</span>
                                </div>
                            ))}
                            <p className="text-[10px] text-slate-600 pt-1">Il business Vodafone avrà un widget dedicato.</p>
                        </div>
                    )}
                </div>
            )}
        </WidgetShell>
    );
}

// ── WIDGET Sky: PUNTI come gli altri (Luca 19/08 notte) ─────────────────────
// «Quello che comanda le soglie sono i punti»: 3P 3 · TV/Glass 2 · Fibra 1 ·
// Mobile 0,5 (Wallet GA 0). I punti arrivano dal motore sulla pista "sky" —
// oggi configurata SOLO lato ragazzi (gara interna a punti): quando nascerà
// il tabellare azienda Sky si cambia fonte. I pezzi restano accanto.
function kpiSky(ctx, scopeFn) {
    const sky = ctx.sky;
    if (!sky || !Array.isArray(sky.packs)) return null;
    const per = { punti: 0, pezziPunti: 0, reg: 0, tre: 0, tv: 0, glass: 0, fibra: 0, mobMnp: 0, mobGa: 0, senzaPay: 0, senzaPayCombo: {}, puntiGiorno: {}, puntiPersona: {} };
    sky.packs.forEach((pack) => pack.rows.filter(scopeFn).forEach((c) => {
        const cat = String(c.categoria || "");
        const prod = String(c.prodotto || "");
        per.reg++;
        if (/^3p/i.test(prod)) per.tre++;
        else if (/glass|prova sky/i.test(prod)) per.glass++;
        else if (/^tv$/i.test(prod) || /^tv$/i.test(cat)) per.tv++;
        else if (/fibra/i.test(prod) || (/^fisso/i.test(cat) && /fibra/i.test(String(c.offerta || "")))) per.fibra++;
        else if (/^mobile mnp/i.test(prod)) per.mobMnp++;
        else if (/^mobile ga/i.test(prod)) per.mobGa++;
        const set = pack.tab ? matchRigheAttivazione(pack.tab.righe, c, brandIdDaLabel(c.brand)) : [];
        if (set.length) {
            const pnt = puntiPerRighe(set);
            per.punti += pnt; per.pezziPunti++;
            const g = giornoDi(c); if (g) per.puntiGiorno[g] = (per.puntiGiorno[g] || 0) + pnt;
            const chi = ctx.level === "global" ? (c.negozio || "—") : (c.venditore || "—");
            per.puntiPersona[chi] = (per.puntiPersona[chi] || 0) + pnt;
        } else {
            per.senzaPay++;
            const k = cat + " | " + prod + " | " + String(c.offerta || "");
            per.senzaPayCombo[k] = (per.senzaPayCombo[k] || 0) + 1;
        }
    }));
    per.punti = Math.round(per.punti * 100) / 100;
    return per;
}

function WidgetSky({ ctx, size }) {
    const color = colDiBrand("Sky");
    const logo = TRK_BRAND_LOGOS.sky;
    const per = useMemo(() => kpiSky(ctx, ctx.scopeVendita), [ctx.sky, ctx.level, ctx.visKey, ctx.negoziKey, ctx.user?.name]); // eslint-disable-line react-hooks/exhaustive-deps
    const ymSky = ctx.sky?.ym || ctx.ymShown;
    const proj = (v, dec = false) => {
        if (!ctx.gl || !ctx.periodoEMeseCorrente || !ctx.gl.mostraProiezione || ctx.gl.trascorsi <= 0 || !v) return null;
        const p = (v / ctx.gl.trascorsi) * ctx.gl.totali;
        const r = dec ? Math.round(p * 10) / 10 : Math.round(p);
        return r > v ? r.toLocaleString("it-IT") : null;
    };
    const oggiN = ctx.includeOggi ? ctx.mine.filter((c) => isCtr(c) && validaProduzione(c) && /^sky/i.test(c.brand || "") && giornoDi(c) === ctx.oggiISO).length : 0;
    const rank = useMemo(() => {
        if (!per || ctx.level !== "own" || !ctx.sky?.packs) return null;
        const perStore = kpiSky({ ...ctx, level: "store" }, (c) => ctx.inMyStores(c.negozio));
        if (!perStore) return null;
        const cl = Object.entries(perStore.puntiPersona).sort((a, b) => b[1] - a[1]);
        const i = cl.findIndex(([n]) => norm(n) === norm(ctx.user?.name));
        return (i >= 0 && cl.length > 1) ? { pos: i + 1, su: cl.length } : null;
    }, [per, ctx.sky, ctx.level, ctx.visKey, ctx.user?.name]); // eslint-disable-line react-hooks/exhaustive-deps
    const squadra = per ? Object.entries(per.puntiPersona).sort((a, b) => b[1] - a[1]) : [];
    const senzaPayRighe = per ? ["Registrate ma senza punti in gara:", ...Object.entries(per.senzaPayCombo).map(([k, n]) => n + "× " + k)] : [];
    const tabellaL = per ? [
        ["Punti Sky", fmtPunti(per.punti), proj(per.punti, true), per.pezziPunti + " pezzi in gara"],
        ["3P (TV + Fibra)", per.tre, proj(per.tre), null],
        ["Solo TV", per.tv, proj(per.tv), null],
        ["Sky Glass", per.glass, proj(per.glass), null],
        ["Solo Fibra", per.fibra, proj(per.fibra), null],
        ["Mobile MNP", per.mobMnp, proj(per.mobMnp), null],
        ["Mobile GA", per.mobGa, proj(per.mobGa), null],
    ] : [];
    return (
        <WidgetShell logo={logo} icon={Signal} title="Sky" accent={color}
            action={<div className="flex items-center gap-2">{rank && <span className="text-[10px] font-bold text-amber-300 bg-amber-500/10 rounded px-1.5 py-0.5">🏅 {rank.pos}° su {rank.su}</span>}<ChipScope ctx={ctx} /></div>}>
            {!per ? (
                <div className="p-6 flex items-center justify-center gap-2 text-slate-500 text-xs"><Loader2 className="w-4 h-4 animate-spin" /> Calcolo punti…</div>
            ) : (
                <div className={cn("p-4 flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto", size >= 4 && "md:grid md:grid-cols-2 md:gap-5")}>
                    <div className="flex flex-col gap-3">
                        <div className={cn("grid gap-2", size >= 2 ? "grid-cols-2" : "grid-cols-1")}>
                            <TileKpi label="Punti Sky" value={fmtPunti(per.punti)} sub={per.pezziPunti + " pezzi in gara"} proj={proj(per.punti, true)} color={color} />
                            <TileKpi label="3P" value={per.tre} sub="TV + Fibra" proj={proj(per.tre)} color={color} />
                            {size >= 2 && <TileKpi label="TV & Glass" value={per.tv + per.glass} sub={per.tv + " TV · " + per.glass + " Glass"} proj={proj(per.tv + per.glass)} color={color} />}
                            {size >= 2 && <TileKpi label="Fibra" value={per.fibra} sub="solo fibra" proj={proj(per.fibra)} color={color} />}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {ctx.includeOggi && (
                                <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold", oggiN > 0 ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-slate-500")}>
                                    {oggiN > 0 && <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" /></span>}
                                    oggi +{oggiN}{!ctx.oggiContato && <span className="font-normal opacity-60">· nei punti dalle {ctx.gl?.oraScatto ?? 19}</span>}
                                </span>
                            )}
                            <ChipSonda tono="neutro" testo={<>📱 MNP <b className="font-mono text-slate-100">{per.mobMnp}</b></>} righe={["SIM Sky Mobile in portabilità: 0,5 punti l\u2019una."]} />
                            <ChipSonda tono="neutro" testo={<>📱 GA <b className="font-mono text-slate-100">{per.mobGa}</b></>} righe={["SIM Sky Mobile nuove attivazioni:", "0,5 punti (Ric. Automatica) · 0 punti (ricarica pura)."]} />
                            {per.senzaPay > 0 && <ChipSonda testo={"⚠ " + per.senzaPay + " senza punti"} righe={senzaPayRighe} />}
                        </div>
                        {size >= 2 && <Sparkline perGiorno={per.puntiGiorno} ym={ctx.rangeShown ? null : ymSky} range={ctx.rangeShown} color={color} ctx={ctx} />}
                    </div>
                    {size >= 4 && (
                        <div className="space-y-1.5 md:border-l md:border-white/5 md:pl-5">
                            {squadra.length > 1 && (<>
                                <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 flex items-center gap-1.5"><Crown className="w-3 h-3 text-amber-400" /> {ctx.level === "global" ? "Negozi (punti)" : "Squadra (punti)"}</div>
                                {squadra.slice(0, 5).map(([nome, p], i) => (
                                    <MedalRow key={nome} rank={i + 1} nome={nome} n={p} mostra={fmtPunti(p)} max={squadra[0][1]} color={color} isMe={ctx.level !== "global" && norm(nome) === norm(ctx.user?.name)} />
                                ))}
                            </>)}
                            <div className="pt-1 text-[10px] uppercase tracking-widest font-bold text-slate-500">Tutti i numeri</div>
                            {tabellaL.map(([lbl, v, pr, sub]) => (
                                <div key={lbl} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-white/[0.02]">
                                    <span className="text-slate-300">{lbl}{sub ? <span className="text-slate-500"> · {sub}</span> : null}</span>
                                    <span className="font-mono font-bold text-slate-100">{v}{pr != null && <span className="font-normal ml-1.5" style={{ color }}>≈{pr}</span>}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </WidgetShell>
    );
}

// ── WIDGET Confronto: io/il mio negozio contro un riferimento (Luca 17/08) ──
// Il bersaglio è salvato NEL layout (id "confronto:<tipo>:<nome>"), così la
// scelta viaggia col profilo. Consulente → un collega; store manager → un
// negozio; direzione → duello fra due negozi a scelta.
function metricheConfronto(rows) {
    const ctr = rows.filter((c) => isCtr(c) && validaProduzione(c));
    const perBrand = {};
    ctr.forEach((c) => { const b = c.brand || "—"; perBrand[b] = (perBrand[b] || 0) + 1; });
    const marg = rows.filter((c) => isExt(c) && validaProduzione(c)).reduce((a, c) => a + qtyDi(c), 0);
    return { pezzi: ctr.length, perBrand, marg };
}

function RigaConfronto({ label, a, b, colorA, colorB }) {
    const max = Math.max(a, b, 1);
    return (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs">
            <div className="flex items-center gap-2 justify-end">
                <span className={cn("font-mono font-bold tabular-nums", a >= b ? "text-slate-100" : "text-slate-400")}>{a}{a > b ? " 🏆" : ""}</span>
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden w-full max-w-[120px]" dir="rtl">
                    <div className="h-full rounded-full" style={{ width: `${(a / max) * 100}%`, background: colorA }} />
                </div>
            </div>
            <span className="text-slate-500 text-center min-w-[80px] truncate">{label}</span>
            <div className="flex items-center gap-2">
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden w-full max-w-[120px]">
                    <div className="h-full rounded-full" style={{ width: `${(b / max) * 100}%`, background: colorB }} />
                </div>
                <span className={cn("font-mono font-bold tabular-nums", b >= a ? "text-slate-100" : "text-slate-400")}>{b > a ? "🏆 " : ""}{b}</span>
            </div>
        </div>
    );
}

function WidgetConfronto({ ctx, size, widgetKey, param }) {
    const rows = ctx.allPeriod;
    const duello = ctx.level === "global";
    const tipo = ctx.level === "own" ? "persona" : "negozio";
    // opzioni dei bersagli: chi ha prodotto nel periodo
    const negozi = [...new Set(rows.filter((c) => isCtr(c) && validaProduzione(c)).map((c) => c.negozio).filter(Boolean))].sort();
    const persone = [...new Set(rows.filter((c) => isCtr(c) && validaProduzione(c)).map((c) => c.venditore).filter(Boolean))].filter((p) => norm(p) !== norm(ctx.user?.name)).sort();
    // parse del bersaglio dal layout
    let selA = null, selB = null;
    if (param) { const parti = String(param).split("|"); selB = parti.length > 1 ? parti[1] : parti[0]; if (parti.length > 1) selA = parti[0]; }
    const nomeA = duello ? (selA || negozi[0] || "—") : ctx.level === "store" ? (ctx.myStores.join(", ") || ctx.user?.negozio || "Il mio negozio") : (ctx.user?.name || "Tu");
    const nomeB = selB || null;
    const salva = (a, b) => ctx.aggiornaWidgetId?.(widgetKey, `confronto:${tipo}:${duello ? `${a}|${b || ""}` : (b || "")}`);
    const scopeDi = (nome, isPersona) => rows.filter((c) => isPersona ? norm(c.venditore) === norm(nome) : sameStoreW(c.negozio, nome));
    const mieRighe = duello ? scopeDi(nomeA, false) : ctx.level === "store" ? ctx.mine : ctx.mine;
    const sueRighe = nomeB ? scopeDi(nomeB, tipo === "persona") : [];
    const A = metricheConfronto(mieRighe);
    const B = metricheConfronto(sueRighe);
    const brands = [...new Set([...Object.keys(A.perBrand), ...Object.keys(B.perBrand)])]
        .sort((x, y) => ((B.perBrand[y] || 0) + (A.perBrand[y] || 0)) - ((B.perBrand[x] || 0) + (A.perBrand[x] || 0)))
        .slice(0, size >= 4 ? 8 : 4);
    const colorA = "var(--tf-818cf8)", colorB = "var(--tf-f59e0b)";
    return (
        <WidgetShell icon={Swords} title="Confronto" accent="var(--tf-f59e0b)" action={<span className="text-[10px] text-slate-500">{ctx.periodoLabel}</span>}>
            <div className="p-4 space-y-3 flex-1 min-h-0 overflow-y-auto">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <div className="text-right min-w-0">
                        {duello ? (
                            <SelectOpzioni value={nomeA} onChange={(v) => salva(v, nomeB)} opzioni={negozi} placeholder="Negozio A…" className="!h-8 text-xs" />
                        ) : <div className="text-sm font-black text-indigo-300 truncate">{nomeA}</div>}
                        <div className="text-2xl font-black text-white tabular-nums">{A.pezzi}<span className="text-[10px] text-slate-500 font-bold ml-1">pezzi</span></div>
                    </div>
                    <div className="text-lg font-black text-slate-600 px-1">VS</div>
                    <div className="min-w-0">
                        <SelectOpzioni value={nomeB || ""} onChange={(v) => salva(nomeA, v)} opzioni={tipo === "persona" ? persone : negozi.filter((n) => duello ? true : !ctx.inMyStores(n))} placeholder={tipo === "persona" ? "Scegli un collega…" : "Scegli un negozio…"} className="!h-8 text-xs" />
                        <div className="text-2xl font-black text-white tabular-nums">{nomeB ? B.pezzi : "—"}<span className="text-[10px] text-slate-500 font-bold ml-1">pezzi</span></div>
                    </div>
                </div>
                {nomeB ? (
                    <div className="space-y-2">
                        {brands.map((b) => <RigaConfronto key={b} label={b} a={A.perBrand[b] || 0} b={B.perBrand[b] || 0} colorA={colorA} colorB={colorB} />)}
                        <RigaConfronto label="Marginalità" a={A.marg} b={B.marg} colorA={colorA} colorB={colorB} />
                    </div>
                ) : (
                    <p className="text-xs text-slate-500 text-center py-2">Scegli {tipo === "persona" ? "un collega" : "un negozio"} da sfidare: il confronto si salva e lo ritrovi qui. ⚔️</p>
                )}
            </div>
        </WidgetShell>
    );
}
const sameStoreW = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x)); };

// ── WIDGET: produzione di un brand ──────────────────────────────────────────
function WidgetBrand({ ctx, size, brand }) {
    if (trkBrandKey(brand) === "windtre") return <WidgetW3 ctx={ctx} size={size} />;
    if (trkBrandKey(brand) === "vodafone") return <WidgetVodafone ctx={ctx} size={size} />;
    if (trkBrandKey(brand) === "sky") return <WidgetSky ctx={ctx} size={size} />;
    const kb = trkBrandKey(brand);
    const color = colDiBrand(brand);
    const logo = TRK_BRAND_LOGOS[kb];
    // FASTWEB = la SUA GARA, cioè il T2 (Luca 19/08 sera): il contatore usa
    // il perimetro di gara smistato col codice di inserimento — le T1 NON
    // contano qui (vivono nella gara Vodafone) ma le dice il chip 🟨.
    const isFw = kb === "fastweb";
    let righe, fwInGaraVF = 0, fwEnT1 = 0, righeStore = null;
    if (isFw && ctx.vf?.packs) {
        const mio = ctx.scopeVendita;
        const store = (c) => ctx.inMyStores(c.negozio);
        righe = []; righeStore = [];
        ctx.vf.packs.forEach((p) => (p.rowsFw || []).forEach((c) => {
            const t1 = contestoVfFw("fastweb", c.cod_ins, c.negozio, c.categoria) === "vodafone";
            // spacco energia nel chip 🟨 (Luca 23/08, caso Bazzucchi: le sue
            // Luce&Gas T1 sembravano sparite — vanno DETTE, non solo contate)
            if (mio(c)) { if (t1) { fwInGaraVF++; if (/^energia/i.test(String(c.categoria || ""))) fwEnT1++; } else righe.push(c); }
            if (!t1 && store(c)) righeStore.push(c);
        }));
    } else {
        righe = ctx.mine.filter((c) => isCtr(c) && validaProduzione(c) && c.brand === brand);
    }
    const enT2 = righe.filter((c) => /^energia/i.test(String(c.categoria || ""))).length;
    const { pezzi, oggiN, proiezione, perGiorno, best } = CorpoProduzione({ ctx, size, righe, pesa: () => 1, color });
    const meseScorso = isFw ? 0 : ctx.scoped.filter((c) => isCtr(c) && validaProduzione(c) && c.brand === brand && giornoDi(c).startsWith(ctx.meseScorsoYm)).length;
    const perCat = groupCount(righe, (c) => c.categoria || "Altro");
    // gamification: posizione del consulente nella classifica del SUO negozio
    let rank = null;
    if (ctx.level === "own") {
        const base = isFw ? (righeStore || []) : (ctx.storeRows || []).filter((c) => isCtr(c) && validaProduzione(c) && c.brand === brand);
        const cl = groupCount(base, (c) => c.venditore);
        const i = cl.findIndex(([n]) => norm(n) === norm(ctx.user?.name));
        if (i >= 0 && cl.length > 1) rank = { pos: i + 1, su: cl.length };
    }
    const classifica = size >= 4
        ? (ctx.level === "global" ? groupCount(righe, (c) => c.negozio) : groupCount(ctx.level === "own" ? (isFw ? (righeStore || []) : (ctx.storeRows || []).filter((c) => isCtr(c) && validaProduzione(c) && c.brand === brand)) : righe, (c) => c.venditore))
        : null;
    return (
        <WidgetShell logo={logo} icon={Signal} title={brand} accent={color}
            action={<div className="flex items-center gap-2">{rank && <span className="text-[10px] font-bold text-amber-300 bg-amber-500/10 rounded px-1.5 py-0.5">🏅 {rank.pos}° su {rank.su}</span>}<ChipScope ctx={ctx} /></div>}>
            <div className={cn("p-4 flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto", size >= 4 && "md:grid md:grid-cols-2 md:gap-5")}>
                <div className="flex flex-col gap-3">
                    <BloccoNumero pezzi={pezzi} proiezione={proiezione} unita={isFw ? `pezzi ${ctx.periodoLabel} · gara Fastweb (T2)` : `pezzi ${ctx.periodoLabel}`} color={color} />
                    {proiezione != null && proiezione > 0 && <ProgressBar value={pezzi} max={proiezione} color={color} />}
                    <ChipsPerformance ctx={ctx} oggiN={oggiN} proiezione={proiezione} best={size >= 2 ? best : null} meseScorso={size >= 2 && ctx.ymShown && !isFw ? meseScorso : null} pezzi={pezzi} color={color} />
                    {isFw && !ctx.oggiContato && ctx.includeOggi && (
                        <p className="text-[10px] text-slate-600 -mt-1.5">Le vendite di oggi entrano nel conteggio di gara alle {ctx.gl?.oraScatto ?? 19}.</p>
                    )}
                    {(fwInGaraVF > 0 || enT2 > 0) && (
                        <div className="flex flex-wrap gap-1.5">
                            {fwInGaraVF > 0 && <ChipSonda tono="neutro" testo={<>🟨 in gara Vodafone <b className="font-mono text-slate-100">{fwInGaraVF}</b></>} righe={["Vendite Fastweb sui codici dei Vodafone Store (T1):", "NON contano qui — stanno nella gara Vodafone", "(lettera A), punti compresi. Qui c'è solo il T2.", ...(fwEnT1 > 0 ? [`Di queste, ${fwEnT1} sono Luce & Gas.`] : [])]} />}
                            {/* energia T2 sempre DETTA, a ogni taglia (Luca 23/08) */}
                            {enT2 > 0 && <ChipSonda tono="neutro" testo={<>⚡ Energia <b className="font-mono text-slate-100">{enT2}</b></>} righe={["Luce & Gas Fastweb sui codici multibrand (T2):", "contano qui, nella gara Fastweb."]} />}
                        </div>
                    )}
                    {size >= 2 && perCat.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {perCat.map(([cat, n]) => (
                                <span key={cat} className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.04] border border-white/5 px-2 py-1 text-[11px] text-slate-300">
                                    {cat} <b className="font-mono text-slate-100">{n}</b>
                                </span>
                            ))}
                        </div>
                    )}
                    {size >= 2 && <Sparkline perGiorno={perGiorno} ym={ctx.ymShown} range={ctx.rangeShown} color={color} ctx={ctx} />}
                </div>
                {size >= 4 && classifica && (
                    <div className="space-y-1.5 md:border-l md:border-white/5 md:pl-5">
                        <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 flex items-center gap-1.5"><Crown className="w-3 h-3 text-amber-400" /> {ctx.level === "global" ? "Negozi" : "Squadra"}</div>
                        {classifica.length === 0 ? <p className="text-xs text-slate-500 py-2">Nessun pezzo nel periodo.</p> :
                            classifica.slice(0, 8).map(([nome, n], i) => (
                                <MedalRow key={nome} rank={i + 1} nome={nome} n={n} max={classifica[0][1]} color={color} isMe={ctx.level !== "global" && norm(nome) === norm(ctx.user?.name)} />
                            ))}
                    </div>
                )}
            </div>
        </WidgetShell>
    );
}

// ── WIDGET: marginalità A VALORE (Luca 19/08: «sul pezzo non ha senso») ─────
// Valore = dettagli.price (TOTALE riga, già ×qty). Torta per categorie del
// pannello Marginalità col dettaglio al passaggio del mouse (portal), top
// prodotti e squadra sempre a valore; i pezzi restano come sottotesto.
const COLORI_TORTA = ["#818cf8", "#34d399", "#fbbf24", "#38bdf8", "#f472b6", "#a78bfa", "#64748b"];

function TortaMarg({ dati, totale, colori }) {
    const [tip, setTip] = useState(null);
    const C = 2 * Math.PI * 40;
    let acc = 0;
    return (
        <div className="relative shrink-0">
            <svg viewBox="0 0 100 100" className="w-28 h-28 -rotate-90">
                <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(148,163,184,.12)" strokeWidth="14" />
                {dati.map(([nome, v], i) => {
                    const frac = totale > 0 ? v / totale : 0;
                    const dash = Math.max(0, frac * C - 1);
                    const offset = -acc * C;
                    acc += frac;
                    return (
                        <circle key={nome} cx="50" cy="50" r="40" fill="none" stroke={colori[i % colori.length]} strokeWidth="14"
                            strokeDasharray={dash + " " + (C - dash)} strokeDashoffset={offset} className="cursor-help"
                            onMouseMove={(e) => setTip({ x: e.clientX + 12, y: e.clientY + 14, nome, v, pct: Math.round(frac * 100) })}
                            onMouseLeave={() => setTip(null)} />
                    );
                })}
            </svg>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-[10px] font-black text-slate-300 text-center leading-tight px-3">{fmtEuro(totale)}</span>
            </div>
            {tip && typeof document !== "undefined" && createPortal(
                <span className="fixed z-[90] rounded-lg border border-white/10 bg-slate-900/95 shadow-2xl px-3 py-2 text-[11px] text-slate-200 pointer-events-none"
                    style={{ left: tip.x, top: tip.y }}>
                    <b>{tip.nome}</b> · {fmtEuro(tip.v)} ({tip.pct}%)
                </span>, document.body)}
        </div>
    );
}

function WidgetMarginalita({ ctx, size }) {
    const righe = ctx.mine.filter((c) => isExt(c) && validaProduzione(c));
    const valore = righe.reduce((a, c) => a + valoreDi(c), 0);
    const pezzi = righe.reduce((a, c) => a + qtyDi(c), 0);
    const valOggi = righe.filter((c) => giornoDi(c) === ctx.oggiISO).reduce((a, c) => a + valoreDi(c), 0);
    const proiezione = proiezioneFineMese(ctx, valore, valOggi);
    // fallback per i prodotti-speciali del POS fuori pannello (TNP, E.Telefono…):
    // a valore dominano — senza questa regola finivano tutti in «Altro»
    const catDi = (c) => ctx.margMap?.get(norm(c.prodotto))?.cat || (/(telefono|tnp|smartphone|iphone)/i.test(String(c.prodotto || "")) ? "Telefoni" : "Altro");
    const iconaCat = (nome) => nome === "Altre" ? "•" : nome === "Telefoni" ? "📱" : (ctx.margIcone?.get(nome) || "🧩");
    const perCat = groupCount(righe, catDi, valoreDi);
    const resto = perCat.slice(6).reduce((a, [, v]) => a + v, 0);
    const datiTorta = resto > 0 ? [...perCat.slice(0, 6), ["Altre", resto]] : perCat.slice(0, 6);
    const topProdotti = groupCount(righe, (c) => c.prodotto, valoreDi).slice(0, size >= 4 ? 7 : 5);
    const meseScorsoVal = ctx.ymShown ? ctx.scoped.filter((c) => isExt(c) && validaProduzione(c) && giornoDi(c).startsWith(ctx.meseScorsoYm)).reduce((a, c) => a + valoreDi(c), 0) : 0;
    const classifica = size >= 4
        ? (ctx.level === "global" ? groupCount(righe, (c) => c.negozio, valoreDi) : groupCount(ctx.level === "own" ? (ctx.storeRows || []).filter((c) => isExt(c) && validaProduzione(c)) : righe, (c) => c.venditore, valoreDi))
        : null;
    const perGiorno = {};
    righe.forEach((c) => { const g = giornoDi(c); if (g) perGiorno[g] = (perGiorno[g] || 0) + valoreDi(c); });
    return (
        <WidgetShell icon={ShoppingBag} title="Marginalità" accent={MARG_COLOR} action={<ChipScope ctx={ctx} />}>
            <div className={cn("p-4 flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto", size >= 4 && "md:grid md:grid-cols-2 md:gap-5")}>
                <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-3xl font-black text-white leading-none tabular-nums">{fmtEuro(valore)}</p>
                            <p className="text-[11px] text-slate-500 mt-1">venduto {ctx.periodoLabel} · {pezzi} pezzi</p>
                        </div>
                        {size >= 2 && <TortaMarg dati={datiTorta} totale={valore} colori={COLORI_TORTA} />}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {ctx.includeOggi && (
                            <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold", valOggi > 0 ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-slate-500")}>
                                {valOggi > 0 && <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" /></span>}
                                oggi +{fmtEuro(valOggi)}
                            </span>
                        )}
                        {proiezione != null && proiezione > valore && (
                            <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold border border-dashed" style={{ color: MARG_COLOR, borderColor: "color-mix(in srgb, " + MARG_COLOR + " 45%, transparent)" }}>≈ {fmtEuro(proiezione)} a fine mese</span>
                        )}
                        {meseScorsoVal > 0 && (
                            <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold", (proiezione ?? valore) >= meseScorsoVal ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300")}>{(proiezione ?? valore) >= meseScorsoVal ? "↗" : "↘"} {ctx.meseScorsoLabel}: {fmtEuro(meseScorsoVal)}</span>
                        )}
                    </div>
                    <div className="space-y-1.5">
                        {datiTorta.map(([cat, v], i) => (
                            <div key={cat} className="flex items-center gap-2 text-xs">
                                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: COLORI_TORTA[i % COLORI_TORTA.length] }} />
                                <span className="text-slate-300 truncate flex-1">{iconaCat(cat)} {cat}</span>
                                <span className="font-mono font-bold text-slate-100">{fmtEuro(v)}</span>
                                <span className="text-[10px] text-slate-500 w-9 text-right">{valore > 0 ? Math.round((v / valore) * 100) : 0}%</span>
                            </div>
                        ))}
                        {datiTorta.length === 0 && <p className="text-xs text-slate-500 py-1">Nessuna vendita di marginalità nel periodo.</p>}
                    </div>
                </div>
                {size >= 2 && (
                    <div className={cn("space-y-1.5", size >= 4 && "md:border-l md:border-white/5 md:pl-5")}>
                        {size >= 4 && classifica && classifica.length > 0 && (<>
                            <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 flex items-center gap-1.5"><Crown className="w-3 h-3 text-amber-400" /> {ctx.level === "global" ? "Negozi (valore)" : "Squadra (valore)"}</div>
                            {classifica.slice(0, 6).map(([nome, v], i) => (
                                <MedalRow key={nome} rank={i + 1} nome={nome} n={v} mostra={fmtEuro(v)} max={classifica[0][1]} color={MARG_COLOR} isMe={ctx.level !== "global" && norm(nome) === norm(ctx.user?.name)} />
                            ))}
                        </>)}
                        <div className="pt-1 text-[10px] uppercase tracking-widest font-bold text-slate-500">Top prodotti (valore)</div>
                        {topProdotti.map(([p, v]) => (
                            <div key={p} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-white/[0.02]"><span className="text-slate-300 truncate">{p}</span><b className="font-mono text-slate-100 ml-2">{fmtEuro(v)}</b></div>
                        ))}
                        {size >= 4 && <div className="pt-1"><Sparkline perGiorno={perGiorno} ym={ctx.rangeShown ? null : ctx.ymShown} range={ctx.rangeShown} color={MARG_COLOR} ctx={ctx} /></div>}
                    </div>
                )}
            </div>
        </WidgetShell>
    );
}

// ── WIDGET: KPI singoli ─────────────────────────────────────────────────────
function KpiTile({ icon: Icon, label, value, sub, color }) {
    return (
        // contenuto CENTRATO in verticale: a qualsiasi altezza della card la
        // tile resta composta, niente numero in alto col vuoto sotto (25/08)
        <div className="glass-card p-4 border-t-2 h-full flex flex-col justify-center" style={{ borderTopColor: color }}>
            <div className="flex items-center gap-2 text-slate-400 text-[10px] uppercase tracking-widest font-bold mb-2">
                <Icon className="w-3.5 h-3.5" style={{ color }} /> {label}
            </div>
            <p className="text-3xl font-black text-white leading-none">{Number(value).toLocaleString("it-IT")}</p>
            {sub && <p className="text-xs text-slate-500 mt-1.5">{sub}</p>}
        </div>
    );
}

// ── WIDGET: bacheca / azioni / obiettivo / accessi (dai vecchi blocchi) ─────
const COM_BADGE = {
    info: { label: "ℹ️ Info", color: "var(--tf-60a5fa)", bg: "rgba(96,165,250,.15)" },
    warning: { label: "🚨 Urgente", color: "var(--tf-f87171)", bg: "rgba(239,68,68,.15)" },
    success: { label: "🎉 Buona notizia", color: "var(--tf-34d399)", bg: "rgba(16,185,129,.15)" },
    update: { label: "🚀 Update", color: "var(--tf-a78bfa)", bg: "rgba(139,92,246,.15)" },
    novita: { label: "💣 Novità", color: "var(--tf-fb923c)", bg: "rgba(251,146,60,.15)" },
};

function WidgetBacheca({ ctx, size }) {
    // niente più tetto per taglia: la lista riempie la card e scorre (tetto
    // di sicurezza alto, il resto vive in /comunicazioni)
    const lista = ctx.commsVisibili.slice(0, 30);
    void size;
    return (
        <WidgetShell icon={Megaphone} title="Bacheca aziendale" accent="var(--tf-38bdf8)"
            action={ctx.level !== "own" ? <Link href="/comunicazioni" className="text-[10px] font-bold text-sky-300 bg-sky-500/10 px-2 py-1 rounded-md hover:bg-sky-500/20 flex items-center gap-1"><Plus className="w-3 h-3" /> Nuovo</Link> : null}>
            <div className="p-4 space-y-3 flex-1 min-h-0 overflow-y-auto">
                {lista.length === 0 ? <p className="text-xs text-slate-500 text-center py-4">Nessun annuncio.</p> :
                    lista.map((c) => {
                        const badge = COM_BADGE[c.type] || COM_BADGE.info;
                        return (
                            <Link key={c.id} href={`/comunicazioni?apri=${c.id}`}
                                className="relative block overflow-hidden rounded-xl border p-2.5 mb-2 last:mb-0 cursor-pointer group transition-all hover:-translate-y-0.5 hover:shadow-lg"
                                style={{ borderColor: `color-mix(in srgb, ${badge.color} 35%, transparent)`, background: `linear-gradient(135deg, ${badge.bg}, transparent 65%)` }}>
                                <span aria-hidden className="absolute -right-1 -bottom-2 text-4xl opacity-[0.12] group-hover:opacity-25 transition-opacity select-none">{badge.label.split(" ")[0]}</span>
                                <div className="relative flex items-center justify-between mb-1">
                                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ color: badge.color, background: badge.bg }}>{badge.label}</span>
                                    <span className="text-[10px] text-slate-500">{c.date_display || ""}</span>
                                </div>
                                <div className="relative text-xs font-bold text-slate-100 group-hover:text-white">{c.title}</div>
                                {c.content && <div className="relative text-[11px] text-slate-400 line-clamp-2">{c.content}</div>}
                                <div className="relative mt-1 text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: badge.color }}>Apri la comunicazione →</div>
                            </Link>
                        );
                    })}
            </div>
        </WidgetShell>
    );
}

function WidgetAzioni({ ctx }) {
    const { ferme, impegni, lavorazione } = ctx;
    return (
        <WidgetShell icon={Zap} title="Azioni e to-do" accent="var(--tf-818cf8)">
            <div className="p-4 grid grid-cols-2 gap-2 border-b border-white/5">
                <Link href="/registra-vendita" className="flex items-center justify-center gap-1.5 rounded-lg bg-indigo-500/12 border border-indigo-500/25 text-indigo-300 text-[11px] font-bold py-2 hover:bg-indigo-500/20"><Plus className="w-3.5 h-3.5" /> Nuova Vendita</Link>
                <Link href="/clienti" className="flex items-center justify-center gap-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-[11px] font-bold py-2 hover:bg-white/10"><Search className="w-3.5 h-3.5" /> Trova Cliente</Link>
            </div>
            <div className="p-4 space-y-2 flex-1 min-h-0 overflow-y-auto">
                {ferme > 0 && (
                    <Link href="/pda/tracking" className="flex items-center gap-3 group">
                        <div className="w-8 h-8 rounded-lg bg-rose-500/15 flex items-center justify-center text-rose-400 shrink-0"><AlertTriangle className="w-4 h-4" /></div>
                        <div className="min-w-0"><div className="text-xs font-semibold text-slate-100">{ferme} pratiche ferme da &gt;7 giorni</div><div className="text-[10px] text-slate-500">da verificare nel Tracking PDA</div></div>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-600 ml-auto group-hover:text-slate-400" />
                    </Link>
                )}
                {impegni > 0 && (
                    <Link href="/calendario" className="flex items-center gap-3 group">
                        <div className="w-8 h-8 rounded-lg bg-sky-500/15 flex items-center justify-center text-sky-400 shrink-0"><CalendarClock className="w-4 h-4" /></div>
                        <div className="min-w-0"><div className="text-xs font-semibold text-slate-100">{impegni} impegni in scadenza</div><div className="text-[10px] text-slate-500">da gestire in Calendario</div></div>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-600 ml-auto group-hover:text-slate-400" />
                    </Link>
                )}
                {lavorazione > 0 && ferme === 0 && (
                    <Link href="/pda/tracking" className="flex items-center gap-3 group">
                        <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-400 shrink-0"><Clock className="w-4 h-4" /></div>
                        <div className="min-w-0"><div className="text-xs font-semibold text-slate-100">{lavorazione} pratiche in lavorazione</div><div className="text-[10px] text-slate-500">da completare nel Tracking PDA</div></div>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-600 ml-auto group-hover:text-slate-400" />
                    </Link>
                )}
                {ferme === 0 && impegni === 0 && lavorazione === 0 && <p className="text-xs text-slate-500 text-center py-3">Tutto in ordine — nessuna azione urgente. ✅</p>}
            </div>
        </WidgetShell>
    );
}

function WidgetObiettivo({ ctx }) {
    const { targetVal, targetTitle, targetSub, mine } = ctx;
    const perc = targetVal > 0 ? Math.round((mine.length / targetVal) * 100) : 0;
    return (
        <WidgetShell icon={TargetIcon} title={targetTitle} accent="var(--tf-818cf8)" action={<span className="text-[10px] text-slate-500">{ctx.periodoLabel}</span>}>
            <div className="p-5 flex-1 flex flex-col justify-center">
                <div className="flex items-end justify-between mb-2">
                    <div>
                        <div className="text-[11px] text-slate-500 mb-1">{targetSub}</div>
                        <div className="text-3xl font-black text-white leading-none">{mine.length}{targetVal > 0 && <span className="text-base text-slate-500 font-bold"> / {targetVal}</span>}</div>
                    </div>
                    {targetVal > 0 && <div className="text-xl font-black" style={{ color: perc >= 100 ? "var(--tf-22c55e)" : "var(--tf-818cf8)" }}>{perc}%</div>}
                </div>
                {targetVal > 0 ? (
                    <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(perc, 100)}%`, background: perc >= 100 ? "linear-gradient(90deg,#16a34a,#22c55e)" : "linear-gradient(90deg,#4f46e5,#818cf8)" }} />
                    </div>
                ) : (
                    <p className="text-[11px] text-slate-500 mt-1">Obiettivo non impostato — l'Admin lo configura in <b>Amministrazione → Obiettivi Home</b>.</p>
                )}
            </div>
        </WidgetShell>
    );
}

function WidgetAccessi({ ctx }) {
    const uid = ctx.user?.id;
    const [users, setUsers] = useState(null);
    const key = uid ? `tf_home_login_hidden_${uid}` : null;
    const [hidden, setHidden] = useState(() => {
        try { return new Set(JSON.parse(localStorage.getItem(`tf_home_login_hidden_${uid}`) || "[]")); } catch { return new Set(); }
    });
    const [mostraNascosti, setMostraNascosti] = useState(false);
    useEffect(() => {
        let vivo = true;
        supabase.from("app_users").select("id, full_name, role, last_seen_at, active, primary_store")
            .not("last_seen_at", "is", null).order("last_seen_at", { ascending: true }).limit(500)
            .then(({ data }) => {
                if (!vivo) return;
                let lista = (data || []).filter((u) => u.active !== false);
                // MANAGER: solo il PROPRIO team (Luca 24/08) — store manager
                // per negozi; i direttori di reparto per AREA (cc/outbound)
                if (!ctx.seesAll) {
                    const r = ctx.user?.role;
                    if (r === "direttore_cc") lista = lista.filter((u) => areaOf(u.role) === "cc");
                    else if (r === "direttore_ob") lista = lista.filter((u) => areaOf(u.role) === "ob");
                    else lista = lista.filter((u) => ctx.inMyStores(u.primary_store));
                }
                setUsers(lista);
            });
        return () => { vivo = false; };
    }, [ctx.seesAll]); // eslint-disable-line react-hooks/exhaustive-deps
    const toggle = (id) => {
        setHidden((prev) => {
            const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id);
            if (key) { try { localStorage.setItem(key, JSON.stringify([...n])); } catch { /* storage negato */ } }
            return n;
        });
    };
    const fmtQuando = (s) => {
        if (!s) return "—";
        const d = new Date(s); if (isNaN(d.getTime())) return "—";
        return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    };
    const visibili = (users || []).filter((u) => mostraNascosti || !hidden.has(u.id));
    return (
        <WidgetShell icon={LogIn} title="Accessi collaboratori" accent="var(--tf-34d399)"
            action={hidden.size > 0 ? <button onClick={() => setMostraNascosti((v) => !v)} className="text-[10px] font-bold text-slate-400 hover:text-slate-200 flex items-center gap-1">{mostraNascosti ? <><Eye className="w-3 h-3" /> nascondi ({hidden.size})</> : <><EyeOff className="w-3 h-3" /> mostra nascosti ({hidden.size})</>}</button> : <span className="text-[10px] text-slate-500">dal più vecchio</span>}>
            <div className="p-3 space-y-1.5 flex-1 min-h-0 overflow-y-auto">
                {users === null ? <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-slate-500" /></div>
                    : visibili.length === 0 ? <p className="text-xs text-slate-500 text-center py-4">Nessun accesso registrato.</p>
                        : visibili.map((u) => {
                            const nascosto = hidden.has(u.id);
                            return (
                                <div key={u.id} className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 group", nascosto ? "opacity-40 bg-white/[0.01]" : "bg-white/[0.02] hover:bg-white/[0.05]")}>
                                    <div className="w-7 h-7 rounded-full bg-emerald-500/15 text-emerald-300 flex items-center justify-center text-[11px] font-black shrink-0">{(u.full_name || "?").charAt(0).toUpperCase()}</div>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-xs font-semibold text-slate-100 truncate">{u.full_name || "—"}</div>
                                        <div className="text-[10px] text-slate-500 truncate">{roleLabel(u.role)}</div>
                                    </div>
                                    <div className="text-[10px] text-slate-400 tabular-nums shrink-0">{fmtQuando(u.last_seen_at)}</div>
                                    <button onClick={() => toggle(u.id)} title={nascosto ? "Mostra di nuovo" : "Nascondi dalla mia vista"} className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-white/10 text-slate-500 shrink-0">
                                        {nascosto ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                                    </button>
                                </div>
                            );
                        })}
            </div>
        </WidgetShell>
    );
}

function WidgetClassifica({ ctx, size }) {
    const isVenditore = ctx.level === "own";
    // lista SEMPRE completa: riempie la card a qualsiasi altezza e scorre
    const lista = ctx.classifica;
    if (size < 4) {
        return (
            <WidgetShell icon={Trophy} title="Classifica venditori" accent="var(--tf-f59e0b)" action={<span className="text-[10px] text-slate-500">per contratti</span>}>
                <div className="p-3 space-y-1.5 flex-1 min-h-0 overflow-y-auto">
                    {lista.length === 0 ? <p className="text-xs text-slate-500 text-center py-4">Nessun contratto nel periodo.</p> :
                        lista.map((v) => (
                            <MedalRow key={v.nome} rank={v.rank} nome={v.nome} n={v.n} max={lista[0]?.n || 1} color="var(--tf-f59e0b)" isMe={isVenditore && norm(v.nome) === norm(ctx.user?.name)} />
                        ))}
                </div>
            </WidgetShell>
        );
    }
    return (
        <div className="glass-card overflow-hidden h-full flex flex-col">
            <div className="px-5 py-3.5 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-400" /><h3 className="text-[13px] font-bold text-slate-200 tracking-wide">Classifica generale venditori</h3></div>
                <span className="text-[10px] text-slate-500">Per numero contratti · € con le provvigioni (in arrivo)</span>
            </div>
            <div className="overflow-x-auto flex-1 min-h-0 overflow-y-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-[10px] uppercase tracking-widest text-slate-500 bg-white/[0.01]">
                            <th className="py-3 px-5 text-center w-16">Pos.</th>
                            <th className="py-3 px-5 text-left">Venditore</th>
                            <th className="py-3 px-5 text-left">Negozio</th>
                            <th className="py-3 px-5 text-right">Contratti</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lista.length === 0 ? (
                            <tr><td colSpan={4} className="py-8 text-center text-slate-500 text-sm">Nessun contratto nel periodo.</td></tr>
                        ) : lista.map((v) => {
                            const isMe = isVenditore && norm(v.nome) === norm(ctx.user?.name);
                            return (
                                <tr key={v.nome} className="border-t border-white/[0.03]" style={isMe ? { background: "rgba(99,102,241,0.08)" } : undefined}>
                                    <td className="py-3 px-5 text-center">{v.rank === 1 ? "🥇" : v.rank === 2 ? "🥈" : v.rank === 3 ? "🥉" : <span className="text-slate-500 font-bold">{v.rank}</span>}</td>
                                    <td className="py-3 px-5"><span className="font-bold" style={{ color: isMe ? "var(--tf-a5b4fc)" : "var(--tf-f1f5f9)" }}>{v.nome}{isMe && <span className="ml-2 text-[9px] font-bold text-indigo-300 bg-indigo-500/15 px-1.5 py-0.5 rounded">TU</span>}</span></td>
                                    <td className="py-3 px-5 text-slate-400">{v.negozio || "—"}</td>
                                    <td className="py-3 px-5 text-right font-black text-slate-200">{v.n}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ── REGISTRO ────────────────────────────────────────────────────────────────
// id fissi + id dinamici "brand:<Brand>". Ogni voce: label, icona, taglie
// ammesse, taglia di default, disponibilità per contesto.
// ── WIDGET WHATSAPP DEL TEAM (Luca 25/08 notte): solo manager. Tempo medio
// di risposta ai clienti, alert sulle chat rimaste senza risposta e anello
// con la ripartizione dei messaggi scritti da ogni collaboratore nel mese.
// I numeri considerati sono ESATTAMENTE quelli che l'utente vede nell'Inbox
// (waIstanzeVisibili + supervisione call center per il direttore cc); solo
// chat 1-a-1, finestra dati = inizio mese o ultimi 30 giorni (la più ampia).
const WA_TORTA_COLORI = ["#22c55e", "#38bdf8", "#a78bfa", "#f59e0b", "#f43f5e", "#14b8a6", "#eab308", "#94a3b8"];

// CHIUSURE DI CORTESIA (Luca 25/08 sera: «ok grazie buona giornata» non è
// una chat da gestire, è una chat conclusa). Euristica CONSERVATIVA: testo
// corto, nessuna domanda o richiesta, e OGNI parola nel vocabolario dei
// saluti — nel dubbio la chat resta tra quelle da rispondere. Il resto lo
// copre la chiusura manuale (✓ sull'alert o «Conclusa» nella chat).
const WA_VOCAB_CHIUSURA = new Set([
    "ok", "okay", "okk", "oki", "va", "bene", "benissimo", "vabbe", "vabbè", "perfetto", "perfetta",
    "daccordo", "ricevuto", "ricevuta", "grazie", "grz", "mille", "tante", "infinite", "ancora",
    "ringrazio", "ti", "la", "vi", "molto", "gentile", "gentilissimo", "gentilissima", "gentilissimi",
    "buona", "buon", "giornata", "serata", "sera", "domenica", "weekend", "lavoro", "fine",
    "settimana", "pomeriggio", "notte", "buonanotte", "buongiorno", "buonasera", "a", "presto",
    "dopo", "domani", "ci", "sentiamo", "vediamo", "ciao", "salve", "arrivederci", "top", "ottimo",
    "tutto", "chiaro", "capito", "nessun", "problema", "figurati", "prego", "cordiali", "saluti",
    "anche", "te", "lei", "voi", "altrettanto", "idem", "bacioni", "1000",
    // parole-collante: senza queste «ok grazie E buona giornata» falliva il
    // vocabolario per la sola congiunzione (caso Sabrina 25/08). Il cancello
    // vero resta il CONGEDO qui sotto: il collante da solo non chiude nulla.
    "e", "ed", "di", "del", "della", "per", "con", "un", "una", "il", "lo", "le", "che",
    "davvero", "veramente", "comunque", "poi", "allora", "intanto", "sempre",
    "cara", "caro", "cari", "signora", "signor", "signore", "dott", "dottore", "dottoressa",
]);

// il cliente ha dato una CONFERMA SECCA («ok», «va bene», «perfetto»)? Da
// sola non dice se la chat è finita: dipende da cosa avevamo scritto NOI.
const WA_CONFERME = new Set(["ok", "okay", "okk", "oki", "va bene", "vabbe", "vabbè", "perfetto", "d accordo", "daccordo", "ricevuto", "ricevuta", "certo", "certamente", "ottimo", "top", "benissimo", "va benissimo", "si si", "sisi"]);
export function confermaSecca(testo) {
    const t = String(testo || "").toLowerCase().replace(/[’‘`]/g, " ").replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").trim();
    return WA_CONFERME.has(t);
}

// il NOSTRO messaggio chiede qualcosa al cliente? Serve per la categoria
// «in attesa del cliente» (richiesta nostra senza risposta) e per giudicare
// un suo «ok»: dopo una richiesta è un impegno (aspettiamo), dopo una
// comunicazione è un congedo (conclusa). Conservativa: «?» o formule di
// richiesta esplicite.
export function richiedeRisposta(testo) {
    const t = String(testo || "").toLowerCase();
    if (!t.trim() || t.startsWith("[")) return false;
    if (t.includes("?")) return true;
    return /mi mandi|mi invii|mi giri|mandami|inviami|girami|mi pu[oò] (mandare|inviare|girare|dire|far)|mi serve|mi servirebbe|ci serve|fammi sapere|mi faccia sapere|ci faccia sapere|facci sapere|fatemi sapere|attendo|aspetto|resto in attesa|restiamo in attesa|mi confermi|ci confermi|mi dica|mi dici|appena (pu[oò]|puoi|riesce|riesci)|quando (pu[oò]|puoi|riesce|riesci)|le chiedo di|ti chiedo di|serve che|servirebbe che/.test(t);
}
export function chiusuraDiCortesia(testo) {
    // apostrofo tipografico di iPhone (’) normalizzato, sennò «d’accordo»
    // e «d'accordo» si comportano diversamente
    const t = String(testo || "").toLowerCase().replace(/[’‘`]/g, "'").trim();
    if (!t || t.length > 60) return false;
    if (t.includes("?")) return false;
    if (t.startsWith("[")) return false;   // etichette ([Sticker], [Posizione]…): non giudicare
    if (/quando|come|dove|perch|posso|potete|puoi|vorrei|serve|aspetto|attendo|fatemi|fammi|mandami|inviami|richiam|prezzo|costo|quanto/.test(t)) return false;
    const parole = t.replace(/[^\p{L}\p{N}' ]+/gu, " ").replace(/\s+/g, " ").trim();
    // niente parole: cortesia SOLO se c'è davvero un'emoji (👍🙏❤️) — un
    // «!!!» arrabbiato non è un congedo
    if (!parole) return /[☀-➿\u{1f300}-\u{1faff}❤]/u.test(t);
    const lista = parole.split(" ").map((p) => p.replace(/'/g, ""));
    if (!lista.every((p) => WA_VOCAB_CHIUSURA.has(p))) return false;
    // un «ok» / «va bene» / «perfetto» SECCO è una conferma (spesso chiede
    // un'azione nostra: fissare, attivare, richiamare) — per essere un
    // congedo serve anche una parola di saluto o un grazie (revisore 25/08)
    const CONGEDO = ["grazie", "grz", "ringrazio", "arrivederci", "ciao", "salve", "saluti", "buona", "buon", "buongiorno", "buonasera", "buonanotte", "notte", "bacioni", "altrettanto", "gentilissimo", "gentilissima"];
    return lista.some((p) => CONGEDO.includes(p));
}

function fmtDurataWa(ms) {
    if (ms == null || isNaN(ms) || ms < 0) return "—";
    const min = Math.round(ms / 60000);
    if (min < 1) return "meno di 1 min";
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h ${min % 60}m`;
    return `${Math.floor(h / 24)}g ${h % 24}h`;
}

// anello del team: STESSA lingua degli anelli di Analisi (Luca 25/08 sera:
// «non è in linea, quelli sono più belli e questo non è nemmeno cliccabile»)
// — fette animate, hover che accende, click che blocca il dettaglio (📌),
// centro vivo con totale o con la persona scelta.
function AnelloTeamWa({ fette, uid, grande }) {
    const [hl, setHl] = useState(null);
    const [pin, setPin] = useState(null);
    const [on, setOn] = useState(false);
    useEffect(() => { const t = setTimeout(() => setOn(true), 80); return () => clearTimeout(t); }, []);
    const tot = fette.reduce((s, f) => s + f.v, 0);
    let acc = 0;
    const conQuote = fette.map((f) => { const fr = tot > 0 ? f.v / tot : 0; const o = acc; acc += fr; return { ...f, f: fr, o, pct: tot > 0 ? Math.round((f.v / tot) * 100) : 0 }; });
    const att = conQuote.find((x) => x.k === (hl || pin)) || null;
    const size = 150, r = 56, sw = 14, C = 2 * Math.PI * r, cx = size / 2, cy = size / 2;
    const righe = grande ? conQuote : conQuote.slice(0, 4);
    return (
        <div className="flex items-center gap-4 select-none">
            <div className={cn("relative shrink-0", grande ? "w-[128px] h-[128px]" : "w-[104px] h-[104px]")}>
                <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full" style={{ overflow: "visible" }}>
                    <g transform={`translate(${cx},${cy})`}>
                        <circle r={r} fill="none" stroke="rgba(255,255,255,.05)" strokeWidth={sw} />
                        <g transform="rotate(-90)">
                            {conQuote.map((x) => {
                                const attiva = (hl || pin) === x.k;
                                const spenta = (hl || pin) && !attiva;
                                return (
                                    <circle key={x.k} r={r} fill="none" stroke={x.col} strokeLinecap="butt"
                                        strokeWidth={attiva ? sw + 5 : sw}
                                        strokeDasharray={`${on ? Math.max(0.001, x.f * C - (conQuote.length > 1 ? 2.5 : 0)) : 0.001} ${C}`}
                                        strokeDashoffset={-(x.o * C)}
                                        pointerEvents="stroke" className="cursor-pointer"
                                        onMouseEnter={() => setHl(x.k)} onMouseLeave={() => setHl(null)}
                                        onClick={() => setPin((pv) => (pv === x.k ? null : x.k))}
                                        style={{
                                            transition: "stroke-dasharray .8s cubic-bezier(.2,.8,.2,1), stroke-width .2s, opacity .25s",
                                            opacity: spenta ? 0.28 : 1,
                                            filter: attiva ? `drop-shadow(0 0 7px ${x.col}AA)` : `drop-shadow(0 0 3px ${x.col}33)`,
                                        }} />
                                );
                            })}
                        </g>
                        {on && conQuote.filter((x) => x.f >= 0.1).map((x) => {
                            const th = (x.o + x.f / 2) * 2 * Math.PI - Math.PI / 2;
                            return (
                                <text key={x.k} x={Math.cos(th) * r} y={Math.sin(th) * r} textAnchor="middle" dominantBaseline="central"
                                    className="pointer-events-none" fill="#fff" fontSize="10" fontWeight="900"
                                    style={{ paintOrder: "stroke", stroke: "rgba(10,12,28,.75)", strokeWidth: 3, opacity: (hl || pin) && (hl || pin) !== x.k ? 0.3 : 1, transition: "opacity .25s" }}>
                                    {x.pct}%
                                </text>
                            );
                        })}
                    </g>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-2">
                    {att ? (
                        <>
                            <span className="text-[10px] font-bold truncate max-w-full" style={{ color: att.col }}>{att.nome}</span>
                            <span className="text-xl font-black tabular-nums leading-none mt-0.5" style={{ color: att.col, textShadow: `0 0 14px ${att.col}66` }}>{att.pct}%</span>
                            <span className="text-[9px] text-slate-400 mt-0.5 tabular-nums">{att.v} msg{pin === att.k ? " · 📌" : ""}</span>
                        </>
                    ) : (
                        <>
                            <span className="text-xl font-black text-white tabular-nums leading-none">{tot.toLocaleString("it-IT")}</span>
                            <span className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">messaggi</span>
                        </>
                    )}
                </div>
            </div>
            <div className="min-w-0 flex-1 flex flex-col gap-1">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Messaggi scritti nel mese</div>
                {righe.map((x) => {
                    const attiva = (hl || pin) === x.k;
                    return (
                        <div key={x.k} onMouseEnter={() => setHl(x.k)} onMouseLeave={() => setHl(null)}
                            onClick={() => setPin((pv) => (pv === x.k ? null : x.k))}
                            title={pin === x.k ? "Sblocca" : "Clicca per bloccare il dettaglio"}
                            className={cn("flex items-center gap-2 text-[11px] rounded-lg border px-2 py-1 cursor-pointer transition-all",
                                attiva ? "border-white/25 bg-white/[0.07]" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]",
                                pin && pin !== x.k && !hl ? "opacity-45" : "")}>
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: x.col }} />
                            <span className="font-semibold text-slate-200 truncate">{x.nome}{x.k === uid ? " (tu)" : ""}</span>
                            <span className="ml-auto shrink-0 text-slate-400 font-bold tabular-nums">{x.v} · {x.pct}%</span>
                        </div>
                    );
                })}
                {conQuote.length > righe.length && <div className="text-[10px] text-slate-500">…e altri {conQuote.length - righe.length}</div>}
            </div>
        </div>
    );
}

function WidgetWhatsApp({ ctx, size }) {
    const uid = ctx.user?.id;
    const [dati, setDati] = useState(null);
    const [giro, setGiro] = useState(0);
    useEffect(() => { const t = setInterval(() => setGiro((g) => g + 1), 120000); return () => clearInterval(t); }, []);
    useEffect(() => {
        let vivo = true;
        (async () => {
            const [{ data: insts }, { data: users }] = await Promise.all([
                supabase.from("wa_instances").select("id, owner_user_id, negozio, display_name, wa_number, status"),
                supabase.from("app_users").select("id, full_name, role"),
            ]);
            if (!vivo) return;
            const utenti = new Map((users || []).map((u) => [u.id, u]));
            // solo le CONNESSE: le stesse chat che l'Inbox mostra (un alert su
            // un numero disconnesso sarebbe un click a vuoto)
            let vis = waIstanzeVisibili(insts || [], uid, ctx.user?.role, ctx.myStores, { soloConnesse: true });
            // stessa estensione dell'Inbox: il direttore cc vede i numeri dei suoi operatori
            if (ctx.user?.role === "direttore_cc") {
                const gia = new Set(vis.map((i) => i.id));
                vis = [...vis, ...(insts || []).filter((i) => !gia.has(i.id) && i.status === "connessa" && i.owner_user_id && areaOf(utenti.get(i.owner_user_id)?.role) === "cc")];
            }
            if (!vis.length) { setDati({ vuoto: "Nessun numero WhatsApp collegato per il tuo negozio." }); return; }
            const { data: convs } = await supabase.from("wa_conversations")
                .select("id, instance_id, customer_name, customer_number, last_message_at, chiusa_il")
                .in("instance_id", vis.map((i) => i.id))
                .or("is_group.is.null,is_group.eq.false")
                .not("last_message_at", "is", null)
                .order("last_message_at", { ascending: false }).limit(400);
            if (!vivo) return;
            const mappaConv = new Map((convs || []).map((c) => [c.id, c]));
            if (!mappaConv.size) { setDati({ vuoto: "Ancora nessuna chat coi clienti su questi numeri." }); return; }
            const oggi = new Date();
            const inizioMese = new Date(oggi.getFullYear(), oggi.getMonth(), 1).getTime();
            const daMs = Math.min(inizioMese, oggi.getTime() - 30 * 86400000);
            const da = new Date(daMs).toISOString();
            // messaggi a blocchi di 100 conversazioni (URL corti), max 3
            // pagine l'uno IN DISCESA: se una chat sfora il tetto si perde
            // il passato, MAI l'ultimo messaggio (un taglio in salita
            // mostrava «senza risposta» chat che una risposta ce l'avevano);
            // tie-break su id per i created_at identici dei backfill
            const ids = [...mappaConv.keys()];
            const msgs = [];
            for (let b = 0; b < ids.length; b += 100) {
                const blocco = ids.slice(b, b + 100);
                for (let p = 0; p < 3; p++) {
                    const { data: pag } = await supabase.from("wa_messages")
                        .select("conversation_id, direction, wa_timestamp, created_at, sent_by_user_id, body, media_mime")
                        .in("conversation_id", blocco).is("deleted_at", null)
                        .gte("created_at", da)
                        .order("created_at", { ascending: false }).order("id", { ascending: false })
                        .range(p * 1000, p * 1000 + 999);
                    msgs.push(...(pag || []));
                    if (!pag || pag.length < 1000) break;
                }
            }
            if (!vivo) return;
            // la finestra vale sul TEMPO VERO del messaggio (wa_timestamp):
            // un import dello storico ha created_at = adesso ma messaggi
            // vecchi — senza questo filtro una chat chiusa mesi fa compariva
            // «senza risposta da 90g» per 30 giorni dall'import
            // fuori le righe SENZA testo né media: sono reazioni (👍) o eventi
            // di servizio, non messaggi — il caso «Elvira senza risposta da
            // 22 giorni» era esattamente una di queste (bolla vuota)
            const righe = msgs
                .map((m) => ({ ...m, t: new Date(m.wa_timestamp || m.created_at).getTime() }))
                .filter((m) => !isNaN(m.t) && m.t >= daMs && (m.direction === "in" || m.direction === "out")
                    && (String(m.body || "").trim() !== "" || m.media_mime))
                .sort((a, b) => a.t - b.t);
            const perConv = new Map();
            righe.forEach((m) => { const a = perConv.get(m.conversation_id) || []; a.push(m); perConv.set(m.conversation_id, a); });
            let sommaRisp = 0, nRisp = 0, inMese = 0, outMese = 0, concluse = 0;
            const perUtente = new Map(); const attive = new Set();
            const daRisp = [];   // il cliente ha scritto e tocca a NOI
            const attesa = [];   // richiesta NOSTRA senza risposta del cliente
            perConv.forEach((arr, cid) => {
                let inAperto = null; // primo messaggio del cliente ancora senza risposta
                arr.forEach((m) => {
                    if (m.t >= inizioMese) {
                        if (m.direction === "in") inMese++; else outMese++;
                        if (m.direction === "out") { const k = m.sent_by_user_id || "tel"; perUtente.set(k, (perUtente.get(k) || 0) + 1); }
                        attive.add(cid);
                    }
                    if (m.direction === "in") { if (inAperto == null) inAperto = m.t; }
                    else { if (inAperto != null && m.t >= inizioMese) { sommaRisp += m.t - inAperto; nRisp++; } inAperto = null; }
                });
                // ── CATEGORIA della chat (ragionamento Luca 25/08 sera) ──
                const ultimo = arr[arr.length - 1];
                if (!ultimo) return;
                const c = mappaConv.get(cid);
                const nomeChat = c?.customer_name || (c?.customer_number ? `+${c.customer_number}` : "chat");
                // la chiusura manuale vale solo finché non arriva un
                // messaggio PIÙ NUOVO (di chiunque): dopo, si rivaluta
                const chiusaOk = c?.chiusa_il && new Date(c.chiusa_il).getTime() >= ultimo.t - 1500;
                if (ultimo.direction === "in") {
                    if (chiusaOk || chiusuraDiCortesia(ultimo.body)) { concluse++; return; }
                    // «ok» secco del cliente: se il NOSTRO messaggio prima
                    // non chiedeva nulla («ci risentiamo a settembre…»), è
                    // un congedo → conclusa; se chiedeva qualcosa, resta
                    // da gestire (c'è un'azione in ballo)
                    const prevOut = [...arr].reverse().find((m) => m.direction === "out");
                    if (confermaSecca(ultimo.body) && prevOut && !richiedeRisposta(prevOut.body)) { concluse++; return; }
                    daRisp.push({ id: cid, nome: nomeChat, da: ultimo.t });
                } else {
                    if (chiusaOk) return;   // chiusa dopo la nostra richiesta: non aspettiamo più
                    // ultima parola NOSTRA che chiede qualcosa → aspettiamo
                    // il cliente: da non dimenticare (sollecito)
                    if (richiedeRisposta(ultimo.body)) attesa.push({ id: cid, nome: nomeChat, da: ultimo.t });
                }
            });
            daRisp.sort((a, b) => a.da - b.da);
            attesa.sort((a, b) => a.da - b.da);
            const fette = [...perUtente.entries()]
                .map(([k, v]) => ({ k, v, nome: k === "tel" ? "Da telefono" : (utenti.get(k)?.full_name || "Utente rimosso") }))
                .sort((a, b) => b.v - a.v)
                .map((f, i) => ({ ...f, col: WA_TORTA_COLORI[i % WA_TORTA_COLORI.length] }));
            setDati({
                media: nRisp ? sommaRisp / nRisp : null, nRisp, inMese, outMese,
                chatAttive: attive.size, daRisp, attesa, fette, nNumeri: vis.length,
                concluse, tetto: (convs || []).length >= 400,
            });
        })();
        return () => { vivo = false; };
    }, [uid, ctx.user?.role, ctx.negoziKey, giro]); // eslint-disable-line react-hooks/exhaustive-deps
    const azione = <Link href="/chat?mode=wa" className="text-[11px] font-bold text-emerald-300 hover:text-emerald-200 flex items-center gap-1">Apri <ArrowRight className="w-3 h-3" /></Link>;
    // ✓ su una riga (da rispondere O in attesa): la chat è a posto così —
    // sparisce subito; se il cliente riscrive, riappare da sola. Il widget
    // può essere vecchio fino a 2 minuti: se nel frattempo è arrivato un
    // messaggio nuovo NON si chiude sopra roba mai vista — si ricarica.
    const chiudiAlert = async (a) => {
        const { data: fresca } = await supabase.from("wa_conversations").select("last_message_at").eq("id", a.id).maybeSingle();
        const ultimoTs = fresca?.last_message_at ? new Date(fresca.last_message_at).getTime() : 0;
        if (ultimoTs > a.da + 1500) { setGiro((g) => g + 1); return; }
        const { error } = await supabase.from("wa_conversations").update({ chiusa_il: new Date().toISOString() }).eq("id", a.id);
        if (error) return;
        setDati((p) => p ? {
            ...p,
            daRisp: (p.daRisp || []).filter((x) => x.id !== a.id),
            attesa: (p.attesa || []).filter((x) => x.id !== a.id),
            concluse: (p.concluse || 0) + 1,
        } : p);
    };
    const shell = (figli) => (
        <WidgetShell icon={MessageCircle} title="WhatsApp del team" accent="var(--tf-22c55e)" action={azione}>{figli}</WidgetShell>
    );
    if (!dati) return shell(<div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>);
    if (dati.vuoto) return shell(<p className="text-xs text-slate-500 px-3 py-4">{dati.vuoto}</p>);
    const totFette = dati.fette.reduce((s, f) => s + f.v, 0);
    const nAlert = size >= 4 ? 8 : 3;
    const nAttesa = size >= 4 ? 5 : 2;
    const adesso = Date.now();
    const rigaChat = (a, tinta) => (
        <div key={a.id} className="flex items-center gap-1">
            <Link href={`/chat?conv=${a.id}`} className="flex-1 min-w-0 flex items-center justify-between gap-2 text-[11px] hover:bg-white/[0.05] rounded-lg px-1.5 py-0.5 -mx-1.5 transition-colors">
                <span className="font-semibold text-slate-200 truncate">{a.nome}</span>
                <span className={cn("shrink-0 font-bold", tinta === "rossa"
                    ? (adesso - a.da > 3 * 3600000 ? "text-rose-300" : "text-amber-300")
                    : (adesso - a.da > 2 * 86400000 ? "text-sky-300" : "text-slate-400"))}>da {fmtDurataWa(adesso - a.da)}</span>
            </Link>
            <button onClick={() => chiudiAlert(a)} title="Segna conclusa: non aspettiamo più nulla qui (se il cliente riscrive, torna in elenco)"
                className="shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-slate-500 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors text-[11px] font-bold">✓</button>
        </div>
    );
    return shell(
        <div className="space-y-3 p-3 flex-1 min-h-0 overflow-y-auto">
            {/* KPI del mese */}
            <div className={cn("grid gap-2", size >= 4 ? "grid-cols-4" : "grid-cols-2")}>
                <div className="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">Risposta media</div>
                    <div className="text-lg font-black text-emerald-300 leading-tight">{fmtDurataWa(dati.media)}</div>
                    <div className="text-[10px] text-slate-600">{dati.nRisp} risposte questo mese</div>
                </div>
                <div className="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">Chat attive</div>
                    <div className="text-lg font-black text-white leading-tight">{dati.chatAttive}</div>
                    <div className="text-[10px] text-slate-600">clienti nel mese</div>
                </div>
                <div className="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">Ricevuti</div>
                    <div className="text-lg font-black text-sky-300 leading-tight">{dati.inMese}</div>
                    <div className="text-[10px] text-slate-600">messaggi dei clienti</div>
                </div>
                <div className="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">Inviati</div>
                    <div className="text-lg font-black text-white leading-tight">{dati.outMese}</div>
                    <div className="text-[10px] text-slate-600">risposte del team</div>
                </div>
            </div>
            {/* 🔴 il cliente aspetta NOI */}
            {dati.daRisp.length > 0 ? (
                <div className="rounded-xl bg-rose-500/[0.07] border border-rose-500/20 px-3 py-2 space-y-1">
                    <div className="text-[11px] font-bold text-rose-300 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" /> {dati.daRisp.length === 1 ? "1 chat da rispondere" : `${dati.daRisp.length} chat da rispondere`}
                        <span className="font-normal text-rose-300/60">— il cliente aspetta noi</span>
                    </div>
                    {dati.daRisp.slice(0, nAlert).map((a) => rigaChat(a, "rossa"))}
                    {dati.daRisp.length > nAlert && <div className="text-[10px] text-slate-500">…e altre {dati.daRisp.length - nAlert}</div>}
                </div>
            ) : (
                <div className="rounded-xl bg-emerald-500/[0.06] border border-emerald-500/15 px-3 py-2 text-[11px] font-semibold text-emerald-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Nessuna chat in attesa di una nostra risposta
                </div>
            )}
            {/* 🕓 NOI aspettiamo il cliente (richiesta nostra senza risposta) */}
            {dati.attesa.length > 0 && (
                <div className="rounded-xl bg-sky-500/[0.06] border border-sky-500/20 px-3 py-2 space-y-1">
                    <div className="text-[11px] font-bold text-sky-300 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" /> {dati.attesa.length === 1 ? "1 richiesta in attesa del cliente" : `${dati.attesa.length} richieste in attesa del cliente`}
                        <span className="font-normal text-sky-300/60">— da sollecitare</span>
                    </div>
                    {dati.attesa.slice(0, nAttesa).map((a) => rigaChat(a, "blu"))}
                    {dati.attesa.length > nAttesa && <div className="text-[10px] text-slate-500">…e altre {dati.attesa.length - nAttesa}</div>}
                </div>
            )}
            {/* anello: chi scrive quanto (stile Analisi, cliccabile) */}
            {totFette > 0 && <AnelloTeamWa fette={dati.fette} uid={uid} grande={size >= 4} />}
            <div className="text-[10px] text-slate-600">Solo chat coi clienti (niente gruppi) · {dati.nNumeri === 1 ? "1 numero connesso" : `${dati.nNumeri} numeri connessi`} · finestra ultimi 30 giorni{dati.concluse ? ` · ${dati.concluse} concluse fuori elenco` : ""}{dati.tetto ? " · controllo sulle ultime 400 chat" : ""}</div>
        </div>
    );
}

const FISSI = {
    marginalita: { label: "Marginalità", icon: ShoppingBag, sizes: [1, 2, 4], def: 2, gruppo: "performance" },
    kpi_contratti: { label: "Contratti", icon: FileText, sizes: [1, 2], def: 1, gruppo: "statistiche" },
    kpi_attivi: { label: "Attivi", icon: CheckCircle2, sizes: [1, 2], def: 1, gruppo: "statistiche" },
    kpi_lavorazione: { label: "In lavorazione", icon: Clock, sizes: [1, 2], def: 1, gruppo: "statistiche" },
    kpi_clienti: { label: "Clienti", icon: Users, sizes: [1, 2], def: 1, gruppo: "statistiche" },
    chart_brand: { label: "Grafico per brand", icon: TrendingUp, sizes: [1, 2, 4], def: 2, gruppo: "statistiche" },
    chart_stato: { label: "Grafico per stato", icon: AlertTriangle, sizes: [1, 2, 4], def: 2, gruppo: "statistiche" },
    chart_top: { label: "Top negozi/venditori", icon: StoreIcon, sizes: [1, 2, 4], def: 2, gruppo: "statistiche", nonPer: ["own"] },
    classifica: { label: "Classifica venditori", icon: Trophy, sizes: [2, 4], def: 4, gruppo: "statistiche" },
    bussola: { label: "Direzione inserimento", icon: Compass, sizes: [1, 2], def: 1, gruppo: "strumenti" },
    obiettivo: { label: "Obiettivo", icon: TargetIcon, sizes: [1, 2], def: 1, gruppo: "strumenti" },
    azioni: { label: "Azioni e to-do", icon: Zap, sizes: [1, 2], def: 1, gruppo: "strumenti" },
    bacheca: { label: "Bacheca aziendale", icon: Megaphone, sizes: [1, 2, 4], def: 2, gruppo: "comunicazione" },
    accessi: { label: "Accessi collaboratori", icon: LogIn, sizes: [1, 2], def: 2, gruppo: "squadra", nonPer: ["own"] },
    whatsapp: { label: "WhatsApp del team", icon: MessageCircle, sizes: [2, 4], def: 2, gruppo: "squadra", soloManager: true },
};

// manager = vede la squadra: rete intera, store manager, direttore call center
const isManagerWa = (ctx) => ctx.seesAll || ctx.level === "store" || ["direttore_cc"].includes(ctx.user?.role);

export function infoWidget(id, ctx) {
    if (id.startsWith("brand:")) {
        const brand = id.slice(6);
        if (!brand) return null;
        return { id, label: brand, icon: Signal, sizes: [1, 2, 4], def: 2, gruppo: "performance", logo: TRK_BRAND_LOGOS[trkBrandKey(brand)], accent: colDiBrand(brand) };
    }
    if (id.startsWith("confronto")) {
        return { id, label: "Confronto", icon: Swords, sizes: [2, 4], def: 2, gruppo: "confronto", accent: "var(--tf-f59e0b)" };
    }
    const f = FISSI[id];
    if (!f) return null;
    if (f.soloAdmin && !ctx.seesAll) return null;
    if (f.nonPer && f.nonPer.includes(ctx.level)) return null;
    if (f.soloManager && !isManagerWa(ctx)) return null;
    return { id, ...f };
}

export function renderWidget(id, ctx, size) {
    if (id.startsWith("brand:")) return <WidgetBrand ctx={ctx} size={size} brand={id.slice(6)} />;
    if (id.startsWith("confronto")) {
        // id = "confronto" | "confronto:<tipo>:<bersaglio>" ("A|B" per il duello)
        const parti = id.split(":");
        return <WidgetConfronto ctx={ctx} size={size} widgetKey={id} param={parti.length >= 3 ? parti.slice(2).join(":") : null} />;
    }
    switch (id) {
        case "marginalita": return <WidgetMarginalita ctx={ctx} size={size} />;
        case "kpi_contratti": return <KpiTile icon={FileText} label="Contratti" value={ctx.mine.length} color="var(--tf-6366f1)" sub={`registrati ${ctx.periodoLabel}`} />;
        case "kpi_attivi": return <KpiTile icon={CheckCircle2} label="Attivi" value={ctx.attivi} color="var(--tf-22c55e)" sub={ctx.mine.length ? `${Math.round((ctx.attivi / ctx.mine.length) * 100)}% del periodo` : "—"} />;
        case "kpi_lavorazione": return <KpiTile icon={Clock} label="In lavorazione" value={ctx.lavorazione} color="var(--tf-f59e0b)" sub="da completare" />;
        case "kpi_clienti": return <KpiTile icon={Users} label="Clienti" value={ctx.clienti} color="var(--tf-a855f7)" sub="serviti nel periodo" />;
        case "chart_brand": return <BarChart icon={TrendingUp} title="Per brand" rows={ctx.byBrand} total={ctx.mine.length} colorFor={chartBrandColor} accent="var(--tf-818cf8)" size={size} />;
        case "chart_stato": return <BarChart icon={AlertTriangle} title="Per stato" rows={ctx.byStato} total={ctx.mine.length} colorFor={STATO_COLOR} accent="var(--tf-f59e0b)" size={size} />;
        case "chart_top": return ctx.terzo ? <BarChart icon={ctx.terzo.icon} title={ctx.terzo.title} rows={ctx.terzo.rows} total={ctx.mine.length} colorFor={() => ctx.terzo.color} accent={ctx.terzo.color} size={size} /> : null;
        case "classifica": return <WidgetClassifica ctx={ctx} size={size} />;
        case "bussola": return (
            <WidgetShell icon={Compass} title="Direzione inserimento" accent="var(--tf-38bdf8)"
                action={!ctx.seesAll && ctx.myStores[0] ? <span className="text-[10px] text-slate-500">{ctx.myStores[0]}</span> : null}>
                <div className="flex-1 min-h-0 overflow-y-auto">
                    <BussolaWidget negozio={ctx.seesAll ? (ctx.myStores[0] || ctx.user.negozio) : (ctx.user.negozio || ctx.myStores[0])} />
                </div>
            </WidgetShell>
        );
        case "obiettivo": return <WidgetObiettivo ctx={ctx} />;
        case "azioni": return <WidgetAzioni ctx={ctx} />;
        case "bacheca": return <WidgetBacheca ctx={ctx} size={size} />;
        case "accessi": return (ctx.seesAll || ctx.level === "store" || ["direttore_cc", "direttore_ob"].includes(ctx.user?.role)) ? <WidgetAccessi ctx={ctx} /> : null;
        case "whatsapp": return isManagerWa(ctx) ? <WidgetWhatsApp ctx={ctx} size={size} /> : null;
        default: return null;
    }
}

// ── Layout: codifica "id@taglia", default per ruolo, migrazione legacy ──────
export const encodeLayout = (l) => l.map((w) => `${w.k}@${w.s}`);
export function decodeLayout(arr) {
    const out = [];
    (arr || []).forEach((s) => {
        if (typeof s !== "string") return;
        const i = s.lastIndexOf("@");
        if (i <= 0) return;
        const k = s.slice(0, i); const sz = Number(s.slice(i + 1));
        if (![1, 2, 4].includes(sz)) return;
        if (!out.some((w) => w.k === k)) out.push({ k, s: sz });
    });
    return out;
}

// I 4 blocchi storici (kpi/charts/widgets/leaderboard) esplosi nei singoli
// widget: chi aveva un layout salvato lo ritrova identico, ma spacchettato.
const LEGACY_BLOCKS = {
    kpi: ["kpi_contratti@1", "kpi_attivi@1", "kpi_lavorazione@1", "kpi_clienti@1"],
    charts: ["chart_brand@2", "chart_stato@2", "chart_top@2"],
    widgets: ["bussola@1", "obiettivo@1", "azioni@1", "bacheca@1", "accessi@2"],
    leaderboard: ["classifica@4"],
};
export const isLegacyLayout = (arr) => Array.isArray(arr) && arr.length > 0 && arr.every((s) => typeof s === "string" && LEGACY_BLOCKS[s]);

/** Widget performance da proporre in testa: i brand osservati nella
 *  produzione dello scope (max 4) + la marginalità. */
export function perfDefaults(ctx) {
    const out = ctx.brandsOsservati.slice(0, 4).map((b) => `brand:${b}@2`);
    out.push("marginalita@2");
    return out;
}

export function layoutDefault(ctx) {
    const perf = perfDefaults(ctx);
    if (ctx.level === "global") {
        return decodeLayout([
            "kpi_contratti@1", "kpi_attivi@1", "kpi_lavorazione@1", "kpi_clienti@1",
            ...perf,
            "chart_brand@2", "chart_stato@2", "chart_top@2", "bacheca@2",
            "bussola@1", "obiettivo@1", "azioni@1", "accessi@2", "classifica@4",
        ]);
    }
    if (ctx.level === "store") {
        return decodeLayout([
            ...perf, "confronto@2",
            "kpi_contratti@1", "kpi_attivi@1", "kpi_lavorazione@1", "kpi_clienti@1",
            "chart_top@2", "bacheca@2", "obiettivo@1", "azioni@1", "bussola@1", "chart_stato@1",
            "classifica@4",
        ]);
    }
    return decodeLayout([
        ...perf, "confronto@2",
        "kpi_contratti@1", "kpi_attivi@1", "obiettivo@1", "azioni@1",
        "bacheca@2", "chart_brand@2", "classifica@2", "bussola@1",
    ]);
}

export function risolviLayout(salvato, ctx) {
    if (isLegacyLayout(salvato)) {
        // primo giro sul nuovo sistema: i widget performance entrano in testa
        const esplosi = salvato.flatMap((b) => LEGACY_BLOCKS[b]);
        return decodeLayout([...perfDefaults(ctx), ...esplosi]);
    }
    const dec = decodeLayout(salvato);
    if (dec.length) return dec.filter((w) => infoWidget(w.k, ctx));
    return layoutDefault(ctx).filter((w) => infoWidget(w.k, ctx));
}

/** Voci per il pannello "Aggiungi widget", raggruppate per categoria.
 *  I gruppi futuri (badge/presenze, qualità, storico…) si aggiungono qui e
 *  compaiono da soli quando hanno almeno una voce. */
export function widgetsDisponibili(ctx, giaPresenti) {
    const presenti = new Set(giaPresenti);
    const brandIds = ctx.brandsGallery.map((b) => `brand:${b}`);
    const ids = [...brandIds, "confronto", ...Object.keys(FISSI)];
    const out = { performance: [], confronto: [], statistiche: [], comunicazione: [], squadra: [], strumenti: [] };
    ids.forEach((id) => {
        if (presenti.has(id)) return;
        // il Confronto è unico anche se il suo id porta il bersaglio scelto
        if (id === "confronto" && giaPresenti.some((k) => k.startsWith("confronto"))) return;
        const info = infoWidget(id, ctx);
        if (info) out[info.gruppo].push(info);
    });
    return out;
}

export const SIZE_LABEL = { 1: "1 blocco", 2: "2 blocchi", 4: "Mezza pagina" };
