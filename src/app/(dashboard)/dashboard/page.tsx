// @ts-nocheck
"use client";

// Dashboard REALE, role-aware (redesign "bento", Luca 30/07). Dati veri da
// contracts/clients filtrati per ruolo. FASE 1: KPI + grafici + classifica.
// FASE 2: bussola Direzione Inserimento (da Amministrazione). FASE 2b: Obiettivo
// reale dai target Home (dashboard_targets). FASE 3: reminder dinamici (pratiche
// ferme nel Tracking + impegni Calendario in scadenza). FASE 4: layout Home
// personalizzabile — "Modifica" e trascini i blocchi, l'ordine e' salvato per utente.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { roleLabel, seesWholeStore, BRAND_COLORS } from "@/lib/roles";
import { useVisibleStores } from "@/lib/visibleStores";
import { BussolaWidget } from "@/components/DirezioneInserimento";
import {
  FileText, Users, CheckCircle2, Clock, Store as StoreIcon, TrendingUp,
  AlertTriangle, ArrowRight, Loader2, Compass, Target as TargetIcon, Zap,
  Megaphone, Trophy, Search, Plus, ChevronDown, ChevronUp, LayoutGrid,
  Check, GripVertical, CalendarClock,
} from "lucide-react";

const norm = (s) => (s || "").trim().toLowerCase();
const sameStore = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x)); };
const STATO_COLOR = (s = "") => {
  const k = s.toLowerCase();
  if (k.includes("attiv")) return "var(--tf-22c55e)";
  if (k.includes("lavorazione") || k.includes("nuovo")) return "var(--tf-f59e0b)";
  if (k.includes("annull")) return "var(--tf-ef4444)";
  if (k.includes("sospes")) return "var(--tf-f97316)";
  return "var(--tf-64748b)";
};
const brandColor = (b) => BRAND_COLORS[b]?.color || "var(--tf-6366f1)";
const daysAgoISO = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const CLOSED_TASK = ["completato", "fatto", "done", "chiuso", "annullato", "completo"];

// ── UI di base ──────────────────────────────────────────────────────────────
function Kpi({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="glass-card p-4 border-t-2" style={{ borderTopColor: color }}>
      <div className="flex items-center gap-2 text-slate-400 text-[10px] uppercase tracking-widest font-bold mb-2">
        <Icon className="w-3.5 h-3.5" style={{ color }} /> {label}
      </div>
      <p className="text-3xl font-black text-white leading-none">{Number(value).toLocaleString("it-IT")}</p>
      {sub && <p className="text-xs text-slate-500 mt-1.5">{sub}</p>}
    </div>
  );
}

function BarChart({ icon: Icon, title, rows, total, colorFor, accent }) {
  const LIMIT = 4;
  const [exp, setExp] = useState(false);
  const shown = exp ? rows : rows.slice(0, LIMIT);
  return (
    <div className="glass-card overflow-hidden flex flex-col">
      <div className="px-5 py-3.5 border-b border-white/5 flex items-center gap-2">
        <Icon className="w-4 h-4" style={{ color: accent }} />
        <h3 className="text-[13px] font-bold text-slate-200 tracking-wide">{title}</h3>
      </div>
      <div className="p-5 space-y-3.5 flex-1">
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
      </div>
      {rows.length > LIMIT && (
        <div className="px-5 pb-3 -mt-1 flex justify-end">
          <button onClick={() => setExp((v) => !v)} className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-200 transition-colors">
            {exp ? <>Mostra meno <ChevronUp className="w-3.5 h-3.5" /></> : <>Mostra tutti ({rows.length}) <ChevronDown className="w-3.5 h-3.5" /></>}
          </button>
        </div>
      )}
    </div>
  );
}

