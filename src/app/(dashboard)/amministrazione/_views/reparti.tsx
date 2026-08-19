"use client";

import { useEffect, useState } from "react";

/* Reparti & IVA (spec Luca) — SOLO Amministrazione. Sorgente UNICA della mappa
   reparto → aliquota/natura IVA. Il reparto decide l'IVA sul documento fiscale: qui
   si definisce, e il menù Reparto in Catalogo lo legge da qui. ⚠️ Gli RT del negozio
   (.50 e .219) vanno PROGRAMMATI uguali a questa tabella. */

interface Reparto { reparto: number; descrizione: string | null; aliquota: number | null; natura: string | null; attivo: boolean; }

const NATURE = ["", "N1", "N2", "N3", "N4", "N5", "N6", "N7"];
const NATURA_DESC: Record<string, string> = {
    N1: "Escluse art.15", N2: "Non soggette", N3: "Non imponibili", N4: "Esenti",
    N5: "Regime del margine", N6: "Reverse charge", N7: "IVA assolta in altro UE",
};

export function RepartiIvaView() {
    const [rows, setRows] = useState<Reparto[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState("");
    const [dirty, setDirty] = useState(false);
    const [soloAttivi, setSoloAttivi] = useState(false);

    const load = async () => {
        setLoading(true); setMsg("");
        try {
            const res = await fetch("/api/pos/reparti");
            const j = await res.json().catch(() => ({}));
            if (!res.ok || !j.ok) throw new Error(j.error || "caricamento fallito");
            setRows(Array.isArray(j.reparti) ? j.reparti : []);
            setDirty(false);
        } catch (e: any) { setMsg("Errore: " + String(e?.message || e)); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    const upd = (n: number, patch: Partial<Reparto>) => {
        setRows((rs) => rs.map((r) => (r.reparto === n ? { ...r, ...patch } : r)));
        setDirty(true);
    };
    const salva = async () => {
        setSaving(true); setMsg("");
        try {
            const res = await fetch("/api/pos/reparti", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reparti: rows }) });
            const j = await res.json().catch(() => ({}));
            if (!res.ok || !j.ok) throw new Error(j.error || "salvataggio fallito");
            setMsg(`Salvato ✓ (${j.saved} reparti)`); setDirty(false);
        } catch (e: any) { setMsg("Errore: " + String(e?.message || e)); }
        finally { setSaving(false); }
    };

    const view = soloAttivi ? rows.filter((r) => r.attivo) : rows;

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-2">
                <div>
                    <h2 className="text-lg font-bold text-white">🧾 Reparti &amp; IVA</h2>
                    <p className="text-xs text-slate-400">Mappa reparto → aliquota/natura IVA. Il <b>reparto</b> assegnato a un prodotto in Catalogo decide l'IVA sullo scontrino.</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <label className="text-xs text-slate-400 flex items-center gap-1.5"><input type="checkbox" checked={soloAttivi} onChange={(e) => setSoloAttivi(e.target.checked)} /> solo attivi</label>
                    <button onClick={salva} disabled={!dirty || saving} className="primary-btn px-4 py-2 text-sm font-semibold disabled:opacity-40">{saving ? "Salvo…" : "Salva modifiche"}</button>
                </div>
            </div>

            <p className="text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/25 rounded-lg p-2">
                ⚠️ Questa è la <b>sorgente unica</b> in uso dal CRM. Gli RT del negozio (.50 e .219) devono essere <b>programmati uguali</b> (Programmazione → Reparti sulla stampante). Cambiare l'aliquota qui NON riprogramma la stampante.
            </p>
            {msg && <p className={"text-sm rounded-lg p-2 " + (msg.startsWith("Errore") ? "text-rose-300 bg-rose-500/10 border border-rose-500/25" : "text-emerald-300 bg-emerald-500/10 border border-emerald-400/25")}>{msg}</p>}

            {loading ? (
                <p className="text-sm text-slate-400 py-6 text-center animate-pulse">Caricamento…</p>
            ) : (
                <div className="overflow-x-auto rounded-xl border border-white/10">
                    <table className="w-full text-sm min-w-[640px]">
                        <thead>
                            <tr className="text-[11px] uppercase tracking-wide text-slate-500 bg-white/5">
                                <th className="text-center px-3 py-2 w-14">Rep.</th>
                                <th className="text-left px-3 py-2">Descrizione</th>
                                <th className="text-right px-3 py-2 w-24">Aliquota %</th>
                                <th className="text-left px-3 py-2 w-40">Natura (se non IVA)</th>
                                <th className="text-center px-3 py-2 w-20">Attivo</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {view.map((r) => (
                                <tr key={r.reparto} className={"hover:bg-white/[0.03] " + (r.attivo ? "" : "opacity-50")}>
                                    <td className="px-3 py-1.5 text-center text-slate-400 font-mono">{r.reparto}</td>
                                    <td className="px-3 py-1.5">
                                        <input value={r.descrizione ?? ""} onChange={(e) => upd(r.reparto, { descrizione: e.target.value })}
                                            className="w-full rounded-lg bg-white/5 border border-white/10 text-slate-100 text-sm px-2 py-1 outline-none focus:border-violet-400/60" />
                                    </td>
                                    <td className="px-3 py-1.5">
                                        <input type="number" min={0} max={99} step={0.5} value={r.aliquota ?? ""} placeholder="—"
                                            onChange={(e) => upd(r.reparto, { aliquota: e.target.value === "" ? null : Number(e.target.value) })}
                                            className="w-full rounded-lg bg-white/5 border border-white/10 text-slate-100 text-sm text-right px-2 py-1 outline-none focus:border-violet-400/60 tabular-nums" />
                                    </td>
                                    <td className="px-3 py-1.5">
                                        <select value={r.natura ?? ""} onChange={(e) => upd(r.reparto, { natura: e.target.value || null })}
                                            className="w-full rounded-lg bg-white/5 border border-white/10 text-slate-200 text-xs px-2 py-1 outline-none focus:border-violet-400/60">
                                            {NATURE.map((n) => <option key={n} value={n} className="bg-slate-800">{n ? `${n} · ${NATURA_DESC[n]}` : "—"}</option>)}
                                        </select>
                                    </td>
                                    <td className="px-3 py-1.5 text-center">
                                        <input type="checkbox" checked={r.attivo} onChange={(e) => upd(r.reparto, { attivo: e.target.checked })} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <p className="text-[11px] text-slate-500">Aliquota vuota + Natura = voce non IVA (es. regime del margine dell'usato = N5, non soggetta = N2). Compila l'aliquota per le voci con IVA (22 / 10 / 5 / 4).</p>
        </div>
    );
}
