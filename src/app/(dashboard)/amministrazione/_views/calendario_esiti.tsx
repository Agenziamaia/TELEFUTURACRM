"use client";

// CALENDARIO (Luca 30/07, mig. 106): pannello per gestire gli ESITI del
// calendario, divisi per tipo — appuntamenti in negozio, a domicilio, task.
// La CHIAVE (il valore salvato sulle righe) nasce dall'etichetta alla
// creazione e poi NON si tocca: rinominare cambia solo la resa a schermo,
// quindi le righe storiche restano leggibili. Colore da palette fissa.
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Plus, ChevronUp, ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type Esito = { id: string; tipo: string; chiave: string; etichetta: string; colore: string; ordine: number; attiva: boolean };

const TIPI: { id: string; label: string; hint: string }[] = [
    { id: "incoming", label: "Appuntamenti in negozio (inbound)", hint: "Il cliente viene in store." },
    { id: "outgoing", label: "Appuntamenti a domicilio (outbound)", hint: "L'agente va dal cliente." },
    { id: "task", label: "Task", hint: "Le attività assegnate a persone o negozi." },
];

const PALETTE: Record<string, string> = {
    blue: "#60a5fa", emerald: "#34d399", rose: "#fb7185", purple: "#c084fc",
    yellow: "#facc15", amber: "#fbbf24", orange: "#fb923c", sky: "#38bdf8",
    violet: "#a78bfa", slate: "#94a3b8",
};

const slugDi = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "esito";

