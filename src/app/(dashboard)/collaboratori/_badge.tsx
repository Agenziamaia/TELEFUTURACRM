"use client";

/* BADGE / PRESENZE — spostato da Collaboratori all'hub CALL CENTER
   (/caller?tab=badge, richiesta Luca 28/07). Qui vivono la sezione completa
   (BadgeAndDashboard: timbratura + supervisione presenze) e il WIDGET
   compatto per la vista Caller (stato turno, timer, pausa/stop rapidi).
   Le capacita' restano amministrabili da Permessi (cap:/caller?tab=badge:*,
   chiavi MIGRATE dalla vecchia sezione: mig. 096 — nessun permesso perso). */

import { useState, useEffect, useCallback } from "react";
import { Clock, Users, CalendarDays, Shield, X, MapPin, Play, Pause, Square, History, Search, Store, ArrowUpDown, ChevronUp, ChevronDown, Check, Clock3, Download } from "lucide-react";
import { cn } from "@/utils";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { seesAllStores, seesWholeStore, isAdminOrAbove } from "@/lib/roles";
import { useRolePermissions } from "@/lib/usePermissions";
import { BADGE_SECTION, CAP_BADGE_TIMBRA, CAP_BADGE_TEAM, capAllowed } from "@/lib/capabilities";
import { useVisibleStores } from "@/lib/visibleStores";
import { SelectOpzioni } from "@/components/SelectPersona";

type ShiftRow = { id: number; employee_name: string; store: string; started_at: string; ended_at: string | null; pause_started_at: string | null; total_pause_minutes: number };

