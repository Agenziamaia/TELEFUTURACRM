"use client";

import { useState, useMemo } from "react";
import {
    Smartphone,
    Calendar,
    Search,
    User,
    Building2,
    CalendarDays,
    Settings,
    CheckCircle2,
    Truck,
    Tag,
    CircleDollarSign,
    XCircle,
    X,
    Save,
    MapPin,
    Plus,
    Wrench,
    FileText,
    ArrowLeft,
    ArrowRight,
    ArrowUp,
    ArrowDown,
    Check
} from "lucide-react";
import { cn } from "@/utils";
import { useAuth } from "@/context/AuthContext";

// --- Types & Constants from Prototype ---
type UsatoStatus =
    | "acquistato"
    | "in_transito"
    | "ricevuto"
    | "in_lavorazione"
    | "pronto"
    | "invio_in_negozio"
    | "in_vendita"
    | "venduto"
    | "ko";

const STATUS_LIST: { key: UsatoStatus; label: string; icon: any; colorClass: string; bgClass: string; borderClass: string }[] = [
    { key: "acquistato", label: "Acquistato", icon: CalendarDays, colorClass: "text-slate-400", bgClass: "bg-slate-500/10", borderClass: "border-slate-500/20" },
    { key: "in_transito", label: "In Transito", icon: Truck, colorClass: "text-amber-500", bgClass: "bg-amber-500/10", borderClass: "border-amber-500/20" },
    { key: "ricevuto", label: "Ricevuto", icon: Building2, colorClass: "text-blue-400", bgClass: "bg-blue-500/10", borderClass: "border-blue-500/20" },
    { key: "in_lavorazione", label: "In Lavorazione", icon: Wrench, colorClass: "text-purple-400", bgClass: "bg-purple-500/10", borderClass: "border-purple-500/20" },
    { key: "pronto", label: "Pronto", icon: CheckCircle2, colorClass: "text-emerald-500", bgClass: "bg-emerald-500/10", borderClass: "border-emerald-500/20" },
    { key: "invio_in_negozio", label: "Arrivo in Negozio", icon: Truck, colorClass: "text-orange-500", bgClass: "bg-orange-500/10", borderClass: "border-orange-500/20" },
    { key: "in_vendita", label: "In Vendita", icon: Tag, colorClass: "text-emerald-400", bgClass: "bg-emerald-500/10", borderClass: "border-emerald-500/20" },
    { key: "venduto", label: "Venduto", icon: CircleDollarSign, colorClass: "text-rose-400", bgClass: "bg-rose-500/10", borderClass: "border-rose-500/20" },
    { key: "ko", label: "KO", icon: XCircle, colorClass: "text-rose-500", bgClass: "bg-rose-500/10", borderClass: "border-rose-500/20" },
];

const statusMap = Object.fromEntries(STATUS_LIST.map(s => [s.key, s]));
const STATUS_KEYS = STATUS_LIST.map(s => s.key);

const KPI_CARDS = [
    { key: "_all", label: "Totale", icon: Smartphone, colorClass: "text-indigo-400", bgClass: "bg-indigo-500/10", borderClass: "border-indigo-500/20" },
    { key: "acquistato", label: "Acquistato", icon: CalendarDays, colorClass: "text-slate-400", bgClass: "bg-slate-500/10", borderClass: "border-slate-500/20" },
    { key: "invio_in_negozio", label: "Arrivo in Negozio", icon: Truck, colorClass: "text-orange-500", bgClass: "bg-orange-500/10", borderClass: "border-orange-500/20" },
    { key: "in_vendita", label: "In Vendita", icon: Tag, colorClass: "text-emerald-400", bgClass: "bg-emerald-500/10", borderClass: "border-emerald-500/20" },
    { key: "venduto", label: "Venduto", icon: CircleDollarSign, colorClass: "text-rose-400", bgClass: "bg-rose-500/10", borderClass: "border-rose-500/20" },
];

// Reusing global store constants (mocked for now)
const NEGOZI = [
    "Magliana", "Donna", "Libia", "Collatina", "Mazzini",
    "San Paolo", "Garbatella", "Promontori", "Acilia",
    "Baleniere", "Castani", "Merulana", "Telefonico"
];

const DATE_FIELDS = [
    { key: "created_at", label: "Data Registrazione" },
    { key: "purchase_date", label: "Data Acquisto" },
    { key: "listed_date", label: "Data Messa in Vendita" },
    { key: "sold_date", label: "Data Vendita" },
];

const RICAMBI_CATALOG = [
    "Display LCD", "Batteria", "Fotocamera posteriore", "Fotocamera frontale",
    "Connettore ricarica", "Altoparlante", "Microfono", "Tasto accensione",
    "Tasto volume", "Vetro posteriore", "Scheda madre", "Sensore impronte",
    "Face ID module", "Antenna NFC", "Vibrazione motore"
];

const BRANDS_PHONES = [
    "Apple iPhone 15", "Apple iPhone 14", "Samsung Galaxy S24", "Xiaomi 14"
];

const RICAMBIO_STATES = [
    { key: "in_magazzino", label: "In Magazzino", colorClass: "text-emerald-400" },
    { key: "da_ordinare", label: "Da Ordinare", colorClass: "text-amber-500" },
    { key: "ordinato", label: "Ordinato", colorClass: "text-blue-400" },
    { key: "arrivato", label: "Arrivato", colorClass: "text-emerald-400" },
];

const VENDITORI = ["Alberto", "Giulia", "Marco", "Francesca", "Alessandro"];
const PHONE_BRANDS_MODELS: Record<string, string[]> = {
    Apple: ["iPhone 16 Pro Max", "iPhone 16 Pro", "iPhone 16", "iPhone 15 Pro Max", "iPhone 15 Pro", "iPhone 15", "iPhone 14 Pro", "iPhone 14", "iPhone 13", "iPhone SE"],
    Samsung: ["Galaxy S24 Ultra", "Galaxy S24+", "Galaxy S24", "Galaxy S23", "Galaxy Z Fold5", "Galaxy Z Flip5", "Galaxy A54", "Galaxy A34", "Galaxy A15"],
    Xiaomi: ["14 Ultra", "14", "13T Pro", "13T", "Redmi Note 13 Pro", "Redmi Note 13", "Redmi 13C"],
};

const CAPACITA_OPTIONS = ["32 GB", "64 GB", "128 GB", "256 GB", "512 GB", "1 TB"];
const COLORI_OPTIONS = ["Nero", "Bianco", "Blu", "Rosso", "Verde", "Oro", "Argento", "Viola", "Rosa", "Grigio", "Titanio", "Altro"];
const GRADI_USURA = [
    { key: "A", label: "Grado A - Come nuovo", desc: "Nessun segno visibile" },
    { key: "B", label: "Grado B - Buono", desc: "Lievi segni di usura" },
    { key: "C", label: "Grado C - Discreto", desc: "Segni evidenti ma funzionante" },
    { key: "D", label: "Grado D - Usurato", desc: "Segni importanti, possibili difetti estetici" },
];

const LIFECYCLE = ["acquistato", "in_transito", "ricevuto", "in_lavorazione", "pronto", "invio_in_negozio", "in_vendita", "venduto"];

// Formatters
const fmtDate = (d: Date | string | null | undefined) => d ? new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
const fmtEur = (v: number) => v.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const isoDate = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
const fmtDateTime = (d: Date | string | null | undefined) => d ? new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }) + " " + new Date(d).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "—";
const randomDate = (f: string, t: string) => { const a = new Date(f).getTime(), b = new Date(t).getTime(); return new Date(a + Math.random() * (b - a)); };
const genIMEI = () => { let s = "35"; for (let i = 0; i < 13; i++) s += Math.floor(Math.random() * 10); return s; };

