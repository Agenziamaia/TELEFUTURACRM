"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight, Plus, X, Phone, MapPin, User, Clock, Search, Bell, Circle, CheckCircle2, PauseCircle, ChevronDown, ChevronUp, CheckSquare, Calendar, Lock, XCircle, Users, Video } from "lucide-react";
import { cn } from "@/utils";
import { usePageView } from "@/lib/pageView";
import { useAuth } from "@/context/AuthContext";
import { DatePickerInput } from "@/components/DatePickerInput";
import { supabase } from "@/lib/supabaseClient";
import { seesAllStores, seesWholeStore } from "@/lib/roles";

// Tipi degli appuntamenti (i dati arrivano da Supabase, vedi fetch piu' sotto)
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

// --- AGENDA BLOCKS (agent-only; blocks telephone team from booking) ---
interface AgendaBlock {
    id: number;
    startDate: string; // YYYY-MM-DD
    endDate: string;
    note: string;
}

// --- TASKS MODULE ---
type TaskStatus = "da_fare" | "fatta" | "sospesa" | "abbandonata";

interface CalendarTask {
    id: number;
    title: string;
    date: string; // "YYYY-MM-DD"
    time?: string; // Optional time -> triggers bell
    status: TaskStatus;
    notes?: string;
    outcomeNote?: string; // Final note when closing/updating task
    clientRef?: string; // CF or Name + Phone
    createdBy: string;
    assignedTo: string; // User name, or empty when assignedToStore is set
    assignedToStore?: string; // When set, task is for entire store
}

// --- MEETINGS MODULE ---
type MeetingType = "in_person" | "video_call";
type MeetingResponseStatus = "invited" | "confirmed" | "declined";

interface MeetingRecipient {
    id: string;   // uuid di app_users (recipients e' jsonb, quindi ok)
    name: string;
    store?: string;
    status: MeetingResponseStatus;
}

interface CalendarMeeting {
    id: number;
    title: string;
    date: string; // "YYYY-MM-DD"
    startTime: string;
    endTime: string;
    type: MeetingType;
    brand: string;
    location?: string; // address when in_person
    link?: string; // video link when video_call
    notes?: string;
    recipients: MeetingRecipient[];
    createdBy: string;
}

const MEETING_BRANDS = ["Wind3", "Vodafone", "Tim", "Fastweb", "Corporate / Aziendale"];

// id e' l'uuid di app_users (gli operatori arrivano dagli utenti reali, non piu'
// dalla tabella seed calendar_operators).
type MeetingUser = { id: string; name: string; store: string; brands: string[] };

