"use client";

import { useSearchParams } from "next/navigation";
import { SelectPersona } from "@/components/SelectPersona";
import { Suspense, useState, useEffect, useCallback } from "react";
import { Clock, Users, CalendarDays, Shield, X, MapPin, Play, Pause, Square, History, Search, Store, ArrowUpDown, ChevronUp, ChevronDown, Check, Clock3, Download, Trash2 } from "lucide-react";
import { cn } from "@/utils";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { seesAllStores, seesWholeStore, isAdminOrAbove } from "@/lib/roles";
import { useVisibleStores } from "@/lib/visibleStores";

// Il tab BADGE e' stato SPOSTATO nell'hub Call Center (/caller?tab=badge, Luca 28/07):
// componenti in ./_badge.tsx, permessi e capacita' migrati (mig. 096).
type TabId = "ferie" | "malattia" | "ritardi";

function CollaboratoriPageContent() {
    const { user } = useAuth();
    const searchParams = useSearchParams();
    const tab = (searchParams.get("tab") as TabId) || "ferie";

    const isAdminLike = !!user && (seesAllStores(user.role) || seesWholeStore(user.role));

    const sectionInfo = {
        ferie: { label: "Ferie", icon: CalendarDays, desc: "Pianificazione, richieste e approvazione ferie" },
        malattia: { label: "Malattia", icon: Shield, desc: "Registro e monitoraggio assenze per malattia" },
        ritardi: { label: "Ritardi", icon: Clock3, desc: "Segnalazione e monitoraggio ritardi (staff di negozio)" },
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
                {tab === "ferie" && <FerieSection isAdminLike={!!isAdminLike} />}
                {tab === "malattia" && isAdminOrAbove(user?.role) && <MalattiaSection />}
                {tab === "malattia" && !isAdminOrAbove(user?.role) && (
                    <div className="glass-card p-12 text-center">
                        <Shield className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-white">Accesso Riservato</h3>
                        <p className="text-slate-500 max-w-md mx-auto mt-2">Questa sezione è accessibile solo agli amministratori e ai responsabili.</p>
                    </div>
                )}
                {tab === "ritardi" && <RitardiSection />}
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

type VacationRequest = { id: number; employee_name: string; store: string; date_from: string; date_to: string; reason: string | null; status: string; admin_note: string | null; created_at: string; half_day?: string | null };

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
    const [qPersona, setQPersona] = useState("");   // ricerca a scrittura nel filtro persone
    const canDeleteRow = ["amministrativo", "admin", "dev", "direttore_generale"].includes(user?.role || "");

    const fetchRequests = useCallback(async () => {
        const { data } = await supabase.from("vacation_requests").select("*").order("created_at", { ascending: false });
        setRequests((data ?? []) as VacationRequest[]);
    }, []);

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
            const { data: inc } = await supabase.from("incarichi").select("assegnatari,fulmine").eq("chiave", "ferie").maybeSingle();
            const ass = (inc?.assegnatari ?? []) as string[];
            if (inc?.fulmine && ass.length) {
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

    const approva = async (id: number) => {
        await supabase.from("vacation_requests").update({ status: "approved" }).eq("id", id);
        await fetchRequests();
    };
    // RIFIUTO CON NOTA (Luca 29/07): la nota la vede il collaboratore in riga
    const confermaRifiuto = async () => {
        if (rifiutoId == null) return;
        await supabase.from("vacation_requests").update({ status: "rejected", admin_note: rifiutoNota.trim() || null }).eq("id", rifiutoId);
        setRifiutoId(null); setRifiutoNota("");
        await fetchRequests();
    };
    // CESTINO (amministrativo in su): per le righe di prova o gli errori
    const eliminaRiga = async (id: number) => {
        if (!window.confirm("Eliminare questa riga di ferie dal registro? L'operazione è definitiva.")) return;
        await supabase.from("vacation_requests").delete().eq("id", id);
        await fetchRequests();
    };

    const inFerieOggi = requests.filter(r => r.status === "approved" && r.date_from <= new Date().toISOString().slice(0, 10) && r.date_to >= new Date().toISOString().slice(0, 10)).length;
    const programmate = requests.filter(r => r.status === "approved" && r.date_from > new Date().toISOString().slice(0, 10)).length;
    const inAttesa = requests.filter(r => r.status === "pending").length;

    const filteredRequests = requests.filter(r =>
        (!fPersone.length || fPersone.includes(r.employee_name)) &&
        (!fNegozi.length || fNegozi.includes(r.store)) &&
        (!fDa || r.date_to >= fDa) && (!fA || r.date_from <= fA)
    );
    const persone = [...new Set(requests.map(r => r.employee_name))].sort();
    const negozi = [...new Set(requests.map(r => r.store).filter(Boolean))].sort();

    const formatDate = (iso: string) => {
        return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {isAdminLike && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="glass-panel p-5 border-l-4 border-l-sky-500">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">In Ferie Oggi</p>
                        <p className="text-2xl font-black text-white">{inFerieOggi}</p>
                    </div>
                    <div className="glass-panel p-5 border-l-4 border-l-emerald-500">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Programmate</p>
                        <p className="text-2xl font-black text-white">{programmate}</p>
                    </div>
                    <div className="glass-panel p-5 border-l-4 border-l-amber-500">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Richieste in Attesa</p>
                        <p className="text-2xl font-black text-white">{inAttesa}</p>
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
                                const giorni = (r: VacationRequest) => r.half_day ? 0.5 : (Math.round((new Date(r.date_to).getTime() - new Date(r.date_from).getTime()) / 86400000) + 1);
                                const righe = [["Collaboratore", "Negozio", "Dal", "Al", "Giorni", "Mezza giornata", "Stato", "Motivazione", "Nota amministrazione"].join(";")];
                                filteredRequests.forEach(r => righe.push([
                                    r.employee_name, r.store, formatDate(r.date_from), formatDate(r.date_to),
                                    String(giorni(r)).replace(".", ","),
                                    r.half_day ? (r.half_day === "mattina" ? "Mattina" : "Pomeriggio") : "",
                                    r.status === "approved" ? "Approvata" : r.status === "rejected" ? "Rifiutata" : "In attesa",
                                    (r.reason || "").replaceAll(";", ","), (r.admin_note || "").replaceAll(";", ","),
                                ].join(";")));
                                const blob = new Blob(["\uFEFF" + righe.join("\n")], { type: "text/csv;charset=utf-8" });
                                const url = URL.createObjectURL(blob);
                                const el = document.createElement("a");
                                el.href = url; el.download = `ferie_${fDa || "inizio"}_${fA || "oggi"}.csv`; el.click();
                                URL.revokeObjectURL(url);
                            }} disabled={filteredRequests.length === 0}
                                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-40">
                                ⬇️ Excel commercialista
                            </button>
                        )}
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

                    {isAdminLike && (
                        <div className="glass-card p-4 space-y-2.5">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest w-16">Periodo</span>
                                <input type="date" value={fDa} onChange={e => setFDa(e.target.value)} className="glass-input !h-8 text-xs" />
                                <span className="text-slate-600 text-xs">→</span>
                                <input type="date" value={fA} onChange={e => setFA(e.target.value)} className="glass-input !h-8 text-xs" />
                                {(fDa || fA) && <button onClick={() => { setFDa(""); setFA(""); }} className="text-[10px] font-bold text-slate-500 hover:text-white">✕ azzera</button>}
                            </div>
                            {/* PERSONE: ricerca a scrittura (Luca 29/07 — "saranno tantissime"):
                                scrivi il nome, lo selezioni, ne scrivi un altro; i selezionati
                                restano come chip rimovibili. Invio = primo suggerimento. */}
                            <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest w-16">Persone</span>
                                <div className="relative">
                                    <input value={qPersona} onChange={e => setQPersona(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === "Enter") {
                                                e.preventDefault();
                                                const primo = persone.filter(n => !fPersone.includes(n) && n.toLowerCase().includes(qPersona.trim().toLowerCase()))[0];
                                                if (qPersona.trim() && primo) { setFPersone(p => [...p, primo]); setQPersona(""); }
                                            }
                                        }}
                                        placeholder="Scrivi un nome…" className="glass-input !h-8 text-xs w-44" />
                                    {qPersona.trim() && (
                                        <div className="absolute z-40 mt-1 w-56 rounded-lg border border-white/10 bg-[#0f111a] shadow-2xl overflow-hidden">
                                            {persone.filter(n => !fPersone.includes(n) && n.toLowerCase().includes(qPersona.trim().toLowerCase())).slice(0, 8).map(n => (
                                                <button key={n} onClick={() => { setFPersone(p => [...p, n]); setQPersona(""); }}
                                                    className="block w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-indigo-500/15">
                                                    {n}
                                                </button>
                                            ))}
                                            {persone.filter(n => !fPersone.includes(n) && n.toLowerCase().includes(qPersona.trim().toLowerCase())).length === 0 && (
                                                <p className="px-3 py-1.5 text-xs text-slate-600">Nessun nome corrispondente</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                                {fPersone.map(n => (
                                    <span key={n} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border border-indigo-400/70 bg-indigo-500/20 text-indigo-100">
                                        {n}
                                        <button onClick={() => setFPersone(p => p.filter(x => x !== n))} className="opacity-70 hover:opacity-100">✕</button>
                                    </span>
                                ))}
                                {fPersone.length > 0 && (
                                    <button onClick={() => setFPersone([])} className="text-[10px] font-bold text-slate-500 hover:text-white uppercase tracking-widest">✕ tutte</button>
                                )}
                                {fPersone.length === 0 && <span className="text-[11px] text-slate-600">tutte le persone</span>}
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
                            richieste={filteredRequests.filter(r => r.status !== "rejected")}
                            mese={meseCal}
                            setMese={setMeseCal}
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
                                        <th className="px-5 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Stato</th>
                                        <th className="px-5 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Azioni</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {(isAdminLike ? filteredRequests : requests.filter(r => r.employee_name === user?.name)).map(r => (
                                        <tr key={r.id} className="hover:bg-white/[0.01] transition-colors group">
                                            <td className="px-5 py-4">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-bold text-white group-hover:text-indigo-400 transition-colors">
                                                        {formatDate(r.date_from)}
                                                    </span>
                                                    {r.half_day ? (
                                                        <span className="mt-0.5 inline-flex items-center gap-1 self-start px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[10px] font-black uppercase tracking-tight">
                                                            {r.half_day === "mattina" ? "☀️" : "🌇"} ½ giornata · {r.half_day}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] text-slate-500">al {formatDate(r.date_to)}</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-5 py-4">
                                                <p className="text-sm font-medium text-slate-300">{r.employee_name}</p>
                                                <p className="text-[10px] text-slate-500 uppercase tracking-wider">{r.store}</p>
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
                                                    <p className="text-[10px] text-rose-300/90 mt-1.5 max-w-[240px] mx-auto leading-snug">📝 {r.admin_note}</p>
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
                                            <td colSpan={4} className="px-5 py-10 text-center text-slate-500 text-sm italic">Nessuna richiesta trovata</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    )}
                </div>
            </div>

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
function CalendarioFerie({ richieste, mese, setMese }: { richieste: VacationRequest[]; mese: Date; setMese: (d: Date) => void }) {
    const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
    const primo = new Date(mese.getFullYear(), mese.getMonth(), 1);
    const inizio = new Date(primo);
    inizio.setDate(primo.getDate() - ((primo.getDay() + 6) % 7));   // lunedì della prima settimana
    const giorni: Date[] = Array.from({ length: 42 }, (_, i) => { const d = new Date(inizio); d.setDate(inizio.getDate() + i); return d; });
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const delGiorno = (d: Date) => { const k = iso(d); return richieste.filter(r => r.date_from <= k && r.date_to >= k); };
    const nomeCorto = (n: string) => { const p = n.trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[1][0]}.` : p[0]; };
    return (
        <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-3">
                <button onClick={() => setMese(new Date(mese.getFullYear(), mese.getMonth() - 1, 1))} className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-sm font-bold">‹</button>
                <div className="flex items-center gap-3">
                    <h4 className="text-base font-black text-white capitalize">{mese.toLocaleDateString("it-IT", { month: "long", year: "numeric" })}</h4>
                    <button onClick={() => { const d = new Date(); setMese(new Date(d.getFullYear(), d.getMonth(), 1)); }} className="text-[10px] font-bold uppercase tracking-widest text-indigo-300 hover:text-white">Oggi</button>
                </div>
                <button onClick={() => setMese(new Date(mese.getFullYear(), mese.getMonth() + 1, 1))} className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-sm font-bold">›</button>
            </div>
            <div className="grid grid-cols-7 gap-px text-center mb-1">
                {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map(g => <div key={g} className="text-[10px] font-bold text-slate-500 uppercase tracking-widest py-1">{g}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-px bg-white/5 rounded-xl overflow-hidden">
                {giorni.map((d, i) => {
                    const fuoriMese = d.getMonth() !== mese.getMonth();
                    const isOggi = d.getTime() === oggi.getTime();
                    const rr = delGiorno(d);
                    return (
                        <div key={i} className={cn("min-h-[86px] p-1.5 bg-[#0f111a]", fuoriMese && "opacity-40")}>
                            <div className={cn("text-[11px] font-bold mb-1", isOggi ? "text-indigo-300" : "text-slate-500")}>
                                {isOggi ? <span className="px-1.5 py-0.5 rounded-md bg-indigo-500/25">{d.getDate()}</span> : d.getDate()}
                            </div>
                            <div className="space-y-0.5">
                                {rr.slice(0, 3).map(r => (
                                    <div key={r.id} title={`${r.employee_name} (${r.store}) — ${r.status === "approved" ? "approvata" : "in attesa"}${r.reason ? `: ${r.reason}` : ""}`}
                                        className={cn("truncate rounded px-1 py-0.5 text-[10px] font-semibold leading-tight",
                                            r.status === "approved" ? "bg-emerald-500/20 text-emerald-200" : "bg-amber-500/20 text-amber-200")}>
                                        {r.half_day ? (r.half_day === "mattina" ? "½☀️ " : "½🌇 ") : ""}{nomeCorto(r.employee_name)}
                                    </div>
                                ))}
                                {rr.length > 3 && <div className="text-[9px] text-slate-500 px-1">+{rr.length - 3} altre</div>}
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="flex items-center gap-4 mt-3 text-[11px] text-slate-400">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500/40" /> Approvate</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-500/40" /> In attesa</span>
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
    const [filterPerson, setFilterPerson] = useState("");
    const [filterStore, setFilterStore] = useState("");
    const [periodDays, setPeriodDays] = useState(30);

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
    let filtered = absences.filter(a => a.date_to >= cutoffStr);

    const filteredAbsences = filtered.filter(a =>
        a.employee_name.toLowerCase().includes(filterPerson.toLowerCase()) &&
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
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Assenze Recenti</p>
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

                    <div className="flex flex-wrap gap-2 w-full md:w-auto">
                        <input
                            type="text"
                            placeholder="Collaboratore..."
                            value={filterPerson}
                            onChange={e => setFilterPerson(e.target.value)}
                            className="glass-input !h-9 px-3 text-xs w-full sm:w-32"
                        />
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

    const [rows, setRows] = useState<RitardoRow[]>([]);
    const [showNewModal, setShowNewModal] = useState(false);
    const [filterPerson, setFilterPerson] = useState("");
    const [saving, setSaving] = useState(false);

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

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
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
                                    </tr>
                                ))}
                                {filtered.length === 0 && (
                                    <tr><td colSpan={4} className="px-5 py-10 text-center text-slate-500 text-sm italic">Nessun ritardo registrato</td></tr>
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