export function BadgeAndDashboard({ isAdminLike }: { isAdminLike: boolean }) {
    const { user } = useAuth();
    const [activeShift, setActiveShift] = useState<ShiftRow | null>(null);
        const [todaySeconds, setTodaySeconds] = useState(0);
    const [teamStats, setTeamStats] = useState({ presenti: 0, totalMinutes: 0 });
    const [loading, setLoading] = useState(true);

    // MODALITÀ della sezione dai PERMESSI (capacità cap:/collaboratori?tab=badge:*,
    // amministrabili da Amministrazione → Utenti → Permessi). Default storici:
    // timbra = area call center; supervisione = ruoli manageriali tranne il
    // Back Office/Caller, che timbra come un caller.
    const { perms: capPerms } = useRolePermissions(user?.role);
    const puoTimbrare = capAllowed(user?.role, BADGE_SECTION, CAP_BADGE_TIMBRA, capPerms);
    const vistaTeam = capAllowed(user?.role, BADGE_SECTION, CAP_BADGE_TEAM, capPerms);
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
        if (!vistaTeam) return;
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
    }, [vistaTeam]);

    useEffect(() => {
        (async () => {
            await Promise.all([fetchActiveShift(), fetchTeamStats()]);
            setLoading(false);
        })();
    }, [fetchActiveShift, fetchTeamStats]);

    useEffect(() => {
        if (!activeShift) {
            setTodaySeconds(0);
            return;
        }
        // Il timer contava (e si aggiornava) solo al MINUTO: sembrava fermo.
        // Ora conta i SECONDI e batte ogni secondo (i secondi si mostrano piccoli).
        const compute = () => {
            const start = new Date(activeShift.started_at).getTime() / 1000;
            const now = Date.now() / 1000;
            let pauseSec = (Number(activeShift.total_pause_minutes) || 0) * 60;
            if (activeShift.pause_started_at) pauseSec += (now - new Date(activeShift.pause_started_at).getTime() / 1000);
            setTodaySeconds(Math.max(0, Math.floor(now - start - pauseSec)));
        };
        compute();
        const t = setInterval(compute, 1000);
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
                        {Math.floor(todaySeconds / 3600)}h <span className="text-emerald-400">{String(Math.floor(todaySeconds / 60) % 60).padStart(2, "0")}m</span> <span className="text-sm text-slate-400">{String(todaySeconds % 60).padStart(2, "0")}s</span>
                    </p>
                </div>

                {vistaTeam && (
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
                {/* Badge Action Card — solo call center */}
                {puoTimbrare && <div className="xl:col-span-4 glass-card p-8 flex flex-col items-center text-center relative overflow-hidden group">
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
                                {Math.floor(todaySeconds / 3600).toString().padStart(2, "0")}:
                                {String(Math.floor(todaySeconds / 60) % 60).padStart(2, "0")}
                                <span className="text-2xl text-slate-400 align-baseline">:{String(todaySeconds % 60).padStart(2, "0")}</span>
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
                    {user?.name && <StoricoPersonale nome={user.name} parte="kpi" />}
                </div>}

                {/* Dashboard admin/Team View: senza card timbratura occupa TUTTA la larghezza */}
                <div className={cn(puoTimbrare ? "xl:col-span-8" : "xl:col-span-12", "flex flex-col gap-6 min-w-0")}>
                    {vistaTeam ? (
                        <>
                            <BadgeAdminDashboard onRefresh={async () => { await fetchActiveShift(); await fetchTeamStats(); }} />
                            <PresenzeAdmin />
                        </>
                    ) : puoTimbrare && user?.name ? (
                        <StoricoPersonale nome={user.name} parte="storico" />
                    ) : (
                        <div className="glass-card p-8 h-full flex flex-col items-center justify-center text-center">
                            <Clock className="w-16 h-16 text-slate-700 mb-6" />
                            <h3 className="text-lg font-bold text-slate-300">Timbratura riservata al call center</h3>
                            <p className="text-sm text-slate-500 mt-2 max-w-sm">
                                I ruoli di negozio non usano il badge: per presenze e turni parla col tuo responsabile.
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
        setShifts((activeData || []) as ShiftRow[]);
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchShifts();
    }, [fetchShifts]);

    const activeShifts = shifts.filter(s => !s.ended_at);
    // Chiusura FORZATA di un turno rimasto aperto: solo pack amministrazione.
    const canForce = ["amministrativo", "admin", "dev", "direttore_generale"].includes(user?.role || "");
    const [forceId, setForceId] = useState<number | null>(null);
    const forzaChiusura = async (sh: ShiftRow) => {
        const now = new Date();
        let pause = Number(sh.total_pause_minutes) || 0;
        if (sh.pause_started_at) pause += Math.max(0, (now.getTime() - new Date(sh.pause_started_at).getTime()) / 60000);
        await supabase.from("shifts").update({ ended_at: now.toISOString(), pause_started_at: null, total_pause_minutes: pause }).eq("id", sh.id);
        setForceId(null);
        await fetchShifts();
        onRefresh();
    };

    const filteredActive = activeShifts.filter(s =>
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
                                {canForce && (
                                    <div className="relative z-10">
                                        {forceId === s.id ? (
                                            <div className="flex gap-2">
                                                <button onClick={() => forzaChiusura(s)} className="flex-1 text-[11px] py-1.5 rounded-lg bg-rose-500/20 border border-rose-500/50 text-rose-300 hover:bg-rose-500/30 font-bold">Conferma chiusura</button>
                                                <button onClick={() => setForceId(null)} className="px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-white text-[11px]">✕</button>
                                            </div>
                                        ) : (
                                            <button onClick={() => setForceId(s.id)} title="Chiude il turno adesso (per turni dimenticati aperti)"
                                                className="w-full text-[11px] py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-slate-400 hover:text-rose-300 hover:border-rose-500/40 font-bold transition-colors">
                                                ⛔ Forza chiusura
                                            </button>
                                        )}
                                    </div>
                                )}
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

            {/* Lo storico vive nel pannello Presenze qui sotto (filtri periodo/persona/negozio + export) */}
        </div>
    );
}




function oreNette(s: ShiftRow): number {
    if (!s.ended_at) return 0;
    const ms = new Date(s.ended_at).getTime() - new Date(s.started_at).getTime();
    return Math.max(0, ms / 3600000 - (s.total_pause_minutes || 0) / 60);
}
const fmtOre = (h: number) => `${Math.floor(h)}h ${String(Math.round((h % 1) * 60)).padStart(2, "0")}m`;
// giorni lavorativi = lun–ven, estremi inclusi
function giorniLavorativi(from: Date, to: Date): number {
    let n = 0;
    const d = new Date(from); d.setHours(12, 0, 0, 0);
    const fine = new Date(to); fine.setHours(13, 0, 0, 0);
    while (d <= fine) { const g = d.getDay(); if (g >= 1 && g <= 5) n++; d.setDate(d.getDate() + 1); }
    return n;
}

function KpiBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
    return (
        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/8 border-l-2" style={{ borderLeftColor: color }}>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">{label}</div>
            <div className="text-xl font-bold text-white mt-0.5">{value}</div>
            {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
        </div>
    );
}

function StoricoPersonale({ nome, parte = "tutto" }: { nome: string; parte?: "kpi" | "storico" | "tutto" }) {
    const [rows, setRows] = useState<ShiftRow[]>([]);
    useEffect(() => {
        const inizio = new Date(); inizio.setDate(1); inizio.setHours(0, 0, 0, 0);
        supabase.from("shifts").select("*").eq("employee_name", nome)
            .gte("started_at", inizio.toISOString()).order("started_at", { ascending: false }).limit(200)
            .then(({ data }) => setRows((data ?? []) as ShiftRow[]));
    }, [nome]);
    if (rows.length === 0) {
        // il riquadro storico esiste anche vuoto (spiega cosa arrivera' li')
        if (parte === "storico") return (
            <div className="glass-card p-8 h-full flex flex-col items-center justify-center text-center">
                <Clock className="w-12 h-12 text-slate-700 mb-4" />
                <h3 className="text-base font-bold text-slate-300">Nessuna badgiata questo mese</h3>
                <p className="text-sm text-slate-500 mt-2 max-w-sm">Qui vedrai lo storico delle tue timbrature: entrata, uscita, pause e ore nette.</p>
            </div>
        );
        return null;
    }

    const chiusi = rows.filter((r) => r.ended_at);
    const perGiorno = new Map<string, number>();
    chiusi.forEach((r) => { const g = r.started_at.slice(0, 10); perGiorno.set(g, (perGiorno.get(g) || 0) + oreNette(r)); });
    const oreTot = [...perGiorno.values()].reduce((a, b) => a + b, 0);
    const giorniFatti = perGiorno.size;
    const media = giorniFatti ? oreTot / giorniFatti : 0;
    const oggi = new Date();
    const fineMese = new Date(oggi.getFullYear(), oggi.getMonth() + 1, 0);
    const domani = new Date(oggi); domani.setDate(oggi.getDate() + 1);
    const rimasti = domani <= fineMese ? giorniLavorativi(domani, fineMese) : 0;
    const proiezione = oreTot + media * rimasti;
    let consistenza: number | null = null;
    if (perGiorno.size >= 2 && media > 0) {
        const vals = [...perGiorno.values()];
        const varz = vals.reduce((a, v) => a + (v - media) ** 2, 0) / vals.length;
        consistenza = Math.max(0, Math.min(100, Math.round(100 - (Math.sqrt(varz) / media) * 100)));
    }

    const mese = oggi.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
    const kpiBlock = (
        <div className="grid grid-cols-2 gap-2">
            <KpiBox label="Ore fatte" value={fmtOre(oreTot)} sub={`${giorniFatti} giorni lavorati`} color="#6366f1" />
            <KpiBox label="Media giornaliera" value={fmtOre(media)} color="#0ea5e9" />
            <KpiBox label="Proiezione fine mese" value={fmtOre(proiezione)} sub={`${rimasti} giorni lavorativi rimasti (lun–ven)`} color="#22c55e" />
            <KpiBox label="Consistenza" value={consistenza != null ? `${consistenza}%` : "—"} sub="regolarità delle ore giornaliere" color="#f59e0b" />
        </div>
    );
    const listaBlock = (
        <div className={cn("space-y-1.5 overflow-y-auto pr-1", parte === "storico" ? "max-h-[560px]" : "max-h-64")}>
            {rows.map((r) => (
                <div key={r.id} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-white/[0.03] border border-white/5">
                    <span className="text-slate-300 font-medium w-24 shrink-0">{new Date(r.started_at).toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "2-digit" })}</span>
                    <span className="text-slate-400">{new Date(r.started_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</span>
                    <span className="text-slate-600">→</span>
                    {r.ended_at
                        ? <span className="text-slate-400">{new Date(r.ended_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</span>
                        : <span className="text-emerald-400 font-bold">in corso</span>}
                    {(r.total_pause_minutes || 0) > 0.5 && <span className="text-amber-400/80">⏸ {Math.round(r.total_pause_minutes)}m</span>}
                    <span className="ml-auto font-bold text-slate-200">{r.ended_at ? fmtOre(oreNette(r)) : ""}</span>
                </div>
            ))}
        </div>
    );

    // "kpi" = sotto il tasto Inizia turno; "storico" = riquadro a destra
    if (parte === "kpi") return (
        <div className="glass-card p-5 mt-6 text-left">
            <h3 className="text-sm font-bold text-white mb-3">📊 I tuoi KPI — {mese}</h3>
            {kpiBlock}
        </div>
    );
    if (parte === "storico") return (
        <div className="glass-card p-6 h-full text-left">
            <h3 className="text-sm font-bold text-white mb-3">🗂 Storico badgiate — {mese}</h3>
            {listaBlock}
        </div>
    );
    return (
        <div className="glass-card p-5 mt-6 text-left">
            <h3 className="text-sm font-bold text-white mb-3">📊 Le tue timbrature — {mese}</h3>
            <div className="mb-4">{kpiBlock}</div>
            {listaBlock}
        </div>
    );
}

function PresenzeAdmin() {
    // Cancellare una timbratura dallo storico: SOLO l'admin (regola Luca 25/07).
    const { user } = useAuth();
    const canDeleteShift = ["admin", "dev"].includes(user?.role || "");
    const [delId, setDelId] = useState<number | null>(null);
    const eliminaTimbratura = async (id: number) => {
        await supabase.from("shifts").delete().eq("id", id);
        setDelId(null);
        setRows((prev) => prev.filter((r) => r.id !== id));
    };
    // ── MODIFICA TURNO (Luca 30/07): dall'amministrativo in su si correggono
    // entrata e uscita; le ore nette si ricalcolano da sole (sono derivate).
    // Al salvataggio si sceglie se AVVISARE il caller (messaggio in chat dal
    // profilo di chi corregge) o correggere in silenzio.
    const canEditShift = ["amministrativo", "admin", "dev", "direttore_generale"].includes(user?.role || "");
    const [editShift, setEditShift] = useState<ShiftRow | null>(null);
    const [editEntrata, setEditEntrata] = useState("");
    const [editUscita, setEditUscita] = useState("");
    const [editErr, setEditErr] = useState<string | null>(null);
    const [salvando, setSalvando] = useState(false);
    const toLocalInput = (iso: string) => {
        const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
    };
    const apriModifica = (s: ShiftRow) => {
        setEditShift(s);
        setEditEntrata(toLocalInput(s.started_at));
        setEditUscita(s.ended_at ? toLocalInput(s.ended_at) : "");
        setEditErr(null);
    };
    const salvaModifica = async (avvisa: boolean) => {
        if (!editShift) return;
        const ini = new Date(editEntrata);
        const fine = new Date(editUscita);
        if (isNaN(ini.getTime()) || isNaN(fine.getTime())) { setEditErr("Compila entrata e uscita."); return; }
        if (fine <= ini) { setEditErr("L'uscita deve essere dopo l'entrata."); return; }
        setSalvando(true);
        setEditErr(null);
        const { error } = await supabase.from("shifts")
            .update({ started_at: ini.toISOString(), ended_at: fine.toISOString() })
            .eq("id", editShift.id);
        if (error) { setSalvando(false); setEditErr(error.message); return; }
        const aggiornato: ShiftRow = { ...editShift, started_at: ini.toISOString(), ended_at: fine.toISOString() };
        setRows((prev) => prev.map((r) => r.id === editShift.id ? aggiornato : r));
        if (avvisa && user?.id) {
            // notifica = messaggio in chat: DM amministratore -> caller
            try {
                const { data: dest } = await supabase.from("app_users")
                    .select("id").eq("full_name", editShift.employee_name).eq("active", true).maybeSingle();
                if (!dest?.id) throw new Error(`"${editShift.employee_name}" non trovato tra gli utenti attivi`);
                const { data: convId, error: eDm } = await supabase.rpc("chat_get_or_create_dm", { p_me: user.id, p_other: dest.id });
                if (eDm || !convId) throw new Error(eDm?.message || "conversazione non creata");
                const fmtT = (d: Date) => d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
                const body = `⏱ Il tuo turno di ${ini.toLocaleDateString("it-IT")} è stato corretto dall'amministrazione: entrata ${fmtT(ini)}, uscita ${fmtT(fine)}, ore nette ${fmtOre(oreNette(aggiornato))}.`;
                const { error: eMsg } = await supabase.from("chat_messages")
                    .insert({ conversation_id: convId, sender_id: user.id, body });
                if (eMsg) throw new Error(eMsg.message);
                await supabase.from("chat_conversations").update({ last_message_at: new Date().toISOString() }).eq("id", convId);
            } catch (e) {
                alert("Turno corretto, ma la notifica in chat NON è partita: " + (e instanceof Error ? e.message : String(e)));
            }
        }
        setSalvando(false);
        setEditShift(null);
    };
    const primoDelMese = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; };
    const [da, setDa] = useState(primoDelMese());
    const [a, setA] = useState(() => new Date().toISOString().slice(0, 10));
    // filtro persone MULTIPLO (Luca 29/07): vuoto = tutte; click per
    // aggiungere/togliere più caller contemporaneamente
    const [personeSel, setPersoneSel] = useState<string[]>([]);
    const togPersona = (n: string) => setPersoneSel((p) => p.includes(n) ? p.filter((x) => x !== n) : [...p, n]);
    const [negozio, setNegozio] = useState("");
    const [rows, setRows] = useState<ShiftRow[]>([]);
    const [bench, setBench] = useState<{ label: string; ore: number }[]>([]);

    useEffect(() => {
        if (!da || !a) return;
        supabase.from("shifts").select("*")
            .gte("started_at", da + "T00:00:00").lte("started_at", a + "T23:59:59")
            .not("ended_at", "is", null).order("started_at", { ascending: false }).limit(3000)
            .then(({ data }) => setRows((data ?? []) as ShiftRow[]));
    }, [da, a]);

    // benchmark: ore totali degli ultimi 3 mesi (rispetta il filtro persona)
    useEffect(() => {
        (async () => {
            const out: { label: string; ore: number }[] = [];
            const now = new Date();
            for (let i = 2; i >= 0; i--) {
                const m0 = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const m1 = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
                let q = supabase.from("shifts").select("started_at,ended_at,total_pause_minutes")
                    .gte("started_at", m0.toISOString()).lte("started_at", m1.toISOString())
                    .not("ended_at", "is", null).limit(3000);
                if (personeSel.length) q = q.in("employee_name", personeSel);
                const { data } = await q;
                out.push({ label: m0.toLocaleDateString("it-IT", { month: "short", year: "2-digit" }), ore: ((data ?? []) as ShiftRow[]).reduce((acc, x) => acc + oreNette(x), 0) });
            }
            setBench(out);
        })();
    }, [personeSel.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

    const filtered = rows.filter((r) => (!personeSel.length || personeSel.includes(r.employee_name)) && (!negozio || r.store === negozio));
    const persone = [...new Set(rows.map((r) => r.employee_name))].sort();
    const negozi = [...new Set(rows.map((r) => r.store).filter(Boolean))].sort();
    const oreTot = filtered.reduce((acc, x) => acc + oreNette(x), 0);
    const giorniPresenza = new Set(filtered.map((r) => `${r.employee_name}|${r.started_at.slice(0, 10)}`)).size;
    const personeAttive = new Set(filtered.map((r) => r.employee_name)).size;
    const mediaGiorno = giorniPresenza ? oreTot / giorniPresenza : 0;
    const pauseTot = filtered.reduce((acc, x) => acc + (x.total_pause_minutes || 0), 0);

    const exportCsv = () => {
        const righe = [["Data", "Persona", "Negozio", "Entrata", "Uscita", "Pausa (min)", "Ore nette"].join(";")];
        filtered.forEach((x) => righe.push([
            new Date(x.started_at).toLocaleDateString("it-IT"),
            x.employee_name, x.store || "",
            new Date(x.started_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }),
            x.ended_at ? new Date(x.ended_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "",
            String(Math.round(x.total_pause_minutes || 0)),
            oreNette(x).toFixed(2).replace(".", ","),
        ].join(";")));
        const blob = new Blob(["\uFEFF" + righe.join("\n")], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const el = document.createElement("a");
        el.href = url;
        el.download = `presenze_${da}_${a}${personeSel.length ? "_" + personeSel.map((x) => x.replaceAll(" ", "_")).join("+") : ""}.csv`;
        el.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="glass-card p-6">
            <div className="flex flex-wrap items-end gap-3 mb-4">
                <h3 className="text-base font-bold text-white mr-auto">🗓 Storico presenze</h3>
                <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Dal</label>
                    <input type="date" value={da} onChange={(e) => setDa(e.target.value)} className="glass-input text-xs py-1.5" />
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Al</label>
                    <input type="date" value={a} onChange={(e) => setA(e.target.value)} className="glass-input text-xs py-1.5" />
                </div>
                <div className="max-w-xl">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Persone <span className="normal-case font-normal">(clicca per sommarle; nessuna = tutte)</span></label>
                    <div className="flex flex-wrap gap-1.5">
                        <button type="button" onClick={() => setPersoneSel([])}
                            className={cn("px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all",
                                personeSel.length === 0 ? "border-indigo-400/70 bg-indigo-500/15 text-indigo-200" : "border-white/10 text-slate-400 hover:border-white/25")}>
                            Tutte
                        </button>
                        {persone.map((n) => (
                            <button key={n} type="button" onClick={() => togPersona(n)}
                                className={cn("px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all",
                                    personeSel.includes(n) ? "border-indigo-400/70 bg-indigo-500/20 text-indigo-100" : "border-white/10 text-slate-400 hover:border-white/25")}>
                                {personeSel.includes(n) ? "✓ " : ""}{n}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Negozio</label>
                    <SelectOpzioni value={negozio} onChange={setNegozio} opzioni={negozi} placeholder="Tutti — scrivi per filtrare" className="glass-input text-xs py-1.5" />
                </div>
                <button onClick={exportCsv} disabled={filtered.length === 0}
                    className="h-8 px-4 rounded-lg text-xs font-bold bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-40">
                    ⬇️ Esporta CSV
                </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                <KpiBox label="Ore totali" value={fmtOre(oreTot)} sub={`${filtered.length} timbrature`} color="#6366f1" />
                <KpiBox label="Giorni-presenza" value={String(giorniPresenza)} sub={`${personeAttive} person${personeAttive === 1 ? "a" : "e"}`} color="#0ea5e9" />
                <KpiBox label="Media ore/giorno" value={fmtOre(mediaGiorno)} color="#22c55e" />
                <KpiBox label="Pause totali" value={`${Math.round(pauseTot)}m`} color="#f59e0b" />
            </div>

            {/* benchmark mesi passati */}
            <div className="flex flex-wrap items-center gap-2 mb-4 text-xs">
                <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Benchmark mensile{personeSel.length ? ` · ${personeSel.join(", ")}` : ""}:</span>
                {bench.map((b, i) => (
                    <span key={b.label} className={`px-2.5 py-1 rounded-lg border ${i === bench.length - 1 ? "border-indigo-400/50 bg-indigo-500/15 text-indigo-200 font-bold" : "border-white/10 bg-white/[0.03] text-slate-400"}`}>
                        {b.label}: {fmtOre(b.ore)}
                    </span>
                ))}
            </div>

            <div className="overflow-x-auto max-h-[420px] overflow-y-auto rounded-xl border border-white/8">
                <table className="w-full text-xs">
                    <thead className="bg-white/[0.04] text-slate-400 uppercase text-[10px] sticky top-0">
                        <tr>
                            <th className="px-3 py-2.5 text-left">Data</th>
                            <th className="px-3 py-2.5 text-left">Persona</th>
                            <th className="px-3 py-2.5 text-left">Negozio</th>
                            <th className="px-3 py-2.5 text-right">Entrata</th>
                            <th className="px-3 py-2.5 text-right">Uscita</th>
                            <th className="px-3 py-2.5 text-right">Pausa</th>
                            <th className="px-3 py-2.5 text-right">Ore nette</th>
                            {(canDeleteShift || canEditShift) && <th className="px-3 py-2.5 w-20"></th>}
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 ? (
                            <tr><td colSpan={(canDeleteShift || canEditShift) ? 8 : 7} className="px-3 py-8 text-center text-slate-500">Nessuna presenza nel periodo.</td></tr>
                        ) : filtered.map((x) => (
                            <tr key={x.id} className="border-t border-white/5 text-slate-300">
                                <td className="px-3 py-2">{new Date(x.started_at).toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })}</td>
                                <td className="px-3 py-2 font-medium text-white">{x.employee_name}</td>
                                <td className="px-3 py-2 text-slate-400">{x.store || "—"}</td>
                                <td className="px-3 py-2 text-right">{new Date(x.started_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</td>
                                <td className="px-3 py-2 text-right">{x.ended_at ? new Date(x.ended_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                                <td className="px-3 py-2 text-right text-amber-400/80">{Math.round(x.total_pause_minutes || 0)}m</td>
                                <td className="px-3 py-2 text-right font-bold text-slate-100">{fmtOre(oreNette(x))}</td>
                                {(canDeleteShift || canEditShift) && (
                                    <td className="px-3 py-2 text-right whitespace-nowrap">
                                        {canEditShift && (
                                            <button onClick={() => apriModifica(x)} title="Correggi entrata/uscita del turno"
                                                className="p-1 rounded-md text-slate-600 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors">✏️</button>
                                        )}
                                        {canDeleteShift && (delId === x.id ? (
                                            <span className="inline-flex items-center gap-1">
                                                <button onClick={() => eliminaTimbratura(x.id)} className="text-[10px] px-2 py-1 rounded-md bg-rose-500/20 border border-rose-500/50 text-rose-300 hover:bg-rose-500/30 font-bold">Elimina</button>
                                                <button onClick={() => setDelId(null)} className="text-[10px] px-1.5 py-1 rounded-md text-slate-400 hover:text-white">✕</button>
                                            </span>
                                        ) : (
                                            <button onClick={() => setDelId(x.id)} title="Elimina timbratura (solo admin)"
                                                className="p-1 rounded-md text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 transition-colors">🗑</button>
                                        ))}
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* ── Modale correzione turno ── */}
            {editShift && (
                <div className="fixed inset-0 bg-black/70 z-[1300] flex items-center justify-center p-4"
                    onClick={() => !salvando && setEditShift(null)} role="dialog" aria-modal="true">
                    <div className="w-full max-w-md p-6 rounded-2xl border border-white/10 shadow-2xl bg-[#12141f]" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-base font-bold text-white mb-1">✏️ Correggi turno</h3>
                        <p className="text-xs text-slate-500 mb-5">
                            {editShift.employee_name} — {new Date(editShift.started_at).toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long" })}
                        </p>
                        <div className="space-y-3.5">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Entrata</label>
                                <input type="datetime-local" value={editEntrata} onChange={(e) => setEditEntrata(e.target.value)} className="glass-input w-full text-sm" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Uscita</label>
                                <input type="datetime-local" value={editUscita} onChange={(e) => setEditUscita(e.target.value)} className="glass-input w-full text-sm" />
                            </div>
                            {(() => {
                                const i = new Date(editEntrata), f = new Date(editUscita);
                                const ok = !isNaN(i.getTime()) && !isNaN(f.getTime()) && f > i;
                                const ore = ok ? Math.max(0, (f.getTime() - i.getTime()) / 3600000 - (editShift.total_pause_minutes || 0) / 60) : null;
                                return (
                                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/8 text-sm text-slate-300">
                                        Pausa registrata: <b className="text-amber-300">{Math.round(editShift.total_pause_minutes || 0)}m</b> ·
                                        Ore nette ricalcolate: <b className="text-emerald-300">{ore != null ? fmtOre(ore) : "—"}</b>
                                    </div>
                                );
                            })()}
                            {editErr && <div className="text-rose-400 text-xs">{editErr}</div>}
                        </div>
                        <div className="mt-5 space-y-2">
                            <button onClick={() => salvaModifica(true)} disabled={salvando}
                                className="w-full h-11 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-sm transition-all disabled:opacity-50">
                                💬 Salva e avvisa {editShift.employee_name.split(" ")[0]} in chat
                            </button>
                            <button onClick={() => salvaModifica(false)} disabled={salvando}
                                className="w-full h-11 rounded-xl border border-white/15 text-slate-300 hover:bg-white/5 font-bold text-sm transition-all disabled:opacity-50">
                                Salva senza avvisare
                            </button>
                            <button onClick={() => setEditShift(null)} disabled={salvando}
                                className="w-full h-9 rounded-xl text-slate-500 hover:text-white text-xs transition-colors">
                                Annulla
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}


/** Widget compatto per la vista Caller: stato turno, timer e azioni rapide.
    Si mostra solo a chi ha la capacita' di timbratura (cap timbra). */
export function BadgeWidget() {
    const { user } = useAuth();
    const { perms: capPerms } = useRolePermissions(user?.role);
    const puoTimbrare = capAllowed(user?.role, BADGE_SECTION, CAP_BADGE_TIMBRA, capPerms);
    const [shift, setShift] = useState<ShiftRow | null>(null);
    const [sec, setSec] = useState(0);
    const load = useCallback(async () => {
        if (!user?.name) return;
        const { data } = await supabase.from("shifts").select("*").eq("employee_name", user.name).is("ended_at", null).order("started_at", { ascending: false }).limit(1).maybeSingle();
        setShift((data as ShiftRow) || null);
    }, [user?.name]);
    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        if (!shift) { setSec(0); return; }
        const compute = () => {
            const start = new Date(shift.started_at).getTime() / 1000;
            const now = Date.now() / 1000;
            let pause = (Number(shift.total_pause_minutes) || 0) * 60;
            if (shift.pause_started_at) pause += now - new Date(shift.pause_started_at).getTime() / 1000;
            setSec(Math.max(0, Math.floor(now - start - pause)));
        };
        compute();
        const t = setInterval(compute, 1000);
        return () => clearInterval(t);
    }, [shift]);
    if (!puoTimbrare) return null;
    const status = !shift ? "fermo" : shift.pause_started_at ? "pausa" : "attivo";
    const pad = (n: number) => String(n).padStart(2, "0");
    const hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
    const start = async () => { if (!user?.name) return; const { data } = await supabase.from("shifts").insert({ employee_name: user.name, store: user.negozio ?? "" }).select().single(); if (data) setShift(data as ShiftRow); };
    const pausa = async () => { if (!shift) return; const ts = new Date().toISOString(); await supabase.from("shifts").update({ pause_started_at: ts }).eq("id", shift.id); setShift({ ...shift, pause_started_at: ts }); };
    const riprendi = async () => { if (!shift?.pause_started_at) return; const tot = (Number(shift.total_pause_minutes) || 0) + (Date.now() - new Date(shift.pause_started_at).getTime()) / 60000; await supabase.from("shifts").update({ pause_started_at: null, total_pause_minutes: tot }).eq("id", shift.id); setShift({ ...shift, pause_started_at: null, total_pause_minutes: tot }); };
    const fine = async () => { if (!shift) return; if (!window.confirm("Chiudere il turno?")) return; let tot = Number(shift.total_pause_minutes) || 0; if (shift.pause_started_at) tot += (Date.now() - new Date(shift.pause_started_at).getTime()) / 60000; await supabase.from("shifts").update({ ended_at: new Date().toISOString(), pause_started_at: null, total_pause_minutes: tot }).eq("id", shift.id); setShift(null); };
    const btn = "px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest border transition-colors";
    return (
        <div className="flex items-center gap-3 px-4 py-2 rounded-xl border border-white/10 bg-white/[0.03]">
            <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", status === "attivo" ? "bg-emerald-400 animate-pulse" : status === "pausa" ? "bg-amber-400" : "bg-slate-600")} />
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Badge</span>
            <span className="text-sm font-black text-white tabular-nums">{pad(hh)}:{pad(mm)}<span className="text-[10px] text-slate-500">:{pad(ss)}</span></span>
            <span className={cn("text-[10px] font-bold uppercase tracking-widest", status === "attivo" ? "text-emerald-400" : status === "pausa" ? "text-amber-400" : "text-slate-500")}>
                {status === "attivo" ? "In turno" : status === "pausa" ? "In pausa" : "Fuori turno"}
            </span>
            <span className="flex-1" />
            {status === "fermo" && <button onClick={start} className={cn(btn, "border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10")}>▶ Inizia</button>}
            {status === "attivo" && <button onClick={pausa} className={cn(btn, "border-amber-500/40 text-amber-300 hover:bg-amber-500/10")}>⏸ Pausa</button>}
            {status === "pausa" && <button onClick={riprendi} className={cn(btn, "border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10")}>▶ Riprendi</button>}
            {status !== "fermo" && <button onClick={fine} className={cn(btn, "border-rose-500/40 text-rose-300 hover:bg-rose-500/10")}>■ Fine</button>}
        </div>
    );
}
