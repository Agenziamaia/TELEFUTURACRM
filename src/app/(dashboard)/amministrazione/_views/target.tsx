"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/utils";
import { ROLES, STORE_CATEGORIES, roleLabel } from "@/lib/roles";
import { caricaTabellare, caricaTabellareAzienda } from "@/lib/commissioning";
import {
    Loader2,
    Plus,
    Trash2,
    Pencil,
    Copy,
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
    Globe,
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
    user_stores?: { store_name: string }[];
    user_brands?: { brand: string }[];
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
    // metadati per i filtri (solo personale)
    stores?: string[];
    brands?: string[];
    role?: string;
}

type SubjectType = "user" | "role_grade" | "store" | "store_category";

const SUBS: { id: string; label: string; icon: typeof UserIcon; type: SubjectType | null }[] = [
    { id: "personale", label: "Personale", icon: UserIcon, type: "user" },
    { id: "ruoli", label: "Categoria Risorse", icon: Users, type: "role_grade" },
    { id: "negozi", label: "Negozio", icon: StoreIcon, type: "store" },
    { id: "catnegozi", label: "Categoria Negozio", icon: Tag, type: "store_category" },
    { id: "paletti", label: "Paletti", icon: Flag, type: null },
    // RETE: soggetto unico (tutti i PV insieme), metriche = le piste vere del
    // mese. Non passa da gara/metric: vedi il commento su ReteView.
    { id: "rete", label: "Rete", icon: Globe, type: null },
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
    const [gAction, setGAction] = useState<null | "new" | "rename" | "dup" | "del">(null);
    const [gName, setGName] = useState("");
    const [gBusy, setGBusy] = useState(false);

    const loadBase = useCallback(async () => {
        setLoading(true);
        const [g, m, s, u] = await Promise.all([
            supabase.from("gare").select("id,name,active").order("created_at", { ascending: false }),
            supabase.from("target_metrics").select("id,name").order("sort_order"),
            supabase.from("stores").select("id,name").order("name"),
            supabase.from("app_users").select("id,full_name,role,user_stores(store_name),user_brands(brand)").eq("status", "attivo").order("full_name"),
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
        const name = gName.trim();
        if (!name || gBusy) return;
        setGBusy(true);
        const { data, error } = await supabase.from("gare").insert({ name, active: false }).select("id").single();
        if (!dbError("Creazione gara", error)) {
            notify(`Gara "${name}" creata`, "ok");
            setGAction(null);
            await loadBase();
            if (data?.id) setGaraId(data.id);
        }
        setGBusy(false);
    };

    const renameGara = async () => {
        const name = gName.trim();
        if (!name || !garaId || gBusy) return;
        setGBusy(true);
        const { error } = await supabase.from("gare").update({ name }).eq("id", garaId);
        if (!dbError("Rinomina gara", error)) {
            notify("Gara rinominata ✓", "ok");
            setGAction(null);
            loadBase();
        }
        setGBusy(false);
    };

    // Duplica la gara CON tutto il contenuto: target, paletti e regole di sblocco
    const duplicateGara = async () => {
        const name = gName.trim();
        if (!name || !garaId || gBusy) return;
        setGBusy(true);
        try {
            const { data: g, error } = await supabase.from("gare").insert({ name, active: false }).select("id").single();
            if (dbError("Duplicazione gara", error) || !g) return;
            const { data: ts, error: e2 } = await supabase
                .from("targets")
                .select("metric_id,subject_type,subject_ref,kind,value")
                .eq("gara_id", garaId);
            if (dbError("Lettura target da copiare", e2)) return;
            if (ts?.length) {
                const { error: e3 } = await supabase.from("targets").insert(ts.map((t) => ({ ...t, gara_id: g.id })));
                if (dbError("Copia target", e3)) return;
            }
            const { data: rs, error: e4 } = await supabase
                .from("gara_unlock_rules")
                .select("name,metric_ids,percent,sort_order")
                .eq("gara_id", garaId);
            if (!e4 && rs?.length) {
                const { error: e5 } = await supabase.from("gara_unlock_rules").insert(rs.map((r) => ({ ...r, gara_id: g.id })));
                if (dbError("Copia regole", e5)) return;
            }
            notify(`Gara "${name}" creata come copia ✓`, "ok");
            setGAction(null);
            await loadBase();
            setGaraId(g.id);
        } finally {
            setGBusy(false);
        }
    };

    const deleteGara = async () => {
        if (!garaId || gBusy) return;
        setGBusy(true);
        const { error } = await supabase.from("gare").delete().eq("id", garaId);
        if (!dbError("Eliminazione gara", error)) {
            notify("Gara eliminata", "ok");
            setGAction(null);
            setGaraId("");
            await loadBase();
        }
        setGBusy(false);
    };

    const subjectsFor = useCallback(
        (type: SubjectType): Subject[] => {
            if (type === "user")
                return users.map((u) => ({
                    ref: u.id,
                    label: u.full_name,
                    sub: roleLabel(u.role),
                    stores: (u.user_stores || []).map((s) => s.store_name),
                    brands: (u.user_brands || []).map((b) => b.brand),
                    role: u.role,
                }));
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
    const curGara = gare.find((g) => g.id === garaId);

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
                {gAction === null ? (
                    <>
                        {garaId && (
                            <div className="flex items-center gap-0.5">
                                <button
                                    onClick={() => { setGName(curGara?.name || ""); setGAction("rename"); }}
                                    title="Rinomina gara"
                                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/5"
                                >
                                    <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onClick={() => { setGName(`${curGara?.name || "Gara"} (copia)`); setGAction("dup"); }}
                                    title="Duplica gara (con target, paletti e regole)"
                                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/5"
                                >
                                    <Copy className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onClick={() => setGAction("del")}
                                    title="Elimina gara"
                                    className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-white/5"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}
                        <button
                            onClick={() => { setGName(""); setGAction("new"); }}
                            className="flex items-center gap-1 text-xs text-indigo-300 hover:text-indigo-200"
                        >
                            <Plus className="w-3.5 h-3.5" /> Nuova gara
                        </button>
                    </>
                ) : gAction === "del" ? (
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-rose-300">
                            Eliminare «{curGara?.name}»? Via anche target, paletti e regole.
                        </span>
                        <button
                            onClick={deleteGara}
                            disabled={gBusy}
                            className={cn("px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-500/15 text-rose-300 hover:bg-rose-500/25", gBusy && "opacity-40")}
                        >
                            {gBusy ? "…" : "Elimina"}
                        </button>
                        <button onClick={() => setGAction(null)} className="text-xs text-slate-500 px-1">
                            Annulla
                        </button>
                    </div>
                ) : (
                    <div className="flex gap-2 items-center">
                        <input
                            value={gName}
                            onChange={(e) => setGName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && (gAction === "new" ? createGara() : gAction === "rename" ? renameGara() : duplicateGara())}
                            placeholder="Nome gara (es. Gara Agosto 2026)"
                            className="glass-input w-56 py-1.5 text-sm"
                            autoFocus
                        />
                        <button
                            onClick={gAction === "new" ? createGara : gAction === "rename" ? renameGara : duplicateGara}
                            disabled={gBusy}
                            className={cn("primary-btn text-xs px-3 py-1.5", gBusy && "opacity-40")}
                        >
                            {gBusy ? "…" : gAction === "new" ? "Crea" : gAction === "rename" ? "Salva" : "Crea copia"}
                        </button>
                        <button onClick={() => setGAction(null)} className="text-xs text-slate-500 px-1">
                            Annulla
                        </button>
                    </div>
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

            {active.id === "rete" ? (
                <ReteView />
            ) : !garaId ? (
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
    // selezione multipla: valore comune applicato a tutti i soggetti spuntati
    const [checked, setChecked] = useState<Record<string, boolean>>({});
    const multiRefs = useMemo(() => Object.keys(checked).filter((k) => checked[k]), [checked]);
    const multi = multiRefs.length > 0;

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

    const toggleCheck = (ref: string) => {
        const next = { ...checked, [ref]: !checked[ref] };
        const count = Object.values(next).filter(Boolean).length;
        if (multiRefs.length === 0 && count > 0) setEdit({}); // entra in modalità multipla: si parte puliti
        if (multiRefs.length > 0 && count === 0) setEdit(sel ? { ...(saved[sel] || {}) } : {}); // torna alla singola
        setChecked(next);
    };
    const selectAllFiltered = (subjectRefs: string[]) => {
        if (multiRefs.length === 0) setEdit({});
        setChecked(Object.fromEntries(subjectRefs.map((r) => [r, true])));
    };
    const clearChecks = () => {
        setChecked({});
        setEdit(sel ? { ...(saved[sel] || {}) } : {});
    };

    const dirty = useMemo(() => {
        if (multi) return metrics.some((m) => (edit[m.id] || "").trim());
        if (!sel) return false;
        const base = saved[sel] || {};
        return metrics.some((m) => (edit[m.id] || "") !== (base[m.id] || ""));
    }, [edit, saved, sel, metrics, multi]);

    // Salvataggio multiplo: applica i campi COMPILATI a tutti i selezionati (i vuoti non vengono toccati)
    const saveMulti = async () => {
        if (saving) return;
        const vals = metrics.filter((m) => (edit[m.id] || "").trim());
        if (!vals.length) return;
        setSaving(true);
        const ups = multiRefs.flatMap((ref) =>
            vals.map((m) => ({
                gara_id: garaId,
                metric_id: m.id,
                subject_type: subjectType,
                subject_ref: ref,
                kind,
                value: Number((edit[m.id] || "").trim()),
            })),
        );
        const { error } = await supabase.from("targets").upsert(ups, { onConflict: "gara_id,metric_id,subject_type,subject_ref,kind" });
        if (!dbError("Salvataggio multiplo", error)) {
            const next = { ...saved };
            for (const ref of multiRefs) {
                const cur = { ...(next[ref] || {}) };
                for (const m of vals) cur[m.id] = (edit[m.id] || "").trim();
                next[ref] = cur;
            }
            setSaved(next);
            notify(`Salvato su ${multiRefs.length} soggetti ✓`, "ok");
            setChecked({});
            setEdit(sel ? { ...(next[sel] || {}) } : {});
        }
        setSaving(false);
    };

    const save = async () => {
        if (multi) return saveMulti();
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

    // filtri (attivi solo per il personale): negozio, brand associato, categoria (ruolo)
    const [fStore, setFStore] = useState("");
    const [fBrand, setFBrand] = useState("");
    const [fRole, setFRole] = useState("");
    const storeOptions = useMemo(() => Array.from(new Set(subjects.flatMap((s) => s.stores || []))).sort(), [subjects]);
    const brandOptions = useMemo(() => Array.from(new Set(subjects.flatMap((s) => s.brands || []))).sort(), [subjects]);
    const roleOptions = useMemo(() => ROLES.filter((r) => subjects.some((s) => s.role === r.id)), [subjects]);
    // cambiando filtro si svuota la selezione multipla (mai soggetti selezionati ma nascosti)
    const changeFilter = (setter: (v: string) => void) => (v: string) => {
        if (multi) clearChecks();
        setter(v);
    };

    const filtered = subjects.filter(
        (s) =>
            (!search || s.label.toLowerCase().includes(search.toLowerCase())) &&
            (!fStore || (s.stores || []).includes(fStore)) &&
            (!fBrand || (s.brands || []).includes(fBrand)) &&
            (!fRole || s.role === fRole),
    );
    const selSubject = subjects.find((s) => s.ref === sel);
    const label = kind === "paletto" ? "Paletto (minimo di gara)" : "Target";

    return (
        <div className="grid gap-4 lg:grid-cols-[300px,1fr] items-start">
            {/* Soggetti */}
            <div className="glass-panel p-3 space-y-2">
                {subjectType === "user" && (
                    <div className="space-y-1.5">
                        <select className="glass-input w-full py-1.5 text-xs" value={fStore} onChange={(e) => changeFilter(setFStore)(e.target.value)}>
                            <option value="">Tutti i negozi</option>
                            {storeOptions.map((n) => (
                                <option key={n} value={n}>
                                    {n}
                                </option>
                            ))}
                        </select>
                        <div className="grid grid-cols-2 gap-1.5">
                            <select className="glass-input w-full py-1.5 text-xs" value={fBrand} onChange={(e) => changeFilter(setFBrand)(e.target.value)}>
                                <option value="">Tutti i brand</option>
                                {brandOptions.map((b) => (
                                    <option key={b} value={b}>
                                        {b}
                                    </option>
                                ))}
                            </select>
                            <select className="glass-input w-full py-1.5 text-xs" value={fRole} onChange={(e) => changeFilter(setFRole)(e.target.value)}>
                                <option value="">Tutte le categorie</option>
                                {roleOptions.map((r) => (
                                    <option key={r.id} value={r.id}>
                                        {r.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                )}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                    <input
                        className="glass-input w-full pl-9 py-1.5 text-sm"
                        placeholder="Cerca…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="flex items-center justify-between px-1">
                    <span className="text-[10px] text-slate-500">
                        {multi ? `${multiRefs.length} selezionati` : `${filtered.length} soggetti · spunta per valore comune`}
                    </span>
                    <span className="flex gap-2 shrink-0">
                        <button onClick={() => selectAllFiltered(filtered.map((s) => s.ref))} className="text-[10px] text-indigo-300 hover:text-indigo-200">
                            Tutti
                        </button>
                        {multi && (
                            <button onClick={clearChecks} className="text-[10px] text-slate-400 hover:text-slate-200">
                                Nessuno
                            </button>
                        )}
                    </span>
                </div>
                <div className="space-y-1 max-h-[55vh] overflow-y-auto pr-1">
                    {filtered.map((s) => {
                        const n = Object.keys(saved[s.ref] || {}).length;
                        const on = multi ? !!checked[s.ref] : sel === s.ref;
                        return (
                            <div
                                key={s.ref}
                                className={cn(
                                    "w-full px-2 py-1.5 rounded-lg flex items-center gap-2 transition-colors",
                                    on ? "bg-indigo-500/15" : "hover:bg-white/5",
                                )}
                            >
                                <input
                                    type="checkbox"
                                    checked={!!checked[s.ref]}
                                    onChange={() => toggleCheck(s.ref)}
                                    className="accent-indigo-500 w-3.5 h-3.5 shrink-0 cursor-pointer"
                                />
                                <button onClick={() => (multi ? toggleCheck(s.ref) : pick(s.ref))} className="flex-1 min-w-0 text-left flex items-center gap-2">
                                    <span className="flex-1 min-w-0">
                                        <span className={cn("block text-sm truncate", on ? "text-white" : "text-slate-300")}>{s.label}</span>
                                        {s.sub && <span className="block text-[10px] text-slate-500 truncate">{s.sub}</span>}
                                    </span>
                                    {n > 0 && (
                                        <span className="flex items-center gap-1 text-[10px] text-emerald-400 shrink-0">
                                            <Check className="w-3 h-3" /> {n}
                                        </span>
                                    )}
                                </button>
                            </div>
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
                ) : !selSubject && !multi ? (
                    <p className="text-sm text-slate-500 py-8 text-center">{hint}</p>
                ) : (
                    <>
                        <div className="flex items-center justify-between gap-2">
                            <h4 className="text-white font-semibold truncate">
                                {multi ? `Valore comune → ${multiRefs.length} soggetti` : selSubject!.label}
                            </h4>
                            {dirty && <span className="text-[10px] text-amber-400 whitespace-nowrap">● modifiche non salvate</span>}
                        </div>
                        {multi && (
                            <p className="text-[11px] text-slate-500">
                                I campi compilati vengono applicati a tutti i selezionati; quelli vuoti non vengono toccati.
                            </p>
                        )}
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
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}{" "}
                                {multi ? `Salva su ${multiRefs.length} soggetti` : `Salva ${label.toLowerCase()}`}
                            </button>
                            {dirty && (
                                <button
                                    onClick={() => setEdit(multi ? {} : { ...(saved[sel] || {}) })}
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

/* ================================================================== */
/* TARGET DI RETE (Luca 28/08) — brand × pista × mese                  */
/* Le "metriche" qui non si scrivono a mano: sono le PISTE VERE del    */
/* mese, lette dai tabellari come fa il motore delle gare, più le due  */
/* famiglie che i tabellari non hanno (Fastweb T2 e S4, che contano a  */
/* pezzi). Così il numero che scrivi qui è già agganciato all'anello   */
/* che lo mostrerà in Analisi → Rete: nessuna mappa da tenere allineata */
/* a mano. È per MESE, non per gara: la gara è il contenitore dei premi */
/* ai ragazzi, questo è l'obiettivo dell'azienda sul mese.             */
/* ================================================================== */
const RETE_BRANDS: { id: string; label: string; tab: string | null; lato?: "azienda"; soloPiste?: string[]; colore: string }[] = [
    { id: "w3", label: "WindTre", tab: "windtre", colore: "#f97316" },
    { id: "vf", label: "Vodafone", tab: "vodafone", colore: "#e60000" },
    { id: "sky", label: "Sky", tab: "sky", colore: "#8b5cf6" },
    // Fastweb non ha lato ragazzi: le sue piste stanno sulla lettera T2, lato
    // AZIENDA. E si mostrano solo le quattro volute (niente varianti business).
    { id: "fw", label: "Fastweb T2", tab: "fastweb", lato: "azienda", soloPiste: ["mobile", "fisso", "luce", "gas"], colore: "#eab308" },
    { id: "s4", label: "S4 Energia", tab: null, colore: "#22c55e" },
];
// le piste che NON vengono da un tabellare: contano a pezzi
const RETE_PISTE_FISSE: Record<string, { chiave: string; nome: string }[]> = {
    // S4: luce e gas fanno UN punteggio solo, e la soglia è sulla somma
    s4: [{ chiave: "energia", nome: "Luce & Gas" }],
};
interface PistaRete { brand: string; label: string; colore: string; chiave: string; nome: string; unita: string; soglie: { tier: number; da: number }[] }
const primoDelMese = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;

const arrota = (v: number) => Math.round(v * 100) / 100;
const fmtIt = (v: number) => {
    const n = Math.round(Number(v) * 100) / 100;
    const [i, d] = String(Math.abs(n)).split(".");
    return (n < 0 ? "-" : "") + i.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (d ? "," + d : "");
};

function ReteView() {
    const [mese, setMese] = useState(primoDelMese());
    const [piste, setPiste] = useState<PistaRete[]>([]);
    // le somme dei target direzione per pista, e lo SFRIDO per operatore:
    // clicchi una soglia della lettera e il target di rete esce da solo
    const [somme, setSomme] = useState<Record<string, number>>({});
    const [sfridi, setSfridi] = useState<Record<string, string>>({});
    const [sfridiIni, setSfridiIni] = useState("");
    const [val, setVal] = useState<Record<string, string>>({});
    const [iniziale, setIniziale] = useState<Record<string, string>>({});
    // KPI IMPORTANTI e soglia di allarme (Luca 28/08). Non stanno in
    // `target_rete` perché quello è per MESE: «questo KPI è importante» è una
    // scelta stabile, rifarla ogni mese sarebbe una tassa. Vivono in una riga
    // condivisa, valida per tutta l'azienda come la disposizione della pagina.
    const [imp, setImp] = useState<Set<string>>(new Set());
    const [impIni, setImpIni] = useState<string>("");
    const [alertPct, setAlertPct] = useState("85");
    const [alertIni, setAlertIni] = useState("85");
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const sfrido = (b: string) => Number(String(sfridi[b] ?? "").replace(",", ".")) || 0;

    useEffect(() => {
        let vivo = true;
        (async () => {
            setLoading(true);
            const out: PistaRete[] = [];
            for (const b of RETE_BRANDS) {
                if (b.tab) {
                    // LE STESSE PISTE E LE STESSE SOGLIE CHE MOSTRA L'ANALISI.
                    // Prima si univano i due lati del tabellare e si finiva per
                    // poter dare un target a piste che nella Rete non compaiono
                    // (Business P.IVA, Bonus Completezza): un numero salvato e
                    // mai visto da nessuno. La fonte è una sola: quella che
                    // disegna l'anello — ragazzi per W3/VF/Sky, la lettera T2
                    // per Fastweb, che un lato ragazzi non ce l'ha.
                    const t = await (b.lato === "azienda" ? caricaTabellareAzienda(b.tab, mese) : caricaTabellare(b.tab, mese)).catch(() => null);
                    for (const p of (t?.piste || [])) {
                        if (b.soloPiste && !b.soloPiste.includes(p.chiave)) continue;
                        out.push({
                            brand: b.id, label: b.label, colore: b.colore, chiave: p.chiave, nome: p.nome, unita: "punti",
                            soglie: (t?.soglie || []).filter((x: { pista: string; soglia_da: number }) => x.pista === p.chiave)
                                .map((x: { tier: number; soglia_da: number }) => ({ tier: x.tier, da: Number(x.soglia_da) }))
                                .filter((x) => x.da > 0).sort((a, b2) => a.tier - b2.tier),
                        });
                    }
                }
                for (const p of (RETE_PISTE_FISSE[b.id] || [])) {
                    const t = b.id === "s4" ? await caricaTabellareAzienda("s4", mese).catch(() => null) : null;
                    out.push({
                        brand: b.id, label: b.label, colore: b.colore, chiave: p.chiave, nome: p.nome, unita: "pezzi",
                        soglie: (t?.soglie || []).filter((x: { pista: string }) => x.pista === "energia_consumer")
                            .map((x: { tier: number; soglia_da: number }) => ({ tier: x.tier, da: Number(x.soglia_da) }))
                            .filter((x) => x.da > 0).sort((a, b2) => a.tier - b2.tier),
                    });
                }
            }
            const [{ data }, kpi, dir] = await Promise.all([
                supabase.from("target_rete").select("brand, pista, target").eq("month", mese),
                supabase.from("layout_condiviso").select("valore").eq("chiave", "rete_kpi").maybeSingle(),
                // i target che la DIREZIONE ha già dato per codice di
                // inserimento: sommati per pista sono il target della rete —
                // è così che nasce la Customer Base di WindTre, «la somma delle
                // Partnership al 100% più lo sfrido» (Luca)
                supabase.from("direzione_targets").select("brand, pista, target").eq("month", mese),
            ]);
            if (!vivo) return;
            const sd: Record<string, number> = {};
            const IDDIR: Record<string, string> = { w3: "windtre", vf: "vodafone", fw: "fastweb", sky: "sky" };
            for (const r of ((dir.data || []) as { brand: string; pista: string; target: number }[])) {
                const bid = Object.keys(IDDIR).find((k) => IDDIR[k] === r.brand);
                if (!bid) continue;
                const k = `${bid}|${r.pista}`;
                sd[k] = (sd[k] || 0) + (Number(r.target) || 0);
            }
            setSomme(sd);
            const v0 = (kpi.data?.valore || {}) as { importanti?: string[]; alertPct?: number; sfridi?: Record<string, string> };
            const setImp0 = new Set<string>(Array.isArray(v0.importanti) ? v0.importanti : []);
            setImp(setImp0); setImpIni([...setImp0].sort().join(","));
            const p0 = String(v0.alertPct ?? 85);
            setAlertPct(p0); setAlertIni(p0);
            const sf = (v0.sfridi || {}) as Record<string, string>;
            setSfridi(sf); setSfridiIni(JSON.stringify(sf));
            const m: Record<string, string> = {};
            for (const r of (data || []) as { brand: string; pista: string; target: number }[]) {
                if (Number(r.target) > 0) m[`${r.brand}|${r.pista}`] = String(r.target);
            }
            setPiste(out); setVal(m); setIniziale(m); setLoading(false);
        })();
        return () => { vivo = false; };
    }, [mese]);

    const sporco = useMemo(() => {
        const chiavi = new Set([...Object.keys(val), ...Object.keys(iniziale)]);
        if ([...chiavi].some((k) => (val[k] || "") !== (iniziale[k] || ""))) return true;
        return [...imp].sort().join(",") !== impIni || alertPct !== alertIni || JSON.stringify(sfridi) !== sfridiIni;
    }, [val, iniziale, imp, impIni, alertPct, alertIni, sfridi, sfridiIni]);

    const salva = async () => {
        setBusy(true);
        const ups: { brand: string; pista: string; month: string; target: number; unita: string }[] = [];
        const via: { brand: string; pista: string }[] = [];
        for (const p of piste) {
            const k = `${p.brand}|${p.chiave}`;
            const n = Number(String(val[k] ?? "").replace(",", "."));
            if (n > 0) ups.push({ brand: p.brand, pista: p.chiave, month: mese, target: Math.round(n * 100) / 100, unita: p.unita });
            else if (iniziale[k]) via.push({ brand: p.brand, pista: p.chiave });
        }
        if (ups.length) {
            const { error } = await supabase.from("target_rete").upsert(ups, { onConflict: "brand,pista,month" });
            if (dbError("Salvataggio target di rete", error)) { setBusy(false); return; }
        }
        for (const d of via) {
            const { error } = await supabase.from("target_rete").delete().eq("brand", d.brand).eq("pista", d.pista).eq("month", mese);
            if (dbError("Rimozione target", error)) { setBusy(false); return; }
        }
        const pct = Math.max(1, Math.min(200, Number(String(alertPct).replace(",", ".")) || 85));
        {
            const { error } = await supabase.from("layout_condiviso").upsert({
                chiave: "rete_kpi", valore: { importanti: [...imp], alertPct: pct, sfridi },
                updated_at: new Date().toISOString(),
            }, { onConflict: "chiave" });
            if (dbError("Salvataggio KPI importanti", error)) { setBusy(false); return; }
        }
        setImpIni([...imp].sort().join(",")); setAlertPct(String(pct)); setAlertIni(String(pct)); setSfridiIni(JSON.stringify(sfridi));
        notify(`Target di rete salvati ✓ (${ups.length} pist${ups.length === 1 ? "a" : "e"}, ${imp.size} KPI in evidenza)`, "ok");
        setIniziale(Object.fromEntries(Object.entries(val).filter(([, v]) => String(v).trim() !== "")));
        setBusy(false);
    };

    const perBrand = RETE_BRANDS.map((b) => ({ b, righe: piste.filter((p) => p.brand === b.id) })).filter((x) => x.righe.length);

    return (
        <div className="space-y-4">
            <div className="glass-card rounded-xl p-3 flex flex-wrap items-center gap-3">
                <span className="text-xs text-slate-400">Mese</span>
                <input type="month" value={mese.slice(0, 7)} onChange={(e) => setMese(`${e.target.value}-01`)}
                    className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white" />
                <span className="text-[11px] text-slate-600">
                    I target di rete sono <b className="text-slate-400">per mese</b>, non per gara: le piste sono quelle vere del tabellare.
                    Lascia vuoto per non avere target su quella pista.
                </span>
                <label className="flex items-center gap-2 text-[11px] text-slate-400 border-l border-white/10 pl-3">
                    ⭐ <span>in evidenza: lampeggia sotto il</span>
                    <input inputMode="decimal" value={alertPct} onChange={(e) => setAlertPct(e.target.value.replace(/[^\d.,]/g, ""))}
                        className="w-14 bg-white/5 border border-white/10 rounded-md px-2 py-1 text-sm text-white text-right tabular-nums" />
                    <span>% del target</span>
                </label>
                <button onClick={salva} disabled={!sporco || busy}
                    className={cn("primary-btn text-xs px-3 py-1.5 ml-auto inline-flex items-center gap-1.5", (!sporco || busy) && "opacity-40")}>
                    <Save className="w-3.5 h-3.5" /> {busy ? "Salvo…" : "Salva"}
                </button>
            </div>

            {loading ? (
                <p className="text-sm text-slate-500 px-1 inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Leggo i tabellari del mese…</p>
            ) : !perBrand.length ? (
                <p className="text-sm text-slate-500 px-1">Nessun tabellare per questo mese: carica i tabellari e torna qui.</p>
            ) : perBrand.map(({ b, righe }) => (
                <div key={b.id} className="glass-card rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-3 flex-wrap">
                        <p className="text-xs font-black" style={{ color: b.colore }}>{b.label}</p>
                        <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
                            sfrido
                            <input inputMode="decimal" value={sfridi[b.id] ?? ""} placeholder="0"
                                onChange={(e) => setSfridi((v) => ({ ...v, [b.id]: e.target.value.replace(/[^\d.,]/g, "") }))}
                                className="w-12 bg-white/5 border border-white/10 rounded-md px-1.5 py-0.5 text-xs text-white text-right tabular-nums" />
                            %
                        </label>
                        <span className="text-[10px] text-slate-600">clicca una soglia: il target esce da solo, soglia + sfrido</span>
                    </div>
                    <div className="grid gap-2">
                        {righe.map((p) => {
                            const k = `${p.brand}|${p.chiave}`;
                            return (
                                <label key={k} className={cn("flex items-center gap-2 border rounded-lg px-3 py-2",
                                    imp.has(k) ? "bg-amber-400/[0.07] border-amber-400/30" : "bg-white/[0.03] border-white/10")}>
                                    {/* ⭐ = KPI in evidenza: nell'Analisi avrà l'aura attorno all'anello */}
                                    <button type="button" title={imp.has(k) ? "Togli dall'evidenza" : "Metti in evidenza"}
                                        onClick={(e) => { e.preventDefault(); setImp((v) => { const n = new Set(v); if (n.has(k)) n.delete(k); else n.add(k); return n; }); }}
                                        className={cn("text-sm leading-none transition-opacity", imp.has(k) ? "opacity-100" : "opacity-25 hover:opacity-60")}>⭐</button>
                                    <span className="text-xs text-slate-300 truncate shrink-0 w-32">{p.nome}</span>
                                    {/* LE SOGLIE DELLA LETTERA, a sinistra del campo: si clicca e il
                                        target esce da solo, soglia + sfrido. Sono i numeri veri del
                                        tabellare del mese — caricata la nuova lettera, sono già qui. */}
                                    <span className="flex-1 flex flex-wrap items-center gap-1 min-w-0">
                                        {p.soglie.map((sg) => {
                                            const v = arrota(sg.da * (1 + sfrido(p.brand) / 100));
                                            const on = (val[k] || "") === String(v);
                                            return (
                                                <button key={sg.tier} type="button" title={`Soglia ${sg.tier} (${fmtIt(sg.da)}) + ${sfrido(p.brand)}% di sfrido = ${fmtIt(v)}`}
                                                    onClick={(e) => { e.preventDefault(); setVal((x) => ({ ...x, [k]: String(v) })); }}
                                                    className={cn("px-1.5 py-0.5 rounded-md text-[10px] font-bold tabular-nums border transition-colors",
                                                        on ? "text-white border-white/30" : "text-slate-400 border-white/10 bg-white/[0.03] hover:bg-white/10")}
                                                    style={on ? { background: `${p.colore}cc` } : undefined}>
                                                    S{sg.tier}·{fmtIt(sg.da)}
                                                </button>
                                            );
                                        })}
                                        {somme[k] > 0 && (() => {
                                            const v = arrota(somme[k] * (1 + sfrido(p.brand) / 100));
                                            const on = (val[k] || "") === String(v);
                                            return (
                                                <button type="button" title={`Somma dei target che la direzione ha dato per codice (${fmtIt(somme[k])}) + ${sfrido(p.brand)}% di sfrido`}
                                                    onClick={(e) => { e.preventDefault(); setVal((x) => ({ ...x, [k]: String(v) })); }}
                                                    className={cn("px-1.5 py-0.5 rounded-md text-[10px] font-bold tabular-nums border transition-colors",
                                                        on ? "text-white bg-emerald-500/70 border-white/30" : "text-emerald-300/80 border-emerald-400/25 bg-emerald-400/5 hover:bg-emerald-400/15")}>
                                                    Σ direzione · {fmtIt(somme[k])}
                                                </button>
                                            );
                                        })()}
                                        {!p.soglie.length && !somme[k] && <span className="text-[10px] text-slate-700">nessuna soglia in lettera</span>}
                                    </span>
                                    <input inputMode="decimal" value={val[k] ?? ""} placeholder="—"
                                        onChange={(e) => setVal((v) => ({ ...v, [k]: e.target.value.replace(/[^\d.,]/g, "") }))}
                                        className="w-24 shrink-0 bg-white/5 border border-white/10 rounded-md px-2 py-1 text-sm text-white text-right tabular-nums" />
                                    <span className="text-[10px] text-slate-600 w-6 shrink-0">{p.unita === "pezzi" ? "pz" : "pt"}</span>
                                </label>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}
