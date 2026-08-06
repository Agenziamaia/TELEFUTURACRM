"use client";

/* BRAND × NEGOZIO (Luca 06/08) — lo step "prima del catalogo": per ogni punto
   vendita si decide quali brand VEDE in Registra Vendita e per quali può
   REGISTRARE vendite (vedere ≠ registrare: un negozio può consultare un brand
   senza poterlo vendere). Senza riga esplicita vale il DEFAULT DI RETE del
   brand (catalog_brands.default_abilitato): i brand storici sono liberi per
   tutti, i brand "a matrice" (Kipoint) esistono solo dove attivati — oggi
   Collatina e Libia. Registra Vendita legge store_brand_rules al mount. */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/utils";
import { dbError, notify } from "./toast";
import { Loader2, Eye, ShoppingCart, RotateCcw } from "lucide-react";

interface BrandRow { id: string; nome: string; colore1: string; default_abilitato?: boolean }
interface Rule { store: string; brand: string; vede: boolean; registra: boolean }

export function BrandNegozioView({ brands, onBrandsChanged }: { brands: BrandRow[]; onBrandsChanged: () => void }) {
    const [stores, setStores] = useState<string[]>([]);
    const [rules, setRules] = useState<Rule[] | null>(null);
    const [busy, setBusy] = useState<string | null>(null);

    const load = async () => {
        const [s, r] = await Promise.all([
            supabase.from("stores").select("name").order("name"),
            supabase.from("store_brand_rules").select("store, brand, vede, registra"),
        ]);
        if (dbError("Caricamento negozi", s.error) || dbError("Caricamento matrice", r.error)) return;
        setStores(((s.data ?? []) as { name: string }[]).map((x) => x.name));
        setRules((r.data ?? []) as Rule[]);
    };
    useEffect(() => { load(); }, []);

    const ruleOf = (store: string, brand: string) => (rules ?? []).find((r) => r.store === store && r.brand === brand) || null;
    const eff = (store: string, b: BrandRow) => {
        const r = ruleOf(store, b.id);
        if (r) return { vede: !!r.vede, registra: !!r.registra, custom: true };
        const d = b.default_abilitato !== false;
        return { vede: d, registra: d, custom: false };
    };

    const toggle = async (store: string, b: BrandRow, campo: "vede" | "registra") => {
        const cur = eff(store, b);
        const next = { vede: cur.vede, registra: cur.registra, [campo]: !cur[campo] } as { vede: boolean; registra: boolean };
        if (campo === "vede" && !next.vede) next.registra = false;    // senza vista niente registrazione
        if (campo === "registra" && next.registra) next.vede = true;  // registrare implica vedere
        setBusy(store + "|" + b.id);
        const { error } = await supabase.from("store_brand_rules")
            .upsert({ store, brand: b.id, ...next, updated_at: new Date().toISOString() });
        setBusy(null);
        if (dbError("Salvataggio regola", error)) return;
        await load();
    };

    const reset = async (store: string, b: BrandRow) => {
        setBusy(store + "|" + b.id);
        const { error } = await supabase.from("store_brand_rules").delete().eq("store", store).eq("brand", b.id);
        setBusy(null);
        if (dbError("Reset regola", error)) return;
        await load();
    };

    const toggleDefault = async (b: BrandRow) => {
        const { error } = await supabase.from("catalog_brands")
            .update({ default_abilitato: !(b.default_abilitato !== false) }).eq("id", b.id);
        if (dbError("Salvataggio default di rete", error)) return;
        notify(`Default di rete ${b.nome}: ${b.default_abilitato !== false ? "SPENTO — vale solo dove attivato" : "acceso per tutta la rete"}`);
        onBrandsChanged();
    };

    if (rules === null) return <div className="flex items-center gap-2 text-slate-400 py-10 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Caricamento matrice…</div>;

    return (
        <div className="space-y-3">
            <p className="text-sm text-slate-400 max-w-4xl">
                <Eye className="w-3.5 h-3.5 inline -mt-0.5" /> = il negozio <b>vede</b> il brand in Registra Vendita ·{" "}
                <ShoppingCart className="w-3.5 h-3.5 inline -mt-0.5" /> = può <b>registrare</b> vendite.
                La riga d&apos;intestazione governa il <b>default di rete</b> del brand: i negozi senza personalizzazione lo ereditano.
                Le celle con bordo ambra hanno una regola propria (<RotateCcw className="w-3 h-3 inline -mt-0.5" /> = torna al default).
            </p>
            <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="text-xs min-w-full">
                    <thead>
                        <tr className="bg-white/[0.03]">
                            <th className="text-left px-3 py-2 text-slate-400 font-bold sticky left-0 bg-[#161a26] z-10">Negozio</th>
                            {brands.map((b) => (
                                <th key={b.id} className="px-2 py-2 text-center min-w-[92px]">
                                    <div className="flex items-center justify-center gap-1.5 font-bold text-slate-200">
                                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: b.colore1 || "#94a3b8" }} />{b.nome}
                                    </div>
                                    <button onClick={() => toggleDefault(b)}
                                        title="Default di rete: cosa vale per i negozi senza personalizzazione"
                                        className={cn("mt-1 px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wide",
                                            b.default_abilitato !== false ? "border-emerald-400/50 text-emerald-300 bg-emerald-500/10" : "border-white/15 text-slate-500 bg-white/[0.03]")}>
                                        rete {b.default_abilitato !== false ? "ON" : "OFF"}
                                    </button>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {stores.map((s) => (
                            <tr key={s} className="border-t border-white/5">
                                <td className="px-3 py-1.5 font-semibold text-slate-200 whitespace-nowrap sticky left-0 bg-[#161a26] z-10">{s}</td>
                                {brands.map((b) => {
                                    const e = eff(s, b);
                                    const k = s + "|" + b.id;
                                    return (
                                        <td key={b.id} className={cn("px-2 py-1.5 text-center", e.custom && "ring-1 ring-inset ring-amber-400/40 rounded")}>
                                            {busy === k ? <Loader2 className="w-3.5 h-3.5 animate-spin inline text-slate-500" /> : (
                                                <span className="inline-flex items-center gap-1">
                                                    <button onClick={() => toggle(s, b, "vede")} title={e.vede ? "Vede il brand — clicca per nasconderlo" : "Nascosto — clicca per mostrarlo"}
                                                        className={cn("p-1 rounded-md border", e.vede ? "border-emerald-400/50 text-emerald-300 bg-emerald-500/10" : "border-white/10 text-slate-600 bg-white/[0.02]")}>
                                                        <Eye className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button onClick={() => toggle(s, b, "registra")} title={e.registra ? "Registra vendite — clicca per bloccare" : "Non registra — clicca per abilitare"}
                                                        className={cn("p-1 rounded-md border", e.registra ? "border-sky-400/50 text-sky-300 bg-sky-500/10" : "border-white/10 text-slate-600 bg-white/[0.02]")}>
                                                        <ShoppingCart className="w-3.5 h-3.5" />
                                                    </button>
                                                    {e.custom && (
                                                        <button onClick={() => reset(s, b)} title="Togli la personalizzazione: torna al default di rete"
                                                            className="p-1 rounded-md border border-white/10 text-amber-400/80 hover:text-amber-300 bg-white/[0.02]">
                                                            <RotateCcw className="w-3 h-3" />
                                                        </button>
                                                    )}
                                                </span>
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
