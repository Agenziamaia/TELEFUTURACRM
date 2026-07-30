"use client";

// COMUNICAZIONI v2 (Luca 30/07, mig. 104): da sola-lettura a sezione completa.
// Due generi: BACHECA (campanella; si traccia chi l'ha aperta) e POP-UP
// (anche modale sopra tutto con pulsante Conferma; si traccia chi conferma —
// il modale vive in src/components/ComunicazioniPopup.tsx, montato nel layout).
// Chi puo' creare e verso quali ruoli si amministra da Permessi
// (cap:/comunicazioni:*). Le letture ora stanno a DB (comunicazioni_ricevute):
// il localStorage resta solo come eredita' del vecchio "letto" locale.
import { useState, useEffect, useCallback, useMemo } from "react";
import { Bell, Info, AlertTriangle, CheckCircle2, Plus, Eye, X } from "lucide-react";
import { cn } from "@/utils";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import { useRolePermissions } from "@/lib/usePermissions";
import { capAllowed, ruoliDestinatariComunicazioni, CAP_COM_CREA, CAP_COMUNICAZIONI } from "@/lib/capabilities";
import { ROLES } from "@/lib/roles";

const STORAGE_KEY = "comunicazioni_read_ids";

export type Comunicazione = {
    id: number;
    title: string;
    date_display: string;
    type: string;
    content: string;
    kind: string | null;             // 'bacheca' | 'popup'
    target_roles: string[] | null;   // NULL = tutti
    created_by: string | null;
    created_by_name: string | null;
};

type Ricevuta = {
    comunicazione_id: number;
    user_id: string;
    user_name: string | null;
    letto_il: string | null;
    confermato_il: string | null;
};

function getLocalReadSet(): Set<number> {
    if (typeof window === "undefined") return new Set();
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return new Set(raw ? (JSON.parse(raw) as number[]) : []);
    } catch { return new Set(); }
}

