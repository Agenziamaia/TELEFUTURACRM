"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { alRientroNecessario, azzeraTokenTf } from "@/lib/tokenClient";
import { supabase } from "@/lib/supabaseClient";
import { routeBases, effectiveAllowed, groupKey, groupByLabel } from "@/lib/nav";
import { roleGradeKey, userKey } from "@/lib/usePermissions";
import { loadRoleDefs } from "@/lib/useRoles";
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

interface LoginResult { ok: boolean; error?: string; mustChange?: boolean; email?: string;
    // 2FA: la password e' giusta ma serve un altro passo prima di entrare
    totpRequired?: boolean;    // inserisci il codice dell'app authenticator
    enrollRequired?: boolean;  // prima iscrizione: scansiona il QR e conferma
    otpauth?: string;          // uri otpauth:// (per QR alternativo/manuale)
    qr?: string }              // data URL del QR da mostrare

export interface ViewAsUser { id: string; name: string; role: Role; grade?: string | null; negozio?: string }

interface AuthContextType {
    user: User | null;        // ATTENZIONE: role qui e' il ruolo EFFETTIVO (vedi viewAs)
    realRole: Role | null;    // ruolo vero dell'account, non cambia mai
    // IDENTITA' VERA, quella dell'account con cui si e' entrati. Serve dove si
    // SCRIVE a nome proprio: il database riconosce chi sei dal lasciapassare,
    // che e' firmato sull'account vero — «guarda come» vive solo nel browser.
    // Senza, chi guarda come un altro non riusciva piu' ad aprire una chat: il
    // database rifiutava, giustamente, un'identita' che non era la sua.
    realUserId: string | null;
    viewAs: Role | null;      // ruolo che si sta simulando (null = nessuno)
    setViewAs: (r: Role | null) => void;
    // Simulazione di un UTENTE specifico (richiesta Luca 25/07): dopo il ruolo si
    // sceglie la persona, cosi' visibilita' e negozi sono esattamente i suoi.
    viewAsUser: ViewAsUser | null;
    setViewAsUser: (u: ViewAsUser | null) => void;
    login: (email: string, password: string, opts?: { code?: string; enrolling?: boolean }) => Promise<LoginResult>;
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
    const [viewAsUser, setViewAsUserState] = useState<ViewAsUser | null>(null);
    useEffect(() => {
        try { const v = localStorage.getItem("crm_view_as"); if (v) setViewAsState(v as Role); } catch { }
        try { const u = localStorage.getItem("crm_view_as_user"); if (u) setViewAsUserState(JSON.parse(u)); } catch { }
    }, []);
    const setViewAs = (r: Role | null) => {
        setViewAsState(r);
        // cambiare ruolo azzera l'utente simulato (potrebbe non avere quel ruolo)
        setViewAsUserState(null);
        try { localStorage.removeItem("crm_view_as_user"); } catch { }
        try { if (r) localStorage.setItem("crm_view_as", r); else localStorage.removeItem("crm_view_as"); } catch { }
    };
    const setViewAsUser = (u: ViewAsUser | null) => {
        setViewAsUserState(u);
        try { if (u) localStorage.setItem("crm_view_as_user", JSON.stringify(u)); else localStorage.removeItem("crm_view_as_user"); } catch { }
    };
    // Il permesso sta sull'account vero: cosi' il selettore resta visibile anche
    // mentre si simula un ruolo basso, altrimenti non si potrebbe piu' tornare admin.
    const puoCambiare = !!baseUser?.canSwitchRole;
    // Utente EFFETTIVO: con un utente simulato si assumono identita', ruolo e
    // negozio SUOI (cosi' useVisibleStores legge la sua visibilita' reale);
    // con il solo ruolo simulato cambia solo il ruolo, come prima.
    const user: User | null = baseUser
        ? (puoCambiare && viewAsUser)
            ? { ...baseUser, id: viewAsUser.id, name: viewAsUser.name, role: viewAsUser.role, grade: viewAsUser.grade, negozio: viewAsUser.negozio }
            : { ...baseUser, role: (puoCambiare && viewAs) ? viewAs : baseUser.role }
        : null;
    const router = useRouter();
    const pathname = usePathname();

