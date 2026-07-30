"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Search, FolderOpen, Archive, Paperclip, CheckSquare, MessageSquare, X, Filter } from "lucide-react";
import { cn } from "@/utils";
import { StatusDropdown, STATUS_OPTIONS, getStatusColor } from "@/components/StatusDropdown";
import { SelectPersona, SelectOpzioni } from "@/components/SelectPersona";
import { DatePickerInput } from "@/components/DatePickerInput";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { useStores } from "@/lib/org";

type RawRow = Record<string, unknown> & { clients?: Record<string, unknown> | null };
type GestioneRow = {
    id: string;
    brand: string;
    venditore: string;
    inviato_il: string;
    operatore: string;
    negozio: string;
    stato: string;
    note: string;
    societa: string;
    piva: string;
    segmento: string;
};

function parseDateSafe(val: string): Date | null {
    if (!val?.trim()) return null;
    const d = val.trim();
    if (d.includes("T")) return new Date(d);
    // ISO aaaa-mm-gg digitato a mano: senza questo ramo verrebbe letto come
    // giorno=2026 (l'ordine atteso sotto e' gg/mm/aaaa, il formato italiano).
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return new Date(d + "T00:00:00");
    const [day, month, year] = d.split(/[/-]/).map(Number);
    if (year && month && day) {
        const date = new Date(year, month - 1, day);
        if (!isNaN(date.getTime())) return date;
    }
    return null;
}

function mapToGestioneRow(r: RawRow): GestioneRow {
    const c = r;
    const client = (r.clients ?? null) as Record<string, unknown> | null;
    const inviato = (c.data_registrazione as string) || (c.data as string) || (c.created_at as string) || "";
    const inviatoFormatted = inviato ? (inviato.includes("T") ? new Date(inviato).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : inviato) : "—";
    const tipo = (client?.tipo as string) ?? "consumer";
    const nomeCognome = `${(client?.nome as string) || ""} ${(client?.cognome as string) || ""}`.trim();
    const ragioneSociale = (client?.ragione_sociale as string) ?? "—";
    const clienteName = tipo === "business" && ragioneSociale !== "—" ? ragioneSociale : nomeCognome || "—";
    
    return {
        id: (c.id as string) ?? "",
        brand: (c.brand as string) ?? "—",
        venditore: (c.venditore as string) ?? "—",
        inviato_il: inviatoFormatted,
        operatore: (c.operatore_bo as string) ?? "",
        // "Agenzia" = pratica outbound non ancora attribuita: il back office
        // sceglie qui il negozio di attivazione (richiesta Luca 28/07).
        negozio: (c.negozio as string) ?? "",
        stato: (c.stato as string) ?? "—",
        note: (c.note as string) ?? "",
        societa: clienteName,
        piva: (client?.cf_piva as string) ?? "—",
        segmento: tipo === "business" ? "Business" : "Consumer",
    };
}

