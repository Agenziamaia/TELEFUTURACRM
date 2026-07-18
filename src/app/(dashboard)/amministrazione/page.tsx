"use client";

import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import { ToastHost, dbError } from "./_views/toast";
import { TargetSection } from "./_views/target";
import { MoneyInput } from "./_views/money";
import {
    ROLES,
    AREAS,
    BRANDS,
    EMPLOYMENT_COMPANIES,
    STORE_CATEGORIES,
    WEEKLY_HOURS,
    hoursType,
    CONTRACT_TYPES,
    contractNeedsExpiry,
    roleLabel,
    gradesFor,
    gradeLabel,
    areaOf,
    areaLabel,
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
    KeyRound,
    Copy,
    Eye,
    EyeOff,
    RotateCw,
    Mail,
    ChevronRight,
    ChevronDown,
    Trash2,
    ArrowLeft,
} from "lucide-react";

/* ---------- Tipi ---------- */
interface AppUser {
    id: string;
    full_name: string;
    match_name: string | null;
    email: string | null;
    pec: string | null;
    phone: string | null;
    role: string;
    grade: string | null;
    primary_store: string | null;
    active: boolean;
    status: string; // 'attivo' | 'licenziato'
    company: string | null; // società di assunzione
    weekly_hours: number | null;
    contract_type: string | null;
    contract_end: string | null; // scadenza
    company_cost: number | null; // costo azienda (interno)
    costo_gara: number | null; // costo attribuito (schema costi/ricavi)
    iban: string | null;
    address: string | null; // residenza
    different_domicile: boolean;
    domicile: string | null;
    hire_date: string | null;
    note: string | null;
    password: string | null;
    user_stores?: { store_name: string }[];
    user_brands?: { brand: string }[];
}

interface Store {
    id: string;
    name: string;
    code: string | null;
    company: string | null;
    active: boolean;
    cost: number | null;
    shared_percent: number | null;
    store_category: string | null;
}

const EMPTY_USER: Partial<AppUser> & { stores: string[]; brands: string[] } = {
    full_name: "",
    match_name: "",
    email: "",
    pec: "",
    phone: "",
    role: "venditore",
    grade: "apprendista",
    active: true,
    status: "attivo",
    company: "",
    weekly_hours: null,
    contract_type: "",
    contract_end: "",
    company_cost: null,
    costo_gara: null,
    iban: "",
    address: "",
    different_domicile: false,
    domicile: "",
    hire_date: "",
    note: "",
    stores: [],
    brands: [],
};

// Genera una password robusta (evita caratteri ambigui). Usa crypto del browser.
function genPassword(len = 12): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    const arr = new Uint32Array(len);
    (globalThis.crypto || window.crypto).getRandomValues(arr);
    return Array.from(arr, (x) => chars[x % chars.length]).join("");
}

/* ================================================================== */

export default function AmministrazionePage() {
    return (
        <Suspense>
            <AmministrazioneInner />
        </Suspense>
    );
}

// Sezioni del hub Amministrazione: ogni card apre la sua pagina piena (?sez=)
const SEZIONI = [
    { id: "utenti", label: "Utenti", icon: Users, desc: "Anagrafica completa: ruoli e gradi, negozi e brand, contratti, costi e allegati." },
    { id: "negozi", label: "Negozi", icon: StoreIcon, desc: "Punti vendita e categorie, costi per negozio e ripartizione dei condivisi." },
    { id: "condivisi", label: "Costi condivisi", icon: Building2, desc: "Catalogo per categorie, con le Risorse prese dall'anagrafica." },
    { id: "altri", label: "Altri costi", icon: Tag, desc: "Costi solo admin: non ripartiti e non visibili ai negozi." },
    { id: "target", label: "Target", icon: ClipboardList, desc: "Gare e target per personale, ruoli, negozi e categorie; paletti e sblocco commissioning." },
] as const;

