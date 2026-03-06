"use client";

import { useState } from "react";
import { Search, Save, Trash2, Paperclip, CheckSquare, MessageSquare, X } from "lucide-react";
import { cn } from "@/utils";
import { StatusDropdown, STATUS_OPTIONS } from "@/components/StatusDropdown";
import { DatePickerInput } from "@/components/DatePickerInput";
import { useAuth } from "@/context/AuthContext";

// Mock data representing the complex admin view of PDAs
const mockGestioneData = [
    {
        id: 11,
        logo: "🏢",
        categoria: "ENERGIA",
        brand: "Edison Business",
        venditore: "Luca Perotta",
        inviato_il: "23/08/2023 10:52",
        operatore: "Alfonso Carluccini",
        stato: "Assegnata",
        societa: "modoc",
        piva: "41341241241",
        referente: "raul",
        recapito: "3296263515",
        tipologia: "FISSO",
        segmento: "Business",
        pod: "1",
        pdr: "1",
        note: "Il cliente ha richiesto di essere contattato solo la mattina. Verificare i documenti allegati prima di procedere."
    },
    {
        id: 10,
        logo: "🏢",
        categoria: "ENERGIA",
        brand: "Edison Business",
        venditore: "Alessandro Sandri",
        inviato_il: "19/07/2023 15:21",
        operatore: "Alessandro Sandri",
        stato: "Inserito",
        societa: "Reesolve Srl",
        piva: "00144768699",
        referente: "Remo",
        recapito: "3333333333",
        tipologia: "FISSO",
        segmento: "Business",
        pod: "1",
        pdr: "",
        note: ""
    }
];

