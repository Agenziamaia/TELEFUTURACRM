"use client";

/* GARE W3 PER PUNTO VENDITA — lato azienda (Luca 13/08, cantiere W3 in
   terminal). Tre segmenti con le regole di luglio:
     🏪 Franchising    — gara sul SINGOLO punto vendita (5 PDV, soglie dal
                          foglio Target mensile W3)
     🏬 Multibrand     — gara unica (Donna Olimpia): soglie dalla lettera
                          «Incentivazione Multibrand» (T1)
     🏬 Multibrand T2  — 2 punti vendita: 1° POS a soglie piene, POS
                          successivi scontati del 15% come da lettera
   Le soglie arrivano da lettera/Target ma sono RITOCCABILI a mano: la cella
   modificata mostra «modificata» piccolo sotto (originale conservato in
   *_lettera, ↺ per tornarci). Luce & Gas, Business P.IVA e Assicurazioni
   valgono SOLO per il franchising: sui multibrand qui contano Mobile e Fisso. */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { dbError, notify } from "../../amministrazione/_views/toast";
import { cn } from "@/utils";

interface TargetPdv {
    id: string; cod_gara: string; negozio: string;
    peso_mobile: number | null; peso_fix: number | null;
    cluster_mobile: string | null; soglie_mobile: number[] | null; soglie_mobile_lettera: number[] | null;
    cluster_fisso: string | null; soglie_fisso: number[] | null; soglie_fisso_lettera: number[] | null;
}
interface NegozioSeg { gara: string; store_name: string }

const SEGMENTI = [
    { id: "franchising", label: "🏪 Franchising", regola: "gara sul singolo punto vendita" },
    { id: "multibrand", label: "🏬 Multibrand", regola: "gara unica (T1)" },
    { id: "multibrand_t2", label: "🏬 Multibrand T2", regola: "2 punti vendita — POS dopo il primo a −15%" },
] as const;

