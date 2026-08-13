"use client";

/* CANONI OFFERTE (Luca 13/08, lavorazione W3 in terminal): il pay Wind3 è
   canone × moltiplicatore di soglia — qui si SETTANO i canoni mensili di
   tutte le offerte (catalog_offerte.canone_mensile), senza toccare il resto
   del catalogo. Pseudo-brand «💶 Canoni» dentro Catalogo: scegli il brand,
   correggi i prezzi, il Calcolatore e il motore li leggono da subito.
   Le offerte SENZA canone sono evidenziate in ambra: su un brand a
   moltiplicatore vuol dire pay incalcolabile. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { dbError, notify } from "./toast";
import { cn } from "@/utils";

interface Brand { id: string; nome: string; colore1: string; attivo: boolean }
interface Cat { id: string; nome: string }
interface ProdRow { id: string; brand_id: string; tipo_cliente: string; categoria_id: string; nome: string; attivo: boolean }
interface OffRow { id: string; prodotto_id: string; nome: string; attivo: boolean; canone_mensile: number | null }

export function CanoniView({ brands, cats }: { brands: Brand[]; cats: Cat[] }) {
    const [brandSel, setBrandSel] = useState("windtre");
    const [prodotti, setProdotti] = useState<ProdRow[]>([]);
    const [offerte, setOfferte] = useState<OffRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [cerca, setCerca] = useState("");
    const [soloSenza, setSoloSenza] = useState(false);
    const [mostraSpente, setMostraSpente] = useState(false);
    const [draft, setDraft] = useState<Record<string, string>>({});
    const [salvate, setSalvate] = useState<Set<string>>(new Set());

    const carica = useCallback(async (bid: string) => {
        setLoading(true); setDraft({}); setSalvate(new Set());
        const p = await supabase.from("catalog_prodotti").select("id, brand_id, tipo_cliente, categoria_id, nome, attivo").eq("brand_id", bid);
        if (dbError("Caricamento prodotti", p.error)) { setLoading(false); return; }
        const prods = (p.data ?? []) as ProdRow[];
        setProdotti(prods);
        const ids = prods.map(x => x.id);
        if (!ids.length) { setOfferte([]); setLoading(false); return; }
        const o = await supabase.from("catalog_offerte").select("id, prodotto_id, nome, attivo, canone_mensile").in("prodotto_id", ids);
        if (dbError("Caricamento offerte", o.error)) { setLoading(false); return; }
        setOfferte((o.data ?? []) as OffRow[]);
        setLoading(false);
    }, []);
    useEffect(() => { carica(brandSel); }, [brandSel, carica]);

    const nomeCat = useMemo(() => new Map(cats.map(c => [c.id, c.nome])), [cats]);
    const prodDi = useMemo(() => new Map(prodotti.map(p => [p.id, p])), [prodotti]);

    const righe = useMemo(() => {
        const out = offerte
            .map(o => ({ o, p: prodDi.get(o.prodotto_id) }))
            .filter((x): x is { o: OffRow; p: ProdRow } => !!x.p)
            .filter(x => mostraSpente || (x.o.attivo && x.p.attivo))
            .filter(x => !soloSenza || x.o.canone_mensile == null)
            .filter(x => {
                if (!cerca.trim()) return true;
                const q = cerca.toLowerCase();
                return `${x.o.nome} ${x.p.nome} ${nomeCat.get(x.p.categoria_id) || ""}`.toLowerCase().includes(q);
            });
        out.sort((a, b) =>
            a.p.tipo_cliente.localeCompare(b.p.tipo_cliente)
            || String(nomeCat.get(a.p.categoria_id) || "").localeCompare(String(nomeCat.get(b.p.categoria_id) || ""))
            || a.p.nome.localeCompare(b.p.nome)
            || a.o.nome.localeCompare(b.o.nome));
        return out;
    }, [offerte, prodDi, nomeCat, cerca, soloSenza, mostraSpente]);

    const attive = offerte.filter(o => o.attivo && prodDi.get(o.prodotto_id)?.attivo);
    const senzaCanone = attive.filter(o => o.canone_mensile == null).length;

    const salva = async (o: OffRow) => {
        const v = draft[o.id];
        if (v == null) return;
        const n = v.trim() === "" ? null : Number(String(v).replace(",", "."));
        if (n != null && (!Number.isFinite(n) || n < 0)) { notify("Canone non valido", "error"); return; }
        const { error } = await supabase.from("catalog_offerte").update({ canone_mensile: n }).eq("id", o.id);
        if (dbError("Salvataggio canone", error)) return;
        setOfferte(prev => prev.map(x => x.id === o.id ? { ...x, canone_mensile: n } : x));
        setDraft(prev => { const c = { ...prev }; delete c[o.id]; return c; });
        setSalvate(prev => new Set(prev).add(o.id));
        setTimeout(() => setSalvate(prev => { const c = new Set(prev); c.delete(o.id); return c; }), 1800);
    };

    const valDi = (o: OffRow) => draft[o.id] ?? (o.canone_mensile == null ? "" : String(o.canone_mensile));
    const dirty = (o: OffRow) => draft[o.id] != null && draft[o.id] !== (o.canone_mensile == null ? "" : String(o.canone_mensile));

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
                {brands.filter(b => b.attivo).map(b => (
                    <button key={b.id} onClick={() => setBrandSel(b.id)}
                        className={cn("flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-bold transition-all",
                            brandSel === b.id ? "border-violet-400/70 bg-violet-500/15 text-white" : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/25")}>
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: b.colore1 || "var(--tf-94a3b8)" }} />
                        {b.nome}
                    </button>
                ))}
            </div>
            <div className="glass-panel rounded-2xl p-4 flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[220px]">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input value={cerca} onChange={e => setCerca(e.target.value)} placeholder="Cerca offerta, prodotto o categoria…"
                        className="glass-input !h-9 text-sm w-full pl-9" />
                </div>
                <button onClick={() => setSoloSenza(v => !v)}
                    className={cn("px-3 h-9 rounded-lg border text-xs font-bold transition",
                        soloSenza ? "border-amber-400 bg-amber-500/20 text-amber-200" : "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20")}>
                    ⚠️ Senza canone: {senzaCanone}{soloSenza ? " ✕" : ""}
                </button>
                <label className="text-xs text-slate-400 flex items-center gap-1.5">
                    <input type="checkbox" checked={mostraSpente} onChange={e => setMostraSpente(e.target.checked)} /> mostra spente
                </label>
                <span className="text-xs text-slate-500">{attive.length} offerte attive</span>
            </div>
            <div className="glass-card overflow-x-auto">
                {loading ? <div className="px-4 py-10 text-center text-slate-500 text-sm">Carico…</div> : (
                    <table className="w-full text-left text-sm text-slate-300">
                        <thead className="bg-white/[0.03] text-xs uppercase text-slate-400">
                            <tr>
                                <th className="px-4 py-3 font-semibold">Tipo</th>
                                <th className="px-4 py-3 font-semibold">Categoria</th>
                                <th className="px-4 py-3 font-semibold">Prodotto</th>
                                <th className="px-4 py-3 font-semibold">Offerta</th>
                                <th className="px-4 py-3 font-semibold text-center w-40">Canone €/mese</th>
                            </tr>
                        </thead>
                        <tbody>
                            {righe.map(({ o, p }) => (
                                <tr key={o.id} className={cn("border-t border-white/5 hover:bg-white/[0.03]",
                                    o.canone_mensile == null && o.attivo && "bg-amber-500/[0.06]", !o.attivo && "opacity-50")}>
                                    <td className="px-4 py-2 text-xs text-slate-500">{p.tipo_cliente}</td>
                                    <td className="px-4 py-2 text-xs text-slate-400">{nomeCat.get(p.categoria_id) || "—"}</td>
                                    <td className="px-4 py-2 text-xs text-slate-400">{p.nome}</td>
                                    <td className="px-4 py-2 text-slate-200">{o.nome}{!o.attivo && <span className="text-[10px] text-slate-500 ml-1.5">(spenta)</span>}</td>
                                    <td className="px-4 py-2 text-center whitespace-nowrap">
                                        <input value={valDi(o)} placeholder="—"
                                            onChange={e => setDraft(prev => ({ ...prev, [o.id]: e.target.value }))}
                                            onKeyDown={e => { if (e.key === "Enter") salva(o); }}
                                            className={cn("bg-white/[0.05] border rounded-lg px-2 py-1 text-sm text-white w-24 text-right",
                                                dirty(o) ? "border-amber-400/70" : o.canone_mensile == null ? "border-amber-500/40" : "border-white/10")} />
                                        {dirty(o) && <button onClick={() => salva(o)} className="text-emerald-300 text-xs font-semibold ml-1.5">💾</button>}
                                        {salvate.has(o.id) && <span className="text-emerald-400 text-xs ml-1.5">✓</span>}
                                    </td>
                                </tr>
                            ))}
                            {!righe.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">Nessuna offerta con questi filtri.</td></tr>}
                        </tbody>
                    </table>
                )}
            </div>
            <p className="text-[11px] text-slate-500">Il canone alimenta il pay a moltiplicatore (Wind3: pay = canone × moltiplicatore della soglia raggiunta dal punto vendita). Invio o 💾 salvano la riga; campo vuoto = canone non impostato.</p>
        </div>
    );
}
