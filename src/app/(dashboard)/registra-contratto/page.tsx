"use client";

import { useState, useEffect } from "react";
import { CheckCircle, Upload, X, Search, UserCheck, UserPlus, Loader2 } from "lucide-react";
import { cn } from "@/utils";

// Mock data — will be replaced with Supabase queries
const MOCK_VENDORS = [
    "Luca Perotta", "Alessandro Sandri", "Marco Bianchi", "Giulia Rossi", "Venditore 1", "Venditore 2",
];

const MOCK_STORES = [
    { code: "RM001", name: "Roma Centro" },
    { code: "RM002", name: "Roma Est" },
    { code: "MI001", name: "Milano Centrale" },
    { code: "MI002", name: "Milano Nord" },
    { code: "NA001", name: "Napoli Centro" },
    { code: "TO001", name: "Torino Centro" },
];

const BRANDS = [
    { name: "Vodafone", types: ["Mobile", "Fibra"] },
    { name: "Wind3", types: ["Mobile", "Fibra"] },
    { name: "Fastweb", types: ["Mobile", "Fibra"] },
    { name: "Sky", types: ["Fibra", "TV"] },
    { name: "Edison Business", types: ["Energia"] },
    { name: "Edison Consumer", types: ["Energia"] },
    { name: "Enel Business", types: ["Energia"] },
    { name: "Enel Consumer", types: ["Energia"] },
    { name: "Generali Assicurazioni", types: ["Assicurazione"] },
];

const CITIES = ["Roma", "Milano", "Napoli", "Torino", "Firenze", "Bologna", "Palermo", "Genova", "Bari", "Venezia"];

// Curated phone list for Italian market (2023-2025) — manageable via Supabase in production
const SMARTPHONE_MODELS: { brand: string; models: string[] }[] = [
    {
        brand: "Apple", models: [
            "iPhone 16 Pro Max", "iPhone 16 Pro", "iPhone 16 Plus", "iPhone 16",
            "iPhone 15 Pro Max", "iPhone 15 Pro", "iPhone 15 Plus", "iPhone 15",
            "iPhone 14 Pro Max", "iPhone 14 Pro", "iPhone 14 Plus", "iPhone 14",
            "iPhone SE (3a gen)",
        ]
    },
    {
        brand: "Samsung", models: [
            "Galaxy S25 Ultra", "Galaxy S25+", "Galaxy S25",
            "Galaxy S24 Ultra", "Galaxy S24+", "Galaxy S24", "Galaxy S24 FE",
            "Galaxy S23 Ultra", "Galaxy S23+", "Galaxy S23", "Galaxy S23 FE",
            "Galaxy A55", "Galaxy A54", "Galaxy A35", "Galaxy A34", "Galaxy A25",
            "Galaxy Z Fold 6", "Galaxy Z Flip 6", "Galaxy Z Fold 5", "Galaxy Z Flip 5",
        ]
    },
    {
        brand: "Xiaomi", models: [
            "Xiaomi 14 Ultra", "Xiaomi 14", "Xiaomi 14T Pro", "Xiaomi 14T",
            "Xiaomi 13 Ultra", "Xiaomi 13", "Xiaomi 13T Pro", "Xiaomi 13T",
            "Redmi Note 13 Pro+", "Redmi Note 13 Pro", "Redmi Note 13",
            "Redmi Note 12 Pro+", "Redmi Note 12",
            "POCO X6 Pro", "POCO X6", "POCO F6 Pro",
        ]
    },
    {
        brand: "Google", models: [
            "Pixel 9 Pro XL", "Pixel 9 Pro", "Pixel 9", "Pixel 9a",
            "Pixel 8 Pro", "Pixel 8", "Pixel 8a",
            "Pixel 7 Pro", "Pixel 7", "Pixel 7a",
        ]
    },
    {
        brand: "OnePlus", models: [
            "OnePlus 13", "OnePlus 12", "OnePlus 12R",
            "OnePlus Nord 4", "OnePlus Nord CE4", "OnePlus Nord 3",
            "OnePlus Open",
        ]
    },
    {
        brand: "Motorola", models: [
            "Motorola Edge 50 Ultra", "Motorola Edge 50 Pro", "Motorola Edge 50",
            "Motorola Edge 40 Pro", "Motorola Edge 40",
            "Motorola Razr 50 Ultra", "Motorola Razr 50",
            "Moto G54", "Moto G84",
        ]
    },
    {
        brand: "OPPO", models: [
            "OPPO Find X8 Pro", "OPPO Find X7 Ultra",
            "OPPO Reno 12 Pro", "OPPO Reno 12", "OPPO Reno 11 Pro", "OPPO Reno 11",
            "OPPO A60", "OPPO A58",
        ]
    },
    {
        brand: "Huawei", models: [
            "Huawei Pura 70 Pro", "Huawei Pura 70",
            "Huawei Nova 12 Pro", "Huawei Nova 11",
            "Huawei Mate 60 Pro",
        ]
    },
    {
        brand: "Nokia", models: [
            "Nokia G42", "Nokia G22", "Nokia C32", "Nokia XR21",
        ]
    },
];

