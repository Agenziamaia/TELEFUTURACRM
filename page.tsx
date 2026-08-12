"use client";

import { useState, useMemo, useEffect } from "react";
import {
    Phone, Plus, X, Search, RefreshCw, Filter, FileSpreadsheet,
    ClipboardList, ArrowLeft, ArrowRight, Check, Download, Upload,
    Trash2, Scale, AlertTriangle, MessageSquare, Calendar, User,
    Building, ChevronRight
} from "lucide-react";
import { usePageView } from "@/lib/pageView";
import { supabase } from "@/lib/supabaseClient";

/* ─────────────────────────────────────────────────────────────────────
   CONSTANTS
   ───────────────────────────────────────────────────────────────────── */

const BRANDS = ["WindTre", "Vodafone", "Fastweb", "Sky", "Energia", "Tim", "Altro"] as const;
const PROVENIENZE = ["Interno", "Esterno", "Acquistato", "Marketing", "Segnalazione"] as const;
const PROVENIENZE_LISTA = ["Interno", "Acquistato", "Marketing"] as const;
const TIPOLOGIE = ["DTS", "Outbound", "Teleselling"] as const;
const OBIETTIVI = ["Energia", "Sky", "CB", "Fisso", "Mobile", "Appuntamento"] as const;

const STATI = [
    "Nuovo",
    "Cold NR1", "Cold NR2", "Cold NR3",
    "Hot NR1", "Hot NR2", "Hot NR3",
    "1° Appuntamento", "2° Appuntamento", "3° Appuntamento",
    "1° DTS", "2° DTS", "3° DTS",
    "Da richiamare", "Appuntamento telefonico",
    "Non interessato", "Andato Non Interessato", "Non andato",
    "Archiviato", "Non ricontattare"
] as const;

const NR_STATI = ["Cold NR1", "Cold NR2", "Cold NR3", "Hot NR1", "Hot NR2", "Hot NR3"];
const RICHIAMO_STATI = ["Da richiamare", "Appuntamento telefonico"];
const APPUNTAMENTO_STATI = ["1° Appuntamento", "2° Appuntamento", "3° Appuntamento", "1° DTS", "2° DTS", "3° DTS"];

const NEGOZI = ["Roma Tuscolana", "Roma Tiburtina", "Roma Prati", "Roma EUR", "Guidonia", "Tivoli"];
const AGENTI = ["Marco Bianchi", "Luca Verdi", "Sara Neri", "Paolo Russo"];
const VENDITORI = ["Mario Rossi", "Anna Colombo", "Giuseppe Esposito", "Francesca Romano", "Alessandro Ferrari", "Giulia Costa", "Marco Bianchi", "Luca Verdi", "Sara Neri", "Paolo Russo"];
const CALLERS = ["Mario Rossi", "Anna Colombo", "Giuseppe Esposito", "Francesca Romano"];
const MESI = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
const ANNI = ["2024", "2025", "2026"];

const CAMPI_CONSUMER = ["Ignora", "Nome", "Cognome", "Codice Fiscale", "Numero", "Cellulare", "Note"];
const CAMPI_BUSINESS = ["Ignora", "Ragione Sociale", "Partita IVA", "Numero", "Cellulare", "Note"];
const COL_LETTERS = ["A", "B", "C", "D", "E", "F", "G"];

/* ─────────────────────────────────────────────────────────────────────
   TYPES
   ───────────────────────────────────────────────────────────────────── */

type TipoCliente = "consumer" | "business";
type Role = "caller" | "direttore" | "admin";

interface StoricoEntry {
    data: string;
    caller: string;
    campo: string;
    da: string;
    a: string;
}

interface Call {
    id: string;
    tipo_cliente: TipoCliente;
    nome: string;
    cognome: string;
    ragione_sociale: string;
    cf: string;
    piva: string;
    numero: string;
    cellulare: string;
    brand: string;
    provenienza: string;
    tipologia: string;
    obiettivo: string;
    stato: string;
    data_chiamata: string;
    caller: string;
    negozio_appuntamento: string;
    data_appuntamento: string;
    indirizzo: string;
    agente: string;
    segnalatore: string;
    campagna: string;
    negozio_provenienza: string;
    mese_provenienza: string;
    anno_provenienza: string;
    whatsapp: string;
    note: string;
    data_richiamo: string;
    lista_origine?: string | null;
    storico: StoricoEntry[];
    // Detail-mode only working fields
    statoNew?: string;
    dataRichiamoNew?: string;
    dataAppuntamentoNew?: string;
    whatsappNew?: string;
    noteUpdate?: string;
    clienteRiconosciuto?: boolean;
}

interface InternoRow {
    negozio: string;
    mese: string;
    anno: string;
    brand: string;
}

interface Split {
    caller: string;
    quantita: number;
}

interface ListaAssegnata {
    id: string;
    nome: string;
    data: string;
    tipo: TipoCliente;
    provenienza: string;
    segnalatore?: string;
    campagna?: string;
    brandAcq?: string;
    obiettivoMkt?: string;
    internoRows?: InternoRow[];
    fileName?: string;
    filePath?: string;
    numCols?: number;
    mappa?: Record<string, string>;
    totale: number;
    splits: Split[];
    lavorate: number;
}

interface Cliente {
    tipo: TipoCliente;
    cf?: string;
    piva?: string;
    nome?: string;
    cognome?: string;
    ragione_sociale?: string;
    numero?: string;
    cellulare?: string;
}

/* ─────────────────────────────────────────────────────────────────────
   SUPABASE MAPPERS
   Tables (to be created):
     - calls
     - call_history
     - liste
   ───────────────────────────────────────────────────────────────────── */

function mapRowToCall(row: Record<string, unknown>): Call {
    return {
        id: row.id as string,
        tipo_cliente: (row.tipo_cliente as TipoCliente) || "consumer",
        nome: (row.nome as string) || "",
        cognome: (row.cognome as string) || "",
        ragione_sociale: (row.ragione_sociale as string) || "",
        cf: (row.cf as string) || "",
        piva: (row.piva as string) || "",
        numero: (row.numero as string) || "",
        cellulare: (row.cellulare as string) || "",
        brand: (row.brand as string) || "",
        provenienza: (row.provenienza as string) || "",
        tipologia: (row.tipologia as string) || "",
        obiettivo: (row.obiettivo as string) || "",
        stato: (row.stato as string) || "",
        data_chiamata: (row.data_chiamata as string) || "",
        caller: (row.caller as string) || "",
        negozio_appuntamento: (row.negozio_appuntamento as string) || "",
        data_appuntamento: (row.data_appuntamento as string) || "",
        indirizzo: (row.indirizzo as string) || "",
        agente: (row.agente as string) || "",
        segnalatore: (row.segnalatore as string) || "",
        campagna: (row.campagna as string) || "",
        negozio_provenienza: (row.negozio_provenienza as string) || "",
        mese_provenienza: (row.mese_provenienza as string) || "",
        anno_provenienza: (row.anno_provenienza as string) || "",
        whatsapp: (row.whatsapp as string) || "",
        note: (row.note as string) || "",
        data_richiamo: (row.data_richiamo as string) || "",
        lista_origine: (row.lista_origine as string) || null,
        storico: (row.storico as StoricoEntry[]) || [],
    };
}

function mapRowToLista(row: Record<string, unknown>): ListaAssegnata {
    return {
        id: row.id as string,
        nome: (row.nome as string) || "",
        data: (row.data as string) || "",
        tipo: (row.tipo as TipoCliente) || "consumer",
        provenienza: (row.provenienza as string) || "",
        segnalatore: (row.segnalatore as string) || "",
        campagna: (row.campagna as string) || "",
        brandAcq: (row.brand_acq as string) || "",
        obiettivoMkt: (row.obiettivo_mkt as string) || "",
        internoRows: (row.interno_rows as InternoRow[]) || [],
        fileName: (row.file_name as string) || "",
        filePath: (row.file_path as string) || "",
        numCols: (row.num_cols as number) || 0,
        mappa: (row.mappa as Record<string, string>) || {},
        totale: (row.totale as number) || 0,
        splits: (row.splits as Split[]) || [],
        lavorate: (row.lavorate as number) || 0,
    };
}

/* ─────────────────────────────────────────────────────────────────────
   HELPERS
   ───────────────────────────────────────────────────────────────────── */

