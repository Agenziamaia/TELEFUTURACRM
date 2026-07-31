"use client";

import { useState, useMemo, useEffect, useCallback, useRef, Suspense } from "react";
import { SelectPersona, SelectOpzioni } from "@/components/SelectPersona";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
    Phone, Plus, X, Search, RefreshCw, Filter, FileSpreadsheet,
    ClipboardList, ArrowLeft, ArrowRight, Check, Download, Upload,
    Trash2, Scale, AlertTriangle, MessageSquare, Calendar, User,
    Building, ChevronRight
} from "lucide-react";
import { usePageView } from "@/lib/pageView";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import { chiamaAircall } from "@/lib/dialer";
import { numeroNazionale } from "@/lib/telefono";
import { dataNascitaDaCF } from "@/lib/dataNascita";
import { AircallPhoneDock } from "@/components/AircallPhoneDock";
import { useStores, useSellers, useCallers } from "@/lib/org";
import { seesAllStores, seesWholeStore } from "@/lib/roles";
import { useRolePermissions } from "@/lib/usePermissions";
import { effectiveAllowed, EVERYONE } from "@/lib/nav";
import { BadgeAndDashboard, BadgeWidget } from "../collaboratori/_badge";
import { IndirizzoAutocomplete } from "@/components/IndirizzoAutocomplete";
import { FASCE, eFascia, fasciaLabel, fasciaStart } from "@/lib/fasce";
import { caricaRegoleCaller, dataRiferimento, lavorativiDopo, aggiungiLavorativi, faseDi, sincronizzaMalusCaller, type RegolaCaller, type FaseCaller } from "@/lib/callerMalus";
import { CallerRegoleModal, ArchivioMalusCallerModal } from "@/components/CallerRegole";

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

// NEGOZI/AGENTI/VENDITORI ora dal DB: le liste erano nomi e citta di fantasia
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
    // ── ARCHIVIO per voce (Luca 31/07): ogni evento porta con se' la fotografia
    // dei Dettagli Chiamata al momento in cui e' successo, cosi' lo storico e'
    // interrogabile (anche dalle AI) senza dipendere dallo stato ATTUALE della
    // pratica. aircall_call_id aggancia il registro telefonico (registrazione).
    aircall_call_id?: number | null;
    dettagli?: {
        brand?: string; obiettivo?: string; provenienza?: string; tipologia?: string;
        esito?: string; direzione?: string; durata_sec?: number | null;
    } | null;
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
    // fasce orarie (mig. 118): in alternativa all'orario preciso
    fascia_appuntamento: string;
    fascia_richiamo: string;
    // punto vendita CONGRUO per il cliente (mig. 118): per i lead interni
    // coincide col negozio di provenienza, per gli altri va scelto sempre
    negozio_pertinenza: string;
    lista_origine?: string | null;
    da_esitare?: boolean;
    storico: StoricoEntry[];
    // Detail-mode only working fields
    statoNew?: string;
    dataRichiamoNew?: string;
    dataAppuntamentoNew?: string;
    negozioAppNew?: string;
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
        fascia_appuntamento: (row.fascia_appuntamento as string) || "",
        fascia_richiamo: (row.fascia_richiamo as string) || "",
        negozio_pertinenza: (row.negozio_pertinenza as string) || "",
        lista_origine: (row.lista_origine as string) || null,
        da_esitare: !!row.da_esitare,
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

function formatTimeShort(d: string): string {
    if (!d) return "—";
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return "—";
    return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
}

