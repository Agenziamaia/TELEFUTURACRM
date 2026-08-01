"use client";

import { useState, useMemo, useCallback, useEffect, useRef, Suspense } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { SelectPersona, SelectOpzioni } from "@/components/SelectPersona";
import { IndirizzoAutocomplete } from "@/components/IndirizzoAutocomplete";
import { numeroNazionale } from "@/lib/telefono";
import { dataNascitaDaCF } from "@/lib/dataNascita";
import { useRolePermissions } from "@/lib/usePermissions";
import { capAllowed, CAP_USATO, CAP_USATO_LAVORA, CAP_USATO_MALUS, CAP_USATO_COSTI } from "@/lib/capabilities";
import { erroreIbanIT, normalizzaIban } from "@/lib/iban";
import { caricaRegoleUsato, sincronizzaMalusUsato, scadenzaCorrente, REGOLE_USATO_DEFAULT, type RegoleUsato, type EpisodioUsato } from "@/lib/usatiMalus";
import { UsatoRegoleView } from "@/components/UsatoRegole";
import {
  Smartphone, Tablet, Laptop, Watch,
  Calendar, Search, User, Building2, CalendarDays,
  CheckCircle2, Truck, Tag, CircleDollarSign, XCircle,
  Save, MapPin, Plus, Wrench, FileText, Copy, Trash2,
  ChevronDown, ChevronUp, AlertTriangle, Banknote,
  TicketIcon, Paperclip, ArrowRight, ArrowLeft, RotateCcw,
  UploadCloud, X
} from "lucide-react";
import { cn } from "@/utils";
import { supabase } from "@/lib/supabaseClient";
import { useStores, useSellers } from "@/lib/org";
import { seesWholeStore } from "@/lib/roles";
import { useVisibleStores, stessoMagazzino } from "@/lib/visibleStores";
import { useAuth } from "@/context/AuthContext";
import { useSearchParams } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────
type UsatoStatus =
  | "acquistato" | "in_transito" | "ricevuto" | "in_lavorazione"
  | "pronto" | "invio_in_negozio" | "in_vendita" | "venduto" | "ko"
  | "smontato";   // dissolto per pezzi di ricambio (Luca 01/08, mig. 128)

type RicambioState = "in_magazzino" | "da_ordinare" | "ordinato" | "arrivato";

interface Ricambio {
  name: string;
  stato: RicambioState;
  cost: number;
  data_consegna_prevista: string;
  // orari dei passaggi di stato (mig. 113 / regole laboratorio): servono al
  // conteggio dei giorni della fase riparazione (dal ricambio ARRIVATO)
  stato_dal?: string | null;
  arrivato_il?: string | null;
}

interface Pagamento {
  metodo: "contanti" | "buono" | "bonifico";
  bonifico_tipo?: "ordinario" | "istantaneo" | null;
  bonifico_stato?: "da_fare" | "stampato" | "fatto" | null;
  iban: string;
  bonifico_effettuato: boolean | null;
  bonifico_operatore: string | null;
  bonifico_date: Date | null;
}

interface ExtraMargine {
  importo: number;
  venditore: string;
  confermato: boolean;
  conferma_operatore: string | null;
  conferma_date: Date | null;
}

interface Device {
  id: number; model: string; imei: string; status: UsatoStatus;
  sale_price: number; purchase_price: number;
  store: string; target_store: string | null;
  created_at: Date; purchase_date: Date;
  listed_date: Date | null; sold_date: Date | null;
  ricambi: Ricambio[]; note_tecnico: string;
  status_history: Record<string, { date: Date; operatore: string }>;
  provenienza_subito: boolean;
  extra_margine: ExtraMargine | null;
  pagamento: Pagamento;
  grado_usura: string;
  allegato_documento: string | null;
  allegato_dichiarazione: string | null;
  // mig. 113: cliente da cui e' stato acquistato + venditore che ha registrato
  client_id: string | null;
  venditore: string;
  // mig. 117: prezzo EFFETTIVO di vendita (chiesto all'esito Venduto) —
  // sale_price resta il prezzo di listino in vetrina
  sold_price: number;
  // flaggato in fase di ACQUISTO: comprato apposta per farne pezzi di ricambio
  acquisto_per_ricambi: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_LIST = [
  { key: "acquistato", label: "Acquistato", icon: "🛒", colorClass: "text-slate-400", bgClass: "bg-slate-500/10", borderClass: "border-slate-500/30" },
  { key: "in_transito", label: "In Transito", icon: "🚚", colorClass: "text-amber-400", bgClass: "bg-amber-500/10", borderClass: "border-amber-500/30" },
  { key: "ricevuto", label: "Ricevuto", icon: "📥", colorClass: "text-blue-400", bgClass: "bg-blue-500/10", borderClass: "border-blue-500/30" },
  { key: "in_lavorazione", label: "In Lavorazione", icon: "🔧", colorClass: "text-purple-400", bgClass: "bg-purple-500/10", borderClass: "border-purple-500/30" },
  { key: "pronto", label: "Pronto", icon: "✅", colorClass: "text-emerald-400", bgClass: "bg-emerald-500/10", borderClass: "border-emerald-500/30" },
  { key: "invio_in_negozio", label: "Arrivo in Negozio", icon: "📦", colorClass: "text-orange-400", bgClass: "bg-orange-500/10", borderClass: "border-orange-500/30" },
  { key: "in_vendita", label: "In Vendita", icon: "🏷️", colorClass: "text-green-400", bgClass: "bg-green-500/10", borderClass: "border-green-500/30" },
  { key: "venduto", label: "Venduto", icon: "💸", colorClass: "text-rose-400", bgClass: "bg-rose-500/10", borderClass: "border-rose-500/30" },
  { key: "ko", label: "KO", icon: "❌", colorClass: "text-red-500", bgClass: "bg-red-500/10", borderClass: "border-red-500/30" },
  { key: "smontato", label: "Smontato (ricambi)", icon: "🧩", colorClass: "text-fuchsia-400", bgClass: "bg-fuchsia-500/10", borderClass: "border-fuchsia-500/30" },
] as const;

const statusMap = Object.fromEntries(STATUS_LIST.map(s => [s.key, s]));
const STATUS_KEYS = STATUS_LIST.map(s => s.key);
const LIFECYCLE: UsatoStatus[] = ["acquistato", "in_transito", "ricevuto", "in_lavorazione", "pronto", "invio_in_negozio", "in_vendita", "venduto"];

// ── Chi può muovere ogni fase (segue il telefono fisico) ──────────────────────
// negozio spedisce → LABORATORIO (ricezione, lavorazione, pronto, invio) = Tecnico Senior
// → il negozio destinazione ACCETTA → vende o trasferisce. Amministrazione e admin: sempre tutto.
const RUOLI_SEMPRE = ["admin", "dev", "direttore_generale", "amministrativo"];
const RUOLI_NEGOZIO = ["venditore", "store_manager", "direttore_commerciale"];
// lavoraLab = capacita' "Lavora l'usato" dalla rotellina permessi (Luca 31/07):
// di default il ruolo tecnico (col grado Senior), ma riconfigurabile — il CRM
// si rivende e altre aziende possono abilitare altri ruoli.
// mieiNegozi = i punti vendita visibili dell'utente: nelle fasi DI NEGOZIO
// (acquistato, accettazione, in vendita) il ruolo NON basta — il dispositivo
// deve stare nel TUO negozio (falla scoperta da Luca 31/07: lo SM di Donna
// Olimpia poteva vendere un telefono in carico a Collatina).
function puoMuovere(d: { status: UsatoStatus; store: string; target_store: string | null }, u: { role?: string; grade?: string | null } | null | undefined, lavoraLab: boolean, mieiNegozi: string[]): boolean {
    if (!u?.role) return false;
    if (RUOLI_SEMPRE.includes(u.role)) return true;
    // sede FISICA (Luca 31/07): i negozi doppi condividono il magazzino, quindi
    // chi lavora in "Magliana Multi" muove anche i telefoni di "Magliana W3"
    const mio = (negozio: string | null) => !!negozio && mieiNegozi.some((m) => stessoMagazzino(negozio, m));
    switch (d.status) {
        case "acquistato": return (RUOLI_NEGOZIO.includes(u.role) && mio(d.store)) || lavoraLab; // il SUO negozio spedisce al laboratorio
        case "in_transito":                                                    // il tecnico firma l'arrivo
        case "ricevuto":                                                       // inizia la lavorazione
        case "in_lavorazione":                                                 // completa (pronto) o KO
        case "pronto": return lavoraLab;                                       // il laboratorio spedisce al negozio
        case "invio_in_negozio": return RUOLI_NEGOZIO.includes(u.role) && mio(d.target_store ?? d.store); // ACCETTA solo chi riceve
        case "in_vendita": return RUOLI_NEGOZIO.includes(u.role) && mio(d.store); // vende o trasferisce SOLO il suo negozio
        default: return false;
    }
}
function faseGestitaDa(d: { status: UsatoStatus; store: string; target_store: string | null }): string {
    if (["in_transito", "ricevuto", "in_lavorazione", "pronto"].includes(d.status)) return "Fase gestita dal Tecnico Senior (o amministrazione)";
    if (d.status === "invio_in_negozio") return `In attesa di accettazione dal negozio destinazione${d.target_store ? ` (${d.target_store})` : ""}`;
    if (d.status === "acquistato") return `Il dispositivo è in carico a ${d.store}: lo invia al laboratorio il suo negozio`;
    return `Fase gestita dal negozio che ha il dispositivo (${d.store})`;
}

const STATI_LABORATORIO = ["in_transito", "ricevuto", "in_lavorazione", "pronto"];
const inLaboratorio = (d: { status: UsatoStatus }) => STATI_LABORATORIO.includes(d.status);
// colonna Negozio (modello Luca 01/08): in transito nessuno ("—"), in
// laboratorio "Laboratorio", dall'invio in poi il punto vendita di
// DESTINAZIONE (advanceStatus lo scrive in store al momento dell'invio)
const sedeVisibile = (d: { status: UsatoStatus; store: string }) =>
  d.status === "in_transito" ? "—"
  : ["ricevuto", "in_lavorazione", "pronto"].includes(d.status) ? "🔬 Laboratorio"
  : d.store;

const KPI_CARDS = [
  { key: "_all", label: "Totale", icon: "📊", colorClass: "text-indigo-400", bgClass: "bg-indigo-500/10", borderClass: "border-indigo-500/30" },
  { key: "acquistato", label: "Acquistato", icon: "🛒", colorClass: "text-slate-400", bgClass: "bg-slate-500/10", borderClass: "border-slate-500/30" },
  { key: "invio_in_negozio", label: "Arrivo in Negozio", icon: "📦", colorClass: "text-orange-400", bgClass: "bg-orange-500/10", borderClass: "border-orange-500/30" },
  { key: "in_vendita", label: "In Vendita", icon: "🏷️", colorClass: "text-green-400", bgClass: "bg-green-500/10", borderClass: "border-green-500/30" },
  { key: "venduto", label: "Venduto", icon: "💸", colorClass: "text-rose-400", bgClass: "bg-rose-500/10", borderClass: "border-rose-500/30" },
  { key: "ko", label: "KO", icon: "❌", colorClass: "text-red-500", bgClass: "bg-red-500/10", borderClass: "border-red-500/30" },
];

// NEGOZI dal DB (useStores)
const DATE_FIELDS = [
  { key: "created_at", label: "Data Registrazione" },
  { key: "purchase_date", label: "Data Acquisto" },
  { key: "listed_date", label: "Data Messa in Vendita" },
  { key: "sold_date", label: "Data Vendita" },
];
const RICAMBI_CATALOG = ["Display LCD", "Batteria", "Fotocamera posteriore", "Fotocamera frontale", "Connettore ricarica", "Altoparlante", "Microfono", "Tasto accensione", "Tasto volume", "Vetro posteriore", "Scheda madre", "Sensore impronte", "Face ID module", "Antenna NFC", "Vibrazione motore"];
const RICAMBIO_STATES: { key: RicambioState; label: string; colorClass: string }[] = [
  { key: "in_magazzino", label: "In Magazzino", colorClass: "text-emerald-400" },
  { key: "da_ordinare", label: "Da Ordinare", colorClass: "text-amber-400" },
  { key: "ordinato", label: "Ordinato", colorClass: "text-blue-400" },
  { key: "arrivato", label: "Arrivato", colorClass: "text-emerald-400" },
];
// VENDITORI dal DB (useSellers)
const OPERATORI = ["Alberto", "Francesca", "Daniele", "Giulia", "Michele", "Marta", "Federico", "Eloise", "Riccardo", "Lorenzo"];
const PHONE_BRANDS_MODELS: Record<string, string[]> = {
  Apple: ["iPhone 17 Pro Max", "iPhone 17 Pro", "iPhone 17", "iPhone Air", "iPhone 16 Pro Max", "iPhone 16 Pro", "iPhone 16 Plus", "iPhone 16", "iPhone 16e", "iPhone 15 Pro Max", "iPhone 15 Pro", "iPhone 15 Plus", "iPhone 15", "iPhone 14 Pro Max", "iPhone 14 Pro", "iPhone 14", "iPhone 13", "iPhone SE (2022)"],
  Samsung: ["Galaxy S25 Ultra", "Galaxy S25+", "Galaxy S25", "Galaxy S25 Edge", "Galaxy Z Fold7", "Galaxy Z Flip7", "Galaxy S24 Ultra", "Galaxy S24+", "Galaxy S24", "Galaxy Z Fold6", "Galaxy Z Flip6", "Galaxy A56", "Galaxy A36", "Galaxy A26", "Galaxy A16"],
  Xiaomi: ["15 Ultra", "15", "14T Pro", "14T", "13T Pro", "Redmi Note 14 Pro+", "Redmi Note 14 Pro", "Redmi Note 14", "Redmi 14C"],
  OPPO: ["Find X8 Pro", "Find X8", "Reno 13 Pro", "Reno 13", "A80", "A60"],
  Huawei: ["Pura 70 Pro", "Pura 70", "P60 Pro", "Nova 13", "Nova 12"],
  Google: ["Pixel 9 Pro XL", "Pixel 9 Pro", "Pixel 9", "Pixel 9a", "Pixel 8 Pro", "Pixel 8a"],
  OnePlus: ["13", "13R", "Nord 4", "Nord CE4"],
  Motorola: ["Edge 50 Ultra", "Edge 50 Pro", "Edge 50", "Moto G85"],
  Nothing: ["Phone 3", "Phone 2a", "Phone 2"],
  Altro: ["Altro modello"],
};
const CAPACITA_OPTIONS = ["32 GB", "64 GB", "128 GB", "256 GB", "512 GB", "1 TB"];
const COLORI_OPTIONS = ["Nero", "Bianco", "Blu", "Rosso", "Verde", "Oro", "Argento", "Viola", "Rosa", "Grigio", "Titanio", "Altro"];
const GRADI_USURA = [
  { key: "Km0", label: "Km 0", desc: "Nuovo, mai utilizzato" },
  { key: "A", label: "Grado A — Come nuovo", desc: "Nessun segno visibile" },
  { key: "B", label: "Grado B — Buono", desc: "Lievi segni di usura" },
  { key: "C", label: "Grado C — Discreto", desc: "Segni evidenti ma funzionante" },
  { key: "D", label: "Grado D — Usurato", desc: "Segni importanti, possibili difetti estetici" },
  { key: "ricambi", label: "Acquistato per ricambi", desc: "Non ricondizionabile — usato solo per pezzi di ricambio" },
];
const TIPO_PRODOTTO = [
  { key: "smartphone", label: "Smartphone", Icon: Smartphone },
  { key: "tablet", label: "Tablet", Icon: Tablet },
  { key: "portatile", label: "Portatile", Icon: Laptop },
  { key: "watch", label: "Watch", Icon: Watch },
];

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmtDate = (d: Date | string | null) => { if (!d) return "—"; const dt = d instanceof Date ? d : new Date(d); return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }); };
const fmtDateTime = (d: Date | string | null) => { if (!d) return "—"; const dt = d instanceof Date ? d : new Date(d); return isNaN(dt.getTime()) ? "—" : fmtDate(dt) + " " + dt.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }); };
const fmtEur = (v: number) => v.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

// ─── Data layer ──────────────────────────────────────────────────────────────
const BRANDS_FLAT = Object.entries(PHONE_BRANDS_MODELS).flatMap(([b, ms]) => ms.map(m => `${b} ${m}`));

type UsatiRow = {
  id: number;
  model: string;
  imei: string;
  status: string;
  sale_price: number;
  purchase_price: number;
  store: string;
  target_store: string | null;
  created_at: string;
  purchase_date: string | null;
  listed_date: string | null;
  sold_date: string | null;
  ricambi: unknown;
  note_tecnico: string;
  status_history: unknown;
  provenienza_subito: boolean;
  extra_margine: unknown;
  acquisto_per_ricambi?: boolean | null;
  pagamento: unknown;
  grado_usura: string;
  allegato_documento: string | null;
  allegato_dichiarazione: string | null;
  client_id?: string | null;
  venditore?: string | null;
  sold_price?: number | null;
};

function parseDate(s: string | null): Date {
  if (!s) return new Date(0);
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date(0) : d;
}

function parseHistory(h: unknown): Record<string, { date: Date; operatore: string }> {
  if (!h || typeof h !== "object") return {};
  const out: Record<string, { date: Date; operatore: string }> = {};
  for (const [k, v] of Object.entries(h as Record<string, { date?: string; operatore?: string }>)) {
    if (v && typeof v === "object" && v.date != null) out[k] = { date: parseDate(v.date as string), operatore: (v.operatore as string) || "" };
  }
  return out;
}

function rowToDevice(r: UsatiRow): Device {
  return {
    id: r.id,
    model: r.model,
    imei: r.imei,
    status: r.status as UsatoStatus,
    sale_price: Number(r.sale_price) || 0,
    purchase_price: Number(r.purchase_price) || 0,
    store: r.store,
    target_store: r.target_store ?? null,
    created_at: parseDate(r.created_at),
    purchase_date: parseDate(r.purchase_date),
    listed_date: r.listed_date ? parseDate(r.listed_date) : null,
    sold_date: r.sold_date ? parseDate(r.sold_date) : null,
    ricambi: Array.isArray(r.ricambi) ? (r.ricambi as Ricambio[]) : [],
    note_tecnico: r.note_tecnico || "",
    status_history: parseHistory(r.status_history),
    provenienza_subito: !!r.provenienza_subito,
    extra_margine: r.extra_margine && typeof r.extra_margine === "object" ? { ...(r.extra_margine as any), conferma_date: (r.extra_margine as any).conferma_date ? new Date((r.extra_margine as any).conferma_date) : null } as ExtraMargine : null,
    pagamento: r.pagamento && typeof r.pagamento === "object" ? { ...(r.pagamento as any), bonifico_date: (r.pagamento as any).bonifico_date ? new Date((r.pagamento as any).bonifico_date) : null } as Pagamento : { metodo: "contanti", iban: "", bonifico_effettuato: null, bonifico_operatore: null, bonifico_date: null },
    grado_usura: r.grado_usura || "",
    acquisto_per_ricambi: !!r.acquisto_per_ricambi,
    allegato_documento: r.allegato_documento ?? null,
    allegato_dichiarazione: r.allegato_dichiarazione ?? null,
    client_id: r.client_id ?? null,
    venditore: r.venditore || "",
    sold_price: Number(r.sold_price) || 0,
  };
}