function formatDate(d: string): string {
    if (!d) return "—";
    const dt = new Date(d);
    const dd = String(dt.getDate()).padStart(2, "0");
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const yy = dt.getFullYear();
    const hh = String(dt.getHours()).padStart(2, "0");
    const mi = String(dt.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yy} ${hh}:${mi}`;
}

function formatDateShort(d: string): string {
    if (!d) return "—";
    const dt = new Date(d);
    return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
}

function statoBadgeClasses(stato: string): string {
    if (stato === "Nuovo") return "bg-blue-500/15 border-blue-500/30 text-blue-300";
    if (stato.startsWith("Cold")) return "bg-cyan-500/15 border-cyan-500/30 text-cyan-300";
    if (stato.startsWith("Hot")) return "bg-orange-500/15 border-orange-500/30 text-orange-300";
    if (stato.includes("Appuntamento") && !stato.includes("telefonico") && !stato.includes("Andato") && !stato.includes("Non")) return "bg-purple-500/15 border-purple-500/30 text-purple-300";
    if (stato.includes("DTS")) return "bg-indigo-500/15 border-indigo-500/30 text-indigo-300";
    if (stato === "Da richiamare") return "bg-yellow-500/15 border-yellow-500/30 text-yellow-300";
    if (stato === "Appuntamento telefonico") return "bg-pink-500/15 border-pink-500/30 text-pink-300";
    if (stato === "Non interessato" || stato === "Andato Non Interessato") return "bg-red-500/15 border-red-500/30 text-red-300";
    if (stato === "Non andato") return "bg-orange-600/15 border-orange-600/30 text-orange-400";
    if (stato === "Archiviato") return "bg-slate-500/15 border-slate-500/30 text-slate-400";
    if (stato === "Non ricontattare") return "bg-red-700/20 border-red-700/40 text-red-400";
    return "bg-white/5 border-white/10 text-slate-400";
}

function blankCall(callerName: string, isDirector: boolean): Call {
    return {
        id: crypto.randomUUID(),
        tipo_cliente: "consumer",
        nome: "", cognome: "", ragione_sociale: "",
        cf: "", piva: "",
        numero: "", cellulare: "",
        brand: "", provenienza: "", tipologia: "", obiettivo: "",
        stato: isDirector ? "Nuovo" : "",
        data_chiamata: new Date().toISOString().slice(0, 16),
        caller: callerName,
        negozio_appuntamento: "", data_appuntamento: "",
        indirizzo: "", agente: "", segnalatore: "", campagna: "",
        negozio_provenienza: "", mese_provenienza: "", anno_provenienza: "",
        whatsapp: "", note: "", data_richiamo: "",
        lista_origine: null,
        storico: [],
    };
}

/* ─────────────────────────────────────────────────────────────────────
   PAGE VIEW STATE (persisted across navigation)
   ───────────────────────────────────────────────────────────────────── */

const defaultCallerView = {
    currentView: "calls" as "calls" | "liste",
    fCf: "",
    fNome: "",
    fNegozio: "",
    fDataApp: "",
    fDataChiamata: "",
    fStato: "",
    fCaller: "",
    fBrand: "",
    fProvenienza: "",
    fTipologia: "",
    fObiettivo: "",
    fLista: "",
    // liste filters
    fLProvenienza: "",
    fLDataDa: "",
    fLDataA: "",
    fLCaller: "",
    fLBrand: "",
};

/* ─────────────────────────────────────────────────────────────────────
   MAIN PAGE
   ───────────────────────────────────────────────────────────────────── */

export default function CallerPage() {
    const [view, setView] = usePageView<typeof defaultCallerView>("caller", defaultCallerView);

    // TODO: replace with real session role from auth context
    // For now we expose a role switcher (visible in dev / staging)
    const [currentRole, setCurrentRole] = useState<Role>("caller");
    const currentCaller = "Mario Rossi"; // TODO: pull from session
    const isDirector = currentRole === "direttore" || currentRole === "admin";

    /* ── Data state ── */
    const [calls, setCalls] = useState<Call[]>([]);
    const [listeAssegnate, setListeAssegnate] = useState<ListaAssegnata[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    /* ── Modal state ── */
    const [modalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<"new" | "detail">("new");
    const [editCall, setEditCall] = useState<Call | null>(null);
    const [hoverRow, setHoverRow] = useState<string | null>(null);

    /* ── Lista wizard state ── */
    const [listaOpen, setListaOpen] = useState(false);
    const [listaStep, setListaStep] = useState(1);
    const [listaTipo, setListaTipo] = useState<TipoCliente>("consumer");
    const [listaNome, setListaNome] = useState("");
    const [listaFile, setListaFile] = useState("");
    const [listaFileObj, setListaFileObj] = useState<File | null>(null);
    const [listaRows, setListaRows] = useState(0);
    const [listaProvenienza, setListaProvenienza] = useState("");
    const [listaSegnalatore, setListaSegnalatore] = useState("");
    const [listaCampagna, setListaCampagna] = useState("");
    const [listaBrandAcq, setListaBrandAcq] = useState("");
    const [listaObiettivoMkt, setListaObiettivoMkt] = useState("");
    const [listaInternoRows, setListaInternoRows] = useState<InternoRow[]>([{ negozio: "", mese: "", anno: "", brand: "" }]);
    const [listaNumCols, setListaNumCols] = useState(4);
    const [listaMappa, setListaMappa] = useState<Record<string, string>>({ A: "Ignora", B: "Ignora", C: "Ignora", D: "Ignora", E: "Ignora", F: "Ignora", G: "Ignora" });
    const [listaSplits, setListaSplits] = useState<Split[]>([{ caller: "", quantita: 0 }]);

    /* ── Lista detail (storico) ── */
    const [listaDetail, setListaDetail] = useState<ListaAssegnata | null>(null);
    const [hoverListaRow, setHoverListaRow] = useState<string | null>(null);

    // Filter view bindings
    const fCf = view.fCf, setFCf = (v: string) => setView((p) => ({ ...p, fCf: v }));
    const fNome = view.fNome, setFNome = (v: string) => setView((p) => ({ ...p, fNome: v }));
    const fNegozio = view.fNegozio, setFNegozio = (v: string) => setView((p) => ({ ...p, fNegozio: v }));
    const fDataApp = view.fDataApp, setFDataApp = (v: string) => setView((p) => ({ ...p, fDataApp: v }));
    const fDataChiamata = view.fDataChiamata, setFDataChiamata = (v: string) => setView((p) => ({ ...p, fDataChiamata: v }));
    const fStato = view.fStato, setFStato = (v: string) => setView((p) => ({ ...p, fStato: v }));
    const fCaller = view.fCaller, setFCaller = (v: string) => setView((p) => ({ ...p, fCaller: v }));
    const fBrand = view.fBrand, setFBrand = (v: string) => setView((p) => ({ ...p, fBrand: v }));
    const fProvenienza = view.fProvenienza, setFProvenienza = (v: string) => setView((p) => ({ ...p, fProvenienza: v }));
    const fTipologia = view.fTipologia, setFTipologia = (v: string) => setView((p) => ({ ...p, fTipologia: v }));
    const fObiettivo = view.fObiettivo, setFObiettivo = (v: string) => setView((p) => ({ ...p, fObiettivo: v }));
    const fLista = view.fLista, setFLista = (v: string) => setView((p) => ({ ...p, fLista: v }));
    const fLProvenienza = view.fLProvenienza, setFLProvenienza = (v: string) => setView((p) => ({ ...p, fLProvenienza: v }));
    const fLDataDa = view.fLDataDa, setFLDataDa = (v: string) => setView((p) => ({ ...p, fLDataDa: v }));
    const fLDataA = view.fLDataA, setFLDataA = (v: string) => setView((p) => ({ ...p, fLDataA: v }));
    const fLCaller = view.fLCaller, setFLCaller = (v: string) => setView((p) => ({ ...p, fLCaller: v }));
    const fLBrand = view.fLBrand, setFLBrand = (v: string) => setView((p) => ({ ...p, fLBrand: v }));
    const currentView = view.currentView;
    const setCurrentView = (v: "calls" | "liste") => setView((p) => ({ ...p, currentView: v }));

    /* ── Fetchers ── */
    const fetchCalls = async () => {
        const { data, error } = await supabase
            .from("calls")
            .select("*")
            .order("data_chiamata", { ascending: false });
        if (error) {
            setLoadError(error.message);
            setCalls([]);
        } else {
            setCalls((data ?? []).map(mapRowToCall));
        }
    };

    const fetchListe = async () => {
        const { data, error } = await supabase
            .from("liste")
            .select("*")
            .order("data", { ascending: false });
        if (error) {
            setListeAssegnate([]);
        } else {
            setListeAssegnate((data ?? []).map(mapRowToLista));
        }
    };

    useEffect(() => {
        const init = async () => {
            setLoading(true);
            await Promise.all([fetchCalls(), fetchListe()]);
            setLoading(false);
        };
        init();
    }, []);

    /* ── Filtering ── */
    const filtered = useMemo(() => calls.filter((c) => {
        if (!isDirector && c.caller !== currentCaller) return false;
        if (fCf && !(c.cf.toLowerCase().includes(fCf.toLowerCase()) || c.piva.toLowerCase().includes(fCf.toLowerCase()))) return false;
        if (fNome) {
            const search = fNome.toLowerCase();
            const match = `${c.nome} ${c.cognome}`.toLowerCase().includes(search) || c.ragione_sociale.toLowerCase().includes(search);
            if (!match) return false;
        }
        if (fNegozio && c.negozio_appuntamento !== fNegozio) return false;
        if (fDataApp && c.data_appuntamento && !c.data_appuntamento.startsWith(fDataApp)) return false;
        if (fDataChiamata && !c.data_chiamata.startsWith(fDataChiamata)) return false;
        if (fStato && c.stato !== fStato) return false;
        if (fCaller && c.caller !== fCaller) return false;
        if (fBrand && c.brand !== fBrand) return false;
        if (fProvenienza && c.provenienza !== fProvenienza) return false;
        if (fTipologia && c.tipologia !== fTipologia) return false;
        if (fObiettivo && c.obiettivo !== fObiettivo) return false;
        if (fLista && (!c.lista_origine || !c.lista_origine.toLowerCase().includes(fLista.toLowerCase()))) return false;
        return true;
    }), [calls, isDirector, currentCaller, fCf, fNome, fNegozio, fDataApp, fDataChiamata, fStato, fCaller, fBrand, fProvenienza, fTipologia, fObiettivo, fLista]);

    function listaBrandLabel(l: ListaAssegnata): string {
        if (l.provenienza === "Acquistato") return l.brandAcq || "—";
        if (l.provenienza === "Marketing") return l.brandAcq || "—";
        if (l.provenienza === "Interno") {
            const brands = (l.internoRows || []).map(r => r.brand).filter(Boolean);
            const unique = brands.filter((b, i) => brands.indexOf(b) === i);
            if (unique.length === 0) return "—";
            return unique.join(", ");
        }
        return "—";
    }

    function listaCallersLabel(l: ListaAssegnata): string {
        return (l.splits || []).map(s => s.caller).join(", ") || "—";
    }

    const filteredListe = useMemo(() => listeAssegnate.filter((l) => {
        if (fLProvenienza && l.provenienza !== fLProvenienza) return false;
        if (fLDataDa && l.data < fLDataDa) return false;
        if (fLDataA && l.data > `${fLDataA}T23:59`) return false;
        if (fLCaller && !(l.splits || []).some(s => s.caller === fLCaller)) return false;
        if (fLBrand) {
            const brand = listaBrandLabel(l);
            if (!brand.includes(fLBrand)) return false;
        }
        return true;
    }), [listeAssegnate, fLProvenienza, fLDataDa, fLDataA, fLCaller, fLBrand]);

    /* ── Handlers ── */

    function openNew() {
        setEditCall(blankCall(currentCaller, isDirector));
        setModalMode("new");
        setModalOpen(true);
    }

    function openDetail(call: Call) {
        const copy: Call = JSON.parse(JSON.stringify(call));
        copy.statoNew = "";
        copy.dataRichiamoNew = "";
        copy.dataAppuntamentoNew = "";
        copy.whatsappNew = "";
        copy.noteUpdate = "";
        setEditCall(copy);
        setModalMode("detail");
        setModalOpen(true);
    }

    function closeModal() {
        setModalOpen(false);
        setEditCall(null);
    }

    function updateField<K extends keyof Call>(field: K, value: Call[K]) {
        setEditCall((prev) => prev ? ({ ...prev, [field]: value }) : prev);
    }

    /* ── Cliente lookup (CRM Clienti integration) ── */
    async function lookupCliente(tipo: TipoCliente, identificativo: string): Promise<Cliente | null> {
        if (!identificativo) return null;
        const id = identificativo.toUpperCase().trim();
        if (tipo === "consumer" && id.length !== 16) return null;
        if (tipo === "business" && id.length !== 11) return null;
        const { data, error } = await supabase
            .from("clients")
            .select("*")
            .eq("cf_piva", id)
            .eq("tipo", tipo)
            .maybeSingle();
        if (error || !data) return null;
        return {
            tipo: data.tipo as TipoCliente,
            cf: tipo === "consumer" ? id : undefined,
            piva: tipo === "business" ? id : undefined,
            nome: data.nome,
            cognome: data.cognome,
            ragione_sociale: data.ragione_sociale,
            numero: data.cellulare,
            cellulare: data.cellulare,
        };
    }

    async function handleIdentificativoChange(field: "cf" | "piva", value: string) {
        if (!editCall) return;
        const updated: Call = { ...editCall, [field]: value };
        const trovato = await lookupCliente(editCall.tipo_cliente, value);
        if (trovato) {
            if (editCall.tipo_cliente === "consumer") {
                updated.nome = trovato.nome || "";
                updated.cognome = trovato.cognome || "";
            } else {
                updated.ragione_sociale = trovato.ragione_sociale || "";
            }
            updated.numero = trovato.numero || "";
            updated.cellulare = trovato.cellulare || "";
            updated.clienteRiconosciuto = true;
        } else {
            updated.clienteRiconosciuto = false;
        }
        setEditCall(updated);
    }

    function resetClienteLookup() {
        if (!editCall) return;
        setEditCall({
            ...editCall,
            nome: "", cognome: "", ragione_sociale: "",
            cf: "", piva: "",
            numero: "", cellulare: "",
            clienteRiconosciuto: false,
        });
    }

    /* ── Save ── */
    async function saveCall() {
        if (!editCall) return;
        const now = new Date().toISOString().slice(0, 16);
        if (modalMode === "new") {
            const newCall: Call = { ...editCall };
            newCall.storico = [{ data: newCall.data_chiamata, caller: newCall.caller, campo: "Creazione", da: "", a: newCall.stato }];
            const payload: Record<string, unknown> = {
                tipo_cliente: newCall.tipo_cliente,
                nome: newCall.nome, cognome: newCall.cognome, ragione_sociale: newCall.ragione_sociale,
                cf: newCall.cf, piva: newCall.piva,
                numero: newCall.numero, cellulare: newCall.cellulare,
                brand: newCall.brand, provenienza: newCall.provenienza,
                tipologia: newCall.tipologia, obiettivo: newCall.obiettivo,
                stato: newCall.stato, data_chiamata: newCall.data_chiamata, caller: newCall.caller,
                negozio_appuntamento: newCall.negozio_appuntamento, data_appuntamento: newCall.data_appuntamento,
                indirizzo: newCall.indirizzo, agente: newCall.agente,
                segnalatore: newCall.segnalatore, campagna: newCall.campagna,
                negozio_provenienza: newCall.negozio_provenienza, mese_provenienza: newCall.mese_provenienza, anno_provenienza: newCall.anno_provenienza,
                whatsapp: newCall.whatsapp, note: newCall.note, data_richiamo: newCall.data_richiamo,
                lista_origine: newCall.lista_origine,
                storico: newCall.storico,
            };
            const { error } = await supabase.from("calls").insert(payload);
            if (error) {
                alert("Errore salvataggio: " + error.message);
                return;
            }
            await fetchCalls();
        } else {
            // Detail mode: update only stato and append history
            if (!editCall.statoNew) { closeModal(); return; }
            const original = calls.find(c => c.id === editCall.id);
            if (!original) return;
            const newStorico: StoricoEntry[] = [
                ...(original.storico || []),
                { data: now, caller: currentCaller, campo: "Stato", da: original.stato, a: editCall.statoNew }
            ];
            const updates: Record<string, unknown> = { stato: editCall.statoNew, storico: newStorico };

            if (RICHIAMO_STATI.includes(editCall.statoNew) && editCall.dataRichiamoNew) {
                newStorico.push({ data: now, caller: currentCaller, campo: "Data richiamo", da: "", a: formatDate(editCall.dataRichiamoNew) });
                updates.data_richiamo = editCall.dataRichiamoNew;
            }
            if (APPUNTAMENTO_STATI.includes(editCall.statoNew) && editCall.dataAppuntamentoNew) {
                newStorico.push({ data: now, caller: currentCaller, campo: "Data appuntamento", da: "", a: formatDate(editCall.dataAppuntamentoNew) });
                updates.data_appuntamento = editCall.dataAppuntamentoNew;
            }
            if (NR_STATI.includes(editCall.statoNew) && editCall.whatsappNew) {
                newStorico.push({ data: now, caller: currentCaller, campo: "WhatsApp", da: "", a: editCall.whatsappNew });
            }
            if (editCall.noteUpdate) {
                newStorico.push({ data: now, caller: currentCaller, campo: "Nota", da: "", a: editCall.noteUpdate });
            }
            updates.storico = newStorico;

            const { error } = await supabase.from("calls").update(updates).eq("id", editCall.id);
            if (error) {
                alert("Errore aggiornamento: " + error.message);
                return;
            }
            await fetchCalls();
        }
        closeModal();
    }

    function resetFilters() {
        setView((p) => ({
            ...p,
            fCf: "", fNome: "", fNegozio: "", fDataApp: "", fDataChiamata: "",
            fStato: "", fCaller: "", fBrand: "", fProvenienza: "", fTipologia: "",
            fObiettivo: "", fLista: ""
        }));
    }

    function resetFiltriListe() {
        setView((p) => ({
            ...p,
            fLProvenienza: "", fLDataDa: "", fLDataA: "", fLCaller: "", fLBrand: ""
        }));
    }

    function clientLabel(c: Call): string {
        if (c.tipo_cliente === "business") return c.ragione_sociale || "—";
        return `${c.nome} ${c.cognome}`.trim() || "—";
    }

    /* ── Lista wizard handlers ── */

    function openLista() {
        setListaStep(1);
        setListaTipo("consumer");
        setListaNome("");
        setListaFile("");
        setListaFileObj(null);
        setListaRows(0);
        setListaProvenienza("");
        setListaSegnalatore("");
        setListaCampagna("");
        setListaBrandAcq("");
        setListaObiettivoMkt("");
        setListaInternoRows([{ negozio: "", mese: "", anno: "", brand: "" }]);
        setListaNumCols(4);
        setListaMappa({ A: "Ignora", B: "Ignora", C: "Ignora", D: "Ignora", E: "Ignora", F: "Ignora", G: "Ignora" });
        setListaSplits([{ caller: "", quantita: 0 }]);
        setListaOpen(true);
    }

    function closeLista() { setListaOpen(false); }

    function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const f = e.target.files && e.target.files[0];
        if (f) {
            setListaFile(f.name);
            setListaFileObj(f);
            // TODO: parse the Excel server-side via API to get exact row count.
            // For now we set a placeholder count; backend will recalculate at insert time.
            setListaRows(Math.max(1, Math.floor(f.size / 200)));
        }
    }

    function updateMappa(col: string, val: string) {
        setListaMappa((prev) => ({ ...prev, [col]: val }));
    }
    function addSplit() { setListaSplits((prev) => [...prev, { caller: "", quantita: 0 }]); }
    function removeSplit(idx: number) { setListaSplits((prev) => prev.filter((_, i) => i !== idx)); }
    function updateSplit(idx: number, field: keyof Split, val: string) {
        setListaSplits((prev) => prev.map((s, i) => {
            if (i !== idx) return s;
            return { ...s, [field]: field === "quantita" ? parseInt(val || "0", 10) : val };
        }));
    }
    function dividiEqualmente() {
        const validi = listaSplits.filter(s => s.caller);
        if (validi.length === 0) return;
        const base = Math.floor(listaRows / validi.length);
        const resto = listaRows - base * validi.length;
        let i = 0;
        setListaSplits((prev) => prev.map(s => {
            if (!s.caller) return s;
            const q = base + (i < resto ? 1 : 0);
            i++;
            return { caller: s.caller, quantita: q };
        }));
    }

    function addInternoRow() { setListaInternoRows((prev) => [...prev, { negozio: "", mese: "", anno: "", brand: "" }]); }
    function removeInternoRow(idx: number) { setListaInternoRows((prev) => prev.filter((_, i) => i !== idx)); }
    function updateInternoRow(idx: number, field: keyof InternoRow, val: string) {
        setListaInternoRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));
    }

    const totaleAssegnato = listaSplits.reduce((sum, s) => sum + (s.quantita || 0), 0);
    const splitsValidi = listaSplits.filter(s => s.caller && s.quantita > 0).length > 0 && totaleAssegnato === listaRows;

    async function confermaLista() {
        if (!listaFileObj) return;

        // Step 1: upload file to Supabase storage
        const filePath = `liste/${Date.now()}_${listaFileObj.name}`;
        const { error: uploadError } = await supabase.storage
            .from("liste-files")
            .upload(filePath, listaFileObj);
        if (uploadError) {
            alert("Errore upload file: " + uploadError.message);
            return;
        }

        // Step 2: determine auto-populated brand and obiettivo
        let brandAuto = "";
        let obiettivoAuto = "";
        if (listaProvenienza === "Acquistato") brandAuto = listaBrandAcq;
        if (listaProvenienza === "Marketing") obiettivoAuto = listaObiettivoMkt;
        if (listaProvenienza === "Interno" && listaInternoRows.length === 1) brandAuto = listaInternoRows[0].brand || "";

        const dataAssegnazione = new Date().toISOString().slice(0, 16);

        // Step 3: insert lista record
        const listaPayload = {
            nome: listaNome,
            data: dataAssegnazione,
            tipo: listaTipo,
            provenienza: listaProvenienza,
            segnalatore: listaSegnalatore,
            campagna: listaCampagna,
            brand_acq: listaBrandAcq,
            obiettivo_mkt: listaObiettivoMkt,
            interno_rows: listaInternoRows.filter(r => r.negozio && r.mese && r.anno),
            file_name: listaFile,
            file_path: filePath,
            num_cols: listaNumCols,
            mappa: listaMappa,
            totale: listaRows,
            splits: listaSplits.filter(s => s.caller && s.quantita > 0),
            lavorate: 0,
        };
        const { error: listaError } = await supabase.from("liste").insert(listaPayload);
        if (listaError) {
            alert("Errore creazione lista: " + listaError.message);
            return;
        }

        // Step 4: bulk-create calls assigned to callers
        // NOTE: in production, the Excel parsing should happen server-side via an API route
        // that reads the file from storage, applies `mappa`, and bulk-inserts the calls.
        // The placeholder calls below assume that flow; replace with `fetch('/api/liste/process', ...)`.
        const callsPayloads: Record<string, unknown>[] = [];
        let rowIdx = 0;
        listaSplits.forEach((split) => {
            for (let i = 0; i < split.quantita; i++) {
                rowIdx++;
                callsPayloads.push({
                    tipo_cliente: listaTipo,
                    nome: listaTipo === "consumer" ? `Lead ${rowIdx}` : "",
                    cognome: listaTipo === "consumer" ? listaNome : "",
                    ragione_sociale: listaTipo === "business" ? `Lead ${rowIdx} - ${listaNome}` : "",
                    cf: "", piva: "", numero: "", cellulare: "",
                    brand: brandAuto, provenienza: listaProvenienza, tipologia: "", obiettivo: obiettivoAuto,
                    stato: "Nuovo",
                    data_chiamata: dataAssegnazione,
                    caller: split.caller,
                    negozio_appuntamento: "", data_appuntamento: "",
                    indirizzo: "", agente: "",
                    segnalatore: listaSegnalatore,
                    campagna: listaCampagna,
                    negozio_provenienza: listaInternoRows.map(r => r.negozio).filter(Boolean).join(", "),
                    mese_provenienza: listaInternoRows.map(r => r.mese).filter(Boolean).join(", "),
                    anno_provenienza: listaInternoRows.map(r => r.anno).filter(Boolean).join(", "),
                    whatsapp: "", note: `Da lista: ${listaNome}`, data_richiamo: "",
                    lista_origine: listaNome,
                    storico: [{ data: dataAssegnazione, caller: "Direttore CC", campo: "Assegnazione lista", da: "", a: `Nuovo (lista: ${listaNome})` }]
                });
            }
        });
        if (callsPayloads.length > 0) {
            const { error: callsError } = await supabase.from("calls").insert(callsPayloads);
            if (callsError) {
                alert("Errore creazione call: " + callsError.message);
                return;
            }
        }

        await Promise.all([fetchCalls(), fetchListe()]);
        closeLista();
    }

    /* ── Step navigation flags ── */
    const campiDisponibili = listaTipo === "consumer" ? CAMPI_CONSUMER : CAMPI_BUSINESS;
    const colsAttive = COL_LETTERS.slice(0, listaNumCols);
    const canNext1 = !!listaTipo;
    const canNext2 = !!listaNome && !!listaFile && listaRows > 0;
    let canNext3 = !!listaProvenienza;
    if (listaProvenienza === "Acquistato" && !listaBrandAcq) canNext3 = false;
    if (listaProvenienza === "Marketing" && (!listaCampagna || !listaObiettivoMkt)) canNext3 = false;
    if (listaProvenienza === "Interno" && !listaInternoRows.some(r => r.negozio && r.mese && r.anno && r.brand)) canNext3 = false;
    const canNext4 = colsAttive.some(c => listaMappa[c] === "Numero");
    const canConfirm = splitsValidi;

    const statiDisponibili = isDirector ? STATI : STATI.filter(s => s !== "Nuovo");

    /* ── Detail mode flags ── */
    const statoNewIsNR = !!editCall && NR_STATI.includes(editCall.statoNew || "");
    const statoNewIsRichiamo = !!editCall && RICHIAMO_STATI.includes(editCall.statoNew || "");
    const statoNewIsAppuntamento = !!editCall && APPUNTAMENTO_STATI.includes(editCall.statoNew || "");

    const isBusiness = editCall && editCall.tipo_cliente === "business";
    const isDTS = editCall && editCall.tipologia === "DTS";
    const isOutbound = editCall && editCall.tipologia === "Outbound";
    const isSegnalazione = editCall && editCall.provenienza === "Segnalazione";
    const isMarketing = editCall && editCall.provenienza === "Marketing";
    const isInterno = editCall && editCall.provenienza === "Interno";
    const needsWhatsapp = editCall && NR_STATI.includes(editCall.stato);
    const needsRichiamo = editCall && RICHIAMO_STATI.includes(editCall.stato);

    const isListeView = currentView === "liste";

    /* ════════════════════════════════════════════════════════════════
       RENDER
       ════════════════════════════════════════════════════════════════ */

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0a0c10]">
            {/* HEADER */}
            <header className="flex-none flex flex-wrap items-center justify-between gap-4 px-8 py-6 border-b border-white/5 bg-[#0f111a]/50 backdrop-blur-xl">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center border border-violet-500/20">
                        {isListeView ? <ClipboardList className="w-5 h-5 text-violet-400" /> : <Phone className="w-5 h-5 text-violet-400" />}
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
                            {isListeView ? "Storico Liste" : "Caller"}
                            <span className="px-2.5 py-0.5 rounded-full bg-violet-500/15 text-violet-300 text-xs font-semibold">
                                {isListeView ? filteredListe.length : filtered.length}
                            </span>
                        </h1>
                        <p className="text-sm text-slate-400">{isListeView ? "Liste assegnate ai caller" : "Gestione lead e chiamate Call Center"}</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    {/* TODO: remove role switcher in production - use real session role */}
                    <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
                        {(["caller", "direttore", "admin"] as const).map((r) => (
                            <button
                                key={r}
                                onClick={() => setCurrentRole(r)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${currentRole === r ? "bg-violet-500/20 text-violet-300 border border-violet-500/20" : "text-slate-400 hover:text-white"}`}
                            >
                                {r}
                            </button>
                        ))}
                    </div>

                    {isDirector && (
                        <button
                            onClick={() => setCurrentView(currentView === "calls" ? "liste" : "calls")}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 text-xs font-bold uppercase tracking-widest transition-all"
                        >
                            {currentView === "calls" ? <ClipboardList className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
                            {currentView === "calls" ? "Storico Liste" : "Torna alle Call"}
                        </button>
                    )}
                    {isDirector && !isListeView && (
                        <button
                            onClick={openLista}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 text-xs font-bold uppercase tracking-widest transition-all"
                        >
                            <FileSpreadsheet className="w-4 h-4" /> Assegna Liste
                        </button>
                    )}
                    {!isListeView && (
                        <button
                            onClick={openNew}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs uppercase tracking-widest transition-all shadow-lg shadow-violet-500/20 active:scale-95"
                        >
                            <Plus className="w-4 h-4" /> Nuova Call
                        </button>
                    )}
                    {isListeView && isDirector && (
                        <button
                            onClick={openLista}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs uppercase tracking-widest transition-all shadow-lg shadow-violet-500/20 active:scale-95"
                        >
                            <Plus className="w-4 h-4" /> Nuova Lista
                        </button>
                    )}
                </div>
            </header>

            {loadError && (
                <div className="px-8 py-3 bg-red-500/10 border-b border-red-500/20 text-red-300 text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> {loadError}
                </div>
            )}

            {/* CONTENT */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8">
                <div className="max-w-7xl mx-auto space-y-6">

                    {/* ── CALLS VIEW ── */}
                    {!isListeView && (
                        <>
                            {/* Filter bar */}
                            <div className="glass-panel p-5">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                        <Filter className="w-3.5 h-3.5" /> Filtri
                                    </h3>
                                    <button onClick={resetFilters} className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white transition-colors">
                                        <RefreshCw className="w-3 h-3" /> Reset
                                    </button>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                                    <FilterField label="CF / P.IVA"><input className="glass-input text-sm rounded-lg py-2 w-full" value={fCf} onChange={(e) => setFCf(e.target.value)} placeholder="Cerca..." /></FilterField>
                                    <FilterField label="Nome / Rag. Soc."><input className="glass-input text-sm rounded-lg py-2 w-full" value={fNome} onChange={(e) => setFNome(e.target.value)} placeholder="Cerca..." /></FilterField>
                                    <FilterField label="Negozio App.">
                                        <select className="glass-input text-sm rounded-lg py-2 w-full" value={fNegozio} onChange={(e) => setFNegozio(e.target.value)}>
                                            <option value="">Tutti</option>
                                            {NEGOZI.map(n => <option key={n} value={n}>{n}</option>)}
                                        </select>
                                    </FilterField>
                                    <FilterField label="Data App."><input type="date" className="glass-input text-sm rounded-lg py-2 w-full" value={fDataApp} onChange={(e) => setFDataApp(e.target.value)} /></FilterField>
                                    <FilterField label="Data Chiamata"><input type="date" className="glass-input text-sm rounded-lg py-2 w-full" value={fDataChiamata} onChange={(e) => setFDataChiamata(e.target.value)} /></FilterField>
                                    <FilterField label="Stato">
                                        <select className="glass-input text-sm rounded-lg py-2 w-full" value={fStato} onChange={(e) => setFStato(e.target.value)}>
                                            <option value="">Tutti</option>
                                            {STATI.map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </FilterField>
                                    {isDirector && (
                                        <FilterField label="Caller">
                                            <select className="glass-input text-sm rounded-lg py-2 w-full" value={fCaller} onChange={(e) => setFCaller(e.target.value)}>
                                                <option value="">Tutti</option>
                                                {CALLERS.map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                        </FilterField>
                                    )}
                                    <FilterField label="Brand">
                                        <select className="glass-input text-sm rounded-lg py-2 w-full" value={fBrand} onChange={(e) => setFBrand(e.target.value)}>
                                            <option value="">Tutti</option>
                                            {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                                        </select>
                                    </FilterField>
                                    <FilterField label="Provenienza">
                                        <select className="glass-input text-sm rounded-lg py-2 w-full" value={fProvenienza} onChange={(e) => setFProvenienza(e.target.value)}>
                                            <option value="">Tutte</option>
                                            {PROVENIENZE.map(p => <option key={p} value={p}>{p}</option>)}
                                        </select>
                                    </FilterField>
                                    <FilterField label="Tipologia">
                                        <select className="glass-input text-sm rounded-lg py-2 w-full" value={fTipologia} onChange={(e) => setFTipologia(e.target.value)}>
                                            <option value="">Tutte</option>
                                            {TIPOLOGIE.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </FilterField>
                                    <FilterField label="Obiettivo">
                                        <select className="glass-input text-sm rounded-lg py-2 w-full" value={fObiettivo} onChange={(e) => setFObiettivo(e.target.value)}>
                                            <option value="">Tutti</option>
                                            {OBIETTIVI.map(o => <option key={o} value={o}>{o}</option>)}
                                        </select>
                                    </FilterField>
                                    <FilterField label="Lista Origine"><input className="glass-input text-sm rounded-lg py-2 w-full" value={fLista} onChange={(e) => setFLista(e.target.value)} placeholder="Nome lista..." /></FilterField>
                                </div>
                            </div>

                            {/* Calls table */}
                            <div className="glass-panel overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-white/5">
                                            <Th>Cliente</Th>
                                            <Th>Brand</Th>
                                            <Th>Provenienza</Th>
                                            <Th>Tipologia</Th>
                                            <Th>Obiettivo</Th>
                                            <Th>Data Chiamata</Th>
                                            <Th>Caller</Th>
                                            <Th>Stato</Th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loading && (<tr><td colSpan={8} className="text-center py-12 text-slate-500">Caricamento...</td></tr>)}
                                        {!loading && filtered.length === 0 && (<tr><td colSpan={8} className="text-center py-12 text-slate-500">Nessuna call trovata</td></tr>)}
                                        {filtered.map((c) => (
                                            <tr
                                                key={c.id}
                                                onClick={() => openDetail(c)}
                                                onMouseEnter={() => setHoverRow(c.id)}
                                                onMouseLeave={() => setHoverRow(null)}
                                                className={`border-b border-white/5 cursor-pointer transition-colors ${hoverRow === c.id ? "bg-white/[0.04]" : ""}`}
                                            >
                                                <td className="px-4 py-3">
                                                    <div className="font-semibold text-white">{clientLabel(c)}</div>
                                                    <div className="text-[11px] text-slate-500 mt-0.5">{c.tipo_cliente === "business" ? "■ Business" : "● Consumer"}</div>
                                                </td>
                                                <td className="px-4 py-3 text-slate-300">{c.brand || "—"}</td>
                                                <td className="px-4 py-3 text-slate-300">{c.provenienza || "—"}</td>
                                                <td className="px-4 py-3 text-slate-300">{c.tipologia || "—"}</td>
                                                <td className="px-4 py-3 text-slate-300">{c.obiettivo || "—"}</td>
                                                <td className="px-4 py-3 font-mono text-xs text-slate-400">{formatDateShort(c.data_chiamata)}</td>
                                                <td className="px-4 py-3 text-slate-300">{c.caller}</td>
                                                <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${statoBadgeClasses(c.stato)}`}>{c.stato}</span></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    {/* ── LISTE VIEW ── */}
                    {isListeView && (
                        <>
                            {/* Liste filter bar */}
                            <div className="glass-panel p-5">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                        <Filter className="w-3.5 h-3.5" /> Filtri
                                    </h3>
                                    <button onClick={resetFiltriListe} className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white transition-colors">
                                        <RefreshCw className="w-3 h-3" /> Reset
                                    </button>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                                    <FilterField label="Provenienza">
                                        <select className="glass-input text-sm rounded-lg py-2 w-full" value={fLProvenienza} onChange={(e) => setFLProvenienza(e.target.value)}>
                                            <option value="">Tutte</option>
                                            {PROVENIENZE_LISTA.map(p => <option key={p} value={p}>{p}</option>)}
                                        </select>
                                    </FilterField>
                                    <FilterField label="Brand">
                                        <select className="glass-input text-sm rounded-lg py-2 w-full" value={fLBrand} onChange={(e) => setFLBrand(e.target.value)}>
                                            <option value="">Tutti</option>
                                            {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                                        </select>
                                    </FilterField>
                                    <FilterField label="Caller">
                                        <select className="glass-input text-sm rounded-lg py-2 w-full" value={fLCaller} onChange={(e) => setFLCaller(e.target.value)}>
                                            <option value="">Tutti</option>
                                            {CALLERS.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </FilterField>
                                    <FilterField label="Assegnata Dal"><input type="date" className="glass-input text-sm rounded-lg py-2 w-full" value={fLDataDa} onChange={(e) => setFLDataDa(e.target.value)} /></FilterField>
                                    <FilterField label="Assegnata Al"><input type="date" className="glass-input text-sm rounded-lg py-2 w-full" value={fLDataA} onChange={(e) => setFLDataA(e.target.value)} /></FilterField>
                                </div>
                            </div>

                            {/* Liste table */}
                            <div className="glass-panel overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-white/5">
                                            <Th>Nome Lista</Th>
                                            <Th>Provenienza</Th>
                                            <Th>Brand</Th>
                                            <Th>Data Assegnazione</Th>
                                            <Th>Contatti</Th>
                                            <Th>Caller</Th>
                                            <Th>Avanzamento</Th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredListe.length === 0 && (<tr><td colSpan={7} className="text-center py-12 text-slate-500">Nessuna lista trovata</td></tr>)}
                                        {filteredListe.map((l) => {
                                            const pct = l.totale > 0 ? Math.round((l.lavorate / l.totale) * 100) : 0;
                                            return (
                                                <tr
                                                    key={l.id}
                                                    onClick={() => setListaDetail(l)}
                                                    onMouseEnter={() => setHoverListaRow(l.id)}
                                                    onMouseLeave={() => setHoverListaRow(null)}
                                                    className={`border-b border-white/5 cursor-pointer transition-colors ${hoverListaRow === l.id ? "bg-white/[0.04]" : ""}`}
                                                >
                                                    <td className="px-4 py-3">
                                                        <div className="font-semibold text-white">{l.nome}</div>
                                                        <div className="text-[11px] text-slate-500 mt-0.5">{l.tipo === "business" ? "■ Business" : "● Consumer"}</div>
                                                    </td>
                                                    <td className="px-4 py-3"><span className="px-2.5 py-1 rounded-full text-[11px] font-bold border bg-violet-500/15 border-violet-500/30 text-violet-300">{l.provenienza}</span></td>
                                                    <td className="px-4 py-3 text-slate-300">{listaBrandLabel(l)}</td>
                                                    <td className="px-4 py-3 font-mono text-xs text-slate-400">{formatDateShort(l.data)}</td>
                                                    <td className="px-4 py-3 font-mono font-bold text-white">{l.totale}</td>
                                                    <td className="px-4 py-3 text-xs text-slate-400">{listaCallersLabel(l)}</td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex flex-col gap-1 min-w-[120px]">
                                                            <span className={`text-[11px] font-bold ${pct === 100 ? "text-emerald-400" : "text-violet-300"}`}>{l.lavorate}/{l.totale} · {pct}%</span>
                                                            <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
                                                                <div className={`h-full transition-all ${pct === 100 ? "bg-emerald-500" : "bg-violet-500"}`} style={{ width: `${pct}%` }} />
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* ════════════════════════════════════════════════════════════════
                CALL MODAL (Nuova / Dettaglio)
                ════════════════════════════════════════════════════════════════ */}
            {modalOpen && editCall && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={closeModal}>
                    <div className="glass-panel w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border-white/10" onClick={(e) => e.stopPropagation()}>
                        <div className="flex-none px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
                            <h2 className="text-lg font-bold text-white uppercase tracking-tight">{modalMode === "new" ? "Nuova Call" : "Dettaglio Call"}</h2>
                            <button onClick={closeModal} className="p-2 rounded-xl hover:bg-white/5 text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-5 scrollbar-hide">
                            {/* ── NEW MODE ── */}
                            {modalMode === "new" && (
                                <>
                                    <FormGroup label="Tipo Cliente">
                                        <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
                                            {(["consumer", "business"] as const).map(t => (
                                                <button
                                                    key={t}
                                                    onClick={() => { resetClienteLookup(); updateField("tipo_cliente", t); }}
                                                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${editCall.tipo_cliente === t ? "bg-violet-500/20 text-violet-300 border border-violet-500/20" : "text-slate-400 hover:text-white"}`}
                                                >
                                                    {t}
                                                </button>
                                            ))}
                                        </div>
                                    </FormGroup>

                                    {/* Identificativo first for lookup */}
                                    {isBusiness ? (
                                        <FormGroup label="Partita IVA">
                                            <input className="glass-input rounded-lg py-2 w-full" value={editCall.piva} maxLength={11} onChange={(e) => handleIdentificativoChange("piva", e.target.value)} placeholder="01234567890 (11 cifre)" />
                                        </FormGroup>
                                    ) : (
                                        <FormGroup label="Codice Fiscale">
                                            <input className="glass-input rounded-lg py-2 w-full" value={editCall.cf} maxLength={16} onChange={(e) => handleIdentificativoChange("cf", e.target.value)} placeholder="RSSMRA80A01H501B (16 caratteri)" />
                                        </FormGroup>
                                    )}

                                    {editCall.clienteRiconosciuto && (
                                        <div className="flex items-center gap-3 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
                                            <Check className="w-5 h-5 text-emerald-400" />
                                            <span className="flex-1 text-xs font-semibold text-emerald-300">Cliente trovato in anagrafica — dati pre-compilati</span>
                                            <button onClick={resetClienteLookup} className="px-3 py-1 rounded-md border border-emerald-500/30 text-emerald-300 text-[10px] font-bold uppercase tracking-widest">Reset</button>
                                        </div>
                                    )}

                                    {isBusiness ? (
                                        <FormGroup label="Ragione Sociale">
                                            <input className="glass-input rounded-lg py-2 w-full" value={editCall.ragione_sociale} readOnly={editCall.clienteRiconosciuto} onChange={(e) => updateField("ragione_sociale", e.target.value)} placeholder="Es. Azienda SRL" />
                                        </FormGroup>
                                    ) : (
                                        <div className="grid grid-cols-2 gap-3">
                                            <FormGroup label="Nome">
                                                <input className="glass-input rounded-lg py-2 w-full" value={editCall.nome} readOnly={editCall.clienteRiconosciuto} onChange={(e) => updateField("nome", e.target.value)} placeholder="Es. Mario" />
                                            </FormGroup>
                                            <FormGroup label="Cognome">
                                                <input className="glass-input rounded-lg py-2 w-full" value={editCall.cognome} readOnly={editCall.clienteRiconosciuto} onChange={(e) => updateField("cognome", e.target.value)} placeholder="Es. Rossi" />
                                            </FormGroup>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-2 gap-3">
                                        <FormGroup label="Numero (attività)">
                                            <input className="glass-input rounded-lg py-2 w-full" value={editCall.numero} readOnly={editCall.clienteRiconosciuto} onChange={(e) => updateField("numero", e.target.value)} placeholder="333 123 4567" />
                                        </FormGroup>
                                        <FormGroup label="Recapito Cellulare">
                                            <input className="glass-input rounded-lg py-2 w-full" value={editCall.cellulare} readOnly={editCall.clienteRiconosciuto} onChange={(e) => updateField("cellulare", e.target.value)} placeholder="Se diverso" />
                                        </FormGroup>
                                    </div>

                                    <div className="border-t border-white/5 pt-5">
                                        <h3 className="text-xs font-bold text-violet-300 uppercase tracking-widest mb-4">Dettagli Chiamata</h3>

                                        <div className="grid grid-cols-2 gap-3 mb-3">
                                            <FormGroup label="Brand">
                                                <select className="glass-input rounded-lg py-2 w-full" value={editCall.brand} onChange={(e) => updateField("brand", e.target.value)}>
                                                    <option value="">Seleziona...</option>
                                                    {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                                                </select>
                                            </FormGroup>
                                            <FormGroup label="Obiettivo">
                                                <select className="glass-input rounded-lg py-2 w-full" value={editCall.obiettivo} onChange={(e) => updateField("obiettivo", e.target.value)}>
                                                    <option value="">Seleziona...</option>
                                                    {OBIETTIVI.map(o => <option key={o} value={o}>{o}</option>)}
                                                </select>
                                            </FormGroup>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3 mb-3">
                                            <FormGroup label="Provenienza">
                                                <select className="glass-input rounded-lg py-2 w-full" value={editCall.provenienza} onChange={(e) => updateField("provenienza", e.target.value)}>
                                                    <option value="">Seleziona...</option>
                                                    {PROVENIENZE.map(p => <option key={p} value={p}>{p}</option>)}
                                                </select>
                                            </FormGroup>
                                            <FormGroup label="Tipologia">
                                                <select className="glass-input rounded-lg py-2 w-full" value={editCall.tipologia} onChange={(e) => updateField("tipologia", e.target.value)}>
                                                    <option value="">Seleziona...</option>
                                                    {TIPOLOGIE.map(t => <option key={t} value={t}>{t}</option>)}
                                                </select>
                                            </FormGroup>
                                        </div>

                                        {isSegnalazione && (
                                            <FormGroup label="Segnalatore">
                                                <select className="glass-input rounded-lg py-2 w-full" value={editCall.segnalatore} onChange={(e) => updateField("segnalatore", e.target.value)}>
                                                    <option value="">Seleziona venditore...</option>
                                                    {VENDITORI.map(v => <option key={v} value={v}>{v}</option>)}
                                                </select>
                                            </FormGroup>
                                        )}
                                        {isMarketing && (
                                            <FormGroup label="Campagna">
                                                <input className="glass-input rounded-lg py-2 w-full" value={editCall.campagna} onChange={(e) => updateField("campagna", e.target.value)} placeholder="Nome campagna..." />
                                            </FormGroup>
                                        )}
                                        {isInterno && (
                                            <div className="grid grid-cols-3 gap-3">
                                                <FormGroup label="Negozio Provenienza">
                                                    <select className="glass-input rounded-lg py-2 w-full" value={editCall.negozio_provenienza} onChange={(e) => updateField("negozio_provenienza", e.target.value)}>
                                                        <option value="">Seleziona...</option>
                                                        {NEGOZI.map(n => <option key={n} value={n}>{n}</option>)}
                                                    </select>
                                                </FormGroup>
                                                <FormGroup label="Mese">
                                                    <select className="glass-input rounded-lg py-2 w-full" value={editCall.mese_provenienza} onChange={(e) => updateField("mese_provenienza", e.target.value)}>
                                                        <option value="">Mese...</option>
                                                        {MESI.map(m => <option key={m} value={m}>{m}</option>)}
                                                    </select>
                                                </FormGroup>
                                                <FormGroup label="Anno">
                                                    <select className="glass-input rounded-lg py-2 w-full" value={editCall.anno_provenienza} onChange={(e) => updateField("anno_provenienza", e.target.value)}>
                                                        <option value="">Anno...</option>
                                                        {ANNI.map(a => <option key={a} value={a}>{a}</option>)}
                                                    </select>
                                                </FormGroup>
                                            </div>
                                        )}

                                        {isDTS && (
                                            <FormGroup label="Negozio Appuntamento">
                                                <select className="glass-input rounded-lg py-2 w-full" value={editCall.negozio_appuntamento} onChange={(e) => updateField("negozio_appuntamento", e.target.value)}>
                                                    <option value="">Seleziona negozio...</option>
                                                    {NEGOZI.map(n => <option key={n} value={n}>{n}</option>)}
                                                </select>
                                            </FormGroup>
                                        )}
                                        {isOutbound && (
                                            <>
                                                <FormGroup label="Indirizzo Appuntamento">
                                                    <input className="glass-input rounded-lg py-2 w-full" value={editCall.indirizzo} onChange={(e) => updateField("indirizzo", e.target.value)} placeholder="Via, Città..." />
                                                </FormGroup>
                                                <FormGroup label="Agente Assegnato">
                                                    <select className="glass-input rounded-lg py-2 w-full" value={editCall.agente} onChange={(e) => updateField("agente", e.target.value)}>
                                                        <option value="">Seleziona agente...</option>
                                                        {AGENTI.map(a => <option key={a} value={a}>{a}</option>)}
                                                    </select>
                                                </FormGroup>
                                            </>
                                        )}
                                        {(isDTS || isOutbound) && (
                                            <FormGroup label="Data e Ora Appuntamento">
                                                <input type="datetime-local" className="glass-input rounded-lg py-2 w-full" value={editCall.data_appuntamento} onChange={(e) => updateField("data_appuntamento", e.target.value)} />
                                            </FormGroup>
                                        )}

                                        <FormGroup label="Stato">
                                            <select className="glass-input rounded-lg py-2 w-full" value={editCall.stato} onChange={(e) => updateField("stato", e.target.value)}>
                                                <option value="">Seleziona...</option>
                                                {statiDisponibili.map(s => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                        </FormGroup>

                                        {needsWhatsapp && (
                                            <div className="flex items-center gap-3 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl mb-3">
                                                <MessageSquare className="w-4 h-4 text-emerald-400" />
                                                <span className="flex-1 text-xs font-semibold text-emerald-300">WhatsApp inviato?</span>
                                                <div className="flex bg-black/40 p-1 rounded-lg border border-white/5">
                                                    {(["Sì", "No"] as const).map(v => (
                                                        <button key={v} onClick={() => updateField("whatsapp", v)} className={`px-3 py-1 rounded-md text-xs font-bold ${editCall.whatsapp === v ? "bg-violet-500/20 text-violet-300" : "text-slate-400"}`}>{v}</button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {needsRichiamo && (
                                            <FormGroup label="Data e Ora Richiamo">
                                                <input type="datetime-local" className="glass-input rounded-lg py-2 w-full" value={editCall.data_richiamo} onChange={(e) => updateField("data_richiamo", e.target.value)} />
                                            </FormGroup>
                                        )}

                                        <FormGroup label="Note">
                                            <textarea className="glass-input rounded-lg py-2 w-full min-h-[60px]" value={editCall.note} onChange={(e) => updateField("note", e.target.value)} placeholder="Annotazioni sulla chiamata..." />
                                        </FormGroup>

                                        <div className="grid grid-cols-2 gap-3">
                                            <FormGroup label="Data Chiamata">
                                                <input type="datetime-local" className="glass-input rounded-lg py-2 w-full opacity-60" value={editCall.data_chiamata} readOnly />
                                            </FormGroup>
                                            <FormGroup label="Caller">
                                                <input className="glass-input rounded-lg py-2 w-full opacity-60" value={editCall.caller} readOnly />
                                            </FormGroup>
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* ── DETAIL MODE ── */}
                            {modalMode === "detail" && (
                                <>
                                    {editCall.lista_origine && (
                                        <div className="flex items-center gap-3 p-4 bg-violet-500/10 border border-violet-500/30 rounded-xl">
                                            <ClipboardList className="w-5 h-5 text-violet-300" />
                                            <div className="flex-1">
                                                <div className="text-[11px] text-violet-300 uppercase tracking-widest font-semibold">Lead assegnata da lista</div>
                                                <div className="text-sm text-white font-bold mt-0.5">{editCall.lista_origine}</div>
                                            </div>
                                        </div>
                                    )}

                                    <SectionTitle>Anagrafica Cliente <span className="ml-2 text-[10px] text-slate-500">{editCall.tipo_cliente === "business" ? "■ Business" : "● Consumer"}</span></SectionTitle>
                                    <div className="grid grid-cols-2 gap-3 p-4 bg-violet-500/[0.04] border border-white/5 rounded-xl">
                                        {editCall.tipo_cliente === "business" ? (
                                            <SummaryItem label="Ragione Sociale" value={editCall.ragione_sociale} />
                                        ) : (
                                            <SummaryItem label="Nome e Cognome" value={`${editCall.nome} ${editCall.cognome}`.trim()} />
                                        )}
                                        <SummaryItem label={editCall.tipo_cliente === "business" ? "Partita IVA" : "Codice Fiscale"} value={editCall.tipo_cliente === "business" ? editCall.piva : editCall.cf} />
                                        <SummaryItem label="Numero" value={editCall.numero} />
                                        <SummaryItem label="Recapito Cellulare" value={editCall.cellulare} />
                                    </div>

                                    <SectionTitle>Dettagli Call</SectionTitle>
                                    <div className="grid grid-cols-2 gap-3 p-4 bg-violet-500/[0.04] border border-white/5 rounded-xl">
                                        <SummaryItem label="Brand" value={editCall.brand} />
                                        <SummaryItem label="Obiettivo" value={editCall.obiettivo} />
                                        <SummaryItem label="Provenienza" value={editCall.provenienza} />
                                        <SummaryItem label="Tipologia" value={editCall.tipologia} />
                                        {editCall.provenienza === "Segnalazione" && <SummaryItem label="Segnalatore" value={editCall.segnalatore} />}
                                        {editCall.provenienza === "Marketing" && <SummaryItem label="Campagna" value={editCall.campagna} />}
                                        {editCall.provenienza === "Interno" && <SummaryItem label="Negozio Prov." value={`${editCall.negozio_provenienza} ${editCall.mese_provenienza} ${editCall.anno_provenienza}`} />}
                                        {editCall.tipologia === "DTS" && <SummaryItem label="Negozio Appuntamento" value={editCall.negozio_appuntamento} />}
                                        {editCall.tipologia === "Outbound" && <SummaryItem label="Indirizzo" value={editCall.indirizzo} />}
                                        {editCall.tipologia === "Outbound" && <SummaryItem label="Agente" value={editCall.agente} />}
                                        {(editCall.tipologia === "DTS" || editCall.tipologia === "Outbound") && <SummaryItem label="Data Appuntamento" value={editCall.data_appuntamento ? formatDate(editCall.data_appuntamento) : ""} />}
                                        <SummaryItem label="Data Chiamata" value={formatDate(editCall.data_chiamata)} />
                                        <SummaryItem label="Caller" value={editCall.caller} />
                                        {editCall.data_richiamo && <SummaryItem label="Prossimo Richiamo" value={formatDate(editCall.data_richiamo)} />}
                                        {editCall.whatsapp && <SummaryItem label="WhatsApp Inviato" value={editCall.whatsapp} />}
                                    </div>

                                    {editCall.note && (
                                        <>
                                            <SectionTitle>Note</SectionTitle>
                                            <div className="p-3 bg-black/20 border border-white/5 rounded-xl text-xs text-slate-400 leading-relaxed">{editCall.note}</div>
                                        </>
                                    )}

                                    <SectionTitle>Aggiorna Stato</SectionTitle>
                                    <div className="p-4 bg-black/20 border border-white/5 rounded-xl space-y-3">
                                        <div className="flex items-center gap-3">
                                            <div className="flex-1">
                                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Stato Old</label>
                                                <div className="mt-1 px-3 py-2 bg-black/40 border border-white/5 rounded-lg">
                                                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${statoBadgeClasses(editCall.stato)}`}>{editCall.stato}</span>
                                                </div>
                                            </div>
                                            <ArrowRight className="w-5 h-5 text-violet-300 mt-5" />
                                            <div className="flex-1">
                                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Stato New</label>
                                                <select className="glass-input rounded-lg py-2 w-full mt-1" value={editCall.statoNew || ""} onChange={(e) => updateField("statoNew", e.target.value)}>
                                                    <option value="">Seleziona nuovo stato...</option>
                                                    {STATI.filter(s => s !== "Nuovo").map(s => <option key={s} value={s}>{s}</option>)}
                                                </select>
                                            </div>
                                        </div>

                                        {statoNewIsNR && (
                                            <div className="flex items-center gap-3 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
                                                <MessageSquare className="w-4 h-4 text-emerald-400" />
                                                <span className="flex-1 text-xs font-semibold text-emerald-300">WhatsApp inviato?</span>
                                                <div className="flex bg-black/40 p-1 rounded-lg border border-white/5">
                                                    {(["Sì", "No"] as const).map(v => (
                                                        <button key={v} onClick={() => updateField("whatsappNew", v)} className={`px-3 py-1 rounded-md text-xs font-bold ${editCall.whatsappNew === v ? "bg-violet-500/20 text-violet-300" : "text-slate-400"}`}>{v}</button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {statoNewIsRichiamo && (
                                            <FormGroup label="Data e Ora Richiamo">
                                                <input type="datetime-local" className="glass-input rounded-lg py-2 w-full" value={editCall.dataRichiamoNew || ""} onChange={(e) => updateField("dataRichiamoNew", e.target.value)} />
                                            </FormGroup>
                                        )}
                                        {statoNewIsAppuntamento && (
                                            <FormGroup label="Data e Ora Appuntamento">
                                                <input type="datetime-local" className="glass-input rounded-lg py-2 w-full" value={editCall.dataAppuntamentoNew || ""} onChange={(e) => updateField("dataAppuntamentoNew", e.target.value)} />
                                            </FormGroup>
                                        )}
                                        <FormGroup label="Nota di aggiornamento (opzionale)">
                                            <textarea className="glass-input rounded-lg py-2 w-full min-h-[60px]" value={editCall.noteUpdate || ""} onChange={(e) => updateField("noteUpdate", e.target.value)} placeholder="Es. Cliente ha chiesto di essere richiamato dopo le 18..." />
                                        </FormGroup>
                                    </div>

                                    {editCall.storico && editCall.storico.length > 0 && (
                                        <>
                                            <SectionTitle>Storico Lavorazioni</SectionTitle>
                                            <div className="space-y-1">
                                                {editCall.storico.map((s, i) => (
                                                    <div key={i} className="flex gap-3 py-2 border-b border-white/5 text-xs">
                                                        <span className="font-mono text-[11px] font-bold text-slate-300 min-w-[120px]">{formatDate(s.data)}</span>
                                                        <span className="text-violet-300 font-semibold min-w-[110px]">{s.caller}</span>
                                                        <span className="flex-1 text-slate-400">
                                                            <strong className="text-white">{s.campo}</strong>
                                                            {s.da ? ` : ${s.da} → ${s.a}` : ` : ${s.a}`}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </>
                            )}
                        </div>

                        <div className="flex-none px-6 py-4 border-t border-white/10 flex justify-end gap-3 bg-white/[0.02]">
                            <button onClick={closeModal} className="px-6 py-2.5 rounded-xl border border-white/10 text-slate-300 text-xs font-bold uppercase tracking-widest hover:bg-white/5">Annulla</button>
                            <button
                                onClick={saveCall}
                                disabled={modalMode === "detail" && !editCall.statoNew}
                                className="px-8 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs uppercase tracking-widest shadow-lg shadow-violet-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {modalMode === "new" ? "Registra Call" : "Aggiorna Stato"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════════
                LISTA WIZARD
                ════════════════════════════════════════════════════════════════ */}
            {listaOpen && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={closeLista}>
                    <div className="glass-panel w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border-white/10" onClick={(e) => e.stopPropagation()}>
                        <div className="flex-none px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
                            <h2 className="text-lg font-bold text-white uppercase tracking-tight">Assegna Liste</h2>
                            <button onClick={closeLista} className="p-2 rounded-xl hover:bg-white/5 text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-5 scrollbar-hide">
                            {/* Steps bar */}
                            <div className="flex gap-2">
                                {[1, 2, 3, 4, 5].map(n => (
                                    <div key={n} className={`flex-1 h-1 rounded ${listaStep > n ? "bg-violet-500" : listaStep === n ? "bg-violet-400" : "bg-white/10"}`} />
                                ))}
                            </div>

                            {/* Step 1 */}
                            {listaStep === 1 && (
                                <div>
                                    <h3 className="text-xs font-bold text-violet-300 uppercase tracking-widest mb-3">Step 1 di 5 — Tipo Cliente</h3>
                                    <p className="text-xs text-slate-500 mb-4">Tutti i lead nella lista saranno dello stesso tipo.</p>
                                    <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
                                        {(["consumer", "business"] as const).map(t => (
                                            <button key={t} onClick={() => setListaTipo(t)} className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium capitalize ${listaTipo === t ? "bg-violet-500/20 text-violet-300 border border-violet-500/20" : "text-slate-400"}`}>{t}</button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Step 2 */}
                            {listaStep === 2 && (
                                <div className="space-y-4">
                                    <h3 className="text-xs font-bold text-violet-300 uppercase tracking-widest mb-3">Step 2 di 5 — Upload File</h3>
                                    <FormGroup label="Nome Lista">
                                        <input className="glass-input rounded-lg py-2 w-full" value={listaNome} onChange={(e) => setListaNome(e.target.value)} placeholder="Es. Lista Marketing WindTre Aprile" />
                                    </FormGroup>
                                    <FormGroup label="File Excel">
                                        <label className={`block border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${listaFile ? "border-violet-500 bg-violet-500/[0.06]" : "border-white/10 bg-black/20 hover:bg-black/30"}`}>
                                            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
                                            <FileSpreadsheet className="w-8 h-8 mx-auto mb-2 text-violet-300" />
                                            <div className="text-sm text-white font-semibold">{listaFile || "Clicca per caricare un file Excel"}</div>
                                            <div className="text-[11px] text-slate-500 mt-1">{listaFile ? "File caricato — clicca per cambiare" : ".xlsx, .xls, .csv"}</div>
                                        </label>
                                    </FormGroup>
                                    {listaFile && listaRows > 0 && (
                                        <div className="flex justify-between items-center p-3 bg-violet-500/10 border border-violet-500/30 rounded-xl">
                                            <span className="text-sm text-white font-semibold">{listaFile}</span>
                                            <span className="text-xs text-violet-300 font-bold">{listaRows} righe rilevate</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Step 3 */}
                            {listaStep === 3 && (
                                <div className="space-y-4">
                                    <h3 className="text-xs font-bold text-violet-300 uppercase tracking-widest mb-3">Step 3 di 5 — Provenienza</h3>
                                    <p className="text-xs text-slate-500 mb-4">Da dove arrivano i contatti di questa lista?</p>
                                    <FormGroup label="Provenienza">
                                        <select className="glass-input rounded-lg py-2 w-full" value={listaProvenienza} onChange={(e) => setListaProvenienza(e.target.value)}>
                                            <option value="">Seleziona...</option>
                                            {PROVENIENZE_LISTA.map(p => <option key={p} value={p}>{p}</option>)}
                                        </select>
                                    </FormGroup>

                                    {listaProvenienza === "Acquistato" && (
                                        <FormGroup label="Brand">
                                            <select className="glass-input rounded-lg py-2 w-full" value={listaBrandAcq} onChange={(e) => setListaBrandAcq(e.target.value)}>
                                                <option value="">Seleziona brand...</option>
                                                {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                                            </select>
                                        </FormGroup>
                                    )}

                                    {listaProvenienza === "Marketing" && (
                                        <>
                                            <FormGroup label="Campagna">
                                                <input className="glass-input rounded-lg py-2 w-full" value={listaCampagna} onChange={(e) => setListaCampagna(e.target.value)} placeholder="Nome campagna..." />
                                            </FormGroup>
                                            <FormGroup label="Obiettivo">
                                                <select className="glass-input rounded-lg py-2 w-full" value={listaObiettivoMkt} onChange={(e) => setListaObiettivoMkt(e.target.value)}>
                                                    <option value="">Seleziona obiettivo...</option>
                                                    {OBIETTIVI.map(o => <option key={o} value={o}>{o}</option>)}
                                                </select>
                                            </FormGroup>
                                        </>
                                    )}

                                    {listaProvenienza === "Interno" && (
                                        <div>
                                            <p className="text-[11px] text-slate-500 italic mb-3">Aggiungi una riga per ogni combinazione negozio + mese + anno + brand da cui sono stati estratti i contatti.</p>
                                            {listaInternoRows.map((row, idx) => (
                                                <div key={idx} className="flex gap-2 mb-2">
                                                    <select className="glass-input rounded-lg py-2 flex-[2]" value={row.negozio} onChange={(e) => updateInternoRow(idx, "negozio", e.target.value)}>
                                                        <option value="">Negozio...</option>
                                                        {NEGOZI.map(n => <option key={n} value={n}>{n}</option>)}
                                                    </select>
                                                    <select className="glass-input rounded-lg py-2 flex-1" value={row.mese} onChange={(e) => updateInternoRow(idx, "mese", e.target.value)}>
                                                        <option value="">Mese...</option>
                                                        {MESI.map(m => <option key={m} value={m}>{m}</option>)}
                                                    </select>
                                                    <select className="glass-input rounded-lg py-2 flex-1" value={row.anno} onChange={(e) => updateInternoRow(idx, "anno", e.target.value)}>
                                                        <option value="">Anno...</option>
                                                        {ANNI.map(a => <option key={a} value={a}>{a}</option>)}
                                                    </select>
                                                    <select className="glass-input rounded-lg py-2 flex-1" value={row.brand} onChange={(e) => updateInternoRow(idx, "brand", e.target.value)}>
                                                        <option value="">Brand...</option>
                                                        {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                                                    </select>
                                                    {listaInternoRows.length > 1 && (
                                                        <button onClick={() => removeInternoRow(idx)} className="p-2 rounded-lg border border-white/10 text-slate-400 hover:text-white"><Trash2 className="w-4 h-4" /></button>
                                                    )}
                                                </div>
                                            ))}
                                            <button onClick={addInternoRow} className="text-violet-300 text-xs font-bold uppercase tracking-widest hover:text-violet-200">+ Aggiungi riga</button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Step 4 */}
                            {listaStep === 4 && (
                                <div className="space-y-4">
                                    <h3 className="text-xs font-bold text-violet-300 uppercase tracking-widest mb-3">Step 4 di 5 — Mappatura Colonne</h3>
                                    <p className="text-xs text-slate-500 mb-4">Indica cosa contiene ciascuna colonna del file Excel.</p>
                                    <FormGroup label="Numero colonne da mappare">
                                        <select className="glass-input rounded-lg py-2 w-full" value={listaNumCols} onChange={(e) => setListaNumCols(parseInt(e.target.value, 10))}>
                                            {[1, 2, 3, 4, 5, 6, 7].map(n => <option key={n} value={n}>{n} colonn{n === 1 ? "a" : "e"}</option>)}
                                        </select>
                                    </FormGroup>
                                    <div className="space-y-2">
                                        {colsAttive.map(col => (
                                            <div key={col} className="flex items-center gap-3 py-2 border-b border-white/5">
                                                <div className="w-8 h-8 rounded-lg bg-violet-500 text-white font-bold flex items-center justify-center text-sm">{col}</div>
                                                <span className="text-xs text-slate-500 min-w-[60px]">Colonna {col}</span>
                                                <ArrowRight className="w-4 h-4 text-slate-600" />
                                                <select className="glass-input rounded-lg py-2 flex-1" value={listaMappa[col]} onChange={(e) => updateMappa(col, e.target.value)}>
                                                    {campiDisponibili.map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Step 5 */}
                            {listaStep === 5 && (
                                <div className="space-y-4">
                                    <h3 className="text-xs font-bold text-violet-300 uppercase tracking-widest mb-3">Step 5 di 5 — Assegna ai Caller</h3>
                                    <p className="text-xs text-slate-500 mb-4">Suddividi le {listaRows} righe tra i caller. Stato iniziale: <strong className="text-blue-300">Nuovo</strong>.</p>
                                    {listaSplits.map((split, idx) => (
                                        <div key={idx} className="flex gap-2 items-center">
                                            <select className="glass-input rounded-lg py-2 flex-[2]" value={split.caller} onChange={(e) => updateSplit(idx, "caller", e.target.value)}>
                                                <option value="">Seleziona caller...</option>
                                                {CALLERS.map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                            <input type="number" min={0} className="glass-input rounded-lg py-2 max-w-[100px]" value={split.quantita} onChange={(e) => updateSplit(idx, "quantita", e.target.value)} placeholder="Qta" />
                                            {listaSplits.length > 1 && (
                                                <button onClick={() => removeSplit(idx)} className="p-2 rounded-lg border border-white/10 text-slate-400 hover:text-white"><Trash2 className="w-4 h-4" /></button>
                                            )}
                                        </div>
                                    ))}
                                    <div className="flex gap-3">
                                        <button onClick={addSplit} className="text-violet-300 text-xs font-bold uppercase tracking-widest">+ Aggiungi caller</button>
                                        <button onClick={dividiEqualmente} className="text-violet-300 text-xs font-bold uppercase tracking-widest flex items-center gap-1"><Scale className="w-3 h-3" /> Dividi equamente</button>
                                    </div>
                                    <div className={`flex justify-between items-center p-3 rounded-xl border ${totaleAssegnato === listaRows ? "bg-emerald-500/10 border-emerald-500/30" : "bg-orange-500/10 border-orange-500/30"}`}>
                                        <span className="text-xs text-slate-400">Totale assegnato: <strong className="text-white">{totaleAssegnato}</strong> / {listaRows}</span>
                                        <span className={`text-xs font-bold ${totaleAssegnato === listaRows ? "text-emerald-300" : "text-orange-300"}`}>
                                            {totaleAssegnato === listaRows ? "✓ Completo" : (listaRows - totaleAssegnato > 0 ? `${listaRows - totaleAssegnato} da assegnare` : `${totaleAssegnato - listaRows} in eccesso`)}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {listaStep === 4 && !canNext4 && (
                                <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-xl text-xs text-orange-300 flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4" /> Almeno una colonna deve essere mappata su &quot;Numero&quot; per poter procedere.
                                </div>
                            )}
                        </div>

                        <div className="flex-none px-6 py-4 border-t border-white/10 flex justify-between gap-3 bg-white/[0.02]">
                            {listaStep > 1 ? (
                                <button onClick={() => setListaStep(listaStep - 1)} className="flex items-center gap-2 px-6 py-2.5 rounded-xl border border-white/10 text-slate-300 text-xs font-bold uppercase tracking-widest hover:bg-white/5">
                                    <ArrowLeft className="w-4 h-4" /> Indietro
                                </button>
                            ) : (
                                <button onClick={closeLista} className="px-6 py-2.5 rounded-xl border border-white/10 text-slate-300 text-xs font-bold uppercase tracking-widest hover:bg-white/5">Annulla</button>
                            )}
                            {listaStep < 5 ? (
                                <button
                                    onClick={() => {
                                        if (listaStep === 1 && !canNext1) return;
                                        if (listaStep === 2 && !canNext2) return;
                                        if (listaStep === 3 && !canNext3) return;
                                        if (listaStep === 4 && !canNext4) return;
                                        setListaStep(listaStep + 1);
                                    }}
                                    disabled={(listaStep === 1 && !canNext1) || (listaStep === 2 && !canNext2) || (listaStep === 3 && !canNext3) || (listaStep === 4 && !canNext4)}
                                    className="flex items-center gap-2 px-8 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs uppercase tracking-widest shadow-lg shadow-violet-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    Avanti <ArrowRight className="w-4 h-4" />
                                </button>
                            ) : (
                                <button
                                    onClick={confermaLista}
                                    disabled={!canConfirm}
                                    className="px-8 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs uppercase tracking-widest shadow-lg shadow-violet-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    Conferma e Assegna
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════════
                LISTA DETAIL MODAL
                ════════════════════════════════════════════════════════════════ */}
            {listaDetail && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setListaDetail(null)}>
                    <div className="glass-panel w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border-white/10" onClick={(e) => e.stopPropagation()}>
                        <div className="flex-none px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
                            <h2 className="text-lg font-bold text-white uppercase tracking-tight">Dettaglio Lista</h2>
                            <button onClick={() => setListaDetail(null)} className="p-2 rounded-xl hover:bg-white/5 text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-5 scrollbar-hide">
                            <SectionTitle>Informazioni Generali</SectionTitle>
                            <div className="grid grid-cols-2 gap-3 p-4 bg-violet-500/[0.04] border border-white/5 rounded-xl">
                                <SummaryItem label="Nome Lista" value={listaDetail.nome} />
                                <SummaryItem label="Tipo Cliente" value={listaDetail.tipo === "business" ? "Business" : "Consumer"} />
                                <SummaryItem label="Data Assegnazione" value={formatDate(listaDetail.data)} />
                                <SummaryItem label="Totale Contatti" value={String(listaDetail.totale)} />
                            </div>

                            <SectionTitle>Provenienza</SectionTitle>
                            <div className="grid grid-cols-2 gap-3 p-4 bg-violet-500/[0.04] border border-white/5 rounded-xl">
                                <SummaryItem label="Tipo Provenienza" value={listaDetail.provenienza} />
                                {listaDetail.provenienza === "Acquistato" && <SummaryItem label="Brand" value={listaDetail.brandAcq || "—"} />}
                                {listaDetail.provenienza === "Marketing" && (
                                    <>
                                        <SummaryItem label="Campagna" value={listaDetail.campagna || "—"} />
                                        <SummaryItem label="Obiettivo" value={listaDetail.obiettivoMkt || "—"} />
                                    </>
                                )}
                            </div>

                            {listaDetail.provenienza === "Interno" && listaDetail.internoRows && listaDetail.internoRows.length > 0 && (
                                <>
                                    <SectionTitle>Righe di Estrazione</SectionTitle>
                                    <div className="space-y-2">
                                        {listaDetail.internoRows.map((r, i) => (
                                            <div key={i} className="flex gap-3 p-3 bg-black/20 border border-white/5 rounded-xl text-sm">
                                                <span className="flex-[2] text-white font-semibold">{r.negozio}</span>
                                                <span className="flex-1 text-slate-400">{r.mese} {r.anno}</span>
                                                <span className="flex-1"><span className="px-2 py-0.5 rounded-full text-[11px] font-bold border bg-violet-500/15 border-violet-500/30 text-violet-300">{r.brand || "—"}</span></span>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}

                            <SectionTitle>File Sorgente</SectionTitle>
                            <div className="flex items-center gap-3 p-4 bg-black/20 border border-white/5 rounded-xl">
                                <FileSpreadsheet className="w-6 h-6 text-violet-300" />
                                <div className="flex-1">
                                    <div className="text-sm text-white font-semibold">{listaDetail.fileName || "file_lista.xlsx"}</div>
                                    <div className="text-[11px] text-slate-500 mt-0.5">{listaDetail.totale} righe · {listaDetail.numCols || "?"} colonne mappate</div>
                                </div>
                                <button
                                    onClick={async () => {
                                        if (!listaDetail.filePath) { alert("Percorso file non disponibile"); return; }
                                        const { data, error } = await supabase.storage.from("liste-files").createSignedUrl(listaDetail.filePath, 60);
                                        if (error || !data) { alert("Errore download: " + (error?.message || "URL non disponibile")); return; }
                                        window.open(data.signedUrl, "_blank");
                                    }}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-violet-500/30 text-violet-300 text-xs font-bold uppercase tracking-widest hover:bg-violet-500/10"
                                >
                                    <Download className="w-4 h-4" /> Scarica
                                </button>
                            </div>

                            {listaDetail.mappa && (
                                <>
                                    <SectionTitle>Mappatura Colonne</SectionTitle>
                                    <div className="space-y-1">
                                        {COL_LETTERS.slice(0, listaDetail.numCols || 7).map(col => {
                                            const mapped = listaDetail.mappa?.[col];
                                            if (!mapped || mapped === "Ignora") return null;
                                            return (
                                                <div key={col} className="flex items-center gap-3 py-2 border-b border-white/5">
                                                    <div className="w-8 h-8 rounded-lg bg-violet-500 text-white font-bold flex items-center justify-center text-sm">{col}</div>
                                                    <ArrowRight className="w-4 h-4 text-slate-600" />
                                                    <span className="text-sm text-white font-semibold">{mapped}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}

                            <SectionTitle>Distribuzione ai Caller</SectionTitle>
                            <div className="space-y-2">
                                {(listaDetail.splits || []).map((s, i) => (
                                    <div key={i} className="flex justify-between items-center p-3 bg-black/20 border border-white/5 rounded-xl">
                                        <span className="text-sm text-white font-semibold">{s.caller}</span>
                                        <span className="text-sm text-violet-300 font-bold font-mono">{s.quantita} contatti</span>
                                    </div>
                                ))}
                            </div>

                            <SectionTitle>Stato Lavorazione</SectionTitle>
                            <div className="p-4 bg-black/20 border border-white/5 rounded-xl">
                                <div className="flex justify-between mb-2">
                                    <span className="text-xs text-slate-400">Lavorate: <strong className="text-white">{listaDetail.lavorate}</strong> / {listaDetail.totale}</span>
                                    <span className={`text-xs font-bold ${listaDetail.lavorate === listaDetail.totale ? "text-emerald-300" : "text-violet-300"}`}>
                                        {listaDetail.totale > 0 ? Math.round((listaDetail.lavorate / listaDetail.totale) * 100) : 0}%
                                    </span>
                                </div>
                                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
                                    <div className={`h-full transition-all ${listaDetail.lavorate === listaDetail.totale ? "bg-emerald-500" : "bg-violet-500"}`} style={{ width: `${listaDetail.totale > 0 ? Math.round((listaDetail.lavorate / listaDetail.totale) * 100) : 0}%` }} />
                                </div>
                            </div>
                        </div>

                        <div className="flex-none px-6 py-4 border-t border-white/10 flex justify-end gap-3 bg-white/[0.02]">
                            <button onClick={() => setListaDetail(null)} className="px-6 py-2.5 rounded-xl border border-white/10 text-slate-300 text-xs font-bold uppercase tracking-widest hover:bg-white/5">Chiudi</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────────
   SHARED SUBCOMPONENTS
   ───────────────────────────────────────────────────────────────────── */

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</label>
            {children}
        </div>
    );
}

function FormGroup({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1.5 mb-3">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{label}</label>
            {children}
        </div>
    );
}

function Th({ children }: { children: React.ReactNode }) {
    return <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-widest">{children}</th>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
    return <h3 className="text-xs font-bold text-violet-300 uppercase tracking-widest">{children}</h3>;
}

function SummaryItem({ label, value }: { label: string; value: string }) {
    const isEmpty = !value || value === "" || value === "  ";
    return (
        <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</span>
            <span className={`text-sm font-semibold ${isEmpty ? "text-slate-600 italic" : "text-white"}`}>{isEmpty ? "—" : value}</span>
        </div>
    );
}
