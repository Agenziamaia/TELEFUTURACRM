"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Image from "next/image";
import { User, Store, Eye, ShieldCheck, Phone, Headphones, Car, Target, TrendingUp, Calendar, Clock, AlertTriangle, CheckCircle2, XCircle, DollarSign, BarChart3, Users, ChevronDown, ChevronUp, Clipboard, FileWarning } from "lucide-react";

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const BRANDS = [
  { id: "windtre", label: "WindTre", color: "#c2702a", logo: "/windtre.webp" },
  { id: "vodafone", label: "Vodafone", color: "#c45454", logo: "/vodaphone - Copy.png" },
  { id: "sky", label: "Sky", color: "#5a9abf", logo: "/sky.png" },
  { id: "fastweb", label: "Fastweb", color: "#bfa84a", logo: "/fastweb.png" },
  { id: "energia", label: "Energia", color: "#6aaa6a", logo: "/energy - Copy.png" },
];

const BRAND_CATS_AZ: Record<string, { id: string; label: string }[]> = {
  windtre: [{ id: "w_fisso", label: "Fisso" }, { id: "w_lg", label: "Luce-Gas" }, { id: "w_ass", label: "Assicurazioni" }],
  vodafone: [{ id: "v_fisso", label: "Fisso" }, { id: "v_energy", label: "Energy" }],
  sky: [{ id: "s_3p", label: "3P" }, { id: "s_tv", label: "TV" }],
  fastweb: [{ id: "f_mob", label: "Mobile" }, { id: "f_energy", label: "Energy" }],
  energia: [{ id: "e_s4", label: "S4" }],
};

const BRAND_CATS_NEG: Record<string, { id: string; label: string }[]> = {
  windtre: [
    { id: "wn_mob_ga", label: "Mobile GA" }, { id: "wn_mob_cb", label: "Mobile CB" },
    { id: "wn_fisso", label: "Fisso" }, { id: "wn_lg", label: "Luce-Gas" },
    { id: "wn_ass", label: "Assicurazioni" }, { id: "wn_multi", label: "Multi-Servizi" },
  ],
  vodafone: [
    { id: "vn_mob_ga", label: "Mobile GA" }, { id: "vn_mob_cb", label: "Mobile CB" },
    { id: "vn_fisso", label: "Fisso" }, { id: "vn_energy", label: "Energy" },
    { id: "vn_multi", label: "Multi-Servizi" },
  ],
  sky: [
    { id: "sn_3p", label: "3P" }, { id: "sn_tv", label: "TV" },
    { id: "sn_sport", label: "Sport" }, { id: "sn_bundle", label: "Bundle" },
  ],
  fastweb: [
    { id: "fn_mob", label: "Mobile" }, { id: "fn_fisso", label: "Fisso" },
    { id: "fn_energy", label: "Energy" },
  ],
  energia: [
    { id: "en_s4", label: "S4" }, { id: "en_barton", label: "Barton" },
  ],
};

const STORES = [
  { id: "tiburtina", name: "Tiburtina", tipo: "multibrand", giorniLav: [1, 2, 3, 4, 5, 6] },
  { id: "tuscolana", name: "Tuscolana", tipo: "multibrand", giorniLav: [1, 2, 3, 4, 5, 6] },
  { id: "prati", name: "Prati", tipo: "franchising", giorniLav: [1, 2, 3, 4, 5] },
  { id: "eur", name: "EUR", tipo: "multibrand", giorniLav: [1, 2, 3, 4, 5, 6] },
  { id: "ostia", name: "Ostia", tipo: "franchising", giorniLav: [1, 2, 3, 4, 5] },
  { id: "centocelle", name: "Centocelle", tipo: "multibrand", giorniLav: [1, 2, 3, 4, 5, 6] },
  { id: "cinecitta", name: "Cinecittà", tipo: "franchising", giorniLav: [1, 2, 3, 4, 5, 6] },
  { id: "primavalle", name: "Primavalle", tipo: "multibrand", giorniLav: [1, 2, 3, 4, 5] },
  { id: "trastevere", name: "Trastevere", tipo: "franchising", giorniLav: [1, 2, 3, 4, 5, 6] },
];

const SELLERS = [
  { id: "s1", name: "Marco R.", store: "tiburtina", ruolo: "venditore" },
  { id: "s2", name: "Giulia T.", store: "tuscolana", ruolo: "venditore" },
  { id: "s3", name: "Alessandro P.", store: "tiburtina", ruolo: "store_manager" },
  { id: "s4", name: "Francesca M.", store: "prati", ruolo: "venditore" },
  { id: "s5", name: "Luca B.", store: "eur", ruolo: "venditore" },
  { id: "s6", name: "Sara D.", store: "ostia", ruolo: "venditore" },
  { id: "s7", name: "Davide C.", store: "centocelle", ruolo: "store_manager" },
  { id: "s8", name: "Elena V.", store: "cinecitta", ruolo: "venditore" },
  { id: "s9", name: "Roberto N.", store: "primavalle", ruolo: "venditore" },
  { id: "s10", name: "Chiara G.", store: "trastevere", ruolo: "venditore" },
  { id: "s11", name: "Paolo F.", store: "tuscolana", ruolo: "venditore" },
  { id: "s12", name: "Martina L.", store: "eur", ruolo: "store_manager" },
  { id: "s13", name: "Andrea Z.", store: "prati", ruolo: "venditore" },
  { id: "s14", name: "Simone K.", store: "ostia", ruolo: "store_manager" },
  { id: "s15", name: "Valentina B.", store: "centocelle", ruolo: "venditore" },
  { id: "s16", name: "Giorgio M.", store: "trastevere", ruolo: "venditore" },
  { id: "s17", name: "Federica A.", store: "tiburtina", ruolo: "venditore" },
  { id: "s18", name: "Tommaso R.", store: "primavalle", ruolo: "store_manager" },
  { id: "s19", name: "Ilaria C.", store: "cinecitta", ruolo: "venditore" },
  { id: "s20", name: "Matteo S.", store: "tuscolana", ruolo: "store_manager" },
  // Call Center
  { id: "cc1", name: "Laura P.", store: "call_center", ruolo: "caller" },
  { id: "cc2", name: "Stefano G.", store: "call_center", ruolo: "caller" },
  { id: "cc3", name: "Monica R.", store: "call_center", ruolo: "caller" },
  { id: "cc4", name: "Riccardo D.", store: "call_center", ruolo: "caller" },
  { id: "cc5", name: "Alessia F.", store: "call_center", ruolo: "cc_director" },
  // Outbound
  { id: "ob1", name: "Daniele M.", store: "outbound", ruolo: "agente_ob" },
  { id: "ob2", name: "Cristina L.", store: "outbound", ruolo: "agente_ob" },
  { id: "ob3", name: "Fabio T.", store: "outbound", ruolo: "agente_ob" },
  { id: "ob4", name: "Silvia N.", store: "outbound", ruolo: "ob_director" },
];

const SELLER_GROUPS: Record<string, typeof SELLERS> = {
  pv: SELLERS.filter((se) => se.store !== "call_center" && se.store !== "outbound"),
  cc: SELLERS.filter((se) => se.store === "call_center"),
  ob: SELLERS.filter((se) => se.store === "outbound"),
};

// ═══════════════════════════════════════════════════════════════
// MOCK DATA
// ═══════════════════════════════════════════════════════════════

interface MockData {
  targetAzCat: Record<string, Record<string, number>>;
  targetNegCat: Record<string, Record<string, Record<string, number>>>;
  targetPersonali: Record<string, Record<string, number> & { totale: number }>;
  produzioneAzCat: Record<string, Record<string, Record<string, number>>>;
  produzioneNegCat: Record<string, Record<string, Record<string, number>>>;
  produzione: Record<string, Record<string, number>>;
  fatturato: Record<string, number>;
  criticita: Record<string, { daLavorare: number; warning: number; koBimestre: number; nonPagateBimestre: number }>;
  appuntamenti: Record<string, { ora: string; cliente: string; tipo: string; venditore?: string }[]>;
}

function generateMockData(): MockData {
  let s = 77;
  const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };

  const targetAzCat: Record<string, Record<string, number>> = {};
  BRANDS.forEach(b => {
    targetAzCat[b.id] = {};
    const cats = BRAND_CATS_AZ[b.id] || [];
    cats.forEach(c => { targetAzCat[b.id][c.id] = Math.round(8 + rand() * 25); });
  });

  const targetNegCat: Record<string, Record<string, Record<string, number>>> = {};
  STORES.forEach(st => {
    targetNegCat[st.id] = {};
    BRANDS.forEach(b => {
      targetNegCat[st.id][b.id] = {};
      const cats = BRAND_CATS_NEG[b.id] || [];
      cats.forEach(c => { targetNegCat[st.id][b.id][c.id] = Math.round(1 + rand() * 6); });
    });
  });

  const targetPersonali: Record<string, Record<string, number> & { totale: number }> = {};
  SELLERS.forEach(se => {
    targetPersonali[se.id] = { totale: 0 } as Record<string, number> & { totale: number };
    BRANDS.forEach(b => {
      const val = Math.round(2 + rand() * 6);
      targetPersonali[se.id][b.id] = val;
      targetPersonali[se.id].totale += val;
    });
  });

  const produzioneAzCat: Record<string, Record<string, Record<string, number>>> = {};
  SELLERS.forEach(se => {
    produzioneAzCat[se.id] = {};
    BRANDS.forEach(b => {
      produzioneAzCat[se.id][b.id] = {};
      const cats = BRAND_CATS_AZ[b.id] || [];
      cats.forEach(c => {
        const tAz = (targetAzCat[b.id] && targetAzCat[b.id][c.id]) || 5;
        const perSeller = tAz / SELLERS.length;
        produzioneAzCat[se.id][b.id][c.id] = Math.round(perSeller * (0.3 + rand() * 0.9));
      });
    });
  });

  const produzioneNegCat: Record<string, Record<string, Record<string, number>>> = {};
  SELLERS.forEach(se => {
    produzioneNegCat[se.id] = {};
    BRANDS.forEach(b => {
      produzioneNegCat[se.id][b.id] = {};
      const cats = BRAND_CATS_NEG[b.id] || [];
      cats.forEach(c => {
        const tNeg = (targetNegCat[se.store] && targetNegCat[se.store][b.id] && targetNegCat[se.store][b.id][c.id]) || 3;
        const sellersInStore = SELLERS.filter(ss => ss.store === se.store).length;
        const perSeller = tNeg / sellersInStore;
        produzioneNegCat[se.id][b.id][c.id] = Math.round(perSeller * (0.3 + rand() * 0.9));
      });
    });
  });

  const produzione: Record<string, Record<string, number>> = {};
  SELLERS.forEach(se => {
    produzione[se.id] = {};
    BRANDS.forEach(b => {
      const target = targetPersonali[se.id][b.id];
      produzione[se.id][b.id] = Math.round(target * (0.3 + rand() * 0.9));
    });
  });

  const fatturato: Record<string, number> = {};
  SELLERS.forEach(se => {
    let tot = 0;
    BRANDS.forEach(b => { tot += ((produzione[se.id] && produzione[se.id][b.id]) || 0) * (80 + Math.round(rand() * 120)); });
    fatturato[se.id] = tot;
  });

  const criticita: Record<string, { daLavorare: number; warning: number; koBimestre: number; nonPagateBimestre: number }> = {};
  SELLERS.forEach(se => {
    criticita[se.id] = {
      daLavorare: Math.floor(rand() * 5), warning: Math.floor(rand() * 4),
      koBimestre: Math.floor(rand() * 5), nonPagateBimestre: Math.floor(rand() * 3),
    };
  });

  const appuntamenti: Record<string, { ora: string; cliente: string; tipo: string }[]> = {};
  SELLERS.forEach(se => {
    const n = Math.floor(rand() * 4);
    const appts: { ora: string; cliente: string; tipo: string }[] = [];
    const clienti = ["Mario Rossi", "Anna Verdi", "Luigi Bianchi", "Carla Neri", "Giuseppe Conti"];
    const tipi = ["MNP", "Nuovo", "Fisso", "Rinnovo", "Business"];
    for (let i = 0; i < n; i++) {
      appts.push({
        ora: (9 + Math.floor(rand() * 8)) + ":" + (rand() > 0.5 ? "00" : "30"),
        cliente: clienti[Math.floor(rand() * clienti.length)],
        tipo: tipi[Math.floor(rand() * tipi.length)],
      });
    }
    appts.sort((a, bb) => a.ora.localeCompare(bb.ora));
    appuntamenti[se.id] = appts;
  });

  return { targetAzCat, targetNegCat, targetPersonali, produzioneAzCat, produzioneNegCat, produzione, fatturato, criticita, appuntamenti };
}

// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════

const OGGI = 16;
function glMese(gl: number[]) { let c = 0; for (let d = 1; d <= 31; d++) { const dow = new Date(2026, 2, d).getDay(); if (dow !== 0 && gl.indexOf(dow) >= 0) c++; } return c; }
function glPass(gl: number[], oggi: number) { let c = 0; for (let d = 1; d <= oggi; d++) { const dow = new Date(2026, 2, d).getDay(); if (dow !== 0 && gl.indexOf(dow) >= 0) c++; } return c; }
function glRim(gl: number[], oggi: number) { return glMese(gl) - glPass(gl, oggi); }
function proj(fatti: number, gp: number, gt: number) { return gp === 0 ? fatti : Math.round((fatti / gp) * gt); }
function stCol(pct: number) { return pct >= 100 ? "#6aaa7a" : pct >= 80 ? "#c4a24a" : "#c46a6a"; }
function stTw(pct: number) { return pct >= 100 ? "text-emerald-400" : pct >= 80 ? "text-amber-400" : "text-rose-400"; }
function stBgTw(pct: number) { return pct >= 100 ? "bg-emerald-500" : pct >= 80 ? "bg-amber-500" : "bg-rose-500"; }
function stLbl(pct: number) { return pct >= 100 ? "In linea" : pct >= 80 ? "A rischio" : "Sotto tono"; }
function stEmoji(pct: number) { return pct >= 100 ? "✅" : pct >= 80 ? "⚠️" : "🔴"; }

function getAvgPct(sid: string, data: MockData, gp: number, gt: number) {
  let sum = 0;
  BRANDS.forEach(b => {
    const f = (data.produzione[sid] && data.produzione[sid][b.id]) || 0;
    const t = data.targetPersonali[sid][b.id] || 1;
    sum += Math.min(Math.round((proj(f, gp, gt) / t) * 100), 100);
  });
  return Math.round(sum / BRANDS.length);
}
function getFattProj(sid: string, data: MockData, gp: number, gt: number) {
  const f = data.fatturato[sid] || 0;
  return gp === 0 ? f : Math.round((f / gp) * gt);
}

const GL_DEFAULT = [1, 2, 3, 4, 5];
function getSellerGL(se: (typeof SELLERS)[number]) {
  const st = STORES.find(s => s.id === se.store);
  return st ? st.giorniLav : GL_DEFAULT;
}
function getSellerGroup(se: (typeof SELLERS)[number]) {
  if (se.store === "call_center") return "cc";
  if (se.store === "outbound") return "ob";
  return "pv";
}
function getGroupLabel(g: string) {
  if (g === "cc") return "Call Center";
  if (g === "ob") return "Outbound";
  return "Punti Vendita";
}

// ═══════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════════

