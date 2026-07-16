"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import {
    ROLES,
    AREAS,
    BRANDS,
    getRole,
    roleLabel,
    gradesFor,
    gradeLabel,
    areaOf,
    areaLabel,
    type Area,
} from "@/lib/roles";
import {
    Shield,
    Users,
    Store as StoreIcon,
    Plus,
    Search,
    X,
    Pencil,
    FileText,
    ClipboardList,
    CalendarClock,
    Phone,
    Building2,
    Tag,
    Circle,
    Loader2,
    AlertTriangle,
    UserPlus,
    Check,
} from "lucide-react";

/* ---------- Tipi ---------- */
interface AppUser {
    id: string;
    full_name: string;
    match_name: string | null;
    email: string | null;
    phone: string | null;
    role: string;
    grade: string | null;
    primary_store: string | null;
    active: boolean;
    hire_date: string | null;
    note: string | null;
    user_stores?: { store_name: string }[];
    user_brands?: { brand: string }[];
}

interface Store {
    id: string;
    name: string;
    code: string | null;
    company: string | null;
    active: boolean;
}

const EMPTY_USER: Partial<AppUser> & { stores: string[]; brands: string[] } = {
    full_name: "",
    match_name: "",
    email: "",
    phone: "",
    role: "venditore",
    grade: "apprendista",
    active: true,
    hire_date: "",
    note: "",
    stores: [],
    brands: [],
};

/* ================================================================== */

