"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState, useEffect, useCallback } from "react";
import { Clock, Users, CalendarDays, Shield, X, MapPin, Play, Pause, Square, History, Search, Store, ArrowUpDown, ChevronUp, ChevronDown, Check, Clock3, Download } from "lucide-react";
import { cn } from "@/utils";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { seesAllStores, seesWholeStore, isAdminOrAbove } from "@/lib/roles";

type TabId = "badge" | "ferie" | "malattia" | "ritardi";

function CollaboratoriPageContent() {
    const { user } = useAuth();
    const searchParams = useSearchParams();
    const tab = (searchParams.get("tab") as TabId) || "badge";

    const isAdminLike = !!user && (seesAllStores(user.role) || seesWholeStore(user.role));

    const sectionInfo = {
        badge: { label: "Badge", icon: Clock, desc: "Gestione presenze e timbrature in tempo reale" },
        ferie: { label: "Ferie", icon: CalendarDays, desc: "Pianificazione, richieste e approvazione ferie" },
        malattia: { label: "Malattia", icon: Shield, desc: "Registro e monitoraggio assenze per malattia" },
        ritardi: { label: "Ritardi", icon: Clock3, desc: "Segnalazione e monitoraggio ritardi (staff di negozio)" },
    };

    const currentSection = sectionInfo[tab] || sectionInfo.badge;

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
                {tab === "badge" && <BadgeAndDashboard isAdminLike={!!isAdminLike} />}
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

type ShiftRow = { id: number; employee_name: string; store: string; started_at: string; ended_at: string | null; pause_started_at: string | null; total_pause_minutes: number };

function BadgeAndDashboard({ isAdminLike }: { isAdminLike: boolean }) {
    const { user } = useAuth();
    const [activeShift, setActiveShift] = useState<ShiftRow | null>(null);
    const [todayMinutes, setTodayMinutes] = useState(0);
    const [teamStats, setTeamStats] = useState({ presenti: 0, totalMinutes: 0 });
    const [loading, setLoading] = useState(true);

    const status: "off" | "running" | "paused" = !activeShift ? "off" : activeShift.pause_started_at ? "paused" : "running";
    const canStart = status === "off";
    const canPause = status === "running";
    const canResume = status === "paused";
    const canStop = status === "running" || status === "paused";

    const labelStatus =
        status === "off" ? "Fuori turno" : status === "running" ? "In turno" : "In pausa";

    const fetchActiveShift = useCallback(async () => {
        if (!user?.name) return;
        const { data } = await supabase.from("shifts").select("*").eq("employee_name", user.name).is("ended_at", null).order("started_at", { ascending: false }).limit(1).maybeSingle();
        setActiveShift(data as ShiftRow | null);
    }, [user?.name]);

    const fetchTeamStats = useCallback(async () => {
        if (!isAdminLike) return;
        const today = new Date().toISOString().slice(0, 10);
        const { count: presenti } = await supabase.from("shifts").select("*", { count: 'exact', head: true }).is("ended_at", null);
        const { data: todayShifts } = await supabase.from("shifts").select("*").gte("started_at", today);
        let totalMins = 0;
        (todayShifts || []).forEach(s => {
            const start = new Date(s.started_at).getTime();
            const end = s.ended_at ? new Date(s.ended_at).getTime() : Date.now();
            const pause = Number(s.total_pause_minutes) || 0;
            totalMins += Math.max(0, (end - start) / 60000 - pause);
        });
        setTeamStats({ presenti: presenti || 0, totalMinutes: Math.floor(totalMins) });
    }, [isAdminLike]);

    useEffect(() => {
        (async () => {
            await Promise.all([fetchActiveShift(), fetchTeamStats()]);
            setLoading(false);
        })();
    }, [fetchActiveShift, fetchTeamStats]);

    useEffect(() => {
        if (!activeShift) {
            setTodayMinutes(0);
            return;
        }
        const compute = () => {
            const start = new Date(activeShift.started_at).getTime() / 60000;
            const now = Date.now() / 60000;
            let pause = Number(activeShift.total_pause_minutes) || 0;
            if (activeShift.pause_started_at) pause += (now - new Date(activeShift.pause_started_at).getTime() / 60000);
            setTodayMinutes(Math.max(0, Math.floor(now - start - pause)));
        };
        compute();
        const t = setInterval(compute, 60000);
        return () => clearInterval(t);
    }, [activeShift]);

    const handleStart = async () => {
        if (!user?.name) return;
        const { data, error } = await supabase.from("shifts").insert({ employee_name: user.name, store: user.negozio ?? "" }).select().single();
        if (!error && data) setActiveShift(data as ShiftRow);
    };
    const handlePause = async () => {
        if (!activeShift) return;
        await supabase.from("shifts").update({ pause_started_at: new Date().toISOString() }).eq("id", activeShift.id);
        setActiveShift(prev => prev ? { ...prev, pause_started_at: new Date().toISOString() } : null);
    };
    const handleResume = async () => {
        if (!activeShift?.pause_started_at) return;
        const extra = (Date.now() - new Date(activeShift.pause_started_at).getTime()) / 60000;
        const newTotal = (Number(activeShift.total_pause_minutes) || 0) + extra;
        await supabase.from("shifts").update({ pause_started_at: null, total_pause_minutes: newTotal }).eq("id", activeShift.id);
        setActiveShift(prev => prev ? { ...prev, pause_started_at: null, total_pause_minutes: newTotal } : null);
    };
    const handleStop = async () => {
        if (!activeShift) return;
        let totalPause = Number(activeShift.total_pause_minutes) || 0;
        if (activeShift.pause_started_at) totalPause += (Date.now() - new Date(activeShift.pause_started_at).getTime()) / 60000;
        await supabase.from("shifts").update({ ended_at: new Date().toISOString(), pause_started_at: null, total_pause_minutes: totalPause }).eq("id", activeShift.id);
        setActiveShift(null);
        await fetchTeamStats();
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Top Stats Bar - Only for Admins or to show personal today summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="glass-panel p-5 border-l-4 border-l-indigo-500">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Stato Attuale</p>
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            "w-2.5 h-2.5 rounded-full animate-pulse",
                            status === "running" ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" :
                                status === "paused" ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" : "bg-slate-600"
                        )} />
                        <p className="text-xl font-bold text-white uppercase tracking-tight">{labelStatus}</p>
                    </div>
                </div>

                <div className="glass-panel p-5 border-l-4 border-l-emerald-500">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Tempo Oggi</p>
                    <p className="text-2xl font-black text-white">
                        {Math.floor(todayMinutes / 60)}h <span className="text-emerald-400">{String(todayMinutes % 60).padStart(2, "0")}m</span>
                    </p>
                </div>

                {isAdminLike && (
                    <>
                        <div className="glass-panel p-5 border-l-4 border-l-sky-500">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Presenti Ora</p>
                            <p className="text-2xl font-black text-white">{teamStats.presenti}</p>
                        </div>
                        <div className="glass-panel p-5 border-l-4 border-l-violet-500">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Totale Ore Team</p>
                            <p className="text-2xl font-black text-white">
                                {Math.floor(teamStats.totalMinutes / 60)}h <span className="text-violet-400">{String(teamStats.totalMinutes % 60).padStart(2, "0")}m</span>
                            </p>
                        </div>
                    </>
                )}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                {/* Badge Action Card */}
                <div className="xl:col-span-4 glass-card p-8 flex flex-col items-center text-center relative overflow-hidden group">
                    {/* Decorative background logo icon */}
                    <Clock className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 text-white/5 -rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-700" />

                    <div className="relative z-10 w-full max-w-xs">
                        <div className="mb-6 space-y-1">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                                {user?.name ?? "Collaboratore"}
                            </p>
                            <h2 className="text-xl font-black text-white">Gestione Turno</h2>
                        </div>

                        <div className="bg-slate-900/40 backdrop-blur-md rounded-2xl border border-white/5 p-6 mb-8 shadow-inner">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 italic">Timer Real-time</p>
                            <p className="text-5xl font-black text-white tracking-tighter tabular-nums drop-shadow-[0_0_10px_rgba(99,102,241,0.3)]">
                                {Math.floor(todayMinutes / 60).toString().padStart(2, "0")}:
                                {String(todayMinutes % 60).padStart(2, "0")}
                            </p>
                        </div>

                        <div className="grid grid-cols-1 gap-3 w-full">
                            {canStart && (
                                <button
                                    onClick={handleStart}
                                    disabled={loading}
                                    className="h-14 rounded-2xl bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-sm tracking-wide transition-all shadow-lg shadow-indigo-500/30 flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
                                >
                                    <Clock className="w-5 h-5" />
                                    INIZIA TURNO
                                </button>
                            )}

                            {status === "running" && (
                                <div className="flex flex-col gap-3">
                                    <button
                                        onClick={handlePause}
                                        className="h-14 rounded-2xl bg-amber-500/20 text-amber-500 border border-amber-500/30 hover:bg-amber-500/30 font-bold text-sm tracking-wide transition-all active:scale-95 flex items-center justify-center gap-3"
                                    >
                                        VADO IN PAUSA
                                    </button>
                                    <button
                                        onClick={handleStop}
                                        className="h-14 rounded-2xl bg-rose-500 text-white font-bold text-sm tracking-wide transition-all shadow-lg shadow-rose-500/30 active:scale-95 flex items-center justify-center gap-3"
                                    >
                                        FINE TURNO
                                    </button>
                                </div>
                            )}

                            {status === "paused" && (
                                <div className="flex flex-col gap-3">
                                    <button
                                        onClick={handleResume}
                                        className="h-14 rounded-2xl bg-emerald-500 text-white font-bold text-sm tracking-wide transition-all shadow-lg shadow-emerald-500/30 active:scale-95 flex items-center justify-center gap-3"
                                    >
                                        RIPRENDI TURNO
                                    </button>
                                    <button
                                        onClick={handleStop}
                                        className="h-14 rounded-2xl bg-rose-500 text-white font-bold text-sm tracking-wide transition-all shadow-lg shadow-rose-500/30 active:scale-95 flex items-center justify-center gap-3"
                                    >
                                        FINE TURNO
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="mt-8 pt-6 border-t border-white/5 flex flex-wrap justify-center gap-6 text-[11px] font-bold">
                            {activeShift?.started_at && (
                                <div className="flex flex-col items-center">
                                    <span className="text-slate-500 uppercase tracking-widest mb-1">Entrata</span>
                                    <span className="text-slate-200">{new Date(activeShift.started_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</span>
                                </div>
                            )}
                            {activeShift?.pause_started_at && (
                                <div className="flex flex-col items-center">
                                    <span className="text-slate-500 uppercase tracking-widest mb-1">In Pausa</span>
                                    <span className="text-amber-400">{new Date(activeShift.pause_started_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Dashboard admin/Team View */}
                <div className="xl:col-span-8 flex flex-col gap-6 min-w-0">
                    {isAdminLike ? (
                        <BadgeAdminDashboard onRefresh={async () => { await fetchActiveShift(); await fetchTeamStats(); }} />
                    ) : (
                        <div className="glass-card p-8 h-full flex flex-col items-center justify-center text-center">
                            <Shield className="w-16 h-16 text-slate-700 mb-6" />
                            <h3 className="text-lg font-bold text-slate-300">Vista Team Riservata</h3>
                            <p className="text-sm text-slate-500 mt-2 max-w-sm">
                                Solo gli amministratori e i manager possono visualizzare in tempo reale lo stato degli altri collaboratori.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function BadgeAdminDashboard({ onRefresh }: { onRefresh: () => void }) {
    const { user } = useAuth();   // serve per il tasto "Esporta ore" (segn.83)
    const [shifts, setShifts] = useState<ShiftRow[]>([]);
    const [filterPerson, setFilterPerson] = useState("");
    const [filterStore, setFilterStore] = useState("");
    const [loading, setLoading] = useState(true);

    const fetchShifts = useCallback(async () => {
        setLoading(true);
        // Prendi tutti i turni non chiusi (active) e gli ultimi 50 chiusi
        const { data: activeData } = await supabase.from("shifts").select("*").is("ended_at", null).order("started_at", { ascending: false });
        const { data: historyData } = await supabase.from("shifts").select("*").not("ended_at", "is", null).order("ended_at", { ascending: false }).limit(50);

        setShifts([...(activeData || []), ...(historyData || [])] as ShiftRow[]);
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchShifts();
    }, [fetchShifts]);

    const activeShifts = shifts.filter(s => !s.ended_at);
    const historyShifts = shifts.filter(s => !!s.ended_at);

    const filteredActive = activeShifts.filter(s =>
        s.employee_name.toLowerCase().includes(filterPerson.toLowerCase()) &&
        s.store.toLowerCase().includes(filterStore.toLowerCase())
    );

    const filteredHistory = historyShifts.filter(s =>
        s.employee_name.toLowerCase().includes(filterPerson.toLowerCase()) &&
        s.store.toLowerCase().includes(filterStore.toLowerCase())
    );

    const formatTime = (iso: string | null) => {
        if (!iso) return "--:--";
        return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    };

    const formatDateShort = (iso: string | null) => {
        if (!iso) return "--/--";
        return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
    };

    const minsToHours = (mins: number) => {
        const h = Math.floor(mins / 60);
        const m = Math.floor(mins % 60);
        return `${h}h ${m}m`;
    };

    // Segnalazione 83: esporta le ore di TUTTI i collaboratori in un file che si
    // apre con Excel. Prende tutti i turni chiusi (non solo gli ultimi 50 a
    // schermo) e aggiunge in fondo il totale per collaboratore.
    const [exporting, setExporting] = useState(false);
    const esportaOre = async () => {
        setExporting(true);
        try {
            const { data, error } = await supabase
                .from("shifts")
                .select("employee_name, store, started_at, ended_at, total_pause_minutes")
                .not("ended_at", "is", null)
                .order("employee_name")
                .order("started_at");
            if (error) { alert("Esportazione non riuscita: " + error.message); return; }
            const righe = (data ?? []) as ShiftRow[];
            if (righe.length === 0) { alert("Non ci sono turni conclusi da esportare."); return; }
            const oreDi = (s: ShiftRow) => {
                const ini = new Date(s.started_at).getTime();
                const fine = new Date(s.ended_at as string).getTime();
                const pausa = (s.total_pause_minutes || 0) * 60000;
                return Math.max(0, (fine - ini - pausa)) / 3600000;
            };
            const dec = (n: number) => n.toFixed(2).replace(".", ",");   // Excel italiano
            const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
            const intestazioni = ["Collaboratore", "Negozio", "Data", "Entrata", "Uscita", "Pausa (min)", "Ore lavorate"];
            const corpo = righe.map((s) => [
                s.employee_name, s.store,
                new Date(s.started_at).toLocaleDateString("it-IT"),
                formatTime(s.started_at), formatTime(s.ended_at),
                String(s.total_pause_minutes || 0), dec(oreDi(s)),
            ].map(q).join(";"));
            const totali = new Map<string, number>();
            righe.forEach((s) => totali.set(s.employee_name, (totali.get(s.employee_name) || 0) + oreDi(s)));
            const riepilogo = ["", q("TOTALE ORE PER COLLABORATORE"),
                ...[...totali.entries()].sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([nome, ore]) => [nome, "", "", "", "", "", dec(ore)].map(q).join(";"))];
            const csv = [intestazioni.map(q).join(";"), ...corpo, ...riepilogo].join("\r\n");
            const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `ore-collaboratori-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        } finally { setExporting(false); }
    };

    return (
        <div className="space-y-6">
            {/* Header and Filters */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="space-y-1">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Users className="w-5 h-5 text-indigo-400" />
                        Pannello Amministrativo Team
                    </h3>
                    <p className="text-xs text-slate-500">Monitoraggio turni e storico presenze</p>
                </div>
                <div className="flex flex-wrap gap-2 w-full md:w-auto">
                    {/* Segnalazione 83: scarica le ore di tutti i collaboratori (solo amministrazione) */}
                    {isAdminOrAbove(user?.role) && (
                        <button
                            type="button"
                            onClick={esportaOre}
                            disabled={exporting}
                            title="Scarica le ore di tutti i collaboratori (si apre con Excel)"
                            className="px-4 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 text-xs font-bold flex items-center gap-2 disabled:opacity-50"
                        >
                            <Download className="w-4 h-4" />
                            {exporting ? "Esporto…" : "Esporta ore"}
                        </button>
                    )}
                    <input
                        type="text"
                        placeholder="Nome..."
                        value={filterPerson}
                        onChange={(e) => setFilterPerson(e.target.value)}
                        className="glass-input !h-9 px-3 text-xs w-full sm:w-32"
                    />
                    <input
                        type="text"
                        placeholder="Negozio..."
                        value={filterStore}
                        onChange={(e) => setFilterStore(e.target.value)}
                        className="glass-input !h-9 px-3 text-xs w-full sm:w-32"
                    />
                    <button
                        onClick={() => { fetchShifts(); onRefresh(); }}
                        className="p-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg transition-colors group"
                    >
                        <Clock className={cn("w-4 h-4 text-slate-400 group-hover:text-indigo-400", loading && "animate-spin")} />
                    </button>
                </div>
            </div>

            {/* Active Badges Grid */}
            <div className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">In Servizio ({filteredActive.length})</p>
                </div>
                {filteredActive.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {filteredActive.map(s => (
                            <div key={s.id} className="glass-panel p-4 flex flex-col gap-3 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-2 opacity-5 mt-1 mr-1">
                                    <Clock className="w-12 h-12" />
                                </div>
                                <div className="flex justify-between items-start relative z-10">
                                    <div className="space-y-0.5">
                                        <p className="text-sm font-bold text-white">{s.employee_name}</p>
                                        <p className="text-[10px] text-slate-500 uppercase tracking-wider">{s.store}</p>
                                    </div>
                                    <span className={cn(
                                        "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter border",
                                        s.pause_started_at
                                            ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                            : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                    )}>
                                        {s.pause_started_at ? "PAUSA" : "LIVE"}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between mt-1 pt-2 border-t border-white/5 relative z-10">
                                    <div className="flex flex-col">
                                        <span className="text-[9px] text-slate-500 uppercase tracking-widest">Inizio</span>
                                        <span className="text-xs font-medium text-slate-300">{formatTime(s.started_at)}</span>
                                    </div>
                                    <div className="flex flex-col text-right">
                                        <span className="text-[9px] text-slate-500 uppercase tracking-widest">Pausa Tot.</span>
                                        <span className="text-xs font-medium text-amber-500/70">{Math.floor(Number(s.total_pause_minutes) || 0)}m</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="bg-white/[0.02] border border-dashed border-white/5 rounded-2xl p-8 flex flex-col items-center justify-center text-center">
                        <Users className="w-8 h-8 text-slate-700 mb-3" />
                        <p className="text-sm text-slate-500">Nessun collaboratore in servizio</p>
                    </div>
                )}
            </div>

            {/* Recent History Table */}
            <div className="space-y-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Storico Recente (Ultimi 50)</p>
                <div className="glass-card overflow-hidden">
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-white/[0.02] border-b border-white/5">
                                    <th className="px-5 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Data</th>
                                    <th className="px-5 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Collaboratore</th>
                                    <th className="px-5 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Negozio</th>
                                    <th className="px-5 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Entrata</th>
                                    <th className="px-5 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Uscita</th>
                                    <th className="px-5 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Totale</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {filteredHistory.map(s => {
                                    const start = new Date(s.started_at).getTime();
                                    const end = s.ended_at ? new Date(s.ended_at).getTime() : 0;
                                    const totalMins = end > 0 ? (end - start) / 60000 - (Number(s.total_pause_minutes) || 0) : 0;

                                    return (
                                        <tr key={s.id} className="hover:bg-white/[0.01] transition-colors group">
                                            <td className="px-5 py-4 text-xs font-medium text-slate-400 capitalize">{formatDateShort(s.started_at)}</td>
                                            <td className="px-5 py-4 text-sm font-bold text-white group-hover:text-indigo-400 transition-colors">{s.employee_name}</td>
                                            <td className="px-5 py-4 text-xs text-slate-500">{s.store}</td>
                                            <td className="px-5 py-4 text-xs text-slate-400 text-center">{formatTime(s.started_at)}</td>
                                            <td className="px-5 py-4 text-xs text-slate-400 text-center">{formatTime(s.ended_at)}</td>
                                            <td className="px-5 py-4 text-sm font-black text-white text-right tracking-tight">
                                                <span className="text-emerald-500/80">{minsToHours(totalMins)}</span>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {filteredHistory.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-5 py-12 text-center text-slate-500 text-sm italic">
                                            Nessun dato storico trovato
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}

type VacationRequest = { id: number; employee_name: string; store: string; date_from: string; date_to: string; reason: string | null; status: string; admin_note: string | null; created_at: string };

function FerieSection({ isAdminLike }: { isAdminLike: boolean }) {
    const { user } = useAuth();
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [reason, setReason] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [requests, setRequests] = useState<VacationRequest[]>([]);
    const [filterPerson, setFilterPerson] = useState("");
    const [filterStore, setFilterStore] = useState("");

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
            status: "pending"
        });
        await fetchRequests();
        setDateFrom("");
        setDateTo("");
        setReason("");
        setSubmitting(false);
    };

    const setStatus = async (id: number, status: "approved" | "rejected") => {
        await supabase.from("vacation_requests").update({ status }).eq("id", id);
        await fetchRequests();
    };

    const inFerieOggi = requests.filter(r => r.status === "approved" && r.date_from <= new Date().toISOString().slice(0, 10) && r.date_to >= new Date().toISOString().slice(0, 10)).length;
    const programmate = requests.filter(r => r.status === "approved" && r.date_from > new Date().toISOString().slice(0, 10)).length;
    const inAttesa = requests.filter(r => r.status === "pending").length;

    const filteredRequests = requests.filter(r =>
        r.employee_name.toLowerCase().includes(filterPerson.toLowerCase()) &&
        r.store.toLowerCase().includes(filterStore.toLowerCase())
    );

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

            <div className={cn("grid grid-cols-1 gap-6", isAdminLike ? "xl:grid-cols-1" : "xl:grid-cols-12")}>
                {/* Form Richiesta */}
                {!isAdminLike && showForm && (
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
                <div className={cn(isAdminLike ? "xl:col-span-1" : showForm ? "xl:col-span-8" : "xl:col-span-12", "space-y-4")}>
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 px-1">
                        <div className="space-y-0.5">
                            <h3 className="text-lg font-bold text-white uppercase tracking-tight">
                                {isAdminLike ? "Registro Richieste Team" : "Le Tue Richieste"}
                            </h3>
                            <p className="text-xs text-slate-500">Monitoraggio e gestione dello stato approvazioni</p>
                        </div>

                        {!isAdminLike && !showForm && (
                            <button
                                onClick={() => setShowForm(true)}
                                className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-indigo-500/25 flex items-center gap-2 active:scale-[0.98]"
                            >
                                <CalendarDays className="w-4 h-4" />
                                Nuova Richiesta
                            </button>
                        )}

                        {isAdminLike && (
                            <div className="flex gap-2 w-full md:w-auto">
                                <input
                                    type="text"
                                    placeholder="Nome..."
                                    value={filterPerson}
                                    onChange={e => setFilterPerson(e.target.value)}
                                    className="glass-input !h-9 px-3 text-xs w-full sm:w-28"
                                />
                                <input
                                    type="text"
                                    placeholder="Negozio..."
                                    value={filterStore}
                                    onChange={e => setFilterStore(e.target.value)}
                                    className="glass-input !h-9 px-3 text-xs w-full sm:w-28"
                                />
                            </div>
                        )}
                    </div>

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
                                                    <span className="text-[10px] text-slate-500">al {formatDate(r.date_to)}</span>
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
                                            </td>
                                            <td className="px-5 py-4 text-right">
                                                {isAdminLike && r.status === "pending" ? (
                                                    <div className="flex justify-end gap-2">
                                                        <button
                                                            onClick={() => setStatus(r.id, "approved")}
                                                            className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/20 rounded-lg transition-colors"
                                                            title="Approva"
                                                        >
                                                            <Clock className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => setStatus(r.id, "rejected")}
                                                            className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/20 rounded-lg transition-colors"
                                                            title="Rifiuta"
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-slate-600 font-medium italic">Gestita</span>
                                                )}
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
                </div>
            </div>
        </div>
    );
}

type SicknessRow = { id: number; employee_name: string; store: string; date_from: string; date_to: string; certificate_number: string | null; created_at: string };

function MalattiaSection() {
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
                                                <span className="text-xs font-black text-rose-500/80">{days}gg</span>
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
                                <select required value={newEmployee} onChange={e => { setNewEmployee(e.target.value); const st = staff.find(x => x.name === e.target.value)?.store; if (st) setNewStore(st); }} className="glass-input !h-10 text-xs w-full">
                                    <option value="">— Seleziona —</option>
                                    {staff.map(x => <option key={x.name} value={x.name}>{x.name}</option>)}
                                </select>
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
    const reportAll = seesAllStores(user?.role) || user?.role === "direttore_commerciale";
    const isStoreMgr = user?.role === "store_manager";
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
    const [myStores, setMyStores] = useState<string[]>([]);
    useEffect(() => {
        if (!user?.id) return;
        (async () => {
            const { data } = await supabase.from("user_stores").select("store_name").eq("user_id", user.id);
            const set = new Set<string>();
            (data ?? []).forEach((r: any) => r.store_name && set.add(r.store_name));
            if (user.negozio) set.add(user.negozio);
            setMyStores([...set]);
        })();
    }, [user?.id, user?.negozio]);

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
                                    <select required value={newEmployee} onChange={(e) => setNewEmployee(e.target.value)} className="glass-input !h-10 text-xs w-full">
                                        <option value="">— Seleziona collaboratore —</option>
                                        {storeStaff.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
                                    </select>
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

