"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
    Search, Eye, FileText, AlertTriangle, Zap, Clock,
    MapPin, User, Building, Phone, Calendar, ArrowRight,
    TrendingUp, CheckCircle, Info, X, Save, History,
    RefreshCw, ChevronRight, LayoutGrid, Filter, DollarSign
} from "lucide-react";
import { cn } from "@/utils";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const CATEGORIE = [
    { id: "mnp", label: "MNP", desc: "Portabilità mobile", color: "#6366f1", icon: Phone },
    { id: "fisso", label: "Fisso", desc: "Linee fisse tutti gli op.", color: "#0ea5e9", icon: MapPin },
    { id: "finanziamento", label: "Finanziamento", desc: "Wind / VF / Fastweb", color: "#f59e0b", icon: DollarSign },
    { id: "piva", label: "P.IVA", desc: "Vodafone Business", color: "#8b5cf6", icon: Building },
    { id: "energia", label: "Energia", desc: "Luce & Gas tutti gli op.", color: "#10b981", icon: Zap },
    { id: "sky", label: "Sky", desc: "Sky 3P / Sky solo V", color: "#ef4444", icon: LayoutGrid },
];

const STATI_NEGOZIO = [
    { id: "nuovo", label: "Nuovo", color: "#94a3b8", bg: "#1e293b" },
    { id: "contattare_cliente", label: "Contattato Cliente", color: "#f59e0b", bg: "#451a03" },
    { id: "contattare_supporto", label: "Contattato Supporto", color: "#f97316", bg: "#431407" },
    { id: "doc_mancante", label: "Doc Mancante", color: "#e879f9", bg: "#3b0764" },
    { id: "in_corso", label: "In Corso", color: "#3b82f6", bg: "#172554" },
    { id: "attivato", label: "Completato", color: "#22c55e", bg: "#052e16" },
    { id: "ko", label: "KO", color: "#ef4444", bg: "#450a0a" },
];

const STATI_NEGOZIO_MNP = STATI_NEGOZIO.filter(s => s.id !== "doc_mancante" && s.id !== "contattare_supporto").concat([
    { id: "re_inserita", label: "Re-Inserita", color: "#38bdf8", bg: "#0c2a3f" },
]);

const STATI_NEGOZIO_FISSO = [
    { id: "nuovo", label: "Nuovo", color: "#94a3b8", bg: "#1e293b" },
    { id: "contattare_cliente", label: "Contattato Cliente", color: "#f59e0b", bg: "#451a03" },
    { id: "contattare_supporto", label: "Contattato Supporto", color: "#f97316", bg: "#431407" },
    { id: "in_corso", label: "In Corso", color: "#3b82f6", bg: "#172554" },
    { id: "attivato", label: "Completato", color: "#22c55e", bg: "#052e16" },
    { id: "ko", label: "KO Ripensamento", color: "#ef4444", bg: "#450a0a" },
    { id: "ko_tecnico", label: "KO Tecnico Definitivo", color: "#dc2626", bg: "#3f0a0a" },
    { id: "ko_reinserito", label: "KO Reinserito", color: "#f97316", bg: "#431407" },
    { id: "ricaduta", label: "Ricaduta", color: "#a78bfa", bg: "#2e1065" },
];

const STATI_NEGOZIO_FINANZIAMENTO = [
    { id: "nuovo", label: "Nuovo", color: "#94a3b8", bg: "#1e293b" },
    { id: "otp_mancante", label: "OTP Mancante", color: "#f59e0b", bg: "#451a03" },
    { id: "liquidato", label: "Liquidato", color: "#22c55e", bg: "#052e16" },
    { id: "annullato", label: "Annullato", color: "#ef4444", bg: "#450a0a" },
    { id: "cartaceo", label: "Cartaceo", color: "#e879f9", bg: "#3b0764" },
    { id: "in_liquidazione", label: "In Liquidazione", color: "#3b82f6", bg: "#172554" },
    { id: "doc_mancante", label: "Doc Mancante", color: "#fb923c", bg: "#431407" },
    { id: "contattare_supporto", label: "Contattato Supporto", color: "#f97316", bg: "#431407" },
    { id: "modulo_win_back", label: "Modulo Win Back", color: "#818cf8", bg: "#1e1b4b" },
];