export function CalendarioEsitiView() {
    const [righe, setRighe] = useState<Esito[]>([]);
    const [err, setErr] = useState<string | null>(null);
    const [nuova, setNuova] = useState<Record<string, string>>({});
    const [delId, setDelId] = useState<string | null>(null);
    const [editId, setEditId] = useState<string | null>(null);
    const [editVal, setEditVal] = useState("");

    const carica = useCallback(async () => {
        const { data, error } = await supabase.from("calendario_esiti").select("*").order("ordine");
        if (error) { setErr(error.message + " — probabilmente manca la migrazione 106"); return; }
        setErr(null);
        setRighe((data ?? []) as Esito[]);
    }, []);
    useEffect(() => { carica(); }, [carica]);

    const aggiungi = async (tipo: string) => {
        const etichetta = (nuova[tipo] || "").trim();
        if (!etichetta) return;
        const lista = righe.filter((r) => r.tipo === tipo);
        let chiave = slugDi(etichetta);
        while (lista.some((r) => r.chiave === chiave)) chiave += "_2";
        const maxOrd = Math.max(0, ...lista.map((r) => r.ordine));
        const { error } = await supabase.from("calendario_esiti").insert({ tipo, chiave, etichetta, colore: "slate", ordine: maxOrd + 10 });
        if (error) { setErr(error.message); return; }
        setNuova((p) => ({ ...p, [tipo]: "" }));
        carica();
    };
    const salvaRinomina = async (r: Esito) => {
        const etichetta = editVal.trim();
        setEditId(null);
        if (!etichetta || etichetta === r.etichetta) return;
        const { error } = await supabase.from("calendario_esiti").update({ etichetta }).eq("id", r.id);
        if (error) { setErr(error.message); return; }
        carica();
    };
    const setColore = async (r: Esito, colore: string) => {
        await supabase.from("calendario_esiti").update({ colore }).eq("id", r.id);
        carica();
    };
    const toggle = async (r: Esito) => {
        await supabase.from("calendario_esiti").update({ attiva: !r.attiva }).eq("id", r.id);
        carica();
    };
    const elimina = async (r: Esito) => {
        setDelId(null);
        await supabase.from("calendario_esiti").delete().eq("id", r.id);
        carica();
    };
    const sposta = async (r: Esito, dir: -1 | 1) => {
        const lista = righe.filter((x) => x.tipo === r.tipo).sort((a, b) => a.ordine - b.ordine);
        const i = lista.findIndex((x) => x.id === r.id);
        const altro = lista[i + dir];
        if (!altro) return;
        await supabase.from("calendario_esiti").update({ ordine: altro.ordine }).eq("id", r.id);
        await supabase.from("calendario_esiti").update({ ordine: r.ordine }).eq("id", altro.id);
        carica();
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center border border-sky-500/20">
                    <CalendarDays className="w-5 h-5 text-sky-400" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-white">Calendario — esiti per tipo di evento</h2>
                    <p className="text-sm text-slate-400">Le liste degli esiti che si scelgono sugli appuntamenti e sulle task. Spegnere una voce la toglie dalle scelte nuove; gli eventi già esitati mantengono etichetta e colore.</p>
                </div>
            </div>

            {err && <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">{err}</div>}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                {TIPI.map((tipo) => {
                    const voci = righe.filter((r) => r.tipo === tipo.id).sort((a, b) => a.ordine - b.ordine);
                    return (
                        <div key={tipo.id} className="glass-panel p-5">
                            <h3 className="text-sm font-bold text-white">{tipo.label} <span className="text-slate-500 font-normal">· {voci.filter((v) => v.attiva).length} attive</span></h3>
                            <p className="text-[11px] text-slate-500 mt-0.5 mb-3">{tipo.hint}</p>
                            <div className="space-y-1">
                                {voci.map((r, i) => (
                                    <div key={r.id} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${r.attiva ? "border-white/8 bg-white/[0.02]" : "border-white/5 bg-transparent opacity-50"}`}>
                                        <div className="flex flex-col -my-1">
                                            <button onClick={() => sposta(r, -1)} disabled={i === 0} className="text-slate-600 hover:text-white disabled:opacity-20 leading-none"><ChevronUp className="w-3.5 h-3.5" /></button>
                                            <button onClick={() => sposta(r, 1)} disabled={i === voci.length - 1} className="text-slate-600 hover:text-white disabled:opacity-20 leading-none"><ChevronDown className="w-3.5 h-3.5" /></button>
                                        </div>
                                        {/* palette colore: pallino cliccabile che cicla */}
                                        <button
                                            onClick={() => {
                                                const nomi = Object.keys(PALETTE);
                                                const next = nomi[(nomi.indexOf(r.colore) + 1) % nomi.length];
                                                setColore(r, next);
                                            }}
                                            title={`Colore: ${r.colore} — clicca per cambiarlo`}
                                            className="w-4 h-4 rounded-full border border-white/20 shrink-0"
                                            style={{ background: PALETTE[r.colore] || PALETTE.slate }}
                                        />
                                        {editId === r.id ? (
                                            <input autoFocus value={editVal} onChange={(e) => setEditVal(e.target.value)}
                                                onBlur={() => salvaRinomina(r)}
                                                onKeyDown={(e) => { if (e.key === "Enter") salvaRinomina(r); if (e.key === "Escape") setEditId(null); }}
                                                className="flex-1 glass-input !h-7 text-sm px-2" />
                                        ) : (
                                            <button onClick={() => { setEditId(r.id); setEditVal(r.etichetta); }} title={`Clicca per rinominare (chiave interna: ${r.chiave})`}
                                                className="flex-1 text-left text-sm text-slate-200 hover:text-white truncate">{r.etichetta}</button>
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
                                            <button onClick={() => setDelId(r.id)} title="Elimina la voce (gli eventi storici mantengono la chiave)"
                                                className="p-1 rounded-md text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 shrink-0">🗑</button>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <div className="flex gap-2 mt-3">
                                <input value={nuova[tipo.id] || ""} onChange={(e) => setNuova((p) => ({ ...p, [tipo.id]: e.target.value }))}
                                    onKeyDown={(e) => { if (e.key === "Enter") aggiungi(tipo.id); }}
                                    placeholder="Nuovo esito…" className="glass-input flex-1 !h-9 text-sm" />
                                <button onClick={() => aggiungi(tipo.id)} disabled={!(nuova[tipo.id] || "").trim()}
                                    className="px-3.5 h-9 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-bold disabled:opacity-40 flex items-center gap-1.5">
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
