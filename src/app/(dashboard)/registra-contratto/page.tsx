"use client";

import { useState, useRef } from "react";
import { Search, UserCheck, UserPlus, Upload, X, ChevronRight, CheckCircle, Plus, Trash2 } from "lucide-react";
import { cn } from "@/utils";

// ─── TYPES ──────────────────────────────────────────────────────────────────

interface SubCategory {
    id: string;
    title: string;
    hasContract: boolean;
    fields: { label: string; values: string[] }[];
}

interface Category {
    id: string;
    title: string;
    icon: string;
    color: string; // accent color (used for borders/labels only — dark theme)
    subs: SubCategory[];
}

interface ContractFieldDef {
    icon: string;
    title: string;
    render: (ctx: ContractCtx) => React.ReactNode;
}

interface ContractCtx {
    hasGaInSameSale: boolean;
    inheritedCode: string;
    codeValue?: string;
    onCodeChange?: (v: string) => void;
}

interface BrandConfig {
    id: string;
    name: string;
    logo: string; // emoji or short text
    color: string;
    available: boolean;
    categories: Category[];
    contractFields: Record<string, ContractFieldDef>;
    stores: string[];
    operatorCodes: string[];
}

// ─── WINDTRE CONFIG ──────────────────────────────────────────────────────────

const W3_STORES = ["Magliana", "Libia", "San Paolo", "Mazzini", "Donna", "Promontori", "Collatina", "Garbatella", "Acilia", "Baleniere", "Castani", "Merulana", "Telefonico"];
const W3_CODES = ["Magliana", "Libia", "San Paolo", "Mazzini", "Donna", "Promontori", "Collatina"];

const W3_CATEGORIES: Category[] = [
    {
        id: "mobile", title: "MOBILE", icon: "📱", color: "#60a5fa",
        subs: [
            {
                id: "ga", title: "Mobile (GA)", hasContract: true, fields: [
                    { label: "Offerta Mobile", values: ["Ricaricabile < 8", "Ricaricabile da 8 a 10", "Ricaricabile da 10 a 12", "Ricaricabile >12", "Smart Pack 16,99", "E.P Family S.S.M", "E.P Family S.S.F 7,99", "E.P Family S.S.F 9,99", "E.P Voce", "E.P Start", "E.P Full", "E.P Super", "E.P Di Più Unlimited", "E.P Local 7,99", "E.P Giga Special", "E.P CYC Super", "E.P CYC Full", "E.P Cube Lite", "E.P Cube Full", "FWA Indoor"] }
                ]
            },
            {
                id: "tnp_ga", title: "TNP GA", hasContract: true, fields: [
                    { label: "TNP GA", values: ["Telefono Cash", "Rata", "Rata 5G", "Finanziamento 5G > 600€", "Finanziamento 5G < 600€"] }
                ]
            },
            {
                id: "tnp_cb", title: "TNP CB", hasContract: true, fields: [
                    { label: "TNP CB", values: ["Rata 0", "Finanziamento 0", "Rata >0", "Finanziamento > 0"] }
                ]
            },
            {
                id: "cambio", title: "Cambio Offerta", hasContract: false, fields: [
                    { label: "Tipo Cambio", values: ["Caring", "CL1", "CL1 EP", "CL2", "CL2 EP", "CL3", "CL3 EP", "Migrazione FTTH"] }
                ]
            },
            {
                id: "reload", title: "Reload", hasContract: false, fields: [
                    { label: "Tipologia Reload", values: ["Reload", "Reload CB", "Reload Plus", "Reload Forever", "Reload Exchange"] }
                ]
            },
            {
                id: "addon", title: "Add-on", hasContract: false, fields: [
                    { label: "Add-on", values: ["Add-on", "Security GA", "Security CB", "Security Pro GA", "Security Pro CB", "Security Fisso CB", "Netflix Fisso CB"] }
                ]
            },
        ]
    },
    {
        id: "fisso", title: "FISSO", icon: "🏠", color: "#34d399",
        subs: [
            {
                id: "fisso_off", title: "Offerta Fisso", hasContract: true, fields: [
                    { label: "Offerta Fisso", values: ["Fisso", "Fisso Bollettino", "Fisso CONV", "FWA Outdoor"] }
                ]
            },
            {
                id: "addon_fisso", title: "Add-on Fisso (max 5)", hasContract: false, fields: [
                    { label: "Add-on 1", values: ["FritzBox", "Seconda Linea", "GNP", "Chiamate Illimitate", "Home Protect", "Netflix"] },
                    { label: "Add-on 2", values: ["FritzBox", "Seconda Linea", "GNP", "Chiamate Illimitate", "Home Protect", "Netflix"] },
                    { label: "Add-on 3", values: ["FritzBox", "Seconda Linea", "GNP", "Chiamate Illimitate", "Home Protect", "Netflix"] },
                    { label: "Add-on 4", values: ["FritzBox", "Seconda Linea", "GNP", "Chiamate Illimitate", "Home Protect", "Netflix"] },
                    { label: "Add-on 5", values: ["FritzBox", "Seconda Linea", "GNP", "Chiamate Illimitate", "Home Protect", "Netflix"] },
                ]
            },
        ]
    },
    {
        id: "luce_gas", title: "LUCE E GAS", icon: "💡", color: "#fb923c",
        subs: [
            {
                id: "luce_gas_off", title: "WindTre Luce&Gas", hasContract: true, fields: [
                    { label: "Tipologia fornitura", values: ["Luce Bollettino", "Gas Bollettino", "Luce RID", "Gas RID"] }
                ]
            },
        ]
    },
    {
        id: "multi", title: "MULTI-SERVIZI", icon: "🛡️", color: "#a78bfa",
        subs: [
            {
                id: "assicurazioni", title: "Assicurazioni", hasContract: false, fields: [
                    { label: "Assicurazione", values: ["Casa Start", "Casa Plus", "Casa Full", "Sport", "Micio e Fido", "Viaggi", "Sport Famiglia", "Elettrodomestici"] }
                ]
            },
            {
                id: "protecta", title: "Protecta", hasContract: false, fields: [
                    { label: "Protecta", values: ["Sì"] }
                ]
            },
        ]
    },
];

