"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  Smartphone, Tablet, Laptop, Watch,
  Calendar, Search, User, Building2, CalendarDays,
  CheckCircle2, Truck, Tag, CircleDollarSign, XCircle,
  Save, MapPin, Plus, Wrench, FileText, Copy,
  ChevronDown, ChevronUp, AlertTriangle, Banknote,
  TicketIcon, Paperclip, ArrowRight, ArrowLeft, RotateCcw,
  UploadCloud, X
} from "lucide-react";
import { cn } from "@/utils";
import { supabase } from "@/lib/supabaseClient";
import { useStores, useSellers } from "@/lib/org";

// ─── Types ────────────────────────────────────────────────────────────────────
type UsatoStatus =
  | "acquistato" | "in_transito" | "ricevuto" | "in_lavorazione"
  | "pronto" | "invio_in_negozio" | "in_vendita" | "venduto" | "ko";

type RicambioState = "in_magazzino" | "da_ordinare" | "ordinato" | "arrivato";

interface Ricambio {
  name: string;
  stato: RicambioState;
  cost: number;
  data_consegna_prevista: string;
}

interface Pagamento {
  metodo: "contanti" | "buono" | "bonifico";
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
] as const;

const statusMap = Object.fromEntries(STATUS_LIST.map(s => [s.key, s]));
const STATUS_KEYS = STATUS_LIST.map(s => s.key);
const LIFECYCLE: UsatoStatus[] = ["acquistato", "in_transito", "ricevuto", "in_lavorazione", "pronto", "invio_in_negozio", "in_vendita", "venduto"];

const KPI_CARDS = [
  { key: "_all", label: "Totale", icon: "📊", colorClass: "text-indigo-400", bgClass: "bg-indigo-500/10", borderClass: "border-indigo-500/30" },
  { key: "acquistato", label: "Acquistato", icon: "🛒", colorClass: "text-slate-400", bgClass: "bg-slate-500/10", borderClass: "border-slate-500/30" },
  { key: "invio_in_negozio", label: "Arrivo in Negozio", icon: "📦", colorClass: "text-orange-400", bgClass: "bg-orange-500/10", borderClass: "border-orange-500/30" },
  { key: "in_vendita", label: "In Vendita", icon: "🏷️", colorClass: "text-green-400", bgClass: "bg-green-500/10", borderClass: "border-green-500/30" },
  { key: "venduto", label: "Venduto", icon: "💸", colorClass: "text-rose-400", bgClass: "bg-rose-500/10", borderClass: "border-rose-500/30" },
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
  Apple: ["iPhone 16 Pro Max", "iPhone 16 Pro", "iPhone 16", "iPhone 15 Pro Max", "iPhone 15 Pro", "iPhone 15", "iPhone 14 Pro", "iPhone 14", "iPhone 13", "iPhone SE"],
  Samsung: ["Galaxy S24 Ultra", "Galaxy S24+", "Galaxy S24", "Galaxy S23", "Galaxy Z Fold5", "Galaxy Z Flip5", "Galaxy A54", "Galaxy A34", "Galaxy A15"],
  Xiaomi: ["14 Ultra", "14", "13T Pro", "13T", "Redmi Note 13 Pro", "Redmi Note 13", "Redmi 13C"],
  OPPO: ["Find X7", "Reno 11 Pro", "Reno 11", "A79", "A58"],
  Huawei: ["P60 Pro", "P60", "Nova 12", "Nova 11"],
  Google: ["Pixel 8 Pro", "Pixel 8", "Pixel 7a"],
  OnePlus: ["12", "Nord 3", "Nord CE3"],
  Motorola: ["Edge 40 Pro", "Edge 40", "Moto G84"],
  Nothing: ["Phone 2", "Phone 1"],
};
const CAPACITA_OPTIONS = ["32 GB", "64 GB", "128 GB", "256 GB", "512 GB", "1 TB"];
const COLORI_OPTIONS = ["Nero", "Bianco", "Blu", "Rosso", "Verde", "Oro", "Argento", "Viola", "Rosa", "Grigio", "Titanio", "Altro"];
const GRADI_USURA = [
  { key: "Km0", label: "Km 0", desc: "Nuovo, mai utilizzato" },
  { key: "A", label: "Grado A — Come nuovo", desc: "Nessun segno visibile" },
  { key: "B", label: "Grado B — Buono", desc: "Lievi segni di usura" },
  { key: "C", label: "Grado C — Discreto", desc: "Segni evidenti ma funzionante" },
  { key: "D", label: "Grado D — Usurato", desc: "Segni importanti, possibili difetti estetici" },
];
const TIPO_PRODOTTO = [
  { key: "smartphone", label: "Smartphone", Icon: Smartphone },
  { key: "tablet", label: "Tablet", Icon: Tablet },
  { key: "portatile", label: "Portatile", Icon: Laptop },
  { key: "watch", label: "Watch", Icon: Watch },
];

