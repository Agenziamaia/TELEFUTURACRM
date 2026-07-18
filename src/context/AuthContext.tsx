"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";

export type Role = "admin" | "agente" | "venditore" | "store_manager" | "supervisore" | "back_office";

interface User {
    id: string;
    name: string;
    email: string;
    role: Role;
    negozio?: string;
}

interface AuthContextType {
    user: User | null;
    login: (email: string) => void;
    logout: () => void;
    isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const MOCK_USERS: Record<string, User> = {
    "admin@test.com": {
        id: "1",
        name: "Luca Perotta",
        email: "admin@test.com",
        role: "admin",
        // Admin has global visibility (no specific negozio)
    },
    "agente@test.com": {
        id: "2",
        name: "Venditore 1",
        email: "agente@test.com",
        role: "agente",
        negozio: "Store Milano Centro"
    },
    // Adding a test store manager
    "manager@test.com": {
        id: "3",
        name: "Store Manager Roma",
        email: "manager@test.com",
        role: "store_manager",
        negozio: "Store Roma Termini"
    }
};

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const router = useRouter();
    const pathname = usePathname();

    // Load session from localStorage on mount (prevents logout on refresh)
    useEffect(() => {
        const savedSession = localStorage.getItem("crm_session");
        if (savedSession) {
            const parsed = JSON.parse(savedSession);
            // Auto-sync with live MOCK_USERS code changes to fix stale names
            const freshUser = MOCK_USERS[parsed.email.toLowerCase()];
            if (freshUser) {
                setUser(freshUser);
                localStorage.setItem("crm_session", JSON.stringify(freshUser));
            } else {
                setUser(parsed);
            }
        } else if (pathname !== "/") {
            // If not on login page and no session, kick to login
            router.push("/");
        }
    }, [pathname, router]);

    // Route protection logic
    useEffect(() => {
        if (!user) return;

        // Prevent Agente from accessing Gestione PDA
        if (pathname === "/gestione" && user.role !== "admin") {
            router.push("/dashboard");
        }

        // Amministrazione: solo admin
        if (pathname.startsWith("/amministrazione") && user.role !== "admin") {
            router.push("/dashboard");
        }

        // Gare (soglie e commissioning operatori): solo admin
        if (pathname.startsWith("/gare") && user.role !== "admin") {
            router.push("/dashboard");
        }
    }, [user, pathname, router]);

    const login = (email: string) => {
        const foundUser = MOCK_USERS[email.trim().toLowerCase()];
        if (foundUser) {
            setUser(foundUser);
            localStorage.setItem("crm_session", JSON.stringify(foundUser));
            router.push("/dashboard");
        } else {
            alert("Utente non trovato / Email non valida (Usa admin@test.com o agente@test.com)");
        }
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem("crm_session");
        router.push("/");
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user }}>
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