const STATI_NEGOZIO_PIVA = [
    { id: "nuovo", label: "Nuovo", color: "#94a3b8", bg: "#1e293b" },
    { id: "contattare_cliente", label: "Contattato Cliente", color: "#f59e0b", bg: "#451a03" },
    { id: "contattare_supporto", label: "Contattato Supporto", color: "#f97316", bg: "#431407" },
    { id: "in_lavorazione", label: "In Lavorazione", color: "#3b82f6", bg: "#172554" },
    { id: "cliente_irreperibile", label: "Cliente Irreperibile", color: "#e879f9", bg: "#3b0764" },
    { id: "in_attesa_dispositivo", label: "In Attesa Dispositivo", color: "#38bdf8", bg: "#0c2a3f" },
    { id: "attivato", label: "Completato", color: "#22c55e", bg: "#052e16" },
    { id: "ko_tecnico_piva", label: "KO Tecnico", color: "#dc2626", bg: "#3f0a0a" },
    { id: "ko_credito", label: "KO Credito", color: "#f97316", bg: "#431407" },
    { id: "ko_reinserito_piva", label: "KO Reinserito", color: "#a78bfa", bg: "#2e1065" },
];

const STATI_NEGOZIO_ENERGIA = [
    { id: "nuovo", label: "Nuovo", color: "#94a3b8", bg: "#1e293b" },
    { id: "contattare_cliente", label: "Contattato Cliente", color: "#f59e0b", bg: "#451a03" },
    { id: "contattare_supporto", label: "Contattato Supporto", color: "#f97316", bg: "#431407" },
    { id: "doc_mancante", label: "Doc Mancante", color: "#e879f9", bg: "#3b0764" },
    { id: "in_lavorazione_en", label: "In Lavorazione", color: "#3b82f6", bg: "#172554" },
    { id: "attivato", label: "Completato", color: "#22c55e", bg: "#052e16" },
    { id: "ko", label: "KO", color: "#ef4444", bg: "#450a0a" },
    { id: "ko_verifica_email", label: "KO Verifica Email", color: "#dc2626", bg: "#3f0a0a" },
    { id: "ko_credito_en", label: "KO Credito", color: "#f97316", bg: "#431407" },
    { id: "inserimento_errato", label: "Inserimento Errato", color: "#fb923c", bg: "#431407" },
    { id: "ko_reinserito_en", label: "KO Reinserito", color: "#a78bfa", bg: "#2e1065" },
    { id: "ko_mancanza_firma", label: "KO Mancanza Firma", color: "#e879f9", bg: "#4a044e" },
    { id: "ko_sii", label: "KO dal Sii", color: "#dc2626", bg: "#3f0a0a" },
];

const STATI_NEGOZIO_SKY = [
    { id: "nuovo", label: "Nuovo", color: "#94a3b8", bg: "#1e293b" },
    { id: "contattare_cliente", label: "Contattato Cliente", color: "#f59e0b", bg: "#451a03" },
    { id: "in_attivazione_sky", label: "In Attivazione", color: "#3b82f6", bg: "#172554" },
    { id: "wm_sospetta", label: "WM Sospetta", color: "#f97316", bg: "#431407" },
    { id: "wm_confermata", label: "TV WM - BB in Corso", color: "#fb923c", bg: "#451a03" },
    { id: "tv_wm_bb_ok", label: "TV WM - BB Ok", color: "#4ade80", bg: "#052e16" },
    { id: "completo_sky", label: "Completo", color: "#22c55e", bg: "#052e16" },
    { id: "attesa_matricola", label: "Attesa Matricola", color: "#38bdf8", bg: "#0c2a3f" },
    { id: "ripensamento_sky", label: "Ripensamento Cliente", color: "#e879f9", bg: "#3b0764" },
    { id: "attivo_sky", label: "Attivo", color: "#4ade80", bg: "#052e16" },
    { id: "ko_frode_mop", label: "KO Frode MOP", color: "#dc2626", bg: "#3f0a0a" },
    { id: "ko_reinserito_sky", label: "KO Reinserito", color: "#a78bfa", bg: "#2e1065" },
    { id: "aperto_sparks", label: "Aperto Sparks", color: "#fbbf24", bg: "#451a03" },
    { id: "recesso_info_errate", label: "Recesso per Info Errate", color: "#f43f5e", bg: "#4c0519" },
];