export function W3PdvPanel({ mese, colore }: { mese: string; colore: string }) {
    const monthISO = `${mese}-01`;
    const [targets, setTargets] = useState<TargetPdv[]>([]);
    const [negozi, setNegozi] = useState<NegozioSeg[]>([]);
    const [seg, setSeg] = useState<string>("franchising");
    const [pdvSel, setPdvSel] = useState<string>("");
    // modifiche manuali in corso: chiave `${targetId}|${campo}|${idx}` → testo
    const [draft, setDraft] = useState<Record<string, string>>({});

    const carica = async () => {
        const [t, n] = await Promise.all([
            supabase.from("pay_target_pdv").select("id, cod_gara, negozio, peso_mobile, peso_fix, cluster_mobile, soglie_mobile, soglie_mobile_lettera, cluster_fisso, soglie_fisso, soglie_fisso_lettera").eq("brand", "windtre").eq("month", monthISO).order("negozio"),
            supabase.from("gare_azienda_negozi").select("gara, store_name").eq("brand", "w3").eq("month", monthISO).order("store_name"),
        ]);
        setTargets((t.data ?? []) as TargetPdv[]);
        setNegozi((n.data ?? []) as NegozioSeg[]);
    };
    useEffect(() => { setDraft({}); carica(); }, [monthISO]);   // eslint-disable-line react-hooks/exhaustive-deps

    const negozioDi = (s: string) => negozi.filter(n => n.gara === s).map(n => n.store_name);
    // il Target usa il nome secco ("Magliana"), lo schema quello con suffisso
    // ("Magliana W3"): il match corre sul prefisso comune
    const targetDi = (store: string): TargetPdv | undefined =>
        targets.find(t => store.toLowerCase().startsWith(t.negozio.toLowerCase()) || t.negozio.toLowerCase().startsWith(store.toLowerCase()));

    const stores = negozioDi(seg);
    useEffect(() => {
        if (stores.length && !stores.includes(pdvSel)) setPdvSel(stores[0]);
    }, [seg, negozi]);   // eslint-disable-line react-hooks/exhaustive-deps

    const target = pdvSel ? targetDi(pdvSel) : undefined;
    const segInfo = SEGMENTI.find(s => s.id === seg);

    const chiave = (tid: string, campo: string, i: number) => `${tid}|${campo}|${i}`;
    const valCella = (t: TargetPdv, campo: "mobile" | "fisso", i: number): string => {
        const d = draft[chiave(t.id, campo, i)];
        if (d != null) return d;
        const arr = campo === "mobile" ? t.soglie_mobile : t.soglie_fisso;
        return arr?.[i] == null ? "" : String(arr[i]);
    };
    const dirtyPdv = (t: TargetPdv) => Object.keys(draft).some(k => k.startsWith(t.id + "|"));
    const salvaPdv = async (t: TargetPdv) => {
        const nuovi = (campo: "mobile" | "fisso", arr: number[] | null) =>
            (arr || []).map((v, i) => {
                const d = draft[chiave(t.id, campo, i)];
                if (d == null) return Number(v);
                const n = Number(String(d).replace(",", "."));
                return Number.isFinite(n) ? n : Number(v);
            });
        const patch = { soglie_mobile: nuovi("mobile", t.soglie_mobile), soglie_fisso: nuovi("fisso", t.soglie_fisso) };
        const { error } = await supabase.from("pay_target_pdv").update(patch).eq("id", t.id);
        if (dbError("Salvataggio soglie PDV", error)) return;
        notify(`Soglie di ${t.negozio} salvate ✓`, "ok");
        setDraft(prev => { const c = { ...prev }; Object.keys(c).forEach(k => { if (k.startsWith(t.id + "|")) delete c[k]; }); return c; });
        carica();
    };
    const ripristina = async (t: TargetPdv) => {
        if (!window.confirm(`Le soglie di ${t.negozio} tornano a quelle originali della lettera?`)) return;
        const { error } = await supabase.from("pay_target_pdv")
            .update({ soglie_mobile: t.soglie_mobile_lettera, soglie_fisso: t.soglie_fisso_lettera }).eq("id", t.id);
        if (dbError("Ripristino soglie", error)) return;
        notify("Soglie riportate alla lettera ✓", "ok");
        setDraft(prev => { const c = { ...prev }; Object.keys(c).forEach(k => { if (k.startsWith(t.id + "|")) delete c[k]; }); return c; });
        carica();
    };

    const TabSoglie = ({ t, titolo, campo, cluster, peso }: { t: TargetPdv; titolo: string; campo: "mobile" | "fisso"; cluster: string | null; peso: number | null }) => {
        const arr = campo === "mobile" ? t.soglie_mobile : t.soglie_fisso;
        const lett = campo === "mobile" ? t.soglie_mobile_lettera : t.soglie_fisso_lettera;
        if (!arr?.length) return null;
        return (
            <div className="flex-1 min-w-[260px]">
                <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">
                    {titolo} {cluster && <span className="text-slate-500 normal-case">· {cluster}</span>}
                    {peso != null && peso !== 1 && <span className="text-amber-300/80 normal-case"> · peso {peso}</span>}
                </div>
                <table className="w-full text-sm border-collapse">
                    <thead>
                        <tr className="text-[10px] uppercase tracking-wider text-slate-500 bg-white/[0.04]">
                            {arr.map((_, i) => <th key={i} className="px-1.5 py-1.5 font-semibold text-center">S{i + 1}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        <tr className="border-t border-white/5">
                            {arr.map((v, i) => {
                                const orig = lett?.[i];
                                const attuale = draft[chiave(t.id, campo, i)] ?? String(v);
                                const modificata = orig != null && Number(attuale) !== Number(orig);
                                return (
                                    <td key={i} className="px-1.5 py-2 text-center align-top"
                                        title={orig != null && modificata ? `lettera: ${orig}` : undefined}>
                                        <input value={valCella(t, campo, i)}
                                            onChange={e => setDraft(prev => ({ ...prev, [chiave(t.id, campo, i)]: e.target.value }))}
                                            className={cn("bg-white/[0.05] border rounded-lg px-1.5 py-1 text-[15px] font-bold text-white w-16 text-center tabular-nums",
                                                modificata ? "border-amber-400/60" : "border-white/10")} />
                                        {modificata && <div className="text-[9px] text-amber-300/90 mt-0.5">modificata</div>}
                                    </td>
                                );
                            })}
                        </tr>
                    </tbody>
                </table>
            </div>
        );
    };

    if (!negozi.length && !targets.length) return null;

    return (
        <div className="glass-panel rounded-2xl p-5" style={{ borderLeft: `4px solid ${colore}` }}>
            <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-3">
                Gare per punto vendita — Mobile e Fisso corrono sul singolo PDV
                {seg === "franchising"
                    ? "; Business P.IVA, Assicurazioni e Luce & Gas sulla rete (tabella soglie qui sopra — valgono solo per il franchising)"
                    : ". Le gare di rete (Business, Assicurazioni, Luce & Gas) valgono solo per il franchising: qui non contano"}
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
                {SEGMENTI.map(s => (
                    <button key={s.id} onClick={() => setSeg(s.id)}
                        title={s.regola}
                        className={cn("px-4 py-2 rounded-xl border text-sm font-bold transition-all",
                            seg === s.id ? "border-amber-400/70 bg-amber-500/15 text-white" : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/25")}>
                        {s.label}
                    </button>
                ))}
                {segInfo && <span className="text-[11px] text-slate-500 self-center">{segInfo.regola}</span>}
            </div>
            {stores.length > 1 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                    {stores.map(n => (
                        <button key={n} onClick={() => setPdvSel(n)}
                            className={cn("px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all",
                                pdvSel === n ? "border-white/40 bg-white/10 text-white" : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-slate-200")}>
                            🏬 {n}
                        </button>
                    ))}
                </div>
            )}
            {stores.length === 1 && <div className="text-sm font-semibold text-white mb-3">🏬 {stores[0]}</div>}
            {target ? (
                <>
                    {seg === "franchising" ? (
                        <div className="flex gap-6 flex-wrap">
                            <TabSoglie t={target} titolo="📱 Mobile" campo="mobile" cluster={target.cluster_mobile} peso={target.peso_mobile} />
                            <TabSoglie t={target} titolo="🏠 Fisso" campo="fisso" cluster={target.cluster_fisso} peso={target.peso_fix} />
                        </div>
                    ) : (
                        /* MULTIBRAND (Luca 13/08): target cumulati dal mobile in
                           giù → UNA tabella sola, una riga per pista */
                        (() => {
                            const righeT: { label: string; campo: "mobile" | "fisso"; arr: number[] | null; lett: number[] | null }[] = [
                                { label: "📱 Mobile", campo: "mobile" as const, arr: target.soglie_mobile, lett: target.soglie_mobile_lettera },
                                { label: "🏠 Fisso", campo: "fisso" as const, arr: target.soglie_fisso, lett: target.soglie_fisso_lettera },
                            ].filter(r => r.arr?.length);
                            if (!righeT.length) return null;
                            const maxT = Math.max(...righeT.map(r => r.arr!.length));
                            return (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm border-collapse">
                                        <thead>
                                            <tr className="text-[10px] uppercase tracking-wider text-slate-500 bg-white/[0.04]">
                                                <th className="text-left font-semibold px-3 py-1.5">Pista</th>
                                                {Array.from({ length: maxT }, (_, i) => <th key={i} className="px-1.5 py-1.5 font-semibold text-center w-20">S{i + 1}</th>)}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {righeT.map(r => (
                                                <tr key={r.campo} className="border-t border-white/5">
                                                    <td className="px-3 py-1.5 font-semibold text-white whitespace-nowrap">{r.label}</td>
                                                    {Array.from({ length: maxT }, (_, i) => {
                                                        if (r.arr![i] == null) return <td key={i} className="px-1.5 py-1.5 text-center text-slate-700">—</td>;
                                                        const orig = r.lett?.[i];
                                                        const attuale = draft[chiave(target.id, r.campo, i)] ?? String(r.arr![i]);
                                                        const modificata = orig != null && Number(attuale) !== Number(orig);
                                                        return (
                                                            <td key={i} className="px-1.5 py-2 text-center align-top" title={orig != null && modificata ? `lettera: ${orig}` : undefined}>
                                                                <input value={valCella(target, r.campo, i)}
                                                                    onChange={e => setDraft(prev => ({ ...prev, [chiave(target.id, r.campo, i)]: e.target.value }))}
                                                                    className={cn("bg-white/[0.05] border rounded-lg px-1.5 py-1 text-[15px] font-bold text-white w-16 text-center tabular-nums",
                                                                        modificata ? "border-amber-400/60" : "border-white/10")} />
                                                                {modificata && <div className="text-[9px] text-amber-300/90 mt-0.5">modificata</div>}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            );
                        })()
                    )}
                    <div className="flex items-center gap-3 mt-2">
                        {dirtyPdv(target) && (
                            <button onClick={() => salvaPdv(target)} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold">💾 Salva soglie {target.negozio}</button>
                        )}
                        <button onClick={() => ripristina(target)} className="text-[11px] text-slate-500 hover:text-slate-300" title="Torna alle soglie originali della lettera/Target">↺ come da lettera</button>
                    </div>
                </>
            ) : (
                <div className="text-sm text-slate-500">Nessun target per questo punto vendita nel mese: importa il foglio Target Wind3.</div>
            )}
            <p className="text-[11px] text-slate-500 mt-3">Soglie a punti da lettera/Target ({target?.cod_gara || "—"}), ritoccabili a mano: la cella che si discosta dall&apos;originale mostra «modificata». Il pay resta canone × moltiplicatore dalle tabelle del tabellare; le soglie qui decidono il moltiplicatore del PDV.</p>
        </div>
    );
}
