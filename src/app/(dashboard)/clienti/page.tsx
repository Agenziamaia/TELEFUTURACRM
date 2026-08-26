"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { IndirizzoAutocomplete, civicoMancante } from "@/components/IndirizzoAutocomplete";
import { Search, Filter, RefreshCw, Users, FileText, Smartphone, Phone, Mail, Building, MapPin, X, ChevronRight, ChevronDown, Calendar, CheckCircle2, Clock, AlertTriangle, Paperclip, ExternalLink, Plus, Loader2 } from "lucide-react";
import { seesWholeStore, seesAllStores, areaOf } from "@/lib/roles";
import { waIstanzeVisibili } from "@/lib/waVisibilita";
import { usePageView } from "@/lib/pageView";
import { supabase } from "@/lib/supabaseClient";
import { ImageLightbox } from "@/components/ImageLightbox";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { trovaDuplicati, liberaCellulare, type DupCliente } from "@/lib/clientChecks";
import { verificaCoerenzaCF } from "@/lib/coerenzaCF";
import { useVisibleStores, sameStore } from "@/lib/visibleStores";
import { useStores } from "@/lib/org";
import { SelectMulti } from "@/components/SelectPersona";
import { useClientiVisibili } from "@/lib/clientiVisibili";
import { caricaTutte } from "@/lib/fetchTutte";
import { NumeriCliente } from "@/components/NumeriCliente";
import { dataNascitaDaCF, etaDa } from "@/lib/dataNascita";
import { useRolePermissions } from "@/lib/usePermissions";
import { CAP_CLIENTI, CAP_CLIENTI_ALLEGATI, CAP_CLIENTI_INTEGRA_DOC, capChoice, capAllowed } from "@/lib/capabilities";
import { chiamaAircall } from "@/lib/dialer";
import { numeroNazionale } from "@/lib/telefono";
import { puoAscoltareRegistrazioni } from "@/lib/aircall";
import { trkBrandKey, TRK_BRAND_LOGOS } from "@/lib/brandAssets";

interface Cliente {
    id: string;
    tipo: "consumer" | "business";
    nome: string;
    cognome?: string;
    ragioneSociale?: string;
    nomeRef?: string;
    cognomeRef?: string;
    cfRef?: string;
    turista?: boolean;   // cliente di passaggio senza CF italiano (mig. 140)
    cellulare: string;
    telefonoFisso?: string | null;   // recapito fisso FACOLTATIVO delle business (mig. 124)
    email: string;
    cf_piva: string | null;
    data_nascita?: string | null;   // facoltativo dalla migrazione 065
    iban?: string | null;
    acquisito_da?: string | null;
    creato_da?: string | null;
    created_at?: string | null;
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
    prodotto?: string | null;    // TML-01: dettaglio nella timeline espansa
    offerta?: string | null;
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
        cfRef: (row.cf_ref as string) ?? undefined,
        turista: !!row.turista,
        cellulare: row.cellulare as string,
        telefonoFisso: (row.telefono_fisso as string | null) ?? null,
        email: row.email as string,
        cf_piva: (row.cf_piva as string | null) ?? null,
        data_nascita: (row.data_nascita as string | null) ?? null,
        iban: (row.iban as string | null) ?? null,
        acquisito_da: (row.acquisito_da as string | null) ?? null,
        creato_da: (row.creato_da as string | null) ?? null,
        created_at: (row.created_at as string | null) ?? null,
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
        prodotto: (row.prodotto as string | null) ?? null,
        offerta: (row.offerta as string | null) ?? null,
    };
}

// Categorie di archiviazione dei documenti (Step 5 della registrazione).
// Tutto cio' che non rientra in una categoria nota finisce in "Altro".
const CATEGORIE_DOC = [
    { id: "documento", label: "Documenti", color: "var(--tf-38bdf8)", match: (t: string | null) => (t || "").toLowerCase() === "documento" },
    { id: "contratti", label: "Contratti", color: "var(--tf-a78bfa)", match: (t: string | null) => (t || "").toLowerCase() === "contratti" },
    // Segnalazione 84: bollette del vecchio operatore sui contratti energia.
    { id: "fattura", label: "Fatture", color: "var(--tf-fbbf24)", match: (t: string | null) => (t || "").toLowerCase() === "fattura" },
    // Dichiarazioni di vendita degli usati ritirati (Francesco 12/08)
    { id: "dichiarazione_usato", label: "Dichiarazioni usato", color: "var(--tf-34d399)", match: (t: string | null) => (t || "").toLowerCase() === "dichiarazione_usato" },
    // MOD-14 (Luca 08/08): documenti smarriti e archiviati/scaduti — fuori dai
    // validi, visibili SOLO all'amministrazione (adminOnly) con etichetta chiara.
    { id: "smarrito", label: "🔴 Smarriti", color: "var(--tf-f87171)", adminOnly: true, match: (t: string | null) => (t || "").toLowerCase() === "documento_smarrito" },
    { id: "archiviato", label: "🗄️ Archiviati/scaduti", color: "var(--tf-94a3b8)", adminOnly: true, match: (t: string | null) => (t || "").toLowerCase() === "documento_archiviato" },
    { id: "altro", label: "Altro", color: "var(--tf-94a3b8)", match: (t: string | null) => !["documento", "contratti", "fattura", "dichiarazione_usato", "documento_smarrito", "documento_archiviato"].includes((t || "").toLowerCase()) },
];