const STATI_ADMIN = [
    { id: "da_verificare", label: "Da Verificare", color: "#64748b", bg: "#1e293b" },
    { id: "in_lavorazione", label: "In Lavorazione", color: "#3b82f6", bg: "#172554" },
    { id: "non_conforme", label: "Non Conforme", color: "#f97316", bg: "#431407" },
    { id: "confermato", label: "Confermato", color: "#22c55e", bg: "#052e16" },
    { id: "pagato", label: "Pagato", color: "#a78bfa", bg: "#2e1065" },
    { id: "stornato", label: "Stornato", color: "#ef4444", bg: "#450a0a" },
];

const STATI_ADMIN_FINANZIAMENTO = STATI_ADMIN.concat([
    { id: "stornato_da_ripagare", label: "Stornato, Da Ripagare", color: "#fb923c", bg: "#431407" },
    { id: "ripagato", label: "Ripagato", color: "#4ade80", bg: "#052e16" },
]);

// ─── UTILS & HELPERS ────────────────────────────────────────────────────────────

const MALUS_SOGLIE = { mnp: 6, fisso: 15, finanziamento: 6, piva: null, energia: 15, sky: 2 };
const MALUS_IMPORTO = { mnp: 5, fisso: 10, finanziamento: 10, piva: 5, energia: 10, sky: 5 };

function giorniLavorativiDa(dataStrIta: string) {
    if (!dataStrIta) return 0;
    const parti = dataStrIta.split("/");
    if (parti.length !== 3) return 0;
    const from = new Date(parseInt(parti[2]), parseInt(parti[1]) - 1, parseInt(parti[0]));
    const to = new Date();
    to.setHours(0, 0, 0, 0);
    from.setHours(0, 0, 0, 0);
    let count = 0;
    let cur = new Date(from);
    while (cur < to) {
        cur.setDate(cur.getDate() + 1);
        const dow = cur.getDay(); // 0=dom, 6=sab
        if (dow !== 0) count++;
    }
    return count;
}

function giorniDaUltimoAggiornamento(storia: any[]) {
    if (!storia || storia.length === 0) return 999;
    const ultimo = storia[storia.length - 1];
    return giorniLavorativiDa(ultimo.data);
}

function isMalusRow(row: any) {
    const statiCompletati: Record<string, string[]> = {
        mnp: ["attivato", "re_inserita"], fisso: ["attivato"], finanziamento: ["liquidato"],
        piva: ["attivato"], energia: ["attivato"], sky: ["completo_sky", "attivo_sky"],
    };
    if ((statiCompletati[row.categoria] || ["attivato"]).includes(row.statoNegozio)) return false;
    const ggAgg = giorniDaUltimoAggiornamento(row.storia);
    if (row.categoria === "mnp") return ggAgg >= 6;
    if (row.categoria === "fisso") return ggAgg >= 15;
    if (row.categoria === "finanziamento") return ggAgg >= 6;
    if (row.categoria === "piva") {
        if (ggAgg >= 6) return true;
        if (row.statoNegozio === "cliente_irreperibile" && ggAgg > 4) return true;
        return false;
    }
    if (row.categoria === "energia") return ggAgg >= 15;
    if (row.categoria === "sky") {
        const gg = giorniLavorativiDa(row.dataInserimento);
        const skyWarn = (row.statoNegozio === "nuovo" && gg >= 4) || ggAgg >= 10;
        return skyWarn && ggAgg >= 2;
    }
    return false;
}

function isAttenzioneRow(row: any) {
    const statiCompletati: Record<string, string[]> = {
        mnp: ["attivato", "re_inserita"], fisso: ["attivato"], finanziamento: ["liquidato"],
        piva: ["attivato"], energia: ["attivato"], sky: ["completo_sky", "attivo_sky"],
    };
    if ((statiCompletati[row.categoria] || ["attivato"]).includes(row.statoNegozio)) return false;
    if (isMalusRow(row)) return false;

    const gg = giorniLavorativiDa(row.dataInserimento);
    const ggAgg = giorniDaUltimoAggiornamento(row.storia);
    if (row.categoria === "mnp") {
        if (ggAgg >= 5) return true;
        if (gg >= 5 && row.statoNegozio !== "attivato" && row.statoNegozio !== "re_inserita") return true;
    } else if (row.categoria === "fisso") {
        if (ggAgg >= 10) return true;
        if (gg >= 20 && row.statoNegozio !== "attivato") return true;
    } else if (row.categoria === "finanziamento") {
        if (ggAgg >= 4) return true;
    } else if (row.categoria === "piva") {
        if (ggAgg >= 4) return true;
        if (gg >= 10 && row.statoNegozio !== "attivato") return true;
        if (row.statoNegozio === "cliente_irreperibile" && ggAgg >= 2) return true;
    } else if (row.categoria === "energia") {
        if (ggAgg >= 10) return true;
    } else if (row.categoria === "sky") {
        if (row.statoNegozio === "nuovo" && gg >= 4) return true;
        if (ggAgg >= 10) return true;
    }
    return false;
}

