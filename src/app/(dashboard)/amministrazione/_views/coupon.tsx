"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { isAdminOrAbove } from "@/lib/roles";

/* Lista coupon (spec Francesco) — SOLO Amministrazione. Elenco dei coupon sconto
   emessi dai ritiri usati: emessi/attivi, riscattati, scaduti, annullati, con valore
   e residuo. Sola lettura (la redenzione avviene in cassa). "Scaduto" è derivato
   (attivo + scadenza superata); finché non c'è una policy di validità, `scadenza` è
   NULL e nessun coupon risulta scaduto. */

interface Coupon {
    code: string; valore: number; valore_residuo: number; stato: string;
    negozio: string | null; origine: string; cliente: string | null;
    parent_code: string | null; created_by: string | null; created_at: string;
    redeemed_at: string | null; redeemed_ref: string | null; scadenza: string | null;
    scaduto?: boolean;
}

const eur = (n: number | null) => "€ " + (Number(n) || 0).toFixed(2).replace(".", ",");
const dt = (s: string | null) => { if (!s) return "—"; try { return new Date(s).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch { return "—"; } };

type Filtro = "tutti" | "attivo" | "usato" | "scaduto" | "annullato";
const statoDi = (c: Coupon): Filtro => c.stato === "usato" ? "usato" : c.stato === "annullato" ? "annullato" : c.scaduto ? "scaduto" : "attivo";
const BADGE: Record<Filtro, { label: string; cls: string }> = {
    tutti: { label: "Tutti", cls: "" },
    attivo: { label: "Emesso · attivo", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30" },
    usato: { label: "Riscattato", cls: "bg-sky-500/15 text-sky-300 border-sky-400/30" },
    scaduto: { label: "Scaduto", cls: "bg-amber-500/15 text-amber-300 border-amber-400/30" },
    annullato: { label: "Annullato", cls: "bg-slate-500/15 text-slate-400 border-slate-400/30" },
};

export function CouponView() {
    const [coupons, setCoupons] = useState<Coupon[]>([]);
    const [loading, setLoading] = useState(true);
    const [errore, setErrore] = useState("");
    const [filtro, setFiltro] = useState<Filtro>("tutti");
    const [q, setQ] = useState("");
    /* ANNULLARE UN COUPON (Luca 31/08: «dammi la possibilità, dall'amministrativo
       in su, di poter cancellare dei codici coupon»). Il permesso vero lo
       ricontrolla il server leggendo il ruolo dal database: qui si decide solo
       se il pulsante si vede. */
    const { user } = useAuth();
    const puoAnnullare = isAdminOrAbove(user?.role);
    const [annullando, setAnnullando] = useState<string | null>(null);

    const carica = useCallback(async () => {
        setLoading(true); setErrore("");
        try {
            const res = await fetch("/api/vendita/coupon");
            const j = await res.json().catch(() => ({}));
            if (!res.ok || !j.ok) throw new Error(j.error || "caricamento fallito");
            setCoupons(Array.isArray(j.coupons) ? j.coupons : []);
        } catch (e: any) { setErrore(String(e?.message || e)); }
        finally { setLoading(false); }
    }, []);
    useEffect(() => { carica(); }, [carica]);

    const annulla = async (code: string, valore: number) => {
        /* IL PERCHÉ SI SCRIVE. Un coupon è un impegno verso un cliente che ha
           lasciato un telefono: se un giorno si presenta col foglietto in mano,
           la riga deve dire quanto valeva e perché è stato tolto. */
        const motivo = window.prompt(`Annullare ${code} (${eur(valore)})?\n\nScrivi il perché: resta scritto accanto al coupon.`, "");
        if (motivo === null) return;
        setAnnullando(code);
        try {
            const res = await fetch("/api/vendita/coupon", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "annulla", code, motivo }),
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok || !j.ok) throw new Error(j.error || "annullamento non riuscito");
            await carica();
        } catch (e: any) { window.alert("Non sono riuscito ad annullarlo: " + String(e?.message || e)); }
        finally { setAnnullando(null); }
    };

    const stats = useMemo(() => {
        const s = { emessi: 0, attivi: 0, riscattati: 0, scaduti: 0, annullati: 0, valEmesso: 0, valResiduo: 0 };
        for (const c of coupons) {
            s.emessi++;
            s.valEmesso += Number(c.valore) || 0;
            const st = statoDi(c);
            if (st === "attivo") { s.attivi++; s.valResiduo += Number(c.valore_residuo) || 0; }
            else if (st === "usato") s.riscattati++;
            else if (st === "scaduto") s.scaduti++;
            else if (st === "annullato") s.annullati++;
        }
        return s;
    }, [coupons]);

    const rows = useMemo(() => {
        const s = q.trim().toLowerCase();
        return coupons.filter((c) => {
            if (filtro !== "tutti" && statoDi(c) !== filtro) return false;
            if (s && !(`${c.code} ${c.cliente || ""} ${c.negozio || ""}`.toLowerCase().includes(s))) return false;
            return true;
        });
    }, [coupons, filtro, q]);

    const Stat = ({ label, val, cls }: { label: string; val: string | number; cls?: string }) => (
        <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
            <div className={"text-lg font-bold tabular-nums " + (cls || "text-white")}>{val}</div>
            <div className="text-[11px] text-slate-400">{label}</div>
        </div>
    );

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-lg font-bold text-white">🎟️ Coupon sconto</h2>
                <p className="text-xs text-slate-400">Coupon emessi dai ritiri usati, spesi in cassa come sconto. Sola lettura.</p>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                <Stat label="Emessi" val={stats.emessi} />
                <Stat label="Attivi" val={stats.attivi} cls="text-emerald-300" />
                <Stat label="Riscattati" val={stats.riscattati} cls="text-sky-300" />
                <Stat label="Scaduti" val={stats.scaduti} cls="text-amber-300" />
                <Stat label="Val. emesso" val={eur(stats.valEmesso)} />
                <Stat label="Residuo attivo" val={eur(stats.valResiduo)} cls="text-emerald-300" />
            </div>

            <div className="flex flex-wrap items-center gap-2">
                {(["tutti", "attivo", "usato", "scaduto", "annullato"] as Filtro[]).map((f) => (
                    <button key={f} onClick={() => setFiltro(f)}
                        className={"px-3 py-1.5 rounded-lg text-xs font-semibold border transition " + (filtro === f ? "bg-violet-500/25 border-violet-400/50 text-white" : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10")}>
                        {f === "tutti" ? "Tutti" : BADGE[f].label}
                    </button>
                ))}
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca codice / cliente / negozio…"
                    className="flex-1 min-w-[180px] rounded-lg bg-white/5 border border-white/10 text-slate-100 text-sm px-3 py-1.5 outline-none focus:border-violet-400/60" />
            </div>

            {errore && <p className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-lg p-2">{errore}</p>}
            {loading ? (
                <p className="text-sm text-slate-400 py-6 text-center animate-pulse">Caricamento…</p>
            ) : (
                <div className="overflow-x-auto rounded-xl border border-white/10">
                    <table className="w-full text-sm min-w-[720px]">
                        <thead>
                            <tr className="text-[11px] uppercase tracking-wide text-slate-500 bg-white/5">
                                <th className="text-left px-3 py-2">Codice</th>
                                <th className="text-right px-3 py-2">Valore</th>
                                <th className="text-right px-3 py-2">Residuo</th>
                                <th className="text-left px-3 py-2">Stato</th>
                                <th className="text-left px-3 py-2">Cliente</th>
                                <th className="text-left px-3 py-2">Negozio</th>
                                <th className="text-left px-3 py-2">Emesso</th>
                                <th className="text-left px-3 py-2">Riscattato</th>
                                {puoAnnullare && <th className="px-3 py-2" />}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {rows.map((c) => {
                                const st = statoDi(c);
                                return (
                                    <tr key={c.code} className="hover:bg-white/[0.03]">
                                        <td className="px-3 py-2 font-mono text-slate-100 whitespace-nowrap">{c.code}{c.origine === "residuo" && <span className="ml-1 text-[10px] text-slate-500" title={"resto di " + c.parent_code}>↩ resto</span>}</td>
                                        <td className="px-3 py-2 text-right tabular-nums text-slate-200">{eur(c.valore)}</td>
                                        <td className="px-3 py-2 text-right tabular-nums text-slate-300">{eur(c.valore_residuo)}</td>
                                        <td className="px-3 py-2"><span className={"px-2 py-0.5 rounded-full text-[11px] font-semibold border " + BADGE[st].cls}>{BADGE[st].label}</span></td>
                                        <td className="px-3 py-2 text-slate-300 truncate max-w-[160px]">{c.cliente || "—"}</td>
                                        <td className="px-3 py-2 text-slate-400">{c.negozio || "—"}</td>
                                        <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{dt(c.created_at)}</td>
                                        <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{dt(c.redeemed_at)}</td>
                                        {puoAnnullare && (
                                            <td className="px-3 py-2 text-right whitespace-nowrap">
                                                {/* solo su quelli ANCORA VALIDI: uno già riscattato ha
                                                    scontato dei soldi a qualcuno, e non si riscrive */}
                                                {st === "attivo" && (
                                                    <button onClick={() => annulla(c.code, c.valore_residuo)} disabled={annullando === c.code}
                                                        className="text-[11px] px-2 py-1 rounded-md bg-rose-500/15 border border-rose-500/40 text-rose-300 hover:bg-rose-500/25 font-bold disabled:opacity-40">
                                                        {annullando === c.code ? "…" : "Annulla"}
                                                    </button>
                                                )}
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                            {!rows.length && <tr><td colSpan={puoAnnullare ? 9 : 8} className="px-3 py-6 text-center text-slate-500">Nessun coupon.</td></tr>}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
