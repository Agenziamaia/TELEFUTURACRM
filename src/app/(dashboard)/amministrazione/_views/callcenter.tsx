"use client";

// CALL CENTER (Luca 30/07, mig. 105): pannello per gestire le opzioni della
// sezione Caller — esiti/stati, provenienze, tipologie e obiettivi. Le voci
// vivono in caller_opzioni: aggiungi, rinomina, riordina, spegni (le pratiche
// gia' salvate mantengono il testo con cui sono state esitate). ATTENZIONE:
// gli stati con automatismi (NR → WhatsApp, richiami, appuntamenti →
// calendario) sono riconosciuti PER NOME nel codice del Caller.
import { useCallback, useEffect, useState } from "react";
import { Phone, Plus, ChevronUp, ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type Opzione = { id: string; categoria: string; voce: string; ordine: number; attiva: boolean; comportamento?: string | null };

// COMPORTAMENTO dello stato (mig. 119, Luca 31/07): niente piu' riconoscimento
// per nome nel codice — l'automatismo si sceglie qui, voce per voce.
const COMPORTAMENTI: { id: string; label: string }[] = [
    { id: "neutro", label: "— nessuno" },
    { id: "appuntamento", label: "📅 Appuntamento" },
    { id: "richiamo", label: "☎ Richiamo" },
    { id: "non_risposto", label: "📵 Non risposto" },
];

const CATEGORIE: { id: string; label: string; hint: string }[] = [
    { id: "stato", label: "Stati / Esiti", hint: "La lista che i caller scelgono quando esitano una chiamata. La tendina a destra decide l'AUTOMATISMO della voce: Appuntamento = chiede data/negozio e va sul calendario; Richiamo = chiede la data e crea il promemoria; Non risposto = chiede il WhatsApp." },
    { id: "provenienza", label: "Provenienze", hint: "Da dove arriva il lead." },
    { id: "tipologia", label: "Tipologie", hint: "Il tipo di attività della chiamata." },
    { id: "obiettivo", label: "Obiettivi", hint: "Cosa si vuole vendere/ottenere." },
];

export function CallCenterView() {
    const [righe, setRighe] = useState<Opzione[]>([]);
    const [err, setErr] = useState<string | null>(null);
    const [nuova, setNuova] = useState<Record<string, string>>({});
    const [delId, setDelId] = useState<string | null>(null);
    const [editId, setEditId] = useState<string | null>(null);
    const [editVal, setEditVal] = useState("");

    const carica = useCallback(async () => {
        const { data, error } = await supabase.from("caller_opzioni").select("*").order("ordine");
        if (error) { setErr(error.message + " — probabilmente manca la migrazione 105"); return; }
        setErr(null);
        setRighe((data ?? []) as Opzione[]);
    }, []);
    useEffect(() => { carica(); }, [carica]);

    const aggiungi = async (categoria: string) => {
        const voce = (nuova[categoria] || "").trim();
        if (!voce) return;
        const maxOrd = Math.max(0, ...righe.filter((r) => r.categoria === categoria).map((r) => r.ordine));
        const { error } = await supabase.from("caller_opzioni").insert({ categoria, voce, ordine: maxOrd + 10 });
        if (error) { setErr(error.message.includes("duplicate") ? `"${voce}" esiste già in questa lista.` : error.message); return; }
        setNuova((p) => ({ ...p, [categoria]: "" }));
        carica();
    };
    const salvaRinomina = async (r: Opzione) => {
        const voce = editVal.trim();
        setEditId(null);
        if (!voce || voce === r.voce) return;
        const { error } = await supabase.from("caller_opzioni").update({ voce }).eq("id", r.id);
        if (error) { setErr(error.message.includes("duplicate") ? `"${voce}" esiste già in questa lista.` : error.message); return; }
        carica();
    };
    const toggle = async (r: Opzione) => {
        await supabase.from("caller_opzioni").update({ attiva: !r.attiva }).eq("id", r.id);
        carica();
    };
    const elimina = async (r: Opzione) => {
        setDelId(null);
        await supabase.from("caller_opzioni").delete().eq("id", r.id);
        carica();
    };
    const sposta = async (r: Opzione, dir: -1 | 1) => {
        const lista = righe.filter((x) => x.categoria === r.categoria).sort((a, b) => a.ordine - b.ordine);
        const i = lista.findIndex((x) => x.id === r.id);
        const altro = lista[i + dir];
        if (!altro) return;
        await supabase.from("caller_opzioni").update({ ordine: altro.ordine }).eq("id", r.id);
        await supabase.from("caller_opzioni").update({ ordine: r.ordine }).eq("id", altro.id);
        carica();
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center border border-violet-500/20">
                    <Phone className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-white">Call Center — opzioni della sezione Caller</h2>
                    <p className="text-sm text-slate-400">Le liste che i caller vedono nei form e nei filtri. Spegnere una voce la toglie dalle scelte nuove; le pratiche già salvate mantengono il loro testo.</p>
                </div>
            </div>

            {err && <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">{err}</div>}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                {CATEGORIE.map((cat) => {
                    const voci = righe.filter((r) => r.categoria === cat.id).sort((a, b) => a.ordine - b.ordine);
                    return (
                        <div key={cat.id} className="glass-panel p-5">
                            <h3 className="text-sm font-bold text-white">{cat.label} <span className="text-slate-500 font-normal">· {voci.filter((v) => v.attiva).length} attive</span></h3>
                            <p className="text-[11px] text-slate-500 mt-0.5 mb-3">{cat.hint}</p>
                            <div className="space-y-1">
                                {voci.map((r, i) => (
                                    <div key={r.id} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${r.attiva ? "border-white/8 bg-white/[0.02]" : "border-white/5 bg-transparent opacity-50"}`}>
                                        <div className="flex flex-col -my-1">
                                            <button onClick={() => sposta(r, -1)} disabled={i === 0} className="text-slate-600 hover:text-white disabled:opacity-20 leading-none"><ChevronUp className="w-3.5 h-3.5" /></button>
                                            <button onClick={() => sposta(r, 1)} disabled={i === voci.length - 1} className="text-slate-600 hover:text-white disabled:opacity-20 leading-none"><ChevronDown className="w-3.5 h-3.5" /></button>
                                        </div>
                                        {editId === r.id ? (
                                            <input autoFocus value={editVal} onChange={(e) => setEditVal(e.target.value)}
                                                onBlur={() => salvaRinomina(r)}
                                                onKeyDown={(e) => { if (e.key === "Enter") salvaRinomina(r); if (e.key === "Escape") setEditId(null); }}
                                                className="flex-1 glass-input !h-7 text-sm px-2" />
                                        ) : (
                                            <button onClick={() => { setEditId(r.id); setEditVal(r.voce); }} title="Clicca per rinominare"
                                                className="flex-1 text-left text-sm text-slate-200 hover:text-white truncate">{r.voce}</button>
                                        )}
                                        {cat.id === "stato" && (
                                            <select value={r.comportamento || "neutro"}
                                                onChange={async (e) => {
                                                    const { error } = await supabase.from("caller_opzioni").update({ comportamento: e.target.value }).eq("id", r.id);
                                                    if (error) setErr(/comportamento/i.test(error.message) ? "Manca la migrazione 119 (colonna comportamento)." : error.message);
                                                    carica();
                                                }}
                                                title="Automatismo dello stato nel Caller"
                                                className="shrink-0 bg-black/40 border border-white/10 rounded-lg px-1.5 py-1 text-[11px] text-slate-300 outline-none cursor-pointer">
                                                {COMPORTAMENTI.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                                            </select>
                                        )}
                                        <button onClick={() => toggle(r)} title={r.attiva ? "Attiva — clicca per spegnerla" : "Spenta — clicca per riattivarla"}
                                            className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${r.attiva ? "bg-emerald-500/70" : "bg-white/10"}`}>
                                            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${r.attiva ? "left-[18px]" : "left-0.5"}`} />
                                        </button>
                                        {delId === r.id ? (
                                            <span className="inline-flex gap-1 shrink-0">
                                                <button onClick={() => elimina(r)} className="text-[10px] px-2 py-1 rounded-md bg-rose-500/20 border border-rose-500/50 text-rose-300 font-bold">Elimina</button>
                                                <button onClick={() => setDelId(null)} className="text-[10px] px-1.5 py-1 rounded-md text-slate-400">✕</button>
                                            </span>
                                        ) : (
                                            <button onClick={() => setDelId(r.id)} title="Elimina la voce (le pratiche vecchie mantengono il testo)"
                                                className="p-1 rounded-md text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 shrink-0">🗑</button>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <div className="flex gap-2 mt-3">
                                <input value={nuova[cat.id] || ""} onChange={(e) => setNuova((p) => ({ ...p, [cat.id]: e.target.value }))}
                                    onKeyDown={(e) => { if (e.key === "Enter") aggiungi(cat.id); }}
                                    placeholder="Nuova voce…" className="glass-input flex-1 !h-9 text-sm" />
                                <button onClick={() => aggiungi(cat.id)} disabled={!(nuova[cat.id] || "").trim()}
                                    className="px-3.5 h-9 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold disabled:opacity-40 flex items-center gap-1.5">
                                    <Plus className="w-4 h-4" /> Aggiungi
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
