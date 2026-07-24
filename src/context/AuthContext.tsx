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
    canSwitchRole?: boolean;  // puo' guardare il CRM con un altro ruolo (solo Luca)
}

interface LoginResult { ok: boolean; error?: string; mustChange?: boolean; email?: string }

interface AuthContextType {
    user: User | null;        // ATTENZIONE: role qui e' il ruolo EFFETTIVO (vedi viewAs)
    realRole: Role | null;    // ruolo vero dell'account, non cambia mai
    viewAs: Role | null;      // ruolo che si sta simulando (null = nessuno)
    setViewAs: (r: Role | null) => void;
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
        canSwitchRole: !!row.can_switch_role,
    };
}

export function AuthProvider({ children }: { children: ReactNode }) {
    // baseUser = account vero (quello che finisce in localStorage).
    // viewAs = ruolo simulato: NON viene mai scritto sull'account.
    const [baseUser, setUser] = useState<User | null>(null);
    const [viewAs, setViewAsState] = useState<Role | null>(null);
    useEffect(() => {
        try { const v = localStorage.getItem("crm_view_as"); if (v) setViewAsState(v as Role); } catch { }
    }, []);
    const setViewAs = (r: Role | null) => {
        setViewAsState(r);
        try { if (r) localStorage.setItem("crm_view_as", r); else localStorage.removeItem("crm_view_as"); } catch { }
    };
    // Il permesso sta sull'account vero: cosi' il selettore resta visibile anche
    // mentre si simula un ruolo basso, altrimenti non si potrebbe piu' tornare admin.
    const puoCambiare = !!baseUser?.canSwitchRole;
    const user: User | null = baseUser
        ? { ...baseUser, role: (puoCambiare && viewAs) ? viewAs : baseUser.role }
        : null;
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

    // Segnalazione 69: la conversazione dell'Assistente AI si azzera SOLO al
    // logout (navigando fra le pagine resta). Qui ripuliamo la sua chiave.
    const clearAiChat = (uid?: string | null) => {
        try {
            if (uid) localStorage.removeItem(`crm_ai_chat_${uid}`);
            else Object.keys(localStorage).filter(k => k.startsWith("crm_ai_chat_")).forEach(k => localStorage.removeItem(k));
        } catch { /* ignore */ }
    };

    const logout = () => {
        clearAiChat(user?.id);
        setViewAs(null);   // il "guarda come" non sopravvive al logout
        setUser(null);
        localStorage.removeItem("crm_session");
        localStorage.removeItem("crm_last_activity");
        router.push("/");
    };

    // Segnalazione 49: dopo 15 minuti di inattivita' (nessun click/tasto/scroll)
    // la sessione scade — l'utente torna al login e, non essendoci piu' sessione,
    // sparisce dalla presenza in chat (offline). La normale navigazione tra le
    // pagine NON resetta nulla e non scollega dalla chat (segnalazione 69):
    // qualsiasi interazione rimanda semplicemente in avanti la scadenza.
    useEffect(() => {
        if (!user) return;
        const IDLE_MS = 15 * 60 * 1000;
        let timer: ReturnType<typeof setTimeout>;
        const doLogout = () => {
            clearAiChat(user?.id);
            setUser(null);
            localStorage.removeItem("crm_session");
            localStorage.removeItem("crm_last_activity");
            router.push("/");
        };
        const reset = () => {
            localStorage.setItem("crm_last_activity", String(Date.now()));
            clearTimeout(timer);
            timer = setTimeout(doLogout, IDLE_MS);
        };
        // se un'altra scheda ha gia' superato il limite mentre questa era ferma
        const last = Number(localStorage.getItem("crm_last_activity") || 0);
        if (last && Date.now() - last > IDLE_MS) { doLogout(); return; }
        const events = ["mousedown", "keydown", "scroll", "touchstart", "click"];
        events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
        // controlla anche al ritorno sulla scheda (dopo sospensione/inattivita')
        const onVisible = () => {
            if (document.visibilityState !== "visible") return;
            const l = Number(localStorage.getItem("crm_last_activity") || 0);
            if (l && Date.now() - l > IDLE_MS) doLogout(); else reset();
        };
        document.addEventListener("visibilitychange", onVisible);
        reset();
        return () => {
            clearTimeout(timer);
            events.forEach((e) => window.removeEventListener(e, reset));
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [user, router]);

    return (
        <AuthContext.Provider value={{ user, realRole: baseUser?.role ?? null, viewAs: puoCambiare ? viewAs : null, setViewAs, login, completeFirstLogin, logout, isAuthenticated: !!user }}>
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