const W3_CONTRACT_FIELDS: Record<string, ContractFieldDef> = {
    ga: {
        icon: "📱", title: "Mobile (GA)",
        render: (ctx) => (
            <div className="grid grid-cols-2 gap-3">
                <CRMField label="Codice Contratto" required placeholder="es. 1679428185586"
                    controlledValue={ctx.codeValue} onChangeValue={ctx.onCodeChange} />
                <CRMField label="Numero Provvisorio" placeholder="es. 393XXXXXXX" />
                <CRMField label="Numero Definitivo MNP" placeholder="Numero da portare" />
                <CRMField label="Brand MNP" type="select"
                    values={["", "Tim", "Vodafone", "Fastweb", "Iliad", "Poste Mobile", "Coop", "Noverca", "Lyka"]} />
                <CRMField label="ICCID" placeholder="893XXXXXXXXXXXXXXXX" note="Supporto barcode 📷" />
            </div>
        )
    },
    tnp_ga: {
        icon: "📲", title: "TNP GA",
        render: (ctx) => (
            <div className="grid grid-cols-3 gap-3">
                {ctx.hasGaInSameSale ? (
                    <CRMField label="Codice Contratto" disabled controlledValue={ctx.inheritedCode || ""}
                        note="Auto-compilato dal Mobile GA" />
                ) : (
                    <CRMField label="Codice Contratto" required placeholder="es. 1679428185586" />
                )}
                <CRMField label="Modello Terminale Venduto" placeholder="es. Samsung S25 Ultra" />
                <CRMField label="IMEI" placeholder="15 cifre" note="Supporto barcode 📷" />
            </div>
        )
    },
    tnp_cb: {
        icon: "📦", title: "TNP CB",
        render: (ctx) => (
            <div className="grid grid-cols-3 gap-3">
                <CRMField label="Codice Contratto" required placeholder="es. 1679428185586" />
                <CRMField label="Modello Terminale Venduto" placeholder="es. iPhone 16 Pro" />
                <CRMField label="IMEI" placeholder="15 cifre" note="Supporto barcode 📷" />
            </div>
        )
    },
    fisso_off: {
        icon: "🏠", title: "Fisso",
        render: (_ctx) => (
            <div className="grid grid-cols-3 gap-3">
                <CRMField label="Codice Contratto" required placeholder="es. 1679428185586" />
                <CRMField label="Numero Fisso Provvisorio" placeholder="es. 06XXXXXXXX" />
                <CRMField label="Numero Fisso Definitivo" placeholder="Numero da portare" />
            </div>
        )
    },
    luce_gas_off: {
        icon: "💡", title: "WindTre Luce&Gas",
        render: (_ctx) => (
            <div className="max-w-xs">
                <CRMField label="Codice Contratto" required placeholder="es. 1679428185586" />
            </div>
        )
    },
};

// ─── BRAND LIST ──────────────────────────────────────────────────────────────

const BRANDS: BrandConfig[] = [
    {
        id: "windtre", name: "WindTre", logo: "🌬️", color: "#f97316",
        available: true,
        categories: W3_CATEGORIES,
        contractFields: W3_CONTRACT_FIELDS,
        stores: W3_STORES,
        operatorCodes: W3_CODES,
    },
    { id: "vodafone", name: "Vodafone", logo: "🔴", color: "#ef4444", available: false, categories: [], contractFields: {}, stores: [], operatorCodes: [] },
    { id: "sky", name: "Sky", logo: "🌐", color: "#0ea5e9", available: false, categories: [], contractFields: {}, stores: [], operatorCodes: [] },
    { id: "iliad", name: "Iliad", logo: "🌸", color: "#ec4899", available: false, categories: [], contractFields: {}, stores: [], operatorCodes: [] },
    { id: "energy", name: "Energy", logo: "⚡", color: "#eab308", available: false, categories: [], contractFields: {}, stores: [], operatorCodes: [] },
    { id: "fastweb", name: "Fastweb", logo: "🚀", color: "#10b981", available: false, categories: [], contractFields: {}, stores: [], operatorCodes: [] },
];