// ─── Formatters ───────────────────────────────────────────────────────────────
const rnd = (f: string, t: string) => { const a = new Date(f).getTime(), b = new Date(t).getTime(); return new Date(a + Math.random() * (b - a)); };
const fmtDate = (d: Date | string | null) => { if (!d) return "—"; const dt = d instanceof Date ? d : new Date(d); return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }); };
const fmtDateTime = (d: Date | string | null) => { if (!d) return "—"; const dt = d instanceof Date ? d : new Date(d); return isNaN(dt.getTime()) ? "—" : fmtDate(dt) + " " + dt.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }); };
const fmtEur = (v: number) => v.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const genIMEI = () => { let s = "35"; for (let i = 0; i < 13; i++) s += Math.floor(Math.random() * 10); return s; };

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
  pagamento: unknown;
  grado_usura: string;
  allegato_documento: string | null;
  allegato_dichiarazione: string | null;
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
    allegato_documento: r.allegato_documento ?? null,
    allegato_dichiarazione: r.allegato_dichiarazione ?? null,
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
    allegato_documento: d.allegato_documento,
    allegato_dichiarazione: d.allegato_dichiarazione,
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
        <div className="absolute top-full mt-1 left-0 z-50 bg-[#161b22] border border-white/10 rounded-xl shadow-2xl w-52 max-h-72 overflow-auto py-1">
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
function RicambioRow({ r, idx, onUpdate, onRemove }: { r: Ricambio; idx: number; onUpdate: (i: number, r: Ricambio) => void; onRemove: (i: number) => void }) {
  const st = RICAMBIO_STATES.find(s => s.key === r.stato);
  return (
    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-semibold text-slate-300"> {r.name}</span>
        <select value={r.stato} onChange={e => onUpdate(idx, { ...r, stato: e.target.value as RicambioState })}
          className={cn("bg-black/40 border rounded-lg px-2 py-1 text-xs font-semibold outline-none cursor-pointer border-white/10", st?.colorClass)}>
          {RICAMBIO_STATES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <button onClick={() => onRemove(idx)} className="ml-auto text-slate-600 hover:text-red-400 transition-colors text-sm"></button>
      </div>
      <div className="flex gap-3 items-center flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-500">Costo:</span>
          <input type="number" step="0.01" min="0" value={r.cost || ""} onChange={e => onUpdate(idx, { ...r, cost: parseFloat(e.target.value) || 0 })}
            className="w-20 bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-xs text-slate-300 outline-none" placeholder="0.00" />
          <span className="text-[11px] text-slate-500"></span>
        </div>
        {r.stato === "ordinato" && (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-500">Consegna prevista:</span>
            <input type="date" value={r.data_consegna_prevista || ""} onChange={e => onUpdate(idx, { ...r, data_consegna_prevista: e.target.value })}
              className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-xs text-slate-300 outline-none" />
          </div>
        )}
      </div>
    </div>
  );
}

//  DevicePanel 
function DevicePanel({ device, onClose, onSave }: { device: Device; onClose: () => void; onSave: (d: Device) => void }) {
  const NEGOZI = useStores();
  const [dev, setDev] = useState<Device>(() => ({ ...device, ricambi: device.ricambi.map(r => ({ ...r })), extra_margine: device.extra_margine ? { ...device.extra_margine } : null, pagamento: { ...device.pagamento } }));
  const [newRicambio, setNewRicambio] = useState("");
  const [newRicambioInMag, setNewRicambioInMag] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [targetStore, setTargetStore] = useState(dev.target_store || "");
  const [noteTecnico, setNoteTecnico] = useState(dev.note_tecnico || "");
  const [editSalePrice, setEditSalePrice] = useState(dev.sale_price > 0);
  const [salePriceVal, setSalePriceVal] = useState(String(dev.sale_price || ""));
  const [ibanCopied, setIbanCopied] = useState(false);

  const s = statusMap[dev.status];
  const canAdvance = !["venduto", "ko"].includes(dev.status);
  const lcIdx = LIFECYCLE.indexOf(dev.status as any);
  const next = canAdvance && lcIdx >= 0 && lcIdx < LIFECYCLE.length - 1 ? LIFECYCLE[lcIdx + 1] : null;
  const needsStore = dev.status === "pronto";
  const totalRicambi = dev.ricambi.reduce((s, r) => s + (r.cost || 0), 0);
  const spVal = editSalePrice ? (parseFloat(salePriceVal) || 0) : 0;
  const margin = spVal - dev.purchase_price - totalRicambi;

  const addRicambio = () => {
    if (!newRicambio.trim()) return;
    setDev(p => ({ ...p, ricambi: [...p.ricambi, { name: newRicambio.trim(), stato: newRicambioInMag ? "in_magazzino" : "da_ordinare", cost: 0, data_consegna_prevista: "" }] }));
    setNewRicambio(""); setShowAdd(false); setNewRicambioInMag(false);
  };
  const updateRicambio = (idx: number, r: Ricambio) => setDev(p => { const a = [...p.ricambi]; a[idx] = r; return { ...p, ricambi: a }; });
  const removeRicambio = (idx: number) => setDev(p => ({ ...p, ricambi: p.ricambi.filter((_, i) => i !== idx) }));

  const advanceStatus = () => {
    if (needsStore && !targetStore) return;
    setDev(p => {
      const u: Device = { ...p, status: next!, note_tecnico: noteTecnico };
      if (needsStore) u.target_store = targetStore;
      if (next === "in_vendita") u.listed_date = new Date();
      if (next === "venduto") u.sold_date = new Date();
      return u;
    });
  };
  const setKO = () => setDev(p => ({ ...p, status: "ko", note_tecnico: noteTecnico }));
  const handleSave = () => { const u: Device = { ...dev, note_tecnico: noteTecnico, sale_price: editSalePrice ? (parseFloat(salePriceVal) || 0) : 0 }; onSave(u); onClose(); };

  const confirmExtraMargine = () => setDev(p => ({ ...p, extra_margine: { ...p.extra_margine!, confermato: true, conferma_operatore: "Admin", conferma_date: new Date() } }));

  const toggleBonifico = () => {
    const nowEff = !dev.pagamento.bonifico_effettuato;
    const upd: Device = { ...dev, pagamento: { ...dev.pagamento, bonifico_effettuato: nowEff, bonifico_operatore: nowEff ? "Admin" : null, bonifico_date: nowEff ? new Date() : null }, note_tecnico: noteTecnico, sale_price: editSalePrice ? (parseFloat(salePriceVal) || 0) : 0 };
    setDev(upd); onSave(upd);
  };
  const getFileUrl = (path: string) => supabase.storage.from("usati_attachments").getPublicUrl(path).data.publicUrl;
  const copyIban = () => { try { navigator.clipboard.writeText(dev.pagamento.iban); setIbanCopied(true); setTimeout(() => setIbanCopied(false), 2000); } catch (e) { } };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-start justify-center pt-8 px-4" onClick={onClose}>
      <div className="bg-[#161b22] border border-white/10 rounded-2xl w-full max-w-5xl max-h-[88vh] overflow-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-[#161b22] border-b border-white/10 px-6 py-4 flex items-center justify-between z-10 rounded-t-2xl">
          <div>
            <div className="text-lg font-bold text-white flex items-center gap-2">{s?.icon} {dev.model}</div>
            <div className="text-xs text-slate-500 font-mono mt-0.5">IMEI: {dev.imei}</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleSave} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30 text-sm font-semibold hover:bg-purple-500/30 transition-all">
              Salva
            </button>
            <button onClick={onClose} className="text-slate-500 hover:text-white text-xl transition-colors px-2"></button>
          </div>
        </div>
        {/* Body */}
        <div className="p-6 grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
          {/* LEFT: Status Timeline */}
          <div>
            <div className="text-sm font-bold text-white mb-3"> Stato</div>
            <StatusBadge statusKey={dev.status} />
            <div className="mt-4"><StatusTimeline currentStatus={dev.status} history={dev.status_history} /></div>
            {canAdvance && (
              <div className="mt-4 flex flex-col gap-2">
                {needsStore && (
                  <select value={targetStore} onChange={e => setTargetStore(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-300 outline-none">
                    <option value="">Seleziona Negozio...</option>
                    {NEGOZI.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                )}
                {next && <button onClick={advanceStatus} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-sm font-semibold hover:bg-emerald-500/30 transition-all">
                  {statusMap[next]?.icon} {statusMap[next]?.label}
                </button>}
                {["in_lavorazione", "ricevuto"].includes(dev.status) && (
                  <button onClick={setKO} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/20 text-red-400 border border-red-500/30 text-sm font-semibold hover:bg-red-500/30 transition-all"> KO</button>
                )}
              </div>
            )}
          </div>
          {/* RIGHT: Details */}
          <div className="space-y-5">
            {/* Badges */}
            <div className="flex flex-wrap gap-2">
              {dev.provenienza_subito && <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/30"> Provenienza Subito.it</span>}
              <span className={cn("inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border",
                dev.pagamento.metodo === "bonifico" ? "bg-blue-500/10 text-blue-400 border-blue-500/30" : "bg-white/5 text-slate-400 border-white/10")}>
                {dev.pagamento.metodo === "contanti" ? "" : dev.pagamento.metodo === "buono" ? "" : ""} {dev.pagamento.metodo === "contanti" ? "Contanti" : dev.pagamento.metodo === "buono" ? "Buono" : "Bonifico"}
              </span>
            </div>
            {/* Details grid */}
            <div>
              <div className="text-sm font-bold text-white mb-3"> Dettagli</div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                {([["Modello", dev.model, false], ["IMEI", dev.imei, true], ["Acquisto", fmtEur(dev.purchase_price), false], ["Negozio", dev.store, false], ["Destinazione", dev.target_store || "", false], ["Grado", dev.grado_usura || "", false], ["Data Acquisto", fmtDate(dev.purchase_date), false], ["Data Reg.", fmtDate(dev.created_at), false]] as [string, string, boolean][]).map(([l, v, mono]) => (
                  <div key={l}>
                    <div className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">{l}</div>
                    <div className={cn("text-sm text-white font-medium", mono && "font-mono")}>{v}</div>
                  </div>
                ))}
                {/* Sale price */}
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">Prezzo Vendita</div>
                  {editSalePrice ? (
                    <div className="flex items-center gap-1.5">
                      <input type="number" step="1" min="0" value={salePriceVal} onChange={e => setSalePriceVal(e.target.value)}
                        className="w-24 bg-black/40 border border-emerald-500/30 rounded-lg px-2 py-1 text-sm text-emerald-400 font-bold outline-none" />
                      <span className="text-xs text-slate-500"></span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-500"> Non impostato</span>
                      <button onClick={() => setEditSalePrice(true)} className="text-[11px] px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 transition-all">Imposta</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            {/* Extra Margine alert */}
            {dev.extra_margine && (
              <div className={cn("p-4 rounded-xl border-2", dev.extra_margine.confermato ? "bg-emerald-500/5 border-emerald-500/30" : "bg-yellow-500/5 border-yellow-500/40")}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className={cn("text-sm font-bold", dev.extra_margine.confermato ? "text-emerald-400" : "text-yellow-400")}>
                      {dev.extra_margine.confermato ? "" : ""} Extra Margine: {fmtEur(dev.extra_margine.importo)}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">Generato da: {dev.extra_margine.venditore}</div>
                    {dev.extra_margine.confermato && <div className="text-xs text-slate-500">Confermato da {dev.extra_margine.conferma_operatore} il {fmtDateTime(dev.extra_margine.conferma_date)}</div>}
                  </div>
                  {!dev.extra_margine.confermato && (
                    <button onClick={confirmExtraMargine} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-semibold hover:bg-emerald-500/25 transition-all"> Conferma Extra Margine</button>
                  )}
                </div>
              </div>
            )}
            {/* Bonifico section */}
            {dev.pagamento.metodo === "bonifico" && (
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
            {/* Cost summary */}
            <div className="flex gap-4 p-3 rounded-xl bg-white/[0.02] border border-white/5">
              <div><div className="text-[10px] text-slate-500 uppercase">Costo Ricambi</div><div className="text-sm font-semibold text-orange-400">{fmtEur(totalRicambi)}</div></div>
              <div><div className="text-[10px] text-slate-500 uppercase">Margine</div><div className={cn("text-sm font-bold", editSalePrice && salePriceVal ? (margin >= 0 ? "text-emerald-400" : "text-red-400") : "text-slate-500")}>{editSalePrice && salePriceVal ? fmtEur(margin) : ""}</div></div>
            </div>
            {/* Ricambi */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-bold text-white"> Ricambi ({dev.ricambi.length})</div>
                <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/30 text-xs font-semibold hover:bg-blue-500/25 transition-all">+ Aggiungi</button>
              </div>
              {showAdd && (
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
              ) : dev.ricambi.map((r, i) => <RicambioRow key={i} r={r} idx={i} onUpdate={updateRicambio} onRemove={removeRicambio} />)}
            </div>
            {/* Documents */}
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
            {/* Note */}
            <div>
              <div className="text-sm font-bold text-white mb-2"> Note</div>
              <textarea value={noteTecnico} onChange={e => setNoteTecnico(e.target.value)} rows={3} placeholder="Note tecnico / amministrazione..."
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-300 outline-none resize-none focus:border-white/20 font-inherit" />
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
  const [step, setStep] = useState(1);
  const [venditore, setVenditore] = useState("");
  const [negozio, setNegozio] = useState("");
  const [provenienzaSubito, setProvenienzaSubito] = useState(false);
  const [tipoCliente, setTipoCliente] = useState<"consumer" | "business" | "">("");
  const [searchField, setSearchField] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const [clienteFound, setClienteFound] = useState<boolean | null>(null);
  const [ana, setAna] = useState({ nome: "", cognome: "", cf: "", piva: "", email: "", cellulare: "", domicilio: "", iban: "", ragioneSociale: "", referente: "", pec: "", sdi: "", sedeLegale: "" });
  const [tipoProdotto, setTipoProdotto] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [capacita, setCapacita] = useState("");
  const [colore, setColore] = useState("");
  const [imei, setImei] = useState("");
  const [prezzoAcquisto, setPrezzoAcquisto] = useState("");
  const [gradoUsura, setGradoUsura] = useState("");
  const [hasExtraMargine, setHasExtraMargine] = useState(false);
  const [extraMargineImporto, setExtraMargineImporto] = useState("");
  const [metodoPagamento, setMetodoPagamento] = useState<"contanti" | "buono" | "bonifico" | "">("");
  const [ibanPag, setIbanPag] = useState("");
  const [allegDoc, setAllegDoc] = useState<File | null>(null);
  const [allegDich, setAllegDich] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const doSearch = () => {
    if (!searchValue.trim()) return;
    setClienteFound(true);
    if (tipoCliente === "consumer") setAna({ ...ana, nome: "Mario", cognome: "Rossi", cf: "RSSMRA80A01H501U", email: "mario.rossi@email.com", cellulare: "333 1234567", domicilio: "Via Roma 15, 00100 Roma", iban: "IT60X0542811101000000123456", piva: "", ragioneSociale: "", referente: "", pec: "", sdi: "", sedeLegale: "" });
    else setAna({ ...ana, ragioneSociale: "Rossi S.r.l.", piva: "12345678901", referente: "Mario Rossi", cellulare: "333 1234567", email: "info@rossi.it", pec: "azienda@pec.it", sdi: "Abc1234", sedeLegale: "Via Roma 15, 00100 Roma", iban: "IT60X0542811101000000654321", nome: "", cognome: "", cf: "", domicilio: "" });
  };

  const canNext = () => {
    if (step === 1) return !!(venditore && negozio);
    if (step === 2) return !!(tipoCliente && clienteFound !== null);
    if (step === 3) return !!(tipoProdotto && brand && model && capacita && colore && imei && prezzoAcquisto && gradoUsura && (!hasExtraMargine || extraMargineImporto));
    if (step === 4) return !!(metodoPagamento && (metodoPagamento !== "bonifico" || ibanPag));
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
        venditore, negozio, provenienzaSubito, tipoCliente, anagrafica: ana,
        tipoProdotto, brand, model, capacita, colore, imei,
        prezzoAcquisto: parseFloat(prezzoAcquisto) || 0, gradoUsura,
        extraMargine: hasExtraMargine ? { importo: parseFloat(extraMargineImporto) || 0, venditore } : null,
        metodoPagamento, iban: metodoPagamento === "bonifico" ? ibanPag : null,
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
            <select value={venditore} onChange={e => setVenditore(e.target.value)} className={inp}>
              <option value="">Seleziona venditore...</option>
              {VENDITORI.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div><label className={lbl}>Negozio *</label>
            <select value={negozio} onChange={e => setNegozio(e.target.value)} className={inp}>
              <option value="">Seleziona negozio...</option>
              {NEGOZI.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
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
          <div className="flex gap-2">
            <select value={searchField} onChange={e => setSearchField(e.target.value)} className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-300 outline-none">
              <option value="">Cerca per...</option>
              {tipoCliente === "consumer" ? <><option value="cf">Codice Fiscale</option><option value="cell">Cellulare</option></> : <><option value="piva">Partita IVA</option><option value="cell">Cellulare</option></>}
            </select>
            <input value={searchValue} onChange={e => setSearchValue(e.target.value)} placeholder={searchField === "cf" ? "RSSMRA80A..." : searchField === "piva" ? "12345678901" : "333..."}
              className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-300 outline-none" />
            <button onClick={doSearch} className="px-3 py-2 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-sm font-semibold hover:bg-emerald-500/25 transition-all"> Cerca</button>
            <button onClick={() => setClienteFound(false)} className="px-3 py-2 rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/30 text-sm font-semibold hover:bg-blue-500/25 transition-all"> Nuovo</button>
          </div>
          {clienteFound === true && <div className="p-4 bg-emerald-500/5 border border-emerald-500/30 rounded-xl">
            <div className="text-sm text-emerald-400 font-semibold mb-3"> Cliente trovato! Dati pre-compilati.</div>
            <AnaFields tipoCliente={tipoCliente} ana={ana} setAna={setAna} inp={inp} lbl={lbl} />
          </div>}
          {clienteFound === false && <div className="p-4 bg-blue-500/5 border border-blue-500/30 rounded-xl">
            <div className="text-sm text-blue-400 font-semibold mb-3"> Nuovo cliente  compila i dati</div>
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
            <div><label className={lbl}>IMEI *</label>
              <input value={imei} onChange={e => setImei(e.target.value)} maxLength={15} placeholder="353456789012345" className={inp} />
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
        {metodoPagamento === "bonifico" && <div>
          <label className={lbl}>IBAN *</label>
          <div className="flex gap-2">
            <input value={ibanPag} onChange={e => setIbanPag(e.target.value)} placeholder="IT60X0542811101000000123456" className={inp + " flex-1"} />
            {ana.iban && <button onClick={() => setIbanPag(ana.iban)} className="px-3 py-2 rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/30 text-xs font-semibold hover:bg-blue-500/25 transition-all whitespace-nowrap"> Copia IBAN da anagrafica</button>}
          </div>
        </div>}
      </div>
    );
    if (step === 5) return (
      <div className="space-y-5">
        {[
          { key: "doc", label: "Documento di Identità *", val: allegDoc, set: setAllegDoc },
          { key: "dich", label: "Dichiarazione di Vendita (firmata) *", val: allegDich, set: setAllegDich }
        ].map(f => (
          <div key={f.key}>
            <label className={lbl}>{f.label}</label>
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
      <div className="bg-[#161b22] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-[#161b22] border-b border-white/10 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
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
      <div><label className={lbl}>Domicilio</label><input value={ana.domicilio} onChange={e => setAna({ ...ana, domicilio: e.target.value })} className={inp} /></div>
      <div className="col-span-2"><label className={lbl}>IBAN</label><input value={ana.iban} onChange={e => setAna({ ...ana, iban: e.target.value })} placeholder="IT60X0542811101000000123456" className={inp} /></div>
    </div>
  );
  return (
    <div className="grid grid-cols-2 gap-3">
      <div><label className={lbl}>Ragione Sociale *</label><input value={ana.ragioneSociale} onChange={e => setAna({ ...ana, ragioneSociale: e.target.value })} className={inp} /></div>
      <div><label className={lbl}>Partita IVA *</label><input value={ana.piva} onChange={e => setAna({ ...ana, piva: e.target.value })} className={inp} /></div>
      <div><label className={lbl}>Referente *</label><input value={ana.referente} onChange={e => setAna({ ...ana, referente: e.target.value })} className={inp} /></div>
      <div><label className={lbl}>Cellulare</label><input value={ana.cellulare} onChange={e => setAna({ ...ana, cellulare: e.target.value })} className={inp} /></div>
      <div><label className={lbl}>Email</label><input value={ana.email} onChange={e => setAna({ ...ana, email: e.target.value })} className={inp} /></div>
      <div><label className={lbl}>PEC</label><input value={ana.pec} onChange={e => setAna({ ...ana, pec: e.target.value })} className={inp} /></div>
      <div><label className={lbl}>Codice Univoco / SDI</label><input value={ana.sdi} onChange={e => setAna({ ...ana, sdi: e.target.value })} className={inp} /></div>
      <div><label className={lbl}>Sede Legale</label><input value={ana.sedeLegale} onChange={e => setAna({ ...ana, sedeLegale: e.target.value })} className={inp} /></div>
      <div className="col-span-2"><label className={lbl}>IBAN</label><input value={ana.iban} onChange={e => setAna({ ...ana, iban: e.target.value })} placeholder="IT60X0542811101000000123456" className={inp} /></div>
    </div>
  );
}

//  Main Page -
export default function GestioneUsati() {
  const NEGOZI = useStores();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  // i negozi arrivano in modo asincrono: alla prima load seleziona tutto
  const storesInit = useRef(false);
  useEffect(() => { if (!storesInit.current && NEGOZI.length) { storesInit.current = true; setSelectedStores([...NEGOZI]); } }, [NEGOZI]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([...STATUS_KEYS]);
  const [dateField, setDateField] = useState("created_at");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchText, setSearchText] = useState("");
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [showRegistra, setShowRegistra] = useState(false);
  const [sortKey, setSortKey] = useState<keyof Device | "">("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [ricambiFilter, setRicambiFilter] = useState<string[]>([]);
  const [bonificoFilter, setBonificoFilter] = useState("");
  const [activeKpi, setActiveKpi] = useState<string | null>(null);

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

  const RICAMBIO_STATE_KEYS = RICAMBIO_STATES.map(s => s.key);

  const filtered = useMemo(() => devices.filter(d => {
    if (!selectedStores.includes(d.store)) return false;
    if (!selectedStatuses.includes(d.status)) return false;
    if (dateFrom) { const v = d[dateField as keyof Device] as Date | null; if (!v || isoDate(v) < dateFrom) return false; }
    if (dateTo) { const v = d[dateField as keyof Device] as Date | null; if (!v || isoDate(v) > dateTo) return false; }
    if (searchText) { const q = searchText.toLowerCase(); if (!d.model.toLowerCase().includes(q) && !d.imei.includes(q)) return false; }
    if (ricambiFilter.length > 0) { if (!d.ricambi.some(r => ricambiFilter.includes(r.stato))) return false; }
    if (bonificoFilter === "da_effettuare") { if (!d.pagamento || d.pagamento.metodo !== "bonifico" || d.pagamento.bonifico_effettuato !== false) return false; }
    if (bonificoFilter === "effettuato") { if (!d.pagamento || d.pagamento.metodo !== "bonifico" || d.pagamento.bonifico_effettuato !== true) return false; }
    return true;
  }), [devices, selectedStores, selectedStatuses, dateField, dateFrom, dateTo, searchText, ricambiFilter, bonificoFilter]);

  const inCirculation = useMemo(() => devices.filter(d => d.status !== "venduto" && d.status !== "ko"), [devices]);
  const inventoryValue = useMemo(() => inCirculation.filter(d => d.sale_price > 0).reduce((s, d) => s + d.sale_price, 0), [inCirculation]);
  const vetrinaValue = useMemo(() => devices.filter(d => d.status === "in_vendita").reduce((s, d) => s + d.sale_price, 0), [devices]);

  const kpiData = useMemo(() => {
    const c: Record<string, number> = {};
    STATUS_KEYS.forEach(k => c[k] = 0);
    filtered.forEach(d => { c[d.status] = (c[d.status] || 0) + 1; });
    c._all = filtered.filter(d => d.status !== "venduto" && d.status !== "ko").length;
    return c;
  }, [filtered]);

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
    if (sk === "_all") {
      const allExcl = STATUS_KEYS.filter(k => k !== "venduto" && k !== "ko");
      const isActive = selectedStatuses.length === allExcl.length && allExcl.every(k => selectedStatuses.includes(k));
      if (isActive) { setSelectedStatuses([...STATUS_KEYS]); setActiveKpi(null); }
      else { setSelectedStatuses(allExcl); setActiveKpi("_all"); }
    } else {
      const isSingle = selectedStatuses.length === 1 && selectedStatuses[0] === sk;
      if (isSingle) { setSelectedStatuses([...STATUS_KEYS]); setActiveKpi(null); }
      else { setSelectedStatuses([sk]); setActiveKpi(sk); }
    }
  };

  const resetFilters = () => { setSelectedStores([...NEGOZI]); setSelectedStatuses([...STATUS_KEYS]); setDateField("created_at"); setDateFrom(""); setDateTo(""); setSearchText(""); setRicambiFilter([]); setBonificoFilter(""); setActiveKpi(null); };

  const handleSaveDevice = useCallback(async (u: Device) => {
    const row = deviceToRow(u);
    const { error: e } = await supabase.from("usati").update(row).eq("id", u.id);
    if (!e) setDevices(p => p.map(d => d.id === u.id ? u : d));
  }, []);

  const handleRegistra = useCallback(async (data: {
    venditore: string; negozio: string; tipoCliente?: string; anagrafica?: unknown;
    tipoProdotto?: string; brand?: string; model?: string; capacita?: string; colore?: string;
    imei: string; prezzoAcquisto: number; gradoUsura: string; extraMargine?: { importo: number; venditore: string };
    metodoPagamento: "contanti" | "buono" | "bonifico"; iban?: string; provenienzaSubito?: boolean;
    allegato_documento?: string | null; allegato_dichiarazione?: string | null;
  }) => {
    const modelName = [data.brand, data.model].filter(Boolean).join(" ") || "Modello non specificato";
    const now = new Date();
    const insertRow = {
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
      pagamento: { metodo: data.metodoPagamento, iban: data.iban || "", bonifico_effettuato: data.metodoPagamento === "bonifico" ? false : null, bonifico_operatore: null, bonifico_date: null },
      grado_usura: data.gradoUsura || "",
      allegato_documento: data.allegato_documento || null,
      allegato_dichiarazione: data.allegato_dichiarazione || null,
    };
    const { data: inserted, error: e } = await supabase.from("usati").insert(insertRow).select().single();
    if (e) return;
    setDevices(p => [rowToDevice(inserted as UsatiRow), ...p]);
  }, []);

  const thCls = "px-4 py-3 text-left text-[11px] text-slate-500 uppercase font-semibold tracking-wide border-b border-white/5 bg-[#161b22] sticky top-0 cursor-pointer select-none hover:text-slate-300 transition-colors whitespace-nowrap";

  return (
    <div
      className="-m-4 sm:-m-6 md:-m-8 bg-[#0d1117] text-white flex flex-col min-h-0 overflow-x-hidden"
      style={{ fontFamily: "inherit", height: "calc(100vh - 4rem)" }}
    >
      {/*  Locked header: does not scroll; only the list below scrolls  */}
      <div className="flex-shrink-0 bg-[#0d1117] border-b border-white/5 overflow-x-hidden shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
        {/* Title row — bigger */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-4 sm:px-6 py-5 sm:py-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">📱 Gestione Usati</h1>
            <p className="text-sm text-slate-500 mt-1">Inventario e lifecycle dispositivi usati</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Value Boxes — bigger */}
            <div className="hidden sm:flex gap-3">
              <div className="px-4 py-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-right min-w-[120px]">
                <div className="text-xs text-slate-500 uppercase font-semibold tracking-wide">Inventario</div>
                <div className="text-base font-bold text-purple-300">{fmtEur(inventoryValue)}</div>
                <div className="text-xs text-slate-600">{inCirculation.length} disp.</div>
              </div>
              <div className="px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-right min-w-[120px]">
                <div className="text-xs text-slate-500 uppercase font-semibold tracking-wide">Vetrina</div>
                <div className="text-base font-bold text-emerald-300">{fmtEur(vetrinaValue)}</div>
                <div className="text-xs text-slate-600">{devices.filter(d => d.status === "in_vendita").length} disp.</div>
              </div>
            </div>
            <button onClick={() => setShowRegistra(true)}
              className="flex items-center gap-2 px-4 py-3 sm:px-5 sm:py-3 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/40 text-sm font-semibold hover:bg-purple-500/30 transition-all">
              <Plus size={18} /> <span className="hidden xs:inline">Registra</span> Usato
            </button>
          </div>
        </div>
        {/* Filters row — bigger controls */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-3 px-4 sm:px-6 pb-4">
          <MultiSelect label="Negozio" options={NEGOZI} selected={selectedStores} onChange={setSelectedStores} />
          <MultiSelect label="Stato" options={STATUS_KEYS} selected={selectedStatuses} onChange={setSelectedStatuses}
            renderOpt={o => <span className="flex items-center gap-1.5">{statusMap[o as UsatoStatus]?.icon} {statusMap[o as UsatoStatus]?.label}</span>} />
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
          <select value={bonificoFilter} onChange={e => setBonificoFilter(e.target.value)}
            className="w-full sm:w-auto px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-slate-300 outline-none hover:bg-white/10 transition-all">
            <option value="">Bonifici (Tutti)</option>
            <option value="da_effettuare">Da Effettuare</option>
            <option value="effettuato">Effettuato</option>
          </select>
          <button onClick={resetFilters} className="col-span-2 sm:col-span-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-slate-400 hover:bg-white/10 transition-all">
            <RotateCcw size={14} /> Reset
          </button>
        </div>
        {/* KPI Cards — bigger */}
        <div className="px-4 sm:px-6 pb-4">
          <div className="grid grid-cols-5 gap-3">
            {KPI_CARDS.map(k => (
              <button key={k.key} onClick={() => handleKpiClick(k.key)}
                className={cn("px-3 py-3 rounded-xl border transition-all text-left overflow-hidden",
                  activeKpi === k.key ? `${k.bgClass} ${k.borderClass}` : "bg-white/[0.02] border-white/5 hover:border-white/10")}>
                <div className="flex items-center gap-1.5 mb-1 min-w-0">
                  <span className="text-base flex-shrink-0">{k.icon}</span>
                  <span className={cn("text-[10px] sm:text-xs font-semibold uppercase tracking-wide truncate", activeKpi === k.key ? k.colorClass : "text-slate-500")}>{k.label}</span>
                </div>
                <div className={cn("text-xl sm:text-2xl font-bold", activeKpi === k.key ? k.colorClass : "text-white")}>{kpiData[k.key] ?? 0}</div>
              </button>
            ))}
          </div>
        </div>
        {/* Search bar — end of sticky area */}
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
                    <span>{d.store}</span>
                    <span className="text-slate-700">·</span>
                    <span>{fmtDate(d.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs">
                    <div><span className="text-slate-600">Acq.</span> <span className="text-slate-300 font-semibold">{fmtEur(d.purchase_price)}</span></div>
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
                      {[["#", "id"], ["Modello", "model"], ["IMEI", "imei"], ["Stato", "status"], ["Acquisto", "purchase_price"], ["Vendita", "sale_price"], ["Negozio", "store"], ["Data Reg.", "created_at"]].map(([l, k]) => (
                        <th key={k} className={thCls} onClick={() => doSort(k)}>{l}{arrow(k)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.length === 0 ? (
                      <tr><td colSpan={8} className="py-16 text-center text-slate-600 text-sm">Nessun dispositivo trovato</td></tr>
                    ) : sorted.map(d => (
                      <tr key={d.id} onClick={() => setSelectedDevice(d)}
                        className="border-b border-white/[0.03] cursor-pointer hover:bg-white/[0.03] transition-colors group">
                        <td className="px-4 py-3 text-xs text-slate-600 font-mono">#{d.id}</td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-200 group-hover:text-white transition-colors whitespace-nowrap">{d.model}</td>
                        <td className="px-4 py-3 text-xs font-mono text-slate-500 whitespace-nowrap">{d.imei}</td>
                        <td className="px-4 py-3"><StatusBadge statusKey={d.status} /></td>
                        <td className="px-4 py-3 text-sm text-slate-400 font-semibold whitespace-nowrap">{fmtEur(d.purchase_price)}</td>
                        <td className="px-4 py-3 text-sm font-semibold whitespace-nowrap">{d.sale_price > 0 ? <span className="text-emerald-400">{fmtEur(d.sale_price)}</span> : <span className="text-slate-700">—</span>}</td>
                        <td className="px-4 py-3 text-sm text-slate-400 whitespace-nowrap">{d.store}</td>
                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{fmtDate(d.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 border-t border-white/5 bg-[#161b22]/50 text-xs text-slate-600">{sorted.length} dispositivi mostrati</div>
            </div>
          </>
        )}

      </div>


      {/* Modals */}
      {selectedDevice && <DevicePanel device={selectedDevice} onClose={() => setSelectedDevice(null)} onSave={u => { handleSaveDevice(u); setSelectedDevice(u); }} />}
      {showRegistra && <RegistraUsatoPanel onClose={() => setShowRegistra(false)} onSave={handleRegistra} />}
    </div>
  );
}
