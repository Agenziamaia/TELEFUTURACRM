"use client";

/**
 * AVANZAMENTO — produzione REALE vs target della gara.
 *
 * Per ogni soggetto (persona, ruolo+grado, negozio, categoria negozio) e ogni
 * metrica: conta i contratti del periodo che la metrica riconosce (match_macro
 * sull'asse canonico + match_categorie/match_brands/exclude_prodotti), li
 * confronta col target, valuta i paletti (minimi) e calcola la % di commissioning
 * sbloccata secondo le regole della gara (le % delle regole soddisfatte si
 * sommano, tetto 100 — mig. 042).
 *
 * Conteggio: tutti i contratti del periodo tranne gli annullati e i demo.
 * Periodo: date della gara se impostate, altrimenti mese corrente (modificabile).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { sameStore } from "@/lib/visibleStores";
import { dbError } from "./toast";

interface Gara { id: string; name: string; active: boolean; start_date: string | null; end_date: string | null }
interface Metric { id: string; name: string; match_categorie: string[]; match_brands: string[]; exclude_prodotti: string[]; match_macro: string[]; sort_order: number }
interface TargetRow { metric_id: string; subject_type: string; subject_ref: string; kind: string; value: number | null }
interface UnlockRule { id: string; metric_ids: string[]; percent: number }
interface StoreRow { id: string; name: string; store_category: string | null }
interface UserRow { id: string; full_name: string; match_name: string | null; role: string; grade: string | null }
interface Contract { brand: string | null; categoria: string | null; categoria_macro: string | null; prodotto: string | null; venditore: string | null; negozio: string | null; stato: string | null }

const SUBJECTS: { type: string; label: string; icon: string }[] = [
    { type: "user", label: "Personale", icon: "👤" },
    { type: "role_grade", label: "Categoria Risorse", icon: "🏷️" },
    { type: "store", label: "Negozio", icon: "🏪" },
    { type: "store_category", label: "Categoria Negozio", icon: "🏬" },
];

const oggi = () => new Date().toISOString().slice(0, 10);
const primoDelMese = () => oggi().slice(0, 8) + "01";

export function AvanzamentoView() {
    const [gare, setGare] = useState<Gara[]>([]);
    const [garaId, setGaraId] = useState("");
    const [metrics, setMetrics] = useState<Metric[]>([]);
    const [targets, setTargets] = useState<TargetRow[]>([]);
    const [rules, setRules] = useState<UnlockRule[]>([]);
    const [stores, setStores] = useState<StoreRow[]>([]);
    const [users, setUsers] = useState<UserRow[]>([]);
    const [contracts, setContracts] = useState<Contract[]>([]);
    const [da, setDa] = useState(primoDelMese());
    const [a, setA] = useState(oggi());
    const [tab, setTab] = useState("user");
    const [loading, setLoading] = useState(true);

    // anagrafiche + gare (una volta)
    useEffect(() => {
        (async () => {
            const [g, m, st, us] = await Promise.all([
                supabase.from("gare").select("id,name,active,start_date,end_date").order("created_at", { ascending: false }),
                supabase.from("target_metrics").select("id,name,match_categorie,match_brands,exclude_prodotti,match_macro,sort_order").order("sort_order"),
                supabase.from("stores").select("id,name,store_category").eq("active", true).order("name"),
                supabase.from("app_users").select("id,full_name,match_name,role,grade").eq("active", true).order("full_name"),
            ]);
            if (g.error) dbError("gare", g.error); else {
                setGare((g.data ?? []) as Gara[]);
                const attiva = (g.data ?? []).find((x: Gara) => x.active) ?? (g.data ?? [])[0];
                if (attiva) {
                    setGaraId(attiva.id);
                    if (attiva.start_date) setDa(attiva.start_date);
                    if (attiva.end_date) setA(attiva.end_date);
                }
            }
            if (m.error) dbError("metriche", m.error); else setMetrics((m.data ?? []) as Metric[]);
            if (st.error) dbError("negozi", st.error); else setStores((st.data ?? []) as StoreRow[]);
            if (us.error) dbError("utenti", us.error); else setUsers((us.data ?? []) as UserRow[]);
        })();
    }, []);

    // target + regole della gara selezionata
    useEffect(() => {
        if (!garaId) return;
        (async () => {
            const [t, r] = await Promise.all([
                supabase.from("targets").select("metric_id,subject_type,subject_ref,kind,value").eq("gara_id", garaId),
                supabase.from("gara_unlock_rules").select("id,metric_ids,percent").eq("gara_id", garaId),
            ]);
            if (t.error) dbError("target", t.error); else setTargets((t.data ?? []) as TargetRow[]);
            if (r.error) dbError("regole sblocco", r.error); else setRules((r.data ?? []) as UnlockRule[]);
        })();
    }, [garaId]);

    // contratti del periodo
    const loadContracts = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from("contracts")
            .select("brand,categoria,categoria_macro,prodotto,venditore,negozio,stato")
            .gte("data_registrazione", da).lte("data_registrazione", a)
            .eq("is_demo", false).limit(10000);
        if (error) dbError("contratti", error);
        setContracts(((data ?? []) as Contract[]).filter((c) => !/annull/i.test(c.stato || "")));
        setLoading(false);
    }, [da, a]);
    useEffect(() => { loadContracts(); }, [loadContracts]);

    // la metrica riconosce il contratto? (stessa logica della tassonomia unica)
    const matchMetrica = useCallback((c: Contract, m: Metric): boolean => {
        if (m.match_brands?.length && !m.match_brands.some((b) => (c.brand || "").toLowerCase() === b.toLowerCase())) return false;
        if (m.exclude_prodotti?.length && m.exclude_prodotti.some((x) => (c.prodotto || "").toLowerCase().includes(x.toLowerCase()))) return false;
        if (m.match_macro?.length && m.match_macro.includes(c.categoria_macro || "")) return true;
        if (m.match_categorie?.length && m.match_categorie.some((x) => x.toLowerCase() === (c.categoria || "").toLowerCase())) return true;
        return false;
    }, []);

    // contratti attribuiti al soggetto (nomi venditore per persone, negozi per punti vendita)
    const scopeDi = useCallback((type: string, ref: string): { venditori?: Set<string>; negozi?: string[] } => {
        if (type === "user") {
            const u = users.find((x) => x.id === ref);
            return { venditori: new Set([u?.full_name, u?.match_name].filter(Boolean) as string[]) };
        }
        if (type === "role_grade") {
            const [role, grade] = ref.split("|");
            const nomi = users.filter((u) => u.role === role && (!grade || u.grade === grade))
                .flatMap((u) => [u.full_name, u.match_name].filter(Boolean) as string[]);
            return { venditori: new Set(nomi) };
        }
        if (type === "store") {
            const st = stores.find((x) => x.id === ref);
            return { negozi: st ? [st.name] : [] };
        }
        // store_category
        return { negozi: stores.filter((x) => x.store_category === ref).map((x) => x.name) };
    }, [users, stores]);

    const contaProduzione = useCallback((type: string, ref: string, m: Metric): number => {
        const scope = scopeDi(type, ref);
        let n = 0;
        for (const c of contracts) {
            if (!matchMetrica(c, m)) continue;
            if (scope.venditori && !scope.venditori.has(c.venditore || "")) continue;
            if (scope.negozi && !scope.negozi.some((s) => sameStore(c.negozio, s))) continue;
            n++;
        }
        return n;
    }, [contracts, matchMetrica, scopeDi]);

    // righe della tab corrente: soggetti che hanno ALMENO un target o paletto
    const righe = useMemo(() => {
        const perSoggetto = new Map<string, { target: Map<string, number>; paletto: Map<string, number> }>();
        targets.filter((t) => t.subject_type === tab && t.value != null).forEach((t) => {
            const e = perSoggetto.get(t.subject_ref) ?? { target: new Map(), paletto: new Map() };
            (t.kind === "paletto" ? e.paletto : e.target).set(t.metric_id, Number(t.value));
            perSoggetto.set(t.subject_ref, e);
        });
        return [...perSoggetto.entries()].map(([ref, e]) => {
            const nome = tab === "user" ? (users.find((u) => u.id === ref)?.full_name || ref)
                : tab === "store" ? (stores.find((s) => s.id === ref)?.name || ref)
                : tab === "role_grade" ? ref.split("|").filter(Boolean).join(" · ")
                : ref;
            const metRows = metrics
                .filter((m) => e.target.has(m.id) || e.paletto.has(m.id))
                .map((m) => {
                    const actual = contaProduzione(tab, ref, m);
                    const tgt = e.target.get(m.id) ?? null;
                    const pal = e.paletto.get(m.id) ?? null;
                    return { m, actual, tgt, pal, palOk: pal != null ? actual >= pal : null };
                });
            // sblocco: le % delle regole soddisfatte si sommano (tetto 100).
            // Una regola guarda i paletti delle sue metriche (vuoto = tutti i paletti
            // del soggetto) e si soddisfa solo se ne esiste almeno uno, tutti presi.
            let sblocco = 0;
            for (const r of rules) {
                const palRows = metRows.filter((x) => x.pal != null && (!r.metric_ids?.length || r.metric_ids.includes(x.m.id)));
                if (palRows.length && palRows.every((x) => x.palOk)) sblocco += Number(r.percent) || 0;
            }
            return { ref, nome, metRows, sblocco: Math.min(100, sblocco), hasPaletti: metRows.some((x) => x.pal != null) };
        }).sort((x, y) => x.nome.localeCompare(y.nome));
    }, [targets, tab, metrics, users, stores, rules, contaProduzione]);

    const gara = gare.find((g) => g.id === garaId);

    return (
        <div className="space-y-5">
            {/* selettori */}
            <div className="flex flex-wrap items-end gap-3 p-4 rounded-xl bg-white/[0.02] border border-white/5">
                <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Gara</label>
                    <select className="glass-input text-sm" value={garaId} onChange={(e) => setGaraId(e.target.value)}>
                        {gare.map((g) => <option key={g.id} value={g.id}>{g.name}{g.active ? " · attiva" : ""}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Dal</label>
                    <input type="date" className="glass-input text-sm" value={da} onChange={(e) => setDa(e.target.value)} />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Al</label>
                    <input type="date" className="glass-input text-sm" value={a} onChange={(e) => setA(e.target.value)} />
                </div>
                <div className="text-xs text-slate-500 pb-2">
                    {loading ? "Carico i contratti…" : `${contracts.length} contratti nel periodo (esclusi annullati e demo)`}
                    {gara && !gara.start_date && <span className="ml-2 text-slate-600">· la gara non ha date: periodo di default = mese corrente</span>}
                </div>
            </div>

            {/* tab soggetti */}
            <div className="flex gap-2 flex-wrap">
                {SUBJECTS.map((s) => (
                    <button key={s.type} onClick={() => setTab(s.type)}
                        className={`text-sm px-4 py-2 rounded-lg border transition-colors ${tab === s.type ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-200" : "bg-white/[0.03] border-white/10 text-slate-400 hover:text-slate-200"}`}>
                        {s.icon} {s.label}
                    </button>
                ))}
            </div>

            {righe.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-sm rounded-xl bg-white/[0.02] border border-white/5">
                    Nessun target o paletto impostato per questa combinazione: si impostano dalla sezione Target.
                </div>
            ) : (
                <div className="space-y-3">
                    {righe.map((r) => (
                        <div key={r.ref} className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                            <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
                                <div className="font-semibold text-white">{r.nome}</div>
                                {r.hasPaletti && rules.length > 0 && (
                                    <div className={`text-xs font-bold px-2.5 py-1 rounded-full border ${r.sblocco >= 100 ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" : r.sblocco > 0 ? "bg-amber-500/15 border-amber-500/40 text-amber-300" : "bg-red-500/10 border-red-500/30 text-red-300"}`}>
                                        Commissioning sbloccato: {r.sblocco}%
                                    </div>
                                )}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {r.metRows.map(({ m, actual, tgt, pal, palOk }) => {
                                    const pct = tgt ? Math.min(100, Math.round((actual / tgt) * 100)) : null;
                                    return (
                                        <div key={m.id} className="p-3 rounded-lg bg-white/[0.03] border border-white/8">
                                            <div className="flex items-center justify-between text-xs mb-1.5">
                                                <span className="text-slate-300 font-medium">{m.name}</span>
                                                {pal != null && (
                                                    <span className={`font-bold ${palOk ? "text-emerald-400" : "text-red-400"}`} title={`Paletto: minimo ${pal}`}>
                                                        {palOk ? "✓" : "✗"} paletto {pal}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-baseline gap-1.5">
                                                <span className="text-xl font-bold text-white">{actual}</span>
                                                {tgt != null && <span className="text-sm text-slate-500">/ {tgt}</span>}
                                                {pct != null && <span className={`ml-auto text-xs font-bold ${pct >= 100 ? "text-emerald-400" : pct >= 60 ? "text-amber-300" : "text-slate-400"}`}>{pct}%</span>}
                                            </div>
                                            {tgt != null && (
                                                <div className="h-1.5 mt-2 rounded-full bg-white/5 overflow-hidden">
                                                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: (pct ?? 0) >= 100 ? "var(--tf-22c55e)" : (pct ?? 0) >= 60 ? "var(--tf-f59e0b)" : "var(--tf-6366f1)" }} />
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