export default function GestionePda() {
    const { user } = useAuth();
    const [rawList, setRawList] = useState<RawRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [selectedNote, setSelectedNote] = useState<{ id: string; text: string } | null>(null);
    const [noteDraft, setNoteDraft] = useState("");
    const [savingNote, setSavingNote] = useState(false);
    const [filterKey, setFilterKey] = useState(0);
    const [showFilters, setShowFilters] = useState(true);
    const [filterProdotto, setFilterProdotto] = useState("");
    const [filterBrand, setFilterBrand] = useState("");
    const [filterVenditore, setFilterVenditore] = useState("");
    const [filterStato, setFilterStato] = useState("");
    const [daDataInvio, setDaDataInvio] = useState("");
    const [aDataInvio, setADataInvio] = useState("");
    const [tableSearch, setTableSearch] = useState("");

    const isAdmin = user?.role === "admin" || user?.role === "dev";
    const stores = useStores();   // per l'attribuzione del negozio dal back office
    // OUTBOUND in SOLA LETTURA (richiesta Luca 25/07): l'agente vede SOLO le sue
    // pratiche, il direttore outbound tutte quelle caricate dal reparto. Nessun
    // potere di modifica sui campi registrati: possono solo (a) integrare i
    // documenti quando il back office li chiede (stato "Sospeso Mancanza di
    // Documento") e (b) chiedere all'amministrazione l'autorizzazione a modificare.
    const role = user?.role || "";
    const isOutbound = role === "agente" || role === "direttore_ob";
    const readOnly = isOutbound;
    const [obNames, setObNames] = useState<Set<string> | null>(null);
    useEffect(() => {
        if (!isOutbound || !user?.id) { setObNames(null); return; }
        (async () => {
            if (role === "agente") {
                const { data } = await supabase.from("app_users").select("full_name,match_name").eq("id", user.id).maybeSingle();
                setObNames(new Set([data?.full_name, data?.match_name, user?.name].filter(Boolean) as string[]));
            } else {
                const { data } = await supabase.from("app_users").select("full_name,match_name")
                    .in("role", ["agente", "direttore_ob"]).eq("active", true);
                setObNames(new Set(((data ?? []) as { full_name: string; match_name: string | null }[])
                    .flatMap((u) => [u.full_name, u.match_name]).filter(Boolean) as string[]));
            }
        })();
    }, [isOutbound, role, user?.id, user?.name]);

    // Integrazione documentale (spazio dedicato: i campi originali NON si toccano)
    const [integra, setIntegra] = useState<{ id: string } | null>(null);
    const [intFiles, setIntFiles] = useState<File[]>([]);
    const [intNote, setIntNote] = useState("");
    const [intBusy, setIntBusy] = useState(false);
    const [intMsg, setIntMsg] = useState("");
    // Richiesta di modifica -> amministrazione (stessa coda dei consulenti)
    const [reqEdit, setReqEdit] = useState<{ id: string } | null>(null);
    const [reqMotivo, setReqMotivo] = useState("");
    const [reqBusy, setReqBusy] = useState(false);
    const [reqMsg, setReqMsg] = useState("");

    const submitIntegrazione = async () => {
        if (!integra || (intFiles.length === 0 && !intNote.trim())) return;
        setIntBusy(true);
        setIntMsg("");
        const uploaded: { url: string; name: string; type: string }[] = [];
        let fail = 0;
        for (const f of intFiles) {
            const ext = f.name.split(".").pop();
            const path = `integrazioni/${integra.id}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
            const { error } = await supabase.storage.from("contracts").upload(path, f);
            if (error) { fail++; continue; }
            const { data: { publicUrl } } = supabase.storage.from("contracts").getPublicUrl(path);
            uploaded.push({ url: publicUrl, name: f.name, type: f.type || "file" });
        }
        if (uploaded.length) {
            await supabase.from("contract_attachments").insert(uploaded.map((u) => ({
                contract_id: integra.id, file_url: u.url, file_name: u.name, file_type: u.type,
            })));
        }
        const stamp = new Date().toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
        const row = rawList.find((r) => r.id === integra.id);
        const nuovaNota = `${((row?.note as string) || "").trim()}
[Integrazione ${stamp} — ${user?.name}] ${intNote.trim() || `${uploaded.length} documento/i allegati`}`.trim();
        await supabase.from("contracts").update({ note: nuovaNota }).eq("id", integra.id);
        setRawList((prev) => prev.map((r) => (r.id === integra.id ? { ...r, note: nuovaNota } : r)));
        setIntBusy(false);
        if (fail) { setIntMsg(`⚠️ ${fail} file non caricati — riprova`); return; }
        setIntMsg("✅ Integrazione inviata al back office");
        setTimeout(() => { setIntegra(null); setIntFiles([]); setIntNote(""); setIntMsg(""); }, 1400);
    };

    const submitRichiesta = async () => {
        if (!reqEdit || !reqMotivo.trim()) return;
        setReqBusy(true);
        const { error } = await supabase.from("contract_change_requests").insert({
            contract_id: reqEdit.id,
            requested_by: user?.id || null,
            requested_by_name: user?.name || "—",
            changes: { __meta: { note: reqMotivo.trim(), origine: "gestione_pda" } },
        });
        setReqBusy(false);
        if (error) { setReqMsg("Errore invio richiesta: " + error.message); return; }
        setReqMsg("✅ Richiesta inviata all'amministrazione: potrai modificare dopo l'approvazione");
        setTimeout(() => { setReqEdit(null); setReqMotivo(""); setReqMsg(""); }, 1800);
    };

    const fetchList = useCallback(async () => {
        const { data, error } = await supabase
            .from("contracts")
            .select("id, brand, categoria, stato, venditore, negozio, data_registrazione, data, created_at, note, operatore_bo, clients(ragione_sociale, cf_piva, tipo)")
            .order("created_at", { ascending: false });
        if (error) {
            setLoadError(error.message);
            setRawList([]);
        } else {
            setRawList(((data ?? []) as unknown) as RawRow[]);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchList();
    }, [fetchList]);

    const uniqueBrands = useMemo(() => Array.from(new Set(rawList.map(r => (r.brand as string) || "").filter(Boolean))).sort(), [rawList]);
    const uniqueVenditori = useMemo(() => Array.from(new Set(rawList.map(r => (r.venditore as string) || "").filter(Boolean))).sort(), [rawList]);
    const uniqueCategorie = useMemo(() => Array.from(new Set(rawList.map(r => (r.categoria as string) || "").filter(Boolean))).sort(), [rawList]);

    const filtered = useMemo(() => {
        let out = rawList;
        // Outbound: l'agente solo le sue, il direttore tutte quelle del reparto.
        if (isOutbound) out = obNames ? out.filter((r) => obNames.has((r.venditore as string) || "")) : [];
        if (filterProdotto) out = out.filter(r => r.categoria === filterProdotto);
        if (filterBrand) out = out.filter(r => r.brand === filterBrand);
        if (filterVenditore) out = out.filter(r => r.venditore === filterVenditore);
        if (filterStato) out = out.filter(r => r.stato === filterStato);
        const from = parseDateSafe(daDataInvio);
        const to = parseDateSafe(aDataInvio);
        if (from || to) {
            out = out.filter(r => {
                const created = (r.created_at as string) || (r.data_registrazione as string) || (r.data as string) || "";
                const d = created ? parseDateSafe(created) ?? (created.includes("T") ? new Date(created) : null) : null;
                if (!d) return !from && !to;
                if (from && d < from) return false;
                if (to) { const t = new Date(to); t.setHours(23, 59, 59, 999); if (d > t) return false; }
                return true;
            });
        }
        if (tableSearch.trim()) {
            const q = tableSearch.toLowerCase();
            out = out.filter(r => {
                const client = r.clients as Record<string, unknown> | null;
                const rag = (client?.ragione_sociale as string) ?? "";
                const brand = (r.brand as string) ?? "";
                return rag.toLowerCase().includes(q) || brand.toLowerCase().includes(q);
            });
        }
        return out.map(mapToGestioneRow);
    }, [rawList, isOutbound, obNames, filterProdotto, filterBrand, filterVenditore, filterStato, daDataInvio, aDataInvio, tableSearch]);

    const updateContract = useCallback(async (id: string, patch: Record<string, unknown>) => {
        const { error } = await supabase.from("contracts").update(patch).eq("id", id);
        if (!error) {
            setRawList(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
        }
    }, []);

    const handleSaveNote = useCallback(async () => {
        if (!selectedNote) return;
        setSavingNote(true);
        const { error } = await supabase.from("contracts").update({ note: noteDraft }).eq("id", selectedNote.id);
        if (!error) setRawList(prev => prev.map(r => r.id === selectedNote.id ? { ...r, note: noteDraft } : r));
        setSelectedNote(null);
        setSavingNote(false);
    }, [selectedNote, noteDraft]);

    return (
        <div className="w-full">
            <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-white mb-2">{isOutbound ? "Gestione PDA" : "Gestione PDA (Back Office)"}</h2>
                    <p className="text-slate-400">{role === "agente" ? "Le tue pratiche inviate — sola visualizzazione: verifica i dati e integra i documenti quando richiesto" : role === "direttore_ob" ? "Le pratiche del reparto Outbound — sola visualizzazione" : "Visualizza, verifica e gestisci le PDA ricevute"}</p>
                </div>
                {!showFilters && (
                    <button type="button" onClick={() => setShowFilters(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 transition-colors">
                        <Filter className="w-4 h-4" /> Filtra
                    </button>
                )}
            </div>

            {showFilters && (
            <div className="glass-card mb-6 p-6">
                <h3 className="text-lg font-medium text-white mb-4 border-b border-white/10 pb-2">Ricerca avanzata</h3>
                <div key={filterKey} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Prodotto</label>
                        <SelectOpzioni className="glass-input w-full" value={filterProdotto} onChange={setFilterProdotto} opzioni={uniqueCategorie} placeholder="Tutti i prodotti — scrivi per filtrare" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Brand</label>
                        <SelectOpzioni className="glass-input w-full" value={filterBrand} onChange={setFilterBrand} opzioni={uniqueBrands} placeholder="Tutti i brand — scrivi per filtrare" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Venditore</label>
                        <SelectPersona className="glass-input w-full" value={filterVenditore} onChange={setFilterVenditore} opzioni={uniqueVenditori} placeholder="Tutti — scrivi per filtrare" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Stato</label>
                        <SelectOpzioni className="glass-input w-full" value={filterStato} onChange={setFilterStato} opzioni={STATUS_OPTIONS.map(opt => opt.label)} placeholder="Tutti gli stati — scrivi per filtrare" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Da data invio</label>
                        <DatePickerInput id="dadatainvio" value={daDataInvio} onChange={setDaDataInvio} placeholder="inserire data inizio" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">A data invio</label>
                        <DatePickerInput id="adatainvio" value={aDataInvio} onChange={setADataInvio} placeholder="inserire data fine" />
                    </div>
                </div>
                <div className="mt-6 flex gap-3">
                    <button type="button" onClick={() => setShowFilters(false)} className="primary-btn h-10 px-6">Ricerca pda</button>
                    <button type="button" onClick={() => { setFilterKey((k) => k + 1); setShowFilters(true); setFilterProdotto(""); setFilterBrand(""); setFilterVenditore(""); setFilterStato(""); setDaDataInvio(""); setADataInvio(""); }} className="h-10 px-6 rounded-lg font-medium bg-white/5 text-slate-300 hover:bg-white/10 transition-colors">Annulla</button>
                </div>
            </div>
            )}

            {/* Editable Data Table */}
            <div className="glass-card overflow-hidden">
                <div className="p-4 border-b border-white/5 flex gap-4 bg-white/[0.02]">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input type="text" placeholder="Cerca per ragione sociale, brand..." className="glass-input w-full pl-10" value={tableSearch} onChange={e => setTableSearch(e.target.value)} />
                    </div>
                </div>

                {loadError && (
                    <div className="p-4 border-b border-white/5 bg-rose-500/10 text-rose-400 text-sm">{loadError}</div>
                )}
                {loading ? (
                    <div className="p-8 text-center text-slate-400">Caricamento...</div>
                ) : (
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
                                <th className="px-4 py-4 w-44">Negozio</th>
                                <th className="px-4 py-4 w-48">Operatore BO</th>
                                <th className="px-4 py-4 w-48">Stato</th>
                                <th className="px-4 py-4 w-16 text-center">Note</th>
                                <th className="px-4 py-4">Cliente (Nome / Ragione Sociale)</th>
                                <th className="px-4 py-4">CF / P. IVA</th>
                                <th className="px-4 py-4 w-32">Segmento</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr><td colSpan={12} className="px-4 py-8 text-center text-slate-500">Nessuna pratica trovata.</td></tr>
                            ) : (
                            filtered.map((row) => (
                                <tr key={row.id} className="border-b border-white/5 bg-white/[0.01] hover:bg-white/[0.03] transition-colors">
                                    <td className="px-4 py-3 text-center">
                                        <input type="checkbox" className="w-4 h-4 rounded border-white/20 bg-white/5 accent-primary" />
                                    </td>
                                    <td className="px-4 py-3 font-medium text-white">{row.brand}</td>
                                    <td className="px-4 py-3 text-slate-400">{row.venditore}</td>
                                    <td className="px-4 py-3 text-xs text-slate-500">{row.inviato_il}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-1 justify-center">
                                            <button type="button" onClick={() => { setSelectedNote({ id: row.id, text: row.note }); setNoteDraft(row.note); }} className="p-1.5 rounded bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 transition-colors" title="Apri pratica"><FolderOpen className="w-4 h-4" /></button>
                                            {!readOnly && <button type="button" onClick={() => {}} className="p-1.5 rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors" title="Allegati"><Paperclip className="w-4 h-4" /></button>}
                                            {!readOnly && <button type="button" onClick={() => {}} className="p-1.5 rounded bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors" title="Archivia"><Archive className="w-4 h-4" /></button>}
                                            {readOnly && (row.stato === "Sospeso Mancanza di Documento" ? (
                                                <button type="button" onClick={() => { setIntegra({ id: row.id }); setIntFiles([]); setIntNote(""); setIntMsg(""); }}
                                                    className="px-2 py-1.5 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors text-[11px] font-bold whitespace-nowrap"
                                                    title="Il back office ha chiesto un'integrazione documentale: carica qui i documenti">
                                                    📎 Integra
                                                </button>
                                            ) : (
                                                <button type="button" onClick={() => { setReqEdit({ id: row.id }); setReqMotivo(""); setReqMsg(""); }}
                                                    className="px-2 py-1.5 rounded bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 transition-colors text-[11px] font-bold whitespace-nowrap"
                                                    title="La PDA e' gia' inviata: per modificarla serve l'autorizzazione dell'amministrazione">
                                                    ✋ Richiedi modifica
                                                </button>
                                            ))}
                                        </div>
                                    </td>
                                    {/* NEGOZIO DI ATTIVAZIONE (Luca 28/07): la pratica arriva
                                        dall'agente come "Agenzia"; qui il back office decide
                                        dove attivarla. L'outbound la vede e basta. */}
                                    <td className="px-2 py-3">
                                        {readOnly ? (
                                            <span className={cn("text-xs", row.negozio === "Agenzia" ? "text-violet-300 font-semibold" : "text-slate-400")}>{row.negozio || "—"}</span>
                                        ) : (
                                        <select
                                            className={cn("glass-input w-full text-xs py-1.5 px-2 h-auto", row.negozio === "Agenzia" && "border-violet-400/50 text-violet-200")}
                                            value={row.negozio}
                                            onChange={e => updateContract(row.id, { negozio: e.target.value })}
                                        >
                                            <option value="Agenzia">Agenzia (da attribuire)</option>
                                            {stores.map(n => <option key={n} value={n}>{n}</option>)}
                                            {row.negozio !== "Agenzia" && !stores.includes(row.negozio) && <option value={row.negozio}>{row.negozio || "—"}</option>}
                                        </select>
                                        )}
                                    </td>
                                    <td className="px-2 py-3">
                                        {readOnly ? (
                                            <span className="text-xs text-slate-400">{row.operatore || "—"}</span>
                                        ) : (
                                        <select
                                            className="glass-input w-full text-xs py-1.5 px-2 h-auto"
                                            value={row.operatore}
                                            onChange={e => updateContract(row.id, { operatore_bo: e.target.value })}
                                        >
                                            <option value="">—</option>
                                            <option>Alfonso Carluccini</option>
                                            <option>Alessandro Sandri</option>
                                        </select>
                                        )}
                                    </td>
                                    <td className="px-2 py-3">
                                        {readOnly ? (
                                            <span className={cn("text-[11px] font-bold px-2.5 py-1 rounded-full border whitespace-nowrap", getStatusColor(row.stato))}>{row.stato}</span>
                                        ) : (
                                            <StatusDropdown value={row.stato} isAgent={false} onChange={val => updateContract(row.id, { stato: val })} />
                                        )}
                                    </td>
                                    <td className="px-2 py-3 text-center">
                                        <button
                                            type="button"
                                            onClick={() => { setSelectedNote({ id: row.id, text: row.note }); setNoteDraft(row.note); }}
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
                            ))
                            )}
                        </tbody>
                    </table>
                </div>
                )}
                <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between text-xs text-slate-400 bg-white/[0.01]">
                    <span>Visualizzate da 1 a {filtered.length} di {filtered.length} totale</span>
                </div>
            </div>

            {/* Integrazione documentale (outbound): spazio DEDICATO — i campi della
                pratica non si toccano; i documenti finiscono negli allegati del
                contratto e la nota traccia chi ha integrato e quando. */}
            {integra && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="glass-card w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-white/[0.02] rounded-t-xl">
                            <div>
                                <h3 className="text-lg font-bold text-white">📎 Integrazione documentale</h3>
                                <p className="text-xs text-slate-400">Pratica #{integra.id} — richiesta dal back office</p>
                            </div>
                            <button onClick={() => setIntegra(null)} className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">Documenti da allegare</label>
                                <label className="block border-2 border-dashed border-emerald-500/30 rounded-xl p-5 text-center cursor-pointer hover:bg-emerald-500/5 transition-colors">
                                    <input type="file" multiple className="hidden" onChange={(e) => setIntFiles(Array.from(e.target.files || []))} />
                                    <Paperclip className="w-6 h-6 text-emerald-400 mx-auto mb-1" />
                                    <div className="text-sm text-slate-300 font-medium">Clicca per scegliere i file</div>
                                    <div className="text-xs text-slate-500 mt-1">{intFiles.length ? `${intFiles.length} file selezionati: ${intFiles.map(f => f.name).join(", ")}` : "PDF, foto documenti, moduli firmati…"}</div>
                                </label>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">Nota per il back office (facoltativa)</label>
                                <textarea className="glass-input w-full min-h-[80px] resize-y text-sm" placeholder="Es. allego documento fronte/retro come richiesto"
                                    value={intNote} onChange={(e) => setIntNote(e.target.value)} />
                            </div>
                            <p className="text-xs text-slate-500">I dati già registrati della pratica NON vengono toccati: questa integrazione aggiunge solo documenti e nota.</p>
                            {intMsg && <div className={cn("text-sm font-medium", intMsg.startsWith("✅") ? "text-emerald-400" : "text-amber-400")}>{intMsg}</div>}
                        </div>
                        <div className="p-5 border-t border-white/10 bg-black/20 flex justify-end gap-3 rounded-b-xl">
                            <button type="button" onClick={() => setIntegra(null)} className="px-5 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-white/10">Annulla</button>
                            <button type="button" onClick={submitIntegrazione} disabled={intBusy || (intFiles.length === 0 && !intNote.trim())}
                                className="primary-btn px-6 py-2 text-sm disabled:opacity-50">{intBusy ? "Invio…" : "Invia integrazione"}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Richiesta di modifica (outbound): la PDA e' gia' inviata — serve
                l'approvazione dell'amministrazione (stessa coda dei consulenti). */}
            {reqEdit && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="glass-card w-full max-w-lg shadow-2xl flex flex-col">
                        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-white/[0.02] rounded-t-xl">
                            <div>
                                <h3 className="text-lg font-bold text-white">✋ Richiesta di modifica</h3>
                                <p className="text-xs text-slate-400">Pratica #{reqEdit.id} — va autorizzata dall'amministrazione</p>
                            </div>
                            <button onClick={() => setReqEdit(null)} className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-6 space-y-3">
                            <label className="block text-sm font-medium text-slate-300">Cosa va corretto e perché? <span className="text-rose-400">*</span></label>
                            <textarea className="glass-input w-full min-h-[110px] resize-y text-sm" placeholder="Es. numero di telefono errato: il corretto è 33x…"
                                value={reqMotivo} onChange={(e) => setReqMotivo(e.target.value)} />
                            <p className="text-xs text-slate-500">La PDA è già stata inviata: la modifica sarà effettiva solo dopo l'approvazione dell'amministrazione.</p>
                            {reqMsg && <div className={cn("text-sm font-medium", reqMsg.startsWith("✅") ? "text-emerald-400" : "text-rose-400")}>{reqMsg}</div>}
                        </div>
                        <div className="p-5 border-t border-white/10 bg-black/20 flex justify-end gap-3 rounded-b-xl">
                            <button type="button" onClick={() => setReqEdit(null)} className="px-5 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-white/10">Annulla</button>
                            <button type="button" onClick={submitRichiesta} disabled={reqBusy || !reqMotivo.trim()}
                                className="primary-btn px-6 py-2 text-sm disabled:opacity-50">{reqBusy ? "Invio…" : "Invia richiesta"}</button>
                        </div>
                    </div>
                </div>
            )}

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
                                onClick={() => { setSelectedNote(null); setNoteDraft(""); }}
                                className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-6 overflow-y-auto">
                            <label className="block text-sm font-medium text-slate-300 mb-2">Aggiungi o modifica nota</label>
                            <textarea
                                className="glass-input w-full min-h-[160px] resize-y text-sm leading-relaxed disabled:opacity-70"
                                placeholder={readOnly ? "Nessuna nota sulla pratica." : "Scrivi una nota per questa pratica..."}
                                value={noteDraft}
                                disabled={readOnly}
                                onChange={e => setNoteDraft(e.target.value)}
                            />
                            <p className="text-xs text-slate-500 mt-2">
                                Scrivi qualsiasi dettaglio importante che gli altri operatori di back office devono sapere per questa pratica. Le note lunghe possono essere lette tranquillamente qui.
                            </p>
                        </div>

                        {/* Footer */}
                        <div className="p-5 border-t border-white/10 bg-black/20 flex justify-end gap-3 rounded-b-xl shrink-0 mt-auto">
                            <button
                                type="button"
                                onClick={() => { setSelectedNote(null); setNoteDraft(""); }}
                                className="px-5 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                            >
                                Annulla
                            </button>
                            {!readOnly && <button
                                type="button"
                                onClick={handleSaveNote}
                                disabled={savingNote}
                                className="primary-btn px-6 py-2 text-sm disabled:opacity-50"
                            >
                                {savingNote ? "Salvataggio..." : "Salva Note"}
                            </button>}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
