"use client";

// COMUNICAZIONI v2 (Luca 30/07, mig. 104): da sola-lettura a sezione completa.
// Due generi: BACHECA (campanella; si traccia chi l'ha aperta) e POP-UP
// (anche modale sopra tutto con pulsante Conferma; si traccia chi conferma —
// il modale vive in src/components/ComunicazioniPopup.tsx, montato nel layout).
// Chi puo' creare e verso quali ruoli si amministra da Permessi
// (cap:/comunicazioni:*). Le letture ora stanno a DB (comunicazioni_ricevute):
// il localStorage resta solo come eredita' del vecchio "letto" locale.
import { useState, useEffect, useCallback, useMemo } from "react";
import { Bell, Info, AlertTriangle, CheckCircle2, Plus, Eye, X, Trash2 } from "lucide-react";
import { cn } from "@/utils";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import { useRolePermissions } from "@/lib/usePermissions";
import { capAllowed, ruoliDestinatariComunicazioni, destinatarioSoloAmbito, CAP_COM_CREA, CAP_COMUNICAZIONI } from "@/lib/capabilities";
import { ROLES, BRANDS } from "@/lib/roles";
import { comunicazionePerMe, brandDelNegozio, negoziAssegnati } from "@/lib/comunicazioniTarget";
import { SelectMulti, SelectOpzioni } from "@/components/SelectPersona";
import { useStores } from "@/lib/org";
import { sameStore, useVisibleStores } from "@/lib/visibleStores";

const STORAGE_KEY = "comunicazioni_read_ids";

export type Comunicazione = {
    id: number;
    title: string;
    date_display: string;
    type: string;
    content: string;
    kind: string | null;             // 'bacheca' | 'popup'
    target_roles: string[] | null;   // NULL = tutti
    // destinatari ESTESI (mig. 112): negozi, persone singole, brand
    target_stores?: string[] | null;
    target_users?: string[] | null;
    target_brands?: string[] | null;
    esiti?: string[] | null;   // risposte cliccabili (mig. 116); null = solo conferma
    created_by: string | null;
    created_by_name: string | null;
    created_at?: string | null;   // per il filtro periodo
};

type Ricevuta = {
    comunicazione_id: number;
    user_id: string;
    user_name: string | null;
    letto_il: string | null;
    confermato_il: string | null;
    esito?: string | null;     // quale risposta ha cliccato (mig. 116)
};

function getLocalReadSet(): Set<number> {
    if (typeof window === "undefined") return new Set();
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return new Set(raw ? (JSON.parse(raw) as number[]) : []);
    } catch { return new Set(); }
}