    // BLINDATURA (Luca 28/08): chi era già dentro prima non ha la sessione
    // FIRMATA del server, quindi non riceve il lasciapassare per il database.
    // Va accompagnato a rientrare una volta sola, con un messaggio chiaro —
    // meglio un re-login che pagine misteriosamente vuote.
    useEffect(() => {
        alRientroNecessario(() => {
            if (!localStorage.getItem("crm_session")) return;   // già fuori
            try {
                localStorage.setItem("crm_rientro", "1");
                localStorage.removeItem("crm_session");
            } catch { /* storage negato */ }
            if (typeof window !== "undefined") window.location.href = "/";
        });
    }, []);

    // Ripristina la sessione da localStorage al mount (evita logout al refresh)
    useEffect(() => {
        const saved = localStorage.getItem("crm_session");
        if (saved) {
            try { setUser(JSON.parse(saved)); } catch { localStorage.removeItem("crm_session"); }
        } else if (pathname !== "/" && !pathname.startsWith("/m/")) {
            // /m/* = pagine pubbliche (es. upload da telefono via QR): niente login
            router.push("/");
        }
    }, [pathname, router]);

    // SEC-01: cintura di sicurezza contro la bfcache. Se il browser RIPRISTINA
    // una pagina congelata (event.persisted: tasto Indietro dopo il logout) lo
    // heap React e' ancora vivo ma la sessione non c'e' piu': si forza il
    // ritorno al login. Si legge window.location, non lo stato React congelato.
    useEffect(() => {
        const onPageShow = (e: PageTransitionEvent) => {
            if (!e.persisted) return;
            try {
                const p = window.location.pathname;
                if (!localStorage.getItem("crm_session") && p !== "/" && !p.startsWith("/m/")) {
                    window.location.replace("/");
                }
            } catch { /* localStorage negato: meglio non toccare nulla */ }
        };
        window.addEventListener("pageshow", onPageShow);
        return () => window.removeEventListener("pageshow", onPageShow);
    }, []);

    // Il permesso "guarda come" viene riletto dal database a ogni avvio: cosi'
    // vale subito anche per chi era gia' connesso quando e' stato concesso, senza
    // dover uscire e rientrare (e sparisce subito se viene revocato).
    useEffect(() => {
        if (!baseUser?.id) return;
        let vivo = true;
        (async () => {
            const { data } = await supabase
                .from("app_users").select("can_switch_role").eq("id", baseUser.id).maybeSingle();
            if (!vivo || !data) return;
            const puo = !!data.can_switch_role;
            if (puo !== !!baseUser.canSwitchRole) {
                const aggiornato = { ...baseUser, canSwitchRole: puo };
                setUser(aggiornato);
                try { localStorage.setItem("crm_session", JSON.stringify(aggiornato)); } catch { }
            }
        })();
        return () => { vivo = false; };
    }, [baseUser?.id, baseUser?.canSwitchRole]);

    // Etichette dei ruoli creati/modificati da UI: idrata il registro dinamico
    // (roles.ts) appena la sessione esiste — vale per tutto il CRM.
    useEffect(() => { if (baseUser?.id) loadRoleDefs(); }, [baseUser?.id]);

    // MOD-33 (Luca 10/08): SOSPESI e LICENZIATI fuori anche con la sessione
    // GIA' APERTA — a ogni cambio pagina si riverifica lo stato a DB e, se
    // l'accesso non e' piu' consentito, la sessione si chiude con navigazione
    // hard (stessa via del logout, anti-bfcache). Select difensivo: senza la
    // migrazione delle colonne nuove vale il solo controllo status/active.
    useEffect(() => {
        if (!baseUser?.id) return;
        let vivo = true;
        (async () => {
            let d: { status?: string | null; active?: boolean | null; sospeso_dal?: string | null; data_licenziamento?: string | null } | null = null;
            const r1 = await supabase.from("app_users").select("status, active, sospeso_dal, data_licenziamento").eq("id", baseUser.id).maybeSingle();
            if (!r1.error) d = r1.data;
            else {
                const r2 = await supabase.from("app_users").select("status, active").eq("id", baseUser.id).maybeSingle();
                if (!r2.error) d = r2.data;
            }
            if (!vivo || !d) return;
            const oggi = new Date().toISOString().slice(0, 10);
            const dl = String(d.data_licenziamento || "");
            const sd = String(d.sospeso_dal || "");
            const bloccato = d.active === false || d.status === "licenziato" || (!!dl && dl <= oggi) || (!!sd && sd <= oggi);
            if (!bloccato) return;
            // licenziamento programmato arrivato a scadenza: si concretizza
            if (dl && dl <= oggi && d.status !== "licenziato") {
                await supabase.from("app_users").update({ status: "licenziato", active: false }).eq("id", baseUser.id);
            }
            try {
                localStorage.removeItem("crm_session");
                localStorage.removeItem("crm_last_activity");
            } catch { /* ignore */ }
            window.location.replace("/");
        })();
        return () => { vivo = false; };
    }, [baseUser?.id, pathname]);

