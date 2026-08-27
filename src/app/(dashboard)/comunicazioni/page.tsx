"use client";

// COMUNICAZIONI v2 (Luca 30/07, mig. 104): da sola-lettura a sezione completa.
// Due generi: BACHECA (campanella; si traccia chi l'ha aperta) e POP-UP
// (anche modale sopra tutto con pulsante Conferma; si traccia chi conferma —
// il modale vive in src/components/ComunicazioniPopup.tsx, montato nel layout).
// Chi puo' creare e verso quali ruoli si amministra da Permessi
// (cap:/comunicazioni:*). Le letture ora stanno a DB (comunicazioni_ricevute):
// il localStorage resta solo come eredita' del vecchio "letto" locale.
import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Bell, Info, AlertTriangle, CheckCircle2, Plus, Eye, X, Trash2 , Rocket, Bomb, Flame } from "lucide-react";
import { cn } from "@/utils";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import { useRolePermissions } from "@/lib/usePermissions";
import { capAllowed, ruoliDestinatariComunicazioni, destinatarioSoloAmbito, CAP_COM_CREA, CAP_COMUNICAZIONI } from "@/lib/capabilities";
import { ROLES, BRANDS } from "@/lib/roles";
import { comunicazionePerMe, brandDiUtente, negoziAssegnati, sincronizzaRispostaRiunione } from "@/lib/comunicazioniTarget";
import { Confetti, EsplosioneBomba, SfondoComunicazione, fondoComunicazione, stileTaglia, SprintStart, RazzoUpdate, ImpulsoOnde } from "@/components/ComunicazioniPopup";
import { EditorRicco, sanificaHtml } from "@/components/EditorRicco";
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
    content_html?: string | null;   // mig. 155: testo RICCO dell'editor
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
    meeting_id?: number | null;   // invito riunione (mig. 122)
    allegati?: { url: string; name: string }[] | null;   // mig. 147
    size?: string | null;                                  // 'piccola' | 'normale' | 'grande' (mig. 158)
};