function isDaLavorareRow(row: any) {
    if (isAttenzioneRow(row) || isMalusRow(row)) return false;
    const statiCompletati: Record<string, string[]> = {
        mnp: ["attivato"], fisso: ["attivato"], finanziamento: ["liquidato"],
        piva: ["attivato"], energia: ["attivato"], sky: ["completo_sky", "attivo_sky"],
    };
    if ((statiCompletati[row.categoria] || ["attivato"]).includes(row.statoNegozio)) return false;

    const gg = giorniLavorativiDa(row.dataInserimento);
    const ggAgg = giorniDaUltimoAggiornamento(row.storia);
    if (row.categoria === "mnp") {
        if (ggAgg >= 2) return true;
    } else if (row.categoria === "fisso") {
        if (ggAgg >= 5) return true;
    } else if (row.categoria === "finanziamento") {
        if (ggAgg >= 2) return true;
    } else if (row.categoria === "piva") {
        if (ggAgg >= 2) return true;
        if (row.statoNegozio === "cliente_irreperibile") return true;
    } else if (row.categoria === "energia") {
        if (ggAgg >= 5) return true;
    } else if (row.categoria === "sky") {
        if (row.statoNegozio === "nuovo" && gg >= 2) return true;
        if (row.statoNegozio === "wm_sospetta") return true;
        if (row.statoNegozio === "attesa_matricola" && ggAgg >= 5) return true;
        if (row.statoNegozio === "aperto_sparks" && ggAgg >= 3) return true;
    }
    return false;
}

function calcolaMalus(row: any) {
    if (!isMalusRow(row)) return 0;
    const ggAgg = giorniDaUltimoAggiornamento(row.storia);
    if (row.categoria === "piva") {
        let totale = 0;
        if (ggAgg >= 6) totale += Math.max(0, ggAgg - 6 + 1) * 5;
        if (row.statoNegozio === "cliente_irreperibile" && ggAgg > 4) totale += Math.max(0, ggAgg - 4) * 5;
        return totale;
    }
    const soglia = (MALUS_SOGLIE as any)[row.categoria] || 0;
    return Math.max(0, ggAgg - soglia + 1) * ((MALUS_IMPORTO as any)[row.categoria] || 0);
}

// ─── COMPONENTS ────────────────────────────────────────────────────────────────

function StatoBadge({ id, set }: { id: string, set: "negozio" | "admin" }) {
    const pool = set === "admin" ? STATI_ADMIN_FINANZIAMENTO : (
        STATI_NEGOZIO.concat(STATI_NEGOZIO_FISSO, STATI_NEGOZIO_MNP, STATI_NEGOZIO_FINANZIAMENTO, STATI_NEGOZIO_PIVA, STATI_NEGOZIO_ENERGIA, STATI_NEGOZIO_SKY)
    );
    const s = pool.find(x => x.id === id) || (set === "admin" ? STATI_ADMIN[0] : STATI_NEGOZIO[0]);
    return (
        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold border" style={{ color: s.color, backgroundColor: s.bg, borderColor: s.color + "44" }}>
            {s.label}
        </span>
    );
}

