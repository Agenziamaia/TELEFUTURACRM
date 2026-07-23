"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Search, Eye, Edit, Trash2, X, ShieldCheck, Check, Clock, Navigation } from "lucide-react";
import { cn } from "@/utils";
import { DatePickerInput } from "@/components/DatePickerInput";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { seesAllStores, seesWholeStore } from "@/lib/roles";

interface ContrattoRow {
    id: string;
    venditore: string;
    brand: string;
    prodotto: string;
    cliente: string;
    cellulare: string;
    negozio: string;
    codice_attivazione: string;
    data_registrazione: string;
    data_attivazione: string;
    stato: string;
    storia: any[];
    raw: Record<string, unknown>;      // riga contratto completa (incl. dettagli)
    client: Record<string, unknown> | null;
}

function mapContractToRow(c: Record<string, unknown>, client?: Record<string, unknown> | null): ContrattoRow {
    const nome = (client?.nome as string) ?? "";
    const cognome = (client?.cognome as string) ?? "";
    const ragione = (client?.ragione_sociale as string) ?? "";
    const cliente = ragione.trim() || [nome, cognome].filter(Boolean).join(" ").trim() || "—";
    return {
        id: (c.id as string) ?? "",
        venditore: (c.venditore as string) ?? "—",
        brand: (c.brand as string) ?? "—",
        prodotto: (c.prodotto as string) ?? "—",
        cliente,
        cellulare: (client?.cellulare as string) ?? "",
        negozio: (c.negozio as string) ?? "—",
        codice_attivazione: (c.codice_attivazione as string) ?? "—",
        data_registrazione: (c.data_registrazione as string) ?? (c.data as string) ?? "—",
        data_attivazione: (c.data_attivazione as string) ?? (c.data as string) ?? "—",
        stato: (c.stato as string) ?? "—",
        storia: Array.isArray(c.storia) ? (c.storia as any[]) : [],
        raw: c,
        client: client ?? null,
    };
}

// --- Dettaglio/Modifica contratto (richiesta Luca) -------------------------
// "DETTAGLIO deve mostrare TUTTE le informazioni inserite alla registrazione,
//  senza che manchi nulla" -> il dettaglio e' generato dall'elenco completo
//  delle colonne + dall'intero oggetto `dettagli` (che varia per brand),
//  cosi' nessun campo puo' restare fuori quando si aggiunge un brand nuovo.
type EditField = { key: string; label: string; kind?: "date" | "stato" | "textarea" };

const CONTRACT_FIELDS: EditField[] = [
    { key: "data_registrazione", label: "Data registrazione", kind: "date" },
    { key: "data_attivazione", label: "Data attivazione", kind: "date" },
    { key: "data", label: "Data contratto", kind: "date" },
    { key: "brand", label: "Brand" },
    { key: "categoria", label: "Categoria" },
    { key: "prodotto", label: "Prodotto" },
    { key: "venditore", label: "Venditore" },
    { key: "negozio", label: "Negozio" },
    { key: "codice_attivazione", label: "Codice attivazione" },
    { key: "operatore_bo", label: "Operatore Back Office" },
    { key: "stato", label: "Stato", kind: "stato" },
    { key: "stato_negozio", label: "Esito negozio" },
    { key: "stato_admin", label: "Esito admin" },
    { key: "note", label: "Note", kind: "textarea" },
];

const CLIENT_FIELDS: EditField[] = [
    { key: "tipo", label: "Tipo cliente" },
    { key: "nome", label: "Nome" },
    { key: "cognome", label: "Cognome" },
    { key: "ragione_sociale", label: "Ragione sociale" },
    { key: "cf_piva", label: "Codice fiscale / P.IVA" },
    { key: "cellulare", label: "Cellulare" },
    { key: "email", label: "Email" },
    { key: "indirizzo", label: "Indirizzo" },
    { key: "cap", label: "CAP" },
    { key: "citta", label: "Citta" },
    { key: "nome_ref", label: "Nome referente" },
    { key: "cognome_ref", label: "Cognome referente" },
];

const READONLY_META: EditField[] = [
    { key: "id", label: "Codice contratto" },
    { key: "client_id", label: "ID cliente" },
    { key: "created_at", label: "Creato il" },
    { key: "delegated_to", label: "Delegato a" },
    { key: "delegated_by", label: "Delegato da" },
];

// Segnalazione 57: logo per ogni brand nelle tessere di riepilogo.
const BRAND_LOGO: Record<string, string> = {
    "WindTre": "/windtre.png", "Vodafone": "/vodaphone - Copy.png", "Fastweb": "/fastweb.png",
    "Iliad": "/iliad.png", "Sky": "/sky.png", "Very Mobile": "/very-mobile.png", "Very": "/very-mobile.png",
    "Ho. Mobile": "/ho-mobile.png", "Ho": "/ho-mobile.png", "Kena Mobile": "/kena-mobile.png", "Kena": "/kena-mobile.png",
    "Tim": "/tim-logo.png", "TIM": "/tim-logo.png", "Energy": "/energy - Copy.png",
};

const STATI = ["Attivo", "In lavorazione", "Attivato", "Sospeso", "Annullato"];

function fmtVal(v: unknown): string {
    if (v === null || v === undefined || v === "") return "—";
    if (typeof v === "boolean") return v ? "Si" : "No";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
}

// I valori di `dettagli` arrivano tipizzati (bool/numero/stringa): li rimettiamo
// nel tipo originale in fase di approvazione, altrimenti salveremmo tutto testo.
function coerceLike(sample: unknown, raw: string): unknown {
    if (typeof sample === "boolean") return raw === "true" || raw.toLowerCase() === "si" || raw === "Sì";
    if (typeof sample === "number") { const n = Number(raw); return Number.isNaN(n) ? raw : n; }
    return raw;
}