function AmministrazioneInner() {
    const { user } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const sez = searchParams.get("sez");
    const go = (s?: string) => router.push(s ? `/amministrazione?sez=${s}` : "/amministrazione");
    const current = SEZIONI.find((s) => s.id === sez);
    const [users, setUsers] = useState<AppUser[]>([]);
    const [stores, setStores] = useState<Store[]>([]);
    const [loading, setLoading] = useState(true);
    const [tableMissing, setTableMissing] = useState(false);

    // filtri utenti
    const [search, setSearch] = useState("");
    const [fArea, setFArea] = useState("");
    const [fRole, setFRole] = useState("");
    const [showFired, setShowFired] = useState(false);

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
            // I licenziati sono nascosti finché non si spunta "Mostra licenziati"
            if (!showFired && u.status === "licenziato") return false;
            if (fArea && areaOf(u.role) !== fArea) return false;
            if (fRole && u.role !== fRole) return false;
            if (search) {
                const q = search.toLowerCase();
                const hay = `${u.full_name} ${u.email || ""} ${roleLabel(u.role)} ${(u.user_stores || [])
                    .map((s) => s.store_name)
                    .join(" ")}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }, [users, fArea, fRole, showFired, search]);

    const firedCount = useMemo(() => users.filter((u) => u.status === "licenziato").length, [users]);

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
            <ToastHost />
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    {current && (
                        <button
                            onClick={() => go()}
                            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors mb-1"
                        >
                            <ArrowLeft className="w-3.5 h-3.5" /> Amministrazione
                        </button>
                    )}
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        {current ? (
                            <>
                                <current.icon className="w-6 h-6 text-indigo-400" /> {current.label}
                            </>
                        ) : (
                            <>
                                <Shield className="w-6 h-6 text-indigo-400" /> Amministrazione
                            </>
                        )}
                    </h1>
                    <p className="text-slate-400 text-sm mt-1">
                        {current ? current.desc : "Il governo della piattaforma: scegli una sezione."}
                    </p>
                </div>
                {sez === "utenti" && !tableMissing && (
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

            {tableMissing && <TableMissingBanner />}

            {!current ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {SEZIONI.map((s) => {
                        const Icon = s.icon;
                        return (
                            <button
                                key={s.id}
                                onClick={() => go(s.id)}
                                className="glass-panel p-5 rounded-2xl text-left hover:bg-white/5 transition-colors group"
                            >
                                <div className="flex items-start justify-between">
                                    <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center mb-3">
                                        <Icon className="w-5 h-5 text-indigo-300" />
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-300 transition-colors" />
                                </div>
                                <p className="text-white font-semibold">{s.label}</p>
                                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{s.desc}</p>
                            </button>
                        );
                    })}
                </div>
            ) : loading ? (
                <div className="flex items-center justify-center py-20 text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin" />
                </div>
            ) : tableMissing ? null : sez === "utenti" ? (
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
                        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none px-2">
                            <input
                                type="checkbox"
                                checked={showFired}
                                onChange={(e) => setShowFired(e.target.checked)}
                                className="accent-rose-500 w-4 h-4"
                            />
                            Mostra licenziati{firedCount > 0 ? ` (${firedCount})` : ""}
                        </label>
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
            ) : sez === "negozi" ? (
                <StoresView stores={stores} onRefresh={fetchAll} />
            ) : sez === "condivisi" ? (
                <SharedCostsView />
            ) : sez === "altri" ? (
                <AltriCostiView />
            ) : (
                <TargetSection />
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

            {detail && (
                <UserDetail
                    u={detail}
                    onClose={() => setDetail(null)}
                    onEdit={() => {
                        setEditing(detail);
                        setShowForm(true);
                        setDetail(null);
                    }}
                />
            )}
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
                        {u.status === "licenziato" && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400 border border-rose-500/20">
                                licenziato
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-indigo-300 mt-0.5">
                        {roleLabel(u.role)}
                        {u.grade ? ` · ${gradeLabel(u.role, u.grade)}` : ""}
                    </p>
                    {(u.company || u.weekly_hours) && (
                        <p className="text-[11px] text-slate-500 mt-0.5">
                            {u.company || ""}
                            {u.company && u.weekly_hours ? " · " : ""}
                            {u.weekly_hours ? `${u.weekly_hours}h ${hoursType(u.weekly_hours)}` : ""}
                        </p>
                    )}
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
        const status = f.status || "attivo";
        const payload = {
            full_name: f.full_name.trim(),
            match_name: (f.match_name || f.full_name).trim(),
            email: f.email?.trim() || null,
            pec: f.pec?.trim() || null,
            phone: f.phone?.trim() || null,
            role: f.role,
            grade: grades.length ? f.grade : null,
            primary_store: (f.stores as string[])[0] || null,
            status,
            active: status !== "licenziato",
            company: f.company?.trim() || null,
            weekly_hours: f.weekly_hours ? Number(f.weekly_hours) : null,
            contract_type: f.contract_type?.trim() || null,
            contract_end: contractNeedsExpiry(f.contract_type) ? f.contract_end || null : null,
            company_cost: f.company_cost || f.company_cost === 0 ? Number(f.company_cost) : null,
            costo_gara: f.costo_gara || f.costo_gara === 0 ? Number(f.costo_gara) : null,
            iban: f.iban?.trim() || null,
            address: f.address?.trim() || null,
            different_domicile: !!f.different_domicile,
            domicile: f.different_domicile ? f.domicile?.trim() || null : null,
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
                        <Field label="PEC">
                            <input className="glass-input w-full" value={f.pec || ""} onChange={(e) => set("pec", e.target.value)} placeholder="nome@pec.it" />
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

                    {/* Dati contrattuali e società */}
                    <div className="grid sm:grid-cols-2 gap-3">
                        <Field label="Società di assunzione">
                            <select className="glass-input w-full" value={f.company || ""} onChange={(e) => set("company", e.target.value)}>
                                <option value="">— seleziona —</option>
                                {EMPLOYMENT_COMPANIES.map((c) => (
                                    <option key={c} value={c}>
                                        {c}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Ore settimanali">
                            <select
                                className="glass-input w-full"
                                value={f.weekly_hours ?? ""}
                                onChange={(e) => set("weekly_hours", e.target.value ? Number(e.target.value) : null)}
                            >
                                <option value="">— seleziona —</option>
                                {WEEKLY_HOURS.map((h) => (
                                    <option key={h} value={h}>
                                        {h}h — {h >= 36 ? "Full time" : "Part time"}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="IBAN">
                            <input className="glass-input w-full" value={f.iban || ""} onChange={(e) => set("iban", e.target.value)} placeholder="IT.." />
                        </Field>
                        <Field label="Stato">
                            <select className="glass-input w-full" value={f.status || "attivo"} onChange={(e) => set("status", e.target.value)}>
                                <option value="attivo">Attivo</option>
                                <option value="licenziato">Licenziato</option>
                            </select>
                        </Field>
                        <Field label="Tipo di contratto">
                            <select className="glass-input w-full" value={f.contract_type || ""} onChange={(e) => set("contract_type", e.target.value)}>
                                <option value="">— seleziona —</option>
                                {CONTRACT_TYPES.map((c) => (
                                    <option key={c} value={c}>
                                        {c}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Costo azienda (€) — solo admin">
                            <MoneyInput
                                wrapClass="w-full"
                                value={f.company_cost ?? null}
                                onChange={(v) => set("company_cost", v)}
                                placeholder="costo reale"
                            />
                        </Field>
                        <Field label="Costo visibile (€) — pubblico">
                            <MoneyInput
                                wrapClass="w-full"
                                value={f.costo_gara ?? null}
                                onChange={(v) => set("costo_gara", v)}
                                placeholder="costi/ricavi PV"
                            />
                        </Field>
                        {contractNeedsExpiry(f.contract_type) && (
                            <Field label="Scadenza contratto">
                                <input type="date" className="glass-input w-full" value={f.contract_end || ""} onChange={(e) => set("contract_end", e.target.value)} />
                            </Field>
                        )}
                    </div>
                    <Field label="Indirizzo di residenza">
                        <input className="glass-input w-full" value={f.address || ""} onChange={(e) => set("address", e.target.value)} placeholder="Via, civico, CAP, città" />
                    </Field>
                    <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={f.different_domicile ?? false}
                            onChange={(e) => set("different_domicile", e.target.checked)}
                            className="accent-indigo-500 w-4 h-4"
                        />
                        Domicilio diverso dalla residenza
                    </label>
                    {f.different_domicile && (
                        <Field label="Indirizzo di domicilio">
                            <input className="glass-input w-full" value={f.domicile || ""} onChange={(e) => set("domicile", e.target.value)} placeholder="Via, civico, CAP, città" />
                        </Field>
                    )}

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

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
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

function DetailRow({ label, value, full }: { label: string; value: string | null | undefined; full?: boolean }) {
    return (
        <div className={full ? "col-span-2" : ""}>
            <p className="text-[11px] text-slate-500">{label}</p>
            <p className="text-slate-200 truncate">{value || "—"}</p>
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

function UserDetail({ u, onClose, onEdit }: { u: AppUser; onClose: () => void; onEdit?: () => void }) {
    const matchName = u.match_name || u.full_name;
    const area = areaOf(u.role);
    const [act, setAct] = useState<Activity | null>(null);
    const [loading, setLoading] = useState(true);
    const [subtab, setSubtab] = useState<"panoramica" | "contratti" | "pratiche" | "presenze" | "cc" | "allegati">("panoramica");

    // credenziali / reset password
    const [pw, setPw] = useState<string | null>(u.password);
    const [showPw, setShowPw] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [copied, setCopied] = useState(false);

    const doResetPassword = async () => {
        const np = genPassword();
        setResetting(true);
        const { error } = await supabase.from("app_users").update({ password: np }).eq("id", u.id);
        setResetting(false);
        if (!error) {
            setPw(np);
            setShowPw(true);
        }
    };
    const copyPw = () => {
        if (!pw) return;
        navigator.clipboard?.writeText(pw);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

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
        { id: "allegati", label: "Allegati" },
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
                        <div className="flex items-center gap-1">
                            {onEdit && (
                                <button onClick={onEdit} title="Modifica utente" className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/5">
                                    <Pencil className="w-4 h-4" />
                                </button>
                            )}
                            <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
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

                            {/* Credenziali */}
                            <div className="glass-card p-4 rounded-xl">
                                <div className="flex items-center justify-between mb-3">
                                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Credenziali</p>
                                    <button
                                        onClick={doResetPassword}
                                        disabled={resetting}
                                        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25 transition-colors disabled:opacity-60"
                                    >
                                        {resetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
                                        Reset password
                                    </button>
                                </div>
                                <div className="space-y-2 text-sm">
                                    <div className="flex items-center gap-2 text-slate-300">
                                        <Mail className="w-4 h-4 text-slate-500 shrink-0" />
                                        <span className="truncate">{u.email || <span className="text-slate-600">nessuna email</span>}</span>
                                    </div>
                                    {u.pec && (
                                        <div className="flex items-center gap-2 text-slate-300">
                                            <Shield className="w-4 h-4 text-slate-500 shrink-0" />
                                            <span className="truncate">{u.pec}</span>
                                        </div>
                                    )}
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <KeyRound className="w-4 h-4 text-slate-500 shrink-0" />
                                        {pw ? (
                                            <>
                                                <code className="text-slate-200 bg-black/30 rounded px-2 py-0.5 font-mono text-xs">
                                                    {showPw ? pw : "•".repeat(pw.length)}
                                                </code>
                                                <button onClick={() => setShowPw((v) => !v)} className="text-slate-400 hover:text-white p-1" title={showPw ? "Nascondi" : "Mostra"}>
                                                    {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                                </button>
                                                <button onClick={copyPw} className="text-slate-400 hover:text-white p-1" title="Copia">
                                                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                                </button>
                                            </>
                                        ) : (
                                            <span className="text-slate-600 text-xs">Nessuna password — usa &quot;Reset password&quot; per generarne una.</span>
                                        )}
                                    </div>
                                    {showPw && pw && (
                                        <p className="text-[11px] text-amber-400/80">
                                            Invia questa password all&apos;utente via email. Dovrà cambiarla al primo accesso (quando il login sarà attivo).
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Dati contrattuali */}
                            <div className="glass-card p-4 rounded-xl">
                                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Dati</p>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                    <DetailRow label="Società" value={u.company} />
                                    <DetailRow label="Ore" value={u.weekly_hours ? `${u.weekly_hours}h · ${hoursType(u.weekly_hours)}` : null} />
                                    <DetailRow label="Contratto" value={u.contract_type} />
                                    <DetailRow label="Scadenza" value={u.contract_end ? fmtDate(u.contract_end) : null} />
                                    <DetailRow label="Costo azienda (solo admin)" value={u.company_cost != null ? `€ ${Number(u.company_cost).toLocaleString("it-IT")}` : null} />
                                    <DetailRow label="Costo visibile" value={u.costo_gara != null ? `€ ${Number(u.costo_gara).toLocaleString("it-IT")}` : null} />
                                    <DetailRow label="Stato" value={u.status === "licenziato" ? "Licenziato" : "Attivo"} />
                                    <DetailRow label="Telefono" value={u.phone} />
                                    <DetailRow label="Residenza" value={u.address} full />
                                    {u.different_domicile && <DetailRow label="Domicilio" value={u.domicile} full />}
                                    <DetailRow label="IBAN" value={u.iban} full />
                                </div>
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
                    ) : subtab === "cc" ? (
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
                    ) : (
                        <UserAttachments userId={u.id} />
                    )}
                </div>
            </div>
        </div>
    );
}

/* ================================================================== */
/* Allegati utente                                                     */
/* ================================================================== */
interface Attachment {
    id: string;
    file_name: string;
    storage_path: string;
    note: string | null;
    category: string | null;
    created_at: string;
}

const ATT_BUCKET = "user-attachments";
const ATT_CATS = [
    { id: "contratto", label: "Contratto" },
    { id: "documenti", label: "Documenti" },
    { id: "altri", label: "Altri allegati" },
];

function UserAttachments({ userId }: { userId: string }) {
    const [items, setItems] = useState<Attachment[]>([]);
    const [loading, setLoading] = useState(true);
    const [files, setFiles] = useState<Record<string, File | null>>({});
    const [names, setNames] = useState<Record<string, string>>({});
    const [savingCat, setSavingCat] = useState<string | null>(null);
    const [err, setErr] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        const { data } = await supabase
            .from("user_attachments")
            .select("id, file_name, storage_path, note, category, created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false });
        setItems((data as Attachment[]) || []);
        setLoading(false);
    }, [userId]);

    useEffect(() => {
        load();
    }, [load]);

    const save = async (cat: string) => {
        const file = files[cat] || null;
        const name = (names[cat] || "").trim();
        if (!file && !name) {
            setErr("Allega un file o scrivi un nome.");
            return;
        }
        setSavingCat(cat);
        setErr("");
        let storagePath = "";
        let fileName = name || "(nota)";
        if (file) {
            fileName = file.name;
            const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
            storagePath = `${userId}/${cat}/${Date.now()}_${safe}`;
            const up = await supabase.storage.from(ATT_BUCKET).upload(storagePath, file);
            if (up.error) {
                setErr(up.error.message);
                setSavingCat(null);
                return;
            }
        }
        const ins = await supabase.from("user_attachments").insert({
            user_id: userId,
            file_name: fileName,
            storage_path: storagePath,
            note: name || null,
            category: cat,
            size_bytes: file?.size || null,
        });
        setSavingCat(null);
        if (ins.error) {
            setErr(ins.error.message);
            return;
        }
        setFiles((p) => ({ ...p, [cat]: null }));
        setNames((p) => ({ ...p, [cat]: "" }));
        load();
    };

    const openFile = (a: Attachment) => {
        if (!a.storage_path) return;
        const { data } = supabase.storage.from(ATT_BUCKET).getPublicUrl(a.storage_path);
        window.open(data.publicUrl, "_blank");
    };

    const remove = async (a: Attachment) => {
        if (a.storage_path) await supabase.storage.from(ATT_BUCKET).remove([a.storage_path]);
        await supabase.from("user_attachments").delete().eq("id", a.id);
        load();
    };

    return (
        <div className="space-y-5">
            {err && <p className="text-xs text-rose-400">{err}</p>}
            {ATT_CATS.map((cat) => {
                const list = items.filter((a) => (a.category || "altri") === cat.id);
                return (
                    <div key={cat.id} className="space-y-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{cat.label}</h4>
                        {loading ? (
                            <div className="flex justify-center py-4 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /></div>
                        ) : list.length ? (
                            <div className="space-y-1.5">
                                {list.map((a) => (
                                    <div key={a.id} className="glass-card p-3 rounded-lg flex items-center gap-3">
                                        <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm text-white truncate">{a.note || a.file_name}</p>
                                            {a.note && a.storage_path && <p className="text-xs text-slate-500 truncate">{a.file_name}</p>}
                                            <p className="text-[10px] text-slate-600">{fmtDateTime(a.created_at)}</p>
                                        </div>
                                        {a.storage_path && (
                                            <button onClick={() => openFile(a)} className="text-slate-400 hover:text-white p-1" title="Apri"><Eye className="w-4 h-4" /></button>
                                        )}
                                        <button onClick={() => remove(a)} className="text-slate-500 hover:text-rose-400 p-1" title="Elimina"><X className="w-4 h-4" /></button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-slate-600 px-1">Nessun allegato.</p>
                        )}
                        <div className="glass-card p-3 rounded-lg flex flex-col sm:flex-row gap-2 sm:items-center">
                            <input type="text" value={names[cat.id] || ""} onChange={(e) => setNames((p) => ({ ...p, [cat.id]: e.target.value }))} placeholder="Nome allegato" className="glass-input text-sm flex-1" />
                            <input type="file" onChange={(e) => setFiles((p) => ({ ...p, [cat.id]: e.target.files?.[0] || null }))} className="text-xs text-slate-300 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-indigo-500/20 file:text-indigo-200 file:text-xs" />
                            <button onClick={() => save(cat.id)} disabled={savingCat === cat.id} className="primary-btn text-xs px-3 whitespace-nowrap flex items-center gap-1 justify-center">
                                {savingCat === cat.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Salva
                            </button>
                        </div>
                    </div>
                );
            })}
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
// Nome "base" del negozio (senza il suffisso di brand) per raggruppare i divisi
function baseName(name: string): string {
    return name.replace(/ (W3|Multi|VS)$/, "");
}

function StoresView({ stores, onRefresh }: { stores: Store[]; onRefresh: () => void }) {
    const [detail, setDetail] = useState<Store | null>(null);
    const [aggregate, setAggregate] = useState<{ base: string; stores: Store[] } | null>(null);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [newOpen, setNewOpen] = useState(false);
    const [newName, setNewName] = useState("");
    const [newCompany, setNewCompany] = useState("Telefutura");
    const [saving, setSaving] = useState(false);
    const [confirmDel, setConfirmDel] = useState<string | null>(null);

    const groups = useMemo(() => {
        const m: Record<string, Store[]> = {};
        for (const s of stores) {
            const b = baseName(s.name);
            (m[b] = m[b] || []).push(s);
        }
        return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]));
    }, [stores]);

    const createStore = async () => {
        if (!newName.trim()) return;
        setSaving(true);
        await supabase.from("stores").insert({ name: newName.trim(), company: newCompany.trim() || null });
        setSaving(false);
        setNewOpen(false);
        setNewName("");
        onRefresh();
    };
    const deleteStore = async (id: string) => {
        await supabase.from("stores").delete().eq("id", id);
        setConfirmDel(null);
        onRefresh();
    };
    const renderDel = (id: string) =>
        confirmDel === id ? (
            <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <button onClick={(e) => { e.stopPropagation(); deleteStore(id); }} className="text-[10px] px-2 py-1 rounded bg-rose-500/20 text-rose-300">Elimina</button>
                <button onClick={(e) => { e.stopPropagation(); setConfirmDel(null); }} className="text-[10px] text-slate-500 px-1">Annulla</button>
            </span>
        ) : (
            <button onClick={(e) => { e.stopPropagation(); setConfirmDel(id); }} className="text-slate-600 hover:text-rose-400 p-1 shrink-0" title="Elimina negozio"><Trash2 className="w-4 h-4" /></button>
        );

    return (
        <>
            <div className="flex items-start justify-between gap-3 mb-3">
                <p className="text-xs text-slate-500 max-w-lg">
                    Clicca un punto vendita per gestire le voci di costo e vedere il recap. I negozi divisi si espandono nei due sub.
                </p>
                <button onClick={() => setNewOpen(true)} className="primary-btn text-sm flex items-center gap-1.5 shrink-0"><Plus className="w-4 h-4" /> Nuovo negozio</button>
            </div>
            {!stores.length && <div className="glass-panel p-10 text-center text-slate-400">Nessun negozio in anagrafica.</div>}
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {groups.map(([base, subs]) => {
                    if (subs.length === 1) {
                        const s = subs[0];
                        return (
                            <div key={s.id} className="glass-card p-4 rounded-xl flex items-center gap-3 hover:bg-white/[0.04] transition-colors">
                                <button onClick={() => setDetail(s)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                                    <div className="w-10 h-10 rounded-lg bg-indigo-500/15 flex items-center justify-center shrink-0">
                                        <StoreIcon className="w-5 h-5 text-indigo-400" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-white font-medium truncate">{s.name}</p>
                                        <p className="text-xs text-slate-500">{s.company || "—"}</p>
                                    </div>
                                </button>
                                {renderDel(s.id)}
                            </div>
                        );
                    }
                    const isOpen = expanded[base];
                    return (
                        <div key={base} className="glass-card rounded-xl overflow-hidden self-start">
                            <button onClick={() => setExpanded((p) => ({ ...p, [base]: !p[base] }))} className="w-full p-4 flex items-center gap-3 text-left hover:bg-white/[0.04] transition-colors">
                                <div className="w-10 h-10 rounded-lg bg-indigo-500/15 flex items-center justify-center shrink-0">
                                    <StoreIcon className="w-5 h-5 text-indigo-400" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-white font-medium truncate">{base}</p>
                                    <p className="text-xs text-slate-500">{subs.length} punti vendita · {subs[0].company || "—"}</p>
                                </div>
                                {isOpen ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-600" />}
                            </button>
                            {isOpen && (
                                <div className="border-t border-white/5 divide-y divide-white/5">
                                    <button onClick={() => setAggregate({ base, stores: subs })} className="w-full px-4 py-2.5 flex items-center gap-2 text-left hover:bg-white/[0.04] transition-colors text-sm">
                                        <span className="text-indigo-300 font-medium">Complessivo {base}</span>
                                        <span className="text-[11px] text-slate-500">costi aggregati</span>
                                        <ChevronRight className="w-4 h-4 text-slate-600 ml-auto" />
                                    </button>
                                    {subs.map((s) => (
                                        <div key={s.id} className="w-full px-4 py-2.5 flex items-center gap-2 text-sm text-slate-200 hover:bg-white/[0.04] transition-colors">
                                            <button onClick={() => setDetail(s)} className="flex-1 text-left flex items-center gap-2">
                                                {s.name}
                                                <ChevronRight className="w-4 h-4 text-slate-600 ml-auto" />
                                            </button>
                                            {renderDel(s.id)}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            {detail && <StoreDetail store={detail} onClose={() => { setDetail(null); onRefresh(); }} />}
            {aggregate && <StoreAggregate base={aggregate.base} stores={aggregate.stores} onClose={() => setAggregate(null)} />}
            {newOpen && (
                <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="glass-panel w-full max-w-sm p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-bold text-white">Nuovo negozio</h2>
                            <button onClick={() => setNewOpen(false)} className="text-slate-400 hover:text-white p-1"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="space-y-3">
                            <Field label="Nome"><input className="glass-input w-full" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="es. Tuscolana W3" /></Field>
                            <Field label="Società"><input className="glass-input w-full" value={newCompany} onChange={(e) => setNewCompany(e.target.value)} /></Field>
                            <div className="flex justify-end gap-2 pt-2">
                                <button onClick={() => setNewOpen(false)} className="px-4 py-2.5 rounded-xl text-slate-300 hover:bg-white/5 text-sm">Annulla</button>
                                <button onClick={createStore} disabled={saving} className="primary-btn flex items-center gap-2">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Crea</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

/* ================================================================== */
/* Scheda complessiva (negozio diviso) — sola lettura                  */
/* ================================================================== */
interface SubCollab { full_name: string; role: string; company_cost: number | null; costo_gara: number | null }
interface SubAgg { store: Store; items: CostItem[]; collab: SubCollab[]; pct: number; itemsA: number; itemsV: number; collabA: number; collabV: number; sharedA: number; sharedV: number; totA: number; totV: number }

function StoreAggregate({ base, stores, onClose }: { base: string; stores: Store[]; onClose: () => void }) {
    const [loading, setLoading] = useState(true);
    const [subs, setSubs] = useState<SubAgg[]>([]);
    const [comb, setComb] = useState({ totA: 0, totV: 0, items: 0, itemsV: 0, collab: 0, collabV: 0, shared: 0, sharedV: 0 });

    useEffect(() => {
        (async () => {
            setLoading(true);
            const num = (x: unknown) => Number(x) || 0;
            const sh = await supabase.from("shared_costs").select("amount_azienda,amount_visibile");
            const totSharedA = ((sh.data as { amount_azienda: number }[]) || []).reduce((a, r) => a + num(r.amount_azienda), 0);
            const totSharedV = ((sh.data as { amount_visibile: number }[]) || []).reduce((a, r) => a + num(r.amount_visibile), 0);
            const built: SubAgg[] = [];
            for (const s of stores) {
                const [it, cl] = await Promise.all([
                    supabase.from("store_cost_items").select("id,label,amount_azienda,amount_visibile").eq("store_id", s.id).order("created_at"),
                    supabase.from("app_users").select("full_name,role,company_cost,costo_gara,user_stores!inner(store_name)").eq("user_stores.store_name", s.name).eq("status", "attivo"),
                ]);
                const items = (it.data as CostItem[]) || [];
                const collab = (cl.data as SubCollab[]) || [];
                const pct = num(s.shared_percent);
                const itemsA = items.reduce((a, r) => a + num(r.amount_azienda), 0);
                const itemsV = items.reduce((a, r) => a + num(r.amount_visibile), 0);
                const collabA = collab.reduce((a, r) => a + num(r.company_cost), 0);
                const collabV = collab.reduce((a, r) => a + num(r.costo_gara), 0);
                const sharedA = totSharedA * pct / 100;
                const sharedV = totSharedV * pct / 100;
                built.push({ store: s, items, collab, pct, itemsA, itemsV, collabA, collabV, sharedA, sharedV, totA: itemsA + collabA + sharedA, totV: itemsV + collabV + sharedV });
            }
            const seen = new Set<string>();
            let cA = 0, cV = 0;
            for (const su of built) for (const c of su.collab) if (!seen.has(c.full_name)) { seen.add(c.full_name); cA += num(c.company_cost); cV += num(c.costo_gara); }
            const iA = built.reduce((a, su) => a + su.itemsA, 0);
            const iV = built.reduce((a, su) => a + su.itemsV, 0);
            const pctSum = built.reduce((a, su) => a + su.pct, 0);
            const shA = totSharedA * pctSum / 100;
            const shV = totSharedV * pctSum / 100;
            setComb({ totA: iA + cA + shA, totV: iV + cV + shV, items: iA, itemsV: iV, collab: cA, collabV: cV, shared: shA, sharedV: shV });
            setSubs(built);
            setLoading(false);
        })();
    }, [stores]);

    return (
        <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex justify-end">
            <div className="w-full max-w-2xl bg-[#0f111a] border-l border-white/10 h-full overflow-y-auto animate-in slide-in-from-right duration-200">
                <div className="sticky top-0 bg-[#0f111a]/95 backdrop-blur-xl border-b border-white/10 p-5 z-10 flex items-start justify-between">
                    <div>
                        <h2 className="text-lg font-bold text-white">{base} — complessivo</h2>
                        <p className="text-sm text-slate-400">{stores.map((s) => s.name).join(" + ")}</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white p-1"><X className="w-5 h-5" /></button>
                </div>
                {loading ? (
                    <div className="flex justify-center py-16 text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
                ) : (
                    <div className="p-5 space-y-5">
                        {/* Complessivo */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="glass-card p-4 rounded-xl border border-amber-500/20">
                                <p className="text-[11px] text-amber-400/80 uppercase tracking-wider">Totale Azienda · solo admin</p>
                                <p className="text-2xl font-bold text-white mt-1">{money(comb.totA)}</p>
                            </div>
                            <div className="glass-card p-4 rounded-xl">
                                <p className="text-[11px] text-slate-500 uppercase tracking-wider">Totale Visibile · pubblico</p>
                                <p className="text-2xl font-bold text-white mt-1">{money(comb.totV)}</p>
                            </div>
                        </div>
                        <div className="glass-card p-4 rounded-xl space-y-2 text-sm">
                            <div className="flex justify-between"><span className="text-slate-400">Voci di costo</span><span className="text-slate-200">{money(comb.items)} <span className="text-slate-600">/ {money(comb.itemsV)}</span></span></div>
                            <div className="flex justify-between"><span className="text-slate-400">Collaboratori (dedup)</span><span className="text-slate-200">{money(comb.collab)} <span className="text-slate-600">/ {money(comb.collabV)}</span></span></div>
                            <div className="flex justify-between"><span className="text-slate-400">Quota costi condivisi</span><span className="text-slate-200">{money(comb.shared)} <span className="text-slate-600">/ {money(comb.sharedV)}</span></span></div>
                        </div>

                        {/* Dettaglio per sub */}
                        {subs.map((su) => (
                            <div key={su.store.id} className="glass-card p-4 rounded-xl space-y-3">
                                <div className="flex items-center justify-between">
                                    <p className="font-semibold text-white">{su.store.name}</p>
                                    <p className="text-sm"><span className="text-amber-300/80">{money(su.totA)}</span> <span className="text-slate-600">/ {money(su.totV)}</span></p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Voci di costo</p>
                                    {su.items.length ? su.items.map((i) => (
                                        <div key={i.id} className="flex justify-between text-sm py-0.5"><span className="text-slate-300">{i.label}</span><span className="text-slate-400">{money(Number(i.amount_azienda) || 0)} <span className="text-slate-600">/ {money(Number(i.amount_visibile) || 0)}</span></span></div>
                                    )) : <p className="text-xs text-slate-600">nessuna</p>}
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Collaboratori</p>
                                    {su.collab.length ? su.collab.map((c, i) => (
                                        <div key={i} className="flex justify-between text-sm py-0.5"><span className="text-slate-300 truncate">{c.full_name} <span className="text-xs text-slate-500">· {roleLabel(c.role)}</span></span><span className="text-slate-400 whitespace-nowrap">{c.company_cost != null ? money(Number(c.company_cost)) : "—"} <span className="text-slate-600">/ {c.costo_gara != null ? money(Number(c.costo_gara)) : "—"}</span></span></div>
                                    )) : <p className="text-xs text-slate-600">nessuno</p>}
                                </div>
                                <div className="flex justify-between text-sm pt-2 border-t border-white/5">
                                    <span className="text-slate-400">Quota condivisi ({su.pct}%)</span>
                                    <span className="text-slate-300">{money(su.sharedA)} <span className="text-slate-600">/ {money(su.sharedV)}</span></span>
                                </div>
                            </div>
                        ))}
                        <p className="text-xs text-slate-600">Sola lettura. Per modificare, apri il singolo punto vendita. Nel complessivo i collaboratori presenti in entrambi i sub (es. store manager) sono contati una volta sola.</p>
                    </div>
                )}
            </div>
        </div>
    );
}

/* ================================================================== */
/* Scheda costi negozio                                                */
/* ================================================================== */
interface CostItem {
    id: string;
    label: string;
    amount_azienda: number | null;
    amount_visibile: number | null;
}
interface SharedCost {
    id: string;
    label: string;
    amount_azienda: number | null;
    amount_visibile: number | null;
}
const money = (n: number) => `€ ${n.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

function StoreDetail({ store, onClose }: { store: Store; onClose: () => void }) {
    const [collab, setCollab] = useState<{ full_name: string; role: string; company_cost: number | null; costo_gara: number | null }[]>([]);
    const [shared, setShared] = useState<SharedCost[]>([]);
    const [pct, setPct] = useState<string>(store.shared_percent != null ? String(store.shared_percent) : "");
    const [loading, setLoading] = useState(true);
    const [itemTotals, setItemTotals] = useState({ a: 0, v: 0 });
    const onItemTotals = useCallback((a: number, v: number) => setItemTotals({ a, v }), []);

    const load = useCallback(async () => {
        setLoading(true);
        const [cl, sh] = await Promise.all([
            supabase.from("app_users").select("full_name,role,company_cost,costo_gara,user_stores!inner(store_name)").eq("user_stores.store_name", store.name).eq("status", "attivo"),
            supabase.from("shared_costs").select("id,label,amount_azienda,amount_visibile").order("created_at"),
        ]);
        setCollab((cl.data as typeof collab) || []);
        setShared((sh.data as SharedCost[]) || []);
        setLoading(false);
    }, [store.name]);
    useEffect(() => {
        load();
    }, [load]);

    const savePct = async () => {
        await supabase.from("stores").update({ shared_percent: pct ? Number(pct) : 0 }).eq("id", store.id);
    };

    // recap
    const sum = (arr: (number | null)[]) => arr.reduce((a: number, b) => a + (Number(b) || 0), 0);
    const itemsA = itemTotals.a;
    const itemsV = itemTotals.v;
    const collabA = sum(collab.map((c) => c.company_cost));
    const collabV = sum(collab.map((c) => c.costo_gara));
    const totSharedA = sum(shared.map((s) => s.amount_azienda));
    const totSharedV = sum(shared.map((s) => s.amount_visibile));
    const pctNum = Number(pct) || 0;
    const sharedA = totSharedA * pctNum / 100;
    const sharedV = totSharedV * pctNum / 100;
    const totA = itemsA + collabA + sharedA;
    const totV = itemsV + collabV + sharedV;

    return (
        <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex justify-end">
            <div className="w-full max-w-2xl bg-[#0f111a] border-l border-white/10 h-full overflow-y-auto animate-in slide-in-from-right duration-200">
                <div className="sticky top-0 bg-[#0f111a]/95 backdrop-blur-xl border-b border-white/10 p-5 z-10 flex items-start justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-lg bg-indigo-500/15 flex items-center justify-center">
                            <StoreIcon className="w-5 h-5 text-indigo-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white">{store.name}</h2>
                            <p className="text-sm text-slate-400">{store.company || "—"}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {loading ? (
                    <div className="flex justify-center py-16 text-slate-400">
                        <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                ) : (
                    <div className="p-5 space-y-5">
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500">Categoria PV</span>
                            <select
                                defaultValue={store.store_category || ""}
                                onChange={(e) => supabase.from("stores").update({ store_category: e.target.value || null }).eq("id", store.id)}
                                className="glass-input w-auto text-sm"
                            >
                                <option value="">— non classificato —</option>
                                {STORE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        {/* Recap */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="glass-card p-4 rounded-xl border border-amber-500/20">
                                <p className="text-[11px] text-amber-400/80 uppercase tracking-wider">Totale Azienda · solo admin</p>
                                <p className="text-2xl font-bold text-white mt-1">{money(totA)}</p>
                            </div>
                            <div className="glass-card p-4 rounded-xl">
                                <p className="text-[11px] text-slate-500 uppercase tracking-wider">Totale Visibile · pubblico</p>
                                <p className="text-2xl font-bold text-white mt-1">{money(totV)}</p>
                            </div>
                        </div>

                        {/* Voci di costo (per categoria) */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Voci di costo</h4>
                                <div className="flex gap-1 text-[10px] text-slate-500 pr-8">
                                    <span className="w-24 text-right">Azienda</span>
                                    <span className="w-24 text-right">Visibile</span>
                                </div>
                            </div>
                            <CategorizedCosts scope="store" table="store_cost_items" filter={{ store_id: store.id }} onTotals={onItemTotals} />
                        </div>

                        {/* Collaboratori */}
                        <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                                Collaboratori del negozio · {money(collabA)} <span className="text-slate-600">/ {money(collabV)} visibile</span>
                            </h4>
                            <div className="space-y-1.5">
                                {collab.map((c, i) => (
                                    <div key={i} className="glass-card p-2.5 rounded-lg flex items-center gap-2 text-sm">
                                        <span className="flex-1 text-slate-200 truncate">{c.full_name} <span className="text-xs text-slate-500">· {roleLabel(c.role)}</span></span>
                                        <span className="w-24 text-right text-amber-300/80">{c.company_cost != null ? money(Number(c.company_cost)) : "—"}</span>
                                        <span className="w-24 text-right text-slate-300">{c.costo_gara != null ? money(Number(c.costo_gara)) : "—"}</span>
                                    </div>
                                ))}
                                {!collab.length && <p className="text-xs text-slate-600 px-1">Nessun collaboratore assegnato a questo negozio.</p>}
                            </div>
                        </div>

                        {/* Costi condivisi — quota di questo negozio (% sul totale) */}
                        <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Quota costi condivisi</h4>
                            <div className="glass-card p-3 rounded-xl space-y-2">
                                <div className="flex items-center gap-2 text-sm">
                                    <span className="flex-1 text-slate-300">% del totale costi condivisi</span>
                                    <input type="number" step="0.01" value={pct} onChange={(e) => setPct(e.target.value)} onBlur={savePct} placeholder="0" className="glass-input w-20 py-1 text-sm text-right" />
                                    <span className="text-xs text-slate-500">%</span>
                                </div>
                                <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-white/5">
                                    <span>Totale condivisi: {money(totSharedA)} <span className="text-slate-600">/ {money(totSharedV)}</span></span>
                                    <span className="text-slate-300">quota: {money(sharedA)} <span className="text-slate-600">/ {money(sharedV)}</span></span>
                                </div>
                                {!shared.length && <p className="text-[11px] text-slate-600">Nessun costo condiviso. Aggiungili dal tab &quot;Costi condivisi&quot;.</p>}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

/* ================================================================== */
/* Costi condivisi (catalogo)                                          */
/* ================================================================== */
interface CatCost {
    id: string;
    label: string;
    amount_azienda: number | null;
    amount_visibile: number | null;
    category_id: string | null;
    user_id: string | null;
}
interface Cat {
    id: string;
    name: string;
}
interface UserRef {
    id: string;
    full_name: string;
    company_cost: number | null;
    costo_gara: number | null;
}

// Costi divisi per categoria — riusabile per costi condivisi e costi negozio.
// Una voce può essere collegata a un utente (Risorsa): prende il suo costo, aggiornato in automatico.
function CategorizedCosts({ scope, table, filter, onTotals, withResources, hideVisibile }: { scope: string; table: string; filter?: Record<string, string>; onTotals?: (a: number, v: number) => void; withResources?: boolean; hideVisibile?: boolean }) {
    const [cats, setCats] = useState<Cat[]>([]);
    const [rows, setRows] = useState<CatCost[]>([]);
    const [users, setUsers] = useState<UserRef[]>([]);
    const [loading, setLoading] = useState(true);
    const [newCat, setNewCat] = useState("");
    const [risUser, setRisUser] = useState("");
    const [addCat, setAddCat] = useState<string | null>(null); // categoria che mostra il form "+ voce"
    const [nl, setNl] = useState("");
    const [nAz, setNAz] = useState<number | null>(null);
    const [nVis, setNVis] = useState<number | null>(null);
    const filterKey = JSON.stringify(filter || {});

    const load = useCallback(async () => {
        setLoading(true);
        let q = supabase.from(table).select("id,label,amount_azienda,amount_visibile,category_id,user_id");
        if (filter) for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
        const [c, r, u] = await Promise.all([
            supabase.from("cost_categories").select("id,name").eq("scope", scope).order("created_at"),
            q.order("created_at"),
            supabase.from("app_users").select("id,full_name,company_cost,costo_gara").eq("status", "attivo").order("full_name"),
        ]);
        if (dbError("Caricamento voci", r.error)) {
            setLoading(false);
            return;
        }
        let catList = (c.data as Cat[]) || [];
        if (withResources && !catList.some((x) => x.name.toLowerCase() === "risorse")) {
            await supabase.from("cost_categories").insert({ scope, name: "Risorse" });
            const c2 = await supabase.from("cost_categories").select("id,name").eq("scope", scope).order("created_at");
            catList = (c2.data as Cat[]) || [];
        }
        setCats(catList);
        setRows((r.data as CatCost[]) || []);
        setUsers((u.data as UserRef[]) || []);
        setLoading(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [table, scope, filterKey, withResources]);
    useEffect(() => { load(); }, [load]);

    const userMap = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);
    const rowCost = useCallback((r: CatCost) => {
        const u = r.user_id ? userMap[r.user_id] : null;
        if (u) return { a: Number(u.company_cost) || 0, v: Number(u.costo_gara) || 0 };
        return { a: Number(r.amount_azienda) || 0, v: Number(r.amount_visibile) || 0 };
    }, [userMap]);

    useEffect(() => {
        if (!onTotals) return;
        let a = 0, v = 0;
        for (const r of rows) { const c = rowCost(r); a += c.a; v += c.v; }
        onTotals(a, v);
    }, [rows, onTotals, rowCost]);

    const addCategory = async () => {
        if (!newCat.trim()) return;
        const { error } = await supabase.from("cost_categories").insert({ scope, name: newCat.trim() });
        if (dbError("Creazione categoria", error)) return;
        setNewCat("");
        load();
    };
    const delCategory = async (id: string) => {
        const { error } = await supabase.from("cost_categories").delete().eq("id", id);
        if (dbError("Eliminazione categoria", error)) return;
        load();
    };
    const addRisorsa = async () => {
        const u = risUser ? userMap[risUser] : null;
        if (!u || !risorse) return;
        const { error } = await supabase.from(table).insert({ label: u.full_name, amount_azienda: 0, amount_visibile: 0, category_id: risorse.id, user_id: u.id, ...(filter || {}) });
        if (dbError("Aggiunta risorsa", error)) return;
        setRisUser("");
        load();
    };
    const addManualVoce = async (catId: string) => {
        if (!nl.trim()) return;
        const { error } = await supabase.from(table).insert({ label: nl.trim(), amount_azienda: nAz ?? 0, amount_visibile: nVis ?? 0, category_id: catId || null, user_id: null, ...(filter || {}) });
        if (dbError("Aggiunta voce", error)) return;
        setNl(""); setNAz(null); setNVis(null); setAddCat(null);
        load();
    };
    const upd = (id: string, field: "amount_azienda" | "amount_visibile", value: number | null) => {
        setRows((p) => p.map((r) => (r.id === id ? { ...r, [field]: value ?? 0 } : r)));
    };
    const save = async (r: CatCost) => {
        const { error } = await supabase.from(table).update({ amount_azienda: r.amount_azienda || 0, amount_visibile: r.amount_visibile || 0 }).eq("id", r.id);
        dbError("Salvataggio importo", error);
    };
    const del = async (id: string) => {
        const { error } = await supabase.from(table).delete().eq("id", id);
        if (dbError("Eliminazione voce", error)) return;
        load();
    };

    const risorse = cats.find((c) => c.name.toLowerCase() === "risorse");
    const otherCats = cats.filter((c) => c.id !== risorse?.id);

    if (loading) return <div className="flex justify-center py-6 text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /></div>;

    const manualRow = (r: CatCost) => (
        <div key={r.id} className="glass-card p-2.5 rounded-lg flex items-center gap-2">
            <span className="flex-1 text-sm text-slate-200 truncate">{r.label}</span>
            <MoneyInput value={r.amount_azienda} onChange={(v) => upd(r.id, "amount_azienda", v)} onCommit={() => save(r)} wrapClass="w-28" className="py-1 text-sm" title="Azienda" />
            {!hideVisibile && <MoneyInput value={r.amount_visibile} onChange={(v) => upd(r.id, "amount_visibile", v)} onCommit={() => save(r)} wrapClass="w-28" className="py-1 text-sm" title="Visibile" />}
            <button onClick={() => del(r.id)} className="text-slate-500 hover:text-rose-400 p-1"><Trash2 className="w-4 h-4" /></button>
        </div>
    );
    const addForm = (catId: string) =>
        addCat === catId ? (
            <div className="glass-card p-2.5 rounded-lg flex flex-wrap items-center gap-2">
                <input value={nl} onChange={(e) => setNl(e.target.value)} placeholder="Oggetto del costo" className="glass-input flex-1 min-w-[120px] py-1 text-sm" autoFocus />
                <MoneyInput value={nAz} onChange={setNAz} wrapClass="w-28" className="py-1 text-sm" placeholder={hideVisibile ? "Importo" : "Azienda"} />
                {!hideVisibile && <MoneyInput value={nVis} onChange={setNVis} wrapClass="w-28" className="py-1 text-sm" placeholder="Visibile" />}
                <button onClick={() => addManualVoce(catId)} className="primary-btn text-xs px-3">Aggiungi</button>
                <button onClick={() => { setAddCat(null); setNl(""); setNAz(null); setNVis(null); }} className="text-xs text-slate-500 px-1">Annulla</button>
            </div>
        ) : (
            <button onClick={() => { setAddCat(catId); setNl(""); setNAz(null); setNVis(null); }} className="text-xs text-indigo-300 hover:text-indigo-200 px-1">+ voce</button>
        );

    const orphan = rows.filter((r) => !r.category_id);
    const availUsers = users.filter((u) => !rows.some((r) => r.user_id === u.id && r.category_id === risorse?.id));

    return (
        <div className="space-y-4">
            {/* RISORSE (fissa) */}
            {withResources && risorse && (
                <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                        <Users className="w-3.5 h-3.5 text-indigo-400" />
                        <h5 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Risorse</h5>
                        <span className="text-[10px] text-slate-600">categoria fissa · costo preso dall&apos;anagrafica{!hideVisibile && " (azienda + visibile)"}</span>
                    </div>
                    {rows.filter((r) => r.category_id === risorse.id && r.user_id).map((r) => {
                        const u = userMap[r.user_id!];
                        return (
                            <div key={r.id} className="glass-card p-2.5 rounded-lg flex items-center gap-2">
                                <span className="flex-1 text-sm text-slate-200 truncate">{u ? u.full_name : r.label}</span>
                                <span className="w-24 text-right text-sm text-slate-400" title="Azienda">{money(Number(u?.company_cost) || 0)}</span>
                                {!hideVisibile && <span className="w-24 text-right text-sm text-slate-400" title="Visibile">{money(Number(u?.costo_gara) || 0)}</span>}
                                <button onClick={() => del(r.id)} className="text-slate-500 hover:text-rose-400 p-1"><Trash2 className="w-4 h-4" /></button>
                            </div>
                        );
                    })}
                    <div className="flex gap-2">
                        <select value={risUser} onChange={(e) => setRisUser(e.target.value)} className="glass-input flex-1 text-sm">
                            <option value="">— seleziona persona —</option>
                            {availUsers.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                        </select>
                        <button onClick={addRisorsa} className="primary-btn text-sm px-3 whitespace-nowrap">+ Persona</button>
                    </div>
                </div>
            )}

            {/* Altre categorie */}
            {otherCats.map((c) => (
                <div key={c.id} className="space-y-1.5">
                    <div className="flex items-center gap-2">
                        <h5 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{c.name}</h5>
                        <button onClick={() => delCategory(c.id)} className="text-slate-600 hover:text-rose-400" title="Elimina categoria"><Trash2 className="w-3 h-3" /></button>
                    </div>
                    {rows.filter((r) => r.category_id === c.id).map(manualRow)}
                    {addForm(c.id)}
                </div>
            ))}

            {/* Senza categoria (voci legacy) */}
            {orphan.length > 0 && (
                <div className="space-y-1.5">
                    <h5 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Senza categoria</h5>
                    {orphan.map(manualRow)}
                </div>
            )}

            {/* Nuova categoria */}
            <div className="flex gap-2 pt-1">
                <input value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCategory()} placeholder="Nuova categoria (es. Affitti, Utenze)" className="glass-input flex-1 text-sm" />
                <button onClick={addCategory} className="px-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 text-sm border border-white/10 whitespace-nowrap">+ Categoria</button>
            </div>
        </div>
    );
}

function SharedCostsView() {
    const [tot, setTot] = useState({ a: 0, v: 0 });
    const onT = useCallback((a: number, v: number) => setTot({ a, v }), []);
    return (
        <div className="space-y-3">
            <div className="flex items-end justify-between">
                <p className="text-xs text-slate-500 max-w-md">
                    Costi condivisi tra i negozi, divisi per categoria. La <span className="text-slate-300">% di ripartizione</span> si imposta dentro ogni negozio.
                </p>
                <p className="text-xs text-slate-400 whitespace-nowrap">Totale: <span className="text-white font-semibold">{money(tot.a)}</span> <span className="text-slate-600">/ {money(tot.v)} visibile</span></p>
            </div>
            <CategorizedCosts scope="shared" table="shared_costs" onTotals={onT} withResources />
        </div>
    );
}

function AltriCostiView() {
    const [tot, setTot] = useState({ a: 0, v: 0 });
    const onT = useCallback((a: number, v: number) => setTot({ a, v }), []);
    return (
        <div className="space-y-3">
            <div className="flex items-end justify-between">
                <p className="text-xs text-slate-500 max-w-md">
                    <span className="text-amber-400/80 font-semibold">Altri costi</span> — solo admin. Non ripartiti e <span className="text-slate-300">non visibili ai negozi</span>, divisi per categoria. Le <span className="text-slate-300">Risorse</span> prendono il costo azienda dall&apos;anagrafica.
                </p>
                <p className="text-xs text-slate-400 whitespace-nowrap">Totale: <span className="text-white font-semibold">{money(tot.a)}</span></p>
            </div>
            <CategorizedCosts scope="other" table="other_costs" onTotals={onT} withResources hideVisibile />
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
