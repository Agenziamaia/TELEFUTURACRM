"use client";
import { useEffect, useState, useCallback } from "react";

// MONITOR NEGOZI (Luca/Rahib 01/09): salute in tempo reale degli agenti di stampa
// e cassa di ogni negozio. Legge /api/print/health (sessione admin). Verde = ok,
// giallo = agente non risponde (idle o caduto), rosso = agente fermo con una
// vendita in coda (il caso "cliente allo sportello e non stampa"). Auto-refresh 8s.
type Store = {
  negozio: string; custom: boolean; fiscale: boolean; abilitato: boolean;
  agenteVistoSecFa: number | null; pending: number; oldestPendingSec: number | null;
  errori2h: number; ultimoStato: string | null; stato: "ok" | "warn" | "down";
};

const fmtAge = (s: number | null) => s == null ? "—" : s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`;

export function MonitorNegoziView() {
  const [stores, setStores] = useState<Store[] | null>(null);
  const [err, setErr] = useState("");
  const [ts, setTs] = useState<number>(0);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/print/health", { credentials: "include", cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { setErr(j.error || "caricamento fallito"); return; }
      setStores(j.stores); setTs(j.ts || Date.now()); setErr("");
    } catch (e: any) { setErr(String(e?.message || e)); }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);

  const n = { ok: 0, warn: 0, down: 0 };
  (stores || []).forEach((s) => { n[s.stato]++; });

  const COL: Record<string, { bar: string; badge: string; lab: string }> = {
    ok: { bar: "bg-emerald-500", badge: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30", lab: "OK" },
    warn: { bar: "bg-amber-500", badge: "bg-amber-500/15 text-amber-300 border-amber-400/30", lab: "ATTENZIONE" },
    down: { bar: "bg-rose-500", badge: "bg-rose-500/15 text-rose-300 border-rose-400/30", lab: "GIÙ" },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-white">🖥️ Monitor Negozi</h2>
          <p className="text-xs text-slate-400">Stato in tempo reale di agente di stampa e cassa per ogni negozio. Si aggiorna da solo ogni 8s.</p>
        </div>
        <div className="flex gap-2 text-xs font-semibold">
          <span className="px-3 py-1.5 rounded-full bg-rose-500/10 border border-rose-400/30 text-rose-200">🔴 {n.down} giù</span>
          <span className="px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-400/30 text-amber-200">🟡 {n.warn} attenzione</span>
          <span className="px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-400/30 text-emerald-200">🟢 {n.ok} ok</span>
        </div>
      </div>

      {err && <div className="rounded-xl bg-rose-500/10 border border-rose-400/30 px-4 py-2.5 text-sm text-rose-200">Errore: {err}</div>}
      {ts > 0 && <div className="text-[11px] text-slate-500 font-mono">aggiornato {new Date(ts).toLocaleTimeString("it-IT")}</div>}

      {stores == null ? (
        <div className="p-8 text-center text-slate-500">Carico…</div>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {stores.map((s) => {
            const c = COL[s.stato];
            return (
              <div key={s.negozio} className={"relative overflow-hidden rounded-xl border px-4 py-3 "
                + (s.stato === "down" ? "bg-rose-500/[0.07] border-rose-400/30"
                  : s.stato === "warn" ? "bg-amber-500/[0.05] border-amber-400/20"
                    : "bg-white/[0.03] border-white/10")}>
                <span className={"absolute left-0 top-0 bottom-0 w-1 " + c.bar} />
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="font-bold text-white truncate">{s.negozio}</span>
                  <span className={"shrink-0 text-[10px] font-mono font-bold uppercase tracking-wide px-2 py-0.5 rounded border " + c.badge}>{c.lab}</span>
                </div>
                <div className="space-y-1 text-[12px]">
                  <div className="flex justify-between"><span className="text-slate-400">Agente visto</span>
                    <span className={"font-mono " + (s.agenteVistoSecFa == null || s.agenteVistoSecFa > 40 ? "text-amber-300" : "text-slate-200")}>
                      {s.agenteVistoSecFa == null ? "mai" : fmtAge(s.agenteVistoSecFa) + " fa"}</span></div>
                  {s.pending > 0 && <div className="flex justify-between"><span className="text-slate-400">In coda</span>
                    <span className={"font-mono " + ((s.oldestPendingSec ?? 0) > 20 ? "text-rose-300 font-bold" : "text-slate-200")}>
                      {s.pending}{s.oldestPendingSec != null ? " · " + fmtAge(s.oldestPendingSec) : ""}</span></div>}
                  {s.ultimoStato && <div className="flex justify-between"><span className="text-slate-400">Ultimo</span><span className="font-mono text-slate-300 truncate ml-2">{s.ultimoStato}</span></div>}
                </div>
                <div className="flex gap-1.5 mt-2.5">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-slate-400">{s.custom ? "Custom" : "Epson"}</span>
                  <span className={"text-[10px] font-mono px-1.5 py-0.5 rounded border " + (s.abilitato ? (s.fiscale ? "bg-emerald-500/10 border-emerald-400/20 text-emerald-300" : "bg-white/5 border-white/10 text-slate-400") : "bg-white/5 border-white/10 text-slate-500")}>
                    {s.abilitato ? (s.fiscale ? "FISCALE" : "demo") : "off"}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
