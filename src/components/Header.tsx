"use client";

import { Search, Maximize, Bell, Menu, LogOut, ArrowLeft, Loader2, User as UserIcon } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { roleLabel, seesAllStores } from "@/lib/roles";
import { supabase } from "@/lib/supabaseClient";
import { useRef, useEffect, useState } from "react";

const CRM_BACK_EVENT = "crm-back";

// Segnalazione 75: risultato della ricerca globale — un cliente col suo
// contratto piu' recente, cosi' un clic porta dritto al dettaglio.
type Hit = {
    contractId: string;
    cliente: string;
    cf: string | null;
    cellulare: string | null;
    brand: string | null;
    prodotto: string | null;
    data: string | null;
};

export function Header({ onMenuClick }: { onMenuClick?: () => void }) {
    const router = useRouter();
    const pathname = usePathname();
    const { user, logout } = useAuth();
    const lastPathRef = useRef<string | null>(null);
    const previousPathRef = useRef<string | null>(null);

    // ─── Ricerca globale (segnalazione 75) ───
    const [q, setQ] = useState("");
    const [hits, setHits] = useState<Hit[]>([]);
    const [searching, setSearching] = useState(false);
    const [openRes, setOpenRes] = useState(false);
    const boxRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const onDocClick = (e: MouseEvent) => {
            if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpenRes(false);
        };
        document.addEventListener("mousedown", onDocClick);
        return () => document.removeEventListener("mousedown", onDocClick);
    }, []);

    useEffect(() => {
        const term = q.trim();
        if (term.length < 2) { setHits([]); setSearching(false); return; }
        setSearching(true);
        const t = setTimeout(async () => {
            try {
                // niente virgole/parentesi/apici: romperebbero il filtro OR di PostgREST
                const safe = term.replace(/[",()]/g, "").trim();
                if (!safe) { setHits([]); return; }
                const like = `%${safe}%`;
                let query = supabase
                    .from("contracts")
                    .select("id, brand, prodotto, data_registrazione, created_at, codice_attivazione, client_id, clients!inner(nome, cognome, ragione_sociale, cf_piva, cellulare)")
                    .or(`nome.ilike.${like},cognome.ilike.${like},ragione_sociale.ilike.${like},cf_piva.ilike.${like},cellulare.ilike.${like}`, { referencedTable: "clients" })
                    .order("created_at", { ascending: false })
                    .limit(40);
                // ognuno vede solo i contratti del proprio negozio
                if (!seesAllStores(user?.role) && user?.negozio) {
                    query = query.ilike("negozio", `${String(user.negozio).split(" ")[0]}%`);
                }
                const { data } = await query;
                // un risultato per cliente: il contratto piu' recente (i dati arrivano gia' ordinati)
                const perCliente = new Map<string, Hit>();
                (data ?? []).forEach((r: any) => {
                    const c = r.clients || {};
                    const key = r.client_id || r.id;
                    if (perCliente.has(key)) return;
                    const nome = [c.ragione_sociale, [c.nome, c.cognome].filter(Boolean).join(" ")]
                        .filter(Boolean)[0] || "—";
                    perCliente.set(key, {
                        contractId: r.id, cliente: nome, cf: c.cf_piva ?? null, cellulare: c.cellulare ?? null,
                        brand: r.brand ?? null, prodotto: r.prodotto ?? null,
                        data: r.data_registrazione ?? null,
                    });
                });
                setHits(Array.from(perCliente.values()).slice(0, 8));
            } catch { setHits([]); }
            finally { setSearching(false); }
        }, 300);
        return () => clearTimeout(t);
    }, [q, user?.role, user?.negozio]);

    const apriHit = (h: Hit) => {
        setOpenRes(false); setQ("");
        router.push(`/ricerca-contratto?id=${encodeURIComponent(h.contractId)}`);
    };

    // ─── Schermo intero ───
    const [isFullscreen, setIsFullscreen] = useState(false);
    useEffect(() => {
        const onFs = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener("fullscreenchange", onFs);
        return () => document.removeEventListener("fullscreenchange", onFs);
    }, []);
    const toggleFullscreen = () => {
        if (document.fullscreenElement) document.exitFullscreen?.();
        else document.documentElement.requestFullscreen?.();
    };

    // ─── Comunicazioni: pallino sulle nuove ───
    // Non esiste una tabella "letto/non letto": si tiene l'ultima apertura per
    // utente e si contano le comunicazioni piu' recenti di quella.
    const [nuoveCom, setNuoveCom] = useState(0);
    const chiaveVisto = user?.id ? `crm_comunicazioni_viste_${user.id}` : null;
    useEffect(() => {
        if (!chiaveVisto) return;
        let vivo = true;
        (async () => {
            try {
                const visto = localStorage.getItem(chiaveVisto) || "1970-01-01";
                const { count } = await supabase
                    .from("comunicazioni")
                    .select("id", { count: "exact", head: true })
                    .gt("created_at", visto);
                if (vivo) setNuoveCom(count ?? 0);
            } catch { /* ignore */ }
        })();
        return () => { vivo = false; };
    }, [chiaveVisto, pathname]);
    const openComunicazioni = () => {
        if (chiaveVisto) { try { localStorage.setItem(chiaveVisto, new Date().toISOString()); } catch { } }
        setNuoveCom(0);
        router.push("/comunicazioni");
    };

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
                {/* Segnalazione 75: la barra di ricerca non faceva nulla. Ora cerca il
                    cliente (nome, C.F./P.IVA, cellulare) e porta al suo contratto piu'
                    recente. Rispetta il negozio dell'utente. */}
                <div ref={boxRef} className="max-w-md w-full relative hidden md:block">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        {searching ? <Loader2 className="h-4 w-4 text-slate-500 animate-spin" /> : <Search className="h-4 w-4 text-slate-500" />}
                    </div>
                    <input
                        type="text"
                        value={q}
                        onChange={(e) => { setQ(e.target.value); setOpenRes(true); }}
                        onFocus={() => setOpenRes(true)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && hits.length > 0) apriHit(hits[0]);
                            if (e.key === "Escape") setOpenRes(false);
                        }}
                        className="glass-input w-full pl-10 h-10 text-sm"
                        placeholder="Cerca cliente: nome, C.F./P.IVA o cellulare…"
                    />
                    {openRes && q.trim().length >= 2 && (
                        <div className="absolute left-0 right-0 top-full mt-2 rounded-xl border border-white/10 bg-[#161a26] shadow-2xl z-50 overflow-hidden">
                            {hits.length === 0 ? (
                                <p className="px-3 py-3 text-xs text-slate-500">
                                    {searching ? "Ricerca in corso…" : "Nessun cliente trovato"}
                                </p>
                            ) : (
                                <>
                                    <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-slate-500 border-b border-white/5">
                                        Contratto più recente — Invio per il primo
                                    </p>
                                    {hits.map((h) => (
                                        <button key={h.contractId} type="button" onClick={() => apriHit(h)}
                                            className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-white/5">
                                            <span className="w-7 h-7 shrink-0 rounded-lg border border-indigo-500/30 bg-indigo-500/10 flex items-center justify-center">
                                                <UserIcon className="w-3.5 h-3.5 text-indigo-300" />
                                            </span>
                                            <span className="flex-1 min-w-0">
                                                <span className="block text-sm text-white truncate">{h.cliente}</span>
                                                <span className="block text-[10px] text-slate-500 truncate">
                                                    {[h.cf, h.cellulare].filter(Boolean).join(" · ") || "—"}
                                                </span>
                                            </span>
                                            <span className="shrink-0 text-right">
                                                <span className="block text-[11px] text-slate-300">{[h.brand, h.prodotto].filter(Boolean).join(" · ") || "—"}</span>
                                                <span className="block text-[10px] text-slate-500">{h.data || ""}</span>
                                            </span>
                                        </button>
                                    ))}
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-6">
                {/* Tasto tema chiaro/scuro rimosso: il CRM e' solo in tema scuro
                    (glassmorphism), quindi il tasto non aveva nulla da commutare. */}
                {/* Il tasto schermo intero non faceva nulla: ora entra ed esce davvero. */}
                <button
                    onClick={toggleFullscreen}
                    title={isFullscreen ? "Esci da schermo intero" : "Schermo intero"}
                    className="text-slate-400 hover:text-white transition-colors"
                >
                    <Maximize className="h-5 w-5" />
                </button>
                {/* La campanella non faceva nulla: ora porta alle Comunicazioni e il
                    pallino rosso compare solo se ce ne sono di nuove dall'ultima volta. */}
                <button
                    onClick={openComunicazioni}
                    title={nuoveCom > 0 ? `${nuoveCom} comunicazioni nuove` : "Comunicazioni"}
                    className="text-slate-400 hover:text-white transition-colors relative"
                >
                    <Bell className="h-5 w-5" />
                    {nuoveCom > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-rose-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center">
                            {nuoveCom > 9 ? "9+" : nuoveCom}
                        </span>
                    )}
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
                        <p className="text-xs text-slate-400 mt-1">{user?.role ? roleLabel(user.role) : "Nessun Ruolo"}</p>
                    </div>
                    <div className="w-9 h-9 rounded-full bg-indigo-500/20 text-indigo-300 font-bold border-2 border-indigo-500/40 flex items-center justify-center overflow-hidden">
                        {user?.name ? getInitials(user.name) : 'A'}
                    </div>
                </div>
            </div>
        </header>
    );
}
