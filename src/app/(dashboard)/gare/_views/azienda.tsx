"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/utils";
import { Loader2, Plus, Trash2, Copy, ChevronDown, ChevronRight, Store as StoreIcon, AlertTriangle } from "lucide-react";
import { notify, dbError } from "../../amministrazione/_views/toast";
import { addMonths, monthLabel } from "../../amministrazione/_views/months";
import {
    type Pista, type SogliaAz, type VoceAz, type RegolaAz, type NegozioAz,
    CLUSTER_SUGGERITI, UM_SOGLIA, REWARD_TIPI_AZ, VOCE_TIPI, REGOLA_TIPI, eur,
} from "./shared";

/* Tab AZIENDA: le condizioni che l'operatore dà a Telefutura (lettera di gara).
   Piste → soglie per tier/cluster/negozio, voci economiche, regole (malus/gate/storni). */

const REGOLA_STYLE: Record<string, string> = {
    malus: "bg-rose-500/15 text-rose-300 border-rose-500/25",
    gate: "bg-amber-500/15 text-amber-300 border-amber-500/25",
    storno: "bg-violet-500/15 text-violet-300 border-violet-500/25",
};

export function AziendaTab({ brand, month }: { brand: string; month: string }) {
    const [piste, setPiste] = useState<Pista[]>([]);
    const [soglie, setSoglie] = useState<SogliaAz[]>([]);
    const [voci, setVoci] = useState<VoceAz[]>([]);
    const [regole, setRegole] = useState<RegolaAz[]>([]);
    const [negozi, setNegozi] = useState<NegozioAz[]>([]);
    const [storeNames, setStoreNames] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [prevHas, setPrevHas] = useState(false);
    const [copying, setCopying] = useState(false);
    const [openPista, setOpenPista] = useState<string | null>(null);
    const [showNegozi, setShowNegozi] = useState(false);
    const [nPista, setNPista] = useState("");
    const prevMonth = addMonths(month, -1);

    const load = useCallback(async () => {
        setLoading(true);
        const [p, s, v, r, n, st, pp] = await Promise.all([
            supabase.from("gare_azienda_piste").select("id,codice,nome,descrizione,sort_order").eq("brand", brand).eq("month", month).order("sort_order").order("created_at"),
            supabase.from("gare_azienda_soglie").select("id,pista,scope,cluster,store_name,tier,soglia_valore,soglia_um,reward_tipo,reward_valore,reward_um,reward_descr,girata_ai_ragazzi,note").eq("brand", brand).eq("month", month).order("cluster").order("tier"),
            supabase.from("gare_azienda_voci").select("id,pista,nome,tipo,valore,um,condizione,scope,girata_ai_ragazzi,note").eq("brand", brand).eq("month", month).order("sort_order").order("created_at"),
            supabase.from("gare_azienda_regole").select("id,pista,tipo,condizione,effetto,valore,um,bersaglio,scope,girata_ai_ragazzi,note").eq("brand", brand).eq("month", month).order("sort_order").order("created_at"),
            supabase.from("gare_azienda_negozi").select("id,store_name,cluster,note").eq("brand", brand).eq("month", month),
            supabase.from("stores").select("name").eq("active", true).order("name"),
            supabase.from("gare_azienda_piste").select("id").eq("brand", brand).eq("month", prevMonth).limit(1),
        ]);
        if (!dbError("Caricamento gara azienda", p.error)) setPiste((p.data as Pista[]) || []);
        setSoglie((s.data as SogliaAz[]) || []);
        setVoci((v.data as VoceAz[]) || []);
        setRegole((r.data as RegolaAz[]) || []);
        setNegozi((n.data as NegozioAz[]) || []);
        setStoreNames(((st.data as { name: string }[]) || []).map((x) => x.name));
        setPrevHas(((pp.data as { id: string }[]) || []).length > 0);
        setLoading(false);
    }, [brand, month, prevMonth]);
    useEffect(() => {
        load();
    }, [load]);

    const copyPrev = async () => {
        if (copying) return;
        setCopying(true);
        const { error } = await supabase.rpc("gare_copy_month", { p_brand: brand, p_from: prevMonth, p_to: month, p_livello: "azienda" });
        if (!dbError("Copia mese precedente", error)) {
            notify(`Lato azienda copiato da ${monthLabel(prevMonth)} ✓`, "ok");
            load();
        }
        setCopying(false);
    };

    /* ---- piste ---- */
    const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const addPista = async () => {
        const nome = nPista.trim();
        if (!nome) return;
        const { error } = await supabase.from("gare_azienda_piste").insert({ brand, month, codice: slug(nome), nome, sort_order: piste.length });
        if (!dbError("Creazione pista", error)) {
            setNPista("");
            setOpenPista(slug(nome));
            load();
        }
    };
    const delPista = async (p: Pista) => {
        const { error } = await supabase.from("gare_azienda_piste").delete().eq("id", p.id);
        if (!dbError("Eliminazione pista", error)) {
            notify(`Pista «${p.nome}» eliminata (con soglie, voci e regole collegate)`, "ok");
            load();
        }
    };

    /* ---- negozi/cluster ---- */
    const negozioOf = (store: string) => negozi.find((n) => n.store_name === store);
    const saveNegozio = async (store: string, patch: { cluster?: string | null; note?: string | null }) => {
        const cur = negozioOf(store);
        const row = { brand, month, store_name: store, cluster: cur?.cluster ?? null, note: cur?.note ?? null, ...patch };
        const { error } = await supabase.from("gare_azienda_negozi").upsert(row, { onConflict: "brand,month,store_name" });
        if (!dbError("Salvataggio negozio", error)) {
            setNegozi((p) => {
                const i = p.findIndex((n) => n.store_name === store);
                if (i >= 0) return p.map((n, j) => (j === i ? { ...n, ...patch } : n));
                return [...p, { id: `tmp-${store}`, store_name: store, cluster: row.cluster, note: row.note }];
            });
        }
    };

    /* ---- soglie ---- */
    const updS = (id: string, patch: Partial<SogliaAz>) => setSoglie((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const saveS = async (r: SogliaAz) => {
        const { error } = await supabase.from("gare_azienda_soglie").update({
            scope: r.scope, cluster: r.cluster, store_name: r.store_name, tier: r.tier,
            soglia_valore: r.soglia_valore, soglia_um: r.soglia_um, reward_tipo: r.reward_tipo,
            reward_valore: r.reward_valore, reward_um: r.reward_um, reward_descr: r.reward_descr,
            girata_ai_ragazzi: r.girata_ai_ragazzi, note: r.note,
        }).eq("id", r.id);
        dbError("Salvataggio soglia", error);
    };
    const addSoglia = async (pista: string) => {
        const inPista = soglie.filter((s) => s.pista === pista);
        const tier = (inPista[inPista.length - 1]?.tier || 0) + 1;
        const { error } = await supabase.from("gare_azienda_soglie").insert({ brand, month, pista, tier, soglia_valore: 0, soglia_um: "punti" });
        if (!dbError("Creazione soglia", error)) load();
    };
    const delRow = async (table: string, id: string) => {
        const { error } = await supabase.from(table).delete().eq("id", id);
        if (!dbError("Eliminazione", error)) load();
    };

    /* ---- voci ---- */
    const updV = (id: string, patch: Partial<VoceAz>) => setVoci((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const saveV = async (r: VoceAz) => {
        const { error } = await supabase.from("gare_azienda_voci").update({
            nome: r.nome, tipo: r.tipo, valore: r.valore, um: r.um, condizione: r.condizione,
            scope: r.scope, girata_ai_ragazzi: r.girata_ai_ragazzi, note: r.note,
        }).eq("id", r.id);
        dbError("Salvataggio voce", error);
    };
    const addVoce = async (pista: string) => {
        const { error } = await supabase.from("gare_azienda_voci").insert({ brand, month, pista, nome: "Nuova voce", tipo: "gettone", sort_order: voci.filter((v) => v.pista === pista).length });
        if (!dbError("Creazione voce", error)) load();
    };

    /* ---- regole ---- */
    const updR = (id: string, patch: Partial<RegolaAz>) => setRegole((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const saveR = async (r: RegolaAz) => {
        const { error } = await supabase.from("gare_azienda_regole").update({
            tipo: r.tipo, condizione: r.condizione, effetto: r.effetto, valore: r.valore, um: r.um,
            bersaglio: r.bersaglio, scope: r.scope, girata_ai_ragazzi: r.girata_ai_ragazzi, note: r.note,
        }).eq("id", r.id);
        dbError("Salvataggio regola", error);
    };
    const addRegola = async (pista: string) => {
        const { error } = await supabase.from("gare_azienda_regole").insert({ brand, month, pista, tipo: "malus", condizione: "…", effetto: "…", sort_order: regole.length });
        if (!dbError("Creazione regola", error)) load();
    };

    const reteBersagli = useMemo(() => {
        const m: Record<string, RegolaAz[]> = {};
        for (const r of regole) (m[r.bersaglio || "(senza bersaglio)"] = m[r.bersaglio || "(senza bersaglio)"] || []).push(r);
        return Object.entries(m).sort((a, b) => b[1].length - a[1].length);
    }, [regole]);

    if (loading)
        return (
            <div className="flex justify-center py-16 text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin" />
            </div>
        );

    const vuoto = !piste.length && !negozi.length;

    return (
        <div className="space-y-4">
            {vuoto && prevHas && (
                <div className="glass-panel p-5 text-center space-y-3">
                    <p className="text-sm text-slate-400">Lato azienda non ancora impostato per {monthLabel(month)}.</p>
                    <button onClick={copyPrev} disabled={copying} className={cn("primary-btn flex items-center gap-2 mx-auto", copying && "opacity-40")}>
                        {copying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                        Copia da {monthLabel(prevMonth)}
                    </button>
                </div>
            )}

            {/* Negozi & cluster */}
            <div className="glass-panel p-4 space-y-2">
                <button onClick={() => setShowNegozi((v) => !v)} className="w-full flex items-center gap-2 text-left">
                    <StoreIcon className="w-4 h-4 text-indigo-400" />
                    <span className="text-sm font-semibold text-white">Negozi & cluster</span>
                    <span className="text-[11px] text-slate-500">{negozi.filter((n) => n.cluster).length} classificati</span>
                    {showNegozi ? <ChevronDown className="w-4 h-4 text-slate-500 ml-auto" /> : <ChevronRight className="w-4 h-4 text-slate-500 ml-auto" />}
                </button>
                {showNegozi && (
                    <div className="grid gap-1.5 sm:grid-cols-2 pt-1">
                        <datalist id="cluster-suggeriti">
                            {CLUSTER_SUGGERITI.map((c) => <option key={c} value={c} />)}
                        </datalist>
                        {storeNames.map((s) => {
                            const n = negozioOf(s);
                            return (
                                <div key={s} className="glass-card p-2 rounded-lg flex items-center gap-2">
                                    <span className="flex-1 text-sm text-slate-200 truncate">{s}</span>
                                    <input list="cluster-suggeriti" defaultValue={n?.cluster ?? ""} onBlur={(e) => (e.target.value || null) !== (n?.cluster ?? null) && saveNegozio(s, { cluster: e.target.value || null })} placeholder="cluster…" className="glass-input w-28 py-1 text-xs" />
                                    <input defaultValue={n?.note ?? ""} onBlur={(e) => (e.target.value || null) !== (n?.note ?? null) && saveNegozio(s, { note: e.target.value || null })} placeholder="nota…" className="glass-input w-28 py-1 text-xs text-slate-400" />
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Piste */}
            {piste.map((p) => {
                const sP = soglie.filter((s) => s.pista === p.codice);
                const vP = voci.filter((v) => v.pista === p.codice);
                const rP = regole.filter((r) => r.pista === p.codice);
                const open = openPista === p.codice;
                return (
                    <div key={p.id} className="glass-panel p-4 space-y-3">
                        <div className="flex items-center gap-2">
                            <button onClick={() => setOpenPista(open ? null : p.codice)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                                {open ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                                <span className="text-sm font-semibold text-white">{p.nome}</span>
                                <span className="text-[11px] text-slate-500">{sP.length} soglie · {vP.length} voci</span>
                                {rP.length > 0 && <span className="text-[11px] text-rose-400">{rP.length} regole</span>}
                            </button>
                            <button onClick={() => delPista(p)} className="text-slate-600 hover:text-rose-400 p-1" title="Elimina pista (con tutto il contenuto)"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                        {open && (
                            <div className="space-y-4 pl-1">
                                <input defaultValue={p.descrizione ?? ""} onBlur={async (e) => { const v = e.target.value || null; if (v !== p.descrizione) { const { error } = await supabase.from("gare_azienda_piste").update({ descrizione: v }).eq("id", p.id); dbError("Salvataggio descrizione", error); } }} placeholder="note generali della pista…" className="glass-input w-full py-1 text-xs text-slate-400" />

                                {/* SOGLIE */}
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <h5 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Soglie / tier</h5>
                                        <button onClick={() => addSoglia(p.codice)} className="text-xs text-indigo-300 hover:text-indigo-200 flex items-center gap-1"><Plus className="w-3 h-3" /> soglia</button>
                                    </div>
                                    {sP.map((r) => (
                                        <div key={r.id} className="glass-card p-2 rounded-lg flex flex-wrap items-center gap-1.5 text-sm">
                                            <select value={r.scope} onChange={(e) => { updS(r.id, { scope: e.target.value }); saveS({ ...r, scope: e.target.value }); }} className="glass-input w-auto py-1 text-[11px]"><option value="pdv">PDV</option><option value="ragione_sociale">RS</option></select>
                                            <input list="cluster-suggeriti" value={r.cluster ?? ""} onChange={(e) => updS(r.id, { cluster: e.target.value || null })} onBlur={() => saveS(r)} placeholder="cluster" className="glass-input w-24 py-1 text-xs" />
                                            <select value={r.store_name ?? ""} onChange={(e) => { const v = e.target.value || null; updS(r.id, { store_name: v }); saveS({ ...r, store_name: v }); }} className="glass-input w-auto py-1 text-[11px]" title="Negozio specifico (opzionale)">
                                                <option value="">tutti i pdv</option>
                                                {storeNames.map((s) => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                            <span className="text-[10px] text-slate-600">tier</span>
                                            <input type="number" step="1" min="1" value={r.tier} onChange={(e) => updS(r.id, { tier: Number(e.target.value) || 1 })} onBlur={() => saveS(r)} className="glass-input w-14 py-1 text-sm text-center" />
                                            <input type="number" step="0.01" value={r.soglia_valore ?? ""} onChange={(e) => updS(r.id, { soglia_valore: e.target.value ? Number(e.target.value) : 0 })} onBlur={() => saveS(r)} className="glass-input w-20 py-1 text-sm text-center" title="Valore soglia" />
                                            <select value={r.soglia_um} onChange={(e) => { updS(r.id, { soglia_um: e.target.value }); saveS({ ...r, soglia_um: e.target.value }); }} className="glass-input w-auto py-1 text-[11px]">{UM_SOGLIA.map((u) => <option key={u} value={u}>{u}</option>)}</select>
                                            <span className="text-[10px] text-slate-600">→</span>
                                            <select value={r.reward_tipo ?? ""} onChange={(e) => { const v = e.target.value || null; updS(r.id, { reward_tipo: v }); saveS({ ...r, reward_tipo: v }); }} className="glass-input w-auto py-1 text-[11px]"><option value="">— reward —</option>{REWARD_TIPI_AZ.map((t) => <option key={t} value={t}>{t}</option>)}</select>
                                            {r.reward_tipo && r.reward_tipo !== "sblocco" && (
                                                <input type="number" step="0.01" value={r.reward_valore ?? ""} onChange={(e) => updS(r.id, { reward_valore: e.target.value ? Number(e.target.value) : null })} onBlur={() => saveS(r)} placeholder={r.reward_tipo === "moltiplicatore" ? "x" : "€"} className="glass-input w-16 py-1 text-sm text-center" />
                                            )}
                                            <input value={r.reward_descr ?? ""} onChange={(e) => updS(r.id, { reward_descr: e.target.value || null })} onBlur={() => saveS(r)} placeholder="descrizione reward…" className="glass-input flex-1 min-w-[100px] py-1 text-xs text-slate-400" />
                                            <button onClick={() => { updS(r.id, { girata_ai_ragazzi: !r.girata_ai_ragazzi }); saveS({ ...r, girata_ai_ragazzi: !r.girata_ai_ragazzi }); }} className={cn("text-[10px] px-1.5 py-0.5 rounded-full border", r.girata_ai_ragazzi ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/20" : "text-slate-600 border-white/10")} title="Il reward viene girato alla squadra?">girata</button>
                                            <button onClick={() => delRow("gare_azienda_soglie", r.id)} className="text-slate-600 hover:text-rose-400 p-0.5"><Trash2 className="w-3.5 h-3.5" /></button>
                                        </div>
                                    ))}
                                    {!sP.length && <p className="text-[11px] text-slate-600 px-1">Nessuna soglia.</p>}
                                </div>

                                {/* VOCI */}
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <h5 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Voci economiche / punteggi</h5>
                                        <button onClick={() => addVoce(p.codice)} className="text-xs text-indigo-300 hover:text-indigo-200 flex items-center gap-1"><Plus className="w-3 h-3" /> voce</button>
                                    </div>
                                    {vP.map((r) => (
                                        <div key={r.id} className="glass-card p-2 rounded-lg flex flex-wrap items-center gap-1.5 text-sm">
                                            <input value={r.nome} onChange={(e) => updV(r.id, { nome: e.target.value })} onBlur={() => saveV(r)} className="glass-input flex-1 min-w-[140px] py-1 text-sm" />
                                            <select value={r.tipo} onChange={(e) => { updV(r.id, { tipo: e.target.value }); saveV({ ...r, tipo: e.target.value }); }} className="glass-input w-auto py-1 text-[11px]">{VOCE_TIPI.map((t) => <option key={t} value={t}>{t}</option>)}</select>
                                            <input type="number" step="0.01" value={r.valore ?? ""} onChange={(e) => updV(r.id, { valore: e.target.value ? Number(e.target.value) : null })} onBlur={() => saveV(r)} placeholder="val." className="glass-input w-18 py-1 text-sm text-center" style={{ width: 72 }} />
                                            <input value={r.um ?? ""} onChange={(e) => updV(r.id, { um: e.target.value || null })} onBlur={() => saveV(r)} placeholder="um" className="glass-input w-16 py-1 text-xs" />
                                            <input value={r.condizione ?? ""} onChange={(e) => updV(r.id, { condizione: e.target.value || null })} onBlur={() => saveV(r)} placeholder="condizione (quando si applica)…" className="glass-input flex-1 min-w-[160px] py-1 text-xs text-slate-400" />
                                            <button onClick={() => { updV(r.id, { girata_ai_ragazzi: !r.girata_ai_ragazzi }); saveV({ ...r, girata_ai_ragazzi: !r.girata_ai_ragazzi }); }} className={cn("text-[10px] px-1.5 py-0.5 rounded-full border", r.girata_ai_ragazzi ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/20" : "text-slate-600 border-white/10")}>girata</button>
                                            <button onClick={() => delRow("gare_azienda_voci", r.id)} className="text-slate-600 hover:text-rose-400 p-0.5"><Trash2 className="w-3.5 h-3.5" /></button>
                                        </div>
                                    ))}
                                    {!vP.length && <p className="text-[11px] text-slate-600 px-1">Nessuna voce.</p>}
                                </div>

                                {/* REGOLE */}
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <h5 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Regole (malus · gate · storni)</h5>
                                        <button onClick={() => addRegola(p.codice)} className="text-xs text-indigo-300 hover:text-indigo-200 flex items-center gap-1"><Plus className="w-3 h-3" /> regola</button>
                                    </div>
                                    {rP.map((r) => (
                                        <div key={r.id} className="glass-card p-2 rounded-lg space-y-1.5">
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <select value={r.tipo} onChange={(e) => { updR(r.id, { tipo: e.target.value }); saveR({ ...r, tipo: e.target.value }); }} className={cn("py-0.5 px-1.5 rounded-full text-[10px] border bg-transparent", REGOLA_STYLE[r.tipo])}>{REGOLA_TIPI.map((t) => <option key={t} value={t}>{t}</option>)}</select>
                                                <input value={r.condizione} onChange={(e) => updR(r.id, { condizione: e.target.value })} onBlur={() => saveR(r)} placeholder="condizione (quando scatta)…" className="glass-input flex-1 min-w-[180px] py-1 text-xs" />
                                                <input type="number" step="0.01" value={r.valore ?? ""} onChange={(e) => updR(r.id, { valore: e.target.value ? Number(e.target.value) : null })} onBlur={() => saveR(r)} placeholder="val." className="glass-input py-1 text-sm text-center" style={{ width: 72 }} />
                                                <input value={r.um ?? ""} onChange={(e) => updR(r.id, { um: e.target.value || null })} onBlur={() => saveR(r)} placeholder="um" className="glass-input w-16 py-1 text-xs" />
                                                <button onClick={() => delRow("gare_azienda_regole", r.id)} className="text-slate-600 hover:text-rose-400 p-0.5"><Trash2 className="w-3.5 h-3.5" /></button>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <input value={r.effetto} onChange={(e) => updR(r.id, { effetto: e.target.value })} onBlur={() => saveR(r)} placeholder="effetto (cosa succede)…" className="glass-input flex-1 min-w-[180px] py-1 text-xs" />
                                                <input value={r.bersaglio ?? ""} onChange={(e) => updR(r.id, { bersaglio: e.target.value || null })} onBlur={() => saveR(r)} placeholder="bersaglio (es. premio_partnership)" className="glass-input w-48 py-1 text-xs text-slate-400" />
                                                <button onClick={() => { updR(r.id, { girata_ai_ragazzi: !r.girata_ai_ragazzi }); saveR({ ...r, girata_ai_ragazzi: !r.girata_ai_ragazzi }); }} className={cn("text-[10px] px-1.5 py-0.5 rounded-full border", r.girata_ai_ragazzi ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/20" : "text-slate-600 border-white/10")} title="Ribaltata sulla squadra?">girata</button>
                                            </div>
                                        </div>
                                    ))}
                                    {!rP.length && <p className="text-[11px] text-slate-600 px-1">Nessuna regola.</p>}
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}

            {/* nuova pista */}
            <div className="flex gap-2">
                <input value={nPista} onChange={(e) => setNPista(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addPista()} placeholder="Nuova pista (es. Mobile, Fisso, Luce & Gas, Assicurazioni…)" className="glass-input flex-1 text-sm" />
                <button onClick={addPista} className="px-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 text-sm border border-white/10 whitespace-nowrap flex items-center gap-1.5"><Plus className="w-4 h-4" /> Pista</button>
            </div>

            {/* Rete malus & gate */}
            {regole.length > 0 && (
                <div className="glass-panel p-4 space-y-3">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-400" />
                        <h4 className="text-sm font-semibold text-white">Rete malus & gate</h4>
                        <span className="text-[11px] text-slate-500">{regole.length} regole del mese, raggruppate per bersaglio</span>
                    </div>
                    {reteBersagli.map(([bersaglio, rs]) => {
                        const totEur = rs.filter((r) => r.um === "eur" && r.valore != null).reduce((a, r) => a + Number(r.valore), 0);
                        return (
                            <div key={bersaglio} className="glass-card p-2.5 rounded-lg">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-semibold text-slate-200">{bersaglio}</span>
                                    <span className="text-[10px] text-slate-500">{rs.length} regole</span>
                                    {totEur !== 0 && <span className="text-[11px] text-rose-400 ml-auto">potenziale {eur(totEur)}</span>}
                                </div>
                                {rs.map((r) => (
                                    <p key={r.id} className="text-[11px] text-slate-500 leading-relaxed">
                                        <span className={cn("px-1 py-0.5 rounded text-[9px] border mr-1", REGOLA_STYLE[r.tipo])}>{r.tipo}</span>
                                        {r.condizione} → {r.effetto}
                                        {r.valore != null && <span className="text-slate-400"> ({r.valore}{r.um === "percent" ? "%" : r.um === "eur" ? "€" : ` ${r.um || ""}`})</span>}
                                    </p>
                                ))}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
