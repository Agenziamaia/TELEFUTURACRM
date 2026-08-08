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
import { BADGE_SECTION, CAP_BADGE_TIMBRA, CAP_BADGE_TEAM, CAP_BADGE_CORREGGE, capAllowed } from "@/lib/capabilities";
import { useVisibleStores } from "@/lib/visibleStores";
import { scaricaXlsx, type CellaXlsx } from "@/lib/exportXlsx";
import { caricaTutte } from "@/lib/fetchTutte";
import { SelectOpzioni } from "@/components/SelectPersona";

type EventoTurno = { t: string; tipo: "inizio" | "pausa" | "ripresa" | "fine" | "correzione"; note?: string };
type ShiftRow = { id: number; employee_name: string; store: string; started_at: string; ended_at: string | null; pause_started_at: string | null; total_pause_minutes: number; eventi?: EventoTurno[] | null };

// ── TIMELINE BADGIATURA (Luca 31/07): prima si salvava solo il TOTALE delle
// pause; i singoli passaggi (quando in pausa, quando ha ripreso) andavano
// persi. Ora ogni azione lascia un evento in shifts.eventi (mig. 110) e lo
// storico presenze apre la giornata col dettaglio. I turni precedenti alla
// migrazione mostrano solo entrata/uscita + pausa totale.
const conEvento = (s: ShiftRow, tipo: EventoTurno["tipo"], note?: string): EventoTurno[] =>
    [...(Array.isArray(s.eventi) ? s.eventi : []), { t: new Date().toISOString(), tipo, ...(note ? { note } : {}) }];
