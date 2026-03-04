"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, X, Phone, MapPin, User, Clock, Search } from "lucide-react";
import { cn } from "@/utils";
import { useAuth } from "@/context/AuthContext";

// Mock appointment data — will be replaced with Supabase queries
type AppointmentType = "incoming" | "outgoing" | "self_generated";
type AppointmentStatus = "scheduled" | "attivato" | "ko" | "in_gestione" | "da_richiamare" | "da_rifissare" | "annullato";

interface Appointment {
    id: number;
    date: string; // "YYYY-MM-DD"
    time: string;
    type: AppointmentType;
    agente: string;
    store?: string;
    customerAddress?: string;
    customerName: string;
    customerPhone: string;
    cfPiva?: string;
    notes: string;
    esitoNote?: string;
    status: AppointmentStatus;
}

const MOCK_AGENTS = ["Luca Perotta", "Alessandro Sandri", "Marco Bianchi", "Giulia Rossi", "Venditore 1"];
const MOCK_STORES = ["Roma Centro (RM001)", "Roma Est (RM002)", "Milano Centrale (MI001)", "Milano Nord (MI002)", "Napoli Centro (NA001)"];

const MOCK_APPOINTMENTS: Appointment[] = [
    { id: 1, date: "2026-03-03", time: "10:00", type: "outgoing", agente: "Luca Perotta", customerAddress: "Via Roma 12, Roma", customerName: "Mario Rossi", customerPhone: "3331234567", cfPiva: "RSSMRA80A01H501U", notes: "Cliente interessato a Vodafone fibra", status: "scheduled" },
    { id: 2, date: "2026-03-03", time: "14:30", type: "incoming", agente: "Alessandro Sandri", store: "Roma Centro (RM001)", customerName: "Anna Verdi", customerPhone: "3457654321", notes: "Rinnovo contratto Wind3", status: "attivato" },
    { id: 3, date: "2026-03-05", time: "09:00", type: "incoming", agente: "Marco Bianchi", store: "Milano Centrale (MI001)", customerName: "Giuseppe Ferrari", customerPhone: "3289876543", notes: "", status: "scheduled" },
    { id: 4, date: "2026-03-10", time: "11:00", type: "outgoing", agente: "Giulia Rossi", customerAddress: "Corso Buenos Aires 5, Milano", customerName: "Francesca Bruno", customerPhone: "3401122334", notes: "Nuovo cliente energia", status: "scheduled" },
    { id: 5, date: "2026-03-10", time: "15:00", type: "incoming", agente: "Luca Perotta", store: "Roma Est (RM002)", customerName: "Carlo Neri", customerPhone: "3609988776", notes: "Assicurazione Generali", status: "da_richiamare" },
    { id: 6, date: "2026-03-17", time: "10:30", type: "outgoing", agente: "Venditore 1", customerAddress: "Via Napoli 88, Napoli", customerName: "Lucia Esposito", customerPhone: "3211234567", notes: "", status: "scheduled" },
];

const STATUS_COLORS: Record<AppointmentStatus, string> = {
    scheduled: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    attivato: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    ko: "bg-rose-500/20 text-rose-300 border-rose-500/30",
    in_gestione: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    da_richiamare: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    da_rifissare: "bg-amber-100/10 text-amber-200 border-amber-200/30",
    annullato: "bg-orange-500/20 text-orange-300 border-orange-500/30",
};

const STATUS_LABELS: Record<AppointmentStatus, string> = {
    scheduled: "Programmato",
    attivato: "Attivato",
    ko: "KO",
    in_gestione: "In Gestione",
    da_richiamare: "Da Richiamare",
    da_rifissare: "Da Rifissare",
    annullato: "Annullato",
};

const DAYS_IT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const MONTHS_IT = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

function getDaysInMonth(year: number, month: number) {
    return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
    // Monday = 0
    const day = new Date(year, month, 1).getDay();
    return (day + 6) % 7;
}

