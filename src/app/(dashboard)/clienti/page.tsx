"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { IndirizzoAutocomplete } from "@/components/IndirizzoAutocomplete";
import { Search, Filter, RefreshCw, Users, FileText, Smartphone, Mail, Building, MapPin, X, ChevronRight, Calendar, CheckCircle2, Clock, AlertTriangle, Paperclip, ExternalLink, Plus, Loader2 } from "lucide-react";
import { seesWholeStore, seesAllStores } from "@/lib/roles";
import { usePageView } from "@/lib/pageView";
import { supabase } from "@/lib/supabaseClient";
import { ImageLightbox } from "@/components/ImageLightbox";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { trovaDuplicati, liberaCellulare, type DupCliente } from "@/lib/clientChecks";
import { useVisibleStores, sameStore } from "@/lib/visibleStores";
import { useStores } from "@/lib/org";
import { SelectMulti } from "@/components/SelectPersona";
import { useClientiVisibili } from "@/lib/clientiVisibili";
import { dataNascitaDaCF, etaDa } from "@/lib/dataNascita";
import { useRolePermissions } from "@/lib/usePermissions";
import { CAP_CLIENTI, CAP_CLIENTI_ALLEGATI, capChoice, capAllowed } from "@/lib/capabilities";
import { chiamaAircall } from "@/lib/dialer";

interface Cliente {
    id: string;
    tipo: "consumer" | "business";
    nome: string;
    cognome?: string;
    ragioneSociale?: string;
    nomeRef?: string;
    cognomeRef?: string;
    cellulare: string;
    email: string;
    cf_piva: string | null;
    data_nascita?: string | null;   // facoltativo dalla migrazione 065
    iban?: string | null;
    acquisito_da?: string | null;
    intestatario_diverso?: boolean;
    intestatario_nome?: string | null;
    intestatario_cognome?: string | null;
    intestatario_cf?: string | null;
    indirizzo: string;
    cap?: string;
    citta: string;
}

interface Contratto {
    id: string;
    data: string;
    brand: string;
    categoria: string;
    stato: string;
    venditore?: string | null;   // segnalazione 97
    negozio?: string | null;     // segnalazione 97
    note?: string | null;   // nota scritta allo Step 7 della registrazione
}


function mapRowToCliente(row: Record<string, unknown>): Cliente {
    return {
        id: row.id as string,
        tipo: row.tipo as "consumer" | "business",
        nome: row.nome as string,
        cognome: (row.cognome as string) ?? undefined,
        ragioneSociale: (row.ragione_sociale as string) ?? undefined,
        nomeRef: (row.nome_ref as string) ?? undefined,
        cognomeRef: (row.cognome_ref as string) ?? undefined,
        cellulare: row.cellulare as string,
        email: row.email as string,
        cf_piva: (row.cf_piva as string | null) ?? null,
        data_nascita: (row.data_nascita as string | null) ?? null,
        iban: (row.iban as string | null) ?? null,
        acquisito_da: (row.acquisito_da as string | null) ?? null,
        intestatario_diverso: !!row.intestatario_diverso,
        intestatario_nome: (row.intestatario_nome as string | null) ?? null,
        intestatario_cognome: (row.intestatario_cognome as string | null) ?? null,
        intestatario_cf: (row.intestatario_cf as string | null) ?? null,
        indirizzo: row.indirizzo as string,
        cap: (row.cap as string) ?? undefined,
        citta: row.citta as string,
    };
}

function mapRowToContratto(row: Record<string, unknown>): Contratto {
    return {
        note: (row.note as string | null) ?? null,
        id: row.id as string,
        data: row.data as string,
        brand: row.brand as string,
        categoria: row.categoria as string,
        stato: row.stato as string,
        venditore: (row.venditore as string | null) ?? null,
        negozio: (row.negozio as string | null) ?? null,
    };
}

// Categorie di archiviazione dei documenti (Step 5 della registrazione).
// Tutto cio' che non rientra in una categoria nota finisce in "Altro".
const CATEGORIE_DOC = [
    { id: "documento", label: "Documenti", color: "#38bdf8", match: (t: string | null) => (t || "").toLowerCase() === "documento" },
    { id: "contratti", label: "Contratti", color: "#a78bfa", match: (t: string | null) => (t || "").toLowerCase() === "contratti" },
    // Segnalazione 84: bollette del vecchio operatore sui contratti energia.
    { id: "fattura", label: "Fatture", color: "#fbbf24", match: (t: string | null) => (t || "").toLowerCase() === "fattura" },
    { id: "altro", label: "Altro", color: "#94a3b8", match: (t: string | null) => !["documento", "contratti", "fattura"].includes((t || "").toLowerCase()) },
];

