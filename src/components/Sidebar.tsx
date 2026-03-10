"use client";

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
    Users,
    Smartphone
} from "lucide-react";

const navigation = [
    { name: "Home", href: "/dashboard", icon: Home, roles: ["admin", "agente"] },
    { name: "Clienti", href: "/clienti", icon: Users, roles: ["admin", "agente"] },
    { name: "Invia pda", href: "/pda/invia", icon: Send, roles: ["admin", "agente"] },
    { name: "Registra Contratto", href: "/registra-contratto", icon: FilePlus, roles: ["admin", "agente"] },
    { name: "Ricerca Contratto", href: "/ricerca-contratto", icon: Database, roles: ["admin", "agente"] },
    { name: "Gestione pda", href: "/gestione", icon: Database, roles: ["admin"] },
    { name: "Gestione Usati", href: "/usati", icon: Smartphone, roles: ["admin"] },
    { name: "Tracking pda", href: "/pda/tracking", icon: Navigation, roles: ["admin", "agente"] },
    { name: "Calendario", href: "/calendario", icon: CalendarDays, roles: ["admin", "agente"] },
    { name: "Documentazione", href: "/documentazione", icon: FolderOpen, roles: ["admin", "agente"] },
    { name: "Comunicazioni", href: "/comunicazioni", icon: MessageSquare, roles: ["admin", "agente"] },
];

interface SidebarProps {
    isOpen?: boolean;
    setIsOpen?: (val: boolean) => void;
}

export function Sidebar({ isOpen, setIsOpen }: SidebarProps) {
    const pathname = usePathname();
    const { user, logout } = useAuth();

    // Filter navigation based on role
    const filteredNavigation = navigation.filter(item => {
        if (!user) return false;
        return item.roles.includes(user.role);
    });

    return (
        <>
            {/* Mobile Backdrop */}
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
                    {/* Placeholder Logo */}
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
                        {navigation.filter(item => user && item.roles.includes(user.role)).map((item) => {
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