// Main Page Component
export default function TrackingPDA() {
    const { user } = useAuth();
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<any | null>(null);
    const [catSel, setCatSel] = useState<string[]>([]);
    const [kpiFilter, setKpiFilter] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [ruolo, setRuolo] = useState<"negozio" | "admin">("negozio");

    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            const { data: contracts, error } = await supabase
                .from("contracts")
                .select("*, clients(nome, cognome, ragione_sociale)");

            if (contracts) {
                // Mapping Supabase data to the v2.0 component's expectations
                const mapped = contracts.map(c => {
                    const tipo = (c.clients?.tipo as string) ?? "consumer";
                    const nomeCognome = `${(c.clients?.nome as string) || ""} ${(c.clients?.cognome as string) || ""}`.trim();
                    const ragioneSociale = (c.clients?.ragione_sociale as string) ?? "—";
                    const clienteName = tipo === "business" && ragioneSociale !== "—" ? ragioneSociale : nomeCognome || "—";
                    
                    return {
                        ...c,
                        nominativo: clienteName,
                        piva: (c.clients?.cf_piva as string) ?? "—",
                        segmento: tipo === "business" ? "Business" : "Consumer",
                        statoNegozio: c.status_negozio || "nuovo", // Assuming these fields exist or mapping them
                        statoAdmin: c.status_admin || "da_verificare",
                        categoria: c.brand?.toLowerCase().includes("wind") || c.brand?.toLowerCase().includes("vodafone") ? "mnp" : "fisso", // Dynamic mapping example
                        dataInserimento: new Date(c.created_at).toLocaleDateString("it-IT"),
                        storia: c.dettagli_prodotto?.storia || [{ data: new Date(c.created_at).toLocaleDateString("it-IT"), tipo: "inserimento", testo: "Pratica creata", utente: "Sistema" }]
                    };
                });
                setData(mapped);
            }
            setLoading(false);
        }
        fetchData();
    }, []);

    const filtered = useMemo(() => {
        return data.filter(row => {
            // KPI Filtering
            if (kpiFilter === "__malus__" && !isMalusRow(row)) return false;
            if (kpiFilter === "__attenzione__" && (!isAttenzioneRow(row) || isMalusRow(row))) return false;
            if (kpiFilter === "__da_lavorare__" && (!isDaLavorareRow(row) || isMalusRow(row))) return false;
            if (kpiFilter === "__non_conforme__" && row.statoAdmin !== "non_conforme") return false;
            if (kpiFilter && kpiFilter.indexOf("__") === -1 && row.statoNegozio !== kpiFilter) return false;

            // Category filter
            if (catSel.length > 0 && !catSel.includes(row.categoria)) return false;

            // Search
            if (search.trim()) {
                const q = search.toLowerCase();
                return (
                    row.nominativo.toLowerCase().includes(q) ||
                    row.id.toLowerCase().includes(q) ||
                    (row.codice_attivazione && row.codice_attivazione.toLowerCase().includes(q))
                );
            }
            return true;
        });
    }, [data, kpiFilter, catSel, search]);

    const stats = useMemo(() => {
        return {
            totale: data.length,
            nuovi: data.filter(r => r.statoNegozio === "nuovo").length,
            daLavorare: data.filter(r => isDaLavorareRow(r)).length,
            warning: data.filter(r => isAttenzioneRow(r)).length,
            malus: data.filter(r => isMalusRow(r)).length,
            malusEuro: data.reduce((acc, r) => acc + calcolaMalus(r), 0)
        };
    }, [data]);

    return (
        <div className="p-8 min-h-screen bg-[#0f172a] text-slate-100 font-sans">
            {/* Header */}
            <div className="mb-8 flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
                        <LayoutGrid className="w-8 h-8 text-indigo-400" />
                        Tracking PDA v2.0
                    </h1>
                    <p className="text-slate-400">Contratto monitoraggio e gestione addebiti (Malus)</p>
                </div>

                <div className="flex gap-4">
                    <div className="flex bg-slate-800/50 p-1 rounded-lg border border-slate-700">
                        <button
                            onClick={() => setRuolo("negozio")}
                            className={cn("px-4 py-1.5 rounded-md text-sm font-medium transition-all", ruolo === "negozio" ? "bg-indigo-500 text-white shadow-lg" : "text-slate-400 hover:text-white")}
                        >
                            Negozio
                        </button>
                        <button
                            onClick={() => setRuolo("admin")}
                            className={cn("px-4 py-1.5 rounded-md text-sm font-medium transition-all", ruolo === "admin" ? "bg-indigo-500 text-white shadow-lg" : "text-slate-400 hover:text-white")}
                        >
                            Back Office
                        </button>
                    </div>
                    <button className="glass-card px-4 py-2 flex items-center gap-2 hover:bg-white/5 transition-all text-sm font-semibold">
                        <RefreshCw className="w-4 h-4 text-indigo-400" />
                        Sincronizza
                    </button>
                </div>
            </div>

            {/* KPI Bar */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
                {[
                    { label: "Totale", val: stats.totale, color: "indigo", filter: null, icon: FileText },
                    { label: "Nuovi", val: stats.nuovi, color: "slate", filter: "nuovo", icon: Info },
                    { label: "Da Lavorare", val: stats.daLavorare, color: "yellow", filter: "__da_lavorare__", icon: Zap },
                    { label: "Warning", val: stats.warning, color: "orange", filter: "__attenzione__", icon: Clock },
                    { label: "Malus", val: stats.malus, color: "red", filter: "__malus__", icon: AlertTriangle, extra: `€${stats.malusEuro} maturati` },
                    { label: "Non Conforme", val: data.filter(r => r.statoAdmin === "non_conforme").length, color: "purple", filter: "__non_conforme__", icon: X },
                ].map((card) => (
                    <div
                        key={card.label}
                        onClick={() => setKpiFilter(kpiFilter === card.filter ? null : card.filter)}
                        className={cn(
                            "glass-card p-5 cursor-pointer transition-all border-l-4",
                            kpiFilter === card.filter ? `border-l-${card.color}-500 bg-${card.color}-500/5` : "border-l-transparent hover:border-l-indigo-400"
                        )}
                    >
                        <div className="flex justify-between items-start mb-2">
                            <div className={cn("p-2 rounded-lg bg-white/5 shadow-inner", `text-${card.color}-400`)}>
                                <card.icon className="w-5 h-5" />
                            </div>
                            <span className="text-2xl font-black text-white">{card.val}</span>
                        </div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{card.label}</p>
                        {card.extra && card.val > 0 && (
                            <p className="text-[10px] text-red-400 font-bold mt-1 bg-red-400/10 px-2 py-0.5 rounded inline-block">
                                {card.extra}
                            </p>
                        )}
                    </div>
                ))}
            </div>

            {/* Filters & Table */}
            <div className="glass-card overflow-hidden">
                <div className="p-6 border-b border-white/5 flex flex-wrap gap-6 items-center justify-between bg-white/[0.01]">
                    <div className="flex gap-4 items-center">
                        <div className="relative w-80">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            <input
                                type="text"
                                placeholder="Cerca cliente, ID, codice..."
                                className="glass-input w-full pl-10"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>

                        <div className="flex gap-1">
                            {CATEGORIE.map(cat => (
                                <button
                                    key={cat.id}
                                    onClick={() => setCatSel(prev => prev.includes(cat.id) ? prev.filter(x => x !== cat.id) : [...prev, cat.id])}
                                    className={cn(
                                        "w-9 h-9 flex items-center justify-center rounded-lg border transition-all",
                                        catSel.includes(cat.id) ? "bg-indigo-500 border-indigo-400 text-white" : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
                                    )}
                                    title={cat.label}
                                >
                                    <cat.icon className="w-4 h-4" />
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="text-sm text-slate-500 font-medium">
                        Visualizzazione di <span className="text-indigo-400">{filtered.length}</span> pratiche su {data.length}
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-white/[0.03] text-[11px] font-black uppercase tracking-widest text-slate-500 border-b border-white/5">
                            <tr>
                                <th className="px-6 py-4">Categoria</th>
                                <th className="px-6 py-4">Cliente (Nome / Ragione Sociale)</th>
                                <th className="px-6 py-4">CF / P. IVA</th>
                                <th className="px-6 py-4">Segmento</th>
                                <th className="px-6 py-4">Inserimento</th>
                                <th className="px-6 py-4">Stato Negozio</th>
                                <th className="px-6 py-4">Stato Admin</th>
                                <th className="px-6 py-4">Alert</th>
                                <th className="px-6 py-4 text-right">Malus</th>
                                <th className="px-6 py-4 text-center">Azioni</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {filtered.map(row => {
                                const malus = calcolaMalus(row);
                                return (
                                    <tr key={row.id} className={cn("hover:bg-white/[0.02] transition-colors group", malus > 0 ? "bg-red-500/[0.03]" : "")}>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CATEGORIE.find(x => x.id === row.categoria)?.color }} />
                                                <span className="font-bold text-slate-300">{row.categoria.toUpperCase()}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div>
                                                <p className="font-bold text-white mb-0.5">{row.nominativo}</p>
                                                <p className="text-[10px] font-mono text-slate-500 uppercase tracking-tighter">{row.id}</p>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-slate-300 font-mono text-xs">
                                            {row.piva}
                                        </td>
                                        <td className="px-6 py-4 text-slate-300">
                                            {row.segmento}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2 text-slate-400">
                                                <Calendar className="w-3 h-3" />
                                                <span>{row.dataInserimento}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <StatoBadge id={row.statoNegozio} set="negozio" />
                                        </td>
                                        <td className="px-6 py-4">
                                            <StatoBadge id={row.statoAdmin} set="admin" />
                                        </td>
                                        <td className="px-6 py-4">
                                            {isMalusRow(row) ? (
                                                <span className="flex items-center gap-1.5 text-red-400 font-black text-[10px] uppercase">
                                                    <AlertTriangle className="w-3 h-3 fill-red-400/20" />
                                                    🔴 Malus
                                                </span>
                                            ) : isAttenzioneRow(row) ? (
                                                <span className="flex items-center gap-1.5 text-orange-400 font-black text-[10px] uppercase">
                                                    <Clock className="w-3 h-3" />
                                                    ⚠️ Warning
                                                </span>
                                            ) : isDaLavorareRow(row) ? (
                                                <span className="flex items-center gap-1.5 text-yellow-400 font-black text-[10px] uppercase">
                                                    <Zap className="w-3 h-3 fill-yellow-400/20" />
                                                    ⚡ Da Lavorare
                                                </span>
                                            ) : (
                                                <span className="text-slate-700">—</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {malus > 0 ? (
                                                <div className="inline-block px-3 py-1 rounded bg-red-500/10 border border-red-500/20">
                                                    <p className="text-red-400 font-black">€ {malus}</p>
                                                    <p className="text-[9px] text-red-500/70 font-bold uppercase">{Math.max(0, giorniDaUltimoAggiornamento(row.storia) - ((MALUS_SOGLIE as any)[row.categoria] || 0) + 1)}gg x €{(MALUS_IMPORTO as any)[row.categoria]}</p>
                                                </div>
                                            ) : (
                                                <span className="text-slate-700">€ 0.00</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex justify-center">
                                                <button
                                                    onClick={() => setSelected(row)}
                                                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all shadow-sm border border-transparent hover:border-white/10"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="px-6 py-20 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="p-4 rounded-full bg-slate-800/50 text-slate-600">
                                                <Search className="w-10 h-10" />
                                            </div>
                                            <p className="text-slate-500 font-medium">Nessuna pratica trovata con i filtri selezionati</p>
                                            <button onClick={() => { setKpiFilter(null); setCatSel([]); setSearch(""); }} className="text-indigo-400 font-bold underline text-sm">Resetta tutti i filtri</button>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Drawer Overlay */}
            {selected && (
                <div className="fixed inset-0 z-50 flex justify-end">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelected(null)} />
                    <div className="relative w-full max-w-2xl bg-[#0f111a] border-l border-white/10 shadow-2xl flex flex-col h-full animate-in slide-in-from-right duration-300">
                        {/* Drawer Header */}
                        <div className="p-6 border-b border-white/10 flex justify-between items-start bg-white/[0.02]">
                            <div>
                                <div className="flex items-center gap-3 mb-2">
                                    <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-black text-[10px] border border-indigo-500/20 uppercase tracking-tighter">
                                        {selected.categoria}
                                    </span>
                                    <span className="text-slate-500 text-xs font-mono">{selected.id}</span>
                                </div>
                                <h2 className="text-2xl font-black text-white">{selected.nominativo}</h2>
                                <div className="flex items-center gap-4 mt-2 text-slate-400 text-xs font-semibold">
                                    <div className="flex items-center gap-1"><User className="w-3 h-3" /> {selected.venditore}</div>
                                    <div className="flex items-center gap-1"><Building className="w-3 h-3" /> {selected.negozio}</div>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelected(null)}
                                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        {/* Drawer Content */}
                        <div className="flex-1 overflow-y-auto p-6">
                            {/* Category-Specific Info Panel */}
                            <div className="mb-8 p-6 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 grid grid-cols-2 gap-6 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                                    {React.createElement(CATEGORIE.find(x => x.id === selected.categoria)?.icon || LayoutGrid, { size: 120 })}
                                </div>

                                <div className="space-y-4 relative z-10">
                                    <div>
                                        <p className="text-[10px] font-black uppercase text-indigo-400 tracking-widest mb-1">Brand Operatore</p>
                                        <p className="text-lg font-bold text-white">{selected.brand}</p>
                                    </div>
                                    {selected.categoria === "mnp" && (
                                        <div>
                                            <p className="text-[10px] font-black uppercase text-indigo-400 tracking-widest mb-1">Data MNP Prevista</p>
                                            <p className="text-lg font-bold text-white">{selected.dettagli_prodotto?.data_mnp || "—"}</p>
                                        </div>
                                    )}
                                    {selected.categoria === "energia" && (
                                        <div>
                                            <p className="text-[10px] font-black uppercase text-indigo-400 tracking-widest mb-1">POD / PDR</p>
                                            <p className="text-lg font-mono font-bold text-white">{selected.pod || selected.pdr || "—"}</p>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-4 relative z-10">
                                    <div>
                                        <p className="text-[10px] font-black uppercase text-indigo-400 tracking-widest mb-1">Stato Corrente</p>
                                        <StatoBadge id={selected.statoNegozio} set="negozio" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase text-indigo-400 tracking-widest mb-1">Verifica Admin</p>
                                        <StatoBadge id={selected.statoAdmin} set="admin" />
                                    </div>
                                </div>
                            </div>

                            {/* Action Tabs */}
                            <div className="space-y-6">
                                <div className="flex gap-1 border-b border-white/5 pb-0.5">
                                    <button className="px-4 py-2 text-sm font-bold text-white border-b-2 border-indigo-500 transition-all">Verifica & Esito</button>
                                    <button className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-300 transition-all">Dati Tecnici</button>
                                    <button className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-300 transition-all flex items-center gap-2">
                                        Storico
                                        <span className="px-1.5 py-0.5 rounded-full bg-slate-800 text-[10px]">{selected.storia?.length || 0}</span>
                                    </button>
                                </div>

                                <div className="glass-card p-6 border border-white/10">
                                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-300 mb-4 flex items-center gap-2">
                                        <Save className="w-4 h-4 text-indigo-400" />
                                        Aggiorna Stato Pratica
                                    </h3>

                                    <div className="grid grid-cols-2 gap-4 mb-4">
                                        <div>
                                            <label className="text-[10px] font-black uppercase text-slate-500 mb-1.5 block">Nuovo Stato Negozio</label>
                                            <select className="glass-input w-full text-sm font-bold">
                                                {STATI_NEGOZIO.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                                            </select>
                                        </div>
                                        {ruolo === "admin" && (
                                            <div>
                                                <label className="text-[10px] font-black uppercase text-slate-500 mb-1.5 block">Esito Amministrativo</label>
                                                <select className="glass-input w-full text-sm font-bold">
                                                    {STATI_ADMIN.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                                                </select>
                                            </div>
                                        )}
                                    </div>

                                    <textarea
                                        placeholder="Inserisci una nota per l'aggiornamento..."
                                        className="glass-input w-full min-h-[100px] text-sm mb-4"
                                    />

                                    <button className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-black py-3 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 group">
                                        Salva Modifiche
                                        <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                                    </button>
                                </div>

                                {/* Timeline Pre-view */}
                                <div className="space-y-4">
                                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-300 flex items-center gap-2">
                                        <History className="w-4 h-4 text-indigo-400" />
                                        Cronologia Eventi
                                    </h3>
                                    <div className="space-y-4 pl-4 border-l-2 border-white/5 relative">
                                        {selected.storia?.slice().reverse().map((ev: any, idx: number) => (
                                            <div key={idx} className="relative">
                                                <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-slate-800 border-2 border-slate-700" />
                                                <div className="bg-white/5 border border-white/5 rounded-xl p-4 ml-2">
                                                    <div className="flex justify-between items-start mb-1">
                                                        <span className="text-[10px] font-black text-indigo-400 uppercase">{ev.tipo}</span>
                                                        <span className="text-[10px] text-slate-500 font-mono">{ev.data}</span>
                                                    </div>
                                                    <p className="text-sm text-slate-200 mb-2">{ev.testo}</p>
                                                    <p className="text-[10px] text-slate-500 font-bold">{ev.utente}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
