"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, Paperclip, Trash2, ExternalLink, Upload } from "lucide-react";
import { notify, dbError } from "./toast";
import { MoneyInput } from "./money";

/* ------------------------------------------------------------------ */
/* Spese fisse del negozio: 6 voci standard SEMPRE presenti            */
/* ------------------------------------------------------------------ */
export const FIXED_VOCI = ["Affitto", "Assicurazione", "Utenze", "Allarme", "TARI", "Tassa insegna"];

interface FixedItem {
    id: string;
    label: string;
    amount_azienda: number | null;
    amount_visibile: number | null;
}

export function FixedStoreCosts({ storeId, month, onTotals }: { storeId: string; month: string; onTotals?: (a: number, v: number) => void }) {
    const [rows, setRows] = useState<FixedItem[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from("store_cost_items")
            .select("id,label,amount_azienda,amount_visibile")
            .eq("store_id", storeId)
            .eq("month", month)
            .eq("is_fixed", true);
        if (dbError("Caricamento spese fisse", error)) {
            setLoading(false);
            return;
        }
        let list = (data as FixedItem[]) || [];
        // auto-riparazione: se al negozio mancano voci fisse per questo mese, le creo
        const missing = FIXED_VOCI.filter((l) => !list.some((r) => r.label === l));
        if (missing.length) {
            const { error: e2 } = await supabase
                .from("store_cost_items")
                .insert(missing.map((label) => ({ store_id: storeId, label, amount_azienda: 0, amount_visibile: 0, is_fixed: true, month })));
            if (!e2) {
                const again = await supabase
                    .from("store_cost_items")
                    .select("id,label,amount_azienda,amount_visibile")
                    .eq("store_id", storeId)
                    .eq("month", month)
                    .eq("is_fixed", true);
                list = (again.data as FixedItem[]) || list;
            }
        }
        list.sort((a, b) => FIXED_VOCI.indexOf(a.label) - FIXED_VOCI.indexOf(b.label));
        setRows(list);
        setLoading(false);
    }, [storeId, month]);
    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        if (!onTotals) return;
        onTotals(
            rows.reduce((s, r) => s + (Number(r.amount_azienda) || 0), 0),
            rows.reduce((s, r) => s + (Number(r.amount_visibile) || 0), 0),
        );
    }, [rows, onTotals]);

    const upd = (id: string, field: "amount_azienda" | "amount_visibile", value: number | null) =>
        setRows((p) => p.map((r) => (r.id === id ? { ...r, [field]: value ?? 0 } : r)));
    const save = async (r: FixedItem) => {
        const { error } = await supabase
            .from("store_cost_items")
            .update({ amount_azienda: r.amount_azienda || 0, amount_visibile: r.amount_visibile || 0 })
            .eq("id", r.id);
        dbError("Salvataggio spesa fissa", error);
    };

    if (loading)
        return (
            <div className="flex justify-center py-6 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin" />
            </div>
        );

    return (
        <div className="space-y-1.5">
            {rows.map((r) => (
                <div key={r.id} className="glass-card p-2.5 rounded-lg flex items-center gap-2">
                    <span className="flex-1 text-sm text-slate-200">{r.label}</span>
                    <MoneyInput value={r.amount_azienda} onChange={(v) => upd(r.id, "amount_azienda", v)} onCommit={() => save(r)} wrapClass="w-28" className="py-1 text-sm" title="Azienda" />
                    <MoneyInput value={r.amount_visibile} onChange={(v) => upd(r.id, "amount_visibile", v)} onCommit={() => save(r)} wrapClass="w-28" className="py-1 text-sm" title="Visibile" />
                </div>
            ))}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Allegati del negozio, sempre con un nome                            */
/* ------------------------------------------------------------------ */
const STORE_BUCKET = "store-attachments";

interface StoreAtt {
    id: string;
    name: string;
    storage_path: string;
    created_at: string;
}

export function StoreAttachments({ storeId }: { storeId: string }) {
    const [rows, setRows] = useState<StoreAtt[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [name, setName] = useState("");
    const [confirmDel, setConfirmDel] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const load = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from("store_attachments")
            .select("id,name,storage_path,created_at")
            .eq("store_id", storeId)
            .order("created_at", { ascending: false });
        if (!dbError("Caricamento allegati", error)) setRows((data as StoreAtt[]) || []);
        setLoading(false);
    }, [storeId]);
    useEffect(() => {
        load();
    }, [load]);

    const upload = async (file: File) => {
        const attName = name.trim() || file.name.replace(/\.[^.]+$/, "");
        setUploading(true);
        const path = `${storeId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const up = await supabase.storage.from(STORE_BUCKET).upload(path, file);
        if (up.error) {
            notify(`Upload fallito: ${up.error.message}`);
            setUploading(false);
            return;
        }
        const { error } = await supabase.from("store_attachments").insert({ store_id: storeId, name: attName, storage_path: path });
        if (!dbError("Registrazione allegato", error)) {
            notify(`Allegato "${attName}" caricato ✓`, "ok");
            setName("");
        }
        setUploading(false);
        load();
    };

    const open = (a: StoreAtt) => {
        const { data } = supabase.storage.from(STORE_BUCKET).getPublicUrl(a.storage_path);
        if (data?.publicUrl) window.open(data.publicUrl, "_blank");
    };

    const del = async (a: StoreAtt) => {
        if (a.storage_path) await supabase.storage.from(STORE_BUCKET).remove([a.storage_path]);
        const { error } = await supabase.from("store_attachments").delete().eq("id", a.id);
        if (!dbError("Eliminazione allegato", error)) notify("Allegato eliminato", "ok");
        setConfirmDel(null);
        load();
    };

    return (
        <div className="space-y-3">
            {/* Upload */}
            <div className="glass-card p-3 rounded-xl flex flex-wrap items-center gap-2">
                <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nome allegato (es. Contratto affitto)"
                    className="glass-input flex-1 min-w-[180px] py-1.5 text-sm"
                />
                <input
                    ref={fileRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) upload(file);
                        e.target.value = "";
                    }}
                />
                <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="primary-btn text-sm px-3 py-1.5 flex items-center gap-1.5"
                >
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Carica file
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center py-8 text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin" />
                </div>
            ) : (
                <div className="space-y-1.5">
                    {rows.map((a) => (
                        <div key={a.id} className="glass-card p-2.5 rounded-lg flex items-center gap-2">
                            <Paperclip className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                            <button onClick={() => open(a)} className="flex-1 min-w-0 text-left">
                                <span className="block text-sm text-slate-200 truncate">{a.name}</span>
                                <span className="block text-[10px] text-slate-500">{new Date(a.created_at).toLocaleDateString("it-IT")}</span>
                            </button>
                            <button onClick={() => open(a)} className="text-slate-500 hover:text-slate-200 p-1" title="Apri">
                                <ExternalLink className="w-4 h-4" />
                            </button>
                            {confirmDel === a.id ? (
                                <span className="flex items-center gap-1">
                                    <button onClick={() => del(a)} className="text-[10px] px-2 py-1 rounded bg-rose-500/20 text-rose-300">Elimina</button>
                                    <button onClick={() => setConfirmDel(null)} className="text-[10px] text-slate-500 px-1">Annulla</button>
                                </span>
                            ) : (
                                <button onClick={() => setConfirmDel(a.id)} className="text-slate-500 hover:text-rose-400 p-1" title="Elimina">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    ))}
                    {!rows.length && <p className="text-xs text-slate-600 px-1">Nessun allegato. Dai un nome e carica un file.</p>}
                </div>
            )}
        </div>
    );
}

/* ── ORARI & CHIUSURE (03/08, mig. 146) — pannello dedicato: orari di
   apertura/chiusura dei punti vendita (prima si toccavano dalla sezione
   Turni: spostati qui) e CHIUSURE STRAORDINARIE (es. chiusura estiva,
   dal → al con motivo). La sezione Turni legge tutto da qui. ── */
type ChiusuraRow = { id: number; store: string; dal: string; al: string; motivo: string };
// pausa/is_ufficio opzionali = mig. 158/159: il fallback pre-migrazione
// carica solo le colonne storiche
type NegozioOrariRow = { name: string; orario_apertura: string | null; orario_chiusura: string | null; orario_pausa_inizio?: string | null; orario_pausa_fine?: string | null; is_ufficio?: boolean | null };
type CampoOrario = "orario_apertura" | "orario_chiusura" | "orario_pausa_inizio" | "orario_pausa_fine";
export function OrariChiusureView() {
    const [negozi, setNegozi] = useState<NegozioOrariRow[]>([]);
    const [chiusure, setChiusure] = useState<ChiusuraRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [nuova, setNuova] = useState<Record<string, { dal: string; al: string; motivo: string }>>({});
    // toggle "spezzato" per negozio: acceso a mano oppure dedotto dalla pausa a DB
    const [spezzatoUi, setSpezzatoUi] = useState<Record<string, boolean>>({});
    const carica = useCallback(async () => {
        const [st0, ch] = await Promise.all([
            supabase.from("stores").select("name, orario_apertura, orario_chiusura, orario_pausa_inizio, orario_pausa_fine, is_ufficio").order("name"),
            supabase.from("chiusure_negozio").select("id, store, dal, al, motivo").order("dal"),
        ]);
        // mig. 158/159 non ancora applicate: si ripiega sulle colonne storiche
        const st = st0.error
            ? await supabase.from("stores").select("name, orario_apertura, orario_chiusura").order("name")
            : st0;
        // gli UFFICI (mig. 159) non hanno orari da amministrare: fuori dal pannello
        setNegozi(((st.data ?? []) as NegozioOrariRow[]).filter(n => !n.is_ufficio));
        setChiusure((ch.data ?? []) as ChiusuraRow[]);
        setLoading(false);
    }, []);
    useEffect(() => { carica(); }, [carica]);
    const hhmm = (t: string | null | undefined, fb: string) => (t || fb).slice(0, 5);
    const salvaOrario = async (store: string, campo: CampoOrario, val: string) => {
        if (!val) return;
        // validazione orario spezzato: apertura < pausa_inizio < pausa_fine < chiusura
        const n = negozi.find(x => x.name === store);
        if (n) {
            const cand = {
                orario_apertura: hhmm(n.orario_apertura, "09:30"),
                orario_chiusura: hhmm(n.orario_chiusura, "19:30"),
                orario_pausa_inizio: n.orario_pausa_inizio ? hhmm(n.orario_pausa_inizio, "") : "",
                orario_pausa_fine: n.orario_pausa_fine ? hhmm(n.orario_pausa_fine, "") : "",
                [campo]: val,
            } as Record<CampoOrario, string>;
            // in chiave TURNI (Luca 06/08): ap=inizio 1° turno, pi=fine 1° turno,
            // pf=inizio 2° turno, ch=fine (2° turno se c'è, sennò del 1°)
            const { orario_apertura: ap, orario_chiusura: ch, orario_pausa_inizio: pi, orario_pausa_fine: pf } = cand;
            if (ch <= ap) { notify("La fine dell'orario è prima dell'inizio"); return; }
            if ((pi && (pi <= ap || pi >= ch)) || (pf && (pf <= ap || pf >= ch))) { notify("I due turni devono stare dentro la giornata (il 2° finisce con l'orario di chiusura)"); return; }
            if (pi && pf && pf <= pi) { notify("Il 2° turno deve iniziare dopo la fine del 1°"); return; }
        }
        const { error } = await supabase.from("stores").update({ [campo]: val }).eq("name", store);
        if (dbError("Orario negozio", error)) return;
        setNegozi(p => p.map(x => x.name === store ? { ...x, [campo]: val } : x));
    };
    // ritorno all'orario CONTINUATO: pausa azzerata a DB (null/null)
    const rimuoviPausa = async (store: string) => {
        const { error } = await supabase.from("stores").update({ orario_pausa_inizio: null, orario_pausa_fine: null }).eq("name", store);
        if (dbError("Orario negozio", error)) return;
        setNegozi(p => p.map(x => x.name === store ? { ...x, orario_pausa_inizio: null, orario_pausa_fine: null } : x));
        setSpezzatoUi(p => ({ ...p, [store]: false }));
    };
    const aggiungiChiusura = async (store: string) => {
        const f = nuova[store];
        if (!f?.dal || !f?.al) { notify("Servono le date dal → al"); return; }
        if (f.al < f.dal) { notify("La fine è prima dell'inizio"); return; }
        const { error } = await supabase.from("chiusure_negozio").insert({ store, dal: f.dal, al: f.al, motivo: (f.motivo || "").trim() });
        if (dbError("Chiusura straordinaria", error)) return;
        setNuova(p => ({ ...p, [store]: { dal: "", al: "", motivo: "" } }));
        notify("Chiusura registrata ✓", "ok");
        carica();
    };
    const eliminaChiusura = async (c: ChiusuraRow) => {
        if (!window.confirm(`Togliere la chiusura ${c.dal.split("-").reverse().join("/")} → ${c.al.split("-").reverse().join("/")}${c.motivo ? ` (${c.motivo})` : ""}?`)) return;
        await supabase.from("chiusure_negozio").delete().eq("id", c.id);
        carica();
    };
    const gg = (x: string) => x.split("-").reverse().join("/");
    if (loading) return <div className="flex justify-center py-16 text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>;
    return (
        <div className="space-y-3">
            <p className="text-xs text-slate-500 max-w-2xl">
                Per ogni negozio imposti i <b className="text-slate-300">turni di apertura</b>: un turno unico
                (es. 09:30–19:30) oppure <b className="text-amber-300">due turni</b> (es. 09:00–13:00 e 16:00–20:00)
                — è l&apos;orario in cui il negozio è APERTO, senza ragionare di pause. La sezione Turni segue le fasce;
                le <b className="text-rose-300">chiusure straordinarie</b> (ferie estive, lavori…) chiudono il punto
                vendita nel periodo indicato: la sezione Turni lo mostra 🔒 e blocca le assegnazioni.
            </p>
            {negozi.map(n => {
                const mie = chiusure.filter(c => c.store === n.name);
                const f = nuova[n.name] || { dal: "", al: "", motivo: "" };
                const setF = (patch: Partial<typeof f>) => setNuova(p => ({ ...p, [n.name]: { ...f, ...patch } }));
                // orario SPEZZATO (mig. 158): il toggle mostra i due campi
                // pausa; pausa a null/null = continuato (come oggi)
                const spezzato = spezzatoUi[n.name] ?? !!(n.orario_pausa_inizio && n.orario_pausa_fine);
                return (
                    <div key={n.name} className="glass-card p-4 flex items-start gap-4 flex-wrap">
                        {/* TURNI, non pause (Luca 06/08): imposti gli orari in cui il
                            negozio è APERTO — turno unico o due turni. A DB non cambia
                            nulla: 1° turno = apertura→pausa_inizio, 2° = pausa_fine→
                            chiusura (la sezione Turni continua a leggere le stesse
                            colonne). */}
                        <div className="w-52 shrink-0">
                            <p className="text-sm font-bold text-white">🏬 {n.name}</p>
                            <div className="flex items-center gap-1 mt-1.5 text-[11px] text-slate-400"
                                title={spezzato ? "1° turno di apertura" : "Orario di apertura (turno unico)"}>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 w-8 shrink-0">{spezzato ? "1°" : "🕐"}</span>
                                <input type="time" value={hhmm(n.orario_apertura, "09:30")} onChange={e => salvaOrario(n.name, "orario_apertura", e.target.value)} className="glass-input !h-7 !px-1.5 text-[11px] w-[76px]" />
                                <span>–</span>
                                {spezzato ? (
                                    <input type="time" value={n.orario_pausa_inizio ? hhmm(n.orario_pausa_inizio, "") : ""} onChange={e => salvaOrario(n.name, "orario_pausa_inizio", e.target.value)} className="glass-input !h-7 !px-1.5 text-[11px] w-[76px]" />
                                ) : (
                                    <input type="time" value={hhmm(n.orario_chiusura, "19:30")} onChange={e => salvaOrario(n.name, "orario_chiusura", e.target.value)} className="glass-input !h-7 !px-1.5 text-[11px] w-[76px]" />
                                )}
                            </div>
                            {spezzato ? (
                                <div className="flex items-center gap-1 mt-1 text-[11px] text-slate-400" title="2° turno di apertura">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 w-8 shrink-0">2°</span>
                                    <input type="time" value={n.orario_pausa_fine ? hhmm(n.orario_pausa_fine, "") : ""} onChange={e => salvaOrario(n.name, "orario_pausa_fine", e.target.value)} className="glass-input !h-7 !px-1.5 text-[11px] w-[76px]" />
                                    <span>–</span>
                                    <input type="time" value={hhmm(n.orario_chiusura, "19:30")} onChange={e => salvaOrario(n.name, "orario_chiusura", e.target.value)} className="glass-input !h-7 !px-1.5 text-[11px] w-[76px]" />
                                    <button onClick={() => rimuoviPausa(n.name)} title="Torna al turno unico (il 2° turno sparisce, resta apertura → chiusura)" className="text-slate-500 hover:text-rose-400 font-bold shrink-0">✕</button>
                                </div>
                            ) : (
                                <button onClick={() => setSpezzatoUi(p => ({ ...p, [n.name]: true }))}
                                    className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-amber-300 transition-colors">
                                    ＋ Aggiungi 2° turno
                                </button>
                            )}
                        </div>
                        <div className="flex-1 min-w-[280px] space-y-1.5">
                            {mie.length === 0 && <p className="text-xs text-slate-600 italic mt-1.5">Nessuna chiusura straordinaria.</p>}
                            {mie.map(c => (
                                <span key={c.id} className="inline-flex items-center gap-2 mr-2 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/10 border border-rose-500/40 text-rose-300">
                                    🔒 {gg(c.dal)} → {gg(c.al)}{c.motivo ? ` · ${c.motivo}` : ""}
                                    <button onClick={() => eliminaChiusura(c)} className="opacity-70 hover:opacity-100">✕</button>
                                </span>
                            ))}
                            <div className="flex items-center gap-1.5 flex-wrap pt-1">
                                <input type="date" value={f.dal} onChange={e => setF({ dal: e.target.value })} className="glass-input !h-8 text-[11px]" />
                                <span className="text-slate-600 text-xs">→</span>
                                <input type="date" value={f.al} onChange={e => setF({ al: e.target.value })} className="glass-input !h-8 text-[11px]" />
                                <input value={f.motivo} onChange={e => setF({ motivo: e.target.value })} placeholder="Motivo (es. chiusura estiva)" className="glass-input !h-8 text-[11px] w-52" />
                                <button onClick={() => aggiungiChiusura(n.name)} disabled={!f.dal || !f.al}
                                    className="px-3 h-8 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold disabled:opacity-40">＋ Chiusura</button>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