const getTypeStyles = (type: string) => {
    switch (type) {
        case "warning": return { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-400/10", border: "border-amber-400/20" };
        case "success": return { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/20" };
        default: return { icon: Info, color: "text-blue-400", bg: "bg-blue-400/10", border: "border-blue-400/20" };
    }
};

const roleLabel = (id: string) => ROLES.find((r) => r.id === id)?.label || id;

function dataDisplayOggi(): string {
    const d = new Date();
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" }) +
        ", " + d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

export default function Comunicazioni() {
    const { user } = useAuth();
    const role = user?.role || "";
    const { perms } = useRolePermissions(role);
    const canCreate = capAllowed(role, CAP_COMUNICAZIONI.section, CAP_COM_CREA, perms);
    const destinatariPossibili = ruoliDestinatariComunicazioni(role, perms);
    // ambito del mittente (negozi assegnati + visibilità + sede): serve a
    // risolvere i ruoli destinatario marcati "solo il suo ambito"
    const ambitoMittente = useVisibleStores();
    // Le ricevute (chi ha letto/confermato) le vede l'amministrazione e, per le
    // proprie comunicazioni, chi le ha create (es. lo store manager).
    const isAdminRicevute = ["amministrativo", "admin", "dev", "direttore_generale"].includes(role);

    const [list, setList] = useState<Comunicazione[]>([]);
    const [ricevute, setRicevute] = useState<Ricevuta[]>([]);       // tutte (per i contatori)
    const [mieRicevute, setMieRicevute] = useState<Map<number, Ricevuta>>(new Map());
    const [localRead, setLocalRead] = useState<Set<number>>(new Set());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [espansa, setEspansa] = useState<number | null>(null);    // pannello ricevute aperto

    const fetchAll = useCallback(async () => {
        // select a scalare: completa (mig. 116, con esiti) → estesa (112) → legacy
        const completa = await supabase
            .from("comunicazioni")
            .select("id, title, date_display, type, content, kind, target_roles, target_stores, target_users, target_brands, esiti, created_by, created_by_name, created_at")
            .order("created_at", { ascending: false });
        const esteso = completa.error ? await supabase
            .from("comunicazioni")
            .select("id, title, date_display, type, content, kind, target_roles, target_stores, target_users, target_brands, created_by, created_by_name, created_at")
            .order("created_at", { ascending: false }) : null;
        const legacy = (esteso && esteso.error) ? await supabase
            .from("comunicazioni")
            .select("id, title, date_display, type, content, kind, target_roles, created_by, created_by_name, created_at")
            .order("created_at", { ascending: false }) : null;
        const data = ((legacy ? legacy.data : esteso ? esteso.data : completa.data) ?? []) as unknown as Comunicazione[];
        const e = legacy ? legacy.error : null;
        if (e) { setError(e.message); setList([]); setLoading(false); return; }
        setError(null);
        setList((data ?? []) as Comunicazione[]);
        const ricCompleta = await supabase
            .from("comunicazioni_ricevute")
            .select("comunicazione_id, user_id, user_name, letto_il, confermato_il, esito")
            .limit(10000);
        const { data: ric } = ricCompleta.error ? await supabase
            .from("comunicazioni_ricevute")
            .select("comunicazione_id, user_id, user_name, letto_il, confermato_il")
            .limit(10000) : ricCompleta;
        const tutte = (ric ?? []) as Ricevuta[];
        setRicevute(tutte);
        if (user?.id) setMieRicevute(new Map(tutte.filter((r) => r.user_id === user.id).map((r) => [r.comunicazione_id, r])));
        setLocalRead(getLocalReadSet());
        setLoading(false);
    }, [user?.id]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    // Destinatario? La lista mostra le comunicazioni indirizzate a me (per
    // ruolo, negozio, persona o brand — mig. 112); chi le ha create (o
    // l'amministrazione) vede anche le altre.
    const [brandsNegozio, setBrandsNegozio] = useState<string[]>([]);
    useEffect(() => { brandDelNegozio(user?.negozio).then(setBrandsNegozio); }, [user?.negozio]);
    // negozi ASSEGNATI (user_stores): chi lavora su piu' punti vendita riceve
    // le comunicazioni mirate a ciascuno di essi, non solo alla sede di login
    const [mieiAssegnati, setMieiAssegnati] = useState<string[]>([]);
    useEffect(() => { negoziAssegnati(user?.id).then(setMieiAssegnati); }, [user?.id]);
    // FILTRI bacheca (Luca 31/07): periodo per TUTTI; destinatari (negozio,
    // persona, brand, ruolo — gli stessi criteri della creazione, esiti esclusi)
    // dall'amministrativo in su. "Per tutti" passa ogni filtro destinatario.
    const [filtroDa, setFiltroDa] = useState("");
    const [filtroA, setFiltroA] = useState("");
    const [filtroNegozio, setFiltroNegozio] = useState("");
    const [filtroPersona, setFiltroPersona] = useState("");
    const [filtroBrand, setFiltroBrand] = useState("");
    const [filtroRuolo, setFiltroRuolo] = useState("");
    const filtriAttivi = !!(filtroDa || filtroA || filtroNegozio || filtroPersona || filtroBrand || filtroRuolo);
    const resetFiltri = () => { setFiltroDa(""); setFiltroA(""); setFiltroNegozio(""); setFiltroPersona(""); setFiltroBrand(""); setFiltroRuolo(""); };

    const visibili = useMemo(() => list.filter((c) =>
        comunicazionePerMe(c, { userId: user?.id, role, negozio: user?.negozio, negozi: mieiAssegnati, brandsNegozio })
        || c.created_by === user?.id || isAdminRicevute
    ), [list, role, user?.id, user?.negozio, brandsNegozio, isAdminRicevute]);

    const isLetta = useCallback((id: number) =>
        !!mieRicevute.get(id)?.letto_il || localRead.has(id), [mieRicevute, localRead]);
    const isConfermata = useCallback((id: number) => !!mieRicevute.get(id)?.confermato_il, [mieRicevute]);

    const scriviRicevuta = useCallback(async (comId: number, conferma: boolean, esito?: string) => {
        if (!user?.id) return;
        const esistente = mieRicevute.get(comId);
        const ora = new Date().toISOString();
        const riga: Ricevuta = {
            comunicazione_id: comId,
            user_id: user.id,
            user_name: user.name || null,
            letto_il: esistente?.letto_il || ora,
            confermato_il: conferma ? (esistente?.confermato_il || ora) : (esistente?.confermato_il ?? null),
            esito: esito || esistente?.esito || null,
        };
        let { error: e } = await supabase.from("comunicazioni_ricevute")
            .upsert([riga], { onConflict: "comunicazione_id,user_id" });
        if (e && /column/i.test(e.message)) {
            // mig. 116 non applicata: si salva almeno lettura/conferma
            const { esito: _x, ...legacy } = riga; void _x;
            ({ error: e } = await supabase.from("comunicazioni_ricevute").upsert([legacy], { onConflict: "comunicazione_id,user_id" }));
        }
        if (e) { setError(e.message); return; }
        setMieRicevute((p) => new Map(p).set(comId, riga));
        setRicevute((p) => {
            const senza = p.filter((r) => !(r.comunicazione_id === comId && r.user_id === user.id));
            return [...senza, riga];
        });
        try {
            const s = getLocalReadSet(); s.add(comId);
            localStorage.setItem(STORAGE_KEY, JSON.stringify([...s]));
        } catch { /* ignore */ }
        setLocalRead((p) => new Set(p).add(comId));
    }, [user?.id, user?.name, mieRicevute]);

    // le PROPRIE comunicazioni non sono mai "da leggere" (Luca 31/07: l'invito
    // riunione che spediva risultava una notifica per lui stesso)
    const handleMarkAllRead = async () => {
        for (const c of visibili) if (!isLetta(c.id) && c.created_by !== user?.id) await scriviRicevuta(c.id, false);
    };
    const unreadCount = visibili.filter((c) => !isLetta(c.id) && c.created_by !== user?.id).length;

    // ─── Creazione ───────────────────────────────────────────────────────────
    const [formOpen, setFormOpen] = useState(false);
    const [fTitle, setFTitle] = useState("");
    const [fContent, setFContent] = useState("");
    const [fType, setFType] = useState<"info" | "warning" | "success">("info");
    const [fKind, setFKind] = useState<"bacheca" | "popup">("bacheca");
    const [fTutti, setFTutti] = useState(true);
    const [fRuoli, setFRuoli] = useState<string[]>([]);
    // ESITI cliccabili (Luca 31/07, mig. 116): risposte a scelta del creatore
    const [fEsiti, setFEsiti] = useState<string[]>([]);
    const [fEsitoNuovo, setFEsitoNuovo] = useState("");
    const aggiungiEsito = () => {
        const v = fEsitoNuovo.trim();
        if (!v || fEsiti.includes(v)) { setFEsitoNuovo(""); return; }
        setFEsiti((p) => [...p, v]);
        setFEsitoNuovo("");
    };
    // destinatari ESTESI (Luca 31/07, mig. 112): negozi, persone, brand
    const [fNegozi, setFNegozi] = useState<string[]>([]);
    const [fPersone, setFPersone] = useState<string[]>([]);   // full_name selezionati
    const [fBrand, setFBrand] = useState<string[]>([]);
    const NEGOZI = useStores();
    const [utentiAttivi, setUtentiAttivi] = useState<{ id: string; full_name: string; role?: string | null; primary_store?: string | null }[]>([]);
    useEffect(() => {
        // servono anche per il FILTRO persona dell'amministrazione, non solo per il form
        if (!((formOpen && canCreate) || isAdminRicevute) || utentiAttivi.length) return;
        supabase.from("app_users").select("id, full_name, role, primary_store").eq("active", true).order("full_name")
            .then(({ data }) => setUtentiAttivi((data ?? []) as typeof utentiAttivi));
    }, [formOpen, canCreate, isAdminRicevute, utentiAttivi.length]);
    const puoTutti = destinatariPossibili.length === ROLES.length;
    // PERSONE selezionabili (Luca 31/07): senza "tutti i ruoli" si scelgono
    // SOLO persone dei ruoli abilitati; se il ruolo e' "solo ambito", solo
    // quelle dei negozi visibili del mittente. Negozi e brand come target
    // restano riservati a chi ha "tutti i ruoli".
    const personeSelezionabili = useMemo(() => {
        if (puoTutti) return utentiAttivi;
        return utentiAttivi.filter((u) => {
            if (!u.role || !destinatariPossibili.includes(u.role)) return false;
            if (!destinatarioSoloAmbito(role, u.role, perms)) return true;
            if (ambitoMittente.seesAll) return true;
            const miei = ambitoMittente.stores.length ? ambitoMittente.stores : (user?.negozio ? [user.negozio] : []);
            return !!u.primary_store && miei.some((m) => sameStore(u.primary_store!, m));
        });
    }, [utentiAttivi, puoTutti, destinatariPossibili, role, perms, ambitoMittente, user?.negozio]);
    // applicazione dei filtri sulla bacheca (dopo utentiAttivi: serve la mappa nome→id)
    const filtrate = useMemo(() => {
        const senzaTarget = (c: Comunicazione) => !(c.target_roles?.length || c.target_stores?.length || c.target_users?.length || c.target_brands?.length);
        const idPersona = filtroPersona ? utentiAttivi.find((u) => u.full_name === filtroPersona)?.id : null;
        const idRuolo = filtroRuolo ? (ROLES.find((r) => r.label === filtroRuolo)?.id || filtroRuolo) : null;
        return visibili.filter((c) => {
            if (filtroDa || filtroA) {
                const d = (c.created_at || "").slice(0, 10);
                if (filtroDa && (!d || d < filtroDa)) return false;
                if (filtroA && (!d || d > filtroA)) return false;
            }
            if (filtroNegozio && !(senzaTarget(c) || c.target_stores?.some((s) => sameStore(s, filtroNegozio)))) return false;
            if (idPersona && !(senzaTarget(c) || c.target_users?.includes(idPersona))) return false;
            if (filtroBrand && !(senzaTarget(c) || c.target_brands?.includes(filtroBrand))) return false;
            if (idRuolo && !(senzaTarget(c) || c.target_roles?.includes(idRuolo))) return false;
            return true;
        });
    }, [visibili, filtroDa, filtroA, filtroNegozio, filtroPersona, filtroBrand, filtroRuolo, utentiAttivi]);

    // ELIMINAZIONE (Luca 31/07): l'autore o l'amministrazione fanno pulizia —
    // via anche le ricevute collegate
    const eliminaComunicazione = async (com: Comunicazione) => {
        if (!window.confirm(`Eliminare la comunicazione "${com.title}"?\nSparisce per tutti, insieme alle sue ricevute.`)) return;
        await supabase.from("comunicazioni_ricevute").delete().eq("comunicazione_id", com.id);
        const { error } = await supabase.from("comunicazioni").delete().eq("id", com.id);
        if (error) { alert("Eliminazione non riuscita: " + error.message); return; }
        fetchAll();
    };

    const [salvando, setSalvando] = useState(false);
    useEffect(() => { if (!puoTutti) setFTutti(false); }, [puoTutti]);
    const azzeraTarget = () => { setFRuoli([]); setFNegozi([]); setFPersone([]); setFBrand([]); };

    const salvaComunicazione = async () => {
        if (!fTitle.trim() || !fContent.trim()) { setError("Titolo e testo sono obbligatori."); return; }
        const qualcosa = fRuoli.length || fNegozi.length || fPersone.length || fBrand.length;
        if (!fTutti && !qualcosa) { setError("Scegli almeno un destinatario: ruoli, negozi, persone o brand (oppure Tutti)."); return; }
        const idsPersone = fPersone
            .map((nome) => utentiAttivi.find((u) => u.full_name === nome)?.id)
            .filter(Boolean) as string[];
        setSalvando(true);
        // AMBITO destinatari (Luca 31/07): i ruoli marcati "solo il suo ambito"
        // nella rotellina NON restano target di ruolo (raggiungerebbero tutta
        // l'azienda) — si RISOLVONO qui nelle persone reali dei negozi visibili
        // del mittente e finiscono in target_users.
        let ruoliTarget = fTutti ? [] : [...fRuoli];
        let idsAmbito: string[] = [];
        const ruoliAmbito = ruoliTarget.filter((r) => destinatarioSoloAmbito(role, r, perms));
        if (ruoliAmbito.length && !ambitoMittente.seesAll) {
            ruoliTarget = ruoliTarget.filter((r) => !ruoliAmbito.includes(r));
            const negoziMiei = ambitoMittente.stores.length ? ambitoMittente.stores : (user?.negozio ? [user.negozio] : []);
            const { data: staff } = await supabase.from("app_users").select("id, role, primary_store").eq("active", true).in("role", ruoliAmbito);
            const idsStaff = ((staff ?? []) as { id: string }[]).map((u) => u.id);
            const { data: assegn } = idsStaff.length
                ? await supabase.from("user_stores").select("user_id, store_name").in("user_id", idsStaff)
                : { data: [] as { user_id: string; store_name: string }[] };
            const negoziDi = new Map<string, string[]>();
            ((assegn ?? []) as { user_id: string; store_name: string }[]).forEach((r) => {
                const a = negoziDi.get(r.user_id) || []; a.push(String(r.store_name)); negoziDi.set(r.user_id, a);
            });
            idsAmbito = ((staff ?? []) as { id: string; primary_store: string | null }[]).filter((u) => {
                const suoi = [...(negoziDi.get(u.id) || []), ...(u.primary_store ? [u.primary_store] : [])];
                return suoi.some((s) => negoziMiei.some((m) => sameStore(s, m)));
            }).map((u) => u.id);
            if (!ruoliTarget.length && !idsAmbito.length && !idsPersone.length && !fNegozi.length && !fBrand.length) {
                setSalvando(false);
                setError(`Nei tuoi negozi non c'è nessuno con ruolo ${ruoliAmbito.map(roleLabel).join(", ")}: la comunicazione non avrebbe destinatari.`);
                return;
            }
        }
        const idsTarget = [...new Set([...idsPersone, ...idsAmbito])];
        const { error: e } = await supabase.from("comunicazioni").insert({
            title: fTitle.trim(),
            content: fContent.trim(),
            type: fType,
            kind: fKind,
            target_roles: fTutti || !ruoliTarget.length ? null : ruoliTarget,
            target_stores: fTutti || !fNegozi.length ? null : fNegozi,
            target_users: fTutti || !idsTarget.length ? null : idsTarget,
            target_brands: fTutti || !fBrand.length ? null : fBrand,
            esiti: fEsiti.length ? fEsiti : null,
            created_by: user?.id || null,
            created_by_name: user?.name || null,
            date_display: dataDisplayOggi(),
        });
        setSalvando(false);
        if (e) {
            // niente fallback silenzioso: senza mig. 112 una comunicazione mirata
            // diventerebbe "per tutti" — meglio fermarsi e dirlo
            setError(/column/i.test(e.message) ? "Funzione non ancora attiva sul database (mig. 112/116 da applicare)." : e.message);
            return;
        }
        setError(null);
        setFormOpen(false);
        setFTitle(""); setFContent(""); setFType("info"); setFKind("bacheca"); setFTutti(puoTutti); azzeraTarget(); setFEsiti([]); setFEsitoNuovo("");
        fetchAll();
    };

    // l'AUTORE non conta tra letture/conferme della propria comunicazione
    const contatori = useCallback((comId: number, autore: string | null) => {
        const r = ricevute.filter((x) => x.comunicazione_id === comId && (!autore || x.user_id !== autore));
        return { letture: r.filter((x) => x.letto_il).length, conferme: r.filter((x) => x.confermato_il).length };
    }, [ricevute]);

    const inputStyle = "w-full bg-black/40 border border-white/10 rounded-xl text-slate-100 text-sm py-2.5 px-3.5 outline-none focus:border-violet-500/50";

    return (
        <div className="w-full max-w-4xl mx-auto">
            <div className="mb-8 flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <h2 className="text-3xl font-bold text-white mb-2">Comunicazioni</h2>
                    <p className="text-slate-400">Avvisi e aggiornamenti importanti dal back office</p>
                </div>
                <div className="flex items-center gap-2.5">
                    {canCreate && (
                        <button
                            type="button"
                            onClick={() => setFormOpen(true)}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold transition-colors"
                        >
                            <Plus className="w-4 h-4" /> Nuova comunicazione
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={handleMarkAllRead}
                        className={cn(
                            "p-3 rounded-full border transition-colors relative",
                            unreadCount > 0
                                ? "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
                                : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                        )}
                        title={unreadCount > 0 ? "Segna tutti come letti" : "Nessun nuovo"}
                    >
                        <Bell className="w-6 h-6" />
                        {unreadCount > 0 && (
                            <span className="absolute top-0 right-0 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-rose-500 text-[10px] font-bold text-white border-2 border-[#0f111a] rounded-full">
                                {unreadCount}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            {error && (
                <div className="mb-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="py-12 text-center text-slate-400">Caricamento...</div>
            ) : (
                <div className="space-y-4">
                    <div className="glass-card p-4">
                        <div className="flex flex-wrap items-end gap-3">
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Dal</label>
                                <input type="date" value={filtroDa} onChange={(e) => setFiltroDa(e.target.value)} className="block mt-1 bg-black/40 border border-white/10 rounded-xl text-sm py-2 px-3 text-slate-200 outline-none" />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Al</label>
                                <input type="date" value={filtroA} onChange={(e) => setFiltroA(e.target.value)} className="block mt-1 bg-black/40 border border-white/10 rounded-xl text-sm py-2 px-3 text-slate-200 outline-none" />
                            </div>
                            {isAdminRicevute && (
                                <>
                                    <div className="min-w-[170px]">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Negozio</label>
                                        <SelectOpzioni value={filtroNegozio} onChange={setFiltroNegozio} opzioni={NEGOZI} placeholder="Tutti — scrivi per filtrare" className="glass-input rounded-xl py-2 w-full mt-1" />
                                    </div>
                                    <div className="min-w-[190px]">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Persona</label>
                                        <SelectOpzioni value={filtroPersona} onChange={setFiltroPersona} opzioni={utentiAttivi.map((u) => u.full_name)} placeholder="Tutte — scrivi per filtrare" className="glass-input rounded-xl py-2 w-full mt-1" />
                                    </div>
                                    <div className="min-w-[150px]">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Brand</label>
                                        <SelectOpzioni value={filtroBrand} onChange={setFiltroBrand} opzioni={BRANDS} placeholder="Tutti" className="glass-input rounded-xl py-2 w-full mt-1" />
                                    </div>
                                    <div className="min-w-[170px]">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Ruolo</label>
                                        <SelectOpzioni value={filtroRuolo} onChange={setFiltroRuolo} opzioni={ROLES.map((r) => r.label)} placeholder="Tutti" className="glass-input rounded-xl py-2 w-full mt-1" />
                                    </div>
                                </>
                            )}
                            {filtriAttivi && (
                                <button onClick={resetFiltri} className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors">✕ Azzera filtri</button>
                            )}
                            {filtriAttivi && <span className="text-xs text-slate-500">{filtrate.length} su {visibili.length}</span>}
                        </div>
                    </div>
                    {filtrate.map((com) => {
                        const mia = !!user?.id && com.created_by === user.id;
                        const read = isLetta(com.id) || mia;   // la propria non e' mai "Nuovo"
                        const styles = getTypeStyles(com.type);
                        const Icon = styles.icon;
                        const isPopup = com.kind === "popup";
                        const perMe = comunicazionePerMe(com, { userId: user?.id, role, negozio: user?.negozio, negozi: mieiAssegnati, brandsNegozio });
                        const vedeRicevute = isAdminRicevute || mia;
                        const cnt = vedeRicevute ? contatori(com.id, com.created_by) : null;
                        const dettaglio = espansa === com.id
                            ? ricevute.filter((r) => r.comunicazione_id === com.id && r.letto_il && r.user_id !== com.created_by)
                                .sort((a, b) => (b.confermato_il || b.letto_il || "").localeCompare(a.confermato_il || a.letto_il || ""))
                            : [];
                        return (
                            <div
                                key={com.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => !read && scriviRicevuta(com.id, false)}
                                onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !read) scriviRicevuta(com.id, false); }}
                                className={cn(
                                    "glass-card p-6 relative overflow-hidden transition-all cursor-pointer",
                                    !read && "border-l-4 border-l-primary"
                                )}
                            >
                                <div className="absolute top-6 right-6 flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                                    {!read && (
                                        <span className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                                            <span className="text-xs font-semibold text-primary uppercase tracking-wider">Nuovo</span>
                                        </span>
                                    )}
                                    {(isAdminRicevute || mia) && (
                                        <button onClick={() => eliminaComunicazione(com)} title="Elimina comunicazione (per tutti)"
                                            className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>

                                <div className="flex gap-4">
                                    <div className={cn("shrink-0 w-12 h-12 rounded-xl flex items-center justify-center border", styles.bg, styles.border, styles.color)}>
                                        <Icon className="w-6 h-6" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="mb-1">
                                            <h3 className={cn("text-lg font-semibold", !read ? "text-white" : "text-slate-200")}>
                                                {com.title}
                                            </h3>
                                            <p className="text-sm text-slate-500">
                                                {com.date_display}
                                                {com.created_by_name ? ` — ${com.created_by_name}` : ""}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 flex-wrap mt-1.5">
                                            {isPopup && (
                                                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30">
                                                    Pop-up con conferma
                                                </span>
                                            )}
                                            {vedeRicevute && !!(com.target_roles?.length || com.target_stores?.length || com.target_users?.length || com.target_brands?.length) && (
                                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-slate-400 border border-white/10">
                                                    → {[
                                                        ...(com.target_roles || []).map(roleLabel),
                                                        ...(com.target_stores || []).map((s) => `🏬 ${s}`),
                                                        ...(com.target_brands || []).map((b) => `🏷 ${b}`),
                                                        ...(com.target_users?.length ? [`👤 ${com.target_users.length} person${com.target_users.length === 1 ? "a" : "e"}`] : []),
                                                    ].join(", ")}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-slate-300 mt-3 leading-relaxed whitespace-pre-wrap">
                                            {com.content}
                                        </p>

                                        <div className="mt-4 flex items-center gap-3 flex-wrap" onClick={(e) => e.stopPropagation()}>
                                            {(isPopup || !!com.esiti?.length) && perMe && (
                                                isConfermata(com.id) ? (
                                                    <span className="flex items-center gap-1.5 text-sm font-bold text-emerald-400">
                                                        <CheckCircle2 className="w-4 h-4" /> Confermata{mieRicevute.get(com.id)?.esito ? ` — ${mieRicevute.get(com.id)!.esito}` : ""}
                                                    </span>
                                                ) : com.esiti?.length ? (
                                                    // ESITI cliccabili (Luca 31/07): la risposta E' la conferma
                                                    com.esiti.map((es) => (
                                                        <button
                                                            key={es}
                                                            type="button"
                                                            onClick={() => scriviRicevuta(com.id, true, es)}
                                                            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition-colors"
                                                        >
                                                            {es}
                                                        </button>
                                                    ))
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => scriviRicevuta(com.id, true)}
                                                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition-colors"
                                                    >
                                                        ✓ Conferma lettura
                                                    </button>
                                                )
                                            )}
                                            {vedeRicevute && cnt && (
                                                <button
                                                    type="button"
                                                    onClick={() => setEspansa(espansa === com.id ? null : com.id)}
                                                    className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
                                                    title="Chi l'ha letta / confermata"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                    {cnt.letture} lettur{cnt.letture === 1 ? "a" : "e"}
                                                    {isPopup ? ` · ${cnt.conferme} conferm${cnt.conferme === 1 ? "a" : "e"}` : ""}
                                                    <span className="text-[10px]">{espansa === com.id ? "▲" : "▼"}</span>
                                                </button>
                                            )}
                                        </div>

                                        {espansa === com.id && vedeRicevute && (
                                            <div className="mt-3 rounded-xl border border-white/10 bg-black/30 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                                                {dettaglio.length === 0 ? (
                                                    <div className="p-3 text-sm text-slate-500">Nessuno l&apos;ha ancora aperta.</div>
                                                ) : dettaglio.map((r) => (
                                                    <div key={r.user_id} className="flex items-center gap-3 px-3.5 py-2 border-b border-white/5 last:border-b-0 text-sm">
                                                        <span className="text-slate-200 font-medium">{r.user_name || r.user_id}</span>
                                                        <span className="ml-auto text-xs text-slate-500">
                                                            letta {r.letto_il ? new Date(r.letto_il).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
                                                        </span>
                                                        {/* l'ESITO scelto (mig. 116): chi ha cliccato cosa */}
                                                        {r.esito && (
                                                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30">{r.esito}</span>
                                                        )}
                                                        {(isPopup || !!com.esiti?.length) && (
                                                            r.confermato_il ? (
                                                                <span className="text-xs font-bold text-emerald-400">
                                                                    ✓ confermata {new Date(r.confermato_il).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                                                                </span>
                                                            ) : (
                                                                <span className="text-xs text-amber-400">non confermata</span>
                                                            )
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {!loading && filtrate.length === 0 && !error && (
                <div className="py-12 text-center text-slate-500">Nessuna comunicazione.</div>
            )}

            {/* ─── Modale creazione ─── */}
            {formOpen && (
                <div className="fixed inset-0 bg-black/70 z-[1200] flex items-center justify-center p-4" onClick={() => setFormOpen(false)} role="dialog" aria-modal="true">
                    <div className="bg-[#12141f] border border-white/10 rounded-2xl w-full max-w-[640px] max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between py-5 px-6 border-b border-white/10">
                            <h3 className="text-lg font-bold text-white">Nuova comunicazione</h3>
                            <button type="button" onClick={() => setFormOpen(false)} className="text-slate-500 hover:text-white"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-6 space-y-5">
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Genere</label>
                                <div className="flex gap-2 mt-2">
                                    {([
                                        { id: "bacheca", label: "📣 Bacheca", desc: "campanella + traccia chi la legge" },
                                        { id: "popup", label: "🚨 Pop-up con conferma", desc: "modale sopra tutto, va confermata" },
                                    ] as const).map((k) => (
                                        <button key={k.id} type="button" onClick={() => setFKind(k.id)}
                                            className={cn("flex-1 p-3 rounded-xl border text-left transition-all",
                                                fKind === k.id ? "border-violet-500 bg-violet-500/10" : "border-white/10 hover:border-white/25")}>
                                            <div className="text-sm font-bold text-white">{k.label}</div>
                                            <div className="text-[11px] text-slate-500 mt-0.5">{k.desc}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Titolo</label>
                                <input type="text" value={fTitle} onChange={(e) => setFTitle(e.target.value)} className={inputStyle + " mt-2"} placeholder="Es. Nuovi listini da lunedì" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Testo</label>
                                <textarea value={fContent} onChange={(e) => setFContent(e.target.value)} className={inputStyle + " mt-2 min-h-[120px] resize-y"} placeholder="Il contenuto della comunicazione…" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Aspetto</label>
                                <div className="flex gap-2 mt-2">
                                    {([["info", "ℹ️ Info"], ["warning", "⚠️ Avviso"], ["success", "✅ Buone notizie"]] as const).map(([t, l]) => (
                                        <button key={t} type="button" onClick={() => setFType(t)}
                                            className={cn("px-3.5 py-1.5 rounded-full border text-sm transition-all",
                                                fType === t ? "border-violet-500 bg-violet-500/10 text-white" : "border-white/10 text-slate-400 hover:border-white/25")}>
                                            {l}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Esiti cliccabili <span className="normal-case font-normal">(facoltativi — es. &quot;Parteciperò&quot; / &quot;Non parteciperò&quot;)</span></label>
                                <p className="text-[11px] text-slate-500 mt-1">Se li imposti, il destinatario risponde cliccandone uno (che vale come conferma) e tu vedi chi ha scelto cosa nel dettaglio ricevute.</p>
                                <div className="flex gap-2 mt-2">
                                    <input value={fEsitoNuovo} onChange={(e) => setFEsitoNuovo(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); aggiungiEsito(); } }}
                                        className={inputStyle} placeholder="Scrivi un esito e premi Invio…" />
                                    <button type="button" onClick={aggiungiEsito}
                                        className="px-4 rounded-xl border border-white/15 text-slate-300 text-sm font-bold hover:bg-white/10 shrink-0">＋</button>
                                </div>
                                {fEsiti.length > 0 && (
                                    <div className="flex gap-2 mt-2 flex-wrap">
                                        {fEsiti.map((es) => (
                                            <span key={es} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-sky-500/40 bg-sky-500/10 text-sky-200 text-sm">
                                                {es}
                                                <button type="button" onClick={() => setFEsiti((p) => p.filter((x) => x !== es))}
                                                    className="text-sky-400/70 hover:text-white text-xs">✕</button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Destinatari — per ruolo</label>
                                <div className="flex gap-2 mt-2 flex-wrap">
                                    {puoTutti && (
                                        <button type="button" onClick={() => { setFTutti(true); azzeraTarget(); }}
                                            className={cn("px-3.5 py-1.5 rounded-full border text-sm font-bold transition-all",
                                                fTutti ? "border-emerald-500 bg-emerald-500/10 text-emerald-300" : "border-white/10 text-slate-400 hover:border-white/25")}>
                                            Tutti
                                        </button>
                                    )}
                                    {destinatariPossibili.map((rid) => {
                                        const sel = !fTutti && fRuoli.includes(rid);
                                        const soloAmbito = destinatarioSoloAmbito(role, rid, perms);
                                        return (
                                            <button key={rid} type="button"
                                                title={soloAmbito ? "Raggiunge solo le persone dei tuoi negozi" : undefined}
                                                onClick={() => { setFTutti(false); setFRuoli((p) => p.includes(rid) ? p.filter((x) => x !== rid) : [...p, rid]); }}
                                                className={cn("px-3.5 py-1.5 rounded-full border text-sm transition-all",
                                                    sel ? "border-violet-500 bg-violet-500/10 text-white" : "border-white/10 text-slate-400 hover:border-white/25")}>
                                                {roleLabel(rid)}{soloAmbito && <span className="text-[10px] opacity-70"> · solo tuoi negozi</span>}
                                            </button>
                                        );
                                    })}
                                </div>
                                {destinatariPossibili.length === 0 && (
                                    <p className="text-xs text-amber-400 mt-2">Il tuo ruolo non ha destinatari abilitati: chiedi all&apos;amministrazione (Permessi → Comunicazioni).</p>
                                )}
                            </div>
                            {/* destinatari ESTESI (Luca 31/07): negozi, persone, brand —
                                i criteri si SOMMANO (basta rientrare in uno) */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {/* NEGOZI (= tutto lo staff, ruoli compresi) solo per chi puo'
                                    scrivere a tutti i ruoli: con destinatari limitati sarebbe
                                    una porta laterale (Luca 31/07, caso Schekella) */}
                                {puoTutti && (
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">…per negozio <span className="normal-case font-normal">(tutto lo staff)</span></label>
                                        <SelectMulti
                                            values={fNegozi}
                                            onChange={(v) => { if (v.length) setFTutti(false); setFNegozi(v); }}
                                            opzioni={NEGOZI}
                                            className="w-full mt-2 bg-black/40 border border-white/10 rounded-xl text-sm py-2.5 px-3.5"
                                        />
                                    </div>
                                )}
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">…a persone singole {!puoTutti && <span className="normal-case font-normal">(solo dei ruoli che puoi raggiungere)</span>}</label>
                                    <SelectMulti
                                        values={fPersone}
                                        onChange={(v) => { if (v.length) setFTutti(false); setFPersone(v); }}
                                        opzioni={personeSelezionabili.map((u) => u.full_name)}
                                        className="w-full mt-2 bg-black/40 border border-white/10 rounded-xl text-sm py-2.5 px-3.5"
                                    />
                                </div>
                            </div>
                            {puoTutti && <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">…per brand <span className="normal-case font-normal">(chi sta in un negozio che lo tratta)</span></label>
                                <div className="flex gap-2 mt-2 flex-wrap">
                                    {BRANDS.map((b) => {
                                        const sel = !fTutti && fBrand.includes(b);
                                        return (
                                            <button key={b} type="button"
                                                onClick={() => { setFTutti(false); setFBrand((p) => p.includes(b) ? p.filter((x) => x !== b) : [...p, b]); }}
                                                className={cn("px-3.5 py-1.5 rounded-full border text-sm transition-all",
                                                    sel ? "border-sky-500 bg-sky-500/10 text-white" : "border-white/10 text-slate-400 hover:border-white/25")}>
                                                {b}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>}
                        </div>
                        <div className="flex items-center justify-end gap-2.5 py-4 px-6 border-t border-white/10">
                            <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2.5 rounded-xl border border-white/10 text-slate-300 text-sm">Annulla</button>
                            <button type="button" disabled={salvando} onClick={salvaComunicazione}
                                className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold disabled:opacity-40">
                                {salvando ? "Invio…" : fKind === "popup" ? "Pubblica il pop-up" : "Pubblica in bacheca"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