function mapAppointmentRow(r: Record<string, unknown>): Appointment {
    return {
        id: Number(r.id),
        date: r.date as string,
        time: r.time as string,
        type: r.type as AppointmentType,
        agente: (r.agente as string) ?? "",
        store: r.store as string | undefined,
        customerAddress: r.customer_address as string | undefined,
        customerName: r.customer_name as string,
        customerPhone: r.customer_phone as string,
        cfPiva: r.cf_piva as string | undefined,
        notes: (r.notes as string) ?? "",
        esitoNote: r.esito_note as string | undefined,
        status: r.status as AppointmentStatus,
    };
}
function mapTaskRow(r: Record<string, unknown>): CalendarTask {
    return {
        id: Number(r.id),
        title: r.title as string,
        date: r.date as string,
        time: r.time as string | undefined,
        status: r.status as TaskStatus,
        notes: r.notes as string | undefined,
        outcomeNote: r.outcome_note as string | undefined,
        clientRef: r.client_ref as string | undefined,
        createdBy: r.created_by as string,
        assignedTo: (r.assigned_to as string) ?? "",
        assignedToStore: r.assigned_to_store as string | undefined,
    };
}
function mapAgendaBlockRow(r: Record<string, unknown>): AgendaBlock {
    return { id: Number(r.id), startDate: r.start_date as string, endDate: r.end_date as string, note: r.note as string };
}
function mapMeetingRow(r: Record<string, unknown>): CalendarMeeting {
    return {
        id: Number(r.id),
        title: r.title as string,
        date: r.date as string,
        startTime: r.start_time as string,
        endTime: r.end_time as string,
        type: r.type as MeetingType,
        brand: r.brand as string,
        location: r.location as string | undefined,
        link: r.link as string | undefined,
        notes: r.notes as string | undefined,
        recipients: Array.isArray(r.recipients) ? (r.recipients as MeetingRecipient[]) : [],
        createdBy: r.created_by as string,
    };
}

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
    const [showCreateMeetingModal, setShowCreateMeetingModal] = useState(false);
    const [selectedMeeting, setSelectedMeeting] = useState<CalendarMeeting | null>(null);
    const [showMeetingDetailModal, setShowMeetingDetailModal] = useState(false);
    const [showSearchDrawer, setShowSearchDrawer] = useState(false);
    const [appointments, setAppointments] = useState<Appointment[]>([]);

    // Deep link dai tag in chat: /calendario?appuntamento=<id> apre l'appuntamento
    const deepLinked = useRef(false);
    useEffect(() => {
        if (deepLinked.current || appointments.length === 0) return;
        const id = new URLSearchParams(window.location.search).get("appuntamento");
        if (!id) return;
        const hit = appointments.find((a: any) => String(a.id) === id);
        if (hit) {
            setSelectedAppointment(hit);
            if ((hit as any).date) setSelectedDate((hit as any).date);
            setShowModal(true);
            deepLinked.current = true;
        }
    }, [appointments]);

    // Tasks State
    const [tasks, setTasks] = useState<CalendarTask[]>([]);
    const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
    const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);

    // Agenda blocks (agent-only); blocked dates prevent telephone team from booking
    const [agendaBlocks, setAgendaBlocks] = useState<AgendaBlock[]>([]);
    const [showBlockAgendaModal, setShowBlockAgendaModal] = useState(false);
    const [blockAgendaForm, setBlockAgendaForm] = useState({
        mode: "single" as "single" | "range",
        startDate: "",
        endDate: "",
        note: "",
    });

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

    // New meeting form state
    const [newMeeting, setNewMeeting] = useState<{
        title: string;
        date: string;
        startTime: string;
        endTime: string;
        type: MeetingType;
        brand: string;
        location: string;
        link: string;
        notes: string;
        recipients: MeetingRecipient[];
    }>({
        title: "",
        date: "",
        startTime: "",
        endTime: "",
        type: "in_person",
        brand: "",
        location: "",
        link: "",
        notes: "",
        recipients: [],
    });

    const [meetings, setMeetings] = useState<CalendarMeeting[]>([]);

    const [calendarStores, setCalendarStores] = useState<{ id: string; name: string }[]>([]);
    const [calendarOperators, setCalendarOperators] = useState<MeetingUser[]>([]);

    const storeNames = useMemo(() => calendarStores.map(s => s.name).sort(), [calendarStores]);
    const agents = useMemo(() => [...new Set(calendarOperators.map(o => o.name))].sort(), [calendarOperators]);
    const meetingUsers = useMemo(() => calendarOperators, [calendarOperators]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const [apptRes, taskRes, blockRes, meetRes, storesRes, operatorsRes, brandsRes] = await Promise.all([
                supabase.from("appointments").select("*").order("date"),
                supabase.from("calendar_tasks").select("*").order("date"),
                supabase.from("agenda_blocks").select("*"),
                supabase.from("calendar_meetings").select("*").order("date"),
                // Negozi e collaboratori REALI (le tabelle calendar_stores/calendar_operators
                // contenevano ancora dati di esempio: Marco Bianchi, "Roma Centro (RM001)", ecc.)
                supabase.from("stores").select("id, name").order("name"),
                supabase.from("app_users").select("id, full_name, primary_store").eq("active", true).order("full_name"),
                supabase.from("user_brands").select("user_id, brand"),
            ]);
            if (cancelled) return;
            if (!apptRes.error) setAppointments((apptRes.data ?? []).map(mapAppointmentRow));
            if (!taskRes.error) setTasks((taskRes.data ?? []).map(mapTaskRow));
            if (!blockRes.error) setAgendaBlocks((blockRes.data ?? []).map(mapAgendaBlockRow));
            if (!meetRes.error) setMeetings((meetRes.data ?? []).map(mapMeetingRow));
            if (!storesRes.error) setCalendarStores((storesRes.data ?? []).map((r: Record<string, unknown>) => ({ id: String(r.id), name: r.name as string })));
            if (!operatorsRes.error) {
                const bmap = new Map<string, string[]>();
                (brandsRes?.data ?? []).forEach((b: Record<string, unknown>) => {
                    const k = String(b.user_id);
                    bmap.set(k, [...(bmap.get(k) ?? []), b.brand as string]);
                });
                setCalendarOperators((operatorsRes.data ?? []).map((r: Record<string, unknown>) => ({
                    id: String(r.id),
                    name: r.full_name as string,
                    store: (r.primary_store as string) ?? "",
                    brands: bmap.get(String(r.id)) ?? [],
                })));
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // Search Filters State
    const [searchQuery, setSearchQuery] = useState("");
    const [searchCfPiva, setSearchCfPiva] = useState("");
    const [searchPhone, setSearchPhone] = useState("");
    const [searchAgent, setSearchAgent] = useState("");
    const [searchDateFrom, setSearchDateFrom] = useState("");
    const [searchDateTo, setSearchDateTo] = useState("");

    // Admin Grid Filters State
    const [filterStore, setFilterStore] = useState("");
    const [filterAgent, setFilterAgent] = useState("");
    // (Dates aren't fully wired yet in the generic mock)

    // Outcome filters
    const [appointmentOutcomeFilter, setAppointmentOutcomeFilter] = useState<AppointmentStatus | "">("");
    const [taskOutcomeFilter, setTaskOutcomeFilter] = useState<TaskStatus | "">("");

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

    const isCallCenter = user?.role === "admin" || user?.role === "dev"; // admin/dev = call center operator
    const isAgent = user?.role !== "admin" && user?.role !== "dev";
    const canCreateMeeting = seesAllStores(user?.role) || seesWholeStore(user?.role);

    const isDateBlocked = (dateStr: string) =>
        agendaBlocks.some(b => dateStr >= b.startDate && dateStr <= b.endDate);

    // Role-based visibility and Admin Grid Filter
    const visibleAppointments = appointments.filter(a => {
        if (user?.role === "admin" || user?.role === "dev") {
            if (filterStore && filterStore !== "Tutti" && a.store !== filterStore) return false;
            if (filterAgent && filterAgent !== "Tutti" && a.agente !== filterAgent) return false;
            if (appointmentOutcomeFilter && a.status !== appointmentOutcomeFilter) return false;
            return true;
        }
        if (appointmentOutcomeFilter && a.status !== appointmentOutcomeFilter) return false;
        // Agent: own appointments, or inbound appointments for their store
        if (a.agente === user?.name) return true;
        if (a.type === "incoming" && a.store && user?.negozio && (a.store === user.negozio || a.store.includes(user.negozio) || user.negozio.includes(a.store))) return true;
        return false;
    });

    const apptsByDate = (dateStr: string) =>
        visibleAppointments.filter(a => a.date === dateStr);

    const tasksByDate = (dateStr: string) => {
        return tasks.filter(t => {
            if (t.date !== dateStr) return false;
            if (isCallCenter) {
                if (filterAgent && filterAgent !== "Tutti" && !t.assignedToStore && t.assignedTo !== filterAgent) return false;
                if (filterStore && filterStore !== "Tutti" && t.assignedToStore && t.assignedToStore !== filterStore) return false;
                if (taskOutcomeFilter && t.status !== taskOutcomeFilter) return false;
                return true;
            }
            // Agent: visible if assigned to me, or assigned to my store
            if (t.assignedToStore) {
                const myStore = user?.negozio ?? "";
                const storeMatch = myStore && (t.assignedToStore === myStore || myStore.includes(t.assignedToStore) || t.assignedToStore.includes(myStore));
                if (!storeMatch) return false;
            } else {
                if (!(t.assignedTo === user?.name || t.createdBy === user?.name)) return false;
            }
            if (taskOutcomeFilter && t.status !== taskOutcomeFilter) return false;
            return true;
        });
    };

    const meetingsByDate = (dateStr: string) => meetings.filter(m => m.date === dateStr);

    const handleDayClick = (day: number) => {
        const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        setSelectedDate(dateStr);
        setShowCreateModal(false);
        setShowCreateTaskModal(false);
        setShowCreateMeetingModal(false);
        setSelectedAppointment(null);
        setSelectedMeeting(null);
        setShowModal(false);
        setShowMeetingDetailModal(false);
    };

    const handleCreateSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedDate) return;
        if (isDateBlocked(selectedDate)) {
            const block = agendaBlocks.find(b => selectedDate >= b.startDate && selectedDate <= b.endDate);
            alert(`Questa data è bloccata in agenda. Motivo: ${block?.note ?? "—"}`);
            return;
        }
        const payload = {
            date: selectedDate,
            time: newAppt.time,
            type: newAppt.type,
            agente: newAppt.type === "incoming" ? "" : newAppt.agente,
            store: newAppt.type === "incoming" ? newAppt.store : null,
            customer_address: newAppt.type === "outgoing" ? newAppt.customerAddress : null,
            customer_name: newAppt.customerName,
            customer_phone: newAppt.customerPhone,
            cf_piva: newAppt.cfPiva || null,
            notes: newAppt.notes || "",
            status: "scheduled",
        };
        const { data, error } = await supabase.from("appointments").insert(payload).select().single();
        if (error) {
            alert("Errore salvataggio: " + error.message);
            return;
        }
        setAppointments(prev => [...prev, mapAppointmentRow(data)]);
        setShowCreateModal(false);
        setNewAppt({ time: "10:00", type: "incoming", agente: "", store: "", customerAddress: "", customerName: "", customerPhone: "", cfPiva: "", notes: "" });
    };

    const handleCreateTaskSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const assignee = newTask.assignedToStore ? "" : (newTask.assignedTo ?? "");
        if (!newTask.date || !newTask.title || (!newTask.assignedToStore && !assignee)) return;

        const payload = {
            title: newTask.title,
            date: newTask.date,
            time: newTask.time || null,
            status: "da_fare",
            notes: newTask.notes || null,
            client_ref: newTask.clientRef || null,
            created_by: user?.name || "Sconosciuto",
            assigned_to: assignee,
            assigned_to_store: newTask.assignedToStore || null,
        };
        const { data, error } = await supabase.from("calendar_tasks").insert(payload).select().single();
        if (error) {
            alert("Errore salvataggio task: " + error.message);
            return;
        }
        setTasks(prev => [...prev, mapTaskRow(data)]);
        setShowCreateTaskModal(false);
        setNewTask({ title: "", date: "", time: "", status: "da_fare", notes: "", clientRef: "", assignedTo: user?.name || "", assignedToStore: undefined });
    };

    const handleCreateMeetingSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMeeting.title || !newMeeting.date || !newMeeting.startTime || !newMeeting.endTime || !newMeeting.brand) return;

        const payload = {
            title: newMeeting.title,
            date: newMeeting.date,
            start_time: newMeeting.startTime,
            end_time: newMeeting.endTime,
            type: newMeeting.type,
            brand: newMeeting.brand,
            location: newMeeting.type === "in_person" ? newMeeting.location : null,
            link: newMeeting.type === "video_call" ? newMeeting.link : null,
            notes: newMeeting.notes || null,
            recipients: newMeeting.recipients,
            created_by: user?.name || "Sconosciuto",
        };
        const { data, error } = await supabase.from("calendar_meetings").insert(payload).select().single();
        if (error) {
            alert("Errore salvataggio riunione: " + error.message);
            return;
        }
        setMeetings(prev => [...prev, mapMeetingRow(data)]);
        setShowCreateMeetingModal(false);
        setNewMeeting({
            title: "",
            date: "",
            startTime: "",
            endTime: "",
            type: "in_person",
            brand: "",
            location: "",
            link: "",
            notes: "",
            recipients: [],
        });
    };

    const handleMeetingBrandChange = (brand: string) => {
        setNewMeeting(prev => {
            const autoRecipients: MeetingRecipient[] =
                brand && brand !== "Corporate / Aziendale"
                    ? meetingUsers.filter(u => u.brands.includes(brand)).map(u => ({
                        id: u.id,
                        name: u.name,
                        store: u.store,
                        status: "invited",
                    }))
                    : [];
            return { ...prev, brand, recipients: autoRecipients };
        });
    };

    const handleToggleRecipient = (userId: string) => {
        setNewMeeting(prev => {
            const exists = prev.recipients.find(r => r.id === userId);
            if (exists) {
                return { ...prev, recipients: prev.recipients.filter(r => r.id !== userId) };
            }
            const src = meetingUsers.find(u => u.id === userId);
            if (!src) return prev;
            return {
                ...prev,
                recipients: [
                    ...prev.recipients,
                    { id: src.id, name: src.name, store: src.store, status: "invited" },
                ],
            };
        });
    };

    const dateAppts = selectedDate ? apptsByDate(selectedDate) : [];
    const dateTasks = selectedDate ? tasksByDate(selectedDate) : [];
    const dateMeetings = selectedDate ? meetingsByDate(selectedDate) : [];
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    const parseSearchDate = (val: string): string | null => {
        if (!val || !val.trim()) return null;
        const m = val.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
        if (val.match(/^\d{4}-\d{2}-\d{2}$/)) return val;
        return null;
    };

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
        const from = parseSearchDate(searchDateFrom);
        const to = parseSearchDate(searchDateTo);
        if (from && a.date < from) return false;
        if (to && a.date > to) return false;
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
            assignedTo: user?.name || "",
            assignedToStore: undefined,
        });
        setShowCreateTaskModal(true);
    };

    const handleBlockAgendaSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const start = blockAgendaForm.startDate.trim();
        const end = blockAgendaForm.mode === "range" ? (blockAgendaForm.endDate.trim() || start) : start;
        const note = blockAgendaForm.note.trim();
        if (!start || !note) {
            alert("Inserire data e motivo obbligatori.");
            return;
        }
        if (blockAgendaForm.mode === "range" && end < start) {
            alert("La data fine deve essere uguale o successiva alla data inizio.");
            return;
        }
        const { data, error } = await supabase.from("agenda_blocks").insert({ start_date: start, end_date: end, note }).select().single();
        if (error) {
            alert("Errore salvataggio blocco: " + error.message);
            return;
        }
        setAgendaBlocks(prev => [...prev, mapAgendaBlockRow(data)]);
        setShowBlockAgendaModal(false);
        setBlockAgendaForm({ mode: "single", startDate: "", endDate: "", note: "" });
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
                    {canCreateMeeting && (
                        <button
                            onClick={() => setShowCreateMeetingModal(true)}
                            className="h-10 px-5 flex items-center gap-2 rounded-lg font-medium transition-all shadow-lg border bg-sky-500 hover:bg-sky-600 text-white border-sky-500/50 shadow-sky-500/20"
                        >
                            <Users className="w-4 h-4" />
                            Nuova riunione
                        </button>
                    )}
                    {isAgent && (
                        <button
                            onClick={() => {
                                setBlockAgendaForm({ mode: "single", startDate: selectedDate || "", endDate: selectedDate || "", note: "" });
                                setShowBlockAgendaModal(true);
                            }}
                            className="h-10 px-5 flex items-center gap-2 rounded-lg font-medium transition-all border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                        >
                            <Lock className="w-4 h-4" />
                            Blocca agenda
                        </button>
                    )}
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
                            {storeNames.map((s) => (
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
                            {agents.map((a) => (
                                <option key={a} value={a}>{a}</option>
                            ))}
                        </select>
                    </div>
                </div>
            )}

            {/* Outcome Filters (appointments & tasks) */}
            <div className="mb-4 flex flex-col md:flex-row gap-3">
                <div className="flex-1 max-w-xs">
                    <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
                        Filtro esito appuntamenti
                    </label>
                    <select
                        className="glass-input w-full text-sm"
                        value={appointmentOutcomeFilter}
                        onChange={(e) => setAppointmentOutcomeFilter(e.target.value as AppointmentStatus | "")}
                    >
                        <option value="">Tutti gli esiti</option>
                        {(Object.keys(STATUS_LABELS) as AppointmentStatus[]).map((s) => (
                            <option key={s} value={s}>
                                {STATUS_LABELS[s]}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex-1 max-w-xs">
                    <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
                        Filtro esito task
                    </label>
                    <select
                        className="glass-input w-full text-sm"
                        value={taskOutcomeFilter}
                        onChange={(e) => setTaskOutcomeFilter(e.target.value as TaskStatus | "")}
                    >
                        <option value="">Tutti gli stati</option>
                        <option value="da_fare">Da fare</option>
                        <option value="fatta">Fatta</option>
                        <option value="sospesa">Sospesa</option>
                        <option value="abbandonata">Abbandonata</option>
                    </select>
                </div>
            </div>

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
                                    {agents.map(agent => (
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
                                <DatePickerInput id="da_data_appuntamento" value={searchDateFrom} onChange={setSearchDateFrom} placeholder="Seleziona data" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">A data appuntamento</label>
                                <DatePickerInput id="a_data_appuntamento" value={searchDateTo} onChange={setSearchDateTo} placeholder="Seleziona data" />
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 flex gap-3">
                        <button type="button" onClick={() => setShowSearchDrawer(false)} className="primary-btn h-10 px-6 text-sm">Cerca</button>
                        <button
                            type="button"
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
                            const dayMeetings = meetingsByDate(dateStr);
                            const isToday = dateStr === todayStr;
                            const isSelected = dateStr === selectedDate;
                            const isBlocked = isDateBlocked(dateStr);

                            return (
                                <button
                                    key={day}
                                    onClick={() => handleDayClick(day)}
                                    className={cn(
                                        "relative aspect-square rounded-xl flex flex-col items-center justify-start pt-2 pb-1 px-1 transition-all group",
                                        isBlocked ? "bg-amber-500/15 border border-amber-500/30" :
                                            isSelected ? "bg-indigo-500/25 border border-indigo-500/50" :
                                                isToday ? "bg-white/[0.05] border border-white/15" :
                                                    "hover:bg-white/[0.04] border border-transparent"
                                    )}
                                >
                                    <span className={cn(
                                        "text-sm font-medium",
                                        isToday && !isBlocked ? "text-indigo-400 font-bold" :
                                            isSelected ? "text-white" : isBlocked ? "text-amber-200" : "text-slate-300"
                                    )}>
                                        {day}
                                    </span>
                                    {isBlocked && (
                                        <Lock className="w-3 h-3 text-amber-400 mt-0.5" />
                                    )}
                                    {(dayAppts.length > 0 || dayTasks.length > 0 || dayMeetings.length > 0) && (
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
                                            {dayMeetings.length > 0 && (
                                                <div className="w-1.5 h-1.5 rounded-full bg-sky-400 ml-0.5" />
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
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-sky-400" />Riunioni</span>
                        {agendaBlocks.length > 0 && <span className="flex items-center gap-1.5"><Lock className="w-3 h-3 text-amber-400" />Giorno bloccato</span>}
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
                                                <User className="w-3 h-3" /> {a.type === "incoming" && a.store ? a.store : a.agente || "—"}
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
                                <div className="flex flex-col items-center justify-center text-slate-500 gap-2 mb-4">
                                    <p className="text-sm">Nessuna task per oggi</p>
                                </div>
                            ) : (
                                <div className="space-y-3 overflow-y-auto custom-scrollbar pr-1 mb-4 max-h-64">
                                    {dateTasks.map(t => (
                                    <div key={t.id} className={cn(
                                        "w-full text-left p-3 rounded-xl border transition-all",
                                        t.status === "fatta" ? "bg-emerald-500/5 border-emerald-500/10 opacity-70" :
                                            t.status === "sospesa" ? "bg-amber-500/5 border-amber-500/10" :
                                                t.status === "abbandonata" ? "bg-rose-500/5 border-rose-500/10 opacity-80" :
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
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        const order: TaskStatus[] = ["da_fare", "fatta", "sospesa", "abbandonata"];
                                                        const idx = order.indexOf(t.status);
                                                        const nextStatus = order[(idx + 1) % order.length];
                                                        await supabase.from("calendar_tasks").update({ status: nextStatus }).eq("id", t.id);
                                                        setTasks(prev => prev.map(task => task.id === t.id ? { ...task, status: nextStatus } : task));
                                                    }}
                                                    className={cn(
                                                        "text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-full border transition-colors flex items-center gap-1 shrink-0",
                                                        t.status === "da_fare" ? "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10" :
                                                            t.status === "fatta" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20" :
                                                                t.status === "sospesa" ? "bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20" :
                                                                    "bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20"
                                                    )}
                                                >
                                                    {t.status === "da_fare" ? <Circle className="w-3 h-3" /> : t.status === "fatta" ? <CheckCircle2 className="w-3 h-3" /> : t.status === "sospesa" ? <PauseCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                                                    {t.status === "abbandonata" ? "Abbandonata" : t.status.replace("_", " ")}
                                                </button>
                                            </div>

                                            {expandedTaskId === t.id && (
                                                <div className="mt-3 pt-3 border-t border-white/5 space-y-2 text-xs animate-in slide-in-from-top-2">
                                                    <div className="flex justify-between text-slate-400">
                                                        <span><strong>Creato da:</strong> {t.createdBy}</span>
                                                        <span><strong>Ass.:</strong> {t.assignedToStore ? <span className="text-amber-400">Punto vendita — {t.assignedToStore}</span> : <span className={cn(t.assignedTo === user?.name ? "text-indigo-400 font-medium" : "")}>{t.assignedTo}</span>}</span>
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
                                                    <div className="mt-3 space-y-1.5">
                                                        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Esito / Stato</label>
                                                        <select
                                                            className="glass-input w-full text-xs py-1.5"
                                                            value={t.status}
                                                            onChange={async e => {
                                                                const s = e.target.value as TaskStatus;
                                                                await supabase.from("calendar_tasks").update({ status: s }).eq("id", t.id);
                                                                setTasks(prev => prev.map(task => task.id === t.id ? { ...task, status: s } : task));
                                                            }}
                                                        >
                                                            <option value="da_fare">Da fare</option>
                                                            <option value="fatta">Fatta</option>
                                                            <option value="sospesa">Sospesa</option>
                                                            <option value="abbandonata">Abbandonata</option>
                                                        </select>
                                                        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mt-2">Note esito (salvate con la task)</label>
                                                        <textarea
                                                            className="glass-input w-full resize-none text-xs py-2"
                                                            rows={2}
                                                            placeholder="Aggiungi una nota quando chiudi o aggiorni la task..."
                                                            value={t.outcomeNote ?? ""}
                                                            onChange={async e => {
                                                                const v = e.target.value;
                                                                await supabase.from("calendar_tasks").update({ outcome_note: v }).eq("id", t.id);
                                                                setTasks(prev => prev.map(task => task.id === t.id ? { ...task, outcomeNote: v } : task));
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Divider & Meetings Section */}
                            <hr className="border-white/10 my-4" />

                            <div className="flex items-center justify-between mb-1">
                                <h4 className="font-semibold text-white text-base">
                                    {new Date(selectedDate + "T12:00:00").toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
                                </h4>
                                {canCreateMeeting && (
                                    <button
                                        onClick={() => {
                                            setNewMeeting(prev => ({
                                                ...prev,
                                                date: selectedDate,
                                                startTime: prev.startTime || "09:00",
                                                endTime: prev.endTime || "10:00",
                                            }));
                                            setShowCreateMeetingModal(true);
                                        }}
                                        className="p-1.5 rounded-lg bg-sky-500/20 border border-sky-500/40 text-sky-300 hover:bg-sky-500/30 transition-colors"
                                        title="Nuova riunione"
                                    >
                                        <Users className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                            <h4 className="font-medium text-sky-400 text-sm flex items-center gap-1.5 mb-3">
                                <Video className="w-3.5 h-3.5" />
                                Riunioni
                            </h4>

                            {dateMeetings.length === 0 ? (
                                <div className="flex flex-col items-center justify-center text-slate-500 gap-2">
                                    <p className="text-sm">Nessuna riunione per oggi</p>
                                </div>
                            ) : (
                                <div className="space-y-3 overflow-y-auto custom-scrollbar pr-1 max-h-64">
                                    {dateMeetings.map(m => (
                                        <button
                                            key={m.id}
                                            onClick={() => {
                                                setSelectedMeeting(m);
                                                setShowMeetingDetailModal(true);
                                            }}
                                            className="w-full text-left p-3 rounded-xl bg-white/[0.03] border border-sky-500/20 hover:bg-white/[0.06] transition-all"
                                        >
                                            <div className="flex items-center justify-between mb-1 gap-2">
                                                <span className="text-sm font-semibold text-white truncate max-w-[180px]">
                                                    {m.startTime}–{m.endTime} · {m.title}
                                                </span>
                                                <span className="text-[10px] px-2 py-0.5 rounded-full border border-sky-500/40 text-sky-300 uppercase font-semibold tracking-wider">
                                                    {m.type === "in_person" ? "In presenza" : "Video call"}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-slate-400">
                                                <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] uppercase tracking-wider">
                                                    {m.brand}
                                                </span>
                                                {m.location && (
                                                    <span className="flex items-center gap-1">
                                                        <MapPin className="w-3 h-3" />
                                                        {m.location}
                                                    </span>
                                                )}
                                                {m.link && (
                                                    <span className="flex items-center gap-1">
                                                        <Video className="w-3 h-3" />
                                                        Link
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                                                <Users className="w-3 h-3" />
                                                <span>{m.recipients.length} invitati</span>
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
                                <div className="flex items-center gap-2 text-slate-400 text-xs"><User className="w-3 h-3" />{selectedAppointment.type === "incoming" && selectedAppointment.store ? `Punto vendita: ${selectedAppointment.store}` : `Agente: ${selectedAppointment.agente || "—"}`}</div>
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
                                    onChange={async e => {
                                        const s = e.target.value as AppointmentStatus;
                                        await supabase.from("appointments").update({ status: s }).eq("id", selectedAppointment.id);
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
                                    onChange={async e => {
                                        const v = e.target.value;
                                        await supabase.from("appointments").update({ esito_note: v }).eq("id", selectedAppointment.id);
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
                        {isDateBlocked(selectedDate) && (
                            <div className="mb-4 p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-sm flex items-center gap-2">
                                <Lock className="w-4 h-4 shrink-0" />
                                <span>Questa data è bloccata in agenda. Il centralino non può prenotare appuntamenti in questo giorno.</span>
                            </div>
                        )}
                        <form onSubmit={handleCreateSubmit} className="space-y-4">
                            {/* Type selection: admins choose all 3; agents are locked to Auto-Generato */}
                            {isCallCenter ? (
                                <div className="flex gap-3">
                                    {(["incoming", "outgoing", "self_generated"] as const).map(t => (
                                        <button key={t} type="button"
                                            onClick={() => setNewAppt(p => ({ ...p, type: t, agente: t === "incoming" ? "" : p.agente }))}
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
                                {/* Inbound: only store, no agent. Outgoing/self_generated: agent required for admin */}
                                {newAppt.type !== "incoming" && (
                                    isCallCenter ? (
                                        <div>
                                            <label className="block text-xs font-medium text-slate-400 mb-1.5">Agente *</label>
                                            <select className="glass-input w-full" value={newAppt.agente} onChange={e => setNewAppt(p => ({ ...p, agente: e.target.value }))} required>
                                                <option value="">Seleziona...</option>
                                                {agents.map(a => <option key={a} value={a}>{a}</option>)}
                                            </select>
                                        </div>
                                    ) : (
                                        <div>
                                            <label className="block text-xs font-medium text-slate-400 mb-1.5">Agente</label>
                                            <input className="glass-input w-full" value={newAppt.agente} readOnly />
                                        </div>
                                    )
                                )}
                            </div>
                            {newAppt.type === "incoming" && (
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Punto vendita *</label>
                                    <select className="glass-input w-full" value={newAppt.store} onChange={e => setNewAppt(p => ({ ...p, store: e.target.value }))} required>
                                        <option value="">Seleziona punto vendita...</option>
                                        {storeNames.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                    <p className="text-xs text-slate-500 mt-1">Per gli appuntamenti inbound si seleziona solo il punto vendita.</p>
                                </div>
                            )}
                            {newAppt.type === "outgoing" && (
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Indirizzo cliente *</label>
                                    <input type="text" className="glass-input w-full" placeholder="Via, Numero civico, Città" value={newAppt.customerAddress} onChange={e => setNewAppt(p => ({ ...p, customerAddress: e.target.value }))} required />
                                </div>
                            )}


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

                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">Assegna a *</label>
                                <div className="flex gap-3 mb-2">
                                    <button type="button" onClick={() => setNewTask(p => ({ ...p, assignedToStore: undefined, assignedTo: p.assignedTo || user?.name || "" }))}
                                        className={cn("flex-1 py-2 rounded-xl border text-sm font-medium", !newTask.assignedToStore ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-300" : "bg-white/5 border-white/10 text-slate-400")}>
                                        Operatore
                                    </button>
                                    <button type="button" onClick={() => setNewTask(p => ({ ...p, assignedToStore: storeNames[0] ?? "", assignedTo: "" }))}
                                        className={cn("flex-1 py-2 rounded-xl border text-sm font-medium", newTask.assignedToStore ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-300" : "bg-white/5 border-white/10 text-slate-400")}>
                                        Punto vendita
                                    </button>
                                </div>
                                {newTask.assignedToStore ? (
                                    <select className="glass-input w-full" value={newTask.assignedToStore} onChange={e => setNewTask(p => ({ ...p, assignedToStore: e.target.value }))} required>
                                        {storeNames.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                ) : (
                                    isCallCenter ? (
                                        <select className="glass-input w-full" value={newTask.assignedTo} onChange={e => setNewTask(p => ({ ...p, assignedTo: e.target.value }))} required>
                                            <option value="">Seleziona operatore...</option>
                                            <option value={user?.name}>{user?.name} (Tu)</option>
                                            <optgroup label="Altri">
                                                {agents.filter(a => a !== user?.name).map(a => <option key={a} value={a}>{a}</option>)}
                                            </optgroup>
                                        </select>
                                    ) : (
                                        <input className="glass-input w-full text-slate-400 bg-white/5" value={newTask.assignedTo || user?.name || ""} readOnly />
                                    )
                                )}
                                {newTask.assignedToStore && <p className="text-xs text-slate-500 mt-1">La task sarà visibile a tutti gli utenti del punto vendita.</p>}
                            </div>

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

            {/* Create Meeting Modal */}
            {showCreateMeetingModal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    onClick={() => setShowCreateMeetingModal(false)}
                >
                    <div
                        className="glass-card p-6 w-full max-w-2xl animate-in slide-in-from-bottom-4 zoom-in-95 duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="text-lg font-bold text-sky-300">Nuova riunione</h3>
                                <p className="text-sm text-slate-500">
                                    Crea una riunione per uno o più operatori / punti vendita.
                                </p>
                            </div>
                            <button
                                onClick={() => setShowCreateMeetingModal(false)}
                                className="text-slate-500 hover:text-slate-300 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleCreateMeetingSubmit} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Titolo riunione *</label>
                                    <input
                                        type="text"
                                        className="glass-input w-full"
                                        placeholder="Es. Allineamento mensile Wind3"
                                        value={newMeeting.title}
                                        onChange={e => setNewMeeting(p => ({ ...p, title: e.target.value }))}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Brand *</label>
                                    <select
                                        className="glass-input w-full"
                                        value={newMeeting.brand}
                                        onChange={e => handleMeetingBrandChange(e.target.value)}
                                        required
                                    >
                                        <option value="">Seleziona brand...</option>
                                        {MEETING_BRANDS.map(b => (
                                            <option key={b} value={b}>
                                                {b}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Data *</label>
                                    <input
                                        type="date"
                                        className="glass-input w-full"
                                        value={newMeeting.date || (selectedDate ?? "")}
                                        onChange={e => setNewMeeting(p => ({ ...p, date: e.target.value }))}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Ora inizio *</label>
                                    <input
                                        type="time"
                                        className="glass-input w-full"
                                        value={newMeeting.startTime}
                                        onChange={e => setNewMeeting(p => ({ ...p, startTime: e.target.value }))}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Ora fine *</label>
                                    <input
                                        type="time"
                                        className="glass-input w-full"
                                        value={newMeeting.endTime}
                                        onChange={e => setNewMeeting(p => ({ ...p, endTime: e.target.value }))}
                                        required
                                    />
                                </div>
                            </div>

                            {/* Meeting type */}
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">Tipologia riunione *</label>
                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setNewMeeting(p => ({ ...p, type: "in_person" }))}
                                        className={cn(
                                            "flex-1 py-2 rounded-xl border text-sm font-medium flex items-center justify-center gap-2",
                                            newMeeting.type === "in_person"
                                                ? "bg-sky-500/20 border-sky-500/50 text-sky-200"
                                                : "bg-white/5 border-white/10 text-slate-400"
                                        )}
                                    >
                                        <MapPin className="w-4 h-4" />
                                        In presenza
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setNewMeeting(p => ({ ...p, type: "video_call" }))}
                                        className={cn(
                                            "flex-1 py-2 rounded-xl border text-sm font-medium flex items-center justify-center gap-2",
                                            newMeeting.type === "video_call"
                                                ? "bg-sky-500/20 border-sky-500/50 text-sky-200"
                                                : "bg-white/5 border-white/10 text-slate-400"
                                        )}
                                    >
                                        <Video className="w-4 h-4" />
                                        Video call
                                    </button>
                                </div>
                            </div>

                            {newMeeting.type === "in_person" && (
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Indirizzo riunione *</label>
                                    <input
                                        type="text"
                                        className="glass-input w-full"
                                        placeholder="Via, numero civico, città"
                                        value={newMeeting.location}
                                        onChange={e => setNewMeeting(p => ({ ...p, location: e.target.value }))}
                                        required
                                    />
                                </div>
                            )}

                            {newMeeting.type === "video_call" && (
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Link video call *</label>
                                    <input
                                        type="url"
                                        className="glass-input w-full"
                                        placeholder="https://..."
                                        value={newMeeting.link}
                                        onChange={e => setNewMeeting(p => ({ ...p, link: e.target.value }))}
                                        required
                                    />
                                </div>
                            )}

                            {/* Recipients */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider">
                                        Destinatari
                                    </label>
                                    <span className="text-[11px] text-slate-500">
                                        Seleziona uno o più operatori o interi punti vendita.
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-52 overflow-y-auto custom-scrollbar pr-1">
                                    <div>
                                        <p className="text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
                                            <Users className="w-3 h-3" />
                                            Operatori
                                        </p>
                                        <div className="space-y-1.5">
                                            {meetingUsers.map(u => {
                                                const checked = !!newMeeting.recipients.find(r => r.id === u.id);
                                                return (
                                                    <button
                                                        key={u.id}
                                                        type="button"
                                                        onClick={() => handleToggleRecipient(u.id)}
                                                        className={cn(
                                                            "w-full flex items-center justify-between px-2 py-1.5 rounded-lg border text-xs",
                                                            checked
                                                                ? "bg-sky-500/15 border-sky-500/40 text-sky-100"
                                                                : "bg-white/5 border-white/10 text-slate-300"
                                                        )}
                                                    >
                                                        <span className="flex flex-col text-left">
                                                            <span className="font-medium">{u.name}</span>
                                                            <span className="text-[10px] text-slate-500">{u.store}</span>
                                                        </span>
                                                        <span
                                                            className={cn(
                                                                "w-4 h-4 rounded border flex items-center justify-center text-[10px]",
                                                                checked ? "bg-sky-500 border-sky-400" : "border-slate-500"
                                                            )}
                                                        >
                                                            {checked ? "✓" : ""}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div>
                                        <p className="text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
                                            <MapPin className="w-3 h-3" />
                                            Punti vendita (selezione rapida)
                                        </p>
                                        <div className="space-y-1.5">
                                            {storeNames.map(store => (
                                                <button
                                                    key={store}
                                                    type="button"
                                                    onClick={() => {
                                                        const storeUsers = meetingUsers.filter(u => u.store === store);
                                                        storeUsers.forEach(u => {
                                                            handleToggleRecipient(u.id);
                                                        });
                                                    }}
                                                    className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg border bg-white/5 border-white/10 text-xs text-slate-300 hover:bg-white/10"
                                                >
                                                    <span>{store}</span>
                                                    <span className="text-[10px] text-slate-500">
                                                        {meetingUsers.filter(u => u.store === store).length} operatori
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">Note</label>
                                <textarea
                                    className="glass-input w-full resize-none text-sm"
                                    rows={3}
                                    placeholder="Ordine del giorno, obiettivi, materiali..."
                                    value={newMeeting.notes}
                                    onChange={e => setNewMeeting(p => ({ ...p, notes: e.target.value }))}
                                />
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateMeetingModal(false)}
                                    className="flex-1 h-10 rounded-xl font-medium bg-white/5 text-slate-300 hover:bg-white/10 transition-colors text-sm"
                                >
                                    Annulla
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 h-10 rounded-xl font-medium bg-sky-500 text-white hover:bg-sky-600 transition-colors shadow-lg shadow-sky-500/20 text-sm"
                                >
                                    Salva riunione
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Meeting Detail Modal */}
            {showMeetingDetailModal && selectedMeeting && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    onClick={() => setShowMeetingDetailModal(false)}
                >
                    <div
                        className="glass-card p-6 w-full max-w-xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="text-lg font-bold text-sky-300">Dettaglio riunione</h3>
                                <p className="text-xs text-slate-500">
                                    {selectedMeeting.date} · {selectedMeeting.startTime}–{selectedMeeting.endTime}
                                </p>
                            </div>
                            <button
                                onClick={() => setShowMeetingDetailModal(false)}
                                className="text-slate-500 hover:text-slate-300"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-3 text-sm">
                            <div className="flex items-center justify-between">
                                <div className="flex flex-col">
                                    <span className="text-white font-semibold">{selectedMeeting.title}</span>
                                    <span className="text-[11px] text-slate-400 mt-0.5">
                                        Brand: {selectedMeeting.brand}
                                    </span>
                                </div>
                                <span className="px-2.5 py-1 rounded-full border border-sky-500/40 text-sky-300 text-[11px] uppercase tracking-wider flex items-center gap-1">
                                    {selectedMeeting.type === "in_person" ? (
                                        <>
                                            <MapPin className="w-3 h-3" />
                                            In presenza
                                        </>
                                    ) : (
                                        <>
                                            <Video className="w-3 h-3" />
                                            Video call
                                        </>
                                    )}
                                </span>
                            </div>

                            {selectedMeeting.location && (
                                <div className="flex items-center gap-2 text-slate-300 text-xs">
                                    <MapPin className="w-3.5 h-3.5 text-slate-500" />
                                    {selectedMeeting.location}
                                </div>
                            )}
                            {selectedMeeting.link && (
                                <div className="flex items-center gap-2 text-slate-300 text-xs">
                                    <Video className="w-3.5 h-3.5 text-slate-500" />
                                    <a
                                        href={selectedMeeting.link}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="underline text-sky-300 hover:text-sky-200 break-all"
                                    >
                                        {selectedMeeting.link}
                                    </a>
                                </div>
                            )}

                            {selectedMeeting.notes && (
                                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 text-slate-400 text-xs">
                                    <p className="font-medium text-slate-500 mb-1 uppercase tracking-wider text-[10px]">
                                        Note riunione
                                    </p>
                                    {selectedMeeting.notes}
                                </div>
                            )}

                            {/* Recipients & confirmations */}
                            <div className="mt-2">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                        <Users className="w-3 h-3" />
                                        Invitati
                                    </p>
                                    <div className="text-[11px] text-slate-500 flex gap-2">
                                        <span>
                                            ✅ {selectedMeeting.recipients.filter(r => r.status === "confirmed").length}
                                        </span>
                                        <span>
                                            ⏳ {selectedMeeting.recipients.filter(r => r.status === "invited").length}
                                        </span>
                                        <span>
                                            ❌ {selectedMeeting.recipients.filter(r => r.status === "declined").length}
                                        </span>
                                    </div>
                                </div>

                                <div className="space-y-1.5 max-h-52 overflow-y-auto custom-scrollbar pr-1">
                                    {selectedMeeting.recipients.length === 0 && (
                                        <p className="text-xs text-slate-500">
                                            Nessun invitato selezionato.
                                        </p>
                                    )}
                                    {selectedMeeting.recipients.map(rec => {
                                        const isSelf = user?.name === rec.name;
                                        const baseClasses =
                                            "flex items-center justify-between px-3 py-1.5 rounded-lg border text-xs";
                                        const statusLabel =
                                            rec.status === "confirmed"
                                                ? "Confermato"
                                                : rec.status === "declined"
                                                    ? "Rifiutato"
                                                    : "Invitato";
                                        const statusClasses =
                                            rec.status === "confirmed"
                                                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-200"
                                                : rec.status === "declined"
                                                    ? "bg-rose-500/15 border-rose-500/40 text-rose-200"
                                                    : "bg-white/5 border-white/10 text-slate-200";

                                        return (
                                            <div
                                                key={rec.id}
                                                className={cn(baseClasses, statusClasses)}
                                            >
                                                <div className="flex flex-col">
                                                    <span className={cn("font-medium", isSelf && "text-sky-200")}>
                                                        {rec.name}
                                                        {isSelf && " (Tu)"}
                                                    </span>
                                                    {rec.store && (
                                                        <span className="text-[10px] text-slate-500">
                                                            {rec.store}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] uppercase tracking-wider">
                                                        {statusLabel}
                                                    </span>
                                                    {isSelf && (
                                                        <div className="flex gap-1.5">
                                                            <button
                                                                type="button"
                                                                onClick={async () => {
                                                                    const updated = selectedMeeting.recipients.map(r =>
                                                                        r.id === rec.id ? { ...r, status: "confirmed" as const } : r
                                                                    );
                                                                    await supabase.from("calendar_meetings").update({ recipients: updated }).eq("id", selectedMeeting.id);
                                                                    setMeetings(prev =>
                                                                        prev.map(m => m.id === selectedMeeting.id ? { ...m, recipients: updated } : m)
                                                                    );
                                                                    setSelectedMeeting({ ...selectedMeeting, recipients: updated });
                                                                }}
                                                                className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-200 text-[10px] hover:bg-emerald-500/30"
                                                            >
                                                                Conferma
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={async () => {
                                                                    const updated = selectedMeeting.recipients.map(r =>
                                                                        r.id === rec.id ? { ...r, status: "declined" as const } : r
                                                                    );
                                                                    await supabase.from("calendar_meetings").update({ recipients: updated }).eq("id", selectedMeeting.id);
                                                                    setMeetings(prev =>
                                                                        prev.map(m => m.id === selectedMeeting.id ? { ...m, recipients: updated } : m)
                                                                    );
                                                                    setSelectedMeeting({ ...selectedMeeting, recipients: updated });
                                                                }}
                                                                className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-200 text-[10px] hover:bg-rose-500/30"
                                                            >
                                                                Rifiuta
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Block Agenda Modal (agents only) */}
            {showBlockAgendaModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowBlockAgendaModal(false)}>
                    <div className="glass-card p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <Lock className="w-5 h-5 text-amber-400" />
                                Blocca agenda
                            </h3>
                            <button onClick={() => setShowBlockAgendaModal(false)} className="text-slate-500 hover:text-slate-300"><X className="w-5 h-5" /></button>
                        </div>
                        <p className="text-sm text-slate-400 mb-4">Le date bloccate impediscono al centralino di prenotare appuntamenti. Inserire sempre il motivo.</p>
                        <form onSubmit={handleBlockAgendaSubmit} className="space-y-4">
                            <div className="flex gap-3">
                                <button type="button" onClick={() => setBlockAgendaForm(p => ({ ...p, mode: "single" }))}
                                    className={cn("flex-1 py-2 rounded-xl border text-sm font-medium", blockAgendaForm.mode === "single" ? "bg-amber-500/20 border-amber-500/50 text-amber-300" : "bg-white/5 border-white/10 text-slate-400")}>
                                    Singolo giorno
                                </button>
                                <button type="button" onClick={() => setBlockAgendaForm(p => ({ ...p, mode: "range" }))}
                                    className={cn("flex-1 py-2 rounded-xl border text-sm font-medium", blockAgendaForm.mode === "range" ? "bg-amber-500/20 border-amber-500/50 text-amber-300" : "bg-white/5 border-white/10 text-slate-400")}>
                                    Intervallo
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Data inizio *</label>
                                    <input type="date" className="glass-input w-full" value={blockAgendaForm.startDate} onChange={e => setBlockAgendaForm(p => ({ ...p, startDate: e.target.value }))} required />
                                </div>
                                {blockAgendaForm.mode === "range" && (
                                    <div>
                                        <label className="block text-xs font-medium text-slate-400 mb-1.5">Data fine *</label>
                                        <input type="date" className="glass-input w-full" value={blockAgendaForm.endDate} onChange={e => setBlockAgendaForm(p => ({ ...p, endDate: e.target.value }))} min={blockAgendaForm.startDate} required={blockAgendaForm.mode === "range"} />
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">Motivo / nota *</label>
                                <textarea className="glass-input w-full resize-none" rows={3} placeholder="Es. Ferie, Formazione, Chiusura negozio..." value={blockAgendaForm.note} onChange={e => setBlockAgendaForm(p => ({ ...p, note: e.target.value }))} required />
                            </div>
                            <div className="flex gap-3 pt-1">
                                <button type="button" onClick={() => setShowBlockAgendaModal(false)} className="flex-1 h-10 rounded-xl font-medium bg-white/5 text-slate-300 hover:bg-white/10 text-sm">Annulla</button>
                                <button type="submit" className="flex-1 h-10 rounded-xl font-medium bg-amber-500 text-white hover:bg-amber-600 text-sm">Blocca agenda</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