// ─── MOCK CUSTOMER DB ────────────────────────────────────────────────────────

const MOCK_CUSTOMERS: Record<string, { nome: string; cognome: string; cellulare: string; email: string }> = {
    "RSSMRA80A01H501U": { nome: "Mario", cognome: "Rossi", cellulare: "333 1234567", email: "mario.rossi@email.com" },
    "VRDANN70B02H502V": { nome: "Anna", cognome: "Verdi", cellulare: "345 9876543", email: "anna.verdi@email.com" },
    "12345678901": { nome: "Rossi", cognome: "S.r.l.", cellulare: "06 12345678", email: "info@rossi.it" },
};

// ─── SHARED FIELD COMPONENT (dark-glass styled) ──────────────────────────────

interface CRMFieldProps {
    label: string;
    required?: boolean;
    placeholder?: string;
    type?: "text" | "select" | "date";
    values?: string[];
    note?: string;
    prefilled?: boolean;
    prefillVal?: string;
    span2?: boolean;
    disabled?: boolean;
    controlledValue?: string;
    onChangeValue?: (v: string) => void;
    onSelectChange?: (v: string) => void;
}

function CRMField({
    label, required, placeholder, type = "text", values, note,
    prefilled, prefillVal, span2, disabled,
    controlledValue, onChangeValue, onSelectChange,
}: CRMFieldProps) {
    const isControlled = controlledValue !== undefined || onChangeValue;
    const today = new Date().toISOString().split("T")[0];

    return (
        <div className={span2 ? "col-span-2" : ""}>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
                {label} {required && <span className="text-rose-400">*</span>}
            </label>
            {type === "select" ? (
                <select
                    disabled={disabled}
                    onChange={e => onSelectChange?.(e.target.value)}
                    className={cn(
                        "glass-input w-full text-sm",
                        prefilled && "border-emerald-500/50 bg-emerald-500/5",
                        disabled && "opacity-50 cursor-not-allowed"
                    )}
                >
                    {(values || []).map((v, i) => (
                        <option key={i} value={v}>{v || "— Seleziona —"}</option>
                    ))}
                </select>
            ) : type === "date" ? (
                <input type="date" defaultValue={today} disabled={disabled}
                    className="glass-input w-full text-sm" />
            ) : (
                <input
                    type="text"
                    placeholder={placeholder}
                    disabled={disabled}
                    readOnly={disabled}
                    className={cn(
                        "glass-input w-full text-sm",
                        prefilled && "border-emerald-500/50 bg-emerald-500/5",
                        disabled && "border-cyan-500/40 bg-cyan-500/5 text-cyan-300 italic cursor-not-allowed"
                    )}
                    {...(isControlled
                        ? { value: controlledValue || "", onChange: e => onChangeValue?.(e.target.value) }
                        : { defaultValue: prefilled ? (prefillVal || "") : "" }
                    )}
                />
            )}
            {note && (
                <p className={cn("text-[10px] mt-1", disabled ? "text-cyan-400" : "text-slate-500")}>{note}</p>
            )}
        </div>
    );
}

// ─── MAIN PAGE ───────────────────────────────────────────────────────────────