function ClienteDetailModal({ cliente, contratti, onClose }: { cliente: Cliente; contratti: Contratto[]; onClose: () => void }) {
    const router = useRouter();
    // Capacita' "Allegati del cliente" (ingranaggio Clienti in Permessi): senza,
    // la sezione Documenti/PDA non compare proprio.
    const { user: uAll } = useAuth();
    const { perms: permAll } = useRolePermissions(uAll?.role, uAll?.grade, uAll?.id);
    const vedeAllegati = capAllowed(uAll?.role, "/clienti", CAP_CLIENTI_ALLEGATI, permAll);
    // smarriti/archiviati (MOD-14) visibili SOLO all'amministrazione
    const isAdminDoc = ["admin", "dev", "direttore_generale", "amministrativo"].includes(String(uAll?.role || ""));
    type DocRiga = { id: string; file_url: string; file_name: string; contract_id: string | null; file_type: string | null; created_at: string | null };
    const [docs, setDocs] = useState<DocRiga[]>([]);
    // Immagine aperta a schermo (prima si apriva in una scheda nuova).
    const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);

    // Documenti caricati: allegati del CLIENTE. Nuovo disegno eliminazioni
    // (Luca 06/08): gli allegati sopravvivono all'eliminazione del contratto
    // (contract_id va a NULL, client_id li tiene agganciati al cliente — mig.
    // 20260806010000), quindi non basta più il giro via contratti. Si leggono
    // ENTRAMBE le strade e si deduplica: per client_id (contratti eliminati
    // compresi) E per contract_id (righe storiche pre-backfill o inserite da
    // registra-vendita prima che valorizzi client_id).
    const reloadDocs = async () => {
        const ids = contratti.map((c) => c.id);
        const raccolti = new Map<string, DocRiga>();
        const cols = "id, file_url, file_name, contract_id, file_type, created_at";
        const perCliente = await supabase.from("contract_attachments")
            .select(cols).eq("client_id", cliente.id);
        // errore = colonna client_id non ancora migrata: resta la via contratti
        if (!perCliente.error) ((perCliente.data ?? []) as DocRiga[]).forEach((d) => raccolti.set(d.id, d));
        if (ids.length > 0) {
            const { data } = await supabase.from("contract_attachments")
                .select(cols).in("contract_id", ids);
            ((data ?? []) as DocRiga[]).forEach((d) => raccolti.set(d.id, d));
        }
        setDocs([...raccolti.values()].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))));
    };
    useEffect(() => { reloadDocs(); /* eslint-disable-next-line */ }, [contratti, cliente.id]);

    // ── DOCUMENTI A MENU (Luca 07/08): categoria → BRAND → MESI, con DEDUP
    //    per file. Il documento d'identità viene replicato su ogni pratica
    //    della vendita (righe contract_attachments distinte, STESSO file —
    //    caso D'Atria: 4 file sembravano 20): qui un file = UNA card,
    //    attribuita ai brand delle sue pratiche CTR-; i file agganciati solo
    //    a voci marginalità stanno sotto "Marginalità", quelli di contratti
    //    eliminati sotto "Conservati".
    const [openCat, setOpenCat] = useState<Record<string, boolean>>({});
    const [openBrand, setOpenBrand] = useState<Record<string, boolean>>({});
    const [meseSel, setMeseSel] = useState<Record<string, string>>({});
    type DocFile = { key: string; nome: string; url: string; tipo: string | null; pratiche: string[] };
    const alberoDocs = useMemo(() => {
        const infoCtr = new Map<string, { brand: string; data: string | null }>();
        contratti.forEach((c) => infoCtr.set(c.id, { brand: c.brand || "—", data: c.data || null }));
        const meseDi = (creato: string | null, ctrData: string | null) => {
            const m = (ctrData || creato || "").slice(0, 7);
            return /^\d{4}-\d{2}$/.test(m) ? m : "—";
        };
        // raggruppo per categoria e poi per file_url (dedup delle repliche)
        const filePerCat = new Map<string, Map<string, DocRiga[]>>();
        docs.forEach((d) => {
            const cat = CATEGORIE_DOC.find((c) => c.match(d.file_type))?.id || "altro";
            if (!filePerCat.has(cat)) filePerCat.set(cat, new Map());
            const m = filePerCat.get(cat)!;
            if (!m.has(d.file_url)) m.set(d.file_url, []);
            m.get(d.file_url)!.push(d);
        });
        // albero: categoria → brand → mese (YYYY-MM) → file
        const albero = new Map<string, Map<string, Map<string, DocFile[]>>>();
        filePerCat.forEach((files, cat) => {
            files.forEach((righe, url) => {
                const ctrRighe = righe.filter((r) => r.contract_id?.startsWith("CTR-") && infoCtr.has(r.contract_id));
                const extRighe = righe.filter((r) => r.contract_id?.startsWith("EXT-") && infoCtr.has(r.contract_id));
                const dest = new Map<string, string>();   // brand → mese
                if (ctrRighe.length) ctrRighe.forEach((r) => { const i = infoCtr.get(r.contract_id as string)!; if (!dest.has(i.brand)) dest.set(i.brand, meseDi(r.created_at, i.data)); });
                else if (extRighe.length) { const i = infoCtr.get(extRighe[0].contract_id as string)!; dest.set("Marginalità", meseDi(extRighe[0].created_at, i.data)); }
                else dest.set("Conservati", meseDi(righe[0].created_at, null));
                const file: DocFile = {
                    key: cat + "|" + url, nome: righe[0].file_name || "documento", url, tipo: righe[0].file_type,
                    // solo pratiche ESISTENTI: gli id di contratti eliminati non si mostrano
                    pratiche: [...new Set(righe.map((r) => r.contract_id).filter((id) => id && infoCtr.has(id)))] as string[],
                };
                dest.forEach((mese, brand) => {
                    if (!albero.has(cat)) albero.set(cat, new Map());
                    const perBrand = albero.get(cat)!;
                    if (!perBrand.has(brand)) perBrand.set(brand, new Map());
                    const perMese = perBrand.get(brand)!;
                    if (!perMese.has(mese)) perMese.set(mese, []);
                    perMese.get(mese)!.push(file);
                });
            });
        });
        return albero;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [docs, contratti]);
    const labelMeseDoc = (m: string) => {
        if (!/^\d{4}-\d{2}$/.test(m)) return "Senza data";
        const [y, mm] = m.split("-").map(Number);
        const s = new Date(y, mm - 1, 1).toLocaleDateString("it-IT", { month: "long", year: "numeric" });
        return s.charAt(0).toUpperCase() + s.slice(1);
    };

    // INTEGRAZIONE DOCUMENTI (Luca 31/07, evoluzione della segnalazione 114):
    // il caricamento dei documenti mancanti dopo la registrazione ora e' una
    // CAPACITA' amministrabile dalla rotellina Clienti (Permessi → "Integra
    // documenti"), di default per i ruoli del punto vendita da store manager
    // in su. Solo AGGIUNTA: eliminare i documenti esistenti non e' previsto.
    const puoIntegrareDoc = capAllowed(uAll?.role, "/clienti", CAP_CLIENTI_INTEGRA_DOC, permAll);
    const contrattiCaricabili = puoIntegrareDoc ? contratti : [];
    const puoCaricareDoc = vedeAllegati && puoIntegrareDoc && contratti.length > 0;
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
            // client_id sull'insert (mig. 20260806010000): il documento resta
            // del cliente anche se un giorno il contratto viene eliminato.
            let { error: insErr } = await supabase.from("contract_attachments").insert({
                contract_id: upContract, file_url: pub.publicUrl, file_name: upFile.name, file_type: upType, client_id: cliente.id,
            });
            if (insErr) {
                // colonna non ancora migrata: si salva come prima (il backfill
                // della migrazione aggancerà client_id in seguito)
                ({ error: insErr } = await supabase.from("contract_attachments").insert({
                    contract_id: upContract, file_url: pub.publicUrl, file_name: upFile.name, file_type: upType,
                }));
            }
            if (insErr) throw insErr;
            setCaricaOpen(false); setUpFile(null); setUpContract(""); setUpType("documento");
            await reloadDocs();
        } catch (e: any) { alert("Caricamento non riuscito: " + (e?.message || e)); }
        finally { setUpBusy(false); }
    };

    const [showStorico, setShowStorico] = useState(false);
    // Nuovo layout (Luca 01/08): pannello destro a schede.
    // Luca 04/08: la scheda cliente si apre sulla TIMELINE (prima: contratti)
    const [tab, setTab] = useState<"timeline" | "contratti" | "documenti">("timeline");
    // Click su una vendita -> apre il dettaglio in Ricerca Contratto (deep link ?id=).
    const openContract = (id: string) => { onClose(); router.push(`/ricerca-vendite?id=${encodeURIComponent(id)}`); };

    const nomeCompleto = cliente.tipo === "business" ? (cliente.ragioneSociale || "—") : `${cliente.nome || ""} ${cliente.cognome || ""}`.trim();
    const iniziale = (nomeCompleto || "?").charAt(0).toUpperCase();
    // DISDETTE nella Timeline 360° (Luca 01/08): ogni transizione dei ticket
    // Chiusura Linea scrive un evento nello storico jsonb — qui si rilegge.
    const [eventiDisdette, setEventiDisdette] = useState<{ key: string; when: string; color: string; icon: string; title: string; desc: string; stato: string | null }[]>([]);
    useEffect(() => {
        (async () => {
            const { data, error } = await supabase.from("richieste_disdette").select("id, brand, storico").eq("client_id", cliente.id);
            if (error) { setEventiDisdette([]); return; }   // tabella assente pre-mig. 125: timeline invariata
            setEventiDisdette((data ?? []).flatMap((r: { id: string; brand: string; storico: unknown }) =>
                (Array.isArray(r.storico) ? r.storico : []).map((e: { quando?: string; testo?: string }, i: number) => ({
                    key: `ds${r.id}_${i}`, when: String(e.quando || ""), color: "var(--tf-f43f5e)", icon: "✂️",
                    title: String(e.testo || ""), desc: `${r.id} · ${r.brand}`, stato: null as string | null,
                }))));
        })();
    }, [cliente.id]);
    // USATI RITIRATI dal cliente (segnalazione Francesco 12/08): l'acquisizione
    // del telefono usato entra nella Timeline 360° — letta live da usati.client_id.
    const [usatiCliente, setUsatiCliente] = useState<{ id: string; model: string | null; imei: string | null; purchase_price: number | null; purchase_date: string | null; store: string | null }[]>([]);
    useEffect(() => {
        (async () => {
            const { data, error } = await supabase.from("usati")
                .select("id, model, imei, purchase_price, purchase_date, store")
                .eq("client_id", cliente.id);
            setUsatiCliente(error ? [] : ((data ?? []) as typeof usatiCliente));
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cliente.id]);

    // ── TIMELINE INTERATTIVA (TML-01, Luca 04/08) ──
    // CHIAMATE del cliente (call_events, già agganciate per client_id): voce
    // compatta per giorno+direzione+interlocutore; il click porta allo storico
    // chiamate della scheda (player e dettagli stanno LÀ, la timeline resta leggera).
    const [chiamateTml, setChiamateTml] = useState<{ id: string; direction: string | null; negozio: string | null; agente_nome: string | null; started_at: string | null; call_id: string | null }[]>([]);
    useEffect(() => {
        (async () => {
            const { data } = await supabase.from("call_events")
                .select("id, direction, negozio, agente_nome, started_at, call_id")
                .eq("client_id", cliente.id)
                .order("started_at", { ascending: false }).limit(200);
            setChiamateTml((data ?? []) as never);
        })();
    }, [cliente.id]);
    // MOD-21 (Luca 10/08): la chiamata del call center si ESPANDE e mostra
    // l'appuntamento fissato da quella pratica — come la visita coi contratti.
    // Catena a due salti: call_events.call_id → calls.appointment_id (o il
    // richiamo_event_id per gli appuntamenti telefonici) → appointments.
    type ApptTml = { id: number; date: string | null; time: string | null; store: string | null; status: string | null; created_by: string | null; esito_note: string | null; type: string | null };
    const [apptDiCall, setApptDiCall] = useState<Record<string, ApptTml>>({});
    useEffect(() => {
        let alive = true;
        (async () => {
            const callIds = [...new Set(chiamateTml.map((e) => e.call_id).filter(Boolean))] as string[];
            if (!callIds.length) { if (alive) setApptDiCall({}); return; }
            const { data: prat } = await supabase.from("calls").select("id, appointment_id, richiamo_event_id").in("id", callIds);
            const mapCallApp: Record<string, number> = {};
            (prat || []).forEach((p: { id: string; appointment_id: number | string | null; richiamo_event_id: number | string | null }) => {
                const aid = Number(p.appointment_id || p.richiamo_event_id || 0);
                if (aid) mapCallApp[p.id] = aid;
            });
            const apptIds = [...new Set(Object.values(mapCallApp))];
            if (!apptIds.length) { if (alive) setApptDiCall({}); return; }
            const { data: apps } = await supabase.from("appointments").select("id, date, time, store, status, created_by, esito_note, type").in("id", apptIds);
            const perId: Record<number, ApptTml> = {};
            ((apps || []) as ApptTml[]).forEach((a) => { perId[Number(a.id)] = a; });
            const out: Record<string, ApptTml> = {};
            Object.entries(mapCallApp).forEach(([cid, aid]) => { if (perId[aid]) out[cid] = perId[aid]; });
            if (alive) setApptDiCall(out);
        })();
        return () => { alive = false; };
    }, [chiamateTml]);
    // stato appuntamento → etichetta/colore (sottoinsieme del calendario)
    const APP_STATO: Record<string, { label: string; cls: string }> = {
        scheduled: { label: "Programmato", cls: "bg-sky-500/10 border-sky-500/20 text-sky-300" },
        in_gestione: { label: "In gestione", cls: "bg-amber-500/10 border-amber-500/20 text-amber-300" },
        attivato: { label: "Attivato", cls: "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" },
        attivato_diverso_negozio: { label: "Attivato (altro negozio)", cls: "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" },
        ko: { label: "KO", cls: "bg-rose-500/10 border-rose-500/20 text-rose-300" },
        annullato: { label: "Annullato", cls: "bg-slate-500/10 border-slate-500/20 text-slate-300" },
        da_richiamare: { label: "Da richiamare", cls: "bg-amber-500/10 border-amber-500/20 text-amber-300" },
        da_rifissare: { label: "Da rifissare", cls: "bg-amber-500/10 border-amber-500/20 text-amber-300" },
    };
    // giorni-contratto espansi inline (stato locale: nessuna navigazione)
    const [gruppiAperti, setGruppiAperti] = useState<Record<string, boolean>>({});

    // Voce della timeline: "semplice" (documenti/disdette), con `contratti`
    // (giorno+negozio espandibile inline) o con `apreStorico` (chiamate → click
    // sullo storico chiamate della scheda).
    type VoceTimeline = { key: string; when: string; color: string; icon: string; title: string; desc: string; stato: string | null; contratti?: Contratto[]; apreStorico?: boolean; docsN?: number; docsLabel?: string; appuntamenti?: ApptTml[] };
    const isMarg = (b?: string | null) => /marginal|extra/i.test(b || "");

    // CONTRATTI raggruppati per giorno+negozio: "è andato in negozio e ha
    // attivato N contratti" — il dettaglio (brand, tipologia, venditore) esplode
    // DENTRO la timeline al click, e da lì si apre il singolo contratto.
    const gruppiContratti = new Map<string, Contratto[]>();
    contratti.filter((c) => c.data).forEach((c) => {
        const k = `${c.data}|${(c.negozio || "").trim()}`;
        gruppiContratti.set(k, [...(gruppiContratti.get(k) || []), c]);
    });
    // DOCUMENTI dello stesso giorno di una visita: fanno parte dell'esperienza
    // in negozio (Luca 04/08) — si CONTANO dentro la voce della visita invece
    // di comparire come evento a sé; restano voci autonome solo i caricamenti
    // nei giorni SENZA vendite (es. integrazione documenti a distanza).
    // I documenti del RITIRO usato (Francesco/Luca 12/08) vivono invece
    // dentro la voce «Ritirato usato»: fuori sia dalle visite sia dalle voci sciolte.
    const docDiRitiro = (d: DocRiga) => (d.file_type || "").toLowerCase() === "dichiarazione_usato" || (d.file_name || "").startsWith("Documento identità — ritiro");
    const giorniVisita = new Set([...gruppiContratti.keys()].map((k) => k.split("|")[0]));
    const docsPerGiorno = new Map<string, number>();
    docs.forEach((d) => {
        if (docDiRitiro(d)) return;
        const g = String(d.created_at || "").slice(0, 10);
        if (g && giorniVisita.has(g)) docsPerGiorno.set(g, (docsPerGiorno.get(g) || 0) + 1);
    });
    const giorniDocAssegnati = new Set<string>();
    const vociContratti: VoceTimeline[] = [...gruppiContratti.entries()].map(([k, cs]) => {
        const giorno = k.split("|")[0];
        const negozio = (cs[0].negozio || "").trim();
        const brands = [...new Set(cs.map((c) => c.brand).filter(Boolean))];
        // Presentazione voluta da Luca (04/08): NOME DEL NEGOZIO in evidenza,
        // sotto in piccolo il numero di contratti; il resto solo espandendo.
        // Solo marginalità = sacchetto 💰 come in Ricerca Vendite.
        const soloMarg = cs.every((c) => isMarg(c.brand));
        let docsN = 0;
        if (!giorniDocAssegnati.has(giorno)) { docsN = docsPerGiorno.get(giorno) || 0; if (docsN) giorniDocAssegnati.add(giorno); }
        return {
            key: "g" + k, when: cs[0].data, color: soloMarg ? "var(--tf-f59e0b)" : "var(--tf-38bdf8)", icon: soloMarg ? "💰" : "🏬",
            title: negozio || "In negozio",
            desc: `${cs.length === 1 ? "1 contratto attivato" : `${cs.length} contratti attivati`}${brands.length ? " · " + brands.join(" · ") : ""}${docsN ? ` · 📎 ${docsN}` : ""}`,
            stato: null, contratti: cs, docsN,
        };
    });

    // CHIAMATE per giorno: inbound = "Ha chiamato <negozio|Call Center>",
    // outbound = "Chiamato da …" (negozio dalla colonna negozio; null con
    // agente = Call Center). Più chiamate stesso giorno = una voce col contatore.
    const gruppiChiamate = new Map<string, { when: string; dir: "in" | "out"; chi: string; n: number; callIds: string[] }>();
    chiamateTml.filter((e) => e.started_at).forEach((e) => {
        const chi = (e.negozio || "").trim() || (e.agente_nome ? "Call Center" : "Telefutura");
        const dir: "in" | "out" = e.direction === "inbound" ? "in" : "out";
        const k = String(e.started_at).slice(0, 10) + "|" + dir + "|" + chi;
        const g = gruppiChiamate.get(k);
        if (g) { g.n += 1; if (String(e.started_at) > g.when) g.when = String(e.started_at); if (e.call_id && !g.callIds.includes(e.call_id)) g.callIds.push(e.call_id); }
        else gruppiChiamate.set(k, { when: String(e.started_at), dir, chi, n: 1, callIds: e.call_id ? [e.call_id] : [] });
    });
    const vociChiamate: VoceTimeline[] = [...gruppiChiamate.entries()].map(([k, g]) => {
        // MOD-21: appuntamenti fissati dalle pratiche di queste chiamate —
        // si mostrano ESPANDENDO la voce (freccia), come i contratti del giorno
        const appts: ApptTml[] = []; const vistiApp = new Set<number>();
        g.callIds.forEach((cid) => { const a = apptDiCall[cid]; if (a && !vistiApp.has(Number(a.id))) { vistiApp.add(Number(a.id)); appts.push(a); } });
        return {
            key: "t" + k, when: g.when,
            color: g.dir === "in" ? "var(--tf-22c55e)" : "var(--tf-a78bfa)",
            icon: g.dir === "in" ? "📥" : "📤",
            title: g.dir === "in" ? `Ha chiamato ${g.chi}` : `Chiamato da ${g.chi}`,
            desc: (g.n === 1
                ? new Date(g.when).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
                : `${g.n} chiamate`) + (appts.length ? " · 📅 appuntamento fissato" : ""),
            stato: null, apreStorico: true, appuntamenti: appts.length ? appts : undefined,
        };
    });

    // Timeline 360°: eventi REALI (contratti + chiamate + usati + documenti + disdette), in ordine.
    const timeline: VoceTimeline[] = [
        ...vociContratti,
        ...vociChiamate,
        // ritiri usato (Francesco 12/08): l'acquisizione si vede in timeline,
        // e i suoi documenti (dichiarazione + identità) stanno DENTRO la voce
        ...usatiCliente.filter((u) => u.purchase_date).map((u) => {
            const docsRitiro = u.model ? docs.filter((d) => docDiRitiro(d) && (d.file_name || "").includes(u.model!)).length : 0;
            return {
                key: "us" + u.id, when: String(u.purchase_date),
                color: "var(--tf-34d399)", icon: "♻️",
                title: `Ritirato usato — ${u.model || "dispositivo"}`,
                desc: [u.imei ? `IMEI ${u.imei}` : null, u.purchase_price != null ? `${Number(u.purchase_price).toLocaleString("it-IT")} €` : null, u.store].filter(Boolean).join(" · ") + (docsRitiro ? ` · 📎 ${docsRitiro}` : ""),
                stato: null as string | null,
                docsN: docsRitiro || undefined, docsLabel: "del ritiro",
            };
        }),
        // solo i caricamenti nei giorni SENZA visita: gli altri vivono dentro
        // la voce del negozio (esperienza unica del cliente, Luca 04/08);
        // i documenti del RITIRO usato vivono dentro la voce del ritiro (12/08)
        ...docs.filter((d) => d.created_at && !giorniVisita.has(String(d.created_at).slice(0, 10))
            && !docDiRitiro(d)
            // smarriti/archiviati fuori dalla timeline per i non-admin (MOD-14)
            && (isAdminDoc || !CATEGORIE_DOC.find((c) => c.match(d.file_type))?.adminOnly))
            .map((d) => ({ key: "d" + d.id, when: d.created_at as string, color: "var(--tf-f59e0b)", icon: "📄", title: "Documento caricato", desc: d.file_name || "documento", stato: null as string | null })),
        ...eventiDisdette.filter((e) => e.when),
    ].sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());

    // ── MASTER DASHBOARD FLUTTUANTE (Luca 26/08, scheletro Gemini innestato
    //    sulla logica esistente): console centrale max-w-[1300px] h-[90vh],
    //    header FOTOGRAFICO (business/consumer da /public/clienti), colonna
    //    sinistra 320px con KPI/azioni/WhatsApp, tab a destra con underline
    //    viola. Dark-only per scelta di design (palette #0c0d14/#161722).
    const isBiz = cliente.tipo === "business";
    const heroImg = isBiz ? "/clienti/hero-business.jpg" : "/clienti/hero-consumer.jpg";
    const iniziali = (nomeCompleto || "?").split(/\s+/).map((w) => w.charAt(0)).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
    const pratAttive = contratti.filter((c) => c.stato === "Attivato").length;
    const nFileVisibili = new Set(docs.filter((d) => isAdminDoc || !CATEGORIE_DOC.find((c) => c.match(d.file_type))?.adminOnly).map((d) => d.file_url)).size;
    const EMOJI_CAT: Record<string, string> = { documento: "🪪", contratti: "📄", fattura: "🧾", dichiarazione_usato: "♻️", smarrito: "⚠️", archiviato: "🗄️", altro: "📁" };
    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-3 lg:p-6 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
            <div className="relative w-full max-w-[1300px] h-[92vh] bg-[#0c0d14]/95 backdrop-blur-2xl border border-[#262836] rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.8),inset_0_0_20px_rgba(124,58,237,0.05)] flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-2 duration-300">

                {/* ═══ HEADER FOTOGRAFICO ═══ */}
                <div className="h-32 sm:h-36 border-b border-[#262836] flex items-end shrink-0 relative overflow-hidden bg-cover bg-center"
                    style={{ backgroundImage: `url(${heroImg})` }}>
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0c0d14] via-[#0c0d14]/80 to-transparent" />
                    <div className="absolute inset-0 bg-gradient-to-r from-[#0c0d14] via-transparent to-transparent" />
                    <div className="flex gap-4 sm:gap-5 items-end relative z-10 w-full p-5 sm:p-6 pb-4">
                        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-[#0c0d14]/80 backdrop-blur-md border border-[#262836] flex items-center justify-center font-black text-2xl sm:text-3xl shadow-[0_0_30px_rgba(0,0,0,0.8)] relative shrink-0">
                            <span className="bg-gradient-to-br from-white to-gray-400 bg-clip-text text-transparent">{iniziali}</span>
                            <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-4 border-[#0c0d14] ${isBiz ? "bg-amber-500" : "bg-[#10b981]"}`} />
                        </div>
                        <div className="flex-1 min-w-0 pb-0.5">
                            <div className="flex items-center gap-3 mb-1 min-w-0">
                                <h2 className="text-xl sm:text-3xl font-black text-white tracking-tight uppercase drop-shadow-lg truncate">{nomeCompleto}</h2>
                                <span className={`shrink-0 text-[9px] font-black border px-2.5 py-1 rounded-md uppercase tracking-widest backdrop-blur-md ${isBiz ? "bg-amber-500/10 text-amber-400 border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.2)]" : "bg-blue-500/10 text-blue-400 border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.2)]"}`}>{cliente.tipo}</span>
                            </div>
                            <div className="flex items-center gap-4 text-[11px] sm:text-sm font-mono text-gray-300 drop-shadow-sm min-w-0 flex-wrap">
                                <span className="flex items-center gap-1.5 min-w-0"><span className="text-gray-500">{isBiz ? "P.IVA" : "CF"}:</span> <span className="truncate">{cliente.cf_piva || "—"}</span></span>
                                {cliente.cellulare && <span className="flex items-center gap-1.5">📞 {cliente.cellulare}</span>}
                                <span className="text-gray-500">{cliente.id}</span>
                            </div>
                        </div>
                        {/* STORICO CHIAMATE nel top header (regola Luca) + chiudi */}
                        <div className="flex gap-2 pb-0.5 shrink-0">
                            <button onClick={() => setShowStorico(true)}
                                className="bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-xs font-bold text-white px-3.5 py-2 rounded-xl transition-all shadow-lg flex items-center gap-1.5">
                                📞 <span className="hidden sm:inline">Storico chiamate</span>
                            </button>
                            <button onClick={onClose} title="Chiudi"
                                className="w-9 h-9 bg-black/40 hover:bg-red-500/80 backdrop-blur-md border border-white/10 hover:border-red-500 text-white rounded-xl flex items-center justify-center transition-all shadow-lg">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
                {showStorico && <StoricoChiamateCliente cliente={cliente} onClose={() => setShowStorico(false)} />}

                {/* ═══ CORPO: colonna sinistra 320px + tab a destra ═══ */}
                <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden min-h-0">

                    {/* ───────── COLONNA SINISTRA ───────── */}
                    <div className="lg:w-[320px] shrink-0 lg:border-r border-b lg:border-b-0 border-[#262836] bg-[#0c0d14]/50 p-5 flex flex-col gap-4 lg:overflow-y-auto scrollbar-hide">
                        {/* KPI banners — dati VERI del cliente, niente numeri finti */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-[#161722] border border-[#262836] p-3.5 rounded-2xl relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-16 h-16 bg-[#10b981]/10 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-150" />
                                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block mb-1">Pratiche</span>
                                <span className="text-lg font-black text-[#10b981] relative z-10">{pratAttive} <span className="text-[11px] text-gray-500 font-bold">attive / {contratti.length}</span></span>
                            </div>
                            <div className="bg-[#161722] border border-[#262836] p-3.5 rounded-2xl relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-16 h-16 bg-[#7c3aed]/10 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-150" />
                                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block mb-1">Documenti</span>
                                <span className="text-lg font-black text-white relative z-10">{nFileVisibili} <span className="text-[11px] text-gray-500 font-bold">file</span></span>
                            </div>
                        </div>
                        {/* Pulsantiera Quick Actions (logica invariata: Aircall / chat) */}
                        <div className="bg-[#161722] border border-[#262836] rounded-2xl p-1.5 flex gap-1">
                            <button onClick={async () => { if (!cliente.cellulare) return; const r = await chiamaAircall(cliente.cellulare, uAll?.id); alert(r.msg); }}
                                disabled={!cliente.cellulare} title="Chiama con Aircall"
                                className="flex-1 py-2.5 flex flex-col items-center justify-center gap-1 hover:bg-[#262836] rounded-xl transition-colors text-gray-400 hover:text-white group disabled:opacity-30 disabled:cursor-not-allowed">
                                <span className="text-lg group-hover:scale-110 transition-transform">📞</span>
                                <span className="text-[9px] font-bold uppercase tracking-widest">Chiama</span>
                            </button>
                            {cliente.cellulare
                                ? <Link href={"/chat?wa=" + String(cliente.cellulare).replace(/\D/g, "")} title="Scrivi su WhatsApp"
                                    className="flex-1 py-2.5 flex flex-col items-center justify-center gap-1 hover:bg-[#10b981]/10 rounded-xl transition-colors text-gray-400 hover:text-[#10b981] group">
                                    <span className="text-lg group-hover:scale-110 transition-transform">💬</span>
                                    <span className="text-[9px] font-bold uppercase tracking-widest">WhatsApp</span>
                                </Link>
                                : <div className="flex-1 py-2.5 flex flex-col items-center justify-center gap-1 rounded-xl text-gray-600 opacity-40">
                                    <span className="text-lg">💬</span><span className="text-[9px] font-bold uppercase tracking-widest">WhatsApp</span>
                                </div>}
                            {cliente.email
                                ? <Link href={"/chat?mail=" + encodeURIComponent(cliente.email)} title="Scrivi una email"
                                    className="flex-1 py-2.5 flex flex-col items-center justify-center gap-1 hover:bg-[#262836] rounded-xl transition-colors text-gray-400 hover:text-white group">
                                    <span className="text-lg group-hover:scale-110 transition-transform">✉️</span>
                                    <span className="text-[9px] font-bold uppercase tracking-widest">Email</span>
                                </Link>
                                : <div className="flex-1 py-2.5 flex flex-col items-center justify-center gap-1 rounded-xl text-gray-600 opacity-40">
                                    <span className="text-lg">✉️</span><span className="text-[9px] font-bold uppercase tracking-widest">Email</span>
                                </div>}
                        </div>

                        {/* CONVERSAZIONE WHATSAPP nella colonna sinistra (regola Luca):
                            con quali numeri nostri ha parlato — un click apre LA chat */}
                        <div className="bg-[#161722] border border-[#262836] rounded-2xl p-4">
                            <WhatsAppStoricoCliente clientId={cliente.id} />
                        </div>

                        {/* Info Box — tutti i dettagli di contatto (logica invariata) */}
                        <div className="bg-[#161722] border border-[#262836] rounded-2xl p-4">
                            <div className="space-y-3">
                                {/* REFERENTE (Luca 01/08): per le business va mostrato — legge nome_ref
                                    con ripiego su nome (storico caller pre-mig. 124) */}
                                {cliente.tipo === "business" && (
                                    <InfoItem icon={<Users className="w-4 h-4" />} label="Referente"
                                        value={`${cliente.nomeRef || cliente.nome || ""} ${cliente.cognomeRef || cliente.cognome || ""}`.trim() || "—"} />
                                )}
                                <InfoItem icon={<Smartphone className="w-4 h-4" />} label="Cellulare" value={cliente.cellulare} mono />
                                {cliente.tipo === "business" && (
                                    <InfoItem icon={<Phone className="w-4 h-4" />} label="Telefono fisso" value={cliente.telefonoFisso || "—"} mono />
                                )}
                                {/* NUMERI MULTIPLI (Luca 31/07, mig. 121): principale + aggiuntivi etichettati */}
                                <NumeriCliente clientId={cliente.id} principale={cliente.cellulare || ""} tipo={cliente.tipo} />
                                <InfoItem icon={<Mail className="w-4 h-4" />} label="Email" value={cliente.email} />
                                {(cliente as { data_nascita?: string | null }).data_nascita && (
                                    <InfoItem icon={<Calendar className="w-4 h-4" />} label="Data di nascita"
                                        value={`${new Date(String((cliente as { data_nascita?: string | null }).data_nascita)).toLocaleDateString("it-IT")}${etaDa((cliente as { data_nascita?: string | null }).data_nascita) != null ? ` (${etaDa((cliente as { data_nascita?: string | null }).data_nascita)} anni)` : ""}`} />
                                )}
                                <InfoItem icon={<MapPin className="w-4 h-4" />} label="Indirizzo" value={`${cliente.indirizzo}, ${cliente.citta}`} />
                                {/* Info aggiuntive: IBAN / intestatario / note (segnalazione 21) */}
                                {((cliente.iban || "").trim() || cliente.intestatario_diverso || contratti.some(c => (c.note || "").trim())) && (
                                    <div className="mt-1 pt-3 border-t border-dashed border-white/10 space-y-3">
                                        {(cliente.iban || "").trim() && (
                                            <div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">IBAN</div><div className="text-xs text-amber-400 font-mono break-all">{cliente.iban}</div></div>
                                        )}
                                        {cliente.intestatario_diverso && (
                                            <div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Intestatario diverso</div>
                                                <div className="text-xs text-slate-200">{[cliente.intestatario_nome, cliente.intestatario_cognome].filter(Boolean).join(" ") || "—"}{cliente.intestatario_cf ? " · " + cliente.intestatario_cf : ""}</div></div>
                                        )}
                                        {contratti.filter(c => (c.note || "").trim()).map(c => (
                                            <div key={c.id}><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Nota · {c.id}</div><div className="text-xs text-slate-200 whitespace-pre-wrap">{c.note}</div></div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Portafoglio servizi (contratti come card) */}
                        <div className="bg-[#161722] border border-[#262836] rounded-2xl p-4">
                            <h3 className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-3">Portafoglio Servizi</h3>
                            {contratti.length === 0 ? <p className="text-xs text-gray-600">Nessun contratto.</p> : (
                                <div className="space-y-2">
                                    {contratti.slice(0, 6).map(c => (
                                        <button key={c.id} onClick={() => openContract(c.id)} title="Apri in Ricerca Vendite"
                                            className="w-full flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[#0c0d14]/60 border border-[#262836] hover:border-[#7c3aed]/60 text-left transition-all">
                                            <div className="min-w-0"><div className="text-xs font-semibold text-slate-100 truncate">{c.brand}</div><div className="text-[10px] text-gray-500 truncate">{c.categoria}</div></div>
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 border ${c.stato === "Attivato" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : c.stato === "In Lavorazione" ? "bg-amber-500/10 border-amber-500/20 text-amber-400" : "bg-rose-500/10 border-rose-500/20 text-rose-400"}`}>{c.stato}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ───────── COLONNA DESTRA: tabs col glow viola ───────── */}
                    <div className="flex-1 flex flex-col bg-[#11131a] min-h-0 relative">
                        <div className="flex px-5 sm:px-7 pt-4 border-b border-[#262836] shrink-0 gap-5 bg-[#0c0d14]/50 backdrop-blur-md sticky top-0 z-20 overflow-x-auto scrollbar-hide">
                            {/* il badge conta i FILE veri (dedup per file_url), e SOLO quelli
                                visibili: smarriti/archiviati contano solo per l'amministrazione (MOD-14) */}
                            {[{ id: "timeline", label: "Timeline 360°", n: null as number | null }, { id: "contratti", label: "Contratti Registrati", n: contratti.length }, ...(vedeAllegati ? [{ id: "documenti", label: "Fascicolo Documenti", n: nFileVisibili }] : [])].map(t => (
                                <button key={t.id} onClick={() => setTab(t.id as typeof tab)}
                                    className={`pb-3.5 text-[13px] font-bold transition-all relative whitespace-nowrap ${tab === t.id ? "text-white" : "text-gray-500 hover:text-gray-300"}`}>
                                    {t.label}
                                    {t.n != null && <span className={`ml-1.5 text-[10px] px-2 py-0.5 rounded-full border ${tab === t.id ? "bg-[#7c3aed]/20 text-[#a855f7] border-[#7c3aed]/50" : "bg-[#262836] text-gray-400 border-transparent"}`}>{t.n}</span>}
                                    {tab === t.id && <div className="absolute bottom-0 left-0 w-full h-[3px] bg-[#7c3aed] rounded-t-full shadow-[0_-2px_15px_rgba(124,58,237,0.8)]" />}
                                </button>
                            ))}
                        </div>
                        <div className="p-5 sm:p-7 flex-1 lg:overflow-y-auto scrollbar-hide">

                    {/* ===== TAB TIMELINE (interattiva, TML-01 — layout a linea connessa) ===== */}
                    {tab === "timeline" && (timeline.length === 0 ? (
                        <div className="text-center py-16 text-gray-600 text-sm">Nessuna attività registrata per questo cliente.</div>
                    ) : (
                        <div className="max-w-3xl animate-in fade-in duration-300">
                            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-7">Cronologia Eventi</h3>
                            <div className="relative border-l-2 border-[#262836] ml-4 space-y-7 pb-6">
                                {timeline.map(ev => {
                                    // MOD-21: espandibile anche la CHIAMATA con appuntamento dentro
                                    // e il RITIRO USATO coi suoi documenti (12/08)
                                    const espandibile = !!ev.contratti || !!(ev.appuntamenti && ev.appuntamenti.length) || (ev.docsN || 0) > 0;
                                    const cliccabile = espandibile || !!ev.apreStorico;
                                    const aperta = espandibile && !!gruppiAperti[ev.key];
                                    return (
                                        <div key={ev.key} className="relative pl-8 group/tml">
                                            {/* nodo sulla linea, col glow della sua tinta */}
                                            <div className="absolute -left-[17px] top-0 w-8 h-8 rounded-full flex items-center justify-center text-sm z-10 transition-transform group-hover/tml:scale-110 bg-[#0c0d14]"
                                                style={{ background: `color-mix(in srgb, ${ev.color} 12%, #0c0d14)`, border: `1px solid color-mix(in srgb, ${ev.color} 50%, transparent)`, boxShadow: `0 0 15px color-mix(in srgb, ${ev.color} 30%, transparent)` }}>{ev.icon}</div>
                                            <div role={cliccabile ? "button" : undefined} tabIndex={cliccabile ? 0 : undefined}
                                                onClick={() => {
                                                    if (espandibile) setGruppiAperti((p) => ({ ...p, [ev.key]: !p[ev.key] }));
                                                    else if (ev.apreStorico) setShowStorico(true);
                                                }}
                                                onKeyDown={(e) => { if (cliccabile && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); (e.currentTarget as HTMLElement).click(); } }}
                                                title={ev.contratti ? (aperta ? "Chiudi i contratti del giorno" : "Mostra i contratti del giorno") : (ev.appuntamenti && ev.appuntamenti.length) ? (aperta ? "Chiudi il dettaglio" : "Mostra l'appuntamento fissato") : ev.apreStorico ? "Apri lo storico chiamate" : undefined}
                                                className={`bg-[#161722] border border-[#262836] p-3.5 rounded-2xl transition-colors ${cliccabile ? "cursor-pointer" : ""}`}
                                                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = `color-mix(in srgb, ${ev.color} 50%, transparent)`; }}
                                                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = ""; }}>
                                                <p className="text-[10px] text-gray-400 font-mono mb-1">{new Date(ev.when).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}</p>
                                                <div className="flex items-center justify-between gap-2">
                                                    <h4 className="text-sm font-bold text-white flex items-center gap-1.5 min-w-0">
                                                        <span className="truncate">{ev.title}</span>
                                                        {espandibile && <span className="text-gray-500 shrink-0">{aperta ? "▴" : "▾"}</span>}
                                                        {ev.apreStorico && !(ev.appuntamenti && ev.appuntamenti.length) && <span className="text-[11px] font-bold text-violet-300 opacity-0 group-hover/tml:opacity-100 transition-opacity shrink-0">→ storico</span>}
                                                    </h4>
                                                </div>
                                                <p className="text-xs text-gray-400 mt-0.5">{ev.desc}{ev.stato ? ` · ${ev.stato}` : ""}</p>
                                            </div>
                                            {/* esplosione INLINE dei contratti del giorno: brand col logo,
                                                tipologia/prodotto, venditore — il click sulla riga apre il
                                                dettaglio contratto (stesso deep link della tab Contratti) */}
                                            {aperta && (
                                                <div className="pl-3 mt-2 space-y-1.5">
                                                    {/* MOD-21: l'APPUNTAMENTO fissato dalla chiamata del call center */}
                                                    {(ev.appuntamenti || []).map((a) => {
                                                        const st = APP_STATO[a.status || ""] || { label: a.status || "—", cls: "bg-slate-500/10 border-slate-500/20 text-slate-300" };
                                                        return (
                                                            <div key={"app" + a.id} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/5">
                                                                <span className="w-5 h-5 flex items-center justify-center text-sm shrink-0">📅</span>
                                                                <span className="flex-1 min-w-0">
                                                                    <span className="block text-xs font-semibold text-slate-100 truncate">
                                                                        Appuntamento{a.type === "richiamo" ? " telefonico" : ""} {a.date ? new Date(a.date + "T00:00:00").toLocaleDateString("it-IT") : "—"}{a.time ? ` · ${a.time}` : ""}{a.store ? ` — ${a.store}` : ""}
                                                                    </span>
                                                                    <span className="block text-[10px] text-slate-500 truncate">{a.created_by ? `Fissato da ${a.created_by} (call center)` : "Fissato dal call center"}{a.esito_note ? ` · ${a.esito_note}` : ""}</span>
                                                                </span>
                                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 border ${st.cls}`}>{st.label}</span>
                                                            </div>
                                                        );
                                                    })}
                                                    {ev.apreStorico && (
                                                        <button onClick={() => setShowStorico(true)} title="Apri lo storico chiamate"
                                                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] hover:border-violet-500/30 text-left transition-all">
                                                            <span className="w-5 h-5 flex items-center justify-center text-sm shrink-0">📞</span>
                                                            <span className="flex-1 text-xs font-semibold text-slate-300">Apri lo storico chiamate</span>
                                                            <ExternalLink className="w-3 h-3 text-slate-600 shrink-0" />
                                                        </button>
                                                    )}
                                                    {(ev.contratti || []).map((c) => {
                                                        const logo = TRK_BRAND_LOGOS[trkBrandKey(c.brand || "")];
                                                        return (
                                                            <button key={c.id} onClick={() => openContract(c.id)} title="Apri il dettaglio del contratto"
                                                                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] hover:border-indigo-500/30 text-left transition-all group">
                                                                {logo
                                                                    ? <img src={logo} alt={c.brand} className="w-5 h-5 object-contain shrink-0" />
                                                                    : isMarg(c.brand)
                                                                        ? <span className="w-5 h-5 flex items-center justify-center text-sm shrink-0">💰</span>
                                                                        : <span className="w-5 h-5 rounded bg-white/10 border border-white/10 flex items-center justify-center text-[9px] font-bold text-slate-300 shrink-0">{(c.brand || "?").charAt(0).toUpperCase()}</span>}
                                                                <span className="flex-1 min-w-0">
                                                                    <span className="block text-xs font-semibold text-slate-100 truncate">{c.brand} · {c.categoria}</span>
                                                                    <span className="block text-[10px] text-slate-500 truncate">{[c.prodotto || c.offerta, c.venditore].filter(Boolean).join(" — ") || "—"}</span>
                                                                </span>
                                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 border ${c.stato === "Attivato" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : c.stato === "In Lavorazione" ? "bg-amber-500/10 border-amber-500/20 text-amber-400" : "bg-rose-500/10 border-rose-500/20 text-rose-400"}`}>{c.stato}</span>
                                                                <ExternalLink className="w-3 h-3 text-slate-600 group-hover:text-indigo-400 shrink-0 transition-colors" />
                                                            </button>
                                                        );
                                                    })}
                                                    {/* documenti caricati durante la visita: parte della stessa
                                                        esperienza (Luca 04/08) — click = tab Documenti */}
                                                    {(ev.docsN || 0) > 0 && (
                                                        <button onClick={() => vedeAllegati && setTab("documenti")} disabled={!vedeAllegati}
                                                            title={vedeAllegati ? "Apri i documenti del cliente" : undefined}
                                                            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/5 text-left transition-all ${vedeAllegati ? "hover:bg-white/[0.05] hover:border-amber-500/30" : "cursor-default"}`}>
                                                            <span className="w-5 h-5 flex items-center justify-center text-sm shrink-0">📎</span>
                                                            <span className="flex-1 text-xs font-semibold text-slate-300">{ev.docsN === 1 ? "1 documento caricato" : `${ev.docsN} documenti caricati`} {ev.docsLabel || "durante la visita"}</span>
                                                            {vedeAllegati && <ExternalLink className="w-3 h-3 text-slate-600 shrink-0" />}
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}

                    {/* ===== TAB CONTRATTI (dati invariati, veste «tabella rich») ===== */}
                    {tab === "contratti" && (
                    <div className="space-y-3 animate-in fade-in duration-300">
                        <div className="flex items-center justify-end">
                            <span className="text-[10px] text-gray-500 italic">Prelevati da tracking PDA</span>
                        </div>
                        <div className="bg-[#161722] border border-[#262836] rounded-2xl overflow-hidden shadow-lg overflow-x-auto">
                            <table className="w-full text-left text-xs whitespace-nowrap">
                                <thead className="bg-[#0c0d14]/50 border-b border-[#262836]">
                                    <tr className="text-[#8b92a5] text-[10px] uppercase tracking-widest">
                                        <th className="px-5 py-3.5 font-bold">Data</th>
                                        <th className="px-5 py-3.5 font-bold">Brand</th>
                                        <th className="px-5 py-3.5 font-bold">Categoria</th>
                                        {/* Segnalazione 97: Venditore e Negozio fra Categoria e Stato. */}
                                        <th className="px-5 py-3.5 font-bold">Venditore</th>
                                        <th className="px-5 py-3.5 font-bold">Negozio</th>
                                        <th className="px-5 py-3.5 font-bold text-right">Stato</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#262836]">
                                    {contratti.length === 0 && (
                                        <tr><td colSpan={6} className="px-5 py-6 text-center text-gray-600">Nessun contratto per questo cliente.</td></tr>
                                    )}
                                    {contratti.map((ctr: Contratto) => (
                                        <tr key={ctr.id} onClick={() => openContract(ctr.id)}
                                            className="hover:bg-[#1a1c28] cursor-pointer transition-colors group" title="Apri in Ricerca Vendite">
                                            <td className="px-5 py-3.5 text-gray-300 font-mono">{ctr.data}</td>
                                            <td className="px-5 py-3.5">
                                                <span className="text-white font-bold">{ctr.brand}</span>
                                            </td>
                                            <td className="px-5 py-3.5 text-gray-400">{ctr.categoria}</td>
                                            <td className="px-5 py-3.5 text-gray-300">{ctr.venditore || "—"}</td>
                                            <td className="px-5 py-3.5 text-gray-400">{ctr.negozio || "—"}</td>
                                            <td className="px-5 py-3.5 text-right">
                                                <span className="inline-flex items-center gap-1.5">
                                                    <span className={`inline-flex items-center gap-1.5 text-[9px] font-bold px-2.5 py-1 rounded uppercase tracking-wider border ${ctr.stato === 'Attivato' ? 'text-[#10b981] bg-[#10b981]/10 border-[#10b981]/20' :
                                                        ctr.stato === 'In Lavorazione' ? 'text-[#eab308] bg-[#eab308]/10 border-[#eab308]/20' :
                                                            'text-rose-400 bg-rose-500/10 border-rose-500/20'
                                                        }`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full ${ctr.stato === 'Attivato' ? 'bg-[#10b981]' : ctr.stato === 'In Lavorazione' ? 'bg-[#eab308]' : 'bg-rose-400'}`} />
                                                        {ctr.stato}
                                                    </span>
                                                    <ExternalLink className="w-3 h-3 text-gray-600 group-hover:text-[#a855f7] transition-colors" />
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    )}

                    {/* ===== TAB DOCUMENTI (accordion + Smart Card) ===== */}
                    {tab === "documenti" && vedeAllegati && (<div className="space-y-4 animate-in fade-in duration-300">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                <Paperclip className="w-3 h-3" /> Fascicolo Digitale
                            </h3>
                            {puoCaricareDoc && !caricaOpen && (
                                <button onClick={() => { setCaricaOpen(true); setUpContract(contrattiCaricabili[0]?.id || ""); }}
                                    className="bg-transparent border border-[#7c3aed] text-[#a855f7] hover:bg-[#7c3aed] hover:text-white text-xs font-bold px-4 py-2 rounded-lg transition-all shadow-[0_0_15px_rgba(124,58,237,0.2)] flex items-center gap-1.5">
                                    <Plus className="w-3.5 h-3.5" /> Upload File
                                </button>
                            )}
                        </div>
                        {/* Segnalazione 114: carica un documento/PDA dimenticato su un contratto esistente */}
                        {caricaOpen && (
                            <div className="bg-[#161722] border border-[#7c3aed]/30 rounded-2xl p-4 space-y-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Contratto</label>
                                        <select value={upContract} onChange={e => setUpContract(e.target.value)} className="w-full mt-1 bg-[#0c0d14] border border-[#262836] rounded-lg px-3 py-2 text-sm text-white">
                                            {contrattiCaricabili.map(c => <option key={c.id} value={c.id}>{c.brand} · {c.categoria}{c.data ? " · " + new Date(c.data).toLocaleDateString("it-IT") : ""}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Tipo</label>
                                        <select value={upType} onChange={e => setUpType(e.target.value)} className="w-full mt-1 bg-[#0c0d14] border border-[#262836] rounded-lg px-3 py-2 text-sm text-white">
                                            {CATEGORIE_DOC.map(cat => <option key={cat.id} value={cat.id}>{cat.label}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <input type="file" onChange={e => setUpFile(e.target.files?.[0] || null)} className="block w-full text-xs text-gray-400 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-white/10 file:text-slate-200 file:text-xs file:font-semibold" />
                                <div className="flex gap-2">
                                    <button onClick={caricaDocumento} disabled={!upContract || !upFile || upBusy} className="flex-1 py-2 rounded-lg bg-[#7c3aed] hover:bg-[#6d28d9] disabled:opacity-40 text-white text-sm font-semibold flex items-center justify-center gap-2">
                                        {upBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Carica
                                    </button>
                                    <button onClick={() => { setCaricaOpen(false); setUpFile(null); }} className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-sm">Annulla</button>
                                </div>
                            </div>
                        )}
                        {docs.length === 0 ? (
                            <div className="bg-[#161722] border border-[#262836] rounded-2xl p-6 text-center text-xs text-gray-600">
                                Nessun documento caricato per questo cliente.
                            </div>
                        ) : (
                            // MENU A TRE LIVELLI (Luca 07/08): ogni categoria è un menù che si
                            // scoppia/nasconde; dentro, la selezione del BRAND (se il cliente ha
                            // pratiche di più brand) e poi la divisione per MESI: un click sul
                            // mese e compaiono i file di quel mese. Un file = UNA card anche se
                            // la vendita l'ha agganciato a più pratiche (dedup per file).
                            <div className="space-y-3">
                                {CATEGORIE_DOC.map((cat) => {
                                    // categorie smarriti/archiviati SOLO all'amministrazione (MOD-14)
                                    if ((cat as { adminOnly?: boolean }).adminOnly && !isAdminDoc) return null;
                                    const perBrand = alberoDocs.get(cat.id);
                                    if (!perBrand || perBrand.size === 0) return null;
                                    const fileCat = new Set<string>();
                                    perBrand.forEach((pm) => pm.forEach((fl) => fl.forEach((f) => fileCat.add(f.key))));
                                    const aperta = !!openCat[cat.id];
                                    // SMART CARD (Master Dashboard 26/08): miniatura VERA per le
                                    // immagini, emoji di categoria per il resto; overlay 👁 al
                                    // passaggio; il click apre lightbox (immagini) o il file.
                                    const cardFile = (f: DocFile, sub: string) => {
                                        const isImmagine = /^image\//i.test(f.tipo || "") || /\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(f.nome || "");
                                        const contenuto = (
                                            <>
                                                <div className="h-24 bg-[#0c0d14] border-b border-[#262836] flex items-center justify-center relative overflow-hidden">
                                                    {isImmagine
                                                        ? <img src={f.url} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover opacity-80" />
                                                        : <span className="text-3xl opacity-60">{EMOJI_CAT[cat.id] || "📁"}</span>}
                                                    <div className="absolute inset-0 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                                                        style={{ background: `color-mix(in srgb, ${cat.color} 55%, transparent)` }}>
                                                        <span className="w-9 h-9 bg-white/25 rounded-full flex items-center justify-center text-white text-base backdrop-blur-md">👁️</span>
                                                    </div>
                                                </div>
                                                <div className="p-2.5">
                                                    <h4 className="text-xs font-bold text-white truncate">{f.nome}</h4>
                                                    {sub ? <p className="text-[10px] text-gray-500 mt-0.5 truncate">{sub}</p> : null}
                                                </div>
                                            </>
                                        );
                                        const cls = "bg-[#161722] border border-[#262836] rounded-2xl overflow-hidden group text-left w-full block transition-colors shadow-lg cursor-pointer";
                                        const hover = { onMouseEnter: (e: React.MouseEvent) => { (e.currentTarget as HTMLElement).style.borderColor = cat.color; }, onMouseLeave: (e: React.MouseEvent) => { (e.currentTarget as HTMLElement).style.borderColor = ""; } };
                                        return isImmagine
                                            ? <button key={f.key} type="button" className={cls} {...hover} title={f.nome} onClick={() => setLightbox({ src: f.url, alt: f.nome })}>{contenuto}</button>
                                            : <a key={f.key} href={f.url} target="_blank" rel="noreferrer" className={cls} {...hover} title={f.nome}>{contenuto}</a>;
                                    };
                                    // DOCUMENTI D'IDENTITÀ (Luca 08/08): niente livello brand né mesi —
                                    // apri la categoria e vedi i file del cliente. Il brand distingue
                                    // solo i CONTRATTI (le altre categorie tengono brand→mesi).
                                    const catPiatta = cat.id === "documento";
                                    const filePiatti = catPiatta
                                        ? [...new Map([...perBrand.values()].flatMap((pm) => [...pm.values()].flat()).map((f) => [f.key, f])).values()]
                                        : [];
                                    return (
                                        <div key={cat.id} className="bg-[#161722]/60 border border-[#262836] rounded-2xl overflow-hidden">
                                            <button type="button" onClick={() => setOpenCat((o) => ({ ...o, [cat.id]: !o[cat.id] }))}
                                                className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-white/[0.03] transition-colors">
                                                {aperta ? <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />}
                                                <span className="text-sm shrink-0">{EMOJI_CAT[cat.id] || "📁"}</span>
                                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                                                    style={{ color: cat.color, background: cat.color + "1f", border: "1px solid " + cat.color + "44" }}>
                                                    {cat.label}
                                                </span>
                                                <span className="text-[10px] text-gray-600">{fileCat.size} file</span>
                                            </button>
                                            {aperta && catPiatta && (
                                                <div className="px-3 pb-3">
                                                    <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                                                        {filePiatti.map((f) => cardFile(f, ""))}
                                                    </div>
                                                </div>
                                            )}
                                            {aperta && !catPiatta && (
                                                <div className="px-3 pb-3 space-y-2">
                                                    {[...perBrand.entries()].map(([brand, perMese]) => {
                                                        const bKey = cat.id + "|" + brand;
                                                        const bAperta = openBrand[bKey] ?? perBrand.size === 1;
                                                        const mesi = [...perMese.keys()].sort().reverse();
                                                        const meseAttivo = meseSel[bKey] && perMese.has(meseSel[bKey]) ? meseSel[bKey] : mesi[0];
                                                        const nBrand = new Set([...perMese.values()].flat().map((f) => f.key)).size;
                                                        const logo = TRK_BRAND_LOGOS[trkBrandKey(brand)];
                                                        return (
                                                            <div key={brand} className="border border-[#262836] rounded-xl overflow-hidden bg-[#0c0d14]/40">
                                                                <button type="button" onClick={() => setOpenBrand((o) => ({ ...o, [bKey]: !bAperta }))}
                                                                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.03] transition-colors">
                                                                    {bAperta ? <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />}
                                                                    {logo ? <img src={logo} alt={brand} className="w-5 h-5 object-contain shrink-0" /> : null}
                                                                    <span className="text-xs font-bold text-slate-200">
                                                                        {brand === "Conservati" ? "Contratti eliminati — documenti conservati" : brand}
                                                                    </span>
                                                                    <span className="text-[10px] text-gray-600">{nBrand} file</span>
                                                                </button>
                                                                {bAperta && (
                                                                    <div className="px-3 pb-3 space-y-2">
                                                                        {mesi.length > 1 && (
                                                                            <div className="flex flex-wrap gap-1.5">
                                                                                {mesi.map((m) => (
                                                                                    <button key={m} type="button" onClick={() => setMeseSel((s) => ({ ...s, [bKey]: m }))}
                                                                                        className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${m === meseAttivo ? "bg-[#7c3aed]/20 border-[#7c3aed]/50 text-[#a855f7] font-semibold" : "bg-white/[0.02] border-[#262836] text-gray-400 hover:bg-white/[0.05]"}`}>
                                                                                        {labelMeseDoc(m)} · {new Set((perMese.get(m) || []).map((f) => f.key)).size}
                                                                                    </button>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                        <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                                                                            {(perMese.get(meseAttivo) || []).map((f) => {
                                                                                const sub = (f.pratiche.length === 0
                                                                                    ? "contratto eliminato — documento conservato"
                                                                                    : f.pratiche.length === 1 ? f.pratiche[0] : `su ${f.pratiche.length} pratiche della vendita`);
                                                                                return cardFile(f, `${labelMeseDoc(meseAttivo)} · ${sub}`);
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>)}

                        </div>{/* /tab content */}
                    </div>{/* /colonna destra */}
                </div>{/* /corpo */}

                {/* MODAL FOOTER */}
                <div className="flex-none px-6 py-3.5 border-t border-[#262836] bg-[#0c0d14]/50 flex justify-between">
                    <button
                        onClick={() => {
                            onClose();
                            window.dispatchEvent(new CustomEvent("edit-client", { detail: cliente }));
                        }}
                        className="px-6 py-2 rounded-xl bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-bold text-xs uppercase tracking-widest transition-all shadow-lg shadow-[#7c3aed]/20"
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

// cellularePrecompilato (AIR-01e): dal Registro Chiamate si arriva qui con
// /clienti?nuovo=<numero> e il campo Cellulare è già compilato (senza +39).
function ClienteFormModal({ cliente, cellularePrecompilato, onClose, onSave }: { cliente?: Cliente | null; cellularePrecompilato?: string | null; onClose: () => void; onSave: (nuovoId?: string) => void }) {
    const { user } = useAuth();   // creato_da sul nuovo cliente (come caller/usati)
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [tipo, setTipo] = useState<"consumer" | "business">(cliente?.tipo ?? "consumer");
    // Il referente delle business qui e' il campo Nome/Cognome, ma il dato
    // canonico sta in nome_ref/cognome_ref (Registra Vendita scrive quello e
    // lascia nome vuoto): senza il ripiego il modale mostrava il referente
    // VUOTO su anagrafiche che lo avevano (caso "collaboratori sicuri di
    // averlo messo", Luca 01/08).
    const [nome, setNome] = useState((cliente?.nome || "").trim() ? cliente!.nome : (cliente?.nomeRef ?? ""));
    const [cognome, setCognome] = useState((cliente?.cognome || "").trim() ? (cliente?.cognome ?? "") : (cliente?.cognomeRef ?? ""));
    const [ragioneSociale, setRagioneSociale] = useState(cliente?.ragioneSociale ?? "");
    // CF del referente (mig. 139): qui e' compilabile ma non bloccante
    const [cfRef, setCfRef] = useState(cliente?.cfRef ?? "");
    const [cellulare, setCellulare] = useState(cliente?.cellulare ?? (cellularePrecompilato || ""));
    // recapito FISSO facoltativo, solo business (mig. 124)
    const [fisso, setFisso] = useState(cliente?.telefonoFisso ?? "");
    const [email, setEmail] = useState(cliente?.email ?? "");
    const [cfPiva, setCfPiva] = useState(cliente?.cf_piva ?? "");
    const [indirizzo, setIndirizzo] = useState(cliente?.indirizzo ?? "");
    const [cap, setCap] = useState(cliente?.cap ?? "");
    const [citta, setCitta] = useState(cliente?.citta ?? "");
    // IBAN + DOCUMENTI dal form (Luca 11/08): comodi anche senza vendita —
    // l'IBAN va sull'anagrafica, i file diventano contract_attachments del solo
    // cliente (contract_id NULL, mig. 20260806010000: sopravvivono comunque)
    const [iban, setIban] = useState(cliente?.iban ?? "");
    const [docNuovi, setDocNuovi] = useState<File[]>([]);
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
    // COERENZA CF ↔ nome (Luca 24/08, caso Stefania/Anna): bloccante ma forzabile
    const [cfInc, setCfInc] = useState<string[] | null>(null);
    const cfForzaRef = useRef(false);
    const [emailDup, setEmailDup] = useState<DupCliente | null>(null);
    const spostaRef = useRef(false);
    const checkEmail = async () => {
        setEmailDup(email.trim() ? (await trovaDuplicati({ excludeId: cliente?.id || null, email })).email : null);
    };
    const handleSave = async () => {
        // il «forza» del check CF si CONSUMA alla prima riga: qualunque
        // early-return successivo non lo lascia armato per il giro dopo
        const forzaCF = cfForzaRef.current;
        cfForzaRef.current = false;
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
        // P.IVA OBBLIGATORIA per il business (Luca 03/08): prima era facoltativa
        if (tipo === "business" && !cfPiva.trim()) {
            setError("La Partita IVA è obbligatoria per i clienti Business.");
            return;
        }
        if (tipo === "business" && cfPiva.trim() && !/^\d{11}$/.test(cfPiva.trim()) && !/^[A-Z0-9]{16}$/i.test(cfPiva.trim())) {
            setError("Partita IVA non valida: 11 cifre (o CF di 16 caratteri per le ditte individuali).");
            return;
        }
        if (!cliente && !acquisito) {
            setError("Seleziona da chi è stato acquisito il cliente (negozio o Agenzia).");
            return;
        }
        // Bug indirizzo (Luca 04/08): l'indirizzo resta facoltativo, ma se è
        // compilato il numero civico è OBBLIGATORIO (in archivio senza civico
        // non serve a niente).
        if (indirizzo.trim() && civicoMancante(indirizzo)) {
            setError("Nell'indirizzo manca il numero civico (es. \"Via Roma 12\"): aggiungilo oppure lascia il campo vuoto.");
            return;
        }

        // COERENZA CF ↔ NOME (Luca 24/08): consumer sul CF del cliente,
        // business sul CF del referente (nel form nome/cognome SONO il
        // referente). Blocca, ma si può forzare con conferma esplicita.
        setCfInc(null);
        const esCF = tipo === "consumer" ? verificaCoerenzaCF(nome, cognome, cfPiva) : verificaCoerenzaCF(nome, cognome, cfRef);
        if (!esCF.ok && !forzaCF) { setCfInc(esCF.motivi); return; }

        // tipoNuovo: il cellulare blocca solo tra anagrafiche dello STESSO tipo —
        // la coppia consumer+business puo' condividerlo (Luca 01/08)
        const dup = await trovaDuplicati({ excludeId: cliente?.id || null, cellulare, tipoNuovo: tipo, cfPiva, email });
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
            cf_ref: tipo === "business" ? (cfRef.trim().toUpperCase() || null) : null,
            // archivio SENZA +39 (Luca 31/07): il prefisso lo aggiungono le
            // integrazioni all'invio
            cellulare: numeroNazionale(cellulare) || cellulare,
            telefono_fisso: tipo === "business" ? ((numeroNazionale(fisso) || fisso.trim()) || null) : null,
            email,
            cf_piva: cfPiva.trim() || null,
            // data di nascita DERIVATA dal CF (mai chiesta nel form); se il CF
            // non la fornisce (business/P.IVA) resta quella gia' salvata —
            // prima ogni modifica la azzerava
            data_nascita: dataNascitaDaCF(cfPiva) || (cliente?.data_nascita ?? null),
            indirizzo,
            cap,
            citta,
            iban: iban.trim().toUpperCase().replace(/\s+/g, " ") || null,
        };

        let nuovoId: string | undefined;
        try {
            if (cliente) {
                const { error: err } = await supabase.from("clients").update(basePayload).eq("id", cliente.id);
                if (err) throw err;
            } else {
                const idBase = cfPiva.trim() || cellulare.replace(/\D/g, "") || "ND";
                // is_demo esplicito: il default del DB e' true e marchiava "demo" i clienti veri.
                // creato_da come negli altri flussi (caller/usati/chiusura-linea): senza,
                // il creatore con scope "appuntamenti" non vedeva il SUO cliente (12/08)
                const insertPayload = { id: `CL-${idBase.replace(/\s/g, "")}-${Date.now()}`, ...basePayload, acquisito_da: acquisito || null, creato_da: user?.name || "", is_demo: false };
                const { error: err } = await supabase.from("clients").insert([insertPayload]);
                if (err) throw err;
                nuovoId = insertPayload.id;
                // DOCUMENTI dal form (Luca 11/08): caricati sul cliente appena
                // creato, senza vendita (contract_id NULL). Best-effort: un
                // errore sull'upload non butta via l'anagrafica salvata.
                for (const f of docNuovi) {
                    try {
                        const ext = (f.name.split(".").pop() || "bin");
                        const path = `${insertPayload.id}/${insertPayload.id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
                        const { error: upErr } = await supabase.storage.from("contracts").upload(path, f);
                        if (upErr) throw upErr;
                        const { data: pub } = supabase.storage.from("contracts").getPublicUrl(path);
                        await supabase.from("contract_attachments").insert({
                            contract_id: null, client_id: insertPayload.id,
                            file_url: pub.publicUrl, file_name: f.name, file_type: "documento",
                        });
                    } catch (e) { console.error("[CLIENTI] upload documento fallito:", e); }
                }
                // RETRO-AGGANCIO (AIR-01e): le chiamate del Registro ancora senza
                // cliente con questo numero si agganciano alla nuova anagrafica
                // (coda di 9 cifre, cifre intervallate da % per gli spazi).
                // Best-effort: un errore qui non blocca il salvataggio.
                const codaCell = String(basePayload.cellulare || "").replace(/\D/g, "").slice(-9);
                if (codaCell.length >= 6) {
                    await supabase.from("call_events")
                        .update({ client_id: insertPayload.id })
                        .is("client_id", null)
                        .ilike("cliente_num", "%" + codaCell.split("").join("%") + "%");
                }
            }
            onSave(nuovoId);
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
                    {cfInc && (
                        <div className="mx-6 mb-2 p-4 rounded-xl bg-red-500/10 border border-red-500/40 space-y-2">
                            <p className="text-sm text-red-200 font-medium">🪪 Il codice fiscale non torna coi dati scritti:</p>
                            <ul className="text-xs text-red-200/90 list-disc pl-5 space-y-0.5">{cfInc.map((m) => <li key={m}>{m}</li>)}</ul>
                            <div className="flex gap-2 flex-wrap">
                                <button type="button" onClick={() => { cfForzaRef.current = true; handleSave(); }}
                                    className="text-xs px-3 py-2 rounded-lg bg-red-500/20 border border-red-500/50 text-red-200 hover:bg-red-500/30 font-bold">
                                    ⚠️ Salva comunque — mi assumo l&apos;errore
                                </button>
                                <button type="button" onClick={() => setCfInc(null)}
                                    className="text-xs px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-slate-300 hover:bg-white/10 font-bold">
                                    Correggo i dati
                                </button>
                            </div>
                        </div>
                    )}
                    {dupCell && (
                        <div className="mx-6 mb-2 p-4 rounded-xl bg-amber-500/10 border border-amber-500/40 space-y-2">
                            <p className="text-sm text-amber-200 font-medium">📱 Questo cellulare è già associato a <strong>“{dupCell.label}”</strong>, un&apos;anagrafica dello <strong>stesso tipo</strong> — lo stesso numero può stare solo su una consumer e una business insieme.</p>
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
                            {tipo === "business" && (
                                <div className="md:col-span-2 space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">CF Referente</label>
                                    <input
                                        type="text"
                                        value={cfRef}
                                        maxLength={16}
                                        onChange={(e) => setCfRef(e.target.value.toUpperCase().replace(/\s+/g, ""))}
                                        className="w-full glass-input text-sm rounded-xl py-3 font-mono"
                                        placeholder="RSSMRA80A01H501B"
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

                            {tipo === "business" && (
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Telefono fisso</label>
                                    <input
                                        type="text"
                                        value={fisso}
                                        onChange={(e) => setFisso(e.target.value)}
                                        className="w-full glass-input text-sm rounded-xl py-3 font-mono"
                                        placeholder="06 1234567 (facoltativo)"
                                    />
                                </div>
                            )}

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
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">{tipo === "business" ? "Partita IVA" : "Codice Fiscale"} {tipo === "business" ? <span className="text-rose-400">*</span> : <span className="text-slate-600 normal-case font-normal">(facoltativo)</span>}</label>
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
                            {/* IBAN dal form (Luca 11/08): comodo anche senza vendita */}
                            <div className="space-y-1.5 sm:col-span-2">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">IBAN</label>
                                <input
                                    type="text"
                                    value={iban}
                                    onChange={(e) => setIban(e.target.value.toUpperCase())}
                                    className="w-full glass-input text-sm rounded-xl py-3 font-mono"
                                    placeholder="IT60 X054 2811 1010 0000 0123 456"
                                />
                            </div>
                            {/* DOCUMENTO D'IDENTITÀ dal form (Luca 11/08): caricato sul
                                cliente anche senza alcuna vendita registrata */}
                            {!cliente && (
                                <div className="space-y-1.5 sm:col-span-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">🪪 Documento d&apos;identità <span className="normal-case font-normal">(facoltativo — fronte/retro, foto o PDF)</span></label>
                                    <input
                                        type="file"
                                        multiple
                                        accept="image/*,.pdf"
                                        onChange={(e) => setDocNuovi(Array.from(e.target.files || []))}
                                        className="w-full text-sm text-slate-400 file:mr-3 file:px-3.5 file:py-2 file:rounded-lg file:border file:border-violet-500/40 file:bg-violet-500/15 file:text-violet-200 file:text-xs file:font-bold file:cursor-pointer hover:file:bg-violet-500/25 file:transition-all"
                                    />
                                    {docNuovi.length > 0 && (
                                        <div className="text-[11px] text-slate-400">🪪 {docNuovi.length} file da caricare: {docNuovi.map((f) => f.name).join(" · ")}</div>
                                    )}
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
    filterTipo: "tutti" as "tutti" | "consumer" | "business" | "turista",
    // FILTRI TIPO CUMULABILI (Luca 13/08): si sommano in OR; vuoto = tutti.
    // filterTipo resta solo per migrare le view salvate prima del cambio.
    filterTipi: [] as ("consumer" | "business" | "turista")[],
    filterNome: "",
    filterCognome: "",
    filterRagione: "",
    filterCellulare: "",
    filterEmail: "",
    filterIdentifier: "",
    // Periodo di ACQUISIZIONE (Luca 31/07): quando l'anagrafica e' NATA nel
    // CRM — es. da ieri a ieri = tutte le anagrafiche nuove generate ieri
    filterAcqDa: "",
    filterAcqA: "",
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
    // Tipi cumulabili: le view salvate col vecchio filterTipo singolo
    // vengono lette come selezione a un elemento finche' non si ritocca
    const filterTipi = useMemo<("consumer" | "business" | "turista")[]>(() => {
        if (view.filterTipi && view.filterTipi.length) return view.filterTipi;
        return view.filterTipo && view.filterTipo !== "tutti" ? [view.filterTipo] : [];
    }, [view.filterTipi, view.filterTipo]);
    const toggleTipo = (t: "consumer" | "business" | "turista") => setView((p) => ({
        ...p, filterTipo: "tutti",
        filterTipi: filterTipi.includes(t) ? filterTipi.filter((x) => x !== t) : [...filterTipi, t],
    }));
    const azzeraTipi = () => setView((p) => ({ ...p, filterTipo: "tutti", filterTipi: [] }));
    const soloBusiness = filterTipi.length > 0 && filterTipi.every((t) => t === "business");
    const soloPrivati = filterTipi.length > 0 && !filterTipi.includes("business");
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
    const filterAcqDa = view.filterAcqDa || "";
    const setFilterAcqDa = (v: string) => setView((p) => ({ ...p, filterAcqDa: v }));
    const filterAcqA = view.filterAcqA || "";
    const setFilterAcqA = (v: string) => setView((p) => ({ ...p, filterAcqA: v }));

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
    const { perms: capPerms } = useRolePermissions(role, user?.grade, user?.id);
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
    const [acquisitiGest, setAcquisitiGest] = useState<{ id: string; acquisito_da: string | null; creato_da?: string | null }[]>([]);
    // "👤 I MIEI" (Luca 11/08, richiesta consulenti): default TUTTI aperti, col
    // toggle si vedono solo i clienti gestiti (venditore di una pratica) o
    // creati da me. match_name incluso: sui contratti il venditore è spesso
    // quello (lezione Eloisa Nucci / segn. Lorenzo 03/08).
    const [soloMiei, setSoloMiei] = useState(false);
    const [mieiNomi, setMieiNomi] = useState<Set<string> | null>(null);
    useEffect(() => {
        if (!soloMiei || mieiNomi || !user?.id) return;
        (async () => {
            const nomi = new Set<string>();
            const t0 = String(user?.name || "").trim().toLowerCase();
            if (t0) nomi.add(t0);
            const { data } = await supabase.from("app_users").select("full_name, match_name").eq("id", user.id).maybeSingle();
            [data?.full_name, data?.match_name].forEach((n) => { const t = String(n || "").trim().toLowerCase(); if (t) nomi.add(t); });
            setMieiNomi(nomi);
        })();
    }, [soloMiei, mieiNomi, user?.id, user?.name]);
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
        if (!vedeGestitoDa && !soloMiei && !(canApproveAccess && (filterGestitoDa.length || filterNegozioGestito.length))) return;
        (async () => {
            const { data: cs } = await caricaTutte<{ client_id: string | null; venditore: string | null; negozio: string | null }>((from, to) =>
                supabase.from("contracts").select("client_id, venditore, negozio").order("id").range(from, to));
            // creato_da (mig. 108): il caller che ha creato l'anagrafica conta
            // come gestore; fallback senza colonna finche' non e' applicata
            const tentativo = await caricaTutte<{ id: string; acquisito_da: string | null; creato_da?: string | null }>((from, to) =>
                supabase.from("clients").select("id, acquisito_da, creato_da").order("id").range(from, to));
            const acq = !tentativo.error ? tentativo.data
                : (await caricaTutte<{ id: string; acquisito_da: string | null }>((from, to) =>
                    supabase.from("clients").select("id, acquisito_da").order("id").range(from, to))).data;
            setContrattiGest((cs ?? []) as never);
            setAcquisitiGest((acq ?? []) as never);
        })();
    }, [canApproveAccess, vedeGestitoDa, soloMiei, filterGestitoDa, filterNegozioGestito, contrattiGest]);
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
            // + anagrafiche CREATE dalla persona (caller, mig. 108)
            acquisitiGest.forEach((c) => {
                if (nomiSel.has(String(c.creato_da || "").trim().toLowerCase())) set!.add(c.id);
            });
        }
        if (filterNegozioGestito.length) {
            const s = new Set<string>();
            contrattiGest.forEach((c) => { if (c.client_id && filterNegozioGestito.some((ng) => sameStore(c.negozio, ng))) s.add(c.client_id); });
            acquisitiGest.forEach((c) => { if (filterNegozioGestito.some((ng) => sameStore(c.acquisito_da, ng))) s.add(c.id); });
            set = set ? new Set([...set].filter((id) => s.has(id))) : s;
        }
        return set;
    }, [canApproveAccess, filterGestitoDa, filterNegozioGestito, contrattiGest, acquisitiGest, utentiFiltro]);
    // clienti "miei": venditore di una pratica O creatore dell'anagrafica
    const mieiSet = useMemo(() => {
        if (!soloMiei) return null;
        if (contrattiGest === null || !mieiNomi) return new Set<string>(); // in carica
        const set = new Set<string>((contrattiGest || [])
            .filter((c) => c.client_id && mieiNomi.has(String(c.venditore || "").trim().toLowerCase()))
            .map((c) => c.client_id as string));
        acquisitiGest.forEach((c) => {
            if (mieiNomi.has(String(c.creato_da || "").trim().toLowerCase())) set.add(c.id);
        });
        return set;
    }, [soloMiei, contrattiGest, acquisitiGest, mieiNomi]);

    // MOTIVO OBBLIGATORIO (03/08): al click su "Richiedi accesso" si apre un
    // modale dove si spiega PERCHE' serve quel cliente; il testo viaggia con
    // la richiesta (client_access_requests.motivo, mig. 137) e l'amministrazione
    // lo vede sulla richiesta pendente e nello Storico Approvazioni.
    const [accessReqCliente, setAccessReqCliente] = useState<Cliente | null>(null);
    const [accessReqMotivo, setAccessReqMotivo] = useState("");
    const [accessReqInvio, setAccessReqInvio] = useState(false);
    const richiediAccesso = async () => {
        if (!accessReqCliente || !accessReqMotivo.trim() || accessReqInvio) return;
        setAccessMsg("");
        setAccessReqInvio(true);
        const { error } = await supabase.from("client_access_requests").insert({
            client_id: accessReqCliente.id, requested_by: user?.id || null, requested_by_name: user?.name || "—",
            motivo: accessReqMotivo.trim(),
        });
        setAccessReqInvio(false);
        if (error) { setAccessMsg("⚠️ Invio non riuscito (funzione in attivazione): riprova più tardi."); setAccessReqCliente(null); return; }
        visCli.segnaPending(accessReqCliente.id);
        setAccessMsg("✅ Richiesta inviata all'amministrazione: vedrai i dati appena approvata.");
        setAccessReqCliente(null); setAccessReqMotivo("");
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

    // ANAGRAFIZZAZIONE dal Registro Chiamate (AIR-01e): /clienti?nuovo=<numero>
    // apre SUBITO il form nuovo cliente col cellulare precompilato (senza +39,
    // regola archivio 31/07). Stesso idioma del deep link ?id= qui sopra
    // (window.location, non useSearchParams: niente wrapper Suspense).
    const [numeroPrecompilato, setNumeroPrecompilato] = useState<string | null>(null);
    useEffect(() => {
        const nuovo = new URLSearchParams(window.location.search).get("nuovo");
        if (!nuovo) return;
        setNumeroPrecompilato(numeroNazionale(nuovo) || nuovo);
        setClientToEdit(null);
        setIsFormOpen(true);
    }, []);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const fetchClientList = async () => {
        setLoadError(null);
        setLoading(true);
        // caricaTutte: oltre i 1000 clienti il tetto server troncava la lista
        // e le anagrafiche recenti sparivano A TUTTI (admin compreso).
        const { data, error } = await caricaTutte<Record<string, unknown>>((from, to) =>
            supabase.from("clients").select("*").order("id").range(from, to));
        if (error) {
            setLoadError(error.message || "errore di caricamento");
            setClientList([]);
        } else {
            setClientList(data.map(mapRowToCliente));
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
                const fullString = `${c.nome} ${c.cognome || ""} ${c.ragioneSociale || ""} ${c.nomeRef || ""} ${c.cognomeRef || ""} ${c.email} ${c.cellulare} ${c.telefonoFisso || ""} ${c.cf_piva || ""}`.toLowerCase();
                if (!fullString.includes(q)) return false;
            }

            // 2. Advanced filters
            if (gestitiSet && !gestitiSet.has(c.id)) return false;
            if (mieiSet && !mieiSet.has(c.id)) return false;
            // Tipi cumulabili in OR (Luca 13/08): il cliente passa se rientra
            // in ALMENO uno dei tipi selezionati; nessuna selezione = tutti
            if (filterTipi.length) {
                const passaTipo = (filterTipi.includes("consumer") && c.tipo === "consumer")
                    || (filterTipi.includes("business") && c.tipo === "business")
                    || (filterTipi.includes("turista") && !!c.turista);
                if (!passaTipo) return false;
            }
            // per le business il "Nome/Cognome Referente" puo' stare in nome_ref
            // (Registra Vendita) o in nome (caller): il filtro guarda entrambi
            if (filterNome && !`${c.nome} ${c.nomeRef || ""}`.toLowerCase().includes(filterNome.toLowerCase())) return false;
            if (filterCognome && !`${c.cognome || ""} ${c.cognomeRef || ""}`.toLowerCase().includes(filterCognome.toLowerCase())) return false;
            if (filterRagione && c.tipo === "business" && (!c.ragioneSociale || !c.ragioneSociale.toLowerCase().includes(filterRagione.toLowerCase()))) return false;
            if (filterCellulare && !c.cellulare.includes(filterCellulare)) return false;
            if (filterEmail && !c.email.toLowerCase().includes(filterEmail.toLowerCase())) return false;
            if (filterIdentifier && !(c.cf_piva || "").toLowerCase().includes(filterIdentifier.toLowerCase())) return false;

            // Periodo di ACQUISIZIONE (estremi inclusi): quando l'anagrafica e'
            // nata nel CRM, in data LOCALE italiana
            if (filterAcqDa || filterAcqA) {
                if (!c.created_at) return false;
                const dt = new Date(c.created_at);
                if (isNaN(dt.getTime())) return false;
                const p = (n: number) => String(n).padStart(2, "0");
                const giorno = `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
                if (filterAcqDa && giorno < filterAcqDa) return false;
                if (filterAcqA && giorno > filterAcqA) return false;
            }

            return true;
        });
    }, [clientList, quickSearch, filterTipi, filterNome, filterCognome, filterRagione, filterCellulare, filterEmail, filterIdentifier, filterAcqDa, filterAcqA, gestitiSet, mieiSet]);

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
        <div className="flex-1 flex flex-col h-screen overflow-hidden">
            {/* TITOLO nudo sul gradiente, come Ricerca Vendite (GLB-01, Luca 04/08):
                niente tag <header> (in tema chiaro diventava una card bianca per la
                regola globale html.light header) e niente lastra bg/blur/border.
                NB: risolve anche la "barra bianca sospesa" del commit 138bbd4
                (#clienti-shell): senza lastra non serve il pannello contenitore. */}
            <div className="flex-none flex items-center justify-between pb-6">
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
                                        <div key={String(r.id)} className="text-sm text-slate-300">
                                            <div className="flex items-center gap-3 flex-wrap">
                                                <span><strong className="text-white">{String(r.requested_by_name)}</strong> chiede l'accesso a <strong className="text-white">{nomeCl}</strong></span>
                                                <span className="ml-auto flex gap-2">
                                                    <button onClick={() => decidiAccesso(String(r.id), true)} className="text-xs px-3 py-1.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30 font-bold">Approva</button>
                                                    <button onClick={() => decidiAccesso(String(r.id), false)} className="text-xs px-3 py-1.5 rounded-md bg-rose-500/15 border border-rose-500/40 text-rose-300 hover:bg-rose-500/25 font-bold">Rifiuta</button>
                                                </span>
                                            </div>
                                            {/* MOTIVO della richiesta (mig. 137): sempre in chiaro per chi decide */}
                                            {!!r.motivo && <div className="mt-0.5 text-xs text-violet-200/80 italic">Motivo: &ldquo;{String(r.motivo)}&rdquo;</div>}
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
            </div>

            {/* ── MODALE MOTIVO richiesta accesso (03/08): il motivo e' OBBLIGATORIO
                e arriva in chiaro all'amministrazione insieme alla richiesta ── */}
            {accessReqCliente && (
                <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setAccessReqCliente(null)}>
                    <div className="glass-panel w-full max-w-md shadow-2xl border-white/10 p-5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-1">
                            <h3 className="text-lg font-bold text-white">🔓 Richiesta di accesso</h3>
                            <button onClick={() => setAccessReqCliente(null)} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/10"><X className="w-5 h-5" /></button>
                        </div>
                        <p className="text-sm text-slate-400 mb-3">
                            Stai chiedendo i dati di <strong className="text-white">{accessReqCliente.tipo === "business" ? accessReqCliente.ragioneSociale : `${accessReqCliente.nome} ${accessReqCliente.cognome}`}</strong>.
                            Scrivi il motivo: l&apos;amministrazione lo vedrà sulla richiesta.
                        </p>
                        <textarea
                            value={accessReqMotivo} onChange={(e) => setAccessReqMotivo(e.target.value)} autoFocus rows={3}
                            placeholder="Es. il cliente è passato in negozio per una nuova attivazione…"
                            className="glass-input w-full rounded-lg py-2 text-sm resize-none"
                        />
                        <div className="flex justify-end gap-2 mt-4">
                            <button onClick={() => setAccessReqCliente(null)} className="text-xs px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 font-bold">Annulla</button>
                            <button onClick={richiediAccesso} disabled={!accessReqMotivo.trim() || accessReqInvio}
                                className="text-xs px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed">
                                {accessReqInvio ? "Invio…" : "Invia richiesta"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* CONTENT */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8">
                <div className="max-w-7xl mx-auto space-y-6">

                    {/* TOP CONTROLS — pulsantini tipo cliente + ricerca + filtri
                        sulla STESSA riga (Luca 08/08: più piccoli, allineati alla
                        casella di ricerca, tabella più in alto) */}
                    <div className="flex flex-col md:flex-row gap-3 justify-between items-center">
                        {/* Tipo cliente: solo emoji, altezza = casella ricerca.
                            CUMULABILI (Luca 13/08): i tre tipi si spuntano
                            insieme (OR); 👥 azzera la selezione = tutti */}
                        <div className="flex gap-1.5 shrink-0">
                            <button
                                onClick={() => { azzeraTipi(); setCurrentPage(1); }}
                                title="Tutti i clienti" aria-label="Tutti i clienti"
                                className={`w-11 h-11 rounded-xl border flex items-center justify-center text-lg transition-all ${!filterTipi.length
                                    ? "bg-violet-500/20 border-violet-500/50 shadow shadow-violet-500/10"
                                    : "bg-white/5 border-white/10 grayscale opacity-60 hover:opacity-100 hover:grayscale-0"
                                    }`}
                            >
                                👥
                            </button>
                            {([
                                { t: "consumer", emoji: "👤", titolo: "Consumer" },
                                { t: "business", emoji: "🏢", titolo: "Business" },
                                { t: "turista", emoji: "🌍", titolo: "Turisti" },
                            ] as const).map(({ t, emoji, titolo }) => (
                                <button
                                    key={t}
                                    onClick={() => { toggleTipo(t); setCurrentPage(1); }}
                                    title={`${titolo} — cumulabile con gli altri tipi`} aria-label={titolo}
                                    className={`w-11 h-11 rounded-xl border flex items-center justify-center text-lg transition-all ${filterTipi.includes(t)
                                        ? "bg-violet-500/20 border-violet-500/50 shadow shadow-violet-500/10"
                                        : "bg-white/5 border-white/10 grayscale opacity-60 hover:opacity-100 hover:grayscale-0"
                                        }`}
                                >
                                    {emoji}
                                </button>
                            ))}
                            {/* 👤 I MIEI (Luca 11/08, come "Mostra i miei" degli Usati):
                                default tutti aperti, il toggle mostra solo i clienti
                                gestiti o creati da me */}
                            <button
                                onClick={() => { setSoloMiei((v) => !v); setCurrentPage(1); }}
                                title={soloMiei ? "Torna a tutti i clienti" : "Solo i clienti gestiti (venditore di una pratica) o creati da me"}
                                className={`h-11 px-3.5 rounded-xl border flex items-center justify-center gap-1.5 text-sm font-semibold transition-all ${soloMiei
                                    ? "bg-violet-500/25 border-violet-400/60 text-violet-100"
                                    : "bg-violet-500/10 border-violet-500/30 text-violet-200 hover:bg-violet-500/20"}`}
                            >
                                👤 I miei{soloMiei ? " ✓" : ""}
                            </button>
                        </div>
                        {/* Quick Search */}
                        <div className="relative w-full md:flex-1 md:max-w-md group">
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
                                {/* Il Tipo Cliente è ora nei pulsantoni emoji sopra la ricerca
                                    (Luca 08/08) — qui restano solo i filtri per dato specifico. */}

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
                                            {/* "Ufficio Commerciale" = anagrafiche nate dal call center
                                                (mig. 108): cosi' si includono/escludono dai ragionamenti
                                                di marketing (es. SMS compleanno solo a chi e' stato in negozio) */}
                                            <SelectMulti
                                                values={filterNegozioGestito}
                                                onChange={(v) => { setFilterNegozioGestito(v); setCurrentPage(1); }}
                                                opzioni={[...NEGOZI, "Ufficio Commerciale"]}
                                                className="w-full glass-input text-sm rounded-lg py-2"
                                            />
                                        </div>
                                    </>
                                )}

                                {/* Periodo di ACQUISIZIONE (Luca 31/07): anagrafiche NATE nel
                                    range — da ieri a ieri = i clienti nuovi generati ieri */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-slate-400">Acquisito dal <span className="normal-case text-slate-600">(anagrafica creata)</span></label>
                                    <input
                                        type="date"
                                        value={filterAcqDa}
                                        onChange={(e) => { setFilterAcqDa(e.target.value); setCurrentPage(1); }}
                                        className="w-full glass-input text-sm rounded-lg py-2"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-slate-400">Acquisito al</label>
                                    <input
                                        type="date"
                                        value={filterAcqA}
                                        onChange={(e) => { setFilterAcqA(e.target.value); setCurrentPage(1); }}
                                        className="w-full glass-input text-sm rounded-lg py-2"
                                    />
                                </div>

                                {/* Common Fields */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-slate-400">Nome {soloBusiness && "Referente"}</label>
                                    <input
                                        type="text"
                                        value={filterNome}
                                        onChange={(e) => { setFilterNome(e.target.value); setCurrentPage(1); }}
                                        className="w-full glass-input text-sm rounded-lg py-2"
                                        placeholder="Es. Mario"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-slate-400">Cognome {soloBusiness && "Referente"}</label>
                                    <input
                                        type="text"
                                        value={filterCognome}
                                        onChange={(e) => { setFilterCognome(e.target.value); setCurrentPage(1); }}
                                        className="w-full glass-input text-sm rounded-lg py-2"
                                        placeholder="Es. Rossi"
                                    />
                                </div>

                                {(!filterTipi.length || filterTipi.includes("business")) && (
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-slate-400">Ragione Sociale</label>
                                        <input
                                            type="text"
                                            value={filterRagione}
                                            onChange={(e) => { setFilterRagione(e.target.value); setCurrentPage(1); }}
                                            className="w-full glass-input text-sm rounded-lg py-2"
                                            placeholder="Es. Tech Srl"
                                            disabled={!filterTipi.includes("business")}
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
                                        {soloPrivati ? "Codice Fiscale" : soloBusiness ? "Partita IVA" : "CF / P.IVA"}
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
                                                        <button onClick={() => { setAccessReqCliente(cliente); setAccessReqMotivo(""); }}
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
                                                                {cliente.turista && <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 border border-amber-500/40 text-amber-300 normal-case">🌍 Turista</span>}
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
                                                    // senza pratiche resta il negozio di acquisizione. Il caller
                                                    // che ha CREATO l'anagrafica (mig. 108) conta come gestore.
                                                    const g = gestioneDi.get(cliente.id);
                                                    const venditori = [...(g?.venditori || [])];
                                                    if (cliente.creato_da && !venditori.includes(cliente.creato_da)) venditori.push(cliente.creato_da);
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
                    cellularePrecompilato={numeroPrecompilato}
                    onClose={() => {
                        setIsFormOpen(false);
                        setClientToEdit(null);
                        // il numero arrivato dal Registro vale per QUESTA apertura:
                        // un "Nuovo Cliente" successivo riparte pulito
                        setNumeroPrecompilato(null);
                    }}
                    onSave={(nuovoId) => {
                        fetchClientList();
                        // il cliente appena creato entra SUBITO nel perimetro
                        // visibile di chi l'ha acquisito (caso Francesco 12/08:
                        // nasceva lucchettato fino al reload)
                        if (nuovoId) visCli.segnaMio(nuovoId);
                    }}
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
    // AUDIO registrazioni a CAPABILITY (cap:/clienti:ascolta_registrazioni,
    // Luca 04/08): il gate vero sta sul proxy /api/aircall/recording (?u=
    // verificato a DB), qui si evita di mostrare un player che risponderebbe
    // 403. Lo storico SENZA audio resta visibile a chi vede il cliente.
    const { user: uStorico } = useAuth();
    const { perms: permsStorico } = useRolePermissions(uStorico?.role, uStorico?.grade, uStorico?.id);
    const puoAudio = puoAscoltareRegistrazioni(uStorico?.role, permsStorico);
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
                                                <span className="ml-auto text-xs text-slate-500 font-mono">{numeroNazionale(String(e.cliente_num || "")) || String(e.cliente_num || "")}</span>
                                            </div>
                                            {!!e.recording_url && puoAudio && (
                                                <div className="mt-2 flex items-center gap-3">
                                                    {/* il recording_url salvato SCADE in ~1h (firma S3): si passa dal
                                                        proxy che chiede ad Aircall un URL fresco a ogni ascolto — con
                                                        ?u= per il gate di ruolo (Luca 04/08) */}
                                                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                                                    <audio controls preload="none" src={e.aircall_call_id ? `/api/aircall/recording?call=${e.aircall_call_id}&u=${uStorico?.id || ""}` : String(e.recording_url)} className="h-8 flex-1 min-w-0" />
                                                    <a href={e.aircall_call_id ? `/api/aircall/recording?call=${e.aircall_call_id}&u=${uStorico?.id || ""}` : String(e.recording_url)} target="_blank" rel="noreferrer" download
                                                        className="text-xs font-bold text-sky-300 hover:text-white shrink-0">⬇ Scarica</a>
                                                </div>
                                            )}
                                            {!!e.call_id && (
                                                <div className="mt-1.5">
                                                    <Link href={`/caller?apri=${String(e.call_id)}`} className="text-[11px] font-bold text-violet-300 hover:text-violet-100 hover:underline">
                                                        → apri la pratica di questa chiamata
                                                    </Link>
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
                                    {/* CLICCABILE (Luca 31/07): l'esito porta alla pratica nel
                                        Caller, aperta in dettaglio con storico e registrazioni */}
                                    {pratiche.map((c) => (
                                        <Link key={String(c.id)} href={`/caller?apri=${String(c.id)}`}
                                            title="Apri la pratica nel Caller con tutti i dettagli"
                                            className="flex items-center gap-3 flex-wrap rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-sm hover:bg-white/[0.06] hover:border-violet-400/40 transition-colors">
                                            <span className="text-white">{quando(c.data_chiamata)}</span>
                                            <span className="px-2 py-0.5 rounded bg-violet-500/15 text-violet-200 text-[11px] font-bold">{String(c.stato || "—")}</span>
                                            <span className="text-slate-400 text-xs">{String(c.caller || "—")}</span>
                                            {!!c.lista_origine && <span className="text-slate-600 text-xs">lista: {String(c.lista_origine)}</span>}
                                            <span className="ml-auto text-violet-300 text-xs font-bold">→</span>
                                        </Link>
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

// ── STORICO WHATSAPP del cliente (Luca 25/08 notte): le conversazioni del
// cliente coi NOSTRI numeri (wa_conversations.client_id, agganciato dal
// webhook in entrata e dalle chat aperte da noi) — etichetta del numero
// (negozio/utente), anteprima e data, click = LA chat esatta (/chat?conv=).
// Top-level (lezione: mai annidata). Niente righe = il blocco non esiste.
function WhatsAppStoricoCliente({ clientId }: { clientId: string }) {
    const { user } = useAuth();
    const { stores: negoziMiei } = useVisibleStores();
    const [righe, setRighe] = useState<{ id: string; last_message_at: string | null; last_preview: string | null; etichetta: string }[] | null>(null);
    useEffect(() => {
        let vivo = true;
        (async () => {
            const { data: convs } = await supabase.from("wa_conversations")
                .select("id, instance_id, customer_number, last_message_at, last_preview")
                .eq("client_id", clientId)
                .order("last_message_at", { ascending: false, nullsFirst: false });
            if (!vivo) return;
            if (!convs || !convs.length) { setRighe([]); return; }
            // SOLO i numeri nella visibilità di chi guarda (rilievo alto del
            // revisore 25/08: la scheda mostrava titolare e anteprima delle
            // chat sui numeri personali altrui). Stessa regola dell'Inbox:
            // waIstanzeVisibili + supervisione call center del direttore cc.
            type Ist = { id: string; display_name: string | null; negozio: string | null; wa_number: string | null; owner_user_id: string | null };
            type Ute = { id: string; full_name: string | null; role: string | null };
            const [{ data: insts }, { data: us }] = await Promise.all([
                supabase.from("wa_instances").select("id, display_name, negozio, wa_number, owner_user_id"),
                supabase.from("app_users").select("id, full_name, role"),
            ]);
            if (!vivo) return;
            const utenti = new Map<string, Ute>(((us ?? []) as Ute[]).map((u) => [u.id, u]));
            let vis = waIstanzeVisibili((insts ?? []) as Ist[], user?.id, user?.role, negoziMiei);
            if (user?.role === "direttore_cc") {
                const gia = new Set(vis.map((i) => i.id));
                vis = [...vis, ...((insts ?? []) as Ist[]).filter((i) => !gia.has(i.id) && i.owner_user_id && areaOf(String(utenti.get(i.owner_user_id)?.role || "")) === "cc")];
            }
            const visibili = new Map<string, Ist>(vis.map((i) => [i.id, i]));
            const etich = (iid: string) => {
                const i = visibili.get(iid);
                if (!i) return "";
                return i.display_name || (i.owner_user_id && utenti.get(i.owner_user_id)?.full_name) || i.negozio || (i.wa_number ? `+${i.wa_number}` : "numero");
            };
            if (vivo) setRighe(convs
                .filter((c: { instance_id: string }) => visibili.has(c.instance_id))
                .map((c: { id: string; instance_id: string; last_message_at: string | null; last_preview: string | null }) => ({
                    id: c.id, last_message_at: c.last_message_at, last_preview: c.last_preview, etichetta: etich(c.instance_id),
                })));
        })();
        return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clientId, user?.id, user?.role, negoziMiei.join("|")]);
    if (!righe || righe.length === 0) return null;
    return (
        <div className="pt-4">
            <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">💬 Conversazioni WhatsApp</div>
            <div className="space-y-1.5">
                {righe.map(r => (
                    <Link key={r.id} href={`/chat?conv=${r.id}`} title="Apri questa conversazione nella sezione WhatsApp"
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-emerald-500/5 border border-emerald-500/15 hover:bg-emerald-500/15 transition-colors">
                        <span className="min-w-0">
                            <span className="text-[12px] font-bold text-emerald-300">con {r.etichetta}</span>
                            {r.last_preview && <span className="block text-[11px] text-slate-500 truncate max-w-[260px]">{r.last_preview}</span>}
                        </span>
                        <span className="text-[10px] text-slate-500 shrink-0">{r.last_message_at ? new Date(r.last_message_at).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" }) : ""} →</span>
                    </Link>
                ))}
            </div>
        </div>
    );
}