type Ricevuta = {
    comunicazione_id: number;
    user_id: string;
    user_name: string | null;
    letto_il: string | null;
    confermato_il: string | null;
    esito?: string | null;     // quale risposta ha cliccato (mig. 116)
    rinviato_il?: string | null;   // ultimo "Più tardi" (mig. 141)
    rinvii?: number | null;        // quante volte ha rinviato (mig. 141)
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
        // URGENTE (03/08): rosso che non passa inosservato
        case "warning": return { icon: AlertTriangle, color: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/30" };
        case "success": return { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/20" };
        // UPDATE (03/08): novita' del CRM/azienda, razzo violetto
        case "update": return { icon: Rocket, color: "text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/30" };
        // NOVITA' (04/08, mig. 159): la bomba 💣 arancio che esplode alla prima apertura
        case "novita": return { icon: Bomb, color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/40" };
        // SPRINT (MOD-19, 10/08): la carica 🔥 oro — countdown + frase dal calderone
        case "sprint": return { icon: Flame, color: "text-amber-300", bg: "bg-amber-400/10", border: "border-amber-400/40" };
        default: return { icon: Info, color: "text-blue-400", bg: "bg-blue-400/10", border: "border-blue-400/20" };
    }
};

const roleLabel = (id: string) => ROLES.find((r) => r.id === id)?.label || id;

function dataDisplayOggi(): string {
    const d = new Date();
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" }) +
        ", " + d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

function ComunicazioniInner() {
    const { user } = useAuth();
    const role = user?.role || "";
    const { perms } = useRolePermissions(role, user?.grade, user?.id);
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
    // BACHECA A TITOLI CHIUSI (03/08): da fuori si vede solo il titolo; il
    // click APRE il contenuto ed e' quello che conta come lettura — prima
    // bastava un click a vuoto sulla card e "letta" scattava senza leggere.
    const [aperte, setAperte] = useState<Set<number>>(new Set());
    const [festa, setFesta] = useState<number | null>(null);   // coriandoli sulle buone notizie
    const [bomba, setBomba] = useState<number | null>(null);   // 💣 esplosione sulle novita' (one-shot)
    // MOD-19: effetto scenico a TUTTA PAGINA anche per sprint/update/warning
    // alla prima apertura (Info resta circoscritta alla card)
    const [scenico, setScenico] = useState<{ id: number; t: string } | null>(null);
    // filtro del dettaglio ricevute (03/08): chips cliccabili sui contatori
    const [dettFiltro, setDettFiltro] = useState<"tutti" | "apparse" | "confermate" | "rinviate" | "mai">("tutti");

    const fetchAll = useCallback(async () => {
        // select a scalare: v190 (sprint_frase, MOD-19) → completa (mig. 116) → estesa (112) → legacy
        const v190 = await supabase
            .from("comunicazioni")
            .select("id, title, date_display, type, content, content_html, kind, target_roles, target_stores, target_users, target_brands, esiti, meeting_id, allegati, size, created_by, created_by_name, created_at, sprint_frase")
            .order("created_at", { ascending: false });
        const completa = v190.error ? await supabase
            .from("comunicazioni")
            .select("id, title, date_display, type, content, content_html, kind, target_roles, target_stores, target_users, target_brands, esiti, meeting_id, allegati, size, created_by, created_by_name, created_at")
            .order("created_at", { ascending: false }) : v190;
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
        // select a scalare: rinvii (mig. 141) → esiti (116) → legacy
        const ricRinvii = await supabase
            .from("comunicazioni_ricevute")
            .select("comunicazione_id, user_id, user_name, letto_il, confermato_il, esito, rinviato_il, rinvii")
            .limit(10000);
        const ricCompleta = ricRinvii.error ? await supabase
            .from("comunicazioni_ricevute")
            .select("comunicazione_id, user_id, user_name, letto_il, confermato_il, esito")
            .limit(10000) : ricRinvii;
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
    useEffect(() => { brandDiUtente(user?.id).then(setBrandsNegozio); }, [user?.id]);
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
        // invito riunione: la risposta si riflette sullo stato in calendario
        if (esito) {
            const com = list.find((c) => c.id === comId);
            await sincronizzaRispostaRiunione(com?.meeting_id, user.id, esito);
        }
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
        // avvisa la campanella in sidebar di ricontare subito (fix Luca 08/08:
        // restando su questa pagina il realtime non bastava ad azzerarla)
        try { window.dispatchEvent(new Event("com-letta")); } catch { /* ssr */ }
    }, [user?.id, user?.name, mieRicevute, list]);

    // DEEP-LINK dalla home (BAC-01): /comunicazioni?apri=<id> apre la card,
    // la porta in vista e scrive la lettura SOLO se sono destinatario vero
    // (comunicazionePerMe) — l'admin che sbircia non "legge" per sbaglio.
    const searchParams = useSearchParams();
    const apriId = Number(searchParams.get("apri")) || null;
    const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map());
    const apriAperto = useRef(false);       // apertura+scroll: una volta sola
    const apriLetto = useRef(false);        // lettura: riprova finche' negozi/brand non sono caricati
    useEffect(() => {
        if (!apriId || loading) return;
        const com = list.find((c) => c.id === apriId);
        if (!com) return;
        if (!apriAperto.current) {
            apriAperto.current = true;
            setAperte((p) => new Set(p).add(apriId));
            setTimeout(() => cardRefs.current.get(apriId)?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
        }
        if (apriLetto.current) return;
        const perMe = comunicazionePerMe(com, { userId: user?.id, role, negozio: user?.negozio, negozi: mieiAssegnati, brandsNegozio });
        if (perMe && com.created_by !== user?.id && !isLetta(apriId)) {
            apriLetto.current = true;
            scriviRicevuta(apriId, false);   // APRIRE = leggere, come il click in bacheca
        }
    }, [apriId, loading, list, user?.id, user?.negozio, role, mieiAssegnati, brandsNegozio, isLetta, scriviRicevuta]);

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
    const [fType, setFType] = useState<"info" | "novita" | "warning" | "success" | "update" | "sprint">("info");
    // Frase Sprint (task Francesco, ok Luca 10/08): di default si pesca da sola
    // dal calderone (rotazione mai-ripetuta); in alternativa il mittente può
    // SCEGLIERE la frase esatta dalla tendina ricercabile.
    const [fSprintScelta, setFSprintScelta] = useState<"caso" | "scelta">("caso");
    const [fSprintFrase, setFSprintFrase] = useState("");
    // MOD-19: gestione del CALDERONE frasi sprint (aggiungi/modifica/spegni)
    const [frasiOpen, setFrasiOpen] = useState(false);
    const [frasi, setFrasi] = useState<{ id: string; testo: string; attivo: boolean; usi: number }[]>([]);
    const [fraseNuova, setFraseNuova] = useState("");
    const [frasiErr, setFrasiErr] = useState<string | null>(null);
    const caricaFrasi = async () => {
        const { data, error: fe } = await supabase.from("sprint_frasi").select("id, testo, attivo, usi").order("usi", { ascending: true }).order("testo");
        if (fe) { setFrasiErr("Calderone non disponibile: manca la migrazione sprint (apply_mig_sprint.js)."); setFrasi([]); return; }
        setFrasiErr(null);
        setFrasi(((data ?? []) as { id: string; testo: string; attivo: boolean; usi: number }[]));
    };
    const aggiungiFrase = async () => {
        const t = fraseNuova.trim();
        if (!t) return;
        const { error: fe } = await supabase.from("sprint_frasi").insert({ testo: t });
        if (fe) { setFrasiErr(/duplicate/i.test(fe.message) ? "Frase già nel calderone." : fe.message); return; }
        setFraseNuova(""); setFrasiErr(null); caricaFrasi();
    };
    const salvaFrase = async (id: string, patch: { testo?: string; attivo?: boolean }) => {
        await supabase.from("sprint_frasi").update(patch).eq("id", id);
        setFrasi((p) => p.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    };
    // EDITOR (03/08, mig. 147; taglie v2 mig. 158): dimensione, allegati, emoji rapide
    const [fSize, setFSize] = useState<"piccola" | "normale" | "grande">("piccola");
    const [fAllegati, setFAllegati] = useState<{ url: string; name: string }[]>([]);
    const [fCaricando, setFCaricando] = useState(false);
    // EDITOR RICCO (Luca 03/08): l'HTML formattato viaggia in content_html,
    // il testo puro resta in fContent per validazioni e client vecchi
    const [fContentHtml, setFContentHtml] = useState("");
    const EMOJI_RAPIDE = ["🎉", "🚀", "🔥", "💪", "🏆", "📈", "✅", "⚠️", "🚨", "📌", "📣", "👏", "🤝", "⭐", "🎯", "💡"];
    const caricaAllegati = async (files: FileList | null) => {
        if (!files?.length || fCaricando) return;
        setFCaricando(true);
        try {
            for (const f of Array.from(files)) {
                const path = `comunicazioni/${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${f.name.replace(/[^\w.\-]/g, "_")}`;
                const { error: eUp } = await supabase.storage.from("contracts").upload(path, f);
                if (eUp) { setError("Allegato non caricato: " + eUp.message); continue; }
                const { data: pu } = supabase.storage.from("contracts").getPublicUrl(path);
                setFAllegati((p) => [...p, { url: pu.publicUrl, name: f.name }]);
            }
        } finally { setFCaricando(false); }
    };
    const [fKind, setFKind] = useState<"bacheca" | "popup">("bacheca");
    const [fTutti, setFTutti] = useState(true);
    const [fRuoli, setFRuoli] = useState<string[]>([]);
    // ESITI cliccabili (Luca 31/07, mig. 116): risposte a scelta del creatore
    const [fEsiti, setFEsiti] = useState<string[]>([]);
    const [fEsitoNuovo, setFEsitoNuovo] = useState("");
    // esiti EFFETTIVI = chips + l'eventuale testo ancora nell'input (mai
    // scartare in silenzio quello che l'utente ha scritto — caso Luca 07/08:
    // esito digitato senza Invio/+ → pubblicato con esiti null)
    const esitiEffettivi = () => {
        const v = fEsitoNuovo.trim();
        return v && !fEsiti.includes(v) ? [...fEsiti, v] : fEsiti;
    };
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
        // prima le ricevute (nessuna FK a DB): se il delete fallisce ci si
        // ferma, altrimenti resterebbero righe orfane senza comunicazione
        const { error: eRic } = await supabase.from("comunicazioni_ricevute").delete().eq("comunicazione_id", com.id);
        if (eRic) { alert("Eliminazione non riuscita (ricevute): " + eRic.message); return; }
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
        // cintura: "Tutti" non deve MAI partire da chi non ha il permesso
        // (il chip è già nascosto: questa è la doppia sicurezza sul submit)
        if (fTutti && !puoTutti) { setError("Non hai il permesso di inviare a tutta l'azienda: scegli i destinatari."); return; }
        // ⚠️ CINTURA sugli esclusi: togliendoli TUTTI la lista resterebbe
        // vuota, e una lista vuota per il CRM vuol dire «nessun filtro» —
        // cioè la comunicazione partirebbe a TUTTA l'azienda. Meglio fermarsi.
        if (esclusi.length && destinatariFinali.length === 0) {
            setError("Hai tolto tutti i destinatari: rimettine almeno uno, oppure cambia i filtri.");
            return;
        }
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
        // MOD-19: tipo SPRINT → si pesca la frase dal CALDERONE (la meno usata,
        // spareggio: uso più vecchio), si CONGELA sulla comunicazione (tutti
        // vedono la stessa) e si aggiorna usi/ultimo_uso: mai ripetuta finché
        // il giro non si esaurisce, poi si riparte dalle meno recenti.
        let sprintFrase: string | null = null;
        if (fType === "sprint") {
            try {
                const fraseScelta = fSprintScelta === "scelta" ? fSprintFrase.trim() : "";
                if (fraseScelta) {
                    // frase MIRATA (task Francesco 10/08): si congela quella scelta
                    // e si aggiornano comunque i contatori d'uso della riga
                    sprintFrase = fraseScelta;
                    const { data: fr } = await supabase.from("sprint_frasi")
                        .select("id, usi").eq("testo", fraseScelta).limit(1);
                    if (fr && fr[0]) await supabase.from("sprint_frasi")
                        .update({ usi: (Number(fr[0].usi) || 0) + 1, ultimo_uso: new Date().toISOString() })
                        .eq("id", fr[0].id);
                } else {
                    const { data: fr } = await supabase.from("sprint_frasi")
                        .select("id, testo, usi").eq("attivo", true)
                        .order("usi", { ascending: true })
                        .order("ultimo_uso", { ascending: true, nullsFirst: true })
                        .limit(1);
                    if (fr && fr[0]) {
                        sprintFrase = fr[0].testo;
                        await supabase.from("sprint_frasi")
                            .update({ usi: (Number(fr[0].usi) || 0) + 1, ultimo_uso: new Date().toISOString() })
                            .eq("id", fr[0].id);
                    }
                }
            } catch { /* calderone non migrato: comunicazione senza frase */ }
        }
        const { error: e } = await supabase.from("comunicazioni").insert({
            ...(sprintFrase ? { sprint_frase: sprintFrase } : {}),
            title: fTitle.trim(),
            content: fContent.trim(),
            content_html: fContent.trim() && fContentHtml.trim() ? fContentHtml : null,
            type: fType,
            size: fSize,   // mig. 147
            allegati: fAllegati,
            kind: fKind,
            // ESCLUSIONI (Luca 27/08): se ho tolto qualcuno, la comunicazione
            // smette di essere «per ruolo/negozio/brand» e diventa la LISTA
            // esatta delle persone rimaste. È l'unico modo per cui l'escluso
            // non la riceva: le regole per ruolo lo riprenderebbero dentro.
            // Conseguenza da sapere: chi viene assunto domani NON la riceve.
            ...(esclusi.length ? {
                target_roles: null, target_stores: null, target_brands: null,
                target_users: destinatariFinali.map((u) => u.id),
            } : {
                target_roles: fTutti || !ruoliTarget.length ? null : ruoliTarget,
                target_stores: fTutti || !fNegozi.length ? null : fNegozi,
                target_users: fTutti || !idsTarget.length ? null : idsTarget,
                target_brands: fTutti || !fBrand.length ? null : fBrand,
            }),
            esiti: esitiEffettivi().length ? esitiEffettivi() : null,
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
        setFTitle(""); setFContent(""); setFContentHtml(""); setFType("info"); setFKind("bacheca"); setFTutti(puoTutti); azzeraTarget(); setFEsiti([]); setFEsitoNuovo(""); setFSize("piccola"); setFAllegati([]); setFSprintScelta("caso"); setFSprintFrase("");
        fetchAll();
    };

    // ── DESTINATARI = "quante inviate" (03/08): platea degli utenti attivi col
    //    loro contesto (negozi assegnati, brand del punto vendita) — la stessa
    //    regola comunicazionePerMe del popup, applicata a tutti in blocco.
    const [platea, setPlatea] = useState<{ id: string; nome: string; role: string; negozio: string; negozi: string[]; brands: string[] }[] | null>(null);
    useEffect(() => {
        if (platea) return;
        // serve anche col FORM aperto: l'anteprima destinatari (Luca 04/08)
        if (!isAdminRicevute && !formOpen && !list.some((c) => c.created_by === user?.id)) return;
        (async () => {
            const [u, us, ub] = await Promise.all([
                supabase.from("app_users").select("id, full_name, role, primary_store").eq("active", true),
                supabase.from("user_stores").select("user_id, store_name"),
                // i brand sono PER UTENTE (user_brands, mig. 112): stores.brands
                // è vuota da sempre — con lei il contatore per brand faceva 0
                supabase.from("user_brands").select("user_id, brand"),
            ]);
            const negoziDi = new Map<string, string[]>();
            ((us.data ?? []) as { user_id: string; store_name: string }[]).forEach((r) => {
                const a = negoziDi.get(r.user_id) || []; a.push(r.store_name); negoziDi.set(r.user_id, a);
            });
            const brandsDi = new Map<string, string[]>();
            ((ub.data ?? []) as { user_id: string; brand: string | null }[]).forEach((r) => {
                if (!r.brand) return;
                const a = brandsDi.get(r.user_id) || []; a.push(String(r.brand)); brandsDi.set(r.user_id, a);
            });
            setPlatea(((u.data ?? []) as { id: string; full_name?: string | null; role: string | null; primary_store: string | null }[]).map((x) => ({
                id: x.id, nome: x.full_name || "", role: x.role || "", negozio: x.primary_store || "",
                negozi: negoziDi.get(x.id) || [],
                brands: brandsDi.get(x.id) || [],
            })));
        })();
    }, [platea, isAdminRicevute, formOpen, list, user?.id]);

    // ── ANTEPRIMA DESTINATARI nel form (Luca 04/08): "mandavo ai caller e non
    //    vedevo CHI la riceve, lo scoprivo solo dopo l'invio". Replica in
    //    memoria la STESSA risoluzione del submit (ambito incluso) sulla
    //    platea, così i nomi si vedono PRIMA di pubblicare.
    // selezione ancora vuota: NIENTE elenco (a target vuoti comunicazionePerMe
    // direbbe "tutti" e l'anteprima mostrava l'intera azienda a chi non può —
    // screenshot dello store manager, Luca 04/08). L'invio a vuoto era già
    // bloccato: era solo l'anteprima a ingannare.
    const selezioneVuota = !fTutti && !fRuoli.length && !fPersone.length && !fNegozi.length && !fBrand.length;
    /* ── TOGLIERE QUALCUNO DALLA LISTA (Luca 27/08) ───────────────────────
       I filtri fanno la platea, ma quasi sempre c'è l'eccezione: «tutti i
       consulenti tranne due». Prima l'unica strada era rinunciare al filtro
       e selezionare 28 persone a mano. Qui si toglie con una ✕ sul nome.
       Gli esclusi si azzerano se cambio i filtri: la lista è un'altra, e
       tenere esclusioni vecchie su una platea nuova sarebbe un trabocchetto. */
    const [esclusi, setEsclusi] = useState<string[]>([]);
    useEffect(() => { setEsclusi([]); }, [fTutti, fRuoli, fPersone, fNegozi, fBrand]);
    const anteprimaDestinatari = useMemo(() => {
        if (!formOpen || !platea) return null;
        if (selezioneVuota) return [];
        let ruoliTarget = fTutti ? [] : [...fRuoli];
        let idsAmbito: string[] = [];
        const ruoliAmbito = ruoliTarget.filter((r) => destinatarioSoloAmbito(role, r, perms));
        if (ruoliAmbito.length && !ambitoMittente.seesAll) {
            ruoliTarget = ruoliTarget.filter((r) => !ruoliAmbito.includes(r));
            const negoziMiei = ambitoMittente.stores.length ? ambitoMittente.stores : (user?.negozio ? [user.negozio] : []);
            idsAmbito = platea.filter((u) => ruoliAmbito.includes(u.role)
                && [...u.negozi, ...(u.negozio ? [u.negozio] : [])].some((s) => negoziMiei.some((m) => sameStore(s, m)))).map((u) => u.id);
        }
        const idsPersone = fTutti ? [] : platea.filter((u) => fPersone.includes(u.nome)).map((u) => u.id);
        const idsTarget = [...new Set([...idsPersone, ...idsAmbito])];
        const pseudo = {
            target_roles: fTutti || !ruoliTarget.length ? null : ruoliTarget,
            target_stores: fTutti || !fNegozi.length ? null : fNegozi,
            target_users: fTutti || !idsTarget.length ? null : idsTarget,
            target_brands: fTutti || !fBrand.length ? null : fBrand,
        } as unknown as Comunicazione;
        return platea
            .filter((u) => comunicazionePerMe(pseudo, { userId: u.id, role: u.role, negozio: u.negozio, negozi: u.negozi, brandsNegozio: u.brands }))
            .sort((a, b) => a.nome.localeCompare(b.nome));
    }, [formOpen, platea, selezioneVuota, fTutti, fRuoli, fPersone, fNegozi, fBrand, role, perms, ambitoMittente, user?.negozio]);
    /** chi la riceve davvero: l'anteprima meno chi ho tolto a mano */
    const destinatariFinali = useMemo(
        () => (anteprimaDestinatari || []).filter((u) => !esclusi.includes(u.id)),
        [anteprimaDestinatari, esclusi]);

    const destinatariSet = useCallback((c: Comunicazione): Set<string> | null => {
        if (!platea) return null;
        return new Set(platea.filter((u) => comunicazionePerMe(c, { userId: u.id, role: u.role, negozio: u.negozio, negozi: u.negozi, brandsNegozio: u.brands })).map((u) => u.id));
    }, [platea]);
    const destinatariDi = useCallback((c: Comunicazione): number | null => {
        const s = destinatariSet(c);
        return s ? s.size : null;
    }, [destinatariSet]);

    // l'AUTORE non conta tra letture/conferme della propria comunicazione.
    // E nemmeno i NON-destinatari (caso Claudia 03/08): l'amministrazione vede
    // tutte le comunicazioni e aprendole scrive comunque la lettura, ma nella
    // tabella e nei numeri contano SOLO i destinatari veri della platea.
    const contatori = useCallback((com: Comunicazione) => {
        const dset = destinatariSet(com);
        const r = ricevute.filter((x) => x.comunicazione_id === com.id
            && (!com.created_by || x.user_id !== com.created_by)
            && (!dset || dset.has(x.user_id)));
        return {
            letture: r.filter((x) => x.letto_il).length,
            conferme: r.filter((x) => x.confermato_il).length,
            // "rinviata" = ha premuto Più tardi e non ha ancora confermato
            rinviate: r.filter((x) => x.rinviato_il && !x.confermato_il).length,
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ricevute, platea]);


    const inputStyle = "w-full bg-black/40 border border-white/10 rounded-xl text-slate-100 text-sm py-2.5 px-3.5 outline-none focus:border-violet-500/50";

    return (
        <div className="w-full max-w-4xl mx-auto">
            <div className="mb-8 flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <h2 className="text-3xl font-bold text-white mb-2">Comunicazioni</h2>
                    <p className="text-slate-400">Avvisi e aggiornamenti importanti dal back office</p>
                </div>
                <div className="flex items-center gap-2.5">
                    {/* CALDERONE in bella vista (segnalazione Luca 10/08: "non vedo
                        il pannello" — stava solo dentro il form col tipo Sprint) */}
                    {canCreate && (
                        <button
                            type="button"
                            onClick={() => { setFrasiOpen(true); caricaFrasi(); }}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-amber-400/40 bg-amber-400/10 hover:bg-amber-400/20 text-amber-200 text-sm font-bold transition-colors"
                        >
                            🔥 Calderone Sprint
                        </button>
                    )}
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
                        const taglia = stileTaglia(com.size);   // taglie v2 (mig. 158): card normale, testi che crescono
                        const isPopup = com.kind === "popup";
                        // bacheca: chiusa finche' non la si apre (i popup restano estesi:
                        // la loro lettura passa gia' dal pop-up con conferma)
                        const collassata = !isPopup && !aperte.has(com.id);
                        const perMe = comunicazionePerMe(com, { userId: user?.id, role, negozio: user?.negozio, negozi: mieiAssegnati, brandsNegozio });
                        const vedeRicevute = isAdminRicevute || mia;
                        const cnt = vedeRicevute ? contatori(com) : null;
                        const dsetCom = espansa === com.id ? destinatariSet(com) : null;
                        const dettaglio = espansa === com.id
                            ? ricevute.filter((r) => r.comunicazione_id === com.id && r.letto_il && r.user_id !== com.created_by && (!dsetCom || dsetCom.has(r.user_id)))
                                .sort((a, b) => (b.confermato_il || b.letto_il || "").localeCompare(a.confermato_il || a.letto_il || ""))
                            : [];
                        return (
                            <div
                                key={com.id}
                                ref={(el) => { if (el) cardRefs.current.set(com.id, el); else cardRefs.current.delete(com.id); }}
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                    if (isPopup) { if (!read) scriviRicevuta(com.id, false); return; }
                                    const apre = !aperte.has(com.id);
                                    setAperte((p) => { const n = new Set(p); if (apre) n.add(com.id); else n.delete(com.id); return n; });
                                    // BUONA NOTIZIA (03/08): coriandoli anche aprendo dalla bacheca
                                    if (apre && com.type === "success") { setFesta(com.id); setTimeout(() => setFesta(null), 3600); }
                                    // 💣 NOVITA' (04/08): esplosione one-shot per utente+comunicazione,
                                    // stesso guard localStorage del popup
                                    if (apre && com.type === "novita" && user?.id) {
                                        const k = `bomba_vista_${user.id}_${com.id}`;
                                        let vista = false;
                                        try { vista = !!localStorage.getItem(k); if (!vista) localStorage.setItem(k, new Date().toISOString()); } catch { /* one-shot solo di sessione */ }
                                        if (!vista) { setBomba(com.id); setTimeout(() => setBomba(null), 3000); }
                                    }
                                    // MOD-19: scenico a tutta pagina anche per sprint/update/warning
                                    // (una volta per utente+comunicazione, come la bomba)
                                    if (apre && (com.type === "sprint" || com.type === "update" || com.type === "warning") && user?.id) {
                                        const k2 = `fx_visto_${user.id}_${com.id}`;
                                        let vista2 = false;
                                        try { vista2 = !!localStorage.getItem(k2); if (!vista2) localStorage.setItem(k2, new Date().toISOString()); } catch { /* di sessione */ }
                                        if (!vista2) { setScenico({ id: com.id, t: com.type }); setTimeout(() => setScenico(null), com.type === "sprint" ? 4200 : com.type === "update" ? 3600 : 1800); }
                                    }
                                    if (apre && !read) scriviRicevuta(com.id, false);   // APRIRE = leggere
                                }}
                                onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !isPopup && !aperte.has(com.id)) { setAperte((p) => new Set(p).add(com.id)); if (!read) scriviRicevuta(com.id, false); } }}
                                className={cn(
                                    "glass-card p-6 relative overflow-hidden transition-all cursor-pointer",
                                    !read && "border-l-4 border-l-primary",
                                    com.type === "warning" && "border border-rose-500/30 bg-gradient-to-br from-rose-500/[0.08] to-transparent",
                                    com.type === "success" && "bg-gradient-to-br from-emerald-500/[0.08] via-transparent to-fuchsia-500/[0.07]",
                                    com.type === "update" && "bg-gradient-to-br from-violet-500/[0.08] to-transparent",
                                    com.type === "novita" && "bg-gradient-to-br from-orange-500/[0.10] via-transparent to-red-500/[0.07]",
                                    com.type === "sprint" && "border border-amber-400/40 bg-gradient-to-br from-amber-400/[0.10] via-transparent to-yellow-500/[0.07]",
                                    !collassata && com.type === "warning" && "anim-bordo-rosso",
                                    // MOD-37: da APERTA la card è un mondo scuro anche in tema
                                    // chiaro (isola com-scura + fondo scuro, vedi globals.css)
                                    !collassata && "com-scura com-espansa"
                                )}
                            >
                                {/* SFONDO VIVO (Luca 03/08): da aperta, il genere si muove —
                                    coriandoli+fuochi, stelle, hazard o riflesso cromato */}
                                {!collassata && <SfondoComunicazione genere={com.type} />}
                                {/* filigrana decorativa per tipo (03/08) */}
                                {com.type === "success" && <span aria-hidden className="absolute -right-3 -bottom-4 text-[90px] opacity-[0.08] rotate-12 pointer-events-none select-none">🎉</span>}
                                {com.type === "update" && <span aria-hidden className="absolute -right-3 -bottom-4 text-[90px] opacity-[0.07] rotate-12 pointer-events-none select-none">🚀</span>}
                                {com.type === "warning" && <span aria-hidden className="absolute -right-3 -bottom-4 text-[90px] opacity-[0.07] rotate-12 pointer-events-none select-none">🚨</span>}
                                {com.type === "novita" && <span aria-hidden className="absolute -right-3 -bottom-4 text-[90px] opacity-[0.08] rotate-12 pointer-events-none select-none">💣</span>}
                                {com.type === "sprint" && <span aria-hidden className="absolute -right-3 -bottom-4 text-[90px] opacity-[0.09] rotate-12 pointer-events-none select-none">🔥</span>}
                                {festa === com.id && <Confetti />}
                                {bomba === com.id && <EsplosioneBomba />}
                                {scenico?.id === com.id && scenico.t === "sprint" && <SprintStart />}
                                {scenico?.id === com.id && scenico.t === "update" && <RazzoUpdate />}
                                {scenico?.id === com.id && scenico.t === "warning" && <ImpulsoOnde tipo="warning" />}
                                {/* z-10 (COM-04): il wrapper `relative` del contenuto qui sotto
                                    viene dopo nel DOM e copriva cestino e badge — i click sul
                                    Trash2 finivano sulla card che si apriva/chiudeva */}
                                <div className="absolute top-6 right-6 z-10 flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
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

                                <div className="relative flex gap-4">
                                    <div className={cn("shrink-0 w-12 h-12 rounded-xl flex items-center justify-center border", styles.bg, styles.border, styles.color, !collassata && com.type === "warning" && "anim-scossa")}>
                                        <Icon className="w-6 h-6" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="mb-1">
                                            <h3 className={cn(taglia.titoloCard, !read ? "text-white" : "text-slate-200")}>
                                                {taglia.prefisso}{com.title}
                                            </h3>
                                            <p className="text-sm text-slate-500">
                                                {com.date_display}
                                                {com.created_by_name ? ` — ${com.created_by_name}` : ""}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 flex-wrap mt-1.5">
                                            {com.type === "warning" && (
                                                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">🚨 Urgente</span>
                                            )}
                                            {com.type === "update" && (
                                                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/40">🚀 Update</span>
                                            )}
                                            {com.type === "novita" && (
                                                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/40">💣 Novità</span>
                                            )}
                                            {com.type === "sprint" && (
                                                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/40">🔥 Sprint</span>
                                            )}
                                            {com.type === "success" && (
                                                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">🎉 Buona notizia</span>
                                            )}
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
                                        {/* MOD-19: la frase del calderone in testa al messaggio Sprint */}
                                        {!collassata && com.type === "sprint" && (com as { sprint_frase?: string | null }).sprint_frase && (
                                            <div className="mt-3 text-base font-black" style={{ color: "#fde047", textShadow: "0 0 16px rgba(251,191,36,.6)" }}>
                                                🔥 {(com as { sprint_frase?: string | null }).sprint_frase}
                                            </div>
                                        )}
                                        {collassata ? (
                                            <p className="text-xs text-slate-500 mt-2 italic select-none">▾ Clicca per leggere il contenuto{com.esiti?.length ? " e rispondere" : ""}</p>
                                        ) : (
                                            com.content_html ? (
                                                <div className={cn("testo-ricco mt-3 leading-relaxed", taglia.corpoCard)}
                                                    dangerouslySetInnerHTML={{ __html: sanificaHtml(com.content_html) }} />
                                            ) : (
                                            <p className={cn("mt-3 leading-relaxed whitespace-pre-wrap", taglia.corpoCard)}>
                                                {com.content}
                                            </p>
                                            )
                                        )}
                                        {/* ALLEGATI (mig. 147): apribili anche PRIMA di confermare */}
                                        {!collassata && (com.allegati?.length ?? 0) > 0 && (
                                            <div className="flex items-center gap-2 flex-wrap mt-3" onClick={(e) => e.stopPropagation()}>
                                                {com.allegati!.map((a) => (
                                                    <a key={a.url} href={a.url} target="_blank" rel="noreferrer"
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/15 bg-white/[0.05] text-slate-200 text-xs font-bold hover:bg-white/10">
                                                        📎 {a.name}
                                                    </a>
                                                ))}
                                            </div>
                                        )}

                                        {!collassata && <div className="mt-4 flex items-center gap-3 flex-wrap" onClick={(e) => e.stopPropagation()}>
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
                                                    onClick={() => { setEspansa(espansa === com.id ? null : com.id); setDettFiltro("tutti"); }}
                                                    className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
                                                    title="Chi l'ha letta / confermata"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                    {/* VISIBILITÀ POST-INVIO (03/08): inviate = destinatari della
                                                        platea; apparse = viste a display; rinviate = "Più tardi"
                                                        senza ancora una conferma (mig. 141) */}
                                                    {(() => { const dest = destinatariDi(com); return dest == null ? "" : `📤 ${dest} inviat${dest === 1 ? "a" : "e"} · `; })()}
                                                    {isPopup || com.esiti?.length
                                                        ? `👁 ${cnt.letture} ${isPopup ? (cnt.letture === 1 ? "apparsa" : "apparse") : (cnt.letture === 1 ? "lettura" : "letture")} · ✓ ${cnt.conferme} confermat${cnt.conferme === 1 ? "a" : "e"}${isPopup ? ` · ⏰ ${cnt.rinviate} rinviat${cnt.rinviate === 1 ? "a" : "e"}` : ""}`
                                                        : `${cnt.letture} lettur${cnt.letture === 1 ? "a" : "e"}`}
                                                    <span className="text-[10px]">{espansa === com.id ? "▲" : "▼"}</span>
                                                </button>
                                            )}
                                        </div>}

                                        {espansa === com.id && vedeRicevute && !collassata && (
                                            <div className="mt-3 rounded-xl border border-white/10 bg-black/30 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                                                {/* CONTATORI CLICCABILI (03/08): filtrano l'elenco; "mai apparsa"
                                                    = destinatari senza lettura, cioe' chi non ha ancora fatto login */}
                                                {(() => {
                                                    const dset = destinatariSet(com);
                                                    const dTot = dset ? dset.size : null;
                                                    const maiN = dset ? [...dset].filter((id) => !dettaglio.some((r) => r.user_id === id)).length : null;
                                                    const chips = [
                                                        { k: "tutti", l: `📤 Inviate${dTot != null ? ` ${dTot}` : ""}` },
                                                        { k: "apparse", l: `👁 ${isPopup ? "Apparse" : "Lette"} ${cnt!.letture}` },
                                                        ...(isPopup || com.esiti?.length ? [{ k: "confermate", l: `✓ Confermate ${cnt!.conferme}` }] : []),
                                                        ...(isPopup ? [{ k: "rinviate", l: `⏰ Rinviate ${cnt!.rinviate}` }] : []),
                                                        ...(maiN != null ? [{ k: "mai", l: `🚫 Mai apparse ${maiN}` }] : []),
                                                    ] as { k: typeof dettFiltro; l: string }[];
                                                    return (
                                                        <div className="flex gap-1.5 flex-wrap p-2.5 border-b border-white/10 bg-white/[0.02]">
                                                            {chips.map((c) => (
                                                                <button key={c.k} type="button" onClick={() => setDettFiltro(dettFiltro === c.k ? "tutti" : c.k)}
                                                                    className={cn("px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors",
                                                                        dettFiltro === c.k ? "border-violet-400/70 bg-violet-500/20 text-violet-100" : "border-white/10 text-slate-400 hover:border-white/25")}>
                                                                    {c.l}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    );
                                                })()}
                                                {dettFiltro === "mai" ? (() => {
                                                    const dset = destinatariSet(com);
                                                    const mai = dset ? (platea || []).filter((u) => dset.has(u.id) && !dettaglio.some((r) => r.user_id === u.id)) : [];
                                                    return mai.length === 0
                                                        ? <div className="p-3 text-sm text-slate-500">Nessuno: è apparsa a tutti i destinatari. 🎉</div>
                                                        : mai.map((u) => (
                                                            <div key={u.id} className="flex items-center gap-3 px-3.5 py-2 border-b border-white/5 last:border-b-0 text-sm">
                                                                <span className="text-slate-200 font-medium">{u.nome || u.id}</span>
                                                                <span className="ml-auto text-xs text-rose-300/90">🚫 mai apparsa — non ha ancora fatto login</span>
                                                            </div>
                                                        ));
                                                })() : dettaglio
                                                    .filter((r) => dettFiltro === "tutti" ? true
                                                        : dettFiltro === "apparse" ? !!r.letto_il
                                                            : dettFiltro === "confermate" ? !!r.confermato_il
                                                                : dettFiltro === "rinviate" ? (!!r.rinviato_il && !r.confermato_il) : true)
                                                    .length === 0 ? (
                                                    <div className="p-3 text-sm text-slate-500">Nessuno in questo stato.</div>
                                                ) : dettaglio
                                                    .filter((r) => dettFiltro === "tutti" ? true
                                                        : dettFiltro === "apparse" ? !!r.letto_il
                                                            : dettFiltro === "confermate" ? !!r.confermato_il
                                                                : dettFiltro === "rinviate" ? (!!r.rinviato_il && !r.confermato_il) : true)
                                                    .map((r) => (
                                                    <div key={r.user_id} className="flex items-center gap-3 px-3.5 py-2 border-b border-white/5 last:border-b-0 text-sm">
                                                        <span className="text-slate-200 font-medium">{r.user_name || r.user_id}</span>
                                                        <span className="ml-auto text-xs text-slate-500">
                                                            letta {r.letto_il ? new Date(r.letto_il).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
                                                        </span>
                                                        {/* l'ESITO scelto (mig. 116): chi ha cliccato cosa */}
                                                        {r.esito && (
                                                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30">{r.esito}</span>
                                                        )}
                                                        {!!r.rinvii && !r.confermato_il && (
                                                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30" title={r.rinviato_il ? `ultimo rinvio: ${new Date(r.rinviato_il).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : undefined}>
                                                                ⏰ rinviata ×{r.rinvii}
                                                            </span>
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
            {/* CALDERONE a livello pagina (10/08): si apre dal bottone in testata, senza passare dal form */}
            {frasiOpen && (
                <div className="fixed inset-0 bg-black/70 z-[1300] flex items-center justify-center p-4" onClick={() => setFrasiOpen(false)} role="dialog" aria-modal="true">
                    <div className="bg-[#12141f] border border-amber-400/30 rounded-2xl w-[min(720px,94vw)] max-h-[85vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between py-4 px-5 border-b border-white/10">
                            <div>
                                <h3 className="text-base font-bold text-white">🔥 Calderone frasi Sprint</h3>
                                <p className="text-[11px] text-slate-500 mt-0.5">Ordinate dalle meno usate (le prossime a uscire). Spegnere ≠ cancellare: la frase resta ma non esce più.</p>
                            </div>
                            <button type="button" onClick={() => setFrasiOpen(false)} className="text-slate-500 hover:text-white"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-5 flex gap-2 border-b border-white/5">
                            <input value={fraseNuova} onChange={(e) => setFraseNuova(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); aggiungiFrase(); } }}
                                placeholder="Nuova frase motivazionale… (Invio per aggiungere)"
                                className="flex-1 bg-white/[0.05] border border-white/10 rounded-lg text-slate-100 text-sm py-2 px-3 outline-none" />
                            <button type="button" onClick={aggiungiFrase}
                                className="px-4 rounded-lg border border-amber-400/40 bg-amber-400/10 text-amber-200 text-sm font-bold hover:bg-amber-400/20">＋ Aggiungi</button>
                        </div>
                        {frasiErr && <div className="mx-5 mt-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">{frasiErr}</div>}
                        <div className="flex-1 overflow-y-auto p-5 space-y-1.5">
                            {frasi.map((f) => (
                                <div key={f.id} className={cn("flex items-center gap-2.5 rounded-lg border px-3 py-2", f.attivo ? "bg-white/[0.03] border-white/10" : "bg-white/[0.01] border-white/5 opacity-50")}>
                                    <input defaultValue={f.testo}
                                        onBlur={(e) => { const t = e.target.value.trim(); if (t && t !== f.testo) salvaFrase(f.id, { testo: t }); }}
                                        className="flex-1 bg-transparent border-0 outline-none text-sm text-slate-100 min-w-0" />
                                    <span className="text-[10px] text-slate-500 shrink-0 font-mono" title="Quante volte è uscita">{f.usi}×</span>
                                    <button type="button" onClick={() => salvaFrase(f.id, { attivo: !f.attivo })}
                                        title={f.attivo ? "Spegni: non esce più" : "Riaccendi"}
                                        className={cn("text-[10px] font-bold px-2 py-1 rounded shrink-0 border", f.attivo ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/30" : "text-slate-400 bg-white/5 border-white/10")}>
                                        {f.attivo ? "attiva" : "spenta"}
                                    </button>
                                </div>
                            ))}
                            {!frasi.length && !frasiErr && <p className="text-sm text-slate-500 text-center py-6">Calderone vuoto.</p>}
                        </div>
                        <div className="py-3 px-5 border-t border-white/10 text-[11px] text-slate-500">{frasi.filter((f) => f.attivo).length} frasi attive · {frasi.length} totali</div>
                    </div>
                </div>
            )}
            {formOpen && (
                <div className="fixed inset-0 bg-black/70 z-[1200] flex items-center justify-center p-4" onClick={() => setFormOpen(false)} role="dialog" aria-modal="true">
                    <div className="bg-[#12141f] border border-white/10 rounded-2xl w-[min(1500px,96vw)] h-[92vh] shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between py-5 px-6 border-b border-white/10">
                            <h3 className="text-lg font-bold text-white">Nuova comunicazione</h3>
                            <button type="button" onClick={() => setFormOpen(false)} className="text-slate-500 hover:text-white"><X className="w-5 h-5" /></button>
                        </div>
                        {/* EDITOR a sinistra, DESTINATARI a destra (03/08): niente
                            pagina scrollabile all'infinito, due colonne indipendenti */}
                        <div className="flex-1 grid grid-cols-1 xl:grid-cols-[1.35fr_1fr] min-h-0">
                        <div className="p-6 space-y-5 overflow-y-auto xl:border-r xl:border-white/5">
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
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Testo <span className="normal-case font-normal">— grassetto, colori, elenchi, emoji: formatta come vuoi</span></label>
                                <EditorRicco emojiRapide={EMOJI_RAPIDE} minHeight={240}
                                    placeholder="Il contenuto della comunicazione…"
                                    onChange={(html, testo) => { setFContentHtml(html); setFContent(testo); }} />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Aspetto</label>
                                <div className="flex gap-2 mt-2">
                                    {([["info", "ℹ️ Info"], ["novita", "💣 Novità"], ["update", "🚀 Update"], ["warning", "🚨 Urgente"], ["success", "🎉 Buone notizie"], ["sprint", "🔥 Sprint"]] as const).map(([t, l]) => (
                                        <button key={t} type="button" onClick={() => setFType(t)}
                                            className={cn("px-3.5 py-1.5 rounded-full border text-sm transition-all",
                                                fType === t ? "border-violet-500 bg-violet-500/10 text-white" : "border-white/10 text-slate-400 hover:border-white/25")}>
                                            {l}
                                        </button>
                                    ))}
                                </div>
                                {/* Frase Sprint: casuale dal calderone (default) OPPURE scelta
                                    mirata dalla tendina ricercabile (task Francesco, ok Luca 10/08) */}
                                {fType === "sprint" && (
                                    <div className="mt-2 space-y-2">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {([["caso", "🎲 Frase casuale"], ["scelta", "🎯 Seleziona frase specifica"]] as const).map(([m, l]) => (
                                                <button key={m} type="button"
                                                    onClick={() => { setFSprintScelta(m); if (m === "scelta" && !frasi.length) caricaFrasi(); }}
                                                    className={cn("px-3 py-1.5 rounded-full border text-[12px] font-bold transition-all",
                                                        fSprintScelta === m ? "border-amber-400/70 bg-amber-400/15 text-amber-200" : "border-white/10 text-slate-400 hover:border-white/25")}>
                                                    {l}
                                                </button>
                                            ))}
                                            <button type="button" onClick={() => { setFrasiOpen(true); caricaFrasi(); }}
                                                className="px-2.5 py-1 rounded-lg border border-amber-400/40 bg-amber-400/10 text-amber-200 text-[11px] font-bold hover:bg-amber-400/20">
                                                Gestisci il calderone
                                            </button>
                                        </div>
                                        {fSprintScelta === "scelta" && (
                                            <SelectOpzioni value={fSprintFrase} onChange={setFSprintFrase}
                                                opzioni={frasi.filter((f) => f.attivo).map((f) => f.testo)}
                                                maxVoci={500} placeholder="Scrivi per cercare la frase da inviare…"
                                                className="glass-input rounded-xl py-2 w-full" />
                                        )}
                                        <div className="text-[11px] text-amber-300/90">
                                            {fSprintScelta === "caso"
                                                ? "🔥 La frase motivazionale si pesca da sola dal calderone (mai ripetuta) e appare sopra la comunicazione."
                                                : "🎯 La frase scelta appare sopra la comunicazione; se la lasci vuota si torna al pescaggio automatico."}
                                        </div>
                                    </div>
                                )}
                                {/* MOD-19: pannello CALDERONE — lista, attiva/spegni, modifica, aggiungi */}
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Dimensione</label>
                                <div className="flex gap-2 mt-2">
                                    {([["piccola", "Piccola"], ["normale", "Normale"], ["grande", "📢 Grande — quasi tutto lo schermo"]] as const).map(([sz, l]) => (
                                        <button key={sz} type="button" onClick={() => setFSize(sz)}
                                            className={cn("px-3.5 py-1.5 rounded-full border text-sm transition-all",
                                                fSize === sz ? "border-violet-500 bg-violet-500/10 text-white" : "border-white/10 text-slate-400 hover:border-white/25")}>
                                            {l}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Allegati <span className="normal-case font-normal">(chi riceve può aprirli anche PRIMA di confermare)</span></label>
                                <div className="flex items-center gap-2 mt-2 flex-wrap">
                                    <label className={cn("px-4 py-2 rounded-xl border border-white/15 text-slate-300 text-sm font-bold cursor-pointer hover:bg-white/5", fCaricando && "opacity-50 pointer-events-none")}>
                                        📎 {fCaricando ? "Carico…" : "Aggiungi allegato"}
                                        <input type="file" multiple className="hidden" onChange={(e) => { caricaAllegati(e.target.files); e.target.value = ""; }} />
                                    </label>
                                    {fAllegati.map((a) => (
                                        <span key={a.url} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/15 bg-white/[0.04] text-slate-200 text-sm">
                                            📎 {a.name}
                                            <button type="button" onClick={() => setFAllegati((p) => p.filter((x) => x.url !== a.url))} className="text-slate-500 hover:text-white text-xs">✕</button>
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Esiti cliccabili <span className="normal-case font-normal">(facoltativi — es. &quot;Parteciperò&quot; / &quot;Non parteciperò&quot;)</span></label>
                                <p className="text-[11px] text-slate-500 mt-1">Se li imposti, il destinatario risponde cliccandone uno (che vale come conferma) e tu vedi chi ha scelto cosa nel dettaglio ricevute.</p>
                                <div className="flex gap-2 mt-2">
                                    <input value={fEsitoNuovo} onChange={(e) => setFEsitoNuovo(e.target.value)}
                                        onBlur={aggiungiEsito}
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
                            {/* ANTEPRIMA DESTINATARIO (Luca 02/08): il mittente vede in
                                diretta ESATTAMENTE come arrivera' — il modale di conferma
                                per i pop-up, la card di bacheca per le altre. Solo
                                visuale: i bottoni non fanno nulla. */}
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Anteprima — così la vede chi la riceve</label>
                                <div className="mt-2 rounded-2xl border border-dashed border-white/15 bg-black/30 p-3 sm:p-4 pointer-events-none select-none">
                                    {(() => {
                                        const st = fType === "warning"
                                            ? { color: "var(--tf-fb7185)", bg: "rgba(244,63,94,.12)", border: "rgba(244,63,94,.40)", Icona: AlertTriangle }
                                            : fType === "success"
                                                ? { color: "var(--tf-34d399)", bg: "rgba(52,211,153,.12)", border: "rgba(52,211,153,.35)", Icona: CheckCircle2 }
                                                : fType === "update"
                                                    ? { color: "var(--tf-a78bfa)", bg: "rgba(139,92,246,.12)", border: "rgba(139,92,246,.40)", Icona: Rocket }
                                                    : fType === "novita"
                                                        ? { color: "var(--tf-fb923c)", bg: "rgba(251,146,60,.12)", border: "rgba(249,115,22,.40)", Icona: Bomb }
                                                        : fType === "sprint"
                                                            ? { color: "var(--tf-fbbf24)", bg: "rgba(251,191,36,.12)", border: "rgba(245,158,11,.50)", Icona: Flame }
                                                            : { color: "var(--tf-60a5fa)", bg: "rgba(96,165,250,.12)", border: "rgba(96,165,250,.35)", Icona: Info };
                                        const tg = stileTaglia(fSize);
                                        const titolo = fTitle.trim() || "Titolo della comunicazione";
                                        const testoPuro = fContent.trim() || "Il testo che scrivi sopra comparirà qui.";
                                        const testo = fContent.trim() && fContentHtml.trim()
                                            ? <span className="testo-ricco" dangerouslySetInnerHTML={{ __html: sanificaHtml(fContentHtml) }} />
                                            : testoPuro;
                                        const firma = `${dataDisplayOggi()} — ${user?.name || ""}`;
                                        if (fKind === "popup") return (
                                            // taglia GRANDE (mig. 158): qui riempie il riquadro anteprima
                                            // (il popup vero occupa quasi tutto lo schermo)
                                            <div className={`com-scura relative rounded-2xl border shadow-2xl overflow-hidden mx-auto ${tg.s === "grande" ? "w-full min-h-[420px] flex flex-col" : "max-w-[520px]"}${fType === "warning" ? " anim-bordo-rosso" : ""}`} style={{ background: fondoComunicazione(fType), borderColor: st.border }}>
                                                {/* stessa VIVACITA' del popup vero (Luca 03/08) */}
                                                <SfondoComunicazione genere={fType} />
                                                <div className="relative flex items-start gap-3.5 p-5 pb-3.5">
                                                    <div className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center border${fType === "warning" ? " anim-scossa" : ""}`} style={{ background: st.bg, borderColor: st.border, color: st.color }}>
                                                        <st.Icona className="w-6 h-6" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: st.color }}>Comunicazione da confermare</div>
                                                        <h3 className={tg.titoloPopup}>{tg.prefisso}{titolo}</h3>
                                                        <p className="text-xs text-slate-500 mt-1">{firma}</p>
                                                    </div>
                                                </div>
                                                <div className={cn("relative px-5 pb-4 leading-relaxed whitespace-pre-wrap max-h-[30vh] overflow-hidden",
                                                    tg.s === "grande" ? "flex-1 text-xl font-medium text-slate-100" : tg.s === "normale" ? "text-lg font-medium text-slate-100" : "text-sm text-slate-200")}>{testo}</div>
                                                {fAllegati.length > 0 && (
                                                    <div className="relative px-5 pb-3.5 flex flex-wrap gap-2">
                                                        {fAllegati.map((a) => (
                                                            <span key={a.url} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/15 text-xs font-semibold text-slate-200">📎 {a.name}</span>
                                                        ))}
                                                    </div>
                                                )}
                                                <div className="relative flex items-center justify-between gap-2 flex-wrap px-5 py-3.5 border-t border-white/10 bg-black/20">
                                                    <span className="px-2 py-1 rounded-lg text-[11px] text-slate-500">Più tardi</span>
                                                    <div className="flex items-center justify-end gap-2 flex-wrap">
                                                        {esitiEffettivi().length ? esitiEffettivi().map((e) => (
                                                            <span key={e} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold">{e}</span>
                                                        )) : <span className="px-5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold">✓ Ho letto e confermo</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                        return (
                                            <div className={cn("glass-card p-5 relative overflow-hidden border-l-4 border-l-primary",
                                                fType === "warning" && "border border-rose-500/30 bg-gradient-to-br from-rose-500/[0.08] to-transparent anim-bordo-rosso",
                                                fType === "success" && "bg-gradient-to-br from-emerald-500/[0.08] via-transparent to-fuchsia-500/[0.07]",
                                                fType === "update" && "bg-gradient-to-br from-violet-500/[0.08] to-transparent",
                                                fType === "novita" && "bg-gradient-to-br from-orange-500/[0.10] via-transparent to-red-500/[0.07]",
                                                fType === "sprint" && "border border-amber-400/40 bg-gradient-to-br from-amber-400/[0.10] via-transparent to-yellow-500/[0.07]",
                                                // MOD-37: l'anteprima card replica la card APERTA → stesso mondo scuro
                                                "com-scura com-espansa")}>
                                                {fType === "sprint" && <span aria-hidden className="absolute -right-3 -bottom-4 text-[80px] opacity-[0.09] rotate-12 select-none">🔥</span>}
                                                {fType === "success" && <span aria-hidden className="absolute -right-3 -bottom-4 text-[80px] opacity-[0.08] rotate-12 select-none">🎉</span>}
                                                {fType === "update" && <span aria-hidden className="absolute -right-3 -bottom-4 text-[80px] opacity-[0.07] rotate-12 select-none">🚀</span>}
                                                {fType === "warning" && <span aria-hidden className="absolute -right-3 -bottom-4 text-[80px] opacity-[0.07] rotate-12 select-none">🚨</span>}
                                                {fType === "novita" && <span aria-hidden className="absolute -right-3 -bottom-4 text-[80px] opacity-[0.08] rotate-12 select-none">💣</span>}
                                                <SfondoComunicazione genere={fType} />
                                                <div className="absolute top-5 right-5 flex items-center gap-2">
                                                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                                                    <span className="text-xs font-semibold text-primary uppercase tracking-wider">Nuovo</span>
                                                </div>
                                                <div className="relative flex gap-3.5">
                                                    <div className={cn("shrink-0 w-11 h-11 rounded-xl flex items-center justify-center border", fType === "warning" && "anim-scossa")} style={{ background: st.bg, borderColor: st.border, color: st.color }}>
                                                        <st.Icona className="w-6 h-6" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <h3 className={cn(tg.titoloCard, "text-white")}>{tg.prefisso}{titolo}</h3>
                                                        <p className="text-sm text-slate-500">{firma}</p>
                                                        <p className={cn("mt-2.5 leading-relaxed whitespace-pre-wrap", tg.s === "piccola" ? "text-sm text-slate-300" : tg.corpoCard)}>{testo}</p>
                                                        {/* esiti DOPO il testo (fix Luca 08/08: nell'anteprima
                                                            comparivano prima del testo; al destinatario invece
                                                            arrivano in coda, come nella card bacheca reale) */}
                                                        {esitiEffettivi().length > 0 && (
                                                            <div className="flex items-center gap-2 flex-wrap mt-3">
                                                                {esitiEffettivi().map((e) => (
                                                                    <span key={e} className="px-3 py-1 rounded-full border border-sky-500/40 bg-sky-500/10 text-sky-200 text-xs font-bold">{e}</span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                                <p className="text-[11px] text-slate-600 mt-1.5">La campanella in alto squilla per chi rientra nei destinatari{fKind === "popup" ? "; il pop-up compare al centro dello schermo appena aprono il CRM" : ""}.</p>
                            </div>
                            </div>
                            {/* ── colonna DESTRA: destinatari ── */}
                            <div className="p-6 space-y-5 overflow-y-auto">
                            <p className="text-sm font-black text-white uppercase tracking-widest">📬 Destinatari</p>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Per ruolo</label>
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
                                            maxVoci={200}
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
                                        maxVoci={300}
                                        className="w-full mt-2 bg-black/40 border border-white/10 rounded-xl text-sm py-2.5 px-3.5"
                                    />
                                </div>
                            </div>
                            {puoTutti && <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">…per brand <span className="normal-case font-normal">(chi ha il brand tra i suoi)</span></label>
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
                            {/* CHI LA RICEVE, prima di pubblicare (Luca 04/08) */}
                            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                        👥 Riceveranno questa comunicazione{anteprimaDestinatari ? ` — ${destinatariFinali.length}` : ""}
                                        {esclusi.length > 0 && <span className="text-amber-300 normal-case font-semibold"> · {esclusi.length} {esclusi.length === 1 ? "tolto" : "tolti"}</span>}
                                    </p>
                                    {esclusi.length > 0 && (
                                        <button type="button" onClick={() => setEsclusi([])}
                                            className="text-[11px] font-semibold text-slate-400 hover:text-white underline underline-offset-2">
                                            rimetti tutti
                                        </button>
                                    )}
                                </div>
                                {!anteprimaDestinatari ? (
                                    <p className="text-[11px] text-slate-500 mt-1.5">Calcolo i destinatari…</p>
                                ) : selezioneVuota ? (
                                    <p className="text-[11px] text-slate-500 mt-1.5">Scegli i destinatari qui sopra: l&apos;elenco dei nomi apparirà qui prima di pubblicare.</p>
                                ) : destinatariFinali.length === 0 ? (
                                    <p className="text-xs text-amber-300 mt-1.5">⚠️ Nessun destinatario: {anteprimaDestinatari.length ? "li hai tolti tutti a mano — rimettine almeno uno." : "controlla ruoli/negozi/persone."}</p>
                                ) : (
                                    // TUTTI i nomi, sempre (Luca 04/08): niente tetto né scroll
                                    // interno — il form ha spazio, i chip si distendono tutti
                                    // ✕ SU OGNI NOME (Luca 27/08): i filtri fanno la platea,
                                    // la ✕ toglie l'eccezione. Chi è tolto resta in elenco
                                    // barrato e spento: si vede che l'ho tolto io, e si
                                    // rimette con un clic invece di rifare i filtri.
                                    <div className="flex gap-1.5 mt-2 flex-wrap">
                                        {anteprimaDestinatari.map((u) => {
                                            const fuori = esclusi.includes(u.id);
                                            return (
                                                <span key={u.id}
                                                    className={cn("px-2.5 py-1 rounded-full border text-[11px] flex items-center gap-1.5 transition-colors",
                                                        fuori ? "border-white/5 bg-transparent text-slate-600 line-through" : "border-white/10 bg-white/5 text-slate-300")}>
                                                    {u.nome}{u.id === user?.id ? " (tu)" : ""}
                                                    <button type="button"
                                                        onClick={() => setEsclusi((p) => fuori ? p.filter((x) => x !== u.id) : [...p, u.id])}
                                                        title={fuori ? "Rimettilo tra i destinatari" : "Togli questa persona"}
                                                        className={cn("leading-none text-[13px] transition-colors", fuori ? "text-emerald-400 hover:text-emerald-300" : "text-slate-500 hover:text-rose-400")}>
                                                        {fuori ? "↺" : "✕"}
                                                    </button>
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                            </div>
                        </div>
                        <div className="flex items-center justify-end gap-2.5 py-4 px-6 border-t border-white/10 shrink-0">
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

/* useSearchParams (deep-link ?apri=) richiede Suspense in fase di build (lezione 502). */
export default function Comunicazioni() {
    return (
        <Suspense fallback={<div className="py-12 text-center text-slate-400">Caricamento...</div>}>
            <ComunicazioniInner />
        </Suspense>
    );
}