function WidgetShell({ icon: Icon, title, accent = "var(--tf-818cf8)", action, children }) {
  return (
    <div className="glass-card overflow-hidden flex flex-col">
      <div className="px-5 py-3.5 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2"><Icon className="w-4 h-4" style={{ color: accent }} /><h3 className="text-[13px] font-bold text-slate-200 tracking-wide">{title}</h3></div>
        {action}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

const DEFAULT_ORDER = ["kpi", "charts", "widgets", "leaderboard"];

export default function Dashboard() {
  const { user } = useAuth();
  const { seesAll, stores: myStores, loaded: visLoaded } = useVisibleStores();
  const visKey = myStores.join("|");

  const [all, setAll] = useState([]);          // TUTTI i contratti (per la classifica globale)
  const [comms, setComms] = useState([]);
  const [targets, setTargets] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("month");
  // Filtro ANNO + MESE (Luca 01/08): sostituisce "Tutto". period="custom" con {y,m} (m 0-based).
  const [filtro, setFiltro] = useState<{ y: number; m: number } | null>(null);
  const [filtroOpen, setFiltroOpen] = useState(false);
  const [tmpM, setTmpM] = useState<number>(new Date().getMonth());
  const [tmpY, setTmpY] = useState<number>(new Date().getFullYear());
  const MESI = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
  const ANNI = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  // layout personalizzabile
  const [order, setOrder] = useState(DEFAULT_ORDER);
  const [editMode, setEditMode] = useState(false);
  const [dragKey, setDragKey] = useState(null);

  useEffect(() => {
    if (!user?.id || !visLoaded) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const [{ data: cs }, { data: cm }, { data: tg }, { data: tk }, { data: me }] = await Promise.all([
        supabase.from("contracts").select("id, brand, categoria, prodotto, stato, negozio, venditore, client_id, data_registrazione").order("data_registrazione", { ascending: false }).limit(3000),
        supabase.from("comunicazioni").select("id, title, type, content, target_roles, created_at, date_display").order("created_at", { ascending: false }).limit(8),
        supabase.from("dashboard_targets").select("*"),
        supabase.from("calendar_tasks").select("id, date, status").or(`assigned_user_id.eq.${user.id},created_by_user_id.eq.${user.id}`).limit(500),
        supabase.from("app_users").select("dashboard_layout").eq("id", user.id).maybeSingle(),
      ]);
      if (!alive) return;
      setAll(cs || []); setComms(cm || []); setTargets(tg || []); setTasks(tk || []);
      const l = me?.dashboard_layout;
      if (Array.isArray(l) && l.length) {
        const valid = l.filter((k) => DEFAULT_ORDER.includes(k));
        setOrder([...valid, ...DEFAULT_ORDER.filter((k) => !valid.includes(k))]);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [user?.id, visLoaded, visKey, seesAll]); // eslint-disable-line react-hooks/exhaustive-deps

  const whole = seesWholeStore(user?.role);
  const level = seesAll ? "global" : whole ? "store" : "own";
  const multiStore = seesAll || myStores.length > 1;

  const byPeriod = (list) => {
    if (period === "all") return list;
    if (period === "custom" && filtro) {
      const from = `${filtro.y}-${String(filtro.m + 1).padStart(2, "0")}-01`;
      const ny = filtro.m === 11 ? filtro.y + 1 : filtro.y;
      const nm = filtro.m === 11 ? 0 : filtro.m + 1;
      const to = `${ny}-${String(nm + 1).padStart(2, "0")}-01`;
      return list.filter((c) => { const d = c.data_registrazione || ""; return d >= from && d < to; });
    }
    const now = new Date();
    const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    return list.filter((c) => (c.data_registrazione || "") >= from);
  };

  const scoped = useMemo(() => {
    if (level === "global") return all;
    if (level === "store") return all.filter((c) => myStores.some((s) => sameStore(c.negozio, s)));
    return all.filter((c) => norm(c.venditore) === norm(user?.name));
  }, [all, level, visKey, user?.name]);

  const mine = useMemo(() => byPeriod(scoped), [scoped, period, filtro]);
  const groupBy = (list, key) => {
    const m = {};
    list.forEach((c) => { const k = (c[key] || "—").toString(); m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  };

  const byBrand = useMemo(() => groupBy(mine, "brand"), [mine]);
  const byStato = useMemo(() => groupBy(mine, "stato"), [mine]);
  const terzo = useMemo(() => {
    if (level === "own") return null;
    if (multiStore) return { title: level === "global" ? "Top negozi rete" : "Top negozi area", icon: StoreIcon, rows: groupBy(mine, "negozio").slice(0, 12), color: "var(--tf-a855f7)" };
    return { title: "Top venditori negozio", icon: Users, rows: groupBy(mine, "venditore").slice(0, 12), color: "var(--tf-38bdf8)" };
  }, [mine, level, multiStore]);

  const attivi = mine.filter((c) => /attiv/i.test(c.stato || "")).length;
  const lavorazione = mine.filter((c) => /lavorazione|nuovo/i.test(c.stato || "")).length;
  const clienti = new Set(mine.map((c) => c.client_id).filter(Boolean)).size;

  // FASE 3 — reminder dinamici
  const sevenAgo = daysAgoISO(7);
  const oggi = new Date().toISOString().slice(0, 10);
  const ferme = useMemo(() => scoped.filter((c) => /lavorazione|nuovo/i.test(c.stato || "") && (c.data_registrazione || "9999") < sevenAgo).length, [scoped]);
  const impegni = useMemo(() => tasks.filter((t) => (t.date || "") && (t.date || "") <= oggi && !CLOSED_TASK.includes(norm(t.status))).length, [tasks]);

  // FASE 2b — obiettivo reale
  const targetVal = useMemo(() => {
    const find = (fn) => targets.find(fn)?.valore || 0;
    if (level === "own") return find((x) => x.tipo === "venditore" && norm(x.riferimento) === norm(user?.name));
    if (level === "store") return find((x) => x.tipo === "negozio" && myStores.some((s) => sameStore(x.riferimento, s)));
    return find((x) => x.tipo === "rete");
  }, [targets, level, user?.name, visKey]);
  const targetTitle = level === "own" ? "Il tuo obiettivo" : level === "store" ? (multiStore ? "Target area" : "Target negozio") : "Target rete";
  const targetSub = level === "own" ? "Contratti personali" : level === "store" ? "Contratti del negozio" : "Contratti della rete";
  const perc = targetVal > 0 ? Math.round((mine.length / targetVal) * 100) : 0;

  // Classifica GLOBALE
  const classifica = useMemo(() => {
    const periodAll = byPeriod(all);
    const m = {};
    periodAll.forEach((c) => {
      const v = (c.venditore || "").trim();
      if (!v || v === "—") return;
      if (!m[v]) m[v] = { nome: v, n: 0, negozio: c.negozio || "" };
      m[v].n++;
      if (!m[v].negozio && c.negozio) m[v].negozio = c.negozio;
    });
    return Object.values(m).sort((a, b) => b.n - a.n).slice(0, 10).map((x, i) => ({ ...x, rank: i + 1 }));
  }, [all, period, filtro]);

  const isVenditore = level === "own";
  const commsVisibili = useMemo(() => comms.filter((c) => {
    const tr = c.target_roles;
    if (!tr || (Array.isArray(tr) && tr.length === 0)) return true;
    if (Array.isArray(tr)) return tr.includes(user?.role);
    return true;
  }).slice(0, 4), [comms, user?.role]);

  // ── layout: salva l'ordine per utente ──
  const saveOrder = async (o) => {
    setOrder(o);
    try { await supabase.from("app_users").update({ dashboard_layout: o }).eq("id", user.id); } catch { }
  };
  const onDrop = (targetKey) => {
    if (!dragKey || dragKey === targetKey) { setDragKey(null); return; }
    const o = [...order];
    o.splice(o.indexOf(targetKey), 0, o.splice(o.indexOf(dragKey), 1)[0]);
    saveOrder(o); setDragKey(null);
  };

  if (!user) return null;

  // ── sezioni (rese nell'ordine scelto) ──
  const SECTIONS = {
    kpi: (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={FileText} label="Contratti" value={mine.length} color="var(--tf-6366f1)" sub={period === "month" ? "registrati questo mese" : period === "custom" && filtro ? `registrati a ${MESI[filtro.m].toLowerCase()} ${filtro.y}` : "totali a sistema"} />
        <Kpi icon={CheckCircle2} label="Attivi" value={attivi} color="var(--tf-22c55e)" sub={mine.length ? `${Math.round((attivi / mine.length) * 100)}% del periodo` : "—"} />
        <Kpi icon={Clock} label="In lavorazione" value={lavorazione} color="var(--tf-f59e0b)" sub="da completare" />
        <Kpi icon={Users} label="Clienti" value={clienti} color="var(--tf-a855f7)" sub="serviti nel periodo" />
      </div>
    ),
    charts: (
      <div className={`grid gap-4 ${terzo ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
        <BarChart icon={TrendingUp} title="Per brand" rows={byBrand} total={mine.length} colorFor={brandColor} accent="var(--tf-818cf8)" />
        <BarChart icon={AlertTriangle} title="Per stato" rows={byStato} total={mine.length} colorFor={STATO_COLOR} accent="var(--tf-f59e0b)" />
        {terzo && <BarChart icon={terzo.icon} title={terzo.title} rows={terzo.rows} total={mine.length} colorFor={() => terzo.color} accent={terzo.color} />}
      </div>
    ),
    widgets: (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {/* Direzione Inserimento (bussola, sola lettura) */}
        <WidgetShell icon={Compass} title="Direzione inserimento" accent="var(--tf-38bdf8)"
          action={!seesAll && myStores[0] ? <span className="text-[10px] text-slate-500">{myStores[0]}</span> : null}>
          <BussolaWidget negozio={seesAll ? (myStores[0] || user.negozio) : (user.negozio || myStores[0])} />
        </WidgetShell>

        {/* Obiettivo (reale dai target Home) */}
        <WidgetShell icon={TargetIcon} title={targetTitle} accent="var(--tf-818cf8)" action={<span className="text-[10px] text-slate-500">{period === "month" ? "Mese corrente" : period === "custom" && filtro ? `${MESI[filtro.m]} ${filtro.y}` : "Totale"}</span>}>
          <div className="p-5">
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

        {/* Azioni e To-Do (reminder dinamici) */}
        <WidgetShell icon={Zap} title="Azioni e to-do" accent="var(--tf-818cf8)">
          <div className="p-4 grid grid-cols-2 gap-2 border-b border-white/5">
            <Link href="/registra-vendita" className="flex items-center justify-center gap-1.5 rounded-lg bg-indigo-500/12 border border-indigo-500/25 text-indigo-300 text-[11px] font-bold py-2 hover:bg-indigo-500/20"><Plus className="w-3.5 h-3.5" /> Nuova Vendita</Link>
            <Link href="/clienti" className="flex items-center justify-center gap-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-[11px] font-bold py-2 hover:bg-white/10"><Search className="w-3.5 h-3.5" /> Trova Cliente</Link>
          </div>
          <div className="p-4 space-y-2">
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

        {/* Bacheca Aziendale */}
        <WidgetShell icon={Megaphone} title="Bacheca aziendale" accent="var(--tf-38bdf8)"
          action={!isVenditore ? <Link href="/comunicazioni" className="text-[10px] font-bold text-sky-300 bg-sky-500/10 px-2 py-1 rounded-md hover:bg-sky-500/20 flex items-center gap-1"><Plus className="w-3 h-3" /> Nuovo</Link> : null}>
          <div className="p-4 space-y-3 overflow-y-auto max-h-[220px]">
            {commsVisibili.length === 0 ? <p className="text-xs text-slate-500 text-center py-4">Nessun annuncio.</p> :
              commsVisibili.map((c) => (
                <div key={c.id} className="border-b border-white/5 last:border-0 pb-2.5 last:pb-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ color: /urgent/i.test(c.type || "") ? "var(--tf-f87171)" : "var(--tf-34d399)", background: /urgent/i.test(c.type || "") ? "rgba(239,68,68,.15)" : "rgba(16,185,129,.15)" }}>{c.type || "Info"}</span>
                    <span className="text-[10px] text-slate-600">{c.date_display || ""}</span>
                  </div>
                  <div className="text-xs font-semibold text-slate-100">{c.title}</div>
                  {c.content && <div className="text-[11px] text-slate-400 line-clamp-2">{c.content}</div>}
                </div>
              ))}
          </div>
        </WidgetShell>
      </div>
    ),
    leaderboard: (
      <div className="glass-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-400" /><h3 className="text-[13px] font-bold text-slate-200 tracking-wide">Classifica generale venditori</h3></div>
          <span className="text-[10px] text-slate-500">Per numero contratti · € con le provvigioni (in arrivo)</span>
        </div>
        <div className="overflow-x-auto">
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
              {classifica.length === 0 ? (
                <tr><td colSpan={4} className="py-8 text-center text-slate-500 text-sm">Nessun contratto nel periodo.</td></tr>
              ) : classifica.map((v) => {
                const isMe = isVenditore && norm(v.nome) === norm(user.name);
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
    ),
  };
  const SECTION_LABEL = { kpi: "Indicatori", charts: "Grafici", widgets: "Widget", leaderboard: "Classifica" };

  return (
    <div className="space-y-5">
      {/* HEADER */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-white">Ciao, {(user.name || "").split(" ")[0] || "—"}</h1>
          <p className="text-sm text-slate-500">{roleLabel(user.role)}{seesAll ? " · tutti i negozi" : myStores.length ? ` · ${myStores.join(", ")}` : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setEditMode((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${editMode ? "bg-emerald-500 text-white border-emerald-500" : "bg-white/5 text-slate-400 border-white/10 hover:text-white hover:bg-white/10"}`}>
            {editMode ? <><Check className="w-3.5 h-3.5" /> Fatto</> : <><LayoutGrid className="w-3.5 h-3.5" /> Modifica</>}
          </button>
          <div className="flex gap-1 p-1 rounded-lg bg-white/5 border border-white/10 relative">
            <button onClick={() => { setPeriod("month"); setFiltroOpen(false); }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${period === "month" ? "bg-indigo-500 text-white" : "text-slate-400 hover:text-white"}`}>Questo mese</button>
            <button onClick={() => { if (filtro) { setTmpM(filtro.m); setTmpY(filtro.y); } setFiltroOpen((o) => !o); }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors flex items-center gap-1 ${period === "custom" || period === "all" ? "bg-indigo-500 text-white" : "text-slate-400 hover:text-white"}`}>
              {period === "custom" && filtro ? `${MESI[filtro.m]} ${filtro.y}` : period === "all" ? "Tutto" : "Filtro"} <span className="text-[9px]">▾</span>
            </button>
            {filtroOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setFiltroOpen(false)} />
                <div className="absolute right-0 top-full mt-2 z-30 w-60 glass-card p-3 space-y-2.5 border-white/10 shadow-2xl">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Scegli mese e anno</div>
                  <div className="flex gap-2">
                    <select value={tmpM} onChange={(e) => setTmpM(parseInt(e.target.value))} className="glass-input !h-9 text-xs flex-1">
                      {MESI.map((mm, i) => <option key={i} value={i}>{mm}</option>)}
                    </select>
                    <select value={tmpY} onChange={(e) => setTmpY(parseInt(e.target.value))} className="glass-input !h-9 text-xs w-[84px]">
                      {ANNI.map((yy) => <option key={yy} value={yy}>{yy}</option>)}
                    </select>
                  </div>
                  <button onClick={() => { setFiltro({ y: tmpY, m: tmpM }); setPeriod("custom"); setFiltroOpen(false); }}
                    className="w-full py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold">Applica</button>
                  <button onClick={() => { setPeriod("all"); setFiltro(null); setFiltroOpen(false); }}
                    className="w-full text-[11px] text-slate-500 hover:text-slate-300 transition-colors">oppure mostra tutto lo storico</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {editMode && (
        <div className="glass-card px-4 py-2.5 flex items-center gap-2 text-xs text-indigo-200 bg-indigo-500/10 border-indigo-500/25">
          <GripVertical className="w-4 h-4" /> Trascina i blocchi per riordinare la tua Home. L'ordine viene salvato solo per te.
        </div>
      )}

      {loading ? (
        <div className="glass-card p-10 flex items-center justify-center gap-2 text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /> Caricamento dati…</div>
      ) : (
        <div className="space-y-5">
          {order.map((key) => (
            <div key={key}
              draggable={editMode}
              onDragStart={() => setDragKey(key)}
              onDragOver={(e) => { if (editMode) e.preventDefault(); }}
              onDrop={() => onDrop(key)}
              className={editMode ? `relative rounded-2xl p-2 border-2 border-dashed transition-colors cursor-grab active:cursor-grabbing ${dragKey === key ? "border-indigo-400 bg-indigo-500/5" : "border-white/15 hover:border-indigo-500/40"}` : ""}>
              {editMode && (
                <div className="absolute -top-2.5 left-4 z-10 flex items-center gap-1 text-[10px] font-bold bg-indigo-500 text-white px-2 py-0.5 rounded-full shadow-lg">
                  <GripVertical className="w-3 h-3" /> {SECTION_LABEL[key]}
                </div>
              )}
              <div className={editMode ? "pointer-events-none opacity-95" : ""}>{SECTIONS[key]}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
