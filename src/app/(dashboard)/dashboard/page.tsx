"use client";

import { useState, useEffect, useRef, useMemo } from "react";

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const BRANDS = [
  { id: "windtre", label: "WindTre", color: "#FF6B00", icon: "🌀" },
  { id: "vodafone", label: "Vodafone", color: "#E60000", icon: "📶" },
  { id: "sky", label: "Sky", color: "#0072C6", icon: "📡" },
  { id: "fastweb", label: "Fastweb", color: "#FFD200", icon: "⚡" },
  { id: "energia", label: "Energia", color: "#4CAF50", icon: "💡" },
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
function stCol(pct: number) { return pct >= 100 ? "#4CAF50" : pct >= 80 ? "#FFA726" : "#EF5350"; }
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
      <div className="w-full overflow-hidden relative rounded-full" style={{ height: h, backgroundColor: "rgba(255,255,255,0.04)" }}>
        <div className="absolute top-0 left-0 h-full rounded-full transition-all duration-1000" style={{ width: pctProj + "%", backgroundColor: color, opacity: 0.25 }} />
        <div className="absolute top-0 left-0 h-full rounded-full transition-all duration-1000" style={{ width: pctAct + "%", backgroundColor: color }} />
      </div>
      <div className="flex gap-2.5 mt-1">
        <div className="flex items-center gap-1">
          <div className="rounded-sm" style={{ width: 8, height: 4, backgroundColor: color }} />
          <span className="text-sm text-slate-500">attuale</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="rounded-sm" style={{ width: 8, height: 4, backgroundColor: color, opacity: 0.3 }} />
          <span className="text-sm text-slate-500">proiezione</span>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ icon, text, extra }: { icon: string; text: string; extra?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4 pb-2.5 border-b border-white/[0.06]">
      <div className="flex items-center gap-2">
        <span className="text-base">{icon}</span>
        <span className="text-base font-bold text-slate-200 uppercase tracking-wider">{text}</span>
      </div>
      {extra || null}
    </div>
  );
}

function Card({ children, delay, style, className }: { children: React.ReactNode; delay?: number; style?: React.CSSProperties; className?: string }) {
  return (
    <div
      className={`glass-card p-[18px_22px] animate-[fadeUp_0.5s_ease_both] ${className || ""}`}
      style={{ animationDelay: (delay || 0) + "s", ...style }}
    >
      {children}
    </div>
  );
}

