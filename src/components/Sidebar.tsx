"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/utils";
import { useAuth } from "@/context/AuthContext";
import {
    Home,
    Send,
    Navigation,
    FolderOpen,
    MessageSquare,
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
} from "lucide-react";

type NavLink = { name: string; href: string; icon: React.ComponentType<{ className?: string }>; roles: string[] };
type NavGroup = { type: "group"; label: string; icon: React.ComponentType<{ className?: string }>; children: NavLink[] };
type NavItem = { type: "link"; name: string; href: string; icon: React.ComponentType<{ className?: string }>; roles: string[] };

const navigation: (NavGroup | NavItem)[] = [
    { type: "link", name: "Home", href: "/dashboard", icon: Home, roles: ["admin", "agente"] },
    { type: "link", name: "Clienti", href: "/clienti", icon: Users, roles: ["admin", "agente"] },
    { type: "link", name: "Caller", href: "/caller", icon: Phone, roles: ["admin", "back_office", "supervisore"] },
    {
        type: "group",
        label: "Agenti",
        icon: UserCog,
        children: [
            { name: "Invia pda", href: "/pda/invia", icon: Send, roles: ["admin", "agente"] },
            { name: "Gestione pda", href: "/gestione", icon: Database, roles: ["admin"] },
        ],
    },
    {
        type: "group",
        label: "Contratti",
        icon: FileText,
        children: [
            { name: "Registra Contratto", href: "/registra-contratto", icon: FilePlus, roles: ["admin", "agente"] },
            { name: "Ricerca Contratto", href: "/ricerca-contratto", icon: Database, roles: ["admin", "agente"] },
            { name: "Tracking pda", href: "/pda/tracking", icon: Navigation, roles: ["admin", "agente"] },
        ],
    },
    {
        type: "group",
        label: "Collaboratori",
        icon: UsersIcon,
        children: [
            { name: "Badge", href: "/collaboratori?tab=badge", icon: Clock, roles: ["admin", "store_manager", "back_office", "supervisore", "agente"] },
            { name: "Ferie", href: "/collaboratori?tab=ferie", icon: CalendarDays, roles: ["admin", "store_manager", "back_office", "supervisore", "agente"] },
            { name: "Malattia", href: "/collaboratori?tab=malattia", icon: Shield, roles: ["admin", "store_manager", "back_office", "supervisore"] },
            { name: "Ritardi", href: "/collaboratori?tab=ritardi", icon: Clock3, roles: ["admin", "store_manager", "back_office", "supervisore", "agente"] },
        ],
    },
    {
        type: "group",
        label: "Negozio",
        icon: StoreIcon,
        children: [
            { name: "Gestione Usati", href: "/usati", icon: Smartphone, roles: ["admin"] },
            { name: "Ordine Merce", href: "/ordine-merce", icon: Package, roles: ["admin", "store_manager", "back_office"] },
            { name: "Chiusura Negozio", href: "/chiusura", icon: Store, roles: ["admin", "agente"] },
            { name: "Password", href: "/password-v2", icon: KeyRound, roles: ["admin", "store_manager"] },
        ],
    },
    { type: "link", name: "Calendario", href: "/calendario", icon: CalendarDays, roles: ["admin", "agente"] },
    { type: "link", name: "Documentazione", href: "/documentazione", icon: FolderOpen, roles: ["admin", "agente"] },
    { type: "link", name: "Comunicazioni", href: "/comunicazioni", icon: MessageSquare, roles: ["admin", "agente"] },
    { type: "link", name: "Amministrazione", href: "/amministrazione", icon: Shield, roles: ["admin"] },
];

interface SidebarProps {
    isOpen?: boolean;
    setIsOpen?: (val: boolean) => void;
}

export function Sidebar({ isOpen, setIsOpen }: SidebarProps) {
    const pathname = usePathname();
    const { user, logout } = useAuth();

    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
        const initial: Record<string, boolean> = {};
        navigation.forEach((item) => {
            if (item.type === "group") {
                const hasActiveChild = item.children.some((c) => pathname === c.href);
                initial[item.label] = hasActiveChild;
            }
        });
        return initial;
    });

    const toggleGroup = (label: string) => {
        setExpandedGroups((prev) => ({ ...prev, [label]: !prev[label] }));
    };

    const visibleItems = useMemo(() => {
        if (!user) return [];
        return navigation.filter((item) => {
            if (item.type === "link") return item.roles.includes(user.role);
            const children = item.children.filter((c) => c.roles.includes(user.role));
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
                    <div className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">T</div>
                        Telefutura <span className="text-indigo-400">CRM</span>
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
                                    </Link>
                                );
                            }
                            const group = item;
                            const isExpanded = expandedGroups[group.label] ?? false;
                            const visibleChildren = group.children.filter((c) => user && c.roles.includes(user.role));
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
