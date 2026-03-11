"use client";

import { useState, useMemo } from "react";
import { cn } from "@/utils";
import { usePageView } from "@/lib/pageView";
import { useAuth } from "@/context/AuthContext";
import { RotateCcw, Download, Eye, ArrowLeft } from "lucide-react";

//  Types ─
type DocKey = "cassa" | "pos" | "ddt_w3" | "ddt_vf" | "fatture";
type FilesMap = Record<DocKey, { name: string; size: string }[]>;

interface Attachment { name: string; cat: DocKey; }
interface Chiusura {
    id: number; store: string; societa: string; date: string; user: string;
    docs: Record<DocKey, number>; time: string;
    attachments: Attachment[];
}
interface Fattura {
    id: number; filename: string; store: string; societa: string;
    date: string; user: string; closureId: number; emessa: boolean;
}

//  Constants ─
const NEGOZI = ["Magliana", "Donna", "Libia", "Collatina", "Mazzini", "San Paolo", "Garbatella", "Promontori", "Acilia", "Baleniere", "Castani", "Merulana", "Telefonico"];
const SOCIETA = ["Telefutura", "Telefutura 2SRL"];
const SOC_COLORS: Record<string, { text: string; bg: string; border: string }> = {
    "Telefutura": { text: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/30" },
    "Telefutura 2SRL": { text: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/30" },
};
const SOC_ACCENT: Record<string, string> = { "Telefutura": "#3b82f6", "Telefutura 2SRL": "#8b5cf6" };

const DOC_TYPES: { key: DocKey; label: string; icon: string; desc: string; required: boolean }[] = [
    { key: "cassa", label: "Chiusura Cassa", icon: "", desc: "Report chiusura cassa giornaliero", required: true },
    { key: "pos", label: "Chiusura POS", icon: "", desc: "Scontrini e report terminali POS", required: true },
    { key: "ddt_w3", label: "DDT WindTre", icon: "", desc: "Documenti di trasporto WindTre", required: false },
    { key: "ddt_vf", label: "DDT Vodafone", icon: "", desc: "Documenti di trasporto Vodafone", required: false },
    { key: "fatture", label: "Fatture Clienti", icon: "", desc: "Fatture emesse ai clienti in giornata", required: false },
];

const FAKE_NAMES = ["chiusura_cassa.pdf", "report_pos.pdf", "ddt_marzo.pdf", "fattura_0042.pdf", "scontrino.jpg", "estratto_conto.pdf", "registro_vendite.pdf"];
const emptyDocs = (): FilesMap => ({ cassa: [], pos: [], ddt_w3: [], ddt_vf: [], fatture: [] });

//  Mock history 
const MOCK_HISTORY: Chiusura[] = [
    { id: 1, store: "Magliana", societa: "Telefutura", date: "2026-03-11", user: "Marco Rossi", docs: { cassa: 1, pos: 2, ddt_w3: 1, ddt_vf: 0, fatture: 3 }, time: "20:45", attachments: [{ name: "cassa_mag_1103.pdf", cat: "cassa" }, { name: "pos_mag_1.pdf", cat: "pos" }, { name: "pos_mag_2.pdf", cat: "pos" }, { name: "ddt_w3_mag.pdf", cat: "ddt_w3" }, { name: "fatt_0041.pdf", cat: "fatture" }, { name: "fatt_0042.pdf", cat: "fatture" }, { name: "fatt_0043.pdf", cat: "fatture" }] },
    { id: 2, store: "Magliana", societa: "Telefutura 2SRL", date: "2026-03-11", user: "Marco Rossi", docs: { cassa: 1, pos: 1, ddt_w3: 0, ddt_vf: 0, fatture: 1 }, time: "20:47", attachments: [{ name: "cassa_mag_2srl.pdf", cat: "cassa" }, { name: "pos_mag_2srl.pdf", cat: "pos" }, { name: "fatt_2srl_001.pdf", cat: "fatture" }] },
    { id: 3, store: "Collatina", societa: "Telefutura", date: "2026-03-11", user: "Luca Bianchi", docs: { cassa: 1, pos: 1, ddt_w3: 0, ddt_vf: 1, fatture: 2 }, time: "21:10", attachments: [{ name: "cassa_col.pdf", cat: "cassa" }, { name: "pos_col.pdf", cat: "pos" }, { name: "ddt_vf_col.pdf", cat: "ddt_vf" }, { name: "fatt_col_01.pdf", cat: "fatture" }, { name: "fatt_col_02.pdf", cat: "fatture" }] },
    { id: 4, store: "Donna", societa: "Telefutura", date: "2026-03-11", user: "Sara Verdi", docs: { cassa: 1, pos: 2, ddt_w3: 1, ddt_vf: 1, fatture: 4 }, time: "20:30", attachments: [{ name: "cassa_don.pdf", cat: "cassa" }, { name: "pos_don_1.pdf", cat: "pos" }, { name: "pos_don_2.pdf", cat: "pos" }, { name: "ddt_w3_don.pdf", cat: "ddt_w3" }, { name: "ddt_vf_don.pdf", cat: "ddt_vf" }, { name: "fatt_don_01.pdf", cat: "fatture" }, { name: "fatt_don_02.pdf", cat: "fatture" }, { name: "fatt_don_03.pdf", cat: "fatture" }, { name: "fatt_don_04.pdf", cat: "fatture" }] },
    { id: 5, store: "Donna", societa: "Telefutura 2SRL", date: "2026-03-11", user: "Sara Verdi", docs: { cassa: 1, pos: 1, ddt_w3: 1, ddt_vf: 1, fatture: 2 }, time: "20:32", attachments: [{ name: "cassa_don_2srl.pdf", cat: "cassa" }, { name: "pos_don_2srl.pdf", cat: "pos" }, { name: "ddt_w3_don_2srl.pdf", cat: "ddt_w3" }, { name: "ddt_vf_don_2srl.pdf", cat: "ddt_vf" }, { name: "fatt_don_2srl_01.pdf", cat: "fatture" }, { name: "fatt_don_2srl_02.pdf", cat: "fatture" }] },
    { id: 6, store: "Libia", societa: "Telefutura", date: "2026-03-10", user: "Antonio Esposito", docs: { cassa: 1, pos: 1, ddt_w3: 1, ddt_vf: 0, fatture: 1 }, time: "21:00", attachments: [{ name: "cassa_lib.pdf", cat: "cassa" }, { name: "pos_lib.pdf", cat: "pos" }, { name: "ddt_w3_lib.pdf", cat: "ddt_w3" }, { name: "fatt_lib_01.pdf", cat: "fatture" }] },
    { id: 7, store: "Mazzini", societa: "Telefutura", date: "2026-03-10", user: "Giulia Neri", docs: { cassa: 1, pos: 2, ddt_w3: 0, ddt_vf: 1, fatture: 5 }, time: "20:55", attachments: [{ name: "cassa_maz_10.pdf", cat: "cassa" }, { name: "pos_maz_10_1.pdf", cat: "pos" }, { name: "pos_maz_10_2.pdf", cat: "pos" }, { name: "ddt_vf_maz.pdf", cat: "ddt_vf" }, { name: "fatt_maz_01.pdf", cat: "fatture" }, { name: "fatt_maz_02.pdf", cat: "fatture" }, { name: "fatt_maz_03.pdf", cat: "fatture" }, { name: "fatt_maz_04.pdf", cat: "fatture" }, { name: "fatt_maz_05.pdf", cat: "fatture" }] },
    { id: 8, store: "San Paolo", societa: "Telefutura 2SRL", date: "2026-03-10", user: "Federico Conti", docs: { cassa: 1, pos: 1, ddt_w3: 1, ddt_vf: 0, fatture: 2 }, time: "20:57", attachments: [{ name: "cassa_sp_2srl.pdf", cat: "cassa" }, { name: "pos_sp_2srl.pdf", cat: "pos" }, { name: "ddt_w3_sp.pdf", cat: "ddt_w3" }, { name: "fatt_sp_01.pdf", cat: "fatture" }, { name: "fatt_sp_02.pdf", cat: "fatture" }] },
    { id: 9, store: "Acilia", societa: "Telefutura", date: "2026-03-09", user: "Eloise Blanc", docs: { cassa: 1, pos: 1, ddt_w3: 1, ddt_vf: 1, fatture: 2 }, time: "20:20", attachments: [{ name: "cassa_aci.pdf", cat: "cassa" }, { name: "pos_aci.pdf", cat: "pos" }, { name: "ddt_w3_aci.pdf", cat: "ddt_w3" }, { name: "ddt_vf_aci.pdf", cat: "ddt_vf" }, { name: "fatt_aci_01.pdf", cat: "fatture" }, { name: "fatt_aci_02.pdf", cat: "fatture" }] },
    { id: 10, store: "Garbatella", societa: "Telefutura", date: "2026-03-09", user: "Lorenzo Ricci", docs: { cassa: 1, pos: 2, ddt_w3: 1, ddt_vf: 1, fatture: 3 }, time: "21:05", attachments: [{ name: "cassa_gar.pdf", cat: "cassa" }, { name: "pos_gar_1.pdf", cat: "pos" }, { name: "pos_gar_2.pdf", cat: "pos" }, { name: "ddt_w3_gar.pdf", cat: "ddt_w3" }, { name: "ddt_vf_gar.pdf", cat: "ddt_vf" }, { name: "fatt_gar_01.pdf", cat: "fatture" }, { name: "fatt_gar_02.pdf", cat: "fatture" }, { name: "fatt_gar_03.pdf", cat: "fatture" }] },
];

function buildFatture(history: Chiusura[]): Fattura[] {
    let id = 1;
    const list: Fattura[] = [];
    history.forEach(row => {
        row.attachments.filter(a => a.cat === "fatture").forEach(att => {
            list.push({ id: id++, filename: att.name, store: row.store, societa: row.societa, date: row.date, user: row.user, closureId: row.id, emessa: Math.random() > 0.55 });
        });
    });
    return list;
}

//  SocBadge 
function SocBadge({ name }: { name: string }) {
    const c = SOC_COLORS[name] || SOC_COLORS["Telefutura"];
    return <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap", c.text, c.bg, c.border)}>{name}</span>;
}

//  DocBadge 
function DocBadge({ count }: { count: number }) {
    if (count === 0) return <span className="text-slate-700 text-sm"></span>;
    return <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">{count}</span>;
}

//  DocMiniRow 
function DocMiniRow({ docs }: { docs: Record<DocKey, number> }) {
    return (
        <div className="flex gap-2 flex-wrap mt-2">
            {DOC_TYPES.map(dt => (
                <span key={dt.key} className={cn("flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold border",
                    docs[dt.key] > 0 ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400" : "bg-white/[0.02] border-white/5 text-slate-700")}>
                    {dt.icon} {docs[dt.key] > 0 ? docs[dt.key] : ""}
                </span>
            ))}
        </div>
    );
}

//  SocietaBlock 
function SocietaBlock({ societa, files, setFiles }: { societa: string; files: FilesMap; setFiles: (u: (p: FilesMap) => FilesMap) => void }) {
    const color = SOC_ACCENT[societa];
    const totalFiles = Object.values(files).reduce((a, b) => a + b.length, 0);
    const mandatoryFilled = (["cassa", "pos"] as DocKey[]).filter(k => files[k].length > 0).length;
    const progressPct = (mandatoryFilled / 2) * 100;

    const handleFile = (key: DocKey) => {
        const name = FAKE_NAMES[Math.floor(Math.random() * FAKE_NAMES.length)];
        const size = Math.floor(Math.random() * 900 + 100) + "KB";
        setFiles(prev => { const c = { ...prev, [key]: [...prev[key], { name, size }] }; return c; });
    };
    const removeFile = (key: DocKey, i: number) => {
        setFiles(prev => { const c = { ...prev, [key]: prev[key].filter((_, j) => j !== i) }; return c; });
    };

    return (
        <div className="rounded-2xl border-2 overflow-hidden" style={{ borderColor: color + "60" }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ background: color + "10", borderBottom: `1px solid ${color}30` }}>
                <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full" style={{ background: color }} />
                    <span className="text-sm font-bold text-white">{societa}</span>
                </div>
                <span className="text-xs font-semibold text-slate-400">{mandatoryFilled}/2 obbl.  {totalFiles} file</span>
            </div>
            <div className="px-4 pt-3">
                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progressPct}%`, background: mandatoryFilled === 2 ? "#22c55e" : color }} />
                </div>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                {DOC_TYPES.map(dt => (
                    <div key={dt.key} className={cn("rounded-xl border p-3 transition-all", files[dt.key].length > 0 ? "bg-white/[0.04] border-white/15" : "bg-white/[0.01] border-white/5")}>
                        <div className="flex items-start gap-2 mb-2">
                            <span className="text-lg">{dt.icon}</span>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-xs font-bold text-slate-200">{dt.label}</span>
                                    {dt.required && <span className="text-[9px] font-bold text-red-400 bg-red-500/10 border border-red-500/30 rounded px-1 uppercase">Obbl.</span>}
                                </div>
                                <div className="text-[10px] text-slate-600 mt-0.5 hidden sm:block">{dt.desc}</div>
                            </div>
                            {files[dt.key].length > 0 && (
                                <span className="text-[11px] font-bold text-white rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0" style={{ background: color }}>{files[dt.key].length}</span>
                            )}
                        </div>
                        {files[dt.key].map((f, i) => (
                            <div key={i} className="flex items-center gap-2 bg-black/30 rounded-lg px-2 py-1 mb-1">
                                <span className="text-[10px] text-slate-500"></span>
                                <span className="text-[11px] text-slate-300 flex-1 truncate font-medium">{f.name}</span>
                                <button onClick={() => removeFile(dt.key, i)} className="text-red-400 hover:text-red-300 text-xs ml-1"></button>
                            </div>
                        ))}
                        <button onClick={() => handleFile(dt.key)} className="mt-1.5 w-full py-1.5 rounded-lg border border-dashed border-white/10 text-xs text-slate-500 font-semibold hover:border-white/20 hover:text-slate-300 transition-all">
                            + Allega
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

//  VistaInvio 
function VistaInvio({ onClose }: { onClose: () => void }) {
    type SocState = { active: boolean; files: FilesMap; note: string };
    const initState = (): Record<string, SocState> => {
        const s: Record<string, SocState> = {};
        SOCIETA.forEach(soc => { s[soc] = { active: false, files: emptyDocs(), note: "" }; });
        return s;
    };
    const [state, setState] = useState(initState);
    const [sent, setSent] = useState(false);
    const today = new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });

    const toggleSocieta = (soc: string) => {
        setState(prev => {
            const next = { ...prev, [soc]: { ...prev[soc], active: !prev[soc].active } };
            if (!next[soc].active) { next[soc].files = emptyDocs(); next[soc].note = ""; }
            return next;
        });
    };
    const setFilesFor = (soc: string) => (updater: (p: FilesMap) => FilesMap) => {
        setState(prev => ({ ...prev, [soc]: { ...prev[soc], files: updater(prev[soc].files) } }));
    };
    const setNoteFor = (soc: string, val: string) => setState(prev => ({ ...prev, [soc]: { ...prev[soc], note: val } }));

    const activeSoc = SOCIETA.filter(s => state[s].active);
    const totalAllFiles = activeSoc.reduce((sum, s) => sum + Object.values(state[s].files).reduce((a, b) => a + b.length, 0), 0);

    const validate = (): string | null => {
        for (const soc of activeSoc) {
            const f = state[soc].files;
            if (f.cassa.length === 0) return ` Chiusura Cassa obbligatoria per ${soc}`;
            if (f.pos.length === 0) return ` Chiusura POS obbligatoria per ${soc}`;
        }
        return null;
    };
    const [validErr, setValidErr] = useState<string | null>(null);
    const handleSend = () => { const err = validate(); if (err) { setValidErr(err); return; } setSent(true); };

    if (sent) return (
        <div className="fixed inset-0 z-[100] bg-[#0d1117] flex items-center justify-center">
            <div className="text-center px-8">
                <div className="text-7xl mb-6"></div>
                <h2 className="text-2xl font-bold text-white mb-2">Chiusura Inviata</h2>
                <p className="text-slate-400 mb-1">{totalAllFiles} documenti inviati per il {today}</p>
                <p className="text-slate-600 text-sm mb-8">{activeSoc.join(" + ")}</p>
                <button onClick={onClose} className="px-6 py-3 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/40 font-semibold hover:bg-blue-500/30 transition-all">
                    Torna alla Gestione
                </button>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 z-[100] bg-[#0d1117] overflow-y-auto">
            <div className="sticky top-0 bg-[#0d1117]/95 backdrop-blur-sm border-b border-white/5 px-4 sm:px-6 py-4 flex items-center justify-between z-10">
                <div className="flex items-center gap-3">
                    <button onClick={onClose} className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors">
                        <ArrowLeft size={16} />
                    </button>
                    <div>
                        <h1 className="text-base sm:text-lg font-bold text-white"> Invio Chiusura</h1>
                        <p className="text-xs text-slate-500 hidden sm:block">Seleziona la società e allega i documenti</p>
                    </div>
                </div>
                <button onClick={handleSend} disabled={totalAllFiles === 0}
                    className={cn("flex items-center gap-2 px-3 sm:px-5 py-2.5 rounded-xl text-sm font-bold transition-all",
                        totalAllFiles === 0 ? "bg-white/5 text-slate-600 cursor-not-allowed border border-white/5" : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30")}>
                    Invia {totalAllFiles > 0 ? `(${totalAllFiles})` : ""}
                </button>
            </div>

            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
                <div className="flex gap-3 flex-wrap">
                    {[["Data", today], ["Negozio", "Magliana"], ["Operatore", "Marco Rossi"]].map(([l, v]) => (
                        <div key={l} className="flex-1 min-w-28 bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2.5">
                            <div className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide mb-1">{l}</div>
                            <div className="text-sm font-bold text-white">{v}</div>
                        </div>
                    ))}
                </div>

                <div>
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Seleziona Società</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {SOCIETA.map(soc => {
                            const active = state[soc].active;
                            const col = SOC_ACCENT[soc];
                            return (
                                <button key={soc} onClick={() => toggleSocieta(soc)}
                                    className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left w-full"
                                    style={{ borderColor: active ? col : "rgba(255,255,255,0.08)", background: active ? col + "12" : "rgba(255,255,255,0.02)" }}>
                                    <div className="w-6 h-6 rounded-lg border-2 flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                                        style={{ borderColor: active ? col : "rgba(255,255,255,0.15)", background: active ? col : "transparent" }}>
                                        {active ? "" : ""}
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold" style={{ color: active ? col : "#94a3b8" }}>{soc}</div>
                                        <div className="text-[11px] text-slate-600">{active ? "Chiusura attiva" : "Clicca per attivare"}</div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {activeSoc.length === 0 && (
                    <div className="text-center py-12 text-slate-600">
                        <div className="text-5xl mb-3"></div>
                        <div className="text-sm font-semibold">Seleziona almeno una società per iniziare</div>
                    </div>
                )}

                {validErr && <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold">{validErr}</div>}

                {activeSoc.map(soc => (
                    <div key={soc} className="space-y-3">
                        <SocietaBlock societa={soc} files={state[soc].files} setFiles={setFilesFor(soc)} />
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Note {soc} (opzionale)</label>
                            <textarea value={state[soc].note} onChange={e => setNoteFor(soc, e.target.value)} rows={2}
                                placeholder={`Segnalazioni per ${soc}...`}
                                className="w-full bg-white/[0.02] border border-white/5 rounded-xl px-3 py-2 text-sm text-slate-300 outline-none focus:border-white/15 resize-none transition-all" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

//  VistaFatture 
function VistaFatture({ onClose, history }: { onClose: () => void; history: Chiusura[] }) {
    const [fatture, setFatture] = useState<Fattura[]>(() => buildFatture(history));
    const [tab, setTab] = useState<"da_emettere" | "emesse">("da_emettere");
    const [fStore, setFStore] = useState("");
    const [fSoc, setFSoc] = useState("");
    const [fDateA, setFDateA] = useState("");
    const [fDateB, setFDateB] = useState("");

    const toggleEmessa = (id: number) => setFatture(prev => prev.map(f => f.id === id ? { ...f, emessa: !f.emessa } : f));
    const countDa = fatture.filter(f => !f.emessa).length;
    const countEm = fatture.filter(f => f.emessa).length;
    const shown = fatture.filter(f => {
        if (tab === "da_emettere" && f.emessa) return false;
        if (tab === "emesse" && !f.emessa) return false;
        if (fStore && f.store !== fStore) return false;
        if (fSoc && f.societa !== fSoc) return false;
        if (fDateA && f.date < fDateA) return false;
        if (fDateB && f.date > fDateB) return false;
        return true;
    });
    const hasFilters = !!(fStore || fSoc || fDateA || fDateB);
    const resetF = () => { setFStore(""); setFSoc(""); setFDateA(""); setFDateB(""); };
    const sel = "bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-300 outline-none w-full";

    return (
        <div className="fixed inset-0 z-[100] bg-[#0d1117] overflow-y-auto">
            <div className="sticky top-0 bg-purple-600/10 backdrop-blur-sm border-b border-purple-500/20 px-4 sm:px-6 py-4 flex items-center gap-3 z-10">
                <button onClick={onClose} className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors">
                    <ArrowLeft size={16} />
                </button>
                <div>
                    <h1 className="text-base sm:text-lg font-bold text-white"> Gestione Fatture</h1>
                    <p className="text-xs text-slate-500 hidden sm:block">Fatture ricevute dalle chiusure negozio</p>
                </div>
            </div>

            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">
                {/* Tabs */}
                <div className="flex gap-3">
                    {[
                        { key: "da_emettere" as const, label: "Da Emettere", count: countDa, active: "text-amber-400 bg-amber-500/10 border-amber-500/40" },
                        { key: "emesse" as const, label: "Emesse", count: countEm, active: "text-emerald-400 bg-emerald-500/10 border-emerald-500/40" },
                    ].map(t => (
                        <button key={t.key} onClick={() => setTab(t.key)}
                            className={cn("flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 font-bold text-sm transition-all", tab === t.key ? t.active : "bg-white/[0.02] border-white/5 text-slate-400 hover:border-white/10")}>
                            {t.label} <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", tab === t.key ? "" : "bg-white/5 text-slate-500")}>{t.count}</span>
                        </button>
                    ))}
                </div>

                {/* Filters */}
                <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 items-center">
                    <select value={fStore} onChange={e => setFStore(e.target.value)} className={sel}>
                        <option value="">Tutti i negozi</option>
                        {NEGOZI.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <select value={fSoc} onChange={e => setFSoc(e.target.value)} className={sel}>
                        <option value="">Tutte le società</option>
                        {SOCIETA.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <input type="date" value={fDateA} onChange={e => setFDateA(e.target.value)} className={sel} />
                    <input type="date" value={fDateB} onChange={e => setFDateB(e.target.value)} className={sel} />
                    {hasFilters && (
                        <button onClick={resetF} className="col-span-2 sm:col-span-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/5 border border-red-500/20 text-red-400 text-xs font-semibold hover:bg-red-500/10">
                            <RotateCcw size={12} /> Reset
                        </button>
                    )}
                    <span className="col-span-2 sm:col-span-1 sm:ml-auto text-xs text-slate-600 text-right">{shown.length} fatture</span>
                </div>

                {/*  Mobile card list (< sm)  */}
                <div className="sm:hidden space-y-3">
                    {shown.length === 0 ? (
                        <div className="py-12 text-center text-slate-600 text-sm">Nessuna fattura trovata</div>
                    ) : shown.map(f => (
                        <div key={f.id} className="bg-white/[0.03] border border-white/5 rounded-xl p-4 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                                <span className="text-sm font-semibold text-slate-200 break-all leading-snug"> {f.filename}</span>
                                {f.emessa
                                    ? <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">Emessa</span>
                                    : <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0">Da Emettere</span>
                                }
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-slate-500">{f.store}</span>
                                <SocBadge name={f.societa} />
                                <span className="text-xs text-slate-600">{f.date}</span>
                            </div>
                            <div className="flex gap-2 pt-1">
                                <button className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg bg-white/5 text-blue-400 border border-white/10 text-xs font-semibold">
                                    <Eye size={11} /> Apri
                                </button>
                                <button className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg bg-white/5 text-slate-400 border border-white/10 text-xs font-semibold">
                                    <Download size={11} /> PDF
                                </button>
                                <button onClick={() => toggleEmessa(f.id)}
                                    className={cn("flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-bold", f.emessa ? "bg-amber-500/10 text-amber-400 border border-amber-500/30" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30")}>
                                    {f.emessa ? " Riapri" : " Emessa"}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                {/*  Desktop table ( sm)  */}
                <div className="hidden sm:block rounded-xl border border-white/5 overflow-hidden">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr>
                                {["File", "Negozio", "Società", "Data", "Operatore", "Stato", "Azioni"].map(h => (
                                    <th key={h} className="px-4 py-3 text-left text-[11px] text-slate-500 uppercase font-semibold tracking-wide border-b border-white/5 bg-[#161b22] whitespace-nowrap">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {shown.length === 0 ? (
                                <tr><td colSpan={7} className="py-16 text-center text-slate-600 text-sm">
                                    <div className="text-3xl mb-2"></div>
                                    Nessuna fattura {tab === "da_emettere" ? "da emettere" : "emessa"} con i filtri selezionati
                                </td></tr>
                            ) : shown.map(f => (
                                <tr key={f.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                                    <td className="px-4 py-3"><div className="flex items-center gap-2"><span className="text-red-400"></span><span className="text-sm font-semibold text-slate-200 truncate max-w-[180px]">{f.filename}</span></div></td>
                                    <td className="px-4 py-3 text-sm text-slate-400 whitespace-nowrap">{f.store}</td>
                                    <td className="px-4 py-3"><SocBadge name={f.societa} /></td>
                                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">{f.date}</td>
                                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">{f.user}</td>
                                    <td className="px-4 py-3">
                                        {f.emessa
                                            ? <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">Emessa</span>
                                            : <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">Da Emettere</span>
                                        }
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-1.5">
                                            <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 text-blue-400 border border-white/10 text-xs font-semibold hover:bg-white/10"><Eye size={11} /> Apri</button>
                                            <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 text-slate-400 border border-white/10 text-xs font-semibold hover:bg-white/10"><Download size={11} /> PDF</button>
                                            <button onClick={() => toggleEmessa(f.id)}
                                                className={cn("flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold", f.emessa ? "bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20")}>
                                                {f.emessa ? " Riapri" : " Segna Emessa"}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

//  VistaGestione 
function VistaGestione({ isAdmin, userStore, history }: { isAdmin: boolean; userStore: string; history: Chiusura[] }) {
    const [fStore, setFStore] = useState("");
    const [fSoc, setFSoc] = useState("");
    const [fDateA, setFDateA] = useState("");
    const [fDateB, setFDateB] = useState("");
    const [expanded, setExpanded] = useState<number | null>(null);

    const baseData = isAdmin ? history : history.filter(r => r.store === userStore);
    const filtered = useMemo(() => baseData.filter(r => {
        if (fStore && r.store !== fStore) return false;
        if (fSoc && r.societa !== fSoc) return false;
        if (fDateA && r.date < fDateA) return false;
        if (fDateB && r.date > fDateB) return false;
        return true;
    }), [baseData, fStore, fSoc, fDateA, fDateB]);

    const today = new Date().toISOString().split("T")[0];
    const todayRows = baseData.filter(r => r.date === today || r.date === "2026-03-11");
    const storesWithClosures = new Set(todayRows.map(r => r.store));
    const missingCount = NEGOZI.length - storesWithClosures.size;
    const hasFilters = !!(fStore || fSoc || fDateA || fDateB);
    const reset = () => { setFStore(""); setFSoc(""); setFDateA(""); setFDateB(""); };
    const sel = "bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-300 outline-none w-full sm:w-auto";
    const thCls = "px-4 py-3 text-left text-[11px] text-slate-500 uppercase font-semibold tracking-wide border-b border-white/5 bg-[#161b22] whitespace-nowrap";

    return (
        <div className="space-y-5">
            {/* KPI strip */}
            <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
                    <div className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide mb-1"> Chiusure Oggi</div>
                    <div className="text-3xl font-bold text-blue-400">{todayRows.length}</div>
                </div>
                {isAdmin && (
                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                        <div className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide mb-1"> Mancanti</div>
                        <div className="text-3xl font-bold text-red-400">{missingCount}</div>
                    </div>
                )}
            </div>

            {!isAdmin && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-blue-500/5 border border-blue-500/20 text-sm text-blue-300">
                    Solo le chiusure di <strong className="ml-1">{userStore}</strong>
                </div>
            )}

            {/* Filters */}
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 items-center">
                {isAdmin && (
                    <select value={fStore} onChange={e => setFStore(e.target.value)} className={sel}>
                        <option value="">Tutti i negozi</option>
                        {NEGOZI.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                )}
                <select value={fSoc} onChange={e => setFSoc(e.target.value)} className={sel}>
                    <option value="">Tutte le società</option>
                    {SOCIETA.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <input type="date" value={fDateA} onChange={e => setFDateA(e.target.value)} className={sel} />
                <input type="date" value={fDateB} onChange={e => setFDateB(e.target.value)} className={sel} />
                {hasFilters && (
                    <button onClick={reset} className="col-span-2 sm:col-span-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/5 border border-red-500/20 text-red-400 text-xs font-semibold hover:bg-red-500/10">
                        <RotateCcw size={12} /> Reset
                    </button>
                )}
                <span className="col-span-2 sm:col-span-1 sm:ml-auto text-xs text-slate-600 text-right">{filtered.length} risultati</span>
            </div>

            {/*  Mobile card list (< sm)  */}
            <div className="sm:hidden space-y-3">
                {filtered.length === 0 ? (
                    <div className="py-12 text-center text-slate-600 text-sm">Nessuna chiusura trovata</div>
                ) : filtered.map(r => (
                    <div key={r.id} className="bg-white/[0.03] border border-white/5 rounded-xl p-4 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-slate-200">{r.date}</span>
                                <span className="text-xs text-slate-600">{r.time}</span>
                            </div>
                            <SocBadge name={r.societa} />
                        </div>
                        {isAdmin && <div className="text-sm text-slate-400 font-medium">{r.store}  <span className="text-slate-500">{r.user}</span></div>}
                        <DocMiniRow docs={r.docs} />
                        {isAdmin && (
                            <button onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                                className="w-full mt-1 py-1.5 rounded-lg bg-white/[0.03] border border-white/5 text-xs text-slate-500 font-semibold">
                                {expanded === r.id ? " Nascondi allegati" : " Vedi allegati"}
                            </button>
                        )}
                        {expanded === r.id && (
                            <div className="pt-2 space-y-2">
                                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Allegati</div>
                                {DOC_TYPES.map(dt => {
                                    const atts = r.attachments.filter(a => a.cat === dt.key);
                                    if (atts.length === 0) return null;
                                    return (
                                        <div key={dt.key} className="rounded-xl bg-white/[0.02] border border-white/5 p-3">
                                            <div className="flex items-center gap-1.5 mb-1.5">
                                                <span className="text-sm">{dt.icon}</span>
                                                <span className="text-xs font-bold text-slate-400">{dt.label}</span>
                                                <span className="ml-auto text-[10px] text-slate-600">{atts.length}</span>
                                            </div>
                                            {atts.map((att, i) => (
                                                <div key={i} className="flex items-center gap-2 bg-black/20 rounded-lg px-2 py-1 mb-1">
                                                    <span className="text-blue-400 text-xs"></span>
                                                    <span className="text-[11px] text-slate-300 flex-1 truncate">{att.name}</span>
                                                    <button className="text-[10px] text-blue-400 font-semibold"></button>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/*  Desktop table ( sm)  */}
            <div className="hidden sm:block rounded-xl border border-white/5 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr>
                                {(isAdmin ? ["Data", "Ora", "Negozio", "Società", "Operatore", "Cassa", "POS", "DDT W3", "DDT VF", "Fatture", ""] : ["Data", "Ora", "Società", "Cassa", "POS", "DDT W3", "DDT VF", "Fatture"]).map((h, i) => (
                                    <th key={i} className={thCls}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr><td colSpan={12} className="py-14 text-center text-slate-600 text-sm">Nessuna chiusura trovata</td></tr>
                            ) : filtered.map(r => {
                                const isExp = expanded === r.id;
                                const colSpan = isAdmin ? 11 : 8;
                                return [
                                    <tr key={r.id} onClick={() => { if (isAdmin) setExpanded(isExp ? null : r.id); }}
                                        className={cn("border-b border-white/[0.03] transition-colors", isAdmin ? "cursor-pointer hover:bg-white/[0.03]" : "", isExp ? "bg-white/[0.04]" : "")}>
                                        <td className="px-4 py-3 text-sm font-semibold text-slate-200 whitespace-nowrap">{r.date}</td>
                                        <td className="px-4 py-3 text-sm text-slate-500">{r.time}</td>
                                        {isAdmin && <td className="px-4 py-3 text-sm font-medium text-slate-300 whitespace-nowrap">{r.store}</td>}
                                        <td className="px-4 py-3"><SocBadge name={r.societa} /></td>
                                        {isAdmin && <td className="px-4 py-3 text-sm text-slate-400 whitespace-nowrap">{r.user}</td>}
                                        {(["cassa", "pos", "ddt_w3", "ddt_vf", "fatture"] as DocKey[]).map(k => (
                                            <td key={k} className="px-4 py-3 text-center"><DocBadge count={r.docs[k]} /></td>
                                        ))}
                                        {isAdmin && <td className="px-4 py-3 text-slate-600 text-sm text-center">{isExp ? "" : ""}</td>}
                                    </tr>,
                                    isExp ? (
                                        <tr key={`exp-${r.id}`}>
                                            <td colSpan={colSpan} className="p-0">
                                                <div className="px-6 py-4 bg-black/20 border-t border-white/5">
                                                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3">
                                                        Allegati  {r.store}  {r.societa}  {r.date}
                                                    </div>
                                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                                                        {DOC_TYPES.map(dt => {
                                                            const atts = r.attachments.filter(a => a.cat === dt.key);
                                                            return (
                                                                <div key={dt.key} className="rounded-xl bg-white/[0.03] border border-white/5 p-3">
                                                                    <div className="flex items-center gap-1.5 mb-2">
                                                                        <span className="text-sm">{dt.icon}</span>
                                                                        <span className="text-xs font-bold text-slate-400">{dt.label}</span>
                                                                        <span className="ml-auto text-[10px] text-slate-600">{atts.length}</span>
                                                                    </div>
                                                                    {atts.length === 0 ? (
                                                                        <div className="text-[11px] text-slate-700 italic">Nessun allegato</div>
                                                                    ) : atts.map((att, i) => (
                                                                        <div key={i} className="flex items-center gap-2 bg-black/20 rounded-lg px-2 py-1 mb-1">
                                                                            <span className="text-blue-400 text-xs"></span>
                                                                            <span className="text-[11px] text-slate-300 flex-1 truncate">{att.name}</span>
                                                                            <button className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 font-semibold"><Download size={10} /></button>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : null
                                ];
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

//  Main Page 
export default function ChiusuraNegozio() {
    const { user } = useAuth();
    const isAdmin = user?.role === "admin";
    const userStore = "Magliana";
    const [history] = useState<Chiusura[]>(MOCK_HISTORY);
    const [view, setView] = usePageView<{ overlay: "invio" | "fatture" | null }>("chiusura", { overlay: null });
    const overlay = view.overlay;
    const setOverlay = (v: "invio" | "fatture" | null) => setView((prev) => ({ ...prev, overlay: v }));

    return (
        <div className="-m-4 sm:-m-6 md:-m-8 bg-[#0d1117] text-white" style={{ overflowX: "hidden" }}>
            <div className="sticky top-0 z-30 bg-[#0d1117]/95 backdrop-blur-sm border-b border-white/5">
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4">
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold text-white"> Chiusura Negozio</h1>
                        <p className="text-xs text-slate-500 mt-0.5 hidden sm:block">Gestione documentazione chiusura giornaliera</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {isAdmin && (
                            <button onClick={() => setOverlay("fatture")}
                                className="flex items-center gap-1.5 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-purple-500/15 text-purple-300 border border-purple-500/30 text-sm font-semibold hover:bg-purple-500/25 transition-all">
                                <span className="hidden sm:inline">Fatture</span>
                            </button>
                        )}
                        <button onClick={() => setOverlay("invio")}
                            className="flex items-center gap-1.5 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-blue-500/20 text-blue-300 border border-blue-500/40 text-sm font-semibold hover:bg-blue-500/30 transition-all">
                            <span className="hidden sm:inline">Invio e</span> Chiusura
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
                <VistaGestione isAdmin={isAdmin} userStore={userStore} history={history} />
            </div>

            {overlay === "invio" && <VistaInvio onClose={() => setOverlay(null)} />}
            {overlay === "fatture" && <VistaFatture onClose={() => setOverlay(null)} history={history} />}
        </div>
    );
}