function AnimNum({ target }: { target: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let st: number | null = null;
    let raf: number;
    const run = (ts: number) => {
      if (!st) st = ts;
      const p = Math.min((ts - st) / 900, 1);
      el.textContent = String(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(run);
    };
    raf = requestAnimationFrame(run);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return <span ref={ref}>0</span>;
}

function DualBar({ actual, projected, max, color, height }: { actual: number; projected: number; max: number; color: string; height?: number }) {
  const h = height || 10;
  const pctAct = max > 0 ? Math.min((actual / max) * 100, 100) : 0;
  const pctProj = max > 0 ? Math.min((projected / max) * 100, 100) : 0;
  return (
    <div className="w-full relative">
      <div className="w-full overflow-hidden relative rounded-full bg-white/[0.04]" style={{ height: h }}>
        <div className="absolute top-0 left-0 h-full rounded-full transition-all duration-1000 opacity-25" style={{ width: pctProj + "%", backgroundColor: color }} />
        <div className="absolute top-0 left-0 h-full rounded-full transition-all duration-1000" style={{ width: pctAct + "%", backgroundColor: color }} />
      </div>
      <div className="flex gap-3 mt-1.5">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-1 rounded-sm" style={{ backgroundColor: color }} />
          <span className="text-sm text-slate-500">attuale</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-1 rounded-sm opacity-30" style={{ backgroundColor: color }} />
          <span className="text-sm text-slate-500">proiezione</span>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ icon, text, extra }: { icon: React.ReactNode; text: string; extra?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/[0.06]">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">{icon}</div>
        <h2 className="text-lg font-bold text-white uppercase tracking-wide">{text}</h2>
      </div>
      {extra || null}
    </div>
  );
}

function Card({ children, delay, className, color }: { children: React.ReactNode; delay?: number; className?: string; color?: string }) {
  return (
    <div
      className={`glass-card p-6 relative overflow-hidden ${className || ""}`}
      style={{ animation: `fadeUp 0.5s ease-out ${delay || 0}s both` }}
    >
      {color && <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl" style={{ background: `linear-gradient(to right, ${color}, ${color}66)` }} />}
      {children}
    </div>
  );
}

function KpiCard({ label, value, sub, accent, delay }: { label: string; value: string | number; sub?: string; accent: string; delay?: number }) {
  return (
    <div
      className="glass-card p-5 relative overflow-hidden border-l-4 flex-1 min-w-0"
      style={{ borderLeftColor: accent, animation: `fadeUp 0.5s ease-out ${delay || 0}s both` }}
    >
      <div className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">{label}</div>
      <div className="text-3xl font-extrabold font-mono" style={{ color: accent }}>{value}</div>
      {sub && <div className="text-sm text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

function PillToggle({ options, value, onChange }: { options: { id: string; label: string; icon?: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06]">
      {options.map(o => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`py-1.5 px-3.5 rounded-lg text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
            value === o.id
              ? "bg-violet-500/15 text-violet-300 border border-violet-500/30 shadow-lg shadow-violet-500/10"
              : "text-slate-500 hover:text-white border border-transparent hover:bg-white/5"
          }`}
        >
          {o.icon && o.icon + " "}{o.label}
        </button>
      ))}
    </div>
  );
}

function PratichePerse({ ko, nonPagate, label }: { ko: number; nonPagate: number; label?: string }) {
  const [exp, setExp] = useState(false);
  const tot = ko + nonPagate;
  return (
    <div
      onClick={() => setExp(p => !p)}
      className="p-4 rounded-xl cursor-pointer bg-rose-500/[0.06] border border-rose-500/[0.12] transition-all hover:bg-rose-500/[0.1]"
    >
      <div className="flex items-center gap-3">
        <span className="text-xl">🔴</span>
        <div className="flex-1">
          <div className="text-sm font-semibold text-rose-400">{label || "Pratiche Perse -- Ultimo Bimestre"}</div>
          <div className="text-sm text-slate-500 mt-0.5">KO + non pagate -- clicca per dettaglio</div>
        </div>
        <span className="text-2xl font-extrabold text-rose-400 font-mono">{tot}</span>
        <span className="text-sm text-slate-600 ml-1">{exp ? "▲" : "▼"}</span>
      </div>
      {exp && (
        <div className="mt-3 pt-3 border-t border-rose-500/10 grid grid-cols-2 gap-3">
          <div className="text-center p-3 rounded-xl bg-rose-500/[0.06]">
            <div className="text-2xl font-extrabold text-rose-400 font-mono">{ko}</div>
            <div className="text-sm font-semibold text-rose-400 mt-1">KO</div>
            <div className="text-sm text-slate-500 mt-0.5">Mai attivate</div>
          </div>
          <div className="text-center p-3 rounded-xl bg-amber-500/[0.06]">
            <div className="text-2xl font-extrabold text-amber-400 font-mono">{nonPagate}</div>
            <div className="text-sm font-semibold text-amber-400 mt-1">Non Pagate</div>
            <div className="text-sm text-slate-500 mt-0.5">Attivate ma perse</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── BLOCCO A: Target Aziendale con sottocategorie ─────────────

function BloccoA({ data, storeId }: { data: MockData; storeId: string | null }) {
  const glA = [1, 2, 3, 4, 5, 6];
  const gt = glMese(glA); const gp = glPass(glA, OGGI); const gr = glRim(glA, OGGI);
  const [collapsedAz, setCollapsedAz] = useState<string[]>([]);

  // Compute totals for KPI row
  let totalFattiAll = 0, totalTargetAll = 0;
  BRANDS.forEach(b => {
    const cats = BRAND_CATS_AZ[b.id] || [];
    cats.forEach(c => {
      totalTargetAll += (data.targetAzCat[b.id] && data.targetAzCat[b.id][c.id]) || 0;
      SELLERS.forEach(se => { totalFattiAll += (data.produzioneAzCat[se.id] && data.produzioneAzCat[se.id][b.id] && data.produzioneAzCat[se.id][b.id][c.id]) || 0; });
    });
  });
  const totalProjAll = proj(totalFattiAll, gp, gt);
  const totalPctAll = totalTargetAll > 0 ? Math.round((totalProjAll / totalTargetAll) * 100) : 0;
  const ritmoGlob = gr > 0 ? ((totalTargetAll - totalFattiAll) / gr).toFixed(1) : "0";

  return (
    <div className="space-y-6">
      <SectionTitle
        icon={<Target className="w-5 h-5" />}
        text="Target Aziendale -- Marzo 2026"
        extra={
          <div className="hidden sm:flex gap-2">
            <span className="text-sm text-slate-400 font-mono bg-white/[0.04] py-1.5 px-3 rounded-lg border border-white/[0.06]">{gp} giorni lavorati</span>
            <span className="text-sm text-slate-400 font-mono bg-white/[0.04] py-1.5 px-3 rounded-lg border border-white/[0.06]">{gr} rimasti</span>
          </div>
        }
      />

      {/* KPI Summary Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Produzione Totale" value={totalFattiAll} sub={`su ${totalTargetAll} target`} accent="#8b5cf6" delay={0.05} />
        <KpiCard label="Proiezione" value={totalPctAll + "%"} sub={`${totalProjAll} proiettati`} accent={stCol(totalPctAll)} delay={0.1} />
        <KpiCard label="Giorni Rimasti" value={gr} sub={`su ${gt} totali`} accent="#3b82f6" delay={0.15} />
        <KpiCard label="Ritmo Necessario" value={ritmoGlob + "/gg"} sub="per chiudere in target" accent="#c4a24a" delay={0.2} />
      </div>

      {/* Brand Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {BRANDS.map((b, idx) => {
          const cats = BRAND_CATS_AZ[b.id] || [];
          const isExp = collapsedAz.indexOf(b.id) < 0;

          let totFatti = 0, totTarget = 0;
          const catData = cats.map(c => {
            const target = (data.targetAzCat[b.id] && data.targetAzCat[b.id][c.id]) || 0;
            let fatti = 0;
            SELLERS.forEach(se => { fatti += (data.produzioneAzCat[se.id] && data.produzioneAzCat[se.id][b.id] && data.produzioneAzCat[se.id][b.id][c.id]) || 0; });
            totFatti += fatti; totTarget += target;
            const p = proj(fatti, gp, gt);
            const pct = target > 0 ? Math.round((p / target) * 100) : 0;
            return { cat: c, fatti, target, proiezione: p, pct };
          });

          const proiezione = proj(totFatti, gp, gt);
          const avgCatPct = catData.length > 0 ? Math.round(catData.reduce((s, cd) => s + Math.min(cd.pct, 100), 0) / catData.length) : 0;
          const col = stCol(avgCatPct);
          const ritmo = gr > 0 ? ((totTarget - totFatti) / gr).toFixed(1) : "0";
          const catInTarget = catData.filter(cd => cd.pct >= 100).length;

          let contribNeg: number | null = null;
          if (storeId) {
            let negFatti = 0;
            SELLERS.filter(se => se.store === storeId).forEach(se => {
              cats.forEach(c => { negFatti += (data.produzioneAzCat[se.id] && data.produzioneAzCat[se.id][b.id] && data.produzioneAzCat[se.id][b.id][c.id]) || 0; });
            });
            contribNeg = negFatti;
          }

          return (
            <Card key={b.id} delay={0.05 * idx + 0.25} color={b.color}>
              {/* Brand Header */}
              <div
                onClick={() => setCollapsedAz(prev => isExp ? [...prev, b.id] : prev.filter(x => x !== b.id))}
                className="cursor-pointer flex items-center gap-3 mb-4"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden border" style={{ backgroundColor: b.color + "15", borderColor: b.color + "30" }}>
                  <Image src={b.logo} alt={b.label} width={28} height={28} className="object-cover rounded-lg"/>
                </div>
                <span className="text-base font-bold flex-1" style={{ color: b.color }}>{b.label}</span>
                <span className="text-sm text-slate-500">{isExp ? "▲" : "▼"}</span>
              </div>

              {/* Main Percentage */}
              <div className="text-center mb-4">
                <div className="text-4xl font-extrabold font-mono leading-none" style={{ color: col }}>
                  <AnimNum target={avgCatPct} />%
                </div>
                <div className="text-sm text-slate-500 mt-2">
                  {catInTarget}/{cats.length} categorie in target
                </div>
              </div>

              {/* Progress Bar */}
              <DualBar actual={totFatti} projected={proiezione} max={totTarget} color={col} height={8} />
              <div className="flex justify-between mt-2">
                <span className="text-sm font-mono text-slate-300">{totFatti} fatti</span>
                <span className="text-sm font-mono font-semibold" style={{ color: col }}>{proiezione}/{totTarget}</span>
              </div>
              <div className="text-sm text-slate-500 mt-1">Ritmo: {ritmo}/gg</div>

              {contribNeg !== null && (
                <div className="text-sm font-semibold mt-2 pt-2 border-t border-white/5" style={{ color: b.color }}>
                  Il tuo negozio: {contribNeg}
                </div>
              )}

              {/* Category Breakdown */}
              {isExp && (
                <div className="mt-4 pt-4 border-t border-white/[0.06] space-y-3">
                  {catData.map(cd => (
                    <div key={cd.cat.id}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-slate-400 font-semibold">{cd.cat.label}</span>
                        <div className="flex gap-2 items-center">
                          <span className="text-sm font-mono text-slate-300">{cd.fatti}</span>
                          <span className="text-sm text-slate-600">→</span>
                          <span className="text-sm font-mono font-bold" style={{ color: stCol(cd.pct) }}>{cd.proiezione}/{cd.target}</span>
                        </div>
                      </div>
                      <DualBar actual={cd.fatti} projected={cd.proiezione} max={cd.target} color={stCol(cd.pct)} height={6} />
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── BLOCCO B: Target Negozio con sottocategorie ───────────────

function BloccoB({ data, storeId }: { data: MockData; storeId: string | null }) {
  const store = STORES.find(s => s.id === storeId);
  if (!store) return null;
  const gt = glMese(store.giorniLav); const gp = glPass(store.giorniLav, OGGI);
  const sellersNeg = SELLERS.filter(se => se.store === storeId);
  const [collapsedNeg, setCollapsedNeg] = useState<string[]>([]);
  const [teamExp, setTeamExp] = useState<string | null>(null);

  let totDaLav = 0, totWarn = 0, totKo = 0, totNP = 0;
  sellersNeg.forEach(se => { const c = data.criticita[se.id]; if (c) { totDaLav += c.daLavorare; totWarn += c.warning; totKo += c.koBimestre; totNP += c.nonPagateBimestre; } });

  const teamData = sellersNeg.map(se => {
    let fattiTot = 0;
    BRANDS.forEach(b => { fattiTot += (data.produzione[se.id] && data.produzione[se.id][b.id]) || 0; });
    const targetTot = data.targetPersonali[se.id].totale;
    const p = proj(fattiTot, gp, gt); const pct = targetTot > 0 ? Math.round((p / targetTot) * 100) : 0;
    return { seller: se, fatti: fattiTot, target: targetTot, proj: p, pct };
  }).sort((a, b) => a.pct - b.pct);

  return (
    <div className="space-y-6">
      <SectionTitle
        icon={<Store className="w-5 h-5" />}
        text={"Negozio " + store.name}
        extra={
          <span className="text-sm text-slate-400 bg-white/[0.04] py-1.5 px-3 rounded-lg border border-white/[0.06]">
            {store.tipo.toUpperCase()} -- {store.giorniLav.length === 6 ? "Lun-Sab" : "Lun-Ven"}
          </span>
        }
      />

      {/* B1: Brand targets con sottocategorie */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {BRANDS.map((b, idx) => {
          const cats = BRAND_CATS_NEG[b.id] || [];
          const isExp = collapsedNeg.indexOf(b.id) < 0;
          const catData = cats.map(c => {
            const target = (data.targetNegCat[storeId!] && data.targetNegCat[storeId!][b.id] && data.targetNegCat[storeId!][b.id][c.id]) || 0;
            let fatti = 0;
            sellersNeg.forEach(se => { fatti += (data.produzioneNegCat[se.id] && data.produzioneNegCat[se.id][b.id] && data.produzioneNegCat[se.id][b.id][c.id]) || 0; });
            const p = proj(fatti, gp, gt);
            const pct = target > 0 ? Math.round((p / target) * 100) : 0;
            return { cat: c, fatti, target, proiezione: p, pct };
          });
          const avgPct = catData.length > 0 ? Math.round(catData.reduce((sum, cd) => sum + Math.min(cd.pct, 100), 0) / catData.length) : 0;
          const col = stCol(avgPct);

          return (
            <Card key={b.id} delay={0.3 + idx * 0.04} color={b.color}>
              <div
                onClick={() => setCollapsedNeg(prev => isExp ? [...prev, b.id] : prev.filter(x => x !== b.id))}
                className="cursor-pointer flex items-center gap-3 mb-3"
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center overflow-hidden border" style={{ backgroundColor: b.color + "15", borderColor: b.color + "30" }}>
                  <Image src={b.logo} alt={b.label} width={24} height={24} className="object-cover rounded-lg"/>
                </div>
                <span className="text-base font-bold flex-1" style={{ color: b.color }}>{b.label}</span>
                <span className="text-sm text-slate-500">{isExp ? "▲" : "▼"}</span>
              </div>
              <div className="text-center mb-3">
                <div className="text-3xl font-extrabold font-mono" style={{ color: col }}>{avgPct}%</div>
                <div className="text-sm text-slate-500 mt-1">media {cats.length} categorie</div>
              </div>
              <div className="text-sm font-bold text-center mb-2" style={{ color: col }}>{stLbl(avgPct)}</div>
              {isExp && (
                <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-2">
                  {catData.map(cd => (
                    <div key={cd.cat.id}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-sm text-slate-400 font-semibold">{cd.cat.label}</span>
                        <div className="flex gap-1.5 items-center">
                          <span className="text-sm font-mono text-slate-300">{cd.fatti}</span>
                          <span className="text-sm text-slate-600">→</span>
                          <span className="text-sm font-mono font-bold" style={{ color: stCol(cd.pct) }}>{cd.proiezione}/{cd.target}</span>
                        </div>
                      </div>
                      <DualBar actual={cd.fatti} projected={cd.proiezione} max={cd.target} color={stCol(cd.pct)} height={5} />
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* B2 + B3 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Team Projection */}
        <Card delay={0.5}>
          <div className="text-sm text-slate-400 font-semibold uppercase tracking-wider mb-4">Team -- Proiezione Target</div>
          <div className="space-y-1">
            {teamData.map(td => {
              const col = stCol(td.pct);
              const isE = teamExp === td.seller.id;
              return (
                <div key={td.seller.id}>
                  <div
                    onClick={() => setTeamExp(isE ? null : td.seller.id)}
                    className={`flex items-center gap-2.5 py-2 px-3 rounded-xl cursor-pointer transition-all ${
                      td.pct < 80 ? "bg-rose-500/[0.04] hover:bg-rose-500/[0.08]" : "hover:bg-white/[0.03]"
                    }`}
                  >
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: col }} />
                    <span className="text-sm font-semibold text-slate-300 flex-1">{td.seller.name}</span>
                    <span className="text-sm font-mono text-slate-400">{td.fatti}</span>
                    <span className="text-sm text-slate-600">→</span>
                    <span className="text-sm font-mono font-semibold" style={{ color: col }}>{td.proj}/{td.target}</span>
                    <span className="text-sm font-bold w-10 text-right" style={{ color: col }}>{td.pct}%</span>
                    <span className="text-sm text-slate-600 ml-1">{isE ? "▲" : "▼"}</span>
                  </div>
                  {isE && (
                    <div className="py-3 px-3 pl-8">
                      <div className="flex items-center gap-2 mb-3 py-2 px-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                        <span className="text-sm text-slate-400">Target raggiunti:</span>
                        <span className="text-sm font-extrabold font-mono text-white">
                          {BRANDS.filter(b => {
                            const f = (data.produzione[td.seller.id] && data.produzione[td.seller.id][b.id]) || 0;
                            const t = (data.targetPersonali[td.seller.id] && data.targetPersonali[td.seller.id][b.id]) || 1;
                            return Math.round((proj(f, gp, gt) / t) * 100) >= 100;
                          }).length}/{BRANDS.length}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {BRANDS.map(b => {
                          const f = (data.produzione[td.seller.id] && data.produzione[td.seller.id][b.id]) || 0;
                          const t = (data.targetPersonali[td.seller.id] && data.targetPersonali[td.seller.id][b.id]) || 0;
                          const p = proj(f, gp, gt); const pc = t > 0 ? Math.round((p / t) * 100) : 100;
                          const reached = pc >= 100;
                          return (
                            <div key={b.id} className="flex items-center gap-2.5 py-1.5 border-b border-white/[0.03]">
                              <div className="w-5 h-5 rounded overflow-hidden shrink-0"><Image src={b.logo} alt={b.label} width={20} height={20} className="object-cover"/></div>
                              <span className="text-sm font-semibold w-16" style={{ color: b.color }}>{b.label}</span>
                              <span className="text-sm font-mono text-slate-300 w-8 text-center">{f}</span>
                              <span className="text-sm text-slate-600">→</span>
                              <span className="text-sm font-mono font-bold w-10 text-center" style={{ color: stCol(pc) }}>{p}/{t}</span>
                              <span className="text-sm w-5 text-center">{reached ? "✅" : pc >= 80 ? "⚠️" : "🔴"}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* Monitoring */}
        <Card delay={0.55}>
          <div className="text-sm text-slate-400 font-semibold uppercase tracking-wider mb-4">Monitoraggio Pratiche Negozio</div>
          <div className="space-y-3">
            <div className="flex items-center gap-4 p-4 rounded-xl bg-amber-500/[0.06] border border-amber-500/[0.12]">
              <span className="text-xl">📋</span>
              <div className="flex-1">
                <div className="text-sm font-semibold text-amber-400">Da Lavorare + Warning</div>
                <div className="text-sm text-slate-500 mt-0.5">{totDaLav} da lavorare -- {totWarn} in warning</div>
              </div>
              <span className="text-2xl font-extrabold text-amber-400 font-mono">{totDaLav + totWarn}</span>
            </div>
            <PratichePerse ko={totKo} nonPagate={totNP} label="Pratiche Perse -- Ultimo Bimestre" />
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── BLOCCO C: I miei dati ──────────────────────────────────────

function BloccoC({ data, sellerId, outbound, hideMonitoraggio, hideAppuntamenti, showAllClassifiche }: {
  data: MockData; sellerId: string; outbound: boolean;
  hideMonitoraggio?: boolean; hideAppuntamenti?: boolean; showAllClassifiche?: boolean;
}) {
  const seller = SELLERS.find(se => se.id === sellerId);
  if (!seller) return null;
  const sellerGL = getSellerGL(seller);
  const gt = glMese(sellerGL); const gp = glPass(sellerGL, OGGI);
  const tp = data.targetPersonali[sellerId];

  const brandStatus = BRANDS.map(b => {
    const f = (data.produzione[sellerId] && data.produzione[sellerId][b.id]) || 0;
    const t = tp[b.id] || 0; const p = proj(f, gp, gt); const pct = t > 0 ? Math.round((p / t) * 100) : 100;
    return { brand: b, fatti: f, target: t, proiezione: p, pct };
  });
  const inLinea = brandStatus.filter(bs => bs.pct >= 100).length;
  const aRischio = brandStatus.filter(bs => bs.pct >= 80 && bs.pct < 100).length;
  const sottoTono = brandStatus.filter(bs => bs.pct < 80).length;

  const myGroup = getSellerGroup(seller);
  const storeObj = STORES.find(st => st.id === seller.store);
  const peerSellers = myGroup === "pv"
    ? SELLERS.filter(se => { const so = STORES.find(st => st.id === se.store); return so && storeObj && so.tipo === storeObj.tipo; })
    : SELLER_GROUPS[myGroup];
  const brandSotto = brandStatus.filter(bs => bs.pct < 100);
  const [showConf, setShowConf] = useState(false);
  const confronti = brandSotto.map(bs => {
    const ranking = peerSellers.map(se => {
      const seGL = getSellerGL(se);
      const seGt = glMese(seGL); const seGp = glPass(seGL, OGGI);
      const f = (data.produzione[se.id] && data.produzione[se.id][bs.brand.id]) || 0;
      const t = (data.targetPersonali[se.id] && data.targetPersonali[se.id][bs.brand.id]) || 1;
      const p = proj(f, seGp, seGt); const pct = Math.round((p / t) * 100);
      return { seller: se, proj: p, pct };
    }).sort((a, bb) => bb.pct - a.pct);
    const meglio = ranking.find(r => r.seller.id !== sellerId && r.pct > bs.pct);
    return { brand: bs.brand, myPct: bs.pct, meglio };
  });

  const [classMode, setClassMode] = useState("fatturato");
  const [classGroup, setClassGroup] = useState(myGroup);
  const classGroupSellers = SELLER_GROUPS[classGroup] || [];
  const classData = classGroupSellers.map(se => {
    const seGL = getSellerGL(se);
    const seGt = glMese(seGL); const seGp = glPass(seGL, OGGI);
    return { seller: se, store: STORES.find(st => st.id === se.store), fattProj: getFattProj(se.id, data, seGp, seGt), avgPct: getAvgPct(se.id, data, seGp, seGt) };
  });
  const classSorted = classMode === "fatturato" ? classData.slice().sort((a, b) => b.fattProj - a.fattProj) : classData.slice().sort((a, b) => b.avgPct - a.avgPct);
  const myRank = classSorted.findIndex(r => r.seller.id === sellerId) + 1;

  const myCrit = data.criticita[sellerId] || { daLavorare: 0, warning: 0, koBimestre: 0, nonPagateBimestre: 0 };
  const negAppts: { ora: string; cliente: string; tipo: string; venditore?: string }[] = outbound
    ? (data.appuntamenti[sellerId] || [])
    : SELLERS.filter(se => se.store === seller.store)
        .reduce<{ ora: string; cliente: string; tipo: string; venditore?: string }[]>((acc, se) =>
          acc.concat((data.appuntamenti[se.id] || []).map(a => ({ ...a, venditore: se.name }))), [])
        .sort((a, b) => a.ora.localeCompare(b.ora)).slice(0, 5);

  return (
    <div className="space-y-6">
      <SectionTitle icon={<User className="w-5 h-5" />} text={"I Miei Dati -- " + seller.name} />

      {/* Status Cards Row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { n: inLinea, l: "In linea", tw: "emerald" },
          { n: aRischio, l: "A rischio", tw: "amber" },
          { n: sottoTono, l: "Sotto tono", tw: "rose" },
        ].map(item => (
          <div key={item.l} className={`glass-card p-5 text-center border-t-2 border-${item.tw}-500`}>
            <div className={`text-3xl font-extrabold font-mono text-${item.tw}-400`}>{item.n}</div>
            <div className={`text-sm font-semibold text-${item.tw}-400 mt-1`}>{item.l}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* C1: Target Proiezione */}
        <Card delay={0.6}>
          <div className="text-sm text-slate-400 font-semibold uppercase tracking-wider mb-4">I Miei Target -- Proiezione</div>
          <div className="space-y-3">
            {brandStatus.map(bs => {
              const col = stCol(bs.pct);
              return (
                <div key={bs.brand.id}>
                  <div className="flex items-center gap-2.5 mb-1">
                    <div className="w-5 h-5 rounded overflow-hidden shrink-0"><Image src={bs.brand.logo} alt={bs.brand.label} width={20} height={20} className="object-cover"/></div>
                    <span className="text-sm text-slate-400 font-semibold w-16">{bs.brand.label}</span>
                    <span className="text-sm font-mono text-white w-14 text-center">{bs.fatti} fatti</span>
                    <span className="text-sm text-slate-600">→</span>
                    <span className="text-sm font-mono font-bold w-14 text-center" style={{ color: col }}>{bs.proiezione}/{bs.target}</span>
                  </div>
                  <DualBar actual={bs.fatti} projected={bs.proiezione} max={bs.target} color={col} height={7} />
                </div>
              );
            })}
          </div>
          {confronti.length > 0 && (
            <div className="mt-4">
              <button
                onClick={() => setShowConf(p => !p)}
                className={`w-full p-3 rounded-xl cursor-pointer text-sm font-semibold transition-all border ${
                  showConf
                    ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                    : "bg-white/[0.03] border-white/[0.06] text-slate-500 hover:text-white hover:bg-white/[0.05]"
                }`}
              >
                {showConf ? "▲ Chiudi confronto" : "👀 Guarda chi sta facendo meglio di te"}
              </button>
              {showConf && (
                <div className="mt-3 space-y-2">
                  {confronti.map(c => (
                    <div key={c.brand.id} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="w-5 h-5 rounded overflow-hidden shrink-0"><Image src={c.brand.logo} alt={c.brand.label} width={20} height={20} className="object-cover"/></div>
                        <span className="text-sm font-bold" style={{ color: c.brand.color }}>{c.brand.label}</span>
                        <span className="text-sm ml-auto font-semibold" style={{ color: stCol(c.myPct) }}>{stEmoji(c.myPct)} Tu: {c.myPct}%</span>
                      </div>
                      {c.meglio
                        ? <div className="text-sm text-emerald-400">📈 <strong>{c.meglio.seller.name}</strong> ({(STORES.find(st => st.id === c.meglio!.seller.store) || {} as { name?: string }).name || getGroupLabel(getSellerGroup(c.meglio.seller))}) proietta {c.meglio.pct}%</div>
                        : <div className="text-sm text-slate-500">Nessuno proietta meglio</div>
                      }
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>

        {/* C2: Classifica */}
        <Card delay={0.65}>
          {showAllClassifiche && (
            <div className="mb-4">
              <PillToggle
                options={[
                  { id: "pv", label: "PV", icon: "" },
                  { id: "cc", label: "CC", icon: "" },
                  { id: "ob", label: "OB", icon: "" },
                ]}
                value={classGroup}
                onChange={setClassGroup}
              />
            </div>
          )}
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-slate-400 font-semibold uppercase tracking-wider">{getGroupLabel(classGroup)}</div>
            <PillToggle
              options={[
                { id: "fatturato", label: "Fatturato", icon: "" },
                { id: "target", label: "% Target", icon: "" },
              ]}
              value={classMode}
              onChange={setClassMode}
            />
          </div>
          <div
            className={`text-center py-3 mb-4 rounded-xl border ${
              myRank <= 3
                ? "bg-emerald-500/[0.06] border-emerald-500/[0.12]"
                : "bg-white/[0.02] border-white/[0.04]"
            }`}
          >
            <span className="text-sm text-slate-400">La tua posizione: </span>
            <span className="text-xl font-extrabold font-mono" style={{ color: myRank <= 3 ? "#6aaa7a" : "#c4a24a" }}>{myRank}°</span>
            <span className="text-sm text-slate-500"> su {classSorted.length}</span>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {classSorted.map((r, ri) => {
              const medals = ["🥇", "🥈", "🥉"];
              const isMe = r.seller.id === sellerId;
              return (
                <div
                  key={r.seller.id}
                  className={`flex items-center gap-2.5 py-2 px-3 rounded-xl transition-colors ${
                    isMe ? "bg-blue-500/[0.08] border border-blue-500/[0.15]" : "hover:bg-white/[0.02]"
                  }`}
                >
                  <span className="text-sm w-6 text-center">{ri < 3 ? medals[ri] : (ri + 1) + "."}</span>
                  <span className={`text-sm flex-1 ${isMe ? "font-bold text-blue-400" : "font-medium text-slate-300"}`}>{r.seller.name}</span>
                  <span className="text-sm text-slate-500">{r.store ? r.store.name : getGroupLabel(getSellerGroup(r.seller))}</span>
                  <span className={`text-sm font-bold font-mono w-16 text-right ${isMe ? "text-blue-400" : "text-slate-400"}`}>
                    {classMode === "fatturato" ? "€" + Math.round(r.fattProj / 1000) + "k" : r.avgPct + "%"}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* C3 + C4 (condizionali) */}
      {(!hideMonitoraggio || !hideAppuntamenti) && (
        <div className={`grid gap-4 grid-cols-1 ${hideMonitoraggio || hideAppuntamenti ? "" : "lg:grid-cols-2"}`}>
          {!hideMonitoraggio && (
            <Card delay={0.7}>
              <div className="text-sm text-slate-400 font-semibold uppercase tracking-wider mb-4">Monitoraggio Pratiche</div>
              <div className="space-y-3">
                <div className="p-5 rounded-xl text-center bg-amber-500/[0.06] border border-amber-500/[0.12]">
                  <div className="text-3xl font-extrabold text-amber-400 font-mono">{myCrit.warning + myCrit.daLavorare}</div>
                  <div className="text-sm font-semibold text-amber-400 mt-1">Da Lavorare + Warning</div>
                  <div className="text-sm text-slate-500 mt-2 cursor-pointer hover:text-violet-400 transition-colors">Vai al Tracking PDA →</div>
                </div>
                <PratichePerse ko={myCrit.koBimestre} nonPagate={myCrit.nonPagateBimestre} label="Le Mie Pratiche Perse -- Ultimo Bimestre" />
              </div>
            </Card>
          )}
          {!hideAppuntamenti && (
            <Card delay={0.75}>
              <div className="text-sm text-slate-400 font-semibold uppercase tracking-wider mb-4">
                {outbound ? "I Miei Appuntamenti Oggi" : "Appuntamenti Negozio Oggi"}
              </div>
              {negAppts.length === 0 ? (
                <div className="text-center py-8 text-slate-600 text-sm">Nessun appuntamento oggi</div>
              ) : (
                <div className="space-y-1.5">
                  {negAppts.map((a, ai) => (
                    <div key={ai} className="flex items-center gap-3 py-2.5 px-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                      <div className="w-1.5 h-8 rounded-full bg-blue-500/40" />
                      <span className="text-sm font-bold text-blue-400 font-mono w-12">{a.ora}</span>
                      <span className="text-sm text-slate-300 flex-1">{a.cliente}</span>
                      {a.venditore && <span className="text-sm text-slate-500">{a.venditore}</span>}
                      <span className="text-sm py-1 px-2.5 rounded-lg bg-blue-500/10 text-blue-400 font-semibold border border-blue-500/20">{a.tipo}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="text-sm text-violet-400 mt-4 cursor-pointer text-right hover:text-violet-300 transition-colors">Vedi calendario →</div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ─── BLOCCO D+E: Admin ──────────────────────────────────────────

function BloccoDE({ data }: { data: MockData }) {
  const piste = BRANDS.map(b => {
    const negData = STORES.map(st => {
      const gt = glMese(st.giorniLav); const gp = glPass(st.giorniLav, OGGI);
      const cats = BRAND_CATS_NEG[b.id] || [];
      let totF = 0, totT = 0;
      cats.forEach(c => {
        const t = (data.targetNegCat[st.id] && data.targetNegCat[st.id][b.id] && data.targetNegCat[st.id][b.id][c.id]) || 0;
        let f = 0;
        SELLERS.filter(se => se.store === st.id).forEach(se => { f += (data.produzioneNegCat[se.id] && data.produzioneNegCat[se.id][b.id] && data.produzioneNegCat[se.id][b.id][c.id]) || 0; });
        totF += f; totT += t;
      });
      const p = proj(totF, gp, gt);
      const pct = totT > 0 ? Math.round((p / totT) * 100) : 100;
      return { store: st, proj: p, target: totT, pct };
    }).sort((a, bb) => a.pct - bb.pct);
    return { brand: b, sottoTono: negData.filter(n => n.pct < 80) };
  });

  const critMap = STORES.map(st => {
    let daLav = 0, warn = 0, perse = 0;
    SELLERS.filter(se => se.store === st.id).forEach(se => {
      const c = data.criticita[se.id];
      if (c) { daLav += c.daLavorare; warn += c.warning; perse += c.koBimestre + c.nonPagateBimestre; }
    });
    return { store: st, daLav, warn, perse, tot: daLav + warn + perse };
  }).sort((a, b) => b.tot - a.tot);

  return (
    <div className="space-y-8">
      {/* Piste */}
      <div>
        <SectionTitle icon={<AlertTriangle className="w-5 h-5" />} text="Piste -- Negozi Sotto Tono (Proiezione)" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {piste.map((p, pi) => (
            <Card key={p.brand.id} delay={0.8 + pi * 0.04} color={p.brand.color}>
              <div className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: p.brand.color }}>
                <div className="w-5 h-5 rounded overflow-hidden shrink-0 inline-block"><Image src={p.brand.logo} alt={p.brand.label} width={20} height={20} className="object-cover"/></div> {p.brand.label}
              </div>
              {p.sottoTono.length === 0 ? (
                <div className="text-sm text-emerald-400 font-semibold flex items-center gap-2">✅ Tutti in linea</div>
              ) : (
                <div className="space-y-2">
                  {p.sottoTono.slice(0, 3).map(n => (
                    <div key={n.store.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-rose-500/[0.04]">
                      <span className="text-sm text-rose-400 font-medium">{n.store.name}</span>
                      <span className="text-sm font-bold text-rose-400 font-mono">{n.pct}%</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>

      {/* Mappa Criticita */}
      <div>
        <SectionTitle icon={<FileWarning className="w-5 h-5" />} text="Mappa Criticità -- Ultimo Bimestre" />
        <Card delay={1.0}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm min-w-[500px]">
              <thead>
                <tr>
                  {["Negozio", "Da Lavorare", "Warning", "Pratiche Perse", "Totale"].map(h => (
                    <th key={h} className="text-left py-3 px-4 text-slate-400 border-b border-white/[0.08] text-sm font-semibold uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {critMap.map(cm => (
                  <tr key={cm.store.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-300">{cm.store.name}</td>
                    <td className="py-3 px-4 font-mono" style={{ color: cm.daLav > 0 ? "#c4a24a" : "#334155" }}>{cm.daLav}</td>
                    <td className="py-3 px-4 font-mono" style={{ color: cm.warn > 0 ? "#c4a24a" : "#334155" }}>{cm.warn}</td>
                    <td className="py-3 px-4 font-mono" style={{ color: cm.perse > 0 ? "#c46a6a" : "#334155" }}>{cm.perse}</td>
                    <td className="py-3 px-4 font-mono font-bold" style={{ color: cm.tot > 5 ? "#c46a6a" : cm.tot > 0 ? "#c4a24a" : "#6aaa7a" }}>{cm.tot}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── BLOCCO C ADMIN: Visione globale ────────────────────────────

function BloccoCAdmin({ data }: { data: MockData }) {
  const [apptView, setApptView] = useState<"negozi" | "agenti">("negozi");
  const [pratView, setPratView] = useState<"lavorare" | "perse">("lavorare");

  const apptPerNegozio = STORES.map(st => {
    let count = 0;
    SELLERS.filter(se => se.store === st.id).forEach(se => { count += (data.appuntamenti[se.id] || []).length; });
    return { store: st, count };
  }).sort((a, b) => b.count - a.count);
  const maxApptNeg = Math.max(1, ...apptPerNegozio.map(a => a.count));
  const totAppt = apptPerNegozio.reduce((s, a) => s + a.count, 0);

  const apptPerAgente = SELLERS.filter(se => (data.appuntamenti[se.id] || []).length > 0).map(se => ({
    seller: se,
    store: STORES.find(st => st.id === se.store),
    count: (data.appuntamenti[se.id] || []).length,
  })).sort((a, b) => b.count - a.count);
  const maxApptAg = Math.max(1, ...apptPerAgente.map(a => a.count));

  const pratichePerNeg = STORES.map(st => {
    let daLav = 0, warn = 0, perse = 0;
    SELLERS.filter(se => se.store === st.id).forEach(se => {
      const c = data.criticita[se.id];
      if (c) { daLav += c.daLavorare; warn += c.warning; perse += c.koBimestre + c.nonPagateBimestre; }
    });
    return { store: st, daLav, warn, perse, tot: daLav + warn + perse };
  }).sort((a, b) => b.tot - a.tot);

  return (
    <div className="space-y-6">
      <SectionTitle icon={<BarChart3 className="w-5 h-5" />} text="Panoramica Operativa" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Appuntamenti globali */}
        <Card delay={0.7}>
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-sm text-slate-400 font-semibold uppercase tracking-wider">Appuntamenti Oggi</div>
              <div className="text-2xl font-extrabold text-blue-400 font-mono mt-1">{totAppt} totali</div>
            </div>
            <PillToggle
              options={[
                { id: "negozi", label: "Punti Vendita", icon: "" },
                { id: "agenti", label: "Agenti", icon: "" },
              ]}
              value={apptView}
              onChange={(v) => setApptView(v as "negozi" | "agenti")}
            />
          </div>
          {apptView === "negozi" ? (
            <div className="space-y-1.5">
              {apptPerNegozio.map(a => (
                <div key={a.store.id} className="flex items-center gap-3 py-1.5">
                  <span className="text-sm text-slate-400 w-24 font-medium">{a.store.name}</span>
                  <div className="flex-1 h-5 bg-white/[0.04] rounded-lg overflow-hidden relative">
                    <div
                      className="h-full rounded-lg flex items-center justify-end pr-2 transition-all duration-700"
                      style={{ width: (a.count / maxApptNeg * 100) + "%", backgroundColor: "rgba(59,130,246,0.4)" }}
                    >
                      {a.count > 0 && <span className="text-sm text-white font-mono font-bold">{a.count}</span>}
                    </div>
                  </div>
                  {a.count === 0 && <span className="text-sm text-slate-700 font-mono w-4">0</span>}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-1.5">
              {apptPerAgente.slice(0, 10).map(a => (
                <div key={a.seller.id} className="flex items-center gap-3 py-1.5">
                  <span className="text-sm text-slate-300 w-24 font-medium">{a.seller.name}</span>
                  <span className="text-sm text-slate-500 w-20">{a.store?.name}</span>
                  <div className="flex-1 h-5 bg-white/[0.04] rounded-lg overflow-hidden">
                    <div
                      className="h-full rounded-lg flex items-center justify-end pr-2 transition-all duration-700"
                      style={{ width: (a.count / maxApptAg * 100) + "%", backgroundColor: "rgba(16,185,129,0.4)" }}
                    >
                      <span className="text-sm text-white font-mono font-bold">{a.count}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Monitoraggio pratiche globale */}
        <Card delay={0.75}>
          <div className="flex items-center justify-between mb-5">
            <div className="text-sm text-slate-400 font-semibold uppercase tracking-wider">Monitoraggio Pratiche -- Tutti i Negozi</div>
            <PillToggle
              options={[
                { id: "lavorare", label: "Da Lavorare", icon: "" },
                { id: "perse", label: "Perse", icon: "" },
              ]}
              value={pratView}
              onChange={(v) => setPratView(v as "lavorare" | "perse")}
            />
          </div>
          {pratView === "lavorare" ? (
            <div>
              <div className="space-y-1.5">
                {pratichePerNeg.slice().sort((a, b) => (b.daLav + b.warn) - (a.daLav + a.warn)).map(p => {
                  const val = p.daLav + p.warn;
                  const maxVal = Math.max(1, ...pratichePerNeg.map(x => x.daLav + x.warn));
                  return (
                    <div key={p.store.id} className="flex items-center gap-3 py-1">
                      <span className="text-sm text-slate-400 w-24 font-medium">{p.store.name}</span>
                      <div className="flex-1 flex gap-0.5 h-4">
                        {p.daLav > 0 && <div className="rounded transition-all duration-700 bg-amber-500" style={{ width: (p.daLav / maxVal * 100) + "%" }} />}
                        {p.warn > 0 && <div className="rounded transition-all duration-700 bg-orange-500" style={{ width: (p.warn / maxVal * 100) + "%" }} />}
                      </div>
                      <span className="text-sm font-mono w-6 text-right font-bold" style={{ color: val > 3 ? "#c4a24a" : val > 0 ? "#c4a24a" : "#6aaa7a" }}>{val}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-4 mt-3 pt-3 border-t border-white/[0.04]">
                {[{ c: "bg-amber-500", l: "Da Lavorare" }, { c: "bg-orange-500", l: "Warning" }].map(item => (
                  <div key={item.l} className="flex items-center gap-1.5">
                    <div className={`w-3 h-2 rounded-sm ${item.c}`} />
                    <span className="text-sm text-slate-500">{item.l}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <div className="space-y-1.5">
                {pratichePerNeg.slice().sort((a, b) => b.perse - a.perse).map(p => {
                  const maxPerse = Math.max(1, ...pratichePerNeg.map(x => x.perse));
                  return (
                    <div key={p.store.id} className="flex items-center gap-3 py-1">
                      <span className="text-sm text-slate-400 w-24 font-medium">{p.store.name}</span>
                      <div className="flex-1 h-4 bg-white/[0.04] rounded overflow-hidden">
                        <div className="h-full rounded transition-all duration-700 bg-rose-500" style={{ width: (p.perse / maxPerse * 100) + "%" }} />
                      </div>
                      <span className="text-sm font-mono w-6 text-right font-bold" style={{ color: p.perse > 3 ? "#c46a6a" : p.perse > 0 ? "#c4a24a" : "#6aaa7a" }}>{p.perse}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-4 mt-3 pt-3 border-t border-white/[0.04]">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-2 rounded-sm bg-rose-500" />
                  <span className="text-sm text-slate-500">KO + Non Pagate (ultimo bimestre)</span>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ─── BLOCCO OB: Dashboard Outbound ──────────────────────────────

const SOGLIE = [
  { min: 0, max: 200, pay: 6, label: "Soglia 1" },
  { min: 200, max: 300, pay: 7, label: "Soglia 2" },
  { min: 300, max: 400, pay: 8.5, label: "Soglia 3" },
  { min: 400, max: 500, pay: 10, label: "Soglia 4" },
  { min: 500, max: 9999, pay: 12, label: "Soglia 5" },
];

function getSoglia(punti: number) {
  for (let i = SOGLIE.length - 1; i >= 0; i--) { if (punti >= SOGLIE[i].min) return SOGLIE[i]; }
  return SOGLIE[0];
}

function getGuadagno(punti: number) {
  const s = getSoglia(punti);
  return punti * s.pay;
}

function BloccoOB({ data, sellerId, isDirector }: { data: MockData; sellerId: string; isDirector: boolean }) {
  const seller = SELLERS.find(se => se.id === sellerId);
  if (!seller) return null;
  const gl = getSellerGL(seller);
  const gt = glMese(gl); const gp = glPass(gl, OGGI); const gr = glRim(gl, OGGI);

  const fatturato = data.fatturato[sellerId] || 0;
  const fattProj = proj(fatturato, gp, gt);
  const fattTarget = Math.round(4500 + fatturato * 0.3);
  const fattPct = fattTarget > 0 ? Math.round((fattProj / fattTarget) * 100) : 0;
  const fattGap = Math.max(0, fattTarget - fattProj);
  const fattRitmo = gr > 0 ? Math.round(fattGap / gr) : 0;

  let puntiAttuali = 0;
  const brandPunti = BRANDS.map(b => {
    const f = (data.produzione[sellerId] && data.produzione[sellerId][b.id]) || 0;
    const pts = f * 10;
    puntiAttuali += pts;
    return { brand: b, punti: pts, consumer: Math.round(pts * 0.6), business: Math.round(pts * 0.4) };
  }).filter(bp => bp.punti > 0);
  const puntiProj = proj(puntiAttuali, gp, gt);
  const sogliaAttuale = getSoglia(puntiAttuali);
  const sogliaProj = getSoglia(puntiProj);
  const guadagnoProj = getGuadagno(puntiProj);
  const totBrandPunti = brandPunti.reduce((s, bp) => s + bp.punti, 0) || 1;

  const nextSogliaIdx = SOGLIE.findIndex(s => s.label === sogliaProj.label) + 1;
  const nextSoglia = nextSogliaIdx < SOGLIE.length ? SOGLIE[nextSogliaIdx] : null;
  const puntiToNext = nextSoglia ? nextSoglia.min - puntiProj : 0;
  const moneyShift = nextSoglia ? (puntiProj * nextSoglia.pay) - guadagnoProj : 0;

  const pratiche = { inviate: Math.round(puntiAttuali / 8), inLavorazione: Math.round(puntiAttuali / 15), inAttesa: 3, conProblema: 1 };

  const mood = fattPct >= 100 ? { emoji: "🔥", msg: "Stai spaccando! Sopra target.", col: "#6aaa7a" }
    : fattPct >= 85 ? { emoji: "💪", msg: "Quasi! Mancano €" + fattGap.toLocaleString() + " -- spingi!", col: "#c4a24a" }
    : fattPct >= 60 ? { emoji: "⚡", msg: "Sveglia! Servono €" + fattRitmo.toLocaleString() + "/gg per chiudere.", col: "#c4a24a" }
    : { emoji: "🚨", msg: "Allarme rosso. €" + fattRitmo.toLocaleString() + "/gg da oggi o non chiudi.", col: "#c46a6a" };

  const obSellers = SELLER_GROUPS.ob || [];
  const [classMode, setClassMode] = useState("fatturato");
  const classData = obSellers.map(se => {
    const seGL = getSellerGL(se);
    const seGt = glMese(seGL); const seGp = glPass(seGL, OGGI);
    return { seller: se, fattProj: getFattProj(se.id, data, seGp, seGt), avgPct: getAvgPct(se.id, data, seGp, seGt) };
  });
  const classSorted = classMode === "fatturato" ? classData.slice().sort((a, b) => b.fattProj - a.fattProj) : classData.slice().sort((a, b) => b.avgPct - a.avgPct);
  const myRank = classSorted.findIndex(r => r.seller.id === sellerId) + 1;

  const [dirExp, setDirExp] = useState<string | null>(null);
  const teamOB = isDirector ? obSellers.map(se => {
    let pts = 0;
    const seBrands = BRANDS.map(b => {
      const f = (data.produzione[se.id] && data.produzione[se.id][b.id]) || 0;
      const p = f * 10; pts += p;
      return { brand: b, punti: p, consumer: Math.round(p * 0.6), business: Math.round(p * 0.4) };
    });
    const seGL = getSellerGL(se); const seGt = glMese(seGL); const seGp = glPass(seGL, OGGI);
    return { seller: se, punti: pts, puntiProj: proj(pts, seGp, seGt), soglia: getSoglia(proj(pts, seGp, seGt)), fattProj: proj(data.fatturato[se.id] || 0, seGp, seGt), brands: seBrands };
  }).sort((a, b) => b.puntiProj - a.puntiProj) : [];

  return (
    <div className="space-y-6">
      <SectionTitle icon={<Car className="w-5 h-5" />} text={isDirector ? "Outbound -- Panoramica Team" : "I Miei Risultati"} />

      {/* Director team */}
      {isDirector && (
        <Card delay={0.1}>
          <div className="text-sm text-slate-400 font-semibold uppercase tracking-wider mb-4">Team Agenti -- Clicca per dettaglio</div>
          <div className="space-y-1">
            {teamOB.map((td, ti) => {
              const medals = ["🥇", "🥈", "🥉"];
              const isMe = td.seller.id === sellerId;
              const isE = dirExp === td.seller.id;
              const tdTot = td.brands.reduce((s, bp) => s + bp.punti, 0) || 1;
              return (
                <div key={td.seller.id}>
                  <div
                    onClick={() => setDirExp(isE ? null : td.seller.id)}
                    className={`flex items-center gap-3 py-3 px-4 rounded-xl cursor-pointer transition-all ${
                      isE ? "bg-white/[0.04]" : isMe ? "bg-blue-500/[0.06]" : ti % 2 === 0 ? "bg-white/[0.015]" : ""
                    } hover:bg-white/[0.06]`}
                  >
                    <span className="text-sm w-6">{ti < 3 ? medals[ti] : (ti + 1) + "."}</span>
                    <span className={`text-sm flex-1 ${isMe ? "font-bold text-blue-400" : "font-medium text-slate-300"}`}>{td.seller.name}</span>
                    <div className="text-center w-20">
                      <div className="text-sm font-extrabold font-mono" style={{ color: td.soglia.pay >= 10 ? "#6aaa7a" : td.soglia.pay >= 8 ? "#c4a24a" : "#ccc" }}>{td.puntiProj} pt</div>
                      <div className="text-sm text-slate-500">{td.soglia.label}</div>
                    </div>
                    <div className="text-right w-16">
                      <div className="text-sm font-bold text-blue-400 font-mono">€{Math.round(td.fattProj / 1000)}k</div>
                      <div className="text-sm text-slate-500">fatt.</div>
                    </div>
                    <span className="text-sm text-slate-600 ml-1">{isE ? "▲" : "▼"}</span>
                  </div>
                  {isE && (
                    <div className="py-4 px-4 sm:pl-12 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <div className="text-sm text-slate-400 font-semibold mb-2 uppercase tracking-wider">Punti per Brand</div>
                        <div className="space-y-1">
                          {td.brands.filter(bp => bp.punti > 0).map(bp => (
                            <div key={bp.brand.id} className="flex items-center gap-2 py-1">
                              <div className="w-5 h-5 rounded overflow-hidden shrink-0"><Image src={bp.brand.logo} alt={bp.brand.label} width={20} height={20} className="object-cover"/></div>
                              <span className="text-sm w-14 font-semibold" style={{ color: bp.brand.color }}>{bp.brand.label}</span>
                              <div className="flex-1 h-3 bg-white/[0.04] rounded overflow-hidden">
                                <div className="h-full rounded opacity-50" style={{ width: Math.round(bp.punti / tdTot * 100) + "%", backgroundColor: bp.brand.color }} />
                              </div>
                              <span className="text-sm font-mono text-slate-400 w-10 text-right">{bp.punti}pt</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-slate-400 font-semibold mb-2 uppercase tracking-wider">Consumer vs Business</div>
                        <div className="space-y-1">
                          {td.brands.filter(bp => bp.punti > 0).map(bp => {
                            const totBP = bp.consumer + bp.business || 1;
                            return (
                              <div key={bp.brand.id} className="flex items-center gap-2 py-1">
                                <div className="w-5 h-5 rounded overflow-hidden shrink-0"><Image src={bp.brand.logo} alt={bp.brand.label} width={20} height={20} className="object-cover"/></div>
                                <div className="flex-1 h-3 flex rounded overflow-hidden">
                                  <div className="h-full bg-blue-400" style={{ width: Math.round(bp.consumer / totBP * 100) + "%" }} />
                                  <div className="h-full bg-amber-500" style={{ width: Math.round(bp.business / totBP * 100) + "%" }} />
                                </div>
                                <span className="text-sm text-blue-400 w-6 text-right font-mono">{bp.consumer}</span>
                                <span className="text-sm text-amber-400 w-6 text-right font-mono">{bp.business}</span>
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex gap-4 mt-2">
                          <div className="flex items-center gap-1.5"><div className="w-2.5 h-1.5 rounded-sm bg-blue-400" /><span className="text-sm text-slate-500">Consumer</span></div>
                          <div className="flex items-center gap-1.5"><div className="w-2.5 h-1.5 rounded-sm bg-amber-500" /><span className="text-sm text-slate-500">Business</span></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ROW 1: Fatturato + Punti/Soglie */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card delay={0.2} className="border-l-4" color={mood.col}>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-slate-400 font-semibold uppercase tracking-wider">Fatturato</div>
            <span className="text-xl">{mood.emoji}</span>
          </div>
          <div className="p-3 rounded-xl mb-4" style={{ backgroundColor: mood.col + "12", border: "1px solid " + mood.col + "25" }}>
            <div className="text-sm font-bold" style={{ color: mood.col }}>{mood.msg}</div>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { label: "TARGET", value: "€" + fattTarget.toLocaleString(), col: "#fff", bg: "bg-white/[0.03]" },
              { label: "ATTUALE", value: "€" + fatturato.toLocaleString(), col: "#ccc", bg: "bg-white/[0.03]" },
              { label: "PROIEZIONE", value: "€" + fattProj.toLocaleString(), col: mood.col, bg: "" },
            ].map(item => (
              <div key={item.label} className={`p-3 rounded-xl text-center ${item.bg}`} style={!item.bg ? { backgroundColor: mood.col + "10" } : {}}>
                <div className="text-sm font-semibold uppercase mb-1 text-slate-500">{item.label}</div>
                <div className="text-lg font-extrabold font-mono" style={{ color: item.col }}>{item.value}</div>
              </div>
            ))}
          </div>
          <DualBar actual={fatturato} projected={fattProj} max={fattTarget} color={mood.col} height={10} />
          <div className="flex justify-between mt-2">
            <span className="text-sm font-bold" style={{ color: mood.col }}>{fattPct}% del target</span>
            {fattGap > 0 && <span className="text-sm text-slate-500">Gap: €{fattGap.toLocaleString()}</span>}
          </div>
        </Card>

        <Card delay={0.25}>
          <div className="text-sm text-slate-400 font-semibold uppercase tracking-wider mb-4">Punti &amp; Soglie</div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="p-4 rounded-xl bg-white/[0.03] text-center border border-white/[0.06]">
              <div className="text-sm text-slate-500 uppercase font-semibold mb-1">Attuali</div>
              <div className="text-2xl font-extrabold text-white font-mono">{puntiAttuali}</div>
              <div className="text-sm text-slate-500 mt-1">{sogliaAttuale.label} -- €{sogliaAttuale.pay}/pt</div>
            </div>
            <div
              className="p-4 rounded-xl text-center border"
              style={{
                backgroundColor: sogliaProj.pay >= 10 ? "rgba(16,185,129,0.08)" : "rgba(245,158,11,0.08)",
                borderColor: sogliaProj.pay >= 10 ? "rgba(16,185,129,0.2)" : "rgba(245,158,11,0.2)",
              }}
            >
              <div className="text-sm uppercase font-semibold mb-1" style={{ color: sogliaProj.pay >= 10 ? "#6aaa7a" : "#c4a24a" }}>Proiezione</div>
              <div className="text-2xl font-extrabold font-mono" style={{ color: sogliaProj.pay >= 10 ? "#6aaa7a" : "#c4a24a" }}>{puntiProj}</div>
              <div className="text-sm font-semibold mt-1" style={{ color: sogliaProj.pay >= 10 ? "#6aaa7a" : "#c4a24a" }}>{sogliaProj.label} -- €{sogliaProj.pay}/pt</div>
            </div>
          </div>
          {nextSoglia ? (
            <div className="p-3 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/[0.15] mb-4">
              <div className="text-sm font-bold text-emerald-400">🎯 Ti mancano {puntiToNext} pt per {nextSoglia.label}</div>
              <div className="text-sm text-slate-500 mt-1">
                Saliresti a €{nextSoglia.pay}/pt retroattivo:{" "}
                <span className="font-extrabold text-emerald-400 font-mono">+€{Math.round(moneyShift).toLocaleString()} in più!</span>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-emerald-500/[0.06] text-center mb-4 border border-emerald-500/[0.15]">
              <span className="text-sm text-emerald-400 font-bold">🏆 Soglia massima!</span>
            </div>
          )}
          <div className="space-y-1">
            {SOGLIE.map((sg, si) => {
              const isActive = sogliaProj.label === sg.label;
              const isPast = puntiProj >= sg.max;
              return (
                <div key={si} className={`flex items-center gap-2 py-1.5 px-3 rounded-lg ${isActive ? "bg-emerald-500/[0.08]" : ""}`}>
                  <div className={`w-2.5 h-2.5 rounded-full ${isPast ? "bg-emerald-500" : isActive ? "bg-amber-500" : "bg-slate-700"}`} />
                  <span className={`text-sm flex-1 ${isActive ? "text-white font-bold" : "text-slate-500"}`}>
                    {sg.label}: {sg.min}-{sg.max === 9999 ? "∞" : sg.max} pt
                  </span>
                  <span className={`text-sm font-mono ${isActive ? "text-emerald-400 font-bold" : "text-slate-600"}`}>€{sg.pay}/pt</span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-4 border-t border-white/5 text-center">
            <span className="text-sm text-slate-500">Guadagno proj.: </span>
            <span className="text-lg font-extrabold text-emerald-400 font-mono">€{guadagnoProj.toLocaleString()}</span>
          </div>
        </Card>
      </div>

      {/* ROW 2: Brand Breakdown + Classifica */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card delay={0.35}>
          <div className="text-sm text-slate-400 font-semibold uppercase tracking-wider mb-4">Distribuzione Punti per Brand</div>
          <div className="space-y-2">
            {brandPunti.map(bp => {
              const pct = Math.round((bp.punti / totBrandPunti) * 100);
              return (
                <div key={bp.brand.id} className="flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded overflow-hidden shrink-0"><Image src={bp.brand.logo} alt={bp.brand.label} width={20} height={20} className="object-cover"/></div>
                  <span className="text-sm font-semibold w-16" style={{ color: bp.brand.color }}>{bp.brand.label}</span>
                  <div className="flex-1 h-4 bg-white/[0.04] rounded-lg overflow-hidden">
                    <div className="h-full rounded-lg transition-all duration-700 opacity-60" style={{ width: pct + "%", backgroundColor: bp.brand.color }} />
                  </div>
                  <span className="text-sm font-mono text-slate-300 w-12 text-right">{bp.punti} pt</span>
                  <span className="text-sm text-slate-500 w-8 text-right">{pct}%</span>
                </div>
              );
            })}
          </div>
        </Card>
        <Card delay={0.4}>
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-slate-400 font-semibold uppercase tracking-wider">Classifica Agenti</div>
            <PillToggle
              options={[
                { id: "fatturato", label: "Fatt.", icon: "" },
                { id: "target", label: "% Tgt", icon: "" },
              ]}
              value={classMode}
              onChange={setClassMode}
            />
          </div>
          {myRank > 0 && (
            <div
              className={`text-center py-3 mb-4 rounded-xl border ${
                myRank <= 3
                  ? "bg-emerald-500/[0.06] border-emerald-500/[0.12]"
                  : "bg-white/[0.02] border-white/[0.04]"
              }`}
            >
              <span className="text-sm text-slate-400">Tu: </span>
              <span className="text-xl font-extrabold font-mono" style={{ color: myRank <= 3 ? "#6aaa7a" : "#c4a24a" }}>{myRank}°</span>
              <span className="text-sm text-slate-500"> su {classSorted.length}</span>
            </div>
          )}
          <div className="max-h-56 overflow-y-auto space-y-1">
            {classSorted.map((r, ri) => {
              const medals = ["🥇", "🥈", "🥉"];
              const isMe = r.seller.id === sellerId;
              return (
                <div
                  key={r.seller.id}
                  className={`flex items-center gap-2 py-2 px-3 rounded-xl shrink-0 transition-colors ${
                    isMe ? "bg-blue-500/[0.08] border border-blue-500/[0.15]" : "hover:bg-white/[0.02]"
                  }`}
                >
                  <span className="text-sm w-6 text-center">{ri < 3 ? medals[ri] : (ri + 1) + "."}</span>
                  <span className={`text-sm flex-1 ${isMe ? "font-bold text-blue-400" : "font-medium text-slate-300"}`}>{r.seller.name}</span>
                  <span className={`text-sm font-bold font-mono w-14 text-right ${isMe ? "text-blue-400" : "text-slate-400"}`}>
                    {classMode === "fatturato" ? "€" + Math.round(r.fattProj / 1000) + "k" : r.avgPct + "%"}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* ROW 3: Gestione Pratiche */}
      <Card delay={0.5}>
        <div className="text-sm text-slate-400 font-semibold uppercase tracking-wider mb-4">Gestione Pratiche</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { n: pratiche.inviate, label: "Inviate", col: "#3b82f6", icon: "📤" },
            { n: pratiche.inLavorazione, label: "In Lavorazione", col: "#6aaa7a", icon: "⚙️" },
            { n: pratiche.inAttesa, label: "Attesa Inserimento", col: "#c4a24a" },
            { n: pratiche.conProblema, label: "Con Problema", col: "#c46a6a" },
          ].map(item => (
            <div key={item.label} className="p-4 rounded-xl text-center cursor-pointer transition-all hover:scale-[1.02]" style={{ backgroundColor: item.col + "08", border: "1px solid " + item.col + "20" }}>
              <div className="w-2 h-2 rounded-full mx-auto mb-2" style={{ backgroundColor: item.col }} />
              <div className="text-2xl font-extrabold font-mono" style={{ color: item.col }}>{item.n}</div>
              <div className="text-sm font-semibold mt-1" style={{ color: item.col }}>{item.label}</div>
            </div>
          ))}
        </div>
        <div className="text-sm text-violet-400 mt-4 cursor-pointer text-right hover:text-violet-300 transition-colors">Vai a Gestione PDA →</div>
      </Card>
    </div>
  );
}

// ─── BLOCCO CC DIR: Team Call Center ─────────────────────────────

function BloccoCCDir({ data, sellerId }: { data: MockData; sellerId: string }) {
  const ccSellers = SELLER_GROUPS.cc || [];
  const teamCC = ccSellers.map(se => {
    const seGL = getSellerGL(se);
    const seGt = glMese(seGL); const seGp = glPass(seGL, OGGI);
    let fatti = 0;
    BRANDS.forEach(b => { fatti += (data.produzione[se.id] && data.produzione[se.id][b.id]) || 0; });
    const target = data.targetPersonali[se.id].totale;
    const p = proj(fatti, seGp, seGt);
    const pct = target > 0 ? Math.round((p / target) * 100) : 0;
    return { seller: se, fatti, target, proj: p, pct, fattProj: getFattProj(se.id, data, seGp, seGt) };
  }).sort((a, b) => b.pct - a.pct);

  return (
    <Card delay={0.4}>
      <div className="text-sm text-slate-400 font-semibold uppercase tracking-wider mb-4">Team Call Center -- Proiezione</div>
      <div className="space-y-1.5">
        {teamCC.map((td, ti) => {
          const col = stCol(td.pct);
          const isMe = td.seller.id === sellerId;
          const medals = ["🥇", "🥈", "🥉"];
          return (
            <div
              key={td.seller.id}
              className={`flex items-center gap-3 py-3 px-4 rounded-xl transition-colors ${
                isMe ? "bg-blue-500/[0.06]" : ti % 2 === 0 ? "bg-white/[0.02]" : ""
              }`}
            >
              <span className="text-sm w-6">{ti < 3 ? medals[ti] : (ti + 1) + "."}</span>
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: col }} />
              <span className={`text-sm flex-1 ${isMe ? "font-bold text-blue-400" : "font-medium text-slate-300"}`}>{td.seller.name}</span>
              <span className="text-sm font-mono text-slate-400">{td.fatti}</span>
              <span className="text-sm text-slate-600">→</span>
              <span className="text-sm font-mono font-semibold" style={{ color: col }}>{td.proj}/{td.target}</span>
              <span className="text-sm font-bold w-10 text-right" style={{ color: col }}>{td.pct}%</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

const ROLE_ICONS: Record<string, React.ReactNode> = {
  venditore: <User className="w-3.5 h-3.5" />,
  store_manager: <Store className="w-3.5 h-3.5" />,
  supervisore: <Eye className="w-3.5 h-3.5" />,
  admin: <ShieldCheck className="w-3.5 h-3.5" />,
  cc_operator: <Phone className="w-3.5 h-3.5" />,
  cc_director: <Headphones className="w-3.5 h-3.5" />,
  ob_agent: <Car className="w-3.5 h-3.5" />,
  ob_director: <Car className="w-3.5 h-3.5" />,
};
const ROLES = [
  { id: "venditore", label: "Venditore", sellerId: "s1", area: "pv" },
  { id: "store_manager", label: "Store Manager", sellerId: "s3", area: "pv" },
  { id: "supervisore", label: "Supervisore", sellerId: "s7", area: "pv" },
  { id: "admin", label: "Admin", sellerId: "s3", area: "admin" },
  { id: "cc_operator", label: "Caller", sellerId: "cc1", area: "cc" },
  { id: "cc_director", label: "Dir. Call Center", sellerId: "cc5", area: "cc" },
  { id: "ob_agent", label: "Agente", sellerId: "ob1", area: "ob" },
  { id: "ob_director", label: "Dir. Outbound", sellerId: "ob4", area: "ob" },
];

export default function Dashboard() {
  const data = useMemo(() => generateMockData(), []);
  const [ri, setRi] = useState(0);
  const [supSt, setSupSt] = useState("centocelle");
  const [admSt, setAdmSt] = useState("tiburtina");
  const role = ROLES[ri];
  const seller = SELLERS.find(se => se.id === role.sellerId);
  const isMgr = role.id === "store_manager";
  const isSup = role.id === "supervisore";
  const isAdm = role.id === "admin";
  const isCC = role.area === "cc";
  const isOB = role.area === "ob";
  const isPV = role.area === "pv";
  const isDirector = role.id === "cc_director" || role.id === "ob_director";
  let stB = seller ? seller.store : null;
  if (isSup) stB = supSt;
  if (isAdm) stB = admSt;

  const areaLabel = isAdm ? "Amministrazione" : isCC ? "Call Center" : isOB ? "Outbound" : (STORES.find(st => st.id === (seller ? seller.store : "")) || {} as { name?: string }).name || "";

  const today = new Date();
  const dateStr = today.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-8 p-4 md:p-6 lg:p-8">
      {/* Keyframes */}
      <style>{`@keyframes fadeUp { from { opacity:0; transform: translateY(12px); } to { opacity:1; transform: translateY(0); } }`}</style>

      {/* ═══ HERO HEADER ═══ */}
      <div className="glass-panel px-6 py-7 md:px-8 md:py-8" style={{ animation: "fadeUp 0.5s ease-out both" }}>
        {/* Top Row: Logo + Date + Role Badge */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-600 to-orange-500 flex items-center justify-center text-2xl font-extrabold text-white font-mono shadow-lg shadow-red-500/20 shrink-0">
              T
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                Buongiorno, {seller ? seller.name : ""}
              </h1>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <span className="px-3 py-1 rounded-lg bg-violet-500/10 border border-violet-500/20 text-sm font-semibold text-violet-300 flex items-center gap-1.5">
                  {ROLE_ICONS[role.id]} {role.label}
                </span>
                <span className="px-3 py-1 rounded-lg bg-white/5 border border-white/[0.06] text-sm font-semibold text-slate-400">
                  {areaLabel}
                </span>
                <span className="text-sm text-slate-500 capitalize hidden sm:inline">
                  {dateStr}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Role Switcher */}
        <div className="flex gap-2 items-center overflow-x-auto pb-1 -mb-1 scrollbar-hide">
          <span className="text-sm font-bold text-slate-600 mr-1 shrink-0 uppercase tracking-widest">Vista:</span>
          {ROLES.map((r, i) => (
            <button
              key={r.id}
              onClick={() => setRi(i)}
              className={`py-2 px-4 rounded-xl text-sm cursor-pointer font-semibold transition-all shrink-0 whitespace-nowrap ${
                ri === i
                  ? "bg-violet-500/15 text-violet-300 border border-violet-500/30 shadow-lg shadow-violet-500/10"
                  : "text-slate-500 hover:text-white border border-transparent hover:bg-white/5"
              }`}
            >
              <span className="flex items-center gap-1.5">{ROLE_ICONS[r.id]} {r.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ═══ BLOCCO A — PV e CC vedono il target aziendale, OB no ═══ */}
      {(isPV || isCC || isAdm) && <BloccoA data={data} storeId={(isMgr || isSup) ? stB : null} />}

      {/* ═══ BLOCCO D+E — Solo Admin ═══ */}
      {isAdm && <BloccoDE data={data} />}

      {/* ═══ Supervisore: selettore negozio ═══ */}
      {isSup && (
        <div className="glass-panel p-5 flex flex-wrap items-center gap-3" style={{ animation: "fadeUp 0.5s ease-out 0.2s both" }}>
          <span className="text-sm text-slate-400 font-semibold">Seleziona negozio:</span>
          {["centocelle", "cinecitta", "trastevere"].map(sid => (
            <button
              key={sid}
              onClick={() => setSupSt(sid)}
              className={`py-2 px-4 rounded-xl text-sm cursor-pointer font-semibold transition-all ${
                supSt === sid
                  ? "bg-blue-500/10 text-blue-400 border border-blue-500/30"
                  : "text-slate-500 hover:text-white border border-white/[0.08] hover:bg-white/5"
              }`}
            >
              {(STORES.find(s => s.id === sid) || {} as { name?: string }).name || sid}
            </button>
          ))}
        </div>
      )}

      {/* ═══ Admin: selettore negozio per Blocco B ═══ */}
      {isAdm && (
        <div className="glass-panel p-5 flex items-center gap-3" style={{ animation: "fadeUp 0.5s ease-out 0.2s both" }}>
          <span className="text-sm text-slate-400 font-semibold">Dettaglio negozio:</span>
          <select
            value={admSt}
            onChange={(e) => setAdmSt(e.target.value)}
            className="glass-input text-sm py-2 px-4 rounded-xl cursor-pointer"
          >
            {STORES.map(st => (
              <option key={st.id} value={st.id}>{st.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* ═══ BLOCCO B — Solo PV managers e admin ═══ */}
      {(isMgr || isSup || isAdm) && <BloccoB data={data} storeId={stB} />}

      {/* ═══ BLOCCO C — differenziato per area ═══ */}
      {isAdm ? (
        <BloccoCAdmin data={data} />
      ) : isOB ? (
        <BloccoOB data={data} sellerId={role.sellerId} isDirector={isDirector} />
      ) : (
        <div className="space-y-8">
          {role.id === "cc_director" && <BloccoCCDir data={data} sellerId={role.sellerId} />}
          <BloccoC
            data={data}
            sellerId={role.sellerId}
            outbound={false}
            hideMonitoraggio={isCC}
            hideAppuntamenti={isCC}
            showAllClassifiche={false}
          />
        </div>
      )}

      {/* ═══ Footer ═══ */}
      <div className="pt-4 border-t border-white/[0.04] text-sm text-slate-600 flex flex-col sm:flex-row justify-between gap-2">
        <span>Telefutura SRL / Telefutura 2SRL</span>
        <span className="font-mono text-slate-700">Dashboard v2.0</span>
      </div>
    </div>
  );
}