function deviceToRow(d: Device): Record<string, unknown> {
  const hist: Record<string, { date: string; operatore: string }> = {};
  for (const [k, v] of Object.entries(d.status_history)) {
    if (v?.date) hist[k] = { date: v.date instanceof Date ? v.date.toISOString() : String(v.date), operatore: v.operatore || "" };
  }
  const em = d.extra_margine ? {
    ...d.extra_margine,
    conferma_date: d.extra_margine.conferma_date instanceof Date ? d.extra_margine.conferma_date.toISOString() : d.extra_margine.conferma_date,
  } : null;
  const pag = { ...d.pagamento, bonifico_date: d.pagamento.bonifico_date instanceof Date ? d.pagamento.bonifico_date.toISOString() : d.pagamento.bonifico_date };
  return {
    model: d.model,
    imei: d.imei,
    status: d.status,
    sale_price: d.sale_price,
    purchase_price: d.purchase_price,
    store: d.store,
    target_store: d.target_store,
    purchase_date: d.purchase_date instanceof Date ? d.purchase_date.toISOString() : d.purchase_date,
    listed_date: d.listed_date instanceof Date ? d.listed_date.toISOString() : d.listed_date,
    sold_date: d.sold_date instanceof Date ? d.sold_date.toISOString() : d.sold_date,
    ricambi: d.ricambi,
    note_tecnico: d.note_tecnico,
    status_history: hist,
    provenienza_subito: d.provenienza_subito,
    extra_margine: em,
    pagamento: pag,
    grado_usura: d.grado_usura,
    acquisto_per_ricambi: d.acquisto_per_ricambi ?? false,
    allegato_documento: d.allegato_documento,
    allegato_dichiarazione: d.allegato_dichiarazione,
    sold_price: d.sold_price || null,
  };
}

//  MultiSelect 
function MultiSelect({ label, options, selected, onChange, renderOpt }: {
  label: string; options: string[]; selected: string[];
  onChange: (v: string[]) => void; renderOpt?: (o: string) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const allSel = selected.length === options.length;
  const toggle = (o: string) => onChange(selected.includes(o) ? selected.filter(x => x !== o) : [...selected, o]);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-slate-300 hover:bg-white/10 transition-all min-w-[140px]">
        <span className="flex-1 text-left truncate">
          {allSel ? label + " (Tutti)" : selected.length === 0 ? label + " (Nessuno)" : selected.length <= 2 ? selected.join(", ") : `${label} (${selected.length})`}
        </span>
        <span className="text-[10px] text-slate-500">{open ? "" : ""}</span>
      </button>
      {open && <>
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
        <div className="absolute top-full mt-1 left-0 z-50 bg-[#12141f] border border-white/10 rounded-xl shadow-2xl w-52 max-h-72 overflow-auto py-1">
          <div className="px-3 py-2 text-[11px] font-bold uppercase text-purple-400 border-b border-white/5 cursor-pointer hover:bg-white/5"
            onClick={() => onChange(allSel ? [] : [...options])}>
            {allSel ? "Deseleziona Tutti" : "Seleziona Tutti"}
          </div>
          {options.map(o => (
            <div key={o} onClick={() => toggle(o)}
              className={cn("flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-white/5 transition-colors",
                selected.includes(o) ? "bg-purple-500/10 text-purple-300" : "text-slate-300")}>
              <div className={cn("w-4 h-4 rounded flex items-center justify-center border text-[10px] flex-shrink-0",
                selected.includes(o) ? "bg-purple-500 border-purple-500 text-white" : "border-white/20")}>
                {selected.includes(o) && ""}
              </div>
              {renderOpt ? renderOpt(o) : o}
            </div>
          ))}
        </div>
      </>}
    </div>
  );
}

//  StatusBadge 
function StatusBadge({ statusKey }: { statusKey: string }) {
  const s = statusMap[statusKey as UsatoStatus];
  if (!s) return <span>{statusKey}</span>;
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border", s.bgClass, s.colorClass, s.borderClass)}>
      {s.icon} {s.label}
    </span>
  );
}

//  StatusTimeline 
function StatusTimeline({ currentStatus, history }: { currentStatus: UsatoStatus; history: Record<string, { date: Date; operatore: string }> }) {
  const isKO = currentStatus === "ko";
  const currentIdx = isKO ? 3 : LIFECYCLE.indexOf(currentStatus);
  const [openStep, setOpenStep] = useState<string | null>(null);
  return (
    <div className="space-y-0.5">
      {LIFECYCLE.map((sk, i) => {
        const s = statusMap[sk]; const done = !isKO && i < currentIdx; const active = !isKO && i === currentIdx;
        const hasHist = !!history[sk]; const clickable = done || active;
        return (
          <div key={sk}>
            <div onClick={() => clickable && hasHist && setOpenStep(openStep === sk ? null : sk)}
              className={cn("flex items-center gap-2 py-1.5 rounded-lg px-2 transition-all",
                done || active ? "opacity-100" : "opacity-30",
                clickable ? "cursor-pointer hover:bg-white/5" : "")}>
              <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs border-2 flex-shrink-0 transition-all",
                done ? `${s.bgClass} ${s.colorClass} ${s.borderClass}` : active ? `${s.bgClass} ${s.colorClass} ${s.borderClass} shadow-lg` : "border-white/10 bg-transparent")}>
                {done ? "" : s.icon}
              </div>
              <span className={cn("text-xs", active ? "font-bold text-white" : "text-slate-400")}>{s.label}</span>
              {clickable && hasHist && <span className="ml-auto text-[10px] text-slate-600"></span>}
            </div>
            {openStep === sk && hasHist && (
              <div className="ml-8 mb-1 px-3 py-2 rounded-lg bg-black/30 border border-white/5 text-xs text-slate-400 space-y-0.5">
                <div className="text-white font-semibold">{s.icon} {s.label}</div>
                <div> {fmtDateTime(history[sk].date)}</div>
                <div> {history[sk].operatore}</div>
              </div>
            )}
            {i < LIFECYCLE.length - 1 && <div className={cn("w-px h-2 ml-5", done ? "bg-emerald-500/40" : "bg-white/5")} />}
          </div>
        );
      })}
      {isKO && <>
        <div className="w-px h-2 ml-5 bg-white/5" />
        <div onClick={() => history["ko"] && setOpenStep(openStep === "ko" ? null : "ko")}
          className="flex items-center gap-2 py-1.5 rounded-lg px-2 cursor-pointer hover:bg-white/5">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs border-2 bg-red-500/20 border-red-500 text-red-400"></div>
          <span className="text-xs font-bold text-red-400">KO  Non riparabile</span>
        </div>
        {openStep === "ko" && history["ko"] && (
          <div className="ml-8 mb-1 px-3 py-2 rounded-lg bg-black/30 border border-red-500/20 text-xs text-slate-400 space-y-0.5">
            <div className="text-red-400 font-semibold"> KO</div>
            <div> {fmtDateTime(history["ko"].date)}</div>
            <div> {history["ko"].operatore}</div>
          </div>
        )}
      </>}
    </div>
  );
}

