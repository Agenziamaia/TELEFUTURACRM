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
// ECCEZIONE DICHIARATA (26/08): la Bussola «Direzione inserimento» ragiona
// PER CODICE di proposito — è la direzione che indirizza dove caricare.
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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { roleLabel, BRAND_COLORS , areaOf } from "@/lib/roles";
import { matchRigheAttivazione, puntiPerRighe, contestoVfFw, brandIdDaLabel, caricaTabellare, calcolaAvanzamento, payEuroAttivazione, esclusaDalleGare } from "@/lib/commissioning";
import { esitaAppuntamento } from "@/lib/esitoAppuntamento";
import { sediScoperte } from "@/lib/coperture";
import { capChoice, CAP_CALENDARIO_VISTA } from "@/lib/capabilities";
import { useRolePermissions } from "@/lib/usePermissions";
import { trkBrandKey, TRK_BRAND_COLORS, TRK_BRAND_LOGOS } from "@/lib/brandAssets";
import { BussolaWidget } from "@/components/DirezioneInserimento";
import { SelectOpzioni } from "@/components/SelectPersona";
import { waIstanzeVisibili, waScopeRisolto, titolariProtettiWa } from "@/lib/waVisibilita";
import { chiediamoQualcosa } from "@/lib/ai/waTriage";
import { matchNegozi, sameStore } from "@/lib/visibleStores";
import { cn } from "@/utils";
import {
    FileText, Users, CheckCircle2, Clock, Store as StoreIcon, TrendingUp,
    AlertTriangle, ArrowRight, Loader2, Compass, Target as TargetIcon, Zap,
    Megaphone, Trophy, Search, Plus, ChevronDown, ChevronUp, CalendarClock,
    LogIn, EyeOff, Eye, ShoppingBag, Signal, Crown, Swords, MessageCircle,
    Euro, Flame, TrainFront, CalendarCheck, Shield, Banknote, Mail,
    ClipboardList, LifeBuoy,
} from "lucide-react";
import { CoronaOro } from "@/components/IconaCorona";

// ── Regole di conteggio (UNICHE: le usa anche lo script di riscontro) ───────
// Vivono in `@/lib/produzione`, che NON e' un modulo client: cosi' le usa anche
// il server (il report serale, senza, contava le pratiche annullate). Si
// ri-esportano da qui perche' mezzo CRM le importa gia' da questo file.
// ⚠️ IMPORT *E* EXPORT, non `export ... from`: la riesportazione secca NON porta
// i nomi nello scope di questo file, e qui dentro si chiamano 27 volte. Con il
// solo `export from` la Home si apriva su «isCtr is not defined» — e il
// @ts-nocheck in cima ha impedito al build di accorgersene (29/08, mio errore).
import { isCtr, isExt, validaProduzione, qtyDi, giornoDi } from "@/lib/produzione";
import { IconaSim } from "@/components/IconaSim";
export { isCtr, isExt, validaProduzione, qtyDi, giornoDi };

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

/* FATTO E PROIEZIONE PESANO UGUALE (Luca 29/08: «me la metti piu' piccola in
   termini di font rispetto all'attuale, e hanno la stessa importanza; il
   colore diverso va bene, ma dagli almeno la stessa visibilita'»). Erano 36px
   contro 18px — un rapporto 2:1 che la faceva leggere come una nota. Adesso
   sono entrambi 30px, e a distinguerli resta il colore. */
