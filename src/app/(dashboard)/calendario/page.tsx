"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, X, Phone, MapPin, User, Clock, Search, Bell, Circle, CheckCircle2, PauseCircle, ChevronDown, ChevronUp, CheckSquare, Calendar } from "lucide-react";
import { cn } from "@/utils";
import { usePageView } from "@/lib/pageView";
import { useAuth } from "@/context/AuthContext";
import { DatePickerInput } from "@/components/DatePickerInput";

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

// --- TASKS MODULE ---
type TaskStatus = "da_fare" | "fatta" | "sospesa";

interface CalendarTask {
    id: number;
    title: string;
    date: string; // "YYYY-MM-DD"
    time?: string; // Optional time -> triggers bell
    status: TaskStatus;
    notes?: string;
    clientRef?: string; // CF or Name + Phone
    createdBy: string;
    assignedTo: string;
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

const MOCK_TASKS: CalendarTask[] = [
    { id: 1, title: "Richiamare per conferma contratto", date: "2026-03-03", time: "11:30", status: "da_fare", notes: "Controllare se ha inviato i documenti", clientRef: "Mario Rossi", createdBy: "Luca Perotta", assignedTo: "Luca Perotta" },
    { id: 2, title: "Verifica attivazione linea", date: "2026-03-03", status: "fatta", notes: "Linea OK", clientRef: "Anna Verdi", createdBy: "Alessandro Sandri", assignedTo: "Alessandro Sandri" },
    { id: 3, title: "Sollecito pagamento", date: "2026-03-05", time: "16:00", status: "sospesa", clientRef: "Giuseppe Ferrari", createdBy: "Marco Bianchi", assignedTo: "Giulia Rossi" },
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
    const [view, setView] = usePageView<{ viewYear: number; viewMonth: number; selectedDate: string | null }>("calendario", {
        viewYear: today.getFullYear(),
        viewMonth: today.getMonth(),
        selectedDate: null,
    });
    const viewYear = view.viewYear;
    const setViewYear = (v: number) => setView((p) => ({ ...p, viewYear: v }));
    const viewMonth = view.viewMonth;
    const setViewMonth = (v: number) => setView((p) => ({ ...p, viewMonth: v }));
    const selectedDate = view.selectedDate;
    const setSelectedDate = (v: string | null) => setView((p) => ({ ...p, selectedDate: v }));
    const [showModal, setShowModal] = useState(false);
    const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showSearchDrawer, setShowSearchDrawer] = useState(false);
    const [appointments, setAppointments] = useState<Appointment[]>(MOCK_APPOINTMENTS);