// Mock Generator
const generateMockDevices = () => {
    const statusDist = [
        ...Array(6).fill("acquistato"), ...Array(4).fill("in_transito"), ...Array(5).fill("ricevuto"),
        ...Array(8).fill("in_lavorazione"), ...Array(5).fill("pronto"), ...Array(4).fill("invio_in_negozio"),
        ...Array(18).fill("in_vendita"), ...Array(14).fill("venduto"), ...Array(4).fill("ko"),
    ];

    return statusDist.map((status: any, i) => {
        const price = Math.round((80 + Math.random() * 720) / 10) * 10;
        const store = NEGOZI[Math.floor(Math.random() * NEGOZI.length)];
        const hasR = ["pronto", "invio_in_negozio", "in_vendita", "venduto"].includes(status);
        const inLav = status === "in_lavorazione";
        const rc = hasR ? Math.floor(Math.random() * 3) : (inLav ? 1 + Math.floor(Math.random() * 2) : 0);
        const ricambi = []; const used = new Set();

        for (let r = 0; r < rc; r++) {
            let idx; do { idx = Math.floor(Math.random() * RICAMBI_CATALOG.length); } while (used.has(idx)); used.add(idx);
            const rState = hasR ? "arrivato" : (inLav ? ["in_magazzino", "da_ordinare", "ordinato", "arrivato"][Math.floor(Math.random() * 4)] : "da_ordinare");
            ricambi.push({
                name: RICAMBI_CATALOG[idx],
                stato: rState,
                cost: hasR || Math.random() > 0.4 ? Math.round((5 + Math.random() * 45) * 100) / 100 : 0,
                data_consegna_prevista: rState === "ordinato" ? isoDate(randomDate("2026-03-10", "2026-03-25")) : "",
            });
        }

        const isKO = status === "ko";
        const lcIdx = isKO ? 4 : LIFECYCLE.indexOf(status);
        const baseDate = new Date("2025-08-01").getTime();
        const history: any = {};

        for (let h = 0; h <= Math.min(lcIdx, LIFECYCLE.length - 1); h++) {
            const dt = new Date(baseDate + h * (2 + Math.random() * 5) * 86400000);
            dt.setHours(8 + Math.floor(Math.random() * 10), Math.floor(Math.random() * 60));
            history[LIFECYCLE[h]] = { date: dt, operatore: "Operatore" };
        }
        if (isKO) {
            const dt = new Date(baseDate + 5 * 86400000);
            dt.setHours(14, Math.floor(Math.random() * 60));
            history["ko"] = { date: dt, operatore: "Operatore" };
        }

        return {
            id: i + 1,
            model: BRANDS_PHONES[Math.floor(Math.random() * BRANDS_PHONES.length)],
            imei: genIMEI(),
            status,
            sale_price: price,
            purchase_price: Math.round(price * (0.35 + Math.random() * 0.25)),
            store,
            target_store: ["invio_in_negozio", "in_vendita", "venduto"].includes(status) ? NEGOZI[Math.floor(Math.random() * 12)] : null,
            created_at: randomDate("2025-06-01", "2026-03-10"),
            purchase_date: randomDate("2025-04-01", "2026-02-28"),
            listed_date: ["in_vendita", "venduto"].includes(status) ? randomDate("2025-07-01", "2026-03-08") : null,
            sold_date: status === "venduto" ? randomDate("2026-01-01", "2026-03-09") : null,
            ricambi,
            note_tecnico: inLav ? "Verifica componenti in corso" : (status === "ko" ? "Scheda madre irrecuperabile" : ""),
            status_history: history,
        };
    });
};

const MOCK_DEVICES = generateMockDevices();