function BloccoNumero({ pezzi, proiezione, unita, color }) {
    return (
        <div className="flex flex-wrap items-end justify-between gap-x-2 gap-y-1">
            <div>
                <p className="text-3xl font-black text-white leading-none tabular-nums">{Number(pezzi).toLocaleString("it-IT")}</p>
                <p className="text-[11px] text-slate-500 mt-1">{unita}</p>
            </div>
            {proiezione != null && proiezione > pezzi && (
                <div className="text-right">
                    <p className="text-3xl font-black leading-none tabular-nums" style={{ color }}>≈{proiezione}</p>
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
            {/* stessa regola di BloccoNumero: erano 24px contro 11px */}
            <div className="flex flex-wrap items-end justify-between gap-x-1 gap-y-0.5">
                <span className="text-xl font-black text-white leading-none tabular-nums">{value}</span>
                {proj != null && <span className="text-xl font-black leading-none tabular-nums" style={{ color }} title="Proiezione a fine mese sul ritmo dei giorni lavorativi">≈{proj}</span>}
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
                                    <span className="font-mono font-bold text-slate-100">{v}{pr != null && <span className="font-bold ml-1.5" style={{ color }}>≈{pr}</span>}</span>
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
                                    <span className="font-mono font-bold text-slate-100">{v}{pr != null && <span className="font-bold ml-1.5" style={{ color }}>≈{pr}</span>}</span>
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
                            <ChipSonda tono="neutro" testo={<><IconaSim px={12} /> MNP <b className="font-mono text-slate-100">{per.mobMnp}</b></>} righe={["SIM Sky Mobile in portabilità: 0,5 punti l\u2019una."]} />
                            <ChipSonda tono="neutro" testo={<><IconaSim px={12} /> GA <b className="font-mono text-slate-100">{per.mobGa}</b></>} righe={["SIM Sky Mobile nuove attivazioni:", "0,5 punti (Ric. Automatica) · 0 punti (ricarica pura)."]} />
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
                                    <span className="font-mono font-bold text-slate-100">{v}{pr != null && <span className="font-bold ml-1.5" style={{ color }}>≈{pr}</span>}</span>
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
                            {/* «+N oltre questi»: sono IN PIÙ rispetto ai numeri della card,
                                non un di-cui (gare separate — chiarimento Luca 26/08) */}
                            {fwInGaraVF > 0 && <ChipSonda tono="neutro" testo={<>🟨 +<b className="font-mono text-slate-100">{fwInGaraVF}</b> oltre questi · gara Vodafone</>} righe={["Vendite Fastweb sui codici dei Vodafone Store (T1):", "sono IN PIÙ, non un di-cui — NON contano qui,", "stanno nella gara Vodafone (lettera A), punti", "compresi. Qui c'è solo il T2.", ...(fwEnT1 > 0 ? [`Di queste, ${fwEnT1} sono Luce & Gas.`] : [])]} />}
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
        // SEMPRE in verticale e SEMPRE completa — etichetta, numero e
        // sottotitolo si vedono a qualsiasi taglia, anche alla minima (Luca
        // 26/08: prima a 1 riga la tile girava in orizzontale e perdeva il
        // sottotitolo). Le query di ALTEZZA guardano la cella della griglia
        // (container-type: size); per la LARGHEZZA la card è container di sé
        // (inline-size, sicuro anche nella pila mobile dove la cella non
        // c'è): il numero scala con la larghezza reale via cqw. Pavimento a
        // 12px + tracking-tight (revisore 26/08: a 15px un 5 cifre sforava
        // già sulla tile 2×1 con finestra 600-800px); a 12px entrano 6 cifre
        // puntate nel caso peggiore — oltre (7+ glifi su 1 colonna) spunta lo
        // scroll orizzontale della cella, il numero non si tronca mai.
        <div className="glass-card border-t-2 h-full [container-type:inline-size]" style={{ borderTopColor: color }}>
            <div className="h-full min-w-0 flex flex-col justify-center p-4 [@container(max-height:150px)]:p-2.5 [@container(max-width:180px)]:p-2.5">
                <div className="flex items-center gap-1.5 text-slate-400 text-[10px] [@container(max-width:140px)]:text-[9px] uppercase tracking-widest [@container(max-width:140px)]:tracking-wider font-bold mb-1.5 [@container(max-height:150px)]:mb-1 min-w-0">
                    <Icon className="w-3.5 h-3.5 [@container(max-width:140px)]:w-3 [@container(max-width:140px)]:h-3 shrink-0" style={{ color }} />
                    <span className="truncate" title={label}>{label}</span>
                </div>
                <p className="font-black text-white leading-none tracking-tight [font-size:clamp(12px,20cqw,30px)]">{Number(value).toLocaleString("it-IT")}</p>
                <p className="text-xs [@container(max-width:140px)]:text-[10px] text-slate-500 mt-1.5 [@container(max-height:150px)]:mt-1 truncate" title={sub || ""}>{sub || "—"}</p>
            </div>
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
    // «sì grazie, buona giornata» (iOS scrive Sì accentato): il congedo resta
    // il cancello, quindi un «sì» secco NON chiude comunque
    "si", "sì",
]);

// il cliente ha dato una CONFERMA SECCA («ok», «va bene», «perfetto»)? Da
// sola non dice se la chat è finita: dipende da cosa avevamo scritto NOI.
const WA_CONFERME = new Set(["ok", "okay", "okk", "oki", "va bene", "vabbe", "vabbè", "perfetto", "d accordo", "daccordo", "ricevuto", "ricevuta", "certo", "certamente", "ottimo", "top", "benissimo", "va benissimo", "si si", "sisi", "si", "sì", "sì sì", "ok va bene", "va bene ok", "si va bene", "sì va bene", "ok perfetto", "perfetto ok"]);
export function confermaSecca(testo) {
    const t = String(testo || "").toLowerCase().replace(/[’‘`]/g, " ").replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").trim();
    return WA_CONFERME.has(t);
}

// domanda di PURA cortesia («come stai?», «tutto bene?», «serve altro?»):
// TUTTO il messaggio è il convenevole (ancorata ^…$) — non apre un'attesa
// se il cliente non risponde, e la sua risposta di chiacchiera non apre un
// rosso (caso Luca 25/08 notte: «te come stai?» → «Molto caldo ma bene»).
const DOMANDA_CORTESIA = /^(ciao |salve |buongiorno |buonasera )?(e )?(tu |te |lei |voi )?(come (stai|sta|state|va|andiamo|procede|butta)|tutto (bene|ok|a posto)|(le |ti |vi )?serve altro|hai bisogno di altro|come sta andando)[\s?!.😊🙂👍]*$/u;
export function domandaDiCortesia(testo) {
    return DOMANDA_CORTESIA.test(String(testo || "").toLowerCase().replace(/[’‘`]/g, "'").trim());
}

// il NOSTRO messaggio chiede qualcosa al cliente? Serve per la categoria
// «in attesa del cliente» (richiesta nostra senza risposta) e per giudicare
// un suo «ok»: dopo una richiesta è un impegno (aspettiamo), dopo una
// comunicazione è un congedo (conclusa). Conservativa: «?» o formule di
// richiesta esplicite.
export function richiedeRisposta(testo) {
    const t = String(testo || "").toLowerCase();
    if (!t.trim() || t.startsWith("[") || t.startsWith("📍")) return false;
    if (domandaDiCortesia(t)) return false;   // convenevole, non richiesta
    // i link portano «?» nella query string (posizione → maps.google.com/?q=,
    // promo con utm…): il punto di domanda si giudica sul testo SENZA url
    const senzaUrl = t.replace(/https?:\/\/\S+/g, " ");
    if (senzaUrl.includes("?")) return true;
    // «aspetto»/«attendo» solo con un oggetto («attendo riscontro», «aspetto
    // una risposta») — «la aspetto in negozio!» non è una richiesta di replica
    return /mi mandi|mi invii|mi giri|mandami|inviami|girami|mi pu[oò] (mandare|inviare|girare|dire|far)|mi serve|mi servirebbe|ci serve|fammi sapere|mi faccia sapere|ci faccia sapere|facci sapere|fatemi sapere|(attendo|aspetto) (un |una |il |la |le |sue |suo |vostr|riscontro|risposta|conferma|notizie|di sapere)|resto in attesa|restiamo in attesa|mi confermi|ci confermi|mi dica|mi dici|appena (pu[oò]|puoi|riesce|riesci)|quando (pu[oò]|puoi|riesce|riesci)|le chiedo di|ti chiedo di|serve che|servirebbe che/.test(senzaUrl);
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
function AnelloTeamWa({ fette, uid, grande, titolo }) {
    const [hl, setHl] = useState(null);
    const [pin, setPin] = useState(null);
    const [on, setOn] = useState(false);
    useEffect(() => { const t = setTimeout(() => setOn(true), 80); return () => clearTimeout(t); }, []);
    // il 📌 su una persona sparita al refresh spegnerebbe tutto senza
    // selezione visibile: si sgancia da solo (il clone di Analisi lo perdeva)
    useEffect(() => { if (pin && !fette.some((f) => f.k === pin)) setPin(null); }, [fette, pin]);
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
                <div className="text-[10px] uppercase tracking-wider text-slate-500">{titolo || "Messaggi scritti"}</div>
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

// misura VIVA dell'altezza della card (Luca 26/08 sera: «se gli do più spazio
// deve prenderselo… dovrebbe scoppiarmi tutti gli utenti»): callback-ref +
// ResizeObserver — MAI un ref passivo su un nodo che al primo mount può non
// esserci (lezione della Home a Tetris del 25/08: width inchiodata per
// sempre). I widget la usano per sciogliere i tetti delle liste quando la
// card è alta: media ≈ mezza colonna, espansa ≈ card a tutta pagina.
function useMisuraCard() {
    const [h, setH] = useState(0);
    const obs = useRef(null);
    const refCb = useCallback((node) => {
        if (obs.current) { obs.current.disconnect(); obs.current = null; }
        if (!node) return;
        const o = new ResizeObserver((e) => { const r = e[0]?.contentRect; if (r) setH(r.height); });
        o.observe(node); obs.current = o;
        setH(node.getBoundingClientRect().height);
    }, []);
    return [refCb, h];
}

// parsimonia CLIENT sul risveglio del triage (una per pagina, non per widget:
// i remount del drag/resize non devono richiamare l'API) — il vero anti-doppione
// è il lock server in wa_triage_stato
const corsaTriageClient = { t: 0 };

function WidgetWhatsApp({ ctx, size }) {
    const uid = ctx.user?.id;
    const router = useRouter();
    const [refMisura, hCard] = useMisuraCard();
    const [dati, setDati] = useState(null);
    const [giro, setGiro] = useState(0);
    // filtro per negozio/persona (Luca 25/08 notte: chi gestisce più punti
    // vendita deve poter guardare il widget un numero alla volta)
    const [filtro, setFiltro] = useState("");
    // filtro PERIODO interno al widget (Luca 25/08 notte-2): priorità al
    // suo, poi al periodo generale della Home (in alto a destra)
    const [periodoW, setPeriodoW] = useState("");
    useEffect(() => { const t = setInterval(() => setGiro((g) => g + 1), 120000); return () => clearInterval(t); }, []);
    // sveglia il MOTORE DI TRIAGE AI (fire-and-forget): UN solo giro —
    // lock/debounce stanno nel server (corsaTriage), qui solo 3' di
    // parsimonia sui remount. L'arretrato lo smaltisce il cron a lotti
    // (una catena client qui era codice morto: il debounce server boccia
    // sempre il secondo giro ravvicinato — rilievo revisore D1). Se l'AI
    // non può girare (niente credito), restano le euristiche: nessun buco.
    useEffect(() => {
        const ora = Date.now();
        if (ora - corsaTriageClient.t < 3 * 60000) return;
        corsaTriageClient.t = ora;
        fetch("/api/whatsapp/triage", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
            .then((r) => r.json())
            .then((j) => { if (j && j.classificate > 0) setGiro((g) => g + 1); })
            .catch(() => { });
    }, []);
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
            const [scopeWa, protWa] = await Promise.all([waScopeRisolto(uid, ctx.user?.role), titolariProtettiWa()]);
            /* I NUMERI PERSONALI (quelli col lucchetto) NON entrano MAI nel
               widget (Luca 28/08): «non devono essere considerate per nessuna
               statistica». Non è una questione di permessi — Luca li vedrebbe
               — ma di senso: sono chat private, e mediarle con quelle del
               lavoro falsa tempi di risposta, ricevuti, inviati e la lista di
               chi aspetta. Perciò `vedeProtetti: false` per tutti. */
            let vis = waIstanzeVisibili(insts || [], uid, ctx.user?.role, ctx.myStores, { soloConnesse: true, scope: scopeWa, protetti: protWa, vedeProtetti: false });
            // stessa estensione dell'Inbox: il direttore cc vede i numeri dei suoi operatori
            if (ctx.user?.role === "direttore_cc") {
                const gia = new Set(vis.map((i) => i.id));
                // i PROTETTI da codice non rientrano dalla porta di servizio
                // (revisore 27/08): la supervisione cc non li scavalca
                vis = [...vis, ...(insts || []).filter((i) => !gia.has(i.id) && i.status === "connessa" && i.owner_user_id && areaOf(utenti.get(i.owner_user_id)?.role) === "cc" && !protWa.has(String(i.owner_user_id)))];
            }
            if (!vis.length) { setDati({ vuoto: "Nessun numero WhatsApp collegato per il tuo negozio." }); return; }
            // numeri del CALL CENTER (titolare con ruolo area cc): i caller
            // scrivono a freddo a chi non risponde al telefono — nessuna
            // attesa azzurra su quei numeri (Luca 25/08 notte); il rosso
            // resta: se il cliente risponde, il caller deve gestirlo
            const ccIds = new Set(vis.filter((i) => i.owner_user_id && areaOf(utenti.get(i.owner_user_id)?.role) === "cc").map((i) => i.id));
            // filtro per negozio/persona: le etichette sono quelle dell'Inbox
            const etichettaDi = (i) => i.display_name || (i.owner_user_id && utenti.get(i.owner_user_id)?.full_name) || i.negozio || (i.wa_number ? `+${i.wa_number}` : "numero");
            const etichette = [...new Set(vis.map(etichettaDi))].sort((a, b) => a.localeCompare(b, "it"));
            if (filtro) vis = vis.filter((i) => etichettaDi(i) === filtro);
            if (!vis.length) { setDati({ vuoto: "Nessun numero per questo filtro.", etichette }); return; }
            const { data: convs } = await supabase.from("wa_conversations")
                .select("id, instance_id, customer_name, customer_number, last_message_at, chiusa_il")
                .in("instance_id", vis.map((i) => i.id))
                .or("is_group.is.null,is_group.eq.false")
                .not("last_message_at", "is", null)
                .order("last_message_at", { ascending: false }).limit(400);
            if (!vivo) return;
            const mappaConv = new Map((convs || []).map((c) => [c.id, c]));
            if (!mappaConv.size) { setDati({ vuoto: "Ancora nessuna chat coi clienti su questi numeri." }); return; }
            // ── PERIODO dei conteggi: prima il filtro INTERNO del widget,
            // poi il periodo generale della Home, poi il mese corrente.
            // Le liste rosse/azzurre restano lo STATO ATTUALE delle chat.
            const oggi = new Date();
            const adessoMs = oggi.getTime();
            const inizioMese = new Date(oggi.getFullYear(), oggi.getMonth(), 1).getTime();
            let rDa = inizioMese, rA = adessoMs + 60000, etichettaPeriodo = "questo mese";
            if (periodoW === "Oggi") { rDa = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate()).getTime(); etichettaPeriodo = "oggi"; }
            else if (periodoW === "Ultimi 7 giorni") { rDa = adessoMs - 7 * 86400000; etichettaPeriodo = "ultimi 7 giorni"; }
            else if (periodoW === "Ultimi 30 giorni") { rDa = adessoMs - 30 * 86400000; etichettaPeriodo = "ultimi 30 giorni"; }
            else if (periodoW === "Questo mese") { rDa = inizioMese; etichettaPeriodo = "questo mese"; }
            else if (periodoW === "Mese scorso") { rDa = new Date(oggi.getFullYear(), oggi.getMonth() - 1, 1).getTime(); rA = inizioMese; etichettaPeriodo = "mese scorso"; }
            else if (ctx.rangeShown) { rDa = new Date(ctx.rangeShown.da + "T00:00:00").getTime(); rA = new Date(ctx.rangeShown.a + "T00:00:00").getTime() + 86400000; etichettaPeriodo = ctx.periodoLabel || "periodo della Home"; }
            else if (ctx.ymShown) { const [ya, ma] = ctx.ymShown.split("-").map(Number); rDa = new Date(ya, ma - 1, 1).getTime(); rA = new Date(ya, ma, 1).getTime(); etichettaPeriodo = ctx.periodoLabel || "il mese"; }
            else { rDa = adessoMs - 90 * 86400000; etichettaPeriodo = "ultimi 90 giorni"; }   // Home su «tutto»: tetto 90gg
            const inRange = (t) => t >= rDa && t < rA;
            // il fetch copre comunque gli ultimi 30 giorni: servono alle liste
            const daMs = Math.min(rDa, adessoMs - 30 * 86400000);
            // ── TEMPO LAVORATIVO per la «Risposta media» (Luca 26/08 sera):
            // notti, pranzi e domeniche non contano — per i numeri dei NEGOZI
            // valgono gli orari di apertura (stores.orario_* + chiusure
            // straordinarie + domenica esclusa), per i numeri dei CALLER le
            // TIMBRATURE vere del badge (shifts del titolare del numero)
            const ownerCc = [...new Set(vis.filter((i) => ccIds.has(i.id) && i.owner_user_id).map((i) => i.owner_user_id))];
            const [{ data: storesOrari }, { data: chiusureStr }, { data: turniCc }] = await Promise.all([
                supabase.from("stores").select("name, orario_apertura, orario_chiusura, orario_pausa_inizio, orario_pausa_fine"),
                supabase.from("chiusure_negozio").select("store, dal, al"),
                ownerCc.length
                    ? supabase.from("shifts").select("user_id, started_at, ended_at").in("user_id", ownerCc)
                        .gte("started_at", new Date(daMs - 86400000).toISOString()).neq("is_demo", true).limit(2000)
                    : Promise.resolve({ data: [] }),
            ]);
            if (!vivo) return;
            const minutiDi = (hhmm) => { const m = String(hhmm || "").match(/^(\d{1,2}):(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : null; };
            // finestre lavorative [start,end] in ms per istanza, con cache
            const finestreCache = new Map();
            const finestreDi = (instId) => {
                if (finestreCache.has(instId)) return finestreCache.get(instId);
                const inst = (insts || []).find((i) => i.id === instId);
                let fin = [];
                if (inst && ccIds.has(instId) && inst.owner_user_id) {
                    // caller: le timbrature vere (turno aperto = fino ad adesso, tetto 12h)
                    fin = (turniCc || []).filter((s) => s.user_id === inst.owner_user_id).map((s) => {
                        const a = new Date(s.started_at).getTime();
                        const b = s.ended_at ? new Date(s.ended_at).getTime() : Math.min(a + 12 * 3600000, adessoMs);
                        return [a, b];
                    }).filter(([a, b]) => b > a);
                } else {
                    // negozio: orario di apertura giorno per giorno, domenica e
                    // chiusure straordinarie escluse; fallback 09:30-19:30
                    const nomi = String(inst?.negozio || "").split(",").map((s) => s.trim()).filter(Boolean);
                    const st = (storesOrari || []).find((s) => nomi.some((n) => sameStore(s.name, n)));
                    const ap = minutiDi(st?.orario_apertura) ?? 570, ch = minutiDi(st?.orario_chiusura) ?? 1170;
                    const pi = minutiDi(st?.orario_pausa_inizio), pf = minutiDi(st?.orario_pausa_fine);
                    const chiuso = (gMs) => (chiusureStr || []).some((c) => {
                        if (st && !sameStore(c.store, st.name)) return false;
                        const dal = new Date(c.dal + "T00:00:00").getTime(), al = new Date(c.al + "T23:59:59").getTime();
                        return gMs >= dal && gMs <= al;
                    });
                    for (let g = new Date(daMs); g.getTime() <= adessoMs; g.setDate(g.getDate() + 1)) {
                        if (g.getDay() === 0) continue;                       // domenica
                        const g0 = new Date(g.getFullYear(), g.getMonth(), g.getDate()).getTime();
                        if (chiuso(g0)) continue;
                        if (pi != null && pf != null && pf > pi) {
                            fin.push([g0 + ap * 60000, g0 + pi * 60000], [g0 + pf * 60000, g0 + ch * 60000]);
                        } else fin.push([g0 + ap * 60000, g0 + ch * 60000]);
                    }
                }
                fin.sort((x, y) => x[0] - y[0]);
                finestreCache.set(instId, fin);
                return fin;
            };
            const tempoUtile = (da, a, instId) => {
                if (a <= da) return 0;
                let s = 0;
                for (const [x, y] of finestreDi(instId)) {
                    if (y <= da) continue;
                    if (x >= a) break;
                    s += Math.min(a, y) - Math.max(da, x);
                }
                return Math.max(0, s);
            };
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
                        .select("conversation_id, direction, wa_timestamp, created_at, sent_by_user_id, body, media_mime, status")
                        .in("conversation_id", blocco).is("deleted_at", null)
                        .gte("created_at", da)
                        .order("created_at", { ascending: false }).order("id", { ascending: false })
                        .range(p * 1000, p * 1000 + 999);
                    msgs.push(...(pag || []));
                    if (!pag || pag.length < 1000) break;
                }
            }
            // ── TRIAGE AI per-chat (lib/ai/waTriage): dove esiste una
            // classificazione AGGIORNATA all'ultimo messaggio, decide lei le
            // liste; le regole euristiche restano il ripiego per le chat non
            // ancora (ri)classificate — mai un buco tra un giro e l'altro
            const triMap = new Map();
            for (let b = 0; b < ids.length; b += 100) {
                const { data: tri } = await supabase.from("wa_triage")
                    .select("conversation_id, stato, azione, rinvio_fino, ultimo_msg_ts")
                    .in("conversation_id", ids.slice(b, b + 100));
                (tri || []).forEach((r) => triMap.set(r.conversation_id, r));
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
                    && (String(m.body || "").trim() !== "" || m.media_mime)
                    // un invio MAI partito non è una risposta: non deve
                    // spegnere il rosso né aprire un'attesa (rilievo revisore)
                    && !(m.direction === "out" && m.status === "failed"))
                .sort((a, b) => a.t - b.t);
            const perConv = new Map();
            righe.forEach((m) => { const a = perConv.get(m.conversation_id) || []; a.push(m); perConv.set(m.conversation_id, a); });
            let sommaRisp = 0, nRisp = 0, inMese = 0, outMese = 0, concluse = 0;
            let aiFresche = 0, agendate = 0;   // chat giudicate dal triage AI · rinvii futuri (🗓)
            const perUtente = new Map(); const attive = new Set();
            const daRisp = [];   // il cliente ha scritto e tocca a NOI
            const attesa = [];   // richiesta NOSTRA senza risposta del cliente
            perConv.forEach((arr, cid) => {
                let inAperto = null; // primo messaggio del cliente ancora senza risposta
                arr.forEach((m) => {
                    if (inRange(m.t)) {
                        if (m.direction === "in") inMese++; else outMese++;
                        if (m.direction === "out") { const k = m.sent_by_user_id || "tel"; perUtente.set(k, (perUtente.get(k) || 0) + 1); }
                        attive.add(cid);
                    }
                    if (m.direction === "in") { if (inAperto == null) inAperto = m.t; }
                    else { if (inAperto != null && inRange(m.t)) { sommaRisp += tempoUtile(inAperto, m.t, mappaConv.get(cid)?.instance_id); nRisp++; } inAperto = null; }
                });
                // ── CATEGORIA della chat (ragionamento Luca 25/08 sera) ──
                const ultimo = arr[arr.length - 1];
                if (!ultimo) return;
                const c = mappaConv.get(cid);
                const nomeChat = c?.customer_name || (c?.customer_number ? `+${c.customer_number}` : "chat");
                // la chiusura manuale vale solo finché non arriva un
                // messaggio PIÙ NUOVO (di chiunque): dopo, si rivaluta
                const chiusaOk = c?.chiusa_il && new Date(c.chiusa_il).getTime() >= ultimo.t - 1500;
                // ── prima parola al TRIAGE AI, se ha letto fino all'ultimo
                // messaggio (tolleranza 2500 ≥ dei 2000 del motore, mai il
                // contrario: una chat non deve restare per sempre «stantia»
                // qui e «già fatta» là); il ✓ manuale vince comunque ──
                const tri = triMap.get(cid);
                if (tri && new Date(tri.ultimo_msg_ts).getTime() >= ultimo.t - 2500) {
                    // rinvio mancante su una programmata = trattala scaduta
                    // (mai una chat invisibile per sempre — rilievo revisore)
                    const rinvio = tri.stato === "programmata" ? (tri.rinvio_fino ? new Date(tri.rinvio_fino).getTime() : ultimo.t) : 0;
                    if (chiusaOk) {
                        // come il ramo euristico: conta «conclusa fuori elenco»
                        // solo se il ✓ ha tolto una chat che SAREBBE in lista
                        if (tri.stato === "rispondere" || tri.stato === "attesa_cliente" || (tri.stato === "programmata" && rinvio <= adessoMs)) concluse++;
                        return;
                    }
                    aiFresche++;
                    /* RETE DI SICUREZZA (Luca 28/08): se l'ULTIMO messaggio è
                       nostro, il cliente non ci sta aspettando — qualunque cosa
                       dica il triage. La guardia sta anche nel motore, ma qui
                       copre le classificazioni già scritte, senza aspettare che
                       il cron rigiri tutte le chat. */
                    if (tri.stato === "rispondere" && ultimo.direction === "out") {
                        // STESSA regola del motore, non una sua copia più corta
                        // (revisore 28/08: due regole per la stessa domanda)
                        if (!ccIds.has(c?.instance_id) && chiediamoQualcosa(String(ultimo.body || ""))) {
                            attesa.push({ id: cid, nome: nomeChat, da: ultimo.t, fine: ultimo.t, azione: tri.azione });
                        } else if (!ccIds.has(c?.instance_id)) {
                            concluse++;   // niente derive contabili: la chat esce, ma nel conto
                        }
                        return;
                    }
                    if (tri.stato === "rispondere") {
                        let i = arr.length - 1, daT = ultimo.t;   // inizio del blocco finale del cliente
                        while (i >= 0 && arr[i].direction === "in") { daT = arr[i].t; i--; }
                        daRisp.push({ id: cid, nome: nomeChat, da: daT, fine: ultimo.t, azione: tri.azione });
                    } else if (tri.stato === "attesa_cliente") {
                        // regola business FUORI dall'AI: i numeri del call center
                        // (contatti a freddo) non generano mai attese azzurre
                        if (!ccIds.has(c?.instance_id)) attesa.push({ id: cid, nome: nomeChat, da: ultimo.t, fine: ultimo.t, azione: tri.azione });
                    } else if (tri.stato === "programmata") {
                        // rinvio esplicito («ci sentiamo a settembre»): dorme
                        // fino alla data, poi riemerge tra i solleciti — i
                        // numeri cc non riemergeranno mai: fuori anche dal 🗓
                        if (ccIds.has(c?.instance_id)) return;
                        if (rinvio <= adessoMs) attesa.push({ id: cid, nome: nomeChat, da: Math.min(rinvio, adessoMs), fine: ultimo.t, azione: tri.azione || "riprendere il contatto", ripresa: true });
                        else agendate++;
                    } else concluse++;   // "niente": conclusa/rifiuto/promo senza risposta
                    return;
                }
                if (ultimo.direction === "in") {
                    if (chiusaOk) { concluse++; return; }
                    // si giudica l'intero BLOCCO finale del cliente, non solo
                    // l'ultima bolla: «mi mandi il preventivo» + «grazie buona
                    // giornata» NON è una chat conclusa (rilievo del revisore)
                    let i = arr.length - 1; const blocco = [];
                    while (i >= 0 && arr[i].direction === "in") { blocco.unshift(arr[i]); i--; }
                    const prevOut = i >= 0 && arr[i].direction === "out" ? arr[i] : null;
                    if (blocco.every((m) => chiusuraDiCortesia(m.body))) { concluse++; return; }
                    const testoBlocco = blocco.map((m) => String(m.body || "")).join(" ").trim();
                    // conferma secca («ok», «sì», anche in due bolle): dopo un
                    // NOSTRO messaggio senza richieste è un congedo → conclusa;
                    // dopo una nostra RICHIESTA è un impegno → aspettiamo il
                    // FATTO dal cliente (lista azzurra, non rosso: nessuno
                    // deve «rispondere» a quell'ok — semmai sollecitare)
                    if (confermaSecca(testoBlocco)) {
                        if (prevOut && richiedeRisposta(prevOut.body)) { attesa.push({ id: cid, nome: nomeChat, da: prevOut.t, fine: ultimo.t }); return; }
                        if (prevOut) { concluse++; return; }
                    }
                    // risposta alle NOSTRE quattro chiacchiere («te come
                    // stai?» → «Molto caldo ma bene», caso Luca 25/08):
                    // chiacchiera breve senza domande né richieste = conclusa
                    if (prevOut && domandaDiCortesia(prevOut.body) && !testoBlocco.includes("?") && testoBlocco.length <= 80
                        && !/quando|posso|potete|vorrei|serve|prezzo|costo|richiam|mandi|invii|aiut/.test(testoBlocco.toLowerCase())) { concluse++; return; }
                    daRisp.push({ id: cid, nome: nomeChat, da: blocco[0].t, fine: ultimo.t });
                } else {
                    // chiusa a mano dopo la nostra richiesta: non aspettiamo
                    // più — conta tra le concluse solo se sarebbe stata in lista
                    if (chiusaOk) { if (richiedeRisposta(ultimo.body)) concluse++; return; }
                    // caller a freddo (numeri del call center): il cliente
                    // quasi mai risponde — niente attese azzurre su quei numeri
                    if (ccIds.has(c?.instance_id)) return;
                    // ultima parola NOSTRA che chiede qualcosa → aspettiamo
                    // il cliente: da non dimenticare (sollecito)
                    if (richiedeRisposta(ultimo.body)) attesa.push({ id: cid, nome: nomeChat, da: ultimo.t, fine: ultimo.t });
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
                concluse, tetto: (convs || []).length >= 400, etichette, etichettaPeriodo,
                aiFresche, agendate,
            });
        })();
        return () => { vivo = false; };
    }, [uid, ctx.user?.role, ctx.negoziKey, giro, filtro, periodoW, ctx.ymShown, ctx.rangeShown ? ctx.rangeShown.da + ctx.rangeShown.a : ""]); // eslint-disable-line react-hooks/exhaustive-deps
    const azione = <Link href="/chat?mode=wa" className="text-[11px] font-bold text-emerald-300 hover:text-emerald-200 flex items-center gap-1">Apri <ArrowRight className="w-3 h-3" /></Link>;
    // ✓ su una riga (da rispondere O in attesa): la chat è a posto così —
    // sparisce subito; se il cliente riscrive, riappare da sola. Il widget
    // può essere vecchio fino a 2 minuti: se nel frattempo è arrivato un
    // messaggio nuovo NON si chiude sopra roba mai vista — si ricarica. La
    // guardia confronta l'ULTIMO messaggio visto (a.fine), non a.da: sul
    // blocco rosso a.da è l'inizio del blocco cliente e il ✓ restava
    // perpetuamente inerte su ogni raffica di 2+ messaggi (rilievo revisore)
    const chiudiAlert = async (a) => {
        const { data: fresca } = await supabase.from("wa_conversations").select("last_message_at").eq("id", a.id).maybeSingle();
        const ultimoTs = fresca?.last_message_at ? new Date(fresca.last_message_at).getTime() : 0;
        if (ultimoTs > (a.fine ?? a.da) + 1500) { setGiro((g) => g + 1); return; }
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
    // il className di SelectOpzioni SOSTITUISCE il default (niente merge):
    // deve portare lui glass-input, sennò l'input resta nudo e quasi
    // invisibile; le classi di layout stanno sul wrapper (il flex-1
    // sull'input non agisce: il padre interno del componente non è un flex)
    const filtroRow = (
        <div className="flex items-center gap-1.5 flex-wrap">
            {((dati?.etichette?.length || 0) > 1 || filtro) && (
                <div className="flex-1 min-w-[150px]">
                    <SelectOpzioni value={filtro} onChange={setFiltro} opzioni={dati?.etichette || []}
                        placeholder="Tutti i numeri" className="glass-input w-full text-xs px-3 py-2" />
                </div>
            )}
            <div className="flex-1 min-w-[140px]">
                <SelectOpzioni value={periodoW} onChange={setPeriodoW} opzioni={["Oggi", "Ultimi 7 giorni", "Ultimi 30 giorni", "Questo mese", "Mese scorso"]}
                    placeholder="Periodo della Home" className="glass-input w-full text-xs px-3 py-2" />
            </div>
            {(filtro || periodoW) && <button onClick={() => { setFiltro(""); setPeriodoW(""); }} className="shrink-0 text-[10px] font-bold text-slate-400 hover:text-white px-2 py-2 rounded-lg border border-white/10 hover:bg-white/10 transition-colors">✕ tutto</button>}
        </div>
    );
    if (!dati) return shell(<div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>);
    if (dati.vuoto) return shell(<div className="p-3 space-y-3">{filtroRow}<p className="text-xs text-slate-500 py-2">{dati.vuoto}</p></div>);
    const totFette = dati.fette.reduce((s, f) => s + f.v, 0);
    // tetti VIVI sull'altezza reale (misura col ResizeObserver): card alta =
    // liste scoppiate per intero, niente più «…e altre 7» con lo spazio vuoto
    const espansa = hCard > 900;
    const media = hCard > 620;
    const nAlert = espansa ? 999 : (media || size >= 4) ? 8 : 3;
    const nAttesa = espansa ? 999 : (media || size >= 4) ? 5 : 2;
    const adesso = Date.now();
    // navigazione PROGRAMMATICA, non <Link> (Luca 26/08: «clicco e non
    // reindirizza da nessuna parte»): dentro la griglia drag della Home un
    // preventDefault a monte fa DESISTERE Next Link (controlla
    // e.defaultPrevented prima di navigare) — il push esplicito naviga sempre
    const rigaChat = (a, tinta) => (
        <div key={a.id} className="flex items-center gap-1">
            <a href={`/chat?conv=${a.id}`}
                onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return; e.preventDefault(); e.stopPropagation(); router.push(`/chat?conv=${a.id}`); }}
                className="flex-1 min-w-0 hover:bg-white/[0.05] rounded-lg px-1.5 py-0.5 -mx-1.5 transition-colors cursor-pointer">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-semibold text-slate-200 truncate">{a.ripresa ? "🗓 " : ""}{a.nome}</span>
                    <span className={cn("shrink-0 font-bold", tinta === "rossa"
                        ? (adesso - a.da > 3 * 3600000 ? "text-rose-300" : "text-amber-300")
                        : (adesso - a.da > 2 * 86400000 ? "text-sky-300" : "text-slate-400"))}>da {fmtDurataWa(adesso - a.da)}</span>
                </div>
                {/* il PERCHÉ del triage AI: chi lavora capisce al volo cosa serve */}
                {a.azione && <div className="text-[10px] text-slate-500 truncate leading-tight">{a.azione}</div>}
            </a>
            <button onClick={() => chiudiAlert(a)} title="Segna conclusa: non aspettiamo più nulla qui (se il cliente riscrive, torna in elenco)"
                className="shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-slate-500 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors text-[11px] font-bold">✓</button>
        </div>
    );
    return shell(
        <div ref={refMisura} className="space-y-3 p-3 flex-1 min-h-0 overflow-y-auto">
            {filtroRow}
            {/* KPI del periodo */}
            <div className={cn("grid gap-2", size >= 4 ? "grid-cols-4" : "grid-cols-2")}>
                <div className="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">Risposta media</div>
                    <div className="text-lg font-black text-emerald-300 leading-tight">{fmtDurataWa(dati.media)}</div>
                    <div className="text-[10px] text-slate-600" title="Conta solo il tempo lavorativo: orari di apertura per i numeri dei negozi (domeniche e chiusure escluse), timbrature del badge per i caller">{dati.nRisp} risposte · ore lavorative</div>
                </div>
                <div className="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">Chat attive</div>
                    <div className="text-lg font-black text-white leading-tight">{dati.chatAttive}</div>
                    <div className="text-[10px] text-slate-600">clienti · {dati.etichettaPeriodo}</div>
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
            {totFette > 0 && <AnelloTeamWa fette={dati.fette} uid={uid} grande={size >= 4 || media} titolo={`Messaggi scritti · ${dati.etichettaPeriodo}`} />}
            <div className="text-[10px] text-slate-600">Solo chat coi clienti (niente gruppi) · {dati.nNumeri === 1 ? "1 numero connesso" : `${dati.nNumeri} numeri connessi`} · finestra ultimi 30 giorni{dati.concluse ? ` · ${dati.concluse} concluse fuori elenco` : ""}{dati.aiFresche ? ` · 🧠 triage AI su ${dati.aiFresche} chat` : ""}{dati.agendate ? ` · 🗓 ${dati.agendate} in agenda` : ""}{dati.tetto ? " · controllo sulle ultime 400 chat" : ""}</div>
        </div>
    );
}