export default function GestionePda() {
    const { user } = useAuth();
    const [selectedNote, setSelectedNote] = useState<{ id: number, text: string } | null>(null);

    const isAdmin = user?.role === "admin";

    return (
        <div className="w-full">
            <div className="mb-8">
                <h2 className="text-3xl font-bold text-white mb-2">Gestione PDA (Back Office)</h2>
                <p className="text-slate-400">Visualizza, verifica e gestisci le PDA ricevute</p>
            </div>

            {/* Advanced Filter Section Replica */}
            <div className="glass-card mb-6 p-6">
                <h3 className="text-lg font-medium text-white mb-4 border-b border-white/10 pb-2">Ricerca avanzata</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {/* 1. Prodotto */}
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

                    {/* 2. Brand */}
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

                    {/* 3. Venditore */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Venditore</label>
                        <select className="glass-input w-full">
                            <option>Tutti</option>
                            <option>agente</option>
                            <option>Luca Perotta</option>
                        </select>
                    </div>

                    {/* 4. Stato */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Stato</label>
                        <select className="glass-input w-full">
                            <option>Tutti gli stati</option>
                            {STATUS_OPTIONS.map(opt => (
                                <option key={opt.label} value={opt.label}>{opt.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* 5. Da data invio */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Da data invio</label>
                        <DatePickerInput
                            id="dadatainvio"
                            name="dadatainvio"
                            placeholder="inserire data inizio"
                        />
                    </div>

                    {/* 6. A data invio */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">A data invio</label>
                        <DatePickerInput
                            id="adatainvio"
                            name="adatainvio"
                            placeholder="inserire data fine"
                        />
                    </div>

                    {/* 7. Operatore Back Office (Admin only) */}
                    {isAdmin && (
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2 text-indigo-300">Operatore Back Office</label>
                            <select className="glass-input w-full border-indigo-500/30 focus:border-indigo-500/50">
                                <option>Tutti gli operatori</option>
                                <option>Alfonso Carluccini</option>
                                <option>Alessandro Sandri</option>
                                {/* Populate dynamically based on available BO operators */}
                            </select>
                        </div>
                    )}
                </div>
                <div className="mt-6 flex gap-3">
                    <button className="primary-btn h-10 px-6">Ricerca pda</button>
                    <button className="h-10 px-6 rounded-lg font-medium bg-white/5 text-slate-300 hover:bg-white/10 transition-colors">Annulla</button>
                </div>
            </div>

            {/* Editable Data Table */}
            <div className="glass-card overflow-hidden">
                <div className="p-4 border-b border-white/5 flex gap-4 bg-white/[0.02]">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input type="text" placeholder="Cerca..." className="glass-input w-full pl-10" />
                    </div>
                </div>

                <div className="overflow-x-auto w-full max-w-[100vw] pb-48">
                    {/* Force a wide minimum width because admin tables have many inputs */}
                    <table className="w-full min-w-[1800px] text-left text-sm text-slate-300">
                        <thead className="bg-white/[0.03] text-xs uppercase text-slate-400">
                            <tr>
                                <th className="px-4 py-4 w-12 text-center"><CheckSquare className="w-4 h-4 mx-auto cursor-pointer" /></th>
                                <th className="px-4 py-4 font-semibold">Brand</th>
                                <th className="px-4 py-4">Venditore</th>
                                <th className="px-4 py-4">Inviato il</th>
                                <th className="px-4 py-4 w-32 text-center">Azioni</th>
                                <th className="px-4 py-4 w-48">Operatore BO</th>
                                <th className="px-4 py-4 w-48">Stato</th>
                                <th className="px-4 py-4 w-16 text-center">Note</th>
                                <th className="px-4 py-4">Ragione Sociale</th>
                                <th className="px-4 py-4">P. IVA</th>
                                <th className="px-4 py-4 w-32">Segmento</th>
                            </tr>
                        </thead>
                        <tbody>
                            {mockGestioneData.map((row) => (
                                <tr key={row.id} className="border-b border-white/5 bg-white/[0.01] hover:bg-white/[0.03] transition-colors">
                                    <td className="px-4 py-3 text-center">
                                        <input type="checkbox" className="w-4 h-4 rounded border-white/20 bg-white/5 accent-primary" />
                                    </td>
                                    <td className="px-4 py-3 font-medium text-white">{row.brand}</td>
                                    <td className="px-4 py-3 text-slate-400">{row.venditore}</td>
                                    <td className="px-4 py-3 text-xs text-slate-500">{row.inviato_il}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-1 justify-center">
                                            <button className="p-1.5 rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors" title="Allegati"><Paperclip className="w-4 h-4" /></button>
                                            <button className="p-1.5 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors" title="Salva"><Save className="w-4 h-4" /></button>
                                            <button className="p-1.5 rounded bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 transition-colors" title="Elimina"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                    </td>
                                    <td className="px-2 py-3">
                                        <select className="glass-input w-full text-xs py-1.5 px-2 h-auto" defaultValue={row.operatore}>
                                            <option>{row.operatore}</option>
                                            <option>Alfonso Carluccini</option>
                                        </select>
                                    </td>
                                    <td className="px-2 py-3">
                                        {/* isAgent={false} since this is the Back Office (Gestione) page */}
                                        <StatusDropdown value={row.stato} isAgent={false} />
                                    </td>
                                    <td className="px-2 py-3 text-center">
                                        <button
                                            onClick={() => setSelectedNote({ id: row.id, text: row.note || "" })}
                                            className={cn(
                                                "p-1.5 rounded transition-all",
                                                row.note ? "bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30" : "bg-white/5 text-slate-500 hover:bg-white/10"
                                            )}
                                            title="Visualizza/Modifica Note"
                                        >
                                            <MessageSquare className="w-4 h-4" />
                                        </button>
                                    </td>
                                    <td className="px-4 py-3 text-slate-300">{row.societa}</td>
                                    <td className="px-4 py-3 text-slate-300 font-mono text-xs">{row.piva}</td>
                                    <td className="px-4 py-3 text-slate-300">{row.segmento}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between text-xs text-slate-400 bg-white/[0.01]">
                    <span>Visualizzate da 1 a 2 di 2 totale</span>
                </div>
            </div>

            {/* Note Modal */}
            {selectedNote && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="glass-card w-full max-w-lg shadow-2xl relative flex flex-col max-h-[90vh]">
                        {/* Header */}
                        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-white/[0.02] rounded-t-xl shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-500/20 rounded-lg">
                                    <MessageSquare className="w-5 h-5 text-indigo-400" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white">Note Pratica</h3>
                                    <p className="text-xs text-slate-400">ID Pratica: #{selectedNote.id}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedNote(null)}
                                className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-6 overflow-y-auto">
                            <label className="block text-sm font-medium text-slate-300 mb-2">Aggiungi o modifica nota</label>
                            <textarea
                                className="glass-input w-full min-h-[160px] resize-y text-sm leading-relaxed"
                                placeholder="Scrivi una nota per questa pratica..."
                                defaultValue={selectedNote.text}
                            />
                            <p className="text-xs text-slate-500 mt-2">
                                Scrivi qualsiasi dettaglio importante che gli altri operatori di back office devono sapere per questa pratica. Le note lunghe possono essere lette tranquillamente qui.
                            </p>
                        </div>

                        {/* Footer */}
                        <div className="p-5 border-t border-white/10 bg-black/20 flex justify-end gap-3 rounded-b-xl shrink-0 mt-auto">
                            <button
                                onClick={() => setSelectedNote(null)}
                                className="px-5 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                            >
                                Annulla
                            </button>
                            <button
                                onClick={() => {
                                    // In a real implementation we would save to the DB here
                                    setSelectedNote(null);
                                }}
                                className="primary-btn px-6 py-2 text-sm"
                            >
                                Salva Note
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
