"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/utils";
import { ROLES, STORE_CATEGORIES, roleLabel } from "@/lib/roles";
import {
    Loader2,
    Plus,
    Trash2,
    Search,
    Save,
    RotateCcw,
    User as UserIcon,
    Users,
    Store as StoreIcon,
    Tag,
    Flag,
    Trophy,
    Check,
} from "lucide-react";
import { notify, dbError } from "./toast";

/* ---------- Tipi ---------- */
interface Gara {
    id: string;
    name: string;
    active: boolean;
}
interface Metric {
    id: string;
    name: string;
}
interface TStore {
    id: string;
    name: string;
}
interface TUser {
    id: string;
    full_name: string;
    role: string;
}
interface UnlockRule {
    id: string;
    name: string | null;
    metric_ids: string[];
    percent: number;
}
interface Subject {
    ref: string;
    label: string;
    sub: string;
}

type SubjectType = "user" | "role_grade" | "store" | "store_category";

const SUBS: { id: string; label: string; icon: typeof UserIcon; type: SubjectType | null }[] = [
    { id: "personale", label: "Personale", icon: UserIcon, type: "user" },
    { id: "ruoli", label: "Categoria Risorse", icon: Users, type: "role_grade" },
    { id: "negozi", label: "Negozio", icon: StoreIcon, type: "store" },
    { id: "catnegozi", label: "Categoria Negozio", icon: Tag, type: "store_category" },
    { id: "paletti", label: "Paletti", icon: Flag, type: null },
];

const PTYPES: { type: SubjectType; label: string }[] = [
    { type: "store", label: "Negozio" },
    { type: "store_category", label: "Categoria Negozio" },
    { type: "user", label: "Personale" },
    { type: "role_grade", label: "Categoria Risorse" },
];