// Mock customer database — will be replaced with Supabase lookup
const MOCK_CUSTOMERS: Record<string, { nome: string; cognome: string; telefono: string; email: string; indirizzo: string }> = {
    "PRRLCU98L14H501X": { nome: "Luca", cognome: "Perotta", telefono: "3331234567", email: "luca.perotta@email.it", indirizzo: "Via Roma 12, Roma" },
    "RSSMRA80A01H501U": { nome: "Mario", cognome: "Rossi", telefono: "3457654321", email: "mario.rossi@email.it", indirizzo: "Corso Italia 5, Milano" },
    "VRDGPP75B02F205Z": { nome: "Giuseppe", cognome: "Verdi", telefono: "3289876543", email: "giuseppe.verdi@email.it", indirizzo: "Via Napoli 88, Napoli" },
    // Business VAT numbers
    "12345678901": { nome: "Acme Srl", cognome: "", telefono: "0612345678", email: "info@acmesrl.it", indirizzo: "Via Industriale 3, Roma" },
};

type ContractType = "Mobile" | "Fibra" | "Energia" | "Assicurazione" | "TV" | "";
type LookupStatus = "idle" | "searching" | "found" | "not_found";

export default function RegistraContratto() {
    const [submitted, setSubmitted] = useState(false);
    const [filesDocId, setFilesDocId] = useState<File[]>([]);
    const [filesContratti, setFilesContratti] = useState<File[]>([]);
    const [filesAltri, setFilesAltri] = useState<File[]>([]);

    // Form state
    const [venditore, setVenditore] = useState("");
    const [tipoCliente, setTipoCliente] = useState<"consumer" | "business" | "">("");
    const [identificativo, setIdentificativo] = useState("");
    const [brand, setBrand] = useState("");
    const [tipoContratto, setTipoContratto] = useState<ContractType>("");
    const [cittaVenditore, setCittaVenditore] = useState("");
    const [negozio, setNegozio] = useState("");

    // Customer lookup state
    const [lookupStatus, setLookupStatus] = useState<LookupStatus>("idle");
    const [customerData, setCustomerData] = useState({ nome: "", cognome: "", telefono: "", email: "", indirizzo: "" });

    // Mobile-specific
    const [smartphoneFornitо, setSmartphoneFornito] = useState<"si" | "no" | "">("");
    const [smartphoneModel, setSmartphoneModel] = useState("");
    const [imei, setImei] = useState("");

    // Fibra-specific
    const [indirizzoInstallazione, setIndirizzoInstallazione] = useState("");

    // Energia-specific
    const [tipoFornitura, setTipoFornitura] = useState<"luce" | "gas" | "dual" | "">("");
    const [pod, setPod] = useState("");
    const [pdr, setPdr] = useState("");

    // Assicurazione-specific
    const [garanzia, setGaranzia] = useState<"si" | "no" | "">("");
    const [tipoCopert, setTipoCopert] = useState("");

    const selectedBrandTypes = BRANDS.find(b => b.name === brand)?.types ?? [];

    // Trigger lookup when identifier is complete
    useEffect(() => {
        const len = tipoCliente === "consumer" ? 16 : 11;
        if (!tipoCliente || identificativo.length < len) {
            setLookupStatus("idle");
            setCustomerData({ nome: "", cognome: "", telefono: "", email: "", indirizzo: "" });
            return;
        }
        setLookupStatus("searching");
        // Simulate API call delay
        const timer = setTimeout(() => {
            const found = MOCK_CUSTOMERS[identificativo];
            if (found) {
                setCustomerData(found);
                setLookupStatus("found");
            } else {
                setCustomerData({ nome: "", cognome: "", telefono: "", email: "", indirizzo: "" });
                setLookupStatus("not_found");
            }
        }, 700);
        return () => clearTimeout(timer);
    }, [identificativo, tipoCliente]);

    const addFiles = (setter: React.Dispatch<React.SetStateAction<File[]>>) =>
        (e: React.ChangeEvent<HTMLInputElement>) => {
            if (e.target.files) setter(prev => [...prev, ...Array.from(e.target.files!)]);
        };

    const removeFile = (setter: React.Dispatch<React.SetStateAction<File[]>>, idx: number) => {
        setter(prev => prev.filter((_, i) => i !== idx));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // TODO: Replace with Supabase insert
        setSubmitted(true);
        setTimeout(() => setSubmitted(false), 5000);
    };

    return (
        <div className="w-full max-w-4xl mx-auto">
            <div className="mb-8">
                <h2 className="text-3xl font-bold text-white mb-2">Registra Contratto</h2>
                <p className="text-slate-400">Registra un contratto già attivato in negozio nel sistema CRM.</p>
            </div>

            {submitted && (
                <div className="mb-6 flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                    <CheckCircle className="w-5 h-5 flex-shrink-0" />
                    <p className="font-medium">Contratto registrato con successo nel CRM!</p>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">

                {/* Section 1: Venditore */}
                <div className="glass-card p-6">
                    <h3 className="text-base font-semibold text-white mb-4 pb-2 border-b border-white/10">
                        1. Venditore attivante
                    </h3>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Nome venditore *</label>
                        <select className="glass-input w-full" value={venditore} onChange={e => setVenditore(e.target.value)} required>
                            <option value="">Seleziona venditore...</option>
                            {MOCK_VENDORS.map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                    </div>
                </div>

                {/* Section 2: Cliente */}
                <div className="glass-card p-6">
                    <h3 className="text-base font-semibold text-white mb-4 pb-2 border-b border-white/10">
                        2. Tipo cliente
                    </h3>
                    <div className="flex gap-4 mb-4">
                        {(["consumer", "business"] as const).map(tipo => (
                            <button
                                key={tipo}
                                type="button"
                                onClick={() => { setTipoCliente(tipo); setIdentificativo(""); setLookupStatus("idle"); setCustomerData({ nome: "", cognome: "", telefono: "", email: "", indirizzo: "" }); }}
                                className={cn(
                                    "flex-1 py-3 rounded-xl border font-medium transition-all",
                                    tipoCliente === tipo
                                        ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-300"
                                        : "bg-white/[0.03] border-white/10 text-slate-400 hover:bg-white/[0.06]"
                                )}
                            >
                                {tipo === "consumer" ? "👤 Consumer (Privato)" : "🏢 Business (Azienda)"}
                            </button>
                        ))}
                    </div>

                    {tipoCliente && (
                        <div className="space-y-4">
                            {/* Identifier input with search icon */}
                            <div className="relative">
                                <label className="block text-sm font-medium text-slate-300 mb-2">
                                    {tipoCliente === "consumer" ? "Codice Fiscale *" : "Partita IVA *"}
                                </label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        className={cn("glass-input w-full font-mono uppercase pr-10",
                                            lookupStatus === "found" && "border-emerald-500/40",
                                            lookupStatus === "not_found" && "border-amber-500/40"
                                        )}
                                        placeholder={tipoCliente === "consumer" ? "RSSMRA80A01H501U" : "12345678901"}
                                        value={identificativo}
                                        onChange={e => setIdentificativo(e.target.value.toUpperCase())}
                                        maxLength={tipoCliente === "consumer" ? 16 : 11}
                                        required
                                    />
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                        {lookupStatus === "searching" && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
                                        {lookupStatus === "found" && <UserCheck className="w-4 h-4 text-emerald-400" />}
                                        {lookupStatus === "not_found" && <UserPlus className="w-4 h-4 text-amber-400" />}
                                        {lookupStatus === "idle" && <Search className="w-4 h-4 text-slate-600" />}
                                    </div>
                                </div>
                            </div>

                            {/* Found: auto-filled customer card */}
                            {lookupStatus === "found" && (
                                <div className="p-4 rounded-xl bg-emerald-500/8 border border-emerald-500/20">
                                    <div className="flex items-center gap-2 mb-3">
                                        <UserCheck className="w-4 h-4 text-emerald-400" />
                                        <span className="text-sm font-semibold text-emerald-400">Cliente trovato nel sistema</span>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {tipoCliente === "consumer" && (
                                            <>
                                                <div>
                                                    <label className="block text-xs text-slate-500 mb-1">Nome</label>
                                                    <input type="text" className="glass-input w-full" value={customerData.nome} onChange={e => setCustomerData(p => ({ ...p, nome: e.target.value }))} />
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-slate-500 mb-1">Cognome</label>
                                                    <input type="text" className="glass-input w-full" value={customerData.cognome} onChange={e => setCustomerData(p => ({ ...p, cognome: e.target.value }))} />
                                                </div>
                                            </>
                                        )}
                                        {tipoCliente === "business" && (
                                            <div className="md:col-span-2">
                                                <label className="block text-xs text-slate-500 mb-1">Ragione Sociale</label>
                                                <input type="text" className="glass-input w-full" value={customerData.nome} onChange={e => setCustomerData(p => ({ ...p, nome: e.target.value }))} />
                                            </div>
                                        )}
                                        <div>
                                            <label className="block text-xs text-slate-500 mb-1">Telefono</label>
                                            <input type="text" className="glass-input w-full" value={customerData.telefono} onChange={e => setCustomerData(p => ({ ...p, telefono: e.target.value }))} />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-slate-500 mb-1">Email</label>
                                            <input type="text" className="glass-input w-full" value={customerData.email} onChange={e => setCustomerData(p => ({ ...p, email: e.target.value }))} />
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="block text-xs text-slate-500 mb-1">Indirizzo</label>
                                            <input type="text" className="glass-input w-full" value={customerData.indirizzo} onChange={e => setCustomerData(p => ({ ...p, indirizzo: e.target.value }))} />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Not found: manual entry fields */}
                            {lookupStatus === "not_found" && (
                                <div className="p-4 rounded-xl bg-amber-500/8 border border-amber-500/20">
                                    <div className="flex items-center gap-2 mb-3">
                                        <UserPlus className="w-4 h-4 text-amber-400" />
                                        <span className="text-sm font-semibold text-amber-400">Nuovo cliente — inserisci i dati anagrafici</span>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {tipoCliente === "consumer" && (
                                            <>
                                                <div>
                                                    <label className="block text-xs text-slate-500 mb-1">Nome *</label>
                                                    <input type="text" className="glass-input w-full" placeholder="Mario" value={customerData.nome} onChange={e => setCustomerData(p => ({ ...p, nome: e.target.value }))} required />
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-slate-500 mb-1">Cognome *</label>
                                                    <input type="text" className="glass-input w-full" placeholder="Rossi" value={customerData.cognome} onChange={e => setCustomerData(p => ({ ...p, cognome: e.target.value }))} required />
                                                </div>
                                            </>
                                        )}
                                        {tipoCliente === "business" && (
                                            <div className="md:col-span-2">
                                                <label className="block text-xs text-slate-500 mb-1">Ragione Sociale *</label>
                                                <input type="text" className="glass-input w-full" placeholder="Acme Srl" value={customerData.nome} onChange={e => setCustomerData(p => ({ ...p, nome: e.target.value }))} required />
                                            </div>
                                        )}
                                        <div>
                                            <label className="block text-xs text-slate-500 mb-1">Telefono *</label>
                                            <input type="tel" className="glass-input w-full" placeholder="3331234567" value={customerData.telefono} onChange={e => setCustomerData(p => ({ ...p, telefono: e.target.value }))} required />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-slate-500 mb-1">Email</label>
                                            <input type="email" className="glass-input w-full" placeholder="mario@email.it" value={customerData.email} onChange={e => setCustomerData(p => ({ ...p, email: e.target.value }))} />
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="block text-xs text-slate-500 mb-1">Indirizzo</label>
                                            <input type="text" className="glass-input w-full" placeholder="Via Roma 1, Roma" value={customerData.indirizzo} onChange={e => setCustomerData(p => ({ ...p, indirizzo: e.target.value }))} />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Section 3: Brand & Tipo Contratto */}
                <div className="glass-card p-6">
                    <h3 className="text-base font-semibold text-white mb-4 pb-2 border-b border-white/10">
                        3. Brand e tipo contratto
                    </h3>

                    {/* Step 1: Brand — full width */}
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-slate-300 mb-2">Brand *</label>
                        <select
                            className="glass-input w-full"
                            value={brand}
                            onChange={e => { setBrand(e.target.value); setTipoContratto(""); }}
                            required
                        >
                            <option value="">Seleziona brand...</option>
                            {BRANDS.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
                        </select>
                    </div>

                    {/* Step 2: Contract type pills — only appear after brand is selected */}
                    {brand && (
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-3">
                                Tipo contratto * <span className="text-slate-500 font-normal text-xs ml-1">— disponibile per {brand}</span>
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {selectedBrandTypes.map(t => (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => setTipoContratto(t as ContractType)}
                                        className={cn(
                                            "px-5 py-2.5 rounded-xl border font-medium text-sm transition-all",
                                            tipoContratto === t
                                                ? "bg-indigo-500/25 border-indigo-500/50 text-indigo-300"
                                                : "bg-white/[0.03] border-white/10 text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
                                        )}
                                    >
                                        {t === "Mobile" && "📱 "}
                                        {t === "Fibra" && "🌐 "}
                                        {t === "Energia" && "⚡ "}
                                        {t === "Assicurazione" && "🛡️ "}
                                        {t === "TV" && "📺 "}
                                        {t}
                                    </button>
                                ))}
                            </div>
                            {!tipoContratto && (
                                <p className="text-xs text-slate-600 mt-2">Seleziona il tipo di contratto per continuare</p>
                            )}
                        </div>
                    )}

                    {/* Conditional fields per contract type */}
                    {tipoContratto === "Mobile" && (
                        <div className="mt-4 p-4 rounded-xl bg-white/[0.02] border border-white/8 space-y-4">
                            <p className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Dettagli Mobile</p>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">Smartphone fornito? *</label>
                                <div className="flex gap-3">
                                    {(["si", "no"] as const).map(v => (
                                        <button key={v} type="button"
                                            onClick={() => setSmartphoneFornito(v)}
                                            className={cn("px-6 py-2 rounded-lg border font-medium transition-all text-sm",
                                                smartphoneFornitо === v
                                                    ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-300"
                                                    : "bg-white/[0.03] border-white/10 text-slate-400 hover:bg-white/[0.06]"
                                            )}>{v.charAt(0).toUpperCase() + v.slice(1)}</button>
                                    ))}
                                </div>
                            </div>
                            {smartphoneFornitо === "si" && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-2">Modello smartphone *</label>
                                        <select
                                            className="glass-input w-full"
                                            value={smartphoneModel}
                                            onChange={e => setSmartphoneModel(e.target.value)}
                                            required
                                        >
                                            <option value="">Seleziona modello...</option>
                                            {SMARTPHONE_MODELS.map(group => (
                                                <optgroup key={group.brand} label={group.brand}>
                                                    {group.models.map(m => (
                                                        <option key={m} value={m}>{m}</option>
                                                    ))}
                                                </optgroup>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-2">IMEI *</label>
                                        <input type="text" className="glass-input w-full font-mono" placeholder="15 cifre" value={imei} onChange={e => setImei(e.target.value)} maxLength={15} required />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {tipoContratto === "Fibra" && (
                        <div className="mt-4 p-4 rounded-xl bg-white/[0.02] border border-white/8 space-y-4">
                            <p className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Dettagli Fibra</p>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">Indirizzo di installazione *</label>
                                <input type="text" className="glass-input w-full" placeholder="Via, Numero civico, Città, CAP" value={indirizzoInstallazione} onChange={e => setIndirizzoInstallazione(e.target.value)} required />
                            </div>
                        </div>
                    )}

                    {tipoContratto === "Energia" && (
                        <div className="mt-4 p-4 rounded-xl bg-white/[0.02] border border-white/8 space-y-4">
                            <p className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Dettagli Energia</p>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">Tipo fornitura *</label>
                                <div className="flex gap-3">
                                    {(["luce", "gas", "dual"] as const).map(v => (
                                        <button key={v} type="button"
                                            onClick={() => setTipoFornitura(v)}
                                            className={cn("px-6 py-2 rounded-lg border font-medium transition-all text-sm capitalize",
                                                tipoFornitura === v
                                                    ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-300"
                                                    : "bg-white/[0.03] border-white/10 text-slate-400 hover:bg-white/[0.06]"
                                            )}>{v === "dual" ? "Dual (Luce + Gas)" : v.charAt(0).toUpperCase() + v.slice(1)}</button>
                                    ))}
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {(tipoFornitura === "luce" || tipoFornitura === "dual") && (
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-2">Codice POD</label>
                                        <input type="text" className="glass-input w-full font-mono uppercase" placeholder="IT001E..." value={pod} onChange={e => setPod(e.target.value.toUpperCase())} />
                                    </div>
                                )}
                                {(tipoFornitura === "gas" || tipoFornitura === "dual") && (
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-2">Codice PDR</label>
                                        <input type="text" className="glass-input w-full font-mono" placeholder="12345678901234" value={pdr} onChange={e => setPdr(e.target.value)} />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {tipoContratto === "Assicurazione" && (
                        <div className="mt-4 p-4 rounded-xl bg-white/[0.02] border border-white/8 space-y-4">
                            <p className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Dettagli Assicurazione</p>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">Garanzia fornita? *</label>
                                <div className="flex gap-3">
                                    {(["si", "no"] as const).map(v => (
                                        <button key={v} type="button"
                                            onClick={() => setGaranzia(v)}
                                            className={cn("px-6 py-2 rounded-lg border font-medium transition-all text-sm",
                                                garanzia === v
                                                    ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-300"
                                                    : "bg-white/[0.03] border-white/10 text-slate-400 hover:bg-white/[0.06]"
                                            )}>{v.charAt(0).toUpperCase() + v.slice(1)}</button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">Tipo di copertura</label>
                                <input type="text" className="glass-input w-full" placeholder="es. Infortuni, Vita, Casa..." value={tipoCopert} onChange={e => setTipoCopert(e.target.value)} />
                            </div>
                        </div>
                    )}
                </div>

                {/* Section 4: Location */}
                <div className="glass-card p-6">
                    <h3 className="text-base font-semibold text-white mb-1 pb-2 border-b border-white/10">
                        4. Dati di localizzazione
                    </h3>
                    <p className="text-xs text-slate-500 mb-4">Necessari per split commissioni e reportistica</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Negozio *</label>
                            <select className="glass-input w-full" value={cittaVenditore} onChange={e => setCittaVenditore(e.target.value)} required>
                                <option value="">Seleziona negozio...</option>
                                {MOCK_STORES.map(s => <option key={s.code} value={s.code}>[{s.code}] {s.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Codice di attivazione *</label>
                            <input
                                type="text"
                                className="glass-input w-full font-mono uppercase"
                                placeholder="es. ACT-2024-0001"
                                value={negozio}
                                onChange={e => setNegozio(e.target.value.toUpperCase())}
                                required
                            />
                        </div>
                    </div>
                </div>

                {/* Section 5: Attachments */}
                <div className="glass-card p-6">
                    <h3 className="text-base font-semibold text-white mb-4 pb-2 border-b border-white/10">
                        5. Allegati
                    </h3>
                    <div className="space-y-5">

                        {/* Category helper */}
                        {([
                            { label: "Documenti d'identità", icon: "🪪", hint: "Carta d'identità, Patente, Passaporto", files: filesDocId, setter: setFilesDocId },
                            { label: "Contratti", icon: "📄", hint: "Moduli firmati, contratti scansionati", files: filesContratti, setter: setFilesContratti },
                            { label: "Altri allegati", icon: "📎", hint: "Foto, note, qualsiasi altro documento", files: filesAltri, setter: setFilesAltri },
                        ]).map(cat => (
                            <div key={cat.label} className="p-4 rounded-xl bg-white/[0.02] border border-white/8">
                                <p className="text-sm font-semibold text-slate-300 mb-1">{cat.icon} {cat.label}</p>
                                <p className="text-xs text-slate-500 mb-3">{cat.hint}</p>
                                <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-white/10 rounded-xl cursor-pointer hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-all">
                                    <Upload className="w-5 h-5 text-slate-500 mb-1" />
                                    <span className="text-xs text-slate-400">Trascina qui o <span className="text-indigo-400">scegli file</span></span>
                                    <span className="text-xs text-slate-600 mt-0.5">PDF, JPG, PNG — max 10MB</span>
                                    <input type="file" className="hidden" multiple accept=".pdf,.jpg,.jpeg,.png" onChange={addFiles(cat.setter)} />
                                </label>
                                {cat.files.length > 0 && (
                                    <ul className="mt-2 space-y-1.5">
                                        {cat.files.map((f, i) => (
                                            <li key={i} className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] border border-white/8 text-xs">
                                                <span className="text-slate-300 truncate">{f.name}</span>
                                                <button type="button" onClick={() => removeFile(cat.setter, i)} className="ml-3 text-slate-500 hover:text-rose-400 flex-shrink-0">
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Submit */}
                <div className="flex gap-3 justify-end">
                    <button type="button" className="h-11 px-8 rounded-xl font-medium bg-white/5 text-slate-300 hover:bg-white/10 transition-colors">
                        Annulla
                    </button>
                    <button type="submit" className="primary-btn h-11 px-8">
                        Registra Contratto
                    </button>
                </div>
            </form>
        </div>
    );
}