    // Protezione rotte GUIDATA DALLA NAVIGAZIONE (src/lib/nav.ts + tabella
    // role_permissions): stessa fonte della Sidebar e della pagina Permessi, in
    // entrambe le direzioni — cio' che l'admin concede/toglie da li' vale anche
    // qui, senza codice. admin/dev passano sempre; /dashboard mai bloccata.
    const [routePerms, setRoutePerms] = useState<Map<string, boolean> | null>(null);
    useEffect(() => {
        const role = user?.role;
        const grade = user?.grade;
        const uid = user?.id;
        if (!role || role === "admin" || role === "dev") { setRoutePerms(new Map()); return; }
        let vivo = true;
        // ANCHE le eccezioni di grado ("ruolo@grado") e di PERSONA ("user:<id>",
        // MOD-29 — vedi usePermissions): senza, un permesso concesso al solo
        // grado/utente apriva la voce in sidebar ma questo blocco rimbalzava in
        // home (bug 10/08). Ordine di fusione: ruolo → grado → utente.
        const chiavi: string[] = [role];
        if (grade) chiavi.push(roleGradeKey(role, grade));
        if (uid) chiavi.push(userKey(uid));
        supabase.from("role_permissions").select("role,perm_key,allowed").in("role", chiavi)
            .then(({ data, error }) => {
                if (!vivo) return;
                const m = new Map<string, boolean>();
                if (!error) {
                    const rows = (data ?? []) as { role: string; perm_key: string; allowed: boolean }[];
                    rows.filter((r) => r.role === role).forEach((r) => m.set(r.perm_key, r.allowed));
                    if (grade) rows.filter((r) => r.role === roleGradeKey(role, grade)).forEach((r) => m.set(r.perm_key, r.allowed));
                    if (uid) rows.filter((r) => r.role === userKey(uid)).forEach((r) => m.set(r.perm_key, r.allowed));
                }
                setRoutePerms(m);
            });
        return () => { vivo = false; };
    }, [user?.role, user?.grade, user?.id]);
    useEffect(() => {
        if (!user || !routePerms) return;
        if (user.role === "admin" || user.role === "dev") return;
        if (pathname === "/dashboard" || pathname === "/") return;
        const hit = routeBases().find(({ base }) => base !== "/dashboard" && pathname.startsWith(base));
        if (!hit) return; // rotte fuori menu: valgono i controlli delle singole pagine
        const ok = hit.items.some((it) => {
            if (it.group) {
                const g = groupByLabel(it.group);
                if (!effectiveAllowed(user.role, groupKey(it.group), g?.roles ?? ["*"], routePerms, it.group)) return false;
            }
            return effectiveAllowed(user.role, it.href, it.roles, routePerms, it.group);
        });
        if (!ok) router.push("/dashboard");
    }, [user, pathname, router, routePerms]);

    const persist = (u: User) => {
        setUser(u);
        localStorage.setItem("crm_session", JSON.stringify(u));
    };

