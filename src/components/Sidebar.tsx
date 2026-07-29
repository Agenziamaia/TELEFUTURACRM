"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/utils";
import { useAuth } from "@/context/AuthContext";
import { getInbox, subscribeInbox } from "@/lib/chat";
import {
    Home,
    Send,
    Navigation,
    FolderOpen,
    MessageSquare,
    MessagesSquare,
    Sparkles,
    LogOut,
    Database,
    FilePlus,
    CalendarDays,
    Clock,
    Clock3,
    Users,
    Smartphone,
    Store,
    Package,
    ChevronRight,
    ChevronDown,
    UserCog,
    FileText,
    KeyRound,
    Shield,
    Store as StoreIcon,
    Users as UsersIcon,
    Phone,
    Building2,
    Tag,
    ClipboardList,
    Trophy,
Pin, PinOff,
} from "lucide-react";

// Struttura menù + logica permessi: fonte unica in src/lib/nav.ts
// (amministrabile da Amministrazione → Permessi, tabella role_permissions).
import { NAVIGATION, effectiveAllowed, hubChildKey, groupKey, type NavHub, type NavEntry } from "@/lib/nav";
import { useRolePermissions } from "@/lib/usePermissions";

interface SidebarProps {
    isOpen?: boolean;
    setIsOpen?: (val: boolean) => void;
    /** menù a scomparsa (richiesta Luca 28/07): true = si nasconde da solo e
        ricompare avvicinando il mouse al bordo; false = bloccato aperto. */
    autoHide?: boolean;
    setAutoHide?: (val: boolean) => void;
}

/** Pallino FERIE (Luca 29/07): richieste in attesa, visibile ai DESIGNATI
    dell'incarico 'ferie' (Amministrazione → Utenti → Incarichi); se nessun
    designato, a tutto il pack che approva (amministrativo in su). */