// --- Components ---
export function MultiSelect({
    label,
    options,
    selected,
    onChange,
    renderOption
}: {
    label: string,
    options: string[],
    selected: string[],
    onChange: (arr: string[]) => void,
    renderOption?: (opt: string) => React.ReactNode
}) {
    const [open, setOpen] = useState(false);
    const allSel = selected.length === options.length;

    const toggle = (opt: string) => {
        onChange(selected.includes(opt) ? selected.filter(x => x !== opt) : [...selected, opt]);
    };

    return (
        <div className="relative">
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">{label}</label>
            <div
                className="bg-[#0f111a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white cursor-pointer flex justify-between items-center min-h-[38px] hover:border-slate-600 transition-colors"
                onClick={() => setOpen(!open)}
            >
                <div className="truncate flex-1 pr-2">
                    {allSel ? "Tutti" : selected.length === 0 ? "Nessuno" :
                        selected.length <= 2
                            ? (renderOption
                                ? selected.map((o, i) => <span key={o} className="inline-flex items-center">{i > 0 && <span className="mx-1">,</span>}{renderOption(o)}</span>)
                                : selected.join(", "))
                            : <span className="bg-indigo-500/20 text-indigo-400 rounded-full px-2 py-0.5 text-xs font-semibold">{selected.length} selezionati</span>
                    }
                </div>
                {open ? <ArrowUp className="w-3.5 h-3.5 text-slate-500 shrink-0" /> : <ArrowDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
            </div>

            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div className="absolute top-[calc(100%+4px)] left-0 w-full min-w-[220px] bg-[#161b22] border border-white/10 rounded-xl py-1.5 z-50 max-h-[300px] overflow-auto shadow-xl shadow-black/50 custom-scrollbar">
                        <div
                            className="px-4 py-2 text-xs font-semibold text-indigo-400 cursor-pointer border-b border-white/5 mb-1 uppercase tracking-wider hover:bg-white/5"
                            onClick={() => onChange(allSel ? [] : [...options])}
                        >
                            {allSel ? "Deseleziona Tutti" : "Seleziona Tutti"}
                        </div>
                        {options.map(opt => {
                            const ch = selected.includes(opt);
                            return (
                                <div
                                    key={opt}
                                    className={cn(
                                        "px-4 py-2 text-sm flex items-center gap-3 cursor-pointer transition-colors",
                                        ch ? "bg-indigo-500/10 text-white" : "text-slate-300 hover:bg-white/5"
                                    )}
                                    onClick={() => toggle(opt)}
                                >
                                    <div className={cn(
                                        "w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-colors",
                                        ch ? "bg-indigo-500 border-indigo-500 text-white" : "border-slate-600"
                                    )}>
                                        {ch && <Check className="w-3 h-3 stroke-[3]" />}
                                    </div>
                                    <span>{renderOption ? renderOption(opt) : opt}</span>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}

function StatusBadge({ statusKey }: { statusKey: string }) {
    const s = statusMap[statusKey];
    if (!s) return null;
    const Icon = s.icon;
    return (
        <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border", s.colorClass, s.bgClass, s.borderClass)}>
            <Icon className="w-3.5 h-3.5" />
            {s.label}
        </span>
    );
}

function StatusTimeline({ currentStatus, history }: { currentStatus: string, history: any }) {
    const isKO = currentStatus === "ko";
    const currentIdx = isKO ? 3 : LIFECYCLE.indexOf(currentStatus);
    const [openStep, setOpenStep] = useState<string | null>(null);
    const hist = history || {};

    return (
        <div className="pl-2">
            {LIFECYCLE.map((sk, i) => {
                const s = statusMap[sk];
                const done = !isKO && i < currentIdx;
                const active = !isKO && i === currentIdx;
                const hasHistory = !!hist[sk];
                const clickable = done || active;

                if (!s) return null;
                const Icon = s.icon;

                return (
                    <div key={sk}>
                        <div
                            className={cn(
                                "flex items-center gap-3 py-1.5 relative transition-opacity",
                                done || active ? "opacity-100" : "opacity-35",
                                clickable ? "cursor-pointer" : "cursor-default"
                            )}
                            onClick={() => { if (clickable && hasHistory) setOpenStep(openStep === sk ? null : sk); }}
                        >
                            <div className={cn(
                                "w-7 h-7 rounded-full flex items-center justify-center border-2 transition-transform",
                                done ? `${s.bgClass} ${s.borderClass} ${s.colorClass}` : (active ? `${s.bgClass} border-${s.colorClass.split('-')[1]}-500 ${s.colorClass} shadow-[0_0_10px_rgba(var(--tw-colors-${s.colorClass.split('-')[1]}-500),0.4)]` : "bg-[#0f111a] border-white/10 text-slate-500"),
                                openStep === sk ? "scale-110" : "scale-100"
                            )}>
                                {done ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : <Icon className="w-3.5 h-3.5" />}
                            </div>
                            <span className={cn("text-xs", active ? "font-bold text-white" : "font-medium text-slate-400")}>{s.label}</span>
                            {clickable && hasHistory && <Calendar className="w-3 h-3 text-slate-500 ml-1" />}
                        </div>

                        {openStep === sk && hasHistory && (
                            <div className={cn("ml-9 mb-2 p-3 bg-[#0f111a] border rounded-lg text-xs leading-relaxed", s.borderClass)}>
                                <div className={cn("font-semibold flex items-center gap-2 mb-1", s.colorClass)}>
                                    <Icon className="w-3 h-3" /> {s.label}
                                </div>
                                <div className="text-slate-400 flex items-center gap-1.5"><Calendar className="w-3 h-3" /> {fmtDateTime(hist[sk].date)}</div>
                                <div className="text-slate-400 flex items-center gap-1.5 mt-0.5"><User className="w-3 h-3" /> {hist[sk].operatore}</div>
                            </div>
                        )}
                        {i < LIFECYCLE.length - 1 && (
                            <div className={cn("w-0.5 h-3 space-y-1 ml-3.5", done ? "bg-emerald-500" : "bg-white/10")} />
                        )}
                    </div>
                );
            })}

            {isKO && (
                <>
                    <div className="w-0.5 h-3 bg-white/10 ml-3.5" />
                    <div
                        className={cn("flex items-center gap-3 py-1.5 relative cursor-pointer")}
                        onClick={() => { if (hist["ko"]) setOpenStep(openStep === "ko" ? null : "ko"); }}
                    >
                        <div className={cn(
                            "w-7 h-7 rounded-full flex items-center justify-center border-2 bg-rose-500/20 border-rose-500 text-rose-500 transition-transform",
                            openStep === "ko" ? "scale-110" : "scale-100"
                        )}>
                            <X className="w-3.5 h-3.5" strokeWidth={3} />
                        </div>
                        <span className="text-xs font-bold text-rose-500">KO — Non riparabile</span>
                        {hist["ko"] && <Calendar className="w-3 h-3 text-slate-500 ml-1" />}
                    </div>
                    {openStep === "ko" && hist["ko"] && (
                        <div className="ml-9 mb-2 p-3 bg-[#0f111a] border border-rose-500/30 rounded-lg text-xs leading-relaxed">
                            <div className="font-semibold flex items-center gap-2 mb-1 text-rose-500">
                                <XCircle className="w-3 h-3" /> KO
                            </div>
                            <div className="text-slate-400 flex items-center gap-1.5"><Calendar className="w-3 h-3" /> {fmtDateTime(hist["ko"].date)}</div>
                            <div className="text-slate-400 flex items-center gap-1.5 mt-0.5"><User className="w-3 h-3" /> {hist["ko"].operatore}</div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

function RicambioRow({ r, idx, onUpdate, onRemove }: { r: any, idx: number, onUpdate: (idx: number, r: any) => void, onRemove: (idx: number) => void }) {
    const stColor = RICAMBIO_STATES.find(s => s.key === r.stato);
    return (
        <div className="p-3 rounded-lg bg-white/[0.02] border border-white/10 mb-2">
            <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[13px] font-semibold flex items-center gap-1.5 text-white">
                    <Wrench className="w-4 h-4 text-slate-400" />
                    {r.name}
                </span>
                <select
                    className={cn(
                        "bg-[#0f111a] border rounded-lg px-2 py-1 text-xs font-semibold outline-none cursor-pointer",
                        stColor ? `border-${stColor.colorClass.split('-')[1]}-500/30 ${stColor.colorClass}` : "border-white/10 text-white"
                    )}
                    value={r.stato}
                    onChange={e => onUpdate(idx, { ...r, stato: e.target.value })}
                >
                    {RICAMBIO_STATES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
                <div className="ml-auto">
                    <button
                        className="text-slate-400 hover:text-rose-400 p-1 rounded-md hover:bg-rose-500/10 transition-colors"
                        onClick={() => onRemove(idx)}
                        title="Rimuovi"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <div className="flex gap-4 mt-2 items-center flex-wrap">
                <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">Costo:</span>
                    <div className="relative">
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            className="bg-[#0f111a] border border-white/10 text-white rounded-md pl-2 pr-6 py-1 text-xs w-20 outline-none focus:border-indigo-500"
                            value={r.cost || ""}
                            onChange={e => onUpdate(idx, { ...r, cost: parseFloat(e.target.value) || 0 })}
                            placeholder="0.00"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">€</span>
                    </div>
                </div>
                {r.stato === "ordinato" && (
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-400">Consegna prevista:</span>
                        <input
                            type="date"
                            className="bg-[#0f111a] border border-white/10 text-white rounded-md px-2 py-1 text-xs outline-none focus:border-indigo-500"
                            value={r.data_consegna_prevista || ""}
                            onChange={e => onUpdate(idx, { ...r, data_consegna_prevista: e.target.value })}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}

function DevicePanel({ device, onClose, onSave }: { device: any, onClose: () => void, onSave: (d: any) => void }) {
    const [dev, setDev] = useState(() => ({ ...device, ricambi: device.ricambi.map((r: any) => ({ ...r })) }));
    const [newRicambio, setNewRicambio] = useState("");
    const [newRicambioInMag, setNewRicambioInMag] = useState(false);
    const [showAdd, setShowAdd] = useState(false);

    const [targetStore, setTargetStore] = useState(dev.target_store || "");
    const [noteTecnico, setNoteTecnico] = useState(dev.note_tecnico || "");

    const s = statusMap[dev.status];
    const canAdvance = !["venduto", "ko"].includes(dev.status);

    const nextSt = () => {
        const idx = LIFECYCLE.indexOf(dev.status);
        return idx >= 0 && idx < LIFECYCLE.length - 1 ? LIFECYCLE[idx + 1] : null;
    };
    const next = nextSt();
    const needsStore = dev.status === "pronto";

    const totalRicambiCost = dev.ricambi.reduce((s: number, r: any) => s + (r.cost || 0), 0);
    const margin = dev.sale_price - dev.purchase_price - totalRicambiCost;

    const addRicambio = () => {
        if (!newRicambio.trim()) return;
        setDev((p: any) => ({
            ...p,
            ricambi: [...p.ricambi, { name: newRicambio.trim(), stato: newRicambioInMag ? "in_magazzino" : "da_ordinare", cost: 0, data_consegna_prevista: "" }]
        }));
        setNewRicambio(""); setShowAdd(false); setNewRicambioInMag(false);
    };

    const updateRicambio = (idx: number, updated: any) => {
        setDev((p: any) => {
            const r = [...p.ricambi];
            r[idx] = updated;
            return { ...p, ricambi: r };
        });
    };

    const removeRicambio = (idx: number) => {
        setDev((p: any) => ({ ...p, ricambi: p.ricambi.filter((_: any, i: number) => i !== idx) }));
    };

    const advanceStatus = () => {
        if (needsStore && !targetStore) return;
        setDev((p: any) => {
            const u = { ...p, status: next, note_tecnico: noteTecnico };
            if (needsStore) u.target_store = targetStore;
            if (next === "in_vendita") u.listed_date = new Date();
            if (next === "venduto") u.sold_date = new Date();
            return u;
        });
    };

    const setKO = () => setDev((p: any) => ({ ...p, status: "ko", note_tecnico: noteTecnico }));
    const handleSave = () => { onSave({ ...dev, note_tecnico: noteTecnico }); };

    if (!s) return null;
    const OriginalIcon = s.icon;

    return (
        <div
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex justify-center items-start pt-10"
            onClick={onClose}
        >
            <div
                className="bg-[#161b22] border border-white/10 rounded-2xl w-[94%] max-w-5xl max-h-[85vh] overflow-auto shadow-[0_20px_60px_rgba(0,0,0,0.5)] custom-scrollbar"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex justify-between items-center px-7 py-5 border-b border-white/10 sticky top-0 bg-[#161b22] z-10 rounded-t-2xl">
                    <div>
                        <div className="flex items-center gap-3 text-lg font-bold text-white">
                            <OriginalIcon className={cn("w-5 h-5", s.colorClass)} /> {dev.model}
                        </div>
                        <div className="text-xs text-slate-400 mt-1 font-mono">IMEI: {dev.imei}</div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/20 px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors"
                            onClick={handleSave}
                        >
                            <Save className="w-4 h-4" /> Salva
                        </button>
                        <button
                            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors ml-1"
                            onClick={onClose}
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <div className="p-7">
                    <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-8">
                        {/* Left Column: Timeline */}
                        <div>
                            <div className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-slate-400" /> Stato
                            </div>
                            <div className="mb-4">
                                <StatusBadge statusKey={dev.status} />
                            </div>

                            <StatusTimeline currentStatus={dev.status} history={dev.status_history} />

                            {canAdvance && (
                                <div className="mt-6 flex flex-col gap-3">
                                    {needsStore && (
                                        <select
                                            className="bg-[#0f111a] border border-white/10 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
                                            value={targetStore}
                                            onChange={e => setTargetStore(e.target.value)}
                                        >
                                            <option value="">Seleziona Negozio di destinazione...</option>
                                            {NEGOZI.filter(n => n !== "Telefonico").map(n => <option key={n} value={n}>{n}</option>)}
                                        </select>
                                    )}

                                    {next && statusMap[next] && (
                                        <button
                                            className={cn("px-4 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 border transition-colors", statusMap[next].bgClass, statusMap[next].colorClass, statusMap[next].borderClass, `hover:bg-${statusMap[next].colorClass.split('-')[1]}-500/20`)}
                                            onClick={advanceStatus}
                                        >
                                            <ArrowRight className="w-4 h-4" />
                                            Avanza a: {statusMap[next].label}
                                        </button>
                                    )}

                                    {["in_lavorazione", "ricevuto"].includes(dev.status) && (
                                        <button
                                            className="px-4 py-2.5 bg-rose-500/10 text-rose-500 border border-rose-500/30 rounded-lg text-sm font-bold flex items-center justify-center gap-2 hover:bg-rose-500/20 transition-colors mt-2"
                                            onClick={setKO}
                                        >
                                            <XCircle className="w-4 h-4" /> Segna come KO
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Right Column: Details & Ricambi */}
                        <div className="flex flex-col gap-6 min-w-0">
                            {/* Costs and Margin */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="bg-white/[0.02] border border-white/5 p-4 rounded-xl">
                                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Registrato</div>
                                    <div className="text-white font-medium">{fmtDate(dev.created_at)}</div>
                                </div>
                                <div className="bg-white/[0.02] border border-white/5 p-4 rounded-xl">
                                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5"><CircleDollarSign className="w-3.5 h-3.5" /> Acquisto</div>
                                    <div className="text-white font-medium">{fmtEur(dev.purchase_price)}</div>
                                </div>
                                <div className="bg-white/[0.02] border border-white/5 p-4 rounded-xl">
                                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5"><Tag className="w-3.5 h-3.5" /> Vendita</div>
                                    <div className={cn("font-medium", dev.status === "venduto" ? "text-emerald-400 font-bold" : "text-slate-300")}>{fmtEur(dev.sale_price)}</div>
                                </div>
                                <div className={cn("border p-4 rounded-xl", margin > 0 ? "bg-emerald-500/10 border-emerald-500/20" : "bg-rose-500/10 border-rose-500/20")}>
                                    <div className={cn("text-[11px] font-bold uppercase tracking-wider mb-1", margin > 0 ? "text-emerald-400" : "text-rose-400")}>Margine Lor.</div>
                                    <div className={cn("font-bold text-lg", margin > 0 ? "text-emerald-400" : "text-rose-400")}>{fmtEur(margin)}</div>
                                </div>
                            </div>

                            {/* Ricambi Section */}
                            <div className="bg-[#0f111a]/50 border border-white/5 rounded-2xl p-6">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                        <Wrench className="w-4 h-4 text-purple-400" /> Ricambi & Interventi
                                    </h3>
                                    {!showAdd && (
                                        <button
                                            className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                                            onClick={() => setShowAdd(true)}
                                        >
                                            <Plus className="w-3.5 h-3.5" /> Aggiungi Ricambio
                                        </button>
                                    )}
                                </div>

                                {showAdd && (
                                    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 mb-4 flex flex-col gap-3">
                                        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Nuovo Ricambio</div>
                                        <div className="flex gap-2">
                                            <input
                                                autoFocus
                                                list="ricambi-list"
                                                className="flex-1 bg-[#0f111a] border border-white/10 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
                                                placeholder="Cerca o digita nome ricambio..."
                                                value={newRicambio}
                                                onChange={e => setNewRicambio(e.target.value)}
                                                onKeyDown={e => e.key === "Enter" && addRicambio()}
                                            />
                                            <datalist id="ricambi-list">
                                                {RICAMBI_CATALOG.map(c => <option key={c} value={c} />)}
                                            </datalist>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-300">
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 rounded bg-[#0f111a] border-white/20 text-indigo-500 focus:ring-indigo-500 cursor-pointer"
                                                    checked={newRicambioInMag}
                                                    onChange={e => setNewRicambioInMag(e.target.checked)}
                                                />
                                                Già in Magazzino
                                            </label>
                                            <div className="flex gap-2 ml-auto">
                                                <button
                                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:bg-white/5 hover:text-white transition-colors"
                                                    onClick={() => { setShowAdd(false); setNewRicambio(""); }}
                                                >
                                                    Annulla
                                                </button>
                                                <button
                                                    className="px-3 py-1.5 bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 rounded-lg text-xs font-bold transition-colors"
                                                    onClick={addRicambio}
                                                >
                                                    Aggiungi
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {dev.ricambi.length === 0 ? (
                                    <div className="py-6 text-center text-slate-500 text-sm">Nessun ricambio o intervento registrato.</div>
                                ) : (
                                    <div className="flex flex-col gap-1">
                                        {dev.ricambi.map((r: any, idx: number) => (
                                            <RicambioRow key={idx} r={r} idx={idx} onUpdate={updateRicambio} onRemove={removeRicambio} />
                                        ))}
                                    </div>
                                )}

                                {dev.ricambi.length > 0 && (
                                    <div className="mt-4 pt-3 border-t border-white/10 flex justify-between items-center px-2">
                                        <span className="text-sm font-medium text-slate-400">Costo totale Ricambi:</span>
                                        <span className="text-sm font-bold text-rose-400">{fmtEur(totalRicambiCost)}</span>
                                    </div>
                                )}
                            </div>

                            {/* Note Section */}
                            <div className="bg-[#0f111a]/50 border border-white/5 rounded-2xl p-6">
                                <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
                                    <FileText className="w-4 h-4 text-amber-400" /> Note (Amministratore & Tecnico)
                                </h3>
                                <textarea
                                    className="w-full bg-[#0f111a] border border-white/10 text-white rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 resize-y min-h-[100px] custom-scrollbar"
                                    placeholder="Aggiungi una nota interna (es. segni di usura, problemi rilevati in fase di test...)"
                                    value={noteTecnico}
                                    onChange={e => setNoteTecnico(e.target.value)}
                                />
                            </div>

                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}



function RegistraUsatoPanel({ onClose, onSave }: { onClose: () => void, onSave: (d: any) => void }) {
    const [step, setStep] = useState(1);

    // Form fields
    const [venditore, setVenditore] = useState("");
    const [negozio, setNegozio] = useState("");

    const [tipoCliente, setTipoCliente] = useState<"consumer" | "business" | "">("");
    const [searchField, setSearchField] = useState("");
    const [searchValue, setSearchValue] = useState("");
    const [clienteFound, setClienteFound] = useState<boolean | null>(null);
    const [ana, setAna] = useState({
        nome: "", cognome: "", cf: "", piva: "", email: "", cellulare: "",
        domicilio: "", ragioneSociale: "", referente: "", pec: "", sdi: "", sedeLegale: ""
    });

    const [brand, setBrand] = useState("");
    const [model, setModel] = useState("");
    const [capacita, setCapacita] = useState("");
    const [colore, setColore] = useState("");
    const [imei, setImei] = useState("");
    const [prezzoAcquisto, setPrezzoAcquisto] = useState("");
    const [gradoUsura, setGradoUsura] = useState("");

    const [allegDocumento, setAllegDocumento] = useState<string | null>(null);
    const [allegDichiarazione, setAllegDichiarazione] = useState<string | null>(null);

    const doSearch = () => {
        if (!searchValue.trim()) return;
        setClienteFound(true);
        if (tipoCliente === "consumer") {
            setAna({ ...ana, nome: "Mario", cognome: "Rossi", cf: "RSSMRA80A01H501U", email: "mario.rossi@email.com", cellulare: "333 1234567", domicilio: "Via Roma 15, 00100 Roma" });
        } else {
            setAna({ ...ana, ragioneSociale: "Rossi S.r.l.", piva: "12345678901", referente: "Mario Rossi", cellulare: "333 1234567", email: "info@rossi.it", pec: "azienda@pec.it", sdi: "Abc1234", sedeLegale: "Via Roma 15, 00100 Roma" });
        }
    };

    const doNew = () => { setClienteFound(false); };

    const canNext = () => {
        if (step === 1) return venditore && negozio;
        if (step === 2) return tipoCliente && clienteFound !== null;
        if (step === 3) return brand && model && capacita && colore && imei && prezzoAcquisto && gradoUsura;
        if (step === 4) return allegDocumento && allegDichiarazione;
        return false;
    };

    const handleSubmit = () => {
        onSave({
            venditore, negozio, tipoCliente, anagrafica: ana,
            brand, model, capacita, colore, imei, prezzo_acquisto: parseFloat(prezzoAcquisto) || 0, grado_usura: gradoUsura,
            allegati: { documento: allegDocumento, dichiarazione: allegDichiarazione }
        });
    };

    const renderStep = () => {
        if (step === 1) return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Venditore *</label>
                    <select className="w-full bg-[#0f111a] border border-white/10 text-white rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 cursor-pointer" value={venditore} onChange={e => setVenditore(e.target.value)}>
                        <option value="">Seleziona venditore...</option>
                        {VENDITORI.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Negozio *</label>
                    <select className="w-full bg-[#0f111a] border border-white/10 text-white rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 cursor-pointer" value={negozio} onChange={e => setNegozio(e.target.value)}>
                        <option value="">Seleziona negozio...</option>
                        {NEGOZI.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                </div>
            </div>
        );

        if (step === 2) return (
            <div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                    <div
                        className={cn("border rounded-xl p-5 text-center cursor-pointer transition-all", tipoCliente === "consumer" ? "border-indigo-500 bg-indigo-500/10" : "border-white/10 bg-white/[0.02] hover:bg-white/5")}
                        onClick={() => { setTipoCliente("consumer"); setClienteFound(null); setSearchValue(""); }}
                    >
                        <User className={cn("w-8 h-8 mx-auto mb-2", tipoCliente === "consumer" ? "text-indigo-400" : "text-slate-400")} />
                        <div className={cn("text-sm font-bold", tipoCliente === "consumer" ? "text-indigo-400" : "text-white")}>CONSUMER</div>
                        <div className="text-xs text-slate-400 mt-1">Persona fisica</div>
                    </div>
                    <div
                        className={cn("border rounded-xl p-5 text-center cursor-pointer transition-all", tipoCliente === "business" ? "border-indigo-500 bg-indigo-500/10" : "border-white/10 bg-white/[0.02] hover:bg-white/5")}
                        onClick={() => { setTipoCliente("business"); setClienteFound(null); setSearchValue(""); }}
                    >
                        <Building2 className={cn("w-8 h-8 mx-auto mb-2", tipoCliente === "business" ? "text-indigo-400" : "text-slate-400")} />
                        <div className={cn("text-sm font-bold", tipoCliente === "business" ? "text-indigo-400" : "text-white")}>BUSINESS</div>
                        <div className="text-xs text-slate-400 mt-1">Azienda / P.IVA</div>
                    </div>
                </div>

                {tipoCliente && (
                    <div>
                        <div className="text-xs font-semibold text-slate-400 uppercase mb-3">Verifica anagrafica esistente</div>
                        <div className="flex flex-col sm:flex-row gap-3 mb-6">
                            <select
                                className="w-full sm:w-[180px] bg-[#0f111a] border border-white/10 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500"
                                value={searchField} onChange={e => setSearchField(e.target.value)}
                            >
                                <option value="">Ricerca tramite...</option>
                                <option value="cf">{tipoCliente === "consumer" ? "Codice Fiscale" : "Partita IVA"}</option>
                                <option value="tel">Cellulare</option>
                                <option value="email">Email</option>
                            </select>
                            <input
                                className="flex-1 bg-[#0f111a] border border-white/10 text-white rounded-lg px-4 py-2 text-sm outline-none focus:border-indigo-500"
                                placeholder={`Inserisci ${searchField === 'cf' ? (tipoCliente === 'consumer' ? 'codice fiscale' : 'partita iva') : (searchField === 'tel' ? 'cellulare' : 'valore')}...`}
                                value={searchValue} onChange={e => setSearchValue(e.target.value)} disabled={!searchField}
                                onKeyDown={e => e.key === "Enter" && doSearch()}
                            />
                            <div className="flex gap-2">
                                <button
                                    className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
                                    onClick={doSearch} disabled={!searchField || !searchValue.trim()}
                                >
                                    <Search className="w-4 h-4" /> Cerca
                                </button>
                                {clienteFound === null && (
                                    <button
                                        className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap"
                                        onClick={doNew}
                                    >
                                        Nuovo Cliente
                                    </button>
                                )}
                            </div>
                        </div>

                        {clienteFound === true && (
                            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl mb-4">
                                <div className="text-sm font-bold text-emerald-400 flex items-center gap-2 mb-4">
                                    <CheckCircle2 className="w-5 h-5" /> Cliente trovato! Dati pre-compilati.
                                </div>
                                {tipoCliente === "consumer" ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div><label className="block text-xs font-semibold text-slate-400 mb-1">Nome *</label><input className="w-full bg-[#0f111a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={ana.nome} onChange={e => setAna({ ...ana, nome: e.target.value })} /></div>
                                        <div><label className="block text-xs font-semibold text-slate-400 mb-1">Cognome *</label><input className="w-full bg-[#0f111a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={ana.cognome} onChange={e => setAna({ ...ana, cognome: e.target.value })} /></div>
                                        <div><label className="block text-xs font-semibold text-slate-400 mb-1">Codice Fiscale *</label><input className="w-full bg-[#0f111a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={ana.cf} onChange={e => setAna({ ...ana, cf: e.target.value })} /></div>
                                        <div><label className="block text-xs font-semibold text-slate-400 mb-1">Email</label><input className="w-full bg-[#0f111a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={ana.email} onChange={e => setAna({ ...ana, email: e.target.value })} /></div>
                                        <div><label className="block text-xs font-semibold text-slate-400 mb-1">Cellulare</label><input className="w-full bg-[#0f111a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={ana.cellulare} onChange={e => setAna({ ...ana, cellulare: e.target.value })} /></div>
                                        <div><label className="block text-xs font-semibold text-slate-400 mb-1">Domicilio</label><input className="w-full bg-[#0f111a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={ana.domicilio} onChange={e => setAna({ ...ana, domicilio: e.target.value })} /></div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div><label className="block text-xs font-semibold text-slate-400 mb-1">Ragione Sociale *</label><input className="w-full bg-[#0f111a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={ana.ragioneSociale} onChange={e => setAna({ ...ana, ragioneSociale: e.target.value })} /></div>
                                        <div><label className="block text-xs font-semibold text-slate-400 mb-1">Partita IVA *</label><input className="w-full bg-[#0f111a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={ana.piva} onChange={e => setAna({ ...ana, piva: e.target.value })} /></div>
                                        <div><label className="block text-xs font-semibold text-slate-400 mb-1">Referente *</label><input className="w-full bg-[#0f111a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={ana.referente} onChange={e => setAna({ ...ana, referente: e.target.value })} /></div>
                                        <div><label className="block text-xs font-semibold text-slate-400 mb-1">Cellulare</label><input className="w-full bg-[#0f111a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={ana.cellulare} onChange={e => setAna({ ...ana, cellulare: e.target.value })} /></div>
                                        <div><label className="block text-xs font-semibold text-slate-400 mb-1">Email</label><input className="w-full bg-[#0f111a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={ana.email} onChange={e => setAna({ ...ana, email: e.target.value })} /></div>
                                        <div><label className="block text-xs font-semibold text-slate-400 mb-1">PEC</label><input className="w-full bg-[#0f111a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={ana.pec} onChange={e => setAna({ ...ana, pec: e.target.value })} /></div>
                                        <div><label className="block text-xs font-semibold text-slate-400 mb-1">SDI</label><input className="w-full bg-[#0f111a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={ana.sdi} onChange={e => setAna({ ...ana, sdi: e.target.value })} /></div>
                                        <div><label className="block text-xs font-semibold text-slate-400 mb-1">Sede Legale</label><input className="w-full bg-[#0f111a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={ana.sedeLegale} onChange={e => setAna({ ...ana, sedeLegale: e.target.value })} /></div>
                                    </div>
                                )}
                            </div>
                        )}

                        {clienteFound === false && (
                            <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                                <div className="text-sm font-bold text-blue-400 flex items-center gap-2 mb-4">
                                    <User className="w-5 h-5" /> Nuovo cliente — compila i dati
                                </div>
                                {tipoCliente === "consumer" ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div><label className="block text-xs font-semibold text-slate-400 mb-1">Nome *</label><input className="w-full bg-[#0f111a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" placeholder="es. Mario" value={ana.nome} onChange={e => setAna({ ...ana, nome: e.target.value })} /></div>
                                        <div><label className="block text-xs font-semibold text-slate-400 mb-1">Cognome *</label><input className="w-full bg-[#0f111a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" placeholder="es. Rossi" value={ana.cognome} onChange={e => setAna({ ...ana, cognome: e.target.value })} /></div>
                                        <div><label className="block text-xs font-semibold text-slate-400 mb-1">Codice Fiscale *</label><input className="w-full bg-[#0f111a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" placeholder="RSSMRA80A01H501U" value={ana.cf} onChange={e => setAna({ ...ana, cf: e.target.value })} /></div>
                                        <div><label className="block text-xs font-semibold text-slate-400 mb-1">Email</label><input className="w-full bg-[#0f111a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" placeholder="mario@email.com" value={ana.email} onChange={e => setAna({ ...ana, email: e.target.value })} /></div>
                                        <div><label className="block text-xs font-semibold text-slate-400 mb-1">Cellulare</label><input className="w-full bg-[#0f111a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" placeholder="333 1234567" value={ana.cellulare} onChange={e => setAna({ ...ana, cellulare: e.target.value })} /></div>
                                        <div><label className="block text-xs font-semibold text-slate-400 mb-1">Domicilio</label><input className="w-full bg-[#0f111a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" placeholder="Via, CAP, Città" value={ana.domicilio} onChange={e => setAna({ ...ana, domicilio: e.target.value })} /></div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div><label className="block text-xs font-semibold text-slate-400 mb-1">Ragione Sociale *</label><input className="w-full bg-[#0f111a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" placeholder="Azienda S.r.l." value={ana.ragioneSociale} onChange={e => setAna({ ...ana, ragioneSociale: e.target.value })} /></div>
                                        <div><label className="block text-xs font-semibold text-slate-400 mb-1">Partita IVA *</label><input className="w-full bg-[#0f111a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" placeholder="12345678901" value={ana.piva} onChange={e => setAna({ ...ana, piva: e.target.value })} /></div>
                                        <div><label className="block text-xs font-semibold text-slate-400 mb-1">Referente *</label><input className="w-full bg-[#0f111a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" placeholder="Nome Cognome" value={ana.referente} onChange={e => setAna({ ...ana, referente: e.target.value })} /></div>
                                        <div><label className="block text-xs font-semibold text-slate-400 mb-1">Cellulare</label><input className="w-full bg-[#0f111a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" placeholder="333 1234567" value={ana.cellulare} onChange={e => setAna({ ...ana, cellulare: e.target.value })} /></div>
                                        <div><label className="block text-xs font-semibold text-slate-400 mb-1">Email</label><input className="w-full bg-[#0f111a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" placeholder="info@azienda.it" value={ana.email} onChange={e => setAna({ ...ana, email: e.target.value })} /></div>
                                        <div><label className="block text-xs font-semibold text-slate-400 mb-1">PEC</label><input className="w-full bg-[#0f111a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" placeholder="azienda@pec.it" value={ana.pec} onChange={e => setAna({ ...ana, pec: e.target.value })} /></div>
                                        <div><label className="block text-xs font-semibold text-slate-400 mb-1">SDI</label><input className="w-full bg-[#0f111a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={ana.sdi} onChange={e => setAna({ ...ana, sdi: e.target.value })} /></div>
                                        <div><label className="block text-xs font-semibold text-slate-400 mb-1">Sede Legale</label><input className="w-full bg-[#0f111a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" placeholder="Via, CAP, Città" value={ana.sedeLegale} onChange={e => setAna({ ...ana, sedeLegale: e.target.value })} /></div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        );

        if (step === 3) return (
            <div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Brand *</label>
                        <select className="w-full bg-[#0f111a] border border-white/10 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500" value={brand} onChange={e => { setBrand(e.target.value); setModel(""); }}>
                            <option value="">Seleziona brand...</option>
                            {Object.keys(PHONE_BRANDS_MODELS).map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Modello *</label>
                        <select className="w-full bg-[#0f111a] border border-white/10 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500" value={model} onChange={e => setModel(e.target.value)} disabled={!brand}>
                            <option value="">Seleziona modello...</option>
                            {brand && PHONE_BRANDS_MODELS[brand] && PHONE_BRANDS_MODELS[brand].map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Capacità (GB) *</label>
                        <select className="w-full bg-[#0f111a] border border-white/10 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500" value={capacita} onChange={e => setCapacita(e.target.value)}>
                            <option value="">Seleziona...</option>
                            {CAPACITA_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Colore *</label>
                        <select className="w-full bg-[#0f111a] border border-white/10 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500" value={colore} onChange={e => setColore(e.target.value)}>
                            <option value="">Seleziona...</option>
                            {COLORI_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">IMEI *</label>
                        <input className="w-full bg-[#0f111a] border border-white/10 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500" value={imei} onChange={e => setImei(e.target.value)} placeholder="353456789012345" maxLength={15} />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Prezzo Acquisto (€) *</label>
                        <input type="number" step="1" min="0" className="w-full bg-[#0f111a] border border-white/10 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500" value={prezzoAcquisto} onChange={e => setPrezzoAcquisto(e.target.value)} placeholder="es. 250" />
                    </div>
                </div>

                <div className="mt-6">
                    <label className="block text-xs font-semibold text-slate-400 uppercase mb-2">Grado di Usura *</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {GRADI_USURA.map(g => (
                            <div
                                key={g.key}
                                className={cn("border rounded-xl p-3 cursor-pointer transition-colors", gradoUsura === g.key ? "border-indigo-500 bg-indigo-500/10" : "border-white/10 bg-white/[0.02] hover:bg-white/5")}
                                onClick={() => setGradoUsura(g.key)}
                            >
                                <div className={cn("text-[13px] font-bold", gradoUsura === g.key ? "text-indigo-400" : "text-white")}>{g.label}</div>
                                <div className="text-[11px] text-slate-400 mt-0.5">{g.desc}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );

        if (step === 4) return (
            <div className="flex flex-col gap-5">
                <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase mb-2">Documento di Identità *</label>
                    <div
                        className={cn("border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors", allegDocumento ? "border-emerald-500 bg-emerald-500/10" : "border-white/10 hover:border-white/30")}
                        onClick={() => setAllegDocumento(allegDocumento ? null : "documento_id.pdf")}
                    >
                        {allegDocumento ? (
                            <div>
                                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                                <div className="text-[13px] font-bold text-emerald-500 mt-2">Documento caricato</div>
                                <div className="text-[11px] text-slate-400 mt-1">{allegDocumento}</div>
                            </div>
                        ) : (
                            <div>
                                <FileText className="w-8 h-8 text-slate-500 mx-auto" />
                                <div className="text-[13px] font-semibold text-slate-400 mt-2">Clicca per caricare il documento</div>
                                <div className="text-[11px] text-slate-500 mt-1">PDF, JPG, PNG</div>
                            </div>
                        )}
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase mb-2">Dichiarazione di Vendita (firmata) *</label>
                    <div
                        className={cn("border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors", allegDichiarazione ? "border-emerald-500 bg-emerald-500/10" : "border-white/10 hover:border-white/30")}
                        onClick={() => setAllegDichiarazione(allegDichiarazione ? null : "dichiarazione_vendita.pdf")}
                    >
                        {allegDichiarazione ? (
                            <div>
                                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                                <div className="text-[13px] font-bold text-emerald-500 mt-2">Dichiarazione caricata</div>
                                <div className="text-[11px] text-slate-400 mt-1">{allegDichiarazione}</div>
                            </div>
                        ) : (
                            <div>
                                <FileText className="w-8 h-8 text-slate-500 mx-auto" />
                                <div className="text-[13px] font-semibold text-slate-400 mt-2">Clicca per caricare la dichiarazione firmata</div>
                                <div className="text-[11px] text-slate-500 mt-1">PDF, JPG, PNG</div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );

        return null;
    };

    const STEP_LABELS = ["Venditore e Negozio", "Anagrafica Cliente", "Dettaglio Prodotto", "Allegati"];

    return (
        <div
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex justify-center items-start pt-10"
            onClick={onClose}
        >
            <div
                className="bg-[#161b22] border border-white/10 rounded-2xl w-[94%] max-w-4xl max-h-[85vh] overflow-auto shadow-[0_20px_60px_rgba(0,0,0,0.5)] custom-scrollbar flex flex-col"
                onClick={e => e.stopPropagation()}
                style={{ height: '700px' }}
            >
                {/* Header */}
                <div className="flex justify-between items-center px-7 py-5 border-b border-white/10 sticky top-0 bg-[#161b22] z-10 shrink-0 rounded-t-2xl">
                    <div className="flex items-center gap-3 text-lg font-bold text-white">
                        <Smartphone className="w-5 h-5 text-indigo-400" /> Registra Usato
                    </div>
                    <button
                        className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
                        onClick={onClose}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Stepper */}
                <div className="flex justify-center flex-wrap gap-2 sm:gap-4 px-4 py-6 bg-[#0f111a]/30 shrink-0">
                    {STEP_LABELS.map((label, i) => (
                        <div key={i} className="flex items-center gap-2 sm:gap-4">
                            {i > 0 && <div className={cn("w-4 sm:w-8 h-0.5", step > i ? "bg-indigo-500" : "bg-white/10")} />}
                            <div className="flex items-center gap-2 sm:gap-3">
                                <div className={cn(
                                    "w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors",
                                    step > i + 1 ? "bg-indigo-500 border-indigo-500 text-white" : (step === i + 1 ? "bg-indigo-500/20 border-indigo-500 text-indigo-400" : "bg-[#0f111a] border-white/10 text-slate-500")
                                )}>
                                    {step > i + 1 ? <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[3]" /> : i + 1}
                                </div>
                                <span className={cn("text-[10px] sm:text-[11px] whitespace-nowrap", step >= i + 1 ? (step === i + 1 ? "font-bold text-white" : "font-medium text-slate-300") : "text-slate-500")}>{label}</span>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Body */}
                <div className="p-7 flex-1 min-h-[300px]">
                    {renderStep()}
                </div>

                {/* Footer */}
                <div className="flex justify-between items-center px-7 py-5 border-t border-white/10 shrink-0 mt-auto">
                    <div>
                        {step > 1 && (
                            <button
                                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-400 hover:bg-white/5 border border-white/10 hover:text-white transition-colors flex items-center gap-2"
                                onClick={() => setStep(step - 1)}
                            >
                                <ArrowLeft className="w-4 h-4" /> Indietro
                            </button>
                        )}
                    </div>
                    <div>
                        {step < 4 ? (
                            <button
                                className={cn("px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors", canNext() ? "bg-indigo-500 hover:bg-indigo-600 text-white" : "bg-white/5 text-slate-500 border border-white/5 shadow-none opacity-60 cursor-not-allowed")}
                                onClick={() => canNext() && setStep(step + 1)}
                            >
                                Avanti <ArrowRight className="w-4 h-4" />
                            </button>
                        ) : (
                            <button
                                className={cn("px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors shadow-lg", canNext() ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20" : "bg-white/5 text-slate-500 border border-white/5 shadow-none opacity-60 cursor-not-allowed")}
                                onClick={() => canNext() && handleSubmit()}
                            >
                                <CheckCircle2 className="w-4 h-4" /> Registra Usato
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// --- Main Page Component ---
export default function GestioneUsatiPage() {
    const { user } = useAuth();

    // State
    const [devices, setDevices] = useState<any[]>(MOCK_DEVICES);
    const [selectedStores, setSelectedStores] = useState<string[]>([...NEGOZI]);
    const [selectedStatuses, setSelectedStatuses] = useState<string[]>([...STATUS_KEYS]);
    const [dateField, setDateField] = useState("created_at");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [searchText, setSearchText] = useState("");

    const [selectedDevice, setSelectedDevice] = useState<any | null>(null);
    const [showRegistra, setShowRegistra] = useState(false);

    const [sortKey, setSortKey] = useState("id");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

    // Memoized filtering
    const filtered = useMemo(() => devices.filter(d => {
        if (!selectedStores.includes(d.store)) return false;
        if (!selectedStatuses.includes(d.status)) return false;
        if (dateFrom) { const v = d[dateField]; if (!v || isoDate(v) < dateFrom) return false; }
        if (dateTo) { const v = d[dateField]; if (!v || isoDate(v) > dateTo) return false; }
        if (searchText) {
            const q = searchText.toLowerCase();
            if (!d.model.toLowerCase().includes(q) && !d.imei.includes(q)) return false;
        }
        return true;
    }), [devices, selectedStores, selectedStatuses, dateField, dateFrom, dateTo, searchText]);

    // KPI Calcs
    const inCirculation = useMemo(() => devices.filter(d => d.status !== "venduto" && d.status !== "ko"), [devices]);
    const inVetrina = useMemo(() => devices.filter(d => d.status === "in_vendita"), [devices]);

    const vetrinaValue = useMemo(() => inVetrina.reduce((s, d) => s + d.sale_price, 0), [inVetrina]);
    const totalInventoryValue = useMemo(() => inCirculation.reduce((s, d) => s + d.sale_price, 0), [inCirculation]);

    const kpiData = useMemo(() => {
        const c: Record<string, number> = {};
        STATUS_KEYS.forEach(k => c[k] = 0);
        filtered.forEach(d => { c[d.status] = (c[d.status] || 0) + 1; });
        c._total = filtered.filter(d => d.status !== "venduto" && d.status !== "ko").length;
        return c;
    }, [filtered]);

    // Sorting
    const sorted = useMemo(() => [...filtered].sort((a, b) => {
        let va = a[sortKey], vb = b[sortKey];
        if (va instanceof Date) va = va.getTime();
        if (vb instanceof Date) vb = vb.getTime();
        if (va == null) return 1;
        if (vb == null) return -1;
        const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb));
        return sortDir === "asc" ? cmp : -cmp;
    }), [filtered, sortKey, sortDir]);

    const doSort = (key: string) => {
        if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
        else { setSortKey(key); setSortDir("asc"); }
    };

    const handleKpiClick = (sk: string) => {
        const isAllActive = selectedStatuses.length === STATUS_KEYS.length - 2 && !selectedStatuses.includes("venduto") && !selectedStatuses.includes("ko");
        const isSingleActive = selectedStatuses.length === 1 && selectedStatuses[0] === sk;
        if (sk === "_all") {
            if (isAllActive) setSelectedStatuses([...STATUS_KEYS]);
            else setSelectedStatuses(STATUS_KEYS.filter(k => k !== "venduto" && k !== "ko"));
        } else {
            if (isSingleActive) setSelectedStatuses([...STATUS_KEYS]);
            else setSelectedStatuses([sk]);
        }
    };

    const resetFilters = () => {
        setSelectedStores([...NEGOZI]);
        setSelectedStatuses([...STATUS_KEYS]);
        setDateField("created_at");
        setDateFrom("");
        setDateTo("");
        setSearchText("");
    };

    return (
        <div className="flex flex-col min-h-[calc(100vh-theme(spacing.16))] lg:h-screen lg:overflow-hidden lg:pl-64 w-full overflow-x-hidden min-w-0 max-w-full">
            {/* Header Area */}
            <div className="flex-none p-4 lg:p-8 space-y-6 w-full min-w-0 max-w-full">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                            <div className="p-2 bg-indigo-500/10 rounded-lg">
                                <Smartphone className="w-6 h-6 text-indigo-400" />
                            </div>
                            Gestione Usati
                        </h1>
                        <p className="text-slate-400 mt-1">Gestione completa dell'inventario dispositivi usati</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                        <div className="glass-card px-5 py-3 rounded-xl min-w-[140px]">
                            <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-1">Valore Inventario</p>
                            <p className="text-2xl font-bold text-white">{fmtEur(totalInventoryValue)}</p>
                            <p className="text-xs text-slate-400 mt-1">{inCirculation.length} dispositivi</p>
                        </div>
                        <div className="bg-indigo-500/10 border border-indigo-500/20 px-5 py-3 rounded-xl min-w-[140px]">
                            <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1">Valore Vetrina</p>
                            <p className="text-2xl font-bold text-white">{fmtEur(vetrinaValue)}</p>
                            <p className="text-xs text-indigo-400/80 mt-1">{inVetrina.length} in vendita</p>
                        </div>
                        <button
                            className="bg-indigo-500 hover:bg-indigo-600 text-white px-5 py-3 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
                            onClick={() => setShowRegistra(true)}
                        >
                            <Plus className="w-5 h-5 stroke-[2.5]" />
                            Registra Usato
                        </button>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-4">
                        <div className="w-full xl:w-auto flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <MultiSelect
                                label="Negozio"
                                options={NEGOZI}
                                selected={selectedStores}
                                onChange={setSelectedStores}
                            />

                            <MultiSelect
                                label="Stato"
                                options={STATUS_KEYS}
                                selected={selectedStatuses}
                                onChange={setSelectedStatuses}
                                renderOption={(opt) => {
                                    const s = statusMap[opt];
                                    if (!s) return <>{opt}</>;
                                    const Icon = s.icon;
                                    return (
                                        <span className="flex items-center gap-1.5">
                                            <Icon className={cn("w-3.5 h-3.5", s.colorClass)} />
                                            {s.label}
                                        </span>
                                    );
                                }}
                            />

                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Cerca</label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                    <input
                                        type="text"
                                        value={searchText}
                                        onChange={(e) => setSearchText(e.target.value)}
                                        className="w-full bg-[#0f111a] border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors h-[38px]"
                                        placeholder="Modello o IMEI..."
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Filtra per Data</label>
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <select
                                        value={dateField}
                                        onChange={e => setDateField(e.target.value)}
                                        className="w-full sm:w-1/3 bg-[#0f111a] border border-white/10 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 h-[38px]"
                                    >
                                        {DATE_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                                    </select>
                                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full sm:w-1/3 bg-[#0f111a] border border-white/10 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 h-[38px]" />
                                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full sm:w-1/3 bg-[#0f111a] border border-white/10 rounded-lg px-2 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 h-[38px]" />
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 w-full xl:w-auto justify-end">
                            <button
                                onClick={resetFilters}
                                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-white/5 border border-white/10 transition-colors h-[38px] whitespace-nowrap"
                            >
                                Reset Filtri
                            </button>
                            <button
                                onClick={() => setShowRegistra(true)}
                                className="px-5 py-2 rounded-lg text-sm font-medium text-white bg-green-600 hover:bg-green-500 transition-colors flex items-center gap-2 shadow-lg shadow-green-500/20 h-[38px] whitespace-nowrap"
                            >
                                <Plus className="w-4 h-4 shrink-0" />
                                Registra Usato
                            </button>
                        </div>
                    </div>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                    {KPI_CARDS.map(c => {
                        const val = c.key === "_all" ? kpiData._total : (kpiData[c.key] || 0);
                        const isActive = c.key === "_all"
                            ? (selectedStatuses.length === STATUS_KEYS.length - 2 && !selectedStatuses.includes("venduto") && !selectedStatuses.includes("ko"))
                            : selectedStatuses.length === 1 && selectedStatuses[0] === c.key;

                        const Icon = c.icon;

                        return (
                            <button
                                key={c.key}
                                onClick={() => handleKpiClick(c.key)}
                                className={cn(
                                    "glass-card p-4 text-left transition-all duration-200 border group",
                                    isActive ? `border-${c.colorClass.split('-')[1]}-500/50 ${c.bgClass}` : "border-white/5 hover:border-white/20 hover:bg-white/5"
                                )}
                            >
                                <div className={cn("text-2xl font-bold mb-2", c.colorClass)}>{val}</div>
                                <div className="text-sm text-slate-400 font-medium flex items-center gap-2">
                                    <Icon className={cn("w-4 h-4", c.colorClass)} />
                                    {c.label}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Table Area */}
            <div className="flex-1 px-4 lg:px-8 pb-8 flex flex-col w-full min-w-0 max-w-full lg:overflow-hidden min-h-[400px]">
                <div className="glass-card flex-1 flex flex-col w-full min-w-0 max-w-full lg:overflow-hidden">
                    <div className="overflow-x-auto lg:overflow-y-auto flex-1 custom-scrollbar w-full min-w-0 max-w-full">
                        {/* Mobile List View */}
                        <div className="md:hidden flex flex-col divide-y divide-white/5">
                            {sorted.length === 0 ? (
                                <div className="p-8 text-center text-slate-400 text-sm">Nessun dispositivo trovato</div>
                            ) : (
                                sorted.map((d) => {
                                    const stat = statusMap[d.status];
                                    const StatIcon = stat?.icon;

                                    return (
                                        <div
                                            key={d.id}
                                            onClick={() => setSelectedDevice(d)}
                                            className="p-4 hover:bg-white/[0.02] cursor-pointer transition-colors flex flex-col gap-3"
                                        >
                                            <div className="flex justify-between items-start gap-2">
                                                <div className="min-w-0">
                                                    <div className="font-bold text-white text-[15px] truncate">{d.model}</div>
                                                    <div className="font-mono text-slate-400 text-[11px] mt-0.5 truncate">{d.imei}</div>
                                                </div>
                                                {stat && (
                                                    <span className={cn("inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[9px] font-bold border shrink-0", stat.colorClass, stat.bgClass, stat.borderClass)}>
                                                        <StatIcon className="w-2.5 h-2.5" />
                                                        {stat.label}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="grid grid-cols-2 gap-y-2 gap-x-4 bg-[#0f111a]/50 rounded-xl p-3 border border-white/5">
                                                <div>
                                                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Acquisto</div>
                                                    <div className="text-sm font-medium text-slate-300">{fmtEur(d.purchase_price)}</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Vendita</div>
                                                    <div className="text-sm font-bold text-emerald-400">{fmtEur(d.sale_price)}</div>
                                                </div>
                                                <div>
                                                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Negozio</div>
                                                    <div className="text-xs font-medium text-slate-400 truncate">{d.store}</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Data</div>
                                                    <div className="text-xs font-medium text-slate-400 truncate">{fmtDate(d.created_at)}</div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Desktop Table View */}
                        <table className="hidden md:table w-full text-left border-collapse min-w-[1000px] whitespace-nowrap text-sm">
                            <thead className="sticky top-0 z-10 bg-[#0f111a]/95 backdrop-blur-xl border-b border-white/10 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                <tr>
                                    <th className="px-6 py-4 font-semibold text-slate-400 cursor-pointer hover:text-white" onClick={() => doSort("id")}>#</th>
                                    <th className="px-6 py-4 font-semibold text-slate-400 cursor-pointer hover:text-white" onClick={() => doSort("model")}>Modello</th>
                                    <th className="px-6 py-4 font-semibold text-slate-400 cursor-pointer hover:text-white" onClick={() => doSort("imei")}>IMEI</th>
                                    <th className="px-6 py-4 font-semibold text-slate-400 cursor-pointer hover:text-white" onClick={() => doSort("status")}>Stato</th>
                                    <th className="px-6 py-4 font-semibold text-slate-400 cursor-pointer hover:text-white text-right" onClick={() => doSort("purchase_price")}>Acquisto</th>
                                    <th className="px-6 py-4 font-semibold text-slate-400 cursor-pointer hover:text-white text-right" onClick={() => doSort("sale_price")}>Vendita</th>
                                    <th className="px-6 py-4 font-semibold text-slate-400 cursor-pointer hover:text-white" onClick={() => doSort("store")}>Negozio</th>
                                    <th className="px-6 py-4 font-semibold text-slate-400 cursor-pointer hover:text-white" onClick={() => doSort("created_at")}>Data Reg.</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 text-sm">
                                {sorted.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="px-6 py-12 text-center text-slate-400">Nessun dispositivo trovato</td>
                                    </tr>
                                ) : (
                                    sorted.map((d, i) => {
                                        const stat = statusMap[d.status];
                                        const StatIcon = stat?.icon;

                                        return (
                                            <tr
                                                key={d.id}
                                                onClick={() => setSelectedDevice(d)}
                                                className="hover:bg-white/[0.02] cursor-pointer transition-colors"
                                            >
                                                <td className="px-6 py-4 text-slate-500">{d.id}</td>
                                                <td className="px-6 py-4 font-medium text-white">{d.model}</td>
                                                <td className="px-6 py-4 font-mono text-slate-400">{d.imei}</td>
                                                <td className="px-6 py-4">
                                                    {stat && (
                                                        <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border", stat.colorClass, stat.bgClass, stat.borderClass)}>
                                                            <StatIcon className="w-3.5 h-3.5" />
                                                            {stat.label}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-right text-slate-400">{fmtEur(d.purchase_price)}</td>
                                                <td className="px-6 py-4 text-right font-medium text-emerald-400">{fmtEur(d.sale_price)}</td>
                                                <td className="px-6 py-4 text-slate-300">{d.store}</td>
                                                <td className="px-6 py-4 text-slate-400">{fmtDate(d.created_at)}</td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="p-4 border-t border-white/5 text-xs text-slate-500 bg-[#0f111a]/50">
                        Mostrando <span className="text-white font-medium">{sorted.length}</span> dispositivi
                    </div>
                </div>
            </div>

            {selectedDevice && (
                <DevicePanel
                    device={selectedDevice}
                    onClose={() => setSelectedDevice(null)}
                    onSave={(updatedDev) => {
                        setDevices(prev => prev.map(d => d.id === updatedDev.id ? updatedDev : d));
                        setSelectedDevice(null);
                    }}
                />
            )}

            {showRegistra && (
                <RegistraUsatoPanel
                    onClose={() => setShowRegistra(false)}
                    onSave={(newDev) => {
                        setDevices(prev => [{
                            id: `P${Math.floor(Math.random() * 10000)}`,
                            model: newDev.model,
                            imei: newDev.imei,
                            status: "invio_in_negozio",
                            purchase_price: newDev.prezzo_acquisto,
                            sale_price: newDev.prezzo_acquisto * 1.5,
                            store: newDev.negozio,
                            created_at: new Date().toISOString(),
                            target_store: newDev.negozio,
                            ricambi: [],
                            grado_usura: newDev.grado_usura
                        }, ...prev]);
                        setShowRegistra(false);
                    }}
                />
            )}
        </div>
    );
}
