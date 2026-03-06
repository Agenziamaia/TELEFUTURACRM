"use client";

import { useState } from "react";
import { Search, Eye, Edit, Trash2 } from "lucide-react";
import { cn } from "@/utils";
import { DatePickerInput } from "@/components/DatePickerInput";
import { useAuth } from "@/context/AuthContext";

// Placeholder mock data based on the Registra Contratto requested columns
const mockContrattiData = [
    {
        id: "CTR-001",
        venditore: "Luca Perotta",
        brand: "WindTre",
        prodotto: "Super Fibra",
        cliente: "Mario Rossi",
        negozio: "Store Milano Centro",
        codice_attivazione: "ACT-12345",
        data_registrazione: "20/10/2023",
        data_attivazione: "22/10/2023",
        stato: "Attivo",
    },
    {
        id: "CTR-002",
        venditore: "Alessandro Sandri",
        brand: "Fastweb",
        prodotto: "Mobile 100GB",
        cliente: "Reesolve Srl",
        negozio: "Store Roma Termini",
        codice_attivazione: "ACT-98765",
        data_registrazione: "15/10/2023",
        data_attivazione: "15/10/2023",
        stato: "In lavorazione",
    }
];

export default function RicercaContratto() {
    const { user } = useAuth();

    // RBAC: Store-Based Visibility Logic
    const isGlobalView = ["admin", "supervisore", "back_office"].includes(user?.role || "");
    const lockedStore = !isGlobalView ? user?.negozio : null;
    const lockedVenditore = !isGlobalView ? user?.name : null;

    // Apply strict Store-Based Scoping to the data table
    const visibleData = mockContrattiData.filter(row => {
        if (!isGlobalView && lockedStore) {
            return row.negozio === lockedStore;
        }
        return true;
    });

    return (
        <div className="w-full">
            <div className="mb-8">
                <h2 className="text-3xl font-bold text-white mb-2">Ricerca Contratto</h2>
                <p className="text-slate-400">Ricerca e gestisci i contratti registrati a sistema</p>
            </div>

            {/* Advanced Search Filter Section */}
            <div className="glass-card mb-6 p-6">
                <h3 className="text-lg font-medium text-white mb-4 border-b border-white/10 pb-2 flex items-center gap-2">
                    <Search className="w-5 h-5 text-indigo-400" />
                    Filtri di ricerca
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">

                    {/* 1. Venditore */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Venditore</label>
                        <select
                            className="glass-input w-full disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={!isGlobalView}
                            defaultValue={lockedVenditore || "Tutti"}
                        >
                            <option value="Tutti">Tutti i venditori</option>
                            <option value="Luca Perotta">Luca Perotta</option>
                            <option value="Alessandro Sandri">Alessandro Sandri</option>
                            <option value="Venditore 1">Venditore 1</option>
                            <option value="Store Manager Roma">Store Manager Roma</option>
                        </select>
                    </div>

                    {/* 2. Codice contratto */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Codice contratto</label>
                        <input type="text" placeholder="Es. CTR-123" className="glass-input w-full" />
                    </div>

                    {/* 3. IMEI */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">IMEI</label>
                        <input type="number" placeholder="Inserisci IMEI" className="glass-input w-full" />
                    </div>

                    {/* 4. Brand */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Brand</label>
                        <select className="glass-input w-full">
                            <option>Tutti i brand</option>
                            <option>Fastweb</option>
                            <option>WindTre</option>
                            <option>S4 Energia</option>
                            <option>Sky</option>
                            <option>Dojo</option>
                        </select>
                    </div>

                    {/* 5. Prodotto */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Prodotto</label>
                        <select className="glass-input w-full">
                            <option>Tutti i prodotti</option>
                            <option>Mobile</option>
                            <option>Fisso</option>
                            <option>Luce & Gas</option>
                            <option>Assicurazioni</option>
                            <option>Protecta</option>
                            <option>POS</option>
                        </select>
                    </div>

                    {/* 6. Negozio di attivazione */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Negozio di attivazione</label>
                        <select
                            className="glass-input w-full disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={!isGlobalView}
                            defaultValue={lockedStore || "Tutti"}
                        >
                            <option value="Tutti">Tutti i negozi</option>
                            <option value="Store Milano Centro">Store Milano Centro</option>
                            <option value="Store Roma Termini">Store Roma Termini</option>
                        </select>
                    </div>

                    {/* 7. Codice di attivazione */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Codice di attivazione</label>
                        <select className="glass-input w-full">
                            <option>Tutti i codici</option>
                            <option>ACT-12345</option>
                            <option>ACT-98765</option>
                        </select>
                    </div>

                    {/* 8. Cliente */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Cliente</label>
                        <input type="text" placeholder="Nome, C.F. o P.IVA" className="glass-input w-full" />
                    </div>

                    {/* 9. Numero di cellulare */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Numero di cellulare</label>
                        <input type="number" placeholder="Es. 3331234567" className="glass-input w-full" />
                    </div>
                </div>

                {/* Date Ranges Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-6 pt-6 border-t border-white/5">
                    {/* Data Attivazione */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Da data attivazione</label>
                        <DatePickerInput id="da_data_attivazione" name="da_data_attivazione" placeholder="Seleziona data" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">A data attivazione</label>
                        <DatePickerInput id="a_data_attivazione" name="a_data_attivazione" placeholder="Seleziona data" />
                    </div>

                    {/* Data Registrazione */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Da data registrazione</label>
                        <DatePickerInput id="da_data_registrazione" name="da_data_registrazione" placeholder="Seleziona data" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">A data registrazione</label>
                        <DatePickerInput id="a_data_registrazione" name="a_data_registrazione" placeholder="Seleziona data" />
                    </div>
                </div>

                {/* CTA Buttons */}
                <div className="mt-8 flex gap-3">
                    <button className="primary-btn h-10 px-8 text-sm">Cerca Contratto</button>
                    <button className="h-10 px-6 rounded-lg font-medium bg-white/5 text-slate-300 hover:bg-white/10 transition-colors text-sm">Annulla</button>
                </div>
            </div>

            {/* Results Table */}
            <div className="glass-card overflow-hidden">
                <div className="p-4 border-b border-white/5 flex gap-4 bg-white/[0.02]">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input type="text" placeholder="Filtra risultati..." className="glass-input w-full pl-10" />
                    </div>
                </div>

                <div className="overflow-x-auto w-full">
                    <table className="w-full text-left text-sm text-slate-300">
                        <thead className="bg-white/[0.03] text-xs uppercase text-slate-400">
                            <tr>
                                <th className="px-4 py-4 font-semibold">Venditore</th>
                                <th className="px-4 py-4 font-semibold">Brand</th>
                                <th className="px-4 py-4 font-semibold">Prodotto</th>
                                <th className="px-4 py-4 font-semibold">Cliente</th>
                                <th className="px-4 py-4 font-semibold">Negozio</th>
                                <th className="px-4 py-4 font-semibold">Codice Attivazione</th>
                                <th className="px-4 py-4 font-semibold">Data Registrazione</th>
                                <th className="px-4 py-4 font-semibold">Data Attivazione</th>
                                <th className="px-4 py-4 font-semibold">Stato</th>
                                <th className="px-4 py-4 w-32 text-center">Azioni</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleData.map((row) => (
                                <tr key={row.id} className="border-b border-white/5 bg-white/[0.01] hover:bg-white/[0.03] transition-colors">
                                    <td className="px-4 py-3 text-slate-300">{row.venditore}</td>
                                    <td className="px-4 py-3 font-medium text-white">{row.brand}</td>
                                    <td className="px-4 py-3 text-slate-300">{row.prodotto}</td>
                                    <td className="px-4 py-3 text-slate-300 font-medium">{row.cliente}</td>
                                    <td className="px-4 py-3 text-slate-400 text-xs">{row.negozio}</td>
                                    <td className="px-4 py-3 text-slate-400 font-mono text-xs">{row.codice_attivazione}</td>
                                    <td className="px-4 py-3 text-slate-500 text-xs">{row.data_registrazione}</td>
                                    <td className="px-4 py-3 text-slate-500 text-xs">{row.data_attivazione}</td>
                                    <td className="px-4 py-3">
                                        <span className={cn(
                                            "px-2 py-1 rounded-full text-[10px] font-medium uppercase tracking-wider",
                                            row.stato === 'Attivo' ? "bg-emerald-500/10 text-emerald-400" :
                                                "bg-amber-500/10 text-amber-400"
                                        )}>
                                            {row.stato}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-1 justify-center">
                                            <button className="p-1.5 rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors" title="Visualizza Dettaglio"><Eye className="w-4 h-4" /></button>
                                            <button className="p-1.5 rounded bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 transition-colors" title="Modifica"><Edit className="w-4 h-4" /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {visibleData.length === 0 && (
                                <tr>
                                    <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                                        Nessun contratto trovato per i criteri o permessi correnti.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between text-xs text-slate-400 bg-white/[0.01]">
                    <span>Visualizzati {visibleData.length} contratti</span>
                </div>
            </div>
        </div>
    );
}