function useFeriePendenti(userId: string | undefined, role: string | undefined): number {
    const [n, setN] = useState(0);
    useEffect(() => {
        if (!userId) { setN(0); return; }
        let vivo = true;
        const load = async () => {
            try {
                const [inc, pend] = await Promise.all([
                    supabase.from("incarichi").select("assegnatari").eq("chiave", "ferie").maybeSingle(),
                    supabase.from("vacation_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
                ]);
                if (!vivo) return;
                const ass = (inc.data?.assegnatari ?? []) as string[];
                const designato = ass.length ? ass.includes(userId) : ["amministrativo", "admin", "dev", "direttore_generale"].includes(role || "");
                setN(designato ? (pend.count ?? 0) : 0);
            } catch { /* pallino best-effort */ }
        };
        load();
        const t = setInterval(load, 90000);
        return () => { vivo = false; clearInterval(t); };
    }, [userId, role]);
    return n;
}

function SidebarInner({ isOpen, setIsOpen, autoHide, setAutoHide }: SidebarProps) {
    const pathname = usePathname();
    // auto-nascondi: "peek" = ricomparsa temporanea perche' il mouse e' sul bordo
    const [peek, setPeek] = useState(false);
    const searchParams = useSearchParams();
    // navigando da un menù "sbirciato" il menù si RITIRA da solo — prima
    // restava aperto in sovrapposizione sulla pagina nuova (Luca 29/07)
    useEffect(() => { setPeek(false); }, [pathname, searchParams]);
    // Voce attiva anche con la query: due voci sulla stessa rotta (es. hub
    // Call Center: /caller e /caller?tab=badge) si distinguono per ?tab=.
    const attivo = (href: string) => {
        const [base, q] = href.split("?");
        if (pathname !== base) return false;
        const wantTab = q ? new URLSearchParams(q).get("tab") : null;
        return (searchParams.get("tab") ?? null) === wantTab;
    };
    const { user, logout } = useAuth();
    // override per ruolo dal DB (Amministrazione → Permessi); default = codice
    const { perms } = useRolePermissions(user?.role);
    const vede = (href: string, roles: string[], group?: string) => effectiveAllowed(user?.role, href, roles, perms, group);
    const feriePendenti = useFeriePendenti(user?.id, user?.role);

    // Totale messaggi chat non letti -> badge sulla voce "Chat"
    const [chatUnread, setChatUnread] = useState(0);
    useEffect(() => {
        if (!user?.id) { setChatUnread(0); return; }
        let alive = true;
        const load = () => getInbox(user.id)
            .then((rows) => { if (alive) setChatUnread(rows.reduce((s, r) => s + (r.unread || 0), 0)); })
            .catch(() => {});
        load();
        const off = subscribeInbox(load);
        return () => { alive = false; off(); };
    }, [user?.id]);

    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
        const initial: Record<string, boolean> = {};
        NAVIGATION.forEach((item) => {
            if (item.type === "group") {
                const hasActiveChild = item.children.some((c) => pathname === c.href);
                initial[item.label] = hasActiveChild;
            }
            if (item.type === "hub") initial[item.name] = pathname.startsWith(item.href);
        });
        return initial;
    });

    // Entrando in una sezione hub (anche da altrove), la voce si esplode da sola
    useEffect(() => {
        NAVIGATION.forEach((item) => {
            if (item.type === "hub" && pathname.startsWith(item.href)) {
                setExpandedGroups((prev) => (prev[item.name] ? prev : { ...prev, [item.name]: true }));
            }
        });
    }, [pathname]);

    const toggleGroup = (label: string) => {
        setExpandedGroups((prev) => ({ ...prev, [label]: !prev[label] }));
    };

    const visibleItems = useMemo(() => {
        if (!user) return [];
        return NAVIGATION.filter((item: NavEntry) => {
            if (item.type === "link" || item.type === "hub") return vede(item.href, item.roles);
            // gruppo: passa dal SUO interruttore (accesso all'hub) E da almeno una voce
            if (!vede(groupKey(item.label), item.roles ?? ["*"], item.label)) return false;
            return item.children.some((c) => vede(c.href, c.roles, item.label));
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, perms]);

    return (
        <>
            {isOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
                    onClick={() => setIsOpen?.(false)}
                />
            )}
            {/* striscia invisibile sul bordo: col menu' nascosto, avvicinando il
                mouse il menu' RICOMPARE (richiesta Luca 28/07) */}
            {autoHide && !peek && (
                <div className="hidden lg:block fixed inset-y-0 left-0 w-3 z-40" onMouseEnter={() => setPeek(true)} />
            )}
            <aside
                id="crm-sidebar"
                onMouseLeave={() => { if (autoHide) setPeek(false); }}
                className={cn(
                    "fixed inset-y-0 left-0 z-50 w-64 flex flex-col bg-[#0f111a]/95 backdrop-blur-xl border-r border-white/5 transition-transform duration-300",
                    isOpen ? "translate-x-0" : "-translate-x-full",
                    autoHide ? (peek ? "lg:translate-x-0 lg:shadow-2xl lg:shadow-black/60" : "lg:-translate-x-full") : "lg:translate-x-0"
                )}>
                <div className="flex-none h-16 flex items-center justify-center border-b border-white/5">
                    <div className="text-xl font-bold tracking-tight text-white flex items-center gap-2.5">
                        {/* file statico diretto: niente ottimizzatore Next per un logo da 5KB */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/logo-crm.png" alt="Telefutura" width={48} height={48} className="w-12 h-12 object-contain" />
                        <span className="text-indigo-400">CRM</span>
                    </div>
                </div>
                <div className="flex-1 flex flex-col justify-between overflow-y-auto">
                    <nav className="flex-1 space-y-1 p-4">
                        <div className="px-4 mb-4 flex items-center justify-between">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Menu</p>
                            {setAutoHide && (
                                /* FIX (Luca 29/07): prima il click lasciava il menù APERTO in
                                   sovrapposizione (peek=true) mentre il contenuto si riallargava
                                   sotto → "pagina scomposta". Ora attivando la scomparsa il
                                   menù SI NASCONDE SUBITO (riappare dal bordo sinistro). */
                                <button
                                    onClick={() => { setAutoHide(!autoHide); setPeek(false); }}
                                    title={autoHide ? "Menù a scomparsa attivo — clicca per bloccarlo aperto" : "Menù bloccato aperto — clicca per farlo scomparire da solo (ricompare avvicinando il mouse al bordo)"}
                                    className={cn("hidden lg:flex p-1.5 rounded-lg transition-colors", autoHide ? "text-violet-300 bg-violet-500/15 hover:bg-violet-500/25" : "text-slate-500 hover:text-white hover:bg-white/10")}
                                >
                                    {autoHide ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                                </button>
                            )}
                        </div>
                        {visibleItems.map((item) => {
                            if (item.type === "link") {
                                const isActive = attivo(item.href);
                                return (
                                    <Link
                                        key={item.name}
                                        href={item.href}
                                        onClick={() => setIsOpen?.(false)}
                                        className={cn("nav-link", isActive ? "active" : "")}
                                    >
                                        <item.icon className={cn("w-5 h-5", isActive ? "text-indigo-400" : "text-slate-500")} />
                                        {item.name}
                                        {item.href === "/chat" && chatUnread > 0 && (
                                            <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-500 text-white text-[10px] font-bold flex items-center justify-center">
                                                {chatUnread > 99 ? "99+" : chatUnread}
                                            </span>
                                        )}
                                    </Link>
                                );
                            }
                            if (item.type === "hub") {
                                const hub = item;
                                const inHub = pathname.startsWith(hub.href);
                                const isExpanded = expandedGroups[hub.name] ?? false;
                                const HubIcon = hub.icon;
                                return (
                                    <div key={hub.name} className="space-y-0.5">
                                        <div className="flex items-center gap-0.5">
                                            <Link
                                                href={hub.href}
                                                onClick={() => {
                                                    setIsOpen?.(false);
                                                    setExpandedGroups((prev) => ({ ...prev, [hub.name]: true }));
                                                }}
                                                className={cn("nav-link flex-1", inHub ? "active" : "")}
                                            >
                                                <HubIcon className={cn("w-5 h-5", inHub ? "text-indigo-400" : "text-slate-500")} />
                                                {hub.name}
                                            </Link>
                                            <button
                                                type="button"
                                                onClick={() => toggleGroup(hub.name)}
                                                className="p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5"
                                                aria-label={isExpanded ? "Chiudi sotto-menu" : "Apri sotto-menu"}
                                            >
                                                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                            </button>
                                        </div>
                                        {isExpanded && (
                                            <Suspense fallback={null}>
                                                <HubSubnav hub={hub} onNavigate={() => setIsOpen?.(false)} />
                                            </Suspense>
                                        )}
                                    </div>
                                );
                            }
                            const group = item;
                            const isExpanded = expandedGroups[group.label] ?? false;
                            const visibleChildren = group.children.filter((c) => vede(c.href, c.roles, group.label));
                            const Icon = group.icon;
                            return (
                                <div key={group.label} className="space-y-0.5">
                                    <button
                                        type="button"
                                        onClick={() => toggleGroup(group.label)}
                                        className={cn(
                                            "nav-link w-full flex items-center justify-between",
                                            visibleChildren.some((c) => pathname === c.href) ? "text-indigo-400" : ""
                                        )}
                                    >
                                        <span className="flex items-center gap-3">
                                            <Icon className="w-5 h-5 text-slate-500" />
                                            {group.label}
                                        </span>
                                        {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                                    </button>
                                    {isExpanded && (
                                        <div className="pl-4 ml-2 border-l border-white/10 space-y-0.5">
                                            {visibleChildren.map((child) => {
                                                const isActive = attivo(child.href);
                                                const ChildIcon = child.icon;
                                                return (
                                                    <Link
                                                        key={child.name}
                                                        href={child.href}
                                                        onClick={() => setIsOpen?.(false)}
                                                        className={cn(
                                                            "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                                                            isActive
                                                                ? "bg-indigo-500/15 text-indigo-300"
                                                                : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                                                        )}
                                                    >
                                                        <ChildIcon className={cn("w-4 h-4", isActive ? "text-indigo-400" : "text-slate-500")} />
                                                        {child.name}
                                                        {child.href === "/collaboratori?tab=ferie" && feriePendenti > 0 && (
                                                            <span title={`${feriePendenti} richieste ferie in attesa`} className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-black text-[10px] font-black flex items-center justify-center animate-pulse">{feriePendenti}</span>
                                                        )}
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </nav>

                    <div className="p-4 border-t border-white/5">
                        <button onClick={logout} className="nav-link w-full text-rose-400 hover:text-rose-300 hover:bg-rose-500/10">
                            <LogOut className="w-5 h-5" />
                            Logout
                        </button>
                    </div>
                </div>
            </aside>
        </>
    );
}

// Sotto-menu del hub: evidenzia la sezione attiva leggendo ?sez= (isolato in Suspense per useSearchParams)
function HubSubnav({ hub, onNavigate }: { hub: NavHub; onNavigate?: () => void }) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { user } = useAuth();
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { perms } = useRolePermissions(user?.role);
    // Le sezioni interne dell'hub seguono i permessi (default: roles del child,
    // o quelli dell'hub se il child non li dichiara) — amministrabili una a una.
    hub = { ...hub, children: hub.children.filter((c) => effectiveAllowed(user?.role, hubChildKey(hub, c), c.roles ?? hub.roles, perms)) };
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const param = hub.param || "sez";
    const sez = pathname === hub.href ? searchParams.get(param) : null;
    return (
        <div className="pl-4 ml-2 border-l border-white/10 space-y-0.5">
            {hub.children.map((c) => {
                const isActive = sez === c.sez;
                const ChildIcon = c.icon;
                return (
                    <Link
                        key={c.sez}
                        href={`${hub.href}?${param}=${c.sez}`}
                        onClick={onNavigate}
                        className={cn(
                            "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                            isActive
                                ? "bg-indigo-500/15 text-indigo-300"
                                : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
                        )}
                    >
                        {ChildIcon ? (
                            <ChildIcon className={cn("w-4 h-4", isActive ? "text-indigo-400" : "text-slate-500")} />
                        ) : (
                            <span
                                className={cn("w-2.5 h-2.5 rounded-full shrink-0", !isActive && "opacity-60")}
                                style={{ backgroundColor: c.color || "#64748b" }}
                            />
                        )}
                        {c.name}
                    </Link>
                );
            })}
        </div>
    );
}

/* useSearchParams richiede un confine Suspense in fase di build (il dev server
   non lo segnala): senza, `next build` fallisce e il deploy resta giu' (502
   del 28/07). Il fallback nullo dura solo il primo istante di idratazione. */
export function Sidebar(props: SidebarProps) {
    return (
        <Suspense fallback={null}>
            <SidebarInner {...props} />
        </Suspense>
    );
}
