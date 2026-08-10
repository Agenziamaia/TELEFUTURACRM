"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { SelectPersona, SelectOpzioni, SelectMulti } from "@/components/SelectPersona";
import { IndirizzoAutocomplete, civicoMancante, sembraVia } from "@/components/IndirizzoAutocomplete";
import { ChevronLeft, ChevronRight, Plus, X, Phone, MapPin, User, Clock, Search, Bell, Circle, CheckCircle2, PauseCircle, ChevronDown, ChevronUp, CheckSquare, Calendar, Lock, XCircle, Users, Video } from "lucide-react";
import { cn } from "@/utils";
import { usePageView } from "@/lib/pageView";
import { useAuth } from "@/context/AuthContext";
import { DatePickerInput } from "@/components/DatePickerInput";
import { supabase } from "@/lib/supabaseClient";
import { numeroNazionale } from "@/lib/telefono";
import { seesAllStores, seesWholeStore } from "@/lib/roles";
import { useVisibleStores, sameStore } from "@/lib/visibleStores";
import { useCallers } from "@/lib/org";
import { useRolePermissions } from "@/lib/usePermissions";
import { capChoice, CAP_CALENDARIO_VISTA, CAP_CALENDARIO_TASK } from "@/lib/capabilities";
import { fasciaLabel, fasciaStart, eFascia } from "@/lib/fasce";
import { RicercaCliente } from "@/components/RicercaCliente";

// Tipi degli appuntamenti (i dati arrivano da Supabase, vedi fetch piu' sotto).
// "richiamo" = richiamo telefonico fissato dal call center (Luca 31/07): nasce
// dall'esito Caller, non dal modale di creazione; lo vede chi lo ha fissato e
// la direzione CC (regole di visibilita' gia' in visibleAppointments).
type AppointmentType = "incoming" | "outgoing" | "self_generated" | "richiamo";
type AppointmentStatus = "scheduled" | "attivato" | "ko" | "in_gestione" | "da_richiamare" | "da_rifissare" | "annullato";

interface Appointment {
    id: number;
    date: string; // "YYYY-MM-DD"
    time: string;
    /** mattina | pomeriggio (mig. 118): fascia al posto dell'orario preciso —
     *  time resta l'inizio fascia come orario tecnico di ordinamento */
    fascia?: string;
    type: AppointmentType;
    agente: string;
    store?: string;
    customerAddress?: string;
    customerName: string;
    customerPhone: string;
    cfPiva?: string;
    tipoCliente?: string;   // consumer | business (etichetta CF vs P.IVA)
    // REFERENTE business (Luca 03/08): stessi obbligatori dell'anagrafica
    // clienti — nome e cognome referente obbligatori, CF referente facoltativo
    referenteNome?: string;
    referenteCognome?: string;
    referenteCf?: string;
    notes: string;
    esitoNote?: string;
    status: AppointmentStatus;
    /** chi ha FISSATO l'appuntamento (l'agente/consulente e' l'incaricato) */
    createdBy?: string;
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
// il brand della riunione ("Wind3") e quello degli operatori (user_brands:
// "WindTre") non coincidono alla lettera: confronto TOLLERANTE (Luca 31/07,
// caso Wind3 oscurato nella selezione rapida)
function brandCoincide(a: string, b: string): boolean {
    const n = (s: string) => s.toLowerCase().replace(/[\s/]/g, "");
    const w3 = (s: string) => s === "wind3" || s === "windtre" || s === "w3";
    const x = n(a), y = n(b);
    return x === y || (w3(x) && w3(y));
}

// id e' l'uuid di app_users (gli operatori arrivano dagli utenti reali, non piu'
// dalla tabella seed calendar_operators).
type MeetingUser = { id: string; name: string; store: string; brands: string[] };

// ── TENDINA MULTI-SELEZIONE per i filtri del calendario (Luca 05/08) ─────────
// «Chi vede più negozi o più consulenti deve avere il filtro … con una tendina
// a selezione multipla.» Stesso pattern del FiltroMulti di Ricerca Vendite
// (RIC-06): convenzione values === null → TUTTO selezionato (default, nessun
// filtro); array → insieme scelto; array VUOTO → niente spuntato = zero
// risultati. Spuntare di nuovo TUTTE le voci ricompatta a null. In testa
// "Seleziona/Deseleziona tutto"; sul bottone la chip riassuntiva.
// Componente a livello di MODULO, mai dentro la pagina (regola segnalazione
// 71: identità stabile, niente rimontaggi). Menu in PORTAL con classe
// select-persona-menu (i glass-panel creano stacking context separati e il
// tema chiaro la ristila da globals.css — Luca 30/07).
function FiltroMulti({ values, onChange, opzioni, className = "", disabled = false,
    etichettaTutti = "Tutti", testoDisabilitato }: {
    values: string[] | null;
    onChange: (v: string[] | null) => void;
    opzioni: readonly string[];
    className?: string;
    disabled?: boolean;
    etichettaTutti?: string;          // chip nello stato "tutto selezionato"
    testoDisabilitato?: string;       // chip quando la tendina e' spenta (motivo)
}) {
    const [aperta, setAperta] = useState(false);
    const [testo, setTesto] = useState("");
    const box = useRef<HTMLDivElement | null>(null);
    const menu = useRef<HTMLDivElement | null>(null);
    const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

    // chiusura al click fuori (campo E tendina: la tendina sta nel portal) + Esc
    useEffect(() => {
        if (!aperta) return;
        const h = (e: MouseEvent) => {
            const t = e.target as Node;
            if (box.current && !box.current.contains(t) && !(menu.current && menu.current.contains(t))) {
                setAperta(false); setTesto("");
            }
        };
        const k = (e: KeyboardEvent) => { if (e.key === "Escape") { setAperta(false); setTesto(""); } };
        document.addEventListener("mousedown", h);
        document.addEventListener("keydown", k);
        return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
    }, [aperta]);

    // posizione della tendina agganciata al campo, viva su scroll/resize
    useEffect(() => {
        if (!aperta) { setPos(null); return; }
        const update = () => {
            const r = box.current?.getBoundingClientRect();
            if (r) setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 230) });
        };
        update();
        window.addEventListener("scroll", update, true);
        window.addEventListener("resize", update);
        return () => { window.removeEventListener("scroll", update, true); window.removeEventListener("resize", update); };
    }, [aperta]);

    const tutte = values === null;
    const spuntata = (o: string) => tutte || (values as string[]).includes(o);
    const toggle = (o: string) => {
        if (values === null) { onChange(opzioni.filter((x) => x !== o)); return; } // dal "tutto" si toglie la prima voce
        const next = values.includes(o) ? values.filter((x) => x !== o) : [...values, o];
        onChange(opzioni.length > 0 && opzioni.every((x) => next.includes(x)) ? null : next);
    };

    const chip = disabled ? (testoDisabilitato ?? etichettaTutti)
        : tutte ? etichettaTutti
        : values.length === 0 ? "Nessuno selezionato"
        : values.length === 1 ? values[0]
        : `${values.length} selezionati`;

    // ricerca interna (stesso match di SelectPersona: inclusione o iniziali)
    const q = testo.trim().toLowerCase();
    const filtrate = !q ? opzioni : opzioni.filter((n) => {
        const nome = n.toLowerCase();
        if (nome.includes(q)) return true;
        const parole = nome.split(/\s+/);
        return q.split(/\s+/).every((t) => parole.some((p) => p.startsWith(t)));
    });

    const menuBody = pos ? (
        <div ref={menu}
            className="select-persona-menu fixed z-[4000] rounded-xl border border-white/15 bg-[#161a2c] shadow-2xl shadow-black/60 overflow-hidden"
            style={{ top: pos.top, left: pos.left, width: pos.width }}>
            <button type="button"
                onMouseDown={(e) => { e.preventDefault(); onChange(tutte ? [] : null); }}
                className="w-full text-left px-3.5 py-2.5 text-xs font-bold uppercase tracking-wider text-indigo-300 hover:bg-indigo-500/20 border-b border-white/10">
                {tutte ? "Deseleziona tutto" : "Seleziona tutto"}
            </button>
            {opzioni.length > 8 && (
                <div className="p-2 border-b border-white/10">
                    <input value={testo} onChange={(e) => setTesto(e.target.value)}
                        placeholder="Scrivi per filtrare…" autoFocus
                        className="glass-input w-full text-sm" />
                </div>
            )}
            <div className="max-h-64 overflow-y-auto divide-y divide-white/5">
                {filtrate.length > 0 ? filtrate.map((n) => {
                    const sel = spuntata(n);
                    return (
                        <button key={n} type="button"
                            onMouseDown={(e) => { e.preventDefault(); toggle(n); }}
                            className={`w-full text-left px-3.5 py-2.5 text-sm transition-colors hover:bg-indigo-500/20 flex items-center gap-2 ${sel ? "text-indigo-300 font-bold" : "text-slate-100"}`}>
                            <span className={`w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center text-[9px] ${sel ? "border-indigo-400 bg-indigo-500/40" : "border-slate-600"}`}>{sel ? "✓" : ""}</span>
                            <span className="truncate">{n}</span>
                        </button>
                    );
                }) : (
                    <div className="px-3.5 py-2.5 text-sm text-slate-500">Nessuna voce corrispondente</div>
                )}
            </div>
        </div>
    ) : null;

    return (
        <div ref={box} className="relative">
            <button type="button" disabled={disabled} onClick={() => setAperta((v) => !v)}
                className={(className || "glass-input w-full text-sm") + " flex items-center justify-between gap-2 text-left disabled:opacity-50"}>
                <span className={"truncate " + (disabled || tutte ? "text-slate-400" : "text-white font-semibold")}>{chip}</span>
                <ChevronDown className={"w-4 h-4 shrink-0 text-slate-400 transition-transform " + (aperta ? "rotate-180" : "")} />
            </button>
            {aperta && !disabled && typeof document !== "undefined" && menuBody && createPortal(menuBody, document.body)}
        </div>
    );
}

