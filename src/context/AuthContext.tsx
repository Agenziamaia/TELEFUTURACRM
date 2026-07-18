"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { RoleId } from "@/lib/roles";

// Ruolo reale (da app_users / roles.ts). "admin" mantiene visibilita' globale.
export type Role = RoleId;

interface User {
    id: string;            // app_users.id (uuid) — identita' reale usata anche dalla chat
    name: string;          // full_name
    email: string;
    role: Role;
    grade?: string | null;
    negozio?: string;      // primary_store (chiave storica: molti file leggono user.negozio)
    mustChange?: boolean;  // primo accesso: cambio password obbligatorio
}

interface LoginResult { ok: boolean; error?: string; mustChange?: boolean; email?: string }

interface AuthContextType {
    user: User | null;
    login: (email: string, password: string) => Promise<LoginResult>;
    completeFirstLogin: (email: string, oldPw: string, newPw: string) => Promise<LoginResult>;
    logout: () => void;
    isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function rowToUser(row: any): User {
    return {
        id: row.id,
        name: row.full_name,
        email: row.email,
        role: row.role as Role,
        grade: row.grade,
        negozio: row.primary_store || undefined,
        mustChange: !!row.must_change_password,
    };
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const router = useRouter();
    const pathname = usePathname();

    // Ripristina la sessione da localStorage al mount (evita logout al refresh)
    useEffect(() => {
        const saved = localStorage.getItem("crm_session");
        if (saved) {
            try { setUser(JSON.parse(saved)); } catch { localStorage.removeItem("crm_session"); }
        } else if (pathname !== "/") {
            router.push("/");
        }
    }, [pathname, router]);

    // Protezione rotte (ruoli reali). admin/direttore_generale = accesso pieno.
    useEffect(() => {
        if (!user) return;
        const isAdmin = user.role === "admin" || user.role === "dev" || user.role === "direttore_generale";
        const adminOnly = ["/gestione", "/amministrazione", "/gare"];
        if (!isAdmin && adminOnly.some((p) => pathname.startsWith(p))) {
            router.push("/dashboard");
        }
    }, [user, pathname, router]);

    const persist = (u: User) => {
        setUser(u);
        localStorage.setItem("crm_session", JSON.stringify(u));
    };

    const login = async (email: string, password: string): Promise<LoginResult> => {
        const { data, error } = await supabase.rpc("verify_login", {
            p_email: email.trim(),
            p_password: password,
        });
        if (error) return { ok: false, error: error.message };
        const row = Array.isArray(data) ? data[0] : data;
        if (!row) return { ok: false, error: "Email o password non validi" };
        const u = rowToUser(row);
        if (u.mustChange) {
            // Non persistiamo finche' la password temporanea non e' stata cambiata
            return { ok: true, mustChange: true, email: u.email };
        }
        persist(u);
        return { ok: true };
    };

    const completeFirstLogin = async (email: string, oldPw: string, newPw: string): Promise<LoginResult> => {
        const { data, error } = await supabase.rpc("change_password", {
            p_email: email.trim(),
            p_old: oldPw,
            p_new: newPw,
        });
        if (error) return { ok: false, error: error.message };
        if (data !== true) return { ok: false, error: "Password attuale non valida" };
        // Rileggo l'utente aggiornato (must_change_password ora false)
        const res = await supabase.rpc("verify_login", { p_email: email.trim(), p_password: newPw });
        const row = Array.isArray(res.data) ? res.data[0] : res.data;
        if (!row) return { ok: false, error: "Errore di accesso dopo il cambio password" };
        persist(rowToUser(row));
        return { ok: true };
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem("crm_session");
        router.push("/");
    };

    return (
        <AuthContext.Provider value={{ user, login, completeFirstLogin, logout, isAuthenticated: !!user }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
