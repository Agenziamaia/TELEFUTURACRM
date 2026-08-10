"use client";

import { Search, ScanLine, Bell, Menu, LogOut, ArrowLeft, Loader2, User as UserIcon, Sun, Moon, KeyRound, ClipboardCheck } from "lucide-react";
import { useQrUpload, QrUploadModal } from "@/lib/useQrUpload";
import { useTema } from "@/lib/theme";
import { UrgentTasks } from "@/components/UrgentTasks";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { roleLabel, seesAllStores } from "@/lib/roles";
import { supabase } from "@/lib/supabaseClient";
import { useRoles } from "@/lib/useRoles";
import { cn } from "@/utils";
import { useRef, useEffect, useState } from "react";
import { campiMancanti, caricaProfilo } from "@/lib/profilo";
import { AvatarUtente } from "@/components/AvatarUtente";

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

export function Header({ onMenuClick, autoHide }: { onMenuClick?: () => void; autoHide?: boolean }) {
    const router = useRouter();
    const pathname = usePathname();
    const [tema, cambiaTema] = useTema();
    const { user, logout, realRole, viewAs, setViewAs, viewAsUser, setViewAsUser } = useAuth();
    // ruoli FUSI codice+DB: anche i ruoli creati da UI si possono impersonare
    const { roles: allRoles } = useRoles();
    // utenti attivi del ruolo simulato, per impersonare la PERSONA (visibilita' sua)
    const [utentiRuolo, setUtentiRuolo] = useState<{ id: string; full_name: string; grade: string | null; primary_store: string | null }[]>([]);
    // MOD-36: contatore voci aperte della sezione Verifiche (solo admin) —
    // aggiornato a ogni navigazione; select difensivo (tabella nuova)
    const [verificheAperte, setVerificheAperte] = useState(0);
    useEffect(() => {
        if (!["admin", "dev"].includes(user?.role || "")) { setVerificheAperte(0); return; }
        let vivo = true;
        supabase.from("dev_updates").select("id", { count: "exact", head: true }).eq("stato", "da_verificare")
            .then(({ count, error }) => { if (vivo && !error) setVerificheAperte(count || 0); });
        return () => { vivo = false; };
    }, [user?.role, pathname]);
    useEffect(() => {
        if (!viewAs) { setUtentiRuolo([]); return; }
        let vivo = true;
        supabase.from("app_users").select("id,full_name,grade,primary_store").eq("role", viewAs).eq("active", true).order("full_name")
            .then(({ data }) => { if (vivo) setUtentiRuolo((data ?? []) as typeof utentiRuolo); });
        return () => { vivo = false; };
    }, [viewAs]);
    const canSwitchRole = !!user?.canSwitchRole;
    // PROFILO (Luca 31/07): pallino rosso se mancano dati; avviso una volta
    // per sessione con l'invito a completarli
    const [profiloIncompleto, setProfiloIncompleto] = useState(false);
    const [avvisoProfilo, setAvvisoProfilo] = useState(false);
    useEffect(() => {
        if (!user?.id) { setProfiloIncompleto(false); return; }
        let vivo = true;
        caricaProfilo(user.id).then((r) => {
            if (!vivo || !r) return;
            const manca = campiMancanti(r).length > 0;
            setProfiloIncompleto(manca);
            if (manca && !sessionStorage.getItem("profilo_avvisato")) setAvvisoProfilo(true);
        });
        return () => { vivo = false; };
    }, [user?.id]);
    const chiudiAvviso = () => { setAvvisoProfilo(false); try { sessionStorage.setItem("profilo_avvisato", "1"); } catch { /* no-op */ } };
    const lastPathRef = useRef<string | null>(null);
    // menu del profilo (03/08): si chiude al click fuori
    const [menuUtente, setMenuUtente] = useState(false);
    const menuUtenteRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        const h = (e: MouseEvent) => { if (menuUtenteRef.current && !menuUtenteRef.current.contains(e.target as Node)) setMenuUtente(false); };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, []);
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
        router.push(`/ricerca-vendite?id=${encodeURIComponent(h.contractId)}`);
    };

    // ─── DropZone: trasferimento volatile telefono → PC via QR (MOD-12, Luca
    //     08/08). Rimpiazza il vecchio tasto "schermo intero". Riusa la stessa
    //     infrastruttura QR di Registra Vendita/Chat/Usati (useQrUpload +
    //     /m/u/<token>): il telefono carica foto/scansioni, qui i File arrivati
    //     vengono SCARICATI sul PC (nessuna copia resta nel CRM: è volatile).
    const scaricaSulPc = (file: File) => {
        const url = URL.createObjectURL(file);
        const a = document.createElement("a");
        a.href = url; a.download = file.name || "file";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    };
    const dropzone = useQrUpload((files) => {
        // download sfalsati: alcuni browser bloccano i download multipli simultanei
        files.forEach((f, i) => setTimeout(() => scaricaSulPc(f), i * 400));
    });

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
                // Contano solo le comunicazioni destinate al proprio ruolo
                // (target_roles NULL = tutti — mig. 104).
                let q = supabase
                    .from("comunicazioni")
                    .select("id", { count: "exact", head: true })
                    .gt("created_at", visto);
                if (user?.role) q = q.or(`target_roles.is.null,target_roles.cs.{${user.role}}`);
                const { count } = await q;
                if (vivo) setNuoveCom(count ?? 0);
            } catch { /* ignore */ }
        })();
        return () => { vivo = false; };
    }, [chiaveVisto, pathname, user?.role]);
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
                {/* hamburger: su mobile apre il drawer; col menù a scomparsa
                    (autoHide) resta visibile ANCHE su desktop e apre/chiude la
                    sidebar col click — senza, l'unica via sarebbe la striscia
                    invisibile sul bordo sinistro (Luca 04/08) */}
                <button
                    onClick={onMenuClick}
                    title="Apri/chiudi il menù"
                    className={cn("p-2 text-slate-400 hover:text-white transition-colors", !autoHide && "lg:hidden")}
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
                {/* Richiesta di Luca: guardare il CRM con gli occhi di un altro ruolo.
                    Il selettore dipende dal ruolo VERO, quindi resta visibile anche
                    mentre si simula un ruolo basso e si puo' sempre tornare indietro.
                    Il ruolo a database non viene mai modificato. */}
                {canSwitchRole && (
                    <div className="hidden md:flex items-center gap-2">
                        <select
                            value={viewAs || ""}
                            onChange={(e) => setViewAs((e.target.value || null) as any)}
                            title="Guarda il CRM come un altro ruolo"
                            className={cn(
                                "h-9 rounded-xl px-3 text-xs font-semibold border transition-colors cursor-pointer",
                                viewAs
                                    ? "bg-amber-500/20 border-amber-500/50 text-amber-200"
                                    : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                            )}
                        >
                            <option value="">{realRole ? roleLabel(realRole) : "—"}</option>
                            {allRoles.filter((r) => r.id !== realRole).map((r) => (
                                <option key={r.id} value={r.id}>{r.label}</option>
                            ))}
                        </select>
                        {/* Secondo passo (richiesta Luca): scegli la PERSONA — visibilita',
                            negozi e identita' diventano esattamente i suoi. */}
                        {viewAs && utentiRuolo.length > 0 && (
                            <select
                                value={viewAsUser?.id || ""}
                                onChange={(e) => {
                                    const u = utentiRuolo.find((x) => x.id === e.target.value);
                                    setViewAsUser(u ? { id: u.id, name: u.full_name, role: viewAs, grade: u.grade, negozio: u.primary_store || undefined } : null);
                                }}
                                title="Impersona un utente specifico: vedrai la SUA visibilita'"
                                className={cn(
                                    "h-9 rounded-xl px-3 text-xs font-semibold border transition-colors cursor-pointer max-w-[180px]",
                                    viewAsUser
                                        ? "bg-amber-500/20 border-amber-500/50 text-amber-200"
                                        : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                                )}
                            >
                                <option value="">Solo ruolo</option>
                                {utentiRuolo.map((u) => (
                                    <option key={u.id} value={u.id}>{u.full_name}{u.primary_store ? ` · ${u.primary_store}` : ""}</option>
                                ))}
                            </select>
                        )}
                        {viewAs && (
                            <button
                                onClick={() => setViewAs(null)}
                                title="Torna al tuo ruolo"
                                className="h-9 px-3 rounded-xl bg-amber-500/20 border border-amber-500/50 text-amber-200 text-xs font-bold hover:bg-amber-500/30"
                            >
                                Esci
                            </button>
                        )}
                    </div>
                )}
                {/* VERIFICHE (MOD-36, Luca 10/08, "momentaneo"): SOLO admin —
                    il recap degli update di sviluppo da esitare + i sospesi
                    che aspettano una risposta. Badge = quante voci aperte. */}
                {["admin", "dev"].includes(user?.role || "") && (
                    <button
                        onClick={() => router.push("/verifiche")}
                        title="Verifiche — update da esitare e questioni in sospeso"
                        className="relative text-slate-400 hover:text-emerald-300 transition-colors"
                    >
                        <ClipboardCheck className="h-5 w-5" />
                        {verificheAperte > 0 && (
                            <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-emerald-600 text-white text-[9px] font-black flex items-center justify-center">
                                {verificheAperte}
                            </span>
                        )}
                    </button>
                )}
                {/* TEMA chiaro/scuro (Luca 29/07): come su telefoni e sistemi
                    operativi — ☀️ accende il chiaro, 🌙 torna allo scuro. */}
                <button
                    onClick={cambiaTema}
                    title={tema === "chiaro" ? "Passa al tema scuro" : "Passa al tema chiaro"}
                    className="text-slate-400 hover:text-white transition-colors"
                >
                    {tema === "chiaro" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
                </button>
                {/* DropZone (MOD-12): un QR volatile per portare foto/scansioni dal
                    telefono a QUESTO PC (si scaricano in locale, niente resta nel CRM). */}
                <button
                    onClick={() => dropzone.openQr("dropzone", "doc")}
                    title="Trasferisci dal telefono (QR): foto e scansioni si scaricano su questo PC"
                    className="text-slate-400 hover:text-white transition-colors"
                >
                    <ScanLine className="h-5 w-5" />
                </button>
                <QrUploadModal qr={dropzone}
                    hint="Inquadra il QR col telefono e carica foto o una scansione PDF: il file si scarica su questo computer."
                    esito={(n) => `${n} file scaricat${n === 1 ? "o" : "i"} su questo PC.`} />
                {/* La campanella = COMUNICAZIONI; le cose DA FARE stanno nella ⚡
                    Task urgenti qui accanto (es. nuovo utente da completare). */}
                <UrgentTasks />
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

                {/* MENU PROFILO (03/08): il click apre un menu — profilo, cambio
                    password e LOG OUT (spostato qui dalla sidebar, dove ora vive
                    l'avviso delle comunicazioni da leggere) */}
                <div className="relative" ref={menuUtenteRef}>
                <button onClick={() => setMenuUtente((o) => !o)} title="Profilo, password e log out"
                    className="flex items-center gap-3 pl-4 border-l border-white/10 cursor-pointer text-left">
                    <div className="hidden text-right md:block">
                        <p className="text-sm font-medium text-white leading-none">{user?.name || "Ospite"}</p>
                        <p className={cn("text-xs mt-1", viewAs ? "text-amber-300 font-semibold" : "text-slate-400")}>
                            {user?.role ? roleLabel(user.role) : "Nessun Ruolo"}{viewAsUser ? ` (simulato: ${viewAsUser.name})` : viewAs ? " (simulato)" : ""}
                        </p>
                    </div>
                    <div className="relative">
                        {/* FOTO PROFILO (Luca 05/08): la foto caricata dal profilo appare
                            anche qui; senza foto restano le iniziali di sempre */}
                        <AvatarUtente userId={user?.id} nome={user?.name || "Ospite"} className="w-9 h-9 text-xs border-2 border-indigo-500/40 text-indigo-300" />
                        {profiloIncompleto && <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-rose-500 border-2 border-[#0f111a] animate-pulse" />}
                    </div>
                </button>
                {menuUtente && (
                    <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-white/10 bg-[#0f1420] shadow-2xl z-[200] p-1.5 space-y-0.5">
                        <button onClick={() => { setMenuUtente(false); router.push("/profilo"); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-200 hover:bg-white/5">
                            <UserIcon className="w-4 h-4 text-slate-400" /> Il mio profilo
                        </button>
                        <button onClick={() => { setMenuUtente(false); router.push("/profilo#cambio-password"); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-200 hover:bg-white/5">
                            <KeyRound className="w-4 h-4 text-slate-400" /> Cambia password
                        </button>
                        <div className="border-t border-white/10 my-1" />
                        <button onClick={() => { setMenuUtente(false); logout(); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-rose-300 hover:bg-rose-500/10">
                            <LogOut className="w-4 h-4" /> Log out
                        </button>
                    </div>
                )}
                </div>
            </div>
            {/* avviso UNA volta per sessione: profilo da completare */}
            {avvisoProfilo && (
                <div className="fixed top-20 right-4 z-[70] glass-card p-4 border-l-4 border-l-amber-500 shadow-2xl max-w-xs">
                    <p className="text-sm font-bold text-amber-300">Il tuo profilo non è completo</p>
                    <p className="text-xs text-slate-400 mt-1">Devi completare le informazioni mancanti: clicca sull&apos;icona del profilo in alto a destra.</p>
                    <div className="flex gap-2 mt-3">
                        <button onClick={() => { chiudiAvviso(); router.push("/profilo"); }} className="px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold hover:bg-amber-500/30">Completa ora</button>
                        <button onClick={chiudiAvviso} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-400 text-xs font-bold hover:bg-white/10">Più tardi</button>
                    </div>
                </div>
            )}
        </header>
    );
}
