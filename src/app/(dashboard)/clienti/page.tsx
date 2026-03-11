"use client";

import { useState, useMemo } from "react";
import { Search, Filter, RefreshCw, Users, FileText, Smartphone, Mail, Building, MapPin, X, ChevronRight, Calendar, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { usePageView } from "@/lib/pageView";

interface Cliente {
    id: string;
    tipo: "consumer" | "business";
    nome: string;
    cognome?: string;
    ragioneSociale?: string;
    cellulare: string;
    email: string;
    cf_piva: string;
    indirizzo: string;
    citta: string;
}

interface Contratto {
    id: string;
    data: string;
    brand: string;
    categoria: string;
    stato: string;
}

// Generiamo dati fittizi
const generateMockClienti = (): Cliente[] => {
    const list: Cliente[] = [];
    for (let i = 1; i <= 150; i++) {
        const isBusiness = i % 3 === 0;
        list.push({
            id: `CLIENT_${i.toString().padStart(4, "0")}`,
            tipo: isBusiness ? "business" : "consumer",
            nome: isBusiness ? "Mario" : `Nome_${i}`,
            cognome: isBusiness ? "Rossi" : `Cognome_${i}`,
            ragioneSociale: isBusiness ? `Azienda Beta ${i} Srl` : undefined,
            cellulare: `333${Math.floor(1000000 + Math.random() * 9000000)}`,
            email: isBusiness ? `info@aziendabeta${i}.it` : `utente${i}@email.com`,
            cf_piva: isBusiness ? `0123456789${i % 10}` : `RSSMRA80A01H501${String.fromCharCode(65 + (i % 26))}`,
            indirizzo: `Via Roma ${i}`,
            citta: ["Milano", "Roma", "Napoli", "Torino", "Firenze"][i % 5],
        });
    }
    return list;
};

const mockClienti = generateMockClienti();

const getMockContratti = (clienteId: string): Contratto[] => {
    const brands = ["FASTWEB", "VODAFONE", "WIND3", "EDISON", "ENI"];
    const cats = ["ENERGIA", "GAS", "MOBILE", "FISSO"];
    const stati = ["Attivato", "In Lavorazione", "Sospeso", "Annullato"];

    return Array.from({ length: 3 }, (_, i) => ({
        id: `CTR_${clienteId.split('_')[1]}_${i}`,
        data: `${10 + i}/03/2024`,
        brand: brands[Math.floor(Math.random() * brands.length)],
        categoria: cats[Math.floor(Math.random() * cats.length)],
        stato: stati[Math.floor(Math.random() * stati.length)]
    }));
};

function ClienteDetailModal({ cliente, onClose }: { cliente: Cliente; onClose: () => void }) {
    const contratti = getMockContratti(cliente.id);

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="glass-panel w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border-white/10">
                {/* MODAL HEADER */}
                <div className="flex-none px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${cliente.tipo === 'business' ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'}`}>
                            {cliente.tipo === 'business' ? <Building className="w-6 h-6" /> : <Users className="w-6 h-6" />}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white uppercase tracking-tight">
                                {cliente.tipo === 'business' ? cliente.ragioneSociale : `${cliente.nome} ${cliente.cognome}`}
                            </h2>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                    {cliente.id}
                                </span>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest border ${cliente.tipo === 'business' ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'}`}>
                                    {cliente.tipo}
                                </span>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/5 text-slate-400 hover:text-white transition-all">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* MODAL BODY */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">
                    {/* INFO SECTIONS GRID */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* ANAGRAFICA */}
                        <div className="space-y-4">
                            <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                <FileText className="w-3 h-3" /> Anagrafica Cliente
                            </h3>
                            <div className="grid grid-cols-1 gap-3">
                                <InfoItem icon={<Smartphone className="w-4 h-4" />} label="Cellulare" value={cliente.cellulare} mono />
                                <InfoItem icon={<Mail className="w-4 h-4" />} label="Email" value={cliente.email} />
                                <InfoItem icon={<FileText className="w-4 h-4" />} label={cliente.tipo === 'business' ? 'Partita IVA' : 'Codice Fiscale'} value={cliente.cf_piva} mono />
                                <InfoItem icon={<MapPin className="w-4 h-4" />} label="Indirizzo" value={`${cliente.indirizzo}, ${cliente.citta}`} />
                            </div>
                        </div>

                        {/* STATISTICHE O NOTE (Placeholder) */}
                        <div className="space-y-4">
                            <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                <Clock className="w-3 h-3" /> Info Aggiuntive
                            </h3>
                            <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 flex items-center justify-center text-center py-12">
                                <div className="space-y-2">
                                    <AlertTriangle className="w-6 h-6 text-slate-700 mx-auto" />
                                    <p className="text-xs text-slate-500 max-w-[200px]">Nessuna nota aggiuntiva presente per questo cliente.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* CONTRATTI TABLE */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                <FileText className="w-3 h-3" /> Ultimi Contratti Registrati
                            </h3>
                            <span className="text-[10px] text-slate-500 italic">Prelevati da tracking PDA</span>
                        </div>
                        <div className="bg-white/[0.01] border border-white/5 rounded-2xl overflow-hidden">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-white/[0.03] text-slate-500 uppercase">
                                    <tr>
                                        <th className="px-4 py-3 font-bold">Data</th>
                                        <th className="px-4 py-3 font-bold">Brand</th>
                                        <th className="px-4 py-3 font-bold">Categoria</th>
                                        <th className="px-4 py-3 font-bold text-right">Stato</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {contratti.map((ctr: Contratto) => (
                                        <tr key={ctr.id} className="hover:bg-white/[0.02] transition-colors">
                                            <td className="px-4 py-3 text-slate-400 flex items-center gap-2">
                                                <Calendar className="w-3 h-3 text-slate-600" /> {ctr.data}
                                            </td>
                                            <td className="px-4 py-3 text-white font-semibold">{ctr.brand}</td>
                                            <td className="px-4 py-3 text-slate-400">{ctr.categoria}</td>
                                            <td className="px-4 py-3 text-right">
                                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${ctr.stato === 'Attivato' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                                                    ctr.stato === 'In Lavorazione' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                                                        'bg-rose-500/10 border-rose-500/20 text-rose-400'
                                                    }`}>
                                                    {ctr.stato}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* MODAL FOOTER */}
                <div className="flex-none px-6 py-4 border-t border-white/10 bg-white/[0.02] flex justify-end">
                    <button onClick={onClose} className="px-6 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs uppercase tracking-widest transition-all">
                        Chiudi
                    </button>
                </div>
            </div>
        </div>
    );
}

function InfoItem({ icon, label, value, mono }: { icon: any; label: string; value: string; mono?: boolean }) {
    return (
        <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all group">
            <div className="text-slate-500 group-hover:text-violet-400 transition-colors mt-0.5">{icon}</div>
            <div>
                <div className="text-[10px] text-slate-600 uppercase font-black tracking-widest">{label}</div>
                <div className={`text-sm text-slate-200 ${mono ? 'font-mono' : 'font-semibold'}`}>{value}</div>
            </div>
        </div>
    );
}

const defaultClientiView = {
    quickSearch: "",
    showFilters: false,
    itemsPerPage: 25 as number,
    currentPage: 1,
    filterTipo: "tutti" as "tutti" | "consumer" | "business",
    filterNome: "",
    filterCognome: "",
    filterRagione: "",
    filterCellulare: "",
    filterEmail: "",
    filterIdentifier: "",
};

export default function ClientiPage() {
    const [view, setView] = usePageView<typeof defaultClientiView>("clienti", defaultClientiView);
    const quickSearch = view.quickSearch;
    const setQuickSearch = (v: string) => setView((p) => ({ ...p, quickSearch: v }));
    const showFilters = view.showFilters;
    const setShowFilters = (v: boolean) => setView((p) => ({ ...p, showFilters: v }));
    const itemsPerPage = view.itemsPerPage;
    const setItemsPerPage = (v: number) => setView((p) => ({ ...p, itemsPerPage: v }));
    const currentPage = view.currentPage;
    const setCurrentPage = (v: number) => setView((p) => ({ ...p, currentPage: v }));
    const filterTipo = view.filterTipo;
    const setFilterTipo = (v: "tutti" | "consumer" | "business") => setView((p) => ({ ...p, filterTipo: v }));
    const filterNome = view.filterNome;
    const setFilterNome = (v: string) => setView((p) => ({ ...p, filterNome: v }));
    const filterCognome = view.filterCognome;
    const setFilterCognome = (v: string) => setView((p) => ({ ...p, filterCognome: v }));
    const filterRagione = view.filterRagione;
    const setFilterRagione = (v: string) => setView((p) => ({ ...p, filterRagione: v }));
    const filterCellulare = view.filterCellulare;
    const setFilterCellulare = (v: string) => setView((p) => ({ ...p, filterCellulare: v }));
    const filterEmail = view.filterEmail;
    const setFilterEmail = (v: string) => setView((p) => ({ ...p, filterEmail: v }));
    const filterIdentifier = view.filterIdentifier;
    const setFilterIdentifier = (v: string) => setView((p) => ({ ...p, filterIdentifier: v }));

    const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);

    const resetFilters = () => setView((p) => ({ ...p, ...defaultClientiView }));

    const filteredData = useMemo(() => {
        return mockClienti.filter((c) => {
            // 1. Quick Search (Full-text)
            if (quickSearch) {
                const q = quickSearch.toLowerCase();
                const fullString = `${c.nome} ${c.cognome || ""} ${c.ragioneSociale || ""} ${c.email} ${c.cellulare} ${c.cf_piva}`.toLowerCase();
                if (!fullString.includes(q)) return false;
            }

            // 2. Advanced Filters
            if (filterTipo !== "tutti" && c.tipo !== filterTipo) return false;
            if (filterNome && !c.nome.toLowerCase().includes(filterNome.toLowerCase())) return false;
            if (filterCognome && (!c.cognome || !c.cognome.toLowerCase().includes(filterCognome.toLowerCase()))) return false;
            if (filterRagione && c.tipo === "business" && (!c.ragioneSociale || !c.ragioneSociale.toLowerCase().includes(filterRagione.toLowerCase()))) return false;
            if (filterCellulare && !c.cellulare.includes(filterCellulare)) return false;
            if (filterEmail && !c.email.toLowerCase().includes(filterEmail.toLowerCase())) return false;
            if (filterIdentifier && !c.cf_piva.toLowerCase().includes(filterIdentifier.toLowerCase())) return false;

            return true;
        });
    }, [quickSearch, filterTipo, filterNome, filterCognome, filterRagione, filterCellulare, filterEmail, filterIdentifier]);

    // Pagination bounds
    const totalPages = Math.ceil(filteredData.length / itemsPerPage) || 1;
    // Ensure current page is valid when data shrinks
    if (currentPage > totalPages) {
        setCurrentPage(totalPages);
    }

    const paginatedData = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredData.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredData, currentPage, itemsPerPage]);

    return (
        <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#0a0c10]">
            {/* HEADER */}
            <header className="flex-none flex items-center justify-between px-8 py-6 border-b border-white/5 bg-[#0f111a]/50 backdrop-blur-xl">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center border border-violet-500/20">
                        <Users className="w-5 h-5 text-violet-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-white">Clienti</h1>
                        <p className="text-sm text-slate-400">Anagrafica completa dei clienti Consumer e Business</p>
                    </div>
                </div>
            </header>

            {/* CONTENT */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8">
                <div className="max-w-7xl mx-auto space-y-6">

                    {/* TOP CONTROLS */}
                    <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
                        {/* Quick Search */}
                        <div className="relative w-full md:w-96 group">
                            <input
                                type="text"
                                placeholder="Cerca per nome, email, cellulare, CF..."
                                value={quickSearch}
                                onChange={(e) => {
                                    setQuickSearch(e.target.value);
                                    setCurrentPage(1);
                                }}
                                className="w-full glass-input pl-10 pr-4 py-2.5 rounded-xl border border-white/10 bg-white/5 text-white placeholder:text-slate-500 focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/50 transition-all"
                            />
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-violet-400 transition-colors" />
                        </div>

                        {/* Filter Toggle */}
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all ${showFilters
                                ? "bg-violet-500/10 border-violet-500/30 text-violet-300"
                                : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                                }`}
                        >
                            <Filter className="w-4 h-4" />
                            <span className="text-sm font-medium">Filtri Avanzati</span>
                        </button>
                    </div>

                    {/* ADVANCED FILTERS PANEL */}
                    {showFilters && (
                        <div className="glass-panel p-6 animate-in slide-in-from-top-2 fade-in duration-200">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-lg font-semibold text-white">Filtri di Ricerca</h3>
                                <button
                                    onClick={resetFilters}
                                    className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
                                >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                    Reset Filtri
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                {/* Tipo Cliente Toggle */}
                                <div className="lg:col-span-4 flex flex-col gap-2 mb-2">
                                    <span className="text-xs font-medium text-slate-400">Tipo Cliente</span>
                                    <div className="flex bg-black/40 p-1 rounded-xl border border-white/5 w-max">
                                        {(["tutti", "consumer", "business"] as const).map((t) => (
                                            <button
                                                key={t}
                                                onClick={() => { setFilterTipo(t); setCurrentPage(1); }}
                                                className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-all duration-200 ${filterTipo === t
                                                    ? "bg-violet-500/20 text-violet-300 border border-violet-500/20 shadow-lg shadow-violet-500/5"
                                                    : "text-slate-400 hover:text-white"
                                                    }`}
                                            >
                                                {t}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Common Fields */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-slate-400">Nome {filterTipo === "business" && "Referente"}</label>
                                    <input
                                        type="text"
                                        value={filterNome}
                                        onChange={(e) => { setFilterNome(e.target.value); setCurrentPage(1); }}
                                        className="w-full glass-input text-sm rounded-lg py-2"
                                        placeholder="Es. Mario"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-slate-400">Cognome {filterTipo === "business" && "Referente"}</label>
                                    <input
                                        type="text"
                                        value={filterCognome}
                                        onChange={(e) => { setFilterCognome(e.target.value); setCurrentPage(1); }}
                                        className="w-full glass-input text-sm rounded-lg py-2"
                                        placeholder="Es. Rossi"
                                    />
                                </div>

                                {(filterTipo === "business" || filterTipo === "tutti") && (
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-slate-400">Ragione Sociale</label>
                                        <input
                                            type="text"
                                            value={filterRagione}
                                            onChange={(e) => { setFilterRagione(e.target.value); setCurrentPage(1); }}
                                            className="w-full glass-input text-sm rounded-lg py-2"
                                            placeholder="Es. Tech Srl"
                                            disabled={filterTipo !== "business"}
                                        />
                                    </div>
                                )}

                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-slate-400">Cellulare</label>
                                    <input
                                        type="text"
                                        value={filterCellulare}
                                        onChange={(e) => { setFilterCellulare(e.target.value); setCurrentPage(1); }}
                                        className="w-full glass-input text-sm rounded-lg py-2"
                                        placeholder="Es. 333..."
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-slate-400">Email</label>
                                    <input
                                        type="text"
                                        value={filterEmail}
                                        onChange={(e) => { setFilterEmail(e.target.value); setCurrentPage(1); }}
                                        className="w-full glass-input text-sm rounded-lg py-2"
                                        placeholder="email@..."
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-slate-400">
                                        {filterTipo === "consumer" ? "Codice Fiscale" : filterTipo === "business" ? "Partita IVA" : "CF / P.IVA"}
                                    </label>
                                    <input
                                        type="text"
                                        value={filterIdentifier}
                                        onChange={(e) => { setFilterIdentifier(e.target.value); setCurrentPage(1); }}
                                        className="w-full glass-input text-sm rounded-lg py-2 font-mono"
                                        placeholder="Identificativo"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TABLE */}
                    <div className="glass-panel overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm text-slate-400">
                                <thead className="text-xs text-slate-400 bg-white/[0.02] border-b border-white/5 uppercase">
                                    <tr>
                                        <th className="px-6 py-4 font-semibold">Cliente</th>
                                        <th className="px-6 py-4 font-semibold">Contatti</th>
                                        <th className="px-6 py-4 font-semibold">Indirizzo</th>
                                        <th className="px-6 py-4 font-semibold text-right">Identificativo</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedData.length > 0 ? (
                                        paginatedData.map((cliente) => (
                                            <tr key={cliente.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors group">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`flex-none w-10 h-10 rounded-full flex items-center justify-center border ${cliente.tipo === "business"
                                                            ? "bg-amber-500/10 border-amber-500/20 text-amber-500"
                                                            : "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                                                            }`}>
                                                            {cliente.tipo === 'business' ? <Building className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                                                        </div>
                                                        <div className="cursor-pointer" onClick={() => setSelectedCliente(cliente)}>
                                                            <div className="font-medium text-white group-hover:text-violet-400 transition-colors flex items-center gap-1.5">
                                                                {cliente.tipo === "business"
                                                                    ? cliente.ragioneSociale
                                                                    : `${cliente.nome} ${cliente.cognome}`}
                                                                <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-violet-500" />
                                                            </div>
                                                            <div className="text-xs text-slate-500 capitalize flex items-center gap-1.5 mt-0.5">
                                                                <span className={`w-1.5 h-1.5 rounded-full ${cliente.tipo === 'business' ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                                                                {cliente.tipo} {cliente.tipo === 'business' && `- Ref: ${cliente.nome} ${cliente.cognome}`}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="space-y-1">
                                                        <div className="flex items-center gap-2 text-slate-300">
                                                            <Smartphone className="w-3.5 h-3.5 text-slate-500" />
                                                            <span className="font-mono text-xs">{cliente.cellulare}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2 text-slate-300">
                                                            <Mail className="w-3.5 h-3.5 text-slate-500" />
                                                            <span className="text-xs">{cliente.email}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-start gap-2">
                                                        <MapPin className="w-3.5 h-3.5 text-slate-500 mt-0.5" />
                                                        <div className="text-xs">
                                                            <div className="text-slate-300">{cliente.indirizzo}</div>
                                                            <div className="text-slate-500">{cliente.citta}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-xs font-mono text-slate-300">
                                                        {cliente.cf_piva}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                                                <div className="flex flex-col items-center justify-center gap-2">
                                                    <Search className="w-6 h-6 text-slate-600 mb-2" />
                                                    <p>Nessun cliente trovato con i filtri correnti.</p>
                                                    <button onClick={resetFilters} className="text-violet-400 hover:text-violet-300 text-sm mt-2">
                                                        Cancellare i filtri?
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* PAGINATION FOOTER */}
                        {filteredData.length > 0 && (
                            <div className="flex items-center justify-between px-6 py-4 border-t border-white/5 bg-white/[0.01]">
                                <div className="flex items-center gap-2 text-sm text-slate-400">
                                    <span>Mostra</span>
                                    <select
                                        value={itemsPerPage}
                                        onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                                        className="bg-black/40 border border-white/10 rounded-lg py-1 px-2 text-white focus:ring-1 focus:ring-violet-500"
                                    >
                                        <option value={25}>25</option>
                                        <option value={50}>50</option>
                                        <option value={100}>100</option>
                                    </select>
                                    <span>risultati su {filteredData.length}</span>
                                </div>

                                <div className="flex gap-1">
                                    <button
                                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                                        disabled={currentPage === 1}
                                        className="px-3 py-1.5 rounded-lg border border-white/10 text-sm font-medium text-slate-300 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        Indietro
                                    </button>

                                    {/* Page Numbers */}
                                    <div className="flex items-center gap-1 mx-2">
                                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                            // Simple pagination window logic
                                            let num = i + 1;
                                            if (totalPages > 5 && currentPage > 3) {
                                                num = currentPage - 2 + i;
                                                if (num > totalPages) num = totalPages - (4 - i);
                                            }
                                            return (
                                                <button
                                                    key={num}
                                                    onClick={() => setCurrentPage(num)}
                                                    className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${currentPage === num
                                                        ? "bg-violet-500 text-white shadow-lg shadow-violet-500/20"
                                                        : "text-slate-400 hover:text-white hover:bg-white/5"
                                                        }`}
                                                >
                                                    {num}
                                                </button>
                                            )
                                        })}
                                    </div>

                                    <button
                                        onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                                        disabled={currentPage === totalPages}
                                        className="px-3 py-1.5 rounded-lg border border-white/10 text-sm font-medium text-slate-300 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        Avanti
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                </div>
            </div>

            {/* MODAL DETTAGLIO CLIENTE */}
            {selectedCliente && (
                <ClienteDetailModal
                    cliente={selectedCliente}
                    onClose={() => setSelectedCliente(null)}
                />
            )}
        </div>
    );
}
