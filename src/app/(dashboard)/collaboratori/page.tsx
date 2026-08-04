"use client";

import { useSearchParams } from "next/navigation";
import { SelectPersona, SelectMulti } from "@/components/SelectPersona";
import { designatiIncarico } from "@/lib/incarichi";
import { Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { Clock, Users, UsersRound, CalendarDays, Shield, X, MapPin, Play, Pause, Square, History, Search, Store, ArrowUpDown, ChevronUp, ChevronDown, Check, Clock3, Download, Trash2, Pencil, Plus } from "lucide-react";
import { cn } from "@/utils";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { isAdminOrAbove } from "@/lib/roles";
import { useRolePermissions } from "@/lib/usePermissions";
import { FERIE_SECTION, CAP_FERIE_GESTIONE, capAllowed } from "@/lib/capabilities";
import { scaricaXlsx, type CellaXlsx } from "@/lib/exportXlsx";
import { useVisibleStores } from "@/lib/visibleStores";

// Il tab BADGE e' stato SPOSTATO nell'hub Call Center (/caller?tab=badge, Luca 28/07):
// componenti in ./_badge.tsx, permessi e capacita' migrati (mig. 096).
type TabId = "ferie" | "malattia" | "ritardi" | "turni";

function CollaboratoriPageContent() {
    const { user } = useAuth();
    const searchParams = useSearchParams();
    const tab = (searchParams.get("tab") as TabId) || "ferie";

    // MASCHERA FERIE dai PERMESSI (cap:/collaboratori?tab=ferie:gestione_team,
    // rotellina in Amministrazione → Utenti → Permessi). Luca 27/07: store manager
    // e direttore commerciale NON gestiscono il team — vedono la maschera del
    // consulente (solo le proprie richieste), salvo riaccenderla per ruolo.
    const { perms: capPerms } = useRolePermissions(user?.role, user?.grade);
    const gestioneFerie = !!user && capAllowed(user.role, FERIE_SECTION, CAP_FERIE_GESTIONE, capPerms);

    const sectionInfo = {
        ferie: { label: "Ferie", icon: CalendarDays, desc: "Pianificazione, richieste e approvazione ferie" },
        malattia: { label: "Malattia", icon: Shield, desc: "Registro e monitoraggio assenze per malattia" },
        ritardi: { label: "Ritardi", icon: Clock3, desc: "Segnalazione e monitoraggio ritardi (staff di negozio)" },
        turni: { label: "Turni", icon: UsersRound, desc: "Chi è in quale punto vendita, orari e coperture" },
    };

    const currentSection = sectionInfo[tab] || sectionInfo.ferie;

    return (
        <div className="w-full max-w-7xl mx-auto space-y-6">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-500/10 rounded-2xl border border-indigo-500/20 shadow-xl shadow-indigo-500/5">
                        <currentSection.icon className="w-8 h-8 text-indigo-400" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-white tracking-tight">
                            {currentSection.label}
                        </h1>
                        <p className="text-slate-500 font-medium">
                            {currentSection.desc}
                        </p>
                    </div>
                </div>
            </div>

            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                {tab === "ferie" && <FerieSection isAdminLike={gestioneFerie} />}
                {tab === "malattia" && isAdminOrAbove(user?.role) && <MalattiaSection />}
                {tab === "malattia" && !isAdminOrAbove(user?.role) && (
                    <div className="glass-card p-12 text-center">
                        <Shield className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-white">Accesso Riservato</h3>
                        <p className="text-slate-500 max-w-md mx-auto mt-2">Questa sezione è accessibile solo agli amministratori e ai responsabili.</p>
                    </div>
                )}
                {tab === "ritardi" && <RitardiSection />}
                {tab === "turni" && <TurniSection />}
            </div>
        </div>
    );
}

export default function CollaboratoriPage() {
    return (
        <Suspense fallback={
            <div className="w-full h-screen flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
            </div>
        }>
            <CollaboratoriPageContent />
        </Suspense>
    );
}

type VacationRequest = { id: number; employee_name: string; store: string; date_from: string; date_to: string; reason: string | null; status: string; admin_note: string | null; created_at: string; half_day?: string | null; tipo?: string | null };

function FerieSection({ isAdminLike }: { isAdminLike: boolean }) {
    const { user } = useAuth();
    // Regola Luca 25/07: la RICHIESTA ferie e' per tutti (store manager compreso)
    // TRANNE dall'amministrativo in su, che le ferie le approva e basta.
    const puoRichiedere = !["amministrativo", "admin", "dev", "direttore_generale"].includes(user?.role || "");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [reason, setReason] = useState("");
    // MEZZA GIORNATA (Luca 29/07): solo su giorno SINGOLO, con fascia oraria
    const [halfDay, setHalfDay] = useState<"" | "mattina" | "pomeriggio">("");
    const giornoSingolo = !!dateFrom && !!dateTo && dateFrom === dateTo;
    const [submitting, setSubmitting] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [requests, setRequests] = useState<VacationRequest[]>([]);
    // FILTRI (Luca 29/07): persone e negozi MULTI + periodo — valgono sia sul
    // registro sia sul calendario dedicato; vista commutabile per chi approva.
    const [fPersone, setFPersone] = useState<string[]>([]);
    const [fNegozi, setFNegozi] = useState<string[]>([]);
    const [fDa, setFDa] = useState("");
    const [fA, setFA] = useState("");
    const [vista, setVista] = useState<"registro" | "calendario">("registro");
    const [meseCal, setMeseCal] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
    const [rifiutoId, setRifiutoId] = useState<number | null>(null);
    const [rifiutoNota, setRifiutoNota] = useState("");
    const canDeleteRow = ["amministrativo", "admin", "dev", "direttore_generale"].includes(user?.role || "");
    // REGISTRAZIONE DIRETTA col "+" (03/08, dall'amministrativo in su): ferie
    // gia' concordate per altre vie (a voce, telefono…) entrano nel registro
    // direttamente come APPROVATE, con nota di chi le ha registrate.
    const puoRegistrare = canDeleteRow;
    const [regOpen, setRegOpen] = useState(false);
    const [regTipo, setRegTipo] = useState<"ferie" | "corso">("ferie");   // ＋ Ferie / ＋ Corsi (mig. 145)
    const [regPersona, setRegPersona] = useState("");
    const [regDal, setRegDal] = useState("");
    const [regAl, setRegAl] = useState("");
    const [regMotivo, setRegMotivo] = useState("");
    const [regHalf, setRegHalf] = useState<"" | "mattina" | "pomeriggio">("");
    const [regBusy, setRegBusy] = useState(false);
    const [staff, setStaff] = useState<{ full_name: string; primary_store: string | null }[]>([]);
    useEffect(() => {
        if (!puoRegistrare) return;
        supabase.from("app_users").select("full_name, primary_store").eq("active", true).order("full_name")
            .then(({ data }) => setStaff((data ?? []) as never));
    }, [puoRegistrare]);
    const regGiornoSingolo = !!regDal && !!regAl && regDal === regAl;
    const registraDiretta = async () => {
        if (!regPersona || !regDal || !regAl || regAl < regDal || regBusy) return;
        setRegBusy(true);
        await supabase.from("vacation_requests").insert({
            employee_name: regPersona,
            store: staff.find(s => s.full_name === regPersona)?.primary_store || "",
            date_from: regDal,
            date_to: regAl,
            reason: regMotivo.trim() || null,
            status: "approved",
            half_day: regGiornoSingolo && regHalf ? regHalf : null,
            admin_note: regTipo === "corso" ? `Corso registrato da ${user?.name || "—"}` : `Registrata direttamente da ${user?.name || "—"}`,
            decided_by: user?.name || "—",
            decided_at: new Date().toISOString(),
            tipo: regTipo,
        });
        setRegBusy(false); setRegOpen(false);
        setRegPersona(""); setRegDal(""); setRegAl(""); setRegMotivo(""); setRegHalf("");
        await fetchRequests();
    };

    const fetchRequests = useCallback(async () => {
        const { data } = await supabase.from("vacation_requests").select("*").order("created_at", { ascending: false });
        setRequests((data ?? []) as VacationRequest[]);
    }, []);

    // ── GIORNI FESTIVI (mig. 143, 03/08): i "giorni rossi" — mai contati nei
    //    giorni effettivi di ferie (come le domeniche, MAI lavorative),
    //    evidenziati nel calendario, amministrabili dal bottone Festivi.
    const [festivi, setFestivi] = useState<{ giorno: string; nome: string }[]>([]);
    const caricaFestivi = useCallback(async () => {
        const { data } = await supabase.from("giorni_festivi").select("giorno, nome").order("giorno");
        setFestivi((data ?? []) as { giorno: string; nome: string }[]);
    }, []);
    useEffect(() => { caricaFestivi(); }, [caricaFestivi]);
    const festiviSet = useMemo(() => new Set(festivi.map(f => f.giorno)), [festivi]);
    const festiviMap = useMemo(() => new Map(festivi.map(f => [f.giorno, f.nome] as [string, string])), [festivi]);
    // MALATTIE nel calendario ferie (03/08): per approvare sapendo chi manca
    // gia' quel giorno — si mostrano in fucsia col simbolo 🤒
    const [malattie, setMalattie] = useState<{ id: number; employee_name: string; store: string; date_from: string; date_to: string }[]>([]);
    useEffect(() => {
        supabase.from("sickness_absences").select("id, employee_name, store, date_from, date_to")
            .then(({ data }) => setMalattie((data ?? []) as never));
    }, []);
    const malattieFiltrate = useMemo(() => malattie.filter(m =>
        (!fPersone.length || fPersone.includes(m.employee_name)) &&
        (!fNegozi.length || fNegozi.includes(m.store))
    ), [malattie, fPersone, fNegozi]);
    const [showFestivi, setShowFestivi] = useState(false);
    const [nFestivoData, setNFestivoData] = useState("");
    const [nFestivoNome, setNFestivoNome] = useState("");
    const [annoFestivi, setAnnoFestivi] = useState(new Date().getFullYear());
    // giorni EFFETTIVI di una richiesta: esclusi domeniche e festivi
    const giorniEffettivi = useCallback((r: VacationRequest) => {
        const conta = (ymd: string) => { const d = new Date(ymd + "T12:00"); return d.getDay() !== 0 && !festiviSet.has(ymd); };
        if (r.half_day) return conta(r.date_from) ? 0.5 : 0;
        let n = 0;
        const d = new Date(r.date_from + "T12:00");
        const fine = new Date(r.date_to + "T12:00");
        while (d <= fine) {
            const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            if (conta(ymd)) n++;
            d.setDate(d.getDate() + 1);
        }
        return n;
    }, [festiviSet]);

    useEffect(() => {
        fetchRequests();
    }, [fetchRequests]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!dateFrom || !dateTo || !user?.name) return;
        setSubmitting(true);
        await supabase.from("vacation_requests").insert({
            employee_name: user.name,
            store: user.negozio ?? "",
            date_from: dateFrom,
            date_to: dateTo,
            reason: reason || null,
            status: "pending",
            half_day: giornoSingolo && halfDay ? halfDay : null,
        });
        // FULMINE ai DESIGNATI (incarico 'ferie', se il flag è attivo): task ⚡
        // indirizzato solo a loro; il pallino sulla sezione arriva comunque.
        try {
            const { ids: ass, fulmine } = await designatiIncarico("ferie");
            if (fulmine && ass.length) {
                await supabase.from("admin_tasks").insert(ass.map((uid) => ({
                    tipo: "ferie_richiesta",
                    titolo: `🏖 Richiesta ferie: ${user.name} (${dateFrom.split("-").reverse().join("/")} → ${dateTo.split("-").reverse().join("/")})`,
                    dettaglio: reason || "Senza motivazione.",
                    link: "/collaboratori?tab=ferie",
                    target_role: "admin",
                    created_by: user.name,
                    target_user_id: uid,
                })));
            }
        } catch { /* la richiesta resta salvata comunque */ }
        await fetchRequests();
        setDateFrom("");
        setDateTo("");
        setReason("");
        setHalfDay("");
        setSubmitting(false);
    };

    // DECISORE E MOMENTO (mig. 138, 03/08): viaggiano con la richiesta — cosi'
    // lo Storico Approvazioni mostra CHI ha approvato o rifiutato le ferie.
    const approva = async (id: number) => {
        await supabase.from("vacation_requests").update({ status: "approved", decided_by: user?.name || "—", decided_at: new Date().toISOString() }).eq("id", id);
        await fetchRequests();
    };
    // RIFIUTO CON NOTA (Luca 29/07): la nota la vede il collaboratore in riga
    const confermaRifiuto = async () => {
        if (rifiutoId == null) return;
        await supabase.from("vacation_requests").update({ status: "rejected", admin_note: rifiutoNota.trim() || null, decided_by: user?.name || "—", decided_at: new Date().toISOString() }).eq("id", rifiutoId);
        setRifiutoId(null); setRifiutoNota("");
        await fetchRequests();
    };
    // CESTINO (amministrativo in su): per le righe di prova o gli errori
    const eliminaRiga = async (id: number) => {
        if (!window.confirm("Eliminare questa riga di ferie dal registro? L'operazione è definitiva.")) return;
        await supabase.from("vacation_requests").delete().eq("id", id);
        await fetchRequests();
    };

    const [kpiFerie, setKpiFerie] = useState("");   // card-filtro attiva ("" = nessuna)
    // SALTO CALENDARIO (Luca 03/08 sera): la card non solo filtra, PILOTA il
    // calendario — oggi → vista Giorno su oggi; questa/prossima settimana →
    // vista Settimana sul periodo giusto; In attesa → toggle attese acceso.
    const [calSalto, setCalSalto] = useState<{ data?: string; modo?: "giorno" | "settimana"; attesa?: boolean; n: number } | null>(null);
    const filteredRequests = requests.filter(r =>
        (!fPersone.length || fPersone.includes(r.employee_name)) &&
        (!fNegozi.length || fNegozi.includes(r.store)) &&
        (!fDa || r.date_to >= fDa) && (!fA || r.date_from <= fA)
    );
    const persone = [...new Set(requests.map(r => r.employee_name))].sort();
    const negozi = [...new Set(requests.map(r => r.store).filter(Boolean))].sort();
    // contatori sul FILTRO attivo (03/08): scegliendo persone/negozi/periodo i numeri seguono
    const oggiYmd = new Date().toISOString().slice(0, 10);
    const soloFerie = filteredRequests.filter(r => (r.tipo || "ferie") !== "corso");   // i CORSI non contano nei numeri ferie
    // settimana corrente (lun-dom) e prossima: per le due card nuove (Luca 03/08)
    const _ymdF = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const _lun = (() => { const x = new Date(); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; })();
    const _addG = (base: Date, n: number) => { const x = new Date(base); x.setDate(x.getDate() + n); return x; };
    const lunYmd = _ymdF(_lun), domYmd = _ymdF(_addG(_lun, 6)), lunProxYmd = _ymdF(_addG(_lun, 7)), domProxYmd = _ymdF(_addG(_lun, 13));
    const inFerieOggi = soloFerie.filter(r => r.status === "approved" && r.date_from <= oggiYmd && r.date_to >= oggiYmd).length;
    const inFerieSettimana = soloFerie.filter(r => r.status === "approved" && r.date_from <= domYmd && r.date_to >= lunYmd).length;
    const inFerieProssima = soloFerie.filter(r => r.status === "approved" && r.date_from <= domProxYmd && r.date_to >= lunProxYmd).length;
    const inAttesa = soloFerie.filter(r => r.status === "pending").length;
    // CARD-FILTRO (Luca 03/08): il click accende/spegne il filtro sul registro
    const kpiMatch = (r: { tipo?: string | null; status: string; date_from: string; date_to: string }) => {
        if (!kpiFerie) return true;
        if ((r.tipo || "ferie") === "corso") return false;
        if (kpiFerie === "attesa") return r.status === "pending";
        if (kpiFerie === "oggi") return r.status === "approved" && r.date_from <= oggiYmd && r.date_to >= oggiYmd;
        if (kpiFerie === "settimana") return r.status === "approved" && r.date_from <= domYmd && r.date_to >= lunYmd;
        if (kpiFerie === "prossima") return r.status === "approved" && r.date_from <= domProxYmd && r.date_to >= lunProxYmd;
        return true;
    };
    const richiesteVisibili = filteredRequests.filter(kpiMatch);

    const formatDate = (iso: string) => {
        return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {isAdminLike && (
                <div className="space-y-2">
                    {puoRegistrare && (
                        <div className="flex justify-end">
                            <button onClick={() => setShowFestivi(true)} title="I giorni rossi considerati nel conteggio dei giorni effettivi (domeniche escluse a prescindere) — dentro scorri anno per anno"
                                className="px-3 py-1.5 rounded-lg border border-rose-400/40 bg-rose-500/10 text-rose-300 text-[11px] font-bold hover:bg-rose-500/20">
                                🔴 Festivi {new Date().getFullYear()} ({festivi.filter(f => f.giorno.startsWith(String(new Date().getFullYear()))).length})
                            </button>
                        </div>
                    )}
                    {/* CARD-FILTRO cliccabili (Luca 03/08): In attesa per prima, poi
                        oggi / questa settimana / prossima settimana — click = filtro
                        sul registro, altro click = si toglie */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {([
                            ["attesa", "In Attesa", inAttesa, "amber"],
                            ["oggi", "In Ferie Oggi", inFerieOggi, "sky"],
                            ["settimana", "In Ferie questa settimana", inFerieSettimana, "emerald"],
                            ["prossima", "In Ferie la prossima settimana", inFerieProssima, "indigo"],
                        ] as [string, string, number, string][]).map(([id, label, val, col]) => {
                            const attiva = kpiFerie === id;
                            const bordo = col === "amber" ? "border-l-amber-500" : col === "sky" ? "border-l-sky-500" : col === "emerald" ? "border-l-emerald-500" : "border-l-indigo-500";
                            const ring = col === "amber" ? "ring-amber-400/60 bg-amber-500/10" : col === "sky" ? "ring-sky-400/60 bg-sky-500/10" : col === "emerald" ? "ring-emerald-400/60 bg-emerald-500/10" : "ring-indigo-400/60 bg-indigo-500/10";
                            return (
                                <button key={id} type="button" onClick={() => {
                                    const accendo = !attiva;
                                    setKpiFerie(accendo ? id : "");
                                    if (!accendo) return;
                                    if (id === "oggi") setCalSalto({ data: oggiYmd, modo: "giorno", n: Date.now() });
                                    else if (id === "settimana") setCalSalto({ data: oggiYmd, modo: "settimana", n: Date.now() });
                                    else if (id === "prossima") setCalSalto({ data: lunProxYmd, modo: "settimana", n: Date.now() });
                                    else if (id === "attesa") setCalSalto({ attesa: true, n: Date.now() });
                                }}
                                    title={attiva ? "Filtro attivo — clicca per toglierlo" : "Clicca per filtrare registro e calendario"}
                                    className={cn("glass-panel p-3.5 border-l-4 text-left transition-all cursor-pointer", bordo, attiva && `ring-2 ${ring}`)}>
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">{attiva ? "✓ " : ""}{label}</p>
                                    <p className="text-xl font-black text-white">{val}</p>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className={cn("grid grid-cols-1 gap-6", puoRichiedere ? "xl:grid-cols-12" : "xl:grid-cols-1")}>
                {/* Form Richiesta */}
                {puoRichiedere && showForm && (
                    <div className="xl:col-span-4 space-y-6 animate-in slide-in-from-left-4 duration-300">
                        <div className="glass-card p-6 border-indigo-500/30">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-indigo-500/10 rounded-lg">
                                        <CalendarDays className="w-5 h-5 text-indigo-400" />
                                    </div>
                                    <h3 className="text-lg font-bold text-white">Nuova Richiesta</h3>
                                </div>
                                <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-white/5 rounded-lg text-slate-500 transition-colors">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Dal</label>
                                        <input type="date" required value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="glass-input !h-10 text-xs w-full" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Al</label>
                                        <input type="date" required value={dateTo} onChange={e => setDateTo(e.target.value)} className="glass-input !h-10 text-xs w-full" />
                                    </div>
                                </div>
                                <div className={cn("rounded-xl border p-3 space-y-2 transition-all", giornoSingolo ? "border-amber-500/30 bg-amber-500/[0.04]" : "border-white/5 bg-white/[0.02] opacity-50")}>
                                    <label className={cn("flex items-center gap-2 text-xs font-bold", giornoSingolo ? "text-slate-200 cursor-pointer" : "text-slate-600 cursor-not-allowed")}>
                                        <input type="checkbox" disabled={!giornoSingolo} checked={giornoSingolo && !!halfDay}
                                            onChange={e => setHalfDay(e.target.checked ? "mattina" : "")}
                                            className="accent-amber-500 w-4 h-4" />
                                        Mezza giornata
                                        {!giornoSingolo && <span className="font-normal normal-case text-[10px]">(disponibile solo su un giorno singolo)</span>}
                                    </label>
                                    {giornoSingolo && !!halfDay && (
                                        <div className="flex gap-2">
                                            {([["mattina", "☀️ Mattina"], ["pomeriggio", "🌇 Pomeriggio"]] as const).map(([k, lab]) => (
                                                <button key={k} type="button" onClick={() => setHalfDay(k)}
                                                    className={cn("flex-1 px-3 py-2 rounded-lg border text-xs font-bold transition-all",
                                                        halfDay === k ? "border-amber-400/70 bg-amber-500/20 text-amber-200" : "border-white/10 text-slate-400 hover:border-white/25")}>
                                                    {lab}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Motivazione</label>
                                    <textarea placeholder="Esempio: Ferie estive..." value={reason} onChange={e => setReason(e.target.value)} className="glass-input min-h-[80px] py-3 text-xs w-full resize-none" />
                                </div>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="w-full h-11 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-sm transition-all shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
                                >
                                    <CalendarDays className="w-4 h-4" />
                                    {submitting ? "Invio in corso..." : "Invia Richiesta"}
                                </button>
                            </form>
                        </div>

                        <div className="glass-panel p-5 bg-amber-500/5 border border-amber-500/10">
                            <div className="flex gap-3">
                                <Shield className="w-5 h-5 text-amber-500 shrink-0" />
                                <div className="space-y-1">
                                    <p className="text-xs font-bold text-amber-500 uppercase tracking-tight">Nota Bene</p>
                                    <p className="text-[11px] text-slate-400 leading-relaxed">
                                        L'approvazione delle ferie dipende dalla disponibilità del punto vendita e dai carichi di lavoro. Controlla lo stato della tua richiesta in questa pagina.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Tabella Richieste */}
                <div className={cn(!puoRichiedere ? "xl:col-span-1" : showForm ? "xl:col-span-8" : "xl:col-span-12", "space-y-4")}>
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 px-1">
                        <div className="space-y-0.5">
                            <h3 className="text-lg font-bold text-white uppercase tracking-tight">
                                {isAdminLike ? "Registro Richieste Team" : "Le Tue Richieste"}
                            </h3>
                            <p className="text-xs text-slate-500">Monitoraggio e gestione dello stato approvazioni</p>
                        </div>

                        {/* controlli in UN gruppo compatto a destra (03/08): prima il
                            justify-between del contenitore li sparpagliava sulla riga */}
                        <div className="flex items-center gap-2 flex-wrap">
                        {puoRichiedere && !showForm && (
                            <button
                                onClick={() => setShowForm(true)}
                                className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-indigo-500/25 flex items-center gap-2 active:scale-[0.98]"
                            >
                                <CalendarDays className="w-4 h-4" />
                                Nuova Richiesta
                            </button>
                        )}

                        {isAdminLike && (
                            <button onClick={() => {
                                // giorni EFFETTIVI (03/08): domeniche e festivi non contano
                                // GLB-03: da CSV a vero .xlsx \u2014 giorni come cella numerica,
                                // via i replaceAll(';') che aggiravano il separatore CSV
                                const giorni = giorniEffettivi;
                                const intestazioni = ["Collaboratore", "Negozio", "Dal", "Al", "Giorni", "Mezza giornata", "Stato", "Motivazione", "Nota amministrazione"];
                                const righe: CellaXlsx[][] = richiesteVisibili.map(r => [
                                    r.employee_name, r.store, formatDate(r.date_from), formatDate(r.date_to),
                                    giorni(r),
                                    r.half_day ? (r.half_day === "mattina" ? "Mattina" : "Pomeriggio") : "",
                                    r.status === "approved" ? "Approvata" : r.status === "rejected" ? "Rifiutata" : "In attesa",
                                    r.reason || "", r.admin_note || "",
                                ]);
                                void scaricaXlsx(`ferie_${fDa || "inizio"}_${fA || "oggi"}`, intestazioni, righe, "Ferie");
                            }} disabled={richiesteVisibili.length === 0}
                                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-40">
                                ⬇️ Excel
                            </button>
                        )}

                        {puoRegistrare && (<>
                            <button onClick={() => { setRegTipo("ferie"); setRegOpen(true); }}
                                title="Registra ferie già approvate per altre vie: entrano nel registro direttamente come Approvate"
                                className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-500/15 border border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/25 flex items-center gap-1.5">
                                <span className="text-base leading-none">＋</span> Ferie
                            </button>
                            <button onClick={() => { setRegTipo("corso"); setRegOpen(true); }}
                                title="Registra un CORSO di formazione: compare in calendario con un colore dedicato e non conta nei giorni di ferie"
                                className="px-4 py-2 rounded-xl text-xs font-bold bg-sky-500/15 border border-sky-500/40 text-sky-300 hover:bg-sky-500/25 flex items-center gap-1.5">
                                <span className="text-base leading-none">＋</span> Corsi
                            </button>
                        </>)}
                        {isAdminLike && (
                            <div className="flex items-center gap-1 rounded-xl border border-white/10 p-1 bg-white/[0.03]">
                                {(["registro", "calendario"] as const).map(v => (
                                    <button key={v} onClick={() => setVista(v)}
                                        className={cn("px-3.5 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-colors",
                                            vista === v ? "bg-indigo-500/25 text-indigo-200" : "text-slate-500 hover:text-slate-300")}>
                                        {v === "registro" ? "📋 Registro" : "🗓 Calendario"}
                                    </button>
                                ))}
                            </div>
                        )}
                        </div>
                    </div>

                    {isAdminLike && (
                        <div className="glass-card p-4 space-y-2.5">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest w-16">Periodo</span>
                                <input type="date" value={fDa} onChange={e => setFDa(e.target.value)} className="glass-input !h-8 text-xs" />
                                <span className="text-slate-600 text-xs">→</span>
                                <input type="date" value={fA} onChange={e => setFA(e.target.value)} className="glass-input !h-8 text-xs" />
                                {(fDa || fA) && <button onClick={() => { setFDa(""); setFA(""); }} className="text-[10px] font-bold text-slate-500 hover:text-white">✕ azzera</button>}
                            </div>
                            {/* PERSONE: SelectMulti STANDARD (03/08) — allineata alle altre tendine,
                                multiselezione con chips */}
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest w-16 shrink-0">Persone</span>
                                <div className="w-80"><SelectMulti values={fPersone} onChange={setFPersone} opzioni={persone} maxVoci={100} placeholder="Tutte — scrivi per filtrare" className="glass-input text-xs rounded-lg py-1.5 w-full" /></div>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest w-16">Negozi</span>
                                <button onClick={() => setFNegozi([])} className={cn("px-2.5 py-1 rounded-full text-[11px] font-bold border", !fNegozi.length ? "border-sky-400/70 bg-sky-500/15 text-sky-200" : "border-white/10 text-slate-400 hover:border-white/25")}>Tutti</button>
                                {negozi.map(n => (
                                    <button key={n} onClick={() => setFNegozi(p => p.includes(n) ? p.filter(x => x !== n) : [...p, n])}
                                        className={cn("px-2.5 py-1 rounded-full text-[11px] font-bold border", fNegozi.includes(n) ? "border-sky-400/70 bg-sky-500/20 text-sky-100" : "border-white/10 text-slate-400 hover:border-white/25")}>
                                        {fNegozi.includes(n) ? "✓ " : ""}{n}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    {isAdminLike && vista === "calendario" && (
                        <CalendarioFerie
                            richieste={richiesteVisibili.filter(r => r.status !== "rejected")}
                            mese={meseCal}
                            setMese={setMeseCal}
                            festivi={festiviMap}
                            malattie={malattieFiltrate}
                            vaiA={calSalto}
                        />
                    )}

                    {(!isAdminLike || vista === "registro") && (
                    <div className="glass-card overflow-hidden">
                        <div className="overflow-x-auto custom-scrollbar">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-white/[0.02] border-b border-white/5">
                                        <th className="px-5 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Periodo</th>
                                        <th className="px-5 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Collaboratore</th>
                                        <th className="px-5 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Motivazione</th>
                                        <th className="px-5 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Stato</th>
                                        <th className="px-5 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Azioni</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {(isAdminLike ? richiesteVisibili : requests.filter(r => r.employee_name === user?.name)).map(r => (
                                        <tr key={r.id} className="hover:bg-white/[0.01] transition-colors group">
                                            <td className="px-5 py-4">
                                                {/* PERIODO su UNA riga (03/08): dal → al; giorno singolo = solo la data */}
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-bold text-white group-hover:text-indigo-400 transition-colors whitespace-nowrap">
                                                        {formatDate(r.date_from)}{r.date_to !== r.date_from && <span> → {formatDate(r.date_to)}</span>}
                                                    </span>
                                                    {r.half_day && (
                                                        <span className="mt-0.5 inline-flex items-center gap-1 self-start px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[10px] font-black uppercase tracking-tight">
                                                            {r.half_day === "mattina" ? "☀️" : "🌇"} ½ giornata · {r.half_day}
                                                        </span>
                                                    )}
                                                    {(r.tipo || "ferie") === "corso" && (
                                                        <span className="mt-0.5 inline-flex items-center gap-1 self-start px-2 py-0.5 rounded-full bg-sky-500/15 border border-sky-500/40 text-sky-300 text-[10px] font-black uppercase tracking-tight chip-corso">🎓 Corso</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-5 py-4">
                                                <p className="text-sm font-medium text-slate-300">{r.employee_name}</p>
                                                <p className="text-[10px] text-slate-500 uppercase tracking-wider">{r.store}</p>
                                            </td>
                                            <td className="px-5 py-4">
                                                {/* MOTIVAZIONE della richiesta (03/08): sempre in colonna */}
                                                {r.reason
                                                    ? <p className="text-xs text-slate-400 leading-snug max-w-[280px]">{r.reason}</p>
                                                    : <span className="text-xs text-slate-600 italic">—</span>}
                                            </td>
                                            <td className="px-5 py-4 text-center">
                                                <span className={cn(
                                                    "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-tight border",
                                                    r.status === "approved" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                                                        r.status === "rejected" ? "bg-rose-500/10 text-rose-500 border-rose-500/20" :
                                                            "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                                )}>
                                                    {r.status === "approved" ? "Approvata" : r.status === "rejected" ? "Rifiutata" : "In Attesa"}
                                                </span>
                                                {r.admin_note && (
                                                    /* rosso solo sui rifiuti; per le registrazioni dirette e' una nota d'archivio */
                                                    <p className={cn("text-[10px] mt-1.5 max-w-[240px] mx-auto leading-snug", r.status === "rejected" ? "text-rose-300/90" : "text-slate-500")}>📝 {r.admin_note}</p>
                                                )}
                                            </td>
                                            <td className="px-5 py-4 text-right">
                                                <div className="flex justify-end items-center gap-2">
                                                    {isAdminLike && r.status === "pending" ? (
                                                        <>
                                                            <button
                                                                onClick={() => approva(r.id)}
                                                                className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/20 rounded-lg transition-colors"
                                                                title="Approva"
                                                            >
                                                                <Check className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => { setRifiutoId(r.id); setRifiutoNota(""); }}
                                                                className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/20 rounded-lg transition-colors"
                                                                title="Rifiuta (con nota per il collaboratore)"
                                                            >
                                                                <X className="w-4 h-4" />
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <span className="text-xs text-slate-600 font-medium italic">Gestita</span>
                                                    )}
                                                    {canDeleteRow && (
                                                        <button onClick={() => eliminaRiga(r.id)} title="Elimina riga (es. inserita per prova)"
                                                            className="p-1.5 bg-white/[0.03] hover:bg-rose-500/15 text-slate-500 hover:text-rose-300 border border-white/10 rounded-lg transition-colors">
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {requests.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="px-5 py-10 text-center text-slate-500 text-sm italic">Nessuna richiesta trovata</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    )}
                </div>
            </div>

            {/* modale REGISTRAZIONE DIRETTA (03/08): ferie gia' approvate per
                altre vie — entrano nel registro come Approvate, con audit */}
            {regOpen && (
                <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setRegOpen(false)}>
                    <div className="glass-card w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-white/10 flex items-center justify-between">
                            <h3 className="text-lg font-bold text-white">{regTipo === "corso" ? "＋ Registra corso di formazione" : "＋ Registra ferie approvate"}</h3>
                            <button onClick={() => setRegOpen(false)} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/10"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-5 space-y-4">
                            <p className="text-xs text-slate-500 leading-relaxed">{regTipo === "corso" ? <>Il corso entra nel registro come <strong className="text-sky-400">Corso</strong> (colore dedicato in calendario, escluso dai giorni di ferie), con la nota di chi l&apos;ha registrato.</> : <>Per ferie già concordate fuori dal CRM (a voce, al telefono…): la riga entra nel registro direttamente come <strong className="text-emerald-400">Approvata</strong>, con la nota di chi l&apos;ha registrata.</>}</p>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Collaboratore</label>
                                <SelectPersona value={regPersona} onChange={setRegPersona} opzioni={staff.map(s => s.full_name)} placeholder="Scrivi o scegli il collaboratore…" className="glass-input rounded-lg py-2 w-full text-sm" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Dal</label>
                                    <input type="date" value={regDal} onChange={e => setRegDal(e.target.value)} className="glass-input !h-10 text-xs w-full" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Al</label>
                                    <input type="date" value={regAl} onChange={e => setRegAl(e.target.value)} className="glass-input !h-10 text-xs w-full" />
                                </div>
                            </div>
                            {regDal && regAl && regAl < regDal && <p className="text-[11px] text-rose-400">La data di fine è prima di quella di inizio.</p>}
                            {regGiornoSingolo && (
                                <div className="flex items-center gap-2">
                                    <label className="flex items-center gap-2 text-xs font-bold text-slate-200 cursor-pointer">
                                        <input type="checkbox" checked={!!regHalf} onChange={e => setRegHalf(e.target.checked ? "mattina" : "")} className="accent-amber-500 w-4 h-4" />
                                        Mezza giornata
                                    </label>
                                    {!!regHalf && ([["mattina", "☀️ Mattina"], ["pomeriggio", "🌇 Pomeriggio"]] as const).map(([k, lab]) => (
                                        <button key={k} type="button" onClick={() => setRegHalf(k)}
                                            className={cn("px-3 py-1.5 rounded-lg border text-xs font-bold transition-all", regHalf === k ? "border-amber-400/70 bg-amber-500/20 text-amber-200" : "border-white/10 text-slate-400 hover:border-white/25")}>
                                            {lab}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Motivazione</label>
                                <textarea value={regMotivo} onChange={e => setRegMotivo(e.target.value)} rows={2}
                                    placeholder="Es. concordate a voce col negozio per il ponte di Ferragosto"
                                    className="glass-input w-full text-sm py-2 resize-none" />
                            </div>
                            <div className="flex justify-end gap-2 pt-1">
                                <button onClick={() => setRegOpen(false)} className="px-4 py-2 rounded-lg border border-white/15 text-slate-300 text-sm hover:bg-white/5">Annulla</button>
                                <button onClick={registraDiretta} disabled={!regPersona || !regDal || !regAl || regAl < regDal || regBusy}
                                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed">
                                    {regBusy ? "Salvataggio…" : regTipo === "corso" ? "Registra il corso" : "Registra come approvata"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* modale FESTIVI (mig. 143): i giorni rossi considerati nel conteggio */}
            {showFestivi && (
                <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setShowFestivi(false)}>
                    <div className="glass-card w-full max-w-lg shadow-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-white/10 flex items-center justify-between">
                            <h3 className="text-lg font-bold text-white flex items-center gap-3">🔴 Festivi
                                <span className="flex items-center gap-1.5 text-sm font-black">
                                    <button onClick={() => setAnnoFestivi(a => a - 1)} className="px-2 py-0.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300">‹</button>
                                    <span className="min-w-[54px] text-center">{annoFestivi}</span>
                                    <button onClick={() => setAnnoFestivi(a => a + 1)} className="px-2 py-0.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300">›</button>
                                </span>
                                <span className="text-xs font-bold text-rose-300">{festivi.filter(f => f.giorno.startsWith(String(annoFestivi))).length} giorni</span>
                            </h3>
                            <button onClick={() => setShowFestivi(false)} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/10"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-5 space-y-4 overflow-y-auto">
                            <p className="text-xs text-slate-500">Questi giorni (più TUTTE le domeniche, mai lavorative) non contano nei giorni effettivi di ferie e sono evidenziati in rosso sul calendario.</p>
                            <div className="divide-y divide-white/5 rounded-xl border border-white/10 overflow-hidden">
                                {festivi.filter(f => f.giorno.startsWith(String(annoFestivi))).map(f => (
                                    <div key={f.giorno} className="flex items-center gap-3 px-4 py-2.5 bg-white/[0.02] text-sm">
                                        <span className="font-mono text-rose-300">{f.giorno.split("-").reverse().join("/")}</span>
                                        <span className="text-slate-200">{f.nome || "—"}</span>
                                        <button onClick={async () => { if (!window.confirm(`Togliere "${f.nome}" (${f.giorno.split("-").reverse().join("/")}) dai festivi?`)) return; await supabase.from("giorni_festivi").delete().eq("giorno", f.giorno); await caricaFestivi(); }}
                                            title="Togli dai festivi" className="ml-auto p-1.5 rounded-lg text-slate-600 hover:text-rose-400 hover:bg-rose-500/10"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                ))}
                                {festivi.filter(f => f.giorno.startsWith(String(annoFestivi))).length === 0 && <p className="p-4 text-sm text-slate-500">Nessun festivo censito per il {annoFestivi}.</p>}
                            </div>
                            <div className="rounded-xl border border-white/10 p-3.5 space-y-2">
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Aggiungi un festivo</p>
                                <div className="flex gap-2 flex-wrap">
                                    <input type="date" value={nFestivoData} onChange={e => setNFestivoData(e.target.value)} className="glass-input !h-10 text-xs" />
                                    <input value={nFestivoNome} onChange={e => setNFestivoNome(e.target.value)} placeholder="Nome (es. Patrono)" className="glass-input !h-10 text-xs flex-1 min-w-[160px]" />
                                    <button onClick={async () => { if (!nFestivoData) return; const { error } = await supabase.from("giorni_festivi").upsert({ giorno: nFestivoData, nome: nFestivoNome.trim() || "Festivo" }); if (error) { alert("Non aggiunto: " + error.message); return; } setNFestivoData(""); setNFestivoNome(""); await caricaFestivi(); }}
                                        disabled={!nFestivoData} className="px-4 h-10 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold disabled:opacity-40">Aggiungi</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* modale NOTA DI RIFIUTO: il collaboratore la vedrà sulla sua riga */}
            {rifiutoId != null && (
                <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setRifiutoId(null)}>
                    <div className="glass-card w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-white/10 flex items-center justify-between">
                            <h3 className="text-lg font-bold text-white">Rifiuta la richiesta</h3>
                            <button onClick={() => setRifiutoId(null)} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/10"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-5 space-y-3">
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest">Nota per il collaboratore <span className="normal-case font-normal">(facoltativa — la vedrà accanto alla sua richiesta)</span></label>
                            <textarea value={rifiutoNota} onChange={e => setRifiutoNota(e.target.value)} rows={3}
                                placeholder="Es. Periodo già coperto da altre ferie del negozio: proponi date alternative."
                                className="glass-input w-full text-sm py-2 resize-none" />
                            <div className="flex justify-end gap-2 pt-1">
                                <button onClick={() => setRifiutoId(null)} className="px-4 py-2 rounded-lg border border-white/15 text-slate-300 text-sm hover:bg-white/5">Annulla</button>
                                <button onClick={confermaRifiuto} className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold">Rifiuta richiesta</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ── CALENDARIO FERIE dedicato (Luca 29/07) — per chi approva: mese navigabile
   con i periodi APPROVATI (verde) e IN ATTESA (ambra), per vedere al volo le
   sovrapposizioni prima di autorizzare. Rispetta i filtri persone/negozi. ── */
function CalendarioFerie({ richieste, mese, setMese, festivi, malattie, vaiA }: { richieste: VacationRequest[]; mese: Date; setMese: (d: Date) => void; festivi: Map<string, string>; malattie: { id: number; employee_name: string; store: string; date_from: string; date_to: string }[]; vaiA?: { data?: string; modo?: "giorno" | "settimana"; attesa?: boolean; n: number } | null }) {
    const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
    // INTERATTIVO (03/08): due viste (Mese / Persone), giorno cliccabile con
    // pannello di dettaglio, toggle per includere o no le richieste in attesa.
    // SETTIMANA come vista regina (Luca 03/08): e' quella che usera' l'amministrazione
    const [modo, setModo] = useState<"giorno" | "settimana" | "mese" | "persone">("settimana");
    // giorno di riferimento per le viste Giorno/Settimana (03/08)
    const [dataRif, setDataRif] = useState<Date>(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
    const [conAttesa, setConAttesa] = useState(true);
    // SETTIMANA senza domenica (03/08): colonne piu' larghe, negozio mai aperto
    const [senzaDomenica, setSenzaDomenica] = useState(false);
    const [giornoSel, setGiornoSel] = useState<string | null>(null);
    // le card-filtro sopra PILOTANO il calendario (Luca 03/08 sera)
    useEffect(() => {
        if (!vaiA) return;
        setGiornoSel(null);
        if (vaiA.attesa) setConAttesa(true);
        if (vaiA.data) {
            const d = new Date(vaiA.data + "T00:00:00"); d.setHours(0, 0, 0, 0);
            setDataRif(d);
            setMese(new Date(d.getFullYear(), d.getMonth(), 1));
        }
        if (vaiA.modo) setModo(vaiA.modo);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vaiA?.n]);
    const visibili = conAttesa ? richieste : richieste.filter(r => r.status === "approved");
    const primo = new Date(mese.getFullYear(), mese.getMonth(), 1);
    const inizio = new Date(primo);
    inizio.setDate(primo.getDate() - ((primo.getDay() + 6) % 7));   // lunedì della prima settimana
    const giorni: Date[] = Array.from({ length: 42 }, (_, i) => { const d = new Date(inizio); d.setDate(inizio.getDate() + i); return d; });
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const delGiorno = (d: Date) => { const k = iso(d); return visibili.filter(r => r.date_from <= k && r.date_to >= k); };
    const malDelGiorno = (d: Date) => { const k = iso(d); return malattie.filter(m => m.date_from <= k && m.date_to >= k); };
    const nomeCorto = (n: string) => { const p = n.trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[1][0]}.` : p[0]; };
    const fmt = (s: string) => new Date(s).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
    const cambiaMese = (delta: number) => { setGiornoSel(null); setMese(new Date(mese.getFullYear(), mese.getMonth() + delta, 1)); };
    const spostaGiorni = (n: number) => {
        const d = new Date(dataRif); d.setDate(d.getDate() + n); d.setHours(0, 0, 0, 0);
        setDataRif(d);
        // il mese "segue": tornando alla vista Mese si resta dov'eravamo
        if (d.getMonth() !== mese.getMonth() || d.getFullYear() !== mese.getFullYear()) setMese(new Date(d.getFullYear(), d.getMonth(), 1));
    };
    const lunediDi = (d: Date) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); x.setHours(0, 0, 0, 0); return x; };
    const settimana: Date[] = Array.from({ length: 7 }, (_, i) => { const d = new Date(lunediDi(dataRif)); d.setDate(d.getDate() + i); return d; });
    // vista PERSONE: timeline del mese, una riga per collaboratore
    const nGiorniMese = new Date(mese.getFullYear(), mese.getMonth() + 1, 0).getDate();
    const kIni = iso(primo), kFine = iso(new Date(mese.getFullYear(), mese.getMonth(), nGiorniMese));
    const nelMese = visibili.filter(r => r.date_from <= kFine && r.date_to >= kIni);
    const personeMese = [...new Set(nelMese.map(r => r.employee_name))].sort();
    const selEntries = giornoSel ? visibili.filter(r => r.date_from <= giornoSel && r.date_to >= giornoSel) : [];
    return (
        <div className="glass-card p-4">
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                <div className="flex items-center gap-2">
                    <button onClick={() => modo === "giorno" ? spostaGiorni(-1) : modo === "settimana" ? spostaGiorni(-7) : cambiaMese(-1)} className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-sm font-bold">‹</button>
                    <h4 className="text-base font-black text-white capitalize min-w-[150px] text-center">
                        {modo === "giorno" ? dataRif.toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "long", year: "numeric" })
                            : modo === "settimana" ? `${settimana[0].toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })} → ${settimana[6].toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })}`
                                : mese.toLocaleDateString("it-IT", { month: "long", year: "numeric" })}
                    </h4>
                    <button onClick={() => modo === "giorno" ? spostaGiorni(1) : modo === "settimana" ? spostaGiorni(7) : cambiaMese(1)} className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-sm font-bold">›</button>
                    <button onClick={() => { const d = new Date(); d.setHours(0, 0, 0, 0); setGiornoSel(null); setDataRif(d); setMese(new Date(d.getFullYear(), d.getMonth(), 1)); }} className="text-[10px] font-bold uppercase tracking-widest text-indigo-300 hover:text-white ml-1">Oggi</button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1 rounded-xl border border-white/10 p-1 bg-white/[0.03]">
                        {([["giorno", "📅 Giorno"], ["settimana", "📆 Settimana"], ["mese", "🗓 Mese"], ["persone", "👥 Persone"]] as const).map(([m, l]) => (
                            <button key={m} onClick={() => { setGiornoSel(null); if ((m === "giorno" || m === "settimana") && (dataRif.getMonth() !== mese.getMonth() || dataRif.getFullYear() !== mese.getFullYear())) setDataRif(new Date(mese.getFullYear(), mese.getMonth(), 1)); setModo(m); }}
                                className={cn("px-3 py-1 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-colors",
                                    modo === m ? "bg-indigo-500/25 text-indigo-200" : "text-slate-500 hover:text-slate-300")}>
                                {l}
                            </button>
                        ))}
                    </div>
                    <button onClick={() => setConAttesa(v => !v)}
                        className={cn("px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-colors",
                            conAttesa ? "border-amber-400/60 bg-amber-500/15 text-amber-200" : "border-white/10 text-slate-500 hover:text-slate-300")}>
                        {conAttesa ? "✓ " : ""}In attesa
                    </button>
                    {modo === "settimana" && (
                        <button onClick={() => setSenzaDomenica(v => !v)} title="La domenica i negozi sono chiusi: nascondendola le colonne respirano"
                            className={cn("px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-colors",
                                senzaDomenica ? "border-rose-400/60 bg-rose-500/15 text-rose-200" : "border-white/10 text-slate-500 hover:text-slate-300")}>
                            {senzaDomenica ? "🙈 Domenica nascosta" : "Nascondi domenica"}
                        </button>
                    )}
                </div>
            </div>

            {modo === "giorno" && (() => {
                const rr = delGiorno(dataRif).sort((a, b) => (a.status === b.status ? a.employee_name.localeCompare(b.employee_name) : a.status === "approved" ? -1 : 1));
                const mm = malDelGiorno(dataRif).sort((a, b) => a.employee_name.localeCompare(b.employee_name));
                const festaG = festivi.get(iso(dataRif));
                return (
                    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                        {(festaG || dataRif.getDay() === 0) && (
                            <p className="mb-3 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-bold">🔴 {festaG || "Domenica"} — giorno non lavorativo: non conta nei giorni di ferie</p>
                        )}
                        {mm.length > 0 && (
                            <div className="mb-3 space-y-1">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-fuchsia-300">🤒 In malattia ({mm.length})</p>
                                {mm.map(m => (
                                    <div key={m.id} className="flex items-center gap-3 flex-wrap text-sm py-1 border-b border-white/5 last:border-b-0">
                                        <span className="w-2 h-2 rounded-full shrink-0 bg-fuchsia-400" />
                                        <span className="font-semibold text-white">{m.employee_name}</span>
                                        {m.store && <span className="text-[10px] text-slate-500 uppercase tracking-wider">{m.store}</span>}
                                        <span className="text-xs text-slate-300 whitespace-nowrap">{fmt(m.date_from)}{m.date_to !== m.date_from && <> → {fmt(m.date_to)}</>}</span>
                                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/30">Malattia</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {rr.length === 0 ? (
                            <p className="text-sm text-slate-500 italic py-4 text-center">Nessuno in ferie in questo giorno (con questi filtri).</p>
                        ) : (
                            <div className="space-y-2">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{rr.length} in ferie</p>
                                {rr.map(r => (
                                    <div key={r.id} className="flex items-center gap-3 flex-wrap text-sm py-1.5 border-b border-white/5 last:border-b-0">
                                        <span className={cn("w-2 h-2 rounded-full shrink-0", r.status === "approved" ? "bg-emerald-400" : "bg-amber-400")} />
                                        <span className="font-semibold text-white">{r.employee_name}</span>
                                        {r.store && <span className="text-[10px] text-slate-500 uppercase tracking-wider">{r.store}</span>}
                                        <span className="text-xs text-slate-300 whitespace-nowrap">{fmt(r.date_from)}{r.date_to !== r.date_from && <> → {fmt(r.date_to)}</>}</span>
                                        {r.half_day && <span className="text-[10px] font-black text-amber-300 uppercase">½ {r.half_day}</span>}
                                        <span className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border", r.status === "approved" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-amber-500/10 text-amber-400 border-amber-500/30")}>
                                            {r.status === "approved" ? "Approvata" : "In attesa"}
                                        </span>
                                        {r.reason && <span className="text-xs text-slate-500 italic">“{r.reason}”</span>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })()}

            {modo === "settimana" && (
                /* SETTIMANA = vista regina (Luca 03/08): colonne larghe e alte,
                   dentro ogni giorno le persone RAGGRUPPATE PER PUNTO VENDITA
                   (nome del negozio, lineetta sottile, poi le persone), con
                   ferie, mezze giornate, CORSI (azzurro 🎓) e malattie (🤒) */
                <div className="overflow-x-auto custom-scrollbar rounded-2xl">
                    <div className={senzaDomenica ? "min-w-[960px]" : "min-w-[1080px]"}>
                        <div className={cn("grid gap-px text-center mb-1", senzaDomenica ? "grid-cols-6" : "grid-cols-7")}>
                            {settimana.filter(d => !senzaDomenica || d.getDay() !== 0).map((d, i) => (
                                <div key={i} title={festivi.get(iso(d)) || undefined} className={cn("text-[11px] font-bold uppercase tracking-widest py-1.5", d.getTime() === oggi.getTime() ? "text-indigo-300" : (festivi.get(iso(d)) || d.getDay() === 0) ? "text-rose-400" : "text-slate-500")}>
                                    {d.toLocaleDateString("it-IT", { weekday: "short" })} {d.getDate()}{festivi.get(iso(d)) ? " 🔴" : ""}
                                </div>
                            ))}
                        </div>
                        <div className={cn("grid gap-px bg-white/5 rounded-2xl overflow-hidden", senzaDomenica ? "grid-cols-6" : "grid-cols-7")}>
                            {settimana.filter(d => !senzaDomenica || d.getDay() !== 0).map((d, i) => {
                                const k = iso(d);
                                const rr = delGiorno(d);
                                const mm = malDelGiorno(d);
                                // raggruppo per NEGOZIO: prima le voci ferie/corsi, poi le malattie
                                const perNegozio = new Map<string, { r: { id: number; employee_name: string; store: string; status?: string; tipo?: string | null; half_day?: string | null; reason?: string | null }; malattia: boolean }[]>();
                                rr.forEach(r => { const key = r.store || "—"; const g = perNegozio.get(key) || []; g.push({ r, malattia: false }); perNegozio.set(key, g); });
                                mm.forEach(m => { const key = m.store || "—"; const g = perNegozio.get(key) || []; g.push({ r: m, malattia: true }); perNegozio.set(key, g); });
                                const negozi = [...perNegozio.keys()].sort((a, b) => a.localeCompare(b));
                                return (
                                    <div key={i} onClick={() => setGiornoSel(giornoSel === k ? null : k)}
                                        title={festivi.get(k) ? `🔴 ${festivi.get(k)}` : (rr.length || mm.length) ? "Clicca per il dettaglio del giorno" : undefined}
                                        className={cn("min-h-[380px] p-2.5 bg-[#0f111a] cursor-pointer transition-colors hover:bg-[#161a2c]",
                                            festivi.get(k) && "bg-rose-500/[0.07]",
                                            d.getTime() === oggi.getTime() && "bg-indigo-500/[0.06]", giornoSel === k && "ring-2 ring-inset ring-indigo-400/80")}>
                                        {negozi.length === 0 && <p className="text-[10px] text-slate-700 italic mt-1 text-center">—</p>}
                                        <div className="space-y-2.5">
                                            {negozi.map(neg => (
                                                <div key={neg}>
                                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 truncate">🏬 {neg}</p>
                                                    <div className="border-b border-white/10 mb-1 mt-0.5" />
                                                    <div className="space-y-0.5">
                                                        {(perNegozio.get(neg) || []).map(({ r, malattia }, x) => (
                                                            malattia ? (
                                                                <div key={"m" + x} title={`${r.employee_name} — in malattia`}
                                                                    className="truncate rounded-md px-1.5 py-1 text-[11px] font-semibold leading-tight bg-fuchsia-500/20 text-fuchsia-200 chip-malattia">
                                                                    🤒 {r.employee_name}
                                                                </div>
                                                            ) : (
                                                                <div key={r.id} title={`${r.employee_name} — ${(r.tipo || "ferie") === "corso" ? "corso" : r.status === "approved" ? "ferie approvate" : "ferie in attesa"}${r.reason ? `: ${r.reason}` : ""}`}
                                                                    className={cn("truncate rounded-md px-1.5 py-1 text-[11px] font-semibold leading-tight",
                                                                        (r.tipo || "ferie") === "corso" ? "bg-sky-500/25 text-sky-100 chip-corso" : r.status === "approved" ? "bg-emerald-500/20 text-emerald-200" : "bg-amber-500/20 text-amber-200")}>
                                                                    {(r.tipo || "ferie") === "corso" ? "🎓 " : r.half_day ? (r.half_day === "mattina" ? "½☀️ " : "½🌇 ") : ""}{r.employee_name}
                                                                </div>
                                                            )
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {modo === "mese" && (<>
                <div className="grid grid-cols-7 gap-px text-center mb-1">
                    {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map(g => <div key={g} className="text-[10px] font-bold text-slate-500 uppercase tracking-widest py-1">{g}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-px bg-white/5 rounded-xl overflow-hidden">
                    {giorni.map((d, i) => {
                        const fuoriMese = d.getMonth() !== mese.getMonth();
                        const isOggi = d.getTime() === oggi.getTime();
                        const k = iso(d);
                        const rr = delGiorno(d);
                        return (
                            <div key={i} onClick={() => setGiornoSel(giornoSel === k ? null : k)}
                                title={festivi.get(k) ? `🔴 ${festivi.get(k)}` : rr.length ? "Clicca per il dettaglio del giorno" : undefined}
                                className={cn("min-h-[86px] p-1.5 bg-[#0f111a] cursor-pointer transition-colors hover:bg-[#161a2c]",
                                    festivi.get(k) && "bg-rose-500/[0.07]",
                                    fuoriMese && "opacity-40", giornoSel === k && "ring-2 ring-inset ring-indigo-400/80")}>
                                <div className={cn("text-[11px] font-bold mb-1", isOggi ? "text-indigo-300" : (festivi.get(k) || d.getDay() === 0) ? "text-rose-400" : "text-slate-500")}>
                                    {isOggi ? <span className="px-1.5 py-0.5 rounded-md bg-indigo-500/25">{d.getDate()}</span> : d.getDate()}
                                </div>
                                <div className="space-y-0.5">
                                    {rr.slice(0, 3).map(r => (
                                        <div key={r.id} title={`${r.employee_name} (${r.store}) — ${(r.tipo || "ferie") === "corso" ? "corso" : r.status === "approved" ? "approvata" : "in attesa"}${r.reason ? `: ${r.reason}` : ""}`}
                                            className={cn("truncate rounded px-1 py-0.5 text-[10px] font-semibold leading-tight",
                                                (r.tipo || "ferie") === "corso" ? "bg-sky-500/25 text-sky-100 chip-corso" : r.status === "approved" ? "bg-emerald-500/20 text-emerald-200" : "bg-amber-500/20 text-amber-200")}>
                                            {(r.tipo || "ferie") === "corso" ? "🎓 " : r.half_day ? (r.half_day === "mattina" ? "½☀️ " : "½🌇 ") : ""}{nomeCorto(r.employee_name)}
                                        </div>
                                    ))}
                                    {rr.length > 3 && <div className="text-[9px] text-slate-500 px-1">+{rr.length - 3} altre</div>}
                                    {malDelGiorno(d).slice(0, 2).map(m => (
                                        <div key={"m" + m.id} title={`${m.employee_name} (${m.store}) — in malattia`}
                                            className="truncate rounded px-1 py-0.5 text-[10px] font-semibold leading-tight bg-fuchsia-500/20 text-fuchsia-200 chip-malattia">
                                            🤒 {nomeCorto(m.employee_name)}
                                        </div>
                                    ))}
                                    {malDelGiorno(d).length > 2 && <div className="text-[9px] text-fuchsia-400/70 px-1">+{malDelGiorno(d).length - 2} malattie</div>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </>)}

            {modo === "persone" && (
                /* TIMELINE per collaboratore: una riga a testa, un quadretto al
                   giorno — le sovrapposizioni si vedono in verticale a colpo d'occhio */
                <div className="overflow-x-auto custom-scrollbar">
                    <div style={{ minWidth: nGiorniMese * 26 + 176 }}>
                        <div className="flex items-center mb-1">
                            <div className="w-44 shrink-0" />
                            <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${nGiorniMese}, minmax(22px, 1fr))` }}>
                                {Array.from({ length: nGiorniMese }, (_, i) => {
                                    const d = new Date(mese.getFullYear(), mese.getMonth(), i + 1);
                                    const weekend = d.getDay() === 0 || d.getDay() === 6;
                                    const festaP = festivi.get(iso(d));
                                    return <div key={i} title={festaP || undefined} className={cn("text-center text-[9px] font-bold py-0.5", festaP || d.getDay() === 0 ? "text-rose-400" : weekend ? "text-slate-600" : "text-slate-400", d.getTime() === oggi.getTime() && "text-indigo-300")}>{i + 1}</div>;
                                })}
                            </div>
                        </div>
                        {personeMese.length === 0 && <p className="text-sm text-slate-500 italic py-6 text-center">Nessuna ferie nel mese (con questi filtri).</p>}
                        {personeMese.map(p => (
                            <div key={p} className="flex items-center">
                                <div className="w-44 shrink-0 truncate text-xs font-semibold text-slate-200 pr-2 py-0.5" title={p}>{p}</div>
                                <div className="grid flex-1 rounded overflow-hidden" style={{ gridTemplateColumns: `repeat(${nGiorniMese}, minmax(22px, 1fr))` }}>
                                    {Array.from({ length: nGiorniMese }, (_, i) => {
                                        const d = new Date(mese.getFullYear(), mese.getMonth(), i + 1);
                                        const k = iso(d);
                                        const rr = nelMese.filter(r => r.employee_name === p && r.date_from <= k && r.date_to >= k);
                                        const st = rr.some(r => (r.tipo || "ferie") === "corso") ? "corso" : rr.some(r => r.status === "approved") ? "approved" : rr.length ? "pending" : "";
                                        const weekend = d.getDay() === 0 || d.getDay() === 6;
                                        return (
                                            <div key={i} onClick={() => rr.length && setGiornoSel(giornoSel === k ? null : k)}
                                                title={rr.map(r => `${r.status === "approved" ? "✅" : "⏳"} ${fmt(r.date_from)} → ${fmt(r.date_to)}${r.half_day ? ` (½ ${r.half_day})` : ""}${r.reason ? ` — ${r.reason}` : ""}`).join("\n") || undefined}
                                                className={cn("h-7 border-r border-b border-white/5",
                                                    st === "corso" ? "bg-sky-500/40 cursor-pointer" : st === "approved" ? "bg-emerald-500/40 cursor-pointer" : st === "pending" ? "bg-amber-500/35 cursor-pointer" : festivi.get(k) ? "bg-rose-500/[0.10]" : weekend ? "bg-white/[0.04]" : "bg-white/[0.01]",
                                                    d.getTime() === oggi.getTime() && "ring-1 ring-inset ring-indigo-400/60",
                                                    giornoSel === k && st && "ring-2 ring-inset ring-indigo-300")} />
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* DETTAGLIO del giorno cliccato: chi c'e' in ferie, periodo e stato */}
            {giornoSel && (
                <div className="mt-3 p-3.5 rounded-xl border border-indigo-500/30 bg-indigo-500/[0.06]">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold text-indigo-200 uppercase tracking-widest">🏖 Ferie del {fmt(giornoSel)}</p>
                        <button onClick={() => setGiornoSel(null)} className="text-slate-400 hover:text-white text-xs font-bold">✕ chiudi</button>
                    </div>
                    {(() => { const mm = malattie.filter(m => giornoSel && m.date_from <= giornoSel && m.date_to >= giornoSel); return mm.length > 0 && (
                        <div className="mb-2 space-y-1">
                            {mm.map(m => (
                                <div key={"m" + m.id} className="flex items-center gap-3 flex-wrap text-sm">
                                    <span className="w-2 h-2 rounded-full shrink-0 bg-fuchsia-400" />
                                    <span className="font-semibold text-white">{m.employee_name}</span>
                                    {m.store && <span className="text-[10px] text-slate-500 uppercase tracking-wider">{m.store}</span>}
                                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/30">🤒 Malattia</span>
                                </div>
                            ))}
                        </div>
                    ); })()}
                    {selEntries.length === 0 ? (
                        <p className="text-sm text-slate-500 italic">Nessuno in ferie in questo giorno.</p>
                    ) : (
                        <div className="space-y-1.5">
                            {selEntries.map(r => (
                                <div key={r.id} className="flex items-center gap-3 flex-wrap text-sm">
                                    <span className={cn("w-2 h-2 rounded-full shrink-0", r.status === "approved" ? "bg-emerald-400" : "bg-amber-400")} />
                                    <span className="font-semibold text-white">{r.employee_name}</span>
                                    {r.store && <span className="text-[10px] text-slate-500 uppercase tracking-wider">{r.store}</span>}
                                    <span className="text-xs text-slate-300 whitespace-nowrap">{fmt(r.date_from)}{r.date_to !== r.date_from && <> → {fmt(r.date_to)}</>}</span>
                                    {r.half_day && <span className="text-[10px] font-black text-amber-300 uppercase">½ {r.half_day}</span>}
                                    <span className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border", r.status === "approved" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-amber-500/10 text-amber-400 border-amber-500/30")}>
                                        {r.status === "approved" ? "Approvata" : "In attesa"}
                                    </span>
                                    {r.reason && <span className="text-xs text-slate-500 italic">“{r.reason}”</span>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div className="flex items-center gap-4 mt-3 text-[11px] text-slate-400 flex-wrap">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500/40" /> Approvate</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-500/40" /> In attesa</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-sky-500/40" /> 🎓 Corso</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-fuchsia-500/40" /> 🤒 Malattia</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-rose-500/40" /> Festivo (come la domenica: mai contato nei giorni)</span>
                <span className="text-slate-600">Giorno · Settimana · Mese · Persone — nelle griglie clicca un giorno per il dettaglio</span>
            </div>
        </div>
    );
}

type SicknessRow = { id: number; employee_name: string; store: string; date_from: string; date_to: string; certificate_number: string | null; created_at: string };

function MalattiaSection() {
    const { user: userMal } = useAuth();
    // CESTINO (Luca 29/07): dall'amministrativo in su, per gli errori di battitura
    const canDeleteMal = ["amministrativo", "admin", "dev", "direttore_generale"].includes(userMal?.role || "");
    const eliminaAssenza = async (id: number) => {
        if (!window.confirm("Eliminare questa riga di malattia? L'operazione è definitiva.")) return;
        await supabase.from("sickness_absences").delete().eq("id", id);
        await fetchAbsences();
    };
    const [absences, setAbsences] = useState<SicknessRow[]>([]);
    const [showNewModal, setShowNewModal] = useState(false);
    // FILTRI STANDARD (Luca 03/08): collaboratori con la SelectMulti di
    // piattaforma (prima era un input libero) + periodo Da/A che prima
    // non esisteva proprio (il registro tagliava a 30 giorni, in silenzio)
    const [filterPersone, setFilterPersone] = useState<string[]>([]);
    const [filterStore, setFilterStore] = useState("");
    const [filtroDa, setFiltroDa] = useState("");
    const [filtroA, setFiltroA] = useState("");
    const periodDays = 30;   // finestra di default quando NON si filtra per date

    const [newEmployee, setNewEmployee] = useState("");
    const [newStore, setNewStore] = useState("");
    const [newDateFrom, setNewDateFrom] = useState("");
    const [newDateTo, setNewDateTo] = useState("");
    const [newCertNum, setNewCertNum] = useState("");
    const [saving, setSaving] = useState(false);

    const fetchAbsences = useCallback(async () => {
        const { data } = await supabase.from("sickness_absences").select("*").order("date_from", { ascending: false });
        setAbsences((data ?? []) as SicknessRow[]);
    }, []);

    // Segnalazione 61: collaboratore e negozio da tendina, non testo libero.
    const [staff, setStaff] = useState<{ name: string; store: string }[]>([]);
    const [storeList, setStoreList] = useState<string[]>([]);
    useEffect(() => {
        (async () => {
            const [u, st] = await Promise.all([
                supabase.from("app_users").select("full_name, primary_store").eq("active", true).order("full_name"),
                supabase.from("stores").select("name").order("name"),
            ]);
            setStaff((u.data ?? []).map((x: any) => ({ name: x.full_name, store: x.primary_store || "" })));
            setStoreList((st.data ?? []).map((x: any) => x.name));
        })();
    }, []);

    useEffect(() => {
        fetchAbsences();
    }, [fetchAbsences]);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - periodDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    // con un filtro data esplicito la finestra dei 30 giorni si spegne;
    // il match e' per SOVRAPPOSIZIONE di periodo (basta un giorno in comune)
    let filtered = absences.filter(a => (filtroDa || filtroA) ? true : a.date_to >= cutoffStr);
    if (filtroDa) filtered = filtered.filter(a => a.date_to >= filtroDa);
    if (filtroA) filtered = filtered.filter(a => a.date_from <= filtroA);

    const filteredAbsences = filtered.filter(a =>
        (filterPersone.length === 0 || filterPersone.includes(a.employee_name)) &&
        a.store.toLowerCase().includes(filterStore.toLowerCase())
    );

    const totalDays = filteredAbsences.reduce((sum, a) => {
        const from = new Date(a.date_from).getTime();
        const to = new Date(a.date_to).getTime();
        return sum + Math.ceil((to - from) / (24 * 60 * 60 * 1000)) + 1;
    }, 0);
    const uniquePeople = new Set(filteredAbsences.map(a => a.employee_name)).size;

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newEmployee.trim() || !newDateFrom || !newDateTo) return;
        setSaving(true);
        const { error } = await supabase.from("sickness_absences").insert({
            employee_name: newEmployee.trim(),
            store: newStore.trim() || (staff.find(x => x.name === newEmployee)?.store || ""),
            date_from: newDateFrom,
            date_to: newDateTo,
            certificate_number: newCertNum.trim() || null,
        });
        if (error) { alert("Assenza non salvata: " + error.message); setSaving(false); return; }
        await fetchAbsences();
        setShowNewModal(false);
        setNewEmployee("");
        setNewStore("");
        setNewDateFrom("");
        setNewDateTo("");
        setNewCertNum("");
        setSaving(false);
    };

    const formatDate = (d: string) => new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* KPI Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="glass-panel p-5 border-l-4 border-l-rose-500">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{(filtroDa || filtroA) ? "Assenze nel periodo" : `Assenze ultimi ${periodDays} gg`}</p>
                    <p className="text-2xl font-black text-white">{filteredAbsences.length}</p>
                </div>
                <div className="glass-panel p-5 border-l-4 border-l-slate-400">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Collaboratori Coinvolti</p>
                    <p className="text-2xl font-black text-white">{uniquePeople}</p>
                </div>
                <div className="glass-panel p-5 border-l-4 border-l-slate-400">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Giorni Totali Persi</p>
                    <p className="text-2xl font-black text-white">{totalDays}</p>
                </div>
            </div>

            {/* Table and Tools */}
            <div className="space-y-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 px-1">
                    <div className="space-y-0.5">
                        <h3 className="text-lg font-bold text-white uppercase tracking-tight">Registro Malattie (Admin)</h3>
                        <p className="text-xs text-slate-500">Monitoraggio certificati e periodi di assenza</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                        <div className="w-full sm:w-64"><SelectMulti values={filterPersone} onChange={setFilterPersone}
                            opzioni={staff.map(x => x.name)} maxVoci={100}
                            placeholder="Tutti i collaboratori — scrivi per filtrare"
                            className="glass-input text-xs rounded-lg py-1.5 w-full" /></div>
                        <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Da
                            <input type="date" value={filtroDa} onChange={e => setFiltroDa(e.target.value)}
                                className="glass-input !h-9 px-2 text-xs w-[132px] normal-case font-normal tracking-normal" />
                        </label>
                        <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">A
                            <input type="date" value={filtroA} onChange={e => setFiltroA(e.target.value)}
                                className="glass-input !h-9 px-2 text-xs w-[132px] normal-case font-normal tracking-normal" />
                        </label>
                        {(filtroDa || filtroA || filterPersone.length > 0) && (
                            <button onClick={() => { setFiltroDa(""); setFiltroA(""); setFilterPersone([]); }}
                                className="h-9 px-2.5 rounded-lg text-[11px] text-slate-500 hover:text-slate-300 underline">Pulisci</button>
                        )}
                        <button
                            onClick={() => setShowNewModal(true)}
                            className="h-9 px-4 rounded-lg bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs transition-colors flex items-center gap-2"
                        >
                            <Shield className="w-3.5 h-3.5" />
                            Registra Assenza
                        </button>
                    </div>
                </div>

                <div className="glass-card overflow-hidden">
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-white/[0.02] border-b border-white/5">
                                    <th className="px-5 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Collaboratore</th>
                                    <th className="px-5 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Negozio</th>
                                    <th className="px-5 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Periodo</th>
                                    <th className="px-5 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Protocollo</th>
                                    <th className="px-5 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Durata</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {filteredAbsences.map(a => {
                                    const fromArr = new Date(a.date_from).getTime();
                                    const toArr = new Date(a.date_to).getTime();
                                    const days = Math.ceil((toArr - fromArr) / (24 * 60 * 60 * 1000)) + 1;

                                    return (
                                        <tr key={a.id} className="hover:bg-white/[0.01] transition-colors group">
                                            <td className="px-5 py-4">
                                                <p className="text-sm font-bold text-white group-hover:text-rose-400 transition-colors">{a.employee_name}</p>
                                            </td>
                                            <td className="px-5 py-4">
                                                <p className="text-[10px] text-slate-500 uppercase tracking-wider">{a.store}</p>
                                            </td>
                                            <td className="px-5 py-4 text-xs text-slate-400">
                                                {formatDate(a.date_from)} - {formatDate(a.date_to)}
                                            </td>
                                            <td className="px-5 py-4 text-center">
                                                <span className="text-[10px] font-mono text-slate-500">{a.certificate_number || "—"}</span>
                                            </td>
                                            <td className="px-5 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <span className="text-xs font-black text-rose-500/80">{days}gg</span>
                                                    {canDeleteMal && (
                                                        <button onClick={() => eliminaAssenza(a.id)} title="Elimina riga (errore di inserimento)"
                                                            className="p-1.5 bg-white/[0.03] hover:bg-rose-500/15 text-slate-500 hover:text-rose-300 border border-white/10 rounded-lg transition-colors">
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {filteredAbsences.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-5 py-10 text-center text-slate-500 text-sm italic">Nessuna assenza registrata nel periodo selezionato</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Modal Registrazione */}
            {showNewModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setShowNewModal(false)}>
                    <div className="glass-card w-full max-w-md p-6 overflow-hidden relative" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <Shield className="w-5 h-5 text-rose-500" />
                                Registra Nuova Assenza
                            </h3>
                            <button onClick={() => setShowNewModal(false)} className="p-1 hover:bg-white/5 rounded-lg transition-colors">
                                <X className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>

                        <form onSubmit={handleCreate} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Collaboratore</label>
                                <SelectPersona value={newEmployee} opzioni={staff.map(x => x.name)} placeholder="Scrivi il collaboratore…"
                                    onChange={(v) => { setNewEmployee(v); const st = staff.find(x => x.name === v)?.store; if (st) setNewStore(st); }}
                                    className="glass-input !h-10 text-xs w-full" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Punto Vendita</label>
                                <select value={newStore} onChange={e => setNewStore(e.target.value)} className="glass-input !h-10 text-xs w-full">
                                    <option value="">— Seleziona —</option>
                                    {storeList.map(n => <option key={n} value={n}>{n}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Dal giorno</label>
                                    <input type="date" required value={newDateFrom} onChange={e => setNewDateFrom(e.target.value)} className="glass-input !h-10 text-xs w-full" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Al giorno</label>
                                    <input type="date" required value={newDateTo} onChange={e => setNewDateTo(e.target.value)} className="glass-input !h-10 text-xs w-full" />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Protocollo Certificato</label>
                                <input type="text" placeholder="Es. INPS-12345-ABC" value={newCertNum} onChange={e => setNewCertNum(e.target.value)} className="glass-input !h-10 text-xs w-full" />
                            </div>

                            <div className="pt-2 flex gap-3">
                                <button type="button" onClick={() => setShowNewModal(false)} className="flex-1 h-11 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-xs transition-all border border-white/5">Annulla</button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="flex-[2] h-11 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs transition-all shadow-lg shadow-rose-500/25 disabled:opacity-50"
                                >
                                    {saving ? "Salvataggio..." : "Conferma Registrazione"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

type RitardoRow = { id: string; employee_name: string; store: string; date: string; minutes: number | null; reason: string | null; reported_by: string | null; tipo: string | null };

function RitardiSection() {
    const { user } = useAuth();
    // Segnalazione 85: l'amministrazione deve poter segnalare i ritardi di TUTTI i
    // collaboratori. Prima l'elenco era ["admin","direttore_generale","direttore_commerciale"]:
    // restavano fuori il ruolo "amministrativo" (Sandra, Claudia) e "dev", che quindi
    // vedevano la pagina filtrata sul proprio negozio (l'Ufficio) e non potevano
    // segnalare per altri. Ora vale la regola del CRM: chi vede tutti i negozi, piu'
    // il direttore commerciale.
    // "vede tutto" dalla FONTE UNICA (amministrativo restringibile dall'admin);
    // il direttore commerciale mantiene la vista completa per ruolo.
    const { seesAll: seesAllVis, stores: myStores } = useVisibleStores();
    const reportAll = seesAllVis || user?.role === "direttore_commerciale";
    // L'amministrativo si comporta da manager sui negozi visibili: conta quando
    // l'admin gli restringe la visibilita' (reportAll diventa false).
    const isStoreMgr = user?.role === "store_manager" || user?.role === "amministrativo";
    const canReportOthers = reportAll || isStoreMgr;

    // #111 (manu): modifica/cancellazione ritardi con approvazione amministrazione.
    // L'AMMINISTRAZIONE (amministrativo/direzione/admin) agisce SUBITO: modifica o
    // elimina direttamente. Lo STORE MANAGER non ha potere diretto: genera una
    // RICHIESTA (modifica o cancellazione) che finisce nella coda dell'amministrazione
    // e diventa effettiva solo dopo l'approvazione.
    const isApprover = isAdminOrAbove(user?.role);
    const isRequester = user?.role === "store_manager";
    const canRowAct = isApprover || isRequester;

    const [rows, setRows] = useState<RitardoRow[]>([]);
    const [showNewModal, setShowNewModal] = useState(false);
    const [filterPerson, setFilterPerson] = useState("");
    const [saving, setSaving] = useState(false);

    // richieste di modifica/cancellazione in attesa
    const [changeReqs, setChangeReqs] = useState<any[]>([]);
    const [editRow, setEditRow] = useState<RitardoRow | null>(null);
    const [edTipo, setEdTipo] = useState<"pre" | "post">("pre");
    const [edReason, setEdReason] = useState("");
    const [edDate, setEdDate] = useState("");
    const [edNote, setEdNote] = useState("");
    const [cancelRow, setCancelRow] = useState<RitardoRow | null>(null);
    const [cancelNote, setCancelNote] = useState("");
    const [actBusy, setActBusy] = useState<string | null>(null);

    const [mode, setMode] = useState<"self" | "other">("self");
    const [newEmployee, setNewEmployee] = useState("");
    const [newReason, setNewReason] = useState("");
    const [newTipo, setNewTipo] = useState<"pre" | "post">("pre");
    // Collaboratori del negozio del login (per il dropdown "Per un collaboratore").
    // La direzione (reportAll) senza negozio vede tutti gli attivi.
    const [storeStaff, setStoreStaff] = useState<{ name: string; store: string }[]>([]);

    // Segnalazione 60: il ritardo si salvava davvero, ma non compariva. Chi
    // gestisce piu' punti vendita (es. Magliana Multi + Magliana W3) vedeva solo
    // quelli del negozio principale, quindi il ritardo appena creato per l'altro
    // negozio spariva e sembrava non salvato. Ora si usano TUTTI i propri negozi.

    const fetchRows = useCallback(async () => {
        const { data } = await supabase.from("ritardi").select("*").order("date", { ascending: false });
        setRows((data ?? []) as RitardoRow[]);
    }, []);
    useEffect(() => {
        fetchRows();
    }, [fetchRows]);
    // richieste in attesa: gli approvatori vedono la coda, i richiedenti vedono il
    // badge "in attesa" sulle proprie righe (evita doppioni).
    const fetchReqs = useCallback(async () => {
        const { data } = await supabase.from("ritardi_change_requests").select("*").eq("status", "pending").order("created_at", { ascending: false });
        setChangeReqs((data ?? []) as any[]);
    }, []);
    useEffect(() => { fetchReqs(); }, [fetchReqs]);
    const pendingFor = (id: string) => changeReqs.find((r) => r.ritardo_id === id);
    useEffect(() => {
        (async () => {
            const q = supabase.from("app_users").select("full_name, primary_store").eq("active", true).order("full_name");
            const { data } = await q;
            let lista = (data ?? []).map((u: any) => ({ name: u.full_name, store: u.primary_store || "" }));
            // Segnalazione 60: chi gestisce piu' negozi deve poter scegliere i
            // collaboratori di TUTTI i suoi punti vendita, non solo del principale.
            if (!reportAll) {
                const negozi = myStores.length ? myStores : (user?.negozio ? [user.negozio] : []);
                if (negozi.length) {
                    const ok = (s: string) => negozi.some((n) => {
                        const x = (s || "").trim().toLowerCase(), y = (n || "").trim().toLowerCase();
                        return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x));
                    });
                    lista = lista.filter((u) => ok(u.store));
                }
            }
            setStoreStaff(lista);
        })();
    }, [reportAll, user?.negozio, myStores]);

    // visibilità: direzione+ vede tutto; store manager il proprio negozio; gli altri solo i propri
    const stessoNegozio = (a: string, b: string) => {
        const x = (a || "").trim().toLowerCase(), y = (b || "").trim().toLowerCase();
        return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x));
    };
    const scoped = rows.filter((r) => {
        if (reportAll) return true;
        // il ritardo e' mio in ogni caso (anche se l'ha segnalato il manager)
        if (r.employee_name === user?.name) return true;
        if (isStoreMgr) {
            const negozi = myStores.length ? myStores : (user?.negozio ? [user.negozio] : []);
            return negozi.some((n) => stessoNegozio(r.store || "", n));
        }
        return false;
    });
    const filtered = scoped.filter((r) => r.employee_name.toLowerCase().includes(filterPerson.toLowerCase()));
    const uniquePeople = new Set(filtered.map((r) => r.employee_name)).size;

    const openModal = () => {
        setMode("self");
        setNewEmployee("");
        setNewReason("");
        setNewTipo("pre");
        setShowNewModal(true);
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        const isOther = canReportOthers && mode === "other";
        const emp = (isOther ? newEmployee : user?.name || "").trim();
        // Il negozio non viene chiesto: deriva dal collaboratore scelto (o dal login).
        const store = (isOther ? (storeStaff.find((s) => s.name === newEmployee)?.store || "") : user?.negozio || "").trim();
        if (!emp) return;
        setSaving(true);
        const today = new Date().toISOString().slice(0, 10);
        // Segnalazione 60: l'insert non controllava l'errore, quindi un fallimento
        // chiudeva il modale senza salvare ne' avvisare ("non si e' salvato").
        const { error } = await supabase.from("ritardi").insert({
            employee_name: emp,
            store: store || "",
            date: today,
            reason: newReason.trim() || null,
            tipo: newTipo,
            reported_by: user?.name || null,
        });
        if (error) { alert("Ritardo non salvato: " + error.message); setSaving(false); return; }
        await fetchRows();
        setShowNewModal(false);
        setSaving(false);
    };

    const formatDate = (d: string) => new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
    const campoLabel = (k: string) => (k === "tipo" ? "Tipo" : k === "reason" ? "Motivo" : k === "date" ? "Data" : k);
    const fmtCampo = (k: string, v: any) => (k === "tipo" ? (v === "post" ? "Post" : v === "pre" ? "Pre" : v || "—") : k === "date" ? (v ? formatDate(v) : "—") : v || "—");

    const openEdit = (r: RitardoRow) => {
        setEditRow(r);
        setEdTipo(r.tipo === "post" ? "post" : "pre");
        setEdReason(r.reason || "");
        setEdDate(r.date);
        setEdNote("");
    };

    // Salva la modifica: l'approvatore la applica subito, lo store manager la invia
    // come richiesta all'amministrazione.
    const submitEdit = async () => {
        if (!editRow) return;
        setActBusy(editRow.id);
        const next = { tipo: edTipo, reason: edReason.trim(), date: edDate };
        if (isApprover) {
            const { error } = await supabase.from("ritardi").update({ tipo: next.tipo, reason: next.reason || null, date: next.date }).eq("id", editRow.id);
            setActBusy(null);
            if (error) { alert("Modifica non salvata: " + error.message); return; }
            setEditRow(null); await fetchRows();
        } else {
            const ch: any = {};
            if (next.tipo !== (editRow.tipo || "pre")) ch.tipo = { da: editRow.tipo || "", a: next.tipo };
            if (next.reason !== (editRow.reason || "")) ch.reason = { da: editRow.reason || "", a: next.reason };
            if (next.date !== editRow.date) ch.date = { da: editRow.date, a: next.date };
            if (Object.keys(ch).length === 0) { setActBusy(null); alert("Nessuna modifica da inviare."); return; }
            if (edNote.trim()) ch.__meta = { note: edNote.trim() };
            const { error } = await supabase.from("ritardi_change_requests").insert({
                ritardo_id: editRow.id, tipo: "modifica", employee_name: editRow.employee_name, store: editRow.store,
                changes: ch, requested_by: user?.id || null, requested_by_name: user?.name || "—",
            });
            setActBusy(null);
            if (error) { alert("Richiesta non inviata: " + error.message); return; }
            setEditRow(null); await fetchReqs();
        }
    };

    // Cancellazione: l'approvatore elimina subito; lo store manager invia la richiesta.
    const submitCancel = async () => {
        if (!cancelRow) return;
        setActBusy(cancelRow.id);
        if (isApprover) {
            const { error } = await supabase.from("ritardi").delete().eq("id", cancelRow.id);
            setActBusy(null);
            if (error) { alert("Eliminazione non riuscita: " + error.message); return; }
            setCancelRow(null); await fetchRows(); await fetchReqs();
        } else {
            const { error } = await supabase.from("ritardi_change_requests").insert({
                ritardo_id: cancelRow.id, tipo: "cancellazione", employee_name: cancelRow.employee_name, store: cancelRow.store,
                changes: { __delete: true, ...(cancelNote.trim() ? { __meta: { note: cancelNote.trim() } } : {}) },
                requested_by: user?.id || null, requested_by_name: user?.name || "—",
            });
            setActBusy(null);
            if (error) { alert("Richiesta non inviata: " + error.message); return; }
            setCancelRow(null); await fetchReqs();
        }
    };

    // Decisione dell'amministrazione su una richiesta in coda.
    const decideRequest = async (req: any, approve: boolean) => {
        setActBusy(req.id);
        if (approve && req.tipo === "cancellazione") {
            const { error } = await supabase.from("ritardi").delete().eq("id", req.ritardo_id);
            if (error) { setActBusy(null); alert("Ritardo NON eliminato: " + error.message); return; }
        } else if (approve && req.tipo === "modifica") {
            const patch: any = {};
            Object.entries(req.changes || {}).forEach(([k, raw]: any) => {
                if (k.startsWith("__")) return;   // "__meta" = nota, non un campo
                patch[k] = raw?.a === "" ? null : raw?.a;
            });
            if (Object.keys(patch).length) {
                const { error } = await supabase.from("ritardi").update(patch).eq("id", req.ritardo_id);
                if (error) { setActBusy(null); alert("Modifica NON applicata: " + error.message); return; }
            }
        }
        const { error: rErr } = await supabase.from("ritardi_change_requests").update({
            status: approve ? "approved" : "rejected",
            reviewed_by: user?.id || null, reviewed_by_name: user?.name || "—",
            reviewed_at: new Date().toISOString(),
        }).eq("id", req.id);
        setActBusy(null);
        if (rErr) { alert("Stato richiesta non aggiornato: " + rErr.message); return; }
        await fetchRows(); await fetchReqs();
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* #111: coda richieste (modifica/cancellazione) — solo per l'amministrazione */}
            {isApprover && changeReqs.length > 0 && (
                <div className="glass-card p-5 border-l-4 border-l-amber-500 space-y-3">
                    <div className="flex items-center gap-2">
                        <Clock3 className="w-4 h-4 text-amber-400" />
                        <h3 className="text-sm font-bold text-white uppercase tracking-tight">Richieste in attesa</h3>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white">{changeReqs.length}</span>
                    </div>
                    <div className="space-y-2">
                        {changeReqs.map((req) => {
                            const isCanc = req.tipo === "cancellazione";
                            const note = req.changes?.__meta?.note || "";
                            const fields = Object.entries(req.changes || {}).filter(([k]) => !k.startsWith("__"));
                            return (
                                <div key={req.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border", isCanc ? "bg-rose-500/10 text-rose-300 border-rose-500/30" : "bg-sky-500/10 text-sky-300 border-sky-500/30")}>{isCanc ? "Cancellazione" : "Modifica"}</span>
                                            <span className="text-sm font-bold text-white">{req.employee_name || "—"}</span>
                                            <span className="text-[10px] text-slate-500 uppercase tracking-wider">{req.store || ""}</span>
                                        </div>
                                        {!isCanc && fields.length > 0 && (
                                            <div className="text-xs text-slate-400 mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                                                {fields.map(([k, v]: any) => (
                                                    <span key={k}>{campoLabel(k)}: <span className="line-through text-slate-600">{fmtCampo(k, v.da)}</span> → <span className="text-slate-200 font-semibold">{fmtCampo(k, v.a)}</span></span>
                                                ))}
                                            </div>
                                        )}
                                        {note && <div className="text-xs text-slate-500 italic mt-1">“{note}”</div>}
                                        <div className="text-[10px] text-slate-600 mt-1">Richiesta da {req.requested_by_name || "—"}</div>
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                        <button disabled={actBusy === req.id} onClick={() => decideRequest(req, false)} className="h-8 px-3 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold disabled:opacity-50">Rifiuta</button>
                                        <button disabled={actBusy === req.id} onClick={() => decideRequest(req, true)} className="h-8 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold flex items-center gap-1 disabled:opacity-50"><Check className="w-3.5 h-3.5" />Approva</button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
            <div className="grid grid-cols-2 gap-4 max-w-lg">
                <div className="glass-panel p-5 border-l-4 border-l-amber-500">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Ritardi</p>
                    <p className="text-2xl font-black text-white">{filtered.length}</p>
                </div>
                <div className="glass-panel p-5 border-l-4 border-l-slate-400">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Collaboratori Coinvolti</p>
                    <p className="text-2xl font-black text-white">{uniquePeople}</p>
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 px-1">
                    <div className="space-y-0.5">
                        <h3 className="text-lg font-bold text-white uppercase tracking-tight">Registro Ritardi</h3>
                        <p className="text-xs text-slate-500">
                            {reportAll ? "Vista completa" : isStoreMgr ? "Ritardi del tuo punto vendita" : "I tuoi ritardi — puoi autodenunciarti"}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2 w-full md:w-auto">
                        {(reportAll || isStoreMgr) && (
                            <input type="text" placeholder="Collaboratore..." value={filterPerson} onChange={(e) => setFilterPerson(e.target.value)} className="glass-input !h-9 px-3 text-xs w-full sm:w-32" />
                        )}
                        <button onClick={openModal} className="h-9 px-4 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs transition-colors flex items-center gap-2">
                            <Clock3 className="w-3.5 h-3.5" />
                            Segnala ritardo
                        </button>
                    </div>
                </div>

                <div className="glass-card overflow-hidden">
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-white/[0.02] border-b border-white/5">
                                    <th className="px-5 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Collaboratore</th>
                                    <th className="px-5 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Negozio</th>
                                    <th className="px-5 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tipo</th>
                                    <th className="px-5 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Data</th>
                                    <th className="px-5 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Motivo</th>
                                    {canRowAct && <th className="px-5 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Azioni</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {filtered.map((r) => (
                                    <tr key={r.id} className="hover:bg-white/[0.01] transition-colors group">
                                        <td className="px-5 py-4">
                                            <p className="text-sm font-bold text-white group-hover:text-amber-400 transition-colors">{r.employee_name}</p>
                                            {r.reported_by && r.reported_by !== r.employee_name && <p className="text-[10px] text-slate-600">segnalato da {r.reported_by}</p>}
                                        </td>
                                        <td className="px-5 py-4"><p className="text-[10px] text-slate-500 uppercase tracking-wider">{r.store || "—"}</p></td>
                                        <td className="px-5 py-4">{r.tipo ? <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/25">{r.tipo === "pre" ? "Pre" : "Post"}</span> : <span className="text-[10px] text-slate-600">—</span>}</td>
                                        <td className="px-5 py-4 text-xs text-slate-400">{formatDate(r.date)}</td>
                                        <td className="px-5 py-4 text-xs text-slate-400">{r.reason || "—"}</td>
                                        {canRowAct && (
                                            <td className="px-5 py-4 text-right">
                                                {(() => {
                                                    const pr = pendingFor(r.id);
                                                    if (pr) return <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 whitespace-nowrap">{pr.tipo === "cancellazione" ? "Cancellaz." : "Modifica"} in attesa</span>;
                                                    return (
                                                        <div className="flex items-center justify-end gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                                                            <button onClick={() => openEdit(r)} title={isApprover ? "Modifica" : "Richiedi modifica"} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                                                            <button onClick={() => { setCancelRow(r); setCancelNote(""); }} title={isApprover ? "Elimina" : "Chiedi cancellazione"} className="p-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                                                        </div>
                                                    );
                                                })()}
                                            </td>
                                        )}
                                    </tr>
                                ))}
                                {filtered.length === 0 && (
                                    <tr><td colSpan={canRowAct ? 6 : 5} className="px-5 py-10 text-center text-slate-500 text-sm italic">Nessun ritardo registrato</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {showNewModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setShowNewModal(false)}>
                    <div className="glass-card w-full max-w-md p-6 overflow-hidden relative" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2"><Clock3 className="w-5 h-5 text-amber-500" />Segnala ritardo</h3>
                            <button onClick={() => setShowNewModal(false)} className="p-1 hover:bg-white/5 rounded-lg transition-colors"><X className="w-5 h-5 text-slate-500" /></button>
                        </div>
                        <form onSubmit={handleCreate} className="space-y-4">
                            {canReportOthers && (
                                <div className="flex gap-2 p-1 bg-white/5 rounded-xl">
                                    <button type="button" onClick={() => setMode("self")} className={cn("flex-1 h-9 rounded-lg text-xs font-bold transition-colors", mode === "self" ? "bg-amber-500 text-white" : "text-slate-400 hover:text-white")}>Per me stesso</button>
                                    <button type="button" onClick={() => setMode("other")} className={cn("flex-1 h-9 rounded-lg text-xs font-bold transition-colors", mode === "other" ? "bg-amber-500 text-white" : "text-slate-400 hover:text-white")}>Per un collaboratore</button>
                                </div>
                            )}
                            {!canReportOthers || mode === "self" ? (
                                <p className="text-xs text-slate-400 bg-white/5 rounded-lg p-3">
                                    Segnali il tuo ritardo di <b className="text-white">oggi</b>. Nome, negozio e data sono automatici.
                                </p>
                            ) : (
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Collaboratore</label>
                                    {/* Dropdown dei collaboratori del negozio del login (niente campo negozio: deriva dal collaboratore). */}
                                    <SelectPersona value={newEmployee} opzioni={storeStaff.map((s) => s.name)} placeholder="Scrivi il collaboratore…"
                                        onChange={setNewEmployee} className="glass-input !h-10 text-xs w-full" />
                                    {isStoreMgr && !reportAll && <p className="text-[10px] text-slate-600 ml-1">Collaboratori del tuo punto vendita.</p>}
                                </div>
                            )}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Tipo ritardo</label>
                                <div className="flex gap-2">
                                    {([["pre", "Pre apertura"], ["post", "Post apertura"]] as const).map(([val, lab]) => (
                                        <button type="button" key={val} onClick={() => setNewTipo(val)}
                                            className={cn("flex-1 h-10 rounded-lg text-xs font-bold transition-colors border", newTipo === val ? "bg-amber-500 text-white border-amber-500" : "bg-white/5 text-slate-400 border-white/10 hover:text-white")}>
                                            {lab}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Motivo (opzionale)</label>
                                <input type="text" placeholder="Es. traffico, imprevisto…" value={newReason} onChange={(e) => setNewReason(e.target.value)} className="glass-input !h-10 text-xs w-full" />
                            </div>
                            <div className="pt-2 flex gap-3">
                                <button type="button" onClick={() => setShowNewModal(false)} className="flex-1 h-11 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-xs transition-all border border-white/5">Annulla</button>
                                <button type="submit" disabled={saving} className="flex-[2] h-11 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs transition-all shadow-lg shadow-amber-500/25 disabled:opacity-50">{saving ? "Salvataggio..." : "Conferma"}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* #111: modifica ritardo — diretta per l'amministrazione, richiesta per lo store manager */}
            {editRow && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setEditRow(null)}>
                    <div className="glass-card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2"><Pencil className="w-5 h-5 text-amber-500" />{isApprover ? "Modifica ritardo" : "Richiedi modifica"}</h3>
                            <button onClick={() => setEditRow(null)} className="p-1 hover:bg-white/5 rounded-lg transition-colors"><X className="w-5 h-5 text-slate-500" /></button>
                        </div>
                        <div className="space-y-4">
                            <p className="text-xs text-slate-400 bg-white/5 rounded-lg p-3"><b className="text-white">{editRow.employee_name}</b>{editRow.store ? ` · ${editRow.store}` : ""}</p>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Tipo ritardo</label>
                                <div className="flex gap-2">
                                    {([["pre", "Pre apertura"], ["post", "Post apertura"]] as const).map(([val, lab]) => (
                                        <button type="button" key={val} onClick={() => setEdTipo(val)}
                                            className={cn("flex-1 h-10 rounded-lg text-xs font-bold transition-colors border", edTipo === val ? "bg-amber-500 text-white border-amber-500" : "bg-white/5 text-slate-400 border-white/10 hover:text-white")}>{lab}</button>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Data</label>
                                <input type="date" value={edDate} onChange={(e) => setEdDate(e.target.value)} className="glass-input !h-10 text-xs w-full" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Motivo</label>
                                <input type="text" value={edReason} onChange={(e) => setEdReason(e.target.value)} className="glass-input !h-10 text-xs w-full" placeholder="Es. traffico, imprevisto…" />
                            </div>
                            {!isApprover && (
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Nota per l'amministrazione (opzionale)</label>
                                    <input type="text" value={edNote} onChange={(e) => setEdNote(e.target.value)} className="glass-input !h-10 text-xs w-full" placeholder="Perché va corretto…" />
                                </div>
                            )}
                            {!isApprover && <p className="text-[11px] text-amber-300/80">La modifica sarà effettiva solo dopo l'approvazione dell'amministrazione.</p>}
                            <div className="pt-1 flex gap-3">
                                <button type="button" onClick={() => setEditRow(null)} className="flex-1 h-11 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-xs transition-all border border-white/5">Annulla</button>
                                <button type="button" onClick={submitEdit} disabled={actBusy === editRow.id} className="flex-[2] h-11 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs transition-all shadow-lg shadow-amber-500/25 disabled:opacity-50">{actBusy === editRow.id ? "…" : isApprover ? "Salva" : "Invia richiesta"}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* #111: cancellazione ritardo — diretta per l'amministrazione, richiesta per lo store manager */}
            {cancelRow && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setCancelRow(null)}>
                    <div className="glass-card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2"><Trash2 className="w-5 h-5 text-rose-400" />{isApprover ? "Elimina ritardo" : "Chiedi cancellazione"}</h3>
                            <button onClick={() => setCancelRow(null)} className="p-1 hover:bg-white/5 rounded-lg transition-colors"><X className="w-5 h-5 text-slate-500" /></button>
                        </div>
                        <div className="space-y-4">
                            <p className="text-sm text-slate-300">Ritardo di <b className="text-white">{cancelRow.employee_name}</b> del {formatDate(cancelRow.date)}{cancelRow.store ? ` · ${cancelRow.store}` : ""}.</p>
                            {isApprover ? (
                                <p className="text-xs text-rose-300/80 bg-rose-500/5 border border-rose-500/20 rounded-lg p-3">L'eliminazione è definitiva.</p>
                            ) : (
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Motivo della cancellazione</label>
                                    <input type="text" value={cancelNote} onChange={(e) => setCancelNote(e.target.value)} className="glass-input !h-10 text-xs w-full" placeholder="Perché va cancellato…" />
                                    <p className="text-[11px] text-amber-300/80">La cancellazione sarà effettiva solo dopo l'approvazione dell'amministrazione.</p>
                                </div>
                            )}
                            <div className="pt-1 flex gap-3">
                                <button type="button" onClick={() => setCancelRow(null)} className="flex-1 h-11 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-xs transition-all border border-white/5">Annulla</button>
                                <button type="button" onClick={submitCancel} disabled={actBusy === cancelRow.id} className={cn("flex-[2] h-11 rounded-xl text-white font-bold text-xs transition-all disabled:opacity-50", isApprover ? "bg-rose-500 hover:bg-rose-600 shadow-lg shadow-rose-500/25" : "bg-amber-500 hover:bg-amber-600 shadow-lg shadow-amber-500/25")}>{actBusy === cancelRow.id ? "…" : isApprover ? "Elimina" : "Invia richiesta"}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}



/* ══════════════════════════════════════════════════════════════════════════
   BADGE v2 (richiesta Luca 25/07)
   - StoricoPersonale: per chi timbra (caller in primis) — storico badgiate del
     mese + KPI: ore fatte, media giornaliera, proiezione a fine mese (giorni
     lavorativi lun–ven rimasti), tasso di consistenza (regolarità delle ore).
   - PresenzeAdmin: per amministrazione/direzione outbound — lista presenze con
     filtri periodo+persona, export CSV e KPI col benchmark dei mesi passati.
   ══════════════════════════════════════════════════════════════════════════ */

/* ── SEZIONE TURNI (03/08, mig. 144) — la fotografia dei punti vendita:
   chi c'e' OGGI (o nel giorno scelto) in ogni negozio, con orario. La
   preselezione arriva dagli ASSEGNATI al negozio (user_stores + negozio
   principale): un click li conferma a giornata intera. Le coperture si
   aggiungono con mezzi turni (mattina/pomeriggio dagli orari del negozio)
   o orari personalizzati. Orari di apertura/chiusura modificabili qui. ── */
type TurnoRow = { id: number; store: string; data: string; persona: string; inizio: string; fine: string; tipo: string; creato_da: string | null };
// campi opzionali = mig. 158/159 (pausa pranzo, flag ufficio, brand): il
// fallback pre-migrazione carica solo le colonne storiche
type StoreRow = { name: string; orario_apertura: string | null; orario_chiusura: string | null; orario_pausa_inizio?: string | null; orario_pausa_fine?: string | null; is_ufficio?: boolean | null; brand_negozio?: string | null };
// loghi brand del punto vendita (mig. 159): per i multibrand la "donnina"
// /logo-crm.png, che sul tema chiaro ha gia' la chip scura automatica
// (globals.css). Brand NULL → icona generica 🏬.
const LOGO_BRAND: Record<string, string> = { windtre: "/windtre.png", vodafone: "/vodaphone - Copy.png", multibrand: "/logo-crm.png" };

function TurniSection() {
    const { user } = useAuth();
    const gestisce = ["amministrativo", "admin", "dev", "direttore_generale"].includes(user?.role || "");
    const [negozi, setNegozi] = useState<StoreRow[]>([]);
    const [staff, setStaff] = useState<{ full_name: string; primary_store: string | null }[]>([]);
    const [assegnati, setAssegnati] = useState<Map<string, string[]>>(new Map());
    const [turni, setTurni] = useState<TurnoRow[]>([]);
    const [chiusure, setChiusure] = useState<{ store: string; dal: string; al: string; motivo: string }[]>([]);
    const oggiYmd = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
    const [dataSel, setDataSel] = useState(oggiYmd());
    const [nuovo, setNuovo] = useState<Record<string, { persona: string; inizio: string; fine: string }>>({});

    const hhmm = (t: string | null | undefined, fallback: string) => (t || fallback).slice(0, 5);

    const caricaBase = useCallback(async () => {
        const [st0, us, links, ch] = await Promise.all([
            supabase.from("stores").select("name, orario_apertura, orario_chiusura, orario_pausa_inizio, orario_pausa_fine, is_ufficio, brand_negozio").order("name"),
            supabase.from("app_users").select("full_name, primary_store").eq("active", true).order("full_name"),
            supabase.from("user_stores").select("user_id, store_name, app_users!inner(full_name, active)"),
            supabase.from("chiusure_negozio").select("store, dal, al, motivo"),
        ]);
        // mig. 158/159 non ancora applicate: si ripiega sulle colonne storiche
        const st = st0.error
            ? await supabase.from("stores").select("name, orario_apertura, orario_chiusura").order("name")
            : st0;
        setChiusure((ch.data ?? []) as never);
        // gli UFFICI non sono punti vendita a turni (mig. 159): fuori dalla
        // lista, ma le loro persone restano selezionabili come coperture
        setNegozi(((st.data ?? []) as StoreRow[]).filter(n => !n.is_ufficio));
        setStaff((us.data ?? []) as never);
        const m = new Map<string, string[]>();
        const aggiungi = (store: string | null, nome: string | null | undefined) => {
            const sKey = String(store || "").trim(); const n = String(nome || "").trim();
            if (!sKey || !n) return;
            const arr = m.get(sKey) || []; if (!arr.includes(n)) arr.push(n); m.set(sKey, arr);
        };
        ((us.data ?? []) as { full_name: string; primary_store: string | null }[]).forEach(u => aggiungi(u.primary_store, u.full_name));
        ((links.data ?? []) as unknown as { store_name: string; app_users: { full_name: string; active: boolean } }[])
            .forEach(l => { if (l.app_users?.active) aggiungi(l.store_name, l.app_users.full_name); });
        setAssegnati(m);
    }, []);
    const caricaTurni = useCallback(async () => {
        const { data } = await supabase.from("turni_negozio").select("*").eq("data", dataSel).order("inizio");
        setTurni((data ?? []) as TurnoRow[]);
    }, [dataSel]);
    useEffect(() => { caricaBase(); }, [caricaBase]);
    useEffect(() => { caricaTurni(); }, [caricaTurni]);

    const spostaGiorno = (n: number) => { const d = new Date(dataSel + "T12:00"); d.setDate(d.getDate() + n); setDataSel(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`); };
    const aggiungiTurno = async (store: string, persona: string, inizio: string, fine: string, tipo: string) => {
        if (!persona || !inizio || !fine) return;
        const { error } = await supabase.from("turni_negozio").insert({ store, data: dataSel, persona, inizio, fine, tipo, creato_da: user?.name || null });
        if (error && !/duplicate/i.test(error.message)) { alert("Turno non salvato: " + error.message); return; }
        await caricaTurni();
    };
    const eliminaTurno = async (t: TurnoRow) => {
        await supabase.from("turni_negozio").delete().eq("id", t.id);
        setTurni(p => p.filter(x => x.id !== t.id));
    };

    const dataLabel = new Date(dataSel + "T12:00").toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
    const eOggi = dataSel === oggiYmd();
    const tuttiINomi = staff.map(s => s.full_name);

    return (
        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                    <button onClick={() => spostaGiorno(-1)} className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-sm font-bold">‹</button>
                    <div className="text-center min-w-[240px]">
                        <p className="text-base font-black text-white capitalize">{dataLabel}</p>
                        {eOggi && <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-300">Oggi</p>}
                    </div>
                    <button onClick={() => spostaGiorno(1)} className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-sm font-bold">›</button>
                    {!eOggi && <button onClick={() => setDataSel(oggiYmd())} className="text-[10px] font-bold uppercase tracking-widest text-indigo-300 hover:text-white ml-1">Oggi</button>}
                    <input type="date" value={dataSel} onChange={e => e.target.value && setDataSel(e.target.value)} className="glass-input !h-9 text-xs ml-2" />
                </div>
                <p className="text-xs text-slate-500 max-w-md">
                    Gli <b className="text-slate-300">assegnati</b> al negozio sono la squadra di casa: un click li mette
                    a turno per la giornata. Le <b className="text-slate-300">coperture</b> si aggiungono anche a mezzo turno.
                </p>
            </div>

            {/* RIGHE per PUNTO VENDITA (03/08, feedback Luca): negozi in
                verticale, collaboratori in ORIZZONTALE — niente piu' card
                confusionarie. Orari e chiusure si amministrano da
                Amministrazione → Orari & Chiusure; qui solo si leggono. */}
            <div className="glass-card overflow-hidden divide-y divide-white/5">
                {negozi.map(n => {
                    const ap = hhmm(n.orario_apertura, "09:30"), ch = hhmm(n.orario_chiusura, "19:30");
                    // orario SPEZZATO (mig. 158): con la pausa valorizzata le
                    // coperture M/P seguono le due fasce; senza pausa resta lo
                    // spartiacque storico delle 14:00
                    const pi = n.orario_pausa_inizio ? hhmm(n.orario_pausa_inizio, "") : "";
                    const pf = n.orario_pausa_fine ? hhmm(n.orario_pausa_fine, "") : "";
                    const spezzato = !!(pi && pf);
                    const chiusura = chiusure.find(c => c.store === n.name && c.dal <= dataSel && c.al >= dataSel);
                    const turniStore = turni.filter(t => t.store === n.name);
                    const aTurno = new Set(turniStore.map(t => t.persona));
                    const squadra = (assegnati.get(n.name) || []).filter(p => !aTurno.has(p));
                    const nv = nuovo[n.name] || { persona: "", inizio: ap, fine: ch };
                    const setNv = (patch: Partial<typeof nv>) => setNuovo(p => ({ ...p, [n.name]: { ...nv, ...patch } }));
                    return (
                        <div key={n.name} className={cn("flex items-center gap-4 px-4 py-3 flex-wrap", chiusura && "bg-rose-500/[0.05]")}>
                            {/* colonna negozio: logo del brand (mig. 159) al posto dell'emoji */}
                            <div className="w-56 shrink-0">
                                <p className="text-sm font-bold text-white flex items-center gap-1.5">
                                    {n.brand_negozio && LOGO_BRAND[n.brand_negozio]
                                        ? <img src={LOGO_BRAND[n.brand_negozio]} alt="" className="w-5 h-5 object-contain shrink-0" />
                                        : <span className="shrink-0">🏬</span>}
                                    <span className="truncate min-w-0">{n.name}</span>
                                </p>
                                {chiusura ? (
                                    <p className="text-[10px] font-black uppercase text-rose-400 mt-0.5">🔒 Chiuso{chiusura.motivo ? ` · ${chiusura.motivo}` : ""}</p>
                                ) : (
                                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">🕐 {spezzato ? `${ap}–${pi} · ${pf}–${ch}` : `${ap}–${ch}`}</p>
                                )}
                            </div>
                            {/* persone in ORIZZONTALE */}
                            <div className="flex-1 min-w-[320px] flex items-center gap-1.5 flex-wrap">
                                {chiusura ? (
                                    <span className="text-xs text-rose-300/80 italic">Punto vendita chiuso in questa data.</span>
                                ) : (<>
                                    {turniStore.map(t => (
                                        <span key={t.id} className={cn("inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-bold border",
                                            t.tipo === "giornata" ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/40"
                                                : t.tipo === "mattina" ? "bg-sky-500/10 text-sky-300 border-sky-500/40"
                                                    : t.tipo === "pomeriggio" ? "bg-amber-500/10 text-amber-300 border-amber-500/40"
                                                        : "bg-violet-500/10 text-violet-300 border-violet-500/40")}>
                                            {t.persona}
                                            <i className="not-italic font-mono font-normal opacity-80">{t.inizio.slice(0, 5)}–{t.fine.slice(0, 5)}</i>
                                            {gestisce && <button onClick={() => eliminaTurno(t)} title="Togli il turno" className="opacity-60 hover:opacity-100">✕</button>}
                                        </span>
                                    ))}
                                    {squadra.map(p => (
                                        <span key={p} title="Assegnato al negozio, non ancora a turno in questa data"
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] border border-dashed border-white/15 text-slate-500">
                                            {p}
                                            {gestisce && <button onClick={() => aggiungiTurno(n.name, p, ap, ch, "giornata")} title="Conferma a turno per la giornata" className="text-emerald-400 hover:text-emerald-300 font-black">＋</button>}
                                        </span>
                                    ))}
                                    {turniStore.length === 0 && squadra.length === 0 && <span className="text-xs text-slate-600 italic">Nessuno assegnato.</span>}
                                </>)}
                            </div>
                            {/* copertura rapida, in coda alla riga */}
                            {gestisce && !chiusura && (
                                <div className="flex items-center gap-1.5 flex-wrap shrink-0" onClick={e => e.stopPropagation()}>
                                    <div className="w-44"><SelectPersona value={nv.persona} onChange={v => setNv({ persona: v })} opzioni={tuttiINomi} placeholder="Copertura…" className="glass-input text-xs rounded-lg py-1.5 w-full" /></div>
                                    <button onClick={() => aggiungiTurno(n.name, nv.persona, ap, ch, "giornata")} disabled={!nv.persona} title="Giornata intera" className="px-2 py-1.5 rounded-lg text-[10px] font-bold bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 disabled:opacity-40">G</button>
                                    <button onClick={() => aggiungiTurno(n.name, nv.persona, ap, pi || "14:00", "mattina")} disabled={!nv.persona} title={`Mattina (${ap} → ${pi || "14:00"})`} className="px-2 py-1.5 rounded-lg text-[10px] font-bold bg-sky-500/15 border border-sky-500/40 text-sky-300 disabled:opacity-40">M</button>
                                    <button onClick={() => aggiungiTurno(n.name, nv.persona, pf || "14:00", ch, "pomeriggio")} disabled={!nv.persona} title={`Pomeriggio (${pf || "14:00"} → ${ch})`} className="px-2 py-1.5 rounded-lg text-[10px] font-bold bg-amber-500/15 border border-amber-500/40 text-amber-300 disabled:opacity-40">P</button>
                                    <input type="time" value={nv.inizio} onChange={e => setNv({ inizio: e.target.value })} className="glass-input !h-7 !px-1 text-[10px] w-[70px]" />
                                    <input type="time" value={nv.fine} onChange={e => setNv({ fine: e.target.value })} className="glass-input !h-7 !px-1 text-[10px] w-[70px]" />
                                    <button onClick={() => aggiungiTurno(n.name, nv.persona, nv.inizio, nv.fine, "personalizzato")} disabled={!nv.persona} title="Orario personalizzato" className="px-2 py-1.5 rounded-lg text-[10px] font-bold bg-violet-500/15 border border-violet-500/40 text-violet-300 disabled:opacity-40">＋</button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

