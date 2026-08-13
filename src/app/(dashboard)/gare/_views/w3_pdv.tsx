"use client";

/* GARE W3 PER PUNTO VENDITA — lato azienda (Luca 13/08, cantiere W3 in
   terminal): la struttura di luglio riportata sul nuovo motore. Tre segmenti
   con le loro regole:
     🏪 Franchising    — gara sul SINGOLO punto vendita (5 PDV con codice
                          gara): scegli il negozio e vedi le SUE soglie
                          Mobile (4) e Fisso (5) dal foglio Target mensile
     🏬 Multibrand     — gara UNICA (Donna Olimpia)
     🏬 Multibrand T2  — 2 punti vendita (Promontori, Garbatella)
   Mobile e Fisso sono per PDV; Business P.IVA, Assicurazioni e Luce & Gas
   corrono sulla RETE e stanno nella tabella soglie del tabellare qui sopra.
   I segmenti senza foglio target (multibrand/T2: canvass dealer diverso)
   mostrano i negozi e rimandano allo schema gare finché non c'è un target. */

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/utils";

interface TargetPdv {
    id: string; cod_gara: string; negozio: string;
    peso_mobile: number | null; peso_fix: number | null;
    cluster_mobile: string | null; soglie_mobile: number[] | null;
    cluster_fisso: string | null; soglie_fisso: number[] | null;
}
interface NegozioSeg { gara: string; store_name: string }

const SEGMENTI = [
    { id: "franchising", label: "🏪 Franchising", regola: "gara sul singolo punto vendita" },
    { id: "multibrand", label: "🏬 Multibrand", regola: "gara unica" },
    { id: "multibrand_t2", label: "🏬 Multibrand T2", regola: "2 punti vendita" },
] as const;

export function W3PdvPanel({ mese, colore }: { mese: string; colore: string }) {
    const monthISO = `${mese}-01`;
    const [targets, setTargets] = useState<TargetPdv[]>([]);
    const [negozi, setNegozi] = useState<NegozioSeg[]>([]);
    const [seg, setSeg] = useState<string>("franchising");
    const [pdvSel, setPdvSel] = useState<string>("");

    useEffect(() => {
        let vivo = true;
        (async () => {
            const [t, n] = await Promise.all([
                supabase.from("pay_target_pdv").select("id, cod_gara, negozio, peso_mobile, peso_fix, cluster_mobile, soglie_mobile, cluster_fisso, soglie_fisso").eq("brand", "windtre").eq("month", monthISO).order("negozio"),
                // la spartizione dei negozi nei 3 segmenti vive nello schema
                // gare (brand "w3"): franchising / multibrand / multibrand_t2
                supabase.from("gare_azienda_negozi").select("gara, store_name").eq("brand", "w3").eq("month", monthISO).order("store_name"),
            ]);
            if (!vivo) return;
            setTargets((t.data ?? []) as TargetPdv[]);
            setNegozi((n.data ?? []) as NegozioSeg[]);
        })();
        return () => { vivo = false; };
    }, [monthISO]);

    const negozioDi = (seg: string) => negozi.filter(n => n.gara === seg).map(n => n.store_name);
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

    const TabSoglie = ({ titolo, cluster, peso, soglie }: { titolo: string; cluster: string | null; peso: number | null; soglie: number[] | null }) => {
        if (!soglie?.length) return null;
        return (
            <div className="flex-1 min-w-[260px]">
                <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">
                    {titolo} {cluster && <span className="text-slate-500 normal-case">· {cluster}</span>}
                    {peso != null && peso !== 1 && <span className="text-amber-300/80 normal-case"> · peso {peso}</span>}
                </div>
                <table className="w-full text-sm border-collapse">
                    <thead>
                        <tr className="text-[10px] uppercase tracking-wider text-slate-500 bg-white/[0.04]">
                            {soglie.map((_, i) => <th key={i} className="px-1.5 py-1.5 font-semibold text-center">S{i + 1}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        <tr className="border-t border-white/5">
                            {soglie.map((v, i) => (
                                <td key={i} className="px-1.5 py-2 text-center text-[15px] font-bold text-white tabular-nums"
                                    title={i < soglie.length - 1 ? `da ${v} a ${soglie[i + 1] - 1} punti` : `da ${v} punti in su`}>{v}</td>
                            ))}
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
                Gare per punto vendita — Mobile e Fisso corrono sul singolo PDV; Business P.IVA, Assicurazioni e Luce &amp; Gas sulla rete (tabella soglie qui sopra)
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
                <div className="flex gap-6 flex-wrap">
                    <TabSoglie titolo="📱 Mobile" cluster={target.cluster_mobile} peso={target.peso_mobile} soglie={target.soglie_mobile} />
                    <TabSoglie titolo="🏠 Fisso" cluster={target.cluster_fisso} peso={target.peso_fix} soglie={target.soglie_fisso} />
                </div>
            ) : (
                <div className="text-sm text-slate-500">
                    {seg === "franchising"
                        ? "Nessun target per questo punto vendita nel mese: importa il foglio Target Wind3."
                        : "Questo segmento corre sul canvass dealer (niente foglio target per PDV): le sue gare vivono nello schema gare qui sotto."}
                </div>
            )}
            <p className="text-[11px] text-slate-500 mt-3">Soglie a punti dal foglio Target Wind3 del mese (codice gara {target?.cod_gara || "—"}). Il pay resta canone × moltiplicatore dalle tabelle del tabellare; le soglie qui decidono il moltiplicatore del PDV.</p>
        </div>
    );
}