export default function AmministrazionePage() {
    const { user } = useAuth();
    const [tab, setTab] = useState<"utenti" | "negozi">("utenti");
    const [users, setUsers] = useState<AppUser[]>([]);
    const [stores, setStores] = useState<Store[]>([]);
    const [loading, setLoading] = useState(true);
    const [tableMissing, setTableMissing] = useState(false);

    // filtri utenti
    const [search, setSearch] = useState("");
    const [fArea, setFArea] = useState("");
    const [fRole, setFRole] = useState("");
    const [fStatus, setFStatus] = useState("");

    // modale utente
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState<AppUser | null>(null);

    // scheda attività
    const [detail, setDetail] = useState<AppUser | null>(null);

    const isTableMissing = (err: { message?: string; code?: string } | null) =>
        !!err && ((err.message || "").includes("schema cache") || err.code === "42P01");

    const fetchAll = useCallback(async () => {
        setLoading(true);
        const { data: u, error: uErr } = await supabase
            .from("app_users")
            .select("*, user_stores(store_name), user_brands(brand)")
            .order("full_name");
        if (isTableMissing(uErr)) {
            setTableMissing(true);
            setLoading(false);
            return;
        }
        setTableMissing(false);
        setUsers((u as AppUser[]) || []);
        const { data: s } = await supabase.from("stores").select("*").order("name");
        setStores((s as Store[]) || []);
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    const filteredUsers = useMemo(() => {
        return users.filter((u) => {
            if (fArea && areaOf(u.role) !== fArea) return false;
            if (fRole && u.role !== fRole) return false;
            if (fStatus === "attivi" && !u.active) return false;
            if (fStatus === "disattivi" && u.active) return false;
            if (search) {
                const q = search.toLowerCase();
                const hay = `${u.full_name} ${u.email || ""} ${roleLabel(u.role)} ${(u.user_stores || [])
                    .map((s) => s.store_name)
                    .join(" ")}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }, [users, fArea, fRole, fStatus, search]);

    // raggruppa per area per la vista
    const grouped = useMemo(() => {
        const map: Record<string, AppUser[]> = {};
        for (const u of filteredUsers) {
            const a = areaOf(u.role) || "sede";
            (map[a] = map[a] || []).push(u);
        }
        return map;
    }, [filteredUsers]);

    if (user && user.role !== "admin") {
        return (
            <div className="glass-panel p-10 text-center max-w-lg mx-auto mt-10">
                <Shield className="w-10 h-10 text-rose-400 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-white">Accesso riservato</h2>
                <p className="text-slate-400 mt-2">Solo l&apos;Admin può accedere all&apos;Amministrazione.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Shield className="w-6 h-6 text-indigo-400" /> Amministrazione
                    </h1>
                    <p className="text-slate-400 text-sm mt-1">
                        Gestione utenti, ruoli, negozi e attività della piattaforma.
                    </p>
                </div>
                {tab === "utenti" && !tableMissing && (
                    <button
                        onClick={() => {
                            setEditing(null);
                            setShowForm(true);
                        }}
                        className="primary-btn flex items-center gap-2 justify-center"
                    >
                        <UserPlus className="w-4 h-4" /> Nuovo Utente
                    </button>
                )}
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-white/10">
                {[
                    { id: "utenti", label: "Utenti", icon: Users },
                    { id: "negozi", label: "Negozi", icon: StoreIcon },
                ].map((t) => {
                    const Icon = t.icon;
                    return (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id as "utenti" | "negozi")}
                            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                                tab === t.id
                                    ? "border-indigo-500 text-white"
                                    : "border-transparent text-slate-400 hover:text-slate-200"
                            }`}
                        >
                            <Icon className="w-4 h-4" /> {t.label}
                        </button>
                    );
                })}
            </div>

            {tableMissing && <TableMissingBanner />}

            {loading ? (
                <div className="flex items-center justify-center py-20 text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin" />
                </div>
            ) : tableMissing ? null : tab === "utenti" ? (
                <>
                    {/* Filtri */}
                    <div className="glass-panel p-4 flex flex-wrap gap-3 items-center">
                        <div className="relative flex-1 min-w-[220px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            <input
                                className="glass-input w-full pl-10"
                                placeholder="Cerca nome, email, negozio…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <select className="glass-input w-auto" value={fArea} onChange={(e) => setFArea(e.target.value)}>
                            <option value="">Tutte le aree</option>
                            {AREAS.map((a) => (
                                <option key={a.id} value={a.id}>
                                    {a.label}
                                </option>
                            ))}
                        </select>
                        <select className="glass-input w-auto" value={fRole} onChange={(e) => setFRole(e.target.value)}>
                            <option value="">Tutti i ruoli</option>
                            {ROLES.map((r) => (
                                <option key={r.id} value={r.id}>
                                    {r.label}
                                </option>
                            ))}
                        </select>
                        <select
                            className="glass-input w-auto"
                            value={fStatus}
                            onChange={(e) => setFStatus(e.target.value)}
                        >
                            <option value="">Tutti</option>
                            <option value="attivi">Attivi</option>
                            <option value="disattivi">Disattivati</option>
                        </select>
                        <span className="text-xs text-slate-500 ml-auto">
                            {filteredUsers.length} utenti
                        </span>
                    </div>

                    {/* Lista utenti per area */}
                    {filteredUsers.length === 0 ? (
                        <div className="glass-panel p-10 text-center text-slate-400">
                            Nessun utente. Clicca <span className="text-white font-medium">Nuovo Utente</span> per crearne uno.
                        </div>
                    ) : (
                        AREAS.filter((a) => grouped[a.id]?.length).map((a) => (
                            <div key={a.id} className="space-y-2">
                                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 px-1">
                                    {a.label} · {grouped[a.id].length}
                                </h3>
                                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                    {grouped[a.id].map((u) => (
                                        <UserCard
                                            key={u.id}
                                            u={u}
                                            onOpen={() => setDetail(u)}
                                            onEdit={() => {
                                                setEditing(u);
                                                setShowForm(true);
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))
                    )}
                </>
            ) : (
                <StoresView stores={stores} />
            )}

            {showForm && (
                <UserForm
                    editing={editing}
                    stores={stores}
                    onClose={() => setShowForm(false)}
                    onSaved={() => {
                        setShowForm(false);
                        fetchAll();
                    }}
                />
            )}

            {detail && <UserDetail u={detail} onClose={() => setDetail(null)} />}
        </div>
    );
}

/* ================================================================== */
/* Banner tabella mancante                                             */
/* ================================================================== */
function TableMissingBanner() {
    return (
        <div className="glass-panel p-6 border border-amber-500/30">
            <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                    <h3 className="text-white font-semibold">Database non ancora inizializzato</h3>
                    <p className="text-slate-400 text-sm mt-1">
                        Le tabelle <code className="text-amber-300">app_users</code>,{" "}
                        <code className="text-amber-300">stores</code> e le associazioni non esistono ancora. Esegui la
                        migrazione{" "}
                        <code className="text-amber-300">scripts/supabase/027_admin_users_stores.sql</code> nel pannello
                        SQL di Supabase, poi ricarica la pagina.
                    </p>
                </div>
            </div>
        </div>
    );
}

/* ================================================================== */
/* Card utente                                                         */
/* ================================================================== */
function UserCard({ u, onOpen, onEdit }: { u: AppUser; onOpen: () => void; onEdit: () => void }) {
    const initials = u.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    const negozi = (u.user_stores || []).map((s) => s.store_name);
    return (
        <div className="glass-card p-4 rounded-xl group cursor-pointer" onClick={onOpen}>
            <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-500/20 text-indigo-300 font-bold border-2 border-indigo-500/40 flex items-center justify-center shrink-0">
                    {initials || "?"}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <p className="text-white font-medium truncate">{u.full_name}</p>
                        {!u.active && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400 border border-rose-500/20">
                                disattivo
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-indigo-300 mt-0.5">
                        {roleLabel(u.role)}
                        {u.grade ? ` · ${gradeLabel(u.role, u.grade)}` : ""}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                        {negozi.slice(0, 3).map((n) => (
                            <span
                                key={n}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-300 border border-white/10"
                            >
                                {n}
                            </span>
                        ))}
                        {negozi.length > 3 && (
                            <span className="text-[10px] px-1.5 py-0.5 text-slate-500">+{negozi.length - 3}</span>
                        )}
                    </div>
                </div>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onEdit();
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
                    title="Modifica"
                >
                    <Pencil className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}

/* ================================================================== */
/* Form crea/modifica utente                                           */
/* ================================================================== */
function UserForm({
    editing,
    stores,
    onClose,
    onSaved,
}: {
    editing: AppUser | null;
    stores: Store[];
    onClose: () => void;
    onSaved: () => void;
}) {
    const [f, setF] = useState(() => {
        if (!editing) return { ...EMPTY_USER };
        return {
            ...editing,
            stores: (editing.user_stores || []).map((s) => s.store_name),
            brands: (editing.user_brands || []).map((b) => b.brand),
        } as typeof EMPTY_USER & AppUser;
    });
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState("");

    const grades = gradesFor(f.role || "");

    const set = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }));

    const toggleIn = (key: "stores" | "brands", val: string) =>
        setF((p) => {
            const arr = (p[key] as string[]) || [];
            return { ...p, [key]: arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val] };
        });

    const onRoleChange = (role: string) => {
        const g = gradesFor(role);
        setF((p) => ({ ...p, role, grade: g.length ? g[0].id : null }));
    };

    const save = async () => {
        if (!f.full_name?.trim()) {
            setErr("Il nome è obbligatorio.");
            return;
        }
        setSaving(true);
        setErr("");
        const payload = {
            full_name: f.full_name.trim(),
            match_name: (f.match_name || f.full_name).trim(),
            email: f.email?.trim() || null,
            phone: f.phone?.trim() || null,
            role: f.role,
            grade: grades.length ? f.grade : null,
            primary_store: (f.stores as string[])[0] || null,
            active: f.active ?? true,
            hire_date: f.hire_date || null,
            note: f.note?.trim() || null,
        };

        let userId = editing?.id;
        if (editing) {
            const { error } = await supabase.from("app_users").update(payload).eq("id", editing.id);
            if (error) {
                setErr(error.message);
                setSaving(false);
                return;
            }
        } else {
            const { data, error } = await supabase.from("app_users").insert(payload).select("id").single();
            if (error) {
                setErr(error.message);
                setSaving(false);
                return;
            }
            userId = data.id;
        }

        // riscrivi associazioni
        await supabase.from("user_stores").delete().eq("user_id", userId);
        await supabase.from("user_brands").delete().eq("user_id", userId);
        const st = (f.stores as string[]) || [];
        const br = (f.brands as string[]) || [];
        if (st.length)
            await supabase.from("user_stores").insert(st.map((store_name) => ({ user_id: userId, store_name })));
        if (br.length) await supabase.from("user_brands").insert(br.map((brand) => ({ user_id: userId, brand })));

        setSaving(false);
        onSaved();
    };

    return (
        <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="glass-panel w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-bold text-white">{editing ? "Modifica utente" : "Nuovo utente"}</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {err && (
                    <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm">
                        {err}
                    </div>
                )}

                <div className="space-y-5">
                    {/* Dati anagrafici */}
                    <div className="grid sm:grid-cols-2 gap-3">
                        <Field label="Nome e cognome *">
                            <input className="glass-input w-full" value={f.full_name || ""} onChange={(e) => set("full_name", e.target.value)} />
                        </Field>
                        <Field label="Email (per il login)">
                            <input className="glass-input w-full" value={f.email || ""} onChange={(e) => set("email", e.target.value)} />
                        </Field>
                        <Field label="Telefono">
                            <input className="glass-input w-full" value={f.phone || ""} onChange={(e) => set("phone", e.target.value)} />
                        </Field>
                        <Field label="Data assunzione">
                            <input type="date" className="glass-input w-full" value={f.hire_date || ""} onChange={(e) => set("hire_date", e.target.value)} />
                        </Field>
                    </div>

                    {/* Inquadramento */}
                    <div className="grid sm:grid-cols-2 gap-3">
                        <Field label="Ruolo (Livello 1)">
                            <select className="glass-input w-full" value={f.role} onChange={(e) => onRoleChange(e.target.value)}>
                                {AREAS.map((a) => (
                                    <optgroup key={a.id} label={a.label}>
                                        {ROLES.filter((r) => r.area === a.id).map((r) => (
                                            <option key={r.id} value={r.id}>
                                                {r.label}
                                            </option>
                                        ))}
                                    </optgroup>
                                ))}
                            </select>
                        </Field>
                        {grades.length > 0 && (
                            <Field label="Grado (Livello 2)">
                                <select className="glass-input w-full" value={f.grade || ""} onChange={(e) => set("grade", e.target.value)}>
                                    {grades.map((g) => (
                                        <option key={g.id} value={g.id}>
                                            {g.label}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                        )}
                    </div>

                    {/* Negozi */}
                    <Field label="Negozi associati">
                        <div className="flex flex-wrap gap-2">
                            {stores.map((s) => {
                                const on = (f.stores as string[]).includes(s.name);
                                return (
                                    <button
                                        key={s.id}
                                        type="button"
                                        onClick={() => toggleIn("stores", s.name)}
                                        className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                                            on
                                                ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-200"
                                                : "bg-white/5 border-white/10 text-slate-400 hover:text-slate-200"
                                        }`}
                                    >
                                        {on && <Check className="w-3 h-3 inline mr-1" />}
                                        {s.name}
                                    </button>
                                );
                            })}
                            {stores.length === 0 && <span className="text-xs text-slate-500">Nessun negozio in anagrafica.</span>}
                        </div>
                    </Field>

                    {/* Brand */}
                    <Field label="Brand abilitati">
                        <div className="flex flex-wrap gap-2">
                            {BRANDS.map((b) => {
                                const on = (f.brands as string[]).includes(b);
                                return (
                                    <button
                                        key={b}
                                        type="button"
                                        onClick={() => toggleIn("brands", b)}
                                        className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                                            on
                                                ? "bg-violet-500/20 border-violet-500/40 text-violet-200"
                                                : "bg-white/5 border-white/10 text-slate-400 hover:text-slate-200"
                                        }`}
                                    >
                                        {on && <Check className="w-3 h-3 inline mr-1" />}
                                        {b}
                                    </button>
                                );
                            })}
                        </div>
                    </Field>

                    <div className="flex items-center justify-between pt-2 border-t border-white/10">
                        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                            <input type="checkbox" checked={f.active ?? true} onChange={(e) => set("active", e.target.checked)} className="accent-indigo-500 w-4 h-4" />
                            Utente attivo
                        </label>
                        <div className="flex gap-2">
                            <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-slate-300 hover:bg-white/5 text-sm">
                                Annulla
                            </button>
                            <button onClick={save} disabled={saving} className="primary-btn flex items-center gap-2">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                Salva
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>
            {children}
        </div>
    );
}

/* ================================================================== */
/* Scheda attività 360°                                                */
/* ================================================================== */
interface Activity {
    contracts: { id: string; brand: string; categoria: string; prodotto: string; stato: string; negozio: string; data_registrazione: string; created_at: string }[];
    shifts: { id: string; store: string; started_at: string; ended_at: string | null }[];
    vacations: { id: string; date_from: string; date_to: string; status: string; reason: string }[];
    calls: { id: string; stato: string; brand: string; data_chiamata: string }[];
    appointments: { id: string; date: string; status: string; customer_name: string; store: string }[];
}

function UserDetail({ u, onClose }: { u: AppUser; onClose: () => void }) {
    const matchName = u.match_name || u.full_name;
    const area = areaOf(u.role);
    const [act, setAct] = useState<Activity | null>(null);
    const [loading, setLoading] = useState(true);
    const [subtab, setSubtab] = useState<"panoramica" | "contratti" | "pratiche" | "presenze" | "cc">("panoramica");

    useEffect(() => {
        (async () => {
            setLoading(true);
            const [c, sh, va, ca, ap] = await Promise.all([
                supabase
                    .from("contracts")
                    .select("id, brand, categoria, prodotto, stato, negozio, data_registrazione, created_at")
                    .eq("venditore", matchName)
                    .order("created_at", { ascending: false })
                    .limit(100),
                supabase.from("shifts").select("id, store, started_at, ended_at").eq("employee_name", matchName).order("started_at", { ascending: false }).limit(50),
                supabase.from("vacation_requests").select("id, date_from, date_to, status, reason").eq("employee_name", matchName).order("date_from", { ascending: false }).limit(50),
                area === "cc" ? supabase.from("calls").select("id, stato, brand, data_chiamata").eq("caller", matchName).order("data_chiamata", { ascending: false }).limit(100) : Promise.resolve({ data: [] }),
                area === "cc" || area === "ob"
                    ? supabase.from("appointments").select("id, date, status, customer_name, store").eq("agente", matchName).order("date", { ascending: false }).limit(100)
                    : Promise.resolve({ data: [] }),
            ]);
            setAct({
                contracts: (c.data as Activity["contracts"]) || [],
                shifts: (sh.data as Activity["shifts"]) || [],
                vacations: (va.data as Activity["vacations"]) || [],
                calls: (ca.data as Activity["calls"]) || [],
                appointments: (ap.data as Activity["appointments"]) || [],
            });
            setLoading(false);
        })();
    }, [matchName, area]);

    const negozi = (u.user_stores || []).map((s) => s.store_name);
    const brands = (u.user_brands || []).map((b) => b.brand);

    const kpis = act
        ? [
              { label: "Contratti", value: act.contracts.length, icon: FileText },
              { label: "Turni", value: act.shifts.length, icon: CalendarClock },
              ...(area === "cc" ? [{ label: "Chiamate", value: act.calls.length, icon: Phone }] : []),
              ...(area === "cc" || area === "ob" ? [{ label: "Appuntamenti", value: act.appointments.length, icon: ClipboardList }] : []),
          ]
        : [];

    const subtabs = [
        { id: "panoramica", label: "Panoramica" },
        { id: "contratti", label: "Contratti" },
        { id: "pratiche", label: "Pratiche" },
        { id: "presenze", label: "Presenze e ferie" },
        ...(area === "cc" || area === "ob" ? [{ id: "cc", label: "Call / Appuntamenti" }] : []),
    ];

    return (
        <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex justify-end">
            <div className="w-full max-w-2xl bg-[#0f111a] border-l border-white/10 h-full overflow-y-auto animate-in slide-in-from-right duration-200">
                {/* header */}
                <div className="sticky top-0 bg-[#0f111a]/95 backdrop-blur-xl border-b border-white/10 p-5 z-10">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-indigo-500/20 text-indigo-300 font-bold border-2 border-indigo-500/40 flex items-center justify-center">
                                {u.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-white">{u.full_name}</h2>
                                <p className="text-sm text-indigo-300">
                                    {roleLabel(u.role)}
                                    {u.grade ? ` · ${gradeLabel(u.role, u.grade)}` : ""} · {areaLabel(area || "sede")}
                                </p>
                            </div>
                        </div>
                        <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    {/* associazioni */}
                    <div className="flex flex-wrap gap-2 mt-3">
                        {u.email && (
                            <span className="text-xs px-2 py-1 rounded bg-white/5 border border-white/10 text-slate-300">{u.email}</span>
                        )}
                        {negozi.map((n) => (
                            <span key={n} className="text-xs px-2 py-1 rounded bg-white/5 border border-white/10 text-slate-300 flex items-center gap-1">
                                <Building2 className="w-3 h-3" /> {n}
                            </span>
                        ))}
                        {brands.map((b) => (
                            <span key={b} className="text-xs px-2 py-1 rounded bg-violet-500/10 border border-violet-500/20 text-violet-300 flex items-center gap-1">
                                <Tag className="w-3 h-3" /> {b}
                            </span>
                        ))}
                    </div>
                    {/* subtabs */}
                    <div className="flex gap-1 mt-4 overflow-x-auto">
                        {subtabs.map((s) => (
                            <button
                                key={s.id}
                                onClick={() => setSubtab(s.id as typeof subtab)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                                    subtab === s.id ? "bg-indigo-500/20 text-indigo-200" : "text-slate-400 hover:bg-white/5"
                                }`}
                            >
                                {s.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="p-5">
                    {loading ? (
                        <div className="flex justify-center py-16 text-slate-400">
                            <Loader2 className="w-6 h-6 animate-spin" />
                        </div>
                    ) : !act ? null : subtab === "panoramica" ? (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {kpis.map((k) => {
                                    const Icon = k.icon;
                                    return (
                                        <div key={k.label} className="glass-card p-3 rounded-xl">
                                            <Icon className="w-4 h-4 text-indigo-400 mb-2" />
                                            <p className="text-2xl font-bold text-white">{k.value}</p>
                                            <p className="text-xs text-slate-400">{k.label}</p>
                                        </div>
                                    );
                                })}
                            </div>
                            {u.note && (
                                <div className="glass-card p-3 rounded-xl">
                                    <p className="text-xs text-slate-500 mb-1">Note</p>
                                    <p className="text-sm text-slate-300">{u.note}</p>
                                </div>
                            )}
                            <p className="text-xs text-slate-500">
                                L&apos;attività è collegata tramite il nome <span className="text-slate-300">{matchName}</span> presente nelle
                                varie sezioni del CRM.
                            </p>
                        </div>
                    ) : subtab === "contratti" ? (
                        <ActivityList
                            empty="Nessun contratto registrato."
                            rows={act.contracts.map((c) => ({
                                key: c.id,
                                title: `${c.brand || "—"} · ${c.categoria || c.prodotto || ""}`,
                                sub: `${c.negozio || ""} · ${fmtDate(c.data_registrazione || c.created_at)}`,
                                badge: c.stato,
                            }))}
                        />
                    ) : subtab === "pratiche" ? (
                        <PraticheView contracts={act.contracts} />
                    ) : subtab === "presenze" ? (
                        <div className="space-y-5">
                            <div>
                                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Turni recenti</h4>
                                <ActivityList
                                    empty="Nessun turno registrato."
                                    rows={act.shifts.map((s) => ({
                                        key: s.id,
                                        title: s.store || "—",
                                        sub: fmtDateTime(s.started_at),
                                        badge: s.ended_at ? "chiuso" : "in corso",
                                    }))}
                                />
                            </div>
                            <div>
                                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Richieste ferie</h4>
                                <ActivityList
                                    empty="Nessuna richiesta ferie."
                                    rows={act.vacations.map((v) => ({
                                        key: v.id,
                                        title: `${fmtDate(v.date_from)} → ${fmtDate(v.date_to)}`,
                                        sub: v.reason || "",
                                        badge: v.status,
                                    }))}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-5">
                            {area === "cc" && (
                                <div>
                                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Chiamate</h4>
                                    <ActivityList
                                        empty="Nessuna chiamata."
                                        rows={act.calls.map((c) => ({
                                            key: c.id,
                                            title: c.brand || "—",
                                            sub: fmtDateTime(c.data_chiamata),
                                            badge: c.stato,
                                        }))}
                                    />
                                </div>
                            )}
                            <div>
                                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Appuntamenti</h4>
                                <ActivityList
                                    empty="Nessun appuntamento."
                                    rows={act.appointments.map((a) => ({
                                        key: a.id,
                                        title: a.customer_name || "—",
                                        sub: `${a.store || ""} · ${fmtDate(a.date)}`,
                                        badge: a.status,
                                    }))}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function PraticheView({ contracts }: { contracts: Activity["contracts"] }) {
    const byStato = useMemo(() => {
        const m: Record<string, number> = {};
        for (const c of contracts) m[c.stato || "—"] = (m[c.stato || "—"] || 0) + 1;
        return Object.entries(m).sort((a, b) => b[1] - a[1]);
    }, [contracts]);
    if (!contracts.length) return <Empty text="Nessuna pratica." />;
    return (
        <div className="space-y-2">
            {byStato.map(([stato, n]) => (
                <div key={stato} className="glass-card p-3 rounded-xl flex items-center justify-between">
                    <span className="text-sm text-slate-200 flex items-center gap-2">
                        <Circle className="w-2 h-2 fill-indigo-400 text-indigo-400" /> {stato}
                    </span>
                    <span className="text-sm font-bold text-white">{n}</span>
                </div>
            ))}
        </div>
    );
}

function ActivityList({ rows, empty }: { rows: { key: string; title: string; sub: string; badge?: string }[]; empty: string }) {
    if (!rows.length) return <Empty text={empty} />;
    return (
        <div className="space-y-1.5">
            {rows.map((r) => (
                <div key={r.key} className="glass-card p-3 rounded-lg flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-sm text-white truncate">{r.title}</p>
                        <p className="text-xs text-slate-500 truncate">{r.sub}</p>
                    </div>
                    {r.badge && (
                        <span className="text-[10px] px-2 py-1 rounded bg-white/5 border border-white/10 text-slate-300 whitespace-nowrap capitalize">
                            {r.badge}
                        </span>
                    )}
                </div>
            ))}
        </div>
    );
}

function Empty({ text }: { text: string }) {
    return <div className="text-center py-8 text-sm text-slate-500">{text}</div>;
}

/* ================================================================== */
/* Vista Negozi                                                        */
/* ================================================================== */
function StoresView({ stores }: { stores: Store[] }) {
    if (!stores.length)
        return <div className="glass-panel p-10 text-center text-slate-400">Nessun negozio in anagrafica.</div>;
    return (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {stores.map((s) => (
                <div key={s.id} className="glass-card p-4 rounded-xl flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-indigo-500/15 flex items-center justify-center">
                        <StoreIcon className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                        <p className="text-white font-medium">{s.name}</p>
                        <p className="text-xs text-slate-500">{s.company || "—"}</p>
                    </div>
                    {!s.active && <span className="ml-auto text-[10px] text-rose-400">disattivo</span>}
                </div>
            ))}
        </div>
    );
}

/* ---------- utils ---------- */
function fmtDate(d: string | null): string {
    if (!d) return "—";
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString("it-IT");
}
function fmtDateTime(d: string | null): string {
    if (!d) return "—";
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    return dt.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
