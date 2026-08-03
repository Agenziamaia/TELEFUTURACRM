"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/utils";
import { useAuth } from "@/context/AuthContext";
import { getInbox, subscribeInbox } from "@/lib/chat";
import { comunicazionePerMe, brandDelNegozio, negoziAssegnati } from "@/lib/comunicazioniTarget";
import { useVisibleStores, sameStore } from "@/lib/visibleStores";
import {
    Home,
    Send,
    Navigation,
    FolderOpen,
    MessageSquare,
    MessagesSquare,
    Sparkles,
    Megaphone,
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
import { NAVIGATION, effectiveAllowed, hubChildKey, hubSubKey, groupKey, type NavHub, type NavHubChild, type NavEntry } from "@/lib/nav";
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
    const { user } = useAuth();
    // ── COMUNICAZIONI DA LEGGERE (03/08): l'avviso in fondo alla sidebar al
    //    posto del logout — quante comunicazioni indirizzate a me non hanno
    //    ancora la lettura a DB. Si aggiorna a ogni navigazione, ogni 5' e in
    //    realtime su nuove comunicazioni o nuove letture mie.
    const [comDaLeggere, setComDaLeggere] = useState(0);
    useEffect(() => {
        if (!user?.id) { setComDaLeggere(0); return; }
        let vivo = true;
        const conta = async () => {
            try {
                const { data: coms } = await supabase.from("comunicazioni")
                    .select("id, created_by, target_roles, target_stores, target_users, target_brands, kind")
                    .order("created_at", { ascending: false }).limit(300);
                if (!coms?.length) { if (vivo) setComDaLeggere(0); return; }
                const brandsNegozio = await brandDelNegozio(user.negozio);
                const negozi = await negoziAssegnati(user.id);
                const perMe = coms.filter((c) => comunicazionePerMe(c as never, { userId: user.id, role: user.role || "", negozio: user.negozio, negozi, brandsNegozio }));
                if (!perMe.length) { if (vivo) setComDaLeggere(0); return; }
                const { data: ric } = await supabase.from("comunicazioni_ricevute")
                    .select("comunicazione_id, letto_il").eq("user_id", user.id)
                    .in("comunicazione_id", perMe.map((c) => c.id));
                const lette = new Set(((ric ?? []) as { comunicazione_id: number; letto_il: string | null }[]).filter((r) => r.letto_il).map((r) => r.comunicazione_id));
                if (vivo) setComDaLeggere(perMe.filter((c) => !lette.has(c.id)).length);
            } catch { /* tabelle non migrate o rete: niente avviso */ }
        };
        conta();
        const t = setInterval(conta, 5 * 60 * 1000);
        const ch = supabase.channel("sidebar_comunicazioni")
            .on("postgres_changes", { event: "INSERT", schema: "public", table: "comunicazioni" }, conta)
            .on("postgres_changes", { event: "*", schema: "public", table: "comunicazioni_ricevute", filter: `user_id=eq.${user.id}` }, conta)
            .subscribe();
        return () => { vivo = false; clearInterval(t); supabase.removeChannel(ch); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id, pathname]);
    // override per ruolo dal DB (Amministrazione → Permessi); default = codice
    const { perms } = useRolePermissions(user?.role);
    const vede = (href: string, roles: string[], group?: string) => effectiveAllowed(user?.role, href, roles, perms, group);
    const feriePendenti = useFeriePendenti(user?.id, user?.role);

    // NON LETTI per CANALE -> tre badge distinti sulla voce "Chat":
    // chat interna (indaco), WhatsApp (verde), mail (azzurro). WhatsApp/mail
    // contano istanze/caselle mie o del mio negozio (come le rispettive inbox).
    const { stores: myStores } = useVisibleStores();
    const [chatUnread, setChatUnread] = useState(0);
    const [waUnread, setWaUnread] = useState(0);
    const [mailUnread, setMailUnread] = useState(0);
    useEffect(() => {
        if (!user?.id) { setChatUnread(0); setWaUnread(0); setMailUnread(0); return; }
        let alive = true;
        const load = async () => {
            try { const rows = await getInbox(user.id); if (alive) setChatUnread(rows.reduce((s, r) => s + (r.unread || 0), 0)); } catch { }
            try {
                const { data: insts } = await supabase.from("wa_instances").select("id, owner_user_id, negozio");
                const mine = (insts || []).filter((i: any) => i.owner_user_id === user.id || (i.negozio && myStores.some((s) => sameStore(i.negozio, s)))).map((i: any) => i.id);
                let n = 0;
                if (mine.length) { const { data } = await supabase.from("wa_conversations").select("unread").in("instance_id", mine); n = (data || []).reduce((s: number, c: any) => s + (c.unread || 0), 0); }
                if (alive) setWaUnread(n);
            } catch { }
            try {
                const { data: accs } = await supabase.from("email_accounts").select("id, owner_user_id, negozio");
                const mine = (accs || []).filter((a: any) => a.owner_user_id === user.id || (a.negozio && myStores.some((s) => sameStore(a.negozio, s)))).map((a: any) => a.id);
                let n = 0;
                if (mine.length) { const { data } = await supabase.from("email_conversations").select("unread, trashed, spam, archived").in("account_id", mine); n = (data || []).filter((c: any) => !c.trashed && !c.spam && !c.archived).reduce((s: number, c: any) => s + (c.unread || 0), 0); }
                if (alive) setMailUnread(n);
            } catch { }
        };
        load();
        const off = subscribeInbox(load);
        const ch = supabase.channel("sidebar_unread")
            .on("postgres_changes", { event: "INSERT", schema: "public", table: "wa_messages" }, () => load())
            .on("postgres_changes", { event: "INSERT", schema: "public", table: "email_messages" }, () => load())
            .subscribe();
        const t = setInterval(load, 20000);
        return () => { alive = false; off(); supabase.removeChannel(ch); clearInterval(t); };
    }, [user?.id, myStores]);

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
                                        {item.href === "/chat" && (chatUnread > 0 || waUnread > 0 || mailUnread > 0) && (
                                            <span className="ml-auto flex items-center gap-1">
                                                {chatUnread > 0 && <span title="Chat interna" className="min-w-[18px] h-[18px] px-1 rounded-full bg-violet-500 text-white text-[10px] font-bold flex items-center justify-center">{chatUnread > 99 ? "99+" : chatUnread}</span>}
                                                {waUnread > 0 && <span title="WhatsApp" className="min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">{waUnread > 99 ? "99+" : waUnread}</span>}
                                                {mailUnread > 0 && <span title="Mail" className="min-w-[18px] h-[18px] px-1 rounded-full bg-sky-500 text-white text-[10px] font-bold flex items-center justify-center">{mailUnread > 99 ? "99+" : mailUnread}</span>}
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

                    {/* LOG OUT SPOSTATO nel menu del profilo in alto a destra (03/08):
                        qui al suo posto compare l'avviso delle comunicazioni da leggere */}
                    {comDaLeggere > 0 && (
                        <div className="p-4 border-t border-white/5">
                            <Link href="/comunicazioni" onClick={() => setIsOpen?.(false)}
                                className="nav-link w-full text-amber-300 hover:text-amber-200 hover:bg-amber-500/10">
                                <Megaphone className="w-5 h-5 shrink-0" />
                                <span className="text-sm font-semibold leading-tight">{comDaLeggere === 1 ? "Hai 1 comunicazione da leggere" : `Hai ${comDaLeggere} comunicazioni da leggere`}</span>
                            </Link>
                        </div>
                    )}
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
    // Una voce "esplodi" (mini-hub Costi) resta visibile se ALMENO UNA delle
    // sue sotto-voci e' permessa, anche quando la voce madre non lo e'.
    const subOk = (c: NavHubChild, subId: string, subRoles: string[]) =>
        effectiveAllowed(user?.role, hubSubKey(hub, c, subId), subRoles, perms);
    hub = {
        ...hub, children: hub.children.filter((c) =>
            effectiveAllowed(user?.role, hubChildKey(hub, c), c.roles ?? hub.roles, perms)
            || (c.esplodi && (c.subs ?? []).some((s) => subOk(c, s.id, s.roles)))),
    };
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const param = hub.param || "sez";
    const sez = pathname === hub.href ? searchParams.get(param) : null;
    // apertura MANUALE delle voci esplodibili (freccetta): prevale
    // sull'apertura automatica data dal trovarsi dentro la voce
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [apertiManuale, setApertiManuale] = useState<Record<string, boolean>>({});
    return (
        <div className="pl-4 ml-2 border-l border-white/10 space-y-0.5">
            {hub.children.map((c) => {
                // ── voce ESPANDIBILE: link madre + sotto-voci, aperte quando ci
                // sei dentro. Due modelli (Luca 31/07): subsSez=true → sotto-voci
                // come SEZIONI (?sez=<id>, mini-hub Costi); altrimenti come
                // FUNZIONI della voce (?sez=<voce>&tab=<id>, gruppo Utenti) ──
                if (c.esplodi && c.subs?.length) {
                    const subsVisibili = c.subs.filter((s) => subOk(c, s.id, s.roles));
                    const tabAttivo = searchParams.get("tab") || subsVisibili[0]?.id || "";
                    const subHref = (id: string) => c.subsSez
                        ? `${hub.href}?${param}=${id}`
                        : `${hub.href}?${param}=${c.sez}&tab=${id}`;
                    const subAttiva = (id: string) => c.subsSez
                        ? sez === id
                        : sez === c.sez && tabAttivo === id;
                    const dentro = sez === c.sez || !!(c.subsSez && subsVisibili.some((s) => s.id === sez));
                    // la freccetta comanda: il click apre/chiude davvero (come
                    // l'hub); senza intervento manuale vale l'automatico
                    const aperto = apertiManuale[c.sez] ?? dentro;
                    const ChildIcon = c.icon;
                    return (
                        <div key={c.sez}>
                            <div className={cn(
                                "flex items-center rounded-lg text-sm transition-colors",
                                sez === c.sez ? "bg-indigo-500/15 text-indigo-300" : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
                            )}>
                                <Link
                                    href={`${hub.href}?${param}=${c.sez}`}
                                    onClick={onNavigate}
                                    className="flex items-center gap-3 px-3 py-2 flex-1 min-w-0"
                                >
                                    {ChildIcon && <ChildIcon className={cn("w-4 h-4", dentro ? "text-indigo-400" : "text-slate-500")} />}
                                    {c.name}
                                </Link>
                                <button
                                    type="button"
                                    onClick={() => setApertiManuale((p) => ({ ...p, [c.sez]: !aperto }))}
                                    className="p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 shrink-0"
                                    aria-label={aperto ? "Chiudi sotto-menu" : "Apri sotto-menu"}
                                >
                                    {aperto ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                </button>
                            </div>
                            {aperto && (
                                <div className="pl-4 ml-2 border-l border-white/10 space-y-0.5">
                                    {subsVisibili.map((s) => (
                                        <Link
                                            key={s.id}
                                            href={subHref(s.id)}
                                            onClick={onNavigate}
                                            className={cn(
                                                "flex items-center gap-3 px-3 py-1.5 rounded-lg text-[13px] transition-colors",
                                                subAttiva(s.id) ? "bg-indigo-500/15 text-indigo-300" : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
                                            )}
                                        >
                                            {s.emoji
                                                ? <span className={cn("text-[11px] leading-none shrink-0", !subAttiva(s.id) && "opacity-70")}>{s.emoji}</span>
                                                : <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", subAttiva(s.id) ? "bg-indigo-400" : "bg-slate-600")} />}
                                            {s.name}
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                }
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
