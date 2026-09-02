"use client";
import { useEffect, useState, useCallback } from "react";
import { cn } from "@/utils";

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

function PuliziaTransito() {
  const [dati, setDati] = useState<{ tutti: number; daTogliere: number; mb: number; sessioniVive: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [esito, setEsito] = useState("");
  const guarda = useCallback(async () => {
    setEsito("");
    const r = await fetch("/api/file/transito").then((x) => x.json()).catch(() => null);
    if (r?.ok) setDati(r); else setEsito(r?.error || "non riesco a contarli");
  }, []);
  useEffect(() => { guarda(); }, [guarda]);
  const pulisci = async () => {
    if (!dati?.daTogliere || busy) return;
    if (!window.confirm(`Cancellare ${dati.daTogliere} file di transito (${dati.mb} MB)?\n\nSono le copie di passaggio dei documenti fotografati col QR: il documento vero è già dentro la vendita. Restano fuori i file delle sessioni ancora aperte.\n\nNon si torna indietro.`)) return;
    setBusy(true); setEsito("");
    try {
      const r = await fetch("/api/file/transito", { method: "POST" }).then((x) => x.json());
      setEsito(r?.ok ? `✓ Tolti ${r.tolti} file (${r.mb} MB)` : `Non tolti: ${r?.error || (r?.errori || []).join(" · ")}`);
      await guarda();
    } finally { setBusy(false); }
  };
  if (!dati) return null;
  return (
    <div className="glass-card rounded-2xl p-4 mt-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[240px]">
          <div className="text-sm font-bold text-white">🧹 Documenti di transito (QR)</div>
          <div className="rvNota-s mt-1">
            Le copie di passaggio dei documenti fotografati col telefono: il documento vero è già dentro la
            vendita, queste vanno tolte appena importate. {dati.sessioniVive > 0 ? <>Le {dati.sessioniVive} sessioni ancora aperte non si toccano.</> : null}
          </div>
        </div>
        <div className="text-right">
          <div className={cn("text-2xl font-black tabular-nums", dati.daTogliere > 0 ? "text-amber-300" : "text-emerald-300")}>{dati.daTogliere}</div>
          <div className="text-[11px] text-slate-500">da togliere · {dati.mb} MB</div>
        </div>
        {dati.daTogliere > 0 && (
          <button onClick={pulisci} disabled={busy} className="rvPill rvPill-tinta rvT-rosso">
            {busy ? "tolgo…" : "🧹 Svuota adesso"}
          </button>
        )}
      </div>
      {esito && <div className="rvNota-s mt-2">{esito}</div>}
    </div>
  );
}

export function MonitorNegoziView() {
  const [stores, setStores] = useState<Store[] | null>(null);
  const [err, setErr] = useState("");
  const [ts, setTs] = useState<number>(0);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/print/health", { credentials: "include", cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { setErr(j.error || "caricamento fallito"); return; }
      setStores(j.stores); setTs(j.ts || Date.now()); setErr("");
    } catch (e: any) { setErr(String(e?.message || e)); }
  }, []);

  // Interruttore demo/fiscale direttamente dalla card (stesso endpoint del pannello
  // Cassa & Scontrini). Fiscale = documenti commerciali VERI → si conferma prima.
  const cambiaModalita = useCallback(async (negozio: string, fiscale: boolean) => {
    const msg = fiscale
      ? `Accendere il FISCALE su «${negozio}»?\n\nDa questo momento emette documenti commerciali VERI (non più prova).`
      : `Rimettere «${negozio}» in PROVA (demo, non fiscale)?`;
    if (!window.confirm(msg)) return;
    setBusy(negozio);
    try {
      const r = await fetch("/api/vendita/modalita-fiscale", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ negozio, fiscale }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "non riuscito");
      await load();
    } catch (e: any) { setErr(String(e?.message || e)); }
    finally { setBusy(""); }
  }, [load]);

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
          /* ═══ I FILE DI TRANSITO RIMASTI INDIETRO ═══════════════════════════════
   Il deposito dei documenti fotografati col QR è di PASSAGGIO: il file arriva,
   il computer del negozio se lo prende e lo mette dentro la vendita, e la
   copia va cancellata subito. Dal 31/08 quella cancellazione non avveniva più
   — 481 file, 516 MB rimasti lì. Il meccanismo è riparato; questo riquadro
   serve a togliere l'arretrato, e a far vedere il numero così non ricresce in
   silenzio. */

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
                {s.abilitato && (
                  <button onClick={() => cambiaModalita(s.negozio, !s.fiscale)} disabled={busy === s.negozio}
                    title={s.fiscale ? "Rimetti in prova (demo)" : "Accendi il fiscale (documenti veri)"}
                    className={"mt-2 w-full text-[11px] font-bold py-1.5 rounded border transition-colors disabled:opacity-40 "
                      + (s.fiscale
                        ? "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                        : "bg-emerald-500/15 border-emerald-400/40 text-emerald-200 hover:bg-emerald-500/25")}>
                    {busy === s.negozio ? "…" : s.fiscale ? "↩ Rimetti in prova" : "▶ Accendi il fiscale"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      <PuliziaTransito />
    </div>
  );
}
