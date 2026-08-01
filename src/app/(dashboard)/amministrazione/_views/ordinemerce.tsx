"use client";

/* ORDINE MERCE — ARTICOLI ORDINABILI (Luca 01/08 sera): le liste "Prodotti
   da banco" ed "Extra" si amministrano da qui (amministrativo in su), come
   il catalogo e gli esiti. Ogni modifica scrive su ordine_merce_articoli e
   RILEGGE dal DB; la pagina Ordine Merce pesca da qui (fallback alle liste
   cablate solo a tabella vuota). Le COVER non sono in lista: si scelgono
   per modello di telefono direttamente nella pagina. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/utils";
import { Loader2, Plus, Trash2, Package } from "lucide-react";
import { notify, dbError } from "./toast";

type Articolo = {
    id: string; sezione: "prodotti" | "extra"; categoria: string;
    categoria_label: string; categoria_icona: string; nome: string;
    ordine: number; attivo: boolean;
};

export function OrdineMerceArticoliView() {
    const [loading, setLoading] = useState(true);
    const [righe, setRighe] = useState<Articolo[]>([]);
    const [sez, setSez] = useState<"prodotti" | "extra">("prodotti");
    const [nuovoPerCat, setNuovoPerCat] = useState<Record<string, string>>({});
    const [nuovaCat, setNuovaCat] = useState({ key: "", label: "", icona: "" });
    const [tabAssente, setTabAssente] = useState(false);

    const carica = useCallback(async () => {
        const { data, error } = await supabase.from("ordine_merce_articoli").select("*")
            .order("sezione").order("ordine").order("nome");
        if (error) { if (/(relation|table)/i.test(error.message)) setTabAssente(true); else dbError("Caricamento articoli", error); return; }
        setRighe((data ?? []) as Articolo[]);
        setLoading(false);
    }, []);
    useEffect(() => { carica(); }, [carica]);

    const categorie = useMemo(() => {
        const m = new Map<string, { label: string; icona: string; items: Articolo[] }>();
        righe.filter(r => r.sezione === sez).forEach(r => {
            const g = m.get(r.categoria) || { label: r.categoria_label || r.categoria, icona: r.categoria_icona, items: [] };
            g.items.push(r); m.set(r.categoria, g);
        });
        return [...m.entries()];
    }, [righe, sez]);

    const aggiungi = async (categoria: string, label: string, icona: string) => {
        const nome = (nuovoPerCat[categoria] || "").trim();
        if (!nome) return;
        const ordine = Math.max(0, ...righe.filter(r => r.sezione === sez && r.categoria === categoria).map(r => r.ordine)) + 1;
        const { error } = await supabase.from("ordine_merce_articoli").insert({
            sezione: sez, categoria, categoria_label: label, categoria_icona: icona, nome, ordine,
        });
        if (error) { notify(/duplicate/i.test(error.message) ? "Articolo già in lista" : "Non aggiunto: " + error.message, "error"); return; }
        setNuovoPerCat(p => ({ ...p, [categoria]: "" }));
        notify("Articolo aggiunto ✓", "ok");
        await carica();
    };

    const rinomina = async (r: Articolo, nome: string) => {
        const v = nome.trim();
        if (!v || v === r.nome) return;
        const { error } = await supabase.from("ordine_merce_articoli").update({ nome: v, updated_at: new Date().toISOString() }).eq("id", r.id);
        if (error) { notify("Rinomina non riuscita: " + error.message, "error"); return; }
        await carica();
    };

    const toggle = async (r: Articolo) => {
        const { error } = await supabase.from("ordine_merce_articoli").update({ attivo: !r.attivo, updated_at: new Date().toISOString() }).eq("id", r.id);
        if (dbError("Cambio stato", error)) return;
        await carica();
    };

    const elimina = async (r: Articolo) => {
        if (!window.confirm(`Eliminare "${r.nome}" dagli articoli ordinabili?\n(Per nasconderlo senza perderlo usa l'interruttore Attivo.)`)) return;
        const { error } = await supabase.from("ordine_merce_articoli").delete().eq("id", r.id);
        if (dbError("Eliminazione", error)) return;
        await carica();
    };

    const aggiungiCategoria = async () => {
        const key = nuovaCat.key.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
        const label = nuovaCat.label.trim();
        if (!key || !label) { notify("Servono chiave e nome della categoria", "error"); return; }
        const { error } = await supabase.from("ordine_merce_articoli").insert({
            sezione: sez, categoria: key, categoria_label: label, categoria_icona: nuovaCat.icona.trim(), nome: "Primo articolo (rinominami)", ordine: 0,
        });
        if (error) { notify("Categoria non creata: " + error.message, "error"); return; }
        setNuovaCat({ key: "", label: "", icona: "" });
        notify("Categoria creata ✓ — rinomina il primo articolo", "ok");
        await carica();
    };

    if (tabAssente) return <p className="text-sm text-amber-400 py-10 text-center">Manca la migrazione 129 (ordine_merce_articoli): chiedi di applicarla.</p>;
    if (loading) return <div className="flex items-center gap-3 text-slate-400 py-16 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Caricamento articoli…</div>;

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <p className="text-sm text-slate-400 max-w-3xl">
                    Gli articoli che i negozi possono mettere nel carrello di <b className="text-slate-200">Ordine Merce</b>.
                    Spegni un articolo per toglierlo dagli ordinabili senza perderne lo storico; il cestino lo elimina.
                    Le <b className="text-slate-200">cover</b> non stanno qui: si scelgono per modello di telefono.
                </p>
                <div className="flex gap-2">
                    {([["prodotti", "📱 Prodotti da banco"], ["extra", "🧴 Extra"]] as const).map(([k, l]) => (
                        <button key={k} onClick={() => setSez(k)}
                            className={cn("px-4 py-2 rounded-xl border text-sm font-bold", sez === k ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-200" : "bg-white/[0.03] border-white/10 text-slate-400 hover:text-slate-200")}>{l}</button>
                    ))}
                </div>
            </div>

            {categorie.map(([key, g]) => (
                <div key={key} className="glass-card overflow-hidden">
                    <div className="px-4 py-3 bg-white/[0.03] border-b border-white/5 flex items-center justify-between gap-3 flex-wrap">
                        <p className="text-sm font-bold text-white flex items-center gap-2"><Package className="w-4 h-4 text-indigo-400" /> {g.icona} {g.label} <span className="text-slate-500 font-normal">({g.items.filter(i => i.attivo).length} attivi su {g.items.length})</span></p>
                        <div className="flex items-center gap-2">
                            <input value={nuovoPerCat[key] || ""} onChange={e => setNuovoPerCat(p => ({ ...p, [key]: e.target.value }))}
                                onKeyDown={e => { if (e.key === "Enter") aggiungi(key, g.label, g.icona); }}
                                placeholder="Nuovo articolo…" className="glass-input !h-8 text-xs w-44" />
                            <button onClick={() => aggiungi(key, g.label, g.icona)} disabled={!(nuovoPerCat[key] || "").trim()}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-bold hover:bg-indigo-500/25 disabled:opacity-40"><Plus className="w-3.5 h-3.5" /> Aggiungi</button>
                        </div>
                    </div>
                    <div className="divide-y divide-white/5">
                        {g.items.map(r => (
                            <div key={r.id} className={cn("px-4 py-2 flex items-center gap-3", !r.attivo && "opacity-50")}>
                                <input defaultValue={r.nome} onBlur={e => rinomina(r, e.target.value)}
                                    onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                    className="flex-1 min-w-[180px] bg-transparent border border-transparent hover:border-white/10 focus:border-indigo-500/50 focus:bg-black/30 rounded-lg px-2 py-1 text-sm text-slate-200 outline-none transition-colors" />
                                <button onClick={() => toggle(r)}
                                    className={cn("px-2.5 py-1 rounded-full text-[10px] font-bold border", r.attivo ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-white/15 bg-white/5 text-slate-500")}>
                                    {r.attivo ? "ATTIVO" : "SPENTO"}
                                </button>
                                <button onClick={() => elimina(r)} className="p-1.5 rounded-lg text-slate-600 hover:text-rose-400 hover:bg-rose-500/10"><Trash2 className="w-4 h-4" /></button>
                            </div>
                        ))}
                    </div>
                </div>
            ))}

            <div className="glass-card p-4 flex items-end gap-3 flex-wrap">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Nuova categoria ({sez === "prodotti" ? "Prodotti" : "Extra"})</p>
                    <div className="flex gap-2 flex-wrap">
                        <input value={nuovaCat.label} onChange={e => setNuovaCat(p => ({ ...p, label: e.target.value, key: p.key || e.target.value }))} placeholder="Nome (es. Gadget)" className="glass-input !h-9 text-xs w-40" />
                        <input value={nuovaCat.icona} onChange={e => setNuovaCat(p => ({ ...p, icona: e.target.value }))} placeholder="Emoji" className="glass-input !h-9 text-xs w-20" />
                        <input value={nuovaCat.key} onChange={e => setNuovaCat(p => ({ ...p, key: e.target.value }))} placeholder="chiave (es. gadget)" className="glass-input !h-9 text-xs w-36 font-mono" />
                        <button onClick={aggiungiCategoria} className="px-3 py-2 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-bold hover:bg-indigo-500/25">+ Crea categoria</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
