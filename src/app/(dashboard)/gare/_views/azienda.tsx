"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/utils";
import {
    Loader2, Plus, Trash2, Copy, ChevronDown, ChevronRight, Store as StoreIcon,
    AlertTriangle, Pencil, Building2, Check,
} from "lucide-react";
import { notify, dbError } from "../../amministrazione/_views/toast";
import { addMonths, monthLabel } from "../../amministrazione/_views/months";
import {
    type Pista, type SogliaAz, type VoceAz, type RegolaAz, type NegozioAz,
    BRAND_DIVISIONI, CLUSTER_SUGGERITI, UM_SOGLIA, REWARD_TIPI_AZ, VOCE_TIPI, REGOLA_TIPI, eur,
} from "./shared";

/* Tab AZIENDA — redesign "read-first": si legge come una lettera di gara pulita,
   si modifica al click sulla matita. Un brand può avere più DIVISIONI di gara
   (es. Wind3: Franchising e Multibrand), ognuna coi suoi negozi e le sue piste. */

const REGOLA_STYLE: Record<string, { border: string; badge: string; label: string }> = {
    malus: { border: "border-l-rose-500/70", badge: "bg-rose-500/15 text-rose-300 border-rose-500/25", label: "MALUS" },
    gate: { border: "border-l-amber-500/70", badge: "bg-amber-500/15 text-amber-300 border-amber-500/25", label: "GATE" },
    storno: { border: "border-l-violet-500/70", badge: "bg-violet-500/15 text-violet-300 border-violet-500/25", label: "STORNO" },
};
const TIPO_VAL_COLOR: Record<string, string> = {
    punti: "text-indigo-300",
    gettone: "text-emerald-300",
    bonus: "text-amber-300",
    moltiplicatore: "text-violet-300",
    pay_ricorrente: "text-sky-300",
};

const clusterLabel = (c: string) => c.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

function fmtVal(valore: number | null, um: string | null): string {
    if (valore == null) return "";
    const v = valore.toLocaleString("it-IT", { maximumFractionDigits: 2 });
    if (um === "eur") return `${v} €`;
    if (um === "punti") return `${v} pt`;
    if (um === "x") return `x${v}`;
    if (um === "percent") return `${v}%`;
    return `${v}${um ? ` ${um}` : ""}`;
}

