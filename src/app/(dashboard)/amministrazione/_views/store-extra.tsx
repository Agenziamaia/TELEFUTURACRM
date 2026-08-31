"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/utils";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
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
type AziendaRow = { codice: string; ragione_sociale: string; piva: string | null };
type RtRow = { negozio: string; azienda: string; is_default: boolean | null; rt_url: string | null };
type NegozioOrariRow = { name: string; address?: string | null; civico?: string | null; cap?: string | null; citta?: string | null; provincia?: string | null; azienda?: string | null; orario_apertura: string | null; orario_chiusura: string | null; orario_pausa_inizio?: string | null; orario_pausa_fine?: string | null; is_ufficio?: boolean | null; domenica_aperta?: boolean | null; sabato_apertura?: string | null; sabato_chiusura?: string | null };
type CampoOrario = "orario_apertura" | "orario_chiusura" | "orario_pausa_inizio" | "orario_pausa_fine" | "sabato_apertura" | "sabato_chiusura";
export function OrariChiusureView() {
    const { user } = useAuth();   // firma sulle chiusure (giallo del 06/08: righe senza autore)
    const [negozi, setNegozi] = useState<NegozioOrariRow[]>([]);
    const [chiusure, setChiusure] = useState<ChiusuraRow[]>([]);
    // FESTIVI qui dentro (esito Luca 12/08: «continuo a non vedere le festività
    // di agosto» — stavano solo nel pannello di Collaboratori, ora anche qui
    // dove vivono chiusure e orari; è la stessa tabella che legge il Tracking)
    const [festivi, setFestivi] = useState<{ giorno: string; nome: string }[]>([]);
    const [festiviAperti, setFestiviAperti] = useState(false);
    const [nFestivo, setNFestivo] = useState({ data: "", nome: "" });
    // toggle "sabato dedicato" per negozio (esito Luca 12/08: dev'essere un
    // flag — senza flag il sabato segue l'orario della settimana, inutile
    // mostrarne i campi vuoti)
    const [sabatoUi, setSabatoUi] = useState<Record<string, boolean>>({});
    const [loading, setLoading] = useState(true);
    const [nuova, setNuova] = useState<Record<string, { dal: string; al: string; motivo: string }>>({});
    // toggle "spezzato" per negozio: acceso a mano oppure dedotto dalla pausa a DB
    const [spezzatoUi, setSpezzatoUi] = useState<Record<string, boolean>>({});
    const [aziende, setAziende] = useState<AziendaRow[]>([]);
    const [registratori, setRegistratori] = useState<RtRow[]>([]);
    /* I BRAND CHE IL NEGOZIO TRATTA (Luca 31/08: «così abbiamo il dato
       veramente completo sul punto vendita»).
       ⚠️ NIENTE SECONDA VERITÀ: il dato vive già in `store_brand_rules`, la
       tabella che Registra Vendita legge per sapere cosa può vendere quel
       negozio e che si governa da Amministrazione → Brand × Negozio. Qui non
       si duplica: si mostra e si tocca LA STESSA riga. Senza riga vale il
       default di rete del brand (`catalog_brands.default_abilitato`), che è
       come funziona di là. */
    const [brandCat, setBrandCat] = useState<{ id: string; nome: string; colore1: string; default_abilitato?: boolean }[]>([]);
    const [brandRules, setBrandRules] = useState<{ store: string; brand: string; vede: boolean; registra: boolean }[]>([]);
    const brandEff = (store: string, b: { id: string; default_abilitato?: boolean }) => {
        const r = brandRules.find((x) => x.store === store && x.brand === b.id);
        return r ? !!r.registra : b.default_abilitato !== false;
    };
    const [brandBusy, setBrandBusy] = useState<string | null>(null);
    const toggleBrand = async (store: string, b: { id: string; default_abilitato?: boolean }) => {
        const acceso = !brandEff(store, b);
        setBrandBusy(store + "|" + b.id);
        // registrare implica vedere, come nella sezione Brand × Negozio
        const { error } = await supabase.from("store_brand_rules")
            .upsert({ store, brand: b.id, vede: acceso, registra: acceso, updated_at: new Date().toISOString() });
        setBrandBusy(null);
        if (dbError("Brand del negozio", error)) return;
        setBrandRules((p) => {
            const altri = p.filter((x) => !(x.store === store && x.brand === b.id));
            return [...altri, { store, brand: b.id, vede: acceso, registra: acceso }];
        });
    };
    const carica = useCallback(async () => {
        const [st0, ch, fs, az, rt, bc, br] = await Promise.all([
            supabase.from("stores").select("name, address, civico, cap, citta, provincia, azienda, orario_apertura, orario_chiusura, orario_pausa_inizio, orario_pausa_fine, is_ufficio, domenica_aperta, sabato_apertura, sabato_chiusura").order("name"),
            supabase.from("chiusure_negozio").select("id, store, dal, al, motivo").order("dal"),
            supabase.from("giorni_festivi").select("giorno, nome").order("giorno"),
            /* LE SOCIETÀ E I REGISTRATORI (Luca 31/08). «Il file orari e chiusure
               diventa il posto in cui deteniamo tutte le informazioni sui punti
               vendita»: la società di un negozio non è un'etichetta, è chi emette
               lo scontrino e chi possiede la merce a magazzino. Sta su `pos_rt`,
               insieme al registratore di cassa: qui la si legge e si può
               correggere, che è quello che serve per gli undici negozi in cui
               non è mai stata confermata. */
            supabase.from("aziende").select("codice, ragione_sociale, piva").order("codice"),
            supabase.from("pos_rt").select("negozio, azienda, is_default, rt_url"),
            supabase.from("catalog_brands").select("id, nome, colore1, default_abilitato").eq("attivo", true).order("nome"),
            supabase.from("store_brand_rules").select("store, brand, vede, registra"),
        ]);
        // mig. 158/159 non ancora applicate: si ripiega sulle colonne storiche
        const st = st0.error
            ? await supabase.from("stores").select("name, orario_apertura, orario_chiusura").order("name")
            : st0;
        // gli UFFICI (mig. 159) non hanno orari da amministrare: fuori dal pannello
        setNegozi(((st.data ?? []) as NegozioOrariRow[]).filter(n => !n.is_ufficio));
        setChiusure((ch.data ?? []) as ChiusuraRow[]);
        setFestivi(((fs.data ?? []) as { giorno: string; nome: string }[]));
        setAziende((az.data ?? []) as AziendaRow[]);
        setRegistratori((rt.data ?? []) as RtRow[]);
        setBrandCat(((bc?.data ?? []) as { id: string; nome: string; colore1: string; default_abilitato?: boolean }[]));
        setBrandRules(((br?.data ?? []) as { store: string; brand: string; vede: boolean; registra: boolean }[]));
        setLoading(false);
    }, []);
    useEffect(() => { carica(); }, [carica]);
    const hhmm = (t: string | null | undefined, fb: string) => (t || fb).slice(0, 5);
    // L'INDIRIZZO DEL NEGOZIO (Luca 31/08): serve ai messaggi WhatsApp ai
    // clienti, che si presentano col punto vendita e la via — «del punto
    // vendita Mazzini di via …». Finché è vuoto il segnaposto {indirizzo}
    // sparisce dal messaggio, quindi compilarlo è quello che rende i testi
    // completi. Si salva quando si esce dal campo, non a ogni lettera.
    const salvaIndirizzo = async (store: string, val: string) => {
        const v = val.trim();
        const { error } = await supabase.from("stores").update({ address: v || null }).eq("name", store);
        if (dbError("Indirizzo negozio", error)) return;
        setNegozi(p => p.map(x => x.name === store ? { ...x, address: v || null } : x));
    };

    /** Via, CAP, città, provincia: insieme fanno il LUOGO DI CONSEGNA del DDT.
     *  Si salva quando si esce dal campo, come l'indirizzo. */
    const salvaCampoNegozio = async (store: string, campo: "civico" | "cap" | "citta" | "provincia", val: string) => {
        const v = val.trim();
        const { error } = await supabase.from("stores").update({ [campo]: v || null }).eq("name", store);
        if (dbError("Dati negozio", error)) return;
        setNegozi(p => p.map(x => x.name === store ? { ...x, [campo]: v || null } : x));
    };

    /* CAMBIARE LA SOCIETÀ DI UN NEGOZIO non è cambiare un'etichetta: è dire
       chi emette lo scontrino e di chi è la merce a magazzino. Si tocca solo
       dove ce n'è UNA — dove sono due (Donna) la scelta la fa il pezzo che si
       vende, e cambiarla da qui vorrebbe dire scegliere per lui. */
    const salvaSocieta = async (store: string, nuova_: string) => {
        const az = aziende.find(a => a.codice === nuova_);
        /* «— DA SCEGLIERE —» NON È UNA SOCIETÀ (revisore 31/08). Sceglierla
           scriveva la stringa VUOTA dentro `pos_rt.azienda`, che è NOT NULL ma
           accetta "" — e siccome quella colonna fa parte della chiave primaria,
           la riga del registratore spariva: `(negozio, 'T1')` non esisteva più.
           Da lì il server non trovava più nessuna cassa per quel negozio,
           scartava ogni voce dello scontrino e rispondeva «nessuna voce
           stampabile». Il punto vendita smetteva di emettere scontrini — e
           siccome la vendita si salva solo a scontrino emesso, smetteva di
           vendere. Con un clic, senza un messaggio che lo dicesse.
           Sul NEGOZIO il vuoto va bene: vuol dire «non ancora deciso». Sul
           registratore no: quello o ha una società o non esiste. */
        // la società sta sul NEGOZIO: ce l'ha anche prima di avere una cassa
        const { error } = await supabase.from("stores").update({ azienda: nuova_ || null }).eq("name", store);
        if (dbError("Società del negozio", error)) return;
        setNegozi(p => p.map(x => x.name === store ? { ...x, azienda: nuova_ || null } : x));
        /* E DOVE IL REGISTRATORE C'È, si allinea: le due cose devono dire la
           stessa, se no la merce è di uno e lo scontrino lo firma un altro.
           Dove ce ne sono DUE (Donna) non si tocca niente: lì la società
           dello scontrino la sceglie il pezzo che si vende. */
        const righe = registratori.filter(r => r.negozio === store);
        if (nuova_ && righe.length === 1 && righe[0].azienda !== nuova_) {
            const { error: e2 } = await supabase.from("pos_rt")
                .update({ azienda: nuova_, ragione_sociale: az?.ragione_sociale ?? null, piva: az?.piva ?? null })
                .eq("negozio", store).eq("azienda", righe[0].azienda);
            if (dbError("Registratore del negozio", e2)) return;
            setRegistratori(p => p.map(r => r.negozio === store ? { ...r, azienda: nuova_ } : r));
        }
    };

    const salvaOrario = async (store: string, campo: CampoOrario, val: string) => {
        if (!val) return;
        // SABATO (Luca 12/08): turno unico dedicato, basta inizio < fine
        if (campo.startsWith("sabato")) {
            const n = negozi.find(x => x.name === store);
            const sa = campo === "sabato_apertura" ? val : (n?.sabato_apertura ? hhmm(n.sabato_apertura, "") : "");
            const sc = campo === "sabato_chiusura" ? val : (n?.sabato_chiusura ? hhmm(n.sabato_chiusura, "") : "");
            if (sa && sc && sc <= sa) { notify("Sabato: la chiusura è prima dell'apertura"); return; }
            const { error } = await supabase.from("stores").update({ [campo]: val }).eq("name", store);
            if (dbError("Orario sabato", error)) return;
            setNegozi(p => p.map(x => x.name === store ? { ...x, [campo]: val } : x));
            return;
        }
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
        const { error } = await supabase.from("chiusure_negozio").insert({ store, dal: f.dal, al: f.al, motivo: (f.motivo || "").trim(), creato_da: user?.name || null });
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

            {/* FESTIVI NAZIONALI (esiti Luca 12/08): la stessa tabella che
                leggono Tracking e Calendario gare. COMPATTI: riga chiusa con
                conteggio + prossimo festivo, il bottone apre l'elenco intero
                («i festivi tutti esplosi così sono orrendi»). */}
            <div className="glass-card p-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <p className="text-sm font-bold text-white">🎄 Giorni festivi
                        <span className="text-slate-500 font-normal text-xs ml-2">
                            valgono per tutti i negozi{(() => {
                                const oggi = new Date().toISOString().slice(0, 10);
                                const prox = festivi.find(f => f.giorno >= oggi);
                                return prox ? ` — prossimo: ${prox.giorno.split("-").reverse().join("/")} ${prox.nome}` : "";
                            })()}
                        </span>
                    </p>
                    <button onClick={() => setFestiviAperti(v => !v)}
                        className="px-3 h-8 rounded-lg border border-white/15 text-slate-200 text-[11px] font-bold">
                        {festiviAperti ? "Chiudi" : `Vedi tutti (${festivi.filter(f => f.giorno >= new Date().getFullYear() + "-01-01" && f.giorno <= (new Date().getFullYear() + 1) + "-12-31").length})`}
                    </button>
                </div>
                {festiviAperti && (<>
                    <div className="flex items-center gap-1.5 flex-wrap pt-3">
                        {festivi.filter(f => f.giorno >= new Date().getFullYear() + "-01-01" && f.giorno <= (new Date().getFullYear() + 1) + "-12-31").map(f => (
                            <span key={f.giorno} className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-500/10 border border-indigo-500/40 text-indigo-300">
                                {f.giorno.split("-").reverse().join("/")} · {f.nome}
                                <button onClick={async () => { if (!window.confirm(`Togliere "${f.nome}" (${f.giorno.split("-").reverse().join("/")}) dai festivi?`)) return; await supabase.from("giorni_festivi").delete().eq("giorno", f.giorno); carica(); }}
                                    className="opacity-70 hover:opacity-100">✕</button>
                            </span>
                        ))}
                        {festivi.length === 0 && <span className="text-xs text-slate-600 italic">Nessun festivo registrato.</span>}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap pt-2">
                        <input type="date" value={nFestivo.data} onChange={e => setNFestivo(p => ({ ...p, data: e.target.value }))} className="glass-input !h-8 text-[11px]" />
                        <input value={nFestivo.nome} onChange={e => setNFestivo(p => ({ ...p, nome: e.target.value }))} placeholder="Nome (es. Patrono)" className="glass-input !h-8 text-[11px] w-44" />
                        <button onClick={async () => {
                            if (!nFestivo.data) return;
                            const { error } = await supabase.from("giorni_festivi").upsert({ giorno: nFestivo.data, nome: nFestivo.nome.trim() || "Festivo" });
                            if (dbError("Festivo", error)) return;
                            setNFestivo({ data: "", nome: "" }); carica();
                        }} disabled={!nFestivo.data}
                            className="px-3 h-8 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold disabled:opacity-40">＋ Festivo</button>
                    </div>
                </>)}
            </div>
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
                            {/* SABATO dedicato A FLAG (esito Luca 12/08): senza flag il
                                sabato segue l'orario della settimana e non si vede nulla;
                                il flag apre i due campi del turno unico del sabato */}
                            {(sabatoUi[n.name] ?? !!(n.sabato_apertura || n.sabato_chiusura)) ? (
                                <div className="flex items-center gap-1 mt-1 text-[11px] text-slate-400"
                                    title="Orario dedicato del sabato (turno unico).">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 w-8 shrink-0">Sab</span>
                                    <input type="time" value={n.sabato_apertura ? hhmm(n.sabato_apertura, "") : ""} onChange={e => salvaOrario(n.name, "sabato_apertura", e.target.value)} className="glass-input !h-7 !px-1.5 text-[11px] w-[76px]" />
                                    <span>–</span>
                                    <input type="time" value={n.sabato_chiusura ? hhmm(n.sabato_chiusura, "") : ""} onChange={e => salvaOrario(n.name, "sabato_chiusura", e.target.value)} className="glass-input !h-7 !px-1.5 text-[11px] w-[76px]" />
                                    <button onClick={async () => {
                                        const { error } = await supabase.from("stores").update({ sabato_apertura: null, sabato_chiusura: null }).eq("name", n.name);
                                        if (dbError("Orario sabato", error)) return;
                                        setNegozi(p => p.map(x => x.name === n.name ? { ...x, sabato_apertura: null, sabato_chiusura: null } : x));
                                        setSabatoUi(p => ({ ...p, [n.name]: false }));
                                    }} title="Il sabato torna a seguire l'orario della settimana" className="text-slate-500 hover:text-rose-400 font-bold shrink-0">✕</button>
                                </div>
                            ) : (
                                <button onClick={() => setSabatoUi(p => ({ ...p, [n.name]: true }))}
                                    className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-amber-300 transition-colors block">
                                    ＋ Orario sabato dedicato
                                </button>
                            )}
                            {/* DOMENICA (Luca 11/08): negozio operativo anche di domenica —
                                per il Tracking quel giorno conta come lavorativo */}
                            <div className="flex items-center gap-2 mt-2"
                                title="Acceso = il negozio è operativo anche la domenica: per il Tracking la domenica conta come giorno lavorativo (warning/malus corrono)">
                                <button onClick={async () => {
                                    const val = !n.domenica_aperta;
                                    const { error } = await supabase.from("stores").update({ domenica_aperta: val }).eq("name", n.name);
                                    if (dbError("Domenica", error)) return;
                                    setNegozi(p => p.map(x => x.name === n.name ? { ...x, domenica_aperta: val } : x));
                                }}
                                    className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${n.domenica_aperta ? "bg-emerald-500/70" : "bg-white/10"}`}>
                                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${n.domenica_aperta ? "left-[18px]" : "left-0.5"}`} />
                                </button>
                                <span className={`text-[11px] font-bold ${n.domenica_aperta ? "text-emerald-300" : "text-slate-500"}`}>🌞 Aperto la domenica</span>
                            </div>
                        </div>
                        {/* LA SCHEDA DEL PUNTO VENDITA (Luca 31/08): «visto che abbiamo
                            molto spazio sulla destra, posso inserire le informazioni del
                            negozio — l'indirizzo, la società a cui appartiene — così
                            questo diventa il posto in cui deteniamo tutte le
                            informazioni sui punti vendita».
                            Non è anagrafica per bellezza: l'indirizzo è il LUOGO DI
                            CONSEGNA del documento di trasporto, e senza non è valido;
                            la società è chi emette lo scontrino e di chi è la merce. */}
                        {(() => {
                            const rt = registratori.filter(r => r.negozio === n.name);
                            const soc = rt.map(r => r.azienda);
                            const nome = (c: string) => aziende.find(a => a.codice === c)?.ragione_sociale || c;
                            const mancaPerDdt = !n.address || !n.civico || !n.cap || !n.citta;
                            return (
                                <div className="w-[290px] shrink-0 space-y-1.5 border-l border-white/5 pl-4">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">📍 Scheda del punto vendita</p>
                                    {/* VIA e CIVICO separati (Luca 31/08): in un campo solo
                                        prima o poi qualcuno scrive «via della Magliana
                                        263/263A», un altro «Via della Magliana, 263» e un
                                        terzo si dimentica il numero. Sul DDT l'indirizzo è
                                        il luogo di consegna: o è preciso o si vede che manca. */}
                                    <div className="flex gap-1.5">
                                        <input defaultValue={n.address || ""} onBlur={e => { if ((e.target.value.trim() || "") !== (n.address || "")) salvaIndirizzo(n.name, e.target.value); }}
                                            placeholder="Via"
                                            title="Compare nei messaggi WhatsApp ai clienti come {indirizzo}, ed è il luogo di consegna sul DDT"
                                            className="glass-input !h-7 !px-2 text-[11px] flex-1" />
                                        <input defaultValue={n.civico || ""} onBlur={e => { if ((e.target.value.trim() || "") !== (n.civico || "")) salvaCampoNegozio(n.name, "civico", e.target.value); }}
                                            placeholder="N." title="Numero civico" className="glass-input !h-7 !px-2 text-[11px] w-[62px]" />
                                    </div>
                                    <div className="flex gap-1.5">
                                        <input defaultValue={n.cap || ""} onBlur={e => { if ((e.target.value.trim() || "") !== (n.cap || "")) salvaCampoNegozio(n.name, "cap", e.target.value); }}
                                            placeholder="CAP" className="glass-input !h-7 !px-2 text-[11px] w-[70px]" />
                                        <input defaultValue={n.citta || ""} onBlur={e => { if ((e.target.value.trim() || "") !== (n.citta || "")) salvaCampoNegozio(n.name, "citta", e.target.value); }}
                                            placeholder="Città" className="glass-input !h-7 !px-2 text-[11px] flex-1" />
                                        <input defaultValue={n.provincia || ""} onBlur={e => { if ((e.target.value.trim().toUpperCase() || "") !== (n.provincia || "")) salvaCampoNegozio(n.name, "provincia", e.target.value.toUpperCase()); }}
                                            placeholder="PR" maxLength={2} className="glass-input !h-7 !px-2 text-[11px] w-[48px] uppercase" />
                                    </div>
                                    {/* LA SOCIETÀ SU UNA RIGA SUA (Luca 31/08: «si legge un
                                        po' male, forse dovrebbe essere leggermente più
                                        larga»). Stava in fila con l'etichetta e col «senza
                                        cassa», e quello che si stringeva era proprio la
                                        tendina: «Telefutura 2 S.R.L.» arrivava tagliata a
                                        «Telefutura 2 S.R.I». Adesso l'etichetta sta sopra e
                                        la tendina ha tutta la larghezza della scheda. */}
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Società</span>
                                            {rt.length === 0 && <span className="text-[10px] text-slate-500" title="Il registratore non è ancora configurato: la società resta scritta e verrà usata quando lo sarà">· senza cassa</span>}
                                        </div>
                                        <div className="flex items-center gap-2">
                                        {/* SI SCEGLIE SEMPRE (Luca 31/08): «sui negozi dove non
                                            c'è registratore fiscale dammi comunque la
                                            possibilità di selezionare la società, così avrai
                                            il dato già pronto quando li configureremo».
                                            Un negozio la società ce l'ha anche prima della
                                            cassa: è quella che possiede la merce a magazzino
                                            e che firma i documenti di trasporto. */}
                                        {/* ANCHE DOVE LE SOCIETÀ SONO DUE si sceglie
                                            (revisore 31/08). Prima Donna vedeva solo una
                                            scritta di sola lettura: il suo dato era
                                            sbagliato — diceva T2 mentre il 90% della
                                            merce è T1 — e non c'era modo di correggerlo.
                                            Qui si dice a quale società appartiene il
                                            NEGOZIO; le casse restano due e quale delle
                                            due emette lo scontrino continua a deciderlo
                                            il pezzo che si vende. */}
                                        {rt.length > 1 && (
                                            <span className="text-[10px] text-slate-500 shrink-0" title="Questo negozio ha due registratori: la cassa che emette lo scontrino la sceglie il pezzo venduto">
                                                casse {soc.join("+")}
                                            </span>
                                        )}
                                        {((
                                            <select value={n.azienda || ""} onChange={e => salvaSocieta(n.name, e.target.value)}
                                                title="La società a cui appartiene il punto vendita: possiede la merce a magazzino e firma i documenti di trasporto"
                                                // la ragione sociale finiva sotto la freccia e usciva
                                                // «Telefutura 2 S.R.I»: serve aria a destra (la freccia
                                                // sta lì) e un filo di altezza in più per non tagliare
                                                // i punti della sigla
                                                className="glass-input !h-8 !pl-2 !pr-7 text-[11px] w-full">
                                                <option value="">— da scegliere —</option>
                                                {aziende.map(a => <option key={a.codice} value={a.codice}>{a.ragione_sociale}</option>)}
                                            </select>
                                        ))}
                                        </div>
                                    </div>
                                    {/* I BRAND TRATTATI: si accendono e si spengono da qui,
                                        ma la riga è la stessa di Brand × Negozio — quella che
                                        Registra Vendita legge per sapere cosa il negozio può
                                        vendere. Un secondo elenco che dice la stessa cosa
                                        sarebbe un secondo elenco da tenere allineato. */}
                                    {brandCat.length > 0 && !n.is_ufficio && (
                                        <div className="flex flex-col gap-1">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Brand trattati</span>
                                            <div className="flex flex-wrap gap-1">
                                                {brandCat.map(b => {
                                                    const on = brandEff(n.name, b);
                                                    return (
                                                        <button key={b.id} type="button" onClick={() => toggleBrand(n.name, b)}
                                                            disabled={brandBusy === n.name + "|" + b.id}
                                                            title={on ? `${b.nome}: il negozio lo tratta — clicca per toglierlo` : `${b.nome}: non trattato — clicca per attivarlo`}
                                                            className={cn("px-1.5 py-0.5 rounded-md text-[10px] font-bold border transition-colors",
                                                                on ? "text-white" : "text-slate-500 border-white/10 bg-white/[0.03] hover:bg-white/10",
                                                                brandBusy === n.name + "|" + b.id && "opacity-40")}
                                                            style={on ? { background: `${b.colore1}33`, borderColor: `${b.colore1}88`, color: b.colore1 } : undefined}>
                                                            {b.nome}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                    {mancaPerDdt && (
                                        <p className="text-[10px] text-amber-300/80 leading-snug">
                                            Senza via, civico, CAP e città il documento di trasporto non è valido.
                                        </p>
                                    )}
                                </div>
                            );
                        })()}
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