export default function Calendario() {
    const { user } = useAuth();
    const today = new Date();
    const [viewYear, setViewYear] = useState(today.getFullYear());
    const [viewMonth, setViewMonth] = useState(today.getMonth());
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [appointments, setAppointments] = useState<Appointment[]>(MOCK_APPOINTMENTS);

    // New appointment form state
    const [newAppt, setNewAppt] = useState({
        time: "10:00",
        type: "incoming" as AppointmentType,
        agente: "",
        store: "",
        customerAddress: "",
        customerName: "",
        customerPhone: "",
        cfPiva: "",
        notes: "",
    });

    const prevMonth = () => {
        if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
        else setViewMonth(m => m - 1);
    };
    const nextMonth = () => {
        if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
        else setViewMonth(m => m + 1);
    };

    const daysInMonth = getDaysInMonth(viewYear, viewMonth);
    const firstDay = getFirstDayOfMonth(viewYear, viewMonth);

    // Role-based visibility filter
    const visibleAppointments = appointments.filter(a => {
        if (user?.role === "admin") return true;
        // agente sees only own appointments
        return a.agente === user?.name;
    });

    const apptsByDate = (dateStr: string) =>
        visibleAppointments.filter(a => a.date === dateStr);

    const handleDayClick = (day: number) => {
        const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        setSelectedDate(dateStr);
        setShowCreateModal(false);
        setSelectedAppointment(null);
    };

    const handleCreateSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedDate) return;
        const newId = Math.max(...appointments.map(a => a.id)) + 1;
        const created: Appointment = {
            id: newId,
            date: selectedDate,
            ...newAppt,
            status: "scheduled",
            store: newAppt.type === "incoming" ? newAppt.store : undefined,
            customerAddress: newAppt.type === "outgoing" ? newAppt.customerAddress : undefined,
        };
        setAppointments(prev => [...prev, created]);
        setShowCreateModal(false);
        setNewAppt({ time: "10:00", type: "incoming", agente: "", store: "", customerAddress: "", customerName: "", customerPhone: "", cfPiva: "", notes: "" });
    };

    const dateAppts = selectedDate ? apptsByDate(selectedDate) : [];
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    const isCallCenter = user?.role === "admin"; // admin = call center operator
    const isAgent = user?.role !== "admin";

    // When agent opens create modal, auto-preset to self_generated
    const openCreateModal = () => {
        if (isAgent) {
            setNewAppt(p => ({ ...p, type: "self_generated" as AppointmentType, agente: user?.name ?? "" }));
        }
        setShowCreateModal(true);
    };

    return (
        <div className="w-full">
            <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-white mb-2">Calendario Appuntamenti</h2>
                    <p className="text-slate-400">
                        {isCallCenter ? "Visualizzazione completa — tutti gli agenti" : `I tuoi appuntamenti — ${user?.name}`}
                    </p>
                </div>
                {selectedDate && (
                    <button
                        onClick={openCreateModal}
                        className="primary-btn h-10 px-5 flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        Nuovo appuntamento
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Calendar Grid */}
                <div className="lg:col-span-2 glass-card p-6">
                    {/* Month navigation */}
                    <div className="flex items-center justify-between mb-6">
                        <button onClick={prevMonth} className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-slate-300">
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <h3 className="text-xl font-bold text-white">
                            {MONTHS_IT[viewMonth]} {viewYear}
                        </h3>
                        <button onClick={nextMonth} className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-slate-300">
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Day headers */}
                    <div className="grid grid-cols-7 mb-2">
                        {DAYS_IT.map(d => (
                            <div key={d} className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wider py-2">
                                {d}
                            </div>
                        ))}
                    </div>

                    {/* Day cells */}
                    <div className="grid grid-cols-7 gap-1">
                        {/* Empty cells before first day */}
                        {Array.from({ length: firstDay }).map((_, i) => (
                            <div key={`empty-${i}`} />
                        ))}
                        {Array.from({ length: daysInMonth }).map((_, i) => {
                            const day = i + 1;
                            const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                            const dayAppts = apptsByDate(dateStr);
                            const isToday = dateStr === todayStr;
                            const isSelected = dateStr === selectedDate;

                            return (
                                <button
                                    key={day}
                                    onClick={() => handleDayClick(day)}
                                    className={cn(
                                        "relative aspect-square rounded-xl flex flex-col items-center justify-start pt-2 pb-1 px-1 transition-all group",
                                        isSelected ? "bg-indigo-500/25 border border-indigo-500/50" :
                                            isToday ? "bg-white/[0.05] border border-white/15" :
                                                "hover:bg-white/[0.04] border border-transparent"
                                    )}
                                >
                                    <span className={cn(
                                        "text-sm font-medium",
                                        isToday ? "text-indigo-400 font-bold" :
                                            isSelected ? "text-white" : "text-slate-300"
                                    )}>
                                        {day}
                                    </span>
                                    {dayAppts.length > 0 && (
                                        <div className="flex flex-wrap gap-0.5 mt-1 justify-center">
                                            {dayAppts.slice(0, 3).map(a => (
                                                <div key={a.id}
                                                    className={cn("w-1.5 h-1.5 rounded-full",
                                                        a.type === "incoming" ? "bg-blue-400" :
                                                            a.type === "self_generated" ? "bg-purple-400" :
                                                                "bg-amber-400"
                                                    )}
                                                />
                                            ))}
                                            {dayAppts.length > 3 && (
                                                <span className="text-[9px] text-slate-400">+{dayAppts.length - 3}</span>
                                            )}
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Legend */}
                    <div className="mt-4 pt-4 border-t border-white/8 flex gap-5 text-xs text-slate-500">
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400" />Inbound</span>
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" />Outbound</span>
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-purple-400" />Auto-Generato</span>
                    </div>
                </div>

                {/* Side panel */}
                <div className="glass-card p-5 flex flex-col">
                    {selectedDate ? (
                        <>
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="font-semibold text-white text-base">
                                    {new Date(selectedDate + "T12:00:00").toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
                                </h4>
                                {(isCallCenter || isAgent) && (
                                    <button
                                        onClick={openCreateModal}
                                        className="p-1.5 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/30 transition-colors"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </button>
                                )}
                            </div>

                            {dateAppts.length === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-2">
                                    <p className="text-sm">Nessun appuntamento</p>
                                    {isCallCenter && (
                                        <button onClick={() => setShowCreateModal(true)} className="text-xs text-indigo-400 hover:text-indigo-300">
                                            + Aggiungi appuntamento
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-3 flex-1 overflow-y-auto">
                                    {dateAppts.map(a => (
                                        <button
                                            key={a.id}
                                            onClick={() => { setSelectedAppointment(a); setShowModal(true); }}
                                            className="w-full text-left p-3 rounded-xl bg-white/[0.03] border border-white/8 hover:bg-white/[0.06] transition-all"
                                        >
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-sm font-semibold text-white">{a.time} — {a.customerName}</span>
                                                <span className={cn("text-[10px] px-2 py-0.5 rounded-full border font-medium", STATUS_COLORS[a.status])}>
                                                    {STATUS_LABELS[a.status]}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-slate-400">
                                                {a.type === "incoming"
                                                    ? <><MapPin className="w-3 h-3" />{a.store}</>
                                                    : <><MapPin className="w-3 h-3" />{a.customerAddress}</>
                                                }
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                                                <User className="w-3 h-3" /> {a.agente}
                                                <span className={cn("ml-auto px-1.5 py-0.5 rounded text-[10px] font-medium",
                                                    a.type === "incoming" ? "bg-blue-500/15 text-blue-400" : "bg-amber-500/15 text-amber-400"
                                                )}>
                                                    {a.type === "incoming" ? "Inbound" : "Outbound"}
                                                </span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-2">
                            <p className="text-sm text-center">Seleziona un giorno nel calendario per vedere gli appuntamenti</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Appointment Detail Modal */}
            {showModal && selectedAppointment && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)}>
                    <div className="glass-card p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-white">Dettaglio Appuntamento</h3>
                            <button onClick={() => setShowModal(false)} className="text-slate-500 hover:text-slate-300"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="space-y-3 text-sm">
                            <div className="flex items-center justify-between">
                                <span className={cn("px-3 py-1 rounded-full border text-xs font-medium",
                                    selectedAppointment.type === "incoming" ? "bg-blue-500/15 border-blue-500/30 text-blue-400" : "bg-amber-500/15 border-amber-500/30 text-amber-400"
                                )}>
                                    {selectedAppointment.type === "incoming" ? "🏪 Inbound — cliente viene in store" : "🚗 Outbound — agente va dal cliente"}
                                </span>
                                <span className={cn("px-2.5 py-1 rounded-full border text-xs font-medium", STATUS_COLORS[selectedAppointment.status])}>
                                    {STATUS_LABELS[selectedAppointment.status]}
                                </span>
                            </div>
                            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/8 space-y-2">
                                <div className="flex items-center gap-2 text-slate-300"><Clock className="w-4 h-4 text-slate-500" />{selectedAppointment.date} alle {selectedAppointment.time}</div>
                                <div className="flex items-center gap-2 text-slate-300"><User className="w-4 h-4 text-slate-500" />{selectedAppointment.customerName}</div>
                                <div className="flex items-center gap-2 text-slate-300"><Phone className="w-4 h-4 text-slate-500" />{selectedAppointment.customerPhone}</div>
                                {selectedAppointment.cfPiva && <div className="flex items-center gap-2 text-slate-300 font-mono"><Search className="w-4 h-4 text-slate-500" />{selectedAppointment.cfPiva}</div>}
                                <div className="flex items-center gap-2 text-slate-300"><MapPin className="w-4 h-4 text-slate-500" />{selectedAppointment.store || selectedAppointment.customerAddress}</div>
                                <div className="flex items-center gap-2 text-slate-400 text-xs"><User className="w-3 h-3" />Agente: {selectedAppointment.agente}</div>
                            </div>
                            {selectedAppointment.notes && (
                                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 text-slate-400 text-xs">
                                    <p className="font-medium text-slate-500 mb-1 uppercase tracking-wider text-[10px]">Note appuntamento</p>
                                    {selectedAppointment.notes}
                                </div>
                            )}

                            {/* Esito Appuntamento */}
                            <div className="pt-1 space-y-2">
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Esito Appuntamento</p>
                                <select
                                    className="glass-input w-full text-sm"
                                    value={selectedAppointment.status}
                                    onChange={e => {
                                        const s = e.target.value as AppointmentStatus;
                                        setAppointments(prev => prev.map(a => a.id === selectedAppointment.id ? { ...a, status: s } : a));
                                        setSelectedAppointment({ ...selectedAppointment, status: s });
                                    }}
                                >
                                    {(Object.keys(STATUS_LABELS) as AppointmentStatus[]).map(s => (
                                        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                                    ))}
                                </select>
                                <textarea
                                    className="glass-input w-full resize-none text-xs"
                                    rows={2}
                                    placeholder="Note sull'esito dell'appuntamento..."
                                    value={selectedAppointment.esitoNote ?? ""}
                                    onChange={e => {
                                        const v = e.target.value;
                                        setAppointments(prev => prev.map(a => a.id === selectedAppointment.id ? { ...a, esitoNote: v } : a));
                                        setSelectedAppointment({ ...selectedAppointment, esitoNote: v });
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Create Appointment Modal */}
            {showCreateModal && selectedDate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreateModal(false)}>
                    <div className="glass-card p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="text-lg font-bold text-white">Nuovo Appuntamento</h3>
                                <p className="text-sm text-slate-500">{new Date(selectedDate + "T12:00:00").toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}</p>
                            </div>
                            <button onClick={() => setShowCreateModal(false)} className="text-slate-500 hover:text-slate-300"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleCreateSubmit} className="space-y-4">
                            {/* Type selection: admins choose all 3; agents are locked to Auto-Generato */}
                            {isCallCenter ? (
                                <div className="flex gap-3">
                                    {(["incoming", "outgoing", "self_generated"] as const).map(t => (
                                        <button key={t} type="button"
                                            onClick={() => setNewAppt(p => ({ ...p, type: t }))}
                                            className={cn("flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all",
                                                newAppt.type === t ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-300" : "bg-white/[0.03] border-white/10 text-slate-400 hover:bg-white/[0.06]"
                                            )}
                                        >
                                            {t === "incoming" ? "🏪 Inbound" : t === "outgoing" ? "🚗 Outbound" : "🟣 Auto-Generato"}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-purple-500/10 border border-purple-500/25 text-purple-300 text-sm">
                                    🟣 Auto-Generato — appuntamento creato da te
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Orario *</label>
                                    <input type="time" className="glass-input w-full" value={newAppt.time} onChange={e => setNewAppt(p => ({ ...p, time: e.target.value }))} required />
                                </div>
                                {isCallCenter ? (
                                    <div>
                                        <label className="block text-xs font-medium text-slate-400 mb-1.5">Agente *</label>
                                        <select className="glass-input w-full" value={newAppt.agente} onChange={e => setNewAppt(p => ({ ...p, agente: e.target.value }))} required>
                                            <option value="">Seleziona...</option>
                                            {MOCK_AGENTS.map(a => <option key={a} value={a}>{a}</option>)}
                                        </select>
                                    </div>
                                ) : (
                                    <div>
                                        <label className="block text-xs font-medium text-slate-400 mb-1.5">Agente</label>
                                        <input className="glass-input w-full" value={newAppt.agente} readOnly />
                                    </div>
                                )}
                            </div>
                            {newAppt.type === "incoming" ? (
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Negozio destinazione *</label>
                                    <select className="glass-input w-full" value={newAppt.store} onChange={e => setNewAppt(p => ({ ...p, store: e.target.value }))} required>
                                        <option value="">Seleziona negozio...</option>
                                        {MOCK_STORES.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                            ) : newAppt.type === "outgoing" ? (
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Indirizzo cliente *</label>
                                    <input type="text" className="glass-input w-full" placeholder="Via, Numero civico, Città" value={newAppt.customerAddress} onChange={e => setNewAppt(p => ({ ...p, customerAddress: e.target.value }))} required />
                                </div>
                            ) : null}


                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">Codice Fiscale / Partita IVA *</label>
                                <input type="text" className="glass-input w-full font-mono uppercase" placeholder="es. RSSMRA80A01H501U" value={newAppt.cfPiva} onChange={e => setNewAppt(p => ({ ...p, cfPiva: e.target.value.toUpperCase() }))} required />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Nome cliente *</label>
                                    <input type="text" className="glass-input w-full" placeholder="Nome e cognome" value={newAppt.customerName} onChange={e => setNewAppt(p => ({ ...p, customerName: e.target.value }))} required />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Telefono cliente *</label>
                                    <input type="tel" className="glass-input w-full" placeholder="3001234567" value={newAppt.customerPhone} onChange={e => setNewAppt(p => ({ ...p, customerPhone: e.target.value }))} required />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">Note</label>
                                <textarea className="glass-input w-full resize-none" rows={2} placeholder="Prodotto di interesse, preferenze..." value={newAppt.notes} onChange={e => setNewAppt(p => ({ ...p, notes: e.target.value }))} />
                            </div>
                            <div className="flex gap-3 pt-1">
                                <button type="button" onClick={() => setShowCreateModal(false)} className="flex-1 h-10 rounded-xl font-medium bg-white/5 text-slate-300 hover:bg-white/10 transition-colors text-sm">Annulla</button>
                                <button type="submit" className="flex-1 primary-btn h-10 text-sm">Salva Appuntamento</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