export function AziendaTab({ brand, month }: { brand: string; month: string }) {
    const divisioni = BRAND_DIVISIONI[brand] || [{ id: "principale", label: "Gara", sub: "" }];
    const [div, setDiv] = useState(divisioni[0].id);
    const [piste, setPiste] = useState<Pista[]>([]);
    const [soglie, setSoglie] = useState<SogliaAz[]>([]);
    const [voci, setVoci] = useState<VoceAz[]>([]);
    const [regole, setRegole] = useState<RegolaAz[]>([]);
    const [negozi, setNegozi] = useState<NegozioAz[]>([]);
    const [stores, setStores] = useState<{ name: string; company: string | null }[]>([]);
    const [loading, setLoading] = useState(true);
    const [prevHas, setPrevHas] = useState(false);
    const [copying, setCopying] = useState(false);
    const [openPista, setOpenPista] = useState<string | null>(null);
    const [nPista, setNPista] = useState("");
    const prevMonth = addMonths(month, -1);

    const load = useCallback(async () => {
        setLoading(true);
        const [p, s, v, r, n, st, pp] = await Promise.all([
            supabase.from("gare_azienda_piste").select("id,gara,codice,nome,descrizione,sort_order").eq("brand", brand).eq("month", month).order("sort_order").order("created_at"),
            supabase.from("gare_azienda_soglie").select("id,pista,scope,cluster,store_name,tier,soglia_valore,soglia_um,reward_tipo,reward_valore,reward_um,reward_descr,girata_ai_ragazzi,note").eq("brand", brand).eq("month", month).order("cluster").order("tier"),
            supabase.from("gare_azienda_voci").select("id,pista,nome,tipo,valore,um,condizione,scope,girata_ai_ragazzi,note").eq("brand", brand).eq("month", month).order("sort_order").order("created_at"),
            supabase.from("gare_azienda_regole").select("id,pista,tipo,condizione,effetto,valore,um,bersaglio,scope,girata_ai_ragazzi,note").eq("brand", brand).eq("month", month).order("sort_order").order("created_at"),
            supabase.from("gare_azienda_negozi").select("id,gara,store_name,cluster,note").eq("brand", brand).eq("month", month).order("store_name"),
            supabase.from("stores").select("name,company").eq("active", true).order("name"),
            supabase.from("gare_azienda_piste").select("id").eq("brand", brand).eq("month", prevMonth).limit(1),
        ]);
        if (!dbError("Caricamento gara azienda", p.error)) setPiste((p.data as Pista[]) || []);
        setSoglie((s.data as SogliaAz[]) || []);
        setVoci((v.data as VoceAz[]) || []);
        setRegole((r.data as RegolaAz[]) || []);
        setNegozi((n.data as NegozioAz[]) || []);
        setStores((st.data as { name: string; company: string | null }[]) || []);
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

    const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const addPista = async () => {
        const nome = nPista.trim();
        if (!nome) return;
        const codice = (div === "principale" || div === "franchising" ? "" : "mb_") + slug(nome);
        const { error } = await supabase.from("gare_azienda_piste").insert({ brand, month, gara: div, codice, nome, sort_order: piste.length });
        if (!dbError("Creazione pista", error)) {
            setNPista("");
            setOpenPista(codice);
            load();
        }
    };

    const negoziDiv = negozi.filter((n) => n.gara === div);
    const pisteDiv = piste.filter((p) => p.gara === div);
    const pisteCodici = new Set(pisteDiv.map((p) => p.codice));
    const regoleDiv = regole.filter((r) => r.pista && pisteCodici.has(r.pista));
    const companyOf = (name: string) => stores.find((s) => s.name === name)?.company || null;
    const storeOptions = negoziDiv.map((n) => n.store_name);

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

            {/* Selettore divisione */}
            {divisioni.length > 1 && (
                <div className="grid gap-2 sm:grid-cols-2">
                    {divisioni.map((d) => {
                        const on = div === d.id;
                        const nP = piste.filter((p) => p.gara === d.id).length;
                        const nN = negozi.filter((n) => n.gara === d.id).length;
                        return (
                            <button
                                key={d.id}
                                onClick={() => { setDiv(d.id); setOpenPista(null); }}
                                className={cn(
                                    "glass-panel p-4 rounded-2xl text-left border transition-colors",
                                    on ? "border-amber-500/50 bg-amber-500/5" : "border-transparent hover:bg-white/5",
                                )}
                            >
                                <p className={cn("font-bold", on ? "text-amber-300" : "text-white")}>{d.label}</p>
                                <p className="text-xs text-slate-500 mt-0.5">{d.sub || `${nN} pdv`} · {nP} piste</p>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Negozi della divisione */}
            <NegoziCard
                brand={brand} month={month} div={div} negozi={negoziDiv}
                allStores={stores} companyOf={companyOf} onChange={load}
            />

            {/* Piste */}
            {pisteDiv.map((p) => (
                <PistaCard
                    key={p.id}
                    pista={p}
                    soglie={soglie.filter((s) => s.pista === p.codice)}
                    voci={voci.filter((v) => v.pista === p.codice)}
                    regole={regole.filter((r) => r.pista === p.codice)}
                    open={openPista === p.codice}
                    onToggle={() => setOpenPista(openPista === p.codice ? null : p.codice)}
                    storeOptions={storeOptions}
                    brand={brand} month={month}
                    onChange={load}
                />
            ))}

            {/* nuova pista */}
            <div className="flex gap-2">
                <input value={nPista} onChange={(e) => setNPista(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addPista()} placeholder="Nuova pista (es. Mobile, Fisso, Luce & Gas…)" className="glass-input flex-1 text-sm" />
                <button onClick={addPista} className="px-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 text-sm border border-white/10 whitespace-nowrap flex items-center gap-1.5">
                    <Plus className="w-4 h-4" /> Pista
                </button>
            </div>

            {/* Rete malus & gate della divisione */}
            {regoleDiv.length > 0 && <ReteRegole regole={regoleDiv} />}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Negozi & cluster della divisione                                    */
/* ------------------------------------------------------------------ */
function NegoziCard({ brand, month, div, negozi, allStores, companyOf, onChange }: {
    brand: string; month: string; div: string; negozi: NegozioAz[];
    allStores: { name: string; company: string | null }[];
    companyOf: (n: string) => string | null;
    onChange: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [adding, setAdding] = useState("");
    const free = allStores.filter((s) => !negozi.some((n) => n.store_name === s.name));

    const add = async () => {
        if (!adding) return;
        const { error } = await supabase.from("gare_azienda_negozi").insert({ brand, month, gara: div, store_name: adding });
        if (!dbError("Aggiunta negozio", error)) { setAdding(""); onChange(); }
    };
    const save = async (n: NegozioAz, patch: Partial<NegozioAz>) => {
        const { error } = await supabase.from("gare_azienda_negozi").update(patch).eq("id", n.id);
        dbError("Salvataggio negozio", error);
    };
    const del = async (n: NegozioAz) => {
        const { error } = await supabase.from("gare_azienda_negozi").delete().eq("id", n.id);
        if (!dbError("Rimozione negozio", error)) onChange();
    };

    return (
        <div className="glass-panel p-4 space-y-2">
            <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-2 text-left">
                <StoreIcon className="w-4 h-4 text-indigo-400" />
                <span className="text-sm font-semibold text-white">Punti vendita in gara</span>
                <span className="flex flex-wrap gap-1 ml-1">
                    {negozi.map((n) => (
                        <span key={n.id} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-slate-300">{n.store_name}</span>
                    ))}
                </span>
                {open ? <ChevronDown className="w-4 h-4 text-slate-500 ml-auto shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-500 ml-auto shrink-0" />}
            </button>
            {open && (
                <div className="space-y-1.5 pt-1">
                    <datalist id="cluster-suggeriti">
                        {CLUSTER_SUGGERITI.map((c) => <option key={c} value={c} />)}
                    </datalist>
                    {negozi.map((n) => (
                        <div key={n.id} className="glass-card p-2.5 rounded-lg flex flex-wrap items-center gap-2">
                            <span className="text-sm text-white font-medium">{n.store_name}</span>
                            {companyOf(n.store_name) && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 flex items-center gap-1">
                                    <Building2 className="w-2.5 h-2.5" /> {companyOf(n.store_name)}
                                </span>
                            )}
                            <input list="cluster-suggeriti" defaultValue={n.cluster ?? ""} onBlur={(e) => (e.target.value || null) !== (n.cluster ?? null) && save(n, { cluster: e.target.value || null })} placeholder="cluster…" className="glass-input w-28 py-1 text-xs" />
                            <input defaultValue={n.note ?? ""} onBlur={(e) => (e.target.value || null) !== (n.note ?? null) && save(n, { note: e.target.value || null })} placeholder="nota…" className="glass-input flex-1 min-w-[140px] py-1 text-xs text-slate-400" />
                            <button onClick={() => del(n)} className="text-slate-600 hover:text-rose-400 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                    ))}
                    <div className="flex gap-2">
                        <select value={adding} onChange={(e) => setAdding(e.target.value)} className="glass-input flex-1 text-sm">
                            <option value="">— aggiungi punto vendita —</option>
                            {free.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
                        </select>
                        <button onClick={add} className="primary-btn text-sm px-3">Aggiungi</button>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Card pista: soglie a matrice + voci e regole "read-first"           */
/* ------------------------------------------------------------------ */
function PistaCard({ pista, soglie, voci, regole, open, onToggle, storeOptions, brand, month, onChange }: {
    pista: Pista; soglie: SogliaAz[]; voci: VoceAz[]; regole: RegolaAz[];
    open: boolean; onToggle: () => void; storeOptions: string[];
    brand: string; month: string; onChange: () => void;
}) {
    const nMalus = regole.filter((r) => r.tipo === "malus").length;
    const [confirmDel, setConfirmDel] = useState(false);

    const delPista = async () => {
        const { error } = await supabase.from("gare_azienda_piste").delete().eq("id", pista.id);
        if (!dbError("Eliminazione pista", error)) {
            notify(`Pista «${pista.nome}» eliminata`, "ok");
            onChange();
        }
    };

    return (
        <div className="glass-panel overflow-hidden">
            <div className={cn("flex items-center gap-2 p-4", open && "border-b border-white/5")}>
                <button onClick={onToggle} className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
                    {open ? <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />}
                    <span className="text-[15px] font-bold text-white truncate">{pista.nome}</span>
                    <span className="flex gap-1.5 shrink-0">
                        {soglie.length > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">{soglie.length} soglie</span>}
                        {voci.length > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">{voci.length} voci</span>}
                        {nMalus > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/20">{nMalus} malus</span>}
                    </span>
                </button>
                {open && (confirmDel ? (
                    <span className="flex items-center gap-1 shrink-0">
                        <button onClick={delPista} className="text-[10px] px-2 py-1 rounded bg-rose-500/20 text-rose-300">Elimina pista</button>
                        <button onClick={() => setConfirmDel(false)} className="text-[10px] text-slate-500 px-1">Annulla</button>
                    </span>
                ) : (
                    <button onClick={() => setConfirmDel(true)} className="text-slate-600 hover:text-rose-400 p-1 shrink-0" title="Elimina pista"><Trash2 className="w-3.5 h-3.5" /></button>
                ))}
            </div>
            {!open && pista.descrizione && (
                <p className="px-4 pb-3 -mt-1 text-[11px] text-slate-500 truncate">{pista.descrizione}</p>
            )}
            {open && (
                <div className="p-4 space-y-5">
                    <input
                        defaultValue={pista.descrizione ?? ""}
                        onBlur={async (e) => {
                            const v = e.target.value || null;
                            if (v !== pista.descrizione) {
                                const { error } = await supabase.from("gare_azienda_piste").update({ descrizione: v }).eq("id", pista.id);
                                dbError("Salvataggio descrizione", error);
                            }
                        }}
                        placeholder="descrizione della pista…"
                        className="glass-input w-full py-1.5 text-xs text-slate-400"
                    />
                    <SoglieBlock pista={pista} soglie={soglie} storeOptions={storeOptions} brand={brand} month={month} onChange={onChange} />
                    <VociBlock pista={pista} voci={voci} brand={brand} month={month} onChange={onChange} />
                    <RegoleBlock pista={pista} regole={regole} brand={brand} month={month} onChange={onChange} />
                </div>
            )}
        </div>
    );
}

/* ---------------- Soglie: matrice leggibile ---------------- */
function SoglieBlock({ pista, soglie, storeOptions, brand, month, onChange }: {
    pista: Pista; soglie: SogliaAz[]; storeOptions: string[]; brand: string; month: string; onChange: () => void;
}) {
    const [adv, setAdv] = useState(false);

    // righe = ambito (scope|cluster|store); colonne = tier
    const groups = useMemo(() => {
        const m = new Map<string, { label: string; sub: string; um: string; rows: SogliaAz[] }>();
        for (const s of soglie) {
            const key = `${s.scope}|${s.cluster || ""}|${s.store_name || ""}`;
            if (!m.has(key)) {
                const label = s.store_name || (s.cluster ? clusterLabel(s.cluster) : "Tutti i PDV");
                const sub = [s.scope === "ragione_sociale" ? "Ragione Sociale" : null, s.store_name && s.cluster ? clusterLabel(s.cluster) : null]
                    .filter(Boolean).join(" · ");
                m.set(key, { label, sub, um: s.soglia_um, rows: [] });
            }
            m.get(key)!.rows.push(s);
        }
        return Array.from(m.values());
    }, [soglie]);
    const maxTier = Math.max(0, ...soglie.map((s) => s.tier));

    const saveVal = async (r: SogliaAz, v: number) => {
        const { error } = await supabase.from("gare_azienda_soglie").update({ soglia_valore: v }).eq("id", r.id);
        dbError("Salvataggio soglia", error);
    };
    const addSoglia = async () => {
        const tier = maxTier + 1 || 1;
        const { error } = await supabase.from("gare_azienda_soglie").insert({ brand, month, pista: pista.codice, tier, soglia_valore: 0, soglia_um: groups[0]?.um || "punti" });
        if (!dbError("Creazione soglia", error)) onChange();
    };

    if (!soglie.length)
        return (
            <div className="flex items-center justify-between">
                <p className="text-[11px] text-slate-600">Nessuna soglia.</p>
                <button onClick={addSoglia} className="text-xs text-indigo-300 hover:text-indigo-200 flex items-center gap-1"><Plus className="w-3 h-3" /> soglia</button>
            </div>
        );

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <h5 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Soglie</h5>
                <button onClick={() => setAdv((v) => !v)} className="text-[11px] text-slate-500 hover:text-slate-300 flex items-center gap-1">
                    <Pencil className="w-3 h-3" /> {adv ? "chiudi editor" : "modifica struttura"}
                </button>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm border-separate" style={{ borderSpacing: "0 4px" }}>
                    <thead>
                        <tr className="text-[10px] uppercase tracking-wider text-slate-600">
                            <th className="text-left font-medium pl-2">Ambito</th>
                            {Array.from({ length: maxTier }, (_, i) => (
                                <th key={i} className="text-center font-medium px-1">Soglia {i + 1}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {groups.map((g, gi) => (
                            <tr key={gi}>
                                <td className="pl-2 pr-3 py-1 rounded-l-lg bg-white/[0.03]">
                                    <span className="text-slate-200 text-[13px] font-medium whitespace-nowrap">{g.label}</span>
                                    <span className="block text-[10px] text-slate-500">{[g.sub, g.um].filter(Boolean).join(" · ")}</span>
                                </td>
                                {Array.from({ length: maxTier }, (_, i) => {
                                    const r = g.rows.find((x) => x.tier === i + 1);
                                    return (
                                        <td key={i} className={cn("text-center px-1 py-1 bg-white/[0.03]", i === maxTier - 1 && "rounded-r-lg")}>
                                            {r ? (
                                                <div>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        defaultValue={r.soglia_valore}
                                                        onBlur={(e) => { const v = Number(e.target.value) || 0; if (v !== Number(r.soglia_valore)) saveVal(r, v); }}
                                                        className="glass-input w-16 py-1 text-sm text-center font-semibold"
                                                    />
                                                    {r.reward_tipo && (
                                                        <span className="block text-[10px] text-amber-300/90 mt-0.5">
                                                            {r.reward_tipo === "sblocco" ? "sblocco" : `→ ${fmtVal(r.reward_valore, r.reward_um)}`}
                                                        </span>
                                                    )}
                                                    {r.note && <span className="block text-[9px] text-slate-600 truncate max-w-[90px] mx-auto" title={r.note}>{r.note}</span>}
                                                </div>
                                            ) : (
                                                <span className="text-slate-700">—</span>
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {adv && <SoglieAdvanced soglie={soglie} storeOptions={storeOptions} pista={pista} brand={brand} month={month} onChange={onChange} />}
        </div>
    );
}

function SoglieAdvanced({ soglie, storeOptions, pista, brand, month, onChange }: {
    soglie: SogliaAz[]; storeOptions: string[]; pista: Pista; brand: string; month: string; onChange: () => void;
}) {
    const [rows, setRows] = useState(soglie);
    useEffect(() => setRows(soglie), [soglie]);
    const upd = (id: string, patch: Partial<SogliaAz>) => setRows((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const save = async (r: SogliaAz) => {
        const { error } = await supabase.from("gare_azienda_soglie").update({
            scope: r.scope, cluster: r.cluster, store_name: r.store_name, tier: r.tier,
            soglia_valore: r.soglia_valore, soglia_um: r.soglia_um, reward_tipo: r.reward_tipo,
            reward_valore: r.reward_valore, reward_um: r.reward_um, reward_descr: r.reward_descr, note: r.note,
        }).eq("id", r.id);
        if (!dbError("Salvataggio soglia", error)) onChange();
    };
    const add = async () => {
        const { error } = await supabase.from("gare_azienda_soglie").insert({ brand, month, pista: pista.codice, tier: 1, soglia_valore: 0, soglia_um: "punti" });
        if (!dbError("Creazione soglia", error)) onChange();
    };
    const del = async (id: string) => {
        const { error } = await supabase.from("gare_azienda_soglie").delete().eq("id", id);
        if (!dbError("Eliminazione soglia", error)) onChange();
    };
    return (
        <div className="space-y-1.5 border border-white/10 rounded-xl p-2.5 bg-white/[0.02]">
            <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Editor soglie (una riga = una cella)</p>
                <button onClick={add} className="text-xs text-indigo-300 hover:text-indigo-200 flex items-center gap-1"><Plus className="w-3 h-3" /> riga</button>
            </div>
            {rows.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-1.5 text-sm">
                    <select value={r.scope} onChange={(e) => { upd(r.id, { scope: e.target.value }); save({ ...r, scope: e.target.value }); }} className="glass-input w-auto py-1 text-[11px]"><option value="pdv">PDV</option><option value="ragione_sociale">RS</option></select>
                    <input list="cluster-suggeriti" value={r.cluster ?? ""} onChange={(e) => upd(r.id, { cluster: e.target.value || null })} onBlur={() => save(r)} placeholder="cluster" className="glass-input w-24 py-1 text-xs" />
                    <select value={r.store_name ?? ""} onChange={(e) => { const v = e.target.value || null; upd(r.id, { store_name: v }); save({ ...r, store_name: v }); }} className="glass-input w-auto py-1 text-[11px]">
                        <option value="">tutti</option>
                        {storeOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <input type="number" min="1" value={r.tier} onChange={(e) => upd(r.id, { tier: Number(e.target.value) || 1 })} onBlur={() => save(r)} className="glass-input w-12 py-1 text-sm text-center" title="tier" />
                    <input type="number" step="0.01" value={r.soglia_valore ?? ""} onChange={(e) => upd(r.id, { soglia_valore: e.target.value ? Number(e.target.value) : 0 })} onBlur={() => save(r)} className="glass-input w-20 py-1 text-sm text-center" title="soglia" />
                    <select value={r.soglia_um} onChange={(e) => { upd(r.id, { soglia_um: e.target.value }); save({ ...r, soglia_um: e.target.value }); }} className="glass-input w-auto py-1 text-[11px]">{UM_SOGLIA.map((u) => <option key={u} value={u}>{u}</option>)}</select>
                    <select value={r.reward_tipo ?? ""} onChange={(e) => { const v = e.target.value || null; upd(r.id, { reward_tipo: v }); save({ ...r, reward_tipo: v }); }} className="glass-input w-auto py-1 text-[11px]"><option value="">no reward</option>{REWARD_TIPI_AZ.map((t) => <option key={t} value={t}>{t}</option>)}</select>
                    {r.reward_tipo && r.reward_tipo !== "sblocco" && (
                        <input type="number" step="0.01" value={r.reward_valore ?? ""} onChange={(e) => upd(r.id, { reward_valore: e.target.value ? Number(e.target.value) : null })} onBlur={() => save(r)} placeholder="val" className="glass-input w-16 py-1 text-sm text-center" />
                    )}
                    <input value={r.note ?? ""} onChange={(e) => upd(r.id, { note: e.target.value || null })} onBlur={() => save(r)} placeholder="note…" className="glass-input flex-1 min-w-[80px] py-1 text-xs text-slate-400" />
                    <button onClick={() => del(r.id)} className="text-slate-600 hover:text-rose-400 p-0.5"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
            ))}
        </div>
    );
}

/* ---------------- Voci: read-first ---------------- */
function VociBlock({ pista, voci, brand, month, onChange }: {
    pista: Pista; voci: VoceAz[]; brand: string; month: string; onChange: () => void;
}) {
    const [editId, setEditId] = useState<string | null>(null);

    const add = async () => {
        const { data, error } = await supabase.from("gare_azienda_voci").insert({ brand, month, pista: pista.codice, nome: "Nuova voce", tipo: "gettone", sort_order: voci.length }).select("id").single();
        if (!dbError("Creazione voce", error)) {
            onChange();
            if (data?.id) setEditId(data.id);
        }
    };

    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between">
                <h5 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Compensi e punteggi</h5>
                <button onClick={add} className="text-xs text-indigo-300 hover:text-indigo-200 flex items-center gap-1"><Plus className="w-3 h-3" /> voce</button>
            </div>
            {voci.map((v) => (
                <VoceRow key={v.id} v={v} editing={editId === v.id} onEdit={() => setEditId(editId === v.id ? null : v.id)} onChange={onChange} />
            ))}
            {!voci.length && <p className="text-[11px] text-slate-600">Nessuna voce.</p>}
        </div>
    );
}

function VoceRow({ v, editing, onEdit, onChange }: { v: VoceAz; editing: boolean; onEdit: () => void; onChange: () => void }) {
    const [f, setF] = useState(v);
    useEffect(() => setF(v), [v]);
    const save = async (patch?: Partial<VoceAz>) => {
        const r = { ...f, ...patch };
        const { error } = await supabase.from("gare_azienda_voci").update({
            nome: r.nome, tipo: r.tipo, valore: r.valore, um: r.um, condizione: r.condizione, scope: r.scope,
            girata_ai_ragazzi: r.girata_ai_ragazzi, note: r.note,
        }).eq("id", v.id);
        if (!dbError("Salvataggio voce", error)) onChange();
    };
    const del = async () => {
        const { error } = await supabase.from("gare_azienda_voci").delete().eq("id", v.id);
        if (!dbError("Eliminazione voce", error)) onChange();
    };

    return (
        <div className="glass-card rounded-lg overflow-hidden">
            <div className="p-2.5 flex items-center gap-3 cursor-pointer hover:bg-white/[0.02]" onClick={onEdit}>
                <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-slate-100 font-medium leading-snug">{v.nome}
                        {v.scope === "ragione_sociale" && <span className="text-[9px] text-slate-500 ml-1.5 border border-white/10 rounded px-1">RS</span>}
                        {v.girata_ai_ragazzi && <span className="text-[9px] text-emerald-400 ml-1.5 border border-emerald-500/20 rounded px-1">girata</span>}
                    </p>
                    {v.condizione && <p className="text-[11px] text-slate-500 leading-snug mt-0.5">{v.condizione}</p>}
                </div>
                <span className={cn("text-[15px] font-bold whitespace-nowrap", TIPO_VAL_COLOR[v.tipo] || "text-slate-300")}>
                    {v.valore != null ? fmtVal(v.valore, v.um) : <span className="text-[10px] font-medium text-slate-500 uppercase">{v.tipo}</span>}
                </span>
                <Pencil className="w-3.5 h-3.5 text-slate-600 shrink-0" />
            </div>
            {editing && (
                <div className="px-2.5 pb-2.5 pt-1 border-t border-white/5 flex flex-wrap items-center gap-1.5">
                    <input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} onBlur={() => save()} className="glass-input flex-1 min-w-[160px] py-1 text-sm" />
                    <select value={f.tipo} onChange={(e) => { setF({ ...f, tipo: e.target.value }); save({ tipo: e.target.value }); }} className="glass-input w-auto py-1 text-[11px]">{VOCE_TIPI.map((t) => <option key={t} value={t}>{t}</option>)}</select>
                    <input type="number" step="0.01" value={f.valore ?? ""} onChange={(e) => setF({ ...f, valore: e.target.value ? Number(e.target.value) : null })} onBlur={() => save()} placeholder="valore" className="glass-input w-20 py-1 text-sm text-center" />
                    <input value={f.um ?? ""} onChange={(e) => setF({ ...f, um: e.target.value || null })} onBlur={() => save()} placeholder="um" className="glass-input w-16 py-1 text-xs" />
                    <select value={f.scope} onChange={(e) => { setF({ ...f, scope: e.target.value }); save({ scope: e.target.value }); }} className="glass-input w-auto py-1 text-[11px]"><option value="pdv">PDV</option><option value="ragione_sociale">RS</option></select>
                    <button onClick={() => { const g = !f.girata_ai_ragazzi; setF({ ...f, girata_ai_ragazzi: g }); save({ girata_ai_ragazzi: g }); }} className={cn("text-[10px] px-1.5 py-0.5 rounded-full border", f.girata_ai_ragazzi ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/20" : "text-slate-600 border-white/10")}>girata</button>
                    <input value={f.condizione ?? ""} onChange={(e) => setF({ ...f, condizione: e.target.value || null })} onBlur={() => save()} placeholder="condizione / dettaglio…" className="glass-input w-full py-1 text-xs text-slate-400" />
                    <div className="flex items-center gap-2 ml-auto">
                        <button onClick={del} className="text-[10px] px-2 py-1 rounded bg-rose-500/15 text-rose-300 flex items-center gap-1"><Trash2 className="w-3 h-3" /> elimina</button>
                        <button onClick={onEdit} className="text-[10px] px-2 py-1 rounded bg-white/5 text-slate-300 flex items-center gap-1"><Check className="w-3 h-3" /> fatto</button>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ---------------- Regole: cartellini leggibili ---------------- */
function RegoleBlock({ pista, regole, brand, month, onChange }: {
    pista: Pista; regole: RegolaAz[]; brand: string; month: string; onChange: () => void;
}) {
    const [editId, setEditId] = useState<string | null>(null);
    const add = async () => {
        const { data, error } = await supabase.from("gare_azienda_regole").insert({ brand, month, pista: pista.codice, tipo: "malus", condizione: "…", effetto: "…" }).select("id").single();
        if (!dbError("Creazione regola", error)) {
            onChange();
            if (data?.id) setEditId(data.id);
        }
    };
    if (!regole.length)
        return (
            <div className="flex items-center justify-between">
                <p className="text-[11px] text-slate-600">Nessuna regola (malus / gate / storni).</p>
                <button onClick={add} className="text-xs text-indigo-300 hover:text-indigo-200 flex items-center gap-1"><Plus className="w-3 h-3" /> regola</button>
            </div>
        );
    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between">
                <h5 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Malus · gate · storni</h5>
                <button onClick={add} className="text-xs text-indigo-300 hover:text-indigo-200 flex items-center gap-1"><Plus className="w-3 h-3" /> regola</button>
            </div>
            {regole.map((r) => (
                <RegolaCard key={r.id} r={r} editing={editId === r.id} onEdit={() => setEditId(editId === r.id ? null : r.id)} onChange={onChange} />
            ))}
        </div>
    );
}

function RegolaCard({ r, editing, onEdit, onChange }: { r: RegolaAz; editing: boolean; onEdit: () => void; onChange: () => void }) {
    const st = REGOLA_STYLE[r.tipo] || REGOLA_STYLE.malus;
    const [f, setF] = useState(r);
    useEffect(() => setF(r), [r]);
    const save = async (patch?: Partial<RegolaAz>) => {
        const x = { ...f, ...patch };
        const { error } = await supabase.from("gare_azienda_regole").update({
            tipo: x.tipo, condizione: x.condizione, effetto: x.effetto, valore: x.valore, um: x.um,
            bersaglio: x.bersaglio, scope: x.scope, girata_ai_ragazzi: x.girata_ai_ragazzi, note: x.note,
        }).eq("id", r.id);
        if (!dbError("Salvataggio regola", error)) onChange();
    };
    const del = async () => {
        const { error } = await supabase.from("gare_azienda_regole").delete().eq("id", r.id);
        if (!dbError("Eliminazione regola", error)) onChange();
    };
    return (
        <div className={cn("glass-card rounded-lg overflow-hidden border-l-2", st.border)}>
            <div className="p-2.5 flex items-start gap-2.5 cursor-pointer hover:bg-white/[0.02]" onClick={onEdit}>
                <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 mt-0.5", st.badge)}>{st.label}</span>
                <p className="flex-1 min-w-0 text-[12px] leading-relaxed text-slate-300">
                    <span className="text-slate-400">Se</span> {r.condizione} <span className="text-slate-500">→</span>{" "}
                    <span className="text-slate-100">{r.effetto}</span>
                    {r.note && <span className="block text-[10px] text-slate-500 mt-0.5">{r.note}</span>}
                </p>
                {r.valore != null && (
                    <span className={cn("text-sm font-bold whitespace-nowrap shrink-0", r.valore < 0 ? "text-rose-300" : "text-emerald-300")}>
                        {fmtVal(r.valore, r.um)}
                    </span>
                )}
                <Pencil className="w-3.5 h-3.5 text-slate-600 shrink-0 mt-0.5" />
            </div>
            {editing && (
                <div className="px-2.5 pb-2.5 pt-1 border-t border-white/5 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <select value={f.tipo} onChange={(e) => { setF({ ...f, tipo: e.target.value }); save({ tipo: e.target.value }); }} className="glass-input w-auto py-1 text-[11px]">{REGOLA_TIPI.map((t) => <option key={t} value={t}>{t}</option>)}</select>
                        <input type="number" step="0.01" value={f.valore ?? ""} onChange={(e) => setF({ ...f, valore: e.target.value ? Number(e.target.value) : null })} onBlur={() => save()} placeholder="valore" className="glass-input w-20 py-1 text-sm text-center" />
                        <input value={f.um ?? ""} onChange={(e) => setF({ ...f, um: e.target.value || null })} onBlur={() => save()} placeholder="um" className="glass-input w-16 py-1 text-xs" />
                        <input value={f.bersaglio ?? ""} onChange={(e) => setF({ ...f, bersaglio: e.target.value || null })} onBlur={() => save()} placeholder="bersaglio (es. premio_partnership)" className="glass-input flex-1 min-w-[140px] py-1 text-xs text-slate-400" />
                        <select value={f.scope} onChange={(e) => { setF({ ...f, scope: e.target.value }); save({ scope: e.target.value }); }} className="glass-input w-auto py-1 text-[11px]"><option value="pdv">PDV</option><option value="ragione_sociale">RS</option></select>
                    </div>
                    <input value={f.condizione} onChange={(e) => setF({ ...f, condizione: e.target.value })} onBlur={() => save()} placeholder="condizione (quando scatta)…" className="glass-input w-full py-1 text-xs" />
                    <input value={f.effetto} onChange={(e) => setF({ ...f, effetto: e.target.value })} onBlur={() => save()} placeholder="effetto (cosa succede)…" className="glass-input w-full py-1 text-xs" />
                    <div className="flex items-center justify-end gap-2">
                        <button onClick={del} className="text-[10px] px-2 py-1 rounded bg-rose-500/15 text-rose-300 flex items-center gap-1"><Trash2 className="w-3 h-3" /> elimina</button>
                        <button onClick={onEdit} className="text-[10px] px-2 py-1 rounded bg-white/5 text-slate-300 flex items-center gap-1"><Check className="w-3 h-3" /> fatto</button>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ---------------- Rete malus & gate ---------------- */
function ReteRegole({ regole }: { regole: RegolaAz[] }) {
    const gruppi = useMemo(() => {
        const m: Record<string, RegolaAz[]> = {};
        for (const r of regole) (m[r.bersaglio || "(senza bersaglio)"] = m[r.bersaglio || "(senza bersaglio)"] || []).push(r);
        return Object.entries(m).sort((a, b) => b[1].length - a[1].length);
    }, [regole]);
    return (
        <div className="glass-panel p-4 space-y-2.5">
            <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <h4 className="text-sm font-semibold text-white">Rete malus & gate</h4>
                <span className="text-[11px] text-slate-500">{regole.length} regole, per bersaglio</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
                {gruppi.map(([bersaglio, rs]) => {
                    const totEur = rs.filter((r) => r.um === "eur" && r.valore != null).reduce((a, r) => a + Number(r.valore), 0);
                    return (
                        <div key={bersaglio} className="glass-card p-2.5 rounded-lg">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-semibold text-slate-200">{clusterLabel(bersaglio)}</span>
                                {totEur !== 0 && <span className="text-[11px] text-rose-400 ml-auto font-semibold">{eur(totEur)}</span>}
                            </div>
                            {rs.map((r) => {
                                const st = REGOLA_STYLE[r.tipo] || REGOLA_STYLE.malus;
                                return (
                                    <p key={r.id} className="text-[11px] text-slate-500 leading-relaxed">
                                        <span className={cn("px-1 rounded text-[8px] border mr-1 font-bold", st.badge)}>{st.label}</span>
                                        {r.condizione}
                                    </p>
                                );
                            })}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