//  RicambioRow
// Niente piu' "data prevista consegna" sull'ordinato (Luca 31/07: eliminata).
// Il cestino rimuove il ricambio inserito per errore — solo per chi gestisce
// il telefono (laboratorio/amministrazione); il costo lo vede solo chi ha la
// capacita' costi (rotellina Gestione Usato).
// puoGestire = laboratorio (stati del flusso); puoAmministrare = SOLO
// amministrazione: rimozione ricambi e prezzo (Luca 01/08 — il tecnico segue
// il flusso magazzino/ordinato/arrivato ma non cancella ne' prezza)
function RicambioRow({ r, idx, onUpdate, onRemove, puoGestire, puoAmministrare, vedeCosti }: { r: Ricambio; idx: number; onUpdate: (i: number, r: Ricambio) => void; onRemove: (i: number) => void; puoGestire: boolean; puoAmministrare: boolean; vedeCosti: boolean }) {
  const st = RICAMBIO_STATES.find(s => s.key === r.stato);
  return (
    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-semibold text-slate-300"> {r.name}</span>
        {puoGestire ? (
          <select value={r.stato} onChange={e => onUpdate(idx, { ...r, stato: e.target.value as RicambioState })}
            className={cn("bg-black/40 border rounded-lg px-2 py-1 text-xs font-semibold outline-none cursor-pointer border-white/10", st?.colorClass)}>
            {RICAMBIO_STATES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        ) : (
          <span className={cn("bg-black/40 border rounded-lg px-2 py-1 text-xs font-semibold border-white/10", st?.colorClass)}>{st?.label || r.stato}</span>
        )}
        {r.stato === "arrivato" && r.arrivato_il && <span className="text-[10px] text-slate-600">arrivato {fmtDate(new Date(r.arrivato_il))}</span>}
        {puoAmministrare && (
          <button onClick={() => onRemove(idx)} title="Rimuovi il ricambio (solo amministrazione)"
            className="ml-auto p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors">
            <Trash2 size={14} />
          </button>
        )}
      </div>
      {vedeCosti && (
        <div className="flex gap-3 items-center flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-500">Costo:</span>
            {puoAmministrare ? (
              <><input type="number" step="0.01" min="0" value={r.cost || ""} onChange={e => onUpdate(idx, { ...r, cost: parseFloat(e.target.value) || 0 })}
                className="w-20 bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-xs text-slate-300 outline-none" placeholder="0.00" />
              <span className="text-[11px] text-slate-500">€</span></>
            ) : (
              <span className="text-xs text-slate-300 font-semibold">{r.cost ? fmtEur(r.cost) : "—"}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

//  DevicePanel 
function DevicePanel({ device, onClose, onSave }: { device: Device; onClose: () => void; onSave: (d: Device) => void }) {
  const NEGOZI = useStores();
  const { user } = useAuth();
  const { perms } = useRolePermissions(user?.role);
  // capacita' dalla rotellina Gestione Usato (Luca 31/07)
  const lavoraLab = capAllowed(user?.role, CAP_USATO.section, CAP_USATO_LAVORA, perms) && (user?.role !== "tecnico" || user?.grade === "tecnico_senior");
  const vedeCosti = capAllowed(user?.role, CAP_USATO.section, CAP_USATO_COSTI, perms);
  const isAmministrazione = RUOLI_SEMPRE.includes(user?.role || "");
  const operatore = user?.name || "Operatore";
  const [dev, setDev] = useState<Device>(() => ({ ...device, ricambi: device.ricambi.map(r => ({ ...r })), extra_margine: device.extra_margine ? { ...device.extra_margine } : null, pagamento: { ...device.pagamento } }));
  const [newRicambio, setNewRicambio] = useState("");
  const [newRicambioInMag, setNewRicambioInMag] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [targetStore, setTargetStore] = useState(dev.target_store || "");
  const [noteTecnico, setNoteTecnico] = useState(dev.note_tecnico || "");
  const [salePriceVal, setSalePriceVal] = useState(String(dev.sale_price || ""));
  const [ibanCopied, setIbanCopied] = useState(false);
  const [indietroSel, setIndietroSel] = useState("");

  // TEMPI DEL LABORATORIO (Luca 31/07): scadenze e malus visibili solo a chi
  // ha la capacita' (tecnico senior + amministrativo in su di default)
  const vedeMalus = capAllowed(user?.role, CAP_USATO.section, CAP_USATO_MALUS, perms) && (user?.role !== "tecnico" || user?.grade === "tecnico_senior");
  const [regole, setRegole] = useState<RegoleUsato>(REGOLE_USATO_DEFAULT);
  useEffect(() => { if (vedeMalus) caricaRegoleUsato().then(setRegole); }, [vedeMalus]);
  const scad = vedeMalus ? scadenzaCorrente(dev, regole) : null;

  // ── DOCUMENTI ALLEGATI (Luca 31/07): stessa logica della visibilita' clienti.
  // Finche' il telefono e' IN NEGOZIO (acquistato): li vede chi l'ha comprato
  // (il venditore della registrazione) e lo store manager per il SUO negozio.
  // Dal passaggio in transito IN POI: solo il team amministrativo in su. ──
  const { stores: visStores } = useVisibleStores();
  const mieiNegozi = visStores.length ? visStores : (user?.negozio ? [user.negozio] : []);
  const eMioNegozio = mieiNegozi.some((m) => stessoMagazzino(dev.store, m));
  const vedeDocumenti = (() => {
    if (isAmministrazione) return true;
    if (dev.status !== "acquistato") return false;
    const compratore = (dev.venditore || dev.status_history.acquistato?.operatore || "").trim().toLowerCase();
    if (compratore && compratore === (user?.name || "").trim().toLowerCase()) return true;
    if (seesWholeStore(user?.role)) return eMioNegozio;
    return false;
  })();
  // prezzo di vendita: lo imposta il negozio che HA il telefono (o l'amministrazione)
  const puoPrezzo = isAmministrazione || (RUOLI_NEGOZIO.includes(user?.role || "") && eMioNegozio);

  // AUTOSALVATAGGIO (Luca 31/07): niente piu' tasto Salva — ogni azione
  // persiste subito, come nel resto del gestionale. Note e prezzo si salvano
  // quando si esce dal campo (onBlur).
  const persist = (u: Device) => { setDev(u); onSave(u); };

  // cliente da cui e' stato ACQUISTATO (mig. 113) — per i telefoni registrati
  // prima l'anagrafica non veniva salvata: resta il "—"
  const [clienteAcq, setClienteAcq] = useState<{ id: string; nome: string } | null>(null);
  useEffect(() => {
    if (!dev.client_id) { setClienteAcq(null); return; }
    supabase.from("clients").select("id,nome,cognome,ragione_sociale").eq("id", dev.client_id).maybeSingle()
      .then(({ data }) => data && setClienteAcq({ id: data.id as string, nome: (data.ragione_sociale as string) || `${data.nome || ""} ${data.cognome || ""}`.trim() || "—" }));
  }, [dev.client_id]);

  const s = statusMap[dev.status];
  const canAdvance = !["venduto", "ko", "smontato"].includes(dev.status);
  const lcIdx = LIFECYCLE.indexOf(dev.status as any);
  const next = canAdvance && lcIdx >= 0 && lcIdx < LIFECYCLE.length - 1 ? LIFECYCLE[lcIdx + 1] : null;
  const needsStore = dev.status === "pronto";
  const totalRicambi = dev.ricambi.reduce((s, r) => s + (r.cost || 0), 0);
  const spVal = parseFloat(salePriceVal) || 0;
  const margin = spVal - dev.purchase_price - totalRicambi;

  const addRicambio = () => {
    if (!newRicambio.trim()) return;
    const nuovo: Ricambio = { name: newRicambio.trim(), stato: newRicambioInMag ? "in_magazzino" : "da_ordinare", cost: 0, data_consegna_prevista: "", stato_dal: new Date().toISOString() };
    persist({ ...dev, ricambi: [...dev.ricambi, nuovo] });
    setNewRicambio(""); setShowAdd(false); setNewRicambioInMag(false);
  };
  const updateRicambio = (idx: number, r: Ricambio) => {
    const prima = dev.ricambi[idx];
    // orologio delle fasi (regole laboratorio): ogni cambio stato del ricambio
    // viene datato; l'ARRIVATO fa partire i giorni della riparazione
    const conData: Ricambio = prima && prima.stato !== r.stato
      ? { ...r, stato_dal: new Date().toISOString(), arrivato_il: r.stato === "arrivato" ? new Date().toISOString() : r.arrivato_il ?? null }
      : r;
    const a = [...dev.ricambi]; a[idx] = conData;
    persist({ ...dev, ricambi: a });
  };
  const removeRicambio = (idx: number) => persist({ ...dev, ricambi: dev.ricambi.filter((_, i) => i !== idx) });

  const smonta = () => {
    if (!window.confirm(`Smontare ${dev.model} (${dev.imei}) e usarlo per pezzi di ricambio?\nIl telefono esce dal flusso di vendita ma resta tracciato tra gli Smontati.`)) return;
    persist({ ...dev, status: "smontato", note_tecnico: noteTecnico,
      status_history: { ...dev.status_history, smontato: { date: new Date(), operatore } } });
  };
  const advanceStatus = () => {
    if (needsStore && !targetStore) return;
    // Registra data+ora e operatore del cambio stato (prima non veniva salvato,
    // quindi la cronologia in ciascun usato restava vuota dopo l'acquisto).
    const u: Device = { ...dev, status: next!, note_tecnico: noteTecnico,
      status_history: { ...dev.status_history, [next!]: { date: new Date(), operatore } } };
    if (needsStore) u.target_store = targetStore;
    // dall'INVIO il telefono e' del negozio di destinazione (Luca 01/08):
    // prima restava intestato all'origine e il "Mostra i miei" del negozio
    // ricevente non lo vedeva (caso Eros/Baleniere)
    if (next === "invio_in_negozio" && targetStore) u.store = targetStore;
    // Accettazione: quando il negozio destinazione accetta (invio -> in vendita),
    // il dispositivo passa in carico a LUI (prima restava sul magazzino mittente
    // e non era vendibile dal negozio che lo aveva ricevuto).
    if (next === "in_vendita" && dev.target_store) { u.store = dev.target_store; u.target_store = null; }
    if (next === "in_vendita") u.listed_date = new Date();
    // VENDUTO nasce SOLO dallo scarico in Registra Vendita (Luca 31/07), che
    // archivia prezzo effettivo e cliente: qui il passaggio manuale non esiste.
    if (next === "venduto") return;
    persist(u);
  };
  // PASSO INDIETRO (Luca 31/07): dall'amministrativo in su si corregge un
  // avanzamento sbagliato riportando lo stato a 1..N passi prima — con
  // conferma esplicita. Le date derivate (vendita/vetrina) si azzerano se si
  // torna prima del loro stato; il passaggio resta tracciato nella cronologia.
  const tornaIndietro = () => {
    if (!indietroSel) return;
    const target = indietroSel as UsatoStatus;
    const da = statusMap[dev.status]?.label || dev.status;
    const a = statusMap[target]?.label || target;
    if (!window.confirm(`⚠️ Stai riportando il telefono INDIETRO: da "${da}" a "${a}".\nConfermi il passo indietro?`)) return;
    const tIdx = LIFECYCLE.indexOf(target);
    const u: Device = { ...dev, status: target, note_tecnico: noteTecnico,
      status_history: { ...dev.status_history, [`indietro_${Date.now()}`]: { date: new Date(), operatore: `${operatore} — riportato da ${da} a ${a}` } } };
    if (tIdx < LIFECYCLE.indexOf("venduto")) u.sold_date = null;
    if (tIdx < LIFECYCLE.indexOf("in_vendita")) u.listed_date = null;
    if (tIdx <= LIFECYCLE.indexOf("pronto")) u.target_store = null;
    persist(u);
    setIndietroSel("");
  };
  // Trasferimento tra negozi anche a dispositivo GIA' IN VENDITA (es. fermo in
  // vetrina da troppo): torna "in arrivo" verso il negozio scelto, che deve
  // accettarlo — solo all'accettazione passa in carico a lui. Ripetibile.
  const sendToStore = () => {
    if (!targetStore) return;
    persist({ ...dev, status: "invio_in_negozio", store: targetStore, target_store: targetStore, note_tecnico: noteTecnico,
      status_history: { ...dev.status_history, invio_in_negozio: { date: new Date(), operatore } } });
  };
  const setKO = () => persist({ ...dev, status: "ko", note_tecnico: noteTecnico,
    status_history: { ...dev.status_history, ko: { date: new Date(), operatore } } });

  const confirmExtraMargine = () => persist({ ...dev, extra_margine: { ...dev.extra_margine!, confermato: true, conferma_operatore: operatore, conferma_date: new Date() } });

  const toggleBonifico = () => {
    const nowEff = !dev.pagamento.bonifico_effettuato;
    const upd: Device = { ...dev, pagamento: { ...dev.pagamento, bonifico_effettuato: nowEff, bonifico_operatore: nowEff ? (user?.name || "Amministrazione") : null, bonifico_date: nowEff ? new Date() : null }, note_tecnico: noteTecnico };
    setDev(upd); onSave(upd);
  };
  const getFileUrl = (path: string) => supabase.storage.from("usati_attachments").getPublicUrl(path).data.publicUrl;
  const copyIban = () => { try { navigator.clipboard.writeText(dev.pagamento.iban); setIbanCopied(true); setTimeout(() => setIbanCopied(false), 2000); } catch (e) { } };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-start justify-center pt-8 px-4" onClick={onClose}>
      <div className="bg-[#12141f] border border-white/10 rounded-2xl w-full max-w-5xl max-h-[88vh] overflow-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-[#12141f] border-b border-white/10 px-6 py-4 flex items-center justify-between z-10 rounded-t-2xl">
          <div>
            <div className="text-lg font-bold text-white flex items-center gap-2">{s?.icon} {dev.model}</div>
            <div className="text-xs text-slate-500 font-mono mt-0.5">IMEI: {dev.imei}</div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/80" title="Ogni modifica viene salvata subito, come nel resto del gestionale">✓ salvataggio automatico</span>
            <button onClick={onClose} className="text-slate-500 hover:text-white text-xl transition-colors px-2">✕</button>
          </div>
        </div>
        {/* Body */}
        <div className="p-6 grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
          {/* LEFT: Status Timeline */}
          <div>
            <div className="text-sm font-bold text-white mb-3"> Stato</div>
            <StatusBadge statusKey={dev.status} />
            {/* scadenza della fase corrente (regole laboratorio, mig. 113) */}
            {scad && (
              <div className={cn("mt-3 px-3 py-2.5 rounded-xl border text-xs",
                scad.oltre > 0 ? "bg-red-500/10 border-red-500/40" : "bg-white/[0.03] border-white/10")}>
                <div className={cn("font-bold uppercase tracking-wider text-[10px]", scad.oltre > 0 ? "text-red-400" : "text-slate-400")}>
                  ⏱ {scad.fase === "lavorazione" ? "Presa in carico" : "Riparazione"}
                </div>
                {scad.oltre > 0 ? (
                  <div className="text-red-300 font-semibold mt-1">
                    OLTRE SOGLIA da {scad.oltre} giorn{scad.oltre === 1 ? "o" : "i"} · malus maturato <b>{fmtEur(scad.importo)}</b>
                  </div>
                ) : (
                  <div className="text-slate-300 mt-1">entro <b>{fmtDate(scad.scadenza)}</b> ({regole[scad.fase].malus > 0 ? `${fmtEur(regole[scad.fase].malus)}/giorno oltre soglia` : "senza malus"})</div>
                )}
              </div>
            )}
            <div className="mt-4"><StatusTimeline currentStatus={dev.status} history={dev.status_history} /></div>
            {canAdvance && !puoMuovere(dev, user, lavoraLab, mieiNegozi) && (
              <div className="mt-4 text-[11px] text-slate-500 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5">
                🔒 {faseGestitaDa(dev)}
              </div>
            )}
            {canAdvance && puoMuovere(dev, user, lavoraLab, mieiNegozi) && (
              <div className="mt-4 flex flex-col gap-2">
                {needsStore && (
                  <select value={targetStore} onChange={e => setTargetStore(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-300 outline-none">
                    <option value="">Seleziona Negozio...</option>
                    {NEGOZI.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                )}
                {next && next !== "venduto" && <button onClick={advanceStatus} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-sm font-semibold hover:bg-emerald-500/30 transition-all">
                  {needsStore ? <>📤 Invia a {targetStore || "…"}</>
                    : dev.status === "invio_in_negozio" ? <>✅ Accetta in negozio{dev.target_store ? ` (${dev.target_store})` : ""}</>
                    : <>{statusMap[next]?.icon} {statusMap[next]?.label}</>}
                </button>}
                {next === "venduto" && (
                  <div className="text-xs text-slate-400 bg-white/5 border border-white/10 rounded-xl px-3 py-2 leading-relaxed">
                    🛒 La vendita si registra da <span className="font-semibold text-slate-200">Registra Vendita</span>: cerca il telefono
                    nel magazzino usati, associa cliente e prezzo — qui passerà a <span className="font-semibold text-slate-200">Venduto</span> da solo.
                  </div>
                )}
                {dev.status === "in_vendita" && (
                  <div className="flex flex-col gap-2 border-t border-white/10 pt-3 mt-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Trasferisci a un altro negozio</div>
                    <select value={targetStore} onChange={e => setTargetStore(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-300 outline-none">
                      <option value="">Seleziona Negozio...</option>
                      {NEGOZI.filter(n => n !== dev.store).map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <button onClick={sendToStore} disabled={!targetStore} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 text-sm font-semibold hover:bg-amber-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                      📤 Invia a {targetStore || "…"}
                    </button>
                  </div>
                )}
                {["in_lavorazione", "ricevuto"].includes(dev.status) && (
                  <button onClick={setKO} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/20 text-red-400 border border-red-500/30 text-sm font-semibold hover:bg-red-500/30 transition-all"> KO</button>
                )}
              </div>
            )}
            {/* SMONTA PER RICAMBI (Luca 01/08): il telefono si dissolve nei
                pezzi ma resta tracciato (stato terminale "smontato", chip
                dedicata nei filtri). Solo amministrazione e tecnico senior.
                GRANDE quando era stato comprato apposta ed e' arrivato. */}
            {(isAmministrazione || lavoraLab) && !["venduto", "smontato"].includes(dev.status) && (
              (dev.acquisto_per_ricambi || dev.grado_usura === "ricambi") && ["in_transito", "ricevuto", "in_lavorazione"].includes(dev.status) ? (
                <button onClick={smonta}
                  className="mt-4 w-full flex items-center justify-center gap-2 px-3 py-3.5 rounded-xl bg-red-600 text-white text-sm font-black uppercase tracking-wide border-2 border-red-400 hover:bg-red-500 transition-all animate-pulse">
                  🧩 SMONTA E USA PER PEZZI DI RICAMBIO
                </button>
              ) : (
                <button onClick={smonta}
                  className="mt-4 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 text-red-400 border border-red-500/30 text-xs font-semibold hover:bg-red-500/20 transition-all">
                  🧩 Smonta e usa per ricambi
                </button>
              )
            )}
            {/* PASSO INDIETRO (Luca 31/07): correzione errori, solo
                amministrativo in su, con conferma esplicita */}
            {/* in FONDO alla colonna con stacco netto (Luca 01/08): attaccata
                alle selezioni di stato si confondeva con il flusso normale */}
            {isAmministrazione && (LIFECYCLE.indexOf(dev.status as any) > 0 || ["ko", "venduto", "smontato"].includes(dev.status)) && (
              <div className="mt-14 flex flex-col gap-2 border-t-2 border-dashed border-amber-500/20 pt-4 opacity-90">
                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400/80">↩ Correzione stato (amministrazione)</div>
                <select value={indietroSel} onChange={e => setIndietroSel(e.target.value)}
                  className="w-full bg-black/40 border border-amber-500/20 rounded-xl px-3 py-2 text-sm text-slate-300 outline-none">
                  <option value="">Riporta a…</option>
                  {LIFECYCLE.filter((sk) => ["ko", "smontato"].includes(dev.status) ? sk !== "venduto" : LIFECYCLE.indexOf(sk) < LIFECYCLE.indexOf(dev.status as any)).map(sk => (
                    <option key={sk} value={sk}>{statusMap[sk]?.icon} {statusMap[sk]?.label}</option>
                  ))}
                </select>
                <button onClick={tornaIndietro} disabled={!indietroSel}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/30 text-sm font-semibold hover:bg-amber-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                  ↩ Torna indietro
                </button>
              </div>
            )}
          </div>
          {/* RIGHT: Details */}
          <div className="space-y-5">
            {/* Badges */}
            <div className="flex flex-wrap gap-2">
              {dev.provenienza_subito && <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/30"> Provenienza Subito.it</span>}
              {(dev.acquisto_per_ricambi || dev.grado_usura === "ricambi") && <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/30">🧩 Comprato per ricambi</span>}
              <span className={cn("inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border",
                dev.pagamento.metodo === "bonifico" ? "bg-blue-500/10 text-blue-400 border-blue-500/30" : "bg-white/5 text-slate-400 border-white/10")}>
                {dev.pagamento.metodo === "contanti" ? "" : dev.pagamento.metodo === "buono" ? "" : ""} {dev.pagamento.metodo === "contanti" ? "Contanti" : dev.pagamento.metodo === "buono" ? "Buono" : "Bonifico"}
              </span>
            </div>
            {/* Details grid */}
            <div>
              <div className="text-sm font-bold text-white mb-3"> Dettagli</div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                {/* il prezzo di ACQUISTO lo vede solo chi ha la capacita' costi
                    (Luca 31/07: dall'amministrativo in su, rotellina permessi) */}
                {/* Modello/IMEI/Negozio: modificabili SOLO dall'amministrazione
                    (Luca 01/08) — per tutti gli altri sola lettura, nessun controllo */}
                {isAmministrazione ? (
                  <>
                    <div><div className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Modello</div>
                      <input defaultValue={dev.model} onBlur={e => { const v = e.target.value.trim(); if (v && v !== dev.model) persist({ ...dev, model: v }); }}
                        className="w-full bg-black/40 border border-amber-500/30 rounded-lg px-2 py-1 text-sm text-white outline-none" /></div>
                    <div><div className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">IMEI</div>
                      <input defaultValue={dev.imei} onBlur={e => { const v = e.target.value.replace(/[^0-9A-Za-z]/g, ""); if (v && v !== dev.imei) persist({ ...dev, imei: v }); }}
                        className="w-full bg-black/40 border border-amber-500/30 rounded-lg px-2 py-1 text-sm text-white font-mono outline-none" /></div>
                    <div><div className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Negozio</div>
                      <select value={dev.store} onChange={e => persist({ ...dev, store: e.target.value })}
                        className="w-full bg-black/40 border border-amber-500/30 rounded-lg px-2 py-1 text-sm text-white outline-none">
                        {NEGOZI.map(nn => <option key={nn} value={nn}>{nn}</option>)}
                        {!NEGOZI.includes(dev.store) && <option value={dev.store}>{dev.store}</option>}
                      </select></div>
                  </>
                ) : (
                  <>
                    {([["Modello", dev.model, false], ["IMEI", dev.imei, true], ["Negozio", dev.status === "in_transito" ? `— (da ${dev.store})` : ["ricevuto", "in_lavorazione", "pronto"].includes(dev.status) ? `🔬 Laboratorio (da ${dev.store})` : dev.store, false]] as [string, string, boolean][]).map(([l, v, mono]) => (
                      <div key={l}>
                        <div className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">{l}</div>
                        <div className={cn("text-sm text-white font-medium", mono && "font-mono")}>{v}</div>
                      </div>
                    ))}
                  </>
                )}
                {([...(vedeCosti ? [["Acquisto", fmtEur(dev.purchase_price), false] as [string, string, boolean]] : []), ["Destinazione", dev.target_store || "", false], ["Grado", dev.grado_usura || "", false], ["Data Acquisto", fmtDate(dev.purchase_date), false], ["Data Reg.", fmtDate(dev.created_at), false], ["Registrato da", dev.venditore || dev.status_history.acquistato?.operatore || "—", false]] as [string, string, boolean][]).map(([l, v, mono]) => (
                  <div key={l}>
                    <div className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">{l}</div>
                    <div className={cn("text-sm text-white font-medium", mono && "font-mono")}>{v}</div>
                  </div>
                ))}
                {/* da CHI e' stato acquistato (mig. 113): link all'anagrafica */}
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Acquistato da (cliente)</div>
                  {clienteAcq ? (
                    <a href={`/clienti?id=${encodeURIComponent(clienteAcq.id)}`} className="text-sm font-medium text-blue-300 hover:text-blue-200 hover:underline">
                      {clienteAcq.nome} →
                    </a>
                  ) : (
                    <div className="text-sm text-slate-600" title={dev.client_id ? "" : "Registrato prima del collegamento anagrafica (31/07): il dato non esiste"}>—</div>
                  )}
                </div>
                {/* Prezzo di VENDITA — campo SEMPRE visibile ed editabile per
                    chi ne ha diritto (Luca 31/07: "non trovo il campo"); si
                    salva da solo uscendo dal campo */}
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Prezzo Vendita</div>
                  {puoPrezzo ? (
                    <div className="flex items-center gap-1.5">
                      <input type="number" step="1" min="0" value={salePriceVal} onChange={e => setSalePriceVal(e.target.value)}
                        onBlur={() => persist({ ...dev, sale_price: parseFloat(salePriceVal) || 0 })}
                        placeholder="es. 350"
                        className="w-24 bg-black/40 border border-emerald-500/30 rounded-lg px-2 py-1 text-sm text-emerald-400 font-bold outline-none placeholder:text-slate-600 placeholder:font-normal" />
                      <span className="text-xs text-slate-500">€</span>
                    </div>
                  ) : (
                    <div>
                      <div className="text-sm text-white font-medium">{dev.sale_price > 0 ? fmtEur(dev.sale_price) : "—"}</div>
                      <div className="text-[10px] text-slate-600">lo imposta {dev.store} (o l&apos;amministrazione)</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            {/* Extra Margine: lo vede SOLO chi l'ha generato e l'amministrazione (Luca 01/08) */}
            {dev.extra_margine && (isAmministrazione || (dev.extra_margine.venditore || "").trim().toLowerCase() === (user?.name || "").trim().toLowerCase()) && (
              <div className={cn("p-4 rounded-xl border-2", dev.extra_margine.confermato ? "bg-emerald-500/5 border-emerald-500/30" : "bg-yellow-500/5 border-yellow-500/40")}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className={cn("text-sm font-bold", dev.extra_margine.confermato ? "text-emerald-400" : "text-yellow-400")}>
                      {dev.extra_margine.confermato ? "" : ""} Extra Margine: {fmtEur(dev.extra_margine.importo)}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">Generato da: {dev.extra_margine.venditore}</div>
                    {dev.extra_margine.confermato && <div className="text-xs text-slate-500">Confermato da {dev.extra_margine.conferma_operatore} il {fmtDateTime(dev.extra_margine.conferma_date)}</div>}
                  </div>
                  {!dev.extra_margine.confermato && isAmministrazione && (
                    <button onClick={confirmExtraMargine} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-semibold hover:bg-emerald-500/25 transition-all"> Conferma Extra Margine</button>
                  )}
                </div>
              </div>
            )}
            {/* Bonifico: SOLO amministrativo in su (Luca 01/08 — prima bastava
                la capacita' costi della rotellina) */}
            {dev.pagamento.metodo === "bonifico" && isAmministrazione && (
              <div className={cn("p-4 rounded-xl border-2", dev.pagamento.bonifico_effettuato ? "bg-emerald-500/5 border-emerald-500/30" : "bg-red-500/5 border-red-500/30")}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className={cn("text-sm font-bold", dev.pagamento.bonifico_effettuato ? "text-emerald-400" : "text-red-400")}>
                      {dev.pagamento.bonifico_effettuato ? " Bonifico Effettuato" : " Bonifico Non Effettuato"}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs font-mono text-slate-400">{dev.pagamento.iban}</span>
                      <button onClick={copyIban} className="text-blue-400 hover:text-blue-300 transition-colors" title="Copia IBAN">
                        <Copy size={13} /> {ibanCopied && <span className="text-[10px] text-emerald-400 ml-1"></span>}
                      </button>
                    </div>
                    {dev.pagamento.bonifico_effettuato && dev.pagamento.bonifico_operatore && (
                      <div className="text-xs text-slate-500 mt-1"> {dev.pagamento.bonifico_operatore}   {fmtDateTime(dev.pagamento.bonifico_date)}</div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    {!dev.pagamento.bonifico_effettuato && (
                      <button onClick={toggleBonifico} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-semibold hover:bg-emerald-500/25 transition-all whitespace-nowrap"> Segna Effettuato</button>
                    )}
                    {dev.pagamento.bonifico_effettuato && (
                      <button onClick={toggleBonifico} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-500/15 text-orange-400 border border-orange-500/30 text-xs font-semibold hover:bg-orange-500/25 transition-all"> Annulla</button>
                    )}
                  </div>
                </div>
              </div>
            )}
            {/* Cost summary — solo con la capacita' costi (i costi di acquisto
                e riparazione vanno a braccetto: Luca 31/07) */}
            {vedeCosti && (
              <div className="flex gap-4 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                <div><div className="text-[10px] text-slate-500 uppercase">Costo Ricambi</div><div className="text-sm font-semibold text-orange-400">{fmtEur(totalRicambi)}</div></div>
                <div><div className="text-[10px] text-slate-500 uppercase">Margine</div><div className={cn("text-sm font-bold", salePriceVal ? (margin >= 0 ? "text-emerald-400" : "text-red-400") : "text-slate-500")}>{salePriceVal ? fmtEur(margin) : "—"}</div></div>
              </div>
            )}
            {/* Ricambi */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-bold text-white"> Ricambi ({dev.ricambi.length})</div>
                {/* i ricambi li gestisce SOLO il laboratorio (capacita' lavora_usato:
                    tecnico senior) e l'amministrazione — Luca 31/07 */}
                {(lavoraLab || isAmministrazione) && (
                  <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/30 text-xs font-semibold hover:bg-blue-500/25 transition-all">+ Aggiungi</button>
                )}
              </div>
              {(lavoraLab || isAmministrazione) && showAdd && (
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 mb-3 space-y-2">
                  <div className="flex gap-2">
                    <select value={newRicambio} onChange={e => setNewRicambio(e.target.value)}
                      className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-300 outline-none">
                      <option value="">Seleziona ricambio...</option>
                      {RICAMBI_CATALOG.filter(r => !dev.ricambi.some(x => x.name === r)).map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <button onClick={addRicambio} className="px-3 py-2 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold hover:bg-emerald-500/30 transition-all">Aggiungi</button>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                    <input type="checkbox" checked={newRicambioInMag} onChange={e => setNewRicambioInMag(e.target.checked)} className="accent-emerald-500" />
                    Presente in magazzino
                  </label>
                </div>
              )}
              {dev.ricambi.length === 0 ? (
                <div className="text-center py-4 text-sm text-slate-600 rounded-xl bg-white/[0.02] border border-white/5">Nessun ricambio richiesto</div>
              ) : dev.ricambi.map((r, i) => <RicambioRow key={i} r={r} idx={i} onUpdate={updateRicambio} onRemove={removeRicambio} puoGestire={lavoraLab || isAmministrazione} puoAmministrare={isAmministrazione} vedeCosti={vedeCosti} />)}
            </div>
            {/* Documents — visibilita' ristretta (vedi vedeDocumenti sopra) */}
            {!vedeDocumenti ? (
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/10 text-[11px] text-slate-500">
                🔒 Documenti dell&apos;acquisto riservati: {dev.status === "acquistato"
                  ? "li vede chi ha comprato il telefono, lo store manager del negozio e l'amministrazione."
                  : "dal passaggio in transito li vede solo il team amministrativo."}
              </div>
            ) : (
            <div>
              <div className="text-sm font-bold text-white mb-3"> Documenti Allegati</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { label: "Documento Identità", path: dev.allegato_documento, icon: <FileText size={16} /> },
                  { label: "Dichiarazione Vendita", path: dev.allegato_dichiarazione, icon: <FileText size={16} /> }
                ].map((doc, idx) => (
                  <div key={idx} className="flex flex-col p-3 rounded-xl bg-white/[0.02] border border-white/5 group hover:bg-white/[0.04] transition-all">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">{doc.icon}</div>
                      <div className="text-xs font-semibold text-slate-300">{doc.label}</div>
                    </div>
                    {doc.path ? (
                      <div className="flex items-center gap-2 mt-auto">
                        <button
                          onClick={() => window.open(getFileUrl(doc.path!), "_blank")}
                          className="flex-1 text-[10px] font-bold uppercase tracking-wider py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white transition-all border border-white/5"
                        >
                          Visualizza
                        </button>
                        <a
                          href={getFileUrl(doc.path!)}
                          download
                          className="px-2 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all border border-white/5"
                        >
                          <Paperclip size={12} />
                        </a>
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-600 italic mt-auto py-1.5">Nessun file presente</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            )}
            {/* Note */}
            <div>
              <div className="text-sm font-bold text-white mb-2"> Note</div>
              {(lavoraLab || isAmministrazione) ? (
                <textarea value={noteTecnico} onChange={e => setNoteTecnico(e.target.value)} rows={3} placeholder="Note tecnico / amministrazione... (si salvano da sole uscendo dal campo)"
                  onBlur={() => { if (noteTecnico !== dev.note_tecnico) persist({ ...dev, note_tecnico: noteTecnico }); }}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-300 outline-none resize-none focus:border-white/20 font-inherit" />
              ) : (
                <div className="w-full bg-black/20 border border-white/5 rounded-xl px-3 py-2 text-sm text-slate-500 min-h-[68px] whitespace-pre-wrap">{dev.note_tecnico || "—"}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

//  RegistraUsatoPanel -
function RegistraUsatoPanel({ onClose, onSave }: { onClose: () => void; onSave: (d: any) => void }) {
  const NEGOZI = useStores();
  const VENDITORI = useSellers();
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  // AUTOCOMPILAZIONE (Luca 31/07): chi e' loggato parte gia' selezionato come
  // venditore, col suo negozio — restano tendine aperte e modificabili.
  const [venditore, setVenditore] = useState(user?.name || "");
  const [negozio, setNegozio] = useState("");
  useEffect(() => {
    if (negozio || !user?.negozio || !NEGOZI.length) return;
    const mio = user.negozio;
    const match = NEGOZI.find(n => n === mio) || NEGOZI.find(n => n.startsWith(mio) || mio.startsWith(n));
    if (match) setNegozio(match);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [NEGOZI, user?.negozio]);
  const [provenienzaSubito, setProvenienzaSubito] = useState(false);
  const [tipoCliente, setTipoCliente] = useState<"consumer" | "business" | "">("");
  const [searchValue, setSearchValue] = useState("");
  const [clienteFound, setClienteFound] = useState<boolean | null>(null);
  // RICERCA INTERATTIVA come Registra Vendita (Luca 31/07): digiti CF, nome e
  // cognome, ragione sociale o numero e le anagrafiche collegate compaiono
  // sotto; ne scegli una o procedi con la creazione. L'id del cliente scelto
  // viaggia fino al salvataggio (mig. 113: prima l'anagrafica veniva persa).
  type ClienteHit = { id: string; tipo: string; nome: string | null; cognome: string | null; ragione_sociale: string | null; nome_ref: string | null; cognome_ref: string | null; cf_piva: string | null; cellulare: string | null; telefono_fisso: string | null; email: string | null; indirizzo: string | null; citta: string | null; iban: string | null };
  const [risultati, setRisultati] = useState<ClienteHit[]>([]);
  const [cercando, setCercando] = useState(false);
  const [selClientId, setSelClientId] = useState<string | null>(null);
  const [ana, setAna] = useState({ nome: "", cognome: "", cf: "", piva: "", email: "", cellulare: "", fisso: "", domicilio: "", iban: "", ragioneSociale: "", referente: "", pec: "", sdi: "", sedeLegale: "" });
  const [tipoProdotto, setTipoProdotto] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [capacita, setCapacita] = useState("");
  const [colore, setColore] = useState("");
  const [imei, setImei] = useState("");
  // Segnalazione 58: l'IMEI a 15 cifre e' obbligatorio solo per smartphone e
  // tablet; portatili e watch usano un seriale alfanumerico di lunghezza libera.
  const imeiNumerico = tipoProdotto === "smartphone" || tipoProdotto === "tablet";
  const imeiValido = imeiNumerico ? imei.length === 15 : imei.trim().length > 0;
  const [prezzoAcquisto, setPrezzoAcquisto] = useState("");
  const [gradoUsura, setGradoUsura] = useState("");
  const [hasExtraMargine, setHasExtraMargine] = useState(false);
  const [extraMargineImporto, setExtraMargineImporto] = useState("");
  const [metodoPagamento, setMetodoPagamento] = useState<"contanti" | "buono" | "bonifico" | "">("");
  const [ibanPag, setIbanPag] = useState("");
  const [tipoBonifico, setTipoBonifico] = useState<"ordinario" | "istantaneo">("ordinario");
  const [allegDoc, setAllegDoc] = useState<File | null>(null);
  const [allegDich, setAllegDich] = useState<File | null>(null);
  // ── Carica dal telefono via QR (Luca 01/08): STESSO meccanismo di Registra
  // Vendita (qr_uploads + /m/u/<token>) per documento e dichiarazione. Kind
  // "doc": foto O scansione multi-pagina unita in un unico PDF — perfetto per
  // le caselle a file singolo dell'usato.
  const [qrBox, setQrBox] = useState<"doc" | "dich" | null>(null);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [qrImg, setQrImg] = useState<string | null>(null);
  const [qrRecv, setQrRecv] = useState<{ n: number } | null>(null);
  const openQr = async (box: "doc" | "dich") => {
    try {
      const token = (window.crypto?.randomUUID?.() || (Date.now() + "-" + Math.random().toString(36).slice(2)));
      const { error } = await supabase.from("qr_uploads").insert({ token, box_type: box === "doc" ? "documento_usato" : "dichiarazione_usato", kind: "doc", status: "attesa" });
      if (error) { alert("QR non generato: " + error.message); return; }
      const url = `${window.location.origin}/m/u/${token}`;
      const img = await QRCode.toDataURL(url, { width: 240, margin: 1 });
      setQrBox(box); setQrToken(token); setQrImg(img); setQrRecv(null);
    } catch (e) { alert("QR non generato: " + ((e as Error)?.message || e)); }
  };
  const closeQr = () => { setQrBox(null); setQrToken(null); setQrImg(null); setQrRecv(null); };
  useEffect(() => {
    if (!qrToken) return;
    let alive = true;
    const t = setInterval(async () => {
      const { data } = await supabase.from("qr_uploads").select("status,files").eq("token", qrToken).maybeSingle();
      if (!alive || !data) return;
      const files = Array.isArray(data.files) ? data.files : [];
      if (data.status === "caricato" && files.length) {
        clearInterval(t);
        try {
          const f = files[0];   // casella a file singolo: pagine gia' unite dal telefono
          const resp = await fetch(f.url);
          const blob = await resp.blob();
          const file = new File([blob], f.name || "allegato", { type: f.mime || blob.type });
          if (qrBox === "doc") setAllegDoc(file); else setAllegDich(file);
          setQrRecv({ n: 1 });
        } catch (e) { alert("Ricezione file non riuscita: " + ((e as Error)?.message || e)); }
        try {
          for (const f of files) {
            const marker = "/qr-uploads/"; const i = String(f.url).indexOf(marker);
            if (i >= 0) await supabase.storage.from("qr-uploads").remove([decodeURIComponent(String(f.url).slice(i + marker.length))]);
          }
        } catch { }
        try { await supabase.from("qr_uploads").delete().eq("token", qrToken); } catch { }
        setTimeout(() => { if (alive) closeQr(); }, 1600);
      }
    }, 2000);
    return () => { alive = false; clearInterval(t); };
  }, [qrToken, qrBox]);
  const [isUploading, setIsUploading] = useState(false);

  // Ricerca LIVE sulla tabella clients (debounce 300ms): stessa esperienza del
  // Registra Vendita. Con due parole cerca nome+cognome in entrambi gli ordini.
  useEffect(() => {
    if (!tipoCliente || clienteFound !== null) { setRisultati([]); return; }
    const v = searchValue.trim().replace(/[(),]/g, " ").replace(/\s+/g, " ");
    if (v.length < 3) { setRisultati([]); return; }
    let vivo = true;
    setCercando(true);
    const t = setTimeout(async () => {
      const parole = v.split(" ").filter(Boolean);
      const cifre = v.replace(/\D/g, "");
      let q = supabase.from("clients")
        .select("id,tipo,nome,cognome,ragione_sociale,nome_ref,cognome_ref,cf_piva,cellulare,telefono_fisso,email,indirizzo,citta,iban")
        .eq("tipo", tipoCliente).limit(6);
      if (parole.length >= 2) {
        q = q.or(`and(nome.ilike.%${parole[0]}%,cognome.ilike.%${parole[1]}%),and(nome.ilike.%${parole[1]}%,cognome.ilike.%${parole[0]}%),ragione_sociale.ilike.%${v}%`);
      } else {
        q = q.or(`cf_piva.ilike.%${v}%,nome.ilike.%${v}%,cognome.ilike.%${v}%,ragione_sociale.ilike.%${v}%${cifre.length >= 4 ? `,cellulare.ilike.%${cifre}%` : ""}`);
      }
      const { data } = await q;
      if (!vivo) return;
      setRisultati((data ?? []) as ClienteHit[]);
      setCercando(false);
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [searchValue, tipoCliente, clienteFound]);

  const scegliCliente = (c: ClienteHit) => {
    setClienteFound(true);
    setSelClientId(c.id);
    setRisultati([]);
    setAna({
      ...ana,
      nome: c.nome || "", cognome: c.cognome || "", cf: c.ragione_sociale ? "" : (c.cf_piva || ""),
      email: c.email || "", cellulare: c.cellulare || "",
      domicilio: [c.indirizzo, c.citta].filter(Boolean).join(", "),
      ragioneSociale: c.ragione_sociale || "", piva: c.ragione_sociale ? (c.cf_piva || "") : "",
      // referente dal dato canonico (prima veniva AZZERATO scegliendo un cliente esistente)
      referente: [c.nome_ref || (c.ragione_sociale ? c.nome : ""), c.cognome_ref || (c.ragione_sociale ? c.cognome : "")].filter(Boolean).join(" "),
      fisso: c.telefono_fisso || "",
      pec: "", sdi: "", sedeLegale: [c.indirizzo, c.citta].filter(Boolean).join(", "), iban: c.iban || "",
    });
  };

  const canNext = () => {
    if (step === 1) return !!(venditore && negozio);
    if (step === 2) return !!(tipoCliente && clienteFound !== null) && (!ana.iban || !erroreIbanIT(ana.iban));
    // Segnalazione 58: le 15 cifre valgono SOLO per smartphone e tablet.
    // Portatili e watch hanno un seriale alfanumerico, anche piu' corto.
    if (step === 3) return !!(tipoProdotto && brand && model && capacita && colore && imeiValido && prezzoAcquisto && gradoUsura && (!hasExtraMargine || extraMargineImporto));
    // IBAN del bonifico VALIDATO (Luca 01/08): struttura IT+2 cifre+CIN e
    // 27 caratteri con verifica mod-97 — prima bastava che non fosse vuoto
    if (step === 4) return !!(metodoPagamento && (metodoPagamento !== "bonifico" || (ibanPag && !erroreIbanIT(ibanPag))));
    if (step === 5) return !!(allegDoc && allegDich);
    return false;
  };

  const uploadFile = async (file: File, folder: string) => {
    const ext = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
    const filePath = `${folder}/${fileName}`;

    const { error } = await supabase.storage
      .from("usati_attachments")
      .upload(filePath, file);

    if (error) throw error;
    return filePath;
  };

  const handleSubmit = async () => {
    setIsUploading(true);
    try {
      let docPath = null;
      let dichPath = null;

      if (allegDoc) docPath = await uploadFile(allegDoc, "documenti");
      if (allegDich) dichPath = await uploadFile(allegDich, "dichiarazioni");

      onSave({
        venditore, negozio, provenienzaSubito, tipoCliente, anagrafica: ana, clientId: selClientId,
        tipoProdotto, brand, model, capacita, colore, imei,
        prezzoAcquisto: parseFloat(prezzoAcquisto) || 0, gradoUsura, perRicambi: gradoUsura === "ricambi",
        extraMargine: hasExtraMargine ? { importo: parseFloat(extraMargineImporto) || 0, venditore } : null,
        metodoPagamento, iban: metodoPagamento === "bonifico" ? ibanPag : null,
        tipoBonifico: metodoPagamento === "bonifico" ? tipoBonifico : null,
        allegato_documento: docPath,
        allegato_dichiarazione: dichPath
      });
      onClose();
    } catch (err) {
      console.error("Upload error:", err);
      alert("Errore durante il caricamento dei file. Riprova.");
    } finally {
      setIsUploading(false);
    }
  };

  const inp = "w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-300 outline-none focus:border-white/20 transition-all";
  const lbl = "block text-xs text-slate-500 font-semibold uppercase tracking-wide mb-1.5";

  const STEP_LABELS = ["Venditore e Negozio", "Anagrafica Cliente", "Dettaglio Prodotto", "Pagamento", "Allegati"];

  const renderStep = () => {
    if (step === 1) return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div><label className={lbl}>Venditore *</label>
            <SelectPersona value={venditore} onChange={setVenditore} opzioni={VENDITORI} placeholder="Scrivi il venditore…" className={inp} />
          </div>
          {/* stessa tendina unificata delle altre sezioni (Luca 31/07) */}
          <div><label className={lbl}>Negozio *</label>
            <SelectOpzioni value={negozio} onChange={setNegozio} opzioni={NEGOZI} placeholder="Scrivi il negozio…" className={inp} />
          </div>
        </div>
        {venditore === (user?.name || "") && negozio && (
          <p className="text-[11px] text-slate-500 -mt-2">Pre-compilati dal tuo profilo: cambia pure venditore o negozio se serve.</p>
        )}
        <label className={`flex items-center gap-3 p-4 rounded-xl cursor-pointer border transition-all ${provenienzaSubito ? "bg-orange-500/10 border-orange-500/30" : "bg-white/[0.02] border-white/5 hover:border-white/10"}`}>
          <input type="checkbox" checked={provenienzaSubito} onChange={e => setProvenienzaSubito(e.target.checked)} className="accent-orange-500 w-4 h-4" />
          <span className="text-sm text-slate-300"> Provenienza da Subito.it</span>
        </label>
      </div>
    );
    if (step === 2) return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          {(["consumer", "business"] as const).map(t => (
            <div key={t} onClick={() => { setTipoCliente(t); setClienteFound(null); setSearchValue(""); }}
              className={`p-5 rounded-xl border cursor-pointer text-center transition-all ${tipoCliente === t ? "bg-purple-500/10 border-purple-500/40" : "bg-white/[0.02] border-white/5 hover:border-white/10"}`}>
              <div className="text-3xl mb-2">{t === "consumer" ? "" : ""}</div>
              <div className={`text-sm font-bold ${tipoCliente === t ? "text-purple-300" : "text-white"}`}>{t === "consumer" ? "CONSUMER" : "BUSINESS"}</div>
              <div className="text-xs text-slate-500 mt-0.5">{t === "consumer" ? "Persona fisica" : "Azienda / P.IVA"}</div>
            </div>
          ))}
        </div>
        {tipoCliente && <div className="space-y-3">
          {/* Ricerca INTERATTIVA come Registra Vendita (Luca 31/07): digiti e
              le anagrafiche collegate compaiono sotto; niente esiste = Nuovo. */}
          {clienteFound === null && (
            <>
              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input value={searchValue} onChange={e => setSearchValue(e.target.value)} autoFocus
                  placeholder={tipoCliente === "consumer" ? "Codice fiscale, nome e cognome o cellulare…" : "Partita IVA, ragione sociale o cellulare…"}
                  className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-3 py-2.5 text-sm text-slate-300 outline-none focus:border-white/20" />
              </div>
              {cercando && <div className="text-xs text-slate-500 px-1 animate-pulse">Cerco in anagrafica…</div>}
              {risultati.length > 0 && (
                <div className="space-y-1.5">
                  {risultati.map((c) => (
                    <button key={c.id} onClick={() => scegliCliente(c)}
                      className="w-full text-left p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/25 hover:bg-emerald-500/15 hover:border-emerald-500/50 transition-all">
                      <div className="text-sm font-bold text-white">{c.ragione_sociale || `${c.nome || ""} ${c.cognome || ""}`.trim() || "—"}</div>
                      <div className="text-xs text-slate-500 mt-0.5 flex gap-3 flex-wrap">
                        {c.cf_piva && <span className="font-mono">{c.cf_piva}</span>}
                        {c.cellulare && <span>📱 {c.cellulare}</span>}
                        {c.email && <span>✉️ {c.email}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {searchValue.trim().length >= 3 && !cercando && risultati.length === 0 && (
                <div className="text-xs text-slate-500 px-1">Nessuna anagrafica trovata con questi dati.</div>
              )}
              <button onClick={() => { setClienteFound(false); setSelClientId(null); setRisultati([]); }}
                className="w-full px-3 py-2.5 rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/30 text-sm font-semibold hover:bg-blue-500/25 transition-all">
                ＋ Il cliente non esiste — crea nuova anagrafica
              </button>
            </>
          )}
          {clienteFound === true && <div className="p-4 bg-emerald-500/5 border border-emerald-500/30 rounded-xl">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="text-sm text-emerald-400 font-semibold">✓ Cliente collegato dall&apos;anagrafica — dati pre-compilati</div>
              <button onClick={() => { setClienteFound(null); setSelClientId(null); setSearchValue(""); }}
                className="text-[11px] px-2 py-1 rounded-lg border border-white/15 text-slate-400 hover:text-white">↺ Cambia</button>
            </div>
            <AnaFields tipoCliente={tipoCliente} ana={ana} setAna={setAna} inp={inp} lbl={lbl} />
          </div>}
          {clienteFound === false && <div className="p-4 bg-blue-500/5 border border-blue-500/30 rounded-xl">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="text-sm text-blue-400 font-semibold">🆕 Nuovo cliente — compila i dati (nascerà in anagrafica)</div>
              <button onClick={() => { setClienteFound(null); setSearchValue(""); }}
                className="text-[11px] px-2 py-1 rounded-lg border border-white/15 text-slate-400 hover:text-white">↺ Torna alla ricerca</button>
            </div>
            <AnaFields tipoCliente={tipoCliente} ana={ana} setAna={setAna} inp={inp} lbl={lbl} />
          </div>}
        </div>}
      </div>
    );
    if (step === 3) return (
      <div className="space-y-5">
        <div>
          <label className={lbl}>Tipo Prodotto *</label>
          <div className="grid grid-cols-4 gap-3">
            {TIPO_PRODOTTO.map(t => (
              <div key={t.key} onClick={() => setTipoProdotto(t.key)}
                className={`p-4 rounded-xl border cursor-pointer text-center transition-all ${tipoProdotto === t.key ? "bg-purple-500/10 border-purple-500/40" : "bg-white/[0.02] border-white/5 hover:border-white/10"}`}>
                <t.Icon className={`mx-auto mb-2 ${tipoProdotto === t.key ? "text-purple-400" : "text-slate-400"}`} size={28} />
                <div className={`text-xs font-bold ${tipoProdotto === t.key ? "text-purple-300" : "text-slate-300"}`}>{t.label}</div>
              </div>
            ))}
          </div>
        </div>
        {tipoProdotto && <>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={lbl}>Brand *</label>
              <select value={brand} onChange={e => { setBrand(e.target.value); setModel(""); }} className={inp}>
                <option value="">Seleziona brand...</option>
                {Object.keys(PHONE_BRANDS_MODELS).map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div><label className={lbl}>Modello *</label>
              <select value={model} onChange={e => setModel(e.target.value)} disabled={!brand} className={inp}>
                <option value="">Seleziona modello...</option>
                {brand && PHONE_BRANDS_MODELS[brand]?.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div><label className={lbl}>Capacit� *</label>
              <select value={capacita} onChange={e => setCapacita(e.target.value)} className={inp}>
                <option value="">Seleziona...</option>
                {CAPACITA_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div><label className={lbl}>Colore *</label>
              <select value={colore} onChange={e => setColore(e.target.value)} className={inp}>
                <option value="">Seleziona...</option>
                {COLORI_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div><label className={lbl}>{imeiNumerico ? "IMEI *" : "Seriale *"}</label>
              {/* Segnalazione 58: le 15 cifre valgono SOLO per smartphone e tablet
                  (bordo rosso finche' non sono 15, impossibile inserirne di piu' o
                  non numerici). Portatili e watch: seriale alfanumerico libero. */}
              <input value={imei} inputMode={imeiNumerico ? "numeric" : "text"}
                onChange={e => setImei(imeiNumerico ? e.target.value.replace(/\D/g, "").slice(0, 15) : e.target.value)}
                placeholder={imeiNumerico ? "353456789012345" : "Seriale del dispositivo"}
                className={inp + (imeiNumerico && imei && imei.length !== 15 ? " !border-rose-500" : "")} />
              {imeiNumerico && imei && imei.length !== 15 && <p className="text-[10px] text-rose-400 mt-1">IMEI: {imei.length}/15 cifre</p>}
            </div>
            <div><label className={lbl}>Prezzo Acquisto () *</label>
              <input type="number" step="1" min="0" value={prezzoAcquisto} onChange={e => setPrezzoAcquisto(e.target.value)} placeholder="es. 250" className={inp} />
            </div>
          </div>
          <div>
            <label className={lbl}>Grado di Usura *</label>
            <div className="grid grid-cols-2 gap-2">
              {GRADI_USURA.map(g => (
                <div key={g.key} onClick={() => setGradoUsura(g.key)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${gradoUsura === g.key ? "bg-purple-500/10 border-purple-500/40" : "bg-white/[0.02] border-white/5 hover:border-white/10"}`}>
                  <div className={`text-xs font-bold ${gradoUsura === g.key ? "text-purple-300" : "text-slate-300"}`}>{g.label}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{g.desc}</div>
                </div>
              ))}
            </div>
          </div>
          <label className={`flex items-center gap-3 p-4 rounded-xl cursor-pointer border transition-all ${hasExtraMargine ? "bg-yellow-500/10 border-yellow-500/30" : "bg-white/[0.02] border-white/5"}`}>
            <input type="checkbox" checked={hasExtraMargine} onChange={e => setHasExtraMargine(e.target.checked)} className="accent-yellow-500 w-4 h-4" />
            <span className="text-sm text-slate-300"> Extra Margine</span>
          </label>
          {hasExtraMargine && <div className="flex items-center gap-3">
            <label className={lbl + " mb-0 whitespace-nowrap"}>Importo Extra Margine () *</label>
            <input type="number" step="1" min="0" value={extraMargineImporto} onChange={e => setExtraMargineImporto(e.target.value)} placeholder="es. 30" className="w-32 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-300 outline-none" />
          </div>}
        </>}
      </div>
    );
    if (step === 4) return (
      <div className="space-y-5">
        <div className="text-sm font-bold text-white mb-2"> Metodo di Pagamento</div>
        <div className="grid grid-cols-3 gap-3">
          {([{ key: "contanti", label: "Contanti", icon: "" }, { key: "buono", label: "Buono", icon: "" }, { key: "bonifico", label: "Bonifico", icon: "" }] as const).map(m => (
            <div key={m.key} onClick={() => setMetodoPagamento(m.key)}
              className={`p-5 rounded-xl border cursor-pointer text-center transition-all ${metodoPagamento === m.key ? "bg-purple-500/10 border-purple-500/40" : "bg-white/[0.02] border-white/5 hover:border-white/10"}`}>
              <div className="text-3xl mb-2">{m.icon}</div>
              <div className={`text-sm font-bold ${metodoPagamento === m.key ? "text-purple-300" : "text-white"}`}>{m.label}</div>
            </div>
          ))}
        </div>
        {metodoPagamento === "bonifico" && (
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Tipologia bonifico</div>
            <div className="grid grid-cols-2 gap-3">
              {([["ordinario", "Ordinario", "il bonifico segue i tempi normali"], ["istantaneo", "🚨 Istantaneo", "SOLO PER URGENZE: costa di più e avvisa subito l'incaricato"]] as const).map(([k, lab, desc]) => (
                <div key={k} onClick={() => setTipoBonifico(k)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${tipoBonifico === k ? (k === "istantaneo" ? "bg-amber-500/10 border-amber-500/50" : "bg-purple-500/10 border-purple-500/40") : "bg-white/[0.02] border-white/5 hover:border-white/10"}`}>
                  <div className={`text-sm font-bold ${tipoBonifico === k ? (k === "istantaneo" ? "text-amber-300" : "text-purple-300") : "text-white"}`}>{lab}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{desc}</div>
                </div>
              ))}
            </div>
            {tipoBonifico === "istantaneo" && (
              <p className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2">
                ⚠️ L&apos;istantaneo è riservato alle URGENZE: è più costoso per l&apos;azienda. L&apos;incaricato riceve subito il task ⚡ e un messaggio WhatsApp.
              </p>
            )}
          </div>
        )}
        {metodoPagamento === "bonifico" && <div>
          <label className={lbl}>IBAN * <span className="normal-case font-normal text-slate-500">(IT + 2 cifre + lettera, 27 caratteri)</span></label>
          <div className="flex gap-2">
            <input value={ibanPag} onChange={e => setIbanPag(normalizzaIban(e.target.value))} placeholder="IT60X0542811101000000123456" className={inp + " flex-1 font-mono"} />
            {ana.iban && <button onClick={() => setIbanPag(normalizzaIban(ana.iban))} className="px-3 py-2 rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/30 text-xs font-semibold hover:bg-blue-500/25 transition-all whitespace-nowrap"> Copia IBAN da anagrafica</button>}
          </div>
          {!!ibanPag && !!erroreIbanIT(ibanPag) && <p className="text-[11px] text-rose-400 font-semibold mt-1.5">⚠ {erroreIbanIT(ibanPag)}</p>}
        </div>}
      </div>
    );
    if (step === 5) return (
      <div className="space-y-5">
        {qrBox && createPortal(<div onClick={closeQr} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#11141d", border: "1px solid rgba(255,255,255,.08)", borderRadius: 16, width: "100%", maxWidth: 360, padding: 24, margin: "0 16px", textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: "#f8fafc" }}>📱 Carica dal telefono</div>
              <button onClick={closeQr} style={{ background: "none", border: "none", color: "#94a3b8", fontSize: 18, cursor: "pointer" }}>✕</button>
            </div>
            {qrRecv ? (
              <div style={{ padding: "22px 0" }}><div style={{ fontSize: 48, marginBottom: 8 }}>✅</div><div style={{ fontSize: 16, fontWeight: 800, color: "#34d399" }}>Ricevuto!</div><div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>File agganciato alla casella.</div></div>
            ) : (<>
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 14 }}>Inquadra il QR con la fotocamera del telefono e carica {qrBox === "doc" ? "il documento d'identità" : "la dichiarazione firmata"} — foto o scansione: più pagine vengono unite in un unico PDF.</div>
              {qrImg ? <img src={qrImg} alt="QR" style={{ width: 216, height: 216, borderRadius: 12, background: "#fff", padding: 8, boxSizing: "border-box", display: "block", margin: "0 auto" }} /> : <div style={{ width: 216, height: 216, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>Genero…</div>}
              <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 4, background: "#f59e0b", display: "inline-block" }} />In attesa della scansione…</div>
            </>)}
          </div>
        </div>, document.body)}
        {[
          { key: "doc", label: "Documento di Identità *", val: allegDoc, set: setAllegDoc },
          { key: "dich", label: "Dichiarazione di Vendita (firmata) *", val: allegDich, set: setAllegDich }
        ].map(f => (
          <div key={f.key}>
            <div className="flex items-center justify-between mb-1">
              <label className={lbl + " !mb-0"}>{f.label}</label>
              <button type="button" onClick={() => openQr(f.key as "doc" | "dich")}
                className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/25 transition-all">
                📱 Carica dal telefono
              </button>
            </div>
            <div className={`relative border-2 border-dashed rounded-xl transition-all ${f.val ? "bg-emerald-500/5 border-emerald-500/40" : "bg-white/[0.01] border-white/10 hover:border-white/20"}`}>
              <input
                type="file"
                accept="application/pdf,image/*"
                onChange={e => { f.set(e.target.files?.[0] || null); e.target.value = ""; }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className="p-8 text-center">
                {f.val ? (
                  <>
                    <div className="text-3xl mb-2">📄</div>
                    <div className="text-sm text-emerald-400 font-semibold">File selezionato</div>
                    <div className="text-xs text-slate-500 mt-1 truncate max-w-xs mx-auto">{f.val.name}</div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); f.set(null); }}
                      className="mt-2 text-[10px] text-rose-400 hover:text-rose-300 relative z-20"
                    >
                      Rimuovi
                    </button>
                  </>
                ) : (
                  <>
                    <div className="text-3xl mb-2"><UploadCloud className="mx-auto w-10 h-10 text-slate-600" /></div>
                    <div className="text-sm text-slate-500">Clicca per caricare</div>
                    <div className="text-xs text-slate-600 mt-1">PDF, JPG, PNG</div>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
        {isUploading && (
          <div className="text-center py-2">
            <div className="text-xs text-purple-400 animate-pulse font-bold">Caricamento in corso...</div>
          </div>
        )}
      </div>
    );
    return null;
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-start justify-center pt-6 px-4" onClick={onClose}>
      <div className="bg-[#12141f] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-[#12141f] border-b border-white/10 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <div className="text-lg font-bold text-white"> Registra Usato</div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl transition-colors"></button>
        </div>
        {/* Step dots */}
        <div className="flex items-center justify-center gap-2 px-6 py-4 border-b border-white/5">
          {STEP_LABELS.map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              {i > 0 && <div className={`w-8 h-px ${step > i ? "bg-purple-500" : "bg-white/10"}`} />}
              <div className="flex items-center gap-1.5">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 ${step >= i + 1 ? "bg-purple-500/20 border-purple-500 text-purple-300" : "bg-transparent border-white/10 text-slate-600"}`}>
                  {step > i + 1 ? "" : i + 1}
                </div>
                <span className={`text-[11px] whitespace-nowrap ${step === i + 1 ? "text-white font-bold" : step > i + 1 ? "text-slate-400" : "text-slate-600"}`}>{label}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="p-6">{renderStep()}</div>
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/5">
          <div>{step > 1 && <button onClick={() => setStep(step - 1)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 text-slate-400 border border-white/10 text-sm font-semibold hover:bg-white/10 transition-all"><ArrowLeft size={14} /> Indietro</button>}</div>
          <div>{step < 5 ?
            <button onClick={() => canNext() && setStep(step + 1)} className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${canNext() ? "bg-purple-500/20 text-purple-300 border border-purple-500/40 hover:bg-purple-500/30" : "bg-white/5 text-slate-600 border border-white/5 cursor-not-allowed"}`}>Avanti <ArrowRight size={14} /></button> :
            <button onClick={() => canNext() && handleSubmit()} className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${canNext() ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30" : "bg-white/5 text-slate-600 border border-white/5 cursor-not-allowed"}`}> Registra Usato</button>
          }</div>
        </div>
      </div>
    </div>
  );
}

//  AnaFields sub-component (used in wizard step 2) 
function AnaFields({ tipoCliente, ana, setAna, inp, lbl }: any) {
  if (tipoCliente === "consumer") return (
    <div className="grid grid-cols-2 gap-3">
      <div><label className={lbl}>Nome *</label><input value={ana.nome} onChange={e => setAna({ ...ana, nome: e.target.value })} placeholder="Mario" className={inp} /></div>
      <div><label className={lbl}>Cognome *</label><input value={ana.cognome} onChange={e => setAna({ ...ana, cognome: e.target.value })} placeholder="Rossi" className={inp} /></div>
      <div><label className={lbl}>Codice Fiscale *</label><input value={ana.cf} onChange={e => setAna({ ...ana, cf: e.target.value })} placeholder="RSSMRA80A01H501U" className={inp} /></div>
      <div><label className={lbl}>Email</label><input value={ana.email} onChange={e => setAna({ ...ana, email: e.target.value })} className={inp} /></div>
      <div><label className={lbl}>Cellulare</label><input value={ana.cellulare} onChange={e => setAna({ ...ana, cellulare: e.target.value })} className={inp} /></div>
      <div><label className={lbl}>Domicilio</label><IndirizzoAutocomplete value={ana.domicilio} onChange={v => setAna({ ...ana, domicilio: v })} onPick={s => setAna({ ...ana, domicilio: s.completo })} className={inp} placeholder="Via e civico: scegli dalla lista" /></div>
      <div className="col-span-2"><label className={lbl}>IBAN</label><input value={ana.iban} onChange={e => setAna({ ...ana, iban: normalizzaIban(e.target.value) })} placeholder="IT60X0542811101000000123456" className={inp + " font-mono"} />{!!ana.iban && !!erroreIbanIT(ana.iban) && <p className="text-[11px] text-rose-400 font-semibold mt-1">⚠ {erroreIbanIT(ana.iban)}</p>}</div>
    </div>
  );
  return (
    <div className="grid grid-cols-2 gap-3">
      <div><label className={lbl}>Ragione Sociale *</label><input value={ana.ragioneSociale} onChange={e => setAna({ ...ana, ragioneSociale: e.target.value })} className={inp} /></div>
      <div><label className={lbl}>Partita IVA *</label><input value={ana.piva} onChange={e => setAna({ ...ana, piva: e.target.value })} className={inp} /></div>
      <div><label className={lbl}>Referente *</label><input value={ana.referente} onChange={e => setAna({ ...ana, referente: e.target.value })} className={inp} /></div>
      <div><label className={lbl}>Telefono fisso</label><input value={ana.fisso} onChange={e => setAna({ ...ana, fisso: e.target.value.replace(/\D/g, "").slice(0, 11) })} className={inp} placeholder="facoltativo" /></div>
      <div><label className={lbl}>Cellulare</label><input value={ana.cellulare} onChange={e => setAna({ ...ana, cellulare: e.target.value })} className={inp} /></div>
      <div><label className={lbl}>Email</label><input value={ana.email} onChange={e => setAna({ ...ana, email: e.target.value })} className={inp} /></div>
      <div><label className={lbl}>PEC</label><input value={ana.pec} onChange={e => setAna({ ...ana, pec: e.target.value })} className={inp} /></div>
      <div><label className={lbl}>Codice Univoco / SDI</label><input value={ana.sdi} onChange={e => setAna({ ...ana, sdi: e.target.value })} className={inp} /></div>
      <div><label className={lbl}>Sede Legale</label><IndirizzoAutocomplete value={ana.sedeLegale} onChange={v => setAna({ ...ana, sedeLegale: v })} onPick={s => setAna({ ...ana, sedeLegale: s.completo })} className={inp} placeholder="Via e civico: scegli dalla lista" /></div>
      <div className="col-span-2"><label className={lbl}>IBAN</label><input value={ana.iban} onChange={e => setAna({ ...ana, iban: normalizzaIban(e.target.value) })} placeholder="IT60X0542811101000000123456" className={inp + " font-mono"} />{!!ana.iban && !!erroreIbanIT(ana.iban) && <p className="text-[11px] text-rose-400 font-semibold mt-1">⚠ {erroreIbanIT(ana.iban)}</p>}</div>
    </div>
  );
}

//  Main Page -
function GestioneUsatiInner() {
  const { user } = useAuth();
  const NEGOZI = useStores();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { perms: permsMain } = useRolePermissions(user?.role);
  // capacita' COSTI (Luca 31/07): senza, il prezzo di acquisto sparisce da
  // tabella, card mobile e bonifici (che espongono gli importi)
  const vedeCosti = capAllowed(user?.role, CAP_USATO.section, CAP_USATO_COSTI, permsMain);
  const vedeMalus = capAllowed(user?.role, CAP_USATO.section, CAP_USATO_MALUS, permsMain) && (user?.role !== "tecnico" || user?.grade === "tecnico_senior");
  const puoCompensare = RUOLI_SEMPRE.includes(user?.role || "");
  // episodi malus del laboratorio: sincronizzati a ogni load (stile PDA)
  const [episodiMalus, setEpisodiMalus] = useState<EpisodioUsato[]>([]);
  const [showMalus, setShowMalus] = useState(false);
  // REGOLE dentro la sezione (Luca 31/07: come il tracking PDA, non in
  // Amministrazione) — modificabili solo dall'admin
  const puoRegole = ["admin", "dev"].includes(user?.role || "");
  const [showRegole, setShowRegole] = useState(false);
  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  const isAmminMain = RUOLI_SEMPRE.includes(user?.role || "");
  // stati di APERTURA per ruolo (Luca 01/08): amministrazione senza filtri,
  // punti vendita col preset acquistato / arrivo in negozio / in vendita
  const STATI_NEGOZIO_DEFAULT = ["acquistato", "invio_in_negozio", "in_vendita"];
  const STATI_MAGAZZINO = ["in_transito", "ricevuto", "in_lavorazione", "pronto"];
  // amministrazione: tutto TRANNE i venduti (Luca 01/08: la tabella col
  // tempo si sporcherebbe) — si accendono dalla tessera quando servono
  const PRESET_STATI = isAmminMain ? STATUS_KEYS.filter(k => k !== 'venduto' && k !== 'ko') : [...STATI_NEGOZIO_DEFAULT];
  const filtriCompleti = ["direttore_commerciale", "direttore_generale", "amministrativo", "admin", "dev"].includes(user?.role || "");
  // "i miei" = TUTTI i negozi visibili dell'utente (user_stores + visibilita' +
  // primary, es. Emanuele su entrambe le Magliana) ESPANSI alla sede fisica:
  // i gemelli condividono il magazzino, quindi contano come uno.
  const { stores: visStores, loaded: visLoaded } = useVisibleStores();
  // il laboratorio DEVE vedere gli in transito anche su "i miei": firma gli arrivi
  const lavoraLabMain = capAllowed(user?.role, CAP_USATO.section, CAP_USATO_LAVORA, permsMain) && (user?.role !== "tecnico" || user?.grade === "tecnico_senior");
  const mieiMatch = useCallback(() => {
    const miei = visStores.length ? visStores : (user?.negozio ? [user.negozio] : []);
    const match = NEGOZI.filter(n => miei.some(m => stessoMagazzino(n, m)));
    return match.length ? match : [...NEGOZI];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [NEGOZI, visStores, user?.negozio]);
  // ALL'APERTURA (Luca 31/07): "Mostra i miei" preselezionato per TUTTI i
  // ruoli — chi non ha un negozio assegnato (direzione/amministrazione senza
  // sede) parte comunque con tutti i punti vendita, non avendo un "suo".
  const storesInit = useRef(false);
  useEffect(() => {
    // senza aspettare visLoaded il preset si calcolava su una lista di negozi
    // visibili ancora VUOTA e l'apertura ricadeva su "Mostra tutti" (Luca 01/08)
    if (storesInit.current || !NEGOZI.length || !user || !visLoaded) return;
    storesInit.current = true;
    if (isAmminMain) { setSelectedStores([...NEGOZI]); setSelectedStatuses([...STATUS_KEYS]); }
    else setSelectedStores(mieiMatch());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [NEGOZI, user, visLoaded, mieiMatch, isAmminMain]);
  const mostraImiei = () => setSelectedStores(mieiMatch());
  const firma = (a: string[]) => JSON.stringify([...a].sort());
  const mieiAttivo = !!user?.negozio && firma(selectedStores) === firma(mieiMatch());
  const tuttiAttivo = NEGOZI.length > 0 && selectedStores.length === NEGOZI.length;
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([...STATI_NEGOZIO_DEFAULT]);
  // AMMINISTRAZIONE: vista "ricambi da prezzare" — righe con ricambi usati
  // dal tecnico ma senza prezzo (il tecnico non puo' inserirlo); bypassa il
  // filtro stato perche' quei telefoni vivono nella pipeline laboratorio
  const [soloDaPrezzare, setSoloDaPrezzare] = useState(false);
  const [dateField, setDateField] = useState("created_at");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchText, setSearchText] = useState("");
  // FILTRI PER TUTTI (Luca 31/07): brand, modello/IMEI e fascia di prezzo —
  // prima esistevano solo la ricerca generica riservata alla direzione
  const [brandFilter, setBrandFilter] = useState<string[]>([]);
  const [prezzoDa, setPrezzoDa] = useState("");
  const [prezzoA, setPrezzoA] = useState("");
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [showRegistra, setShowRegistra] = useState(false);
  const [sortKey, setSortKey] = useState<keyof Device | "">("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [ricambiFilter, setRicambiFilter] = useState<string[]>([]);
  const [activeKpi, setActiveKpi] = useState<string | null>(null);
  // pannello BONIFICI (al posto del filtro) + deep-link ?id= dai task ⚡
  const [showBonifici, setShowBonifici] = useState(false);
  // SWITCH unico (Luca 31/07): da effettuare / fatti / entrambi — niente due
  // sezioni; filtri ed export valgono su cio' che lo switch mostra. All'apertura
  // riparte sempre dai DA EFFETTUARE.
  const [bonVista, setBonVista] = useState<"da_fare" | "fatti" | "entrambi">("da_fare");
  // FILTRI bonifici (Luca 31/07): email, IBAN, nome cliente, negozio, periodo
  // — valgono sui DA FARE e sui FATTI; export CSV sui filtrati
  const [bonNome, setBonNome] = useState("");
  const [bonEmail, setBonEmail] = useState("");
  const [bonIban, setBonIban] = useState("");
  const [bonNegozio, setBonNegozio] = useState("");
  const [bonDa, setBonDa] = useState("");
  const [bonA, setBonA] = useState("");
  // anagrafiche dei venditori-clienti (mig. 113): nome ed email nelle righe
  const [bonClienti, setBonClienti] = useState<Record<string, { nome: string; email: string }>>({});
  useEffect(() => {
    if (!showBonifici) return;
    const ids = [...new Set(devices.filter(d => d.pagamento?.metodo === "bonifico" && d.client_id).map(d => d.client_id!))];
    if (!ids.length) { setBonClienti({}); return; }
    supabase.from("clients").select("id,nome,cognome,ragione_sociale,email").in("id", ids)
      .then(({ data }) => {
        const m: Record<string, { nome: string; email: string }> = {};
        (data ?? []).forEach((c: { id: string; nome: string | null; cognome: string | null; ragione_sociale: string | null; email: string | null }) => {
          m[c.id] = { nome: c.ragione_sociale || `${c.nome || ""} ${c.cognome || ""}`.trim(), email: c.email || "" };
        });
        setBonClienti(m);
      });
  }, [showBonifici, devices]);
  const searchParams = useSearchParams();
  const _deepDone = useRef(false);
  useEffect(() => {
    const id = searchParams.get("id");
    if (!id || _deepDone.current || !devices.length) return;
    const d = devices.find(x => String(x.id) === String(id));
    if (d) { _deepDone.current = true; setSelectedDevice(d); }
  }, [devices, searchParams]);

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: e } = await supabase.from("usati").select("*").order("created_at", { ascending: false });
    setLoading(false);
    if (e) {
      setError(e.message);
      setDevices([]);
      return;
    }
    setDevices((data || []).map((r) => rowToDevice(r as UsatiRow)));
  }, []);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  // SINCRONIZZA gli episodi malus (best-effort): ricostruzione deterministica
  // da cronologia + ricambi, upsert in usati_malus; i compensati non si toccano
  useEffect(() => {
    if (!vedeMalus || !devices.length) return;
    let vivo = true;
    (async () => {
      const regole = await caricaRegoleUsato();
      const eps = await sincronizzaMalusUsato(devices, regole);
      if (vivo) setEpisodiMalus(eps);
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vedeMalus, devices]);

  const RICAMBIO_STATE_KEYS = RICAMBIO_STATES.map(s => s.key);

  // predicato condiviso: conStato=false lo usano i riquadri Inventario/Vetrina,
  // che hanno gia' il LORO stato e devono seguire tutti gli altri filtri
  const ricambiDaPrezzare = useCallback((d: Device) =>
    d.ricambi.some(r => !r.cost || r.cost <= 0) && !["venduto", "ko"].includes(d.status), []);
  const passaFiltri = useCallback((d: Device, conStato = true) => {
    // nelle fasi di lavorazione il telefono e' del LABORATORIO, non di un
    // negozio (Luca 01/08 sera): il filtro negozi non lo vincola — entra ed
    // esce solo con gli stati (chip o "Mostra magazzino")
    if (!inLaboratorio(d) && !selectedStores.includes(d.store)) return false;
    // vista amministrazione "ricambi da prezzare": ignora il filtro stato
    // (quei telefoni stanno in laboratorio) e mostra solo chi ha ricambi
    // senza prezzo (Luca 01/08)
    if (soloDaPrezzare) return ricambiDaPrezzare(d);
    if (conStato && !selectedStatuses.includes(d.status)) return false;
    if (dateFrom) { const v = d[dateField as keyof Device] as Date | null; if (!v || isoDate(v) < dateFrom) return false; }
    if (dateTo) { const v = d[dateField as keyof Device] as Date | null; if (!v || isoDate(v) > dateTo) return false; }
    if (searchText) { const q = searchText.toLowerCase(); if (!d.model.toLowerCase().includes(q) && !d.imei.includes(q)) return false; }
    if (brandFilter.length > 0 && !brandFilter.some(b => d.model.startsWith(b))) return false;
    if (prezzoDa && (d.sale_price || 0) < (parseFloat(prezzoDa) || 0)) return false;
    if (prezzoA && (d.sale_price || 0) > (parseFloat(prezzoA) || Infinity)) return false;
    if (ricambiFilter.length > 0) { if (!d.ricambi.some(r => ricambiFilter.includes(r.stato))) return false; }
    return true;
  }, [selectedStores, selectedStatuses, dateField, dateFrom, dateTo, searchText, brandFilter, prezzoDa, prezzoA, ricambiFilter, mieiAttivo, lavoraLabMain, soloDaPrezzare, ricambiDaPrezzare]);
  const filtered = useMemo(() => devices.filter(d => passaFiltri(d)), [devices, passaFiltri]);

  // ── INVENTARIO e VETRINA (Luca 31/07): due contatori VERI, sul filtrato.
  // Inventario = telefoni FERMI (non in vendita, non venduti/ko); Vetrina =
  // pronti alla vendita (in_vendita). Seguono negozio/brand/prezzo/ricerca:
  // lo SM di Donna Olimpia parte col SUO dato, con "Mostra tutti" ha il
  // globale. Valore inventario: prezzo vendita se impostato, altrimenti il
  // costo d'acquisto — ma SOLO per chi ha la capacita' costi (niente fughe).
  const STATI_FERMI: UsatoStatus[] = ["acquistato", "in_transito", "ricevuto", "in_lavorazione", "pronto", "invio_in_negozio"];
  const inventarioList = useMemo(() => devices.filter(d => passaFiltri(d, false) && STATI_FERMI.includes(d.status)), [devices, passaFiltri]); // eslint-disable-line react-hooks/exhaustive-deps
  const vetrinaList = useMemo(() => devices.filter(d => passaFiltri(d, false) && d.status === "in_vendita"), [devices, passaFiltri]);
  const inventoryValue = useMemo(() => inventarioList.reduce((s, d) => s + (d.sale_price > 0 ? d.sale_price : (vedeCosti ? d.purchase_price : 0)), 0), [inventarioList, vedeCosti]);
  const vetrinaValue = useMemo(() => vetrinaList.reduce((s, d) => s + d.sale_price, 0), [vetrinaList]);

  // Luca 01/08 sera: i numeri contavano sul FILTRATO, quindi con il preset
  // "venduto" segnava 0 pur avendone; ora contano su tutti i filtri TRANNE
  // lo stato (stessa logica delle tessere brand di Ricerca Vendite)
  const kpiBase = useMemo(() => devices.filter(d => passaFiltri(d, false)), [devices, passaFiltri]);
  const kpiData = useMemo(() => {
    const c: Record<string, number> = {};
    STATUS_KEYS.forEach(k => c[k] = 0);
    kpiBase.forEach(d => { c[d.status] = (c[d.status] || 0) + 1; });
    c._all = kpiBase.filter(d => !["venduto", "ko", "smontato"].includes(d.status)).length;
    return c;
  }, [kpiBase]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    if (!sortKey) return 0;
    let va: any = a[sortKey as keyof Device], vb: any = b[sortKey as keyof Device];
    if (va instanceof Date) va = va.getTime(); if (vb instanceof Date) vb = vb.getTime();
    if (va == null) return 1; if (vb == null) return -1;
    const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb));
    return sortDir === "asc" ? cmp : -cmp;
  }), [filtered, sortKey, sortDir]);

  const doSort = (key: string) => { if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortKey(key as keyof Device); setSortDir("asc"); } };
  const arrow = (key: string) => sortKey === key ? (sortDir === "asc" ? " " : " ") : "";

  const handleKpiClick = (sk: string) => {
    // tessera = interruttore del suo stato (come le tessere brand di Ricerca
    // Vendite); Totale = tutti gli stati, secondo click = torna al preset
    if (sk === "_all") {
      const tutti = selectedStatuses.length === STATUS_KEYS.length;
      setSelectedStatuses(tutti ? [...PRESET_STATI] : [...STATUS_KEYS]);
    } else {
      setSelectedStatuses(p => p.includes(sk) ? p.filter(x => x !== sk) : [...p, sk]);
    }
  };

  const resetFilters = () => { setSelectedStores(isAmminMain ? [...NEGOZI] : mieiMatch()); setSelectedStatuses([...PRESET_STATI]); setSoloDaPrezzare(false); setDateField("created_at"); setDateFrom(""); setDateTo(""); setSearchText(""); setBrandFilter([]); setPrezzoDa(""); setPrezzoA(""); setRicambiFilter([]); setActiveKpi(null); };

  const handleSaveDevice = useCallback(async (u: Device) => {
    const row = deviceToRow(u);
    const prima = devices.find(d => d.id === u.id);
    let { error: e } = await supabase.from("usati").update(row).eq("id", u.id);
    if (e && /column/i.test(e.message)) {
      // mig. 117 non ancora applicata: si salva senza il prezzo di vendita effettivo
      const { sold_price: _sp, ...legacy } = row; void _sp;
      ({ error: e } = await supabase.from("usati").update(legacy).eq("id", u.id));
    }
    if (!e) setDevices(p => p.map(d => d.id === u.id ? u : d));
    // ── RICAMBI DA ORDINARE (Luca 29/07): task ⚡ ai designati dell'incarico
    //    per ogni ricambio NUOVO in stato "da ordinare" (non già segnalato) ──
    if (!e) {
      try {
        const eraDaOrdinare = new Set((prima?.ricambi ?? []).filter(r => r.stato === "da_ordinare").map(r => r.name));
        const nuovi = u.ricambi.filter(r => r.stato === "da_ordinare" && !eraDaOrdinare.has(r.name));
        if (nuovi.length) {
          const { data: inc } = await supabase.from("incarichi").select("assegnatari,fulmine").eq("chiave", "ricambi").maybeSingle();
          const ass = (inc?.assegnatari ?? []) as string[];
          if (ass.length && inc?.fulmine) {
            await supabase.from("admin_tasks").insert(ass.map((uid) => ({
              tipo: "ricambio_da_ordinare",
              titolo: `🔧 Ricambi da ordinare: ${u.model} — ${nuovi.map(r => r.name).join(", ")}`,
              dettaglio: `${u.store} · IMEI ${u.imei}. Apri la scheda del telefono per i dettagli.`,
              link: `/usati?id=${u.id}`,
              target_role: "admin", created_by: user?.name || "—", target_user_id: uid,
            })));
          }
        }
      } catch { /* best-effort */ }
    }
  }, [devices, user?.name]);

  const handleRegistra = useCallback(async (data: {
    venditore: string; negozio: string; tipoCliente?: string; anagrafica?: unknown; clientId?: string | null;
    tipoProdotto?: string; brand?: string; model?: string; capacita?: string; colore?: string;
    imei: string; prezzoAcquisto: number; gradoUsura: string; perRicambi?: boolean; extraMargine?: { importo: number; venditore: string };
    metodoPagamento: "contanti" | "buono" | "bonifico"; iban?: string; tipoBonifico?: "ordinario" | "istantaneo" | null; provenienzaSubito?: boolean;
    allegato_documento?: string | null; allegato_dichiarazione?: string | null;
  }) => {
    const modelName = [data.brand, data.model].filter(Boolean).join(" ") || "Modello non specificato";
    const now = new Date();
    // ── CLIENTE: find-or-create (mig. 113) — prima l'anagrafica raccolta al
    // passo 2 veniva BUTTATA VIA. Il cliente scelto in ricerca arriva con l'id;
    // quello nuovo nasce in clients con attribuzione (creato_da = venditore,
    // acquisito_da = negozio). L'usato si registra comunque anche se il
    // cliente fallisce: meglio un telefono senza aggancio che nessun telefono.
    let clientId: string | null = data.clientId || null;
    try {
      const anaD = (data.anagrafica ?? {}) as Record<string, string>;
      const isBus = data.tipoCliente === "business";
      const idf = String((isBus ? anaD.piva : anaD.cf) || "").trim().toUpperCase();
      if (!clientId && idf) {
        const { data: ex } = await supabase.from("clients").select("id").ilike("cf_piva", idf).limit(1);
        if (ex?.length) clientId = ex[0].id as string;
      }
      if (!clientId && (idf || anaD.nome || anaD.ragioneSociale)) {
        const payloadCli: Record<string, unknown> = {
          id: `CL-${(idf || numeroNazionale(anaD.cellulare) || "ND").replace(/\s/g, "")}-${Date.now()}`,
          tipo: isBus ? "business" : "consumer",
          cf_piva: idf || null,
          nome: anaD.nome || "", cognome: anaD.cognome || "",
          ragione_sociale: anaD.ragioneSociale || "",
          nome_ref: isBus ? (anaD.referente || "") : "", cognome_ref: "",
          cellulare: numeroNazionale(anaD.cellulare) || "",
          telefono_fisso: isBus ? (anaD.fisso || null) : null,
          email: anaD.email || "",
          indirizzo: (isBus ? anaD.sedeLegale : anaD.domicilio) || "", cap: "", citta: "",
          iban: anaD.iban || "",
          data_nascita: isBus ? null : dataNascitaDaCF(idf),
          is_demo: false,
          creato_da: data.venditore || "",
          acquisito_da: data.negozio || null,
        };
        const { data: nuovo, error: eCli } = await supabase.from("clients").insert(payloadCli).select("id").single();
        if (!eCli && nuovo?.id) clientId = nuovo.id as string;
      }
    } catch { /* best-effort */ }
    const insertRow = {
      client_id: clientId,
      venditore: data.venditore || "",
      model: modelName,
      imei: data.imei,
      status: "acquistato",
      sale_price: 0,
      purchase_price: Number(data.prezzoAcquisto) || 0,
      store: data.negozio,
      target_store: null,
      purchase_date: now.toISOString(),
      listed_date: null,
      sold_date: null,
      ricambi: [],
      note_tecnico: "",
      status_history: { acquistato: { date: now.toISOString(), operatore: data.venditore } },
      provenienza_subito: !!data.provenienzaSubito,
      extra_margine: data.extraMargine ? { importo: data.extraMargine.importo, venditore: data.extraMargine.venditore, confermato: false, conferma_operatore: null, conferma_date: null } : null,
      pagamento: { metodo: data.metodoPagamento, iban: data.iban || "", bonifico_effettuato: data.metodoPagamento === "bonifico" ? false : null, bonifico_operatore: null, bonifico_date: null, bonifico_tipo: data.metodoPagamento === "bonifico" ? (data.tipoBonifico || "ordinario") : null, bonifico_stato: data.metodoPagamento === "bonifico" ? "da_fare" : null },
      grado_usura: data.gradoUsura || "",
      acquisto_per_ricambi: !!data.perRicambi,
      allegato_documento: data.allegato_documento || null,
      allegato_dichiarazione: data.allegato_dichiarazione || null,
    };
    let { data: inserted, error: e } = await supabase.from("usati").insert(insertRow).select().single();
    if (e && /column/i.test(e.message)) {
      // mig. 113 non ancora applicata: si registra senza aggancio cliente
      const { client_id: _c, venditore: _v, ...legacy } = insertRow as Record<string, unknown>;
      void _c; void _v;
      ({ data: inserted, error: e } = await supabase.from("usati").insert(legacy).select().single());
    }
    if (e) { alert("Registrazione non riuscita: " + e.message); return; }
    setDevices(p => [rowToDevice(inserted as UsatiRow), ...p]);
    // ── NOTIFICHE INCARICHI (Luca 29/07) — best-effort, l'acquisto è già salvo ──
    if (data.metodoPagamento === "bonifico") {
      try {
        const { data: inc } = await supabase.from("incarichi").select("assegnatari,fulmine,whatsapp").eq("chiave", "bonifici").maybeSingle();
        const ass = (inc?.assegnatari ?? []) as string[];
        const istantaneo = (data.tipoBonifico || "ordinario") === "istantaneo";
        // task ⚡: sempre per l'istantaneo; per l'ordinario solo col fulmine attivo
        if (ass.length && (istantaneo || inc?.fulmine)) {
          await supabase.from("admin_tasks").insert(ass.map((uid) => ({
            tipo: "bonifico_usato",
            titolo: `${istantaneo ? "🚨 BONIFICO ISTANTANEO" : "🏦 Bonifico"} usato: ${modelName} (€${Number(data.prezzoAcquisto) || 0})`,
            dettaglio: `${data.negozio} · IMEI ${data.imei} · registrato da ${data.venditore}. Apri la scheda per documenti e IBAN.`,
            link: `/usati?id=${(inserted as { id: string | number }).id}`,
            target_role: "admin", created_by: data.venditore, target_user_id: uid,
          })));
        }
        // WhatsApp SOLO per l'istantaneo, sul numero personale dell'incarico
        if (istantaneo && String(inc?.whatsapp || "").replace(/\D/g, "").length >= 6) {
          fetch("/api/whatsapp/notify", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              number: inc!.whatsapp,
              text: `🚨 BONIFICO ISTANTANEO da fare — ${modelName} €${Number(data.prezzoAcquisto) || 0}\nNegozio ${data.negozio} · IMEI ${data.imei} · registrato da ${data.venditore}.\nApri il CRM → Gestione Usati per i dettagli.`,
            }),
          }).catch(() => {});
        }
      } catch { /* notifiche best-effort */ }
    }
  }, []);

  const thCls = "px-4 py-3 text-left text-[11px] text-slate-500 uppercase font-semibold tracking-wide border-b border-white/5 bg-[#12141f] sticky top-0 cursor-pointer select-none hover:text-slate-300 transition-colors whitespace-nowrap";

  return (
    <div
      className="-m-4 sm:-m-6 md:-m-8 text-white flex flex-col min-h-0 overflow-x-hidden"
      style={{ fontFamily: "inherit", height: "calc(100vh - 4rem)" }}
    >
      {/*  Locked header: does not scroll; only the list below scrolls  */}
      {/* relative z-20: senza, il backdrop-blur crea un contesto sotto la
          tabella e le TENDINE dei filtri finivano coperte (Luca 31/07) */}
      <div className="flex-shrink-0 bg-[#0f111a]/80 backdrop-blur-xl border-b border-white/5 relative z-20">
        {/* Title row — bigger */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-4 sm:px-6 py-5 sm:py-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">📱 Gestione Usati</h1>
            <p className="text-sm text-slate-500 mt-1">Inventario e lifecycle dispositivi usati</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Value Boxes: PULSANTI veri (Luca 31/07) — contano sul FILTRATO
                e cliccati filtrano la lista sui loro stati (ri-click = tutte) */}
            <div className="hidden sm:flex gap-3">
              {(() => {
                const invAttivo = selectedStatuses.length === STATI_FERMI.length && STATI_FERMI.every(s => selectedStatuses.includes(s));
                const vetAttivo = selectedStatuses.length === 1 && selectedStatuses[0] === "in_vendita";
                return (
                  <>
                    <button type="button"
                      onClick={() => { if (invAttivo) { setSelectedStatuses([...STATUS_KEYS]); setActiveKpi(null); } else { setSelectedStatuses([...STATI_FERMI]); setActiveKpi(null); } }}
                      title="Valore dei telefoni FERMI (non in vendita) secondo i filtri attivi — clicca per vederli in lista"
                      className={cn("px-4 py-3 rounded-xl border text-right min-w-[120px] transition-all",
                        invAttivo ? "bg-purple-500/25 border-purple-400/60" : "bg-purple-500/10 border-purple-500/20 hover:bg-purple-500/20")}>
                      <div className="text-xs text-slate-500 uppercase font-semibold tracking-wide">Inventario</div>
                      <div className="text-base font-bold text-purple-300">{fmtEur(inventoryValue)}</div>
                      <div className="text-xs text-slate-600">{inventarioList.length} disp. fermi</div>
                    </button>
                    <button type="button"
                      onClick={() => { if (vetAttivo) { setSelectedStatuses([...STATUS_KEYS]); setActiveKpi(null); } else { setSelectedStatuses(["in_vendita"]); setActiveKpi("in_vendita"); } }}
                      title="Valore dei telefoni IN VENDITA secondo i filtri attivi — clicca per vederli in lista"
                      className={cn("px-4 py-3 rounded-xl border text-right min-w-[120px] transition-all",
                        vetAttivo ? "bg-emerald-500/25 border-emerald-400/60" : "bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20")}>
                      <div className="text-xs text-slate-500 uppercase font-semibold tracking-wide">Vetrina</div>
                      <div className="text-base font-bold text-emerald-300">{fmtEur(vetrinaValue)}</div>
                      <div className="text-xs text-slate-600">{vetrinaList.length} disp. in vendita</div>
                    </button>
                  </>
                );
              })()}
            </div>
            {puoRegole && (
              <button onClick={() => setShowRegole(true)} title="Regole del laboratorio: giorni per fase e malus €/giorno"
                className="flex items-center gap-2 px-4 py-3 sm:px-5 sm:py-3 rounded-xl bg-white/5 text-slate-300 border border-white/10 text-sm font-semibold hover:bg-white/10 transition-all">
                ⚙️ Regole
              </button>
            )}
            {vedeMalus && (() => { const attivi = episodiMalus.filter(e => e.stato !== "compensato"); return (
              <button onClick={() => setShowMalus(true)}
                className="flex items-center gap-2 px-4 py-3 sm:px-5 sm:py-3 rounded-xl bg-red-500/10 text-red-300 border border-red-500/30 text-sm font-semibold hover:bg-red-500/20 transition-all">
                ⏱ Malus
                {attivi.length > 0 && <span className="min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-black flex items-center justify-center">{attivi.length}</span>}
              </button>
            ); })()}
            {vedeCosti && <button onClick={() => { setBonVista("da_fare"); setShowBonifici(true); }}
              className="flex items-center gap-2 px-4 py-3 sm:px-5 sm:py-3 rounded-xl bg-blue-500/15 text-blue-300 border border-blue-500/40 text-sm font-semibold hover:bg-blue-500/25 transition-all">
              🏦 Bonifici
              {(() => { const n = devices.filter(d => d.pagamento?.metodo === "bonifico" && (d.pagamento.bonifico_stato || (d.pagamento.bonifico_effettuato ? "fatto" : "da_fare")) !== "fatto").length; return n > 0 ? <span className="min-w-[20px] h-5 px-1 rounded-full bg-amber-500 text-black text-[11px] font-black flex items-center justify-center">{n}</span> : null; })()}
            </button>}
            <button onClick={() => setShowRegistra(true)}
              className="flex items-center gap-2 px-4 py-3 sm:px-5 sm:py-3 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/40 text-sm font-semibold hover:bg-purple-500/30 transition-all">
              <Plus size={18} /> <span className="hidden xs:inline">Registra</span> Usato
            </button>
          </div>
        </div>
        {/* RIGA 1 (Luca 01/08): solo i pulsanti-vista — Mostra i miei ·
            Mostra tutti · Mostra magazzino (+ Ricambi da prezzare per
            l'amministrazione); RIGA 2: tutti gli altri filtri */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-3 px-4 sm:px-6 pb-3">
          {!!user?.negozio && (
            <button onClick={mostraImiei} title="Mostra solo i terminali del mio negozio"
              className={cn("col-span-2 sm:col-span-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all",
                mieiAttivo ? "bg-purple-500/25 border-purple-400/60 text-purple-100" : "bg-purple-500/10 border-purple-500/30 text-purple-200 hover:bg-purple-500/20")}>
              <Building2 size={14} /> Mostra i miei{mieiAttivo ? " ✓" : ""}
            </button>
          )}
          <button onClick={() => setSelectedStores([...NEGOZI])} title="Disponibilità di tutti i telefoni in tutti i punti vendita"
            className={cn("col-span-2 sm:col-span-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all",
              tuttiAttivo ? "bg-white/15 border-white/30 text-white" : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10")}>
            🌍 Mostra tutti{tuttiAttivo ? " ✓" : ""}
          </button>
          {(() => { const magAttivo = JSON.stringify([...selectedStatuses].sort()) === JSON.stringify([...STATI_MAGAZZINO].sort()); return (
          <button onClick={() => { setSoloDaPrezzare(false); setSelectedStatuses(magAttivo ? [...PRESET_STATI] : [...STATI_MAGAZZINO]); }}
            title="I telefoni in lavorazione: in transito, ricevuti, in lavorazione e pronti"
            className={cn("col-span-2 sm:col-span-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all",
              magAttivo ? "bg-blue-500/25 border-blue-400/60 text-blue-100" : "bg-blue-500/10 border-blue-500/30 text-blue-200 hover:bg-blue-500/20")}>
            🔧 Mostra magazzino{magAttivo ? " ✓" : ""}
          </button>); })()}
          {isAmminMain && (
            <button onClick={() => setSoloDaPrezzare(v => !v)}
              title="Solo i telefoni con ricambi usati dal tecnico ma ancora SENZA prezzo (il tecnico non puo' inserirlo)"
              className={cn("col-span-2 sm:col-span-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all",
                soloDaPrezzare ? "bg-amber-500/25 border-amber-400/60 text-amber-100" : "bg-amber-500/10 border-amber-500/30 text-amber-200 hover:bg-amber-500/20")}>
              💶 Ricambi da prezzare ({devices.filter(d => ricambiDaPrezzare(d)).length}){soloDaPrezzare ? " ✓" : ""}
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-3 px-4 sm:px-6 pb-4">
          <MultiSelect label="Negozio" options={NEGOZI} selected={selectedStores} onChange={setSelectedStores} />
          <MultiSelect label="Stato" options={STATUS_KEYS} selected={selectedStatuses} onChange={setSelectedStatuses}
            renderOpt={o => <span className="flex items-center gap-1.5">{statusMap[o as UsatoStatus]?.icon} {statusMap[o as UsatoStatus]?.label}</span>} />
          <MultiSelect label="Brand" options={Object.keys(PHONE_BRANDS_MODELS)} selected={brandFilter} onChange={setBrandFilter} />
          <input type="number" min="0" value={prezzoDa} onChange={e => setPrezzoDa(e.target.value)} placeholder="€ da"
            className="w-full sm:w-24 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-slate-300 outline-none hover:bg-white/10 transition-all min-w-0" />
          <input type="number" min="0" value={prezzoA} onChange={e => setPrezzoA(e.target.value)} placeholder="€ a"
            className="w-full sm:w-24 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-slate-300 outline-none hover:bg-white/10 transition-all min-w-0" />
          {filtriCompleti && (<>
          <select value={dateField} onChange={e => setDateField(e.target.value)}
            className="col-span-2 sm:col-span-1 w-full sm:w-auto px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-slate-300 outline-none hover:bg-white/10 transition-all">
            {DATE_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="w-full sm:w-36 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-slate-400 outline-none hover:bg-white/10 transition-all min-w-0" />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="w-full sm:w-36 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-slate-400 outline-none hover:bg-white/10 transition-all min-w-0" />
          <MultiSelect label="Ricambi" options={RICAMBIO_STATE_KEYS} selected={ricambiFilter} onChange={setRicambiFilter}
            renderOpt={o => <span>{RICAMBIO_STATES.find(s => s.key === o)?.label || o}</span>} />
          </>)}
          <button onClick={resetFilters} className="col-span-2 sm:col-span-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-slate-400 hover:bg-white/10 transition-all">
            <RotateCcw size={14} /> Reset
          </button>
        </div>
        {/* KPI Cards — bigger */}
        <div className="px-4 sm:px-6 pb-4">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {KPI_CARDS.map(k => {
              const on = k.key === "_all" ? selectedStatuses.length === STATUS_KEYS.length : selectedStatuses.includes(k.key);
              return (
              <button key={k.key} onClick={() => handleKpiClick(k.key)}
                title={k.key === "_all" ? (on ? "Torna al preset del negozio" : "Mostra tutti gli stati") : (on ? `Togli ${k.label} dal filtro` : `Aggiungi ${k.label} al filtro`)}
                className={cn("px-3 py-3 rounded-xl border transition-all text-left overflow-hidden",
                  on ? `${k.bgClass} ${k.borderClass} ring-1 ring-white/10` : "bg-white/[0.02] border-white/5 opacity-60 hover:opacity-90 hover:border-white/10")}>
                <div className="flex items-center gap-1.5 mb-1 min-w-0">
                  <span className="text-base flex-shrink-0">{k.icon}</span>
                  <span className={cn("text-[10px] sm:text-xs font-semibold uppercase tracking-wide truncate", on ? k.colorClass : "text-slate-500")}>{k.label}{on ? " ✓" : ""}</span>
                </div>
                <div className={cn("text-xl sm:text-2xl font-bold", on ? k.colorClass : "text-white")}>{kpiData[k.key] ?? 0}</div>
              </button>
            );})}
          </div>
        </div>
        {/* Search bar — end of sticky area. PER TUTTI (Luca 31/07: filtro
            modello anche ai negozi; supera la segnalazione 101). */}
        <div className="px-4 sm:px-6 pb-5">
          <div className="relative w-full">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="Cerca Modello / IMEI..."
              className="w-full bg-white/[0.03] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-base text-slate-300 outline-none focus:border-white/20 transition-all" />
          </div>
        </div>
      </div>

      {/*  Device List — scrollable; header above stays fixed  */}
      <div className="flex-1 min-h-0 overflow-auto px-3 sm:px-6 pb-8">
        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="text-slate-500 text-sm">Caricamento usati...</div>
          </div>
        )}
        {!loading && error && (
          <div className="py-12 text-center">
            <p className="text-amber-400 text-sm mb-3">{error}</p>
            <button onClick={fetchDevices} className="px-4 py-2 rounded-lg bg-white/10 text-slate-300 text-sm hover:bg-white/20">Riprova</button>
          </div>
        )}
        {!loading && !error && (
          <>
            {/* ── Mobile card list (< sm) ──────────────────── */}
            <div className="sm:hidden space-y-2">
              {sorted.length === 0 ? (
                <div className="py-16 text-center text-slate-600 text-sm">Nessun dispositivo trovato</div>
              ) : sorted.map(d => (
                <div key={d.id} onClick={() => setSelectedDevice(d)}
                  className="bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 cursor-pointer active:bg-white/[0.06] transition-colors">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-sm font-semibold text-slate-200 leading-tight">{d.model}</span>
                    <StatusBadge statusKey={d.status} />
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span className="font-mono">{d.imei.slice(0, 8)}…</span>
                    <span className="text-slate-700">·</span>
                    <span>{sedeVisibile(d)}</span>
                    <span className="text-slate-700">·</span>
                    <span>{fmtDate(d.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs">
                    {vedeCosti && <div><span className="text-slate-600">Acq.</span> <span className="text-slate-300 font-semibold">{fmtEur(d.purchase_price)}</span></div>}
                    <div><span className="text-slate-600">Vend.</span> {d.sale_price > 0 ? <span className="text-emerald-400 font-semibold">{fmtEur(d.sale_price)}</span> : <span className="text-slate-700">—</span>}</div>
                  </div>
                </div>
              ))}
              <div className="pt-2 text-xs text-slate-600 text-center">{sorted.length} dispositivi mostrati</div>
            </div>

            {/* ── Desktop table (≥ sm) ─────────────────────── */}
            <div className="hidden sm:block rounded-xl border border-white/5 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {/* ordine colonne deciso da Luca 31/07 (via il #id) */}
                      {[["Data Acq.", "created_at"], ["Modello", "model"], ["IMEI", "imei"], ["Stato", "status"], ...(vedeCosti ? [["Acquisto", "purchase_price"]] : []), ["Vendita", "sale_price"], ["Operatore", "venditore"], ["Negozio", "store"], ["Data vend.", "sold_date"], ["Venduto", "sold_price"]].map(([l, k]) => (
                        <th key={k} className={thCls} onClick={() => doSort(k)}>{l}{arrow(k)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.length === 0 ? (
                      <tr><td colSpan={vedeCosti ? 10 : 9} className="py-16 text-center text-slate-600 text-sm">Nessun dispositivo trovato</td></tr>
                    ) : sorted.map(d => (
                      <tr key={d.id} onClick={() => setSelectedDevice(d)}
                        className="border-b border-white/[0.03] cursor-pointer hover:bg-white/[0.03] transition-colors group">
                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{fmtDate(d.created_at)}</td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-200 group-hover:text-white transition-colors whitespace-nowrap">{d.model}</td>
                        <td className="px-4 py-3 text-xs font-mono text-slate-500 whitespace-nowrap">{d.imei}</td>
                        <td className="px-4 py-3"><StatusBadge statusKey={d.status} /></td>
                        {vedeCosti && <td className="px-4 py-3 text-sm text-slate-400 font-semibold whitespace-nowrap">{fmtEur(d.purchase_price)}</td>}
                        <td className="px-4 py-3 text-sm font-semibold whitespace-nowrap">{d.sale_price > 0 ? <span className="text-emerald-400">{fmtEur(d.sale_price)}</span> : <span className="text-slate-700">—</span>}</td>
                        {/* chi ha ACQUISTATO il telefono (venditore della
                            registrazione; per i vecchi dalla cronologia) */}
                        <td className="px-4 py-3 text-sm text-slate-400 whitespace-nowrap">{d.venditore || d.status_history.acquistato?.operatore || "—"}</td>
                        <td className="px-4 py-3 text-sm text-slate-400 whitespace-nowrap">{sedeVisibile(d)}</td>
                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{d.sold_date ? fmtDate(d.sold_date) : <span className="text-slate-700">—</span>}</td>
                        <td className="px-4 py-3 text-sm font-semibold whitespace-nowrap">{d.sold_price > 0 ? <span className="text-rose-300">{fmtEur(d.sold_price)}</span> : <span className="text-slate-700">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 border-t border-white/5 bg-[#12141f]/50 text-xs text-slate-600">{sorted.length} dispositivi mostrati</div>
            </div>
          </>
        )}

      </div>


      {/* Modals */}
      {selectedDevice && <DevicePanel device={selectedDevice} onClose={() => setSelectedDevice(null)} onSave={u => { handleSaveDevice(u); setSelectedDevice(u); }} />}
      {showRegistra && <RegistraUsatoPanel onClose={() => setShowRegistra(false)} onSave={handleRegistra} />}

      {/* ── REGOLE del laboratorio (Luca 31/07): dentro la sezione, come il
          tracking PDA — solo admin ── */}
      {showRegole && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setShowRegole(false)}>
          <div className="glass-panel w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl border-white/10" onClick={e => e.stopPropagation()}>
            <div className="flex-none px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">⚙️ Regole del laboratorio</h3>
              <button onClick={() => setShowRegole(false)} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/10"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <UsatoRegoleView />
            </div>
          </div>
        </div>
      )}

      {/* ── ARCHIVIO MALUS LABORATORIO (Luca 31/07): episodi persistenti come
          il PDA — il sanato resta "attivo" finche' non viene compensato nella
          gara di commissioning dedicata. Compensa: solo amministrazione. ── */}
      {showMalus && (() => {
        const inCorso = episodiMalus.filter(e => e.stato === "in_corso");
        const attivi = episodiMalus.filter(e => e.stato === "attivo");
        const compensati = episodiMalus.filter(e => e.stato === "compensato");
        const tot = (l: EpisodioUsato[]) => l.reduce((s, e) => s + (Number(e.importo) || 0), 0);
        const compensa = async (e: EpisodioUsato) => {
          const note = window.prompt(`Compensare il malus di ${e.tecnico || "—"} su ${e.model} (${fmtEur(Number(e.importo))})?\nNota (facoltativa):`);
          if (note === null) return;
          await supabase.from("usati_malus").update({
            stato: "compensato", compensato_il: new Date().toISOString().slice(0, 10),
            compensato_da: user?.name || "—", compensato_note: note || null,
          }).eq("id", e.id!);
          setEpisodiMalus(p => p.map(x => x.id === e.id ? { ...x, stato: "compensato", compensato_da: user?.name || "—" } : x));
        };
        const Riga = ({ e }: { e: EpisodioUsato }) => (
          <div className="flex items-center gap-3 flex-wrap rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm">
            <span className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded",
              e.stato === "in_corso" ? "bg-red-500/20 text-red-300" : e.stato === "attivo" ? "bg-amber-500/20 text-amber-300" : "bg-emerald-500/15 text-emerald-300")}>
              {e.stato === "in_corso" ? "matura" : e.stato === "attivo" ? "da compensare" : "compensato"}
            </span>
            <button onClick={() => { const d = devices.find(x => x.id === e.usato_id); if (d) { setSelectedDevice(d); setShowMalus(false); } }}
              className="font-bold text-white hover:text-blue-300 text-left">{e.model} <span className="text-slate-500 font-mono text-xs">· {e.imei}</span></button>
            <span className="text-xs text-slate-400">{e.tecnico || "—"}</span>
            <span className="text-xs text-slate-500">{e.fase === "lavorazione" ? "presa in carico" : "riparazione"} · dal {new Date(e.data_inizio).toLocaleDateString("it-IT")}{e.data_fine ? ` al ${new Date(e.data_fine).toLocaleDateString("it-IT")}` : ""}</span>
            <span className="ml-auto text-sm font-bold text-red-300">{e.giorni}g · {fmtEur(Number(e.importo))}</span>
            {e.stato === "attivo" && puoCompensare && (
              <button onClick={() => compensa(e)} className="px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/25 text-xs font-bold">✓ Compensa</button>
            )}
            {e.stato === "compensato" && <span className="text-[11px] text-slate-500">da {e.compensato_da || "—"}</span>}
          </div>
        );
        return (
          <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setShowMalus(false)}>
            <div className="glass-panel w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl border-white/10" onClick={e => e.stopPropagation()}>
              <div className="flex-none px-5 py-4 border-b border-white/10 flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">⏱ Malus laboratorio</h3>
                <button onClick={() => setShowMalus(false)} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/10"><X size={20} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <p className="text-[11px] text-slate-500">Regole nel pulsante ⚙️ Regole qui in alto (solo admin): {REGOLE_USATO_DEFAULT.lavorazione.giorni}g presa in carico, {REGOLE_USATO_DEFAULT.riparazione.giorni}g riparazione (giorni lavorativi lun–sab). Il telefono sanato smette di maturare ma l&apos;importo resta finché non viene compensato in gara.</p>
                <div>
                  <h4 className="text-xs font-bold text-red-400 uppercase tracking-widest mb-2">Stanno maturando ({inCorso.length} · {fmtEur(tot(inCorso))})</h4>
                  {inCorso.length === 0 ? <p className="text-sm text-slate-600">Nessun telefono oltre soglia. 👌</p> : <div className="space-y-2">{inCorso.map((e, i) => <Riga key={e.id || i} e={e} />)}</div>}
                </div>
                <div>
                  <h4 className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-2">Da compensare ({attivi.length} · {fmtEur(tot(attivi))})</h4>
                  {attivi.length === 0 ? <p className="text-sm text-slate-600">Niente in attesa di compensazione.</p> : <div className="space-y-2">{attivi.map((e, i) => <Riga key={e.id || i} e={e} />)}</div>}
                </div>
                {compensati.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-2">Compensati ({compensati.length} · {fmtEur(tot(compensati))})</h4>
                    <div className="space-y-2">{compensati.map((e, i) => <Riga key={e.id || i} e={e} />)}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── PANNELLO BONIFICI (Luca 29/07): al posto del vecchio filtro. Nasce
          sui DA FARE (con 🚨 per gli istantanei); "Stampato" = passato a chi
          esegue, resta in lista col badge; "Fatto" = sparisce nello storico
          (visibile col toggle). Click sul telefono = apre la scheda. ── */}
      {showBonifici && (() => {
        const conStato = (d: Device) => (d.pagamento.bonifico_stato || (d.pagamento.bonifico_effettuato ? "fatto" : "da_fare")) as "da_fare" | "stampato" | "fatto";
        // FILTRI (Luca 31/07): il periodo guarda l'acquisto per i DA FARE e la
        // data di esecuzione per i FATTI
        const cliDi = (d: Device) => (d.client_id && bonClienti[d.client_id]) || { nome: "", email: "" };
        const passa = (d: Device, dataRef: Date | null) => {
          const cli = cliDi(d);
          if (bonNome && !cli.nome.toLowerCase().includes(bonNome.toLowerCase())) return false;
          if (bonEmail && !cli.email.toLowerCase().includes(bonEmail.toLowerCase())) return false;
          if (bonIban && !String(d.pagamento.iban || "").toLowerCase().replace(/\s/g, "").includes(bonIban.toLowerCase().replace(/\s/g, ""))) return false;
          if (bonNegozio && d.store !== bonNegozio) return false;
          if (bonDa || bonA) {
            if (!dataRef || isNaN(dataRef.getTime())) return false;
            const g = isoDate(dataRef);
            if (bonDa && g < bonDa) return false;
            if (bonA && g > bonA) return false;
          }
          return true;
        };
        const tutti = devices.filter(d => d.pagamento?.metodo === "bonifico");
        // periodo: acquisto per i da fare, esecuzione per i fatti (per riga)
        const riferimento = (d: Device) => conStato(d) === "fatto" ? (d.pagamento.bonifico_date || d.purchase_date) : d.purchase_date;
        const filtrati = tutti.filter(d => passa(d, riferimento(d)));
        const daFare = filtrati.filter(d => conStato(d) !== "fatto")
          .sort((a, b) => (b.pagamento.bonifico_tipo === "istantaneo" ? 1 : 0) - (a.pagamento.bonifico_tipo === "istantaneo" ? 1 : 0));
        const fatti = filtrati.filter(d => conStato(d) === "fatto");
        const mostrati = bonVista === "da_fare" ? daFare : bonVista === "fatti" ? fatti : [...daFare, ...fatti];
        const filtriAttivi = !!(bonNome || bonEmail || bonIban || bonNegozio || bonDa || bonA);
        // EXPORT CSV sui filtrati (stesso formato leggibile dei report presenze)
        const esporta = (lista: Device[], nome: string) => {
          const righe = [["Data acquisto", "Modello", "IMEI", "Negozio", "Cliente", "Email", "IBAN", "Importo", "Tipo", "Stato", "Eseguito il", "Eseguito da"].join(";")];
          lista.forEach((d) => {
            const cli = cliDi(d);
            righe.push([
              fmtDate(d.purchase_date), d.model, d.imei, d.store, cli.nome, cli.email,
              d.pagamento.iban || "", String(d.purchase_price).replace(".", ","),
              d.pagamento.bonifico_tipo === "istantaneo" ? "istantaneo" : "ordinario",
              conStato(d),
              d.pagamento.bonifico_date ? fmtDate(d.pagamento.bonifico_date) : "",
              d.pagamento.bonifico_operatore || "",
            ].map(v => String(v).replaceAll(";", ",")).join(";"));
          });
          const blob = new Blob(["﻿" + righe.join("\n")], { type: "text/csv;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const el = document.createElement("a");
          el.href = url; el.download = `bonifici_${nome}_${new Date().toISOString().slice(0, 10)}.csv`; el.click();
          URL.revokeObjectURL(url);
        };
        const setStatoBon = async (d: Device, stato: "stampato" | "fatto") => {
          const pag = { ...d.pagamento, bonifico_stato: stato, bonifico_effettuato: stato === "fatto", bonifico_operatore: stato === "fatto" ? (user?.name || "—") : d.pagamento.bonifico_operatore, bonifico_date: stato === "fatto" ? new Date() : d.pagamento.bonifico_date };
          const upd = { ...d, pagamento: pag };
          await handleSaveDevice(upd);
        };
        const Riga = ({ d, storico }: { d: Device; storico?: boolean }) => {
          const st = conStato(d);
          const cli = cliDi(d);
          return (
            <div className="flex items-center gap-3 flex-wrap rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              {d.pagamento.bonifico_tipo === "istantaneo" && <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">🚨 istantaneo</span>}
              <button onClick={() => { setSelectedDevice(d); setShowBonifici(false); }} className="text-sm font-bold text-white hover:text-blue-300 text-left">
                {d.model} <span className="text-slate-500 font-mono text-xs">· {d.imei}</span>
              </button>
              {/* il CLIENTE ora si vede (Luca 31/07): prima in questa schermata
                  non compariva nemmeno; per i registrati prima della mig. 113
                  l'anagrafica non esiste e resta il trattino */}
              <span className="text-xs font-semibold text-blue-200">{cli.nome || "—"}</span>
              {cli.email && <span className="text-[11px] text-slate-500">✉️ {cli.email}</span>}
              <span className="text-xs text-slate-500">{d.store}</span>
              <span className="text-xs font-bold text-emerald-300">€{d.purchase_price}</span>
              {d.pagamento.iban && <span className="text-[11px] font-mono text-slate-500">{d.pagamento.iban}</span>}
              <span className="ml-auto flex items-center gap-2">
                {st === "stampato" && !storico && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-sky-500/15 text-sky-300">🖨 stampato</span>}
                {storico ? (
                  <span className="text-[11px] text-slate-500">fatto {d.pagamento.bonifico_date ? new Date(d.pagamento.bonifico_date).toLocaleDateString("it-IT") : ""} · {d.pagamento.bonifico_operatore || "—"}</span>
                ) : (
                  <>
                    {st !== "stampato" && <button onClick={() => setStatoBon(d, "stampato")} title="Stampato e passato a chi esegue il bonifico"
                      className="px-3 py-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 text-sky-300 hover:bg-sky-500/25 text-xs font-bold">🖨 Stampato</button>}
                    <button onClick={() => setStatoBon(d, "fatto")} title="Bonifico eseguito: va nello storico"
                      className="px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/25 text-xs font-bold">✓ Fatto</button>
                  </>
                )}
              </span>
            </div>
          );
        };
        return (
          <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setShowBonifici(false)}>
            <div className="glass-panel w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl border-white/10" onClick={e => e.stopPropagation()}>
              <div className="flex-none px-5 py-4 border-b border-white/10 flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">🏦 Bonifici acquisto usato</h3>
                <button onClick={() => setShowBonifici(false)} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/10"><X size={20} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {/* ── FILTRI (Luca 31/07): valgono su DA FARE e FATTI ── */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                  <input value={bonNome} onChange={e => setBonNome(e.target.value)} placeholder="Nome / cognome cliente…"
                    className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 outline-none" />
                  <input value={bonEmail} onChange={e => setBonEmail(e.target.value)} placeholder="Email…"
                    className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 outline-none" />
                  <input value={bonIban} onChange={e => setBonIban(e.target.value)} placeholder="IBAN…"
                    className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 outline-none font-mono" />
                  <select value={bonNegozio} onChange={e => setBonNegozio(e.target.value)}
                    className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 outline-none">
                    <option value="">Tutti i negozi</option>
                    {NEGOZI.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <input type="date" value={bonDa} onChange={e => setBonDa(e.target.value)} title="Periodo dal (acquisto per i da fare, esecuzione per i fatti)"
                    className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-400 outline-none" />
                  <div className="flex gap-2">
                    <input type="date" value={bonA} onChange={e => setBonA(e.target.value)} title="Periodo al"
                      className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-400 outline-none min-w-0" />
                    {filtriAttivi && (
                      <button onClick={() => { setBonNome(""); setBonEmail(""); setBonIban(""); setBonNegozio(""); setBonDa(""); setBonA(""); }}
                        title="Azzera i filtri" className="px-2.5 rounded-lg border border-white/10 text-slate-400 hover:text-white text-xs">✕</button>
                    )}
                  </div>
                </div>
                {/* SWITCH unico (Luca 31/07): una lista sola, filtri unici,
                    export unico su cio' che si sta guardando */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex bg-black/40 p-1 rounded-xl border border-white/10">
                    {([["da_fare", `Da fare (${daFare.length})`], ["fatti", `Fatti (${fatti.length})`], ["entrambi", `Tutti (${filtrati.length})`]] as const).map(([k, lab]) => (
                      <button key={k} type="button" onClick={() => setBonVista(k)}
                        className={cn("px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all",
                          bonVista === k ? "bg-blue-500/20 text-blue-200 border border-blue-500/30" : "text-slate-400 hover:text-white")}>
                        {lab}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => esporta(mostrati, bonVista)} disabled={!mostrati.length}
                    className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-40">
                    ⬇️ Esporta CSV ({mostrati.length})
                  </button>
                </div>
                {mostrati.length === 0 && (
                  <p className="text-sm text-slate-600">
                    {bonVista === "da_fare" ? "Nessun bonifico in attesa" : bonVista === "fatti" ? "Nessun bonifico eseguito" : "Nessun bonifico"}{filtriAttivi ? " coi filtri attivi" : ""}.{bonVista === "da_fare" ? " 👌" : ""}
                  </p>
                )}
                <div className="space-y-2">
                  {mostrati.map(d => <Riga key={String(d.id)} d={d} storico={conStato(d) === "fatto"} />)}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* useSearchParams richiede Suspense in fase di build (lezione 502). */
export default function GestioneUsati() {
  return (
    <Suspense fallback={<div className="w-full h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin" /></div>}>
      <GestioneUsatiInner />
    </Suspense>
  );
}
