"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
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
} from "lucide-react";

type NavLink = { name: string; href: string; icon: React.ComponentType<{ className?: string }>; roles: string[] };
type NavGroup = { type: "group"; label: string; icon: React.ComponentType<{ className?: string }>; children: NavLink[] };
type NavItem = { type: "link"; name: string; href: string; icon: React.ComponentType<{ className?: string }>; roles: string[] };
// Hub: la voce naviga alla pagina E esplode le sotto-sezioni (?param=) sotto di sé
type NavHubChild = { name: string; sez: string; icon?: React.ComponentType<{ className?: string }>; color?: string };
type NavHub = { type: "hub"; name: string; href: string; param?: string; icon: React.ComponentType<{ className?: string }>; roles: string[]; children: NavHubChild[] };

// Gruppi di ruoli reali (roles.ts). "*" = tutti gli account autenticati.
const EVERYONE = ["*"];
const ADMINS = ["admin", "dev", "direttore_generale"];
const MANAGERS = ["admin", "dev", "direttore_generale", "store_manager", "direttore_commerciale", "amministrativo", "direttore_cc", "direttore_ob"];
const CALLCENTER = ["admin", "dev", "direttore_generale", "caller", "back_office_caller", "direttore_cc"];

// Un elemento e' visibile se e' aperto a tutti ("*") o se include il ruolo reale dell'utente.
const canSee = (roles: string[], role?: string | null) =>
    roles.includes("*") || (!!role && roles.includes(role));

const navigation: (NavGroup | NavItem | NavHub)[] = [
    { type: "link", name: "Home", href: "/dashboard", icon: Home, roles: EVERYONE },
    { type: "link", name: "Clienti", href: "/clienti", icon: Users, roles: EVERYONE },
    { type: "link", name: "Caller", href: "/caller", icon: Phone, roles: CALLCENTER },
    {
        type: "group",
        label: "Agenti",
        icon: UserCog,
        children: [
            { name: "Invia pda", href: "/pda/invia", icon: Send, roles: EVERYONE },
            { name: "Gestione pda", href: "/gestione", icon: Database, roles: ADMINS },
        ],
    },
    {
        type: "group",
        label: "Contratti",
        icon: FileText,
        children: [
            { name: "Registra Contratto", href: "/registra-contratto", icon: FilePlus, roles: EVERYONE },
            { name: "Ricerca Contratto", href: "/ricerca-contratto", icon: Database, roles: EVERYONE },
            { name: "Tracking pda", href: "/pda/tracking", icon: Navigation, roles: EVERYONE },
        ],
    },
    {
        type: "group",
        label: "Collaboratori",
        icon: UsersIcon,
        children: [
            { name: "Badge", href: "/collaboratori?tab=badge", icon: Clock, roles: EVERYONE },
            { name: "Ferie", href: "/collaboratori?tab=ferie", icon: CalendarDays, roles: EVERYONE },
            { name: "Malattia", href: "/collaboratori?tab=malattia", icon: Shield, roles: MANAGERS },
            { name: "Ritardi", href: "/collaboratori?tab=ritardi", icon: Clock3, roles: EVERYONE },
        ],
    },
    {
        type: "group",
        label: "Negozio",
        icon: StoreIcon,
        children: [
            { name: "Gestione Usati", href: "/usati", icon: Smartphone, roles: ADMINS },
            { name: "Ordine Merce", href: "/ordine-merce", icon: Package, roles: MANAGERS },
            { name: "Chiusura Negozio", href: "/chiusura", icon: Store, roles: EVERYONE },
            { name: "Password", href: "/password-v2", icon: KeyRound, roles: ["admin", "direttore_generale", "store_manager"] },
        ],
    },
    { type: "link", name: "Calendario", href: "/calendario", icon: CalendarDays, roles: EVERYONE },
    { type: "link", name: "Documentazione", href: "/documentazione", icon: FolderOpen, roles: EVERYONE },
    { type: "link", name: "Comunicazioni", href: "/comunicazioni", icon: MessageSquare, roles: EVERYONE },
    { type: "link", name: "Chat", href: "/chat", icon: MessagesSquare, roles: EVERYONE },
    {
        type: "hub",
        name: "Gare",
        href: "/gare",
        param: "brand",
        icon: Trophy,
        roles: ADMINS,
        children: [
            { name: "WindTre", sez: "w3", color: "#FF6B00" },
            { name: "Vodafone Store", sez: "vs", color: "#E60000" },
            { name: "Vodafone VND", sez: "vnd", color: "#ff6666" },
            { name: "Fastweb", sez: "fastweb", color: "#FFD800" },
            { name: "Sky", sez: "sky", color: "#0072C6" },
            { name: "S4 Energy", sez: "s4", color: "#28a745" },
            { name: "TIM", sez: "tim", color: "#0050FF" },
            { name: "Dojo", sez: "dojo", color: "#14b8a6" },
        ],
    },
    {
        type: "hub",
        name: "Amministrazione",
        href: "/amministrazione",
        icon: Shield,
        roles: ADMINS,
        children: [
            { name: "Utenti", sez: "utenti", icon: UsersIcon },
            { name: "Negozi", sez: "negozi", icon: StoreIcon },
            { name: "Costi condivisi", sez: "condivisi", icon: Building2 },
            { name: "Altri costi", sez: "altri", icon: Tag },
            { name: "Target", sez: "target", icon: ClipboardList },
        ],
    },
];

interface SidebarProps {
    isOpen?: boolean;
    setIsOpen?: (val: boolean) => void;
}

export function Sidebar({ isOpen, setIsOpen }: SidebarProps) {
    const pathname = usePathname();
    const { user, logout } = useAuth();

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
        navigation.forEach((item) => {
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
        navigation.forEach((item) => {
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
        return navigation.filter((item) => {
            if (item.type === "link" || item.type === "hub") return canSee(item.roles, user.role);
            const children = item.children.filter((c) => canSee(c.roles, user.role));
            return children.length > 0;
        });
    }, [user]);

    return (
        <>
            {isOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
                    onClick={() => setIsOpen?.(false)}
                />
            )}
            <aside className={cn(
                "fixed inset-y-0 left-0 z-50 w-64 flex flex-col bg-[#0f111a]/95 backdrop-blur-xl border-r border-white/5 transition-transform duration-300 lg:translate-x-0",
                isOpen ? "translate-x-0" : "-translate-x-full"
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
                        <p className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
                            Menu
                        </p>
                        {visibleItems.map((item) => {
                            if (item.type === "link") {
                                const isActive = pathname === item.href;
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
                            const visibleChildren = group.children.filter((c) => canSee(c.roles, user?.role));
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
                                                const isActive = pathname === child.href;
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