// ── 📧 EMAIL DEL TEAM (26/08, fase 2 Email-come-WhatsApp) — gemello del
// widget WhatsApp: il triage AI (lib/ai/emailTriage) smista le conversazioni
// e qui compaiono SOLO quelle vere — rosse (un cliente/pratica aspetta noi,
// col perché) e arancio (informative da vedere, finché non lette); lo spam
// lo cancella il motore da solo e si controlla dal pannello Amministrazione.
const corsaTriageEmailClient = { t: 0 };
function WidgetEmail({ ctx, size }) {
    const uid = ctx.user?.id;
    const router = useRouter();
    const [refMisura, hCard] = useMisuraCard();
    const [dati, setDati] = useState(null);
    const [giro, setGiro] = useState(0);
    const [filtro, setFiltro] = useState("");
    const [periodoW, setPeriodoW] = useState("");
    useEffect(() => { const t = setInterval(() => setGiro((g) => g + 1), 120000); return () => clearInterval(t); }, []);
    // sveglia del motore email (un giro, lock/debounce nel server)
    useEffect(() => {
        const ora = Date.now();
        if (ora - corsaTriageEmailClient.t < 3 * 60000) return;
        corsaTriageEmailClient.t = ora;
        fetch("/api/email/triage", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
            .then((r) => r.json())
            .then((j) => { if (j && (j.classificate > 0 || j.cestinate > 0)) setGiro((g) => g + 1); })
            .catch(() => { });
    }, []);
    useEffect(() => {
        let vivo = true;
        (async () => {
            const [{ data: accs }, { data: memb }] = await Promise.all([
                supabase.from("email_accounts").select("id, email_address, display_name, negozio, owner_user_id, status, ai_protetta"),
                supabase.from("email_account_users").select("account_id").eq("user_id", uid),
            ]);
            if (!vivo) return;
            const membro = new Set((memb || []).map((r) => r.account_id));
            // stessa visibilità dell'Inbox: titolare, membro, o negozio (anche
            // multi) in visibilità; chi vede tutto (admin) qui vede TUTTE le
            // caselle — è il widget di regia della squadra, non la sua Inbox.
            // Le caselle ESCLUSE dall'AI (ai_protetta, es. amministrazione)
            // restano fuori anche dalle statistiche (direttiva 26/08 sera)
            let vis = (accs || []).filter((a) => !a.ai_protetta && (ctx.seesAll || a.owner_user_id === uid || membro.has(a.id)
                || (!a.owner_user_id && matchNegozi(a.negozio, ctx.myStores))));
            if (!vis.length) { setDati({ vuoto: "Nessuna casella email collegata per i tuoi negozi." }); return; }
            const etichettaDi = (a) => a.display_name || a.email_address;
            const etichette = [...new Set(vis.map(etichettaDi))].sort((a, b) => a.localeCompare(b, "it"));
            if (filtro) vis = vis.filter((a) => etichettaDi(a) === filtro);
            if (!vis.length) { setDati({ vuoto: "Nessuna casella per questo filtro.", etichette }); return; }
            // periodo: filtro interno → periodo Home → mese corrente (pattern WA)
            const oggi = new Date();
            const adessoMs = oggi.getTime();
            const inizioMese = new Date(oggi.getFullYear(), oggi.getMonth(), 1).getTime();
            let rDa = inizioMese, rA = adessoMs + 60000, etichettaPeriodo = "questo mese";
            if (periodoW === "Oggi") { rDa = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate()).getTime(); etichettaPeriodo = "oggi"; }
            else if (periodoW === "Ultimi 7 giorni") { rDa = adessoMs - 7 * 86400000; etichettaPeriodo = "ultimi 7 giorni"; }
            else if (periodoW === "Ultimi 30 giorni") { rDa = adessoMs - 30 * 86400000; etichettaPeriodo = "ultimi 30 giorni"; }
            else if (periodoW === "Questo mese") { rDa = inizioMese; etichettaPeriodo = "questo mese"; }
            else if (periodoW === "Mese scorso") { rDa = new Date(oggi.getFullYear(), oggi.getMonth() - 1, 1).getTime(); rA = inizioMese; etichettaPeriodo = "mese scorso"; }
            else if (ctx.rangeShown) { rDa = new Date(ctx.rangeShown.da + "T00:00:00").getTime(); rA = new Date(ctx.rangeShown.a + "T00:00:00").getTime() + 86400000; etichettaPeriodo = ctx.periodoLabel || "periodo della Home"; }
            else if (ctx.ymShown) { const [ya, ma] = ctx.ymShown.split("-").map(Number); rDa = new Date(ya, ma - 1, 1).getTime(); rA = new Date(ya, ma, 1).getTime(); etichettaPeriodo = ctx.periodoLabel || "il mese"; }
            else { rDa = adessoMs - 90 * 86400000; etichettaPeriodo = "ultimi 90 giorni"; }
            const inRange = (t) => t >= rDa && t < rA;
            const ids = vis.map((a) => a.id);
            const convs = [];
            for (let p = 0; p < 3; p++) {
                const { data: pag } = await supabase.from("email_conversations")
                    .select("id, account_id, customer_name, customer_email, subject, unread, last_message_at, spam, trashed, archived")
                    .in("account_id", ids)
                    .gt("last_message_at", new Date(Math.min(rDa, adessoMs - 30 * 86400000)).toISOString())
                    .order("last_message_at", { ascending: false })
                    .range(p * 1000, p * 1000 + 999);
                convs.push(...(pag || []));
                if (!pag || pag.length < 1000) break;
            }
            if (!vivo) return;
            const triMap = new Map();
            for (let b = 0; b < convs.length; b += 100) {
                const { data: tri } = await supabase.from("email_triage")
                    .select("conversation_id, stato, azione, azione_auto, ripristinata_il, ultimo_msg_ts")
                    .in("conversation_id", convs.slice(b, b + 100).map((c) => c.id));
                (tri || []).forEach((r) => triMap.set(r.conversation_id, r));
            }
            if (!vivo) return;
            const daRisp = []; const daLeggere = [];
            let attive = 0, cestinateAI = 0, triFresche = 0;
            convs.forEach((c) => {
                const t = new Date(c.last_message_at).getTime();
                const tri = triMap.get(c.id);
                if (tri && tri.azione_auto === "cestinata" && !tri.ripristinata_il && inRange(t)) cestinateAI++;
                if (c.trashed || c.spam || c.archived) return;
                if (inRange(t)) attive++;   // dopo il filtro: lo spam cestinato non gonfia le «attive»
                if (!tri) return;
                // il giudizio vale solo se copre l'ultimo messaggio (pattern WA)
                if (new Date(tri.ultimo_msg_ts).getTime() < t - 2500) return;
                triFresche++;
                const riga = { id: c.id, nome: c.customer_name || c.customer_email, oggetto: c.subject || "", da: t, azione: tri.azione };
                if (tri.stato === "rispondere") daRisp.push(riga);
                else if (tri.stato === "da_leggere" && (c.unread || 0) > 0) daLeggere.push(riga);
            });
            daRisp.sort((a, b) => a.da - b.da);
            daLeggere.sort((a, b) => a.da - b.da);
            setDati({
                daRisp, daLeggere, attive, cestinateAI, triFresche,
                nCaselle: vis.length, etichette, etichettaPeriodo,
            });
        })();
        return () => { vivo = false; };
    }, [uid, ctx.negoziKey, giro, filtro, periodoW, ctx.ymShown, ctx.rangeShown ? ctx.rangeShown.da + ctx.rangeShown.a : ""]); // eslint-disable-line react-hooks/exhaustive-deps
    const azione = <Link href="/chat" className="text-[11px] font-bold text-sky-300 hover:text-sky-200 flex items-center gap-1">Apri <ArrowRight className="w-3 h-3" /></Link>;
    const shell = (figli) => (
        <WidgetShell icon={Mail} title="Email del team" accent="var(--tf-38bdf8, #38bdf8)" action={azione}>{figli}</WidgetShell>
    );
    const filtroRow = (
        <div className="flex items-center gap-1.5 flex-wrap">
            {((dati?.etichette?.length || 0) > 1 || filtro) && (
                <div className="flex-1 min-w-[150px]">
                    <SelectOpzioni value={filtro} onChange={setFiltro} opzioni={dati?.etichette || []}
                        placeholder="Tutte le caselle" className="glass-input w-full text-xs px-3 py-2" />
                </div>
            )}
            <div className="flex-1 min-w-[140px]">
                <SelectOpzioni value={periodoW} onChange={setPeriodoW} opzioni={["Oggi", "Ultimi 7 giorni", "Ultimi 30 giorni", "Questo mese", "Mese scorso"]}
                    placeholder="Periodo della Home" className="glass-input w-full text-xs px-3 py-2" />
            </div>
            {(filtro || periodoW) && <button onClick={() => { setFiltro(""); setPeriodoW(""); }} className="shrink-0 text-[10px] font-bold text-slate-400 hover:text-white px-2 py-2 rounded-lg border border-white/10 hover:bg-white/10 transition-colors">✕ tutto</button>}
        </div>
    );
    if (!dati) return shell(<div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>);
    if (dati.vuoto) return shell(<div className="p-3 space-y-3">{filtroRow}<p className="text-xs text-slate-500 py-2">{dati.vuoto}</p></div>);
    // tetti vivi sull'altezza reale, come il gemello WhatsApp
    const espansaEm = hCard > 900;
    const mediaEm = hCard > 620;
    const nRosse = espansaEm ? 999 : (mediaEm || size >= 4) ? 8 : 3;
    const nArancio = espansaEm ? 999 : (mediaEm || size >= 4) ? 5 : 2;
    const adesso = Date.now();
    // ✓ come sul widget WhatsApp (Luca 26/08 sera): «a posto così» —
    // l'email si ARCHIVIA (esce dalla Posta in arrivo e dalle liste; se il
    // mittente riscrive, il poll la riporta in inbox e il triage rivaluta).
    // Guardia identica al WA: mai chiudere sopra messaggi mai visti.
    const chiudiMail = async (a) => {
        const { data: fresca } = await supabase.from("email_conversations").select("last_message_at").eq("id", a.id).maybeSingle();
        const ultimoTs = fresca?.last_message_at ? new Date(fresca.last_message_at).getTime() : 0;
        if (ultimoTs > a.da + 1500) { setGiro((g) => g + 1); return; }
        const { error } = await supabase.from("email_conversations").update({ archived: true }).eq("id", a.id);
        if (error) return;
        setDati((p) => p ? {
            ...p,
            daRisp: (p.daRisp || []).filter((x) => x.id !== a.id),
            daLeggere: (p.daLeggere || []).filter((x) => x.id !== a.id),
        } : p);
    };
    const rigaMail = (a, tinta) => (
        <div key={a.id} className="flex items-center gap-1">
            <a href={`/chat?mconv=${a.id}`}
                onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return; e.preventDefault(); e.stopPropagation(); router.push(`/chat?mconv=${a.id}`); }}
                className="flex-1 min-w-0 hover:bg-white/[0.05] rounded-lg px-1.5 py-0.5 -mx-1.5 transition-colors cursor-pointer">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-semibold text-slate-200 truncate">{a.nome}{a.oggetto ? <span className="text-slate-500 font-normal"> · {a.oggetto}</span> : null}</span>
                    <span className={cn("shrink-0 font-bold", tinta === "rossa"
                        ? (adesso - a.da > 24 * 3600000 ? "text-rose-300" : "text-amber-300")
                        : "text-amber-300/80")}>da {fmtDurataWa(adesso - a.da)}</span>
                </div>
                {a.azione && <div className="text-[10px] text-slate-500 truncate leading-tight">{a.azione}</div>}
            </a>
            <button onClick={() => chiudiMail(a)} title="Segna conclusa: l'email si archivia (se il mittente riscrive, torna in elenco)"
                className="shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-slate-500 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors text-[11px] font-bold">✓</button>
        </div>
    );
    return shell(
        <div ref={refMisura} className="space-y-3 p-3 flex-1 min-h-0 overflow-y-auto">
            {filtroRow}
            <div className={cn("grid gap-2", size >= 4 ? "grid-cols-4" : "grid-cols-2")}>
                <div className="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">Da rispondere</div>
                    <div className="text-lg font-black text-rose-300 leading-tight">{dati.daRisp.length}</div>
                    <div className="text-[10px] text-slate-600">clienti e pratiche</div>
                </div>
                <div className="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">Da leggere</div>
                    <div className="text-lg font-black text-amber-300 leading-tight">{dati.daLeggere.length}</div>
                    <div className="text-[10px] text-slate-600">informative non lette</div>
                </div>
                <div className="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">Conversazioni</div>
                    <div className="text-lg font-black text-white leading-tight">{dati.attive}</div>
                    <div className="text-[10px] text-slate-600">attive · {dati.etichettaPeriodo}</div>
                </div>
                <div className="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">Spam eliminato</div>
                    <div className="text-lg font-black text-emerald-300 leading-tight">{dati.cestinateAI}</div>
                    <div className="text-[10px] text-slate-600">🗑 dall&apos;AI · {dati.etichettaPeriodo}</div>
                </div>
            </div>
            {dati.daRisp.length > 0 ? (
                <div className="rounded-xl bg-rose-500/[0.07] border border-rose-500/20 px-3 py-2 space-y-1">
                    <div className="text-[11px] font-bold text-rose-300 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" /> {dati.daRisp.length === 1 ? "1 email da rispondere" : `${dati.daRisp.length} email da rispondere`}
                        <span className="font-normal text-rose-300/60">— clienti e pratiche</span>
                    </div>
                    {dati.daRisp.slice(0, nRosse).map((a) => rigaMail(a, "rossa"))}
                    {dati.daRisp.length > nRosse && <div className="text-[10px] text-slate-500">…e altre {dati.daRisp.length - nRosse}</div>}
                </div>
            ) : (
                <div className="rounded-xl bg-emerald-500/[0.06] border border-emerald-500/15 px-3 py-2 text-[11px] font-semibold text-emerald-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Nessuna email in attesa di una nostra risposta
                </div>
            )}
            {dati.daLeggere.length > 0 && (
                <div className="rounded-xl bg-amber-500/[0.06] border border-amber-500/20 px-3 py-2 space-y-1">
                    <div className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5">
                        <Megaphone className="w-3.5 h-3.5" /> {dati.daLeggere.length === 1 ? "1 informativa da leggere" : `${dati.daLeggere.length} informative da leggere`}
                        <span className="font-normal text-amber-300/60">— operatori e fornitori</span>
                    </div>
                    {dati.daLeggere.slice(0, nArancio).map((a) => rigaMail(a, "arancio"))}
                    {dati.daLeggere.length > nArancio && <div className="text-[10px] text-slate-500">…e altre {dati.daLeggere.length - nArancio}</div>}
                </div>
            )}
            <div className="text-[10px] text-slate-600">{dati.nCaselle === 1 ? "1 casella" : `${dati.nCaselle} caselle`} · finestra ultimi 30 giorni{dati.triFresche ? ` · 🧠 triage AI su ${dati.triFresche} conversazioni` : ""} · lo spam si controlla da Amministrazione → Email</div>
        </div>
    );
}

