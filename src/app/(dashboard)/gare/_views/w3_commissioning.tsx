"use client";

/* COMMISSIONING € FRANCHISING W3 (Luca 13/08, chiusura del ragionamento):
   la parte che NON cambia al cambiare del PDV. Conoscendo i MOLTIPLICATORI
   della lettera (pay_righe del tabellare) e i CANONI di ogni offerta
   (pannello Canoni), ogni soglia ha il suo pay in euro: qui ogni offerta a
   canone è esplosa in € per soglia = canone × moltiplicatore. L'analytics
   dovrà solo matchare la soglia raggiunta dal PDV col pay unitario.
   Le offerte senza canone (o escluse dalle gare) non compaiono. */

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { esclusaDalleGare } from "@/lib/commissioning";
import { cn } from "@/utils";

interface RigaMolt {
    pista: string; nome: string; tipo_cliente: string | null; prodotto: string | null;
    offerta: string | null; pay_tiers: number[];
}
interface OffCanone {
    id: string; nome: string; canone: number; prodotto: string; tipo_cliente: string; categoria: string;
}

const PISTE_LABEL: Record<string, string> = { mobile: "📱 Mobile", fisso: "🏠 Fisso" };

export function W3CommissioningPanel({ mese, colore }: { mese: string; colore: string }) {
    const monthISO = `${mese}-01`;
    const [righe, setRighe] = useState<RigaMolt[]>([]);
    const [offerte, setOfferte] = useState<OffCanone[]>([]);
    const [loading, setLoading] = useState(true);
    const [cerca, setCerca] = useState("");
    const [aperte, setAperte] = useState<Set<string>>(new Set(["mobile"]));

    useEffect(() => {
        let vivo = true;
        (async () => {
            const r = await supabase.from("pay_righe")
                .select("pista, nome, tipo_cliente, prodotto, offerta, pay_tiers, moltiplicatore, attivo")
                .eq("brand", "windtre").eq("month", monthISO).eq("lato", "azienda")
                .in("pista", ["mobile", "fisso"]).eq("attivo", true).limit(500);
            const molt = ((r.data ?? []) as (RigaMolt & { moltiplicatore: boolean; attivo: boolean })[])
                .filter(x => x.moltiplicatore)
                .map(x => ({ ...x, pay_tiers: (Array.isArray(x.pay_tiers) ? x.pay_tiers.map(Number) : []) }));
            // catalogo: prodotti → offerte con canone (comprese le opzioni a
            // canone, es. 2°Linea, appese come voci col loro prezzo)
            const [cats, prods] = await Promise.all([
                supabase.from("catalog_categorie").select("id, nome"),
                supabase.from("catalog_prodotti").select("id, nome, tipo_cliente, categoria_id").eq("brand_id", "windtre").eq("attivo", true),
            ]);
            const nomeCat = new Map(((cats.data ?? []) as { id: string; nome: string }[]).map(c => [c.id, c.nome]));
            const prodDi = new Map(((prods.data ?? []) as { id: string; nome: string; tipo_cliente: string; categoria_id: string }[]).map(p => [p.id, p]));
            const ids = [...prodDi.keys()];
            let offs: OffCanone[] = [];
            for (let i = 0; i < ids.length; i += 60) {
                const o = await supabase.from("catalog_offerte").select("id, prodotto_id, nome, canone_mensile").in("prodotto_id", ids.slice(i, i + 60)).eq("attivo", true).not("canone_mensile", "is", null);
                ((o.data ?? []) as { id: string; prodotto_id: string; nome: string; canone_mensile: number }[]).forEach(x => {
                    const p = prodDi.get(x.prodotto_id);
                    if (!p || esclusaDalleGare({ offerta: x.nome })) return;
                    offs.push({ id: x.id, nome: x.nome, canone: Number(x.canone_mensile), prodotto: p.nome, tipo_cliente: p.tipo_cliente, categoria: String(nomeCat.get(p.categoria_id) || "") });
                });
            }
            if (!vivo) return;
            setRighe(molt);
            setOfferte(offs);
            setLoading(false);
        })();
        return () => { vivo = false; };
    }, [monthISO]);

    // riga moltiplicatore più SPECIFICA per l'offerta (offerta esatta > prodotto > tipo)
    const rigaPer = (o: OffCanone, pista: string): RigaMolt | undefined => {
        const cand = righe.filter(r => r.pista === pista
            && (r.tipo_cliente == null || r.tipo_cliente === o.tipo_cliente)
            && (r.prodotto == null || r.prodotto === o.prodotto)
            && (r.offerta == null || r.offerta === o.nome));
        if (!cand.length) return undefined;
        const score = (r: RigaMolt) => (r.offerta ? 4 : 0) + (r.prodotto ? 2 : 0) + (r.tipo_cliente ? 1 : 0);
        return cand.sort((a, b) => score(b) - score(a))[0];
    };

    const perPista = useMemo(() => {
        const out: Record<string, { o: OffCanone; r: RigaMolt }[]> = { mobile: [], fisso: [] };
        offerte.forEach(o => {
            const pista = /fisso/i.test(o.categoria) ? "fisso" : /mobile/i.test(o.categoria) ? "mobile" : null;
            if (!pista) return;
            const r = rigaPer(o, pista);
            if (!r || !r.pay_tiers.length) return;
            if (cerca.trim() && !`${o.nome} ${o.prodotto} ${o.tipo_cliente}`.toLowerCase().includes(cerca.toLowerCase())) return;
            out[pista].push({ o, r });
        });
        for (const k of Object.keys(out))
            out[k].sort((a, b) => a.o.tipo_cliente.localeCompare(b.o.tipo_cliente) || a.o.prodotto.localeCompare(b.o.prodotto) || a.o.nome.localeCompare(b.o.nome));
        return out;
    }, [offerte, righe, cerca]);   // eslint-disable-line react-hooks/exhaustive-deps

    const eur = (v: number) => (Math.round(v * 100) / 100).toLocaleString("it-IT", { minimumFractionDigits: v % 1 ? 2 : 0 });

    if (loading) return null;

    return (
        <div className="glass-panel rounded-2xl p-5" style={{ borderLeft: `4px solid ${colore}` }}>
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                <div className="text-[11px] uppercase tracking-wider text-slate-400">
                    Commissioning in € — uguale per tutti i PDV: canone dell&apos;offerta × moltiplicatore della soglia. La soglia raggiunta dal punto vendita (tabella qui sopra) sceglie la colonna.
                </div>
                <div className="relative w-64">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input value={cerca} onChange={e => setCerca(e.target.value)} placeholder="Cerca offerta…"
                        className="glass-input !h-8 text-xs w-full pl-8" />
                </div>
            </div>
            {(["mobile", "fisso"] as const).map(pista => {
                const rr = perPista[pista];
                if (!rr?.length) return null;
                const maxT = Math.max(...rr.map(x => x.r.pay_tiers.length));
                const aperta = aperte.has(pista) || !!cerca.trim();
                return (
                    <div key={pista} className="mb-3 last:mb-0">
                        <button onClick={() => setAperte(prev => { const c = new Set(prev); if (c.has(pista)) c.delete(pista); else c.add(pista); return c; })}
                            className="text-sm font-bold text-white flex items-center gap-2 mb-1.5">
                            {PISTE_LABEL[pista]} <span className="text-xs font-normal text-slate-500">{aperta ? "▾" : `▸ ${rr.length} offerte`}</span>
                        </button>
                        {aperta && (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm border-collapse">
                                    <thead>
                                        <tr className="text-[10px] uppercase tracking-wider text-slate-500 bg-white/[0.04]">
                                            <th className="text-left font-semibold px-3 py-1.5">Offerta</th>
                                            <th className="text-left font-semibold px-2 py-1.5">Prodotto</th>
                                            <th className="px-1.5 py-1.5 font-semibold text-center w-20">Canone</th>
                                            {Array.from({ length: maxT }, (_, i) => <th key={i} className="px-1.5 py-1.5 font-semibold text-center w-20">S{i + 1}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rr.map(({ o, r }) => (
                                            <tr key={o.id} className="border-t border-white/[0.04] hover:bg-white/[0.03]">
                                                <td className="px-3 py-1 text-slate-200 whitespace-nowrap">{o.nome}{o.tipo_cliente === "Business" && <span className="text-[9px] text-amber-300/80 ml-1.5">P.IVA</span>}</td>
                                                <td className="px-2 py-1 text-[11px] text-slate-500 whitespace-nowrap">{o.prodotto}</td>
                                                <td className="px-1.5 py-1 text-center text-[12px] text-slate-400 tabular-nums">{eur(o.canone)} €</td>
                                                {Array.from({ length: maxT }, (_, i) => {
                                                    const m = r.pay_tiers[i];
                                                    if (m == null) return <td key={i} className="px-1.5 py-1 text-center text-slate-700">—</td>;
                                                    return (
                                                        <td key={i} className="px-1.5 py-1 text-center font-semibold text-emerald-200 tabular-nums"
                                                            title={`${eur(o.canone)} € × ${m}`}>
                                                            {eur(o.canone * m)} €
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                );
            })}
            <p className="text-[11px] text-slate-500 mt-2">Canoni dal pannello Catalogo → 💶 Canoni; moltiplicatori dal tabellare (lettera di gara). Cambia un canone o un moltiplicatore → questi euro si aggiornano da soli.</p>
        </div>
    );
}