function mapAppointmentRow(r: Record<string, unknown>): Appointment {
    return {
        id: Number(r.id),
        date: r.date as string,
        time: r.time as string,
        fascia: (r.fascia as string) || undefined,
        type: r.type as AppointmentType,
        agente: (r.agente as string) ?? "",
        store: r.store as string | undefined,
        customerAddress: r.customer_address as string | undefined,
        customerName: r.customer_name as string,
        customerPhone: r.customer_phone as string,
        cfPiva: r.cf_piva as string | undefined,
        tipoCliente: (r.tipo_cliente as string | undefined) || undefined,
        referenteNome: (r.referente_nome as string | undefined) || undefined,
        referenteCognome: (r.referente_cognome as string | undefined) || undefined,
        referenteCf: (r.referente_cf as string | undefined) || undefined,
        notes: (r.notes as string) ?? "",
        esitoNote: r.esito_note as string | undefined,
        status: r.status as AppointmentStatus,
        createdBy: (r.created_by as string) || undefined,
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
    // MOD-26: il pannello ricerca dedicato non esiste più — i filtri sono unificati
    // pannello elenco TASK ARRETRATE (Luca 04/08, riporto stile Google)
    const [showArretrate, setShowArretrate] = useState(false);
    // filtri del MODALE arretrate (Luca 05/08): solo per chi vede task altrui
    // — stessa convenzione FiltroMulti (null = tutto / array = scelti)
    const [arrFiltroNegozi, setArrFiltroNegozi] = useState<string[] | null>(null);
    const [arrFiltroPersone, setArrFiltroPersone] = useState<string[] | null>(null);
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

    // MOD-8 (Luca 08/08): il negozio esita un appuntamento come "Da richiamare" →
    // fissa il giorno → si genera un appuntamento telefonico (type "richiamo") al
    // caller che l'aveva fissato e la pratica torna nella sua coda del call center.
    const [richiamoNegozio, setRichiamoNegozio] = useState<{ date: string; fascia: string; time: string }>({ date: "", fascia: "mattina", time: "" });
    const [richiamoNegozioBusy, setRichiamoNegozioBusy] = useState(false);
    const [richiamoNegozioEsito, setRichiamoNegozioEsito] = useState<string | null>(null);

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
        tipoCliente: "consumer" as "consumer" | "business",
        referenteNome: "",
        referenteCognome: "",
        referenteCf: "",
        notes: "",
    });

    // DETTAGLIO TASK (Luca 31/07): cliccando una task nel calendario centrale
    // (settimana/giorno) o nel pannello a destra si apre il modale — con
    // modifica dei campi e AGGIUNTA di nuovi assegnatari (task gemelle)
    const [taskDettaglio, setTaskDettaglio] = useState<CalendarTask | null>(null);
    // ASSEGNAZIONE MULTIPLA (Luca 31/07): la stessa task si assegna a piu'
    // operatori o piu' punti vendita — si creano N task gemelle, una a testa
    const [taskModo, setTaskModo] = useState<"persone" | "negozi">("persone");
    const [taskPersone, setTaskPersone] = useState<string[]>([]);
    const [taskNegozi, setTaskNegozi] = useState<string[]>([]);
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
    // ricerca nei destinatari della riunione (Luca 31/07): con tanti utenti
    // e negozi le liste vanno filtrate scrivendo
    const [cercaOperatore, setCercaOperatore] = useState("");
    const [cercaNegozio, setCercaNegozio] = useState("");
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

    // Operatori a cui posso assegnare una task: tutti se vedo tutti i negozi,
    // altrimenti solo i colleghi del mio punto vendita. Il confronto e' sul
    // prefisso perche' i nomi non coincidono sempre ("Magliana" / "Magliana Multi").
    // Negozi di cui l'utente e' responsabile: puo' esserne piu' d'uno
    // (segnalazione 62 — Emanuele: Magliana Multi + Magliana W3). Dalla FONTE
    // UNICA della visibilita' (primary + user_stores + user_store_visibility):
    // prima mancava user_store_visibility, quindi la visibilita' data dall'admin
    // qui non valeva.
    const { seesAll: seesAllVis, stores: myStores } = useVisibleStores();
    // negozi di riferimento per i confronti (fallback sul primary se lista vuota)
    const mieiNegozi = myStores.length ? myStores : (user?.negozio ? [user.negozio] : []);

    const assignableAgents = useMemo(() => {
        if (seesAllVis) return agents;
        const mine = (myStores.length ? myStores : [user?.negozio || ""])
            .map(x => x.trim().toLowerCase()).filter(Boolean);
        if (!mine.length) return agents;
        const same = (st: string) => mine.some(m => st === m || st.startsWith(m) || m.startsWith(st));
        return [...new Set(calendarOperators
            .filter(o => { const st = (o.store || "").trim().toLowerCase(); return !!st && same(st); })
            .map(o => o.name))].sort();
    }, [agents, calendarOperators, seesAllVis, myStores, user?.negozio]);

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
    const [searchDateFrom, setSearchDateFrom] = useState("");
    const [searchDateTo, setSearchDateTo] = useState("");

    // Filtri della griglia — TUTTI MULTI-SELEZIONE (Luca 05/08, FiltroMulti):
    // convenzione null = tutto selezionato (nessun filtro, default); array =
    // insieme scelto; array vuoto = niente spuntato = zero risultati.
    const [filterStores, setFilterStores] = useState<string[] | null>(null);
    const [filterAgents, setFilterAgents] = useState<string[] | null>(null);
    // chi ha FISSATO l'appuntamento (non l'incaricato) — multi per coerenza
    const [filterCreatedBys, setFilterCreatedBys] = useState<string[] | null>(null);
    // Filtro CATEGORIE (i "pallini" in alto, cliccabili — per tutti i ruoli):
    // vuoto = tutto; altrimenti si vede solo cio' che e' selezionato.
    const [catFilter, setCatFilter] = useState<string[]>([]);
    const toggleCat = (c: string) => setCatFilter((p) => p.includes(c) ? p.filter((x) => x !== c) : [...p, c]);
    const catOn = (c: string) => catFilter.length === 0 || catFilter.includes(c);
    // (Dates aren't fully wired yet in the generic mock)

    // Outcome filters
    const [appointmentOutcomeFilter, setAppointmentOutcomeFilter] = useState<AppointmentStatus | "">("");
    const [taskOutcomeFilter, setTaskOutcomeFilter] = useState<TaskStatus | "">("");

    // ── ESITI AMMINISTRABILI (mig. 106, Luca 30/07): etichette, colori e
    // scelte per TIPO (negozio/domicilio/task) arrivano da calendario_esiti
    // (Amministrazione → Calendario); tabella vuota = default di codice.
    // La CHIAVE resta quella salvata sulle righe: le voci spente non si
    // propongono piu' ma le righe storiche mantengono etichetta e colore.
    type EsitoDef = { chiave: string; etichetta: string; colore: string; attiva: boolean };
    const [esitiDb, setEsitiDb] = useState<Record<string, EsitoDef[]>>({});
    useEffect(() => {
        supabase.from("calendario_esiti").select("tipo, chiave, etichetta, colore, attiva, ordine").order("ordine")
            .then(({ data }) => {
                if (!data?.length) return;
                const m: Record<string, EsitoDef[]> = {};
                (data as (EsitoDef & { tipo: string })[]).forEach((r) => { (m[r.tipo] ||= []).push(r); });
                setEsitiDb(m);
            });
    }, []);
    const PALETTE: Record<string, string> = {
        blue: "bg-blue-500/20 text-blue-300 border-blue-500/30",
        emerald: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
        rose: "bg-rose-500/20 text-rose-300 border-rose-500/30",
        purple: "bg-purple-500/20 text-purple-300 border-purple-500/30",
        yellow: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
        amber: "bg-amber-100/10 text-amber-200 border-amber-200/30",
        orange: "bg-orange-500/20 text-orange-300 border-orange-500/30",
        sky: "bg-sky-500/20 text-sky-300 border-sky-500/30",
        violet: "bg-violet-500/20 text-violet-300 border-violet-500/30",
        slate: "bg-white/5 text-slate-300 border-white/10",
    };
    const tipoEsiti = (tipo?: string) => tipo === "outgoing" ? "outgoing" : tipo === "task" ? "task" : "incoming";
    const FALLBACK_TASK: EsitoDef[] = [
        { chiave: "da_fare", etichetta: "Da fare", colore: "slate", attiva: true },
        { chiave: "fatta", etichetta: "Fatta", colore: "emerald", attiva: true },
        { chiave: "sospesa", etichetta: "Sospesa", colore: "amber", attiva: true },
        { chiave: "abbandonata", etichetta: "Abbandonata", colore: "rose", attiva: true },
    ];
    /** scelte proponibili (solo voci attive) per il tipo dato */
    const esitiPer = (tipo?: string): EsitoDef[] => {
        const t = tipoEsiti(tipo);
        const db = esitiDb[t];
        if (db?.length) return db.filter((e) => e.attiva);
        if (t === "task") return FALLBACK_TASK;
        return (Object.keys(STATUS_LABELS) as AppointmentStatus[]).map((k) => ({ chiave: k, etichetta: STATUS_LABELS[k], colore: "", attiva: true }));
    };
    const esitoDef = (status: string, tipo?: string) => (esitiDb[tipoEsiti(tipo)] || []).find((e) => e.chiave === status);
    const esitoLabel = (status: string, tipo?: string) =>
        esitoDef(status, tipo)?.etichetta ?? (STATUS_LABELS as Record<string, string>)[status] ?? status;
    const esitoClasse = (status: string, tipo?: string) => {
        const d = esitoDef(status, tipo);
        return (d && PALETTE[d.colore]) || (STATUS_COLORS as Record<string, string>)[status] || PALETTE.slate;
    };
    // ── MOD-8 (Luca 08/08): genera l'appuntamento telefonico al call center dopo
    // che il negozio ha esitato l'appuntamento fisico come "Da richiamare".
    // Crea (o aggiorna, se già esiste) un evento type "richiamo" nel calendario
    // intestato a chi aveva fissato l'appuntamento, e riporta la pratica collegata
    // nella coda del caller (calls.stato = "Da richiamare" + data_richiamo).
    async function generaRichiamoDaNegozio() {
        const a = selectedAppointment;
        if (!a) return;
        if (!richiamoNegozio.date) { setRichiamoNegozioEsito("⚠️ Scegli il giorno del richiamo."); return; }
        setRichiamoNegozioBusy(true);
        setRichiamoNegozioEsito(null);
        try {
            const fasciaR = eFascia(richiamoNegozio.fascia) ? richiamoNegozio.fascia : null;
            const oraTecnica = fasciaR ? fasciaStart(fasciaR)! : (richiamoNegozio.time || "10:00").slice(0, 5);
            const provenienza = `Richiamo richiesto dal negozio${a.store ? ` (${a.store})` : ""} dopo l'appuntamento del ${new Date(a.date + "T12:00:00").toLocaleDateString("it-IT")}`;

            // Pratiche del call center collegate a questo appuntamento fisico. Un
            // business con più contratti può avere più righe sullo stesso
            // appointment_id (matchAppuntamento) → le requeue tutte.
            const { data: linkRows } = await supabase
                .from("calls")
                .select("id, caller, richiamo_event_id")
                .eq("appointment_id", a.id);
            const calls = (linkRows as { id: string; caller?: string | null; richiamo_event_id?: number | null }[] | null) || [];
            // dedup: se una delle pratiche ha già un evento richiamo, riusa quello
            const existingEvt = calls.find(c => c.richiamo_event_id)?.richiamo_event_id || null;
            // intestatario = il caller che lavorava la pratica; ripiego su chi ha
            // fissato l'appuntamento (per gli walk-in senza call collegata).
            const intestatario = calls.find(c => c.caller)?.caller || a.createdBy || "";

            const payload: Record<string, unknown> = {
                date: richiamoNegozio.date,
                time: oraTecnica,
                fascia: fasciaR,
                type: "richiamo",
                store: null,
                agente: "",
                customer_name: a.customerName,
                customer_phone: a.customerPhone,
                cf_piva: a.cfPiva || null,
                notes: [provenienza, a.esitoNote].filter(Boolean).join(" — "),
                status: "scheduled",
                created_by: intestatario,
            };
            const { fascia: _fx, ...payloadLegacy } = payload;   // fallback pre-mig. 118

            let eventId = existingEvt;
            if (existingEvt) {
                let { error } = await supabase.from("appointments").update(payload).eq("id", existingEvt);
                if (error && /column/i.test(error.message || "")) ({ error } = await supabase.from("appointments").update(payloadLegacy).eq("id", existingEvt));
                if (error) throw error;
            } else {
                let { data: ins, error } = await supabase.from("appointments").insert(payload).select("id").single();
                if (error && /column/i.test(error.message || "")) ({ data: ins, error } = await supabase.from("appointments").insert(payloadLegacy).select("id").single());
                if (error) throw error;
                eventId = (ins as { id: number } | null)?.id ?? null;
            }

            // Rimetti OGNI pratica collegata nella coda del suo caller. Se l'update
            // fallisce NON è un successo: va segnalato (bug: prima era silenziato).
            let inCoda = 0;
            let requeueErr: string | null = null;
            for (const c of calls) {
                const upd: Record<string, unknown> = { stato: "Da richiamare", data_richiamo: richiamoNegozio.date, fascia_richiamo: fasciaR };
                if (eventId) upd.richiamo_event_id = eventId;
                let { error } = await supabase.from("calls").update(upd).eq("id", c.id);
                if (error && /column/i.test(error.message || "")) {
                    const { fascia_richiamo: _f, richiamo_event_id: _r, ...legacy } = upd;
                    ({ error } = await supabase.from("calls").update(legacy).eq("id", c.id));
                }
                if (error) requeueErr = error.message; else inCoda++;
            }

            // aggiorna la vista locale del calendario con l'evento richiamo
            if (eventId) {
                const nuovo: Appointment = {
                    id: eventId, date: richiamoNegozio.date, time: oraTecnica, fascia: fasciaR || undefined,
                    type: "richiamo", agente: "", store: undefined,
                    customerName: a.customerName, customerPhone: a.customerPhone, cfPiva: a.cfPiva,
                    notes: String(payload.notes || ""), status: "scheduled", createdBy: intestatario,
                };
                setAppointments(prev => prev.some(x => x.id === eventId) ? prev.map(x => x.id === eventId ? { ...x, ...nuovo } : x) : [...prev, nuovo]);
            }

            const quando = `${new Date(richiamoNegozio.date + "T12:00:00").toLocaleDateString("it-IT")}${fasciaR ? ` · ${fasciaLabel(fasciaR)}` : ""}`;
            const noNumero = !String(a.customerPhone || "").trim() ? " ⚠️ Il cliente non ha un numero in scheda: il caller lo recupera dall'anagrafica." : "";
            if (calls.length === 0) {
                setRichiamoNegozioEsito(`✅ Richiamo fissato per il ${quando} in calendario per ${intestatario || "il call center"}. Nessuna pratica del centralino era collegata a questo appuntamento, quindi non compare nella coda chiamate.${noNumero}`);
            } else if (requeueErr) {
                setRichiamoNegozioEsito(`⚠️ Evento creato, ma ${calls.length - inCoda} pratica/e NON è tornata nella coda del caller: ${requeueErr}`);
            } else {
                setRichiamoNegozioEsito(`✅ Richiamo fissato per il ${quando}. La pratica è tornata nella coda di ${intestatario || "il call center"}.${noNumero}`);
            }
        } catch (e) {
            setRichiamoNegozioEsito("❌ Errore: " + ((e as Error).message || "richiamo non creato"));
        } finally {
            setRichiamoNegozioBusy(false);
        }
    }

    // filtro esiti appuntamenti: unione negozio+domicilio, senza doppioni
    const esitiFiltroAppt = (() => {
        const visti = new Set<string>();
        return [...esitiPer("incoming"), ...esitiPer("outgoing")].filter((e) => {
            if (visti.has(e.chiave)) return false;
            visti.add(e.chiave);
            return true;
        });
    })();

    const prevMonth = () => {
        if (viewMonth === 0) { setViewYear(viewYear - 1); setViewMonth(11); }
        else setViewMonth(viewMonth - 1);
    };
    const nextMonth = () => {
        if (viewMonth === 11) { setViewYear(viewYear + 1); setViewMonth(0); }
        else setViewMonth(viewMonth + 1);
    };

    // ── Vista MESE / SETTIMANA ────────────────────────────────────────────────
    // La settimanale parte sempre dalla settimana in corso (lunedi'); i giorni
    // mostrano gli impegni gia' espansi e cliccabili, il pannello a destra resta.
    const [calView, setCalView] = useState<"month" | "week" | "day">("month");
    // domenica a scomparsa nella vista settimana (Luca 31/07): nascosta, gli
    // altri giorni respirano di piu'
    // Domenica NASCOSTA di default (Luca 05/08): il tasto la rimostra e la
    // scelta resta salvata per utente (localStorage sotto).
    const [mostraDomenica, setMostraDomenica] = useState(false);
    // PREFERENZA PER ACCOUNT (Luca 31/07): la vista scelta (mese/settimana/
    // giorno) e la domenica nascosta restano salvate — niente piu' ritorno
    // al mensile a ogni apertura. Si risalva solo DOPO aver caricato.
    const vistaCaricata = useRef(false);
    useEffect(() => {
        if (!user?.id || vistaCaricata.current) return;
        vistaCaricata.current = true;
        try {
            const raw = localStorage.getItem(`calendario_vista_${user.id}`);
            if (raw) {
                const p = JSON.parse(raw) as { calView?: string; mostraDomenica?: boolean };
                if (p.calView === "month" || p.calView === "week" || p.calView === "day") setCalView(p.calView);
                if (typeof p.mostraDomenica === "boolean") setMostraDomenica(p.mostraDomenica);
            }
        } catch { /* preferenza corrotta: si riparte dal default */ }
    }, [user?.id]);
    useEffect(() => {
        if (!user?.id || !vistaCaricata.current) return;
        try { localStorage.setItem(`calendario_vista_${user.id}`, JSON.stringify({ calView, mostraDomenica })); } catch { /* no-op */ }
    }, [user?.id, calView, mostraDomenica]);
    // VISTA GIORNO (Luca 29/07): fasce orarie in verticale stile Google
    // Calendar — tutto il dettaglio della giornata a colpo d'occhio.
    const [dayDate, setDayDate] = useState(() =>
        `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`);
    const addDays = (dateStr: string, n: number) => {
        const d = new Date(dateStr + "T12:00:00");
        d.setDate(d.getDate() + n);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    const mondayOf = (dateStr: string) => {
        const d = new Date(dateStr + "T12:00:00");
        const dow = (d.getDay() + 6) % 7; // 0 = lunedi'
        return addDays(dateStr, -dow);
    };
    const [weekStart, setWeekStart] = useState(() => mondayOf(
        `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`,
    ));
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const weekLabel = (() => {
        const a = new Date(weekStart + "T12:00:00"), b = new Date(addDays(weekStart, 6) + "T12:00:00");
        const sameM = a.getMonth() === b.getMonth();
        return `${a.getDate()}${sameM ? "" : " " + MONTHS_IT[a.getMonth()]} – ${b.getDate()} ${MONTHS_IT[b.getMonth()]} ${b.getFullYear()}`;
    })();
    // selezione giorno per data (usata dalla vista settimanale e dal pannello)
    const selectDate = (dateStr: string) => {
        setSelectedDate(dateStr);
        setShowCreateModal(false);
        setShowCreateTaskModal(false);
        setShowCreateMeetingModal(false); setCercaOperatore(""); setCercaNegozio("");
        setSelectedAppointment(null);
        setSelectedMeeting(null);
        setShowModal(false);
        setShowMeetingDetailModal(false);
    };

    const daysInMonth = getDaysInMonth(viewYear, viewMonth);
    const firstDay = getFirstDayOfMonth(viewYear, viewMonth);

    // AMBITO DI VISIBILITÀ dalla ROTELLINA (Luca 05/08, caso Alex Coviello:
    // il back office vedeva tutto il call center — ora default "solo i propri").
    // Scelte: tutti / call_center / negozio / propri (fallback). I default
    // fotografano il codice storico: admin+direzione+amministrazione = tutti,
    // direttore_cc = call_center, il resto = negozio.
    const { perms: calPerms } = useRolePermissions(user?.role, user?.grade);
    const vistaCal = capChoice(user?.role, CAP_CALENDARIO_VISTA, calPerms);
    // VISIBILITÀ TASK SEPARATA (Luca 05/08): «oggi è legata a quella del
    // calendario ma devono essere due cose diverse» — rotellina "Calendario —
    // task" (CAP_CALENDARIO_TASK): task_tutte / task_negozio / task_proprie
    // (fallback). Appuntamenti e task ora si governano indipendenti.
    const vistaTask = capChoice(user?.role, CAP_CALENDARIO_TASK, calPerms);
    const isTaskTutte = vistaTask === "task_tutte";
    // Pieni poteri calendario (tutti i filtri: punto vendita, consulente, fissato da)
    const isCallCenter = vistaCal === "tutti";
    // Segnalazione "Non posso assegnare task a nessun collaboratore": l'assegnazione
    // era legata a isCallCenter (solo admin/dev), quindi ogni store manager vedeva
    // una casella in sola lettura col proprio nome. Ora vale la regola del CRM:
    // dallo store manager in su si assegna, ma solo dentro il proprio team.
    const canAssignOthers = seesAllStores(user?.role) || seesWholeStore(user?.role);
    const isAgent = !isCallCenter;
    const canCreateMeeting = seesAllStores(user?.role) || seesWholeStore(user?.role);

    const isDateBlocked = (dateStr: string) =>
        agendaBlocks.some(b => dateStr >= b.startDate && dateStr <= b.endDate);

    // Role-based visibility and Admin Grid Filter
    // TEORIA (Luca 30/07): ognuno vede gli appuntamenti che CREA o che gli
    // APPARTENGONO (assegnati a lui come agente); il team del punto vendita
    // vede gli inbound del suo negozio; il caller vede quelli che ha fissato;
    // la direzione del call center vede tutti quelli presi dal call center.
    const ccStaff = useCallers();
    // "call_center" dalla rotellina (prima era hardcoded direttore_cc + back
    // office; il back office ora parte da "solo i propri" — Luca 05/08)
    const isDirezioneCc = vistaCal === "call_center";
    // visibilità PURA (senza i filtri): serve anche a costruire le opzioni
    // delle tendine, che altrimenti si auto-svuoterebbero filtrando
    const visibileBase = (a: (typeof appointments)[number]) => {
        if (!catOn(a.type)) return false;
        if (isCallCenter) return true;
        // Chi l'ha creato lo vede (il caller vede i SUOI appuntamenti fissati).
        if (a.createdBy && a.createdBy === user?.name) return true;
        // La direzione CC vede tutti gli appuntamenti presi dal call center.
        if (isDirezioneCc && a.createdBy && ccStaff.includes(a.createdBy)) return true;
        // Agent: own appointments, or inbound appointments for their store
        if (a.agente === user?.name) return true;
        // Appuntamenti inbound di QUALSIASI negozio visibile (non solo il
        // principale) — SOLO con ambito "negozio": chi ha "propri" si ferma
        // a fissati-da-me / assegnati-a-me (rotellina, Luca 05/08).
        if (vistaCal === "negozio" && a.type === "incoming" && a.store && mieiNegozi.some((m) => sameStore(a.store, m))) return true;
        return false;
    };
    const visibleAppointments = appointments.filter(a => {
        if (!visibileBase(a)) return false;
        if (appointmentOutcomeFilter && a.status !== appointmentOutcomeFilter) return false;
        // filtri multi (null = tutto): possono essere valorizzati solo da chi
        // vede le tendine. sameStore: i gemelli ("Magliana" / "Magliana W3") contano
        if (filterStores !== null && !filterStores.some((s) => sameStore(a.store || "", s))) return false;
        if (filterAgents !== null && !filterAgents.includes(a.agente)) return false;
        if (filterCreatedBys !== null && !filterCreatedBys.includes(a.createdBy || "")) return false;
        return true;
    });
    // opzioni consulente per i NON-direzione: le persone degli appuntamenti
    // visibili (per il direttore CC: gli agenti degli appuntamenti dei caller).
    // vistaCal/ccStaff nelle dipendenze: i permessi arrivano DOPO gli
    // appuntamenti e la platea va ricalcolata quando cambia l'ambito.
    const agentiMiei = useMemo(() =>
        Array.from(new Set(appointments.filter(visibileBase).map((a) => a.agente).filter(Boolean))).sort() as string[],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [appointments, catFilter, mieiNegozi.join("|"), user?.name, vistaCal, ccStaff.length]);
    // negozi degli appuntamenti visibili: decide la COMPARSA del filtro negozio
    const negoziMiei = useMemo(() =>
        Array.from(new Set(appointments.filter(visibileBase).map((a) => a.store).filter(Boolean))).sort() as string[],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [appointments, catFilter, mieiNegozi.join("|"), user?.name, vistaCal, ccStaff.length]);
    // ── REGOLE DI COMPARSA DEI FILTRI (Luca 05/08): «chiunque abbia visibilità
    //    di più negozi o più consulenti» ha la tendina — non più solo la
    //    direzione. Negozio: vista "tutti", o più negozi in visibilità, o
    //    appuntamenti visibili di più negozi. Consulente: vista "tutti" o
    //    platea reale con più persone (es. direttore CC coi caller).
    //    "Fissato da" resta della sola vista "tutti" (ma ora multi anche lui).
    const mostraFiltroNegozio = isCallCenter || mieiNegozi.length > 1 || negoziMiei.length > 1;
    const mostraFiltroConsulente = isCallCenter || agentiMiei.length > 1;
    const puoFiltrareCal = mostraFiltroNegozio || mostraFiltroConsulente;
    // opzioni delle tendine: la direzione pesca dalle liste complete, gli
    // altri dalla platea REALE dei visibili (+ i propri negozi, coi gemelli)
    const negoziOpzioni = isCallCenter ? storeNames : Array.from(new Set([...negoziMiei, ...mieiNegozi])).sort();
    const consulentiOpzioni = isCallCenter ? agents : agentiMiei;
    const fissatoDaOpzioni = Array.from(new Set(appointments.map((a) => a.createdBy).filter(Boolean))).sort() as string[];

    // ORARIO → MINUTI ("9:30"→570). Il vecchio ordinamento era ALFABETICO
    // sulle stringhe: "7:00" finiva dopo "15:00" (Luca 29/07). Senza orario
    // si va in fondo alla giornata.
    const minutiDi = (t?: string | null) => {
        const m = String(t || "").match(/^(\d{1,2})[:.](\d{2})/);
        return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : 24 * 60;
    };
    const apptsByDate = (dateStr: string) =>
        visibleAppointments.filter(a => a.date === dateStr)
            .sort((a, b) => minutiDi(a.time) - minutiDi(b.time));

    // ── VISIBILITA' TASK (Luca 04/08): estratta da tasksByDate per valere
    //    identica anche sul riporto arretrate. Match per NOME utente (storico),
    //    task di negozio visibili su QUALSIASI negozio dell'utente. Il filtro
    //    esito resta FUORI: alle arretrate non si applica (aperte per
    //    definizione). L'AMBITO ora arriva dalla rotellina "Calendario — task"
    //    (Luca 05/08), NON più dalla vista appuntamenti: task_tutte = tutte;
    //    task_negozio = proprie + punti vendita in visibilità (fotografia del
    //    codice storico); task_proprie = solo assegnate a lui / create da lui.
    const taskVisibile = (t: CalendarTask): boolean => {
        if (!catOn("task")) return false;
        if (!isTaskTutte) {
            if (t.assignedToStore) {
                // task di punto vendita: solo con ambito "negozio", su
                // QUALSIASI negozio visibile (gemelli inclusi, sameStore)
                if (vistaTask !== "task_negozio") return false;
                if (!mieiNegozi.some((m) => sameStore(t.assignedToStore, m))) return false;
            } else if (!(t.assignedTo === user?.name || t.createdBy === user?.name)) return false;
        }
        // filtri multi della griglia (null = tutto): il filtro consulente vale
        // sulle task personali, quello negozio sulle task di punto vendita —
        // stessa semantica del vecchio filtro della direzione, ora per tutti
        if (filterAgents !== null && !t.assignedToStore && !filterAgents.includes(t.assignedTo)) return false;
        if (filterStores !== null && t.assignedToStore && !filterStores.some((s) => sameStore(t.assignedToStore, s))) return false;
        return true;
    };
    const tasksByDate = (dateStr: string) =>
        tasks.filter(t => t.date === dateStr && taskVisibile(t) && (!taskOutcomeFilter || t.status === taskOutcomeFilter));

    const meetingsByDate = (dateStr: string) => catOn("meeting") ? meetings.filter(m => m.date === dateStr) : [];

    const handleDayClick = (day: number) => {
        selectDate(`${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    };

    // ── TRASCINA E SPOSTA (Luca 03/08): il drop cambia la data VERA — a DB
    //    sugli appointments e, per gli appuntamenti nati dal call center, anche
    //    sulla copia della pratica (calls.data_appuntamento / data_richiamo):
    //    liste, warning e malus dei caller si calcolano da li'. ──
    const [dragApptId, setDragApptId] = useState<number | null>(null);
    const spostaAppuntamento = async (apptId: number, nuovaData: string) => {
        const a = appointments.find(x => x.id === apptId);
        setDragApptId(null);
        if (!a || a.date === nuovaData) return;
        if (isDateBlocked(nuovaData)) {
            const block = agendaBlocks.find(b => nuovaData >= b.startDate && nuovaData <= b.endDate);
            alert(`Questa data è bloccata in agenda. Motivo: ${block?.note ?? "—"}`);
            return;
        }
        const { error } = await supabase.from("appointments").update({ date: nuovaData }).eq("id", apptId);
        if (error) { alert("Spostamento NON salvato: " + error.message); return; }
        try {
            const campoLink = a.type === "richiamo" ? "richiamo_event_id" : "appointment_id";
            const campoData = a.type === "richiamo" ? "data_richiamo" : "data_appuntamento";
            const { data: pratiche } = await supabase.from("calls").select(`id, ${campoData}`).eq(campoLink, apptId);
            for (const pr of ((pratiche ?? []) as Record<string, unknown>[])) {
                const vecchia = String(pr[campoData] || "");
                const ora = vecchia.includes("T") ? "T" + vecchia.split("T")[1] : "";
                await supabase.from("calls").update({ [campoData]: nuovaData + ora }).eq("id", pr.id as string);
            }
        } catch { /* nessuna pratica caller collegata */ }
        setAppointments(prev => prev.map(x => x.id === apptId ? { ...x, date: nuovaData } : x));
        selectDate(nuovaData);
    };

    const handleCreateSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedDate) return;
        if (isDateBlocked(selectedDate)) {
            const block = agendaBlocks.find(b => selectedDate >= b.startDate && selectedDate <= b.endDate);
            alert(`Questa data è bloccata in agenda. Motivo: ${block?.note ?? "—"}`);
            return;
        }
        // Bug indirizzo (Luca 04/08): indirizzo facoltativo, ma se compilato il
        // civico è OBBLIGATORIO — l'agente a domicilio senza civico non arriva.
        if (newAppt.type !== "incoming" && newAppt.customerAddress.trim() && civicoMancante(newAppt.customerAddress)) {
            alert("Nell'indirizzo del cliente manca il numero civico (es. \"Via Roma 12\"): aggiungilo oppure lascia il campo vuoto.");
            return;
        }
        const payload = {
            date: selectedDate,
            time: newAppt.time,
            type: newAppt.type,
            agente: newAppt.type === "incoming" ? "" : newAppt.agente,
            store: newAppt.type === "incoming" ? newAppt.store : null,
            // la via vale anche per gli AUTOGENERATI (prima veniva scartata, Luca 29/07)
            customer_address: newAppt.type !== "incoming" ? (newAppt.customerAddress || null) : null,
            customer_name: newAppt.customerName,
            customer_phone: numeroNazionale(newAppt.customerPhone) || newAppt.customerPhone,
            cf_piva: newAppt.cfPiva || null,
            tipo_cliente: newAppt.tipoCliente,
            referente_nome: newAppt.tipoCliente === "business" ? (newAppt.referenteNome || null) : null,
            referente_cognome: newAppt.tipoCliente === "business" ? (newAppt.referenteCognome || null) : null,
            referente_cf: newAppt.tipoCliente === "business" ? (newAppt.referenteCf || null) : null,
            notes: newAppt.notes || "",
            status: "scheduled",
            created_by: user?.name || "Sconosciuto",
        };
        let { data, error } = await supabase.from("appointments").insert(payload).select().single();
        if (error && /referente/.test(error.message)) {
            // migrazione 153 non ancora applicata: si salva senza referente
            const { referente_nome: _rn, referente_cognome: _rc, referente_cf: _rf, ...senzaRef } = payload;
            ({ data, error } = await supabase.from("appointments").insert(senzaRef).select().single());
        }
        if (error && /created_by/.test(error.message)) {
            // migrazione 083 non ancora applicata: si salva senza "fissato da"
            const { created_by: _cb, referente_nome: _rn2, referente_cognome: _rc2, referente_cf: _rf2, ...senza } = payload;
            ({ data, error } = await supabase.from("appointments").insert(senza).select().single());
        }
        if (error) {
            alert("Errore salvataggio: " + error.message);
            return;
        }
        setAppointments(prev => [...prev, mapAppointmentRow(data)]);
        setShowCreateModal(false);
        setNewAppt({ time: "10:00", type: "incoming", agente: "", store: "", customerAddress: "", customerName: "", customerPhone: "", cfPiva: "", tipoCliente: "consumer", referenteNome: "", referenteCognome: "", referenteCf: "", notes: "" });
    };

    const handleCreateTaskSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        // multi-assegnazione (Luca 31/07): una task GEMELLA per ogni operatore
        // o punto vendita scelto, cosi' ognuno lavora e chiude la propria
        const persone = taskModo === "persone" ? (canAssignOthers ? taskPersone : [user?.name || ""]).filter(Boolean) : [];
        const negozi = taskModo === "negozi" ? taskNegozi : [];
        if (!newTask.date || !newTask.title || (!persone.length && !negozi.length)) return;

        const base = {
            title: newTask.title,
            date: newTask.date,
            time: newTask.time || null,
            status: "da_fare",
            notes: newTask.notes || null,
            client_ref: newTask.clientRef || null,
            created_by: user?.name || "Sconosciuto",
            // esplicito: il default DB storico era TRUE e lo script di pulizia
            // demo cancellerebbe task vere (sanato con la mig. 160)
            is_demo: false,
        };
        const rows = [
            ...persone.map((p) => ({ ...base, assigned_to: p, assigned_to_store: null })),
            ...negozi.map((n) => ({ ...base, assigned_to: "", assigned_to_store: n })),
        ];
        const { data, error } = await supabase.from("calendar_tasks").insert(rows).select();
        if (error) {
            alert("Errore salvataggio task: " + error.message);
            return;
        }
        setTasks(prev => [...prev, ...((data ?? []) as Record<string, unknown>[]).map(mapTaskRow)]);
        setShowCreateTaskModal(false);
        setNewTask({ title: "", date: "", time: "", status: "da_fare", notes: "", clientRef: "", assignedTo: user?.name || "", assignedToStore: undefined });
        setTaskPersone([]); setTaskNegozi([]); setTaskModo("persone");
    };

    // ANNULLAMENTO riunione (Luca 31/07): chi puo' crearle puo' annullarle.
    // L'invito (pop-up) viene RITIRATO — chi non l'aveva ancora visto non
    // ricevera' nulla; chi l'aveva GIA' visto (letto/risposto) riceve
    // l'avviso di cancellazione in Comunicazioni (bacheca, non pop-up).
    const eliminaRiunione = async (m: CalendarMeeting) => {
        if (!window.confirm(`Annullare la riunione "${m.title}" del ${m.date}?\nChi aveva già visto l'invito riceverà l'avviso in Comunicazioni; chi non l'aveva ancora visto non riceverà nulla.`)) return;
        try {
            // 1. si ritrova l'invito: dal collegamento meeting_id (mig. 122) o,
            //    per gli inviti vecchi, dal titolo
            let inv = await supabase.from("comunicazioni").select("id").eq("meeting_id", m.id).maybeSingle();
            if (inv.error && /meeting_id|column/i.test(inv.error.message || "")) {
                inv = await supabase.from("comunicazioni").select("id").eq("kind", "popup").eq("title", `📅 Riunione: ${m.title}`).order("created_at", { ascending: false }).limit(1).maybeSingle();
            }
            const invitoId = (inv.data as { id?: number } | null)?.id;
            let avvisati: string[] = [];
            if (invitoId) {
                const { data: ric } = await supabase.from("comunicazioni_ricevute").select("user_id, letto_il").eq("comunicazione_id", invitoId);
                avvisati = ((ric ?? []) as { user_id: string; letto_il: string | null }[]).filter((r) => r.letto_il).map((r) => r.user_id);
                await supabase.from("comunicazioni_ricevute").delete().eq("comunicazione_id", invitoId);
                await supabase.from("comunicazioni").delete().eq("id", invitoId);
            }
            // 2. avviso in BACHECA solo a chi l'aveva vista
            if (avvisati.length) {
                await supabase.from("comunicazioni").insert({
                    title: `❌ Riunione annullata: ${m.title}`,
                    content: `La riunione "${m.title}" prevista per il ${m.date} dalle ${m.startTime} alle ${m.endTime} è stata ANNULLATA.`,
                    type: "warning",
                    kind: "bacheca",
                    target_users: [...new Set(avvisati)],
                    created_by: user?.id || null,
                    created_by_name: user?.name || null,
                    date_display: new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" }),
                });
            }
        } catch { /* la riunione si elimina comunque */ }
        const { error } = await supabase.from("calendar_meetings").delete().eq("id", m.id);
        if (error) { alert("Riunione NON eliminata: " + error.message); return; }
        setMeetings(prev => prev.filter(x => x.id !== m.id));
        setShowMeetingDetailModal(false);
    };

    const handleCreateMeetingSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        // niente piu' click "morto" (Luca 31/07): se manca un campo lo si DICE
        const mancanti = [
            !newMeeting.title && "Titolo",
            !newMeeting.date && "Data",
            !newMeeting.startTime && "Ora inizio",
            !newMeeting.endTime && "Ora fine",
            !newMeeting.brand && "Brand",
        ].filter(Boolean);
        if (mancanti.length) { alert("Per salvare la riunione compila: " + mancanti.join(", ")); return; }
        // Bug indirizzo (Luca 04/08): il Luogo può essere anche una sede
        // ("Negozio Tivoli"), ma se è chiaramente una VIA il civico ci vuole.
        if (newMeeting.type === "in_person" && sembraVia(newMeeting.location) && civicoMancante(newMeeting.location)) {
            alert("Nel luogo della riunione manca il numero civico (es. \"Via Roma 12\"): aggiungilo.");
            return;
        }

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
        // INVITO come COMUNICAZIONE POP-UP (Luca 31/07): gli invitati ricevono
        // il pop-up con Accetto/Rifiuto (esiti cliccabili), resta nello storico
        // comunicazioni e chi ha risposto cosa si vede nel dettaglio ricevute.
        if (newMeeting.recipients.length) {
            const quando = `${newMeeting.date} dalle ${newMeeting.startTime} alle ${newMeeting.endTime}`;
            const dove = newMeeting.type === "in_person" ? (newMeeting.location ? `di persona — ${newMeeting.location}` : "di persona") : (newMeeting.link ? `in videochiamata — ${newMeeting.link}` : "in videochiamata");
            const invito: Record<string, unknown> = {
                meeting_id: (data as { id?: number })?.id ?? null,
                title: `📅 Riunione: ${newMeeting.title}`,
                content: [`Sei invitato alla riunione "${newMeeting.title}"${newMeeting.brand ? ` (${newMeeting.brand})` : ""}.`, `Quando: ${quando}`, `Dove: ${dove}`, newMeeting.notes ? `Note: ${newMeeting.notes}` : ""].filter(Boolean).join("\n"),
                type: "info",
                kind: "popup",
                target_roles: null,
                target_stores: null,
                target_users: newMeeting.recipients.map((r) => r.id),
                target_brands: null,
                esiti: ["Accetto", "Rifiuto"],
                created_by: user?.id || null,
                created_by_name: user?.name || null,
                date_display: new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" }),
            };
            let { error: comErr } = await supabase.from("comunicazioni").insert(invito);
            if (comErr && /meeting_id|column/i.test(comErr.message || "")) {
                // mig. 122 non ancora applicata: invito senza collegamento
                delete invito.meeting_id;
                ({ error: comErr } = await supabase.from("comunicazioni").insert(invito));
            }
            if (comErr) alert("Riunione salvata, ma il pop-up di invito NON è partito: " + comErr.message);
        }
        setShowCreateMeetingModal(false); setCercaOperatore(""); setCercaNegozio("");
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
        // AUTO-SELEZIONE TRASPARENTE (Luca 31/07, secondo giro): scegliere il
        // brand in alto porta dentro tutti i suoi operatori, ma il riepilogo
        // esploso prima delle Note (con le ✕) li mostra uno per uno e permette
        // di toglierli — niente piu' inviti a sorpresa.
        setNewMeeting(prev => {
            const autoRecipients: MeetingRecipient[] =
                brand && brand !== "Corporate / Aziendale"
                    ? meetingUsers.filter(u => u.brands.some(x => brandCoincide(x, brand))).map(u => ({
                        id: u.id, name: u.name, store: u.store, status: "invited" as const,
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

    // ── TASK ARRETRATE, riporto stile Google Calendar (Luca 04/08): date < oggi
    //    e stato non chiuso — SOLO fatta/abbandonata chiudono, le SOSPESE si
    //    riportano (decisione Luca). Nessuna riga duplicata: la task resta
    //    sulla sua data e a mezzanotte il riporto si sposta da solo (todayStr).
    const CHIUSE_TASK = ["fatta", "abbandonata"];
    const tasksArretrate = tasks
        .filter(t => t.date < todayStr && !CHIUSE_TASK.includes(t.status) && taskVisibile(t))
        .sort((a, b) => a.date === b.date ? minutiDi(a.time) - minutiDi(b.time) : a.date.localeCompare(b.date));
    // In COLONNA (giorno corrente) chi vede TUTTE le task vede SOLO le proprie
    // (assegnate o create da lui): l'elenco di tutta la rete sta dietro il
    // bottone ⏰ — altrimenti le arretrate altrui coprirebbero gli impegni del
    // giorno. Ora la soglia è la capability task (prima: vista appuntamenti).
    const arretrateInColonna = isTaskTutte
        ? tasksArretrate.filter(t => t.assignedTo === user?.name || t.createdBy === user?.name)
        : tasksArretrate;
    // ── MODALE ARRETRATE (Luca 05/08): chi vede task ALTRUI (di altre persone
    //    o di più punti vendita) apre le arretrate in una finestra SOVRAPPOSTA
    //    con i filtri in testa — non più il pannello che esplode dentro il
    //    calendario («altrimenti applicare i filtri è scomodo»). Chi vede solo
    //    le proprie tiene il pannello inline di prima: lì i filtri non
    //    servirebbero a nulla.
    const personaTask = (t: CalendarTask) => t.assignedTo || t.createdBy || "";
    const negoziArretrate = Array.from(new Set(tasksArretrate.map((t) => t.assignedToStore).filter(Boolean))).sort() as string[];
    const personeArretrate = Array.from(new Set(tasksArretrate.filter((t) => !t.assignedToStore).map(personaTask).filter(Boolean))).sort();
    const arretrateInModale = isTaskTutte
        || personeArretrate.some((p) => p !== user?.name)      // task di altre persone
        || negoziArretrate.length > 1                          // o di più punti vendita
        || (negoziArretrate.length > 0 && mieiNegozi.length > 1);
    // filtri del modale: consulente sulle task personali, negozio su quelle di
    // punto vendita (stessa semantica dei filtri della griglia)
    const arretrateFiltrate = tasksArretrate.filter((t) => {
        if (arrFiltroNegozi !== null && t.assignedToStore && !arrFiltroNegozi.includes(t.assignedToStore)) return false;
        if (arrFiltroPersone !== null && !t.assignedToStore && !arrFiltroPersone.includes(personaTask(t))) return false;
        return true;
    });
    const giorniFa = (d: string) => Math.round((new Date(todayStr + "T12:00:00").getTime() - new Date(d + "T12:00:00").getTime()) / 86400000);
    const ggMm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
    // riga di una task arretrata — identica nel pannello inline e nel modale
    // (helper JSX chiamato come funzione, MAI componente annidato)
    // CESTINO ADMIN (Luca 05/08): eliminazione DEFINITIVA di qualsiasi task —
    // la riga sparisce dal DB per tutti, nessuna traccia (niente soft-delete).
    const puoEliminareTask = ["admin", "dev"].includes(user?.role || "");
    const eliminaTask = async (t: CalendarTask) => {
        if (!puoEliminareTask) return;
        if (!window.confirm(`Eliminare PER SEMPRE la task "${t.title}"? Sparisce per tutti, senza lasciare traccia.`)) return;
        const { error } = await supabase.from("calendar_tasks").delete().eq("id", t.id);
        if (error) { alert("Eliminazione non riuscita: " + error.message); return; }
        setTasks(prev => prev.filter(x => x.id !== t.id));
        setTaskDettaglio(cur => (cur && cur.id === t.id ? null : cur));
    };
    const rigaArretrata = (t: CalendarTask) => (
        // div role=button (non <button>): il cestino admin annidato dentro un
        // <button> sarebbe HTML non valido — stesso pattern delle card malus
        <div
            key={`arrp-${t.id}`}
            role="button" tabIndex={0}
            onClick={() => setTaskDettaglio(t)}
            onKeyDown={(e) => e.key === "Enter" && setTaskDettaglio(t)}
            title="Apri la task (dettaglio e modifica)"
            className="w-full text-left p-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] hover:bg-amber-500/[0.12] transition-colors flex items-center gap-3 flex-wrap cursor-pointer select-none"
        >
            <span className="text-xs font-mono font-bold text-amber-300 shrink-0">{ggMm(t.date)}</span>
            <span className="text-[10px] text-slate-500 shrink-0">{giorniFa(t.date)} gg fa</span>
            <span className="text-sm font-semibold text-white truncate flex-1 min-w-[160px]">{t.title}</span>
            <span className="text-xs text-slate-400 truncate max-w-[220px]">{t.assignedToStore ? `🏬 ${t.assignedToStore}` : (t.assignedTo || t.createdBy)}</span>
            <span className={cn("text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border shrink-0", esitoClasse(t.status, "task"))}>
                {esitoLabel(t.status, "task")}
            </span>
            {puoEliminareTask && (
                <span role="button" tabIndex={0} title="Elimina PER SEMPRE (admin): sparisce per tutti, senza traccia"
                    onClick={(e) => { e.stopPropagation(); eliminaTask(t); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); eliminaTask(t); } }}
                    className="shrink-0 px-2 py-1 rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/25 text-xs">
                    🗑
                </span>
            )}
        </div>
    );

    const parseSearchDate = (val: string): string | null => {
        if (!val || !val.trim()) return null;
        const m = val.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
        if (val.match(/^\d{4}-\d{2}-\d{2}$/)) return val;
        return null;
    };

    // Search result chronological list (includes RBAC store-based filtering implicitly from visibleAppointments)
    // MOD-26 (Luca 10/08): ricerca UNIFICATA — un solo campo che matcha nome,
    // CF/P.IVA o cellulare (via i tre campi separati del vecchio pannello)
    const searchResults = visibleAppointments.filter(a => {
        if (searchQuery) {
            const q = searchQuery.trim().toLowerCase();
            const hit = a.customerName.toLowerCase().includes(q)
                || (a.cfPiva && a.cfPiva.toLowerCase().includes(q))
                || (a.customerPhone && a.customerPhone.includes(searchQuery.trim()));
            if (!hit) return false;
        }
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
        // Segnalazione 63: senza un giorno gia' selezionato il modale non
        // comparirebbe. Se manca, si parte da oggi.
        if (!selectedDate) setSelectedDate(new Date().toISOString().split("T")[0]);
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
                        {(() => {
                            // riepilogo filtri multi: null = tutto (nessun filtro attivo)
                            const riass = (v: string[] | null, vuoto: string) => v === null ? null : (v.length === 0 ? vuoto : v.join(" + "));
                            const parti = [
                                riass(filterStores, "nessun punto vendita"),
                                riass(filterAgents, "nessun consulente"),
                                filterCreatedBys === null ? null : `fissato da ${filterCreatedBys.length === 0 ? "nessuno" : filterCreatedBys.join(" + ")}`,
                            ].filter(Boolean);
                            if (parti.length) return <span className="text-indigo-300 font-medium">Filtro attivo: {parti.join(" · ")}</span>;
                            return isCallCenter ? "Visualizzazione completa — tutti i consulenti" : `I tuoi appuntamenti — ${user?.name}`;
                        })()}
                    </p>
                </div>
                <div className="flex gap-3">
                    {/* MOD-26: via il bottone "Cerca appuntamenti" — la ricerca
                        vive nei filtri unificati qui sotto */}
                    {tasksArretrate.length > 0 && (
                        <button
                            onClick={() => setShowArretrate(v => !v)}
                            title="Task con data passata non ancora chiuse (fatta/abbandonata)"
                            className={cn(
                                "h-10 px-5 flex items-center gap-2 rounded-lg font-medium transition-all shadow-lg border",
                                showArretrate
                                    ? "bg-amber-500/25 text-amber-200 border-amber-500/60 shadow-amber-500/20"
                                    : "bg-amber-500/10 text-amber-300 border-amber-500/40 hover:bg-amber-500/20"
                            )}
                        >
                            ⏰ Arretrate ({tasksArretrate.length})
                        </button>
                    )}
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

            {/* ── FILTRI UNIFICATI (MOD-26, Luca 10/08): ricerca cliente, periodo,
                esiti, punti vendita/consulenti e categorie raccolti in UN
                pannello compatto — via il vecchio pannello "Cerca appuntamenti". ── */}
            <div className="mb-6 p-3.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
                {/* riga 1: ricerca + periodo + esiti + pulisci */}
                <div className="flex flex-wrap items-center gap-2.5">
                    <div className="relative flex-1 min-w-[220px] max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                        <input
                            type="text"
                            placeholder="Cerca cliente: nome, CF/P.IVA o cellulare…"
                            className="glass-input w-full text-sm h-9 pl-9"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] uppercase font-bold text-slate-500">dal</span>
                        <DatePickerInput id="da_data_appuntamento" value={searchDateFrom} onChange={setSearchDateFrom} placeholder="—" />
                        <span className="text-[10px] uppercase font-bold text-slate-500">al</span>
                        <DatePickerInput id="a_data_appuntamento" value={searchDateTo} onChange={setSearchDateTo} placeholder="—" />
                    </div>
                    <select
                        className="glass-input text-sm h-9 w-auto min-w-[170px]"
                        value={appointmentOutcomeFilter}
                        onChange={(e) => setAppointmentOutcomeFilter(e.target.value as AppointmentStatus | "")}
                        title="Filtro esito appuntamenti"
                    >
                        <option value="">Esito app. — tutti</option>
                        {esitiFiltroAppt.map((s) => (
                            <option key={s.chiave} value={s.chiave}>{s.etichetta}</option>
                        ))}
                    </select>
                    <select
                        className="glass-input text-sm h-9 w-auto min-w-[150px]"
                        value={taskOutcomeFilter}
                        onChange={(e) => setTaskOutcomeFilter(e.target.value as TaskStatus | "")}
                        title="Filtro esito task"
                    >
                        <option value="">Task — tutte</option>
                        {esitiPer("task").map((s) => (
                            <option key={s.chiave} value={s.chiave}>{s.etichetta}</option>
                        ))}
                    </select>
                    {(searchQuery || searchDateFrom || searchDateTo || appointmentOutcomeFilter || taskOutcomeFilter) && (
                        <button
                            type="button"
                            onClick={() => { setSearchQuery(""); setSearchDateFrom(""); setSearchDateTo(""); setAppointmentOutcomeFilter("" as AppointmentStatus | ""); setTaskOutcomeFilter("" as TaskStatus | ""); }}
                            className="h-9 text-xs px-3 rounded-lg text-slate-400 hover:text-white border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
                        >
                            ✕ Pulisci
                        </button>
                    )}
                </div>
                {/* riga 2: punti vendita / consulenti / fissato da (solo platee plurali) */}
                {puoFiltrareCal && (mostraFiltroNegozio || mostraFiltroConsulente || isCallCenter) && (
                    <div className="flex flex-wrap gap-2.5">
                        {mostraFiltroNegozio && <div className="flex-1 min-w-[200px] max-w-sm" title="Punti vendita">
                            <FiltroMulti
                                values={filterStores}
                                onChange={setFilterStores}
                                opzioni={negoziOpzioni}
                                etichettaTutti="Tutti i punti vendita"
                            />
                        </div>}
                        {mostraFiltroConsulente && <div className="flex-1 min-w-[200px] max-w-sm" title="Consulenti">
                            <FiltroMulti
                                values={filterAgents}
                                onChange={setFilterAgents}
                                opzioni={consulentiOpzioni}
                                etichettaTutti="Tutti i consulenti"
                            />
                        </div>}
                        {isCallCenter && <div className="flex-1 min-w-[200px] max-w-sm" title="Chi ha fissato l'appuntamento">
                            <FiltroMulti
                                values={filterCreatedBys}
                                onChange={setFilterCreatedBys}
                                opzioni={fissatoDaOpzioni}
                                etichettaTutti="Fissato da: chiunque"
                            />
                        </div>}
                    </div>
                )}
                {/* riga 3: categorie (i "pallini" cliccabili) */}
                <div className="flex flex-wrap items-center gap-2">
                {([
                    ["incoming", "Inbound", "bg-blue-400", "border-blue-500/40 bg-blue-500/15 text-blue-200"],
                    ["outgoing", "Outbound", "bg-amber-400", "border-amber-500/40 bg-amber-500/15 text-amber-200"],
                    ["self_generated", "Auto-Generato", "bg-purple-400", "border-purple-500/40 bg-purple-500/15 text-purple-200"],
                    ["richiamo", "Richiami CC", "bg-pink-400", "border-pink-500/40 bg-pink-500/15 text-pink-200"],
                    ["task", "Task", "bg-emerald-500", "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"],
                    ["meeting", "Riunioni", "bg-sky-400", "border-sky-500/40 bg-sky-500/15 text-sky-200"],
                ] as [string, string, string, string][]).map(([id, label, dot, activeCls]) => {
                    const active = catFilter.includes(id);
                    return (
                        <button
                            key={id}
                            type="button"
                            onClick={() => toggleCat(id)}
                            className={cn(
                                "flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors",
                                active ? activeCls : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]",
                            )}
                        >
                            <span className={cn("w-2 h-2 rounded-full", dot)} />
                            {label}
                        </button>
                    );
                })}
                {catFilter.length > 0 && (
                    <button
                        type="button"
                        onClick={() => setCatFilter([])}
                        className="text-xs px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-white border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
                    >
                        ✕ Mostra tutto
                    </button>
                )}
                {agendaBlocks.length > 0 && (
                    <span className="flex items-center gap-1.5 text-xs text-slate-500 ml-auto">
                        <Lock className="w-3 h-3 text-amber-400" /> Giorno bloccato
                    </span>
                )}
                </div>
            </div>

            {/* MOD-26: RISULTATI di ricerca — compaiono da soli quando la
                ricerca unificata (testo o periodo) è attiva */}
            {(searchQuery.trim() !== "" || searchDateFrom !== "" || searchDateTo !== "") && (
                <div className="glass-card mb-6 p-6 animate-in slide-in-from-top-4 fade-in duration-200">
                    <div>
                        <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Risultati di ricerca ({searchResults.length})</h4>
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
                                                <span className={cn("flex items-center gap-1", appt.fascia && "text-amber-400 font-semibold")}><Clock className="w-3 h-3" /> {fasciaLabel(appt.fascia) || appt.time}</span>
                                                <span className="flex items-center gap-1 text-slate-500"><User className="w-3 h-3" /> {appt.agente}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 sm:w-auto w-full justify-between sm:justify-end">
                                        <span className={cn(
                                            "text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-full border",
                                            appt.type === "incoming" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                                                appt.type === "self_generated" ? "bg-purple-500/10 text-purple-400 border-purple-500/20" :
                                                    appt.type === "richiamo" ? "bg-pink-500/10 text-pink-400 border-pink-500/20" :
                                                        "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                        )}>
                                            {appt.type === "richiamo" ? "richiamo ☎" : appt.type}
                                        </span>
                                        <span className={cn(
                                            "text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-full border",
                                            esitoClasse(appt.status, appt.type)
                                        )}>
                                            {esitoLabel(appt.status, appt.type)}
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

            {/* ── TASK ARRETRATE, pannello INLINE (Luca 04/08): resta per chi
                vede SOLO le proprie task — lì i filtri non servono. Click
                sulla riga = dettaglio task, da lì si chiude (fatta/
                abbandonata) o si sposta la data. ── */}
            {showArretrate && tasksArretrate.length > 0 && !arretrateInModale && (
                <div className="glass-card mb-6 p-6 animate-in slide-in-from-top-4 fade-in duration-200">
                    <h3 className="text-lg font-medium text-white mb-4 border-b border-white/10 pb-2 flex items-center gap-2">
                        ⏰ Task arretrate
                        <span className="text-sm font-bold text-amber-300">({tasksArretrate.length})</span>
                        <span className="ml-auto text-xs font-normal text-slate-500">non chiuse, in ordine dalla più vecchia</span>
                    </h3>
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
                        {tasksArretrate.map((t) => rigaArretrata(t))}
                    </div>
                </div>
            )}

            {/* ── TASK ARRETRATE, MODALE SOVRAPPOSTO (Luca 05/08): per chi vede
                task altrui — «si deve aprire una finestra in sovrapposizione,
                NON un'altra tendina che esplode dentro il calendario» — con i
                filtri multi Negozio/Persona in testa. Stesso z-50 dei modali
                del CRM ma PRIMA del TaskDettaglioModal nel DOM: il dettaglio
                aperto da una riga si impila sopra, e alla chiusura si torna
                all'elenco. ── */}
            {showArretrate && tasksArretrate.length > 0 && arretrateInModale && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowArretrate(false)}>
                    <div className="glass-card p-6 w-full max-w-3xl max-h-[85vh] flex flex-col animate-in zoom-in-95 fade-in duration-200" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-2">
                            <h3 className="text-lg font-medium text-white flex items-center gap-2">
                                ⏰ Task arretrate
                                <span className="text-sm font-bold text-amber-300">
                                    ({arretrateFiltrate.length}{arretrateFiltrate.length !== tasksArretrate.length ? ` di ${tasksArretrate.length}` : ""})
                                </span>
                            </h3>
                            <button onClick={() => setShowArretrate(false)} className="text-slate-500 hover:text-slate-300"><X className="w-5 h-5" /></button>
                        </div>
                        {/* filtri in testa: negozio sulle task di punto vendita,
                            persona su quelle personali (stessa semantica della griglia) */}
                        <div className="mb-4 flex flex-col sm:flex-row gap-3">
                            {negoziArretrate.length > 0 && (
                                <div className="flex-1">
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Punto vendita</label>
                                    <FiltroMulti values={arrFiltroNegozi} onChange={setArrFiltroNegozi} opzioni={negoziArretrate} etichettaTutti="Tutti i punti vendita" />
                                </div>
                            )}
                            {personeArretrate.length > 0 && (
                                <div className="flex-1">
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Persona</label>
                                    <FiltroMulti values={arrFiltroPersone} onChange={setArrFiltroPersone} opzioni={personeArretrate} etichettaTutti="Tutte le persone" />
                                </div>
                            )}
                        </div>
                        <p className="text-xs text-slate-500 mb-2">Non chiuse, in ordine dalla più vecchia — clicca una task per aprirla (dettaglio, esito, spostamento data).</p>
                        <div className="space-y-2 flex-1 min-h-0 overflow-y-auto pr-2 custom-scrollbar">
                            {arretrateFiltrate.map((t) => rigaArretrata(t))}
                            {arretrateFiltrate.length === 0 && (
                                <div className="text-center py-8 text-slate-500 text-sm">Nessuna task arretrata con i filtri scelti.</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Calendar Grid */}
                <div className="lg:col-span-2 glass-card p-6">
                    {/* Navigazione + selettore vista Mese/Settimana */}
                    <div className="flex items-center justify-between mb-6 gap-3">
                        <button
                            onClick={calView === "month" ? prevMonth : calView === "week" ? () => setWeekStart(addDays(weekStart, -7)) : () => { const d = addDays(dayDate, -1); setDayDate(d); selectDate(d); }}
                            className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-slate-300"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <h3 className="text-xl font-bold text-white text-center flex-1 truncate">
                            {calView === "month" ? `${MONTHS_IT[viewMonth]} ${viewYear}` : calView === "week" ? weekLabel
                                : (() => { const d = new Date(dayDate + "T12:00:00"); return `${DAYS_IT[(d.getDay() + 6) % 7]} ${d.getDate()} ${MONTHS_IT[d.getMonth()]} ${d.getFullYear()}`; })()}
                        </h3>
                        {/* OGGI (Luca 31/07): torna al giorno corrente in qualsiasi vista */}
                        <button
                            onClick={() => { const t = new Date(); setViewYear(t.getFullYear()); setViewMonth(t.getMonth()); setWeekStart(mondayOf(todayStr)); setDayDate(todayStr); selectDate(todayStr); }}
                            className="shrink-0 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-xs font-bold text-slate-300 hover:bg-white/10 transition-colors">
                            Oggi
                        </button>
                        <div className="flex gap-1 p-1 rounded-lg bg-white/5 border border-white/10 shrink-0">
                            {([["month", "Mese"], ["week", "Settimana"], ["day", "Giorno"]] as [typeof calView, string][]).map(([id, lab]) => (
                                <button
                                    key={id}
                                    onClick={() => { setCalView(id); if (id === "day") selectDate(dayDate); }}
                                    className={cn(
                                        "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                                        calView === id ? "bg-indigo-500 text-white" : "text-slate-400 hover:text-white",
                                    )}
                                >
                                    {lab}
                                </button>
                            ))}
                        </div>
                        {/* Domenica a scomparsa: pill visibile come nel calendario ferie
                            (Luca 04/08, superato il "volutamente discreto" del 31/07).
                            ATTENZIONE semantica: qui lo stato e' mostraDomenica
                            (true = mostra), la pill e' accesa quando e' NASCOSTA. */}
                        {calView === "week" && (
                            <button onClick={() => setMostraDomenica(v => !v)}
                                title="La domenica i negozi sono chiusi: nascondendola le colonne respirano"
                                className={cn("shrink-0 px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-colors",
                                    !mostraDomenica ? "border-rose-400/60 bg-rose-500/15 text-rose-200" : "border-white/10 text-slate-500 hover:text-slate-300")}>
                                {!mostraDomenica ? "🙈 Domenica nascosta" : "Nascondi domenica"}
                            </button>
                        )}
                        <button
                            onClick={calView === "month" ? nextMonth : calView === "week" ? () => setWeekStart(addDays(weekStart, 7)) : () => { const d = addDays(dayDate, 1); setDayDate(d); selectDate(d); }}
                            className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-slate-300"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>

                    {calView === "month" && (<>
                    {/* Day headers — senza Domenica quando è nascosta (Luca 05/08) */}
                    <div className={cn("mb-2 grid", mostraDomenica ? "grid-cols-7" : "grid-cols-6")}>
                        {(mostraDomenica ? DAYS_IT : DAYS_IT.slice(0, 6)).map(d => (
                            <div key={d} className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wider py-2">
                                {d}
                            </div>
                        ))}
                    </div>

                    {/* Day cells — con la domenica nascosta la griglia è a 6 colonne,
                        le domeniche si saltano (indice 6, lunedì=0) e se il mese
                        parte di domenica la prima riga non ha celle vuote */}
                    <div className={cn("grid gap-1", mostraDomenica ? "grid-cols-7" : "grid-cols-6")}>
                        {/* Empty cells before first day */}
                        {Array.from({ length: mostraDomenica ? firstDay : (firstDay === 6 ? 0 : firstDay) }).map((_, i) => (
                            <div key={`empty-${i}`} />
                        ))}
                        {Array.from({ length: daysInMonth }).map((_, i) => {
                            const day = i + 1;
                            if (!mostraDomenica && (firstDay + i) % 7 === 6) return null;
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
                                    onDragOver={(e) => { if (dragApptId != null) e.preventDefault(); }}
                                    onDrop={(e) => { e.preventDefault(); if (dragApptId != null) spostaAppuntamento(dragApptId, dateStr); }}
                                    className={cn(
                                        "relative aspect-square rounded-xl flex flex-col items-center justify-start pt-2 pb-1 px-1 transition-all group",
                                        isBlocked ? "bg-amber-500/15 border border-amber-500/30" :
                                            isSelected ? "bg-indigo-500/25 border border-indigo-500/50" :
                                                isToday ? "bg-white/[0.05] border border-white/15" :
                                                    "hover:bg-white/[0.04] border border-transparent",
                                        dragApptId != null && !isBlocked && "border-dashed border-indigo-400/50"
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
                                    {/* riporto arretrate (Luca 04/08): badge sul giorno corrente */}
                                    {isToday && arretrateInColonna.length > 0 && (
                                        <span className="mt-0.5 text-[9px] font-black text-amber-300" title={`${arretrateInColonna.length} task arretrate da chiudere`}>⏰{arretrateInColonna.length}</span>
                                    )}
                                    {(dayAppts.length > 0 || dayTasks.length > 0 || dayMeetings.length > 0) && (
                                        <div className="flex flex-wrap gap-0.5 mt-1 justify-center items-center">
                                            {dayAppts.slice(0, 3).map(a => (
                                                <div key={a.id}
                                                    className={cn("w-1.5 h-1.5 rounded-full",
                                                        a.type === "incoming" ? "bg-blue-400" :
                                                            a.type === "self_generated" ? "bg-purple-400" :
                                                                a.type === "richiamo" ? "bg-pink-400" :
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

                    </>)}

                    {/* Vista SETTIMANALE: impegni gia' espansi sotto ogni giorno e
                        cliccabili (l'appuntamento apre il suo dettaglio, la riunione il
                        suo); il pannello a destra resta e segue il giorno selezionato. */}
                    {calView === "week" && (<>
                        <div className={cn("grid gap-1.5", mostraDomenica ? "grid-cols-7" : "grid-cols-6")}>
                            {(mostraDomenica ? weekDays : weekDays.slice(0, 6)).map((dateStr) => {
                                const wd = new Date(dateStr + "T12:00:00");
                                const dayAppts = apptsByDate(dateStr);   // già in ordine di orario REALE
                                const dayTasks = tasksByDate(dateStr);
                                const dayMeetings = meetingsByDate(dateStr);
                                const isToday = dateStr === todayStr;
                                const isSelected = dateStr === selectedDate;
                                const isBlocked = isDateBlocked(dateStr);
                                return (
                                    <div
                                        key={dateStr}
                                        onDragOver={(e) => { if (dragApptId != null) e.preventDefault(); }}
                                        onDrop={(e) => { e.preventDefault(); if (dragApptId != null) spostaAppuntamento(dragApptId, dateStr); }}
                                        className={cn(
                                            // piu' respiro in verticale (Luca 31/07): lo spazio sotto c'era
                                            "rounded-xl border flex flex-col min-h-[440px] max-h-[72vh]",
                                            isBlocked ? "bg-amber-500/10 border-amber-500/30" :
                                                isSelected ? "border-indigo-500/50 bg-indigo-500/[0.07]" :
                                                    isToday ? "border-white/15 bg-white/[0.04]" : "border-white/8 bg-white/[0.02]",
                                            dragApptId != null && !isBlocked && "border-dashed border-indigo-400/50",
                                        )}
                                    >
                                        <button
                                            onClick={() => selectDate(dateStr)}
                                            className="w-full pt-2 pb-1.5 border-b border-white/8 text-center hover:bg-white/[0.04] rounded-t-xl transition-colors"
                                        >
                                            <div className="text-[10px] uppercase tracking-wider text-slate-500">{DAYS_IT[(wd.getDay() + 6) % 7]}</div>
                                            <div className={cn("text-base font-bold leading-tight", isToday ? "text-indigo-400" : "text-slate-200")}>{wd.getDate()}</div>
                                            {isBlocked && <Lock className="w-3 h-3 text-amber-400 mx-auto mt-0.5" />}
                                        </button>
                                        <div className="flex-1 overflow-y-auto p-1 space-y-1 custom-scrollbar">
                                            {/* RIPORTO ARRETRATE (Luca 04/08): in cima al giorno CORRENTE,
                                                blocco separato dalle task di oggi — la task resta sulla
                                                sua data, qui è solo richiamata. */}
                                            {dateStr === todayStr && arretrateInColonna.length > 0 && (
                                                <div className="mb-1 space-y-1">
                                                    <div className="px-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-400/90">⏰ Arretrate ({arretrateInColonna.length})</div>
                                                    {arretrateInColonna.map((t) => (
                                                        <button
                                                            key={`arr-${t.id}`}
                                                            onClick={() => { selectDate(dateStr); setTaskDettaglio(t); }}
                                                            title={`Task del ${ggMm(t.date)} non ancora chiusa — apri il dettaglio`}
                                                            className="w-full text-left px-1.5 py-1 rounded-lg border border-amber-500/40 bg-amber-500/10 text-[10px] leading-tight hover:bg-amber-500/20 transition-colors"
                                                        >
                                                            <div className="font-semibold text-amber-200 truncate">{ggMm(t.date)} · {t.title}</div>
                                                            <div className="text-slate-400 truncate">{t.assignedToStore || t.assignedTo}</div>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                            {/* UNICA lista cronologica (Luca 29/07): l'ORARIO è il principe —
                                                senza-orario IN TESTA, poi tutte le categorie mescolate
                                                in ordine di orario reale (non tre liste in sequenza). */}
                                            {[
                                                ...dayAppts.map((a) => ({ min: minutiDi(a.time), jsx: (
                                                    <button
                                                        key={`a-${a.id}`}
                                                        draggable
                                                        onDragStart={(e) => { setDragApptId(a.id); e.dataTransfer.effectAllowed = "move"; }}
                                                        onDragEnd={() => setDragApptId(null)}
                                                        title="Trascinalo su un altro giorno per spostarlo"
                                                        onClick={() => { selectDate(dateStr); setSelectedAppointment(a); setShowModal(true); }}
                                                        className={cn(
                                                            "w-full text-left px-1.5 py-1 rounded-lg border text-[10px] leading-tight transition-colors hover:bg-white/[0.08]",
                                                            a.type === "incoming" ? "border-blue-500/30 bg-blue-500/10" :
                                                                a.type === "self_generated" ? "border-purple-500/30 bg-purple-500/10" :
                                                                    a.type === "richiamo" ? "border-pink-500/30 bg-pink-500/10" : "border-amber-500/30 bg-amber-500/10",
                                                        )}
                                                    >
                                                        <div className="font-semibold text-slate-200 truncate">{a.fascia ? <span className="text-amber-300">{fasciaLabel(a.fascia)}</span> : a.time} {a.customerName}</div>
                                                        <div className="text-slate-400 truncate">{a.type === "incoming" ? (a.store || "Inbound") : a.type === "richiamo" ? `☎ ${a.createdBy || "richiamo"}` : (a.agente || "—")}</div>
                                                    </button>
                                                ) })),
                                                ...dayTasks.map((t) => ({ min: t.time ? minutiDi(t.time) : -1, jsx: (
                                                    <button
                                                        key={`t-${t.id}`}
                                                        onClick={() => { selectDate(dateStr); setTaskDettaglio(t); }}
                                                        title="Apri la task (dettaglio e modifica)"
                                                        className="w-full text-left px-1.5 py-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-[10px] leading-tight hover:bg-white/[0.08] transition-colors"
                                                    >
                                                        <div className="font-semibold text-emerald-200 truncate">{t.time ? `${t.time} ` : ""}{t.title}</div>
                                                        <div className="text-slate-400 truncate">{t.assignedToStore || t.assignedTo}</div>
                                                    </button>
                                                ) })),
                                                ...dayMeetings.map((m) => ({ min: minutiDi(m.startTime), jsx: (
                                                    <button
                                                        key={`m-${m.id}`}
                                                        onClick={() => { selectDate(dateStr); setSelectedMeeting(m); setShowMeetingDetailModal(true); }}
                                                        className="w-full text-left px-1.5 py-1 rounded-lg border border-sky-500/30 bg-sky-500/10 text-[10px] leading-tight hover:bg-white/[0.08] transition-colors"
                                                    >
                                                        <div className="font-semibold text-sky-200 truncate">{m.startTime} {m.title}</div>
                                                        <div className="text-slate-400 truncate">{m.brand}</div>
                                                    </button>
                                                ) })),
                                            ].sort((x, y) => x.min - y.min).map((v) => v.jsx)}
                                            {dayAppts.length === 0 && dayTasks.length === 0 && dayMeetings.length === 0 && (
                                                <div className="text-center text-[10px] text-slate-600 pt-4">—</div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>)}

                    {/* DETTAGLIO TASK (Luca 31/07): modifica + nuovi assegnatari */}
                    {taskDettaglio && (
                        <TaskDettaglioModal
                            t={taskDettaglio}
                            puoGestire={canAssignOthers || taskDettaglio.createdBy === user?.name}
                            persone={[...(user?.name ? [user.name] : []), ...assignableAgents.filter(a => a !== user?.name)]}
                            negozi={storeNames}
                            esiti={esitiPer("task")}
                            onClose={() => setTaskDettaglio(null)}
                            onAggiornata={(nt) => setTasks(prev => prev.map(x => x.id === nt.id ? nt : x))}
                            onCopie={(ns) => setTasks(prev => [...prev, ...ns])}
                            onElimina={puoEliminareTask ? eliminaTask : undefined}
                        />
                    )}

                    {/* VISTA GIORNO (Luca 29/07): ore scandite in verticale stile Google
                        Calendar — tutta la giornata a colpo d'occhio, dettaglio inline. */}
                    {calView === "day" && (() => {
                        const H0 = 7, H1 = 22, PX = 64;                     // 07–22, 64px l'ora
                        const dayAppts = apptsByDate(dayDate);
                        const dayTasks = tasksByDate(dayDate);
                        const dayMeetings = meetingsByDate(dayDate);
                        const senzaOra = dayTasks.filter(t => !t.time);
                        // riporto arretrate (Luca 04/08): solo sul giorno CORRENTE,
                        // nella striscia "Tutto il giorno" come fa Google
                        const arretrateOggi = dayDate === todayStr ? arretrateInColonna : [];
                        type Ev = { key: string; min: number; durata: number; titolo: string; sotto: string; extra?: string; classi: string; onClick: () => void };
                        const evs: Ev[] = [
                            ...dayAppts.filter(a => minutiDi(a.time) < 24 * 60).map((a): Ev => ({
                                key: `a-${a.id}`, min: minutiDi(a.time), durata: 60,
                                titolo: `${fasciaLabel(a.fascia) || a.time} · ${a.customerName}`,
                                sotto: a.type === "incoming" ? `🏬 ${a.store || "Inbound"}` : a.type === "richiamo" ? `☎ Richiamo · ${a.createdBy || "call center"}` : `🧑‍💼 ${a.agente || "—"}${a.customerAddress ? " · " + a.customerAddress : ""}`,
                                extra: a.customerPhone ? `📞 ${a.customerPhone}` : undefined,
                                classi: a.type === "incoming" ? "border-blue-500/40 bg-blue-500/15" : a.type === "self_generated" ? "border-purple-500/40 bg-purple-500/15" : a.type === "richiamo" ? "border-pink-500/40 bg-pink-500/15" : "border-amber-500/40 bg-amber-500/15",
                                onClick: () => { setSelectedAppointment(a); setShowModal(true); },
                            })),
                            ...dayTasks.filter(t => t.time && minutiDi(t.time) < 24 * 60).map((t): Ev => ({
                                key: `t-${t.id}`, min: minutiDi(t.time), durata: 45,
                                titolo: `${t.time} · ${t.title}`, sotto: t.assignedToStore || t.assignedTo || "",
                                classi: "border-emerald-500/40 bg-emerald-500/15",
                                onClick: () => setTaskDettaglio(t),
                            })),
                            ...dayMeetings.map((m): Ev => ({
                                key: `m-${m.id}`, min: minutiDi(m.startTime),
                                durata: Math.max(30, minutiDi(m.endTime) - minutiDi(m.startTime) || 60),
                                titolo: `${m.startTime}${m.endTime ? "–" + m.endTime : ""} · ${m.title}`, sotto: m.brand || "Riunione",
                                classi: "border-sky-500/40 bg-sky-500/15",
                                onClick: () => { setSelectedMeeting(m); setShowMeetingDetailModal(true); },
                            })),
                        ].sort((x, y) => x.min - y.min);
                        // corsie per le sovrapposizioni (eventi contemporanei affiancati)
                        const fineCorsie: number[] = [];
                        const posiz = evs.map((e) => {
                            let lane = fineCorsie.findIndex(f => f <= e.min);
                            if (lane === -1) { lane = fineCorsie.length; fineCorsie.push(0); }
                            fineCorsie[lane] = e.min + e.durata;
                            return { ...e, lane };
                        });
                        const nCorsie = Math.max(1, fineCorsie.length);
                        const yDi = (min: number) => Math.max(0, Math.min((H1 - H0) * 60, min - H0 * 60)) / 60 * PX;
                        const adesso = new Date();
                        const oraLinea = dayDate === todayStr ? adesso.getHours() * 60 + adesso.getMinutes() : null;
                        return (
                            <div>
                                {(senzaOra.length > 0 || arretrateOggi.length > 0) && (
                                    <div className="mb-3 flex flex-wrap gap-1.5 items-center">
                                        <span className="text-[10px] uppercase tracking-wider text-slate-500">Tutto il giorno:</span>
                                        {arretrateOggi.map(t => (
                                            <button key={`arr-${t.id}`} onClick={() => setTaskDettaglio(t)}
                                                title={`Task arretrata del ${ggMm(t.date)} — apri il dettaglio`}
                                                className="px-2 py-1 rounded-lg border border-amber-500/40 bg-amber-500/15 text-[11px] text-amber-200 hover:bg-amber-500/25">
                                                ⏰ {ggMm(t.date)} · {t.title}
                                            </button>
                                        ))}
                                        {senzaOra.map(t => (
                                            <button key={`sg-${t.id}`} onClick={() => selectDate(dayDate)}
                                                className="px-2 py-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 text-[11px] text-emerald-200 hover:bg-emerald-500/25">
                                                {t.title}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <div className="relative rounded-xl border border-white/8 bg-white/[0.02] overflow-hidden" style={{ height: (H1 - H0) * PX }}>
                                    {Array.from({ length: H1 - H0 }, (_, i) => (
                                        <div key={i} className="absolute left-0 right-0 border-t border-white/5" style={{ top: i * PX }}>
                                            <span className="absolute -top-2.5 left-2 text-[10px] font-mono text-slate-500 bg-transparent">{String(H0 + i).padStart(2, "0")}:00</span>
                                        </div>
                                    ))}
                                    {oraLinea !== null && oraLinea >= H0 * 60 && oraLinea <= H1 * 60 && (
                                        <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: yDi(oraLinea) }}>
                                            <div className="border-t-2 border-rose-500" />
                                            <span className="absolute -top-2 left-1 w-2.5 h-2.5 rounded-full bg-rose-500" />
                                        </div>
                                    )}
                                    {posiz.map((e) => (
                                        <button key={e.key} onClick={e.onClick}
                                            className={cn("absolute z-10 text-left rounded-lg border px-2 py-1 overflow-hidden hover:brightness-125 transition-all", e.classi)}
                                            style={{
                                                top: yDi(e.min) + 1,
                                                height: Math.max(30, yDi(e.min + e.durata) - yDi(e.min) - 2),
                                                left: `calc(52px + ${e.lane} * ((100% - 60px) / ${nCorsie}))`,
                                                width: `calc((100% - 60px) / ${nCorsie} - 4px)`,
                                            }}>
                                            <div className="text-[11px] font-bold text-slate-100 truncate">{e.titolo}</div>
                                            <div className="text-[10px] text-slate-300 truncate">{e.sotto}</div>
                                            {e.extra && <div className="text-[10px] text-slate-400 truncate">{e.extra}</div>}
                                        </button>
                                    ))}
                                    {posiz.length === 0 && (
                                        <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-600">Nessun impegno in agenda per questo giorno</div>
                                    )}
                                </div>
                            </div>
                        );
                    })()}
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
                                            draggable
                                            onDragStart={(e) => { setDragApptId(a.id); e.dataTransfer.effectAllowed = "move"; }}
                                            onDragEnd={() => setDragApptId(null)}
                                            title="Trascinalo su un giorno del calendario per spostarlo"
                                            onClick={() => { setSelectedAppointment(a); setShowModal(true); }}
                                            className="w-full text-left p-3 rounded-xl bg-white/[0.03] border border-white/8 hover:bg-white/[0.06] transition-all cursor-grab active:cursor-grabbing"
                                        >
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-sm font-semibold text-white truncate max-w-[200px]">{a.fascia ? <span className="text-amber-300">{fasciaLabel(a.fascia)}</span> : a.time} — {a.customerName}</span>
                                                <span className={cn("text-[10px] px-2 py-0.5 rounded-full border font-medium", esitoClasse(a.status, a.type))}>
                                                    {esitoLabel(a.status, a.type)}
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
                                            {/* Chi l'ha fissato, A PRIMA VISTA (Luca 30/07): il negozio deve
                                                sapere quale operatore del call center ha preso l'appuntamento
                                                senza andare a scavare nello storico chiamate del cliente. */}
                                            {a.createdBy && (
                                                <div className="flex items-center gap-1.5 text-xs mt-1 text-violet-300">
                                                    📞 Fissato da <span className="font-semibold">{a.createdBy}</span>
                                                </div>
                                            )}
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

                            {/* riporto arretrate (Luca 04/08): sopra le task del giorno,
                                solo quando il pannello mostra OGGI */}
                            {selectedDate === todayStr && arretrateInColonna.length > 0 && (
                                <div className="mb-3 space-y-2">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">⏰ Task arretrate ({arretrateInColonna.length})</p>
                                    {arretrateInColonna.map(t => (
                                        <button key={`arrs-${t.id}`} onClick={() => setTaskDettaglio(t)}
                                            title="Apri la task (dettaglio e modifica)"
                                            className="w-full text-left p-2.5 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] hover:bg-amber-500/[0.14] transition-colors">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-sm font-semibold text-white truncate">{t.title}</span>
                                                <span className="text-[10px] font-mono font-bold text-amber-300 shrink-0">{ggMm(t.date)}</span>
                                            </div>
                                            <div className="text-xs text-slate-400 truncate mt-0.5">{t.assignedToStore ? `🏬 ${t.assignedToStore}` : t.assignedTo} · {giorniFa(t.date)} gg fa</div>
                                        </button>
                                    ))}
                                </div>
                            )}

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
                                                        onClick={() => setTaskDettaglio(t)}
                                                        title="Apri la task (dettaglio e modifica)"
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
                                                        const order = esitiPer("task").map((x) => x.chiave) as TaskStatus[];
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
                                                    {esitoLabel(t.status, "task")}
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
                                                            {esitiPer("task").map((x) => (
                                                                <option key={x.chiave} value={x.chiave}>{x.etichetta}</option>
                                                            ))}
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
                                {/* badge per TUTTI i tipi (Luca 08/08): prima era binario
                                    incoming/else → i richiami risultavano "Outbound" (bug di vista;
                                    a DB il type è corretto = 'richiamo', 0 outgoing) */}
                                <span className={cn("px-3 py-1 rounded-full border text-xs font-medium",
                                    selectedAppointment.type === "incoming" ? "bg-blue-500/15 border-blue-500/30 text-blue-400" :
                                        selectedAppointment.type === "richiamo" ? "bg-pink-500/15 border-pink-500/30 text-pink-300" :
                                            selectedAppointment.type === "self_generated" ? "bg-purple-500/15 border-purple-500/30 text-purple-300" :
                                                "bg-amber-500/15 border-amber-500/30 text-amber-400"
                                )}>
                                    {selectedAppointment.type === "incoming" ? "🏪 Inbound — cliente viene in store" :
                                        selectedAppointment.type === "richiamo" ? "☎️ Richiamo telefonico — call center" :
                                            selectedAppointment.type === "self_generated" ? "🧑‍💼 Auto-generato — agente" :
                                                "🚗 Outbound — agente va dal cliente"}
                                </span>
                                <span className={cn("px-2.5 py-1 rounded-full border text-xs font-medium", esitoClasse(selectedAppointment.status, selectedAppointment.type))}>
                                    {esitoLabel(selectedAppointment.status, selectedAppointment.type)}
                                </span>
                            </div>
                            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/8 space-y-2">
                                <div className="flex items-center gap-2 text-slate-300"><Clock className="w-4 h-4 text-slate-500" />{selectedAppointment.date}{selectedAppointment.fascia ? <span className="text-amber-300 font-semibold"> — {fasciaLabel(selectedAppointment.fascia)}</span> : <> alle {selectedAppointment.time}</>}</div>
                                <div className="flex items-center gap-2 text-slate-300"><User className="w-4 h-4 text-slate-500" />{selectedAppointment.customerName}</div>
                                <div className="flex items-center gap-2 text-slate-300"><Phone className="w-4 h-4 text-slate-500" />{selectedAppointment.customerPhone}</div>
                                {selectedAppointment.cfPiva && <div className="flex items-center gap-2 text-slate-300 font-mono"><Search className="w-4 h-4 text-slate-500" /><span className="text-[10px] uppercase text-slate-500 font-sans">{selectedAppointment.tipoCliente === "business" ? "P.IVA" : "C.F."}</span>{selectedAppointment.cfPiva}</div>}
                                {(selectedAppointment.referenteNome || selectedAppointment.referenteCognome) && (
                                    <div className="flex items-center gap-2 text-slate-300"><User className="w-4 h-4 text-slate-500" /><span className="text-[10px] uppercase text-slate-500">Referente</span>{`${selectedAppointment.referenteNome || ""} ${selectedAppointment.referenteCognome || ""}`.trim()}{selectedAppointment.referenteCf ? <span className="font-mono text-slate-400 text-xs">· {selectedAppointment.referenteCf}</span> : null}</div>
                                )}
                                <div className="flex items-center gap-2 text-slate-300">
                                    <MapPin className="w-4 h-4 text-slate-500" />{selectedAppointment.store || selectedAppointment.customerAddress}
                                    {selectedAppointment.customerAddress && (
                                        <a href={"https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(selectedAppointment.customerAddress)}
                                            target="_blank" rel="noopener noreferrer"
                                            title="Vedi su Google Maps dove si trova"
                                            className="px-2 py-0.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/25 text-xs shrink-0">🗺 Maps</a>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 text-slate-400 text-xs"><User className="w-3 h-3" />{selectedAppointment.type === "incoming" && selectedAppointment.store ? `Punto vendita: ${selectedAppointment.store}` : selectedAppointment.type === "richiamo" ? `Call center: ${selectedAppointment.createdBy || selectedAppointment.agente || "—"}` : `Agente: ${selectedAppointment.agente || "—"}`}</div>
                                {/* Operatore che ha preso l'appuntamento, a prima vista (Luca 30/07). */}
                                {selectedAppointment.createdBy && (
                                    <div className="flex items-center gap-2 text-violet-300 text-sm font-medium">
                                        📞 Fissato da <span className="font-bold">{selectedAppointment.createdBy}</span>
                                    </div>
                                )}
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
                                        // MOD-8: quando si sceglie "Da richiamare" apparecchia il pannello richiamo
                                        setRichiamoNegozioEsito(null);
                                        if (s === "da_richiamare") setRichiamoNegozio({ date: "", fascia: "mattina", time: "" });
                                    }}
                                >
                                    {(() => {
                                        // "attivato"/"attivato_diverso_negozio" NON sono selezionabili a
                                        // mano dal negozio (Luca 08/08): arrivano SOLO dal match con una
                                        // vendita registrata. Il valore corrente resta visibile.
                                        const BLOCCATI = ["attivato", "attivato_diverso_negozio"];
                                        const scelte = esitiPer(selectedAppointment.type).filter((x) => !BLOCCATI.includes(x.chiave));
                                        const cur = selectedAppointment.status;
                                        const conCorrente = scelte.some((x) => x.chiave === cur)
                                            ? scelte
                                            : [{ chiave: cur, etichetta: esitoLabel(cur, selectedAppointment.type), colore: "", attiva: true }, ...scelte];
                                        return conCorrente.map((x) => (
                                            <option key={x.chiave} value={x.chiave}>{x.etichetta}</option>
                                        ));
                                    })()}
                                </select>
                                <p className="text-[11px] text-slate-500">L&apos;esito «Attivato» si imposta da solo quando la vendita del cliente viene registrata (match automatico) — non è più selezionabile a mano.</p>
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

                                {/* MOD-8: negozio → "Da richiamare" → fissa il giorno → richiamo al call center */}
                                {selectedAppointment.status === "da_richiamare" && selectedAppointment.type !== "richiamo" && (
                                    <div className="mt-2 p-3 rounded-xl bg-pink-500/10 border border-pink-500/30 space-y-2">
                                        <p className="text-[11px] font-semibold text-pink-200 flex items-center gap-1.5">
                                            <Phone className="w-3.5 h-3.5" /> Genera l&apos;appuntamento telefonico per il call center
                                        </p>
                                        <p className="text-[11px] text-slate-400 leading-snug">
                                            Fissa quando il cliente va ricontattato: si crea un richiamo intestato a
                                            {selectedAppointment.createdBy ? ` ${selectedAppointment.createdBy}` : " chi ha fissato l'appuntamento"} e, se la pratica è collegata, torna nella coda del centralino.
                                        </p>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="block text-[10px] text-slate-500 mb-1">Giorno *</label>
                                                <input type="date" className="glass-input w-full text-xs"
                                                    value={richiamoNegozio.date}
                                                    onChange={e => setRichiamoNegozio(p => ({ ...p, date: e.target.value }))} />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] text-slate-500 mb-1">Fascia</label>
                                                <select className="glass-input w-full text-xs"
                                                    value={richiamoNegozio.fascia}
                                                    onChange={e => setRichiamoNegozio(p => ({ ...p, fascia: e.target.value }))}>
                                                    <option value="mattina">🌅 Mattina (10:00–13:00)</option>
                                                    <option value="pomeriggio">🌇 Pomeriggio (16:00–19:30)</option>
                                                </select>
                                            </div>
                                        </div>
                                        <button type="button" disabled={richiamoNegozioBusy || !richiamoNegozio.date}
                                            onClick={generaRichiamoDaNegozio}
                                            className="w-full py-2 rounded-lg bg-pink-500/20 border border-pink-500/40 text-pink-200 text-xs font-medium hover:bg-pink-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                                            {richiamoNegozioBusy ? "Creazione…" : "📞 Genera richiamo per il call center"}
                                        </button>
                                        {richiamoNegozioEsito && (
                                            <p className={cn("text-[11px] leading-snug", richiamoNegozioEsito.startsWith("✅") ? "text-emerald-300" : richiamoNegozioEsito.startsWith("⚠️") ? "text-amber-300" : "text-red-300")}>
                                                {richiamoNegozioEsito}
                                            </p>
                                        )}
                                    </div>
                                )}
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
                                            <SelectPersona value={newAppt.agente} opzioni={agents} placeholder="Scrivi l'agente…"
                                                onChange={(v) => setNewAppt(p => ({ ...p, agente: v }))} className="glass-input w-full" />
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
                            {/* VIA anche per gli AUTOGENERATI (Luca 29/07): autocomplete con
                                CAP/zona compilati dalla lista + bottone 🗺 che apre Maps. */}
                            {newAppt.type !== "incoming" && (
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Indirizzo cliente {newAppt.type === "outgoing" ? "*" : ""}</label>
                                    <div className="flex gap-2">
                                        <div className="flex-1 min-w-0">
                                            <IndirizzoAutocomplete value={newAppt.customerAddress} onChange={v => setNewAppt(p => ({ ...p, customerAddress: v }))} onPick={s => setNewAppt(p => ({ ...p, customerAddress: s.completo }))} className="glass-input w-full" placeholder="Via e civico: scegli dalla lista" />
                                        </div>
                                        {newAppt.customerAddress.trim() && (
                                            <a href={"https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(newAppt.customerAddress)}
                                                target="_blank" rel="noopener noreferrer"
                                                title="Vedi su Google Maps dove si trova"
                                                className="shrink-0 px-3 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/25 text-sm">🗺</a>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* CONSUMER/BUSINESS (Luca 29/07): il flag decide cosa chiede
                                il campo — Codice Fiscale o Partita IVA. */}
                            <div>
                                <div className="flex gap-2 mb-1.5">
                                    {([["consumer", "👤 Consumer"], ["business", "🏢 Business"]] as const).map(([id, lab]) => (
                                        <button key={id} type="button"
                                            onClick={() => setNewAppt(p => ({ ...p, tipoCliente: id }))}
                                            className={cn("px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all",
                                                newAppt.tipoCliente === id ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-300" : "bg-white/[0.03] border-white/10 text-slate-400 hover:bg-white/[0.06]")}>
                                            {lab}
                                        </button>
                                    ))}
                                </div>
                                {/* ricerca STANDARD del CRM (Luca 31/07): identica a Registra
                                    Vendita — un click compila CF, nome e telefono */}
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">Cliente esistente</label>
                                <RicercaCliente
                                    tipo={newAppt.tipoCliente === "business" ? "business" : "consumer"}
                                    className="mb-3"
                                    onScelto={(c) => setNewAppt(p => ({
                                        ...p,
                                        cfPiva: c.cf_piva || "",
                                        customerName: c.ragione_sociale || `${c.nome || ""} ${c.cognome || ""}`.trim(),
                                        customerPhone: numeroNazionale(c.cellulare || "") || c.cellulare || "",
                                        referenteNome: c.nome_ref || "",
                                        referenteCognome: c.cognome_ref || "",
                                        referenteCf: c.cf_ref || "",
                                    }))}
                                />
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">{newAppt.tipoCliente === "business" ? "Partita IVA *" : "Codice Fiscale *"}</label>
                                <input type="text" className="glass-input w-full font-mono uppercase"
                                    placeholder={newAppt.tipoCliente === "business" ? "es. 01234567890" : "es. RSSMRA80A01H501U"}
                                    maxLength={newAppt.tipoCliente === "business" ? 11 : 16}
                                    value={newAppt.cfPiva}
                                    onChange={e => setNewAppt(p => ({ ...p, cfPiva: p.tipoCliente === "business" ? e.target.value.replace(/\D/g, "") : e.target.value.toUpperCase() }))} required />
                                {/* REFERENTE (Luca 03/08): per il business valgono gli stessi
                                    obbligatori dell'anagrafica clienti — nome e cognome referente
                                    obbligatori, CF referente facoltativo */}
                                {newAppt.tipoCliente === "business" && (
                                    <div className="grid grid-cols-2 gap-3 mt-3">
                                        <div>
                                            <label className="block text-xs font-medium text-slate-400 mb-1.5">Nome Referente *</label>
                                            <input type="text" className="glass-input w-full" placeholder="Mario" value={newAppt.referenteNome}
                                                onChange={e => setNewAppt(p => ({ ...p, referenteNome: e.target.value }))} required />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-400 mb-1.5">Cognome Referente *</label>
                                            <input type="text" className="glass-input w-full" placeholder="Rossi" value={newAppt.referenteCognome}
                                                onChange={e => setNewAppt(p => ({ ...p, referenteCognome: e.target.value }))} required />
                                        </div>
                                        <div className="col-span-2">
                                            <label className="block text-xs font-medium text-slate-400 mb-1.5">CF Referente <span className="text-slate-600">(facoltativo)</span></label>
                                            <input type="text" className="glass-input w-full font-mono uppercase" placeholder="RSSMRA80A01H501U" maxLength={16}
                                                value={newAppt.referenteCf} onChange={e => setNewAppt(p => ({ ...p, referenteCf: e.target.value.toUpperCase().replace(/\s+/g, "") }))} />
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">{newAppt.tipoCliente === "business" ? "Ragione Sociale *" : "Nome cliente *"}</label>
                                    <input type="text" className="glass-input w-full" placeholder={newAppt.tipoCliente === "business" ? "Ragione sociale" : "Nome e cognome"} value={newAppt.customerName} onChange={e => setNewAppt(p => ({ ...p, customerName: e.target.value }))} required />
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
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">Assegna a * <span className="normal-case font-normal text-slate-500">(selezione multipla: una task a testa)</span></label>
                                <div className="flex gap-3 mb-2">
                                    <button type="button" onClick={() => setTaskModo("persone")}
                                        className={cn("flex-1 py-2 rounded-xl border text-sm font-medium", taskModo === "persone" ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-300" : "bg-white/5 border-white/10 text-slate-400")}>
                                        Operatori
                                    </button>
                                    <button type="button" onClick={() => setTaskModo("negozi")}
                                        className={cn("flex-1 py-2 rounded-xl border text-sm font-medium", taskModo === "negozi" ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-300" : "bg-white/5 border-white/10 text-slate-400")}>
                                        Punti vendita
                                    </button>
                                </div>
                                {taskModo === "negozi" ? (
                                    <SelectMulti values={taskNegozi} onChange={setTaskNegozi} opzioni={storeNames} className="w-full bg-black/40 border border-white/10 rounded-xl text-sm py-2.5 px-3.5" />
                                ) : (
                                    canAssignOthers ? (
                                        <SelectMulti values={taskPersone} onChange={setTaskPersone}
                                            opzioni={[...(user?.name ? [user.name] : []), ...assignableAgents.filter(a => a !== user?.name)]}
                                            className="w-full bg-black/40 border border-white/10 rounded-xl text-sm py-2.5 px-3.5" />
                                    ) : (
                                        <input className="glass-input w-full text-slate-400 bg-white/5" value={user?.name || ""} readOnly />
                                    )
                                )}
                                {taskModo === "negozi" && <p className="text-xs text-slate-500 mt-1">Ogni punto vendita scelto riceve la sua task, visibile a tutto il suo staff.</p>}
                                {taskModo === "persone" && canAssignOthers && taskPersone.length > 1 && <p className="text-xs text-slate-500 mt-1">Verranno create {taskPersone.length} task, una per operatore.</p>}
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
                    onClick={() => { setShowCreateMeetingModal(false); setCercaOperatore(""); setCercaNegozio(""); }}
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
                                    <IndirizzoAutocomplete value={newMeeting.location} onChange={v => setNewMeeting(p => ({ ...p, location: v }))} onPick={s => setNewMeeting(p => ({ ...p, location: s.completo }))} className="glass-input w-full" placeholder="Via e civico: scegli dalla lista" />
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

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-h-52 overflow-y-auto custom-scrollbar pr-1">
                                    <div>
                                        <p className="text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
                                            <Users className="w-3 h-3" />
                                            Operatori
                                        </p>
                                        <input value={cercaOperatore} onChange={(e) => setCercaOperatore(e.target.value)} placeholder="Cerca operatore…"
                                            className="w-full mb-1.5 bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-sky-500/50" />
                                        <div className="space-y-1.5">
                                            {meetingUsers.filter(u => { const q = cercaOperatore.trim().toLowerCase(); return !q || u.name.toLowerCase().includes(q) || (u.store || "").toLowerCase().includes(q); }).map(u => {
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
                                        <input value={cercaNegozio} onChange={(e) => setCercaNegozio(e.target.value)} placeholder="Cerca punto vendita…"
                                            className="w-full mb-1.5 bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-sky-500/50" />
                                        <div className="space-y-1.5">
                                            {storeNames.filter(s => { const q = cercaNegozio.trim().toLowerCase(); return !q || s.toLowerCase().includes(q); }).map(store => (
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

                                    {/* selezione rapida per BRAND (Luca 31/07): un click
                                        seleziona tutti gli operatori associati al brand */}
                                    <div>
                                        <p className="text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
                                            🏷️ Brand (selezione rapida)
                                        </p>
                                        <div className="space-y-1.5">
                                            {/* i brand REALI degli operatori (user_brands), non la lista
                                                fissa: Wind3/WindTre coincidono, e compaiono anche Sky,
                                                Energia, Iliad (Luca 31/07) */}
                                            {Array.from(new Set(meetingUsers.flatMap(u => u.brands))).sort().map(b => {
                                                const brandUsers = meetingUsers.filter(u => u.brands.some(x => brandCoincide(x, b)));
                                                return (
                                                    <button
                                                        key={b}
                                                        type="button"
                                                        disabled={!brandUsers.length}
                                                        onClick={() => brandUsers.forEach(u => handleToggleRecipient(u.id))}
                                                        className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg border bg-white/5 border-white/10 text-xs text-slate-300 hover:bg-white/10 disabled:opacity-40"
                                                    >
                                                        <span>{b}</span>
                                                        <span className="text-[10px] text-slate-500">{brandUsers.length} operatori</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* RIEPILOGO ESPLOSO degli invitati (Luca 31/07): tutti quelli
                                selezionati — anche dall'auto-selezione del brand — uno per
                                uno, con la ✕ per togliere chi non serve */}
                            {newMeeting.recipients.length > 0 && (
                                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/8">
                                    <p className="text-[11px] font-semibold text-slate-400 mb-2">
                                        Invitati selezionati ({newMeeting.recipients.length})
                                    </p>
                                    <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                                        {newMeeting.recipients.map(r => (
                                            <span key={r.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-100 text-xs">
                                                {r.name}{r.store ? <span className="text-[10px] text-slate-500">· {r.store}</span> : null}
                                                <button type="button" onClick={() => handleToggleRecipient(r.id)}
                                                    title={`Togli ${r.name} dagli invitati`}
                                                    className="text-sky-400/70 hover:text-white text-xs leading-none">✕</button>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
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
                        className="glass-card p-6 w-[96vw] max-w-6xl max-h-[92vh] overflow-y-auto"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="text-lg font-bold text-sky-300">Dettaglio riunione</h3>
                                <p className="text-xs text-slate-500">
                                    {selectedMeeting.date} · {selectedMeeting.startTime}–{selectedMeeting.endTime}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                {/* annulla SOLO chi l'ha indetta, o l'amministrativo in su (Luca 31/07) */}
                                {(selectedMeeting.createdBy === user?.name || ["amministrativo", "admin", "dev", "direttore_generale"].includes(user?.role || "")) && (
                                    <button
                                        onClick={() => eliminaRiunione(selectedMeeting)}
                                        className="px-3 py-1.5 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-bold hover:bg-rose-500/25 transition-colors"
                                    >
                                        🗑 Annulla riunione
                                    </button>
                                )}
                                <button
                                    onClick={() => setShowMeetingDetailModal(false)}
                                    className="text-slate-500 hover:text-slate-300"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
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

                                {/* a colonne (Luca 31/07): con 30 invitati la lista singola
                                    non bastava — 3 colonne su schermo largo, tanta altezza */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-1.5 max-h-[55vh] overflow-y-auto custom-scrollbar pr-1">
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

// ─── DETTAGLIO TASK (Luca 31/07) ─────────────────────────────────────────────
// Cliccando una task nel calendario centrale o nel pannello a destra si apre
// questo modale: campi modificabili (per chi la gestisce), stato, e AGGIUNTA
// di nuovi assegnatari — persone o punti vendita — che genera task gemelle.
function TaskDettaglioModal({ t, puoGestire, persone, negozi, esiti, onClose, onAggiornata, onCopie, onElimina }: {
    t: CalendarTask;
    puoGestire: boolean;
    persone: string[];
    negozi: string[];
    esiti: { chiave: string; etichetta: string; colore: string; attiva: boolean }[];
    onClose: () => void;
    onAggiornata: (t: CalendarTask) => void;
    onCopie: (nuove: CalendarTask[]) => void;
    /** cestino ADMIN (Luca 05/08): eliminazione definitiva, senza traccia */
    onElimina?: (t: CalendarTask) => void;
}) {
    const [titolo, setTitolo] = useState(t.title);
    const [data, setData] = useState(t.date);
    const [ora, setOra] = useState(t.time || "");
    const [note, setNote] = useState(t.notes || "");
    const [stato, setStato] = useState<TaskStatus>(t.status);
    const [addPersone, setAddPersone] = useState<string[]>([]);
    const [addNegozi, setAddNegozi] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);

    const salva = async () => {
        if (busy) return;
        setBusy(true);
        const patch: Record<string, unknown> = { status: stato };
        if (puoGestire) {
            patch.title = titolo.trim() || t.title;
            patch.date = data;
            patch.time = ora || null;
            patch.notes = note || null;
        }
        const { data: upd, error } = await supabase.from("calendar_tasks").update(patch).eq("id", t.id).select().single();
        if (error) { setBusy(false); alert("Salvataggio non riuscito: " + error.message); return; }
        onAggiornata(mapTaskRow(upd as Record<string, unknown>));
        if (puoGestire && (addPersone.length || addNegozi.length)) {
            const base = {
                title: (patch.title as string) || t.title, date: data, time: ora || null, status: "da_fare",
                notes: note || null, client_ref: t.clientRef || null, created_by: t.createdBy || "—",
                is_demo: false, // il default DB storico era TRUE (mig. 160)
            };
            const rows = [
                ...addPersone.filter((p) => p !== t.assignedTo).map((p) => ({ ...base, assigned_to: p, assigned_to_store: null })),
                ...addNegozi.filter((n) => n !== t.assignedToStore).map((n) => ({ ...base, assigned_to: "", assigned_to_store: n })),
            ];
            if (rows.length) {
                const { data: ins, error: e2 } = await supabase.from("calendar_tasks").insert(rows).select();
                if (e2) alert("Task gemelle NON create: " + e2.message);
                else onCopie(((ins ?? []) as Record<string, unknown>[]).map(mapTaskRow));
            }
        }
        setBusy(false);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="glass-card w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
                    <h3 className="text-lg font-bold text-white">✅ Task</h3>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg text-slate-400"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-5 space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1.5">Titolo</label>
                        <input className="glass-input w-full" value={titolo} onChange={(e) => setTitolo(e.target.value)} disabled={!puoGestire} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1.5">Data</label>
                            <input type="date" className="glass-input w-full" value={data} onChange={(e) => setData(e.target.value)} disabled={!puoGestire} />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1.5">Ora</label>
                            <input type="time" className="glass-input w-full" value={ora} onChange={(e) => setOra(e.target.value)} disabled={!puoGestire} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1.5">Assegnata a</label>
                            <input className="glass-input w-full text-slate-300 bg-white/5" value={t.assignedToStore ? `🏬 ${t.assignedToStore}` : (t.assignedTo || "—")} readOnly />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1.5">Stato</label>
                            <select className="glass-input w-full" value={stato} onChange={(e) => setStato(e.target.value as TaskStatus)}>
                                {esiti.filter((x) => x.attiva || x.chiave === stato).map((x) => <option key={x.chiave} value={x.chiave}>{x.etichetta}</option>)}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1.5">Note</label>
                        <textarea className="glass-input w-full resize-none" rows={2} value={note} onChange={(e) => setNote(e.target.value)} disabled={!puoGestire} />
                    </div>
                    {puoGestire && (
                        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/8 space-y-3">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Aggiungi assegnatari <span className="normal-case font-normal">(task gemelle, una a testa)</span></p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[11px] text-slate-500 mb-1">Operatori</label>
                                    <SelectMulti values={addPersone} onChange={setAddPersone} opzioni={persone} className="w-full bg-black/40 border border-white/10 rounded-xl text-sm py-2 px-3" />
                                </div>
                                <div>
                                    <label className="block text-[11px] text-slate-500 mb-1">Punti vendita</label>
                                    <SelectMulti values={addNegozi} onChange={setAddNegozi} opzioni={negozi} className="w-full bg-black/40 border border-white/10 rounded-xl text-sm py-2 px-3" />
                                </div>
                            </div>
                            {(addPersone.length + addNegozi.length) > 0 && <p className="text-[11px] text-slate-500">Al salvataggio verranno create {addPersone.length + addNegozi.length} task gemelle.</p>}
                        </div>
                    )}
                    <div className="flex items-center justify-between gap-3 pt-1">
                        <div className="flex items-center gap-3 min-w-0">
                            <p className="text-[11px] text-slate-600 truncate">Creata da {t.createdBy || "—"}</p>
                            {onElimina && (
                                <button onClick={() => onElimina(t)} title="Elimina PER SEMPRE (admin): sparisce per tutti, senza traccia"
                                    className="px-3 py-2 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/25 text-sm shrink-0">🗑 Elimina</button>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <button onClick={onClose} className="px-4 py-2 rounded-xl border border-white/10 text-slate-300 text-sm">Chiudi</button>
                            <button onClick={salva} disabled={busy} className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold disabled:opacity-40">{busy ? "Salvo…" : "Salva"}</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