/* ═══ HOME v2, primo treno (26/08 — docs/HOME_V2_WIDGET.md) ═══════════════
   Quattro widget nuovi: 💶 Vale X€ (il retroattivo di soglia in euro,
   motore lato RAGAZZI), 🚂 Il Treno delle 19 (countdown all'ora di
   scatto), 🔥 La Serie (streak), 📅 Agenda del giorno (esiti a 1 tap con
   escalation sul debito). Regole: ponte (tutto dal motore), aggregazione
   sul negozio che registra, quote ragazzi mai esposte. ═══════════════════ */

// ── 💶 VALE X€ — la soglia più vicina tradotta in euro retroattivi ─────────
// Per W3 e Sky (derivato pieno; VF arriva col contesto lettera A nel giro
// 2): avanzamento coi tabellari RAGAZZI (soglie della gara interna) e delta
// € = Σ [pay(tier+1) − pay(tier)] sulle vendite già fatte della pista.
function WidgetSogliaEuro({ ctx, size }) {
    const [tabs, setTabs] = useState(null);        // { w3, sky } tabellari ragazzi
    const [canoni, setCanoni] = useState(null);    // "brand|offerta|prodotto" → canone
    const ym = ctx.w3?.ym || ctx.sky?.ym || null;
    const multiMese = !!(ctx.w3 && !ctx.w3.ym && (ctx.w3.packs || []).length > 1);
    useEffect(() => {
        if (!ym) { setTabs(null); return; }
        let vivo = true;
        (async () => {
            const iso = `${ym}-01`;
            const [tw3, tsky, offs] = await Promise.all([
                caricaTabellare("windtre", iso).catch(() => null),
                caricaTabellare("sky", iso).catch(() => null),
                supabase.from("catalog_offerte")
                    .select("nome, canone_mensile, catalog_prodotti!inner(nome, brand_id)")
                    .in("catalog_prodotti.brand_id", ["windtre", "sky"]).eq("attivo", true).not("canone_mensile", "is", null).limit(2000),
            ]);
            if (!vivo) return;
            const m = new Map();
            ((offs.data || [])).forEach((o) => {
                const p = o.catalog_prodotti;
                if (p) m.set(`${p.brand_id}|${norm(o.nome)}|${norm(p.nome)}`, Number(o.canone_mensile));
            });
            setTabs({ w3: tw3, sky: tsky });
            setCanoni(m);
        })();
        return () => { vivo = false; };
    }, [ym]);
    const occasioni = useMemo(() => {
        if (!tabs || !canoni) return null;
        const out = [];
        const brands = [
            { key: "windtre", label: "WindTre", tab: tabs.w3, rows: ctx.w3?.packs?.[0]?.rows || [] },
            { key: "sky", label: "Sky", tab: tabs.sky, rows: ctx.sky?.packs?.[0]?.rows || [] },
        ];
        for (const b of brands) {
            if (!b.tab || !b.rows.length) continue;
            const rows = b.rows.filter((c) => !esclusaDalleGare(c));
            const avz = calcolaAvanzamento(b.tab, rows);
            for (const p of Object.values(avz.piste)) {
                if (!p.prossima || !p.pezzi) continue;
                // delta retroattivo: quanto varrebbero IN PIÙ i pezzi già
                // fatti della pista passando alla soglia successiva
                let delta = 0;
                for (const c of rows) {
                    const set = matchRigheAttivazione(b.tab.righe, c, brandIdDaLabel(c.brand));
                    if (!set.length || set[0].pista !== p.chiave) continue;
                    const canone = canoni.get(`${b.key}|${norm(c.offerta)}|${norm(c.prodotto)}`) ?? null;
                    const ora = payEuroAttivazione(set, p.tier, canone);
                    const poi = payEuroAttivazione(set, p.tier + 1, canone);
                    if (ora != null && poi != null && poi > ora) delta += poi - ora;
                }
                if (delta <= 0 || p.mancano == null) continue;   // i gate (mancano null) non sono un'occasione
                out.push({
                    brand: b.label, brandKey: b.key, pista: p.nome, punti: p.punti,
                    mancano: p.mancano, prossima: p.prossima.tier, pezzi: p.pezzi,
                    delta: Math.round(delta * 100) / 100,
                    frazione: p.prossima.soglia_da > 0 ? Math.min(1, p.punti / p.prossima.soglia_da) : 0,
                });
            }
        }
        // prima le soglie più vicine in proporzione
        return out.sort((a, b) => (a.mancano / (a.mancano + a.punti || 1)) - (b.mancano / (b.mancano + b.punti || 1)));
    }, [tabs, canoni, ctx.w3, ctx.sky]);
    const top = occasioni?.slice(0, size >= 2 ? 3 : 1) || [];
    return (
        <WidgetShell icon={Euro} title="Vale X€" accent="var(--tf-34d399)"
            action={<span className="text-[10px] text-slate-500">rete · pay ragazzi · retroattivo</span>}>
            {multiMese ? (
                <div className="flex-1 flex items-center justify-center text-slate-500 text-xs text-center px-3">Le gare sono mensili: scegli un mese per vedere le soglie in €.</div>
            ) : !occasioni ? (
                <div className="flex-1 flex items-center justify-center text-slate-500 text-xs"><Loader2 className="animate-spin mr-2" size={14} /> Calcolo dal motore…</div>
            ) : !top.length ? (
                <div className="flex-1 flex items-center justify-center text-slate-500 text-xs text-center px-3">Nessuna soglia a portata con pay in crescita: guarda le Gare per il quadro completo.</div>
            ) : (
                <div className="flex-1 min-h-0 overflow-y-auto space-y-2.5">
                    {top.map((o, i) => {
                        const caldissima = o.mancano <= 5;
                        return (
                            <Link key={i} href="/gare" className={cn("block rounded-xl border p-2.5 transition-colors",
                                caldissima ? "border-emerald-500/50 bg-emerald-500/10 animate-pulse" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]")}>
                                <div className="flex items-baseline justify-between gap-2">
                                    <span className="text-[11px] font-bold text-slate-200">{o.brand} · {o.pista}</span>
                                    <span className="text-[10px] text-slate-500">S{o.prossima} a {it2(o.mancano)} punti</span>
                                </div>
                                <div className="text-xl font-black text-emerald-300 leading-tight my-0.5">+{it2(o.delta)} €</div>
                                <div className="text-[10px] text-slate-400">retroattivi sui {o.pezzi} pezzi già fatti, appena scatta la soglia</div>
                                <div className="h-1.5 rounded-full bg-white/[0.07] overflow-hidden mt-1.5">
                                    <div className="h-full rounded-full bg-emerald-400/80" style={{ width: `${Math.round(o.frazione * 100)}%` }} />
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </WidgetShell>
    );
}
const it2 = (v) => Number(v).toLocaleString("it-IT", { maximumFractionDigits: 2 });

// ── 🚂 IL TRENO DELLE 19 — i pezzi di oggi salgono in gara all'ora di scatto ─
function WidgetTreno19({ ctx, size }) {
    const [ora, setOra] = useState(() => new Date());
    useEffect(() => { const t = setInterval(() => setOra(new Date()), 30000); return () => clearInterval(t); }, []);
    const scatto = ctx.gl?.oraScatto ?? 19;
    const oggi = ctx.oggiISO;
    const festivo = ora.getDay() === 0 || (ctx.gl?.festivi || []).includes(oggi) || (ctx.gl?.congelati || []).includes(ora.getDate());
    const diOggi = useMemo(() => (ctx.scoped || []).filter((c) =>
        isCtr(c) && validaProduzione(c) && !esclusaDalleGare(c) && giornoDi(c) === oggi && ctx.scopeVendita(c)), [ctx.scoped, oggi, ctx.visKey]);   // eslint-disable-line react-hooks/exhaustive-deps
    const partito = ora.getHours() >= scatto;
    const mancaMin = Math.max(0, (scatto * 60) - (ora.getHours() * 60 + ora.getMinutes()));
    const hh = Math.floor(mancaMin / 60), mm = mancaMin % 60;
    const vagoni = Math.min(diOggi.length, 8);
    return (
        <WidgetShell icon={TrainFront} title="Il Treno delle 19" accent="var(--tf-f59e0b)"
            action={<span className="text-[10px] text-slate-500">ora di scatto h{scatto}</span>}>
            <div className="flex-1 flex flex-col justify-center gap-1.5">
                {/* ⚠️ COSA FA DAVVERO L'ORA DI SCATTO (Luca 26/08: «alle 19 si
                    sblocca la giornata, ma le attivazioni devono comunque
                    andare al giorno in corso»): NON è un termine di consegna.
                    Prima delle 19 la produzione di oggi non è ancora contata
                    nelle gare — i numeri fermi a ieri; alle 19 la giornata
                    entra tutta insieme. Quello che si registra DOPO le 19
                    resta di oggi e conta subito: nessun pezzo slitta a domani.
                    Il testo di prima diceva il contrario e faceva paura per
                    niente. Vale anche di festivo: il pezzo conta nel mese, è
                    solo la giornata che non fa media. */}
                {festivo ? (
                    <>
                        <div className="text-2xl leading-none tracking-tight" aria-hidden>
                            {"🚂" + "🚃".repeat(vagoni)}{diOggi.length > 8 ? "…" : ""}
                        </div>
                        <div className="text-3xl font-black text-white leading-none">{diOggi.length}<span className="text-sm font-bold text-slate-400 ml-1.5">pezzi a bordo oggi</span></div>
                        <div className="text-[11px] text-slate-400 font-semibold">Oggi è festivo: i pezzi contano lo stesso nel mese, è la giornata che non fa media.</div>
                    </>
                ) : (
                    <>
                        <div className="text-2xl leading-none tracking-tight" aria-hidden>
                            {"🚂" + "🚃".repeat(vagoni)}{diOggi.length > 8 ? "…" : ""}
                        </div>
                        <div className="text-3xl font-black text-white leading-none">{diOggi.length}<span className="text-sm font-bold text-slate-400 ml-1.5">pezzi a bordo oggi</span></div>
                        {partito ? (
                            <div className="text-[11px] text-emerald-300 font-semibold">🎉 Partito! Il carico di oggi è entrato in gara. Quello che registri adesso resta di oggi e conta subito.</div>
                        ) : (
                            <div className="text-[11px] text-amber-300 font-semibold">Parte tra {hh > 0 ? `${hh}h ` : ""}{mm}m — alle {scatto}:00 tutta la giornata entra in gara in un colpo solo.</div>
                        )}
                        {size >= 2 && <div className="text-[10px] text-slate-500">L&apos;ora di scatto non è una scadenza: dice solo QUANDO i punti di oggi diventano visibili. Un pezzo registrato alle {scatto + 1}:00 è di oggi come quello delle 10.</div>}
                    </>
                )}
            </div>
        </WidgetShell>
    );
}

// ── 🔥 LA SERIE — giorni lavorativi consecutivi con almeno una vendita ─────
function WidgetSerie({ ctx }) {
    const dati = useMemo(() => {
        // SOGLIA DELLA SERIE (Luca 26/08): «per essere in serie bisogna fare
        // almeno 3 vendite al giorno». Prima bastava un pezzo, e la fiamma
        // restava accesa anche con giornate da uno: non raccontava lo sprint.
        const MIN = 3;
        const miei = (ctx.scoped || []).filter((c) => isCtr(c) && validaProduzione(c) && ctx.scopeVendita(c));
        const perGiorno = new Map();
        for (const c of miei) { const g = giornoDi(c); if (g) perGiorno.set(g, (perGiorno.get(g) || 0) + 1); }
        // «giorno in serie» = giorno che ha raggiunto la soglia
        const giorni = new Set([...perGiorno].filter(([, n]) => n >= MIN).map(([g]) => g));
        const oggiPezzi = perGiorno.get(ctx.oggiISO) || 0;
        const festivi = new Set(ctx.gl?.festivi || []);
        const congelati = new Set(ctx.gl?.congelati || []);
        const meseCorr = ctx.oggiISO.slice(0, 7);
        // date LOCALI (regola della page: mai toISOString, dopo mezzanotte
        // l'UTC è ancora ieri); congelati neutri come nel Treno
        const lavorativo = (d) => d.getDay() !== 0 && !festivi.has(ymdLoc(d))
            && !(ymdLoc(d).slice(0, 7) === meseCorr && congelati.has(d.getDate()));
        // streak corrente: da oggi (o da ieri se oggi è ancora vuoto) a ritroso
        const conta = (start) => {
            let n = 0; const d = new Date(start);
            for (let i = 0; i < 90; i++) {
                if (lavorativo(d)) {
                    if (giorni.has(ymdLoc(d))) n++;
                    else break;
                }
                d.setDate(d.getDate() - 1);
            }
            return n;
        };
        const oggiHa = giorni.has(ctx.oggiISO);
        const ieri = new Date(); ieri.setDate(ieri.getDate() - 1);
        const streak = oggiHa ? conta(new Date()) : conta(ieri);
        // record sul perimetro CRM (dal go-live di fine luglio)
        const tutte = [...giorni].sort();
        let best = 0, run = 0, prev = null;
        for (const g of tutte) {
            if (prev) {
                const d = new Date(prev); let salto = false;
                for (;;) {
                    d.setDate(d.getDate() + 1);
                    const isoD = ymdLoc(d);
                    if (isoD >= g) break;
                    if (d.getDay() !== 0 && !festivi.has(isoD)) { salto = true; break; }
                }
                run = salto ? 1 : run + 1;
            } else run = 1;
            best = Math.max(best, run); prev = g;
        }
        // QUANDO SI È INTERROTTA e QUANDO RIPARTE (Luca 26/08): l'ultimo
        // giorno lavorativo che ha raggiunto la soglia, e il primo giorno
        // lavorativo utile da cui ricominciare a contare
        let rotta = null, ripartiDa = null;
        if (streak === 0) {
            const d = new Date();
            for (let i = 0; i < 120; i++) {
                d.setDate(d.getDate() - (i === 0 ? 0 : 1));
                if (i > 0 && lavorativo(d) && giorni.has(ymdLoc(d))) { rotta = ymdLoc(d); break; }
            }
            const r = new Date();
            for (let i = 0; i < 30; i++) { if (lavorativo(r)) break; r.setDate(r.getDate() + 1); }
            ripartiDa = ymdLoc(r);
        }
        return { streak, best, oggiHa, oggiPezzi, min: MIN, rotta, ripartiDa };
    }, [ctx.scoped, ctx.oggiISO, ctx.gl, ctx.visKey]);   // eslint-disable-line react-hooks/exhaustive-deps
    const spegne = !dati.oggiHa && new Date().getHours() >= 17;
    const manca = Math.max(0, dati.min - dati.oggiPezzi);
    const giornoIt = (iso) => {
        if (!iso) return "";
        const [y, m, g] = String(iso).split("-").map(Number);
        const d = new Date(y, m - 1, g);
        const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
        const diff = Math.round((oggi - d) / 86400000);
        if (diff === 0) return "oggi";
        if (diff === 1) return "ieri";
        return d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
    };
    return (
        <WidgetShell icon={Flame} title="La Serie" accent="var(--tf-fb923c)"
            action={<span className="text-[10px] text-slate-500">record {dati.best}</span>}>
            <div className="flex-1 flex flex-col items-center justify-center gap-1">
                <div className={cn("leading-none", dati.streak >= 10 ? "text-5xl" : dati.streak >= 5 ? "text-4xl" : "text-3xl", spegne && "opacity-50")} aria-hidden>🔥</div>
                <div className="text-3xl font-black text-white leading-none">{dati.streak}</div>
                <div className="text-[10px] text-slate-400 text-center">
                    {dati.streak === 0
                        ? (dati.rotta
                            ? <>l&apos;ultima giornata in serie è stata <b className="text-slate-300">{giornoIt(dati.rotta)}</b>: {dati.oggiPezzi === 0
                                ? <>oggi sei a zero, servono <b className="text-orange-300">{dati.min} vendite</b> per ripartire</>
                                : <>oggi sei a <b className="text-orange-300">{dati.oggiPezzi}</b> su {dati.min}, {manca === 1 ? "ne manca 1" : `ne mancano ${manca}`}</>}</>
                            : <>la serie non è mai partita: servono <b className="text-orange-300">{dati.min} vendite</b> in un giorno per accenderla</>)
                        : spegne ? <>⚠️ oggi sei a <b>{dati.oggiPezzi}</b> su {dati.min}: se resti così la serie si spegne stasera</>
                        : dati.oggiHa ? <>giorni di fila con almeno <b>{dati.min} vendite</b> — anche oggi ✓</>
                        : <>giorni di fila — oggi sei a <b className="text-orange-300">{dati.oggiPezzi}</b> su {dati.min}, {manca === 1 ? "ne manca 1" : `ne mancano ${manca}`}</>}
                </div>
                {dati.streak === 0 && dati.ripartiDa && dati.ripartiDa !== ctx.oggiISO && (
                    <div className="text-[10px] text-slate-500 text-center">oggi non è giornata di gara: si riparte <b className="text-slate-400">{giornoIt(dati.ripartiDa)}</b></div>
                )}
                {dati.streak > 0 && dati.streak === dati.best && <div className="text-[10px] font-bold text-amber-300">🏆 è il tuo record</div>}
            </div>
        </WidgetShell>
    );
}

// ── 📅 AGENDA DEL GIORNO — esiti a 1 tap, escalation sul debito ────────────
// SOLO appuntamenti FISICI di negozio (type incoming): i richiami telefonici
// (store null) restano al caller. NIENTE filtro is_demo: su appointments il
// default DB è TRUE e il caller inserisce senza campo (revisore 26/08: il
// filtro copiato dai contracts azzerava 211 appuntamenti veri) — il
// calendario infatti non lo usa. Visibilità = la STESSA rotellina del
// calendario (CAP_CALENDARIO_VISTA): tutti/call_center → rete · negozio →
// i propri PV · propri → solo i propri appuntamenti (campo agente).
const ymdLoc = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/* Riga task con CHIUSURA + NOTA di ritorno — TOP-LEVEL, non dentro i widget:
   definita nel padre veniva rimontata a ogni tasto e il cursore della nota
   saltava in coda (revisore 27/08). Usata da Agenda e Regia Task. */
function RigaTaskNota({ t, oggiISO, extraSotto, diAltri, busy, nota, setNota, chiudi, tonoScaduta = "amber" }) {
    const scaduta = t.date < oggiISO;
    const aprendo = nota?.id === t.id;
    return (
        <div className={cn("rounded-lg border p-2",
            scaduta ? (tonoScaduta === "rose" ? "border-rose-500/50 bg-rose-500/[0.08]" : "border-amber-500/40 bg-amber-500/[0.07]") : "border-white/10 bg-white/[0.03]")}>
            <div className="flex items-start gap-2">
                <button disabled={busy === `t${t.id}`}
                    onClick={() => { if (diAltri) setNota(aprendo ? null : { id: t.id, testo: t.outcome_note || "" }); else chiudi(t, ""); }}
                    title={diAltri ? `Chiudi con una nota per ${t.created_by}` : "Segna come fatta"}
                    className="mt-0.5 w-4 h-4 shrink-0 rounded border border-emerald-500/50 text-emerald-300 text-[9px] leading-none hover:bg-emerald-500/20">✓</button>
                <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-bold text-slate-200 truncate" title={t.title}>{t.title || "Task"}</div>
                    <div className="text-[10px] text-slate-500 truncate">
                        {scaduta ? `${fmtGiornoIT(t.date)} · in ritardo` : (t.time ? String(t.time).slice(0, 5) : fmtGiornoIT(t.date))}
                        {extraSotto || ""}
                        {diAltri && t.created_by ? ` · da ${t.created_by}` : ""}
                    </div>
                    {t.notes && <div className="text-[10px] text-slate-400/80 truncate" title={t.notes}>{t.notes}</div>}
                </div>
            </div>
            {aprendo && (
                <div className="mt-1.5 flex items-center gap-1.5">
                    <input autoFocus value={nota.testo} onChange={(e) => setNota({ id: t.id, testo: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Enter") chiudi(t, nota.testo); }}
                        placeholder={`Nota per ${t.created_by || "chi l'ha assegnata"}…`}
                        className="glass-input !h-7 flex-1 min-w-0 text-[11px]" />
                    <button disabled={busy === `t${t.id}`} onClick={() => chiudi(t, nota.testo)}
                        className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-lg border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/15">✓ chiudi</button>
                </div>
            )}
        </div>
    );
}

function WidgetAgenda({ ctx, size }) {
    const [dati, setDati] = useState(null);   // { oggi: [], debito: [] }
    const [busy, setBusy] = useState(null);
    const [errore, setErrore] = useState(null);
    const [giro, setGiro] = useState(0);
    const { perms: calPerms } = useRolePermissions(ctx.user?.role, ctx.user?.grade, ctx.user?.id);
    const vistaCap = capChoice(ctx.user?.role, CAP_CALENDARIO_VISTA, calPerms);
    // SWITCH NEGOZIO ↔ MIE (Luca 26/08: «per gli store manager mettigli un
    // pulsante sopra per switchare dal negozio al personale»). Compare solo a
    // chi ha davvero una vista più larga della propria: un consulente vede
    // già solo i suoi e il bottone sarebbe finto. Non tocca i permessi —
    // stringe e basta, non può mai allargare oltre quello che il ruolo dà.
    // ⚠️ NON SI RICORDA, ED È VOLUTO (Luca 26/08): «di default devono avere
    // quello del negozio ogni volta che riaprono la home». Niente
    // localStorage — chi apre la Home vede sempre prima il negozio, e la
    // vista personale è una cosa che si chiede apposta. Se un domani qualcuno
    // pensa di «migliorarlo» salvando la scelta, sta cambiando la regola.
    const [soloMie, setSoloMie] = useState(false);
    const puoStringere = vistaCap !== "propri";
    const vista = soloMie && puoStringere ? "propri" : vistaCap;
    const stores = ctx.myStores.length ? ctx.myStores : (ctx.user?.negozio ? [ctx.user.negozio] : []);
    useEffect(() => {
        let vivo = true;
        (async () => {
            const da = new Date(); da.setDate(da.getDate() - 14);
            const sel = "id, date, time, type, store, agente, customer_name, customer_phone, status, notes";
            // due query MIRATE (revisore: un limit unico su 14gg tagliava
            // proprio il debito): gli appuntamenti di oggi + gli arretrati
            // ancora senza esito
            // TASK (Luca 26/08: «dedichiamo uno spazio sulla destra alle
            // task»): stessa finestra degli appuntamenti — quelle di oggi più
            // gli arretrati ancora da fare. Vengono da `calendar_tasks`, le
            // stesse che si creano dal Calendario.
            const selT = "id, date, time, title, notes, status, assigned_to, assigned_to_store, assigned_user_id, client_ref, created_by, created_by_user_id, outcome_note";
            const [og, deb, tk] = await Promise.all([
                supabase.from("appointments").select(sel).eq("type", "incoming").eq("date", ctx.oggiISO).order("time").limit(100),
                supabase.from("appointments").select(sel).eq("type", "incoming").eq("status", "scheduled")
                    .gte("date", ymdLoc(da)).lt("date", ctx.oggiISO).order("date").order("time").limit(100),
                // ⚠️ non solo «da_fare» (27/08): con «in corso» e «problema» una
                // task presa in mano o tornata indietro spariva dall'agenda
                supabase.from("calendar_tasks").select(selT).in("status", ["da_fare", "in_corso", "problema"])
                    .lte("date", ctx.oggiISO).gte("date", ymdLoc(da)).order("date").order("time").limit(100),
            ]);
            if (!vivo) return;
            const filtra = (arr) => (arr || []).filter((a) => {
                if (vista === "tutti" || vista === "call_center") return true;
                if (vista === "negozio") return stores.some((s) => sameStoreW(a.store, s));
                return norm(a.agente) === norm(ctx.user?.name);   // propri
            });
            // le task hanno campi loro: assegnatario per NOME o per id, e il
            // negozio in `assigned_to_store` — la vista è la stessa
            const filtraT = (arr) => (arr || []).filter((t) => {
                if (vista === "tutti" || vista === "call_center") return true;
                if (vista === "negozio") return stores.some((x) => sameStoreW(t.assigned_to_store, x)) || norm(t.assigned_to) === norm(ctx.user?.name);
                return t.assigned_user_id === ctx.user?.id || norm(t.assigned_to) === norm(ctx.user?.name);
            });
            setDati({ oggi: filtra(og.data), debito: filtra(deb.data), task: filtraT(tk.data) });
        })();
        return () => { vivo = false; };
    }, [ctx.oggiISO, ctx.visKey, giro, vista]);   // eslint-disable-line react-hooks/exhaustive-deps
    const esita = async (a, chiave) => {
        setBusy(a.id); setErrore(null);
        const { error } = await esitaAppuntamento(a.id, chiave, a.status, ctx.user?.name || "Negozio");
        setBusy(null);
        if (error) setErrore(error); else setGiro((g) => g + 1);
    };
    // task assegnata DA UN ALTRO → alla chiusura si chiede una nota che
    // TORNA a chi l'ha assegnata (Luca 27/08: «con eventuali note che mi mette»)
    const [notaTask, setNotaTask] = useState(null);   // { id, testo }
    const creataDaMe = (t) => (t.created_by_user_id && t.created_by_user_id === ctx.user?.id) || (t.created_by && norm(t.created_by) === norm(ctx.user?.name));
    const chiudiTask = async (t, nota) => {
        setBusy(`t${t.id}`); setErrore(null);
        const { error } = await supabase.from("calendar_tasks").update({
            status: "fatta",
            // ⚠️ solo se ho scritto qualcosa: chiudere in fretta non deve
            // cancellare la risposta già data (revisore 28/08)
            ...((nota || "").trim() ? { outcome_note: (nota || "").trim() } : {}),
            esito_at: new Date().toISOString(), esito_visto: creataDaMe(t),
        }).eq("id", t.id);
        setBusy(null); setNotaTask(null);
        if (error) setErrore(error.message || "non sono riuscito a chiuderla"); else setGiro((g) => g + 1);
    };
    const ieriISO = ymdLoc((() => { const d = new Date(); d.setDate(d.getDate() - 1); return d; })());
    const vediStore = vista === "tutti" || vista === "call_center" || stores.length > 1;
    const Riga = ({ a, vecchio }) => {
        const rosso = vecchio && a.date < ieriISO;
        return (
            <div className={cn("rounded-lg border p-2 flex items-center gap-2",
                rosso ? "border-rose-500/60 bg-rose-500/10 animate-pulse" : vecchio ? "border-amber-500/40 bg-amber-500/[0.07]" : "border-white/10 bg-white/[0.03]")}>
                <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-bold text-slate-200 truncate">{a.customer_name || "Cliente"} {a.time ? <span className="text-slate-500 font-normal">· {String(a.time).slice(0, 5)}</span> : null}</div>
                    <div className="text-[10px] text-slate-500 truncate">{vecchio ? `${fmtGiornoIT(a.date)} · SENZA ESITO` : ""}{vediStore ? `${vecchio ? " · " : ""}${a.store || ""}` : ""}</div>
                </div>
                {a.status === "scheduled" ? (
                    <div className="flex items-center gap-1 shrink-0">
                        <button disabled={busy === a.id} onClick={() => esita(a, "no_show")} title="Non si è presentato"
                            className="text-[10px] font-bold px-2 py-1 rounded-lg border border-rose-500/40 text-rose-300 hover:bg-rose-500/15">🚫</button>
                        <button disabled={busy === a.id} onClick={() => esita(a, "ko")} title="Venuto, non interessato (il caller verificherà)"
                            className="text-[10px] font-bold px-2 py-1 rounded-lg border border-amber-500/40 text-amber-300 hover:bg-amber-500/15">👎</button>
                        <Link href="/calendario" title="Altri esiti (da richiamare, attivazioni…) nel calendario"
                            className="text-[10px] font-bold px-2 py-1 rounded-lg border border-white/15 text-slate-300 hover:bg-white/10">…</Link>
                    </div>
                ) : (
                    <span className="text-[10px] text-slate-500 shrink-0">{a.status}</span>
                )}
            </div>
        );
    };
    const oggi = dati?.oggi || [], debito = dati?.debito || [], task = dati?.task || [];
    const nOggi = size >= 4 ? 8 : 4, nDeb = size >= 4 ? 6 : 3;
    const nTask = size >= 4 ? 10 : 6;
    const taskScadute = task.filter((t) => t.date < ctx.oggiISO);

    return (
        <WidgetShell icon={CalendarCheck} title="Agenda del giorno" accent="var(--tf-38bdf8)"
            action={puoStringere ? (
                /* lo switch prende il posto del badge in testata: il conto degli
                   esiti arretrati sta ora sopra la sua colonna, dove si legge
                   insieme a quello che conta (Luca 26/08) */
                <div className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-white/[0.04] p-0.5">
                    {[["Negozio", false], ["Solo mie", true]].map(([lab, val]) => (
                        <button key={lab} onClick={() => setSoloMie(val)}
                            className={cn("px-2 py-0.5 rounded-md text-[10px] font-bold transition-colors",
                                soloMie === val ? "bg-sky-500 text-white" : "text-slate-400 hover:text-slate-200")}>
                            {lab}
                        </button>
                    ))}
                </div>
            ) : null}>
            {dati === null ? (
                <div className="flex-1 flex items-center justify-center text-slate-500 text-xs"><Loader2 className="animate-spin mr-2" size={14} /> Carico l&apos;agenda…</div>
            ) : (
                /* DUE COLONNE (Luca 26/08): appuntamenti a sinistra, task a
                   destra. ⚠️ Il taglio si decide dalla LARGHEZZA VERA, non dalla
                   taglia nominale: la taglia 2 in un layout largo occupa tutto
                   lo schermo, e con `size >= 4` le task finivano sotto invece
                   che a fianco (Luca: «ti dicevo di usare lo spazio in
                   larghezza»). La card è già un container, quindi basta
                   chiederglielo. Sotto i 520px restano incolonnate, che a
                   quel punto due colonne sarebbero illeggibili. */
                <div className="flex-1 min-h-0 grid gap-3 grid-cols-1 [@container(min-width:520px)]:grid-cols-2">
                    <div className="min-h-0 overflow-y-auto space-y-1.5">
                        {errore && <div className="text-[10px] text-rose-300 border border-rose-500/40 bg-rose-500/10 rounded-lg px-2 py-1">⚠️ {errore}</div>}
                        <div className="text-[9px] uppercase tracking-widest text-sky-300/70 font-bold flex items-center gap-1.5">
                            📅 Appuntamenti
                            {debito.length > 0
                                ? <span className="text-[9px] font-black text-rose-300 bg-rose-500/15 border border-rose-500/40 rounded-full px-1.5">🔥 {debito.length} senza esito</span>
                                : <span className="text-[9px] font-bold text-emerald-300/80">✨ esiti a zero</span>}
                        </div>
                        {debito.slice(0, nDeb).map((a) => <Riga key={a.id} a={a} vecchio />)}
                        {debito.length > nDeb && <div className="text-[10px] text-rose-300/80">…e altri {debito.length - nDeb} da esitare (calendario)</div>}
                        {oggi.length > 0 && <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold pt-1">Oggi · {oggi.length} appuntament{oggi.length === 1 ? "o" : "i"}</div>}
                        {oggi.slice(0, nOggi).map((a) => <Riga key={a.id} a={a} />)}
                        {!oggi.length && !debito.length && <div className="text-slate-500 text-xs text-center py-4">{vista === "propri" && !stores.length ? "Nessun appuntamento assegnato a te." : "Nessun appuntamento oggi 🎉"}</div>}
                        <Link href="/calendario" className="block text-[10px] text-sky-300/80 hover:text-sky-200 pt-1">Apri il calendario <ArrowRight size={10} className="inline" /></Link>
                    </div>
                    <div className="min-h-0 overflow-y-auto space-y-1.5 [@container(min-width:520px)]:border-l [@container(min-width:520px)]:border-white/5 [@container(min-width:520px)]:pl-3">
                        <div className="text-[9px] uppercase tracking-widest text-violet-300/70 font-bold flex items-center gap-1.5">
                            ✅ Task
                            {taskScadute.length > 0 && <span className="text-[9px] font-black text-amber-300 bg-amber-500/15 border border-amber-500/40 rounded-full px-1.5">{taskScadute.length} in ritardo</span>}
                        </div>
                        {task.slice(0, nTask).map((t) => (
                                    <RigaTaskNota key={t.id} t={t} oggiISO={ctx.oggiISO} busy={busy} nota={notaTask} setNota={setNotaTask} chiudi={chiudiTask}
                                        diAltri={!!t.created_by && !creataDaMe(t)}
                                        extraSotto={t.assigned_to && vista !== "propri" ? ` · ${t.assigned_to}` : ""} />
                                ))}
                        {task.length > nTask && <div className="text-[10px] text-slate-500">…e altre {task.length - nTask} nel calendario</div>}
                        {!task.length && <div className="text-slate-500 text-xs text-center py-4">Nessuna task da fare 🎉</div>}
                    </div>
                </div>
            )}
        </WidgetShell>
    );
}
const fmtGiornoIT = (iso) => { const d = String(iso || ""); return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : ""; };

/* ═══ HOME v2, secondo treno (26/08, mandato «implementa i widget in canna»):
   🛡️ Scudo Malus (loss aversion sui tre motori di malus — qui il PDA da
   malus_storico, il più caldo), 💶 Contatore € (il mese in euro dal motore,
   pay ragazzi al tier live di rete), ⚔️ Derby (sfida settimanale col negozio
   di pari peso). ═══════════════════════════════════════════════════════════ */

// ── 🛡️ SCUDO MALUS — quanto stai perdendo (e quanto corre ancora) ──────────
// Fonte: malus_storico del tracking PDA (episodi con importo; tombstone
// `eliminato` SEMPRE filtrato — incidente Sky 25/08). SEMPRE il mese
// CORRENTE, qualunque filtro periodo abbia la Home: il malus è igiene di
// oggi, non consultazione. Perimetro con la stessa scala della Home
// (ctx.scopeVendita su negozio/venditore della riga).
function WidgetScudoMalus({ ctx, size }) {
    const [righe, setRighe] = useState(null);
    const [errore, setErrore] = useState(false);
    const [usato, setUsato] = useState(0);
    const meseIni = ctx.oggiISO.slice(0, 7) + "-01";
    useEffect(() => {
        let vivo = true;
        (async () => {
            const q = supabase.from("malus_storico")
                .select("contract_id, categoria, brand, negozio, venditore, nominativo, data_inizio, data_fine, giorni, malus_euro, importo, stato")
                .or("eliminato.is.null,eliminato.eq.false")
                .or(`data_fine.is.null,data_inizio.gte.${meseIni}`)
                .order("data_inizio", { ascending: false })
                .limit(500);
            const { data, error } = await q;
            if (!vivo) return;
            // su errore NIENTE scudo verde: un guasto non è igiene (revisore)
            if (error) { setErrore(true); setRighe([]); }
            else { setErrore(false); setRighe(data || []); }
            if (ctx.seesAll) {
                const { data: u } = await supabase.from("usati_malus").select("importo, data_inizio").gte("data_inizio", meseIni).limit(300);
                if (vivo) setUsato((u || []).reduce((s, r) => s + (Number(r.importo) || 0), 0));
            }
        })();
        return () => { vivo = false; };
    }, [meseIni, ctx.visKey, ctx.negoziKey, ctx.user?.id]);   // eslint-disable-line react-hooks/exhaustive-deps
    const dati = useMemo(() => {
        if (!righe) return null;
        const mie = righe.filter((r) => ctx.scopeVendita({ negozio: r.negozio, venditore: r.venditore }));
        const delMese = mie.filter((r) => String(r.data_inizio || "").slice(0, 10) >= meseIni);
        const generato = delMese.reduce((s, r) => s + (Number(r.importo) || 0), 0);
        const compensato = delMese.filter((r) => r.stato === "compensato").reduce((s, r) => s + (Number(r.importo) || 0), 0);
        const aperti = mie.filter((r) => r.data_fine == null);
        const alGiorno = aperti.reduce((s, r) => s + (Number(r.malus_euro) || 0), 0);
        return { generato: Math.round(generato), compensato: Math.round(compensato), aperti, alGiorno: Math.round(alGiorno * 100) / 100 };
    // negoziKey: il filtro negozi della Home cambia il perimetro di
    // scopeVendita senza toccare visKey (bloccante revisore 26/08)
    }, [righe, ctx.visKey, ctx.negoziKey]);   // eslint-disable-line react-hooks/exhaustive-deps
    const mese = new Date().toLocaleDateString("it-IT", { month: "long" });
    return (
        <WidgetShell icon={Shield} title="Scudo Malus" accent="var(--tf-ef4444)"
            action={<span className="text-[10px] text-slate-500">PDA · {mese}</span>}>
            {!dati ? (
                <div className="flex-1 flex items-center justify-center text-slate-500 text-xs"><Loader2 className="animate-spin mr-2" size={14} /> Controllo il tracking…</div>
            ) : errore ? (
                <div className="flex-1 flex items-center justify-center text-amber-300/90 text-xs text-center px-3">⚠ Tracking non raggiungibile in questo momento: niente scudo finché non rivedo i dati.</div>
            ) : dati.generato <= 0 && !dati.aperti.length ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-1 text-center px-3">
                    <div className="text-4xl" aria-hidden>🛡️</div>
                    <div className="text-sm font-black text-emerald-300">Scudo integro</div>
                    <div className="text-[10px] text-slate-500">Zero € di malus PDA questo mese nel tuo perimetro.</div>
                </div>
            ) : (
                <div className="flex-1 min-h-0 overflow-y-auto p-3 pt-2 space-y-2">
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black text-rose-300 leading-none">−{it2(dati.generato)} €</span>
                        <span className="text-[10px] text-slate-500">di malus a {mese}{dati.compensato > 0 ? ` · ${it2(dati.compensato)} € compensati` : ""}</span>
                    </div>
                    {dati.aperti.length > 0 ? (
                        <div className="rounded-xl bg-rose-500/[0.08] border border-rose-500/25 px-2.5 py-2 space-y-1">
                            <div className="text-[11px] font-bold text-rose-300">⏳ {dati.aperti.length === 1 ? "1 pratica matura" : `${dati.aperti.length} pratiche maturano`} ADESSO · −{it2(dati.alGiorno)} €/giorno</div>
                            {dati.aperti.slice(0, size >= 2 ? 4 : 2).map((r, i) => (
                                <Link key={i} href="/pda/tracking" className="flex items-center justify-between gap-2 text-[11px] hover:bg-white/[0.05] rounded-md px-1 -mx-1 transition-colors">
                                    <span className="truncate text-slate-200">{r.nominativo || r.contract_id}<span className="text-slate-500"> · {r.categoria}</span></span>
                                    <span className="shrink-0 font-bold text-rose-300">−{it2(Number(r.malus_euro) || 0)} €/gg <span className="text-slate-500 font-normal">da {fmtGiornoIT(String(r.data_inizio || "").slice(0, 10))}</span></span>
                                </Link>
                            ))}
                            {dati.aperti.length > (size >= 2 ? 4 : 2) && <div className="text-[10px] text-slate-500">…e altre {dati.aperti.length - (size >= 2 ? 4 : 2)}</div>}
                        </div>
                    ) : (
                        <div className="text-[11px] text-emerald-300 font-semibold">✅ Niente sta maturando adesso: l&apos;emorragia è ferma.</div>
                    )}
                    {ctx.seesAll && usato > 0 && <div className="text-[10px] text-slate-500">🔧 Laboratorio usato: −{it2(Math.round(usato))} € nel mese (fuori perimetro negozi).</div>}
                    <Link href="/pda/tracking" className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-300 hover:text-sky-200">Sistema le pratiche <ArrowRight className="w-3 h-3" /></Link>
                </div>
            )}
        </WidgetShell>
    );
}

// ── 💶 CONTATORE € — il tuo mese in euro, dal motore (pay ragazzi) ──────────
// Somma payEuroAttivazione delle vendite DEL PERIMETRO al tier LIVE della
// RETE (le gare sono di rete: il tier è quello). Brand col derivato pieno:
// W3, Sky, Vodafone. La gara VF applica le regole della LETTERA A come
// kpiVF/Calcolatore (revisore 26/08): dentro anche i Fastweb sui codici T1
// (contestoVfFw), fuori le MNP di provenienza Vodafone/Fastweb/Ho.
// Onestà: dichiarati esclusi e senza canone. Sale da solo quando scatta
// una soglia (retroattivo compreso).
const esclusaLetteraA = (c) => /^mobile /i.test(String(c.categoria || ""))
    && /mnp/i.test(String(c.prodotto || ""))
    && /vodafone|fastweb|\bho\b|ho\./i.test(String(c.provenienza || ""));
function WidgetContatoreEuro({ ctx, size }) {
    const [tabs, setTabs] = useState(null);
    const [canoni, setCanoni] = useState(null);
    const ym = ctx.w3?.ym || ctx.sky?.ym || null;
    const multiMese = !!(ctx.w3 && !ctx.w3.ym && (ctx.w3.packs || []).length > 1);
    useEffect(() => {
        if (!ym) { setTabs(null); return; }
        let vivo = true;
        (async () => {
            const iso = `${ym}-01`;
            const [tw3, tsky, tvf, offs] = await Promise.all([
                caricaTabellare("windtre", iso).catch(() => null),
                caricaTabellare("sky", iso).catch(() => null),
                caricaTabellare("vodafone", iso).catch(() => null),
                supabase.from("catalog_offerte")
                    .select("nome, canone_mensile, catalog_prodotti!inner(nome, brand_id)")
                    .in("catalog_prodotti.brand_id", ["windtre", "sky", "vodafone", "fastweb"]).eq("attivo", true).not("canone_mensile", "is", null).limit(3000),
            ]);
            if (!vivo) return;
            const m = new Map();
            (offs.data || []).forEach((o) => {
                const p = o.catalog_prodotti;
                if (p) m.set(`${p.brand_id}|${norm(o.nome)}|${norm(p.nome)}`, Number(o.canone_mensile));
            });
            setTabs({ w3: tw3, sky: tsky, vf: tvf });
            setCanoni(m);
        })();
        return () => { vivo = false; };
    }, [ym]);
    const conto = useMemo(() => {
        if (!tabs || !canoni) return null;
        // FW T1 nella gara Vodafone: stessa selezione di kpiVF (contestoVfFw)
        const fwA = (ctx.vf?.packs?.[0]?.rowsFw || []).filter((c) => contestoVfFw("fastweb", c.cod_ins, c.negozio, c.categoria) === "vodafone");
        const brands = [
            { key: "windtre", label: "W3", tab: tabs.w3, rows: ctx.w3?.packs?.[0]?.rows || [], regoleA: false },
            { key: "sky", label: "Sky", tab: tabs.sky, rows: ctx.sky?.packs?.[0]?.rows || [], regoleA: false },
            { key: "vodafone", label: "VF", tab: tabs.vf, rows: [...(ctx.vf?.packs?.[0]?.rows || []), ...fwA], regoleA: true },
        ];
        let tot = 0, pezziPagati = 0, senzaRiga = 0, senzaCanone = 0, esclA = 0;
        const perBrand = [];
        for (const b of brands) {
            if (!b.tab || !b.rows.length) continue;
            let rete = b.rows.filter((c) => !esclusaDalleGare(c));
            if (b.regoleA) {
                esclA += rete.filter((c) => esclusaLetteraA(c) && ctx.scopeVendita(c)).length;
                rete = rete.filter((c) => !esclusaLetteraA(c));
            }
            const avz = calcolaAvanzamento(b.tab, rete);            // tier di RETE
            const mie = rete.filter((c) => ctx.scopeVendita(c));
            let eb = 0;
            for (const c of mie) {
                // brand della VENDITA al matcher: le FW T1 prendono le righe «FW»
                const set = matchRigheAttivazione(b.tab.righe, c, brandIdDaLabel(c.brand));
                if (!set.length) { senzaRiga++; continue; }
                const pista = set[0].pista;
                const tier = set[0].gettone ? 0 : (avz.piste[pista]?.tier ?? 0);
                const canone = canoni.get(`${brandIdDaLabel(c.brand) || b.key}|${norm(c.offerta)}|${norm(c.prodotto)}`) ?? null;
                const v = payEuroAttivazione(set, tier, canone);
                if (v == null) { senzaCanone++; continue; }
                eb += v; pezziPagati++;
            }
            if (mie.length) perBrand.push({ label: b.label, euro: Math.round(eb) });
            tot += eb;
        }
        return { tot: Math.round(tot), pezziPagati, senzaRiga, senzaCanone, esclA, perBrand };
    // negoziKey: il filtro negozi cambia scopeVendita senza toccare visKey
    }, [tabs, canoni, ctx.w3, ctx.sky, ctx.vf, ctx.visKey, ctx.negoziKey]);   // eslint-disable-line react-hooks/exhaustive-deps
    const chi = ctx.level === "own" ? "il tuo mese" : ctx.level === "store" ? "il negozio" : "la rete";
    return (
        <WidgetShell icon={Banknote} title="Contatore €" accent="var(--tf-22c55e)"
            action={<span className="text-[10px] text-slate-500">pay ragazzi · tier live</span>}>
            {multiMese ? (
                <div className="flex-1 flex items-center justify-center text-slate-500 text-xs text-center px-3">Le gare sono mensili: scegli un mese per contare gli euro.</div>
            ) : !conto ? (
                <div className="flex-1 flex items-center justify-center text-slate-500 text-xs"><Loader2 className="animate-spin mr-2" size={14} /> Conto dal motore…</div>
            ) : (
                <div className="flex-1 flex flex-col justify-center p-3 gap-1.5">
                    <div className="text-3xl font-black text-emerald-300 leading-none">{it2(conto.tot)} €</div>
                    <div className="text-[11px] text-slate-400">{chi} finora · {conto.pezziPagati} pezzi pagati al tier attuale della rete</div>
                    {conto.perBrand.length > 1 && (
                        <div className="flex flex-wrap gap-1.5">
                            {conto.perBrand.map((b) => <span key={b.label} className="px-2 py-0.5 rounded-md bg-white/[0.05] border border-white/10 text-[10px] text-slate-300">{b.label} <b className="text-emerald-300">{it2(b.euro)} €</b></span>)}
                        </div>
                    )}
                    <div className="text-[10px] text-slate-500">Sale da solo quando scatta una soglia (retroattivo compreso). W3 + Sky + gara Vodafone (FW T1 compresi){conto.esclA ? ` · ${conto.esclA} MNP escluse da lettera` : ""}{conto.senzaRiga ? ` · ${conto.senzaRiga} senza riga pay` : ""}{conto.senzaCanone ? ` · ${conto.senzaCanone} senza canone a catalogo` : ""}.</div>
                    {size >= 2 && <Link href="/calcolatore" className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-300 hover:text-sky-200">Apri il Calcolatore <ArrowRight className="w-3 h-3" /></Link>}
                </div>
            )}
        </WidgetShell>
    );
}

// ── ⚔️ DERBY — la sfida della settimana col negozio di pari peso ────────────
// Gemello = il negozio con la produzione mensile più vicina alla tua (così
// la sfida è sempre giocabile). Conta la produzione valida di gara della
// settimana (lun→oggi), negozio che REGISTRA. Admin: il derby più caldo
// della rete (i due negozi appaiati più vicini in testa).
function WidgetDerby({ ctx }) {
    // la sede fisica è la prima parola: «Magliana Multi» e «Magliana W3»
    // sono gemelli di sede, NON rivali (rilievo revisore 26/08)
    const sede = (n) => norm(String(n || "").trim().split(/\s+/)[0]);
    const dati = useMemo(() => {
        if (!ctx.periodoEMeseCorrente) return { fuoriMese: true };
        const valida = (c) => isCtr(c) && validaProduzione(c) && !esclusaDalleGare(c);
        const rows = (ctx.allPeriod || []).filter(valida);
        const perNeg = new Map();
        rows.forEach((c) => { const n = (c.negozio || "").trim(); if (n) perNeg.set(n, (perNeg.get(n) || 0) + 1); });
        const oggi = new Date();
        const lun = new Date(oggi); lun.setDate(oggi.getDate() - ((oggi.getDay() + 6) % 7));
        const lunISO = `${lun.getFullYear()}-${String(lun.getMonth() + 1).padStart(2, "0")}-${String(lun.getDate()).padStart(2, "0")}`;
        const sett = (neg) => rows.filter((c) => sameStoreW(c.negozio, neg) && giornoDi(c) >= lunISO).length;
        const mio = ctx.seesAll ? null : (ctx.myStores[0] || ctx.user?.negozio || null);
        if (mio) {
            const mioPeso = perNeg.get([...perNeg.keys()].find((n) => sameStoreW(n, mio))) || 0;
            let gemello = null, dist = Infinity;
            for (const [n, peso] of perNeg) {
                if (sameStoreW(n, mio) || sede(n) === sede(mio)) continue;   // mai il banco a fianco
                const d = Math.abs(peso - mioPeso);
                if (d < dist) { dist = d; gemello = n; }
            }
            if (!gemello) return null;
            return { a: { nome: mio, pz: sett(mio) }, b: { nome: gemello, pz: sett(gemello) }, tipo: "mio" };
        }
        // admin: i due negozi di testa più vicini tra loro (sedi diverse)
        const top = [...perNeg.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6);
        let best = null, bd = Infinity;
        for (let i = 0; i < top.length - 1; i++) {
            for (let j = i + 1; j < top.length; j++) {
                if (sede(top[i][0]) === sede(top[j][0])) continue;
                const d = Math.abs(top[i][1] - top[j][1]);
                if (d < bd) { bd = d; best = [top[i][0], top[j][0]]; }
            }
        }
        if (!best) return null;
        return { a: { nome: best[0], pz: sett(best[0]) }, b: { nome: best[1], pz: sett(best[1]) }, tipo: "rete" };
    }, [ctx.allPeriod, ctx.visKey, ctx.seesAll, ctx.periodoEMeseCorrente]);   // eslint-disable-line react-hooks/exhaustive-deps
    if (dati?.fuoriMese) return (
        <WidgetShell icon={Swords} title="Derby" accent="var(--tf-f59e0b)">
            <div className="flex-1 flex items-center justify-center text-slate-500 text-xs text-center px-3">Il derby vive nel mese corrente: torna su «Questo mese» per vederlo.</div>
        </WidgetShell>
    );
    if (!dati) return (
        <WidgetShell icon={Swords} title="Derby" accent="var(--tf-f59e0b)">
            <div className="flex-1 flex items-center justify-center text-slate-500 text-xs text-center px-3">Serve un negozio (e un rivale) per accendere il derby.</div>
        </WidgetShell>
    );
    const { a, b } = dati;
    const tot = a.pz + b.pz;
    const guida = a.pz === b.pz ? null : (a.pz > b.pz ? "a" : "b");
    const lato = (x, key) => (
        <div className="flex-1 min-w-0 text-center">
            <div className="h-6 flex items-end justify-center">{guida === key ? <CoronaOro h={20} /> : <span className="text-[10px] text-slate-600">&nbsp;</span>}</div>
            <div className="text-2xl font-black text-white leading-none">{x.pz}</div>
            <div className="text-[10px] text-slate-400 truncate" title={x.nome}>{x.nome}</div>
        </div>
    );
    return (
        <WidgetShell icon={Swords} title="Derby" accent="var(--tf-f59e0b)"
            action={<span className="text-[10px] text-slate-500">{dati.tipo === "rete" ? "il più caldo della rete" : "settimana in corso"}</span>}>
            <div className="flex-1 flex flex-col justify-center p-3 gap-2">
                <div className="flex items-center gap-2">
                    {lato(a, "a")}
                    <div className="text-lg font-black text-slate-600 shrink-0">VS</div>
                    {lato(b, "b")}
                </div>
                <div className="h-2 rounded-full bg-white/[0.07] overflow-hidden flex">
                    <div className="h-full bg-amber-400/90 transition-all" style={{ width: tot ? `${Math.round((a.pz / tot) * 100)}%` : "50%" }} />
                    <div className="h-full bg-sky-400/70 flex-1" />
                </div>
                <div className="text-[11px] text-center font-semibold text-slate-300">
                    {guida == null ? "⚔️ Perfetta parità: la prossima vendita decide." :
                        guida === "a" ? `${a.nome} avanti di ${a.pz - b.pz}` : `${b.nome} avanti di ${b.pz - a.pz}`}
                </div>
                <div className="text-[10px] text-slate-500 text-center">Pezzi validi di gara da lunedì · rivale di pari peso del mese.</div>
            </div>
        </WidgetShell>
    );
}



/* ═══ COPERTURE NEGOZI (Luca 27/08): il widget dell'AMMINISTRAZIONE (Sandra)
   che si ILLUMINA DI ROSSO se oggi — o nei giorni scorsi — un negozio ha
   avuto una ferie/malattia SENZA copertura (né un turno aggiunto né il flag
   «coperta così» della sezione Turni). Verde = tutto coperto. ═══ */
function WidgetCoperture({ ctx }) {
    const [scoperte, setScoperte] = useState(null);
    useEffect(() => {
        let vivo = true;
        (async () => {
            const giorni = [];
            for (let i = 7; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); giorni.push(ymdLoc(d)); }
            // MAI verde su errore (revisore: un allarme cieco che rassicura
            // è il fallimento peggiore): lo stato "errore" esce grigio
            const out = await sediScoperte(giorni).catch(() => "errore");
            if (vivo) setScoperte(out);
        })();
        return () => { vivo = false; };
    }, [ctx.visKey]);
    const inErrore = scoperte === "errore";
    const lista = (Array.isArray(scoperte) ? scoperte : []);
    const oggiISO = ctx.oggiISO;
    const rosse = [...lista].sort((a, b) => b.data.localeCompare(a.data));
    const allarme = lista.length > 0;
    return (
        <WidgetShell icon={LifeBuoy} title="Coperture negozi" accent={allarme ? "var(--tf-ef4444)" : inErrore ? "var(--tf-94a3b8)" : "var(--tf-22c55e)"}
            action={<Link href="/collaboratori" className="text-[10px] font-bold text-indigo-300 hover:text-indigo-200">Turni →</Link>}>
            {scoperte === null ? (
                <div className="flex-1 flex items-center justify-center text-slate-500 text-xs py-6">Controllo le coperture…</div>
            ) : inErrore ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-1.5 py-6 text-center">
                    <div className="text-2xl">⚠️</div>
                    <div className="text-xs font-bold text-slate-300">Verifica non riuscita</div>
                    <div className="text-[10px] text-slate-500">riapri la Home o controlla dai <Link href="/collaboratori" className="text-indigo-300 font-bold">Turni</Link></div>
                </div>
            ) : allarme ? (
                <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5">
                    <div className="rounded-xl border border-rose-500/60 bg-rose-500/[0.12] px-3 py-2 animate-pulse">
                        <div className="text-[11px] font-black text-rose-300 uppercase tracking-wider">🚨 {lista.length} {lista.length === 1 ? "giornata scoperta" : "giornate scoperte"}</div>
                        <div className="text-[10px] text-rose-200/80">assenze senza copertura né conferma «coperta così»</div>
                    </div>
                    {rosse.slice(0, 8).map((sc) => (
                        // CLICCABILE (Luca 27/08): dritto sui Turni, sul giorno giusto
                        <Link key={`${sc.sede}|${sc.data}`} href={`/collaboratori?tab=turni&data=${sc.data}`}
                            title={`Apri i Turni del ${fmtGiornoIT(sc.data)} per coprire ${sc.sede}`}
                            className={cn("block rounded-lg border p-2 transition-colors",
                                sc.data === oggiISO ? "border-rose-500/50 bg-rose-500/[0.08] hover:bg-rose-500/[0.15]" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.08] hover:border-white/20")}>
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-bold text-slate-200 truncate">🏬 {sc.sede}</span>
                                <span className={cn("text-[10px] font-bold shrink-0 tabular-nums", sc.data === oggiISO ? "text-rose-300" : "text-slate-500")}>
                                    {sc.data === oggiISO ? "OGGI" : fmtGiornoIT(sc.data)} ›
                                </span>
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">
                                {sc.assenti.map((a) => `${a.tipo === "malattia" ? "🤒" : "🏖"} ${a.persona}`).join(" · ")}
                            </div>
                        </Link>
                    ))}
                    {rosse.length > 8 && <div className="text-[10px] text-slate-500">+{rosse.length - 8} nel dettaglio Turni</div>}
                </div>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-1.5 py-6 text-center">
                    <div className="text-2xl">🛡️</div>
                    <div className="text-sm font-black text-emerald-300">Tutto coperto</div>
                    <div className="text-[10px] text-slate-500">nessuna assenza scoperta negli ultimi 7 giorni</div>
                </div>
            )}
        </WidgetShell>
    );
}

/* ═══ REGIA TASK (Luca 27/08 notte): il widget dell'AMMINISTRATIVO — due
   colonne: le task assegnate A te e quelle assegnate DA te. Quando chi le
   riceve le chiude, TORNANO indietro con le sue note (📬 ritorni) finché
   chi le ha assegnate non le marca «vista». Le task nascono dal Calendario
   (multi-assegnazione già esistente); qui si governa il giro. ═══ */
function WidgetRegiaTask({ ctx, size }) {
    const [dati, setDati] = useState(null);
    const [busy, setBusy] = useState(null);
    const [errore, setErrore] = useState(null);
    const [giro, setGiro] = useState(0);
    const [notaPer, setNotaPer] = useState(null);   // { id, testo } — nota di chiusura
    const io = ctx.user || {};
    const mioNome = norm(io.name);
    const èMia = (t) => (t.assigned_user_id && t.assigned_user_id === io.id) || (t.assigned_to && norm(t.assigned_to) === mioNome);
    const creataDaMe = (t) => (t.created_by_user_id && t.created_by_user_id === io.id) || (t.created_by && norm(t.created_by) === mioNome);
    useEffect(() => {
        let vivo = true;
        (async () => {
            // poche centinaia di righe in tutto: due query larghe, filtro in JS
            const sel = "id, date, time, title, notes, status, assigned_to, assigned_to_store, assigned_user_id, created_by, created_by_user_id, outcome_note, esito_at, esito_visto";
            const [ap, rt] = await Promise.all([
                // aperte = tutto ciò che non è chiuso (27/08: in corso e problema
                // sono lavoro ancora sul tavolo, non roba archiviata)
                supabase.from("calendar_tasks").select(sel).in("status", ["da_fare", "in_corso", "problema"]).order("date").order("time").limit(300),
                supabase.from("calendar_tasks").select(sel).not("status", "in", "(da_fare,in_corso)").eq("esito_visto", false).order("esito_at", { ascending: false, nullsFirst: false }).limit(60),
            ]);
            if (!vivo) return;
            if (ap.error || rt.error) { setErrore((ap.error || rt.error)?.message || "errore di caricamento"); setDati({ mie: [], date: [], ritorni: [] }); return; }
            const aperte = ap.data || [];
            setDati({
                mie: aperte.filter(èMia),
                date: aperte.filter((t) => creataDaMe(t) && !èMia(t)),
                ritorni: (rt.data || []).filter((t) => creataDaMe(t) && !èMia(t)),
            });
        })();
        return () => { vivo = false; };
    }, [ctx.visKey, giro]);   // eslint-disable-line react-hooks/exhaustive-deps
    const chiudi = async (t, nota) => {
        setBusy(`t${t.id}`); setErrore(null);
        // se la chiudo io che l'ho creata non deve «tornare» a me stesso
        const { error } = await supabase.from("calendar_tasks").update({
            status: "fatta",
            // ⚠️ solo se ho scritto qualcosa: chiudere in fretta non deve
            // cancellare la risposta già data (revisore 28/08)
            ...((nota || "").trim() ? { outcome_note: (nota || "").trim() } : {}),
            esito_at: new Date().toISOString(), esito_visto: creataDaMe(t),
        }).eq("id", t.id);
        setBusy(null); setNotaPer(null);
        if (error) setErrore(error.message || "non sono riuscito a chiuderla"); else setGiro((g) => g + 1);
    };
    const segnaVista = async (t) => {
        setBusy(`v${t.id}`); setErrore(null);
        const { error } = await supabase.from("calendar_tasks").update({ esito_visto: true }).eq("id", t.id);
        setBusy(null);
        if (error) setErrore(error.message || "errore"); else setGiro((g) => g + 1);
    };
    const oggiISO = ctx.oggiISO;
    const Colonna = ({ titolo, badge, children }) => (
        <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500">{titolo}</span>
                {badge != null && badge > 0 && <span className="text-[9px] font-black text-white bg-indigo-500/70 rounded-full px-1.5 py-0.5 tabular-nums">{badge}</span>}
            </div>
            {children}
        </div>
    );

    const RigaData = ({ t }) => {
        const scaduta = t.date < oggiISO;
        return (
            <div className={cn("rounded-lg border p-2",
                scaduta ? "border-rose-500/50 bg-rose-500/[0.08]" : "border-white/10 bg-white/[0.03]")}>
                <div className="text-[11px] font-bold text-slate-200 truncate" title={t.title}>{t.title || "Task"}</div>
                <div className="text-[10px] text-slate-500 truncate">
                    👤 {t.assigned_to || t.assigned_to_store || "—"} · {scaduta ? `${fmtGiornoIT(t.date)} · IN RITARDO` : (t.time ? `${fmtGiornoIT(t.date)} ${String(t.time).slice(0, 5)}` : fmtGiornoIT(t.date))}
                </div>
            </div>
        );
    };
    const RigaRitorno = ({ t }) => (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/[0.08] p-2">
            <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-bold text-emerald-200 truncate" title={t.title}>📬 {t.title || "Task"}</div>
                    <div className="text-[10px] text-slate-400 truncate">
                        {/* una task tornata indietro NON è «chiusa»: dirlo era la
                            bugia più costosa del riquadro (revisore 27/08) */}
                        {t.status === "problema" ? "⚠️ problema segnalato da " : "chiusa da "}
                        {t.assigned_to || t.assigned_to_store || "?"}{t.esito_at ? ` · ${fmtGiornoIT(String(t.esito_at).slice(0, 10))}` : ""}
                    </div>
                    {t.outcome_note && <div className="text-[10px] text-emerald-100/90 mt-0.5">💬 {t.outcome_note}</div>}
                </div>
                <button disabled={busy === `v${t.id}`} onClick={() => segnaVista(t)} title="Ho visto l'esito: archivia il ritorno"
                    className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-lg border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20">✓ vista</button>
            </div>
        </div>
    );
    const mie = dati?.mie || [], assegnate = dati?.date || [], ritorni = dati?.ritorni || [];
    const nMax = size >= 4 ? 8 : 5;
    return (
        <WidgetShell icon={ClipboardList} title="Regia Task" accent="var(--tf-a855f7)"
            action={<Link href="/calendario" className="text-[10px] font-bold text-indigo-300 hover:text-indigo-200">+ assegna</Link>}>
            {!dati ? (
                <div className="flex-1 flex items-center justify-center text-slate-500 text-xs py-8">Carico le task…</div>
            ) : (
                <div className={cn("flex-1 min-h-0 overflow-y-auto flex gap-3", size >= 4 ? "flex-row" : "flex-col")}>
                    <Colonna titolo="📥 Le tue" badge={mie.length}>
                        {mie.length ? mie.slice(0, nMax).map((t) => (
                            <RigaTaskNota key={t.id} t={t} oggiISO={oggiISO} busy={busy} nota={notaPer} setNota={setNotaPer} chiudi={chiudi}
                                diAltri={!creataDaMe(t)} tonoScaduta="rose" />
                        ))
                            : <div className="text-[11px] text-slate-500 py-2">Nessuna task aperta. 🎉</div>}
                        {mie.length > nMax && <div className="text-[10px] text-slate-500">+{mie.length - nMax} nel <Link href="/calendario" className="text-indigo-300 font-bold">calendario</Link></div>}
                    </Colonna>
                    <Colonna titolo="📤 Assegnate da te" badge={ritorni.length + assegnate.length}>
                        {ritorni.slice(0, nMax).map((t) => <RigaRitorno key={`r${t.id}`} t={t} />)}
                        {assegnate.length ? assegnate.slice(0, nMax).map((t) => <RigaData key={t.id} t={t} />)
                            : (!ritorni.length && <div className="text-[11px] text-slate-500 py-2">Niente in giro: assegna dal <Link href="/calendario" className="text-indigo-300 font-bold">calendario</Link>.</div>)}
                    </Colonna>
                </div>
            )}
            {errore && <div className="text-[10px] font-bold text-rose-300 mt-1">✗ {errore}</div>}
        </WidgetShell>
    );
}

/* ═══ A CHI SERVE UN WIDGET (Luca 26/08: «dividili per categorie, ce ne sono
   alcuni per tutti — altrimenti rischiamo di intasare i widget quando ce ne
   sono che non hanno senso per alcuni ruoli») ═══════════════════════════════
   I `gruppo` dicono DI COSA parla un widget (performance, statistiche…). Qui
   si aggiunge l'altro asse: PER CHI ha senso. Le aree sono quelle dei ruoli —
   pv (punto vendita), cc (call center), ob (agenti), sede — più il livello di
   chi guarda. `aree` assente = per TUTTI: è la categoria che Luca ha chiesto,
   e resta il default perché il grosso dei widget parla a chiunque venda.
   Un widget escluso NON compare nella galleria ➕ di quel ruolo: nessuno se lo
   può aggiungere per sbaglio, e chi già ce l'ha in un layout salvato se lo
   vede sparire (risolviLayout filtra su infoWidget). */

const FISSI = {
    soglia_euro: { label: "Vale X€", icon: Euro, sizes: [1, 2], def: 1, gruppo: "performance" , aree: ["pv", "ob"] },
    treno19: { label: "Il Treno delle 19", icon: TrainFront, sizes: [1, 2], def: 1, gruppo: "strumenti" , aree: ["pv", "ob"] },
    serie: { label: "La Serie", icon: Flame, sizes: [1], def: 1, gruppo: "performance" },
    agenda: { label: "Agenda del giorno", icon: CalendarCheck, sizes: [2, 4], def: 2, gruppo: "strumenti" },
    scudo: { label: "Scudo Malus", icon: Shield, sizes: [1, 2], def: 1, gruppo: "performance" , aree: ["pv", "ob", "sede"] },
    contatore: { label: "Contatore €", icon: Banknote, sizes: [1, 2], def: 1, gruppo: "performance" , aree: ["pv", "ob"] },
    derby: { label: "Derby", icon: Swords, sizes: [1, 2], def: 1, gruppo: "confronto" },
    // marginalita e chart_brand DISMESSI 26/08 (doppioni dell'Analisi — Luca:
    // «toglierei anche la marginalità da subito» e «quello stupido widget per
    // brand… eliminiamolo»). I componenti restano nel file, spenti dal registry.
    // def "s": i KPI singoli nascono alla TAGLIA MINIMA (tile 2×1) — Luca
    // 26/08: «la dimensione più piccola deve essere quella di default»
    kpi_contratti: { label: "Contratti", icon: FileText, sizes: [1, 2], def: "s", gruppo: "statistiche" },
    kpi_attivi: { label: "Attivi", icon: CheckCircle2, sizes: [1, 2], def: "s", gruppo: "statistiche" },
    kpi_lavorazione: { label: "In lavorazione", icon: Clock, sizes: [1, 2], def: "s", gruppo: "statistiche" },
    kpi_clienti: { label: "Clienti", icon: Users, sizes: [1, 2], def: "s", gruppo: "statistiche" },
    chart_stato: { label: "Grafico per stato", icon: AlertTriangle, sizes: [1, 2, 4], def: 2, gruppo: "statistiche" },
    chart_top: { label: "Top negozi/venditori", icon: StoreIcon, sizes: [1, 2, 4], def: 2, gruppo: "statistiche", nonPer: ["own"] },
    classifica: { label: "Classifica venditori", icon: Trophy, sizes: [2, 4], def: 4, gruppo: "statistiche" },
    /* TAGLIA OBBLIGATA (Luca 28/08): «e' diventato un pochettino troppo corto,
       allungalo di due colonne e definisci quella la dimensione obbligatoria».
       Da 6 a 8 colonne su 16 — con il passo «Cosa c'e' dentro?» le pastiglie
       andavano a capo e il consiglio finiva schiacciato. minW = maxW = 8:
       non si puo' piu' rimpicciolire, perche' sotto non e' leggibile. */
    bussola: { label: "Direzione inserimento", icon: Compass, sizes: [2, 4], def: 2, gruppo: "strumenti" , aree: ["pv"], minW: 8, maxW: 8, minH: 4, maxH: 4, defW: 8, defH: 4 },
    obiettivo: { label: "Obiettivo", icon: TargetIcon, sizes: [1, 2], def: 1, gruppo: "strumenti" },
    azioni: { label: "Azioni e to-do", icon: Zap, sizes: [1, 2], def: 1, gruppo: "strumenti" },
    bacheca: { label: "Bacheca aziendale", icon: Megaphone, sizes: [1, 2, 4], def: 2, gruppo: "comunicazione" },
    accessi: { label: "Accessi collaboratori", icon: LogIn, sizes: [1, 2], def: 2, gruppo: "squadra", nonPer: ["own"] , aree: ["pv", "cc", "sede"] },
    // i due canali col cliente stanno nel gruppo COMUNICAZIONE (Luca 26/08)
    whatsapp: { label: "WhatsApp del team", icon: MessageCircle, sizes: [2, 4], def: 2, gruppo: "comunicazione", soloManager: true },
    // la REGIA TASK è dell'amministrativo (Luca 27/08): due colonne, a te/da te
    task_regia: { label: "Regia Task", icon: ClipboardList, sizes: [2, 4], def: 4, gruppo: "strumenti", ruoli: ["amministrativo"], minW: 8, minH: 4 },
    // il semaforo delle COPERTURE (ferie/malattie scoperte) — amministrazione
    coperture: { label: "Coperture negozi", icon: LifeBuoy, sizes: [1, 2], def: 1, gruppo: "squadra", ruoli: ["amministrativo"] },
    email: { label: "Email del team", icon: Mail, sizes: [2, 4], def: 2, gruppo: "comunicazione", soloManager: true },
};

/** area del ruolo, per decidere a chi mostrare un widget. Usa `areaOf`, che
 *  conosce anche i ruoli custom creati da Luca (DYNAMIC). Sconosciuto → "pv":
 *  meglio mostrare di più che nascondere a un ruolo nuovo non ancora mappato. */
const areaDi = (role) => areaOf(String(role || "")) || "pv";

// manager = vede la squadra: rete intera, store manager, direttore call center
const isManagerWa = (ctx) => ctx.seesAll || ctx.level === "store" || ["direttore_cc"].includes(ctx.user?.role);

export function infoWidget(id, ctx) {
    // WIDGET BRAND DISMESSI (decisione Luca 26/08 sera): erano doppioni di
    // consultazione dell'Analisi — la Home è azione, i numeri completi
    // vivono in /analisi. Il null qui li fa sparire OVUNQUE, layout salvati
    // compresi (risolviLayout/decodeCoord filtrano su infoWidget).
    if (id.startsWith("brand:")) return null;
    if (id.startsWith("confronto")) {
        return { id, label: "Confronto", icon: Swords, sizes: [2, 4], def: 2, gruppo: "confronto", accent: "var(--tf-f59e0b)" };
    }
    const f = FISSI[id];
    if (!f) return null;
    if (f.soloAdmin && !ctx.seesAll) return null;
    if (f.nonPer && f.nonPer.includes(ctx.level)) return null;
    if (f.soloManager && !isManagerWa(ctx)) return null;
    // widget legati a RUOLI precisi (es. Regia Task → amministrativo); chi
    // vede tutta la rete li vede comunque, per governarli
    if (f.ruoli && !ctx.seesAll && !f.ruoli.includes(ctx.user?.role)) return null;
    // AREA DEL RUOLO: chi vede tutta la rete (admin, direzione generale,
    // amministrativo) non si filtra — deve poter guardare qualunque cosa.
    if (f.aree && !ctx.seesAll && !f.aree.includes(areaDi(ctx.user?.role))) return null;
    return { id, ...f, perTutti: !f.aree };
}

export function renderWidget(id, ctx, size) {
    if (id.startsWith("brand:")) return null;   // dismessi 26/08 (doppioni dell'Analisi)
    if (id.startsWith("confronto")) {
        // id = "confronto" | "confronto:<tipo>:<bersaglio>" ("A|B" per il duello)
        const parti = id.split(":");
        return <WidgetConfronto ctx={ctx} size={size} widgetKey={id} param={parti.length >= 3 ? parti.slice(2).join(":") : null} />;
    }
    switch (id) {
        case "soglia_euro": return <WidgetSogliaEuro ctx={ctx} size={size} />;
        case "treno19": return <WidgetTreno19 ctx={ctx} size={size} />;
        case "serie": return <WidgetSerie ctx={ctx} />;
        case "agenda": return <WidgetAgenda ctx={ctx} size={size} />;
        case "scudo": return <WidgetScudoMalus ctx={ctx} size={size} />;
        case "contatore": return <WidgetContatoreEuro ctx={ctx} size={size} />;
        case "derby": return <WidgetDerby ctx={ctx} />;
        case "kpi_contratti": return <KpiTile icon={FileText} label="Contratti" value={ctx.mine.length} color="var(--tf-6366f1)" sub={`registrati ${ctx.periodoLabel}`} />;
        case "kpi_attivi": return <KpiTile icon={CheckCircle2} label="Attivi" value={ctx.attivi} color="var(--tf-22c55e)" sub={ctx.mine.length ? `${Math.round((ctx.attivi / ctx.mine.length) * 100)}% del periodo` : "—"} />;
        case "kpi_lavorazione": return <KpiTile icon={Clock} label="In lavorazione" value={ctx.lavorazione} color="var(--tf-f59e0b)" sub="da completare" />;
        case "kpi_clienti": return <KpiTile icon={Users} label="Clienti" value={ctx.clienti} color="var(--tf-a855f7)" sub="serviti nel periodo" />;
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
        case "task_regia": return <WidgetRegiaTask ctx={ctx} size={size} />;
        case "coperture": return <WidgetCoperture ctx={ctx} />;
        case "whatsapp": return isManagerWa(ctx) ? <WidgetWhatsApp ctx={ctx} size={size} /> : null;
        case "email": return isManagerWa(ctx) ? <WidgetEmail ctx={ctx} size={size} /> : null;
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
        // "s" = tile minima (2 colonne × 1 riga): il default dei KPI singoli
        const k = s.slice(0, i); const raw = s.slice(i + 1);
        const sz = raw === "s" ? "s" : Number(raw);
        if (sz !== "s" && ![1, 2, 4].includes(sz)) return;
        if (!out.some((w) => w.k === k)) out.push({ k, s: sz });
    });
    return out;
}

// I 4 blocchi storici (kpi/charts/widgets/leaderboard) esplosi nei singoli
// widget: chi aveva un layout salvato lo ritrova identico, ma spacchettato.
const LEGACY_BLOCKS = {
    kpi: ["kpi_contratti@s", "kpi_attivi@s", "kpi_lavorazione@s", "kpi_clienti@s"],
    charts: ["chart_stato@2", "chart_top@2"],
    widgets: ["bussola@2", "obiettivo@1", "azioni@1", "bacheca@1", "accessi@2"],
    leaderboard: ["classifica@4"],
};
export const isLegacyLayout = (arr) => Array.isArray(arr) && arr.length > 0 && arr.every((s) => typeof s === "string" && LEGACY_BLOCKS[s]);

/** Widget performance da proporre in testa: i brand osservati nella
 *  produzione dello scope (max 4) + la marginalità. */
export function perfDefaults(ctx) {
    // vuota dal 26/08: i widget brand e la Marginalità sono dismessi
    // (doppioni dell'Analisi) — la firma resta per i chiamanti legacy
    void ctx;
    return [];
}

export function layoutDefault(ctx) {
    // HOME STANDARD (Luca 27/08 notte, applicata a TUTTI): in testa la fila
    // dei KPI piccoli, poi il quartetto operativo — Direzione inserimento,
    // Agenda (calendario), WhatsApp ed Email (i canali restano solo a chi li
    // può vedere: risolviLayout filtra da solo su infoWidget) — poi il resto.
    // L'AMMINISTRATIVO apre con la Regia Task subito dopo i KPI.
    const amministrativo = ctx.user?.role === "amministrativo";
    if (ctx.level === "global") {
        return decodeLayout([
            "kpi_contratti@s", "kpi_attivi@s", "kpi_lavorazione@s", "kpi_clienti@s", "obiettivo@1", "azioni@1",
            ...(amministrativo ? ["task_regia@4", "coperture@1"] : []),
            "bussola@2", "agenda@2",
            "whatsapp@2", "email@2",
            "soglia_euro@1", "scudo@1", "derby@1", "chart_stato@1",
            "bacheca@2", "chart_top@2",
            "accessi@2", "classifica@4",
        ]);
    }
    if (ctx.level === "store") {
        return decodeLayout([
            "kpi_contratti@s", "kpi_attivi@s", "kpi_lavorazione@s", "kpi_clienti@s", "obiettivo@1", "azioni@1",
            "bussola@2", "agenda@2",
            "whatsapp@2", "email@2",
            "soglia_euro@1", "treno19@1", "scudo@1", "contatore@1",
            "derby@1", "confronto@2", "chart_stato@1",
            "bacheca@2", "chart_top@2",
            "classifica@4",
        ]);
    }
    return decodeLayout([
        "kpi_contratti@s", "kpi_attivi@s", "kpi_lavorazione@s", "kpi_clienti@s", "obiettivo@1", "azioni@1",
        "bussola@2", "agenda@2",
        "soglia_euro@1", "serie@1", "treno19@1", "contatore@1",
        "scudo@1", "derby@1", "confronto@2",
        "bacheca@2", "classifica@2",
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
/** WIDGET INCHIODATI (Luca 27/08): la Bussola è OBBLIGATORIA per chi lavora
 *  nei negozi — niente ✕, e se manca dal layout viene rimessa da sola.
 *  Esclusi: call center, amministrativo/backoffice, agenti e i loro capi
 *  (e chi vede tutta la rete, che decide per sé). */
export function widgetObbligatorio(id, ctx) {
    if (id !== "bussola") return false;
    if (ctx.seesAll) return false;
    return areaDi(ctx.user?.role) === "pv";
}

export function widgetsDisponibili(ctx, giaPresenti) {
    const presenti = new Set(giaPresenti);
    // niente più brand:* in galleria (dismessi 26/08 — i numeri stanno in Analisi)
    const ids = ["confronto", ...Object.keys(FISSI)];
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

export const SIZE_LABEL = { s: "Tile", 1: "1 blocco", 2: "2 blocchi", 4: "Mezza pagina" };