const getTypeStyles = (type: string) => {
    switch (type) {
        case "warning": return { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-400/10", border: "border-amber-400/20" };
        case "success": return { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/20" };
        default: return { icon: Info, color: "text-blue-400", bg: "bg-blue-400/10", border: "border-blue-400/20" };
    }
};

const roleLabel = (id: string) => ROLES.find((r) => r.id === id)?.label || id;

function dataDisplayOggi(): string {
    const d = new Date();
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" }) +
        ", " + d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

export default function Comunicazioni() {
    const { user } = useAuth();
    const role = user?.role || "";
    const { perms } = useRolePermissions(role);
    const canCreate = capAllowed(role, CAP_COMUNICAZIONI.section, CAP_COM_CREA, perms);
    const destinatariPossibili = ruoliDestinatariComunicazioni(role, perms);
    // Le ricevute (chi ha letto/confermato) le vede l'amministrazione e, per le
    // proprie comunicazioni, chi le ha create (es. lo store manager).
    const isAdminRicevute = ["amministrativo", "admin", "dev", "direttore_generale"].includes(role);

    const [list, setList] = useState<Comunicazione[]>([]);
    const [ricevute, setRicevute] = useState<Ricevuta[]>([]);       // tutte (per i contatori)
    const [mieRicevute, setMieRicevute] = useState<Map<number, Ricevuta>>(new Map());
    const [localRead, setLocalRead] = useState<Set<number>>(new Set());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [espansa, setEspansa] = useState<number | null>(null);    // pannello ricevute aperto

    const fetchAll = useCallback(async () => {
        const { data, error: e } = await supabase
            .from("comunicazioni")
            .select("id, title, date_display, type, content, kind, target_roles, created_by, created_by_name")
            .order("created_at", { ascending: false });
        if (e) { setError(e.message); setList([]); setLoading(false); return; }
        setError(null);
        setList((data ?? []) as Comunicazione[]);
        const { data: ric } = await supabase
            .from("comunicazioni_ricevute")
            .select("comunicazione_id, user_id, user_name, letto_il, confermato_il")
            .limit(10000);
        const tutte = (ric ?? []) as Ricevuta[];
        setRicevute(tutte);
        if (user?.id) setMieRicevute(new Map(tutte.filter((r) => r.user_id === user.id).map((r) => [r.comunicazione_id, r])));
        setLocalRead(getLocalReadSet());
        setLoading(false);
    }, [user?.id]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    // Destinatario? La lista mostra le comunicazioni indirizzate al proprio
    // ruolo; chi le ha create (o l'amministrazione) vede anche le altre.
    const visibili = useMemo(() => list.filter((c) =>
        !c.target_roles?.length || c.target_roles.includes(role) || c.created_by === user?.id || isAdminRicevute
    ), [list, role, user?.id, isAdminRicevute]);

    const isLetta = useCallback((id: number) =>
        !!mieRicevute.get(id)?.letto_il || localRead.has(id), [mieRicevute, localRead]);
    const isConfermata = useCallback((id: number) => !!mieRicevute.get(id)?.confermato_il, [mieRicevute]);

    const scriviRicevuta = useCallback(async (comId: number, conferma: boolean) => {
        if (!user?.id) return;
        const esistente = mieRicevute.get(comId);
        const ora = new Date().toISOString();
        const riga: Ricevuta = {
            comunicazione_id: comId,
            user_id: user.id,
            user_name: user.name || null,
            letto_il: esistente?.letto_il || ora,
            confermato_il: conferma ? (esistente?.confermato_il || ora) : (esistente?.confermato_il ?? null),
        };
        const { error: e } = await supabase.from("comunicazioni_ricevute")
            .upsert([riga], { onConflict: "comunicazione_id,user_id" });
        if (e) { setError(e.message); return; }
        setMieRicevute((p) => new Map(p).set(comId, riga));
        setRicevute((p) => {
            const senza = p.filter((r) => !(r.comunicazione_id === comId && r.user_id === user.id));
            return [...senza, riga];
        });
        try {
            const s = getLocalReadSet(); s.add(comId);
            localStorage.setItem(STORAGE_KEY, JSON.stringify([...s]));
        } catch { /* ignore */ }
        setLocalRead((p) => new Set(p).add(comId));
    }, [user?.id, user?.name, mieRicevute]);

    const handleMarkAllRead = async () => {
        for (const c of visibili) if (!isLetta(c.id)) await scriviRicevuta(c.id, false);
    };
    const unreadCount = visibili.filter((c) => !isLetta(c.id)).length;

    // ─── Creazione ───────────────────────────────────────────────────────────
    const [formOpen, setFormOpen] = useState(false);
    const [fTitle, setFTitle] = useState("");
    const [fContent, setFContent] = useState("");
    const [fType, setFType] = useState<"info" | "warning" | "success">("info");
    const [fKind, setFKind] = useState<"bacheca" | "popup">("bacheca");
    const [fTutti, setFTutti] = useState(true);
    const [fRuoli, setFRuoli] = useState<string[]>([]);
    const [salvando, setSalvando] = useState(false);
    const puoTutti = destinatariPossibili.length === ROLES.length;
    useEffect(() => { if (!puoTutti) setFTutti(false); }, [puoTutti]);

    const salvaComunicazione = async () => {
        if (!fTitle.trim() || !fContent.trim()) { setError("Titolo e testo sono obbligatori."); return; }
        const targets = fTutti ? null : fRuoli;
        if (!fTutti && fRuoli.length === 0) { setError("Scegli almeno un ruolo destinatario (o Tutti)."); return; }
        setSalvando(true);
        const { error: e } = await supabase.from("comunicazioni").insert({
            title: fTitle.trim(),
            content: fContent.trim(),
            type: fType,
            kind: fKind,
            target_roles: targets,
            created_by: user?.id || null,
            created_by_name: user?.name || null,
            date_display: dataDisplayOggi(),
        });
        setSalvando(false);
        if (e) { setError(e.message); return; }
        setError(null);
        setFormOpen(false);
        setFTitle(""); setFContent(""); setFType("info"); setFKind("bacheca"); setFTutti(puoTutti); setFRuoli([]);
        fetchAll();
    };

    const contatori = useCallback((comId: number) => {
        const r = ricevute.filter((x) => x.comunicazione_id === comId);
        return { letture: r.filter((x) => x.letto_il).length, conferme: r.filter((x) => x.confermato_il).length };
    }, [ricevute]);

    const inputStyle = "w-full bg-black/40 border border-white/10 rounded-xl text-slate-100 text-sm py-2.5 px-3.5 outline-none focus:border-violet-500/50";

    return (
        <div className="w-full max-w-4xl mx-auto">
            <div className="mb-8 flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <h2 className="text-3xl font-bold text-white mb-2">Comunicazioni</h2>
                    <p className="text-slate-400">Avvisi e aggiornamenti importanti dal back office</p>
                </div>
                <div className="flex items-center gap-2.5">
                    {canCreate && (
                        <button
                            type="button"
                            onClick={() => setFormOpen(true)}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold transition-colors"
                        >
                            <Plus className="w-4 h-4" /> Nuova comunicazione
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={handleMarkAllRead}
                        className={cn(
                            "p-3 rounded-full border transition-colors relative",
                            unreadCount > 0
                                ? "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
                                : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                        )}
                        title={unreadCount > 0 ? "Segna tutti come letti" : "Nessun nuovo"}
                    >
                        <Bell className="w-6 h-6" />
                        {unreadCount > 0 && (
                            <span className="absolute top-0 right-0 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-rose-500 text-[10px] font-bold text-white border-2 border-[#0f111a] rounded-full">
                                {unreadCount}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            {error && (
                <div className="mb-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="py-12 text-center text-slate-400">Caricamento...</div>
            ) : (
                <div className="space-y-4">
                    {visibili.map((com) => {
                        const read = isLetta(com.id);
                        const styles = getTypeStyles(com.type);
                        const Icon = styles.icon;
                        const isPopup = com.kind === "popup";
                        const perMe = !com.target_roles?.length || com.target_roles.includes(role);
                        const vedeRicevute = isAdminRicevute || (!!user?.id && com.created_by === user.id);
                        const cnt = vedeRicevute ? contatori(com.id) : null;
                        const dettaglio = espansa === com.id
                            ? ricevute.filter((r) => r.comunicazione_id === com.id && r.letto_il)
                                .sort((a, b) => (b.confermato_il || b.letto_il || "").localeCompare(a.confermato_il || a.letto_il || ""))
                            : [];
                        return (
                            <div
                                key={com.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => !read && scriviRicevuta(com.id, false)}
                                onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !read) scriviRicevuta(com.id, false); }}
                                className={cn(
                                    "glass-card p-6 relative overflow-hidden transition-all cursor-pointer",
                                    !read && "border-l-4 border-l-primary"
                                )}
                            >
                                {!read && (
                                    <div className="absolute top-6 right-6 flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                                        <span className="text-xs font-semibold text-primary uppercase tracking-wider">Nuovo</span>
                                    </div>
                                )}

                                <div className="flex gap-4">
                                    <div className={cn("shrink-0 w-12 h-12 rounded-xl flex items-center justify-center border", styles.bg, styles.border, styles.color)}>
                                        <Icon className="w-6 h-6" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="mb-1">
                                            <h3 className={cn("text-lg font-semibold", !read ? "text-white" : "text-slate-200")}>
                                                {com.title}
                                            </h3>
                                            <p className="text-sm text-slate-500">
                                                {com.date_display}
                                                {com.created_by_name ? ` — ${com.created_by_name}` : ""}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 flex-wrap mt-1.5">
                                            {isPopup && (
                                                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30">
                                                    Pop-up con conferma
                                                </span>
                                            )}
                                            {vedeRicevute && !!com.target_roles?.length && (
                                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-slate-400 border border-white/10">
                                                    → {com.target_roles.map(roleLabel).join(", ")}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-slate-300 mt-3 leading-relaxed whitespace-pre-wrap">
                                            {com.content}
                                        </p>

                                        <div className="mt-4 flex items-center gap-3 flex-wrap" onClick={(e) => e.stopPropagation()}>
                                            {isPopup && perMe && (
                                                isConfermata(com.id) ? (
                                                    <span className="flex items-center gap-1.5 text-sm font-bold text-emerald-400">
                                                        <CheckCircle2 className="w-4 h-4" /> Confermata
                                                    </span>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => scriviRicevuta(com.id, true)}
                                                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition-colors"
                                                    >
                                                        ✓ Conferma lettura
                                                    </button>
                                                )
                                            )}
                                            {vedeRicevute && cnt && (
                                                <button
                                                    type="button"
                                                    onClick={() => setEspansa(espansa === com.id ? null : com.id)}
                                                    className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
                                                    title="Chi l'ha letta / confermata"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                    {cnt.letture} lettur{cnt.letture === 1 ? "a" : "e"}
                                                    {isPopup ? ` · ${cnt.conferme} conferm${cnt.conferme === 1 ? "a" : "e"}` : ""}
                                                    <span className="text-[10px]">{espansa === com.id ? "▲" : "▼"}</span>
                                                </button>
                                            )}
                                        </div>

                                        {espansa === com.id && vedeRicevute && (
                                            <div className="mt-3 rounded-xl border border-white/10 bg-black/30 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                                                {dettaglio.length === 0 ? (
                                                    <div className="p-3 text-sm text-slate-500">Nessuno l&apos;ha ancora aperta.</div>
                                                ) : dettaglio.map((r) => (
                                                    <div key={r.user_id} className="flex items-center gap-3 px-3.5 py-2 border-b border-white/5 last:border-b-0 text-sm">
                                                        <span className="text-slate-200 font-medium">{r.user_name || r.user_id}</span>
                                                        <span className="ml-auto text-xs text-slate-500">
                                                            letta {r.letto_il ? new Date(r.letto_il).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
                                                        </span>
                                                        {isPopup && (
                                                            r.confermato_il ? (
                                                                <span className="text-xs font-bold text-emerald-400">
                                                                    ✓ confermata {new Date(r.confermato_il).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                                                                </span>
                                                            ) : (
                                                                <span className="text-xs text-amber-400">non confermata</span>
                                                            )
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {!loading && visibili.length === 0 && !error && (
                <div className="py-12 text-center text-slate-500">Nessuna comunicazione.</div>
            )}

            {/* ─── Modale creazione ─── */}
            {formOpen && (
                <div className="fixed inset-0 bg-black/70 z-[1200] flex items-center justify-center p-4" onClick={() => setFormOpen(false)} role="dialog" aria-modal="true">
                    <div className="bg-[#12141f] border border-white/10 rounded-2xl w-full max-w-[640px] max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between py-5 px-6 border-b border-white/10">
                            <h3 className="text-lg font-bold text-white">Nuova comunicazione</h3>
                            <button type="button" onClick={() => setFormOpen(false)} className="text-slate-500 hover:text-white"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-6 space-y-5">
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Genere</label>
                                <div className="flex gap-2 mt-2">
                                    {([
                                        { id: "bacheca", label: "📣 Bacheca", desc: "campanella + traccia chi la legge" },
                                        { id: "popup", label: "🚨 Pop-up con conferma", desc: "modale sopra tutto, va confermata" },
                                    ] as const).map((k) => (
                                        <button key={k.id} type="button" onClick={() => setFKind(k.id)}
                                            className={cn("flex-1 p-3 rounded-xl border text-left transition-all",
                                                fKind === k.id ? "border-violet-500 bg-violet-500/10" : "border-white/10 hover:border-white/25")}>
                                            <div className="text-sm font-bold text-white">{k.label}</div>
                                            <div className="text-[11px] text-slate-500 mt-0.5">{k.desc}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Titolo</label>
                                <input type="text" value={fTitle} onChange={(e) => setFTitle(e.target.value)} className={inputStyle + " mt-2"} placeholder="Es. Nuovi listini da lunedì" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Testo</label>
                                <textarea value={fContent} onChange={(e) => setFContent(e.target.value)} className={inputStyle + " mt-2 min-h-[120px] resize-y"} placeholder="Il contenuto della comunicazione…" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Aspetto</label>
                                <div className="flex gap-2 mt-2">
                                    {([["info", "ℹ️ Info"], ["warning", "⚠️ Avviso"], ["success", "✅ Buone notizie"]] as const).map(([t, l]) => (
                                        <button key={t} type="button" onClick={() => setFType(t)}
                                            className={cn("px-3.5 py-1.5 rounded-full border text-sm transition-all",
                                                fType === t ? "border-violet-500 bg-violet-500/10 text-white" : "border-white/10 text-slate-400 hover:border-white/25")}>
                                            {l}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Destinatari</label>
                                <div className="flex gap-2 mt-2 flex-wrap">
                                    {puoTutti && (
                                        <button type="button" onClick={() => { setFTutti(true); setFRuoli([]); }}
                                            className={cn("px-3.5 py-1.5 rounded-full border text-sm font-bold transition-all",
                                                fTutti ? "border-emerald-500 bg-emerald-500/10 text-emerald-300" : "border-white/10 text-slate-400 hover:border-white/25")}>
                                            Tutti
                                        </button>
                                    )}
                                    {destinatariPossibili.map((rid) => {
                                        const sel = !fTutti && fRuoli.includes(rid);
                                        return (
                                            <button key={rid} type="button"
                                                onClick={() => { setFTutti(false); setFRuoli((p) => p.includes(rid) ? p.filter((x) => x !== rid) : [...p, rid]); }}
                                                className={cn("px-3.5 py-1.5 rounded-full border text-sm transition-all",
                                                    sel ? "border-violet-500 bg-violet-500/10 text-white" : "border-white/10 text-slate-400 hover:border-white/25")}>
                                                {roleLabel(rid)}
                                            </button>
                                        );
                                    })}
                                </div>
                                {destinatariPossibili.length === 0 && (
                                    <p className="text-xs text-amber-400 mt-2">Il tuo ruolo non ha destinatari abilitati: chiedi all&apos;amministrazione (Permessi → Comunicazioni).</p>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center justify-end gap-2.5 py-4 px-6 border-t border-white/10">
                            <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2.5 rounded-xl border border-white/10 text-slate-300 text-sm">Annulla</button>
                            <button type="button" disabled={salvando} onClick={salvaComunicazione}
                                className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold disabled:opacity-40">
                                {salvando ? "Invio…" : fKind === "popup" ? "Pubblica il pop-up" : "Pubblica in bacheca"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
