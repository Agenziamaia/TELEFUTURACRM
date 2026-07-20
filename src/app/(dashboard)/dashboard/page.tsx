// @ts-nocheck
"use client";

// Dashboard REALE: ogni numero qui nasce da una query su contracts/clients.
// La versione precedente era un mockup (generateMockData + Math.random) con negozi,
// venditori e persino un selettore di ruolo finti: mostrava produzione e percentuali
// che non esistevano nel CRM. I target NON vengono stimati: se non sono configurati
// lo diciamo, non li inventiamo.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { seesAllStores, roleLabel } from "@/lib/roles";
import {
  FileText, Users, CheckCircle2, Clock, Store as StoreIcon,
  TrendingUp, AlertTriangle, ArrowRight, Loader2,
} from "lucide-react";

const norm = (s) => (s || "").trim().toLowerCase();
const sameStore = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x)); };
const fmtDate = (s) => { if (!s) return "—"; const d = new Date(s); return isNaN(d.getTime()) ? s : d.toLocaleDateString("it-IT"); };

const STATO_COLOR = (s = "") => {
  const k = s.toLowerCase();
  if (k.includes("attiv")) return "#22c55e";
  if (k.includes("lavorazione") || k.includes("nuovo")) return "#f59e0b";
  if (k.includes("annull")) return "#ef4444";
  if (k.includes("sospes")) return "#f97316";
  return "#64748b";
};

