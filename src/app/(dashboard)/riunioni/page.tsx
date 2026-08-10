"use client";

/**
 * RIUNIONI — deck builder fase 0-1 (docs/PIANO_DECK_BUILDER_RIUNIONI.md).
 * Archivio dei deck mensili + renderer a BLOCCHI + modalità Presenta.
 *
 * - Il deck CONGELA il dataset (snapshot da /api/riunione/dataset): i numeri
 *   in riunione non ballano; "🔄 Aggiorna dati" è un'azione esplicita che
 *   rigenera dataset e blocchi (solo sulle bozze).
 * - Blocchi tipizzati (cover · kpi · tabella · testo) — l'editor per-blocco è
 *   la fase 2, la regia AI la fase 3: qui il deck è read-only.
 * - Presenta = overlay a schermo intero, frecce ←/→, ESC per uscire.
 * - Export PPTX/PDF: fase dedicata (pptxgenjs coi layout 1:1, come da piano).
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import { useRolePermissions } from "@/lib/usePermissions";
import { capAllowed, RIUNIONI_SECTION, CAP_RIUNIONI_GESTISCE, CAP_RIUNIONI_PRESENTA } from "@/lib/capabilities";
import type { CeDataset } from "@/lib/contoEconomico";
import { Loader2, Play, RefreshCw, Snowflake, LockOpen, ChevronLeft, Trash2 } from "lucide-react";

const BG = "var(--tf-0d1424)";

type Blocco =
    | { tipo: "cover"; titolo: string; sottotitolo?: string }
    | { tipo: "kpi"; titolo?: string; kpi: { label: string; valore: string; sub?: string }[] }
    | { tipo: "tabella"; titolo?: string; intestazioni: string[]; righe: (string | number)[][] }
    | { tipo: "testo"; titolo?: string; corpo: string };

type DeckLista = { id: string; mese: string; titolo: string; stato: string; created_by: string | null; updated_at: string };
type Deck = DeckLista & { dataset: { mese: string; generato_il: string; ce: CeDataset }; blocchi: Blocco[] };

const fmt = (n: number) => n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 0 });
const labelMese = (m: string) => {
    const [y, mm] = m.slice(0, 7).split("-").map(Number);
    const s = new Date(y, mm - 1, 1).toLocaleDateString("it-IT", { month: "long", year: "numeric" });
    return s.charAt(0).toUpperCase() + s.slice(1);
};
const meseCorrente = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

/** Bozza di blocchi dal dataset (fase 1: composizione fissa; la regia AI è la fase 3). */
function generaBlocchi(mese: string, ce: CeDataset): Blocco[] {
    const attivi = ce.negozi.filter(n => n.ricavi.actual_tot !== 0 || n.costi.totale !== 0 || Object.values(n.pezzi).some(p => p));
    const ordinati = [...attivi].sort((a, b) => b.utile_actual - a.utile_actual);
    return [
        { tipo: "cover", titolo: `Riunione ${labelMese(mese)}`, sottotitolo: "Telefutura — numeri vivi dal CRM" },
        {
            tipo: "kpi", titolo: "La rete in un colpo d'occhio", kpi: [
                { label: "Ricavi", valore: `€ ${fmt(ce.totali.ricavi)}` },
                { label: "Costi", valore: `€ ${fmt(ce.totali.costi)}` },
                { label: "Utile", valore: `€ ${fmt(ce.totali.utile)}` },
                { label: "Marginalità (incassi)", valore: `€ ${fmt(ce.totali.marginalita)}`, sub: `margine € ${fmt(ce.totali.marginalita_margine)}` },
                { label: "Appuntamenti telefonico", valore: fmt0(ce.totali.appuntamenti), sub: `riparto € ${fmt(ce.totali.telefonico)}` },
            ],
        },
        {
            tipo: "tabella", titolo: "Utile per punto vendita",
            intestazioni: ["Punto vendita", "Ricavi €", "Costi €", "Utile €"],
            righe: ordinati.map(n => [n.nome, fmt(n.ricavi.actual_tot), fmt(n.costi.totale), fmt(n.utile_actual)]),
        },
        {
            tipo: "tabella", titolo: "Marginalità per punto vendita",
            intestazioni: ["Punto vendita", "Incassi €", "Margine €"],
            righe: [...attivi].sort((a, b) => b.ricavi.marginalita - a.ricavi.marginalita)
                .map(n => [n.nome, fmt(n.ricavi.marginalita), fmt(n.marginalita_margine)]),
        },
        {
            tipo: "tabella", titolo: "Produzione a pezzi",
            intestazioni: ["Punto vendita", "Wind3", "Vodafone", "Sky", "Fastweb", "Iliad", "Energia"],
            righe: attivi.map(n => [n.nome, n.pezzi.wind3, n.pezzi.vodafone, n.pezzi.sky, n.pezzi.fastweb, n.pezzi.iliad, n.pezzi.energia]),
        },
        { tipo: "testo", titolo: "Priorità del mese", corpo: "— da compilare in riunione —\n(la bozza automatica dei giudizi arriva con la regia AI, fase 3 del piano)" },
    ];
}

