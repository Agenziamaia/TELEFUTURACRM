"use client";

// TRACKING PDA (MOD-28, Luca 10/08): pannello per gestire gli ESITI NEGOZIO
// del Tracking, divisi per categoria (tabella tracking_esiti, seed dalla
// fotografia delle liste storiche). La CHIAVE nasce col seed o dall'etichetta
// alla creazione e poi NON si tocca: e' il valore scritto sulle pratiche
// (stato_negozio / stati_categoria), rinominare cambia solo la resa a schermo.
// Il flag COMPLETATA marca il "fine processo": la pratica sparisce dalla
// lista attiva, entra nella coda "⚡ Da lavorare" della verifica
// amministrazione e ferma la maturazione del malus.
import { useCallback, useEffect, useState } from "react";
import { Radar, Plus, ChevronUp, ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { CATEGORIE } from "../../pda/tracking/trackingConstants";

type Esito = {
    id: string; categoria: string; chiave: string; etichetta: string;
    colore: string; bg: string; ordine: number; attiva: boolean; completata: boolean;
    lato?: string | null;   // 'negozio' | 'admin' (verifica amministrativa)
    malus_giorno?: number | null;   // €/gg dell'esito admin (es. Non Conforme)
    brand?: string | null;  // NULL = generale; es. 'windtre' = solo per quell'operatore (fisso)
};

// ESITI PER OPERATORE (Luca 10/08): solo il FISSO cambia esiti da operatore a
// operatore — chips cliccabili nel riquadro; la lista di un operatore, se
// esiste, VINCE sulla generale per le sue pratiche nel Tracking.
const OPERATORI_FISSO = [
    { id: "windtre", label: "WindTre" }, { id: "vodafone", label: "Vodafone" },
    { id: "fastweb", label: "Fastweb" }, { id: "sky", label: "Sky" },
    { id: "tim", label: "TIM" }, { id: "iliad", label: "Iliad" },
];
const normBrand = (b: string | null | undefined) => String(b || "").trim().toLowerCase().replace(/\s+/g, "");

// coppie colore/sfondo gia' in uso sui badge del Tracking: il pallino cicla qui
const PALETTE: { colore: string; bg: string }[] = [
    { colore: "var(--tf-94a3b8)", bg: "var(--tf-1e293b)" },
    { colore: "var(--tf-f59e0b)", bg: "var(--tf-451a03)" },
    { colore: "var(--tf-f97316)", bg: "var(--tf-431407)" },
    { colore: "var(--tf-fb923c)", bg: "var(--tf-431407)" },
    { colore: "var(--tf-fbbf24)", bg: "var(--tf-451a03)" },
    { colore: "var(--tf-e879f9)", bg: "var(--tf-3b0764)" },
    { colore: "var(--tf-3b82f6)", bg: "var(--tf-172554)" },
    { colore: "var(--tf-38bdf8)", bg: "var(--tf-0c2a3f)" },
    { colore: "var(--tf-22c55e)", bg: "var(--tf-052e16)" },
    { colore: "var(--tf-4ade80)", bg: "var(--tf-052e16)" },
    { colore: "var(--tf-a78bfa)", bg: "var(--tf-2e1065)" },
    { colore: "var(--tf-818cf8)", bg: "var(--tf-1e1b4b)" },
    { colore: "var(--tf-ef4444)", bg: "var(--tf-450a0a)" },
    { colore: "var(--tf-dc2626)", bg: "var(--tf-3f0a0a)" },
    { colore: "var(--tf-f43f5e)", bg: "var(--tf-4c0519)" },
];

const slugDi = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "esito";

// nel Tracking le pratiche TV viaggiano come "sky" (rimappate): la colonna TV
// non ha esiti suoi e qui non compare
const CATEGORIE_PANNELLO = CATEGORIE.filter((c) => c.id !== "tv");

export function TrackingEsitiView() {
    // DUE LATI (Luca 10/08): esiti del NEGOZIO e della VERIFICA AMMINISTRATIVA
    // — stessa meccanica, flag "completata/definitiva" con significato analogo
    const [lato, setLato] = useState<"negozio" | "admin">("negozio");
    const [righe, setRighe] = useState<Esito[]>([]);
    const [err, setErr] = useState<string | null>(null);
    const [nuova, setNuova] = useState<Record<string, string>>({});
    const [delId, setDelId] = useState<string | null>(null);
    const [editId, setEditId] = useState<string | null>(null);
    const [editVal, setEditVal] = useState("");
    // operatore selezionato nel riquadro FISSO ("" = esiti generali)
    const [brandFisso, setBrandFisso] = useState("");

    const carica = useCallback(async () => {
        const { data, error } = await supabase.from("tracking_esiti").select("*").order("ordine");
        if (error) { setErr(error.message + " — probabilmente manca la migrazione tracking_esiti (node apply_mig_tracking_esiti.js)"); return; }
        setErr(null);
        setRighe((data ?? []) as Esito[]);
    }, []);
    useEffect(() => { carica(); }, [carica]);

    const brandDi = (categoria: string) => (categoria === "fisso" ? brandFisso : "");
    const aggiungi = async (categoria: string) => {
        const etichetta = (nuova[categoria] || "").trim();
        if (!etichetta) return;
        const b = brandDi(categoria);
        const lista = righe.filter((r) => r.categoria === categoria && (r.lato || "negozio") === lato && normBrand(r.brand) === b);
        let chiave = slugDi(etichetta);
        while (lista.some((r) => r.chiave === chiave)) chiave += "_2";
        const maxOrd = Math.max(0, ...lista.map((r) => r.ordine));
        const { error } = await supabase.from("tracking_esiti").insert({
            categoria, chiave, etichetta, colore: PALETTE[0].colore, bg: PALETTE[0].bg, ordine: maxOrd + 10, lato, brand: b || null,
        });
        if (error) { setErr(error.message); return; }
        setNuova((p) => ({ ...p, [categoria]: "" }));
        carica();
    };
    // primo click su un operatore senza lista: si parte COPIANDO gli esiti
    // generali, cosi' il Tracking resta allineato (stesse chiavi) e da li' si
    // personalizza — aggiungendo, spegnendo o rinominando
    const clonaGenerale = async (b: string) => {
        const gen = righe.filter((r) => r.categoria === "fisso" && (r.lato || "negozio") === lato && !normBrand(r.brand));
        if (!gen.length) { setErr("Nessun esito generale del fisso da copiare"); return; }
        const { error } = await supabase.from("tracking_esiti").insert(gen.map((r) => ({
            categoria: "fisso", chiave: r.chiave, etichetta: r.etichetta, colore: r.colore, bg: r.bg,
            ordine: r.ordine, attiva: r.attiva, completata: r.completata, lato, malus_giorno: r.malus_giorno ?? null, brand: b,
        })));
        if (error) { setErr(error.message); return; }
        carica();
    };
    const salvaRinomina = async (r: Esito) => {
        const etichetta = editVal.trim();
        setEditId(null);
        if (!etichetta || etichetta === r.etichetta) return;
        const { error } = await supabase.from("tracking_esiti").update({ etichetta }).eq("id", r.id);
        if (error) { setErr(error.message); return; }
        carica();
    };
    const cicloColore = async (r: Esito) => {
        const i = PALETTE.findIndex((p) => p.colore === r.colore);
        const next = PALETTE[(i + 1) % PALETTE.length];
        await supabase.from("tracking_esiti").update({ colore: next.colore, bg: next.bg }).eq("id", r.id);
        carica();
    };
    const toggleAttiva = async (r: Esito) => {
        await supabase.from("tracking_esiti").update({ attiva: !r.attiva }).eq("id", r.id);
        carica();
    };
    const toggleCompletata = async (r: Esito) => {
        await supabase.from("tracking_esiti").update({ completata: !r.completata }).eq("id", r.id);
        carica();
    };
    // €/GIORNO dell'esito admin (10/08): vuoto = nessun malus
    const salvaMalus = async (r: Esito, v: string) => {
        const n = v.trim() === "" ? null : (parseFloat(v.replace(",", ".")) || null);
        if ((n ?? null) === (r.malus_giorno ?? null)) return;
        await supabase.from("tracking_esiti").update({ malus_giorno: n }).eq("id", r.id);
        carica();
    };
    const elimina = async (r: Esito) => {
        setDelId(null);
        await supabase.from("tracking_esiti").delete().eq("id", r.id);
        carica();
    };
    const sposta = async (r: Esito, dir: -1 | 1) => {
        const lista = righe.filter((x) => x.categoria === r.categoria && (x.lato || "negozio") === (r.lato || "negozio") && normBrand(x.brand) === normBrand(r.brand)).sort((a, b) => a.ordine - b.ordine);
        const i = lista.findIndex((x) => x.id === r.id);
        const altro = lista[i + dir];
        if (!altro) return;
        await supabase.from("tracking_esiti").update({ ordine: altro.ordine }).eq("id", r.id);
        await supabase.from("tracking_esiti").update({ ordine: r.ordine }).eq("id", altro.id);
        carica();
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                    <Radar className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-white">Tracking PDA — esiti per categoria</h2>
                    <p className="text-sm text-slate-400">
                        {lato === "negozio"
                            ? <>Gli esiti che il NEGOZIO sceglie sulle pratiche. Il flag <b className="text-emerald-400">🏁 completata</b> = fine del processo: la pratica sparisce dalla lista attiva, entra nella coda di verifica amministrazione (⚡ Da lavorare) e ferma il malus.</>
                            : <>Gli esiti della VERIFICA AMMINISTRATIVA. Il flag <b className="text-emerald-400">🏁 definitiva</b> = chiude completamente il cerchio della pratica: esce dalla coda ⚡ Da lavorare (Non Conforme resta speciale: la riapre).</>}
                    </p>
                </div>
            </div>

            {/* switch NEGOZIO / AMMINISTRAZIONE (Luca 10/08) */}
            <div className="flex gap-2">
                {([["negozio", "🏬 Esiti negozio"], ["admin", "🧾 Esiti amministrazione"]] as ["negozio" | "admin", string][]).map(([id, label]) => (
                    <button key={id} onClick={() => setLato(id)}
                        className={`px-4 py-2 rounded-xl border text-sm font-bold transition-colors ${lato === id ? "border-indigo-400/70 bg-indigo-500/15 text-white" : "border-white/10 bg-white/[0.04] text-slate-400 hover:border-white/25"}`}>
                        {label}
                    </button>
                ))}
            </div>

            {err && <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">{err}</div>}
            {!err && righe.length === 0 && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm">
                    Nessun esito a database: il Tracking sta usando le liste predefinite. Lancia <code className="font-mono">node apply_mig_tracking_esiti.js</code> per censirle e amministrarle da qui.
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                {CATEGORIE_PANNELLO.map((cat) => {
                    const bSel = cat.id === "fisso" ? brandFisso : "";
                    const voci = righe.filter((r) => r.categoria === cat.id && (r.lato || "negozio") === lato && normBrand(r.brand) === bSel).sort((a, b) => a.ordine - b.ordine);
                    // operatori con una lista propria (nel lato corrente) + quelli predefiniti
                    const conLista = new Set(righe.filter((r) => r.categoria === "fisso" && (r.lato || "negozio") === lato && normBrand(r.brand)).map((r) => normBrand(r.brand)));
                    const opFisso = [...OPERATORI_FISSO, ...[...conLista].filter((b) => !OPERATORI_FISSO.some((o) => o.id === b)).map((b) => ({ id: b, label: b }))];
                    return (
                        <div key={cat.id} className="glass-panel p-5">
                            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cat.color }} />
                                {cat.label} <span className="text-slate-500 font-normal">· {voci.filter((v) => v.attiva).length} attive</span>
                                {cat.id === "fisso" && brandFisso && <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-sky-500/15 border border-sky-500/40 text-sky-300">{(OPERATORI_FISSO.find((o) => o.id === brandFisso)?.label) || brandFisso}</span>}
                            </h3>
                            <p className="text-[11px] text-slate-500 mt-0.5 mb-3">{cat.desc}</p>
                            {cat.id === "fisso" && (
                                <div className="flex flex-wrap items-center gap-1.5 mb-3">
                                    <button onClick={() => setBrandFisso("")}
                                        className={`text-[11px] font-bold px-2.5 py-1 rounded-full border transition-colors ${!brandFisso ? "border-indigo-400/70 bg-indigo-500/15 text-white" : "border-white/10 bg-white/[0.04] text-slate-400 hover:border-white/25"}`}>
                                        🌐 Generale
                                    </button>
                                    {opFisso.map((o) => (
                                        <button key={o.id} onClick={() => setBrandFisso(o.id)}
                                            title={conLista.has(o.id) ? `${o.label}: esiti personalizzati` : `${o.label}: usa gli esiti generali (clicca per personalizzare)`}
                                            className={`text-[11px] font-bold px-2.5 py-1 rounded-full border transition-colors ${brandFisso === o.id ? "border-sky-400/70 bg-sky-500/15 text-white" : conLista.has(o.id) ? "border-sky-500/30 bg-sky-500/[0.06] text-sky-300/80 hover:border-sky-400/60" : "border-white/10 bg-white/[0.04] text-slate-500 hover:border-white/25"}`}>
                                            {o.label}{conLista.has(o.id) ? " ●" : ""}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {cat.id === "fisso" && brandFisso && voci.length === 0 && (
                                <div className="mb-3 p-3 rounded-xl bg-sky-500/[0.07] border border-sky-500/25 text-[12px] text-sky-200/90 space-y-2">
                                    <div>Le pratiche <b>{(OPERATORI_FISSO.find((o) => o.id === brandFisso)?.label) || brandFisso}</b> oggi usano gli <b>esiti generali</b> del fisso. Per dargli esiti propri si parte da una copia della lista generale, che poi personalizzi (rinomina, spegni, aggiungi): le chiavi restano allineate e il Tracking non perde gli stati gia&apos; dati.</div>
                                    <button onClick={() => clonaGenerale(brandFisso)}
                                        className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[12px] font-bold">
                                        🧬 Crea gli esiti di {(OPERATORI_FISSO.find((o) => o.id === brandFisso)?.label) || brandFisso} (copia dai generali)
                                    </button>
                                </div>
                            )}
                            {/* INTESTAZIONE colonne lato admin (Luca 10/08: il campo
                                €/gg da solo non era intuibile) */}
                            {lato === "admin" && voci.length > 0 && (
                                <div className="flex items-center justify-end gap-2 pr-2.5 mb-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                                    <span className="w-[84px] text-center" title="Malus in euro per ogni giorno lavorativo in cui la pratica resta in questo esito (vuoto = nessun malus)">Malus €/giorno</span>
                                    <span className="w-[88px] text-center">Definitiva</span>
                                    <span className="w-9 text-center">Attiva</span>
                                    <span className="w-7" />
                                </div>
                            )}
                            <div className="space-y-1">
                                {voci.map((r, i) => (
                                    <div key={r.id} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${r.attiva ? "border-white/8 bg-white/[0.02]" : "border-white/5 bg-transparent opacity-50"}`}>
                                        <div className="flex flex-col -my-1">
                                            <button onClick={() => sposta(r, -1)} disabled={i === 0} className="text-slate-600 hover:text-white disabled:opacity-20 leading-none"><ChevronUp className="w-3.5 h-3.5" /></button>
                                            <button onClick={() => sposta(r, 1)} disabled={i === voci.length - 1} className="text-slate-600 hover:text-white disabled:opacity-20 leading-none"><ChevronDown className="w-3.5 h-3.5" /></button>
                                        </div>
                                        <button
                                            onClick={() => cicloColore(r)}
                                            title="Colore — clicca per cambiarlo"
                                            className="w-4 h-4 rounded-full border border-white/20 shrink-0"
                                            style={{ background: r.colore }}
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
                                        {lato === "admin" && (
                                            <span className="flex items-center gap-1 shrink-0" title="Malus €/GIORNO lavorativo finché la pratica resta in questo esito admin (vuoto = nessun malus)">
                                                <input defaultValue={r.malus_giorno ?? ""} key={r.id + ":" + (r.malus_giorno ?? "")}
                                                    onBlur={(e) => salvaMalus(r, e.target.value)}
                                                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                                    placeholder="—" inputMode="decimal"
                                                    className={`w-14 glass-input !h-6 text-[11px] px-1.5 text-right ${r.malus_giorno ? "!border-rose-500/50 text-rose-300 font-bold" : ""}`} />
                                                <span className="text-[9px] text-slate-600 font-bold">€/gg</span>
                                            </span>
                                        )}
                                        <button onClick={() => toggleCompletata(r)}
                                            title={lato === "admin"
                                                ? (r.completata ? "DEFINITIVA: chiude il cerchio della pratica (esce dalla coda ⚡ Da lavorare) — clicca per toglierlo" : "Clicca per marcare questo esito come DEFINITIVO (chiude il cerchio)")
                                                : (r.completata ? "Fine processo: la pratica esce dalla lista attiva ed entra nella coda di verifica amministrazione — clicca per toglierlo" : "Clicca per marcare questo esito come FINE DEL PROCESSO (completata)")}
                                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 transition-colors ${r.completata
                                                ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-300"
                                                : "bg-transparent border-white/10 text-slate-600 hover:text-slate-300"}`}>
                                            🏁 {lato === "admin" ? "definitiva" : "completata"}
                                        </button>
                                        <button onClick={() => toggleAttiva(r)} title={r.attiva ? "Attiva — clicca per spegnerla" : "Spenta — clicca per riattivarla"}
                                            className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${r.attiva ? "bg-emerald-500/70" : "bg-white/10"}`}>
                                            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${r.attiva ? "left-[18px]" : "left-0.5"}`} />
                                        </button>
                                        {delId === r.id ? (
                                            <span className="inline-flex gap-1 shrink-0">
                                                <button onClick={() => elimina(r)} className="text-[10px] px-2 py-1 rounded-md bg-rose-500/20 border border-rose-500/50 text-rose-300 font-bold">Elimina</button>
                                                <button onClick={() => setDelId(null)} className="text-[10px] px-1.5 py-1 rounded-md text-slate-400">✕</button>
                                            </span>
                                        ) : (
                                            <button onClick={() => setDelId(r.id)} title="Elimina la voce (le pratiche storiche mantengono la chiave)"
                                                className="p-1 rounded-md text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 shrink-0">🗑</button>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <div className="flex gap-2 mt-3">
                                <input value={nuova[cat.id] || ""} onChange={(e) => setNuova((p) => ({ ...p, [cat.id]: e.target.value }))}
                                    onKeyDown={(e) => { if (e.key === "Enter") aggiungi(cat.id); }}
                                    placeholder="Nuovo esito…" className="glass-input flex-1 !h-9 text-sm" />
                                <button onClick={() => aggiungi(cat.id)} disabled={!(nuova[cat.id] || "").trim()}
                                    className="px-3.5 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold disabled:opacity-40 flex items-center gap-1.5">
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