async function updateTurnoConEvento(id: number, patch: Record<string, unknown>, eventi: EventoTurno[]) {
    let { error } = await supabase.from("shifts").update({ ...patch, eventi }).eq("id", id);
    // colonna eventi assente (mig. 110 da applicare): il turno si aggiorna comunque
    if (error && /eventi|column/i.test(error.message)) ({ error } = await supabase.from("shifts").update(patch).eq("id", id));
    return error;
}

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
    const { perms: capPerms } = useRolePermissions(user?.role, user?.grade);
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

    // ── QUADRI DIREZIONE (Luca 05/08): per chi NON timbra (amministrativo in
    // su) "Stato attuale"/"Tempo oggi" erano fermi a FUORI TURNO / 0h — inutili.
    // Al loro posto tre quadri live sulla giornata del team: pause, ingressi,
    // turni chiusi. Fotografia di TUTTO il team come i contatori accanto
    // (Presenti ora / Totale ore): NON seguono i filtri dello storico e si
    // rinfrescano da soli ogni minuto.
    const vistaDirezione = vistaTeam && !puoTimbrare;
    const [dirStats, setDirStats] = useState<{
        pause: number; pauseMin: number; inPausaOra: number;
        entrati: number;
        primo: { nome: string; ora: string } | null;
        ultimo: { nome: string; ora: string } | null;
        chiusi: number; mediaOre: number;
    } | null>(null);
    const fetchDirStats = useCallback(async () => {
        if (!vistaDirezione) return;
        const [{ data: turniData }, { count: inPausa }] = await Promise.all([
            supabase.from("shifts").select("*").gte("started_at", ymdLocal(new Date()) + "T00:00:00")
                .order("started_at", { ascending: true }).limit(1000),
            // "in pausa adesso": tutti i turni APERTI (anche dimenticati da ieri),
            // stessa platea del contatore "Presenti ora"
            supabase.from("shifts").select("*", { count: "exact", head: true }).is("ended_at", null).not("pause_started_at", "is", null),
        ]);
        const turni = (turniData ?? []) as ShiftRow[];
        const chiusi = turni.filter((s) => s.ended_at);
        const fmtT = (iso: string) => new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
        const ingresso = (s: ShiftRow) => ({ nome: s.employee_name, ora: fmtT(s.started_at) });
        setDirStats({
            pause: turni.reduce((a, s) => a + contaPause(s), 0),
            pauseMin: Math.round(turni.reduce((a, s) => a + minutiPausa(s), 0)),
            inPausaOra: inPausa || 0,
            entrati: new Set(turni.map((s) => s.employee_name)).size,
            primo: turni.length ? ingresso(turni[0]) : null,
            ultimo: turni.length > 1 ? ingresso(turni[turni.length - 1]) : null,
            chiusi: chiusi.length,
            mediaOre: chiusi.length ? chiusi.reduce((a, s) => a + oreNette(s), 0) / chiusi.length : 0,
        });
    }, [vistaDirezione]);
    useEffect(() => {
        if (!vistaDirezione) return;
        fetchDirStats();
        const t = setInterval(fetchDirStats, 60000);   // live come gli altri quadri
        return () => clearInterval(t);
    }, [vistaDirezione, fetchDirStats]);

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
        const payload: Record<string, unknown> = { employee_name: user.name, store: user.negozio ?? "", eventi: [{ t: new Date().toISOString(), tipo: "inizio" }] };
        let { data, error } = await supabase.from("shifts").insert(payload).select().single();
        if (error && /eventi|column/i.test(error.message)) {
            delete payload.eventi;
            ({ data, error } = await supabase.from("shifts").insert(payload).select().single());
        }
        if (!error && data) setActiveShift(data as ShiftRow);
    };
    const handlePause = async () => {
        if (!activeShift) return;
        const ts = new Date().toISOString();
        const eventi = conEvento(activeShift, "pausa");
        await updateTurnoConEvento(activeShift.id, { pause_started_at: ts }, eventi);
        setActiveShift(prev => prev ? { ...prev, pause_started_at: ts, eventi } : null);
    };
    const handleResume = async () => {
        if (!activeShift?.pause_started_at) return;
        const extra = (Date.now() - new Date(activeShift.pause_started_at).getTime()) / 60000;
        const newTotal = (Number(activeShift.total_pause_minutes) || 0) + extra;
        const eventi = conEvento(activeShift, "ripresa");
        await updateTurnoConEvento(activeShift.id, { pause_started_at: null, total_pause_minutes: newTotal }, eventi);
        setActiveShift(prev => prev ? { ...prev, pause_started_at: null, total_pause_minutes: newTotal, eventi } : null);
    };
    const handleStop = async () => {
        if (!activeShift) return;
        let totalPause = Number(activeShift.total_pause_minutes) || 0;
        if (activeShift.pause_started_at) totalPause += (Date.now() - new Date(activeShift.pause_started_at).getTime()) / 60000;
        await updateTurnoConEvento(activeShift.id, { ended_at: new Date().toISOString(), pause_started_at: null, total_pause_minutes: totalPause }, conEvento(activeShift, "fine"));
        setActiveShift(null);
        await fetchTeamStats();
    };

    // helper JSX dei quadri direzione (funzioni chiamate, non componenti)
    const cardPauseOggi = () => (
        <div className="glass-panel p-5 border-l-4 border-l-amber-500 badge-kpi" title="Pause fatte oggi da tutto il team, minuti compresi (anche la pausa in corso)">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">⏸️ Pause Oggi</p>
            <p className="text-2xl font-black text-white">
                {dirStats ? dirStats.pause : "—"} <span className="text-sm text-amber-400">· {dirStats ? dirStats.pauseMin : 0} min</span>
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
                {!dirStats ? "" : dirStats.inPausaOra > 0 ? `${dirStats.inPausaOra} in pausa adesso` : "nessuno in pausa adesso"}
            </p>
        </div>
    );
    // v2 (Luca 05/08: "non è chiaro"): il numero grande era un ORARIO — ora è
    // una metrica come le altre card: QUANTE persone sono entrate oggi, e
    // sotto primo e ultimo ingresso con nome e ora.
    const cardIngressiOggi = () => (
        <div className="glass-panel p-5 border-l-4 border-l-indigo-500 badge-kpi" title="Quante persone sono entrate oggi, col primo ingresso e l'ultimo arrivato">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">🚪 Ingressi Oggi</p>
            {dirStats?.primo ? (
                <>
                    <p className="text-2xl font-black text-white truncate">
                        {dirStats.entrati} <span className="text-sm font-bold text-indigo-400">{dirStats.entrati === 1 ? "persona entrata" : "persone entrate"}</span>
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1 truncate">
                        {`primo: ${dirStats.primo.nome} · ${dirStats.primo.ora}`}{dirStats.ultimo ? ` — ultimo: ${dirStats.ultimo.nome} · ${dirStats.ultimo.ora}` : ""}
                    </p>
                </>
            ) : (
                <>
                    <p className="text-2xl font-black text-white">0</p>
                    <p className="text-[11px] text-slate-500 mt-1">{dirStats ? "nessun ingresso oggi" : ""}</p>
                </>
            )}
        </div>
    );
    const cardTurniChiusiOggi = () => (
        <div className="glass-panel p-5 border-l-4 border-l-emerald-500 badge-kpi" title="Turni conclusi oggi e media di ore nette per turno chiuso">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">🏁 Turni Chiusi Oggi</p>
            <p className="text-2xl font-black text-white">
                {dirStats ? dirStats.chiusi : "—"} <span className="text-sm text-emerald-400">chius{dirStats?.chiusi === 1 ? "o" : "i"}</span>
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
                {!dirStats ? "" : dirStats.chiusi > 0 ? `media ${fmtOre(dirStats.mediaOre)} a turno` : "nessun turno concluso finora"}
            </p>
        </div>
    );

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Top Stats Bar — personale (Stato/Tempo) per chi timbra; per la
                direzione (vede_team senza timbra) i tre quadri live del team */}
            <div className={cn("grid grid-cols-1 md:grid-cols-2 gap-4", vistaDirezione ? "lg:grid-cols-3 xl:grid-cols-5" : "lg:grid-cols-4")}>
                {vistaDirezione ? (
                    <>
                        {cardPauseOggi()}
                        {cardIngressiOggi()}
                        {cardTurniChiusiOggi()}
                    </>
                ) : (
                    <>
                        <div className="glass-panel p-5 border-l-4 border-l-indigo-500 badge-kpi">
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

                        <div className="glass-panel p-5 border-l-4 border-l-emerald-500 badge-kpi">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Tempo Oggi</p>
                            <p className="text-2xl font-black text-white">
                                {Math.floor(todaySeconds / 3600)}h <span className="text-emerald-400">{String(Math.floor(todaySeconds / 60) % 60).padStart(2, "0")}m</span> <span className="text-sm text-slate-400">{String(todaySeconds % 60).padStart(2, "0")}s</span>
                            </p>
                        </div>
                    </>
                )}

                {vistaTeam && (
                    <>
                        <div className="glass-panel p-5 border-l-4 border-l-sky-500 badge-kpi">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Presenti Ora</p>
                            <p className="text-2xl font-black text-white">{teamStats.presenti}</p>
                        </div>
                        <div className="glass-panel p-5 border-l-4 border-l-violet-500 badge-kpi">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Totale Ore Team</p>
                            <p className="text-2xl font-black text-white">
                                {Math.floor(teamStats.totalMinutes / 60)}h <span className="text-violet-400">{String(teamStats.totalMinutes % 60).padStart(2, "0")}m</span>
                            </p>
                        </div>
                    </>
                )}
            </div>

            {/* IBRIDO (MOD-11, Luca 08/08): chi timbra E supervisiona vede una
                barra di timbratura COMPATTA — stessa logica/stato della card
                grande (nessun doppio stato del turno) — così i pannelli team
                prendono tutta la larghezza. La card grande resta a chi SOLO timbra. */}
            {puoTimbrare && vistaTeam && (
                <div className="glass-panel p-4 flex items-center gap-4 flex-wrap border-l-4 border-l-indigo-500">
                    <div className="flex items-center gap-2">
                        <div className={cn("w-2.5 h-2.5 rounded-full animate-pulse", status === "running" ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : status === "paused" ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" : "bg-slate-600")} />
                        <span className="text-sm font-bold text-white uppercase tracking-tight">{labelStatus}</span>
                    </div>
                    <div className="text-2xl font-black text-white tabular-nums tracking-tighter">
                        {Math.floor(todaySeconds / 3600).toString().padStart(2, "0")}:{String(Math.floor(todaySeconds / 60) % 60).padStart(2, "0")}<span className="text-base text-slate-400">:{String(todaySeconds % 60).padStart(2, "0")}</span>
                    </div>
                    {activeShift?.started_at && <span className="text-[11px] font-bold text-slate-400">Entrata {new Date(activeShift.started_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</span>}
                    <div className="flex items-center gap-2 ml-auto">
                        {canStart && <button onClick={handleStart} disabled={loading} className="h-10 px-4 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs tracking-wide transition-all active:scale-95 disabled:opacity-50">▶ Inizia turno</button>}
                        {canPause && <button onClick={handlePause} className="h-10 px-4 rounded-xl bg-amber-500/20 text-amber-500 border border-amber-500/30 hover:bg-amber-500/30 font-bold text-xs tracking-wide transition-all active:scale-95">⏸ Pausa</button>}
                        {canResume && <button onClick={handleResume} className="h-10 px-4 rounded-xl bg-emerald-500 text-white font-bold text-xs tracking-wide transition-all active:scale-95">▶ Riprendi</button>}
                        {canStop && <button onClick={handleStop} className="h-10 px-4 rounded-xl bg-rose-500 text-white font-bold text-xs tracking-wide transition-all active:scale-95">■ Fine turno</button>}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                {/* Badge Action Card grande — solo chi timbra e NON supervisiona */}
                {puoTimbrare && !vistaTeam && <div className="xl:col-span-4 glass-card p-8 flex flex-col items-center text-center relative overflow-hidden group">
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
                <div className={cn((puoTimbrare && !vistaTeam) ? "xl:col-span-8" : "xl:col-span-12", "flex flex-col gap-6 min-w-0")}>
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
    const { perms: capPerms } = useRolePermissions(user?.role, user?.grade);
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
    // Chiusura FORZATA di un turno rimasto aperto: dalla ROTELLINA (Luca
    // 05/08, cap corregge_turni — default: pack amministrazione, accendibile
    // ad es. al direttore del telefonico dal pannello Permessi).
    const canForce = capAllowed(user?.role, BADGE_SECTION, CAP_BADGE_CORREGGE, capPerms);
    const [forceId, setForceId] = useState<number | null>(null);
    // TIMELINE anche sul turno LIVE (Luca 31/07): click sulla card "In
    // Servizio" → pause fatte finora e quella eventualmente in corso
    const [timelineLive, setTimelineLive] = useState<ShiftRow | null>(null);
    const forzaChiusura = async (sh: ShiftRow) => {
        const now = new Date();
        let pause = Number(sh.total_pause_minutes) || 0;
        if (sh.pause_started_at) pause += Math.max(0, (now.getTime() - new Date(sh.pause_started_at).getTime()) / 60000);
        await updateTurnoConEvento(sh.id, { ended_at: now.toISOString(), pause_started_at: null, total_pause_minutes: pause },
            conEvento(sh, "fine", "chiusura forzata dall'amministrazione"));
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
    // GLB-03: era un CSV "travestito"; ora è un vero .xlsx (celle numeriche).
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
            const dec = (n: number) => Number(n.toFixed(2));   // cella numerica, 2 decimali
            const intestazioni = ["Collaboratore", "Negozio", "Data", "Entrata", "Uscita", "Pausa (min)", "Ore lavorate"];
            const corpo: CellaXlsx[][] = righe.map((s) => [
                s.employee_name, s.store,
                new Date(s.started_at).toLocaleDateString("it-IT"),
                formatTime(s.started_at), formatTime(s.ended_at),
                s.total_pause_minutes || 0, dec(oreDi(s)),
            ]);
            const totali = new Map<string, number>();
            righe.forEach((s) => totali.set(s.employee_name, (totali.get(s.employee_name) || 0) + oreDi(s)));
            const riepilogo: CellaXlsx[][] = [[], ["TOTALE ORE PER COLLABORATORE"],
                ...[...totali.entries()].sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([nome, ore]): CellaXlsx[] => [nome, "", "", "", "", "", dec(ore)])];
            await scaricaXlsx(`ore-collaboratori-${new Date().toISOString().slice(0, 10)}`,
                intestazioni, [...corpo, ...riepilogo], "Ore");
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
                            className="h-9 px-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 text-xs font-bold flex items-center gap-2 disabled:opacity-50"
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
                        className="glass-input !h-9 !rounded-xl px-3 text-xs w-full sm:w-32"
                    />
                    <input
                        type="text"
                        placeholder="Negozio..."
                        value={filterStore}
                        onChange={(e) => setFilterStore(e.target.value)}
                        className="glass-input !h-9 !rounded-xl px-3 text-xs w-full sm:w-32"
                    />
                    <button
                        onClick={() => { fetchShifts(); onRefresh(); }}
                        title="Aggiorna i turni in servizio"
                        className="h-9 w-9 flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors group"
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
                            <div key={s.id}
                                onClick={() => canForce && setTimelineLive(s)}
                                title={canForce ? "Clicca per la timeline live (entrata e pause di oggi)" : undefined}
                                className={cn("glass-panel p-4 flex flex-col gap-3 relative overflow-hidden group badge-emp", s.pause_started_at ? "is-pausa" : "is-live", canForce && "cursor-pointer hover:bg-white/[0.04] transition-colors")}>
                                <div className="absolute top-0 right-0 p-2 opacity-5 mt-1 mr-1">
                                    <Clock className="w-12 h-12" />
                                </div>
                                <div className="flex justify-between items-start relative z-10">
                                    <div className="space-y-0.5">
                                        <p className="text-sm font-bold text-white">{s.employee_name}</p>
                                        <p className="text-[10px] text-slate-500 uppercase tracking-wider">{s.store}</p>
                                    </div>
                                    <span className={cn(
                                        "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter border badge-status",
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
                                    <div className="relative z-10" onClick={(e) => e.stopPropagation()}>
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

            {timelineLive && <TimelineTurnoModal shift={timelineLive} onClose={() => setTimelineLive(null)} />}

            {/* Lo storico vive nel pannello Presenze qui sotto (filtri periodo/persona/negozio + export) */}
        </div>
    );
}




function oreNette(s: Pick<ShiftRow, "started_at" | "ended_at" | "total_pause_minutes">): number {
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

// ── FILTRI RAPIDI dello storico (Luca 05/08): data in formato LOCALE (il
// vecchio toISOString().slice(0,10) è UTC e a cavallo di mezzanotte sballa)
const ymdLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
// preset che compilano Dal/Al con un click; "attivo" = Dal/Al coincidono col preset
const PRESET_PERIODO: { chiave: string; label: string; range: () => { da: string; a: string } }[] = [
    { chiave: "oggi", label: "Oggi", range: () => { const t = ymdLocal(new Date()); return { da: t, a: t }; } },
    { chiave: "ieri", label: "Ieri", range: () => { const d = new Date(); d.setDate(d.getDate() - 1); const t = ymdLocal(d); return { da: t, a: t }; } },
    { chiave: "settimana", label: "Settimana", range: () => { const oggi = new Date(); const lun = new Date(oggi); lun.setDate(oggi.getDate() - ((oggi.getDay() + 6) % 7)); return { da: ymdLocal(lun), a: ymdLocal(oggi) }; } },
    { chiave: "mese", label: "Mese", range: () => { const oggi = new Date(); return { da: ymdLocal(new Date(oggi.getFullYear(), oggi.getMonth(), 1)), a: ymdLocal(oggi) }; } },
    { chiave: "mese-scorso", label: "Mese scorso", range: () => { const oggi = new Date(); return { da: ymdLocal(new Date(oggi.getFullYear(), oggi.getMonth() - 1, 1)), a: ymdLocal(new Date(oggi.getFullYear(), oggi.getMonth(), 0)) }; } },
];
// minuti netti maturati oggi da un turno — anche APERTO: conta fino ad adesso
// scontando la pausa eventualmente in corso (stesso conto del timer personale)
function minutiTurnoOggi(s: ShiftRow): number {
    const inizio = new Date(s.started_at).getTime();
    const fine = s.ended_at ? new Date(s.ended_at).getTime() : Date.now();
    let pausa = Number(s.total_pause_minutes) || 0;
    if (!s.ended_at && s.pause_started_at) pausa += (Date.now() - new Date(s.pause_started_at).getTime()) / 60000;
    return Math.max(0, (fine - inizio) / 60000 - pausa);
}
// ── Quadri direzione: numero di pause di un turno. Con la timeline (mig. 110)
// si contano gli eventi "pausa"; i turni senza eventi si stimano dal totale
// registrato più l'eventuale pausa ancora in corso.
function contaPause(s: ShiftRow): number {
    if (Array.isArray(s.eventi) && s.eventi.length) return s.eventi.filter((e) => e.tipo === "pausa").length;
    return ((Number(s.total_pause_minutes) || 0) > 0.5 ? 1 : 0) + (!s.ended_at && s.pause_started_at ? 1 : 0);
}
// minuti di pausa di un turno, inclusa la pausa eventualmente in corso
function minutiPausa(s: ShiftRow): number {
    let m = Number(s.total_pause_minutes) || 0;
    if (!s.ended_at && s.pause_started_at) m += (Date.now() - new Date(s.pause_started_at).getTime()) / 60000;
    return m;
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
            <KpiBox label="Ore fatte" value={fmtOre(oreTot)} sub={`${giorniFatti} giorni lavorati`} color="var(--tf-6366f1)" />
            <KpiBox label="Media giornaliera" value={fmtOre(media)} color="var(--tf-0ea5e9)" />
            <KpiBox label="Proiezione fine mese" value={fmtOre(proiezione)} sub={`${rimasti} giorni lavorativi rimasti (lun–ven)`} color="var(--tf-22c55e)" />
            <KpiBox label="Consistenza" value={consistenza != null ? `${consistenza}%` : "—"} sub="regolarità delle ore giornaliere" color="var(--tf-f59e0b)" />
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
    const { user } = useAuth();
    const { perms: capPerms } = useRolePermissions(user?.role, user?.grade);
    // Correzione ED eliminazione turni dalla ROTELLINA (Luca 05/08, cap
    // corregge_turni): prima cancellare era solo-admin (25/07) e correggere
    // era codice fisso "amministrativo in su" — ora un interruttore unico.
    const canDeleteShift = capAllowed(user?.role, BADGE_SECTION, CAP_BADGE_CORREGGE, capPerms);
    const [delId, setDelId] = useState<number | null>(null);
    const eliminaTimbratura = async (id: number) => {
        await supabase.from("shifts").delete().eq("id", id);
        setDelId(null);
        setRows((prev) => prev.filter((r) => r.id !== id));
    };
    // ── MODIFICA TURNO (Luca 30/07): si correggono entrata e uscita; le ore
    // nette si ricalcolano da sole (sono derivate). Al salvataggio si sceglie
    // se AVVISARE il caller o correggere in silenzio. Dal 05/08 il permesso
    // sta nella ROTELLINA (cap corregge_turni, default amministrativo in su).
    const canEditShift = capAllowed(user?.role, BADGE_SECTION, CAP_BADGE_CORREGGE, capPerms);
    // TIMELINE della giornata (Luca 31/07): dall'amministrativo in su il click
    // sulla riga apre il dettaglio — entrata, ogni pausa con durata, riprese,
    // uscita. I turni senza eventi (pre-mig. 110) mostrano il riepilogo.
    const [timelineShift, setTimelineShift] = useState<ShiftRow | null>(null);
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
        const error = await updateTurnoConEvento(editShift.id,
            { started_at: ini.toISOString(), ended_at: fine.toISOString() },
            conEvento(editShift, "correzione", `entrata/uscita corrette da ${user?.name || "amministrazione"}`));
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
    const [a, setA] = useState(() => ymdLocal(new Date()));
    // filtro persone MULTIPLO (Luca 29/07): vuoto = tutte; click per
    // aggiungere/togliere più caller contemporaneamente
    const [personeSel, setPersoneSel] = useState<string[]>([]);
    const togPersona = (n: string) => setPersoneSel((p) => p.includes(n) ? p.filter((x) => x !== n) : [...p, n]);
    const [negozio, setNegozio] = useState("");
    const [rows, setRows] = useState<ShiftRow[]>([]);
    const [bench, setBench] = useState<{ label: string; ore: number }[]>([]);

    useEffect(() => {
        if (!da || !a) return;
        let vivo = true;
        // Cap PostgREST (max-rows 1000): il vecchio .limit(3000) veniva TRONCATO
        // in silenzio sui periodi lunghi — ora si pagina con caricaTutte.
        caricaTutte<ShiftRow>((from, to) => supabase.from("shifts").select("*")
            .gte("started_at", da + "T00:00:00").lte("started_at", a + "T23:59:59")
            .not("ended_at", "is", null)
            .order("started_at", { ascending: false }).order("id", { ascending: false })
            .range(from, to))
            .then(({ data }) => { if (vivo) setRows(data); });
        return () => { vivo = false; };
    }, [da, a]);

    // ── "Ore fatte oggi" (Luca 05/08): turni di OGGI, anche quelli ancora
    // aperti — segue i filtri persone/negozio e si rinfresca da solo ogni minuto
    const [turniOggi, setTurniOggi] = useState<ShiftRow[]>([]);
    useEffect(() => {
        const carica = () => {
            supabase.from("shifts").select("*").gte("started_at", ymdLocal(new Date()) + "T00:00:00")
                .order("started_at", { ascending: false }).limit(1000)
                .then(({ data }) => setTurniOggi((data ?? []) as ShiftRow[]));
        };
        carica();
        const t = setInterval(carica, 60000);
        return () => clearInterval(t);
    }, []);

    // benchmark: ore totali degli ultimi 3 mesi (rispetta il filtro persona)
    useEffect(() => {
        (async () => {
            const out: { label: string; ore: number }[] = [];
            const now = new Date();
            for (let i = 2; i >= 0; i--) {
                const m0 = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const m1 = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
                // anche qui niente .limit(3000): oltre le 1000 righe il server tronca muto
                const { data } = await caricaTutte<Pick<ShiftRow, "started_at" | "ended_at" | "total_pause_minutes">>((from, to) => {
                    let q = supabase.from("shifts").select("started_at,ended_at,total_pause_minutes")
                        .gte("started_at", m0.toISOString()).lte("started_at", m1.toISOString())
                        .not("ended_at", "is", null).order("started_at").order("id");
                    if (personeSel.length) q = q.in("employee_name", personeSel);
                    return q.range(from, to);
                });
                out.push({ label: m0.toLocaleDateString("it-IT", { month: "short", year: "2-digit" }), ore: data.reduce((acc, x) => acc + oreNette(x), 0) });
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
    // "Ore fatte oggi": stessi filtri persone/negozio dello storico
    const oggiFiltrati = turniOggi.filter((s) => (!personeSel.length || personeSel.includes(s.employee_name)) && (!negozio || s.store === negozio));
    const oreOggi = oggiFiltrati.reduce((acc, s) => acc + minutiTurnoOggi(s), 0) / 60;
    const inTurnoOra = oggiFiltrati.filter((s) => !s.ended_at).length;

    // GLB-03: da CSV a vero .xlsx \u2014 pausa e ore nette come celle numeriche.
    const esportaExcel = async () => {
        const intestazioni = ["Data", "Persona", "Negozio", "Entrata", "Uscita", "Pausa (min)", "Ore nette"];
        const righe: CellaXlsx[][] = filtered.map((x) => [
            new Date(x.started_at).toLocaleDateString("it-IT"),
            x.employee_name, x.store || "",
            new Date(x.started_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }),
            x.ended_at ? new Date(x.ended_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "",
            Math.round(x.total_pause_minutes || 0),
            Number(oreNette(x).toFixed(2)),
        ]);
        await scaricaXlsx(`presenze_${da}_${a}${personeSel.length ? "_" + personeSel.map((x) => x.replaceAll(" ", "_")).join("+") : ""}`,
            intestazioni, righe, "Presenze");
    };

    return (
        <div className="glass-card p-6">
            {/* ── Testata + export (restyle Luca 05/08: "un po' retro, filtri sfasati") ── */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                        <History className="w-4 h-4 text-indigo-400" />
                        Storico presenze
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">Totali, benchmark ed export seguono i filtri qui sotto.</p>
                </div>
                <button onClick={esportaExcel} disabled={filtered.length === 0}
                    className="h-9 px-4 rounded-xl text-xs font-bold bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-40 flex items-center gap-1.5 transition-colors">
                    <Download className="w-3.5 h-3.5" />
                    Esporta Excel
                </button>
            </div>

            {/* ── Barra filtri allineata: preset rapidi + periodo + negozio, tutti h-9 / rounded-xl / text-xs ── */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
                <div className="flex items-center gap-0.5 h-9 px-1 rounded-xl bg-white/[0.03] border border-white/10">
                    {PRESET_PERIODO.map((p) => {
                        const r = p.range();
                        const attivo = da === r.da && a === r.a;
                        return (
                            <button key={p.chiave} type="button" onClick={() => { setDa(r.da); setA(r.a); }}
                                className={cn("h-7 px-2.5 rounded-lg text-[11px] font-bold transition-colors",
                                    attivo ? "bg-indigo-500/25 text-indigo-100 ring-1 ring-inset ring-indigo-400/50" : "text-slate-400 hover:text-white hover:bg-white/[0.06]")}>
                                {p.label}
                            </button>
                        );
                    })}
                </div>
                <div className="flex items-center gap-1.5 h-9 px-2.5 rounded-xl bg-white/[0.03] border border-white/10 focus-within:border-indigo-400/60 transition-colors" title="Periodo dello storico (Dal → Al)">
                    <CalendarDays className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <input type="date" value={da} onChange={(e) => setDa(e.target.value)} aria-label="Dal"
                        className="h-7 bg-transparent border-0 p-0 text-xs text-slate-200 outline-none w-[6.8rem]" />
                    <span className="text-slate-600 text-xs">→</span>
                    <input type="date" value={a} onChange={(e) => setA(e.target.value)} aria-label="Al"
                        className="h-7 bg-transparent border-0 p-0 text-xs text-slate-200 outline-none w-[6.8rem]" />
                </div>
                <div className="flex items-center h-9 pl-2.5 rounded-xl bg-white/[0.03] border border-white/10 focus-within:border-indigo-400/60 transition-colors" title="Filtra per negozio">
                    <Store className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <SelectOpzioni value={negozio} onChange={setNegozio} opzioni={negozi} placeholder="Tutti i negozi"
                        className="h-8 w-40 bg-transparent border-0 outline-none text-xs text-slate-200 pl-1.5 pr-6" />
                </div>
                {(personeSel.length > 0 || negozio) && (
                    <button type="button" onClick={() => { setPersoneSel([]); setNegozio(""); }}
                        className="h-9 px-3 rounded-xl text-[11px] font-bold border border-white/10 bg-white/[0.03] text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors">
                        ✕ Azzera filtri
                    </button>
                )}
            </div>

            {/* ── Persone: chip multi-selezione (clic per sommarle; nessuna = tutte) ── */}
            <div className="flex flex-wrap items-center gap-1.5 mb-4">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mr-1 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" /> Persone
                </span>
                <button type="button" onClick={() => setPersoneSel([])}
                    className={cn("h-7 px-3 rounded-full text-[11px] font-bold border transition-all",
                        personeSel.length === 0 ? "border-indigo-400/70 bg-indigo-500/15 text-indigo-200" : "border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/25")}>
                    Tutte
                </button>
                {persone.map((n) => (
                    <button key={n} type="button" onClick={() => togPersona(n)}
                        className={cn("h-7 px-3 rounded-full text-[11px] font-bold border transition-all",
                            personeSel.includes(n) ? "border-indigo-400/70 bg-indigo-500/20 text-indigo-100" : "border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/25")}>
                        {personeSel.includes(n) ? "✓ " : ""}{n}
                    </button>
                ))}
                <span className="text-[10px] text-slate-600">clicca più nomi per sommarli</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2 mb-3">
                {/* "Ore fatte oggi" in evidenza: segue persone/negozio e include i turni ancora aperti */}
                <div className="p-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10">
                    <div className="text-[10px] uppercase tracking-wider font-bold text-emerald-300 flex items-center gap-1.5">
                        {inTurnoOra > 0 && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                        Ore fatte oggi
                    </div>
                    <div className="text-xl font-bold text-white mt-0.5">{fmtOre(oreOggi)}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                        {inTurnoOra > 0 ? `${inTurnoOra} in turno adesso` : oggiFiltrati.length > 0 ? `${oggiFiltrati.length} timbratur${oggiFiltrati.length === 1 ? "a" : "e"} oggi` : "nessuna timbratura oggi"}
                    </div>
                </div>
                <KpiBox label="Ore nel periodo" value={fmtOre(oreTot)} sub={`${filtered.length} timbrature`} color="var(--tf-6366f1)" />
                <KpiBox label="Giorni-presenza" value={String(giorniPresenza)} sub={`${personeAttive} person${personeAttive === 1 ? "a" : "e"}`} color="var(--tf-0ea5e9)" />
                <KpiBox label="Media ore/giorno" value={fmtOre(mediaGiorno)} color="var(--tf-22c55e)" />
                <KpiBox label="Pause totali" value={`${Math.round(pauseTot)}m`} color="var(--tf-f59e0b)" />
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
                            <tr key={x.id}
                                onClick={() => canEditShift && setTimelineShift(x)}
                                title={canEditShift ? "Clicca per la timeline della giornata (entrata, pause, uscita)" : undefined}
                                className={cn("border-t border-white/5 text-slate-300", canEditShift && "cursor-pointer hover:bg-white/[0.04] transition-colors")}>
                                <td className="px-3 py-2">{new Date(x.started_at).toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })}</td>
                                <td className="px-3 py-2 font-medium text-white">{x.employee_name}</td>
                                <td className="px-3 py-2 text-slate-400">{x.store || "—"}</td>
                                <td className="px-3 py-2 text-right">{new Date(x.started_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</td>
                                <td className="px-3 py-2 text-right">{x.ended_at ? new Date(x.ended_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                                <td className="px-3 py-2 text-right text-amber-400/80">{Math.round(x.total_pause_minutes || 0)}m</td>
                                <td className="px-3 py-2 text-right font-bold text-slate-100">{fmtOre(oreNette(x))}</td>
                                {(canDeleteShift || canEditShift) && (
                                    <td className="px-3 py-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
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

            {/* ── Modale TIMELINE della giornata (Luca 31/07) ── */}
            {timelineShift && <TimelineTurnoModal shift={timelineShift} onClose={() => setTimelineShift(null)} />}
        </div>
    );
}

// ── TIMELINE di un turno (Luca 31/07): usata dallo storico presenze E dalle
// card "In Servizio" — sul turno LIVE mostra le pause fatte finora e quella
// eventualmente in corso. Turni senza eventi: riepilogo entrata/pausa/uscita.
function TimelineTurnoModal({ shift, onClose }: { shift: ShiftRow; onClose: () => void }) {
    const s = shift;
    const fmtT = (iso: string) => new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    const evs = Array.isArray(s.eventi) && s.eventi.length
        ? [...s.eventi].sort((a, b) => a.t.localeCompare(b.t)) : null;
    const durataMin = (daIso: string, aIso: string | null) =>
        Math.max(0, Math.round(((aIso ? new Date(aIso).getTime() : Date.now()) - new Date(daIso).getTime()) / 60000));
    const STILE: Record<EventoTurno["tipo"], { icona: string; label: string; cls: string }> = {
        inizio: { icona: "▶", label: "Entrata", cls: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10" },
        pausa: { icona: "⏸", label: "In pausa", cls: "text-amber-300 border-amber-500/40 bg-amber-500/10" },
        ripresa: { icona: "▶", label: "Ripresa", cls: "text-sky-300 border-sky-500/40 bg-sky-500/10" },
        fine: { icona: "■", label: "Fine turno", cls: "text-rose-300 border-rose-500/40 bg-rose-500/10" },
        correzione: { icona: "✏️", label: "Correzione", cls: "text-slate-300 border-white/20 bg-white/[0.04]" },
    };
    return (
        <div className="fixed inset-0 bg-black/70 z-[1300] flex items-center justify-center p-4"
            onClick={onClose} role="dialog" aria-modal="true">
            <div className="w-full max-w-md p-6 rounded-2xl border border-white/10 shadow-2xl bg-[#12141f] max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between mb-1">
                    <h3 className="text-base font-bold text-white">🕐 Timeline badgiatura{!s.ended_at && <span className="ml-2 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 align-middle">live</span>}</h3>
                    <button onClick={onClose} className="text-slate-500 hover:text-white text-sm">✕</button>
                </div>
                            <p className="text-xs text-slate-500 mb-4">
                                {s.employee_name}{s.store ? ` · ${s.store}` : ""} — {new Date(s.started_at).toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
                            </p>
                            {evs ? (
                                <div className="space-y-0">
                                    {evs.map((ev, i) => {
                                        const st = STILE[ev.tipo] || STILE.correzione;
                                        // durata pausa: dall'evento "pausa" al successivo ripresa/fine
                                        const fineP = ev.tipo === "pausa" ? (evs.slice(i + 1).find((x) => x.tipo === "ripresa" || x.tipo === "fine")?.t ?? null) : null;
                                        return (
                                            <div key={i} className="flex gap-3">
                                                <div className="flex flex-col items-center">
                                                    <span className={cn("w-7 h-7 rounded-full border flex items-center justify-center text-xs shrink-0", st.cls)}>{st.icona}</span>
                                                    {i < evs.length - 1 && <span className="w-px flex-1 min-h-[14px] bg-white/10" />}
                                                </div>
                                                <div className="pb-3.5 text-sm">
                                                    <span className="font-bold text-white tabular-nums">{fmtT(ev.t)}</span>
                                                    <span className="text-slate-300 ml-2">{st.label}</span>
                                                    {ev.tipo === "pausa" && (
                                                        <span className="text-amber-400/90 ml-2 text-xs font-bold">
                                                            {fineP ? `${durataMin(ev.t, fineP)} min di pausa` : `in pausa da ${durataMin(ev.t, null)} min`}
                                                        </span>
                                                    )}
                                                    {ev.note && <div className="text-[11px] text-slate-500 mt-0.5">{ev.note}</div>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="space-y-2 text-sm">
                                    <div className="flex items-center gap-2"><span className="text-emerald-300">▶</span><b className="text-white">{fmtT(s.started_at)}</b><span className="text-slate-300">Entrata</span></div>
                                    {(s.total_pause_minutes || 0) > 0.5 && (
                                        <div className="flex items-center gap-2"><span className="text-amber-300">⏸</span><span className="text-slate-300">Pause totali: <b className="text-amber-300">{Math.round(s.total_pause_minutes)} min</b></span></div>
                                    )}
                                    {s.ended_at
                                        ? <div className="flex items-center gap-2"><span className="text-rose-300">■</span><b className="text-white">{fmtT(s.ended_at)}</b><span className="text-slate-300">Fine turno</span></div>
                                        : <div className="text-emerald-400 font-bold text-xs">Turno ancora in corso</div>}
                                </div>
                            )}
                            <div className="mt-4 p-3 rounded-xl bg-white/[0.03] border border-white/8 text-xs text-slate-300 flex flex-wrap gap-x-4 gap-y-1">
                                <span>Pausa totale: <b className="text-amber-300">{Math.round(s.total_pause_minutes || 0)}m</b></span>
                                {s.ended_at && <span>Ore nette: <b className="text-emerald-300">{fmtOre(oreNette(s))}</b></span>}
                            </div>
        </div>
    </div>
    );
}


/** Widget compatto per la vista Caller: stato turno, timer e azioni rapide.
    Si mostra solo a chi ha la capacita' di timbratura (cap timbra). */
export function BadgeWidget() {
    const { user } = useAuth();
    const { perms: capPerms } = useRolePermissions(user?.role, user?.grade);
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
    const start = async () => {
        if (!user?.name) return;
        const payload: Record<string, unknown> = { employee_name: user.name, store: user.negozio ?? "", eventi: [{ t: new Date().toISOString(), tipo: "inizio" }] };
        let { data, error } = await supabase.from("shifts").insert(payload).select().single();
        if (error && /eventi|column/i.test(error.message)) { delete payload.eventi; ({ data } = await supabase.from("shifts").insert(payload).select().single()); }
        if (data) setShift(data as ShiftRow);
    };
    const pausa = async () => { if (!shift) return; const ts = new Date().toISOString(); const eventi = conEvento(shift, "pausa"); await updateTurnoConEvento(shift.id, { pause_started_at: ts }, eventi); setShift({ ...shift, pause_started_at: ts, eventi }); };
    const riprendi = async () => { if (!shift?.pause_started_at) return; const tot = (Number(shift.total_pause_minutes) || 0) + (Date.now() - new Date(shift.pause_started_at).getTime()) / 60000; const eventi = conEvento(shift, "ripresa"); await updateTurnoConEvento(shift.id, { pause_started_at: null, total_pause_minutes: tot }, eventi); setShift({ ...shift, pause_started_at: null, total_pause_minutes: tot, eventi }); };
    const fine = async () => { if (!shift) return; if (!window.confirm("Chiudere il turno?")) return; let tot = Number(shift.total_pause_minutes) || 0; if (shift.pause_started_at) tot += (Date.now() - new Date(shift.pause_started_at).getTime()) / 60000; await updateTurnoConEvento(shift.id, { ended_at: new Date().toISOString(), pause_started_at: null, total_pause_minutes: tot }, conEvento(shift, "fine")); setShift(null); };
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