function Slide({ b, presenta }: { b: Blocco; presenta?: boolean }) {
    const base = presenta ? "w-full h-full flex flex-col justify-center px-[6vw]" : "rounded-xl border border-white/10 p-6";
    if (b.tipo === "cover") return (
        <div className={base} style={{ background: presenta ? "transparent" : "linear-gradient(135deg, rgba(99,102,241,0.25), rgba(14,21,38,0))" }}>
            <div className={presenta ? "text-6xl font-black" : "text-3xl font-black"}>{b.titolo}</div>
            {b.sottotitolo && <div className={`text-slate-400 mt-3 ${presenta ? "text-2xl" : "text-sm"}`}>{b.sottotitolo}</div>}
        </div>
    );
    if (b.tipo === "kpi") return (
        <div className={base}>
            {b.titolo && <div className={`font-bold mb-4 ${presenta ? "text-4xl" : "text-lg"}`}>{b.titolo}</div>}
            <div className={`grid gap-3 ${presenta ? "grid-cols-3" : "grid-cols-2 md:grid-cols-3 xl:grid-cols-5"}`}>
                {b.kpi.map((k, i) => (
                    <div key={i} className="rounded-xl border border-white/10 p-4" style={{ background: "rgba(255,255,255,0.03)" }}>
                        <div className={`text-slate-400 ${presenta ? "text-lg" : "text-xs"}`}>{k.label}</div>
                        <div className={`font-black tabular-nums ${presenta ? "text-4xl mt-2" : "text-xl mt-1"}`}>{k.valore}</div>
                        {k.sub && <div className={`text-slate-500 ${presenta ? "text-base mt-1" : "text-[11px]"}`}>{k.sub}</div>}
                    </div>
                ))}
            </div>
        </div>
    );
    if (b.tipo === "tabella") return (
        <div className={base}>
            {b.titolo && <div className={`font-bold mb-3 ${presenta ? "text-4xl mb-6" : "text-lg"}`}>{b.titolo}</div>}
            <div className="overflow-x-auto">
                <table className={`w-full ${presenta ? "text-xl" : "text-sm"}`}>
                    <thead><tr className="text-slate-400 border-b border-white/15">
                        {b.intestazioni.map((h, i) => <th key={i} className={`px-3 py-2 ${i ? "text-right" : "text-left"}`}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                        {b.righe.map((r, i) => (
                            <tr key={i} className="border-b border-white/5">
                                {r.map((c, j) => <td key={j} className={`px-3 py-1.5 tabular-nums ${j ? "text-right" : "text-left font-semibold"} ${String(c).startsWith("-") ? "text-red-400" : ""}`}>{c}</td>)}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
    return (
        <div className={base}>
            {b.titolo && <div className={`font-bold mb-3 ${presenta ? "text-4xl mb-6" : "text-lg"}`}>{b.titolo}</div>}
            <div className={`text-slate-300 whitespace-pre-wrap ${presenta ? "text-2xl" : "text-sm"}`}>{b.corpo}</div>
        </div>
    );
}

export default function RiunioniPage() {
    const { user } = useAuth();
    const { perms } = useRolePermissions(user?.role, user?.grade, user?.id);
    const gestisce = capAllowed(user?.role, RIUNIONI_SECTION, CAP_RIUNIONI_GESTISCE, perms);
    const puoPresentare = capAllowed(user?.role, RIUNIONI_SECTION, CAP_RIUNIONI_PRESENTA, perms);

    const [lista, setLista] = useState<DeckLista[]>([]);
    const [loading, setLoading] = useState(true);
    const [errore, setErrore] = useState<string | null>(null);
    const [deck, setDeck] = useState<Deck | null>(null);
    const [lavoro, setLavoro] = useState(false);
    const [nuovoMese, setNuovoMese] = useState(meseCorrente());
    const [presenta, setPresenta] = useState<number | null>(null);   // indice slide

    const caricaLista = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase.from("riunione_deck")
            .select("id, mese, titolo, stato, created_by, updated_at")
            .order("mese", { ascending: false }).order("updated_at", { ascending: false });
        if (error) setErrore(error.message);
        setLista((data as DeckLista[]) || []);
        setLoading(false);
    }, []);
    useEffect(() => { caricaLista(); }, [caricaLista]);

    const scaricaDataset = async (mese: string) => {
        const res = await fetch(`/api/riunione/dataset?mese=${mese}`);
        const js = await res.json();
        if (!res.ok) throw new Error(js.error || "errore dataset");
        return js as Deck["dataset"];
    };

    const creaBozza = async () => {
        setLavoro(true); setErrore(null);
        try {
            const dataset = await scaricaDataset(nuovoMese);
            const blocchi = generaBlocchi(nuovoMese, dataset.ce);
            const { data, error } = await supabase.from("riunione_deck").insert({
                mese: `${nuovoMese}-01`, titolo: `Riunione ${labelMese(nuovoMese)}`,
                dataset, blocchi, created_by: user?.name || null,
            }).select("id").single();
            if (error) throw new Error(error.message);
            await caricaLista();
            if (data) await apriDeck(data.id);
        } catch (e) { setErrore(e instanceof Error ? e.message : "Errore nella creazione"); }
        setLavoro(false);
    };

    const apriDeck = async (id: string) => {
        setLavoro(true); setErrore(null);
        const { data, error } = await supabase.from("riunione_deck").select("*").eq("id", id).single();
        if (error) setErrore(error.message);
        else setDeck(data as Deck);
        setLavoro(false);
    };

    const aggiornaDati = async () => {
        if (!deck || deck.stato !== "bozza") return;
        if (!confirm("Rigenero dataset e blocchi con i numeri di ADESSO? La composizione attuale viene sostituita.")) return;
        setLavoro(true); setErrore(null);
        try {
            const mese = deck.mese.slice(0, 7);
            const dataset = await scaricaDataset(mese);
            const blocchi = generaBlocchi(mese, dataset.ce);
            const { error } = await supabase.from("riunione_deck")
                .update({ dataset, blocchi, updated_at: new Date().toISOString() }).eq("id", deck.id);
            if (error) throw new Error(error.message);
            await apriDeck(deck.id);
        } catch (e) { setErrore(e instanceof Error ? e.message : "Errore nell'aggiornamento"); }
        setLavoro(false);
    };

    const commutaCongelato = async () => {
        if (!deck) return;
        const nuovo = deck.stato === "congelato" ? "bozza" : "congelato";
        const { error } = await supabase.from("riunione_deck")
            .update({ stato: nuovo, updated_at: new Date().toISOString() }).eq("id", deck.id);
        if (error) setErrore(error.message); else { await apriDeck(deck.id); await caricaLista(); }
    };

    const eliminaDeck = async (d: DeckLista) => {
        if (!confirm(`Eliminare il deck "${d.titolo}"?`)) return;
        const { error } = await supabase.from("riunione_deck").delete().eq("id", d.id);
        if (error) setErrore(error.message); else await caricaLista();
    };

    // Presenta: frecce e ESC
    useEffect(() => {
        if (presenta === null || !deck) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setPresenta(null);
            if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); setPresenta(p => p === null ? p : Math.min(p + 1, deck.blocchi.length - 1)); }
            if (e.key === "ArrowLeft" || e.key === "PageUp") setPresenta(p => p === null ? p : Math.max(p - 1, 0));
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [presenta, deck]);

    const avviaPresenta = () => {
        if (!deck || !Array.isArray(deck.blocchi) || deck.blocchi.length === 0) return;
        setPresenta(0);
        try { document.documentElement.requestFullscreen?.()?.catch(() => { }); } catch { /* niente fullscreen: pazienza */ }
    };
    const chiudiPresenta = () => {
        setPresenta(null);
        try { if (document.fullscreenElement) document.exitFullscreen?.()?.catch(() => { }); } catch { /* ignora */ }
    };

    // ─── VISTA PRESENTAZIONE ───
    if (presenta !== null && deck) {
        const b = deck.blocchi[presenta];
        return (
            <div className="fixed inset-0 z-[1400] text-white select-none" style={{ background: "var(--tf-0a0a0f)" }}>
                <div className="absolute inset-0 cursor-pointer" onClick={() => setPresenta(p => p === null ? p : Math.min(p + 1, deck.blocchi.length - 1))}>
                    <Slide b={b} presenta />
                </div>
                <div className="absolute bottom-4 right-6 text-slate-500 text-sm tabular-nums">{presenta + 1} / {deck.blocchi.length}</div>
                <button onClick={chiudiPresenta} className="absolute top-4 right-6 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm">Esci (ESC)</button>
                {presenta > 0 && <button onClick={e => { e.stopPropagation(); setPresenta(presenta - 1); }} className="absolute left-3 top-1/2 -translate-y-1/2 px-2 py-4 rounded-lg bg-white/5 hover:bg-white/15 text-2xl">‹</button>}
            </div>
        );
    }

    // ─── VISTA DECK ───
    if (deck) {
        return (
            <div className="p-4 md:p-6 text-white max-w-5xl mx-auto">
                <div className="flex flex-wrap items-center gap-3 mb-4">
                    <button onClick={() => { setDeck(null); caricaLista(); }} className="p-1.5 rounded hover:bg-white/10"><ChevronLeft size={18} /></button>
                    <h2 className="text-2xl font-bold">{deck.titolo}</h2>
                    <span className={`text-xs px-2 py-1 rounded-full border ${deck.stato === "congelato" ? "bg-sky-500/15 border-sky-400/30 text-sky-300" : "bg-amber-500/10 border-amber-400/25 text-amber-300"}`}>
                        {deck.stato === "congelato" ? "❄️ congelato" : "bozza"}
                    </span>
                    <span className="text-xs text-slate-500">dati del {new Date(deck.dataset.generato_il).toLocaleString("it-IT")}</span>
                    <div className="ml-auto flex items-center gap-2">
                        {gestisce && deck.stato === "bozza" && (
                            <button onClick={aggiornaDati} disabled={lavoro} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-sm disabled:opacity-50">
                                <RefreshCw size={14} /> Aggiorna dati
                            </button>
                        )}
                        {gestisce && (
                            <button onClick={commutaCongelato} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-sm">
                                {deck.stato === "congelato" ? <><LockOpen size={14} /> Scongela</> : <><Snowflake size={14} /> Congela</>}
                            </button>
                        )}
                        {puoPresentare && (
                            <button onClick={avviaPresenta} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white">
                                <Play size={14} /> Presenta
                            </button>
                        )}
                    </div>
                </div>
                {errore && <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/15 border border-red-400/30 text-red-300 text-sm">{errore}</div>}
                <div className="space-y-4">
                    {deck.blocchi.map((b, i) => (
                        <div key={i} style={{ background: BG }} className="rounded-xl">
                            <Slide b={b} />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // ─── ARCHIVIO ───
    return (
        <div className="p-4 md:p-6 text-white">
            <div className="flex flex-wrap items-center gap-3 mb-4">
                <h2 className="text-3xl font-bold">📽️ Riunioni</h2>
                {gestisce && (
                    <div className="ml-auto flex items-center gap-2">
                        <input type="month" value={nuovoMese} onChange={e => setNuovoMese(e.target.value)}
                            className="rounded bg-white/10 border border-white/15 px-2 py-1.5 text-sm text-white outline-none focus:border-indigo-400" />
                        <button onClick={creaBozza} disabled={lavoro || !nuovoMese} className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white disabled:opacity-50">
                            {lavoro ? "Genero…" : "＋ Nuova bozza"}
                        </button>
                    </div>
                )}
            </div>
            {errore && <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/15 border border-red-400/30 text-red-300 text-sm">{errore}</div>}
            {loading ? (
                <div className="flex items-center gap-2 text-slate-400 py-16 justify-center"><Loader2 className="animate-spin" size={18} /> Carico l&apos;archivio…</div>
            ) : lista.length === 0 ? (
                <div className="rounded-xl border border-white/10 p-8 text-center text-slate-400" style={{ background: BG }}>
                    Nessun deck ancora. {gestisce ? "Scegli il mese e crea la prima bozza: i numeri arrivano dal conto economico del CRM." : "La direzione non ha ancora creato deck."}
                </div>
            ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {lista.map(d => (
                        <div key={d.id} className="rounded-xl border border-white/10 p-4 hover:border-indigo-400/40 transition-colors cursor-pointer" style={{ background: BG }} onClick={() => apriDeck(d.id)}>
                            <div className="flex items-center gap-2">
                                <div className="font-bold">{d.titolo}</div>
                                <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full border ${d.stato === "congelato" ? "bg-sky-500/15 border-sky-400/30 text-sky-300" : "bg-amber-500/10 border-amber-400/25 text-amber-300"}`}>
                                    {d.stato === "congelato" ? "❄️ congelato" : "bozza"}
                                </span>
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                                {labelMese(d.mese)} · agg. {new Date(d.updated_at).toLocaleDateString("it-IT")}{d.created_by ? ` · ${d.created_by}` : ""}
                            </div>
                            {gestisce && (
                                <button onClick={e => { e.stopPropagation(); eliminaDeck(d); }} title="Elimina"
                                    className="mt-2 p-1 rounded hover:bg-white/10 text-red-400/70"><Trash2 size={13} /></button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