function PratichePerse({ ko, nonPagate, label }: { ko: number; nonPagate: number; label?: string }) {
  const [exp, setExp] = useState(false);
  const tot = ko + nonPagate;
  return (
    <div
      onClick={() => setExp(p => !p)}
      className="p-[10px_12px] rounded-lg cursor-pointer bg-rose-500/[0.06] border border-rose-500/[0.12]"
    >
      <div className="flex items-center gap-3">
        <span className="text-[22px]">🔴</span>
        <div className="flex-1">
          <div className="text-sm font-semibold text-rose-500">{label || "Pratiche Perse — Ultimo Bimestre"}</div>
          <div className="text-sm text-slate-500 mt-0.5">KO + non pagate · clicca per dettaglio</div>
        </div>
        <span className="text-[22px] font-extrabold text-rose-500 font-mono">{tot}</span>
        <span className="text-sm text-slate-600 ml-1.5">{exp ? "▲" : "▼"}</span>
      </div>
      {exp && (
        <div className="mt-2.5 pt-2.5 border-t border-rose-500/10 flex gap-4">
          <div className="flex-1 text-center p-2 rounded-md bg-rose-500/[0.06]">
            <div className="text-xl font-extrabold text-rose-500 font-mono">{ko}</div>
            <div className="text-sm text-rose-500">KO</div>
            <div className="text-sm text-slate-500 mt-0.5">Mai attivate</div>
          </div>
          <div className="flex-1 text-center p-2 rounded-md bg-amber-500/[0.06]">
            <div className="text-xl font-extrabold text-amber-500 font-mono">{nonPagate}</div>
            <div className="text-sm text-amber-500">Non Pagate</div>
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

  return (
    <div>
      <SectionTitle
        icon="🎯"
        text="Target Aziendale — Marzo 2026"
        extra={
          <div className="flex gap-2">
            <span className="text-sm text-slate-500 font-mono bg-white/[0.04] py-1 px-2.5 rounded-md">{gp} giorni lavorati</span>
            <span className="text-sm text-slate-500 font-mono bg-white/[0.04] py-1 px-2.5 rounded-md">{gr} rimasti</span>
          </div>
        }
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
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
            <Card key={b.id} delay={0.05 * idx}>
              <div
                onClick={() => setCollapsedAz(prev => isExp ? [...prev, b.id] : prev.filter(x => x !== b.id))}
                className="cursor-pointer flex items-center gap-2 mb-2.5"
              >
                <div className="w-[30px] h-[30px] rounded-lg flex items-center justify-center text-sm" style={{ backgroundColor: b.color + "20" }}>{b.icon}</div>
                <span className="text-sm font-bold flex-1" style={{ color: b.color }}>{b.label}</span>
                <span className="text-sm text-slate-600">{cats.length} cat. {isExp ? "▲" : "▼"}</span>
              </div>
              <div className="text-center mb-2">
                <div className="text-4xl font-extrabold font-mono leading-none" style={{ color: col }}><AnimNum target={avgCatPct} />%</div>
                <div className="text-sm text-slate-500 mt-1">media {cats.length} categorie · {catInTarget}/{cats.length} in target</div>
              </div>
              <DualBar actual={totFatti} projected={proiezione} max={totTarget} color={col} height={8} />
              <div className="flex justify-between mt-1">
                <span className="text-sm font-mono text-slate-300">{totFatti} fatti</span>
                <span className="text-sm text-slate-600">→</span>
                <span className="text-sm font-mono font-semibold" style={{ color: col }}>{proiezione} proj. / {totTarget}</span>
              </div>
              <div className="text-sm text-slate-600 mt-0.5">Ritmo: {ritmo}/gg</div>
              {contribNeg !== null && (
                <div className="text-sm mt-1 pt-1 border-t border-white/5" style={{ color: b.color }}>Il tuo negozio: {contribNeg}</div>
              )}
              {isExp && (
                <div className="mt-2.5 pt-2.5 border-t border-white/[0.06] flex flex-col gap-1.5">
                  {catData.map(cd => (
                    <div key={cd.cat.id}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-sm text-slate-400 font-semibold">{cd.cat.label}</span>
                        <div className="flex gap-2 items-center">
                          <span className="text-sm font-mono text-slate-300">{cd.fatti} fatti</span>
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
    <div>
      <SectionTitle
        icon="🏪"
        text={"Negozio " + store.name}
        extra={
          <span className="text-sm text-slate-500 bg-white/[0.04] py-0.5 px-2 rounded">
            {store.tipo.toUpperCase()} · {store.giorniLav.length === 6 ? "Lun-Sab" : "Lun-Ven"}
          </span>
        }
      />
      {/* B1: Brand targets con sottocategorie */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2.5 mb-4">
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
            <Card key={b.id} delay={0.3 + idx * 0.04} style={{ padding: "12px 14px", borderLeft: "3px solid " + col }}>
              <div
                onClick={() => setCollapsedNeg(prev => isExp ? [...prev, b.id] : prev.filter(x => x !== b.id))}
                className="cursor-pointer flex items-center gap-1.5 mb-1.5"
              >
                <span className="text-[13px]">{b.icon}</span>
                <span className="text-sm font-bold flex-1" style={{ color: b.color }}>{b.label}</span>
                <span className="text-sm text-slate-600">{isExp ? "▲" : "▼"}</span>
              </div>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-xl font-extrabold font-mono" style={{ color: col }}>{avgPct}%</span>
                <span className="text-sm text-slate-500">media {cats.length} categorie</span>
              </div>
              <div className="text-sm font-semibold" style={{ color: col }}>{stLbl(avgPct)}</div>
              {isExp && (
                <div className="mt-2 pt-2 border-t border-white/[0.06] flex flex-col gap-1.5">
                  {catData.map(cd => (
                    <div key={cd.cat.id}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-sm text-slate-400">{cd.cat.label}</span>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card delay={0.5}>
          <div className="text-sm text-slate-500 font-semibold uppercase tracking-wider mb-3">Team · Proiezione Target</div>
          <div className="flex flex-col gap-1.5">
            {teamData.map(td => {
              const col = stCol(td.pct);
              const isE = teamExp === td.seller.id;
              return (
                <div key={td.seller.id}>
                  <div
                    onClick={() => setTeamExp(isE ? null : td.seller.id)}
                    className="flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer"
                    style={{ backgroundColor: td.pct < 80 ? "rgba(239,83,80,0.06)" : "transparent" }}
                  >
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: col }} />
                    <span className="text-sm font-semibold text-slate-300 flex-1">{td.seller.name}</span>
                    <span className="text-sm font-mono text-slate-400">{td.fatti}</span>
                    <span className="text-sm text-slate-600">→</span>
                    <span className="text-sm font-mono font-semibold" style={{ color: col }}>{td.proj}/{td.target}</span>
                    <span className="text-sm font-bold w-9 text-right" style={{ color: col }}>{td.pct}%</span>
                    <span className="text-sm text-slate-600 ml-1">{isE ? "▲" : "▼"}</span>
                  </div>
                  {isE && (
                    <div className="py-2 px-2 pl-6">
                      <div className="flex items-center gap-1.5 mb-2 py-1 px-2 rounded-md bg-white/[0.03]">
                        <span className="text-sm text-slate-500">Target raggiunti:</span>
                        <span className="text-[13px] font-extrabold font-mono text-white">
                          {BRANDS.filter(b => {
                            const f = (data.produzione[td.seller.id] && data.produzione[td.seller.id][b.id]) || 0;
                            const t = (data.targetPersonali[td.seller.id] && data.targetPersonali[td.seller.id][b.id]) || 1;
                            return Math.round((proj(f, gp, gt) / t) * 100) >= 100;
                          }).length}/{BRANDS.length}
                        </span>
                      </div>
                      <div>
                        {BRANDS.map(b => {
                          const f = (data.produzione[td.seller.id] && data.produzione[td.seller.id][b.id]) || 0;
                          const t = (data.targetPersonali[td.seller.id] && data.targetPersonali[td.seller.id][b.id]) || 0;
                          const p = proj(f, gp, gt); const pc = t > 0 ? Math.round((p / t) * 100) : 100;
                          const reached = pc >= 100;
                          return (
                            <div key={b.id} className="flex items-center gap-2 py-1 border-b border-white/[0.03]">
                              <span className="text-sm w-[22px] text-center">{b.icon}</span>
                              <span className="text-sm font-semibold w-[60px]" style={{ color: b.color }}>{b.label}</span>
                              <span className="text-sm font-mono text-slate-300 w-[30px] text-center">{f}</span>
                              <span className="text-sm text-slate-600">→</span>
                              <span className="text-sm font-mono font-bold w-[40px] text-center" style={{ color: stCol(pc) }}>{p}/{t}</span>
                              <span className="text-sm w-[18px] text-center">{reached ? "✅" : pc >= 80 ? "⚠️" : "🔴"}</span>
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
        <Card delay={0.55}>
          <div className="text-sm text-slate-500 font-semibold uppercase tracking-wider mb-3.5">Monitoraggio Pratiche Negozio</div>
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-3 p-[10px_12px] rounded-lg cursor-pointer bg-amber-500/[0.06] border border-amber-500/[0.12]">
              <span className="text-[22px]">📋</span>
              <div className="flex-1">
                <div className="text-sm font-semibold text-amber-500">Da Lavorare + Warning</div>
                <div className="text-sm text-slate-500 mt-0.5">{totDaLav} da lavorare · {totWarn} in warning</div>
              </div>
              <span className="text-[22px] font-extrabold text-amber-500 font-mono">{totDaLav + totWarn}</span>
            </div>
            <PratichePerse ko={totKo} nonPagate={totNP} label="Pratiche Perse — Ultimo Bimestre" />
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
    <div>
      <SectionTitle icon="👤" text={"I Miei Dati — " + seller.name} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {/* C1 */}
        <Card delay={0.6}>
          <div className="text-sm text-slate-500 font-semibold uppercase tracking-wider mb-3">I Miei Target — Proiezione</div>
          <div className="flex gap-3 mb-3.5">
            {[{ n: inLinea, l: "In linea", c: "#4CAF50" }, { n: aRischio, l: "A rischio", c: "#FFA726" }, { n: sottoTono, l: "Sotto tono", c: "#EF5350" }].map(i => (
              <div key={i.l} className="flex-1 text-center py-2.5 px-2 rounded-lg" style={{ backgroundColor: i.c + "12", border: "1px solid " + i.c + "25" }}>
                <div className="text-2xl font-extrabold font-mono" style={{ color: i.c }}>{i.n}</div>
                <div className="text-sm mt-0.5" style={{ color: i.c }}>{i.l}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            {brandStatus.map(bs => {
              const col = stCol(bs.pct);
              return (
                <div key={bs.brand.id}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm w-5 text-center">{bs.brand.icon}</span>
                    <span className="text-sm text-slate-400 w-[60px]">{bs.brand.label}</span>
                    <span className="text-sm font-mono text-white w-[50px] text-center">{bs.fatti} fatti</span>
                    <span className="text-sm text-slate-600">→</span>
                    <span className="text-sm font-mono font-bold w-[55px] text-center" style={{ color: col }}>{bs.proiezione}/{bs.target}</span>
                  </div>
                  <DualBar actual={bs.fatti} projected={bs.proiezione} max={bs.target} color={col} height={7} />
                </div>
              );
            })}
          </div>
          {confronti.length > 0 && (
            <div>
              <button
                onClick={() => setShowConf(p => !p)}
                className="w-full mt-3 p-2 rounded-md cursor-pointer text-sm font-semibold transition-colors"
                style={{
                  background: showConf ? "rgba(255,167,38,0.1)" : "rgba(255,255,255,0.03)",
                  border: "1px solid " + (showConf ? "rgba(255,167,38,0.2)" : "rgba(255,255,255,0.06)"),
                  color: showConf ? "#FFA726" : "#888",
                }}
              >
                {showConf ? "▲ Chiudi confronto" : "👀 Guarda chi sta facendo meglio di te"}
              </button>
              {showConf && (
                <div className="mt-2.5 flex flex-col gap-1.5">
                  {confronti.map(c => (
                    <div key={c.brand.id} className="p-2 px-2.5 rounded-md bg-white/[0.02] border border-white/[0.04]">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-sm">{c.brand.icon}</span>
                        <span className="text-sm font-bold" style={{ color: c.brand.color }}>{c.brand.label}</span>
                        <span className="text-sm ml-auto font-semibold" style={{ color: stCol(c.myPct) }}>{stEmoji(c.myPct)} Tu: {c.myPct}%</span>
                      </div>
                      {c.meglio
                        ? <div className="text-sm text-emerald-500">📈 <strong>{c.meglio.seller.name}</strong> ({(STORES.find(st => st.id === c.meglio!.seller.store) || {} as { name?: string }).name || getGroupLabel(getSellerGroup(c.meglio.seller))}) proietta {c.meglio.pct}%</div>
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
            <div className="flex gap-1 mb-2.5">
              {(["pv", "cc", "ob"] as const).map(g => (
                <button
                  key={g}
                  onClick={() => setClassGroup(g)}
                  className="flex-1 py-1.5 px-1.5 rounded-md text-sm cursor-pointer font-semibold text-center transition-colors"
                  style={{
                    border: classGroup === g ? "1px solid rgba(66,165,245,0.4)" : "1px solid rgba(255,255,255,0.06)",
                    background: classGroup === g ? "rgba(66,165,245,0.08)" : "transparent",
                    color: classGroup === g ? "#42A5F5" : "#666",
                  }}
                >
                  {g === "pv" ? "🏪 PV" : g === "cc" ? "📞 CC" : "🚗 OB"}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between mb-2.5">
            <div className="text-sm text-slate-500 font-semibold uppercase tracking-wider">{getGroupLabel(classGroup)}</div>
            <div className="flex gap-1">
              {(["fatturato", "target"] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setClassMode(m)}
                  className="py-0.5 px-2.5 rounded-md text-sm cursor-pointer font-semibold transition-colors"
                  style={{
                    border: classMode === m ? "1px solid rgba(66,165,245,0.4)" : "1px solid rgba(255,255,255,0.08)",
                    background: classMode === m ? "rgba(66,165,245,0.1)" : "transparent",
                    color: classMode === m ? "#42A5F5" : "#666",
                  }}
                >
                  {m === "fatturato" ? "💰 Fatturato" : "🎯 % Target"}
                </button>
              ))}
            </div>
          </div>
          <div
            className="text-center py-2.5 mb-3 rounded-lg"
            style={{
              backgroundColor: myRank <= 3 ? "rgba(76,175,80,0.06)" : "rgba(255,255,255,0.02)",
              border: "1px solid " + (myRank <= 3 ? "rgba(76,175,80,0.12)" : "rgba(255,255,255,0.04)"),
            }}
          >
            <span className="text-sm text-slate-500">La tua posizione: </span>
            <span className="text-lg font-extrabold font-mono" style={{ color: myRank <= 3 ? "#4CAF50" : "#FFA726" }}>{myRank}°</span>
            <span className="text-sm text-slate-600"> su {classSorted.length}</span>
          </div>
          <div className="max-h-60 overflow-y-auto flex flex-col gap-1">
            {classSorted.map((r, ri) => {
              const medals = ["🥇", "🥈", "🥉"];
              const isMe = r.seller.id === sellerId;
              return (
                <div
                  key={r.seller.id}
                  className="flex items-center gap-2 py-1.5 px-2 rounded-md"
                  style={{
                    backgroundColor: isMe ? "rgba(66,165,245,0.08)" : "transparent",
                    border: isMe ? "1px solid rgba(66,165,245,0.15)" : "1px solid transparent",
                  }}
                >
                  <span className="text-sm w-[22px] text-center">{ri < 3 ? medals[ri] : (ri + 1) + "."}</span>
                  <span className="text-sm flex-1" style={{ fontWeight: isMe ? 700 : 500, color: isMe ? "#42A5F5" : "#ccc" }}>{r.seller.name}</span>
                  <span className="text-sm text-slate-500">{r.store ? r.store.name : getGroupLabel(getSellerGroup(r.seller))}</span>
                  <span className="text-sm font-bold font-mono w-[60px] text-right" style={{ color: isMe ? "#42A5F5" : "#aaa" }}>
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
        <div className={`grid gap-3 grid-cols-1 ${hideMonitoraggio || hideAppuntamenti ? "" : "sm:grid-cols-2"}`}>
          {!hideMonitoraggio && (
            <Card delay={0.7}>
              <div className="text-sm text-slate-500 font-semibold uppercase tracking-wider mb-2.5">Monitoraggio Pratiche</div>
              <div className="flex flex-col gap-2.5">
                <div className="p-2.5 rounded-lg text-center cursor-pointer bg-amber-500/[0.06] border border-amber-500/[0.12]">
                  <div className="text-[26px] font-extrabold text-amber-500 font-mono">{myCrit.warning + myCrit.daLavorare}</div>
                  <div className="text-sm text-amber-500 mt-0.5">Da Lavorare + Warning</div>
                  <div className="text-sm text-slate-500 mt-1">Vai al Tracking PDA →</div>
                </div>
                <PratichePerse ko={myCrit.koBimestre} nonPagate={myCrit.nonPagateBimestre} label="Le Mie Pratiche Perse — Ultimo Bimestre" />
              </div>
            </Card>
          )}
          {!hideAppuntamenti && (
            <Card delay={0.75}>
              <div className="text-sm text-slate-500 font-semibold uppercase tracking-wider mb-2.5">
                {outbound ? "I Miei Appuntamenti Oggi" : "Appuntamenti Negozio Oggi"}
              </div>
              {negAppts.length === 0 ? (
                <div className="text-center py-5 text-slate-600 text-sm">Nessun appuntamento oggi</div>
              ) : (
                <div className="flex flex-col gap-1">
                  {negAppts.map((a, ai) => (
                    <div key={ai} className="flex items-center gap-2 py-1.5 px-2 rounded-md bg-white/[0.02]">
                      <span className="text-sm font-bold text-blue-400 font-mono w-10">{a.ora}</span>
                      <span className="text-sm text-slate-300 flex-1">{a.cliente}</span>
                      {a.venditore && <span className="text-sm text-slate-500">{a.venditore}</span>}
                      <span className="text-sm py-0.5 px-1.5 rounded bg-blue-500/10 text-blue-400 font-semibold">{a.tipo}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="text-sm text-blue-400 mt-2 cursor-pointer text-right">Vedi calendario →</div>
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
    <div>
      <SectionTitle icon="🚨" text="Piste — Negozi Sotto Tono (Proiezione)" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2.5 mb-5">
        {piste.map((p, pi) => (
          <Card key={p.brand.id} delay={0.8 + pi * 0.04} style={{ padding: "12px 14px" }}>
            <div className="text-sm font-bold mb-2" style={{ color: p.brand.color }}>{p.brand.icon} {p.brand.label}</div>
            {p.sottoTono.length === 0 ? (
              <div className="text-sm text-emerald-500 font-semibold">✅ Tutti in linea</div>
            ) : (
              <div className="flex flex-col gap-1">
                {p.sottoTono.slice(0, 3).map(n => (
                  <div key={n.store.id} className="flex items-center gap-1.5">
                    <span className="text-sm text-rose-500 flex-1">{n.store.name}</span>
                    <span className="text-sm font-bold text-rose-500 font-mono">{n.pct}%</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
      <SectionTitle icon="🗺️" text="Mappa Criticità — Ultimo Bimestre" />
      <Card delay={1.0}>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {["Negozio", "Da Lavorare", "Warning", "Pratiche Perse", "Totale"].map(h => (
                <th key={h} className="text-left py-2 px-2.5 text-slate-500 border-b border-white/[0.06] text-sm font-semibold uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {critMap.map(cm => (
              <tr key={cm.store.id} className="border-b border-white/[0.03]">
                <td className="py-2 px-2.5 font-semibold text-slate-300">{cm.store.name}</td>
                <td className="py-2 px-2.5 font-mono" style={{ color: cm.daLav > 0 ? "#FFA726" : "#444" }}>{cm.daLav}</td>
                <td className="py-2 px-2.5 font-mono" style={{ color: cm.warn > 0 ? "#FF7043" : "#444" }}>{cm.warn}</td>
                <td className="py-2 px-2.5 font-mono" style={{ color: cm.perse > 0 ? "#EF5350" : "#444" }}>{cm.perse}</td>
                <td className="py-2 px-2.5 font-mono font-bold" style={{ color: cm.tot > 5 ? "#EF5350" : cm.tot > 0 ? "#FFA726" : "#4CAF50" }}>{cm.tot}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
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
    <div>
      <SectionTitle icon="📊" text="Panoramica Operativa" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Appuntamenti globali */}
        <Card delay={0.7}>
          <div className="flex items-center justify-between mb-3.5">
            <div>
              <div className="text-sm text-slate-500 font-semibold uppercase tracking-wider">Appuntamenti Oggi</div>
              <div className="text-xl font-extrabold text-blue-400 font-mono mt-1">{totAppt} totali</div>
            </div>
            <div className="flex gap-1">
              {(["negozi", "agenti"] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setApptView(m)}
                  className="py-0.5 px-2.5 rounded-md text-sm cursor-pointer font-semibold transition-colors"
                  style={{
                    border: apptView === m ? "1px solid rgba(66,165,245,0.4)" : "1px solid rgba(255,255,255,0.08)",
                    background: apptView === m ? "rgba(66,165,245,0.1)" : "transparent",
                    color: apptView === m ? "#42A5F5" : "#666",
                  }}
                >
                  {m === "negozi" ? "🏪 Punti Vendita" : "👤 Agenti"}
                </button>
              ))}
            </div>
          </div>
          {apptView === "negozi" ? (
            <div className="flex flex-col gap-1">
              {apptPerNegozio.map(a => (
                <div key={a.store.id} className="flex items-center gap-2 py-1">
                  <span className="text-sm text-slate-400 w-20 font-medium">{a.store.name}</span>
                  <div className="flex-1 h-4 bg-white/[0.04] rounded overflow-hidden relative">
                    <div
                      className="h-full rounded flex items-center justify-end pr-1.5 transition-all duration-700"
                      style={{ width: (a.count / maxApptNeg * 100) + "%", backgroundColor: "rgba(66,165,245,0.4)" }}
                    >
                      {a.count > 0 && <span className="text-sm text-white font-mono font-bold">{a.count}</span>}
                    </div>
                  </div>
                  {a.count === 0 && <span className="text-sm text-slate-700 font-mono w-4">0</span>}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {apptPerAgente.slice(0, 10).map(a => (
                <div key={a.seller.id} className="flex items-center gap-2 py-1">
                  <span className="text-sm text-slate-300 w-[90px] font-medium">{a.seller.name}</span>
                  <span className="text-sm text-slate-500 w-[65px]">{a.store?.name}</span>
                  <div className="flex-1 h-4 bg-white/[0.04] rounded overflow-hidden">
                    <div
                      className="h-full rounded flex items-center justify-end pr-1.5 transition-all duration-700"
                      style={{ width: (a.count / maxApptAg * 100) + "%", backgroundColor: "rgba(76,175,80,0.4)" }}
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
          <div className="flex items-center justify-between mb-3.5">
            <div className="text-sm text-slate-500 font-semibold uppercase tracking-wider">Monitoraggio Pratiche — Tutti i Negozi</div>
            <div className="flex gap-1">
              {(["lavorare", "perse"] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setPratView(m)}
                  className="py-0.5 px-2.5 rounded-md text-sm cursor-pointer font-semibold transition-colors"
                  style={{
                    border: pratView === m ? "1px solid " + (m === "lavorare" ? "rgba(255,167,38,0.4)" : "rgba(239,83,80,0.4)") : "1px solid rgba(255,255,255,0.08)",
                    background: pratView === m ? (m === "lavorare" ? "rgba(255,167,38,0.1)" : "rgba(239,83,80,0.1)") : "transparent",
                    color: pratView === m ? (m === "lavorare" ? "#FFA726" : "#EF5350") : "#666",
                  }}
                >
                  {m === "lavorare" ? "📋 Da Lavorare + Warning" : "🔴 Pratiche Perse"}
                </button>
              ))}
            </div>
          </div>
          {pratView === "lavorare" ? (
            <div>
              <div className="flex flex-col gap-1">
                {pratichePerNeg.slice().sort((a, b) => (b.daLav + b.warn) - (a.daLav + a.warn)).map(p => {
                  const val = p.daLav + p.warn;
                  const maxVal = Math.max(1, ...pratichePerNeg.map(x => x.daLav + x.warn));
                  return (
                    <div key={p.store.id} className="flex items-center gap-2 py-0.5">
                      <span className="text-sm text-slate-400 w-20 font-medium">{p.store.name}</span>
                      <div className="flex-1 flex gap-0.5 h-3.5">
                        {p.daLav > 0 && <div className="rounded-sm transition-all duration-700" style={{ width: (p.daLav / maxVal * 100) + "%", backgroundColor: "#FFA726" }} />}
                        {p.warn > 0 && <div className="rounded-sm transition-all duration-700" style={{ width: (p.warn / maxVal * 100) + "%", backgroundColor: "#FF7043" }} />}
                      </div>
                      <span className="text-sm font-mono w-5 text-right font-bold" style={{ color: val > 3 ? "#FF7043" : val > 0 ? "#FFA726" : "#4CAF50" }}>{val}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-3 mt-2.5 pt-2 border-t border-white/[0.04]">
                {[{ c: "#FFA726", l: "Da Lavorare" }, { c: "#FF7043", l: "Warning" }].map(item => (
                  <div key={item.l} className="flex items-center gap-1">
                    <div className="w-2.5 h-1.5 rounded-sm" style={{ backgroundColor: item.c }} />
                    <span className="text-sm text-slate-500">{item.l}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <div className="flex flex-col gap-1">
                {pratichePerNeg.slice().sort((a, b) => b.perse - a.perse).map(p => {
                  const maxPerse = Math.max(1, ...pratichePerNeg.map(x => x.perse));
                  return (
                    <div key={p.store.id} className="flex items-center gap-2 py-0.5">
                      <span className="text-sm text-slate-400 w-20 font-medium">{p.store.name}</span>
                      <div className="flex-1 h-3.5 bg-white/[0.04] rounded-sm overflow-hidden">
                        <div className="h-full rounded-sm transition-all duration-700" style={{ width: (p.perse / maxPerse * 100) + "%", backgroundColor: "#EF5350" }} />
                      </div>
                      <span className="text-sm font-mono w-5 text-right font-bold" style={{ color: p.perse > 3 ? "#EF5350" : p.perse > 0 ? "#FF9800" : "#4CAF50" }}>{p.perse}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-3 mt-2.5 pt-2 border-t border-white/[0.04]">
                <div className="flex items-center gap-1">
                  <div className="w-2.5 h-1.5 rounded-sm bg-rose-500" />
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

  const mood = fattPct >= 100 ? { emoji: "🔥", msg: "Stai spaccando! Sopra target.", col: "#4CAF50" }
    : fattPct >= 85 ? { emoji: "💪", msg: "Quasi! Mancano €" + fattGap.toLocaleString() + " — spingi!", col: "#FFA726" }
    : fattPct >= 60 ? { emoji: "⚡", msg: "Sveglia! Servono €" + fattRitmo.toLocaleString() + "/gg per chiudere.", col: "#FF7043" }
    : { emoji: "🚨", msg: "Allarme rosso. €" + fattRitmo.toLocaleString() + "/gg da oggi o non chiudi.", col: "#EF5350" };

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
    <div>
      <SectionTitle icon="🚗" text={isDirector ? "Outbound — Panoramica Team" : "I Miei Risultati"} />

      {/* Director team */}
      {isDirector && (
        <div className="mb-5">
          <Card delay={0.1}>
            <div className="text-sm text-slate-500 font-semibold uppercase tracking-wider mb-3.5">Team Agenti — Clicca per dettaglio</div>
            <div className="flex flex-col gap-1">
              {teamOB.map((td, ti) => {
                const medals = ["🥇", "🥈", "🥉"];
                const isMe = td.seller.id === sellerId;
                const isE = dirExp === td.seller.id;
                const tdTot = td.brands.reduce((s, bp) => s + bp.punti, 0) || 1;
                return (
                  <div key={td.seller.id}>
                    <div
                      onClick={() => setDirExp(isE ? null : td.seller.id)}
                      className="flex items-center gap-2 py-2 px-2.5 rounded-lg cursor-pointer"
                      style={{ backgroundColor: isE ? "rgba(255,255,255,0.03)" : isMe ? "rgba(66,165,245,0.06)" : ti % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent" }}
                    >
                      <span className="text-sm w-[22px]">{ti < 3 ? medals[ti] : (ti + 1) + "."}</span>
                      <span className="text-sm flex-1" style={{ fontWeight: isMe ? 700 : 500, color: isMe ? "#42A5F5" : "#ccc" }}>{td.seller.name}</span>
                      <div className="text-center w-[70px]">
                        <div className="text-[13px] font-extrabold font-mono" style={{ color: td.soglia.pay >= 10 ? "#4CAF50" : td.soglia.pay >= 8 ? "#FFA726" : "#ccc" }}>{td.puntiProj} pt</div>
                        <div className="text-sm text-slate-500">{td.soglia.label}</div>
                      </div>
                      <div className="text-right w-[65px]">
                        <div className="text-sm font-bold text-blue-400 font-mono">€{Math.round(td.fattProj / 1000)}k</div>
                        <div className="text-sm text-slate-500">fatt. proj.</div>
                      </div>
                      <span className="text-sm text-slate-600 ml-1">{isE ? "▲" : "▼"}</span>
                    </div>
                    {isE && (
                      <div className="py-2.5 px-2.5 sm:pl-10 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <div className="text-sm text-slate-500 font-semibold mb-1.5">PUNTI PER BRAND</div>
                          {td.brands.filter(bp => bp.punti > 0).map(bp => (
                            <div key={bp.brand.id} className="flex items-center gap-1.5 py-0.5">
                              <span className="text-sm w-4">{bp.brand.icon}</span>
                              <span className="text-sm w-[50px]" style={{ color: bp.brand.color }}>{bp.brand.label}</span>
                              <div className="flex-1 h-2.5 bg-white/[0.04] rounded-sm overflow-hidden">
                                <div className="h-full rounded-sm" style={{ width: Math.round(bp.punti / tdTot * 100) + "%", backgroundColor: bp.brand.color, opacity: 0.5 }} />
                              </div>
                              <span className="text-sm font-mono text-slate-400 w-[35px] text-right">{bp.punti}pt</span>
                            </div>
                          ))}
                        </div>
                        <div>
                          <div className="text-sm text-slate-500 font-semibold mb-1.5">CONSUMER vs BUSINESS</div>
                          {td.brands.filter(bp => bp.punti > 0).map(bp => {
                            const totBP = bp.consumer + bp.business || 1;
                            return (
                              <div key={bp.brand.id} className="flex items-center gap-1.5 py-0.5">
                                <span className="text-sm w-4">{bp.brand.icon}</span>
                                <div className="flex-1 h-2.5 flex rounded-sm overflow-hidden">
                                  <div style={{ width: Math.round(bp.consumer / totBP * 100) + "%", backgroundColor: "#42A5F5" }} className="h-full" />
                                  <div style={{ width: Math.round(bp.business / totBP * 100) + "%", backgroundColor: "#FF9800" }} className="h-full" />
                                </div>
                                <span className="text-sm text-blue-400 w-5 text-right">{bp.consumer}</span>
                                <span className="text-sm text-amber-500 w-5 text-right">{bp.business}</span>
                              </div>
                            );
                          })}
                          <div className="flex gap-2.5 mt-1.5">
                            <div className="flex items-center gap-1"><div className="w-2 h-[5px] rounded-sm bg-blue-400" /><span className="text-sm text-slate-500">Consumer</span></div>
                            <div className="flex items-center gap-1"><div className="w-2 h-[5px] rounded-sm bg-amber-500" /><span className="text-sm text-slate-500">Business</span></div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* ROW 1: Fatturato + Punti/Soglie */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <Card delay={0.2} style={{ borderLeft: "3px solid " + mood.col }}>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-slate-500 font-semibold uppercase tracking-wider">Fatturato</div>
            <span className="text-lg">{mood.emoji}</span>
          </div>
          <div className="py-2 px-2.5 rounded-md mb-2.5" style={{ backgroundColor: mood.col + "12", border: "1px solid " + mood.col + "25" }}>
            <div className="text-sm font-bold" style={{ color: mood.col }}>{mood.msg}</div>
          </div>
          <div className="flex gap-1.5 mb-2">
            {[
              { label: "TARGET", value: "€" + fattTarget.toLocaleString(), col: "#fff", bg: "rgba(255,255,255,0.03)" },
              { label: "ATTUALE", value: "€" + fatturato.toLocaleString(), col: "#ccc", bg: "rgba(255,255,255,0.03)" },
              { label: "PROIEZIONE", value: "€" + fattProj.toLocaleString(), col: mood.col, bg: mood.col + "10" },
            ].map(item => (
              <div key={item.label} className="flex-1 p-1.5 rounded-md text-center" style={{ backgroundColor: item.bg }}>
                <div className="text-sm uppercase mb-0.5" style={{ color: item.col === "#fff" ? "#666" : item.col }}>{item.label}</div>
                <div className="text-base font-extrabold font-mono" style={{ color: item.col }}>{item.value}</div>
              </div>
            ))}
          </div>
          <DualBar actual={fatturato} projected={fattProj} max={fattTarget} color={mood.col} height={10} />
          <div className="flex justify-between mt-1.5">
            <span className="text-sm font-bold" style={{ color: mood.col }}>{fattPct}% del target</span>
            {fattGap > 0 && <span className="text-sm text-slate-500">Gap: €{fattGap.toLocaleString()}</span>}
          </div>
        </Card>

        <Card delay={0.25}>
          <div className="text-sm text-slate-500 font-semibold uppercase tracking-wider mb-3">Punti &amp; Soglie</div>
          <div className="flex gap-2 mb-2.5">
            <div className="flex-1 p-2 rounded-md bg-white/[0.03] text-center">
              <div className="text-sm text-slate-500 uppercase mb-0.5">ATTUALI</div>
              <div className="text-xl font-extrabold text-white font-mono">{puntiAttuali}</div>
              <div className="text-sm text-slate-500 mt-0.5">{sogliaAttuale.label} · €{sogliaAttuale.pay}/pt</div>
            </div>
            <div
              className="flex-1 p-2 rounded-md text-center"
              style={{
                backgroundColor: sogliaProj.pay >= 10 ? "rgba(76,175,80,0.08)" : "rgba(255,167,38,0.08)",
                border: "1px solid " + (sogliaProj.pay >= 10 ? "rgba(76,175,80,0.15)" : "rgba(255,167,38,0.15)"),
              }}
            >
              <div className="text-sm uppercase mb-0.5" style={{ color: sogliaProj.pay >= 10 ? "#4CAF50" : "#FFA726" }}>PROIEZIONE</div>
              <div className="text-xl font-extrabold font-mono" style={{ color: sogliaProj.pay >= 10 ? "#4CAF50" : "#FFA726" }}>{puntiProj}</div>
              <div className="text-sm font-semibold mt-0.5" style={{ color: sogliaProj.pay >= 10 ? "#4CAF50" : "#FFA726" }}>{sogliaProj.label} · €{sogliaProj.pay}/pt</div>
            </div>
          </div>
          {nextSoglia ? (
            <div className="py-2 px-2.5 rounded-md bg-emerald-500/[0.06] border border-emerald-500/[0.12] mb-2.5">
              <div className="text-sm font-bold text-emerald-500">🎯 Ti mancano {puntiToNext} pt per {nextSoglia.label}</div>
              <div className="text-sm text-slate-500 mt-0.5">Saliresti a €{nextSoglia.pay}/pt retroattivo: </div>
              <span className="text-sm font-extrabold text-emerald-500 font-mono">+€{Math.round(moneyShift).toLocaleString()} in più!</span>
            </div>
          ) : (
            <div className="p-1.5 px-2.5 rounded-md bg-emerald-500/[0.06] text-center mb-2.5">
              <span className="text-sm text-emerald-500 font-bold">🏆 Soglia massima!</span>
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            {SOGLIE.map((sg, si) => {
              const isActive = sogliaProj.label === sg.label;
              const isPast = puntiProj >= sg.max;
              return (
                <div key={si} className="flex items-center gap-1.5 py-0.5 px-1.5 rounded" style={{ backgroundColor: isActive ? "rgba(76,175,80,0.08)" : "transparent" }}>
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: isPast ? "#4CAF50" : isActive ? "#FFA726" : "#333" }} />
                  <span className="text-sm flex-1" style={{ color: isActive ? "#fff" : "#888", fontWeight: isActive ? 700 : 400 }}>
                    {sg.label}: {sg.min}-{sg.max === 9999 ? "∞" : sg.max} pt
                  </span>
                  <span className="text-sm font-mono" style={{ color: isActive ? "#4CAF50" : "#666", fontWeight: isActive ? 700 : 400 }}>€{sg.pay}/pt</span>
                </div>
              );
            })}
          </div>
          <div className="mt-2 pt-2 border-t border-white/5 text-center">
            <span className="text-sm text-slate-500">Guadagno proj.: </span>
            <span className="text-base font-extrabold text-emerald-500 font-mono">€{guadagnoProj.toLocaleString()}</span>
          </div>
        </Card>
      </div>

      {/* ROW 2: Brand Breakdown + Classifica */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <Card delay={0.35}>
          <div className="text-sm text-slate-500 font-semibold uppercase tracking-wider mb-3">Distribuzione Punti per Brand</div>
          <div className="flex flex-col gap-1.5">
            {brandPunti.map(bp => {
              const pct = Math.round((bp.punti / totBrandPunti) * 100);
              return (
                <div key={bp.brand.id} className="flex items-center gap-2">
                  <span className="text-[13px] w-5 text-center">{bp.brand.icon}</span>
                  <span className="text-sm font-semibold w-[60px]" style={{ color: bp.brand.color }}>{bp.brand.label}</span>
                  <div className="flex-1 h-3.5 bg-white/[0.04] rounded overflow-hidden">
                    <div className="h-full rounded transition-all duration-700" style={{ width: pct + "%", backgroundColor: bp.brand.color, opacity: 0.6 }} />
                  </div>
                  <span className="text-sm font-mono text-slate-300 w-10 text-right">{bp.punti} pt</span>
                  <span className="text-sm text-slate-500 w-[30px] text-right">{pct}%</span>
                </div>
              );
            })}
          </div>
        </Card>
        <Card delay={0.4}>
          <div className="flex items-center justify-between mb-2.5">
            <div className="text-sm text-slate-500 font-semibold uppercase tracking-wider">Classifica Agenti</div>
            <div className="flex gap-1">
              {(["fatturato", "target"] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setClassMode(m)}
                  className="py-0.5 px-2 rounded-md text-sm cursor-pointer font-semibold transition-colors"
                  style={{
                    border: classMode === m ? "1px solid rgba(66,165,245,0.4)" : "1px solid rgba(255,255,255,0.08)",
                    background: classMode === m ? "rgba(66,165,245,0.1)" : "transparent",
                    color: classMode === m ? "#42A5F5" : "#666",
                  }}
                >
                  {m === "fatturato" ? "💰 Fatt." : "🎯 % Tgt"}
                </button>
              ))}
            </div>
          </div>
          {myRank > 0 && (
            <div
              className="text-center py-1.5 mb-2 rounded-md"
              style={{
                backgroundColor: myRank <= 3 ? "rgba(76,175,80,0.06)" : "rgba(255,255,255,0.02)",
                border: "1px solid " + (myRank <= 3 ? "rgba(76,175,80,0.12)" : "rgba(255,255,255,0.04)"),
              }}
            >
              <span className="text-sm text-slate-500">Tu: </span>
              <span className="text-base font-extrabold font-mono" style={{ color: myRank <= 3 ? "#4CAF50" : "#FFA726" }}>{myRank}°</span>
              <span className="text-sm text-slate-500"> su {classSorted.length}</span>
            </div>
          )}
          <div className="max-h-[200px] overflow-y-auto flex flex-col gap-0.5">
            {classSorted.map((r, ri) => {
              const medals = ["🥇", "🥈", "🥉"];
              const isMe = r.seller.id === sellerId;
              return (
                <div
                  key={r.seller.id}
                  className="flex items-center gap-1.5 py-1.5 px-2 rounded-md shrink-0"
                  style={{
                    backgroundColor: isMe ? "rgba(66,165,245,0.08)" : "transparent",
                    border: isMe ? "1px solid rgba(66,165,245,0.15)" : "1px solid transparent",
                  }}
                >
                  <span className="text-sm w-5 text-center">{ri < 3 ? medals[ri] : (ri + 1) + "."}</span>
                  <span className="text-sm flex-1" style={{ fontWeight: isMe ? 700 : 500, color: isMe ? "#42A5F5" : "#ccc" }}>{r.seller.name}</span>
                  <span className="text-sm font-bold font-mono w-[55px] text-right" style={{ color: isMe ? "#42A5F5" : "#aaa" }}>
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
        <div className="text-sm text-slate-500 font-semibold uppercase tracking-wider mb-3">Gestione Pratiche</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {[
            { n: pratiche.inviate, label: "Inviate", col: "#42A5F5", icon: "📤" },
            { n: pratiche.inLavorazione, label: "In Lavorazione", col: "#4CAF50", icon: "⚙️" },
            { n: pratiche.inAttesa, label: "Attesa Inserimento", col: "#FFA726", icon: "⏳" },
            { n: pratiche.conProblema, label: "Con Problema", col: "#EF5350", icon: "⚠️" },
          ].map(item => (
            <div key={item.label} className="p-3 rounded-lg text-center cursor-pointer" style={{ backgroundColor: item.col + "08", border: "1px solid " + item.col + "15" }}>
              <div className="text-sm mb-1">{item.icon}</div>
              <div className="text-[22px] font-extrabold font-mono" style={{ color: item.col }}>{item.n}</div>
              <div className="text-sm mt-0.5" style={{ color: item.col }}>{item.label}</div>
            </div>
          ))}
        </div>
        <div className="text-sm text-blue-400 mt-2.5 cursor-pointer text-right">Vai a Gestione PDA →</div>
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
      <div className="text-sm text-slate-500 font-semibold uppercase tracking-wider mb-3.5">Team Call Center — Proiezione</div>
      <div className="flex flex-col gap-1.5">
        {teamCC.map((td, ti) => {
          const col = stCol(td.pct);
          const isMe = td.seller.id === sellerId;
          const medals = ["🥇", "🥈", "🥉"];
          return (
            <div
              key={td.seller.id}
              className="flex items-center gap-2 py-2 px-2.5 rounded-lg"
              style={{ backgroundColor: isMe ? "rgba(66,165,245,0.06)" : ti % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent" }}
            >
              <span className="text-sm w-[22px]">{ti < 3 ? medals[ti] : (ti + 1) + "."}</span>
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: col }} />
              <span className="text-sm flex-1" style={{ fontWeight: isMe ? 700 : 500, color: isMe ? "#42A5F5" : "#ccc" }}>{td.seller.name}</span>
              <span className="text-sm font-mono text-slate-400">{td.fatti}</span>
              <span className="text-sm text-slate-600">→</span>
              <span className="text-sm font-mono font-semibold" style={{ color: col }}>{td.proj}/{td.target}</span>
              <span className="text-sm font-bold w-9 text-right" style={{ color: col }}>{td.pct}%</span>
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

const ROLES = [
  { id: "venditore", label: "Venditore", sellerId: "s1", icon: "👤", area: "pv" },
  { id: "store_manager", label: "Store Manager", sellerId: "s3", icon: "🏪", area: "pv" },
  { id: "supervisore", label: "Supervisore", sellerId: "s7", icon: "👁️", area: "pv" },
  { id: "admin", label: "Admin", sellerId: "s3", icon: "🔑", area: "admin" },
  { id: "cc_operator", label: "Caller", sellerId: "cc1", icon: "📞", area: "cc" },
  { id: "cc_director", label: "Dir. Call Center", sellerId: "cc5", icon: "📞", area: "cc" },
  { id: "ob_agent", label: "Agente", sellerId: "ob1", icon: "🚗", area: "ob" },
  { id: "ob_director", label: "Dir. Outbound", sellerId: "ob4", icon: "🚗", area: "ob" },
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

  return (
    <div className="w-full space-y-4 p-4 md:p-6">
      {/* Keyframes for fadeUp animation */}
      <style>{`@keyframes fadeUp { from { opacity:0; transform: translateY(10px); } to { opacity:1; transform: translateY(0); } }`}</style>

      {/* Header with Role Switcher */}
      <div className="glass-panel py-3 px-4 md:py-4 md:px-6 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-[34px] h-[34px] rounded-lg bg-gradient-to-br from-red-600 to-orange-500 flex items-center justify-center text-base font-extrabold text-white font-mono shrink-0">T</div>
          <div>
            <div className="text-base font-extrabold text-white">Dashboard</div>
            <div className="text-sm text-slate-500 font-mono">Telefutura CRM · Marzo 2026</div>
          </div>
        </div>
        <div className="flex gap-1 items-center overflow-x-auto pb-1 -mb-1">
          <span className="text-sm text-slate-600 mr-1 shrink-0">DEMO:</span>
          {ROLES.map((r, i) => (
            <button
              key={r.id}
              onClick={() => setRi(i)}
              className="py-1 px-2 rounded-md text-sm cursor-pointer font-semibold transition-colors shrink-0 whitespace-nowrap"
              style={{
                border: ri === i ? "1px solid rgba(230,0,0,0.4)" : "1px solid rgba(255,255,255,0.08)",
                background: ri === i ? "rgba(230,0,0,0.1)" : "transparent",
                color: ri === i ? "#ff4444" : "#777",
              }}
            >
              {r.icon} {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Greeting */}
      <div className="text-xl font-bold text-white">
        Buongiorno, {seller ? seller.name : ""}
        <span className="text-sm text-slate-600 font-normal ml-2">· {areaLabel}</span>
      </div>

      {/* BLOCCO A — PV e CC vedono il target aziendale, OB no */}
      {(isPV || isCC || isAdm) && <BloccoA data={data} storeId={(isMgr || isSup) ? stB : null} />}

      {/* BLOCCO D+E — Solo Admin */}
      {isAdm && <BloccoDE data={data} />}

      {/* Supervisore: selettore negozio */}
      {isSup && (
        <div className="flex items-center gap-2.5">
          <span className="text-sm text-slate-500">Seleziona negozio:</span>
          {["centocelle", "cinecitta", "trastevere"].map(sid => (
            <button
              key={sid}
              onClick={() => setSupSt(sid)}
              className="py-1.5 px-3.5 rounded-lg text-sm cursor-pointer font-semibold transition-colors"
              style={{
                border: supSt === sid ? "1px solid rgba(66,165,245,0.4)" : "1px solid rgba(255,255,255,0.08)",
                background: supSt === sid ? "rgba(66,165,245,0.1)" : "transparent",
                color: supSt === sid ? "#42A5F5" : "#888",
              }}
            >
              {(STORES.find(s => s.id === sid) || {} as { name?: string }).name || sid}
            </button>
          ))}
        </div>
      )}

      {/* Admin: selettore negozio per Blocco B */}
      {isAdm && (
        <div className="flex items-center gap-2.5">
          <span className="text-sm text-slate-500">Dettaglio negozio:</span>
          <select
            value={admSt}
            onChange={(e) => setAdmSt(e.target.value)}
            className="glass-input text-sm py-1.5 px-2.5 rounded-md cursor-pointer"
          >
            {STORES.map(st => (
              <option key={st.id} value={st.id}>{st.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* BLOCCO B — Solo PV managers e admin */}
      {(isMgr || isSup || isAdm) && <BloccoB data={data} storeId={stB} />}

      {/* BLOCCO C — differenziato per area */}
      {isAdm ? (
        <BloccoCAdmin data={data} />
      ) : isOB ? (
        <BloccoOB data={data} sellerId={role.sellerId} isDirector={isDirector} />
      ) : (
        <div className="flex flex-col gap-6">
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

      {/* Footer */}
      <div className="pt-3 border-t border-white/[0.04] text-sm text-slate-700 flex justify-between">
        <span>Telefutura SRL / Telefutura 2SRL</span>
        <span className="font-mono">Dashboard v1.3</span>
      </div>
    </div>
  );
}