    // Tasks State
    const [tasks, setTasks] = useState<CalendarTask[]>(MOCK_TASKS);
    const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
    const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);

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

    // New task form state
    const [newTask, setNewTask] = useState<Partial<CalendarTask>>({
        title: "",
        date: "",
        time: "",
        status: "da_fare",
        notes: "",
        clientRef: "",
        assignedTo: "", // Will default to current user
    });

    // Search Filters State
    const [searchQuery, setSearchQuery] = useState("");
    const [searchCfPiva, setSearchCfPiva] = useState("");
    const [searchPhone, setSearchPhone] = useState("");
    const [searchAgent, setSearchAgent] = useState("");

    // Admin Grid Filters State
    const [filterStore, setFilterStore] = useState("");
    const [filterAgent, setFilterAgent] = useState("");
    // (Dates aren't fully wired yet in the generic mock)

    const prevMonth = () => {
        if (viewMonth === 0) { setViewYear(viewYear - 1); setViewMonth(11); }
        else setViewMonth(viewMonth - 1);
    };
    const nextMonth = () => {
        if (viewMonth === 11) { setViewYear(viewYear + 1); setViewMonth(0); }
        else setViewMonth(viewMonth + 1);
    };

    const daysInMonth = getDaysInMonth(viewYear, viewMonth);
    const firstDay = getFirstDayOfMonth(viewYear, viewMonth);

    const isCallCenter = user?.role === "admin"; // admin = call center operator
    const isAgent = user?.role !== "admin";

    // Role-based visibility and Admin Grid Filter
    const visibleAppointments = appointments.filter(a => {
        if (user?.role === "admin") {
            if (filterStore && filterStore !== "Tutti" && a.store !== filterStore) return false;
            if (filterAgent && filterAgent !== "Tutti" && a.agente !== filterAgent) return false;
            return true;
        }
        // agente sees only own appointments
        return a.agente === user?.name;
    });

    const apptsByDate = (dateStr: string) =>
        visibleAppointments.filter(a => a.date === dateStr);

    const tasksByDate = (dateStr: string) => {
        return tasks.filter(t => {
            if (t.date !== dateStr) return false;
            if (isCallCenter) {
                // If filter logic applies to Tasks. 
                // Note: Tasks don't explicitly have a `store`, but they have `assignedTo`.
                if (filterAgent && filterAgent !== "Tutti" && t.assignedTo !== filterAgent) return false;
                return true;
            }
            return t.assignedTo === user?.name || t.createdBy === user?.name;
        });
    };

    const handleDayClick = (day: number) => {
        const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        setSelectedDate(dateStr);
        setShowCreateModal(false);
        setShowCreateTaskModal(false);
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

    const handleCreateTaskSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTask.date || !newTask.title || !newTask.assignedTo) return;

        const nextId = tasks.length > 0 ? Math.max(...tasks.map(t => t.id)) + 1 : 1;

        const created: CalendarTask = {
            id: nextId,
            title: newTask.title,
            date: newTask.date,
            time: newTask.time || undefined,
            status: "da_fare",
            notes: newTask.notes,
            clientRef: newTask.clientRef,
            createdBy: user?.name || "Sconosciuto",
            assignedTo: newTask.assignedTo,
        };

        setTasks(prev => [...prev, created]);
        setShowCreateTaskModal(false);
        setNewTask({ title: "", date: "", time: "", status: "da_fare", notes: "", clientRef: "", assignedTo: user?.name || "" });
    };

    const dateAppts = selectedDate ? apptsByDate(selectedDate) : [];
    const dateTasks = selectedDate ? tasksByDate(selectedDate) : [];
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    // Search result chronological list (includes RBAC store-based filtering implicitly from visibleAppointments)
    const searchResults = visibleAppointments.filter(a => {
        // Apply Name / Ragione Sociale (case-insensitive)
        if (searchQuery && !a.customerName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        // Apply CF / PIVA
        if (searchCfPiva && !(a.cfPiva && a.cfPiva.toLowerCase().includes(searchCfPiva.toLowerCase()))) return false;
        // Apply Phone
        if (searchPhone && !a.customerPhone.includes(searchPhone)) return false;
        // Apply Agent (Admin only filter)
        if (isCallCenter && searchAgent && searchAgent !== "Tutti gli agenti" && a.agente !== searchAgent) return false;
        return true;
    }).sort((a, b) => {
        // Chronological sort: newest/future first for easy viewing
        const dateA = new Date(`${a.date}T${a.time}`);
        const dateB = new Date(`${b.date}T${b.time}`);
        return dateB.getTime() - dateA.getTime();
    });

    // When agent opens create modal, auto-preset to self_generated
    const openCreateModal = () => {
        if (isAgent) {
            setNewAppt(p => ({ ...p, type: "self_generated" as AppointmentType, agente: user?.name ?? "" }));
        }
        setShowCreateModal(true);
    };

    const openCreateTaskModal = (initialDate?: string) => {
        setNewTask({
            title: "",
            date: initialDate || todayStr,
            time: "",
            status: "da_fare",
            notes: "",
            clientRef: "",
            assignedTo: user?.name || ""
        });
        setShowCreateTaskModal(true);
    };

    return (
        <div className="w-full">
            <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-white mb-2">Calendario Appuntamenti</h2>
                    <p className="text-slate-400">
                        {isCallCenter ? (
                            (filterStore && filterStore !== "Tutti") || (filterAgent && filterAgent !== "Tutti")
                                ? <span className="text-indigo-300 font-medium">Filtro attivo: {[filterStore && filterStore !== "Tutti" ? filterStore : null, filterAgent && filterAgent !== "Tutti" ? filterAgent : null].filter(Boolean).join(" · ")}</span>
                                : "Visualizzazione completa — tutti gli agenti"
                        ) : `I tuoi appuntamenti — ${user?.name}`}
                    </p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => setShowSearchDrawer(!showSearchDrawer)}
                        className={cn(
                            "h-10 px-5 flex items-center gap-2 rounded-lg font-medium transition-all shadow-lg border",
                            showSearchDrawer
                                ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/50 shadow-indigo-500/20"
                                : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10"
                        )}
                    >
                        <Search className="w-4 h-4" />
                        Cerca appuntamenti
                    </button>
                    <button
                        onClick={() => openCreateTaskModal()}
                        className="h-10 px-5 flex items-center gap-2 rounded-lg font-medium transition-all shadow-lg border bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-500/50 shadow-emerald-500/20"
                    >
                        <Plus className="w-4 h-4" />
                        Nuova Task
                    </button>
                    <button
                        onClick={openCreateModal}
                        className="primary-btn h-10 px-5 flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        Nuovo appuntamento
                    </button>
                </div>
            </div>

            {/* Admin Grid Filter Bar */}
            {isCallCenter && (
                <div className="mb-6 flex flex-col md:flex-row gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/5">
                    <div className="flex-1">
                        <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Filtra per Punto Vendita</label>
                        <select
                            className="glass-input w-full text-sm"
                            value={filterStore}
                            onChange={(e) => setFilterStore(e.target.value)}
                        >
                            <option value="Tutti">Tutti i punti vendita</option>
                            {MOCK_STORES.map((s) => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-1">
                        <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Filtra per Agente</label>
                        <select
                            className="glass-input w-full text-sm"
                            value={filterAgent}
                            onChange={(e) => setFilterAgent(e.target.value)}
                        >
                            <option value="Tutti">Tutti gli agenti</option>
                            {MOCK_AGENTS.map((a) => (
                                <option key={a} value={a}>{a}</option>
                            ))}
                        </select>
                    </div>
                </div>
            )}

            {/* Advanced Search Drawer */}
            {showSearchDrawer && (
                <div className="glass-card mb-6 p-6 animate-in slide-in-from-top-4 fade-in duration-200">
                    <h3 className="text-lg font-medium text-white mb-4 border-b border-white/10 pb-2 flex items-center gap-2">
                        <Search className="w-5 h-5 text-indigo-400" />
                        Filtri di ricerca
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {/* 1. Nome / Ragione Sociale */}
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Nome o Ragione Sociale</label>
                            <input
                                type="text"
                                placeholder="Es. Mario Rossi"
                                className="glass-input w-full"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        {/* 2. CF / PIVA */}
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Codice Fiscale / P.IVA</label>
                            <input
                                type="text"
                                placeholder="Inserisci CF o P.IVA"
                                className="glass-input w-full"
                                value={searchCfPiva}
                                onChange={(e) => setSearchCfPiva(e.target.value)}
                            />
                        </div>

                        {/* 3. Cellulare */}
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Numero di cellulare</label>
                            <input
                                type="number"
                                placeholder="Es. 3331234567"
                                className="glass-input w-full"
                                value={searchPhone}
                                onChange={(e) => setSearchPhone(e.target.value)}
                            />
                        </div>

                        {/* 4. Agente (Admin Only) */}
                        {isCallCenter ? (
                            <div>
                                <label className="block text-sm font-bold text-indigo-300 mb-2">Agente (Admin)</label>
                                <select
                                    className="glass-input w-full border-indigo-500/30 focus:border-indigo-500/50"
                                    value={searchAgent}
                                    onChange={(e) => setSearchAgent(e.target.value)}
                                >
                                    <option>Tutti gli agenti</option>
                                    {MOCK_AGENTS.map(agent => (
                                        <option key={agent} value={agent}>{agent}</option>
                                    ))}
                                </select>
                            </div>
                        ) : (
                            // Space preserver for layout on non-admin
                            <div className="hidden lg:block"></div>
                        )}

                        {/* Date Ranges */}
                        <div className="md:col-span-2 lg:col-span-4 grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-white/5 mt-2">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">Da data appuntamento</label>
                                <DatePickerInput id="da_data_appuntamento" name="da_data_appuntamento" placeholder="Seleziona data" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">A data appuntamento</label>
                                <DatePickerInput id="a_data_appuntamento" name="a_data_appuntamento" placeholder="Seleziona data" />
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 flex gap-3">
                        <button className="primary-btn h-10 px-6 text-sm">Cerca</button>
                        <button
                            onClick={() => setShowSearchDrawer(false)}
                            className="h-10 px-6 rounded-lg font-medium bg-white/5 text-slate-300 hover:bg-white/10 transition-colors text-sm"
                        >
                            Annulla
                        </button>
                    </div>

                    {/* Temporary mockup of chronological results inside the drawer */}
                    <div className="mt-8 pt-6 border-t border-white/10">
                        <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Risultati di ricerca</h4>
                        <div className="space-y-3 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
                            {searchResults.map(appt => (
                                <div key={appt.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors gap-4">
                                    <div className="flex gap-4 items-center">
                                        <div className="flex flex-col items-center justify-center bg-indigo-500/10 text-indigo-400 w-12 h-12 rounded-lg shrink-0">
                                            <span className="text-lg font-bold leading-none">{appt.date.split('-')[2]}</span>
                                            <span className="text-[10px] uppercase font-semibold">{MONTHS_IT[parseInt(appt.date.split('-')[1]) - 1].substring(0, 3)}</span>
                                        </div>
                                        <div>
                                            <h5 className="text-white font-medium">{appt.customerName}</h5>
                                            <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                                                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {appt.time}</span>
                                                <span className="flex items-center gap-1 text-slate-500"><User className="w-3 h-3" /> {appt.agente}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 sm:w-auto w-full justify-between sm:justify-end">
                                        <span className={cn(
                                            "text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-full border",
                                            appt.type === "incoming" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                                                appt.type === "self_generated" ? "bg-purple-500/10 text-purple-400 border-purple-500/20" :
                                                    "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                        )}>
                                            {appt.type}
                                        </span>
                                        <span className={cn(
                                            "text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-full border",
                                            STATUS_COLORS[appt.status]
                                        )}>
                                            {STATUS_LABELS[appt.status]}
                                        </span>
                                    </div>
                                </div>
                            ))}
                            {searchResults.length === 0 && (
                                <div className="text-center py-8 text-slate-500 text-sm">
                                    Nessun appuntamento trovato.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

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
                            const dayTasks = tasksByDate(dateStr);
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
                                    {(dayAppts.length > 0 || dayTasks.length > 0) && (
                                        <div className="flex flex-wrap gap-0.5 mt-1 justify-center items-center">
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
                                                <span className="text-[9px] text-slate-400 pr-0.5">+{dayAppts.length - 3}</span>
                                            )}
                                            {dayTasks.length > 0 && (
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 ml-0.5" />
                                            )}
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Legend */}
                    <div className="mt-4 pt-4 border-t border-white/8 flex flex-wrap gap-5 text-xs text-slate-500">
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400" />Inbound</span>
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" />Outbound</span>
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-purple-400" />Auto-Generato</span>
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" />Task</span>
                    </div>
                </div>

                {/* Side panel */}
                <div className="glass-card p-5 flex flex-col">
                    {selectedDate ? (
                        <>
                            <div className="flex items-center justify-between mb-1">
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
                            <h4 className="font-medium text-indigo-400 text-sm flex items-center gap-1.5 mb-3">
                                <Calendar className="w-3.5 h-3.5" />
                                Appuntamento
                            </h4>

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
                                                <span className="text-sm font-semibold text-white truncate max-w-[200px]">{a.time} — {a.customerName}</span>
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

                            {/* Divider & Tasks Section */}
                            <hr className="border-white/10 my-4" />

                            <div className="flex items-center justify-between mb-1">
                                <h4 className="font-semibold text-white text-base">
                                    {new Date(selectedDate + "T12:00:00").toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
                                </h4>
                                <button
                                    onClick={() => openCreateTaskModal(selectedDate)}
                                    className="p-1.5 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/30 transition-colors"
                                    title="Nuova Task"
                                >
                                    <Plus className="w-4 h-4" />
                                </button>
                            </div>
                            <h4 className="font-medium text-emerald-400 text-sm flex items-center gap-1.5 mb-3">
                                <CheckSquare className="w-3.5 h-3.5" />
                                Task
                            </h4>

                            {dateTasks.length === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-2">
                                    <p className="text-sm">Nessuna task per oggi</p>
                                </div>
                            ) : (
                                <div className="space-y-3 flex-1 overflow-y-auto custom-scrollbar pr-1">
                                    {dateTasks.map(t => (
                                        <div key={t.id} className={cn(
                                            "w-full text-left p-3 rounded-xl border transition-all",
                                            t.status === "fatta" ? "bg-emerald-500/5 border-emerald-500/10 opacity-70" :
                                                t.status === "sospesa" ? "bg-amber-500/5 border-amber-500/10" :
                                                    "bg-white/[0.03] border-white/8"
                                        )}>
                                            <div className="flex justify-between items-start mb-2 gap-2">
                                                <div className="flex items-start gap-2 max-w-[70%]">
                                                    <div className="mt-1 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                                    <button
                                                        onClick={() => setExpandedTaskId(expandedTaskId === t.id ? null : t.id)}
                                                        className="flex-1 text-left"
                                                    >
                                                        <span className={cn(
                                                            "text-sm font-semibold transition-all",
                                                            t.status === "fatta" ? "text-slate-400 line-through" : "text-white"
                                                        )}>
                                                            {t.title}
                                                        </span>
                                                        {t.time && (
                                                            <div className="flex items-center gap-1.5 pl-0.5 mt-1 text-xs text-amber-400 font-medium">
                                                                <Bell className="w-3 h-3" /> {t.time}
                                                            </div>
                                                        )}
                                                    </button>
                                                </div>

                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const nextStatus: Record<TaskStatus, TaskStatus> = {
                                                            "da_fare": "fatta",
                                                            "fatta": "sospesa",
                                                            "sospesa": "da_fare"
                                                        };
                                                        setTasks(prev => prev.map(task => task.id === t.id ? { ...task, status: nextStatus[t.status] } : task));
                                                    }}
                                                    className={cn(
                                                        "text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-full border transition-colors flex items-center gap-1 shrink-0",
                                                        t.status === "da_fare" ? "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10" :
                                                            t.status === "fatta" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20" :
                                                                "bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20"
                                                    )}
                                                >
                                                    {t.status === "da_fare" ? <Circle className="w-3 h-3" /> : t.status === "fatta" ? <CheckCircle2 className="w-3 h-3" /> : <PauseCircle className="w-3 h-3" />}
                                                    {t.status.replace("_", " ")}
                                                </button>
                                            </div>

                                            {expandedTaskId === t.id && (
                                                <div className="mt-3 pt-3 border-t border-white/5 space-y-2 text-xs animate-in slide-in-from-top-2">
                                                    <div className="flex justify-between text-slate-400">
                                                        <span><strong>Creato da:</strong> {t.createdBy}</span>
                                                        <span><strong>Ass.:</strong> <span className={cn(t.assignedTo === user?.name ? "text-indigo-400 font-medium" : "")}>{t.assignedTo}</span></span>
                                                    </div>
                                                    {t.clientRef && (
                                                        <div className="text-slate-300 bg-white/5 p-2 rounded flex items-center gap-2">
                                                            <User className="w-3.5 h-3.5 text-slate-500" />
                                                            {t.clientRef}
                                                        </div>
                                                    )}
                                                    {t.notes && (
                                                        <div className="text-slate-400 mt-1 italic leading-relaxed">
                                                            "{t.notes}"
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
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

            {/* Create Task Modal */}
            {showCreateTaskModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreateTaskModal(false)}>
                    <div className="glass-card p-6 w-full max-w-lg animate-in slide-in-from-bottom-4 zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="text-lg font-bold text-emerald-400">Nuova Task</h3>
                                <p className="text-sm text-slate-500">Compila i dettagli per registrare una nuova task a sistema.</p>
                            </div>
                            <button onClick={() => setShowCreateTaskModal(false)} className="text-slate-500 hover:text-slate-300 transition-colors"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleCreateTaskSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">Titolo Task *</label>
                                <input type="text" className="glass-input w-full border-emerald-500/30 focus:border-emerald-500/50 focus:ring-emerald-500/20" placeholder="Cosa c'è da fare?" value={newTask.title} onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))} required />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Data *</label>
                                    <input type="date" className="glass-input w-full" value={newTask.date || ""} onChange={e => setNewTask(p => ({ ...p, date: e.target.value }))} required />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Orario (Opzionale)</label>
                                    <input type="time" className="glass-input w-full" value={newTask.time || ""} onChange={e => setNewTask(p => ({ ...p, time: e.target.value }))} />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">Riferimento Cliente</label>
                                <input type="text" className="glass-input w-full" placeholder="Nome, CF o Cellulare" value={newTask.clientRef || ""} onChange={e => setNewTask(p => ({ ...p, clientRef: e.target.value }))} />
                            </div>

                            {isCallCenter ? (
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Assegna a *</label>
                                    <select className="glass-input w-full" value={newTask.assignedTo} onChange={e => setNewTask(p => ({ ...p, assignedTo: e.target.value }))} required>
                                        <option value="">Seleziona operatore...</option>
                                        <option value={user?.name}>{user?.name} (Tu)</option>
                                        <optgroup label="Altri">
                                            {MOCK_AGENTS.filter(a => a !== user?.name).map(a => <option key={a} value={a}>{a}</option>)}
                                        </optgroup>
                                    </select>
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Assegna a</label>
                                    <input className="glass-input w-full text-slate-400 bg-white/5" value={newTask.assignedTo || user?.name || ""} readOnly />
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">Note</label>
                                <textarea className="glass-input w-full resize-none" rows={2} placeholder="Dettagli aggiuntivi..." value={newTask.notes || ""} onChange={e => setNewTask(p => ({ ...p, notes: e.target.value }))} />
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setShowCreateTaskModal(false)} className="flex-1 h-10 rounded-xl font-medium bg-white/5 text-slate-300 hover:bg-white/10 transition-colors text-sm">Annulla</button>
                                <button type="submit" className="flex-1 h-10 rounded-xl font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/20 text-sm">Salva Task</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