/* ================================================================== */
/* Sezione Target: gara, sotto-sezioni per soggetto, paletti + regole  */
/* ================================================================== */
export function TargetSection() {
    const [gare, setGare] = useState<Gara[]>([]);
    const [garaId, setGaraId] = useState("");
    const [metrics, setMetrics] = useState<Metric[]>([]);
    const [stores, setStores] = useState<TStore[]>([]);
    const [users, setUsers] = useState<TUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [sub, setSub] = useState("personale");
    const [showNewGara, setShowNewGara] = useState(false);
    const [newGara, setNewGara] = useState("");

    const loadBase = useCallback(async () => {
        setLoading(true);
        const [g, m, s, u] = await Promise.all([
            supabase.from("gare").select("id,name,active").order("created_at", { ascending: false }),
            supabase.from("target_metrics").select("id,name").order("sort_order"),
            supabase.from("stores").select("id,name").order("name"),
            supabase.from("app_users").select("id,full_name,role").eq("status", "attivo").order("full_name"),
        ]);
        if (dbError("Caricamento gare", g.error) || dbError("Caricamento metriche", m.error)) {
            setLoading(false);
            return;
        }
        const garas = (g.data as Gara[]) || [];
        setGare(garas);
        setMetrics((m.data as Metric[]) || []);
        setStores((s.data as TStore[]) || []);
        setUsers((u.data as TUser[]) || []);
        setGaraId((prev) => prev || (garas.find((x) => x.active) || garas[0])?.id || "");
        setLoading(false);
    }, []);
    useEffect(() => {
        loadBase();
    }, [loadBase]);

    const createGara = async () => {
        const name = newGara.trim();
        if (!name) return;
        const { data, error } = await supabase.from("gare").insert({ name, active: false }).select("id").single();
        if (dbError("Creazione gara", error)) return;
        notify(`Gara "${name}" creata`, "ok");
        setNewGara("");
        setShowNewGara(false);
        await loadBase();
        if (data?.id) setGaraId(data.id);
    };

    const subjectsFor = useCallback(
        (type: SubjectType): Subject[] => {
            if (type === "user") return users.map((u) => ({ ref: u.id, label: u.full_name, sub: roleLabel(u.role) }));
            if (type === "role_grade")
                return ROLES.flatMap((r) =>
                    r.grades.length
                        ? r.grades.map((g) => ({ ref: `${r.id}|${g.id}`, label: `${r.label} — ${g.label}`, sub: "" }))
                        : [{ ref: `${r.id}|`, label: r.label, sub: "" }],
                );
            if (type === "store") return stores.map((s) => ({ ref: s.id, label: s.name, sub: "" }));
            return STORE_CATEGORIES.map((c) => ({ ref: c, label: c, sub: "" }));
        },
        [users, stores],
    );

    if (loading)
        return (
            <div className="flex justify-center py-16 text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin" />
            </div>
        );

    const active = SUBS.find((s) => s.id === sub)!;

    return (
        <div className="space-y-4">
            {/* Barra gara */}
            <div className="glass-panel p-4 flex flex-wrap gap-3 items-center">
                <Trophy className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-slate-500">Gara</span>
                <select className="glass-input w-auto text-sm" value={garaId} onChange={(e) => setGaraId(e.target.value)}>
                    {gare.map((g) => (
                        <option key={g.id} value={g.id}>
                            {g.name}
                            {g.active ? " (attiva)" : ""}
                        </option>
                    ))}
                </select>
                {showNewGara ? (
                    <div className="flex gap-2 items-center">
                        <input
                            value={newGara}
                            onChange={(e) => setNewGara(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && createGara()}
                            placeholder="Nome gara (es. Gara Agosto 2026)"
                            className="glass-input w-56 py-1.5 text-sm"
                            autoFocus
                        />
                        <button onClick={createGara} className="primary-btn text-xs px-3 py-1.5">
                            Crea
                        </button>
                        <button onClick={() => setShowNewGara(false)} className="text-xs text-slate-500 px-1">
                            Annulla
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={() => setShowNewGara(true)}
                        className="flex items-center gap-1 text-xs text-indigo-300 hover:text-indigo-200"
                    >
                        <Plus className="w-3.5 h-3.5" /> Nuova gara
                    </button>
                )}
                <span className="text-[11px] text-slate-600 ml-auto">
                    Target e paletti sono per gara: cambia gara per impostarne altri.
                </span>
            </div>

            {/* Sotto-sezioni */}
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
                {SUBS.map((s) => {
                    const Icon = s.icon;
                    const on = sub === s.id;
                    return (
                        <button
                            key={s.id}
                            onClick={() => setSub(s.id)}
                            className={cn(
                                "glass-card p-3 rounded-xl flex items-center gap-2.5 text-left transition-colors border",
                                on ? "border-indigo-500/60 bg-indigo-500/10" : "border-transparent hover:bg-white/5",
                            )}
                        >
                            <Icon className={cn("w-4 h-4 shrink-0", on ? "text-indigo-300" : "text-slate-500")} />
                            <span className={cn("text-sm font-medium", on ? "text-white" : "text-slate-300")}>{s.label}</span>
                        </button>
                    );
                })}
            </div>

            {!garaId ? (
                <p className="text-sm text-slate-500 px-1">Crea una gara per impostare i target.</p>
            ) : active.type ? (
                <TargetEditor
                    key={`${garaId}|${active.type}|target`}
                    garaId={garaId}
                    metrics={metrics}
                    subjectType={active.type}
                    subjects={subjectsFor(active.type)}
                    kind="target"
                    hint="Imposta i target per metrica, poi Salva. I soggetti con valori hanno la spunta."
                />
            ) : (
                <PalettiView garaId={garaId} metrics={metrics} subjectsFor={subjectsFor} />
            )}
        </div>
    );
}

/* ================================================================== */
/* Editor generico: soggetti a sinistra, valori per metrica a destra   */
/* Salvataggio ESPLICITO col pulsante, stato sporco visibile.          */
/* ================================================================== */
function TargetEditor({
    garaId,
    metrics,
    subjectType,
    subjects,
    kind,
    hint,
}: {
    garaId: string;
    metrics: Metric[];
    subjectType: SubjectType;
    subjects: Subject[];
    kind: "target" | "paletto";
    hint: string;
}) {
    const [saved, setSaved] = useState<Record<string, Record<string, string>>>({}); // ref -> metric_id -> valore
    const [sel, setSel] = useState("");
    const [edit, setEdit] = useState<Record<string, string>>({});
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from("targets")
            .select("subject_ref,metric_id,value")
            .eq("gara_id", garaId)
            .eq("subject_type", subjectType)
            .eq("kind", kind);
        if (dbError("Caricamento valori", error)) {
            setLoading(false);
            return;
        }
        const map: Record<string, Record<string, string>> = {};
        for (const t of (data as { subject_ref: string; metric_id: string; value: number | null }[]) || []) {
            if (t.value == null) continue;
            (map[t.subject_ref] = map[t.subject_ref] || {})[t.metric_id] = String(Number(t.value));
        }
        setSaved(map);
        setLoading(false);
    }, [garaId, subjectType, kind]);
    useEffect(() => {
        load();
    }, [load]);

    const pick = (ref: string) => {
        setSel(ref);
        setEdit({ ...(saved[ref] || {}) });
    };

    const dirty = useMemo(() => {
        if (!sel) return false;
        const base = saved[sel] || {};
        return metrics.some((m) => (edit[m.id] || "") !== (base[m.id] || ""));
    }, [edit, saved, sel, metrics]);

    const save = async () => {
        if (!sel || saving) return;
        setSaving(true);
        const base = saved[sel] || {};
        const ups: { gara_id: string; metric_id: string; subject_type: string; subject_ref: string; kind: string; value: number }[] = [];
        const dels: string[] = [];
        for (const m of metrics) {
            const v = (edit[m.id] || "").trim();
            const old = base[m.id] || "";
            if (v === old) continue;
            if (v) ups.push({ gara_id: garaId, metric_id: m.id, subject_type: subjectType, subject_ref: sel, kind, value: Number(v) });
            else dels.push(m.id);
        }
        let failed = false;
        if (ups.length) {
            const { error } = await supabase
                .from("targets")
                .upsert(ups, { onConflict: "gara_id,metric_id,subject_type,subject_ref,kind" });
            failed = dbError("Salvataggio", error) || failed;
        }
        if (dels.length && !failed) {
            const { error } = await supabase
                .from("targets")
                .delete()
                .eq("gara_id", garaId)
                .eq("subject_type", subjectType)
                .eq("subject_ref", sel)
                .eq("kind", kind)
                .in("metric_id", dels);
            failed = dbError("Eliminazione valori", error) || failed;
        }
        if (!failed) {
            const clean: Record<string, string> = {};
            for (const m of metrics) if ((edit[m.id] || "").trim()) clean[m.id] = (edit[m.id] || "").trim();
            setSaved((p) => ({ ...p, [sel]: clean }));
            notify("Salvato ✓", "ok");
        }
        setSaving(false);
    };

    const filtered = subjects.filter((s) => !search || s.label.toLowerCase().includes(search.toLowerCase()));
    const selSubject = subjects.find((s) => s.ref === sel);
    const label = kind === "paletto" ? "Paletto (minimo di gara)" : "Target";

    return (
        <div className="grid gap-4 lg:grid-cols-[300px,1fr] items-start">
            {/* Soggetti */}
            <div className="glass-panel p-3 space-y-2">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                    <input
                        className="glass-input w-full pl-9 py-1.5 text-sm"
                        placeholder="Cerca…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="space-y-1 max-h-[55vh] overflow-y-auto pr-1">
                    {filtered.map((s) => {
                        const n = Object.keys(saved[s.ref] || {}).length;
                        return (
                            <button
                                key={s.ref}
                                onClick={() => pick(s.ref)}
                                className={cn(
                                    "w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 transition-colors",
                                    sel === s.ref ? "bg-indigo-500/15 text-white" : "text-slate-300 hover:bg-white/5",
                                )}
                            >
                                <span className="flex-1 min-w-0">
                                    <span className="block text-sm truncate">{s.label}</span>
                                    {s.sub && <span className="block text-[10px] text-slate-500 truncate">{s.sub}</span>}
                                </span>
                                {n > 0 && (
                                    <span className="flex items-center gap-1 text-[10px] text-emerald-400 shrink-0">
                                        <Check className="w-3 h-3" /> {n}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                    {!filtered.length && <p className="text-xs text-slate-600 px-2 py-3">Nessun soggetto.</p>}
                </div>
            </div>

            {/* Editor */}
            <div className="glass-panel p-4 space-y-3">
                {loading ? (
                    <div className="flex justify-center py-10 text-slate-400">
                        <Loader2 className="w-5 h-5 animate-spin" />
                    </div>
                ) : !selSubject ? (
                    <p className="text-sm text-slate-500 py-8 text-center">{hint}</p>
                ) : (
                    <>
                        <div className="flex items-center justify-between gap-2">
                            <h4 className="text-white font-semibold truncate">{selSubject.label}</h4>
                            {dirty && <span className="text-[10px] text-amber-400 whitespace-nowrap">● modifiche non salvate</span>}
                        </div>
                        <div className="space-y-1.5">
                            {metrics.map((m) => (
                                <div key={m.id} className="glass-card p-2.5 rounded-lg flex items-center gap-2">
                                    <span className="flex-1 text-sm text-slate-200">{m.name}</span>
                                    <input
                                        type="number"
                                        step="1"
                                        min="0"
                                        value={edit[m.id] ?? ""}
                                        onChange={(e) => setEdit((p) => ({ ...p, [m.id]: e.target.value }))}
                                        placeholder="—"
                                        className={cn("glass-input w-24 py-1 text-sm text-center", kind === "paletto" && "!border-amber-500/30")}
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                            <button
                                onClick={save}
                                disabled={!dirty || saving}
                                className={cn(
                                    "primary-btn flex items-center gap-2 text-sm px-4",
                                    (!dirty || saving) && "opacity-40 cursor-not-allowed",
                                )}
                            >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salva {label.toLowerCase()}
                            </button>
                            {dirty && (
                                <button
                                    onClick={() => setEdit({ ...(saved[sel] || {}) })}
                                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 px-2"
                                >
                                    <RotateCcw className="w-3.5 h-3.5" /> Annulla modifiche
                                </button>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

/* ================================================================== */
/* Paletti: valori minimi per soggetto + regole di sblocco commissioning */
/* ================================================================== */
function PalettiView({
    garaId,
    metrics,
    subjectsFor,
}: {
    garaId: string;
    metrics: Metric[];
    subjectsFor: (t: SubjectType) => Subject[];
}) {
    const [ptype, setPtype] = useState<SubjectType>("store");
    const [rules, setRules] = useState<UnlockRule[]>([]);
    const [rulesMissing, setRulesMissing] = useState(false);
    const [nName, setNName] = useState("");
    const [nPct, setNPct] = useState("");
    const [nMetrics, setNMetrics] = useState<string[]>([]);
    const [nAll, setNAll] = useState(true);

    const metricName = useMemo(() => Object.fromEntries(metrics.map((m) => [m.id, m.name])), [metrics]);

    const loadRules = useCallback(async () => {
        const { data, error } = await supabase
            .from("gara_unlock_rules")
            .select("id,name,metric_ids,percent")
            .eq("gara_id", garaId)
            .order("created_at");
        if (error) {
            setRulesMissing(true);
            return;
        }
        setRulesMissing(false);
        setRules((data as UnlockRule[]) || []);
    }, [garaId]);
    useEffect(() => {
        loadRules();
    }, [loadRules]);

    const addRule = async () => {
        const pct = Number(nPct);
        if (!pct || pct <= 0 || pct > 100) {
            notify("Indica una percentuale tra 1 e 100");
            return;
        }
        if (!nAll && !nMetrics.length) {
            notify("Scegli almeno un paletto (o usa “Tutti i paletti”)");
            return;
        }
        const { error } = await supabase
            .from("gara_unlock_rules")
            .insert({ gara_id: garaId, name: nName.trim() || null, metric_ids: nAll ? [] : nMetrics, percent: pct });
        if (dbError("Creazione regola", error)) return;
        notify("Regola creata ✓", "ok");
        setNName("");
        setNPct("");
        setNMetrics([]);
        setNAll(true);
        loadRules();
    };

    const delRule = async (id: string) => {
        const { error } = await supabase.from("gara_unlock_rules").delete().eq("id", id);
        if (dbError("Eliminazione regola", error)) return;
        loadRules();
    };

    const ruleLabel = (r: UnlockRule) =>
        r.metric_ids.length === 0 ? "Tutti i paletti" : r.metric_ids.map((id) => metricName[id] || "?").join(" + ");
    const totalPct = rules.reduce((a, r) => a + Number(r.percent), 0);

    return (
        <div className="space-y-4">
            {/* Valori paletto per soggetto */}
            <div className="glass-panel p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    <Flag className="w-4 h-4 text-amber-400" />
                    <h4 className="text-white font-semibold text-sm">Paletti (minimi di gara)</h4>
                    <div className="flex gap-1.5 ml-auto">
                        {PTYPES.map((p) => (
                            <button
                                key={p.type}
                                onClick={() => setPtype(p.type)}
                                className={cn(
                                    "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                                    ptype === p.type ? "bg-amber-500/15 text-amber-300" : "text-slate-400 hover:bg-white/5",
                                )}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>
                <TargetEditor
                    key={`${garaId}|${ptype}|paletto`}
                    garaId={garaId}
                    metrics={metrics}
                    subjectType={ptype}
                    subjects={subjectsFor(ptype)}
                    kind="paletto"
                    hint="Seleziona un soggetto e imposta i minimi di gara (paletti)."
                />
            </div>

            {/* Regole di sblocco */}
            <div className="glass-panel p-4 space-y-3">
                <div className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-emerald-400" />
                    <h4 className="text-white font-semibold text-sm">Regole di sblocco commissioning</h4>
                    <span className="text-[11px] text-slate-600 ml-auto">
                        Le % delle regole soddisfatte si sommano (tetto 100%).
                    </span>
                </div>
                {rulesMissing ? (
                    <p className="text-xs text-amber-400/90">
                        Tabella regole non ancora inizializzata sul DB (migrazione 042 da applicare).
                    </p>
                ) : (
                    <>
                        <div className="space-y-1.5">
                            {rules.map((r) => (
                                <div key={r.id} className="glass-card p-2.5 rounded-lg flex items-center gap-2">
                                    <span className="text-sm text-slate-200 flex-1 min-w-0 truncate">
                                        {r.name ? <span className="text-slate-400">{r.name} · </span> : null}
                                        {ruleLabel(r)}
                                    </span>
                                    <span className="text-sm font-semibold text-emerald-400 whitespace-nowrap">→ {Number(r.percent)}%</span>
                                    <button onClick={() => delRule(r.id)} className="text-slate-500 hover:text-rose-400 p-1">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                            {!rules.length && (
                                <p className="text-xs text-slate-600 px-1">
                                    Nessuna regola. Esempi: un solo paletto → 50%; Mobile + Fisso → 70%; Tutti i paletti → 100%.
                                </p>
                            )}
                        </div>
                        {rules.length > 0 && (
                            <p className="text-[11px] text-slate-500">
                                Se tutte le regole fossero soddisfatte: {Math.min(100, totalPct)}%
                                {totalPct > 100 ? ` (somma ${totalPct}%, tetto 100%)` : ""}
                            </p>
                        )}
                        {/* Nuova regola */}
                        <div className="glass-card p-3 rounded-xl space-y-2.5">
                            <div className="flex flex-wrap gap-2 items-center">
                                <input
                                    value={nName}
                                    onChange={(e) => setNName(e.target.value)}
                                    placeholder="Nome regola (opzionale)"
                                    className="glass-input flex-1 min-w-[140px] py-1.5 text-sm"
                                />
                                <input
                                    type="number"
                                    step="1"
                                    min="1"
                                    max="100"
                                    value={nPct}
                                    onChange={(e) => setNPct(e.target.value)}
                                    placeholder="%"
                                    className="glass-input w-20 py-1.5 text-sm text-center"
                                />
                                <button onClick={addRule} className="primary-btn text-xs px-3 py-1.5 flex items-center gap-1.5">
                                    <Plus className="w-3.5 h-3.5" /> Regola
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-1.5 items-center">
                                <button
                                    onClick={() => setNAll(true)}
                                    className={cn(
                                        "px-2.5 py-1 rounded-lg text-xs transition-colors",
                                        nAll ? "bg-emerald-500/15 text-emerald-300" : "text-slate-400 hover:bg-white/5",
                                    )}
                                >
                                    Tutti i paletti
                                </button>
                                <span className="text-[10px] text-slate-600">oppure</span>
                                {metrics.map((m) => {
                                    const on = !nAll && nMetrics.includes(m.id);
                                    return (
                                        <button
                                            key={m.id}
                                            onClick={() => {
                                                setNAll(false);
                                                setNMetrics((p) => (p.includes(m.id) ? p.filter((x) => x !== m.id) : [...p, m.id]));
                                            }}
                                            className={cn(
                                                "px-2.5 py-1 rounded-lg text-xs transition-colors",
                                                on ? "bg-indigo-500/20 text-indigo-200" : "text-slate-400 hover:bg-white/5",
                                            )}
                                        >
                                            {m.name}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
