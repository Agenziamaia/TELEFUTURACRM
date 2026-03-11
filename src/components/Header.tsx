"use client";

import { Search, Sun, Maximize, Bell, Menu, LogOut, ArrowLeft } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useRef, useEffect } from "react";

const CRM_BACK_EVENT = "crm-back";

export function Header({ onMenuClick }: { onMenuClick?: () => void }) {
    const router = useRouter();
    const pathname = usePathname();
    const { user, logout } = useAuth();
    const lastPathRef = useRef<string | null>(null);
    const previousPathRef = useRef<string | null>(null);

    useEffect(() => {
        if (lastPathRef.current !== pathname) {
            previousPathRef.current = lastPathRef.current;
            lastPathRef.current = pathname;
        }
    }, [pathname]);

    const handleBack = () => {
        const event = new CustomEvent(CRM_BACK_EVENT, { cancelable: true });
        window.dispatchEvent(event);
        if (event.defaultPrevented) return;
        const target = previousPathRef.current;
        if (target && target !== pathname) {
            router.push(target);
        } else {
            router.push("/dashboard");
        }
    };

    // Compute initials from name (e.g., "Luca Perotta" -> "LP")
    const getInitials = (name: string) => {
        return name
            .split(' ')
            .map(n => n[0])
            .join('')
            .toUpperCase()
            .substring(0, 2);
    };
    return (
        <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b border-white/5 bg-[#0f111a]/80 backdrop-blur-xl px-4 md:px-6">
            <div className="flex flex-1 gap-2 md:gap-4 items-center">
                <button
                    onClick={handleBack}
                    className="flex items-center gap-2 p-2 -ml-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
                    title="Torna alla sezione precedente"
                >
                    <ArrowLeft className="w-5 h-5" />
                    <span className="hidden sm:inline text-sm font-medium">Indietro</span>
                </button>
                <button
                    onClick={onMenuClick}
                    className="lg:hidden p-2 text-slate-400 hover:text-white transition-colors"
                >
                    <Menu className="w-6 h-6" />
                </button>
                {/* Search Bar Replica */}
                <div className="max-w-md w-full relative hidden md:block">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-slate-500" />
                    </div>
                    <input
                        type="text"
                        className="glass-input w-full pl-10 h-10 text-sm"
                        placeholder="Search for anything..."
                    />
                </div>
            </div>

            <div className="flex items-center gap-6">
                <button className="text-slate-400 hover:text-white transition-colors">
                    <Sun className="h-5 w-5" />
                </button>
                <button className="text-slate-400 hover:text-white transition-colors">
                    <Maximize className="h-5 w-5" />
                </button>
                <button className="text-slate-400 hover:text-white transition-colors relative">
                    <Bell className="h-5 w-5" />
                    <span className="absolute top-0 right-0 w-2 h-2 bg-rose-500 rounded-full"></span>
                </button>

                {/* Mobile Quick Logout */}
                <button
                    onClick={logout}
                    className="lg:hidden text-rose-400 hover:text-rose-300 transition-colors p-2"
                >
                    <LogOut className="h-5 w-5" />
                </button>

                {/* User Profile */}
                <div className="flex items-center gap-3 pl-4 border-l border-white/10 cursor-pointer">
                    <div className="hidden text-right md:block">
                        <p className="text-sm font-medium text-white leading-none">{user?.name || "Ospite"}</p>
                        <p className="text-xs text-slate-400 mt-1 capitalize">{user?.role || "Nessun Ruolo"}</p>
                    </div>
                    <div className="w-9 h-9 rounded-full bg-indigo-500/20 text-indigo-300 font-bold border-2 border-indigo-500/40 flex items-center justify-center overflow-hidden">
                        {user?.name ? getInitials(user.name) : 'A'}
                    </div>
                </div>
            </div>
        </header>
    );
}