// Data con orario preciso OPPURE fascia (Luca 31/07): il flag Mattina/Pomeriggio
// sostituisce l'orario — l'input diventa solo-data e la fascia viaggia a parte.
function InputDataOra({ valore, fascia, onCambia }: { valore: string; fascia: string; onCambia: (valore: string, fascia: string) => void }) {
    const conFascia = eFascia(fascia);
    const scegli = (f: string) => {
        if (f) onCambia((valore || "").slice(0, 10), f);
        else onCambia(valore && valore.length === 10 ? `${valore}T10:00` : (valore || ""), "");
    };
    return (
        <div className="space-y-1.5">
            <div className="flex gap-1.5 flex-wrap">
                {[["", "🕐 Orario preciso"], ["mattina", `${FASCE.mattina.emoji} Mattina`], ["pomeriggio", `${FASCE.pomeriggio.emoji} Pomeriggio`]].map(([k, l]) => (
                    <button key={k} type="button" onClick={() => scegli(k)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${(conFascia ? fascia : "") === k ? "bg-violet-500/20 border-violet-500/50 text-violet-300" : "bg-black/30 border-white/10 text-slate-400 hover:text-slate-200"}`}>{l}</button>
                ))}
            </div>
            <input type={conFascia ? "date" : "datetime-local"} className="glass-input rounded-lg py-2 w-full"
                value={conFascia ? (valore || "").slice(0, 10) : (valore || "")}
                onChange={(e) => onCambia(e.target.value, conFascia ? fascia : "")} />
            {conFascia && <p className="text-[10px] text-amber-400/90">{fasciaLabel(fascia)} — senza orario preciso</p>}
        </div>
    );
}

// datetime-local vuole l'ora LOCALE "YYYY-MM-DDTHH:mm"; toISOString() e' UTC e
// mostrava/salvava tutto con 2 ore di scarto (filo aperto 30/07, chiuso 31/07).
function toLocalInput(d: Date | string): string {
    const dt = typeof d === "string" ? new Date(d) : d;
    if (isNaN(dt.getTime())) return "";
    const p = (n: number) => String(n).padStart(2, "0");
    return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}T${p(dt.getHours())}:${p(dt.getMinutes())}`;
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
        data_chiamata: toLocalInput(new Date()),
        caller: callerName,
        negozio_appuntamento: "", data_appuntamento: "",
        indirizzo: "", agente: "", segnalatore: "", campagna: "",
        negozio_provenienza: "", mese_provenienza: "", anno_provenienza: "",
        whatsapp: "", note: "", data_richiamo: "",
        fascia_appuntamento: "", fascia_richiamo: "", negozio_pertinenza: "",
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
    fCellulare: "",
    fNegozio: "",
    // Date a RANGE (Luca 30/07): da-a, non piu' giorno singolo.
    fDataAppDa: "",
    fDataAppA: "",
    fDataChiamataDa: "",
    fDataChiamataA: "",
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

function CallerPageInner() {
    const NEGOZI = useStores();
    const VENDITORI = useSellers();
    const AGENTI = VENDITORI;
    // SOLO il personale del call center (ruoli area cc), non tutti gli utenti:
    // il filtro Caller elencava l'intera azienda (segnalazione Luca 30/07).
    const CALLERS = useCallers();
    // OPZIONI AMMINISTRABILI (mig. 105): stati/esiti, provenienze, tipologie e
    // obiettivi arrivano da caller_opzioni (Amministrazione → Call Center);
    // tabella vuota o non raggiungibile = liste storiche in codice. Gli stati
    // con automatismi (NR → WhatsApp, richiami, appuntamenti → calendario)
    // sono riconosciuti PER NOME: valgono finche' il nome resta quello.
    const [opzioniDb, setOpzioniDb] = useState<Record<string, string[]>>({});
    // COMPORTAMENTI degli stati (mig. 119): appuntamento/richiamo/non_risposto,
    // configurabili dal pannello — prima erano riconosciuti PER NOME nel codice
    const [comportamenti, setComportamenti] = useState<Record<string, string>>({});
    useEffect(() => {
        (async () => {
            const tent = await supabase.from("caller_opzioni").select("categoria, voce, attiva, ordine, comportamento").order("ordine");
            const legacy = tent.error ? await supabase.from("caller_opzioni").select("categoria, voce, attiva, ordine").order("ordine") : null;
            const data = ((legacy ? legacy.data : tent.data) ?? null) as unknown as { categoria: string; voce: string; attiva: boolean; comportamento?: string | null }[] | null;
            if (!data?.length) return;
            const m: Record<string, string[]> = {};
            const comp: Record<string, string> = {};
            (data as { categoria: string; voce: string; attiva: boolean; comportamento?: string | null }[]).forEach((r) => {
                if (r.attiva) (m[r.categoria] ||= []).push(r.voce);
                if (r.categoria === "stato" && r.comportamento) comp[r.voce] = r.comportamento;
            });
            setOpzioniDb(m);
            setComportamenti(comp);
        })();
    }, []);
    const STATI_OPT = opzioniDb.stato?.length ? opzioniDb.stato : [...STATI];
    // gruppi DINAMICI dal pannello; finche' la mig. 119 non c'e', valgono le
    // liste storiche in codice
    const APP_STATI = useMemo(() => { const v = Object.entries(comportamenti).filter(([, c]) => c === "appuntamento").map(([s]) => s); return v.length ? v : APPUNTAMENTO_STATI; }, [comportamenti]);
    const RIC_STATI = useMemo(() => { const v = Object.entries(comportamenti).filter(([, c]) => c === "richiamo").map(([s]) => s); return v.length ? v : RICHIAMO_STATI; }, [comportamenti]);
    const NRD_STATI = useMemo(() => { const v = Object.entries(comportamenti).filter(([, c]) => c === "non_risposto").map(([s]) => s); return v.length ? v : NR_STATI; }, [comportamenti]);
    const PROVENIENZE_OPT = opzioniDb.provenienza?.length ? opzioniDb.provenienza : [...PROVENIENZE];
    const TIPOLOGIE_OPT = opzioniDb.tipologia?.length ? opzioniDb.tipologia : [...TIPOLOGIE];
    const OBIETTIVI_OPT = opzioniDb.obiettivo?.length ? opzioniDb.obiettivo : [...OBIETTIVI];
    const [view, setView] = usePageView<typeof defaultCallerView>("caller", defaultCallerView);

    // Utente e ruolo REALI dalla sessione. Prima erano fissi ("Mario Rossi" +
    // ruolo "caller"): le chiamate venivano filtrate e soprattutto ATTRIBUITE
    // nello storico a una persona inesistente.
    const { user } = useAuth();
    // ── hub Call Center: sezione corrente + pillole + visibilita' Badge ──
    const searchParams = useSearchParams();
    const hubTab = searchParams.get("tab") === "badge" ? "badge" : "caller";
    const { perms: hubPerms } = useRolePermissions(user?.role);
    const badgeVisibile = effectiveAllowed(user?.role, "/caller?tab=badge", EVERYONE, hubPerms, "Call Center");
    const hubPills = (
        <div className="flex items-center gap-2">
            {[{ id: "caller", l: "📞 Caller", href: "/caller" }, ...(badgeVisibile ? [{ id: "badge", l: "🕒 Badge", href: "/caller?tab=badge" }] : [])].map(t => (
                <Link key={t.id} href={t.href}
                    className={`px-4 py-1.5 rounded-lg border text-xs font-bold uppercase tracking-widest transition-all ${hubTab === t.id ? "border-violet-400/70 bg-violet-500/15 text-violet-100" : "border-white/10 bg-white/[0.04] text-slate-400 hover:border-white/25"}`}>
                    {t.l}
                </Link>
            ))}
        </div>
    );
    const currentCaller = user?.name || "";
    // Vista SOLO dal ruolo di sessione (Luca 31/07): lo switch caller/direttore/
    // admin che stava nell'header e' stato tolto — per cambiare prospettiva si
    // rientra con l'utente giusto dal menu in alto.
    const currentRole: Role =
        ["admin", "dev", "direttore_generale"].includes(user?.role || "") ? "admin"
      : ["direttore_cc", "direttore_ob", "direttore_commerciale", "store_manager", "amministrativo"].includes(user?.role || "") ? "direttore"
      : "caller";
    const isDirector = currentRole === "direttore" || currentRole === "admin";

    /* ── Data state ── */
    const [calls, setCalls] = useState<Call[]>([]);
    // ── ELIMINAZIONE riga (solo admin, Luca 30/07) — A CASCATA: con la
    // pratica muore l'appuntamento in calendario collegato (mig. 088). NON si
    // toccano l'anagrafica cliente e il registro telefonico Aircall
    // (call_events): sono entita' condivise, non appendici della pratica.
    const canDeleteRows = ["admin", "dev"].includes(user?.role || "");
    const [delConfirmId, setDelConfirmId] = useState<string | null>(null);
    async function eliminaCallCascata(c: Call) {
        // richiamo_event_id esiste dalla mig. 107: se manca ancora, si ripiega
        // sulla sola appointment_id invece di bloccare l'eliminazione.
        type LinkRow = { appointment_id?: number | null; richiamo_event_id?: number | null };
        let row: LinkRow | null = null;
        const tent = await supabase.from("calls").select("appointment_id, richiamo_event_id").eq("id", c.id).maybeSingle();
        if (tent.error) {
            const fb = await supabase.from("calls").select("appointment_id").eq("id", c.id).maybeSingle();
            row = (fb.data ?? null) as unknown as LinkRow | null;
        } else row = (tent.data ?? null) as unknown as LinkRow | null;
        for (const apptId of [row?.appointment_id, row?.richiamo_event_id]) {
            if (!apptId) continue;
            const { error: e1 } = await supabase.from("appointments").delete().eq("id", apptId);
            if (e1) { alert("Evento in calendario collegato NON eliminato (riga lasciata intatta): " + e1.message); return; }
        }
        const { error } = await supabase.from("calls").delete().eq("id", c.id);
        if (error) { alert("Riga non eliminata: " + error.message); return; }
        setCalls(prev => prev.filter(x => x.id !== c.id));
        setDelConfirmId(null);
    }
    const [listeAssegnate, setListeAssegnate] = useState<ListaAssegnata[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    /* ── Modal state ── */
    const [modalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<"new" | "detail">("new");
    const [editCall, setEditCall] = useState<Call | null>(null);
    const [hoverRow, setHoverRow] = useState<string | null>(null);

    /* ── Storico CLICCABILE (Luca 31/07): la voce si espande coi dettagli
       archiviati (brand/obiettivo/provenienza/tipologia/esito) e, se la voce
       nasce da una chiamata Aircall, col registro telefonico: operatore,
       direzione, durata e registrazione (recupero pigro per aircall_call_id). ── */
    interface EventoAircall { direction?: string | null; agente_nome?: string | null; duration_sec?: number | null; recording_url?: string | null; answered?: boolean | null; negozio?: string | null }
    const [storicoOpen, setStoricoOpen] = useState<number | null>(null);
    const [eventoAircall, setEventoAircall] = useState<Record<number, EventoAircall | "carico" | "assente">>({});
    async function apriVoceStorico(i: number, s: StoricoEntry) {
        setStoricoOpen((prev) => (prev === i ? null : i));
        const acId = s.aircall_call_id;
        if (!acId || eventoAircall[acId]) return;
        setEventoAircall((p) => ({ ...p, [acId]: "carico" }));
        const { data } = await supabase.from("call_events")
            .select("direction, agente_nome, duration_sec, recording_url, answered, negozio")
            .eq("aircall_call_id", acId).maybeSingle();
        setEventoAircall((p) => ({ ...p, [acId]: (data as EventoAircall) || "assente" }));
    }

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
    const fCellulare = view.fCellulare || "", setFCellulare = (v: string) => setView((p) => ({ ...p, fCellulare: v }));
    const fDataAppDa = view.fDataAppDa || "", setFDataAppDa = (v: string) => setView((p) => ({ ...p, fDataAppDa: v }));
    const fDataAppA = view.fDataAppA || "", setFDataAppA = (v: string) => setView((p) => ({ ...p, fDataAppA: v }));
    const fDataChiamataDa = view.fDataChiamataDa || "", setFDataChiamataDa = (v: string) => setView((p) => ({ ...p, fDataChiamataDa: v }));
    const fDataChiamataA = view.fDataChiamataA || "", setFDataChiamataA = (v: string) => setView((p) => ({ ...p, fDataChiamataA: v }));
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

    // BOZZA della pratica aperta (Luca 31/07): cliccando WhatsApp dal modale
    // si esce dalla pagina e prima si perdeva TUTTO il compilato. Ora la bozza
    // si salva in sessione e al rientro su /caller (pulsante indietro in alto
    // a sinistra o navigazione) il modale si riapre da solo con i dati scritti.
    // Vale SOLO per questo flusso: senza bozza salvata non cambia nulla.
    const salvaBozza = () => {
        if (!editCall) return;
        try { sessionStorage.setItem("caller_bozza", JSON.stringify({ editCall, modalMode, t: Date.now() })); } catch { /* no-op */ }
    };
    const [bozzaFatta, setBozzaFatta] = useState(false);
    useEffect(() => {
        if (bozzaFatta || loading) return;
        setBozzaFatta(true);
        try {
            const raw = sessionStorage.getItem("caller_bozza");
            if (!raw) return;
            sessionStorage.removeItem("caller_bozza");
            const b = JSON.parse(raw) as { editCall: Call; modalMode: "new" | "detail"; t: number };
            if (!b?.editCall || Date.now() - (b.t || 0) > 60 * 60 * 1000) return;
            setModalMode(b.modalMode || "detail");
            setEditCall(b.editCall);
        } catch { /* bozza corrotta: si ignora */ }
    }, [bozzaFatta, loading]);

    // Arrivo dallo storico chiamate del cliente (Luca 31/07): /caller?apri=<id>
    // apre la pratica in dettaglio appena i dati sono carichi.
    const apriId = searchParams.get("apri");
    const [apriFatto, setApriFatto] = useState(false);
    useEffect(() => {
        if (!apriId || apriFatto || loading) return;
        const daAprire = calls.find((x) => x.id === apriId);
        if (daAprire) { openDetail(daAprire); setApriFatto(true); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apriId, apriFatto, loading, calls]);

    /* ── Filtering ── */
    /* ── TESSERE BRAND in testa (richiesta Luca 27/07): SOLO i brand, stile
       Ricerca Vendite ma a SELEZIONE POSITIVA — tutte attive per definizione;
       il click su una applica il filtro "solo quella", i successivi aggiungono
       o tolgono; tutte selezionate (o nessuna) = nessun filtro. ── */
    const BRAND_LOGO: Record<string, string> = {
        "WindTre": "/windtre.png", "Vodafone": "/vodaphone - Copy.png", "Fastweb": "/fastweb.png",
        "Sky": "/sky.png", "Energia": "/energy - Copy.png", "Tim": "/tim-logo-v2.png",
    };
    const [selBrands, setSelBrands] = useState<Set<string>>(new Set());  // vuoto = tutte
    // Filtro rapido dal pulsante "Da esitare" in alto (Luca 30/07).
    const [soloDaEsitare, setSoloDaEsitare] = useState(false);
    // FACCETTE COERENTI (Luca 30/07): i contatori dei brand rispettano TUTTI
    // gli altri filtri attivi (caller, date, stato...) ignorando solo la
    // selezione brand stessa — prima erano fissi e non seguivano i filtri.
    // ── DA LAVORARE / WARNING / MALUS (Luca 31/07, stile Dragon PDA) ──
    // regole per stato (giorni lavorativi + €/gg) in caller_regole, modificabili
    // dall'admin col bottone ⚙️; le pratiche in malus maturano un importo che
    // si archivia in caller_malus (in_corso → attivo → compensato in gara)
    const [regoleCaller, setRegoleCaller] = useState<Map<string, RegolaCaller>>(new Map());
    useEffect(() => { caricaRegoleCaller().then(setRegoleCaller); }, []);
    const [faseFilter, setFaseFilter] = useState<"" | FaseCaller>("");
    const faseInfo = useCallback((c: Call): { fase: FaseCaller; giorniMalus: number; importo: number; dalMalus: Date | null } => {
        const r = regoleCaller.get(c.stato);
        if (!r || r.esente) return { fase: "ok", giorniMalus: 0, importo: 0, dalMalus: null };
        const rif = dataRiferimento(c, c.stato, RIC_STATI, APP_STATI);
        if (!rif) return { fase: "ok", giorniMalus: 0, importo: 0, dalMalus: null };
        const oggi = new Date();
        const fase = faseDi(lavorativiDopo(rif, oggi), r);
        const dalMalus = fase === "malus" && r.giorni_malus != null ? aggiungiLavorativi(rif, r.giorni_malus) : null;
        const giorniMalus = dalMalus ? lavorativiDopo(dalMalus, oggi) + 1 : 0;
        return { fase, giorniMalus, importo: Math.round(giorniMalus * r.malus_giorno * 100) / 100, dalMalus };
    }, [regoleCaller, RIC_STATI, APP_STATI]);

    const puoRegoleCaller = ["admin", "dev"].includes(user?.role || "");
    const [showRegoleCaller, setShowRegoleCaller] = useState(false);
    const [showArchivioMalus, setShowArchivioMalus] = useState(false);
    // sincronizzazione episodi (una volta per sessione, solo direzione/admin:
    // vede tutte le pratiche, quindi l'archivio resta completo)
    const malusSyncDone = useRef(false);
    useEffect(() => {
        if (malusSyncDone.current || !isDirector || !regoleCaller.size || !calls.length) return;
        malusSyncDone.current = true;
        const pratiche = calls.map((c) => {
            const fi = faseInfo(c);
            const r = regoleCaller.get(c.stato);
            return { id: c.id, stato: c.stato, caller: c.caller, fase: fi.fase, giorniMalus: fi.giorniMalus, malusGiorno: r?.malus_giorno || 0, dalMalus: fi.dalMalus };
        });
        sincronizzaMalusCaller(pratiche);
    }, [isDirector, regoleCaller, calls, faseInfo]);

    const matchFiltri = (c: Call, ignoraBrand = false, ignoraFase = false) => {
        if (!isDirector && c.caller !== currentCaller) return false;
        if (soloDaEsitare && !c.da_esitare) return false;
        if (!ignoraFase && faseFilter && faseInfo(c).fase !== faseFilter) return false;
        if (fCf && !(c.cf.toLowerCase().includes(fCf.toLowerCase()) || c.piva.toLowerCase().includes(fCf.toLowerCase()))) return false;
        if (fNome) {
            const search = fNome.toLowerCase();
            const match = `${c.nome} ${c.cognome}`.toLowerCase().includes(search) || c.ragione_sociale.toLowerCase().includes(search);
            if (!match) return false;
        }
        if (fNegozio && c.negozio_appuntamento !== fNegozio) return false;
        // Cellulare: confronto sulle sole cifre, su entrambi i campi numero.
        if (fCellulare) {
            const q = fCellulare.replace(/\D/g, "");
            if (q && ![c.cellulare, c.numero].some((n) => String(n || "").replace(/\D/g, "").includes(q))) return false;
        }
        // Date a RANGE (estremi inclusi). NB: col range attivo una pratica SENZA
        // data appuntamento resta fuori (il vecchio filtro la lasciava passare).
        const dataDi = (s: string | null | undefined) => String(s || "").slice(0, 10);
        // data_chiamata e' un ISTANTE (timestamptz): la data va letta in ora
        // LOCALE, non affettando la stringa UTC — le chiamate dopo mezzanotte
        // slittavano al giorno prima (filo aperto 30/07).
        const dataLocaleDi = (s: string | null | undefined) => {
            if (!s) return "";
            const dt = new Date(s);
            return isNaN(dt.getTime()) ? dataDi(s) : toLocalInput(dt).slice(0, 10);
        };
        if (fDataAppDa || fDataAppA) {
            const d = dataDi(c.data_appuntamento);
            if (!d) return false;
            if (fDataAppDa && d < fDataAppDa) return false;
            if (fDataAppA && d > fDataAppA) return false;
        }
        if (fDataChiamataDa || fDataChiamataA) {
            const d = dataLocaleDi(c.data_chiamata);
            if (fDataChiamataDa && d < fDataChiamataDa) return false;
            if (fDataChiamataA && d > fDataChiamataA) return false;
        }
        if (fStato && c.stato !== fStato) return false;
        if (fCaller && c.caller !== fCaller) return false;
        if (!ignoraBrand && selBrands.size > 0 && !selBrands.has(c.brand)) return false;
        if (fProvenienza && c.provenienza !== fProvenienza) return false;
        if (fTipologia && c.tipologia !== fTipologia) return false;
        if (fObiettivo && c.obiettivo !== fObiettivo) return false;
        if (fLista && (!c.lista_origine || !c.lista_origine.toLowerCase().includes(fLista.toLowerCase()))) return false;
        return true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const filtered = useMemo(() => calls.filter((c) => matchFiltri(c)), [calls, isDirector, currentCaller, soloDaEsitare, fCf, fNome, fCellulare, fNegozio, fDataAppDa, fDataAppA, fDataChiamataDa, fDataChiamataA, fStato, fCaller, selBrands, fProvenienza, fTipologia, fObiettivo, fLista, faseFilter, faseInfo]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const faseCounts = useMemo(() => {
        const cnt = { da_lavorare: 0, warning: 0, malus: 0, importo: 0 };
        calls.forEach((c) => {
            if (!matchFiltri(c, false, true)) return;
            const fi = faseInfo(c);
            if (fi.fase === "da_lavorare") cnt.da_lavorare++;
            else if (fi.fase === "warning") cnt.warning++;
            else if (fi.fase === "malus") { cnt.malus++; cnt.importo += fi.importo; }
        });
        return cnt;
    }, [calls, isDirector, currentCaller, soloDaEsitare, fCf, fNome, fCellulare, fNegozio, fDataAppDa, fDataAppA, fDataChiamataDa, fDataChiamataA, fStato, fCaller, selBrands, fProvenienza, fTipologia, fObiettivo, fLista, faseInfo]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const brandCounts = useMemo(() => {
        const scoped = calls.filter((c) => matchFiltri(c, true));
        return BRANDS.map((b) => ({ brand: b as string, n: scoped.filter((c) => c.brand === b).length }));
    }, [calls, isDirector, currentCaller, soloDaEsitare, fCf, fNome, fCellulare, fNegozio, fDataAppDa, fDataAppA, fDataChiamataDa, fDataChiamataA, fStato, fCaller, fProvenienza, fTipologia, fObiettivo, fLista]);

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
        setEditCall(applicaSerie(blankCall(currentCaller, isDirector)));
        setModalMode("new");
        setModalOpen(true);
    }

    function openDetail(call: Call) {
        const copy: Call = JSON.parse(JSON.stringify(call));
        // niente doppioni a video: se il recapito è lo stesso numero, il campo
        // resta vuoto (al salvataggio le cifre per l'aggancio Aircall si
        // ripristinano da sole dal numero)
        const _d = (x: unknown) => String(x || "").replace(/\D/g, "");
        if (_d(copy.cellulare) && _d(copy.cellulare) === _d(copy.numero)) copy.cellulare = "";
        if (!copy.numero && copy.cellulare) { copy.numero = copy.cellulare; copy.cellulare = ""; }
        copy.statoNew = "";
        copy.dataRichiamoNew = "";
        copy.dataAppuntamentoNew = "";
        copy.negozioAppNew = call.negozio_appuntamento || "";
        copy.whatsappNew = "";
        copy.noteUpdate = "";
        setEditCall(applicaSerie(copy));
        setModalMode("detail");
        setModalOpen(true);
    }

    function closeModal() {
        setModalOpen(false);
        setEditCall(null);
        setStoricoOpen(null);
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
            // solo il NUMERO: il recapito resta per un secondo numero DIVERSO
            numero: data.cellulare,
            cellulare: "",
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
    // ── PONTE Caller → Calendario (conferma Luca 26/07) ──────────────────────
    // Stati 1°/2°/3° Appuntamento e DTS: l'appuntamento va nel calendario che il
    // negozio guarda. ATTENZIONE ai tipi: negozio_appuntamento compilato →
    // "incoming" (cliente in negozio); altrimenti agente+indirizzo → "outgoing"
    // (agente a domicilio). "Appuntamento telefonico" NON va in calendario: è un
    // richiamo del caller. Al ri-fissaggio (2°/3°) si AGGIORNA lo stesso evento
    // (collegamento calls.appointment_id, mig. 088); created_by = il caller, che
    // alimenta anche la visibilità clienti "con appuntamento preso".
    async function sincronizzaAppuntamento(c: Call, callId: string) {
        if (!APP_STATI.includes(c.stato)) return;
        const dt = (c.data_appuntamento || "").trim();
        if (!dt) { alert("Appuntamento NON portato in calendario: manca la data e ora."); return; }
        const [dataApp, oraApp] = dt.includes("T") ? dt.split("T") : [dt, "10:00"];
        const inNegozio = !!c.negozio_appuntamento;
        if (!inNegozio && !c.agente) {
            alert("Appuntamento salvato sulla pratica ma NON portato in calendario: indica il negozio dell'appuntamento oppure l'agente.");
            return;
        }
        // FASCIA (mig. 118): senza orario preciso il time tecnico e' l'inizio
        // della fascia (ordina il calendario), la fascia viaggia sull'evento
        const fasciaApp = eFascia(c.fascia_appuntamento) ? c.fascia_appuntamento : null;
        const payload: Record<string, unknown> = {
            date: dataApp,
            time: fasciaApp ? fasciaStart(fasciaApp)! : (oraApp || "10:00"),
            fascia: fasciaApp,
            type: inNegozio ? "incoming" : "outgoing",
            store: inNegozio ? c.negozio_appuntamento : null,
            agente: inNegozio ? "" : c.agente,
            customer_address: inNegozio ? null : (c.indirizzo || null),
            customer_name: c.tipo_cliente === "business" ? (c.ragione_sociale || `${c.nome} ${c.cognome}`.trim()) : `${c.nome} ${c.cognome}`.trim(),
            customer_phone: numeroNazionale(c.cellulare || c.numero) || c.cellulare || c.numero || "",
            cf_piva: c.cf || c.piva || null,
            notes: ["Fissato dal call center", c.note].filter(Boolean).join(" — "),
            status: "scheduled",
            created_by: c.caller || currentCaller,
        };
        const { data: linked } = await supabase.from("calls").select("appointment_id").eq("id", callId).maybeSingle();
        const existing = linked?.appointment_id as number | null | undefined;
        const { fascia: _fx, ...payloadLegacy } = payload;   // fallback pre-mig. 118
        if (existing) {
            let { error } = await supabase.from("appointments").update(payload).eq("id", existing);
            if (error && /column/i.test(error.message || "")) ({ error } = await supabase.from("appointments").update(payloadLegacy).eq("id", existing));
            if (error) alert("Appuntamento in calendario NON aggiornato: " + error.message);
            return;
        }
        let { data: ins, error } = await supabase.from("appointments").insert(payload).select("id").single();
        if (error && /column/i.test(error.message || "")) ({ data: ins, error } = await supabase.from("appointments").insert(payloadLegacy).select("id").single());
        if (error) { alert("Appuntamento NON portato in calendario: " + error.message); return; }
        if (ins?.id) {
            const { error: linkErr } = await supabase.from("calls").update({ appointment_id: ins.id }).eq("id", callId);
            if (linkErr) console.warn("collegamento appuntamento non salvato (mig. 088):", linkErr.message);
        }
    }

    // ── PONTE Richiamo → Calendario (Luca 31/07): "Appuntamento telefonico" e
    // "Da richiamare" con data/ora fissata creano un evento type "richiamo" nel
    // calendario (prima non accadeva NULLA: la data restava solo sulla pratica).
    // La visibilita' e' gia' coperta dalle regole del calendario: chi lo crea lo
    // vede, la direzione CC vede quelli di tutto il team. Il collegamento
    // calls.richiamo_event_id (mig. 107) fa si' che il ri-fissaggio AGGIORNI lo
    // stesso evento invece di duplicarlo.
    async function sincronizzaRichiamo(c: Call, callId: string, dataRichiamo: string) {
        const [dataR, oraR] = dataRichiamo.includes("T") ? dataRichiamo.split("T") : [dataRichiamo, "10:00"];
        const fasciaR = eFascia(c.fascia_richiamo) ? c.fascia_richiamo : null;
        const payload: Record<string, unknown> = {
            date: dataR,
            time: fasciaR ? fasciaStart(fasciaR)! : (oraR || "10:00").slice(0, 5),
            fascia: fasciaR,
            type: "richiamo",
            store: null, agente: "",
            customer_name: c.tipo_cliente === "business" ? (c.ragione_sociale || `${c.nome} ${c.cognome}`.trim()) : `${c.nome} ${c.cognome}`.trim(),
            customer_phone: numeroNazionale(c.cellulare || c.numero) || c.cellulare || c.numero || "",
            cf_piva: c.cf || c.piva || null,
            notes: ["Richiamo fissato dal call center", c.noteUpdate || c.note].filter(Boolean).join(" — "),
            status: "scheduled",
            created_by: c.caller || currentCaller,
        };
        const { data: linked } = await supabase.from("calls").select("richiamo_event_id").eq("id", callId).maybeSingle();
        const existing = (linked as { richiamo_event_id?: number | null } | null)?.richiamo_event_id;
        const { fascia: _fx, ...payloadLegacy } = payload;   // fallback pre-mig. 118
        if (existing) {
            let { error } = await supabase.from("appointments").update(payload).eq("id", existing);
            if (error && /column/i.test(error.message || "")) ({ error } = await supabase.from("appointments").update(payloadLegacy).eq("id", existing));
            if (error) alert("Richiamo salvato sulla pratica ma calendario NON aggiornato: " + error.message);
            return;
        }
        let { data: ins, error } = await supabase.from("appointments").insert(payload).select("id").single();
        if (error && /column/i.test(error.message || "")) ({ data: ins, error } = await supabase.from("appointments").insert(payloadLegacy).select("id").single());
        if (error) { alert("Richiamo salvato sulla pratica ma NON portato in calendario: " + error.message); return; }
        if (ins?.id) {
            const { error: linkErr } = await supabase.from("calls").update({ richiamo_event_id: ins.id }).eq("id", callId);
            if (linkErr) console.warn("collegamento richiamo non salvato (mig. 107 da applicare?):", linkErr.message);
        }
    }

    // ANAGRAFICA SEMPRE OBBLIGATORIA (Luca 29/07): anche sui "Non risponde" —
    // nome/cognome (o ragione sociale) + CF/P.IVA. Così l'anagrafica del
    // cliente nasce subito e lo storico chiamate si traccia per cliente.
    function anagraficaObbligatoriaOk(c: Call): boolean {
        if (!c.tipo_cliente) { alert("Seleziona il TIPO cliente (Consumer o Business): è obbligatorio anche se non risponde."); return false; }
        if (c.tipo_cliente === "business") {
            if (!String(c.ragione_sociale || "").trim()) { alert("RAGIONE SOCIALE obbligatoria (anche sui Non risponde): è il cliente che stiamo lavorando."); return false; }
            if (!String(c.piva || "").trim()) { alert("P.IVA obbligatoria: crea l'anagrafica del cliente e traccia lo storico delle chiamate."); return false; }
        } else {
            if (!String(c.nome || "").trim() || !String(c.cognome || "").trim()) { alert("NOME e COGNOME obbligatori (anche sui Non risponde): è il cliente che stiamo lavorando."); return false; }
            if (!String(c.cf || "").trim()) { alert("CODICE FISCALE obbligatorio: crea l'anagrafica del cliente e traccia lo storico delle chiamate."); return false; }
        }
        return true;
    }
    // Se il CF/P.IVA non esiste in anagrafica, il cliente NASCE qui (senza
    // rubare cellulari già assegnati ad altri: in quel caso nasce senza numero).
    async function creaAnagraficaSeManca(c: Call) {
        const idf = String((c.tipo_cliente === "business" ? c.piva : c.cf) || "").trim().toUpperCase();
        if (!idf) return;
        try {
            const { data: ex } = await supabase.from("clients").select("id").ilike("cf_piva", idf).limit(1);
            if (ex && ex.length) return;
            let cel = numeroNazionale(c.numero) || numeroNazionale(c.cellulare);
            if (cel) {
                const { data: dup } = await supabase.from("clients").select("id").ilike("cellulare", cel).limit(1);
                if (dup && dup.length) cel = "";
            }
            const payload: Record<string, unknown> = {
                // stesso set di campi del Registra Vendita: clients ha molte
                // colonne NOT NULL senza default (id, email, indirizzo, ...)
                id: `CL-${idf.replace(/\s/g, "")}-${Date.now()}`,
                tipo: c.tipo_cliente, cf_piva: idf,
                nome: c.nome || "", cognome: c.cognome || "", ragione_sociale: c.ragione_sociale || "",
                cellulare: cel || "", email: "", indirizzo: "", cap: "", citta: "", iban: "",
                nome_ref: "", cognome_ref: "",
                data_nascita: dataNascitaDaCF(idf),
                // ATTRIBUZIONE (Luca 31/07, caso Barbieri): l'anagrafica nata qui
                // e' GESTITA dal caller che ha chiamato, con sede l'ufficio
                // commerciale — distinta dai clienti acquisiti in negozio.
                creato_da: c.caller || currentCaller,
                acquisito_da: "Ufficio Commerciale",
            };
            let { error } = await supabase.from("clients").insert(payload);
            if (error && /column/i.test(error.message)) {
                // mig. 108 non ancora applicata: meglio l'anagrafica senza
                // attribuzione che nessuna anagrafica
                delete payload.creato_da; delete payload.acquisito_da;
                ({ error } = await supabase.from("clients").insert(payload));
            }
            if (error) alert("Esito salvato, ma anagrafica NON creata: " + error.message);
        } catch { /* l'esito resta salvato comunque */ }
    }
    // riga da segnalare (pallino ambra): esito mancante O anagrafica incompleta
    function anagraficaIncompleta(c: Call): boolean {
        if (c.tipo_cliente === "business") return !String(c.ragione_sociale || "").trim() || !String(c.piva || "").trim();
        return !String(c.nome || "").trim() || !String(c.cognome || "").trim() || !String(c.cf || "").trim();
    }
    // Provenienza "Interno": negozio + mese/anno obbligatori per CHIUNQUE la
    // selezioni (Luca 31/07) — prima li chiedeva solo il flusso liste del
    // direttore, e i lead interni lavorati dai caller nascevano senza origine.
    function provenienzaInternoOk(c: Call): boolean {
        if (c.provenienza !== "Interno") return true;
        if (c.negozio_provenienza && c.mese_provenienza && c.anno_provenienza) return true;
        alert("Provenienza INTERNO: indica il NEGOZIO e il MESE/ANNO da cui e' stato estratto questo lead (le stesse informazioni delle liste del direttore).");
        return false;
    }
    async function saveCall() {
        if (!editCall) return;
        const now = new Date().toISOString();
        if (modalMode === "new") {
            if (!anagraficaObbligatoriaOk(editCall)) return;
            if (!provenienzaInternoOk(editCall)) return;
            const newCall: Call = { ...editCall };
            // NEGOZIO DI PERTINENZA obbligatorio (Luca 31/07), anche sui Non
            // risponde: per i lead interni coincide con la provenienza
            if (newCall.provenienza === "Interno" && newCall.negozio_provenienza) newCall.negozio_pertinenza = newCall.negozio_provenienza;
            if (!String(newCall.negozio_pertinenza || "").trim()) { alert("NEGOZIO DI PERTINENZA obbligatorio (anche se non risponde): è il punto vendita congruo per il cliente — serve ai richiami per sapere dove mandarlo."); return; }
            // archivio SENZA +39 e senza spazi (Luca 31/07)
            newCall.numero = numeroNazionale(newCall.numero) || newCall.numero;
            newCall.cellulare = numeroNazionale(newCall.cellulare) || numeroNazionale(newCall.numero);
            // l'input datetime-local e' in ora LOCALE: al DB va l'istante vero
            const dataChiamataIso = newCall.data_chiamata ? new Date(newCall.data_chiamata).toISOString() : now;
            newCall.storico = [{
                data: dataChiamataIso, caller: newCall.caller, campo: "Creazione", da: "", a: newCall.stato,
                dettagli: { brand: newCall.brand, obiettivo: newCall.obiettivo, provenienza: newCall.provenienza, tipologia: newCall.tipologia, esito: newCall.stato },
            }];
            const payload: Record<string, unknown> = {
                tipo_cliente: newCall.tipo_cliente,
                nome: newCall.nome, cognome: newCall.cognome, ragione_sociale: newCall.ragione_sociale,
                cf: newCall.cf, piva: newCall.piva,
                numero: newCall.numero, cellulare: newCall.cellulare,
                brand: newCall.brand, provenienza: newCall.provenienza,
                tipologia: newCall.tipologia, obiettivo: newCall.obiettivo,
                stato: newCall.stato, data_chiamata: dataChiamataIso, caller: newCall.caller,
                negozio_appuntamento: newCall.negozio_appuntamento, data_appuntamento: newCall.data_appuntamento,
                indirizzo: newCall.indirizzo, agente: newCall.agente,
                segnalatore: newCall.segnalatore, campagna: newCall.campagna,
                negozio_provenienza: newCall.negozio_provenienza, mese_provenienza: newCall.mese_provenienza, anno_provenienza: newCall.anno_provenienza,
                whatsapp: newCall.whatsapp, note: newCall.note, data_richiamo: newCall.data_richiamo,
                fascia_appuntamento: newCall.fascia_appuntamento || null,
                fascia_richiamo: newCall.fascia_richiamo || null,
                negozio_pertinenza: newCall.negozio_pertinenza || null,
                lista_origine: newCall.lista_origine,
                storico: newCall.storico,
            };
            let { data: creata, error } = await supabase.from("calls").insert(payload).select("id").single();
            if (error && /column/i.test(error.message || "")) {
                // mig. 118 non ancora applicata: si salva senza i campi nuovi
                const { fascia_appuntamento: _f1, fascia_richiamo: _f2, negozio_pertinenza: _np, ...legacy } = payload;
                ({ data: creata, error } = await supabase.from("calls").insert(legacy).select("id").single());
            }
            if (error) {
                alert("Errore salvataggio: " + error.message);
                return;
            }
            if (creata?.id) await sincronizzaAppuntamento(newCall, String(creata.id));
            await creaAnagraficaSeManca(newCall);
            await fetchCalls();
        } else {
            // Detail mode: update only stato and append history
            if (!editCall.statoNew) { closeModal(); return; }
            // esito APPUNTAMENTO: senza data e senza negozio (o agente) il
            // calendario non si puo' popolare — meglio fermarsi e dirlo subito
            // (prima il ponte falliva in silenzio: caso del test di Luca).
            if (APP_STATI.includes(editCall.statoNew)) {
                const dataOk = editCall.dataAppuntamentoNew || editCall.data_appuntamento;
                const luogoOk = editCall.negozioAppNew || editCall.negozio_appuntamento || editCall.agente;
                if (!dataOk) { alert("Per fissare l'appuntamento serve la DATA E ORA: compilala e risalva."); return; }
                if (!luogoOk) { alert("Per fissare l'appuntamento serve il NEGOZIO (o l'agente): selezionalo e risalva."); return; }
            }
            if (!anagraficaObbligatoriaOk(editCall)) return;
            if (!provenienzaInternoOk(editCall)) return;
            // pertinenza obbligatoria anche agli esiti successivi (Luca 31/07)
            const pertinenza = (editCall.provenienza === "Interno" && editCall.negozio_provenienza)
                ? editCall.negozio_provenienza
                : editCall.negozio_pertinenza;
            if (!String(pertinenza || "").trim()) { alert("NEGOZIO DI PERTINENZA obbligatorio (anche se non risponde): è il punto vendita congruo per il cliente — serve ai richiami per sapere dove mandarlo."); return; }
            const original = calls.find(c => c.id === editCall.id);
            if (!original) return;
            const newStorico: StoricoEntry[] = [
                ...(original.storico || []),
                {
                    data: now, caller: currentCaller, campo: "Stato", da: original.stato, a: editCall.statoNew,
                    dettagli: { brand: editCall.brand, obiettivo: editCall.obiettivo, provenienza: editCall.provenienza, tipologia: editCall.tipologia, esito: editCall.statoNew },
                }
            ];
            const updates: Record<string, unknown> = { stato: editCall.statoNew, storico: newStorico, da_esitare: false };
            // post-chiamata: l'anagrafica completata dal caller viaggia con l'esito
            updates.tipo_cliente = editCall.tipo_cliente;
            updates.nome = editCall.nome; updates.cognome = editCall.cognome;
            updates.ragione_sociale = editCall.ragione_sociale;
            updates.cf = editCall.cf; updates.piva = editCall.piva;
            updates.numero = numeroNazionale(editCall.numero) || editCall.numero;
            updates.cellulare = numeroNazionale(editCall.cellulare) || numeroNazionale(editCall.numero);
            // ...e con lei i Dettagli Chiamata (le 4 tendine dell'Inserimento Manuale)
            updates.brand = editCall.brand; updates.obiettivo = editCall.obiettivo;
            updates.provenienza = editCall.provenienza; updates.tipologia = editCall.tipologia;
            // origine del lead interno: viaggia con l'esito come le altre 4 voci
            updates.negozio_provenienza = editCall.negozio_provenienza;
            updates.mese_provenienza = editCall.mese_provenienza;
            updates.anno_provenienza = editCall.anno_provenienza;
            updates.negozio_pertinenza = pertinenza;

            if (RIC_STATI.includes(editCall.statoNew) && editCall.dataRichiamoNew) {
                const eF = fasciaLabel(editCall.fascia_richiamo);
                newStorico.push({ data: now, caller: currentCaller, campo: "Data richiamo", da: "", a: eF ? `${formatDateShort(editCall.dataRichiamoNew)} · ${eF}` : formatDate(editCall.dataRichiamoNew) });
                updates.data_richiamo = editCall.dataRichiamoNew;
                updates.fascia_richiamo = editCall.fascia_richiamo || null;
            }
            if (APP_STATI.includes(editCall.statoNew) && editCall.dataAppuntamentoNew) {
                const eF = fasciaLabel(editCall.fascia_appuntamento);
                newStorico.push({ data: now, caller: currentCaller, campo: "Data appuntamento", da: "", a: eF ? `${formatDateShort(editCall.dataAppuntamentoNew)} · ${eF}` : formatDate(editCall.dataAppuntamentoNew) });
                updates.data_appuntamento = editCall.dataAppuntamentoNew;
                updates.fascia_appuntamento = editCall.fascia_appuntamento || null;
            }
            if (APP_STATI.includes(editCall.statoNew) && editCall.negozioAppNew) {
                updates.negozio_appuntamento = editCall.negozioAppNew;
            }
            if (NRD_STATI.includes(editCall.statoNew) && editCall.whatsappNew) {
                newStorico.push({ data: now, caller: currentCaller, campo: "WhatsApp", da: "", a: editCall.whatsappNew });
            }
            if (editCall.noteUpdate) {
                newStorico.push({ data: now, caller: currentCaller, campo: "Nota", da: "", a: editCall.noteUpdate });
            }
            updates.storico = newStorico;

            let { error } = await supabase.from("calls").update(updates).eq("id", editCall.id);
            if (error && /column/i.test(error.message || "")) {
                // mig. 118 non ancora applicata: si aggiorna senza i campi nuovi
                const { fascia_appuntamento: _f1, fascia_richiamo: _f2, negozio_pertinenza: _np, ...legacy } = updates;
                ({ error } = await supabase.from("calls").update(legacy).eq("id", editCall.id));
            }
            if (error) {
                alert("Errore aggiornamento: " + error.message);
                return;
            }
            await creaAnagraficaSeManca(editCall);
            if (RIC_STATI.includes(editCall.statoNew) && editCall.dataRichiamoNew) {
                await sincronizzaRichiamo({ ...original, ...editCall }, editCall.id, editCall.dataRichiamoNew);
            }
            if (APP_STATI.includes(editCall.statoNew)) {
                await sincronizzaAppuntamento(
                    {
                        ...original, ...editCall, stato: editCall.statoNew,
                        // La NOTA scritta durante l'esito (noteUpdate) viaggia con
                        // l'appuntamento: prima finiva solo nello storico della
                        // pratica e il negozio non la vedeva (Luca 30/07).
                        note: [editCall.note, editCall.noteUpdate].filter(Boolean).join(" — "),
                        data_appuntamento: (updates.data_appuntamento as string) || original.data_appuntamento,
                        negozio_appuntamento: (updates.negozio_appuntamento as string) || original.negozio_appuntamento,
                    },
                    editCall.id,
                );
            }
            await fetchCalls();
        }
        closeModal();
    }

    function resetFilters() {
        setView((p) => ({
            ...p,
            fCf: "", fNome: "", fCellulare: "", fNegozio: "",
            fDataAppDa: "", fDataAppA: "", fDataChiamataDa: "", fDataChiamataA: "",
            fStato: "", fCaller: "", fBrand: "", fProvenienza: "", fTipologia: "",
            fObiettivo: "", fLista: ""
        }));
        setSelBrands(new Set());
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

    /* ── LAVORAZIONE IN SERIE (richiesta Luca 26/07): il caller salva le 4 voci
       (Brand/Obiettivo/Provenienza/Tipologia) e accende l'interruttore: finche'
       e' ON, chiamate e inserimenti nascono gia' settati (anche lato server,
       via ponte Aircall — tabella caller_presets, mig. 090). ── */
    const [serieOpen, setSerieOpen] = useState(false);
    // Serie con ORIGINE del lead interno (Luca 31/07): se la provenienza del
    // preset e' "Interno", anche negozio + mese/anno viaggiano col preset —
    // stesse informazioni chieste al direttore quando assegna le liste.
    const [serie, setSerie] = useState({ attivo: false, brand: "", obiettivo: "", provenienza: "", tipologia: "", negozio_provenienza: "", mese_provenienza: "", anno_provenienza: "" });
    const [serieBusy, setSerieBusy] = useState(false);
    useEffect(() => {
        if (!user?.id) return;
        supabase.from("caller_presets").select("*").eq("user_id", user.id).maybeSingle()
            .then(({ data }) => {
                if (data) setSerie({
                    attivo: !!data.attivo, brand: data.brand || "", obiettivo: data.obiettivo || "",
                    provenienza: data.provenienza || "", tipologia: data.tipologia || "",
                    negozio_provenienza: data.negozio_provenienza || "", mese_provenienza: data.mese_provenienza || "", anno_provenienza: data.anno_provenienza || "",
                });
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);
    async function salvaSerie(next: typeof serie) {
        if (!user?.id || serieBusy) return;
        setSerieBusy(true);
        const payload = { user_id: user.id, ...next, updated_at: new Date().toISOString() };
        let { error } = await supabase.from("caller_presets").upsert(payload, { onConflict: "user_id" });
        if (error && /column/i.test(error.message)) {
            // mig. 107 non ancora applicata: salva il preset senza l'origine interno
            const { negozio_provenienza: _n, mese_provenienza: _m, anno_provenienza: _a, ...legacy } = payload;
            void _n; void _m; void _a;
            ({ error } = await supabase.from("caller_presets").upsert(legacy, { onConflict: "user_id" }));
        }
        setSerieBusy(false);
        if (error) { alert("Preset non salvato: " + error.message); return; }
        setSerie(next);
    }
    // preset applicato ai campi VUOTI di una call (nuova o aperta in dettaglio)
    const applicaSerie = (c: Call): Call => !serie.attivo ? c : ({
        ...c,
        brand: c.brand || serie.brand,
        obiettivo: c.obiettivo || serie.obiettivo,
        provenienza: c.provenienza || serie.provenienza,
        tipologia: c.tipologia || serie.tipologia,
        negozio_provenienza: c.negozio_provenienza || serie.negozio_provenienza,
        mese_provenienza: c.mese_provenienza || serie.mese_provenienza,
        anno_provenienza: c.anno_provenienza || serie.anno_provenienza,
    });

    /* ── Lista MANUALE (richiesta Luca 26/07): il direttore assegna numeri
       scritti a mano, senza Excel — perfetta anche per testare Aircall su
       numeri veri. Crea la lista e le pratiche reali coi numeri digitati. ── */
    const [manOpen, setManOpen] = useState(false);
    const [manNome, setManNome] = useState("");
    const [manTipo, setManTipo] = useState<TipoCliente>("consumer");
    const [manCaller, setManCaller] = useState("");
    const [manRows, setManRows] = useState<{ numero: string; nome: string; cognome: string }[]>([{ numero: "", nome: "", cognome: "" }]);
    const [manBusy, setManBusy] = useState(false);
    const manValide = manRows.filter((r) => r.numero.replace(/\D/g, "").length >= 6);
    const manOk = !!manNome.trim() && !!manCaller && manValide.length > 0;

    async function salvaListaManuale() {
        if (!manOk || manBusy) return;
        setManBusy(true);
        const dataAssegnazione = new Date().toISOString().slice(0, 16);
        const nome = manNome.trim();
        const { error: le } = await supabase.from("liste").insert({
            nome, data: dataAssegnazione, tipo: manTipo, provenienza: "Manuale",
            segnalatore: "", campagna: "", brand_acq: "", obiettivo_mkt: "",
            interno_rows: [], file_name: "inserimento manuale", file_path: "",
            num_cols: 0, mappa: {}, totale: manValide.length,
            splits: [{ caller: manCaller, quantita: manValide.length }], lavorate: 0,
        });
        if (le) { alert("Errore creazione lista: " + le.message); setManBusy(false); return; }
        const payloads = manValide.map((r) => ({
            tipo_cliente: manTipo,
            nome: manTipo === "consumer" ? r.nome.trim() : "",
            cognome: manTipo === "consumer" ? r.cognome.trim() : "",
            ragione_sociale: manTipo === "business" ? r.nome.trim() : "",
            cf: "", piva: "",
            numero: numeroNazionale(r.numero) || r.numero.trim(), cellulare: numeroNazionale(r.numero),
            brand: "", provenienza: "", tipologia: "", obiettivo: "",
            stato: "Nuovo", data_chiamata: dataAssegnazione, caller: manCaller,
            negozio_appuntamento: "", data_appuntamento: null, indirizzo: "", agente: "",
            segnalatore: "", campagna: "", negozio_provenienza: "", mese_provenienza: "", anno_provenienza: "",
            whatsapp: "", note: `Da lista: ${nome}`, data_richiamo: null,
            lista_origine: nome,
            storico: [{ data: dataAssegnazione, caller: currentCaller, campo: "Assegnazione lista", da: "", a: `Nuovo (lista manuale: ${nome})` }],
        }));
        const { error: ce } = await supabase.from("calls").insert(payloads);
        setManBusy(false);
        if (ce) { alert("Errore creazione pratiche: " + ce.message); return; }
        await Promise.all([fetchCalls(), fetchListe()]);
        setManOpen(false);
        setManNome(""); setManCaller(""); setManRows([{ numero: "", nome: "", cognome: "" }]);
        alert(`Lista "${nome}" assegnata a ${manCaller}: ${payloads.length} numeri`);
    }

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

    const statiDisponibili = isDirector ? STATI_OPT : STATI_OPT.filter(s => s !== "Nuovo");

    /* ── Detail mode flags ── */
    const statoNewIsNR = !!editCall && NRD_STATI.includes(editCall.statoNew || "");
    const statoNewIsRichiamo = !!editCall && RIC_STATI.includes(editCall.statoNew || "");
    const statoNewIsAppuntamento = !!editCall && APP_STATI.includes(editCall.statoNew || "");

    const isBusiness = editCall && editCall.tipo_cliente === "business";
    const isDTS = editCall && editCall.tipologia === "DTS";
    const isOutbound = editCall && editCall.tipologia === "Outbound";
    const isSegnalazione = editCall && editCall.provenienza === "Segnalazione";
    const isMarketing = editCall && editCall.provenienza === "Marketing";
    const isInterno = editCall && editCall.provenienza === "Interno";
    const needsWhatsapp = editCall && NRD_STATI.includes(editCall.stato);
    const needsRichiamo = editCall && RIC_STATI.includes(editCall.stato);

    const isListeView = currentView === "liste";

    /* ════════════════════════════════════════════════════════════════
       RENDER
       ════════════════════════════════════════════════════════════════ */

    // ── vista BADGE dell'hub (spostata da Collaboratori) ──
    if (hubTab === "badge") return (
        <div className="h-full flex flex-col overflow-y-auto">
            <div className="flex-none px-8 pt-6 pb-2 flex items-center justify-between gap-3 flex-wrap">
                {hubPills}
                <h1 className="text-xl font-black text-white tracking-tight">🕒 Badge — presenze e timbrature</h1>
            </div>
            <div className="flex-1 p-4 md:p-8 pt-2">
                <div className="max-w-7xl mx-auto">
                    <BadgeAndDashboard isAdminLike={!!user && (seesAllStores(user.role) || seesWholeStore(user.role))} />
                </div>
            </div>
        </div>
    );

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Telefono Aircall: la bolla ☎ vive SOLO nella sezione Caller (richiesta
                Luca 26/07). Il login Aircall resta in cookie: uscendo e rientrando
                dalla pagina non viene richiesto di nuovo. */}
            <AircallPhoneDock />
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
                        <>
                            <button
                                onClick={() => setManOpen(true)}
                                title="Assegna una lista scrivendo i numeri a mano (senza Excel)"
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 text-xs font-bold uppercase tracking-widest transition-all"
                            >
                                ✍️ Lista Manuale
                            </button>
                            <button
                                onClick={openLista}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 text-xs font-bold uppercase tracking-widest transition-all"
                            >
                                <FileSpreadsheet className="w-4 h-4" /> Assegna Liste
                            </button>
                        </>
                    )}
                    {/* Serie: strumento di chi FA le chiamate — dall'amministrativo
                        in su non serve e sparisce (Luca 30/07). */}
                    {!isListeView && !["amministrativo", "admin", "dev", "direttore_generale"].includes(user?.role || "") && (
                        <button
                            onClick={() => setSerieOpen(true)}
                            title={serie.attivo ? `Lavorazione in serie ATTIVA: ${[serie.brand, serie.obiettivo, serie.provenienza, serie.tipologia].filter(Boolean).join(" · ")}` : "Imposta le 4 voci una volta sola e lavora in serie"}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-bold uppercase tracking-widest transition-all ${serie.attivo ? "border-violet-400/70 bg-violet-500/20 text-violet-200" : "border-white/15 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200"}`}
                        >
                            🎯 Serie {serie.attivo ? "ON" : "OFF"}
                        </button>
                    )}
                    {!isListeView && (() => {
                        // Il conteggio segue i FILTRI attivi (Luca 31/07): con un
                        // caller selezionato conta solo le sue pratiche da esitare.
                        // matchFiltri include gia' la restrizione per ruolo.
                        const daEsitare = calls.filter((c) => c.da_esitare && matchFiltri(c)).length;
                        // Da informativo a PULSANTE-FILTRO (Luca 30/07): cliccato mostra
                        // solo le pratiche ancora da esitare; ri-cliccato torna a tutte.
                        return (daEsitare > 0 || soloDaEsitare) ? (
                            <button
                                type="button"
                                onClick={() => setSoloDaEsitare((v) => !v)}
                                title={soloDaEsitare ? "Stai vedendo solo le pratiche da esitare: clicca per tornare a tutte" : "Mostra solo le chiamate risposte in attesa dell'esito"}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-bold uppercase tracking-widest transition-colors ${soloDaEsitare
                                    ? "border-amber-400 bg-amber-500/25 text-amber-200 shadow-lg shadow-amber-500/20"
                                    : "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"}`}
                            >
                                ☎️ Da esitare: {daEsitare}{soloDaEsitare ? " ✕" : ""}
                            </button>
                        ) : null;
                    })()}
                    {!isListeView && (
                        /* Azione SECONDARIA di emergenza: la via normale e' il telefono
                           verde in basso a destra (gerarchia decisa da Luca 26/07). */
                        <button
                            onClick={openNew}
                            title="Procedura manuale di emergenza — usala solo se Aircall non è disponibile"
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/15 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200 text-xs font-bold uppercase tracking-widest transition-colors"
                        >
                            <Plus className="w-4 h-4" /> Inserimento Manuale
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

            {/* hub Call Center: pillole sezione + widget badge rapido (solo chi timbra) */}
            <div className="flex-none px-8 pt-3 flex items-center gap-3 flex-wrap">
                {hubPills}
                <div className="flex-1 min-w-[280px]"><BadgeWidget /></div>
            </div>

            {loadError && (
                <div className="px-8 py-3 bg-red-500/10 border-b border-red-500/20 text-red-300 text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> {loadError}
                </div>
            )}

            {/* CONTENT */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8">
                {/* Tutta la larghezza disponibile (Luca 30/07): la tabella ha
                    guadagnato colonne e i filtri respirano meglio. */}
                <div className="w-full space-y-6">

                    {/* ── CALLS VIEW ── */}
                    {!isListeView && (
                        <>
                            {/* Tessere brand su UNA riga (si dividono lo spazio): tutte attive
                                per definizione; il click su una = filtro SOLO quella, i click
                                successivi aggiungono/tolgono; tutte scelte o nessuna = tutte. */}
                            <div className="flex gap-3">
                                {brandCounts.map(({ brand, n }) => {
                                    const active = selBrands.size === 0 || selBrands.has(brand);
                                    const logo = BRAND_LOGO[brand];
                                    return (
                                        <button key={brand}
                                            onClick={() => setSelBrands((p) => {
                                                if (p.size === 0) return new Set([brand]);       // primo click: solo lui
                                                const nx = new Set(p);
                                                if (nx.has(brand)) nx.delete(brand); else nx.add(brand);
                                                return nx.size >= BRANDS.length ? new Set<string>() : nx;
                                            })}
                                            title={selBrands.size === 0 ? `Filtra solo ${brand}` : active ? `${brand} nel filtro — clicca per toglierlo` : `Aggiungi ${brand} al filtro`}
                                            className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-2 rounded-2xl border px-3 py-4 transition-all ${active
                                                ? "border-indigo-400/80 bg-indigo-500/20 ring-1 ring-indigo-400/40 shadow-lg shadow-indigo-500/25 brightness-110"
                                                : "border-white/15 bg-white/[0.05] opacity-70 grayscale-[60%] hover:opacity-90 hover:grayscale-[30%]"}`}>
                                            <span className="h-12 flex items-center justify-center" title={brand}>
                                                {logo ? <img src={logo} alt={brand} className="h-12 w-auto max-w-full object-contain" />
                                                    : <span className="text-base font-bold text-slate-200">{brand}</span>}
                                            </span>
                                            <span className="text-[11px] text-slate-400 tabular-nums leading-none">{n} call</span>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* DA LAVORARE / WARNING / MALUS (Luca 31/07, stile Dragon PDA):
                                contatori-filtro sul perimetro filtrato; ⚙️ regole (admin) e
                                ⏱ archivio malus (direzione) in alto a destra della riga */}
                            <div className="flex gap-3 items-stretch">
                                {([
                                    ["da_lavorare", "📋 Da Lavorare", faseCounts.da_lavorare, "border-sky-500/40 bg-sky-500/10 text-sky-300"],
                                    ["warning", "⚠️ Warning", faseCounts.warning, "border-amber-500/40 bg-amber-500/10 text-amber-300"],
                                    ["malus", "💸 Malus", faseCounts.malus, "border-rose-500/40 bg-rose-500/10 text-rose-300"],
                                ] as const).map(([k, l, n, cls]) => (
                                    <button key={k} onClick={() => setFaseFilter(faseFilter === k ? "" : k)}
                                        title={faseFilter === k ? "Filtro attivo — clicca per toglierlo" : `Mostra solo le pratiche ${l}`}
                                        className={`flex-1 rounded-2xl border px-3 py-3 text-left transition-all ${cls} ${faseFilter === k ? "ring-2 ring-white/30 brightness-125" : faseFilter ? "opacity-50 hover:opacity-80" : "hover:brightness-110"}`}>
                                        <div className="text-sm font-bold">{l}</div>
                                        <div className="text-2xl font-black tabular-nums leading-tight">{n}</div>
                                        {k === "malus" && isDirector && faseCounts.importo > 0 && (
                                            <div className="text-[11px] font-semibold">−{faseCounts.importo.toFixed(2).replace(".", ",")} € maturati</div>
                                        )}
                                    </button>
                                ))}
                                <div className="flex flex-col gap-2 justify-center">
                                    {/* lo STORICO ce l'hanno anche i caller (Luca 31/07, come il
                                        tracking PDA): ognuno vede solo i propri episodi */}
                                    <button onClick={() => setShowArchivioMalus(true)} title={isDirector ? "Archivio dei malus (in corso, attivi, compensati)" : "Il tuo storico malus: in corso, attivi, compensati"} className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-xs font-bold hover:bg-white/10 whitespace-nowrap">⏱ {isDirector ? "Malus" : "Storico"}</button>
                                    {/* regole VISIBILI a tutti (Luca 31/07); i giorni li tocca solo l'admin */}
                                    <button onClick={() => setShowRegoleCaller(true)} title={puoRegoleCaller ? "Regole: giorni e malus giornaliero per stato" : "Le regole di lavorazione (sola lettura)"} className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-xs font-bold hover:bg-white/10 whitespace-nowrap">⚙️ Regole</button>
                                </div>
                            </div>
                            {showRegoleCaller && <CallerRegoleModal stati={STATI_OPT} soloLettura={!puoRegoleCaller} onClose={() => setShowRegoleCaller(false)} onSaved={() => caricaRegoleCaller().then(setRegoleCaller)} />}
                            {showArchivioMalus && <ArchivioMalusCallerModal puoCompensare={isDirector && (puoRegoleCaller || ["amministrativo", "direttore_generale"].includes(user?.role || ""))} utente={user?.name || "—"} soloCaller={isDirector ? undefined : currentCaller} onClose={() => setShowArchivioMalus(false)} />}

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
                                    <FilterField label="Cellulare"><input inputMode="numeric" className="glass-input text-sm rounded-lg py-2 w-full" value={fCellulare} onChange={(e) => setFCellulare(e.target.value)} placeholder="Anche parziale..." /></FilterField>
                                    {/* Tendine UNIFICATE (Luca 30/07): stessa estetica del filtro
                                        Caller ovunque — si scrive per filtrare o si clicca. */}
                                    <FilterField label="Negozio App.">
                                        <SelectOpzioni value={fNegozio} onChange={setFNegozio} opzioni={NEGOZI} placeholder="Tutti — scrivi per filtrare" className="glass-input text-sm rounded-lg py-2 w-full" />
                                    </FilterField>
                                    <FilterField label="Data App. (da → a)">
                                        <div className="flex items-center gap-1.5">
                                            <input type="date" className="glass-input text-sm rounded-lg py-2 w-full min-w-0" value={fDataAppDa} onChange={(e) => setFDataAppDa(e.target.value)} title="Dal giorno" />
                                            <span className="text-slate-600 text-xs shrink-0">→</span>
                                            <input type="date" className="glass-input text-sm rounded-lg py-2 w-full min-w-0" value={fDataAppA} onChange={(e) => setFDataAppA(e.target.value)} title="Al giorno" />
                                        </div>
                                    </FilterField>
                                    <FilterField label="Data Chiamata (da → a)">
                                        <div className="flex items-center gap-1.5">
                                            <input type="date" className="glass-input text-sm rounded-lg py-2 w-full min-w-0" value={fDataChiamataDa} onChange={(e) => setFDataChiamataDa(e.target.value)} title="Dal giorno" />
                                            <span className="text-slate-600 text-xs shrink-0">→</span>
                                            <input type="date" className="glass-input text-sm rounded-lg py-2 w-full min-w-0" value={fDataChiamataA} onChange={(e) => setFDataChiamataA(e.target.value)} title="Al giorno" />
                                        </div>
                                    </FilterField>
                                    <FilterField label="Stato">
                                        <SelectOpzioni value={fStato} onChange={setFStato} opzioni={STATI_OPT} placeholder="Tutti — scrivi per filtrare" className="glass-input text-sm rounded-lg py-2 w-full" />
                                    </FilterField>
                                    <FilterField label="Provenienza">
                                        <SelectOpzioni value={fProvenienza} onChange={setFProvenienza} opzioni={PROVENIENZE_OPT} placeholder="Tutte — scrivi per filtrare" className="glass-input text-sm rounded-lg py-2 w-full" />
                                    </FilterField>
                                    <FilterField label="Tipologia">
                                        <SelectOpzioni value={fTipologia} onChange={setFTipologia} opzioni={TIPOLOGIE_OPT} placeholder="Tutte — scrivi per filtrare" className="glass-input text-sm rounded-lg py-2 w-full" />
                                    </FilterField>
                                    <FilterField label="Obiettivo">
                                        <SelectOpzioni value={fObiettivo} onChange={setFObiettivo} opzioni={OBIETTIVI_OPT} placeholder="Tutti — scrivi per filtrare" className="glass-input text-sm rounded-lg py-2 w-full" />
                                    </FilterField>
                                    {isDirector && (
                                        <FilterField label="Caller">
                                            <SelectPersona value={fCaller} onChange={setFCaller} opzioni={CALLERS} placeholder="Tutti — scrivi per filtrare" className="glass-input text-sm rounded-lg py-2 w-full" />
                                        </FilterField>
                                    )}
                                    <FilterField label="Lista Origine"><input className="glass-input text-sm rounded-lg py-2 w-full" value={fLista} onChange={(e) => setFLista(e.target.value)} placeholder="Nome lista..." /></FilterField>
                                </div>
                            </div>

                            {/* Calls table */}
                            <div className="glass-panel overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-white/5">
                                            <Th>Cliente</Th>
                                            <Th>Cellulare</Th>
                                            <Th>Brand</Th>
                                            <Th>Provenienza</Th>
                                            <Th>Tipologia</Th>
                                            <Th>Obiettivo</Th>
                                            <Th>Data Chiamata</Th>
                                            <Th>Ora</Th>
                                            <Th>Caller</Th>
                                            <Th>Stato</Th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loading && (<tr><td colSpan={10} className="text-center py-12 text-slate-500">Caricamento...</td></tr>)}
                                        {!loading && filtered.length === 0 && (<tr><td colSpan={10} className="text-center py-12 text-slate-500">Nessuna call trovata</td></tr>)}
                                        {filtered.map((c) => (
                                            <tr
                                                key={c.id}
                                                onClick={() => openDetail(c)}
                                                onMouseEnter={() => setHoverRow(c.id)}
                                                onMouseLeave={() => setHoverRow(null)}
                                                className={`border-b border-white/5 cursor-pointer transition-colors ${hoverRow === c.id ? "bg-white/[0.04]" : ""}`}
                                            >
                                                <td className="px-4 py-3">
                                                    <div className="font-semibold text-white flex items-center gap-2">
                                                        {clientLabel(c)}
                                                        {(c.da_esitare || anagraficaIncompleta(c)) && <span title={c.da_esitare ? "Chiamata risposta: esito da inserire" : "Anagrafica incompleta: nome/cognome e CF da inserire"} className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />}
                                                    </div>
                                                    <div className="text-[11px] text-slate-500 mt-0.5">{c.tipo_cliente === "business" ? "■ Business" : "● Consumer"}</div>
                                                </td>
                                                {/* La cornetta sta sul NUMERO, non sul nome (Luca 30/07). */}
                                                <td className="px-4 py-3">
                                                    {(c.cellulare || c.numero) ? (
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-mono text-[13px] text-slate-200 whitespace-nowrap">{c.cellulare || c.numero}</span>
                                                            <button
                                                                onClick={async (e) => { e.stopPropagation(); const r = await chiamaAircall(c.cellulare || c.numero, user?.id); alert(r.msg); }}
                                                                title="Chiama con Aircall"
                                                                className="p-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/25 text-[11px] leading-none shrink-0"
                                                            >📞</button>
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-600 text-xs">—</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-slate-300">{c.brand || "—"}</td>
                                                <td className="px-4 py-3 text-slate-300">{c.provenienza || "—"}</td>
                                                <td className="px-4 py-3 text-slate-300">{c.tipologia || "—"}</td>
                                                <td className="px-4 py-3 text-slate-300">{c.obiettivo || "—"}</td>
                                                <td className="px-4 py-3 font-mono text-xs text-slate-400">{formatDateShort(c.data_chiamata)}</td>
                                                {/* orario della chiamata (Luca 31/07): colonna piccola, ora LOCALE */}
                                                <td className="px-2 py-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">{formatTimeShort(c.data_chiamata)}</td>
                                                <td className="px-4 py-3 text-slate-300">{c.caller}</td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${statoBadgeClasses(c.stato)}`}>{c.stato}</span>
                                                        {canDeleteRows && (
                                                            <span onClick={(e) => e.stopPropagation()} className="ml-auto shrink-0">
                                                                {delConfirmId === c.id ? (
                                                                    <span className="inline-flex gap-1">
                                                                        <button onClick={() => eliminaCallCascata(c)}
                                                                            className="px-2 py-1 rounded-md bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold"
                                                                            title="Elimina la pratica E l'eventuale appuntamento in calendario">
                                                                            Elimina?
                                                                        </button>
                                                                        <button onClick={() => setDelConfirmId(null)}
                                                                            className="px-2 py-1 rounded-md border border-white/15 text-slate-400 text-[11px]">✕</button>
                                                                    </span>
                                                                ) : (
                                                                    <button onClick={() => setDelConfirmId(c.id)}
                                                                        title="Elimina la pratica (a cascata anche l'appuntamento collegato in calendario)"
                                                                        className="p-1 rounded-md border border-rose-500/30 text-rose-400/70 hover:text-rose-300 hover:bg-rose-500/15 text-[11px] leading-none">🗑</button>
                                                                )}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
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
                                        <SelectOpzioni value={fLProvenienza} onChange={setFLProvenienza} opzioni={[...PROVENIENZE_LISTA]} placeholder="Tutte — scrivi per filtrare" className="glass-input text-sm rounded-lg py-2 w-full" />
                                    </FilterField>
                                    <FilterField label="Brand">
                                        <SelectOpzioni value={fLBrand} onChange={setFLBrand} opzioni={[...BRANDS]} placeholder="Tutti — scrivi per filtrare" className="glass-input text-sm rounded-lg py-2 w-full" />
                                    </FilterField>
                                    <FilterField label="Caller">
                                        <SelectPersona value={fLCaller} onChange={setFLCaller} opzioni={CALLERS} placeholder="Tutti — scrivi per filtrare" className="glass-input text-sm rounded-lg py-2 w-full" />
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

            {/* LAVORAZIONE IN SERIE: 4 voci impostate una volta, applicate a tutto */}
            {serieOpen && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSerieOpen(false)}>
                    <div className="glass-panel w-full max-w-md shadow-2xl border-white/10" onClick={(e) => e.stopPropagation()}>
                        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
                            <h2 className="text-lg font-bold text-white uppercase tracking-tight">🎯 Lavorazione in serie</h2>
                            <button onClick={() => setSerieOpen(false)} className="p-2 rounded-xl hover:bg-white/5 text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-white/10 bg-white/[0.03]">
                                <div>
                                    <div className="text-sm font-bold text-white">Serie {serie.attivo ? "attiva" : "spenta"}</div>
                                    <div className="text-[11px] text-slate-500 mt-0.5">Con la serie ATTIVA, chiamate e inserimenti nascono già con le 4 voci qui sotto (i campi già compilati non vengono mai sovrascritti).</div>
                                </div>
                                <button onClick={() => salvaSerie({ ...serie, attivo: !serie.attivo })} disabled={serieBusy}
                                    className={`relative w-14 h-7 rounded-full transition-colors shrink-0 ${serie.attivo ? "bg-violet-500/80" : "bg-white/10"}`}>
                                    <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-white transition-all ${serie.attivo ? "left-7" : "left-0.5"}`} />
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <FormGroup label="Brand">
                                    <select className="glass-input rounded-lg py-2 w-full" value={serie.brand} onChange={(e) => salvaSerie({ ...serie, brand: e.target.value })}>
                                        <option value="">—</option>
                                        {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                                    </select>
                                </FormGroup>
                                <FormGroup label="Obiettivo">
                                    <select className="glass-input rounded-lg py-2 w-full" value={serie.obiettivo} onChange={(e) => salvaSerie({ ...serie, obiettivo: e.target.value })}>
                                        <option value="">—</option>
                                        {OBIETTIVI_OPT.map(o => <option key={o} value={o}>{o}</option>)}
                                    </select>
                                </FormGroup>
                                <FormGroup label="Provenienza">
                                    <select className="glass-input rounded-lg py-2 w-full" value={serie.provenienza} onChange={(e) => salvaSerie({ ...serie, provenienza: e.target.value })}>
                                        <option value="">—</option>
                                        {PROVENIENZE_OPT.map(pr => <option key={pr} value={pr}>{pr}</option>)}
                                    </select>
                                </FormGroup>
                                <FormGroup label="Tipologia">
                                    <select className="glass-input rounded-lg py-2 w-full" value={serie.tipologia} onChange={(e) => salvaSerie({ ...serie, tipologia: e.target.value })}>
                                        <option value="">—</option>
                                        {TIPOLOGIE_OPT.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </FormGroup>
                            </div>
                            {serie.provenienza === "Interno" && (
                                <div className="p-3 bg-violet-500/[0.06] border border-violet-500/25 rounded-xl space-y-2">
                                    <p className="text-[10px] font-bold text-violet-300 uppercase tracking-widest">Origine del lead interno — come nelle liste del direttore</p>
                                    <div className="grid grid-cols-3 gap-3">
                                        <FormGroup label="Negozio">
                                            <select className="glass-input rounded-lg py-2 w-full" value={serie.negozio_provenienza} onChange={(e) => salvaSerie({ ...serie, negozio_provenienza: e.target.value })}>
                                                <option value="">Negozio...</option>
                                                {NEGOZI.map(n => <option key={n} value={n}>{n}</option>)}
                                            </select>
                                        </FormGroup>
                                        <FormGroup label="Mese">
                                            <select className="glass-input rounded-lg py-2 w-full" value={serie.mese_provenienza} onChange={(e) => salvaSerie({ ...serie, mese_provenienza: e.target.value })}>
                                                <option value="">Mese...</option>
                                                {MESI.map(m => <option key={m} value={m}>{m}</option>)}
                                            </select>
                                        </FormGroup>
                                        <FormGroup label="Anno">
                                            <select className="glass-input rounded-lg py-2 w-full" value={serie.anno_provenienza} onChange={(e) => salvaSerie({ ...serie, anno_provenienza: e.target.value })}>
                                                <option value="">Anno...</option>
                                                {ANNI.map(a => <option key={a} value={a}>{a}</option>)}
                                            </select>
                                        </FormGroup>
                                    </div>
                                </div>
                            )}
                            <p className="text-[11px] text-slate-500">Il preset è personale e salvato a sistema: vale anche per le pratiche create in automatico dalle tue chiamate Aircall.</p>
                        </div>
                        <div className="px-6 py-4 border-t border-white/10 bg-white/[0.02] flex justify-end">
                            <button onClick={() => setSerieOpen(false)} className="px-6 py-2 rounded-xl text-sm font-bold bg-violet-600 hover:bg-violet-500 text-white">Fatto</button>
                        </div>
                    </div>
                </div>
            )}

            {/* LISTA MANUALE: numeri scritti a mano, assegnati a un caller */}
            {manOpen && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setManOpen(false)}>
                    <div className="glass-panel w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border-white/10" onClick={(e) => e.stopPropagation()}>
                        <div className="flex-none px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
                            <h2 className="text-lg font-bold text-white uppercase tracking-tight">✍️ Lista Manuale</h2>
                            <button onClick={() => setManOpen(false)} className="p-2 rounded-xl hover:bg-white/5 text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] text-slate-500 uppercase tracking-widest">Nome lista <span className="text-rose-400">*</span></label>
                                    <input className="glass-input w-full rounded-lg py-2 mt-1" value={manNome} onChange={(e) => setManNome(e.target.value)} placeholder="Es. Test Aircall Luglio" />
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-500 uppercase tracking-widest">Assegna a <span className="text-rose-400">*</span></label>
                                    <SelectPersona value={manCaller} onChange={setManCaller} opzioni={CALLERS} placeholder="Scrivi il caller…" className="glass-input w-full rounded-lg py-2 mt-1" />
                                </div>
                            </div>
                            <div className="flex gap-2">
                                {(["consumer", "business"] as const).map((t) => (
                                    <button key={t} onClick={() => setManTipo(t)}
                                        className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors ${manTipo === t ? "border-violet-400/70 bg-violet-500/20 text-violet-200" : "border-white/10 text-slate-400 hover:text-slate-200"}`}>
                                        {t === "consumer" ? "● Consumer" : "■ Business"}{manTipo === t ? " ✓" : ""}
                                    </button>
                                ))}
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] text-slate-500 uppercase tracking-widest">Numeri da chiamare ({manValide.length} validi)</label>
                                {manRows.map((r, i) => (
                                    <div key={i} className="flex gap-2 items-center">
                                        <input className="glass-input rounded-lg py-2 flex-1 font-mono" value={r.numero}
                                            onChange={(e) => setManRows((p) => p.map((x, j) => j === i ? { ...x, numero: e.target.value } : x))}
                                            placeholder="Numero (es. 3331234567)" />
                                        {manTipo === "consumer" ? (
                                            <>
                                                <input className="glass-input rounded-lg py-2 flex-1" value={r.nome}
                                                    onChange={(e) => setManRows((p) => p.map((x, j) => j === i ? { ...x, nome: e.target.value } : x))}
                                                    placeholder="Nome (facolt.)" />
                                                <input className="glass-input rounded-lg py-2 flex-1" value={r.cognome}
                                                    onChange={(e) => setManRows((p) => p.map((x, j) => j === i ? { ...x, cognome: e.target.value } : x))}
                                                    placeholder="Cognome (facolt.)" />
                                            </>
                                        ) : (
                                            <input className="glass-input rounded-lg py-2 flex-[2]" value={r.nome}
                                                onChange={(e) => setManRows((p) => p.map((x, j) => j === i ? { ...x, nome: e.target.value } : x))}
                                                placeholder="Ragione sociale (facolt.)" />
                                        )}
                                        <button onClick={() => setManRows((p) => p.length > 1 ? p.filter((_, j) => j !== i) : p)}
                                            className="text-rose-400 hover:text-rose-300 font-bold px-2 shrink-0">✕</button>
                                    </div>
                                ))}
                                <button onClick={() => setManRows((p) => [...p, { numero: "", nome: "", cognome: "" }])}
                                    className="text-xs px-3 py-1.5 rounded-lg border border-white/15 text-slate-300 hover:bg-white/5 font-bold">+ Aggiungi numero</button>
                            </div>
                        </div>
                        <div className="flex-none px-6 py-4 border-t border-white/10 bg-white/[0.02] flex justify-end gap-3">
                            <button onClick={() => setManOpen(false)} className="px-5 py-2 rounded-xl text-sm font-medium text-slate-300 hover:text-white hover:bg-white/10">Annulla</button>
                            <button onClick={salvaListaManuale} disabled={!manOk || manBusy}
                                className="px-6 py-2 rounded-xl text-sm font-bold bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40">
                                {manBusy ? "Creo..." : `Assegna ${manValide.length} numer${manValide.length === 1 ? "o" : "i"}`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════════
                CALL MODAL (Nuova / Dettaglio)
                ════════════════════════════════════════════════════════════════ */}
            {modalOpen && editCall && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={closeModal}>
                    <div className="glass-panel w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border-white/10" onClick={(e) => e.stopPropagation()}>
                        <div className="flex-none px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
                            <h2 className="text-lg font-bold text-white uppercase tracking-tight">{modalMode === "new" ? "Inserimento Manuale (emergenza)" : "Dettaglio Call"}</h2>
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
                                            <div className="flex gap-1.5">
                                                <input className="glass-input rounded-lg py-2 w-full" value={editCall.numero} readOnly={editCall.clienteRiconosciuto} onChange={(e) => updateField("numero", e.target.value)} placeholder="333 123 4567" />
                                                {String(editCall.numero || "").replace(/\D/g, "").length >= 6 && (<>
                                                    <button type="button" title="Chiama questo numero con Aircall"
                                                        onClick={async () => { const r = await chiamaAircall(editCall.numero, user?.id); alert(r.msg); }}
                                                        className="shrink-0 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold">📞</button>
                                                    <Link href={"/chat?wa=" + String(editCall.numero || "").replace(/\D/g, "")} onClick={salvaBozza} title="Scrivi su WhatsApp dal CRM (al ritorno ritrovi la pratica aperta)"
                                                        className="shrink-0 px-3 rounded-lg flex items-center text-white text-sm font-bold" style={{ background: "#25D366" }}>
                                                        <MessageSquare className="w-4 h-4" />
                                                    </Link>
                                                </>)}
                                            </div>
                                        </FormGroup>
                                        <FormGroup label="Recapito Cellulare">
                                            <div className="flex gap-1.5">
                                                <input className="glass-input rounded-lg py-2 w-full" value={editCall.cellulare} readOnly={editCall.clienteRiconosciuto} onChange={(e) => updateField("cellulare", e.target.value)} placeholder="Se diverso" />
                                                {String(editCall.cellulare || "").replace(/\D/g, "").length >= 6 && (<>
                                                    <button type="button" title="Chiama questo numero con Aircall"
                                                        onClick={async () => { const r = await chiamaAircall(editCall.cellulare, user?.id); alert(r.msg); }}
                                                        className="shrink-0 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold">📞</button>
                                                    <Link href={"/chat?wa=" + String(editCall.cellulare || "").replace(/\D/g, "")} onClick={salvaBozza} title="Scrivi su WhatsApp dal CRM (al ritorno ritrovi la pratica aperta)"
                                                        className="shrink-0 px-3 rounded-lg flex items-center text-white text-sm font-bold" style={{ background: "#25D366" }}>
                                                        <MessageSquare className="w-4 h-4" />
                                                    </Link>
                                                </>)}
                                            </div>
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
                                                    {OBIETTIVI_OPT.map(o => <option key={o} value={o}>{o}</option>)}
                                                </select>
                                            </FormGroup>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3 mb-3">
                                            <FormGroup label="Provenienza">
                                                <select className="glass-input rounded-lg py-2 w-full" value={editCall.provenienza} onChange={(e) => updateField("provenienza", e.target.value)}>
                                                    <option value="">Seleziona...</option>
                                                    {PROVENIENZE_OPT.map(p => <option key={p} value={p}>{p}</option>)}
                                                </select>
                                            </FormGroup>
                                            <FormGroup label="Tipologia">
                                                <select className="glass-input rounded-lg py-2 w-full" value={editCall.tipologia} onChange={(e) => updateField("tipologia", e.target.value)}>
                                                    <option value="">Seleziona...</option>
                                                    {TIPOLOGIE_OPT.map(t => <option key={t} value={t}>{t}</option>)}
                                                </select>
                                            </FormGroup>
                                        </div>

                                        <FormGroup label="Negozio di Pertinenza *">
                                            {/* il punto vendita CONGRUO per il cliente (Luca 31/07): per i
                                                lead interni coincide con la provenienza; per gli altri va
                                                scelto SEMPRE, anche sui Non risponde — ai richiami sappiamo
                                                gia' dove mandare il cliente */}
                                            <select className="glass-input rounded-lg py-2 w-full"
                                                value={isInterno && editCall.negozio_provenienza ? editCall.negozio_provenienza : editCall.negozio_pertinenza}
                                                disabled={!!(isInterno && editCall.negozio_provenienza)}
                                                onChange={(e) => updateField("negozio_pertinenza", e.target.value)}>
                                                <option value="">Seleziona negozio...</option>
                                                {NEGOZI.map(n => <option key={n} value={n}>{n}</option>)}
                                            </select>
                                            {isInterno && <p className="text-[10px] text-slate-500 mt-1">Lead interno: coincide col negozio di provenienza.</p>}
                                        </FormGroup>

                                        {isSegnalazione && (
                                            <FormGroup label="Segnalatore">
                                                <SelectPersona value={editCall.segnalatore} onChange={(v) => updateField("segnalatore", v)} opzioni={VENDITORI} placeholder="Scrivi il venditore…" className="glass-input rounded-lg py-2 w-full" />
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
                                                    <IndirizzoAutocomplete value={editCall.indirizzo} onChange={(v) => updateField("indirizzo", v)} onPick={(s) => updateField("indirizzo", s.completo)} className="glass-input rounded-lg py-2 w-full" placeholder="Via e civico: scegli dalla lista" />
                                                </FormGroup>
                                                <FormGroup label="Agente Assegnato">
                                                    <SelectPersona value={editCall.agente} onChange={(v) => updateField("agente", v)} opzioni={AGENTI} placeholder="Scrivi l'agente…" className="glass-input rounded-lg py-2 w-full" />
                                                </FormGroup>
                                            </>
                                        )}
                                        {(isDTS || isOutbound) && (
                                            <FormGroup label="Data e Ora Appuntamento">
                                                <InputDataOra valore={editCall.data_appuntamento} fascia={editCall.fascia_appuntamento || ""}
                                                    onCambia={(v, f) => { updateField("data_appuntamento", v); updateField("fascia_appuntamento", f); }} />
                                            </FormGroup>
                                        )}

                                        <FormGroup label="Stato">
                                            {/* tendina STANDARD del CRM (SelectOpzioni), voci dal pannello
                                                amministrativo (caller_opzioni categoria "stato") */}
                                            <SelectOpzioni value={editCall.stato} onChange={(v) => updateField("stato", v)} opzioni={statiDisponibili} placeholder="Scrivi o scegli l'esito…" className="glass-input rounded-lg py-2 w-full" />
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
                                                <InputDataOra valore={editCall.data_richiamo} fascia={editCall.fascia_richiamo || ""}
                                                    onCambia={(v, f) => { updateField("data_richiamo", v); updateField("fascia_richiamo", f); }} />
                                            </FormGroup>
                                        )}

                                        <FormGroup label="Note">
                                            <textarea className="glass-input rounded-lg py-2 w-full min-h-[60px]" value={editCall.note} onChange={(e) => updateField("note", e.target.value)} placeholder="Annotazioni sulla chiamata..." />
                                        </FormGroup>

                                        <div className="grid grid-cols-2 gap-3">
                                            <FormGroup label="Data Chiamata">
                                                <input type="datetime-local" className="glass-input rounded-lg py-2 w-full opacity-60" value={toLocalInput(editCall.data_chiamata)} readOnly />
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
                                    {/* ANAGRAFICA SEMPRE EDITABILE (Luca 29/07): prima il blocco
                                        compariva solo sulle pratiche "da esitare" (chiamate risposte),
                                        quindi sui Non risponde non c'era NIENTE da compilare — mentre
                                        nome/cognome e CF ora sono obbligatori a ogni esito. */}
                                    {(
                                        <div className="p-4 bg-amber-500/[0.06] border border-amber-500/30 rounded-xl space-y-3">
                                            <p className="text-[11px] font-bold text-amber-300 uppercase tracking-widest">{editCall.da_esitare ? "Completa i dati del cliente raccolti in chiamata" : "Anagrafica del cliente — obbligatoria a ogni esito (anche Non risponde)"}</p>
                                            <div className="flex gap-2">
                                                {(["consumer", "business"] as const).map((t) => (
                                                    <button key={t} onClick={() => updateField("tipo_cliente", t)}
                                                        className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors ${editCall.tipo_cliente === t ? "border-amber-400/70 bg-amber-500/20 text-amber-200" : "border-white/10 text-slate-400 hover:text-slate-200"}`}>
                                                        {t === "consumer" ? "● Consumer" : "■ Business"}{editCall.tipo_cliente === t ? " ✓" : ""}
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                {editCall.tipo_cliente === "business" ? (
                                                    <>
                                                        <div className="col-span-2">
                                                            <label className="text-[10px] text-slate-500 uppercase tracking-widest">Ragione Sociale</label>
                                                            <input className="glass-input w-full rounded-lg py-2 mt-1" value={editCall.ragione_sociale} onChange={(e) => updateField("ragione_sociale", e.target.value)} placeholder="Es. Rossi SRL" />
                                                        </div>
                                                        <div className="col-span-2">
                                                            <label className="text-[10px] text-slate-500 uppercase tracking-widest">Partita IVA</label>
                                                            <input className="glass-input w-full rounded-lg py-2 mt-1 font-mono" value={editCall.piva} onChange={(e) => handleIdentificativoChange("piva", e.target.value.toUpperCase())} placeholder="11 cifre" />
                                                        </div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <div>
                                                            <label className="text-[10px] text-slate-500 uppercase tracking-widest">Nome</label>
                                                            <input className="glass-input w-full rounded-lg py-2 mt-1" value={editCall.nome} onChange={(e) => updateField("nome", e.target.value)} placeholder="Nome" />
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] text-slate-500 uppercase tracking-widest">Cognome</label>
                                                            <input className="glass-input w-full rounded-lg py-2 mt-1" value={editCall.cognome} onChange={(e) => updateField("cognome", e.target.value)} placeholder="Cognome" />
                                                        </div>
                                                        <div className="col-span-2">
                                                            <label className="text-[10px] text-slate-500 uppercase tracking-widest">Codice Fiscale</label>
                                                            <input className="glass-input w-full rounded-lg py-2 mt-1 font-mono" value={editCall.cf} onChange={(e) => handleIdentificativoChange("cf", e.target.value.toUpperCase())} placeholder="16 caratteri" />
                                                        </div>
                                                    </>
                                                )}
                                                <div>
                                                    <label className="text-[10px] text-slate-500 uppercase tracking-widest">Numero</label>
                                                    <div className="flex gap-1.5 mt-1">
                                                        <input className="glass-input w-full rounded-lg py-2" value={editCall.numero} onChange={(e) => updateField("numero", e.target.value)} placeholder="333 123 4567" />
                                                        {String(editCall.numero || "").replace(/\D/g, "").length >= 6 && (<>
                                                            <button type="button" title="Richiama con Aircall"
                                                                onClick={async () => { const r = await chiamaAircall(editCall.numero, user?.id); alert(r.msg); }}
                                                                className="shrink-0 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold">📞</button>
                                                            <Link href={"/chat?wa=" + String(editCall.numero || "").replace(/\D/g, "")} onClick={salvaBozza} title="Scrivi su WhatsApp dal CRM (al ritorno ritrovi la pratica aperta)"
                                                                className="shrink-0 px-3 rounded-lg flex items-center text-white text-sm font-bold" style={{ background: "#25D366" }}>
                                                                <MessageSquare className="w-4 h-4" />
                                                            </Link>
                                                        </>)}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="text-[10px] text-slate-500 uppercase tracking-widest">Recapito Cellulare <span className="normal-case">(solo se diverso)</span></label>
                                                    <div className="flex gap-1.5 mt-1">
                                                        <input className="glass-input w-full rounded-lg py-2" value={editCall.cellulare} onChange={(e) => updateField("cellulare", e.target.value)} placeholder="Secondo numero" />
                                                        {String(editCall.cellulare || "").replace(/\D/g, "").length >= 6 && (<>
                                                            <button type="button" title="Richiama con Aircall"
                                                                onClick={async () => { const r = await chiamaAircall(editCall.cellulare, user?.id); alert(r.msg); }}
                                                                className="shrink-0 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold">📞</button>
                                                            <Link href={"/chat?wa=" + String(editCall.cellulare || "").replace(/\D/g, "")} onClick={salvaBozza} title="Scrivi su WhatsApp dal CRM (al ritorno ritrovi la pratica aperta)"
                                                                className="shrink-0 px-3 rounded-lg flex items-center text-white text-sm font-bold" style={{ background: "#25D366" }}>
                                                                <MessageSquare className="w-4 h-4" />
                                                            </Link>
                                                        </>)}
                                                    </div>
                                                </div>
                                            </div>
                                            {editCall.clienteRiconosciuto && <p className="text-[11px] text-emerald-400 font-bold">✓ Cliente riconosciuto in anagrafica: dati compilati automaticamente</p>}
                                            {/* le stesse prime 4 tendine dell'Inserimento Manuale (Dettagli Chiamata) */}
                                            <p className="text-[11px] font-bold text-amber-300 uppercase tracking-widest pt-1">Dettagli chiamata</p>
                                            <div className="grid grid-cols-2 gap-3">
                                                <FormGroup label="Brand">
                                                    <select className="glass-input rounded-lg py-2 w-full" value={editCall.brand} onChange={(e) => updateField("brand", e.target.value)}>
                                                        <option value="">Seleziona...</option>
                                                        {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                                                    </select>
                                                </FormGroup>
                                                <FormGroup label="Obiettivo">
                                                    <select className="glass-input rounded-lg py-2 w-full" value={editCall.obiettivo} onChange={(e) => updateField("obiettivo", e.target.value)}>
                                                        <option value="">Seleziona...</option>
                                                        {OBIETTIVI_OPT.map(o => <option key={o} value={o}>{o}</option>)}
                                                    </select>
                                                </FormGroup>
                                                <FormGroup label="Provenienza">
                                                    <select className="glass-input rounded-lg py-2 w-full" value={editCall.provenienza} onChange={(e) => updateField("provenienza", e.target.value)}>
                                                        <option value="">Seleziona...</option>
                                                        {PROVENIENZE_OPT.map(pr => <option key={pr} value={pr}>{pr}</option>)}
                                                    </select>
                                                </FormGroup>
                                                <FormGroup label="Tipologia">
                                                    <select className="glass-input rounded-lg py-2 w-full" value={editCall.tipologia} onChange={(e) => updateField("tipologia", e.target.value)}>
                                                        <option value="">Seleziona...</option>
                                                        {TIPOLOGIE_OPT.map(t => <option key={t} value={t}>{t}</option>)}
                                                    </select>
                                                </FormGroup>
                                                {/* lead interno: origine obbligatoria anche all'esito del
                                                    caller — stesse info delle liste del direttore (Luca 31/07) */}
                                                {editCall.provenienza === "Interno" && (
                                                    <div className="col-span-2 grid grid-cols-3 gap-3">
                                                        <FormGroup label="Negozio Provenienza">
                                                            <select className="glass-input rounded-lg py-2 w-full" value={editCall.negozio_provenienza} onChange={(e) => updateField("negozio_provenienza", e.target.value)}>
                                                                <option value="">Negozio...</option>
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
                                            </div>
                                        </div>
                                    )}

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
                                        {(editCall.tipologia === "DTS" || editCall.tipologia === "Outbound") && <SummaryItem label="Data Appuntamento" value={editCall.data_appuntamento ? (fasciaLabel(editCall.fascia_appuntamento) ? `${formatDateShort(editCall.data_appuntamento)} · ${fasciaLabel(editCall.fascia_appuntamento)}` : formatDate(editCall.data_appuntamento)) : ""} />}
                                        <SummaryItem label="Negozio di Pertinenza" value={editCall.negozio_pertinenza || (editCall.provenienza === "Interno" ? editCall.negozio_provenienza : "")} />
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
                                                {/* le voci arrivano dal PANNELLO AMMINISTRATIVO (caller_opzioni):
                                                    prima la lista era hardcoded e mostrava ancora i DTS rimossi */}
                                                <div className="mt-1">
                                                    <SelectOpzioni value={editCall.statoNew || ""} onChange={(v) => updateField("statoNew", v)} opzioni={STATI_OPT.filter(s => s !== "Nuovo")} placeholder="Scrivi o scegli il nuovo stato…" className="glass-input rounded-lg py-2 w-full" />
                                                </div>
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
                                                <InputDataOra valore={editCall.dataRichiamoNew || ""} fascia={editCall.fascia_richiamo || ""}
                                                    onCambia={(v, f) => { updateField("dataRichiamoNew", v); updateField("fascia_richiamo", f); }} />
                                            </FormGroup>
                                        )}
                                        {statoNewIsAppuntamento && (
                                            <>
                                                <FormGroup label="Data e Ora Appuntamento *">
                                                    <InputDataOra valore={editCall.dataAppuntamentoNew || ""} fascia={editCall.fascia_appuntamento || ""}
                                                        onCambia={(v, f) => { updateField("dataAppuntamentoNew", v); updateField("fascia_appuntamento", f); }} />
                                                </FormGroup>
                                                <FormGroup label="Negozio Appuntamento *">
                                                    {/* senza negozio l'appuntamento NON arriva sul calendario del punto vendita */}
                                                    <select className="glass-input rounded-lg py-2 w-full" value={editCall.negozioAppNew || ""} onChange={(e) => updateField("negozioAppNew", e.target.value)}>
                                                        <option value="">Seleziona negozio...</option>
                                                        {NEGOZI.map(n => <option key={n} value={n}>{n}</option>)}
                                                    </select>
                                                </FormGroup>
                                            </>
                                        )}
                                        <FormGroup label="Nota di aggiornamento (opzionale)">
                                            <textarea className="glass-input rounded-lg py-2 w-full min-h-[60px]" value={editCall.noteUpdate || ""} onChange={(e) => updateField("noteUpdate", e.target.value)} placeholder="Es. Cliente ha chiesto di essere richiamato dopo le 18..." />
                                        </FormGroup>
                                    </div>

                                    {editCall.storico && editCall.storico.length > 0 && (
                                        <>
                                            <SectionTitle>Storico Lavorazioni</SectionTitle>
                                            <div className="space-y-1">
                                                {editCall.storico.map((s, i) => {
                                                    const cliccabile = !!(s.dettagli || s.aircall_call_id);
                                                    const aperta = storicoOpen === i;
                                                    const ev = s.aircall_call_id ? eventoAircall[s.aircall_call_id] : undefined;
                                                    return (
                                                        <div key={i} className="border-b border-white/5">
                                                            <div
                                                                onClick={() => cliccabile && apriVoceStorico(i, s)}
                                                                title={cliccabile ? "Clicca per i dettagli della chiamata" : undefined}
                                                                className={`flex gap-3 py-2 text-xs ${cliccabile ? "cursor-pointer hover:bg-white/[0.03] rounded-md" : ""}`}
                                                            >
                                                                <span className="font-mono text-[11px] font-bold text-slate-300 min-w-[120px]">{formatDate(s.data)}</span>
                                                                <span className="text-violet-300 font-semibold min-w-[110px]">{s.caller}</span>
                                                                <span className="flex-1 text-slate-400">
                                                                    <strong className="text-white">{s.campo}</strong>
                                                                    {s.da ? ` : ${s.da} → ${s.a}` : ` : ${s.a}`}
                                                                </span>
                                                                {cliccabile && <span className="text-slate-500 shrink-0">{aperta ? "▴" : "▾"}</span>}
                                                            </div>
                                                            {aperta && (
                                                                <div className="mb-2 p-3 bg-black/25 border border-white/10 rounded-lg grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-400">
                                                                    {s.dettagli?.brand && <span>Brand: <strong className="text-slate-200">{s.dettagli.brand}</strong></span>}
                                                                    {s.dettagli?.obiettivo && <span>Obiettivo: <strong className="text-slate-200">{s.dettagli.obiettivo}</strong></span>}
                                                                    {s.dettagli?.provenienza && <span>Provenienza: <strong className="text-slate-200">{s.dettagli.provenienza}</strong></span>}
                                                                    {s.dettagli?.tipologia && <span>Tipologia: <strong className="text-slate-200">{s.dettagli.tipologia}</strong></span>}
                                                                    {s.dettagli?.esito && <span>Esito: <strong className="text-slate-200">{s.dettagli.esito}</strong></span>}
                                                                    {s.dettagli?.direzione && <span>Direzione: <strong className="text-slate-200">{s.dettagli.direzione === "inbound" ? "Inbound ↙" : "Outbound ↗"}</strong></span>}
                                                                    {typeof s.dettagli?.durata_sec === "number" && <span>Durata: <strong className="text-slate-200">{s.dettagli.durata_sec}s</strong></span>}
                                                                    {s.aircall_call_id ? (
                                                                        ev === "carico" || ev === undefined ? (
                                                                            <span className="col-span-2 text-slate-500">Recupero il registro Aircall…</span>
                                                                        ) : ev === "assente" ? (
                                                                            <span className="col-span-2 text-slate-500">Registro Aircall non trovato per questa voce</span>
                                                                        ) : (
                                                                            <>
                                                                                {ev.agente_nome && <span>Operatore: <strong className="text-slate-200">{ev.agente_nome}</strong></span>}
                                                                                {ev.direction && <span>Telefonata: <strong className="text-slate-200">{ev.direction === "inbound" ? "Inbound ↙" : "Outbound ↗"}</strong>{ev.answered ? " · risposta" : " · non risposta"}{typeof ev.duration_sec === "number" ? ` · ${ev.duration_sec}s` : ""}</span>}
                                                                                {ev.recording_url && s.aircall_call_id && (
                                                                                    <div className="col-span-2 flex items-center gap-2">
                                                                                        {/* il recording_url salvato scade in ~1h: si ascolta
                                                                                            via proxy che chiede a Aircall un URL fresco */}
                                                                                        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                                                                                        <audio controls preload="none" src={`/api/aircall/recording?call=${s.aircall_call_id}`} className="h-8 flex-1 min-w-0" />
                                                                                        <a href={`/api/aircall/recording?call=${s.aircall_call_id}`} target="_blank" rel="noreferrer" download
                                                                                            className="text-[11px] font-bold text-emerald-300 hover:underline shrink-0">⬇ Scarica</a>
                                                                                    </div>
                                                                                )}
                                                                            </>
                                                                        )
                                                                    ) : null}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
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
                                                    {OBIETTIVI_OPT.map(o => <option key={o} value={o}>{o}</option>)}
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
                                            <div className="flex-[2]"><SelectPersona value={split.caller} onChange={(v) => updateSplit(idx, "caller", v)} opzioni={CALLERS} placeholder="Scrivi il caller…" className="glass-input rounded-lg py-2 w-full" /></div>
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

/* HUB CALL CENTER (Luca 28/07): /caller = sezione Caller, /caller?tab=badge =
   Badge (spostato da Collaboratori). Suspense obbligatoria per useSearchParams. */
export default function CallerPage() {
    return (
        <Suspense fallback={<div className="w-full h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-violet-500/20 border-t-violet-500 rounded-full animate-spin" /></div>}>
            <CallerPageInner />
        </Suspense>
    );
}