function ClienteDetailModal({ cliente, contratti, onClose }: { cliente: Cliente; contratti: Contratto[]; onClose: () => void }) {
    const router = useRouter();
    // Capacita' "Allegati del cliente" (ingranaggio Clienti in Permessi): senza,
    // la sezione Documenti/PDA non compare proprio.
    const { user: uAll } = useAuth();
    const { perms: permAll } = useRolePermissions(uAll?.role);
    const vedeAllegati = capAllowed(uAll?.role, "/clienti", CAP_CLIENTI_ALLEGATI, permAll);
    const [docs, setDocs] = useState<{ id: string; file_url: string; file_name: string; contract_id: string; file_type: string | null; created_at: string | null }[]>([]);
    // Immagine aperta a schermo (prima si apriva in una scheda nuova).
    const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);

    // Documenti caricati: allegati dei contratti (PDA) di questo cliente.
    const reloadDocs = async () => {
        const ids = contratti.map((c) => c.id);
        if (ids.length === 0) { setDocs([]); return; }
        const { data } = await supabase
            .from("contract_attachments")
            .select("id, file_url, file_name, contract_id, file_type, created_at")
            .in("contract_id", ids)
            .order("created_at", { ascending: false });
        setDocs((data ?? []) as any);
    };
    useEffect(() => { reloadDocs(); /* eslint-disable-next-line */ }, [contratti]);

    // Segnalazione 114: caricamento documenti/PDA DOPO la registrazione. Puo' farlo
    // il creatore del contratto (venditore) e lo store manager (che vede il negozio).
    const nomeUguale = (a?: string | null, b?: string | null) => { const x = (a || "").trim().toLowerCase(), y = (b || "").trim().toLowerCase(); return !!x && x === y; };
    const isManagerDoc = seesWholeStore(uAll?.role) || seesAllStores(uAll?.role);
    const contrattiCaricabili = isManagerDoc ? contratti : contratti.filter((c) => nomeUguale(c.venditore, uAll?.name));
    const puoCaricareDoc = vedeAllegati && contrattiCaricabili.length > 0;
    const [caricaOpen, setCaricaOpen] = useState(false);
    const [upContract, setUpContract] = useState("");
    const [upType, setUpType] = useState("documento");
    const [upFile, setUpFile] = useState<File | null>(null);
    const [upBusy, setUpBusy] = useState(false);
    const caricaDocumento = async () => {
        if (!upContract || !upFile || upBusy) return;
        setUpBusy(true);
        try {
            const ext = (upFile.name.split(".").pop() || "bin");
            const path = `${cliente.id}/${cliente.id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
            const { error: upErr } = await supabase.storage.from("contracts").upload(path, upFile);
            if (upErr) throw upErr;
            const { data: pub } = supabase.storage.from("contracts").getPublicUrl(path);
            const { error: insErr } = await supabase.from("contract_attachments").insert({
                contract_id: upContract, file_url: pub.publicUrl, file_name: upFile.name, file_type: upType,
            });
            if (insErr) throw insErr;
            setCaricaOpen(false); setUpFile(null); setUpContract(""); setUpType("documento");
            await reloadDocs();
        } catch (e: any) { alert("Caricamento non riuscito: " + (e?.message || e)); }
        finally { setUpBusy(false); }
    };

    const [showStorico, setShowStorico] = useState(false);
    // Click su una vendita -> apre il dettaglio in Ricerca Contratto (deep link ?id=).
    const openContract = (id: string) => { onClose(); router.push(`/ricerca-vendite?id=${encodeURIComponent(id)}`); };

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
                                {/* Segnalazione 97: rimosso il badge "Acquisito nel negozio di"
                                    dall'intestazione; il negozio ora e' in colonna nella tabella. */}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* STORICO CONVERSAZIONI (Luca 29/07): tutte le chiamate col
                            cliente, inbound e outbound, con le registrazioni Aircall
                            ascoltabili e scaricabili direttamente dal CRM. */}
                        <button onClick={() => setShowStorico(true)}
                            className="px-3 py-2 rounded-xl border border-sky-500/40 bg-sky-500/10 text-sky-300 hover:bg-sky-500/25 text-xs font-bold flex items-center gap-1.5">
                            📞 Storico chiamate
                        </button>
                        <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/5 text-slate-400 hover:text-white transition-all">
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>
                {showStorico && <StoricoChiamateCliente cliente={cliente} onClose={() => setShowStorico(false)} />}

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
                                <div className="flex items-center gap-2">
                                    {/* campo più stretto: un cellulare non ha bisogno di tutta la riga
                                        (Luca 29/07) — lo spazio va alle azioni rapide */}
                                    <div className="max-w-[240px] flex-1 min-w-0"><InfoItem icon={<Smartphone className="w-4 h-4" />} label="Cellulare" value={cliente.cellulare} mono /></div>
                                    {cliente.cellulare && (<>
                                        <button
                                            onClick={async () => { const r = await chiamaAircall(cliente.cellulare, uAll?.id); alert(r.msg); }}
                                            title="Chiama con Aircall (es. richiamare un cliente che non è venuto in negozio)"
                                            className="px-2.5 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/25 text-sm shrink-0"
                                        >📞</button>
                                        <Link
                                            href={"/chat?wa=" + String(cliente.cellulare).replace(/\D/g, "")}
                                            title="Scrivi su WhatsApp dal CRM: apre la chat col numero del cliente già caricato"
                                            className="px-2.5 py-2 rounded-lg text-white text-sm shrink-0 hover:brightness-110"
                                            style={{ background: "#25D366" }}
                                        >💬</Link>
                                    </>)}
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 min-w-0"><InfoItem icon={<Mail className="w-4 h-4" />} label="Email" value={cliente.email} /></div>
                                    {cliente.email && (
                                        <Link
                                            href={"/chat?mail=" + encodeURIComponent(cliente.email)}
                                            title="Scrivi una email dal CRM: apre la webmail già in composizione col destinatario caricato"
                                            className="px-2.5 py-2 rounded-lg border border-sky-500/40 bg-sky-500/15 text-sky-300 hover:bg-sky-500/30 text-sm shrink-0"
                                        >✉️</Link>
                                    )}
                                </div>
                                <InfoItem icon={<FileText className="w-4 h-4" />} label={cliente.tipo === 'business' ? 'Partita IVA' : 'Codice Fiscale'} value={cliente.cf_piva || "—"} mono />
                                {(cliente as { data_nascita?: string | null }).data_nascita && (
                                    <InfoItem icon={<Calendar className="w-4 h-4" />} label="Data di nascita"
                                        value={`${new Date(String((cliente as { data_nascita?: string | null }).data_nascita)).toLocaleDateString("it-IT")}${etaDa((cliente as { data_nascita?: string | null }).data_nascita) != null ? ` (${etaDa((cliente as { data_nascita?: string | null }).data_nascita)} anni)` : ""}`} />
                                )}
                                <InfoItem icon={<MapPin className="w-4 h-4" />} label="Indirizzo" value={`${cliente.indirizzo}, ${cliente.citta}`} />
                            </div>
                        </div>

                        {/* STATISTICHE O NOTE (Placeholder) */}
                        <div className="space-y-4">
                            <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                <Clock className="w-3 h-3" /> Info Aggiuntive
                            </h3>
                            {(() => {
                                // Prima qui c'era un segnaposto che diceva SEMPRE "nessuna nota",
                                // anche quando la nota c'era (segnalazione 21). Ora mostra le note
                                // dei contratti e i dati bancari dell'anagrafica.
                                const note = contratti.filter(c => (c.note || "").trim());
                                const hasIban = !!(cliente.iban || "").trim();
                                const intest = cliente.intestatario_diverso;
                                if (!note.length && !hasIban && !intest) {
                                    return (
                                        <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 flex items-center justify-center text-center py-12">
                                            <div className="space-y-2">
                                                <AlertTriangle className="w-6 h-6 text-slate-700 mx-auto" />
                                                <p className="text-xs text-slate-500 max-w-[200px]">Nessuna nota aggiuntiva presente per questo cliente.</p>
                                            </div>
                                        </div>
                                    );
                                }
                                return (
                                    <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 space-y-3">
                                        {hasIban && (
                                            <div>
                                                <p className="text-[10px] uppercase tracking-wider text-slate-500">IBAN</p>
                                                <p className="text-sm text-white font-mono break-all">{cliente.iban}</p>
                                            </div>
                                        )}
                                        {intest && (
                                            <div>
                                                <p className="text-[10px] uppercase tracking-wider text-slate-500">Intestatario diverso</p>
                                                <p className="text-sm text-white">
                                                    {[cliente.intestatario_nome, cliente.intestatario_cognome].filter(Boolean).join(" ") || "—"}
                                                    {cliente.intestatario_cf ? ` · ${cliente.intestatario_cf}` : ""}
                                                </p>
                                            </div>
                                        )}
                                        {note.map(c => (
                                            <div key={c.id} className="border-t border-white/5 pt-3 first:border-0 first:pt-0">
                                                <p className="text-[10px] uppercase tracking-wider text-slate-500">Nota · {c.id}</p>
                                                <p className="text-sm text-slate-200 whitespace-pre-wrap">{c.note}</p>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}
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
                                        {/* Segnalazione 97: Venditore e Negozio fra Categoria e Stato. */}
                                        <th className="px-4 py-3 font-bold">Venditore</th>
                                        <th className="px-4 py-3 font-bold">Negozio</th>
                                        <th className="px-4 py-3 font-bold text-right">Stato</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {contratti.length === 0 && (
                                        <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-600">Nessun contratto per questo cliente.</td></tr>
                                    )}
                                    {contratti.map((ctr: Contratto) => (
                                        <tr key={ctr.id} onClick={() => openContract(ctr.id)}
                                            className="hover:bg-indigo-500/5 cursor-pointer transition-colors group" title="Apri in Ricerca Vendite">
                                            <td className="px-4 py-3 text-slate-400 flex items-center gap-2">
                                                <Calendar className="w-3 h-3 text-slate-600" /> {ctr.data}
                                            </td>
                                            <td className="px-4 py-3 text-white font-semibold">{ctr.brand}</td>
                                            <td className="px-4 py-3 text-slate-400">{ctr.categoria}</td>
                                            <td className="px-4 py-3 text-slate-300">{ctr.venditore || "—"}</td>
                                            <td className="px-4 py-3 text-slate-400 text-xs">{ctr.negozio || "—"}</td>
                                            <td className="px-4 py-3 text-right">
                                                <span className="inline-flex items-center gap-1.5">
                                                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${ctr.stato === 'Attivato' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                                                        ctr.stato === 'In Lavorazione' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                                                            'bg-rose-500/10 border-rose-500/20 text-rose-400'
                                                        }`}>
                                                        {ctr.stato}
                                                    </span>
                                                    <ExternalLink className="w-3 h-3 text-slate-600 group-hover:text-indigo-400 transition-colors" />
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* DOCUMENTI / PDA CARICATI — solo con la capacita' attiva */}
                    {vedeAllegati && <div className="space-y-4">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                <Paperclip className="w-3 h-3" /> Documenti e PDA caricati
                            </h3>
                            {puoCaricareDoc && !caricaOpen && (
                                <button onClick={() => { setCaricaOpen(true); setUpContract(contrattiCaricabili[0]?.id || ""); }}
                                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/25 flex items-center gap-1.5">
                                    <Plus className="w-3.5 h-3.5" /> Carica documento
                                </button>
                            )}
                        </div>
                        {/* Segnalazione 114: carica un documento/PDA dimenticato su un contratto esistente */}
                        {caricaOpen && (
                            <div className="bg-white/[0.02] border border-indigo-500/20 rounded-2xl p-4 space-y-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Contratto</label>
                                        <select value={upContract} onChange={e => setUpContract(e.target.value)} className="w-full mt-1 bg-[#0f111a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
                                            {contrattiCaricabili.map(c => <option key={c.id} value={c.id}>{c.brand} · {c.categoria}{c.data ? " · " + new Date(c.data).toLocaleDateString("it-IT") : ""}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tipo</label>
                                        <select value={upType} onChange={e => setUpType(e.target.value)} className="w-full mt-1 bg-[#0f111a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
                                            {CATEGORIE_DOC.map(cat => <option key={cat.id} value={cat.id}>{cat.label}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <input type="file" onChange={e => setUpFile(e.target.files?.[0] || null)} className="block w-full text-xs text-slate-400 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-white/10 file:text-slate-200 file:text-xs file:font-semibold" />
                                <div className="flex gap-2">
                                    <button onClick={caricaDocumento} disabled={!upContract || !upFile || upBusy} className="flex-1 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 text-white text-sm font-semibold flex items-center justify-center gap-2">
                                        {upBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Carica
                                    </button>
                                    <button onClick={() => { setCaricaOpen(false); setUpFile(null); }} className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-sm">Annulla</button>
                                </div>
                            </div>
                        )}
                        {docs.length === 0 ? (
                            <div className="bg-white/[0.01] border border-white/5 rounded-2xl p-6 text-center text-xs text-slate-600">
                                Nessun documento caricato per i contratti di questo cliente.
                            </div>
                        ) : (
                            // Richiesta Luca (segnalazione 29): i documenti vanno divisi per
                            // categoria di caricamento, con la data. La categoria e' quella
                            // scelta allo Step 5 della registrazione (file_type); quelli senza
                            // categoria finiscono in "Altro", come chiesto.
                            <div className="space-y-4">
                                {CATEGORIE_DOC.map((cat) => {
                                    const items = docs.filter((d) => (cat.match(d.file_type)));
                                    if (items.length === 0) return null;
                                    return (
                                        <div key={cat.id}>
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                                                    style={{ color: cat.color, background: cat.color + "1f", border: "1px solid " + cat.color + "44" }}>
                                                    {cat.label}
                                                </span>
                                                <span className="text-[10px] text-slate-600">{items.length} file</span>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                {items.map((d) => {
                                                    // Le immagini si aprono qui sopra invece che in una scheda nuova.
                                                    const isImmagine = /^image\//i.test(d.file_type || "")
                                                        || /\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(d.file_name || "");
                                                    const contenuto = (
                                                        <>
                                                            <FileText className="w-4 h-4 shrink-0" style={{ color: cat.color }} />
                                                            <span className="flex-1 min-w-0">
                                                                <span className="block text-xs text-slate-300 truncate">{d.file_name || "documento"}</span>
                                                                <span className="block text-[10px] text-slate-600">
                                                                    {d.created_at ? new Date(d.created_at).toLocaleDateString("it-IT") : "—"} · {d.contract_id}
                                                                </span>
                                                            </span>
                                                            <ExternalLink className="w-3.5 h-3.5 text-slate-600 group-hover:text-indigo-400 shrink-0" />
                                                        </>
                                                    );
                                                    const cls = "flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] hover:border-indigo-500/30 transition-all group text-left w-full";
                                                    return isImmagine ? (
                                                        <button key={d.id} type="button" className={cls}
                                                            onClick={() => setLightbox({ src: d.file_url, alt: d.file_name || "" })}>
                                                            {contenuto}
                                                        </button>
                                                    ) : (
                                                        <a key={d.id} href={d.file_url} target="_blank" rel="noreferrer" className={cls}>
                                                            {contenuto}
                                                        </a>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>}
                </div>

                {/* MODAL FOOTER */}
                <div className="flex-none px-6 py-4 border-t border-white/10 bg-white/[0.02] flex justify-between">
                    <button
                        onClick={() => {
                            onClose();
                            window.dispatchEvent(new CustomEvent("edit-client", { detail: cliente }));
                        }}
                        className="px-6 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs uppercase tracking-widest transition-all shadow-lg shadow-violet-500/20"
                    >
                        Modifica
                    </button>
                    <button onClick={onClose} className="px-6 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs uppercase tracking-widest transition-all">
                        Chiudi
                    </button>
                </div>
            </div>
            {lightbox && (
                <ImageLightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} />
            )}
        </div>
    );
}

function ClienteFormModal({ cliente, onClose, onSave }: { cliente?: Cliente | null; onClose: () => void; onSave: () => void }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [tipo, setTipo] = useState<"consumer" | "business">(cliente?.tipo ?? "consumer");
    const [nome, setNome] = useState(cliente?.nome ?? "");
    const [cognome, setCognome] = useState(cliente?.cognome ?? "");
    const [ragioneSociale, setRagioneSociale] = useState(cliente?.ragioneSociale ?? "");
    const [nomeRef, setNomeRef] = useState(cliente?.nomeRef ?? "");
    const [cognomeRef, setCognomeRef] = useState(cliente?.cognomeRef ?? "");
    const [cellulare, setCellulare] = useState(cliente?.cellulare ?? "");
    const [email, setEmail] = useState(cliente?.email ?? "");
    const [cfPiva, setCfPiva] = useState(cliente?.cf_piva ?? "");
    const [indirizzo, setIndirizzo] = useState(cliente?.indirizzo ?? "");
    const [cap, setCap] = useState(cliente?.cap ?? "");
    const [citta, setCitta] = useState(cliente?.citta ?? "");
    // Segnalazione 56: acquisizione. Su nuovo cliente si sceglie negozio/Agenzia;
    // su modifica il dato non si tocca (e' storico, lo mostra il badge).
    const [acquisito, setAcquisito] = useState(cliente?.acquisito_da ?? "");
    const [storeOptions, setStoreOptions] = useState<string[]>([]);
    useEffect(() => {
        supabase.from("stores").select("name").order("name")
            .then(({ data }) => setStoreOptions((data ?? []).map((r: any) => r.name)));
    }, []);

    // Univocita' (regole Luca): CF/P.IVA bloccanti, cellulare con scelta
    // sposta/cambia, email solo segnalata.
    const [dupCell, setDupCell] = useState<DupCliente | null>(null);
    const [emailDup, setEmailDup] = useState<DupCliente | null>(null);
    const spostaRef = useRef(false);
    const checkEmail = async () => {
        setEmailDup(email.trim() ? (await trovaDuplicati({ excludeId: cliente?.id || null, email })).email : null);
    };
    const handleSave = async () => {
        // Richiesta Luca: se il codice fiscale non esiste si deve poter salvare
        // lo stesso; restano obbligatori solo nome, cognome e cellulare.
        const missing = [
            !nome.trim() && (tipo === "business" ? "Nome Referente" : "Nome"),
            !cognome.trim() && (tipo === "business" ? "Cognome Referente" : "Cognome"),
            !cellulare.trim() && "Cellulare",
        ].filter(Boolean);
        if (missing.length > 0) {
            setError(`Campi obbligatori mancanti: ${missing.join(", ")}.`);
            return;
        }
        if (tipo === "business" && !ragioneSociale) {
            setError("La Ragione Sociale è obbligatoria per i clienti Business.");
            return;
        }
        if (!cliente && !acquisito) {
            setError("Seleziona da chi è stato acquisito il cliente (negozio o Agenzia).");
            return;
        }

        const dup = await trovaDuplicati({ excludeId: cliente?.id || null, cellulare, cfPiva, email });
        if (dup.cfPiva) {
            setError(`${tipo === "business" ? "La Partita IVA è già associata" : "Il Codice Fiscale è già associato"} al cliente "${dup.cfPiva.label}": è un dato univoco, controlla o correggi.`);
            return;
        }
        if (dup.cellulare && !spostaRef.current) { setDupCell(dup.cellulare); return; }
        if (dup.cellulare && spostaRef.current) { await liberaCellulare(dup.cellulare.id); spostaRef.current = false; setDupCell(null); }

        setLoading(true);
        setError(null);

        const basePayload = {
            tipo,
            nome,
            cognome: tipo === "consumer" ? cognome : (cognome || null),
            ragione_sociale: tipo === "business" ? ragioneSociale : null,
            nome_ref: tipo === "business" ? nome : null,
            cognome_ref: tipo === "business" ? cognome : null,
            cellulare,
            email,
            cf_piva: cfPiva.trim() || null,
            // data di nascita DERIVATA dal CF (mai chiesta nel form)
            data_nascita: dataNascitaDaCF(cfPiva),
            indirizzo,
            cap,
            citta,
        };

        try {
            if (cliente) {
                const { error: err } = await supabase.from("clients").update(basePayload).eq("id", cliente.id);
                if (err) throw err;
            } else {
                const idBase = cfPiva.trim() || cellulare.replace(/\D/g, "") || "ND";
                const insertPayload = { id: `CL-${idBase.replace(/\s/g, "")}-${Date.now()}`, ...basePayload, acquisito_da: acquisito || null };
                const { error: err } = await supabase.from("clients").insert([insertPayload]);
                if (err) throw err;
            }
            onSave();
            onClose();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
            <div className="glass-panel w-full max-w-2xl max-h-[95vh] overflow-hidden flex flex-col shadow-2xl border-white/20">
                <div className="flex-none px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.03]">
                    <h2 className="text-xl font-bold text-white uppercase tracking-tight">
                        {cliente ? "Modifica Cliente" : "Nuovo Cliente"}
                    </h2>
                    <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/5 text-slate-400 hover:text-white transition-all">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
                    {dupCell && (
                        <div className="mx-6 mb-2 p-4 rounded-xl bg-amber-500/10 border border-amber-500/40 space-y-2">
                            <p className="text-sm text-amber-200 font-medium">📱 Questo cellulare è già associato al cliente <strong>“{dupCell.label}”</strong> — il numero è un dato univoco.</p>
                            <div className="flex gap-2 flex-wrap">
                                <button type="button" onClick={() => { spostaRef.current = true; handleSave(); }}
                                    className="text-xs px-3 py-2 rounded-lg bg-amber-500/20 border border-amber-500/50 text-amber-200 hover:bg-amber-500/30 font-bold">
                                    Sposta il numero su questo cliente (lo toglie a “{dupCell.label}”)
                                </button>
                                <button type="button" onClick={() => setDupCell(null)}
                                    className="text-xs px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-slate-300 hover:bg-white/10 font-bold">
                                    Inserisco un altro numero
                                </button>
                            </div>
                        </div>
                    )}
                    {error && (
                        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
                            {error}
                        </div>
                    )}

                    <div className="space-y-4">
                        <div className="flex flex-col gap-2">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Tipo Cliente</span>
                            <div className="flex bg-black/40 p-1 rounded-xl border border-white/5 w-max">
                                {(["consumer", "business"] as const).map((t) => (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => setTipo(t)}
                                        className={`px-6 py-2 rounded-lg text-sm font-bold capitalize transition-all duration-200 ${tipo === t
                                            ? "bg-violet-500/20 text-violet-300 border border-violet-500/20 shadow-lg shadow-violet-500/5"
                                            : "text-slate-500 hover:text-white"
                                            }`}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {tipo === "business" && (
                                <div className="md:col-span-2 space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Ragione Sociale</label>
                                    <input
                                        type="text"
                                        value={ragioneSociale}
                                        onChange={(e) => setRagioneSociale(e.target.value)}
                                        className="w-full glass-input text-sm rounded-xl py-3"
                                        placeholder="Nome Azienda Srl"
                                    />
                                </div>
                            )}

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">{tipo === "business" ? "Nome Referente" : "Nome"} <span className="text-rose-400">*</span></label>
                                <input
                                    type="text"
                                    value={nome}
                                    onChange={(e) => setNome(e.target.value)}
                                    className="w-full glass-input text-sm rounded-xl py-3"
                                    placeholder="Es. Mario"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">{tipo === "business" ? "Cognome Referente" : "Cognome"} <span className="text-rose-400">*</span></label>
                                <input
                                    type="text"
                                    value={cognome}
                                    onChange={(e) => setCognome(e.target.value)}
                                    className="w-full glass-input text-sm rounded-xl py-3"
                                    placeholder="Es. Rossi"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Cellulare <span className="text-rose-400">*</span></label>
                                <input
                                    type="text"
                                    value={cellulare}
                                    onChange={(e) => setCellulare(e.target.value)}
                                    className="w-full glass-input text-sm rounded-xl py-3 font-mono"
                                    placeholder="333 123 4567"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Email</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    onBlur={checkEmail}
                                    className="w-full glass-input text-sm rounded-xl py-3"
                                    placeholder="mario.rossi@email.com"
                                />
                                {emailDup && (
                                    <p className="text-xs text-amber-400">⚠️ Email già registrata sotto il cliente “{emailDup.label}” — si può salvare comunque.</p>
                                )}
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">{tipo === "business" ? "Partita IVA" : "Codice Fiscale"} <span className="text-slate-600 normal-case font-normal">(facoltativo)</span></label>
                                <input
                                    type="text"
                                    value={cfPiva}
                                    onChange={(e) => setCfPiva(e.target.value)}
                                    className="w-full glass-input text-sm rounded-xl py-3 font-mono"
                                    placeholder="Identificativo"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Indirizzo</label>
                                {/* scegli dalla lista → CAP e città si compilano da soli */}
                                <IndirizzoAutocomplete
                                    value={indirizzo}
                                    onChange={setIndirizzo}
                                    onPick={(s) => { setIndirizzo(s.indirizzo); if (s.cap) setCap(s.cap); if (s.citta) setCitta(s.citta); }}
                                    className="w-full glass-input text-sm rounded-xl py-3"
                                    placeholder="Via Esempio 123"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">CAP</label>
                                <input
                                    type="text"
                                    value={cap}
                                    onChange={(e) => setCap(e.target.value)}
                                    className="w-full glass-input text-sm rounded-xl py-3 font-mono"
                                    placeholder="00100"
                                    maxLength={5}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Città</label>
                                <input
                                    type="text"
                                    value={citta}
                                    onChange={(e) => setCitta(e.target.value)}
                                    className="w-full glass-input text-sm rounded-xl py-3"
                                    placeholder="Es. Roma"
                                />
                            </div>
                            {!cliente && (
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Acquisito da <span className="text-rose-400">*</span></label>
                                    <select value={acquisito} onChange={(e) => setAcquisito(e.target.value)} className="w-full glass-input text-sm rounded-xl py-3">
                                        <option value="">— Seleziona —</option>
                                        <option value="Agenzia">Agenzia</option>
                                        {storeOptions.map((n) => <option key={n} value={n}>{n}</option>)}
                                    </select>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex-none px-6 py-4 border-t border-white/10 bg-white/[0.03] flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs uppercase tracking-widest transition-all"
                    >
                        Annulla
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={loading}
                        className="px-8 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs uppercase tracking-widest transition-all shadow-lg shadow-violet-500/20 disabled:opacity-50"
                    >
                        {loading ? "Salvataggio..." : "Salva Cliente"}
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
    // Filtro visibilità (amministrazione): clienti gestiti da utenti/negozi (multi)
    filterGestitoDa: [] as string[],
    filterNegozioGestito: [] as string[],
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

    // ── OUTBOUND: vede per intero SOLO i clienti inseriti da lui (pratiche con il
    // suo nome); degli altri solo nome/ragione sociale — dati e scheda oscurati.
    // L'accesso completo si chiede all'amministrazione (client_access_requests).
    const { user } = useAuth();
    const role = user?.role || "";
    const canApproveAccess = ["amministrativo", "admin", "dev", "direttore_generale"].includes(role);
    // AMBITO CLIENTI dai PERMESSI (capacità cap:/clienti:*, amministrabile da
    // Amministrazione → Utenti → Permessi): "tutti" | "negozi" | "propri".
    // I default replicano il comportamento storico; la visibilità TOTALE a
    // livello utente (seesAllVis) non viene mai ristretta dallo scope di ruolo.
    const { perms: capPerms } = useRolePermissions(role);
    // ── VISIBILITÀ CLIENTI: FONTE UNICA condivisa con Registra Vendita
    //    (src/lib/clientiVisibili — Luca 28/07: mai più logiche divergenti).
    const scopeClienti = capChoice(role, CAP_CLIENTI, capPerms);
    const { seesAll: seesAllVis, stores: visStores } = useVisibleStores();
    const visCli = useClientiVisibili();
    const maskAttivo = visCli.maskAttivo;
    const isStoreScoped = maskAttivo && scopeClienti === "negozi";
    const soloPropri = maskAttivo && scopeClienti === "propri";
    const soloAppuntamenti = maskAttivo && scopeClienti === "appuntamenti";
    // Eliminazione anagrafiche: dall'amministrativo in su (cestino in tabella).
    const canDelete = canApproveAccess;
    const [delConfirm, setDelConfirm] = useState<string | null>(null);
    const mieiClienti = visCli.mieiClienti;
    const accessOk = visCli.accessOk;
    const accessPending = visCli.accessPending;
    const [richiesteAccesso, setRichiesteAccesso] = useState<Record<string, unknown>[]>([]);
    const [accessMsg, setAccessMsg] = useState("");
    const loadAccessi = visCli.ricaricaAccessi;
    useEffect(() => {
        if (!user?.id || !canApproveAccess) return;
        (async () => {
            const { data: reqs, error } = await supabase.from("client_access_requests")
                .select("*, clients(nome,cognome,ragione_sociale,tipo)").eq("status", "pending").order("created_at");
            if (!error) setRichiesteAccesso((reqs ?? []) as Record<string, unknown>[]);
        })();
    }, [user?.id, canApproveAccess]);
    const oscurato = (c: Cliente) => !visCli.visibile(c.id);

    // ── FILTRO VISIBILITÀ (richiesta Luca 30/07): dall'amministrativo in su,
    // nei filtri avanzati si sceglie un UTENTE o un NEGOZIO e si vede cio' che
    // vedono loro — i clienti gestiti almeno una volta (pratiche a loro nome,
    // o del punto vendita piu' le anagrafiche acquisite li'). Stesse regole
    // della fonte unica clientiVisibili, calcolate per il soggetto scelto.
    // MULTI-selezione (Luca 30/07): più persone e più negozi insieme. Le viste
    // salvate prima della modifica avevano una stringa singola: si normalizza.
    const filterGestitoDa = Array.isArray(view.filterGestitoDa) ? view.filterGestitoDa : (view.filterGestitoDa ? [view.filterGestitoDa as unknown as string] : []);
    const setFilterGestitoDa = (v: string[]) => setView((p) => ({ ...p, filterGestitoDa: v }));
    const filterNegozioGestito = Array.isArray(view.filterNegozioGestito) ? view.filterNegozioGestito : (view.filterNegozioGestito ? [view.filterNegozioGestito as unknown as string] : []);
    const setFilterNegozioGestito = (v: string[]) => setView((p) => ({ ...p, filterNegozioGestito: v }));
    const NEGOZI = useStores();
    const [utentiFiltro, setUtentiFiltro] = useState<{ full_name: string; match_name: string | null }[]>([]);
    const [contrattiGest, setContrattiGest] = useState<{ client_id: string | null; venditore: string | null; negozio: string | null }[] | null>(null);
    const [acquisitiGest, setAcquisitiGest] = useState<{ id: string; acquisito_da: string | null }[]>([]);
    useEffect(() => {
        if (!canApproveAccess) return;
        supabase.from("app_users").select("full_name, match_name").eq("active", true).order("full_name")
            .then(({ data }) => setUtentiFiltro((data ?? []) as never));
    }, [canApproveAccess]);
    // COLONNA "Gestito da" (Luca 30/07): da store manager in su la tabella
    // mostra chi ha gestito il cliente (venditori delle sue pratiche) e in
    // quali negozi; il mapping e' lo stesso del filtro visibilita'.
    const vedeGestitoDa = seesAllStores(user?.role) || seesWholeStore(user?.role);
    useEffect(() => {
        // il mapping pratiche->clienti si carica una volta sola: subito se la
        // colonna e' visibile, altrimenti alla prima selezione del filtro
        if (contrattiGest !== null) return;
        if (!vedeGestitoDa && !(canApproveAccess && (filterGestitoDa.length || filterNegozioGestito.length))) return;
        (async () => {
            const { data: cs } = await supabase.from("contracts").select("client_id, venditore, negozio").limit(10000);
            const { data: acq } = await supabase.from("clients").select("id, acquisito_da").limit(5000);
            setContrattiGest((cs ?? []) as never);
            setAcquisitiGest((acq ?? []) as never);
        })();
    }, [canApproveAccess, vedeGestitoDa, filterGestitoDa, filterNegozioGestito, contrattiGest]);
    const gestioneDi = useMemo(() => {
        const m = new Map<string, { venditori: string[]; negozi: string[] }>();
        (contrattiGest || []).forEach((c) => {
            if (!c.client_id) return;
            const r = m.get(c.client_id) || { venditori: [], negozi: [] };
            const v = (c.venditore || "").trim();
            const n = (c.negozio || "").trim();
            if (v && !r.venditori.includes(v)) r.venditori.push(v);
            if (n && !r.negozi.includes(n)) r.negozi.push(n);
            m.set(c.client_id, r);
        });
        return m;
    }, [contrattiGest]);
    const gestitiSet = useMemo(() => {
        if (!canApproveAccess || (!filterGestitoDa.length && !filterNegozioGestito.length)) return null;
        if (contrattiGest === null) return new Set<string>(); // in carica: un attimo di lista vuota
        let set: Set<string> | null = null;
        if (filterGestitoDa.length) {
            // piu' persone = UNIONE dei loro clienti (match_name incluso)
            const nomiSel = new Set<string>();
            filterGestitoDa.forEach((fn) => {
                const u = utentiFiltro.find((x) => x.full_name === fn);
                [u?.full_name || fn, u?.match_name].forEach((n) => { const t = String(n || "").trim().toLowerCase(); if (t) nomiSel.add(t); });
            });
            set = new Set(contrattiGest
                .filter((c) => c.client_id && nomiSel.has(String(c.venditore || "").trim().toLowerCase()))
                .map((c) => c.client_id as string));
        }
        if (filterNegozioGestito.length) {
            const s = new Set<string>();
            contrattiGest.forEach((c) => { if (c.client_id && filterNegozioGestito.some((ng) => sameStore(c.negozio, ng))) s.add(c.client_id); });
            acquisitiGest.forEach((c) => { if (filterNegozioGestito.some((ng) => sameStore(c.acquisito_da, ng))) s.add(c.id); });
            set = set ? new Set([...set].filter((id) => s.has(id))) : s;
        }
        return set;
    }, [canApproveAccess, filterGestitoDa, filterNegozioGestito, contrattiGest, acquisitiGest, utentiFiltro]);

    const richiediAccesso = async (c: Cliente) => {
        setAccessMsg("");
        const { error } = await supabase.from("client_access_requests").insert({
            client_id: c.id, requested_by: user?.id || null, requested_by_name: user?.name || "—",
        });
        if (error) { setAccessMsg("⚠️ Invio non riuscito (funzione in attivazione): riprova più tardi."); return; }
        visCli.segnaPending(c.id);
        setAccessMsg("✅ Richiesta inviata all'amministrazione: vedrai i dati appena approvata.");
    };
    const eliminaCliente = async (c: Cliente) => {
        setAccessMsg("");
        const { count } = await supabase.from("contracts").select("id", { count: "exact", head: true }).eq("client_id", c.id);
        if ((count ?? 0) > 0) {
            setAccessMsg(`⚠️ "${c.tipo === "business" ? c.ragioneSociale : `${c.nome} ${c.cognome}`}" ha ${count} vendite registrate: non si può eliminare (perderebbero l'anagrafica).`);
            setDelConfirm(null);
            return;
        }
        const { error } = await supabase.from("clients").delete().eq("id", c.id);
        if (error) { setAccessMsg("⚠️ Eliminazione non riuscita: " + error.message); setDelConfirm(null); return; }
        setDelConfirm(null);
        setAccessMsg("✅ Anagrafica eliminata.");
        fetchClientList();
    };
    const decidiAccesso = async (id: string, approve: boolean) => {
        await supabase.from("client_access_requests").update({
            status: approve ? "approved" : "rejected", decided_by: user?.name || "—", decided_at: new Date().toISOString(),
        }).eq("id", id);
        setRichiesteAccesso((p) => p.filter((r) => r.id !== id));
    };

    const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
    const [contrattiForModal, setContrattiForModal] = useState<Contratto[]>([]);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [clientToEdit, setClientToEdit] = useState<Cliente | null>(null);

    const [clientList, setClientList] = useState<Cliente[]>([]);

    // Deep link dai tag in chat: /clienti?id=<id> apre subito la scheda del cliente
    const deepLinked = useRef(false);
    useEffect(() => {
        if (deepLinked.current || clientList.length === 0) return;
        const id = new URLSearchParams(window.location.search).get("id");
        if (!id) return;
        const hit = clientList.find((c: any) => String(c.id) === id);
        if (hit) { setSelectedCliente(hit); deepLinked.current = true; }
    }, [clientList]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const fetchClientList = async () => {
        setLoadError(null);
        setLoading(true);
        const { data, error } = await supabase.from("clients").select("*").order("id");
        if (error) {
            setLoadError(error.message);
            setClientList([]);
        } else {
            setClientList((data ?? []).map(mapRowToCliente));
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchClientList();

        const handleEditEvent = (e: any) => {
            setClientToEdit(e.detail);
            setIsFormOpen(true);
        };
        window.addEventListener("edit-client", handleEditEvent);
        return () => window.removeEventListener("edit-client", handleEditEvent);
    }, []);

    useEffect(() => {
        if (!selectedCliente) {
            setContrattiForModal([]);
            return;
        }
        let cancelled = false;
        (async () => {
            const { data, error } = await supabase
                .from("contracts")
                .select("*")
                .eq("client_id", selectedCliente.id)
                .order("data", { ascending: false });
            if (cancelled) return;
            if (!error && data) setContrattiForModal(data.map(mapRowToContratto));
            else setContrattiForModal([]);
        })();
        return () => { cancelled = true; };
    }, [selectedCliente?.id]);

    const resetFilters = () => setView((p) => ({ ...p, ...defaultClientiView }));

    const filteredData = useMemo(() => {
        return clientList.filter((c) => {
            // 1. Quick Search (Full-text)
            if (quickSearch) {
                const q = quickSearch.toLowerCase();
                const fullString = `${c.nome} ${c.cognome || ""} ${c.ragioneSociale || ""} ${c.email} ${c.cellulare} ${c.cf_piva || ""}`.toLowerCase();
                if (!fullString.includes(q)) return false;
            }

            // 2. Advanced filters
            if (gestitiSet && !gestitiSet.has(c.id)) return false;
            if (filterTipo !== "tutti" && c.tipo !== filterTipo) return false;
            if (filterNome && !c.nome.toLowerCase().includes(filterNome.toLowerCase())) return false;
            if (filterCognome && (!c.cognome || !c.cognome.toLowerCase().includes(filterCognome.toLowerCase()))) return false;
            if (filterRagione && c.tipo === "business" && (!c.ragioneSociale || !c.ragioneSociale.toLowerCase().includes(filterRagione.toLowerCase()))) return false;
            if (filterCellulare && !c.cellulare.includes(filterCellulare)) return false;
            if (filterEmail && !c.email.toLowerCase().includes(filterEmail.toLowerCase())) return false;
            if (filterIdentifier && !(c.cf_piva || "").toLowerCase().includes(filterIdentifier.toLowerCase())) return false;

            return true;
        });
    }, [clientList, quickSearch, filterTipo, filterNome, filterCognome, filterRagione, filterCellulare, filterEmail, filterIdentifier, gestitiSet]);

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
                        <p className="text-sm text-slate-400">{soloAppuntamenti ? "Per intero i clienti con un appuntamento fissato da te; gli altri sono riservati — l'accesso si chiede all'amministrazione" : soloPropri ? "I tuoi clienti per intero; gli altri sono riservati — l'accesso si chiede all'amministrazione" : isStoreScoped ? "Per intero i clienti acquisiti o gestiti dal tuo negozio; gli altri sono riservati — la ricerca li trova, l'accesso si chiede all'amministrazione" : "Anagrafica completa dei clienti Consumer e Business"}</p>
                        {accessMsg && <p className={`text-sm mt-1 font-medium ${accessMsg.startsWith("✅") ? "text-emerald-400" : "text-amber-400"}`}>{accessMsg}</p>}
                        {canApproveAccess && richiesteAccesso.length > 0 && (
                            <div className="mt-3 p-3 rounded-xl bg-violet-500/10 border border-violet-500/30 space-y-2">
                                <div className="text-sm font-bold text-violet-300">🔓 Richieste di accesso ai dati cliente ({richiesteAccesso.length})</div>
                                {richiesteAccesso.map((r) => {
                                    const cl = r.clients as Record<string, unknown> | null;
                                    const nomeCl = cl ? (cl.tipo === "business" && cl.ragione_sociale ? String(cl.ragione_sociale) : `${cl.nome || ""} ${cl.cognome || ""}`.trim()) : String(r.client_id);
                                    return (
                                        <div key={String(r.id)} className="flex items-center gap-3 text-sm text-slate-300 flex-wrap">
                                            <span><strong className="text-white">{String(r.requested_by_name)}</strong> chiede l'accesso a <strong className="text-white">{nomeCl}</strong></span>
                                            <span className="ml-auto flex gap-2">
                                                <button onClick={() => decidiAccesso(String(r.id), true)} className="text-xs px-3 py-1.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30 font-bold">Approva</button>
                                                <button onClick={() => decidiAccesso(String(r.id), false)} className="text-xs px-3 py-1.5 rounded-md bg-rose-500/15 border border-rose-500/40 text-rose-300 hover:bg-rose-500/25 font-bold">Rifiuta</button>
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
                <button
                    onClick={() => {
                        setClientToEdit(null);
                        setIsFormOpen(true);
                    }}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs uppercase tracking-widest transition-all shadow-lg shadow-violet-500/20 active:scale-95"
                >
                    <Users className="w-4 h-4" />
                    Nuovo Cliente
                </button>
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

                                {/* Filtri "gestito da": due campi NORMALI come gli altri, multi-
                                    selezione nello stile unificato (Luca 30/07). */}
                                {canApproveAccess && (
                                    <>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-medium text-slate-400">Gestiti dall&apos;utente</label>
                                            <SelectMulti
                                                values={filterGestitoDa}
                                                onChange={(v) => { setFilterGestitoDa(v); setCurrentPage(1); }}
                                                opzioni={utentiFiltro.map((u) => u.full_name)}
                                                className="w-full glass-input text-sm rounded-lg py-2"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-medium text-slate-400">Gestiti dal negozio</label>
                                            <SelectMulti
                                                values={filterNegozioGestito}
                                                onChange={(v) => { setFilterNegozioGestito(v); setCurrentPage(1); }}
                                                opzioni={NEGOZI}
                                                className="w-full glass-input text-sm rounded-lg py-2"
                                            />
                                        </div>
                                    </>
                                )}

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
                                        {vedeGestitoDa && <th className="px-6 py-4 font-semibold">Gestito da</th>}
                                        <th className="px-6 py-4 font-semibold text-right">Identificativo</th>
                                        {canDelete && <th className="px-4 py-4 w-14"></th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td colSpan={4 + (vedeGestitoDa ? 1 : 0) + (canDelete ? 1 : 0)} className="px-6 py-12 text-center text-slate-400">
                                                Caricamento clienti...
                                            </td>
                                        </tr>
                                    ) : loadError ? (
                                        <tr>
                                            <td colSpan={4 + (vedeGestitoDa ? 1 : 0) + (canDelete ? 1 : 0)} className="px-6 py-12 text-center text-rose-400">
                                                Errore: {loadError}
                                            </td>
                                        </tr>
                                    ) : paginatedData.length > 0 ? (
                                        paginatedData.map((cliente) => oscurato(cliente) ? (
                                            /* Cliente GIA' NOSTRO non inserito dall'outbound: solo il nome.
                                               Per i dati completi serve l'ok dell'amministrazione. */
                                            <tr key={cliente.id} className="border-b border-white/5 bg-white/[0.01]">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex-none w-10 h-10 rounded-full flex items-center justify-center border bg-white/5 border-white/10 text-slate-500">🔒</div>
                                                        <div>
                                                            <div className="font-medium text-slate-300">
                                                                {cliente.tipo === "business" ? cliente.ragioneSociale : `${cliente.nome} ${cliente.cognome}`}
                                                            </div>
                                                            <div className="text-xs text-slate-600 mt-0.5">Cliente già acquisito — dati riservati</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-slate-600 text-xs">•••</td>
                                                <td className="px-6 py-4 text-slate-600 text-xs">•••</td>
                                                {vedeGestitoDa && <td className="px-6 py-4 text-slate-600 text-xs">•••</td>}
                                                <td className="px-6 py-4 text-right" colSpan={canDelete ? 2 : 1}>
                                                    {accessPending.has(cliente.id) ? (
                                                        <span className="text-xs px-2.5 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 font-medium">⏳ In attesa di approvazione</span>
                                                    ) : (
                                                        <button onClick={() => richiediAccesso(cliente)}
                                                            className="text-xs px-2.5 py-1.5 rounded-md bg-violet-500/15 border border-violet-500/40 text-violet-300 hover:bg-violet-500/25 transition-colors font-medium">
                                                            🔓 Richiedi accesso
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ) : (
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
                                                            {cliente.email && (
                                                                <Link href={"/chat?mail=" + encodeURIComponent(cliente.email)}
                                                                    onClick={e => e.stopPropagation()}
                                                                    title="Scrivi una email dal CRM (webmail già in composizione)"
                                                                    className="px-1.5 py-0.5 rounded border border-sky-500/40 bg-sky-500/15 text-sky-300 hover:bg-sky-500/30 text-[11px] shrink-0">✉️</Link>
                                                            )}
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
                                                {vedeGestitoDa && (() => {
                                                    // Chi l'ha gestito: venditori delle sue pratiche + negozi;
                                                    // senza pratiche resta il negozio di acquisizione.
                                                    const g = gestioneDi.get(cliente.id);
                                                    const venditori = g?.venditori || [];
                                                    const negozi = g?.negozi?.length ? g.negozi : (cliente.acquisito_da ? [cliente.acquisito_da] : []);
                                                    return (
                                                        <td className="px-6 py-4">
                                                            {venditori.length === 0 && negozi.length === 0 ? (
                                                                <span className="text-slate-600 text-xs">—</span>
                                                            ) : (
                                                                <div className="text-xs">
                                                                    {venditori.length > 0 && (
                                                                        <div className="text-slate-200">
                                                                            {venditori.slice(0, 2).join(", ")}
                                                                            {venditori.length > 2 && <span className="text-slate-500"> +{venditori.length - 2}</span>}
                                                                        </div>
                                                                    )}
                                                                    {negozi.length > 0 && (
                                                                        <div className="text-slate-500 mt-0.5">
                                                                            🏪 {negozi.slice(0, 2).join(", ")}{negozi.length > 2 ? ` +${negozi.length - 2}` : ""}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </td>
                                                    );
                                                })()}
                                                <td className="px-6 py-4 text-right">
                                                    <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-xs font-mono text-slate-300">
                                                        {cliente.cf_piva || "—"}
                                                    </span>
                                                </td>
                                                {canDelete && (
                                                    <td className="px-4 py-4 text-right">
                                                        {delConfirm === cliente.id ? (
                                                            <span className="inline-flex items-center gap-1">
                                                                <button onClick={() => eliminaCliente(cliente)} title="Conferma eliminazione"
                                                                    className="text-[11px] px-2 py-1 rounded-md bg-rose-500/20 border border-rose-500/50 text-rose-300 hover:bg-rose-500/30 font-bold">Elimina</button>
                                                                <button onClick={() => setDelConfirm(null)} className="text-[11px] px-1.5 py-1 rounded-md text-slate-400 hover:text-white">✕</button>
                                                            </span>
                                                        ) : (
                                                            <button onClick={() => setDelConfirm(cliente.id)} title="Elimina anagrafica"
                                                                className="p-1.5 rounded-md text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors">🗑</button>
                                                        )}
                                                    </td>
                                                )}
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={4 + (vedeGestitoDa ? 1 : 0) + (canDelete ? 1 : 0)} className="px-6 py-12 text-center text-slate-500">
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
                    contratti={contrattiForModal}
                    onClose={() => setSelectedCliente(null)}
                />
            )}

            {/* MODAL FORM CLIENTE */}
            {isFormOpen && (
                <ClienteFormModal
                    cliente={clientToEdit}
                    onClose={() => {
                        setIsFormOpen(false);
                        setClientToEdit(null);
                    }}
                    onSave={fetchClientList}
                />
            )}
        </div>
    );
}

/* ── STORICO CONVERSAZIONI COL CLIENTE (Luca 29/07) ──
   Due fonti, stessa finestra:
   - call_events = OGNI chiamata Aircall (inbound e outbound), agganciata per
     client_id o per coda di cifre del cellulare, con durata e REGISTRAZIONE
     (il webhook salva recording_url quando Aircall la fornisce): si ascolta
     nel CRM o si scarica con un click;
   - calls = le pratiche del call center (esiti: NR, appuntamenti, ecc.),
     agganciate per CF/P.IVA o per numero. */
function StoricoChiamateCliente({ cliente, onClose }: { cliente: { id: string; cellulare?: string | null; cf_piva?: string | null; nome?: string | null; cognome?: string | null; ragioneSociale?: string | null; tipo?: string | null }; onClose: () => void }) {
    const [eventi, setEventi] = useState<Record<string, unknown>[]>([]);
    const [pratiche, setPratiche] = useState<Record<string, unknown>[]>([]);
    const [caricoStorico, setCaricoStorico] = useState(true);
    useEffect(() => {
        (async () => {
            const dig = String(cliente.cellulare || "").replace(/\D/g, "");
            const coda = dig.slice(-9);
            const patt = coda ? "%" + coda.split("").join("%") + "%" : "";
            // Aircall: per client_id e per numero (formati con spazi inclusi)
            const [perId, perNum] = await Promise.all([
                supabase.from("call_events").select("*").eq("client_id", cliente.id).order("started_at", { ascending: false }).limit(200),
                patt ? supabase.from("call_events").select("*").ilike("cliente_num", patt).order("started_at", { ascending: false }).limit(200) : Promise.resolve({ data: [] }),
            ]);
            const visti = new Set<string>();
            const ev: Record<string, unknown>[] = [];
            [...(perId.data ?? []), ...((perNum as { data?: Record<string, unknown>[] }).data ?? [])].forEach((e) => {
                const k = String((e as { id?: unknown }).id);
                if (!visti.has(k)) { visti.add(k); ev.push(e as Record<string, unknown>); }
            });
            ev.sort((a, b) => String(b.started_at || "").localeCompare(String(a.started_at || "")));
            setEventi(ev);
            // pratiche caller: per CF/P.IVA o numero
            const idf = String(cliente.cf_piva || "").trim();
            const cond: string[] = [];
            if (idf) { cond.push(`cf.ilike.${idf}`); cond.push(`piva.ilike.${idf}`); }
            if (coda) cond.push(`cellulare.ilike.%25${coda}%25`.replace(/%25/g, "%"));
            if (cond.length) {
                const { data: pr } = await supabase.from("calls").select("id,stato,caller,data_chiamata,lista_origine,note,numero").or(cond.join(",")).order("data_chiamata", { ascending: false }).limit(100);
                setPratiche((pr ?? []) as Record<string, unknown>[]);
            }
            setCaricoStorico(false);
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cliente.id]);
    const quando = (iso: unknown) => { const d = new Date(String(iso || "")); return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("it-IT") + " " + d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }); };
    const durata = (sec: unknown) => { const n = Number(sec) || 0; return n ? `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}` : "—"; };
    return (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
            <div className="glass-panel w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl border-white/10" onClick={(e) => e.stopPropagation()}>
                <div className="flex-none px-5 py-4 border-b border-white/10 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-white">📞 Storico chiamate — {cliente.tipo === "business" ? cliente.ragioneSociale : `${cliente.nome || ""} ${cliente.cognome || ""}`}</h3>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/10"><X className="w-5 h-5" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-5 space-y-6">
                    {caricoStorico && <div className="text-center text-slate-500 py-8">Caricamento storico…</div>}
                    {!caricoStorico && (
                        <>
                            <div>
                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Chiamate Aircall ({eventi.length})</h4>
                                {eventi.length === 0 && <p className="text-sm text-slate-600">Nessuna chiamata Aircall registrata con questo cliente.</p>}
                                <div className="space-y-2">
                                    {eventi.map((e) => (
                                        <div key={String(e.id)} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                                            <div className="flex items-center gap-3 flex-wrap text-sm">
                                                <span title={e.direction === "inbound" ? "Il cliente ha chiamato noi" : "Noi abbiamo chiamato il cliente"}>{e.direction === "inbound" ? "📥" : "📤"}</span>
                                                <span className="text-white font-semibold">{quando(e.started_at)}</span>
                                                <span className="text-slate-400">{String(e.agente_nome || "—")}</span>
                                                {e.missed ? <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-rose-500/15 text-rose-300">persa</span>
                                                    : <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300">risposta · {durata(e.duration_sec)}</span>}
                                                <span className="ml-auto text-xs text-slate-500 font-mono">{String(e.cliente_num || "")}</span>
                                            </div>
                                            {!!e.recording_url && (
                                                <div className="mt-2 flex items-center gap-3">
                                                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                                                    <audio controls preload="none" src={String(e.recording_url)} className="h-8 flex-1 min-w-0" />
                                                    <a href={String(e.recording_url)} target="_blank" rel="noreferrer" download
                                                        className="text-xs font-bold text-sky-300 hover:text-white shrink-0">⬇ Scarica</a>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Esiti del call center ({pratiche.length})</h4>
                                {pratiche.length === 0 && <p className="text-sm text-slate-600">Nessuna pratica del call center su questo cliente.</p>}
                                <div className="space-y-1.5">
                                    {pratiche.map((c) => (
                                        <div key={String(c.id)} className="flex items-center gap-3 flex-wrap rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-sm">
                                            <span className="text-white">{quando(c.data_chiamata)}</span>
                                            <span className="px-2 py-0.5 rounded bg-violet-500/15 text-violet-200 text-[11px] font-bold">{String(c.stato || "—")}</span>
                                            <span className="text-slate-400 text-xs">{String(c.caller || "—")}</span>
                                            {!!c.lista_origine && <span className="text-slate-600 text-xs">lista: {String(c.lista_origine)}</span>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