function Bars({ rows, total, colorFor }) {
  if (!rows.length) return <p className="text-sm text-slate-500 py-3">Nessun dato.</p>;
  return (
    <div className="space-y-2.5">
      {rows.map(([label, n]) => (
        <div key={label}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-300 truncate">{label}</span>
            <span className="font-mono text-slate-400">{n}</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div className="h-full rounded-full transition-all"
              style={{ width: `${total ? (n / total) * 100 : 0}%`, background: colorFor ? colorFor(label) : "#6366f1" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="glass-card p-4 border-l-2" style={{ borderLeftColor: color }}>
      <div className="flex items-center gap-2 text-slate-400 text-[11px] uppercase tracking-wider mb-1.5">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <p className="text-3xl font-bold text-white leading-none">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1.5">{sub}</p>}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [contracts, setContracts] = useState([]);
  const [clientCount, setClientCount] = useState(0);
  const [myStores, setMyStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("month");

  const seesAll = !!user && (seesAllStores(user.role) || user.role === "dev");

  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    (async () => {
      setLoading(true);
      // ambito negozi dell'utente (stessa logica dell'assistente AI)
      let stores = [];
      if (!seesAll) {
        const [{ data: us }, { data: vis }] = await Promise.all([
          supabase.from("user_stores").select("store_name").eq("user_id", user.id),
          supabase.from("user_store_visibility").select("store_name").eq("user_id", user.id),
        ]);
        const set = new Set();
        if (user.negozio) set.add(user.negozio);
        (us || []).forEach((r) => r.store_name && set.add(r.store_name));
        (vis || []).forEach((r) => r.store_name && set.add(r.store_name));
        stores = [...set];
      }
      const [{ data: cs }, { count: cc }] = await Promise.all([
        supabase.from("contracts")
          .select("id, brand, categoria, prodotto, stato, negozio, venditore, data_registrazione")
          .order("data_registrazione", { ascending: false }).limit(2000),
        supabase.from("clients").select("id", { count: "exact", head: true }),
      ]);
      if (!alive) return;
      const rows = (cs || []).filter((c) => seesAll || stores.some((s) => sameStore(c.negozio, s)));
      setMyStores(stores); setContracts(rows); setClientCount(cc || 0); setLoading(false);
    })();
    return () => { alive = false; };
  }, [user?.id, seesAll]);

  const inPeriod = useMemo(() => {
    if (period === "all") return contracts;
    const now = new Date();
    const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    return contracts.filter((c) => (c.data_registrazione || "") >= from);
  }, [contracts, period]);

  const group = (key) => {
    const m = {};
    inPeriod.forEach((c) => { const k = (c[key] || "—").toString(); m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  };
  const byBrand = useMemo(() => group("brand"), [inPeriod]);
  const byStato = useMemo(() => group("stato"), [inPeriod]);
  const byNegozio = useMemo(() => group("negozio"), [inPeriod]);
  const byVenditore = useMemo(() => group("venditore"), [inPeriod]);

  const attivi = inPeriod.filter((c) => (c.stato || "").toLowerCase().includes("attiv")).length;
  const lavorazione = inPeriod.filter((c) => /lavorazione|nuovo/i.test(c.stato || "")).length;
  const problemi = inPeriod.filter((c) => /annull|sospes/i.test(c.stato || "")).length;

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Ciao, {(user.name || "").split(" ")[0] || "—"}</h1>
          <p className="text-sm text-slate-400">
            {roleLabel(user.role)}
            {seesAll ? " · tutti i negozi" : myStores.length ? ` · ${myStores.join(", ")}` : " · nessun negozio assegnato"}
          </p>
        </div>
        <div className="flex gap-1 p-1 rounded-lg bg-white/5 border border-white/10">
          {[["month", "Questo mese"], ["all", "Tutto"]].map(([id, lab]) => (
            <button key={id} onClick={() => setPeriod(id)}
              className={`px-3 py-1.5 rounded-md text-xs transition-colors ${period === id ? "bg-indigo-500 text-white" : "text-slate-400 hover:text-white"}`}>
              {lab}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="glass-card p-10 flex items-center justify-center gap-2 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" /> Caricamento dati…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi icon={FileText} label="Contratti" value={inPeriod.length} color="#6366f1"
              sub={period === "month" ? "registrati questo mese" : "totali a sistema"} />
            <Kpi icon={CheckCircle2} label="Attivi" value={attivi} color="#22c55e"
              sub={inPeriod.length ? `${Math.round((attivi / inPeriod.length) * 100)}% del periodo` : "—"} />
            <Kpi icon={Clock} label="In lavorazione" value={lavorazione} color="#f59e0b" sub="da completare" />
            <Kpi icon={Users} label="Clienti" value={clientCount} color="#a855f7" sub="in anagrafica" />
          </div>

          {inPeriod.length === 0 && (
            <div className="glass-card p-8 text-center">
              <FileText className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-300 font-medium">Nessun contratto {period === "month" ? "questo mese" : "a sistema"}</p>
              <p className="text-sm text-slate-500 mt-1">
                {period === "month"
                  ? "Prova a selezionare “Tutto”, oppure registra un contratto."
                  : "Registra il primo contratto per popolare la dashboard."}
              </p>
              <Link href="/registra-contratto" className="primary-btn inline-flex items-center gap-2 mt-4">
                Registra Contratto <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}

          {inPeriod.length > 0 && (
            <>
              <div className="grid lg:grid-cols-2 gap-4">
                <div className="glass-card p-5">
                  <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-indigo-400" /> Per brand
                  </h3>
                  <Bars rows={byBrand} total={inPeriod.length} />
                </div>
                <div className="glass-card p-5">
                  <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" /> Per stato
                  </h3>
                  <Bars rows={byStato} total={inPeriod.length} colorFor={STATO_COLOR} />
                  {problemi > 0 && (
                    <p className="text-xs text-rose-300 mt-3">{problemi} contratti annullati o sospesi nel periodo.</p>
                  )}
                </div>
              </div>

              <div className="grid lg:grid-cols-2 gap-4">
                {seesAll && (
                  <div className="glass-card p-5">
                    <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                      <StoreIcon className="w-4 h-4 text-emerald-400" /> Per negozio
                    </h3>
                    <Bars rows={byNegozio} total={inPeriod.length} colorFor={() => "#10b981"} />
                  </div>
                )}
                <div className="glass-card p-5">
                  <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                    <Users className="w-4 h-4 text-sky-400" /> Per venditore
                  </h3>
                  <Bars rows={byVenditore} total={inPeriod.length} colorFor={() => "#0ea5e9"} />
                </div>
              </div>

              <div className="glass-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white">Ultimi contratti</h3>
                  <Link href="/ricerca-contratto" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                    Vedi tutti <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wider text-slate-500 border-b border-white/5">
                        <th className="text-left py-2 font-medium">Data</th>
                        <th className="text-left py-2 font-medium">Brand</th>
                        <th className="text-left py-2 font-medium">Prodotto</th>
                        <th className="text-left py-2 font-medium">Negozio</th>
                        <th className="text-left py-2 font-medium">Venditore</th>
                        <th className="text-left py-2 font-medium">Stato</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inPeriod.slice(0, 10).map((c) => (
                        <tr key={c.id} className="border-b border-white/5 last:border-0">
                          <td className="py-2 text-slate-400 whitespace-nowrap">{fmtDate(c.data_registrazione)}</td>
                          <td className="py-2 text-slate-200">{c.brand || "—"}</td>
                          <td className="py-2 text-slate-400">{c.prodotto || c.categoria || "—"}</td>
                          <td className="py-2 text-slate-400">{c.negozio || "—"}</td>
                          <td className="py-2 text-slate-400">{c.venditore || "—"}</td>
                          <td className="py-2">
                            <span className="px-2 py-0.5 rounded-md text-[11px] border"
                              style={{ color: STATO_COLOR(c.stato), borderColor: STATO_COLOR(c.stato) + "55", background: STATO_COLOR(c.stato) + "18" }}>
                              {c.stato || "—"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* I target vivono nel modulo Gare/Target: qui non vengono stimati. */}
          <div className="glass-card p-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-400">
              Obiettivi e soglie non sono calcolati in questa pagina: si configurano nel modulo Gare/Target.
            </p>
            {seesAll && (
              <Link href="/gare" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                Apri Gare <ArrowRight className="w-3 h-3" />
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}