    // Login con 2FA verificata lato server (route /api/auth/login): la sessione
    // torna SOLO quando password + codice (o iscrizione) sono ok.
    const login = async (email: string, password: string, opts?: { code?: string; enrolling?: boolean }): Promise<LoginResult> => {
        let res: any;
        try {
            res = await fetch("/api/auth/login", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email.trim(), password, code: opts?.code, enrolling: opts?.enrolling }),
            }).then(r => r.json());
        } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Accesso non riuscito" }; }
        if (res?.stage === "change") return { ok: true, mustChange: true, email: res.email };
        if (res?.stage === "enroll") return { ok: false, enrollRequired: true, email: res.email, otpauth: res.otpauth, qr: res.qr, error: res.error };
        if (res?.stage === "totp") return { ok: false, totpRequired: true, email: res.email, error: res.error };
        if (!res?.ok) return { ok: false, error: res?.error || "Accesso non riuscito" };
        persist(rowToUser(res.user));
        return { ok: true };
    };

    // PRIMO ACCESSO: rotta dedicata, perché qui la sessione ANCORA NON C'È
    // (Luca 31/08). Passava da /api/auth/azioni, che riconosce chi chiama dal
    // cookie: su un browser pulito rispondeva «sessione non valida», e su un PC
    // dove era entrato un collega provava a cambiare la password DI QUELLO.
    const completeFirstLogin = async (email: string, oldPw: string, newPw: string): Promise<LoginResult> => {
        let _r: any;
        try {
            _r = await fetch("/api/auth/primo-accesso", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), vecchia: oldPw, nuova: newPw }) }).then((r) => r.json());
        } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Cambio password non riuscito" }; }
        if (_r?.error) return { ok: false, error: _r.error };
        if (_r?.ok !== true) return { ok: false, error: "Cambio password non riuscito: riprova." };
        // Cambiata la password, si passa dal normale flusso di login: cosi' scatta
        // anche la 2FA (iscrizione al primo accesso).
        return login(email, newPw);
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
        azzeraTokenTf();   // il lasciapassare non sopravvive all'utente
        // e il permesso di sessione si annulla DAVVERO, anche lato server
        try { fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => { }); } catch { /* offline */ }
        clearAiChat(user?.id);
        // #118: la bozza della vendita in corso (Registra Vendita) non sopravvive
        // al logout esplicito — al nuovo login il form riparte vuoto.
        try { sessionStorage.removeItem("crm_v9"); sessionStorage.removeItem("crm_lastTipo"); } catch { /* ignore */ }
        setViewAs(null);   // il "guarda come" non sopravvive al logout
        setViewAsUser(null);
        setUser(null);
        localStorage.removeItem("crm_session");
        localStorage.removeItem("crm_last_activity");
        // SEC-01: navigazione HARD (non router.push) — sostituisce la voce di
        // history e invalida la bfcache: col tasto INDIETRO non si rientra piu'
        // nella dashboard con lo stato React ancora vivo.
        window.location.replace("/");
    };

    // Segnalazione 49: dopo 15 minuti di inattivita' (nessun click/tasto/scroll)
    // la sessione scade — l'utente torna al login e, non essendoci piu' sessione,
    // sparisce dalla presenza in chat (offline). La normale navigazione tra le
    // pagine NON resetta nulla e non scollega dalla chat (segnalazione 69):
    // qualsiasi interazione rimanda semplicemente in avanti la scadenza.
    useEffect(() => {
        if (!user) return;
        // Segnalazione 90: scadenza inattivita' portata da 15 minuti a 1 ora.
        // Ogni interazione entro l'ora rimanda in avanti la scadenza (gia' cosi').
        const IDLE_MS = 60 * 60 * 1000;
        let timer: ReturnType<typeof setTimeout>;
        const doLogout = () => {
            clearAiChat(user?.id);
            setUser(null);
            localStorage.removeItem("crm_session");
            localStorage.removeItem("crm_last_activity");
            // SEC-01: come nel logout esplicito, navigazione hard anti-bfcache
            window.location.replace("/");
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
    }, [user]);

    return (
        <AuthContext.Provider value={{ user, realRole: baseUser?.role ?? null, realUserId: baseUser?.id ?? null, viewAs: puoCambiare ? viewAs : null, setViewAs, viewAsUser: puoCambiare ? viewAsUser : null, setViewAsUser, login, completeFirstLogin, logout, isAuthenticated: !!user }}>
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