export default function RegistraContratto() {
    // Step 1 – Brand
    const [selectedBrand, setSelectedBrand] = useState<BrandConfig | null>(null);

    // Step 2 – Customer type + lookup
    const [tipoCliente, setTipoCliente] = useState<"privato" | "business" | null>(null);
    const [lookupValue, setLookupValue] = useState("");
    const [clienteFound, setClienteFound] = useState(false);
    const [clienteData, setClienteData] = useState<Record<string, string>>({});
    const [showAnagrafica, setShowAnagrafica] = useState(false);

    // Step 4 – Multi-sale product selections
    // sales[catId] = [{ subId: boolean, ... }, ...]  (one object per sale)
    const [sales, setSales] = useState<Record<string, Record<string, boolean>[]>>({});
    const [dropdownValues, setDropdownValues] = useState<Record<string, string>>({});
    const [contractCodes, setContractCodes] = useState<Record<string, string>>({});

    // Step 6 – Attachments
    const [filesDocId, setFilesDocId] = useState<File[]>([]);
    const [filesContratti, setFilesContratti] = useState<File[]>([]);
    const [filesAltro, setFilesAltro] = useState<File[]>([]);

    // Step 8 – Notes
    const [showNote, setShowNote] = useState(false);

    // ── Helpers ───────────────────────────────────────────────────────────────

    const reset = () => {
        setSelectedBrand(null);
        setTipoCliente(null);
        setLookupValue("");
        setClienteFound(false);
        setClienteData({});
        setShowAnagrafica(false);
        setSales({});
        setDropdownValues({});
        setContractCodes({});
        setFilesDocId([]);
        setFilesContratti([]);
        setFilesAltro([]);
        setShowNote(false);
    };

    const getSales = (catId: string) => sales[catId] || [{}];

    const toggleSub = (catId: string, subId: string, saleIdx: number) => {
        setSales(prev => {
            const catSales = [...(prev[catId] || [{}])];
            if (!catSales[saleIdx]) catSales[saleIdx] = {};
            catSales[saleIdx] = { ...catSales[saleIdx], [subId]: !catSales[saleIdx][subId] };
            return { ...prev, [catId]: catSales };
        });
    };

    const addSale = (catId: string) =>
        setSales(prev => ({ ...prev, [catId]: [...(prev[catId] || [{}]), {}] }));

    const removeSale = (catId: string, saleIdx: number) =>
        setSales(prev => {
            const arr = [...(prev[catId] || [{}])];
            arr.splice(saleIdx, 1);
            return { ...prev, [catId]: arr.length ? arr : [{}] };
        });

    const ddKey = (catId: string, saleIdx: number, subId: string) => `${catId}_${saleIdx}_${subId}`;
    const getDD = (catId: string, saleIdx: number, subId: string) => dropdownValues[ddKey(catId, saleIdx, subId)] || "";
    const setDD = (catId: string, saleIdx: number, subId: string, val: string) =>
        setDropdownValues(prev => ({ ...prev, [ddKey(catId, saleIdx, subId)]: val }));
    const isSubComplete = (catId: string, saleIdx: number, subId: string) => !!getDD(catId, saleIdx, subId);

    const codeKey = (catId: string, saleIdx: number) => `${catId}_${saleIdx}`;
    const getCode = (catId: string, saleIdx: number) => contractCodes[codeKey(catId, saleIdx)] || "";
    const setCode = (catId: string, saleIdx: number, val: string) =>
        setContractCodes(prev => ({ ...prev, [codeKey(catId, saleIdx)]: val }));

    const hasContractData = () => {
        if (!selectedBrand) return false;
        for (const cat of selectedBrand.categories) {
            for (const sale of getSales(cat.id)) {
                for (const sub of cat.subs) {
                    if (sub.hasContract && sale[sub.id]) return true;
                }
            }
        }
        return false;
    };

    const handleLookup = () => {
        const match = MOCK_CUSTOMERS[lookupValue.toUpperCase().trim()];
        if (match) {
            setClienteFound(true);
            setClienteData(match);
        } else {
            setClienteFound(false);
            setClienteData({});
        }
        setShowAnagrafica(true);
    };

    const addFiles = (setter: React.Dispatch<React.SetStateAction<File[]>>) =>
        (e: React.ChangeEvent<HTMLInputElement>) => {
            if (e.target.files) setter(prev => [...prev, ...Array.from(e.target.files!)]);
        };

    const removeFile = (setter: React.Dispatch<React.SetStateAction<File[]>>, idx: number) =>
        setter(prev => prev.filter((_, i) => i !== idx));

    // ── Active step indicator ─────────────────────────────────────────────────

    const STEPS = ["Brand", "Tipo Cliente", "Anagrafica", "Prodotti", "Dati Contratto", "Allegati", "Attribuzione", "Note"];
    const activeStep = !selectedBrand ? 0 : !tipoCliente ? 1 : !showAnagrafica ? 2 : 3;

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="w-full">
            {/* Page header */}
            <div className="mb-6 flex items-end justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-white mb-1">Registra Contratto</h2>
                    <p className="text-slate-400 text-sm">
                        {selectedBrand ? `${selectedBrand.name} · ${tipoCliente === "privato" ? "Privato" : tipoCliente === "business" ? "Business" : "Seleziona tipo cliente"}` : "Seleziona un brand per iniziare"}
                    </p>
                </div>
                {selectedBrand && (
                    <button onClick={reset} className="text-xs text-slate-500 hover:text-slate-300 border border-white/10 hover:border-white/20 rounded-lg px-3 py-2 transition-all">
                        ↩ Ricomincia
                    </button>
                )}
            </div>

            {/* Steps bar */}
            <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1">
                {STEPS.map((s, i) => {
                    const done = selectedBrand && (
                        (i === 0) ||
                        (i === 1 && !!tipoCliente) ||
                        (i === 2 && showAnagrafica) ||
                        (i >= 3 && showAnagrafica)
                    );
                    const active = (i === 0 && !selectedBrand) ||
                        (i === 1 && selectedBrand && !tipoCliente) ||
                        (i === 2 && tipoCliente && !showAnagrafica);
                    return (
                        <div key={i} className={cn(
                            "flex-1 min-w-[80px] text-center py-2 px-1 rounded-lg text-[10px] font-semibold transition-all whitespace-nowrap",
                            active ? "bg-indigo-600 text-white" :
                                done ? "bg-emerald-600/80 text-white" :
                                    "bg-white/[0.04] text-slate-600"
                        )}>
                            {done && !active ? "✓ " : ""}{s}
                        </div>
                    );
                })}
            </div>

            <div className="space-y-4">

                {/* ── STEP 1: BRAND ───────────────────────────────────────────────── */}
                <div className={cn("glass-card p-5", selectedBrand && "border-emerald-500/20")}>
                    <div className="flex items-center gap-2 mb-4">
                        {selectedBrand
                            ? <CheckCircle className="w-4 h-4 text-emerald-400" />
                            : <span className="w-5 h-5 rounded-full border border-indigo-500/50 flex items-center justify-center text-[10px] font-bold text-indigo-400">1</span>
                        }
                        <span className={cn("text-xs font-bold uppercase tracking-wider",
                            selectedBrand ? "text-emerald-400" : "text-indigo-400"
                        )}>
                            {selectedBrand ? `✓ Brand: ${selectedBrand.name}` : "Step 1 — Seleziona Brand"}
                        </span>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                        {BRANDS.map(b => (
                            <button
                                key={b.id}
                                onClick={() => { if (b.available) { setSelectedBrand(b); setTipoCliente(null); setShowAnagrafica(false); setSales({}); } }}
                                className={cn(
                                    "relative flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all",
                                    selectedBrand?.id === b.id
                                        ? "border-orange-500/60 bg-orange-500/10"
                                        : b.available
                                            ? "border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20"
                                            : "border-white/5 bg-white/[0.01] opacity-40 cursor-not-allowed"
                                )}
                            >
                                <span className="text-xl">{b.logo}</span>
                                <span className={cn("text-xs font-semibold", selectedBrand?.id === b.id ? "text-orange-300" : "text-slate-300")}>
                                    {b.name}
                                </span>
                                {!b.available && (
                                    <span className="absolute top-1 right-1 text-[8px] text-slate-600">presto</span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── STEP 2: TIPO CLIENTE ────────────────────────────────────────── */}
                {selectedBrand && (
                    <div className={cn("glass-card p-5", showAnagrafica && "border-emerald-500/20")}>
                        <div className="flex items-center gap-2 mb-4">
                            {showAnagrafica
                                ? <CheckCircle className="w-4 h-4 text-emerald-400" />
                                : <span className="w-5 h-5 rounded-full border border-purple-500/50 flex items-center justify-center text-[10px] font-bold text-purple-400">2</span>
                            }
                            <span className={cn("text-xs font-bold uppercase tracking-wider",
                                showAnagrafica ? "text-emerald-400" : "text-purple-400"
                            )}>
                                Step 2 — Tipo Cliente
                            </span>
                        </div>
                        <div className="flex gap-3 mb-4">
                            {[
                                { id: "privato" as const, icon: "👤", label: "Privato", desc: "Persona fisica" },
                                { id: "business" as const, icon: "🏢", label: "Business", desc: "Azienda / P.IVA" },
                            ].map(o => (
                                <button
                                    key={o.id}
                                    onClick={() => { setTipoCliente(o.id); setShowAnagrafica(false); setClienteFound(false); setLookupValue(""); setClienteData({}); }}
                                    className={cn(
                                        "flex-1 p-4 rounded-xl border text-center transition-all",
                                        tipoCliente === o.id
                                            ? "border-purple-500/60 bg-purple-500/10"
                                            : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                                    )}
                                >
                                    <div className="text-2xl mb-1">{o.icon}</div>
                                    <div className={cn("font-bold text-sm", tipoCliente === o.id ? "text-purple-300" : "text-white")}>{o.label}</div>
                                    <div className="text-[11px] text-slate-500">{o.desc}</div>
                                </button>
                            ))}
                        </div>

                        {tipoCliente && (
                            <div className="rounded-xl bg-white/[0.03] border border-white/8 p-4">
                                <p className="text-xs font-semibold text-slate-400 mb-3">
                                    {tipoCliente === "privato" ? "Codice Fiscale" : "Partita IVA"}
                                </p>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={lookupValue}
                                        onChange={e => setLookupValue(e.target.value.toUpperCase())}
                                        placeholder={tipoCliente === "privato" ? "es. RSSMRA80A01H501U" : "es. 12345678901"}
                                        className="glass-input flex-1 font-mono uppercase text-sm"
                                        onKeyDown={e => e.key === "Enter" && handleLookup()}
                                    />
                                    <button onClick={handleLookup} className="primary-btn px-4 py-2 text-xs flex items-center gap-1.5">
                                        <Search className="w-3.5 h-3.5" /> Cerca
                                    </button>
                                    <button
                                        onClick={() => { setClienteFound(false); setClienteData({}); setShowAnagrafica(true); }}
                                        className="px-3 py-2 text-xs rounded-lg border border-white/15 text-slate-400 hover:text-white hover:border-white/30 transition-all flex items-center gap-1.5"
                                    >
                                        <UserPlus className="w-3.5 h-3.5" /> Nuovo
                                    </button>
                                </div>
                                {showAnagrafica && clienteFound && (
                                    <div className="mt-3 flex items-center gap-2 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                                        <UserCheck className="w-3.5 h-3.5" /> Cliente trovato! Dati pre-compilati.
                                    </div>
                                )}
                                {showAnagrafica && !clienteFound && lookupValue && (
                                    <div className="mt-3 flex items-center gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                                        <UserPlus className="w-3.5 h-3.5" /> Nuovo cliente — compila i dati manualmente.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* ── STEP 3: ANAGRAFICA ──────────────────────────────────────────── */}
                {showAnagrafica && (
                    <div className="glass-card p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <span className="w-5 h-5 rounded-full border border-blue-500/50 flex items-center justify-center text-[10px] font-bold text-blue-400">3</span>
                            <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
                                Step 3 — Anagrafica
                            </span>
                            <span className="text-[10px] text-slate-600 bg-white/[0.04] px-2 py-0.5 rounded">
                                {selectedBrand?.name} · {tipoCliente === "privato" ? "Privato" : "Business"}
                            </span>
                        </div>
                        {tipoCliente === "privato" ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <CRMField label="Nome" required placeholder="es. Mario" prefilled={clienteFound} prefillVal={clienteData.nome} />
                                <CRMField label="Cognome" required placeholder="es. Rossi" prefilled={clienteFound} prefillVal={clienteData.cognome} />
                                <CRMField label="Numero di Cellulare" placeholder="es. 3331234567" prefilled={clienteFound} prefillVal={clienteData.cellulare} />
                                <CRMField label="Email" placeholder="es. mario.rossi@email.com" prefilled={clienteFound} prefillVal={clienteData.email} />
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <CRMField label="Ragione Sociale" required placeholder="es. Rossi S.r.l." prefilled={clienteFound} prefillVal={clienteData.nome + " " + clienteData.cognome} />
                                <CRMField label="Nome Referente" required placeholder="es. Mario" prefilled={clienteFound} prefillVal={clienteData.nome} />
                                <CRMField label="Cognome Referente" required placeholder="es. Rossi" prefilled={clienteFound} prefillVal={clienteData.cognome} />
                                <CRMField label="Recapito Telefonico" placeholder="es. 3331234567" prefilled={clienteFound} prefillVal={clienteData.cellulare} />
                                <CRMField label="Email" placeholder="es. info@rossi.it" prefilled={clienteFound} prefillVal={clienteData.email} span2 />
                            </div>
                        )}
                    </div>
                )}

                {/* ── STEP 4: PRODOTTI ────────────────────────────────────────────── */}
                {showAnagrafica && selectedBrand && (
                    <div className="glass-card p-5">
                        <div className="flex items-center gap-2 mb-5">
                            <span className="w-5 h-5 rounded-full border border-blue-400/50 flex items-center justify-center text-[10px] font-bold text-blue-400">4</span>
                            <span className="text-xs font-bold uppercase tracking-wider text-blue-400">Step 4 — Prodotti e Servizi</span>
                        </div>

                        {selectedBrand.categories.map(group => {
                            const catSales = getSales(group.id);
                            return (
                                <div key={group.id} className="mb-6 last:mb-0">
                                    {/* Category header */}
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="text-base">{group.icon}</span>
                                        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: group.color }}>
                                            {group.title}
                                        </span>
                                    </div>

                                    {catSales.map((sale, saleIdx) => {
                                        const hasAny = Object.values(sale).some(Boolean);
                                        return (
                                            <div
                                                key={saleIdx}
                                                className={cn(
                                                    "p-4 rounded-xl mb-2 border",
                                                    saleIdx === 0 ? "bg-white/[0.02] border-white/8" : "bg-transparent border-dashed border-white/10"
                                                )}
                                                style={{ borderLeftWidth: 3, borderLeftColor: group.color + "60", borderLeftStyle: "solid" }}
                                            >
                                                <div className="flex items-center justify-between mb-3">
                                                    <span className="text-[11px] font-bold uppercase" style={{ color: group.color }}>
                                                        Vendita #{saleIdx + 1}
                                                    </span>
                                                    <div className="flex gap-2">
                                                        {saleIdx === catSales.length - 1 && (
                                                            <button
                                                                onClick={() => addSale(group.id)}
                                                                className="text-[11px] font-semibold px-3 py-1 rounded-lg border hover:bg-white/5 transition-all"
                                                                style={{ borderColor: group.color + "50", color: group.color }}
                                                            >
                                                                <Plus className="w-3 h-3 inline mr-1" />Aggiungi vendita
                                                            </button>
                                                        )}
                                                        {saleIdx > 0 && (
                                                            <button
                                                                onClick={() => removeSale(group.id, saleIdx)}
                                                                className="text-[11px] font-semibold px-2 py-1 rounded-lg border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition-all"
                                                            >
                                                                <Trash2 className="w-3 h-3 inline mr-1" />Rimuovi
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Sub-type toggle pills */}
                                                <div className="flex flex-wrap gap-2 mb-3">
                                                    {group.subs.map(sub => (
                                                        <button
                                                            key={sub.id}
                                                            onClick={() => toggleSub(group.id, sub.id, saleIdx)}
                                                            className={cn(
                                                                "px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all",
                                                                sale[sub.id]
                                                                    ? "text-white border-transparent"
                                                                    : "bg-white/[0.03] border-white/15 text-slate-400 hover:border-white/25"
                                                            )}
                                                            style={sale[sub.id] ? { backgroundColor: group.color, borderColor: group.color } : {}}
                                                        >
                                                            {sub.title}
                                                        </button>
                                                    ))}
                                                </div>

                                                {/* Expanded sub-fields */}
                                                {hasAny && group.subs.filter(s => sale[s.id]).map(sub => (
                                                    <div
                                                        key={`${saleIdx}_${sub.id}`}
                                                        className="mb-3 last:mb-0 pl-3"
                                                        style={{ borderLeft: `2px solid ${group.color}30` }}
                                                    >
                                                        <div className="flex items-center gap-2 mb-2 text-[11px] font-semibold text-slate-400">
                                                            {sub.title}
                                                            {!isSubComplete(group.id, saleIdx, sub.id) && (
                                                                <span className="text-[9px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                                                                    ⚠ Seleziona un valore
                                                                </span>
                                                            )}
                                                            {isSubComplete(group.id, saleIdx, sub.id) && (
                                                                <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">✓</span>
                                                            )}
                                                        </div>
                                                        <div className={cn(
                                                            "grid gap-2",
                                                            sub.fields.length > 3 ? "grid-cols-3" : sub.fields.length > 1 ? "grid-cols-2" : "grid-cols-1"
                                                        )}>
                                                            {sub.fields.map((f, fi) => (
                                                                <CRMField
                                                                    key={fi}
                                                                    label={f.label}
                                                                    type="select"
                                                                    values={["", ...f.values]}
                                                                    onSelectChange={val => setDD(group.id, saleIdx, sub.id, val)}
                                                                />
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* ── STEP 5: DATI CONTRATTO ──────────────────────────────────────── */}
                {showAnagrafica && selectedBrand && hasContractData() && (
                    <div className="glass-card p-5">
                        <div className="flex items-center gap-2 mb-5">
                            <span className="w-5 h-5 rounded-full border border-orange-400/50 flex items-center justify-center text-[10px] font-bold text-orange-400">5</span>
                            <span className="text-xs font-bold uppercase tracking-wider text-orange-400">Step 5 — Dati Contratto</span>
                        </div>

                        {selectedBrand.categories.map(group =>
                            getSales(group.id).map((sale, saleIdx) => {
                                const contractSubs = group.subs.filter(s => s.hasContract && sale[s.id]);
                                if (!contractSubs.length) return null;
                                return (
                                    <div
                                        key={`${group.id}_${saleIdx}`}
                                        className="p-4 rounded-xl mb-3 last:mb-0 bg-white/[0.02] border border-orange-500/15"
                                        style={{ borderLeft: "3px solid #f97316" }}
                                    >
                                        <div className="text-[11px] font-bold text-orange-400 uppercase mb-3 flex items-center gap-2">
                                            <span>{group.icon}</span>{group.title} — Vendita #{saleIdx + 1}
                                        </div>
                                        {contractSubs.map(sub => {
                                            const cf = selectedBrand.contractFields[sub.id];
                                            if (!cf) return null;
                                            const complete = isSubComplete(group.id, saleIdx, sub.id);
                                            const ctx: ContractCtx = {
                                                hasGaInSameSale: sub.id === "tnp_ga" && !!sale["ga"],
                                                inheritedCode: sub.id === "tnp_ga" && sale["ga"] ? getCode(group.id, saleIdx) : "",
                                                codeValue: sub.id === "ga" ? getCode(group.id, saleIdx) : undefined,
                                                onCodeChange: sub.id === "ga" ? (v) => setCode(group.id, saleIdx, v) : undefined,
                                            };
                                            return (
                                                <div
                                                    key={sub.id}
                                                    className={cn("mb-4 last:mb-0 transition-opacity", !complete && "opacity-40 pointer-events-none")}
                                                >
                                                    <div className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-2">
                                                        {cf.icon} {cf.title}
                                                        {!complete && (
                                                            <span className="text-[10px] font-normal text-slate-500 italic">
                                                                — Seleziona prima l'offerta nello Step 4
                                                            </span>
                                                        )}
                                                    </div>
                                                    {cf.render(ctx)}
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}

                {/* ── STEP 6: ALLEGATI ────────────────────────────────────────────── */}
                {showAnagrafica && (
                    <div className="glass-card p-5">
                        <div className="flex items-center gap-2 mb-5">
                            <span className="w-5 h-5 rounded-full border border-cyan-400/50 flex items-center justify-center text-[10px] font-bold text-cyan-400">6</span>
                            <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">Step 6 — Allegati</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {([
                                { label: "Documento d'identità", icon: "🪪", files: filesDocId, setter: setFilesDocId },
                                { label: "Contratti", icon: "📄", files: filesContratti, setter: setFilesContratti },
                                { label: "Altro", icon: "📁", files: filesAltro, setter: setFilesAltro },
                            ] as const).map(cat => (
                                <div key={cat.label} className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
                                    <div className="text-base mb-1">{cat.icon}</div>
                                    <p className="text-xs font-semibold text-slate-300 mb-0.5">{cat.label}</p>
                                    <label className="flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-xl h-20 cursor-pointer hover:border-cyan-500/40 hover:bg-cyan-500/5 transition-all mt-3">
                                        <Upload className="w-4 h-4 text-slate-500 mb-1" />
                                        <span className="text-[10px] text-slate-500">Trascina o <span className="text-cyan-400">scegli</span></span>
                                        <input type="file" className="hidden" multiple accept=".pdf,.jpg,.jpeg,.png"
                                            onChange={addFiles(cat.setter as React.Dispatch<React.SetStateAction<File[]>>)} />
                                    </label>
                                    {cat.files.length > 0 && (
                                        <ul className="mt-2 space-y-1">
                                            {cat.files.map((f, i) => (
                                                <li key={i} className="flex items-center justify-between text-[10px] text-slate-400 bg-white/[0.03] rounded px-2 py-1">
                                                    <span className="truncate max-w-[80%]">{f.name}</span>
                                                    <button onClick={() => removeFile(cat.setter as React.Dispatch<React.SetStateAction<File[]>>, i)}
                                                        className="text-slate-600 hover:text-rose-400 ml-1">
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── STEP 7: ATTRIBUZIONE ────────────────────────────────────────── */}
                {showAnagrafica && selectedBrand && (
                    <div className="glass-card p-5">
                        <div className="flex items-center gap-2 mb-5">
                            <span className="w-5 h-5 rounded-full border border-emerald-400/50 flex items-center justify-center text-[10px] font-bold text-emerald-400">7</span>
                            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Step 7 — Attribuzione</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <CRMField label="Venditore" required type="select"
                                values={["Manu", "Roberto", "Alin", "Marta", "Alex"]}
                                note="Pre-compilato dal login" />
                            <CRMField label="Codice Operatore" required type="select"
                                values={selectedBrand.operatorCodes}
                                note={`Codice operatore ${selectedBrand.name}`} />
                            <CRMField label="Negozio" required type="select"
                                values={selectedBrand.stores}
                                note="Pre-compilato dal login" />
                            <CRMField label="Data Vendita" required type="date"
                                note="Default: oggi" />
                        </div>
                    </div>
                )}

                {/* ── STEP 8: NOTE / PROMEMORIA ───────────────────────────────────── */}
                {showAnagrafica && (
                    <div className="glass-card p-5">
                        <div className="flex items-center gap-2 mb-5">
                            <span className="w-5 h-5 rounded-full border border-pink-400/50 flex items-center justify-center text-[10px] font-bold text-pink-400">8</span>
                            <span className="text-xs font-bold uppercase tracking-wider text-pink-400">Step 8 — Note / Promemoria</span>
                        </div>

                        <div className="text-center mb-5">
                            <p className="text-sm font-medium text-slate-300 mb-3">Vuoi aggiungere una nota o un promemoria?</p>
                            <div className="flex gap-3 justify-center">
                                <button onClick={() => setShowNote(true)}
                                    className={cn("px-6 py-2 rounded-lg border text-sm font-semibold transition-all",
                                        showNote ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300" : "border-white/15 text-slate-400 hover:border-white/30")}>
                                    Sì
                                </button>
                                <button onClick={() => setShowNote(false)}
                                    className={cn("px-6 py-2 rounded-lg border text-sm font-semibold transition-all",
                                        !showNote ? "border-rose-500/50 bg-rose-500/10 text-rose-300" : "border-white/15 text-slate-400 hover:border-white/30")}>
                                    No
                                </button>
                            </div>
                        </div>

                        {showNote && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {/* Nota */}
                                <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="text-lg">📋</span>
                                        <div>
                                            <p className="text-xs font-bold text-slate-300">Nota</p>
                                            <p className="text-[10px] text-slate-500">Archiviata nella vendita</p>
                                        </div>
                                    </div>
                                    <textarea
                                        placeholder="Scrivi una nota..."
                                        rows={3}
                                        className="glass-input w-full resize-none text-sm"
                                    />
                                </div>
                                {/* Promemoria */}
                                <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="text-lg">📅</span>
                                        <div>
                                            <p className="text-xs font-bold text-slate-300">Promemoria</p>
                                            <p className="text-[10px] text-slate-500">Fissa nel calendario</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 mb-3">
                                        <CRMField label="Data" type="date" />
                                        <CRMField label="Ora" type="text" placeholder="es. 10:00" />
                                    </div>
                                    {selectedBrand && (
                                        <CRMField label="Negozio" type="select" values={selectedBrand.stores} note="Pre-impostato dal login" />
                                    )}
                                    <div className="mt-3">
                                        <label className="block text-xs font-medium text-slate-400 mb-1.5">Descrizione</label>
                                        <textarea placeholder="es. Ritiro documenti..." rows={2}
                                            className="glass-input w-full resize-none text-sm" />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── SAVE BUTTONS ─────────────────────────────────────────────────── */}
                {showAnagrafica && (
                    <div className="flex gap-3 justify-end pb-4">
                        <button onClick={reset} className="px-6 py-2.5 rounded-xl border border-white/15 text-slate-400 hover:text-white hover:border-white/30 text-sm font-semibold transition-all">
                            Annulla
                        </button>
                        <button className="primary-btn px-8 py-2.5 text-sm font-bold flex items-center gap-2">
                            <CheckCircle className="w-4 h-4" /> Salva Contratto
                        </button>
                    </div>
                )}

            </div>
        </div>
    );
}