export default function RicercaContratto() {
    const { user } = useAuth();
    const [contractList, setContractList] = useState<ContrattoRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    // Filter state
    const [filterVenditore, setFilterVenditore] = useState("");
    const [filterCodice, setFilterCodice] = useState("");
    const [filterBrand, setFilterBrand] = useState("");
    // Filtro prodotto multiplo (richiesta Luca #7): piu' prodotti dello stesso brand insieme.
    const [filterProdotti, setFilterProdotti] = useState<string[]>([]);
    const [prodPick, setProdPick] = useState("");
    const [filterNegozio, setFilterNegozio] = useState("");
    const [filterCodiceAttivazione, setFilterCodiceAttivazione] = useState("");
    const [filterCliente, setFilterCliente] = useState("");
    const [filterCellulare, setFilterCellulare] = useState("");
    const [filterImei, setFilterImei] = useState("");
    const [filterTableSearch, setFilterTableSearch] = useState("");
    const [daDataAttivazione, setDaDataAttivazione] = useState("");
    const [aDataAttivazione, setADataAttivazione] = useState("");
    const [daDataRegistrazione, setDaDataRegistrazione] = useState("");
    const [aDataRegistrazione, setADataRegistrazione] = useState("");

    const [selectedContract, setSelectedContract] = useState<ContrattoRow | null>(null);
    const [detailMode, setDetailMode] = useState<"view" | "edit">("view");

    // Deep link dai tag in chat: /ricerca-contratto?id=<id> apre il dettaglio del contratto
    const deepLinked = useRef(false);
    useEffect(() => {
        if (deepLinked.current || contractList.length === 0) return;
        const id = new URLSearchParams(window.location.search).get("id");
        if (!id) return;
        const hit = contractList.find((c: any) => String(c.id) === id);
        if (hit) { setSelectedContract(hit); setDetailMode("view"); deepLinked.current = true; }
    }, [contractList]);
    const [saving, setSaving] = useState(false);

    // Modifica contratto: valori in editing (chiave "contract.x" / "client.x" / "dettagli.x")
    const [editValues, setEditValues] = useState<Record<string, string>>({});
    const [reqNote, setReqNote] = useState("");
    const [reqMsg, setReqMsg] = useState<string | null>(null);
    // Richieste di modifica in attesa (per il pannello amministrazione)
    const [changeReqs, setChangeReqs] = useState<any[]>([]);
    const [showReqs, setShowReqs] = useState(false);
    const [reqBusy, setReqBusy] = useState<string | null>(null);
    const [openReqId, setOpenReqId] = useState<string | null>(null);

    // Pagination
    const [page, setPage] = useState(1);
    const pageSize = 25;
    const [totalCount, setTotalCount] = useState(0);

    // Filter Options
    // Segnalazione 26 (commenti di Francesco): "appaiono nomi errati e non
    // completi" e "devono apparire prima i collaboratori del proprio team".
    // La tendina si riempiva con DISTINCT contracts.venditore: solo 15 nomi su 45
    // account — chi non ha ancora venduto non compariva — e includeva "Alberto",
    // che non e' un utente. Ora la sorgente sono gli account attivi, divisi in
    // due gruppi: prima il team del proprio punto vendita, poi gli altri.
    const [venditoriTeam, setVenditoriTeam] = useState<string[]>([]);
    const [venditoriAltri, setVenditoriAltri] = useState<string[]>([]);
    const [uniqueBrands, setUniqueBrands] = useState<string[]>([]);
    // Segnalazione 53: prodotti e codici filtrati per brand.
    const [brandCounts, setBrandCounts] = useState<{ brand: string; n: number }[]>([]);
    const [prodByBrand, setProdByBrand] = useState<Record<string, string[]>>({});
    const [codeByBrand, setCodeByBrand] = useState<Record<string, string[]>>({});
    const [uniqueProdotti, setUniqueProdotti] = useState<string[]>([]);
    const [uniqueNegozi, setUniqueNegozi] = useState<string[]>([]);

    // RBAC: Store-Based Visibility Logic
    // Ruoli reali (roles.ts): la vecchia lista era ancora quella del mock, quindi
    // dev/direttore_generale/amministrativo finivano filtrati sul proprio nome e
    // non vedevano NESSUN contratto.
    const isGlobalView = seesAllStores(user?.role);
    const wholeStore = seesWholeStore(user?.role);
    // Modifica contratto riservata allo Store Manager (+ superuser) — richiesta Luca #5.
    const canEditContract = ["store_manager", "admin", "dev", "direttore_generale", "amministrativo"].includes(user?.role || "");
    // Approvazione modifiche = amministrazione (Sandra, Claudia, Marta, Franca, Luca).
    const canApprove = ["amministrativo", "admin", "dev", "direttore_generale"].includes(user?.role || "");
    // Segnalazione 55: i contratti brand Extra sono nascosti di default; un
    // checkbox li mostra. Il ruolo Tecnico li vede sempre tutti (di tutto il
    // negozio), quindi per lui il filtro non si applica.
    const isTecnico = user?.role === "tecnico";
    const [showExtra, setShowExtra] = useState(false);
    const lockedStore = !isGlobalView ? user?.negozio : null;
    // Il tecnico vede tutte le vendite del proprio negozio (segn. 55), non solo
    // le proprie: quindi niente blocco sul nome, resta solo il blocco sul negozio.
    const lockedVenditore = (!isGlobalView && !wholeStore && user?.role !== "tecnico") ? user?.name : null;
    // Segnalazione 26: il filtro Venditore era bloccato con disabled={!isGlobalView},
    // quindi lo store manager non poteva cambiarlo pur avendone il diritto — i
    // permessi lato query lo consentivano gia' (lockedVenditore e' null per chi
    // vede tutto il negozio). Ora e' modificabile dallo store manager in su.
    const canPickVenditore = isGlobalView || wholeStore;

    useEffect(() => {
        const fetchFilters = async () => {
            const { data } = await supabase.from("contracts").select("venditore, brand, prodotto, negozio, codice_attivazione");
            if (data) {
                setUniqueBrands(Array.from(new Set(data.map((r: any) => r.brand).filter(Boolean))).sort() as string[]);
                setUniqueProdotti(Array.from(new Set(data.map((r: any) => r.prodotto).filter(Boolean))).sort() as string[]);
                setUniqueNegozi(Array.from(new Set(data.map((r: any) => r.negozio).filter(Boolean))).sort() as string[]);
                // prodotti e codici raggruppati per brand
                const pb: Record<string, Set<string>> = {}, cb: Record<string, Set<string>> = {};
                (data as any[]).forEach(r => {
                    if (!r.brand) return;
                    if (r.prodotto) (pb[r.brand] ??= new Set()).add(r.prodotto);
                    const c = String(r.codice_attivazione || "").trim();
                    if (c && c !== "—" && c !== "VENDITA-DIRETTA") (cb[r.brand] ??= new Set()).add(c);
                });
                setProdByBrand(Object.fromEntries(Object.entries(pb).map(([k, v]) => [k, [...v].sort()])));
                setCodeByBrand(Object.fromEntries(Object.entries(cb).map(([k, v]) => [k, [...v].sort()])));
            }
        };
        fetchFilters();
    }, []);

    // Elenco venditori dagli account attivi, con il proprio team in cima.
    useEffect(() => {
        (async () => {
            const { data } = await supabase
                .from("app_users")
                .select("full_name, primary_store")
                .eq("active", true)
                .order("full_name");
            const mio = (user?.negozio || "").trim().toLowerCase();
            const stessoNegozio = (st: string | null) => {
                const x = (st || "").trim().toLowerCase();
                return !!x && !!mio && (x === mio || x.startsWith(mio) || mio.startsWith(x));
            };
            const team: string[] = [], altri: string[] = [];
            (data ?? []).forEach((u: Record<string, unknown>) => {
                const nome = String(u.full_name || "").trim();
                if (!nome) return;
                (stessoNegozio(u.primary_store as string) ? team : altri).push(nome);
            });
            setVenditoriTeam(team);
            setVenditoriAltri(altri);
        })();
    }, [user?.negozio]);

    const fetchData = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from("contracts")
                .select("*, clients!inner(nome, cognome, ragione_sociale, cellulare)", { count: "exact" });

            // Apply Server-side filters
            if (filterVenditore && filterVenditore !== "Tutti") query = query.eq("venditore", filterVenditore);
            if (filterNegozio && filterNegozio !== "Tutti") query = query.eq("negozio", filterNegozio);
            if (filterCodice) query = query.ilike("id", `%${filterCodice}%`);
            if (filterBrand && filterBrand !== "") query = query.ilike("brand", `%${filterBrand}%`);
            if (filterProdotti.length > 0) query = query.in("prodotto", filterProdotti);
            // Extra nascosti salvo checkbox o ruolo Tecnico (segnalazione 55).
            if (!showExtra && !isTecnico) query = query.not("brand", "ilike", "extra");
            if (filterCodiceAttivazione) query = query.eq("codice_attivazione", filterCodiceAttivazione);
            if (filterCellulare) query = query.ilike("clients.cellulare", `%${filterCellulare}%`);

            if (filterCliente) {
                const safe = filterCliente.trim().replace(/[",()]/g, "");
                if (safe) {
                    const term = `%${safe}%`;
                    // Segnalazione 36. Prima: .or("clients.nome.ilike.…") — PostgREST
                    // legge "clients" come colonna e "nome" come operatore, e risponde
                    // 400 PGRST100 "failed to parse logic tree". Le condizioni su una
                    // tabella agganciata vanno passate con referencedTable.
                    query = query.or(
                        `nome.ilike.${term},cognome.ilike.${term},ragione_sociale.ilike.${term}`,
                        { referencedTable: "clients" }
                    );
                }
            }

            // RBAC
            if (!isGlobalView) {
                // I contratti storici non usano il nome esatto del negozio ("Magliana" vs
                // "Magliana Multi"): con un match esatto lo staff non vedrebbe nulla.
                // Confronto sulla radice del nome.
                if (lockedStore) query = query.ilike("negozio", `${String(lockedStore).split(" ")[0]}%`);
                if (lockedVenditore) query = query.eq("venditore", lockedVenditore);
            }

            const { data, count, error } = await query
                .order("created_at", { ascending: false })
                .range((page - 1) * pageSize, page * pageSize - 1);

            if (error) throw error;

            const rows = (data ?? []).map((row: any) => mapContractToRow(row, row.clients));
            setContractList(rows);
            setTotalCount(count ?? 0);
        } catch (err: any) {
            setLoadError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Segnalazione 57: conteggio contratti per brand, rispettando RBAC e le date.
    useEffect(() => {
        (async () => {
            let q = supabase.from("contracts").select("brand, data_registrazione");
            if (!isGlobalView) {
                if (lockedStore) q = q.ilike("negozio", `${String(lockedStore).split(" ")[0]}%`);
                if (lockedVenditore) q = q.eq("venditore", lockedVenditore);
            }
            if (!showExtra && !isTecnico) q = q.not("brand", "ilike", "extra");
            if (daDataRegistrazione) q = q.gte("data_registrazione", daDataRegistrazione);
            if (aDataRegistrazione) q = q.lte("data_registrazione", aDataRegistrazione);
            const { data } = await q;
            const m: Record<string, number> = {};
            (data ?? []).forEach((r: any) => { if (r.brand) m[r.brand] = (m[r.brand] || 0) + 1; });
            setBrandCounts(Object.entries(m).map(([brand, n]) => ({ brand, n })).sort((a, b) => b.n - a.n));
        })();
    }, [isGlobalView, lockedStore, lockedVenditore, showExtra, isTecnico, daDataRegistrazione, aDataRegistrazione, contractList.length]);

    // Debounced fetch
    useEffect(() => {
        const timer = setTimeout(fetchData, 300);
        return () => clearTimeout(timer);
    }, [page, filterVenditore, filterCodice, filterBrand, filterProdotti.join("|"), filterNegozio, filterCodiceAttivazione, filterCliente, filterCellulare, filterImei, showExtra]);

    // Segnalazione 37: "su ricerca contratto deve riportare stesso stato in tempo
    // reale". La pagina caricava i contratti una volta sola, quindi un cambio di
    // stato fatto nel Tracking PDA si vedeva solo ricaricando a mano.
    useEffect(() => {
        const ch = supabase
            .channel("ricerca-contratti-stato")
            .on("postgres_changes", { event: "UPDATE", schema: "public", table: "contracts" }, (payload) => {
                const row = payload.new as Record<string, unknown>;
                if (!row?.id) return;
                setContractList(prev => prev.map(r => r.id === row.id
                    ? { ...r, stato: (row.stato as string) ?? r.stato, raw: { ...r.raw, ...row } }
                    : r));
                setSelectedContract(prev => prev && prev.id === row.id
                    ? { ...prev, stato: (row.stato as string) ?? prev.stato, raw: { ...prev.raw, ...row } }
                    : prev);
            })
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, []);

    const visibleData = useMemo(() => {
        const q = filterTableSearch.trim().toLowerCase();
        if (!q) return contractList;
        return contractList.filter(r => [
            r.venditore, r.brand, r.prodotto, r.cliente, r.cellulare, r.negozio,
            r.codice_attivazione, r.data_registrazione, r.data_attivazione, r.stato, r.id,
        ].some(v => String(v ?? "").toLowerCase().includes(q)));
    }, [contractList, filterTableSearch]);

    const handleExportCsv = () => {
        if (visibleData.length === 0) return;
        const headers = ["Venditore", "Brand", "Prodotto", "Cliente", "Negozio", "Codice Attivazione", "Data Registrazione", "Data Attivazione", "Stato"];
        const rows = visibleData.map(r => [
            r.venditore, r.brand, r.prodotto, r.cliente, r.negozio, r.codice_attivazione, r.data_registrazione, r.data_attivazione, r.stato
        ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(","));
        const csvContent = [headers.join(","), ...rows].join("\n");
        const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `contratti_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // NB: tutti gli hook devono stare PRIMA dei return anticipati di loading/errore.
    // Erano finiti dopo: al primo errore di caricamento React eseguiva meno hook del
    // render precedente e la pagina moriva con "Application error: a client-side
    // exception has occurred" — ed e' proprio cio' che si vedeva digitando nel
    // filtro Cliente (segnalazione 36).
    // NB: queste quattro funzioni servono a pendingChanges: devono restare
    // SOPRA quel useMemo, altrimenti al primo render con un contratto
    // selezionato il memo le richiama prima che siano inizializzate.
    const dettagliOf = (row: ContrattoRow): [string, unknown][] => {
        const d = row.raw?.dettagli;
        if (!d || typeof d !== "object" || Array.isArray(d)) return [];
        return Object.entries(d as Record<string, unknown>);
    };

    const openContract = (row: ContrattoRow, mode: "view" | "edit") => {
        const vals: Record<string, string> = {};
        CONTRACT_FIELDS.forEach(f => { vals[`contract::${f.key}`] = row.raw?.[f.key] == null ? "" : String(row.raw[f.key]); });
        CLIENT_FIELDS.forEach(f => { vals[`client::${f.key}`] = row.client?.[f.key] == null ? "" : String(row.client[f.key]); });
        dettagliOf(row).forEach(([k, v]) => {
            if (v !== null && typeof v === "object") return; // oggetti annidati: sola lettura
            vals[`dettagli::${k}`] = v == null ? "" : String(v);
        });
        setEditValues(vals);
        setReqNote("");
        setReqMsg(null);
        setSelectedContract(row);
        setDetailMode(mode);
    };

    const originalOf = (row: ContrattoRow, key: string): unknown => {
        const i = key.indexOf("::");
        const scope = key.slice(0, i), field = key.slice(i + 2);
        if (scope === "contract") return row.raw?.[field];
        if (scope === "client") return row.client?.[field];
        return (row.raw?.dettagli as Record<string, unknown> | undefined)?.[field];
    };

    const labelOf = (key: string): string => {
        const i = key.indexOf("::");
        const scope = key.slice(0, i), field = key.slice(i + 2);
        if (scope === "contract") return CONTRACT_FIELDS.find(f => f.key === field)?.label || field;
        if (scope === "client") return (CLIENT_FIELDS.find(f => f.key === field)?.label || field) + " (cliente)";
        return field;
    };

    const pendingChanges = useMemo(() => {
        if (!selectedContract) return {} as Record<string, { da: any; a: any; label: string }>;
        const out: Record<string, { da: any; a: any; label: string }> = {};
        Object.entries(editValues).forEach(([k, v]) => {
            const orig = originalOf(selectedContract, k);
            const origStr = orig == null ? "" : String(orig);
            if (origStr !== v) out[k] = { da: orig ?? null, a: v, label: labelOf(k) };
        });
        return out;
    }, [editValues, selectedContract]);

    // Richieste di modifica: le carica l'amministrazione (tutte le pending) e
    // chiunque apra un contratto (solo quelle del contratto aperto).
    const loadChangeReqs = async () => {
        const q = supabase.from("contract_change_requests").select("*").order("created_at", { ascending: false });
        const { data } = canApprove ? await q.eq("status", "pending") : await q.limit(0);
        setChangeReqs(data || []);
    };
    useEffect(() => { if (canApprove) loadChangeReqs(); }, [canApprove]);

    const [contractReqs, setContractReqs] = useState<any[]>([]);
    useEffect(() => {
        if (!selectedContract) { setContractReqs([]); return; }
        (async () => {
            const { data } = await supabase.from("contract_change_requests")
                .select("*").eq("contract_id", selectedContract.id).order("created_at", { ascending: false });
            setContractReqs(data || []);
        })();
    }, [selectedContract, saving]);

    const submitChangeRequest = async () => {
        if (!selectedContract || Object.keys(pendingChanges).length === 0) return;
        setSaving(true);
        const payload: Record<string, unknown> = { ...pendingChanges };
        if (reqNote.trim()) payload.__meta = { note: reqNote.trim() };
        const { error } = await supabase.from("contract_change_requests").insert({
            contract_id: selectedContract.id,
            requested_by: user?.id || null,
            requested_by_name: user?.name || "—",
            changes: payload,
        });
        setSaving(false);
        setReqMsg(error
            ? `Errore invio richiesta: ${error.message}`
            : "Richiesta inviata all'amministrazione. La modifica sara' effettiva dopo l'approvazione.");
        if (!error) setDetailMode("view");
    };

    const decideRequest = async (req: any, approve: boolean, note?: string) => {
        setReqBusy(req.id);
        if (approve) {
            const { data: c } = await supabase.from("contracts").select("*").eq("id", req.contract_id).single();
            if (c) {
                const contractPatch: Record<string, unknown> = {};
                const clientPatch: Record<string, unknown> = {};
                const det: Record<string, unknown> = { ...((c.dettagli as Record<string, unknown>) || {}) };
                let detTouched = false;
                const storia: any[] = Array.isArray(c.storia) ? [...c.storia] : [];
                const stamp = new Date().toISOString();
                Object.entries(req.changes || {}).forEach(([k, raw]) => {
                    if (k.startsWith("__")) return;   // "__meta" = motivazione, non un campo
                    const v = raw as { da: any; a: any; label?: string };
                    const i = k.indexOf("::");
                    const scope = k.slice(0, i), field = k.slice(i + 2);
                    if (scope === "contract") contractPatch[field] = v.a === "" ? null : v.a;
                    else if (scope === "client") clientPatch[field] = v.a === "" ? null : v.a;
                    else if (scope === "dettagli") { det[field] = coerceLike(det[field], String(v.a)); detTouched = true; }
                    storia.push({
                        at: stamp,
                        user: `${req.requested_by_name || "—"} → approvata da ${user?.name || "—"}`,
                        campo: v.label || field, da: fmtVal(v.da), a: fmtVal(v.a),
                    });
                });
                if (detTouched) contractPatch.dettagli = det;
                contractPatch.storia = storia;
                // Gli errori qui non venivano letti: se l'update falliva, la
                // richiesta risultava comunque "approvata" e il contratto restava
                // com'era, senza che nessuno se ne accorgesse (segnalazione 32).
                const { error: cErr } = await supabase.from("contracts").update(contractPatch).eq("id", req.contract_id);
                if (cErr) { setReqBusy(null); alert("Modifica NON applicata al contratto: " + cErr.message); return; }
                if (Object.keys(clientPatch).length > 0 && c.client_id) {
                    const { error: clErr } = await supabase.from("clients").update(clientPatch).eq("id", c.client_id);
                    if (clErr) { setReqBusy(null); alert("Modifica NON applicata al cliente: " + clErr.message); return; }
                }
            } else {
                setReqBusy(null);
                alert("Contratto " + req.contract_id + " non trovato: richiesta lasciata in attesa.");
                return;
            }
        }
        const { error: rErr } = await supabase.from("contract_change_requests").update({
            status: approve ? "approved" : "rejected",
            reviewed_by: user?.id || null,
            reviewed_by_name: user?.name || "—",
            reviewed_at: new Date().toISOString(),
            review_note: note || null,
        }).eq("id", req.id);
        setReqBusy(null);
        if (rErr) { alert("Esito non registrato: " + rErr.message); return; }
        await loadChangeReqs();
        await fetchData();
        // Il dettaglio aperto mostrava ancora i valori vecchi e sembrava che
        // l'approvazione non avesse fatto nulla: ricarico il contratto a schermo.
        if (selectedContract && selectedContract.id === req.contract_id) {
            const { data: fresh } = await supabase
                .from("contracts")
                .select("*, clients(nome, cognome, ragione_sociale, cellulare, email, cf_piva, indirizzo, cap, citta, tipo, nome_ref, cognome_ref)")
                .eq("id", req.contract_id).single();
            if (fresh) {
                const cl = (fresh as any).clients || null;
                setSelectedContract(mapContractToRow(fresh as any, cl));
            }
        }
        setReqMsg(approve ? "Modifica approvata e applicata al contratto." : "Richiesta rifiutata.");
    };

    if (loadError) {
        return (
            <div className="w-full">
                <div className="mb-8">
                    <h2 className="text-3xl font-bold text-white mb-2">Ricerca Contratto</h2>
                    <p className="text-red-400">Errore caricamento: {loadError}</p>
                </div>
            </div>
        );
    }

    // Le chiavi usano "::" e non "." perche' molte chiavi di `dettagli`
    // contengono gia' un punto (es. "Cod.Ins.", "Op. MNP").


    return (
        <div className="w-full">
            <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h2 className="text-3xl font-bold text-white mb-2">Ricerca Contratto</h2>
                    <p className="text-slate-400">Ricerca e gestisci i contratti registrati a sistema</p>
                </div>
                {canApprove && (
                    <button onClick={() => setShowReqs(v => !v)}
                        className={cn("px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 border transition-colors",
                            changeReqs.length > 0
                                ? "bg-amber-500/15 border-amber-400/40 text-amber-200 hover:bg-amber-500/25"
                                : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10")}>
                        <ShieldCheck className="w-4 h-4" />
                        Richieste di modifica
                        {changeReqs.length > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-400 text-black text-[11px] font-bold">{changeReqs.length}</span>
                        )}
                    </button>
                )}
            </div>

            {/* Segnalazione 57: tessere per brand (logo + numero contratti), come
                nel Tracking PDA. Cliccando si filtra per quel brand. Ogni utente
                vede i brand su cui opera. Sostituiscono il filtro Brand a tendina. */}
            {brandCounts.length > 0 && (
                <div className="flex flex-wrap gap-3 mb-6">
                    {brandCounts.map(({ brand, n }) => {
                        const active = filterBrand === brand;
                        const logo = BRAND_LOGO[brand];
                        const isExtra = brand.toLowerCase() === "extra";
                        return (
                            <button key={brand} onClick={() => { setFilterBrand(active ? "" : brand); setPage(1); }}
                                className={cn("flex flex-col items-center justify-center gap-1.5 rounded-2xl border px-5 py-3 min-w-[104px] transition-all",
                                    active ? "border-indigo-400/60 bg-indigo-500/10" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]")}>
                                <span className="h-8 flex items-center justify-center">
                                    {isExtra ? <span className="text-2xl">💰</span>
                                        : logo ? <img src={logo} alt={brand} className="h-8 w-auto max-w-[92px] object-contain" />
                                            : <span className="text-sm font-bold text-slate-200">{brand}</span>}
                                </span>
                                <span className="text-2xl font-black text-white tabular-nums leading-none">{n}</span>
                                <span className="text-[10px] text-slate-500 uppercase tracking-wider">{brand}</span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Approvazione modifiche contratto — riservata all'amministrazione */}
            {canApprove && showReqs && (
                <div className="glass-card mb-6 p-6">
                    <h3 className="text-lg font-medium text-white mb-4 border-b border-white/10 pb-2 flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-amber-300" />
                        Richieste di modifica in attesa
                    </h3>
                    {changeReqs.length === 0 ? (
                        <p className="text-sm text-slate-500">Nessuna richiesta in attesa.</p>
                    ) : (
                        <div className="space-y-3">
                            {changeReqs.map(r => (
                                <div key={r.id} className="rounded-xl bg-white/5 border border-white/10 p-4">
                                    <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                                        <div className="text-sm text-slate-300">
                                            <b className="text-white">{r.requested_by_name || "\u2014"}</b> chiede di modificare il contratto{" "}
                                            <button className="font-mono text-indigo-300 hover:underline"
                                                onClick={() => {
                                                    const hit = contractList.find(c => c.id === r.contract_id);
                                                    if (hit) openContract(hit, "view");
                                                }}>{r.contract_id}</button>
                                            <span className="text-slate-500"> \u00b7 {new Date(r.created_at).toLocaleString("it-IT")}</span>
                                        </div>
                                        <div className="flex gap-2">
                                            <button disabled={reqBusy === r.id} onClick={() => decideRequest(r, true)}
                                                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 flex items-center gap-1.5 disabled:opacity-40">
                                                <Check className="w-3.5 h-3.5" /> Approva
                                            </button>
                                            <button disabled={reqBusy === r.id} onClick={() => decideRequest(r, false)}
                                                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/20 text-red-300 hover:bg-red-500/30 disabled:opacity-40">
                                                Rifiuta
                                            </button>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        {Object.entries(r.changes || {}).filter(([k]) => !k.startsWith("__")).map(([k, c]: any) => (
                                            <div key={k} className="text-xs text-slate-400">
                                                <b className="text-slate-200">{c.label}</b>: <span className="text-slate-500">{fmtVal(c.da)}</span> \u2192 <span className="text-amber-300">{fmtVal(c.a)}</span>
                                            </div>
                                        ))}
                                    </div>
                                    {/* Richiesta Luca: prima di approvare si deve poter vedere il
                                        contratto per intero, com'era e come diventerebbe. */}
                                    <button onClick={() => setOpenReqId(openReqId === r.id ? null : r.id)}
                                        className="mt-2 text-xs font-semibold text-indigo-300 hover:text-indigo-200 hover:underline">
                                        {openReqId === r.id ? "Nascondi dettaglio" : "Vedi dettaglio completo"}
                                    </button>
                                    {openReqId === r.id && (() => {
                                        const row = contractList.find(x => x.id === r.contract_id);
                                        if (!row) return <p className="mt-2 text-xs text-slate-500">Contratto non presente nella pagina corrente: aprilo da Ricerca per il dettaglio completo.</p>;
                                        const changed = Object.entries(r.changes || {}).filter(([k]) => !k.startsWith("__"));
                                        const detail: [string, unknown][] = [
                                            ...CONTRACT_FIELDS.map(f => [f.label, row.raw?.[f.key]] as [string, unknown]),
                                            ...CLIENT_FIELDS.map(f => [f.label + " (cliente)", row.client?.[f.key]] as [string, unknown]),
                                            ...dettagliOf(row).filter(([, v]) => v === null || typeof v !== "object"),
                                        ];
                                        return (
                                            <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3 space-y-3">
                                                <div>
                                                    <p className="text-[10px] uppercase tracking-wider text-amber-300 mb-1">Cosa cambia</p>
                                                    <table className="w-full text-xs">
                                                        <thead>
                                                            <tr className="text-slate-500">
                                                                <th className="text-left font-medium pb-1">Campo</th>
                                                                <th className="text-left font-medium pb-1">Prima</th>
                                                                <th className="text-left font-medium pb-1">Dopo</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {changed.map(([k, c]: any) => (
                                                                <tr key={k} className="border-t border-white/5">
                                                                    <td className="py-1 pr-2 text-slate-200 font-medium">{c.label}</td>
                                                                    <td className="py-1 pr-2 text-slate-500 line-through">{fmtVal(c.da)}</td>
                                                                    <td className="py-1 text-emerald-300">{fmtVal(c.a)}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Contratto completo (valori attuali)</p>
                                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-56 overflow-y-auto">
                                                        {detail.map(([label, v]) => (
                                                            <div key={String(label)}>
                                                                <span className="text-[10px] uppercase tracking-wider text-slate-600">{String(label)}</span>
                                                                <p className="text-[11px] text-slate-300 break-words">{fmtVal(v)}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                    {r.changes?.__meta?.note && <p className="text-xs text-slate-500 mt-2 italic">{r.changes.__meta.note}</p>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Advanced Search Filter Section */}
            <div className="glass-card mb-6 p-6">
                <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-2 flex-wrap gap-2">
                    <h3 className="text-lg font-medium text-white flex items-center gap-2">
                        <Search className="w-5 h-5 text-indigo-400" />
                        Filtri di ricerca
                    </h3>
                    {!isTecnico && (
                        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                            <input type="checkbox" checked={showExtra} onChange={e => { setShowExtra(e.target.checked); setPage(1); }} className="w-4 h-4 accent-indigo-500" />
                            Mostra anche i contratti Extra 💰
                        </label>
                    )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">

                    {/* 1. Venditore */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Venditore</label>
                        <select
                            className="glass-input w-full disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={!canPickVenditore}
                            value={canPickVenditore ? filterVenditore : (lockedVenditore || "Tutti")}
                            onChange={e => setFilterVenditore(e.target.value)}
                        >
                            <option value="Tutti">Tutti i venditori</option>
                            {venditoriTeam.length > 0 && (
                                <optgroup label={`Team ${user?.negozio || "punto vendita"}`}>
                                    {venditoriTeam.map(v => <option key={v} value={v}>{v}</option>)}
                                </optgroup>
                            )}
                            {venditoriAltri.length > 0 && (
                                <optgroup label="Altri consulenti">
                                    {venditoriAltri.map(v => <option key={v} value={v}>{v}</option>)}
                                </optgroup>
                            )}
                        </select>
                    </div>

                    {/* 2. Codice contratto */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Codice contratto</label>
                        <input type="text" placeholder="Es. CTR-123" className="glass-input w-full" value={filterCodice} onChange={e => setFilterCodice(e.target.value)} />
                    </div>

                    {/* 3. IMEI */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">IMEI / Serial Number</label>
                        <input type="text" placeholder="Inserisci IMEI" className="glass-input w-full" value={filterImei} onChange={e => setFilterImei(e.target.value)} />
                    </div>

                    {/* Filtro Brand rimosso: sostituito dalle tessere brand (segn.57).
                        filterBrand resta pilotato dalle tessere. */}

                    {/* 5. Prodotto (multiplo, con tasto +) */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Prodotto</label>
                        <div className="flex gap-2">
                            <select className="glass-input w-full" value={prodPick} onChange={e => setProdPick(e.target.value)}>
                                <option value="">{filterProdotti.length ? "Aggiungi prodotto…" : "Tutti i prodotti"}</option>
                                {(filterBrand ? (prodByBrand[filterBrand] || []) : uniqueProdotti).filter(p => !filterProdotti.includes(p)).map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                            <button type="button" title="Aggiungi prodotto al filtro"
                                onClick={() => { if (prodPick) { setFilterProdotti(prev => prev.includes(prodPick) ? prev : [...prev, prodPick]); setProdPick(""); } }}
                                disabled={!prodPick}
                                className="shrink-0 w-10 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed">+</button>
                        </div>
                        {filterProdotti.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                                {filterProdotti.map(p => (
                                    <span key={p} className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] bg-indigo-500/15 text-indigo-200 border border-indigo-500/30">
                                        {p}
                                        <button type="button" onClick={() => setFilterProdotti(prev => prev.filter(x => x !== p))} className="opacity-70 hover:opacity-100">✕</button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* 6. Negozio di attivazione */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Negozio di attivazione</label>
                        <select
                            className="glass-input w-full disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={!isGlobalView}
                            value={isGlobalView ? filterNegozio : (lockedStore || "Tutti")}
                            onChange={e => setFilterNegozio(e.target.value)}
                        >
                            <option value="Tutti">Tutti i negozi</option>
                            {uniqueNegozi.map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                    </div>

                    {/* 7. Codice di attivazione */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Codice di attivazione</label>
                        {/* Segnalazione 53: tendina dei codici, suddivisi per brand. */}
                        <select className="glass-input w-full" value={filterCodiceAttivazione} onChange={e => setFilterCodiceAttivazione(e.target.value)}>
                            <option value="">Tutti i codici</option>
                            {(filterBrand ? [[filterBrand, codeByBrand[filterBrand] || []] as [string, string[]]] : Object.entries(codeByBrand))
                                .map(([b, codes]) => codes.length ? (
                                    <optgroup key={b} label={b}>
                                        {codes.map(c => <option key={c} value={c}>{c}</option>)}
                                    </optgroup>
                                ) : null)}
                        </select>
                    </div>

                    {/* 8. Cliente */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Cliente</label>
                        <input type="text" placeholder="Nome, C.F. o P.IVA" className="glass-input w-full" value={filterCliente} onChange={e => setFilterCliente(e.target.value)} />
                    </div>

                    {/* 9. Numero di cellulare */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Numero di cellulare</label>
                        <input type="text" placeholder="Es. 3331234567" className="glass-input w-full" value={filterCellulare} onChange={e => setFilterCellulare(e.target.value)} />
                    </div>
                </div>

                {/* Date Ranges Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-6 pt-6 border-t border-white/5">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Da data attivazione</label>
                        <DatePickerInput id="da_data_attivazione" value={daDataAttivazione} onChange={setDaDataAttivazione} placeholder="Seleziona data" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">A data attivazione</label>
                        <DatePickerInput id="a_data_attivazione" value={aDataAttivazione} onChange={setADataAttivazione} placeholder="Seleziona data" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Da data registrazione</label>
                        <DatePickerInput id="da_data_registrazione" value={daDataRegistrazione} onChange={setDaDataRegistrazione} placeholder="Seleziona data" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">A data registrazione</label>
                        <DatePickerInput id="a_data_registrazione" value={aDataRegistrazione} onChange={setADataRegistrazione} placeholder="Seleziona data" />
                    </div>
                </div>

                {/* CTA Buttons */}
                <div className="mt-8 flex gap-3">
                    <button type="button" className="primary-btn h-10 px-8 text-sm" onClick={() => { setFilterVenditore(""); setFilterCodice(""); setFilterBrand(""); setFilterProdotti([]); setProdPick(""); setFilterNegozio(""); setFilterCodiceAttivazione(""); setFilterCliente(""); setFilterCellulare(""); setFilterImei(""); setFilterTableSearch(""); setDaDataAttivazione(""); setADataAttivazione(""); setDaDataRegistrazione(""); setADataRegistrazione(""); }}>Annulla filtri</button>
                    <button type="button" className="px-8 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-semibold hover:bg-emerald-500/20 transition-all flex items-center gap-2" onClick={handleExportCsv}>
                        Scarica CSV
                    </button>
                </div>
            </div>

            {/* Results Table */}
            <div className="glass-card overflow-hidden">
                <div className="p-4 border-b border-white/5 flex gap-4 bg-white/[0.02]">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input type="text" placeholder="Filtra risultati..." className="glass-input w-full pl-10" value={filterTableSearch} onChange={e => setFilterTableSearch(e.target.value)} />
                    </div>
                </div>

                {loading ? (
                    <div className="p-8 text-center text-slate-400">Caricamento contratti...</div>
                ) : (
                    <div className="overflow-x-auto w-full">
                        <table className="w-full text-left text-sm text-slate-300">
                            <thead className="bg-white/[0.03] text-xs uppercase text-slate-400">
                                <tr>
                                    <th className="px-4 py-4 font-semibold">Venditore</th>
                                    <th className="px-4 py-4 font-semibold">Brand</th>
                                    <th className="px-4 py-4 font-semibold">Prodotto</th>
                                    <th className="px-4 py-4 font-semibold">Cliente</th>
                                    <th className="px-4 py-4 font-semibold">Negozio</th>
                                    <th className="px-4 py-4 font-semibold">Codice Attivazione</th>
                                    <th className="px-4 py-4 font-semibold">Data Registrazione</th>
                                    <th className="px-4 py-4 font-semibold">Data Attivazione</th>
                                    <th className="px-4 py-4 font-semibold">Stato</th>
                                    <th className="px-4 py-4 w-32 text-center">Azioni</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleData.map((row) => (
                                    <tr key={row.id} className="border-b border-white/5 bg-white/[0.01] hover:bg-white/[0.03] transition-colors">
                                        <td className="px-4 py-3 text-slate-300">{row.venditore}</td>
                                        <td className="px-4 py-3 font-medium text-white">{row.brand}</td>
                                        <td className="px-4 py-3 text-slate-300">{row.prodotto}</td>
                                        <td className="px-4 py-3 text-slate-300 font-medium">{row.cliente}</td>
                                        <td className="px-4 py-3 text-slate-400 text-xs">{row.negozio}</td>
                                        <td className="px-4 py-3 text-slate-400 font-mono text-xs">{row.codice_attivazione}</td>
                                        <td className="px-4 py-3 text-slate-500 text-xs">{row.data_registrazione}</td>
                                        <td className="px-4 py-3 text-slate-500 text-xs">{row.data_attivazione}</td>
                                        <td className="px-4 py-3">
                                            <span className={cn(
                                                "px-2 py-1 rounded-full text-[10px] font-medium uppercase tracking-wider",
                                                row.stato === 'Attivo' ? "bg-emerald-500/10 text-emerald-400" :
                                                    "bg-amber-500/10 text-amber-400"
                                            )}>
                                                {row.stato}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex gap-1 justify-center">
                                                <button onClick={() => openContract(row, "view")} className="p-1.5 rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors" title="Dettaglio contratto"><Eye className="w-4 h-4" /></button>
                                                {/* Segnalazione 46: scorciatoia verso Tracking PDA.
                                                    Segnalazione 64: va vista da tutti, non solo dallo
                                                    store manager, e non ha senso sulle vendite Extra,
                                                    che nel Tracking non compaiono. */}
                                                {String(row.brand || "").trim().toLowerCase() !== "extra" && <button
                                                    onClick={() => {
                                                        const q = encodeURIComponent(row.cliente || "");
                                                        window.location.href = `/pda/tracking?q=${q}&id=${encodeURIComponent(row.id)}`;
                                                    }}
                                                    className="p-1.5 rounded bg-teal-500/20 text-teal-300 hover:bg-teal-500/30 transition-colors"
                                                    title="Apri in Tracking PDA">
                                                    <Navigation className="w-4 h-4" />
                                                </button>}
                                                {canEditContract && (
                                                    <button onClick={() => openContract(row, "edit")} className="p-1.5 rounded bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 transition-colors" title="Modifica (richiede approvazione amministrazione)"><Edit className="w-4 h-4" /></button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {visibleData.length === 0 && (
                                    <tr>
                                        <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                                            Nessun contratto trovato per i criteri o permessi correnti.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between bg-white/[0.01]">
                    <span className="text-xs text-slate-400">Trovati {totalCount} contratti — Pagina {page} di {Math.ceil(totalCount / pageSize)}</span>
                    <div className="flex gap-2">
                        <button
                            disabled={page === 1 || loading}
                            onClick={() => setPage(p => p - 1)}
                            className="px-4 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-bold text-slate-400 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >
                            Precedente
                        </button>
                        <button
                            disabled={page * pageSize >= totalCount || loading}
                            onClick={() => setPage(p => p + 1)}
                            className="px-4 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-bold text-slate-400 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >
                            Successiva
                        </button>
                    </div>
                </div>
            </div>

            {/* Dettaglio / Modifica contratto — mostra TUTTI i dati di registrazione */}
            {selectedContract && (() => {
                const row = selectedContract;
                const det = dettagliOf(row);
                const detEditable = det.filter(([, v]) => v === null || typeof v !== "object");
                const detReadonly = det.filter(([, v]) => v !== null && typeof v === "object");
                const pendingForThis = contractReqs.filter(r => r.status === "pending");
                const nChanges = Object.keys(pendingChanges).length;

                // Segnalazione 71: il campo era un componente definito nel render,
                // quindi ogni battuta gli cambiava identita' e React rimontava
                // l'input (perdita di focus, sensazione di "non modificabile" e
                // lag). Ora e' una funzione che restituisce JSX, chiamata inline:
                // nessun rimontaggio. Categoria/Prodotto/Venditore/Negozio sono
                // tendine popolate dai valori reali.
                const optionsFor = (k: string): string[] | null => {
                    if (k === "contract::venditore") return [...venditoriTeam, ...venditoriAltri];
                    if (k === "contract::negozio") return uniqueNegozi;
                    if (k === "contract::brand") return uniqueBrands;
                    if (k === "contract::prodotto") return uniqueProdotti;
                    if (k === "contract::categoria") return Array.from(new Set(uniqueProdotti.length ? contractList.map(c => String(c.raw?.categoria || "")).filter(Boolean) : [])).sort();
                    return null;
                };
                const renderField = (k: string, label: string, kind?: string) => {
                    const orig = originalOf(row, k);
                    if (detailMode === "view") {
                        return (
                            <div>
                                <span className="text-[11px] uppercase tracking-wider text-slate-500">{label}</span>
                                <p className="text-white text-sm break-words">{fmtVal(orig)}</p>
                            </div>
                        );
                    }
                    const val = editValues[k] ?? "";
                    const changed = (orig == null ? "" : String(orig)) !== val;
                    const cls = cn("glass-input w-full text-sm", changed && "border-amber-400/60 bg-amber-400/5");
                    const opts = optionsFor(k);
                    return (
                        <div key={k}>
                            <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">{label}</label>
                            {kind === "stato" ? (
                                <select className={cls} value={val} onChange={e => setEditValues(prev => ({ ...prev, [k]: e.target.value }))}>
                                    <option value="">—</option>
                                    {Array.from(new Set([...STATI, val].filter(Boolean))).map(o => <option key={o} value={o}>{o}</option>)}
                                </select>
                            ) : opts ? (
                                <select className={cls} value={val} onChange={e => setEditValues(prev => ({ ...prev, [k]: e.target.value }))}>
                                    <option value="">—</option>
                                    {Array.from(new Set([...opts, val].filter(Boolean))).map(o => <option key={o} value={o}>{o}</option>)}
                                </select>
                            ) : kind === "textarea" ? (
                                <textarea rows={2} className={cls} value={val} onChange={e => setEditValues(prev => ({ ...prev, [k]: e.target.value }))} />
                            ) : (
                                <input type={kind === "date" ? "date" : "text"} className={cls} value={val}
                                    onChange={e => setEditValues(prev => ({ ...prev, [k]: e.target.value }))} />
                            )}
                        </div>
                    );
                };

                const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
                    <div>
                        <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wider mb-3 pb-2 border-b border-white/10">{title}</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>
                    </div>
                );

                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedContract(null)}>
                        <div className="glass-card w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
                                <div>
                                    <h3 className="text-lg font-bold text-white">
                                        {detailMode === "view" ? "Dettaglio contratto" : "Modifica contratto"}
                                    </h3>
                                    <p className="text-xs text-slate-400 font-mono">{row.id} · {row.brand} · {row.cliente}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {detailMode === "view" && canEditContract && (
                                        <button onClick={() => openContract(row, "edit")}
                                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 flex items-center gap-1.5">
                                            <Edit className="w-3.5 h-3.5" /> Modifica
                                        </button>
                                    )}
                                    {detailMode === "edit" && (
                                        <button onClick={() => openContract(row, "view")}
                                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 text-slate-300 hover:bg-white/10">
                                            Annulla
                                        </button>
                                    )}
                                    <button onClick={() => setSelectedContract(null)} className="p-1 hover:bg-white/10 rounded-lg text-slate-400 transition-colors">
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            <div className="p-6 overflow-y-auto space-y-6">
                                {reqMsg && (
                                    <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{reqMsg}</div>
                                )}
                                {pendingForThis.length > 0 && (
                                    <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200 flex items-start gap-2">
                                        <Clock className="w-4 h-4 mt-0.5 shrink-0" />
                                        <span>
                                            {pendingForThis.length === 1 ? "C'è una richiesta di modifica" : `Ci sono ${pendingForThis.length} richieste di modifica`} in attesa di approvazione dall&apos;amministrazione.
                                        </span>
                                    </div>
                                )}
                                {detailMode === "edit" && (
                                    <div className="rounded-xl border border-indigo-400/30 bg-indigo-400/10 px-4 py-3 text-xs text-indigo-200">
                                        Le modifiche non sono immediate: vengono inviate come richiesta di approvazione all&apos;amministrazione (Sandra, Claudia, Marta, Franca, Luca).
                                    </div>
                                )}


                                {(detEditable.length > 0 || detReadonly.length > 0) && (
                                    <Section title="Dettagli registrazione">
                                        {detEditable.map(([k]) => renderField("dettagli::" + k, k))}
                                        {detReadonly.map(([k, v]) => (
                                            <div key={k} className="sm:col-span-2 lg:col-span-3">
                                                <span className="text-[11px] uppercase tracking-wider text-slate-500">{k}</span>
                                                <pre className="text-white text-xs bg-black/30 rounded-lg p-2 overflow-x-auto">{JSON.stringify(v, null, 2)}</pre>
                                            </div>
                                        ))}
                                    </Section>
                                )}

                                <Section title="Dati contratto">
                                    {CONTRACT_FIELDS.map(f => renderField("contract::" + f.key, f.label, f.kind))}
                                    {/* Segnalazione 67: nel box Dati contratto anche il codice
                                        inserimento, che cambia nome per brand ma sta nei dettagli. */}
                                    {(() => {
                                        const det = (row.raw?.dettagli as Record<string, unknown>) || {};
                                        const ci = det["Cod.Ins."] ?? Object.entries(det).find(([k]) => /^cod\.?\s?ins/i.test(k))?.[1];
                                        return (
                                            <div>
                                                <span className="text-[11px] uppercase tracking-wider text-slate-500">Codice inserimento</span>
                                                <p className="text-white text-sm break-words">{ci ? String(ci) : "—"}</p>
                                            </div>
                                        );
                                    })()}
                                </Section>

                                <Section title="Anagrafica cliente">
                                    {CLIENT_FIELDS.map(f => renderField("client::" + f.key, f.label, f.kind))}
                                </Section>

                                <Section title="Riferimenti sistema">
                                    {READONLY_META.map(f => (
                                        <div key={f.key}>
                                            <span className="text-[11px] uppercase tracking-wider text-slate-500">{f.label}</span>
                                            <p className="text-white text-sm font-mono break-all">{fmtVal(row.raw?.[f.key])}</p>
                                        </div>
                                    ))}
                                </Section>

                                {detailMode === "edit" && (
                                    <div className="pt-4 border-t border-white/10 space-y-3">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-400 mb-1">Motivo della modifica (facoltativo)</label>
                                            <textarea rows={2} className="glass-input w-full text-sm" value={reqNote} onChange={e => setReqNote(e.target.value)}
                                                placeholder="Es. correzione ICCID comunicata dal cliente" />
                                        </div>
                                        {nChanges > 0 && (
                                            <div className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-1">
                                                <p className="text-xs font-bold text-slate-300 mb-2">{nChanges} {nChanges === 1 ? "campo modificato" : "campi modificati"}</p>
                                                {Object.entries(pendingChanges).map(([k, c]) => (
                                                    <div key={k} className="text-xs text-slate-300">
                                                        <b className="text-white">{c.label}</b>: <span className="text-slate-500">{fmtVal(c.da)}</span> → <span className="text-amber-300">{fmtVal(c.a)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <button
                                            disabled={saving || nChanges === 0}
                                            onClick={submitChangeRequest}
                                            className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold bg-indigo-500 hover:bg-indigo-600 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            {saving ? "Invio..." : nChanges === 0 ? "Nessuna modifica" : "Invia richiesta di approvazione"}
                                        </button>
                                    </div>
                                )}

                                {contractReqs.length > 0 && (
                                    <div className="pt-4 border-t border-white/10">
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Richieste di modifica</h4>
                                        <div className="space-y-2">
                                            {contractReqs.map(r => (
                                                <div key={r.id} className="rounded-lg bg-white/5 border border-white/10 p-3 text-xs">
                                                    <div className="flex items-center justify-between gap-2 mb-1">
                                                        <span className="text-slate-300"><b className="text-white">{r.requested_by_name || "—"}</b> · {new Date(r.created_at).toLocaleString("it-IT")}</span>
                                                        <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                                                            r.status === "pending" ? "bg-amber-500/15 text-amber-300" :
                                                                r.status === "approved" ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300")}>
                                                            {r.status === "pending" ? "In attesa" : r.status === "approved" ? "Approvata" : "Rifiutata"}
                                                        </span>
                                                    </div>
                                                    {Object.entries(r.changes || {}).filter(([k]) => !k.startsWith("__")).map(([k, c]: any) => (
                                                        <div key={k} className="text-slate-400">{c.label}: <span className="text-slate-500">{fmtVal(c.da)}</span> → <span className="text-amber-300">{fmtVal(c.a)}</span></div>
                                                    ))}
                                                    {r.changes?.__meta?.note && <p className="text-slate-500 mt-1 italic">{r.changes.__meta.note}</p>}
                                                    {r.reviewed_by_name && <p className="text-slate-500 mt-1">Esaminata da {r.reviewed_by_name}</p>}
                                                    {canApprove && r.status === "pending" && (
                                                        <div className="flex gap-2 mt-2">
                                                            <button disabled={reqBusy === r.id} onClick={() => decideRequest(r, true)}
                                                                className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 font-semibold disabled:opacity-40">Approva</button>
                                                            <button disabled={reqBusy === r.id} onClick={() => decideRequest(r, false)}
                                                                className="px-3 py-1 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 font-semibold disabled:opacity-40">Rifiuta</button>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {(row.storia?.length || 0) > 0 && (
                                    <div className="pt-4 border-t border-white/10">
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Storico modifiche</h4>
                                        <div className="space-y-2">
                                            {[...row.storia].reverse().map((h: any, i: number) => (
                                                <div key={i} className="flex items-start gap-2 text-xs">
                                                    <span className="text-slate-600 shrink-0">{h.at ? new Date(h.at).toLocaleString("it-IT") : "—"}</span>
                                                    <span className="text-slate-300">
                                                        <b className="text-white">{h.user || "—"}</b>
                                                        {h.campo ? " · " + h.campo : ""}
                                                        {h.da || h.a ? ": " + (h.da || "—") + " → " + (h.a || "—") : ""}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
