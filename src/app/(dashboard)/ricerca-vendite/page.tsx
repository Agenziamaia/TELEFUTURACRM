"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { SelectPersona, SelectOpzioni, SelectMulti } from "@/components/SelectPersona";
import { Search, Eye, Edit, Trash2, X, ShieldCheck, Check, Clock, Navigation, FileText } from "lucide-react";
import { cn } from "@/utils";
import { DatePickerInput } from "@/components/DatePickerInput";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { CATEGORIE_CANONICHE, CANONICA_BY_ID, BRAND_CANONICI, categoriaDef, categoriaDi } from "@/lib/tassonomia";
import { seesWholeStore } from "@/lib/roles";
import { useVisibleStores, negozioInValues, sameStore } from "@/lib/visibleStores";
import { codiciPerBrand } from "@/lib/codiciInserimento";

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
    // Segnalazione 76: si chiama Codice contratto (anche in Modifica, non solo in colonna)
    { key: "codice_attivazione", label: "Codice contratto" },
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
    { key: "telefono_fisso", label: "Telefono fisso" },
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
    "Ho. Mobile": "/ho-mobile.png", "Ho": "/ho-mobile.png", "Kena Mobile": "/kena-mobile-v2.png", "Kena": "/kena-mobile-v2.png",
    "Tim": "/tim-logo-v2.png", "TIM": "/tim-logo-v2.png", "S4": "/energy - Copy.png", "Dojo": "/dojo - Copy.png",
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

// Segnalazione 76: codice di inserimento del contratto. La chiave nei dettagli
// cambia da brand a brand ("Cod.Ins.", "Cod.Ins. CB", ...): si prende la prima utile.
function codInsDi(row: ContrattoRow): string {
    const d = (row.raw?.dettagli as Record<string, unknown>) || {};
    const v = d["Cod.Ins."] ?? Object.entries(d).find(([k]) => /^cod\.?\s?ins/i.test(k))?.[1];
    return v == null ? "" : String(v).trim();
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
    // ── FILTRI DAL CATALOGO (regole Luca 28/07): categoria sempre filtrabile;
    //    prodotto e offerta SOLO con un brand solo selezionato dalle tessere
    //    (altrimenti "milioni di variabili"); entrambi MULTI-selezione.
    //    Le liste arrivano da catalog_* (incluse le voci spente: lo storico
    //    le contiene), non piu' dai distinct dello storico.
    const [filterCategoria, setFilterCategoria] = useState("");
    const [filterOfferte, setFilterOfferte] = useState<string[]>([]);
    const [offPick, setOffPick] = useState("");
    // OPZIONI (Luca 28/07): quarto anello della catena — si sbloccano dopo
    // l'offerta; multi, match sul jsonb contracts.opzioni [{nome,quantita}].
    const [filterOpzioni, setFilterOpzioni] = useState<string[]>([]);
    const [opzPick, setOpzPick] = useState("");
    // catNames = categorie del CATALOGO che il brand vende davvero (in ordine
    // di catalogo, Wallet e Ric. Auto SEPARATE — Luca 28/07: non c'è altro modo
    // di distinguere un'offerta wallet da una a ricarica automatica). Il filtro
    // interroga dettagli->>categoria_catalogo (scritto dal registra e
    // backfillato sullo storico); le vendite mobile vecchie SENZA il dato
    // stanno nella voce dedicata "Mobile (storico)".
    type CatFiltro = { slug: string; prodNames: string[]; offByProd: Record<string, string[]>; offNames: string[]; catNames: string[]; prodsByCat: Record<string, string[]>; offsByCat: Record<string, string[]>; opzByOff: Record<string, string[]> };
    const [catalogoBrand, setCatalogoBrand] = useState<CatFiltro | null>(null);
    const _catFiltroCache = useRef<Record<string, CatFiltro>>({});
    const _catNomi = useRef<{ id: string; nome: string }[] | null>(null);
    // MARGINALITÀ a DUE LAYER (Luca 28/07): prima il TIPO (prodotti/servizi,
    // da marg_categories.kind — Kasko/Servizi sono servizi; SIM/ESIM/Telefono
    // Cash/Prodotti sono prodotti), poi gli ARTICOLI del listino di quel tipo.
    // Attivi solo con la sola tessera Marginalità selezionata.
    const [margTipo, setMargTipo] = useState<"" | "prodotti" | "servizi">("");
    const [margArticoli, setMargArticoli] = useState<string[]>([]);
    const [margPick, setMargPick] = useState("");
    const [margListino, setMargListino] = useState<{ name: string; kind: string }[] | null>(null);
    const _margCache = useRef<{ name: string; kind: string }[] | null>(null);
    const [filterNegozio, setFilterNegozio] = useState("");
    const [filterCodiceAttivazione, setFilterCodiceAttivazione] = useState("");
    const [filterCliente, setFilterCliente] = useState("");
    const [filterCellulare, setFilterCellulare] = useState("");
    const [filterImei, setFilterImei] = useState("");
    // Solo la DATA DI ATTIVAZIONE (regola Luca 25/07: coppia "registrazione" tolta).
    // Il picker emette gg/mm/aaaa mentre il DB confronta testo ISO aaaa-mm-gg:
    // senza conversione il filtro non trovava MAI nulla ("non funziona").
    const [daDataAttivazione, setDaDataAttivazione] = useState("");
    const [aDataAttivazione, setADataAttivazione] = useState("");
    // gg/mm/aaaa -> aaaa-mm-gg. Segnalazione 80: mentre si DIGITA la data il
    // picker manda testo parziale ("27/0"): prima passava tale e quale al filtro
    // (>= "27/0") e la lista/le tessere si svuotavano ("filtro non funziona").
    // Ora una data incompleta/non valida ritorna "" e il filtro semplicemente
    // non si applica finche' non e' completa.
    const dataIso = (v: string) => {
        const s = (v || "").trim();
        const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (m) return `${m[3]}-${m[2]}-${m[1]}`;
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        return "";
    };

    const [selectedContract, setSelectedContract] = useState<ContrattoRow | null>(null);
    const [detailMode, setDetailMode] = useState<"view" | "edit">("view");

    // Deep link dai tag in chat e dalla ricerca globale in alto:
    // /ricerca-vendite?id=<id> apre il dettaglio del contratto.
    // Segnalazione 75: il contratto cercato puo' non essere nella pagina caricata,
    // quindi filtro subito per quell'id: cosi' c'e' di sicuro e il dettaglio si apre.
    const deepLinked = useRef(false);
    useEffect(() => {
        const id = new URLSearchParams(window.location.search).get("id");
        if (!id) return;
        setFilterCodice(id);
        // Luca 01/08: dalla scheda cliente il click su una vendita di marginalità
        // arrivava qui ma NON si apriva: nello stato di default la tessera 💰 è
        // spenta e la query esclude brand Extra/Marginalità, quindi il contratto
        // cercato non entrava mai in lista (bisognava cliccare il sacchetto a
        // mano). Leggo il brand del contratto e, se è extra, accendo la sua
        // tessera come farebbe il click dell'utente.
        (async () => {
            const { data } = await supabase.from("contracts").select("brand").eq("id", id).maybeSingle();
            const b = String(data?.brand || "");
            if (["extra", "marginalità", "marginalita"].includes(b.toLowerCase())) setSelBrands(new Set([b]));
        })();
    }, []);
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
    // Il "vede tutto" arriva dalla FONTE UNICA della visibilita': per l'amministrativo
    // non basta piu' il ruolo (l'admin puo' restringergli i negozi visibili).
    const { seesAll: isGlobalView, stores: visStores, loaded: visLoaded } = useVisibleStores();
    const wholeStore = seesWholeStore(user?.role);
    // Modifica contratto riservata allo Store Manager (+ superuser) — richiesta Luca #5.
    const canEditContract = ["store_manager", "admin", "dev", "direttore_generale", "amministrativo"].includes(user?.role || "");
    // Approvazione modifiche = amministrazione (Sandra, Claudia, Marta, Franca, Luca).
    const canApprove = ["amministrativo", "admin", "dev", "direttore_generale"].includes(user?.role || "");
    // Cestino contratto (regola Luca 25/07): bottone dallo store manager in su.
    // Eliminano DIRETTAMENTE amministrazione, admin e direzione commerciale
    // (+ direzione generale); lo store manager invia la richiesta e serve
    // l'approvazione dell'amministrazione, come per le modifiche.
    const canDeleteDirect = ["amministrativo", "admin", "dev", "direttore_generale", "direttore_commerciale"].includes(user?.role || "");
    const canDeleteButton = canDeleteDirect || user?.role === "store_manager";
    const [delTarget, setDelTarget] = useState<any>(null);
    const [delMotivo, setDelMotivo] = useState("");
    const [delBusy, setDelBusy] = useState(false);
    const [delMsg, setDelMsg] = useState("");
    const eseguiEliminazione = async () => {
        if (!delTarget || delBusy) return;
        setDelBusy(true); setDelMsg("");
        if (canDeleteDirect) {
            // gli allegati cadono in CASCADE; le richieste restano per lo storico
            const { error } = await supabase.from("contracts").delete().eq("id", delTarget.id);
            if (error) { setDelMsg("⚠️ Eliminazione non riuscita: " + error.message); setDelBusy(false); return; }
            await supabase.from("contract_change_requests").update({ status: "rejected", review_note: "Contratto eliminato", reviewed_by_name: user?.name || "—", reviewed_at: new Date().toISOString() }).eq("contract_id", delTarget.id).eq("status", "pending");
            setDelBusy(false); setDelTarget(null);
            fetchData();
        } else {
            if (!delMotivo.trim()) { setDelMsg("Spiega il motivo dell'eliminazione."); setDelBusy(false); return; }
            const { error } = await supabase.from("contract_change_requests").insert({
                contract_id: delTarget.id, requested_by: user?.id || null, requested_by_name: user?.name || "—",
                changes: { __delete: true, __meta: { note: delMotivo.trim(), origine: "ricerca_vendite" } },
            });
            if (error) { setDelMsg("⚠️ Invio non riuscito: " + error.message); setDelBusy(false); return; }
            setDelBusy(false); setDelMsg("✅ Richiesta inviata all'amministrazione: la pratica sarà eliminata solo dopo l'approvazione.");
            setTimeout(() => { setDelTarget(null); setDelMotivo(""); setDelMsg(""); }, 1800);
        }
    };
    // Segnalazione 55: i contratti brand Extra sono nascosti di default; un
    // checkbox li mostra. Il ruolo Tecnico li vede sempre tutti (di tutto il
    // negozio), quindi per lui il filtro non si applica.
    const isTecnico = user?.role === "tecnico";
    // Marginalità SEMPRE visibile (via il flag — regola Luca 25/07). Tessere
    // brand a SELEZIONE POSITIVA (stessa logica del caller, 27/07): tutte
    // attive per definizione; il click su una applica il filtro "solo quella",
    // i successivi aggiungono/tolgono; tutte scelte o nessuna = tutte.
    // vuoto = stato di DEFAULT: tutte le tessere accese TRANNE la Marginalità
    // (richiesta Luca 28/07); il click mantiene la selezione positiva di sempre.
    const [selBrands, setSelBrands] = useState<Set<string>>(new Set());
    const _isExtraBrand = (b: string) => ["extra", "marginalità", "marginalita"].includes(String(b || "").toLowerCase());
    const LABEL_SLUG: Record<string, string> = { "WindTre": "windtre", "Vodafone": "vodafone", "Fastweb": "fastweb", "Iliad": "iliad", "Sky": "sky", "TIM": "tim", "Tim": "tim", "S4": "s4", "Dojo": "dojo", "Very Mobile": "very", "Very": "very", "Ho. Mobile": "ho", "Ho Mobile": "ho", "Kena Mobile": "kena", "Kena": "kena" };
    // un solo brand attivo dalle tessere (o unico brand presente) = si puo' filtrare per prodotto/offerta
    const soloBrandLabel = selBrands.size === 1 ? Array.from(selBrands)[0] : (selBrands.size === 0 && brandCounts.length === 1 ? brandCounts[0].brand : null);
    const soloSlug = soloBrandLabel ? (LABEL_SLUG[soloBrandLabel] || null) : null;
    const _prevSlug = useRef<string | null>(null);
    // CATEGORIE FINI anche con più brand (Luca 28/07): la tendina elenca sempre
    // le categorie del catalogo — lo storico è al 100% classificato (backfill
    // completato con la regola pagamento: EasyPay/IBAN → Ric. Auto, niente → Wallet).
    const [catNomiAll, setCatNomiAll] = useState<string[]>([]);
    useEffect(() => {
        (async () => {
            if (!_catNomi.current) {
                const rc = await supabase.from("catalog_categorie").select("id, nome");
                _catNomi.current = (rc.data ?? []) as { id: string; nome: string }[];
            }
            setCatNomiAll((_catNomi.current || []).map((c) => c.nome));
        })();
    }, []);
    useEffect(() => {
        if (_prevSlug.current !== soloSlug) {
            _prevSlug.current = soloSlug;
            // cambio brand = si riparte: anche la CATEGORIA, che in modalità
            // catalogo elenca voci specifiche del brand (conseguenzialità).
            setFilterProdotti([]); setProdPick(""); setFilterOfferte([]); setOffPick(""); setFilterOpzioni([]); setOpzPick(""); setFilterCategoria("");
        }
        if (!soloSlug) { setCatalogoBrand(null); return; }
        const hit = _catFiltroCache.current[soloSlug];
        if (hit) { setCatalogoBrand(hit); return; }
        let alive = true;
        (async () => {
            if (!_catNomi.current) {
                const rc = await supabase.from("catalog_categorie").select("id, nome");
                _catNomi.current = (rc.data ?? []) as { id: string; nome: string }[];
            }
            const rp = await supabase.from("catalog_prodotti").select("id, nome, categoria_id").eq("brand_id", soloSlug);
            const prods = rp.data ?? [];
            let offs: { id: string; prodotto_id: string; nome: string }[] = [];
            let opzs: { offerta_id: string; nome: string }[] = [];
            if (prods.length) {
                const ro = await supabase.from("catalog_offerte").select("id, prodotto_id, nome").in("prodotto_id", prods.map((x: { id: string }) => x.id));
                offs = (ro.data ?? []) as { id: string; prodotto_id: string; nome: string }[];
                if (offs.length) {
                    const rz = await supabase.from("catalog_opzioni").select("offerta_id, nome").in("offerta_id", offs.map((o) => o.id));
                    opzs = (rz.data ?? []) as { offerta_id: string; nome: string }[];
                }
            }
            // opzioni per NOME offerta (la stessa offerta può vivere in più categorie)
            const offNomeById: Record<string, string> = {}; offs.forEach((o) => { offNomeById[o.id] = o.nome; });
            const opzByOff: Record<string, string[]> = {};
            opzs.forEach((z) => { const on = offNomeById[z.offerta_id]; if (!on) return; (opzByOff[on] = opzByOff[on] || []).push(z.nome); });
            Object.keys(opzByOff).forEach((k) => { opzByOff[k] = Array.from(new Set(opzByOff[k])).sort(); });
            const nomeById: Record<string, string> = {}; prods.forEach((x: { id: string; nome: string }) => { nomeById[x.id] = x.nome; });
            const offByProd: Record<string, string[]> = {};
            offs.forEach((o) => { const pn = nomeById[o.prodotto_id]; if (!pn) return; (offByProd[pn] = offByProd[pn] || []).push(o.nome); });
            Object.keys(offByProd).forEach((k) => { offByProd[k] = Array.from(new Set(offByProd[k])).sort(); });
            // categorie REALI del brand in ordine di catalogo + offerte per categoria
            // (via id prodotto: la stessa offerta può stare in più categorie)
            const catNames: string[] = []; const prodsByCat: Record<string, string[]> = {}; const offsByCat: Record<string, string[]> = {};
            (_catNomi.current || []).forEach((c) => {
                const suoiProds = prods.filter((p: { categoria_id: string }) => p.categoria_id === c.id);
                if (!suoiProds.length) return;
                catNames.push(c.nome);
                prodsByCat[c.nome] = Array.from(new Set(suoiProds.map((p: { nome: string }) => p.nome))).sort();
                const ids = new Set(suoiProds.map((p: { id: string }) => p.id));
                offsByCat[c.nome] = Array.from(new Set(offs.filter((o) => ids.has(o.prodotto_id)).map((o) => o.nome))).sort();
            });
            const t: CatFiltro = { slug: soloSlug, prodNames: Array.from(new Set(prods.map((x: { nome: string }) => x.nome))).sort() as string[], offByProd, offNames: Array.from(new Set(offs.map((o) => o.nome))).sort(), catNames, prodsByCat, offsByCat, opzByOff };
            _catFiltroCache.current[soloSlug] = t;
            if (alive) setCatalogoBrand(t);
        })();
        return () => { alive = false; };
    }, [soloSlug]); // eslint-disable-line react-hooks/exhaustive-deps
    // CONSEGUENZIALITÀ (Luca 28/07): le offerte seguono i prodotti scelti; senza
    // prodotti ma con una categoria, seguono i prodotti di quella categoria —
    // e comunque si restringono alle offerte DELLA categoria (la stessa offerta
    // può esistere sia in Wallet sia in Ric. Auto).
    const offerteDisponibili = useMemo(() => {
        if (!catalogoBrand) return [];
        const base = filterProdotti.length ? filterProdotti
            : filterCategoria ? (catalogoBrand.prodsByCat[filterCategoria] || [])
            : null;
        if (!base) return catalogoBrand.offNames;
        let set = new Set<string>();
        base.forEach((pn) => (catalogoBrand.offByProd[pn] || []).forEach((o) => set.add(o)));
        const inCat = filterCategoria ? catalogoBrand.offsByCat[filterCategoria] : null;
        if (inCat) { const s2 = new Set(inCat); set = new Set(Array.from(set).filter((o) => s2.has(o))); }
        return Array.from(set).sort();
    }, [catalogoBrand, filterProdotti, filterCategoria]);
    // le OPZIONI si sbloccano con almeno un'offerta scelta: unione delle loro
    const opzioniDisponibili = useMemo(() => {
        if (!catalogoBrand || !filterOfferte.length) return [];
        const set = new Set<string>();
        filterOfferte.forEach((on) => (catalogoBrand.opzByOff[on] || []).forEach((z) => set.add(z)));
        return Array.from(set).sort();
    }, [catalogoBrand, filterOfferte]);
    // Sola tessera Marginalità attiva → si accendono i due layer dedicati.
    const soloMarg = !!soloBrandLabel && ["marginalità", "marginalita"].includes(soloBrandLabel.toLowerCase());
    useEffect(() => {
        if (!soloMarg) { setMargTipo(""); setMargArticoli([]); setMargPick(""); return; }
        setFilterCategoria("");   // la categoria nascosta non deve restare a filtrare
        if (_margCache.current) { setMargListino(_margCache.current); return; }
        let alive = true;
        (async () => {
            const [rc, ri] = await Promise.all([
                supabase.from("marg_categories").select("id, kind"),
                // anche gli articoli spenti: lo storico li contiene
                supabase.from("marg_items").select("name, category_id"),
            ]);
            const kindById: Record<string, string> = {};
            (rc.data ?? []).forEach((c: { id: string; kind: string }) => { kindById[c.id] = c.kind; });
            const list = (ri.data ?? []).map((i: { name: string; category_id: string }) => ({ name: i.name, kind: kindById[i.category_id] || "prodotti" }));
            // voce AUTO del Registra (telefono a rate/listino): non sta nel
            // listino marg_items ma nelle vendite c'è, ed è un prodotto.
            list.push({ name: "Telefono TNP (listino)", kind: "prodotti" });
            const uniq = Array.from(new Map(list.map(x => [x.name, x])).values()).sort((a, b) => a.name.localeCompare(b.name));
            _margCache.current = uniq;
            if (alive) setMargListino(uniq);
        })();
        return () => { alive = false; };
    }, [soloMarg]);
    const margArticoliDisponibili = useMemo(
        () => (margListino ?? []).filter(x => margTipo && x.kind === margTipo).map(x => x.name),
        [margListino, margTipo]);
    const lockedStores = !isGlobalView && visStores.length ? negozioInValues(visStores) : null;
    const visKey = (lockedStores || []).join("|");
    // Finche' la lista visibilita' non e' arrivata NON si interroga (si eviterebbe
    // un primo fetch senza filtro o filtrato male).
    const visReady = isGlobalView || visLoaded;
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
            // Segnalazione 47: le tendine devono offrire SOLO cio' che l'utente puo'
            // davvero vedere. Prima la lista prodotti/codici era globale, quindi uno
            // store manager poteva scegliere un prodotto presente in un altro negozio
            // e la ricerca tornava vuota (sembrava rotta). Ora applico lo stesso RBAC
            // di fetchData. Segnalazione 53: i "codici" del filtro sono i codici di
            // inserimento (dettagli['Cod.Ins.']), non piu' i codici contratto.
            let q = supabase.from("contracts").select("venditore, brand, prodotto, negozio, dettagli");
            if (!isGlobalView) {
                if (lockedStores) q = q.in("negozio", lockedStores);
                if (lockedVenditore) q = q.eq("venditore", lockedVenditore);
            }
            if (isTecnico) q = q.or("brand.ilike.%extra%,brand.ilike.%marginal%,prodotto.ilike.%sost%");
            const { data } = await q;
            if (data) {
                setUniqueBrands(Array.from(new Set(data.map((r: any) => r.brand).filter(Boolean))).sort() as string[]);
                setUniqueProdotti(Array.from(new Set(data.map((r: any) => r.prodotto).filter(Boolean))).sort() as string[]);
                setUniqueNegozi(Array.from(new Set(data.map((r: any) => r.negozio).filter(Boolean))).sort() as string[]);
                // prodotti e codici di inserimento raggruppati per brand
                const pb: Record<string, Set<string>> = {}, cb: Record<string, Set<string>> = {};
                (data as any[]).forEach(r => {
                    if (!r.brand) return;
                    if (r.prodotto) (pb[r.brand] ??= new Set()).add(r.prodotto);
                    const det = (r.dettagli && typeof r.dettagli === "object") ? r.dettagli : {};
                    const ci = String(det["Cod.Ins."] ?? "").trim();
                    if (ci && ci !== "—") (cb[r.brand] ??= new Set()).add(ci);
                });
                setProdByBrand(Object.fromEntries(Object.entries(pb).map(([k, v]) => [k, [...v].sort()])));
                setCodeByBrand(Object.fromEntries(Object.entries(cb).map(([k, v]) => [k, [...v].sort()])));
            }
        };
        if (visReady) fetchFilters();
    }, [isGlobalView, visKey, visReady, lockedVenditore, isTecnico]); // eslint-disable-line react-hooks/exhaustive-deps

    // Elenco venditori dagli account attivi, con il proprio team in cima.
    useEffect(() => {
        (async () => {
            const { data } = await supabase
                .from("app_users")
                .select("full_name, primary_store")
                .eq("active", true)
                .order("full_name");
            // "Team" = colleghi di TUTTI i negozi visibili, non solo del principale.
            const miei = visStores.length ? visStores : (user?.negozio ? [user.negozio] : []);
            const stessoNegozio = (st: string | null) => miei.some((m) => sameStore(st, m));
            const team: string[] = [], altri: string[] = [];
            (data ?? []).forEach((u: Record<string, unknown>) => {
                const nome = String(u.full_name || "").trim();
                if (!nome) return;
                (stessoNegozio(u.primary_store as string) ? team : altri).push(nome);
            });
            setVenditoriTeam(team);
            setVenditoriAltri(altri);
        })();
    }, [user?.negozio, visKey]); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchData = async () => {
        if (!visReady) return; // la lista dei negozi visibili non e' ancora arrivata
        setLoading(true);
        try {
            let query = supabase
                .from("contracts")
                // Anagrafica COMPLETA anche dalla lista: il dettaglio aperto da qui
                // mostrava "—" su tutti i campi non selezionati (il DB era pieno,
                // la query portava solo i 4 campi delle colonne).
                .select("*, clients!inner(nome, cognome, ragione_sociale, cellulare, telefono_fisso, email, cf_piva, indirizzo, cap, citta, tipo, nome_ref, cognome_ref)", { count: "exact" });

            // Apply Server-side filters
            if (filterVenditore && filterVenditore !== "Tutti") query = query.eq("venditore", filterVenditore);
            if (filterNegozio && filterNegozio !== "Tutti") query = query.eq("negozio", filterNegozio);
            if (filterCodice) query = query.ilike("id", `%${filterCodice}%`);
            if (filterBrand && filterBrand !== "") query = query.ilike("brand", `%${filterBrand}%`);
            if (filterProdotti.length > 0) query = query.in("prodotto", filterProdotti);
            if (filterOfferte.length > 0) query = query.in("offerta", filterOfferte);
            // opzioni selezionate: la vendita deve contenerle TUTTE (@> sul jsonb)
            if (filterOpzioni.length > 0) query = query.contains("opzioni", filterOpzioni.map(o => ({ nome: o })));
            // CATEGORIA = sempre quella FINE del catalogo, con uno o più brand
            // (Luca 28/07): dettagli->>categoria_catalogo copre il 100% dello
            // storico dopo il backfill (regola pagamento per i mobile vecchi).
            if (filterCategoria && !soloMarg) query = query.eq("dettagli->>categoria_catalogo", filterCategoria);
            // Segnalazione 55 (chiarita): il Tecnico vede SOLO i contratti brand Extra
            // (di tutto il proprio negozio). Gli altri: Extra nascosti salvo checkbox.
            if (isTecnico) query = query.or("brand.ilike.%extra%,brand.ilike.%marginal%,prodotto.ilike.%sost%");
            // Segnalazione 53: si filtra sul codice di inserimento (dettagli['Cod.Ins.']),
            // non piu' sul codice contratto. Chiave con punti -> va quotata per PostgREST.
            if (filterCodiceAttivazione) query = query.eq('dettagli->>"Cod.Ins."', filterCodiceAttivazione);
            if (filterCellulare) query = query.ilike("clients.cellulare", `%${filterCellulare}%`);
            // Segnalazione 80: i quattro filtri data non venivano MAI applicati alla
            // ricerca (li usava solo il conteggio delle tessere brand): si sceglieva
            // una data e l'elenco restava identico. Le date sono in formato
            // AAAA-MM-GG, quindi il confronto e' diretto.
            const _daIso = dataIso(daDataAttivazione), _aIso = dataIso(aDataAttivazione);
            if (_daIso) query = query.gte("data_attivazione", _daIso);
            if (_aIso) query = query.lte("data_attivazione", _aIso);

            // tessere brand a selezione positiva: con una selezione attiva
            // passano SOLO i brand scelti; nello stato di default (nessuna
            // selezione) la MARGINALITÀ resta esclusa — si vede solo cliccandola.
            if (selBrands.size > 0) query = query.in("brand", Array.from(selBrands));
            else query = query.neq("brand", "Marginalità").neq("brand", "Extra");

            // MARGINALITÀ a due layer: gli articoli scelti vincono; col solo
            // tipo selezionato passano tutti gli articoli di quel tipo.
            if (soloMarg && (margArticoli.length || margTipo)) {
                if (margArticoli.length) query = query.in("prodotto", margArticoli);
                else {
                    const names = (margListino ?? []).filter(x => x.kind === margTipo).map(x => x.name);
                    if (names.length) query = query.in("prodotto", names);
                }
            }

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

            // RBAC: tutti i negozi visibili (negozioInValues include anche la radice
            // legacy: i contratti storici salvavano "Magliana" senza suffisso).
            if (!isGlobalView) {
                if (lockedStores) query = query.in("negozio", lockedStores);
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
            if (!visReady) return;
            let q = supabase.from("contracts").select("brand, data_registrazione");
            if (!isGlobalView) {
                if (lockedStores) q = q.in("negozio", lockedStores);
                if (lockedVenditore) q = q.eq("venditore", lockedVenditore);
            }
            if (isTecnico) q = q.or("brand.ilike.%extra%,brand.ilike.%marginal%,prodotto.ilike.%sost%");
            // Segnalazione 80: le tessere devono seguire GLI STESSI filtri data
            // dell'elenco. Prima guardavano solo le date di registrazione, quindi
            // filtrando per data di attivazione l'elenco cambiava e le tessere no.
            const _daIso = dataIso(daDataAttivazione), _aIso = dataIso(aDataAttivazione);
            if (_daIso) q = q.gte("data_attivazione", _daIso);
            if (_aIso) q = q.lte("data_attivazione", _aIso);
            const { data } = await q;
            const m: Record<string, number> = {};
            (data ?? []).forEach((r: any) => { if (r.brand) m[r.brand] = (m[r.brand] || 0) + 1; });
            setBrandCounts(Object.entries(m).map(([brand, n]) => ({ brand, n })).sort((a, b) => b.n - a.n));
        })();
    }, [isGlobalView, visKey, visReady, lockedVenditore, isTecnico, aDataAttivazione, daDataAttivazione, contractList.length]); // eslint-disable-line react-hooks/exhaustive-deps

    // Segnalazione 47: quando cambia un filtro, torna a pagina 1. Prima, se eri a
    // pagina 2+ e applicavi un filtro (es. un Prodotto) con pochi risultati, la
    // pagina corrente restava oltre l'ultima e la lista appariva VUOTA — sembrava
    // che "non generasse alcun risultato".
    const firstFilterRun = useRef(true);
    useEffect(() => {
        if (firstFilterRun.current) { firstFilterRun.current = false; return; }
        setPage(1);
    }, [filterVenditore, filterCodice, filterBrand, filterProdotti.join("|"), filterOfferte.join("|"), filterCategoria, filterNegozio, filterCodiceAttivazione, filterCliente, filterCellulare, filterImei, Array.from(selBrands).join("|"), daDataAttivazione, aDataAttivazione, margTipo, margArticoli.join("|"), filterOpzioni.join("|")]);

    // Debounced fetch (riparte anche quando arriva la lista dei negozi visibili)
    useEffect(() => {
        const timer = setTimeout(fetchData, 300);
        return () => clearTimeout(timer);
    }, [page, visKey, visReady, filterVenditore, filterCodice, filterBrand, filterProdotti.join("|"), filterOfferte.join("|"), filterCategoria, filterNegozio, filterCodiceAttivazione, filterCliente, filterCellulare, filterImei, Array.from(selBrands).join("|"), daDataAttivazione, aDataAttivazione, margTipo, margArticoli.join("|"), filterOpzioni.join("|"), (margListino ?? []).length, catalogoBrand?.slug ?? ""]);

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

    // Il "Filtra risultati..." sopra la tabella è stato RIMOSSO (Luca 28/07):
    // filtrava solo la pagina caricata, non le successive — ingannevole.
    // La ricerca vera è nei filtri in alto, che interrogano il database.
    const visibleData = contractList;

    const handleExportCsv = () => {
        if (visibleData.length === 0) return;
        // Segnalazione 76: anche nell'esport il Codice ins. e il nome corretto della colonna
        const headers = ["Venditore", "Brand", "Categoria", "Prodotto", "Offerta", "Cliente", "Negozio", "Codice ins.", "Codice contratto", "Data Registrazione", "Data Attivazione", "Stato"];
        const rows = visibleData.map(r => [
            r.venditore, r.brand, ((r.raw?.dettagli as Record<string, unknown>)?.categoria_catalogo as string) || (r.raw?.categoria as string) || "", r.prodotto, (r.raw?.offerta as string) || ((r.raw?.dettagli as Record<string, unknown>)?.Offerta as string) || "", r.cliente, r.negozio, codInsDi(r), r.codice_attivazione, r.data_registrazione, r.data_attivazione, r.stato
        ].map(val => `"${String(val ?? "").replace(/"/g, '""')}"`).join(","));
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

    // Apre il contratto della richiesta anche se NON e' nella pagina corrente
    // (lo carica dal DB): nel dettaglio i campi richiesti sono evidenziati.
    const openContractById = async (id: string) => {
        const hit = contractList.find(c => c.id === id);
        if (hit) { openContract(hit, "view"); return; }
        const { data } = await supabase.from("contracts")
            .select("*, clients(nome, cognome, ragione_sociale, cellulare, telefono_fisso, email, cf_piva, indirizzo, cap, citta, tipo, nome_ref, cognome_ref)")
            .eq("id", id).maybeSingle();
        if (!data) { alert("Contratto " + id + " non trovato."); return; }
        openContract(mapContractToRow(data as any, (data as any).clients), "view");
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
        // Regola Luca 25/07: OGNI richiesta che prevede autorizzazione DEVE avere
        // il motivo compilato — senza, non parte.
        if (!reqNote.trim()) { setReqMsg("Il motivo della modifica è obbligatorio: spiega cosa correggi e perché."); return; }
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
        // Richiesta di CANCELLAZIONE (changes.__delete): approvare = eliminare la
        // pratica (gli allegati cadono in cascata; la richiesta resta per lo storico).
        if (approve && (req.changes || {}).__delete) {
            const { error: dErr } = await supabase.from("contracts").delete().eq("id", req.contract_id);
            if (dErr) { setReqBusy(null); alert("Contratto NON eliminato: " + dErr.message); return; }
            await supabase.from("contract_change_requests").update({ status: "rejected", review_note: "Contratto eliminato", reviewed_by_name: user?.name || "—", reviewed_at: new Date().toISOString() }).eq("contract_id", req.contract_id).eq("status", "pending").neq("id", req.id);
        } else if (approve) {
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
                .select("*, clients(nome, cognome, ragione_sociale, cellulare, telefono_fisso, email, cf_piva, indirizzo, cap, citta, tipo, nome_ref, cognome_ref)")
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
                    <h2 className="text-3xl font-bold text-white mb-2">Ricerca Vendite</h2>
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
                    <h2 className="text-3xl font-bold text-white mb-2">Ricerca Vendite</h2>
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
            {/* Segnalazione 80: se il periodo scelto non ha contratti, le tessere
                sparivano del tutto e sembrava che i loghi non comparissero. Ora
                si spiega il motivo invece di lasciare il vuoto. */}
            {brandCounts.length === 0 && (daDataAttivazione || aDataAttivazione) && (
                <div className="mb-8 text-center text-sm text-slate-500">
                    Nessun contratto nel periodo selezionato: per questo non compare nessun brand.
                </div>
            )}
            {brandCounts.length > 0 && (
                /* Tessere su UNA riga (si dividono lo spazio) a selezione POSITIVA —
                   stessa logica della sezione caller (richiesta Luca 27/07). */
                <div className="flex gap-3 mb-8">
                    {brandCounts.map(({ brand, n }) => {
                        const isExtra = _isExtraBrand(brand);
                        const active = selBrands.size === 0 ? !isExtra : selBrands.has(brand);
                        const logo = BRAND_LOGO[brand];
                        return (
                            <button key={brand}
                                onClick={() => {
                                    setSelBrands((p) => {
                                        if (p.size === 0) return new Set([brand]);       // primo click: solo lui
                                        const nx = new Set(p);
                                        if (nx.has(brand)) nx.delete(brand); else nx.add(brand);
                                        // selezione identica al default (tutte le non-extra) → torna al default
                                        const nonExtra = brandCounts.map((b) => b.brand).filter((b) => !_isExtraBrand(b));
                                        if (nx.size === nonExtra.length && nonExtra.every((b) => nx.has(b))) return new Set<string>();
                                        return nx;
                                    });
                                    setPage(1);
                                }}
                                title={selBrands.size === 0 ? `Filtra solo ${brand}` : active ? `${brand} nel filtro — clicca per toglierlo` : `Aggiungi ${brand} al filtro`}
                                className={cn("flex-1 min-w-0 flex flex-col items-center justify-center gap-2 rounded-2xl border px-3 py-4 transition-all",
                                    active
                                        ? "border-indigo-400/80 bg-indigo-500/20 ring-1 ring-indigo-400/40 shadow-lg shadow-indigo-500/25 brightness-110"
                                        : "border-white/15 bg-white/[0.05] opacity-70 grayscale-[60%] hover:opacity-90 hover:grayscale-[30%]")}>
                                <span className="h-12 flex items-center justify-center" title={brand}>
                                    {isExtra ? <span className="text-4xl">💰</span>
                                        : logo ? <img src={logo} alt={brand} className="h-12 w-auto max-w-full object-contain" />
                                            : <span className="text-base font-bold text-slate-200 truncate max-w-full">{brand}</span>}
                                </span>
                                <span className="text-[11px] text-slate-400 tabular-nums leading-none">{n} {isExtra ? "vendite" : "contratti"}</span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Cestino contratto: conferma (diretta) o richiesta (store manager) */}
            {delTarget && (
                <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                    <div className="glass-card w-full max-w-md shadow-2xl">
                        <div className="p-5 border-b border-white/10 flex items-center justify-between">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2"><Trash2 className="w-5 h-5 text-rose-400" /> {canDeleteDirect ? "Elimina contratto" : "Richiesta di eliminazione"}</h3>
                            <button onClick={() => setDelTarget(null)} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/10"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-5 space-y-3">
                            <div className="text-sm text-slate-300">
                                <span className="font-mono text-indigo-300">{delTarget.id}</span> · <b className="text-white">{delTarget.brand}</b> · {delTarget.prodotto} · {delTarget.cliente || "—"}
                            </div>
                            {canDeleteDirect ? (
                                <p className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">Azione definitiva: la pratica sparisce da Ricerca e Tracking insieme ai suoi allegati. Non si può annullare.</p>
                            ) : (
                                <>
                                    <label className="block text-sm font-medium text-slate-300">Motivo dell&apos;eliminazione <span className="text-rose-400">*</span></label>
                                    <textarea className="glass-input w-full min-h-[90px] resize-y text-sm" placeholder="Es. pratica duplicata / inserita per errore…"
                                        value={delMotivo} onChange={e => setDelMotivo(e.target.value)} />
                                    <p className="text-xs text-slate-500">La pratica sarà eliminata solo dopo l&apos;approvazione dell&apos;amministrazione (arriva anche nel fulmine ⚡).</p>
                                </>
                            )}
                            {delMsg && <div className={cn("text-sm font-medium", delMsg.startsWith("✅") ? "text-emerald-400" : "text-rose-300")}>{delMsg}</div>}
                        </div>
                        <div className="p-5 border-t border-white/10 flex justify-end gap-3">
                            <button onClick={() => setDelTarget(null)} className="px-5 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-white/10">Annulla</button>
                            <button onClick={eseguiEliminazione} disabled={delBusy}
                                className="px-6 py-2 rounded-lg text-sm font-bold bg-rose-500/20 border border-rose-500/50 text-rose-300 hover:bg-rose-500/30 disabled:opacity-50">
                                {delBusy ? "Attendere…" : canDeleteDirect ? "Elimina definitivamente" : "Invia richiesta"}
                            </button>
                        </div>
                    </div>
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
                                            <b className="text-white">{r.requested_by_name || "\u2014"}</b> chiede di {(r.changes || {}).__delete ? <b className="text-rose-300">ELIMINARE</b> : "modificare"} il contratto{" "}
                                            <button className="font-mono text-indigo-300 hover:underline"
                                                onClick={() => openContractById(r.contract_id)}
                                                title="Apri il contratto (i campi richiesti sono evidenziati)">{r.contract_id}</button>
                                            <span className="text-slate-500"> · {new Date(r.created_at).toLocaleString("it-IT")}</span>
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
                                        {(r.changes || {}).__delete && (
                                            <div className="text-xs font-bold text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
                                                ❌ Richiesta di CANCELLAZIONE della pratica{(r.changes?.__meta?.note) ? ` — motivo: “${r.changes.__meta.note}”` : ""} · approvare = eliminare definitivamente
                                            </div>
                                        )}
                                        {!(r.changes || {}).__delete && r.changes?.__meta?.note && (
                                            <div className="text-xs text-slate-300 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2">
                                                📝 <b>Motivo:</b> “{r.changes.__meta.note}”
                                            </div>
                                        )}
                                        {Object.entries(r.changes || {}).filter(([k]) => !k.startsWith("__")).map(([k, c]: any) => (
                                            <div key={k} className="text-xs">
                                                <span className="inline-flex flex-wrap items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30">
                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Campo</span>
                                                    <b className="text-white">{c.label}</b>
                                                    <span className="text-slate-500">da</span> <span className="text-slate-300">{fmtVal(c.da)}</span>
                                                    <span className="text-slate-500">a</span> <span className="text-amber-300 font-bold">{fmtVal(c.a)}</span>
                                                </span>
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
                                        if (!row) return <button onClick={() => openContractById(r.contract_id)} className="mt-2 text-xs font-bold text-indigo-300 hover:text-indigo-200 hover:underline">Apri il contratto completo (con i campi richiesti in evidenza) →</button>;
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
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">

                    {/* 1. Venditore */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Venditore</label>
                        <SelectPersona
                            disabled={!canPickVenditore}
                            value={canPickVenditore ? (filterVenditore === "Tutti" ? "" : filterVenditore) : (lockedVenditore || "")}
                            onChange={(v) => setFilterVenditore(v || "Tutti")}
                            opzioni={[...venditoriTeam, ...venditoriAltri]}
                            placeholder="Tutti — scrivi per filtrare"
                            className="glass-input w-full"
                        />
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

                    {/* 6. Negozio di attivazione — la tendina offre SOLO i negozi visibili
                        all'utente (uniqueNegozi arriva dalla query gia' filtrata RBAC), quindi
                        chi ha piu' negozi in visibilita' puo' passare dall'uno all'altro.
                        Prima era disabled e inchiodata sul primary_store. */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Negozio di attivazione</label>
                        {/* Tendina unificata (Luca 30/07): "Tutti" resta il valore-sentinella storico */}
                        <SelectOpzioni
                            value={filterNegozio === "Tutti" ? "" : filterNegozio}
                            onChange={(v) => setFilterNegozio(v || "Tutti")}
                            opzioni={uniqueNegozi}
                            placeholder={(isGlobalView ? "Tutti i negozi" : "Tutti i miei negozi") + " — scrivi per filtrare"}
                            className="glass-input w-full text-sm"
                        />
                    </div>

                    {/* 7. Codice di inserimento */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Codice di inserimento</label>
                        {/* Segnalazione 53: tendina dei codici di inserimento (Cod.Ins.),
                            suddivisi per brand; se un brand e' selezionato mostra solo i suoi. */}
                        <SelectOpzioni
                            value={filterCodiceAttivazione}
                            onChange={setFilterCodiceAttivazione}
                            opzioni={[...new Set(filterBrand ? (codeByBrand[filterBrand] || []) : Object.values(codeByBrand).flat())]}
                            placeholder="Tutti i codici — scrivi per filtrare"
                            className="glass-input w-full text-sm"
                        />
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

                {/* FILA CATALOGO (Luca 28/07): categoria → prodotto → offerta → opzioni
                    su una riga tutta loro — sono filtri in successione. */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mt-6 pt-6 border-t border-white/5">
                    {/* 4-bis. Categoria (dal catalogo): sempre in fila — con la sola
                        Marginalità si spegne (per lei c'è la riga sotto). */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Categoria {catalogoBrand && soloBrandLabel && <span className="text-slate-500 font-normal">— {soloBrandLabel}</span>}</label>
                        {/* CONSEGUENZIALITÀ: cambiare categoria azzera prodotti e
                            offerte (che si restringono alla nuova categoria). */}
                        <SelectOpzioni
                            value={filterCategoria} disabled={soloMarg}
                            onChange={(v) => { setFilterCategoria(v); setFilterProdotti([]); setProdPick(""); setFilterOfferte([]); setOffPick(""); setFilterOpzioni([]); setOpzPick(""); }}
                            opzioni={catalogoBrand ? catalogoBrand.catNames : catNomiAll}
                            placeholder={soloMarg ? "Per la Marginalità: riga sotto" : "Tutte le categorie — scrivi per filtrare"}
                            className="glass-input w-full text-sm disabled:opacity-50"
                        />
                    </div>

                    {/* 5. Prodotto (multiplo, dal CATALOGO): serve UN solo brand attivo
                        dalle tessere, altrimenti le variabili esplodono (regola Luca). */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Prodotto {soloBrandLabel && <span className="text-slate-500 font-normal">— {soloBrandLabel}</span>}</label>
                        {/* selezione IMMEDIATA (via il "+": Luca 28/07, "le offerte non
                            seguivano il prodotto" — in realtà serviva il click sul +);
                            la lista segue la categoria scelta. */}
                        <SelectMulti
                            values={filterProdotti} onChange={setFilterProdotti}
                            opzioni={catalogoBrand ? (filterCategoria ? (catalogoBrand.prodsByCat[filterCategoria] || []) : catalogoBrand.prodNames) : []}
                            disabled={!catalogoBrand}
                            placeholder={!catalogoBrand ? "Seleziona un solo brand dalle tessere" : "Tutti i prodotti — scrivi per filtrare"}
                            className="glass-input w-full text-sm"
                        />
                    </div>

                    {/* 5-bis. Offerta (multiplo, dal CATALOGO): stessa regola del prodotto;
                        se ci sono prodotti selezionati offre solo le loro offerte. */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Offerta {soloBrandLabel && <span className="text-slate-500 font-normal">— {soloBrandLabel}</span>}</label>
                        <SelectMulti
                            values={filterOfferte} onChange={setFilterOfferte}
                            opzioni={offerteDisponibili}
                            disabled={!catalogoBrand}
                            placeholder={!catalogoBrand ? "Seleziona un solo brand dalle tessere" : "Tutte le offerte — scrivi per filtrare"}
                            className="glass-input w-full text-sm"
                        />
                    </div>
                    {/* OPZIONI (Luca 28/07): si sbloccano dopo l'offerta; multi. */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Opzioni {soloBrandLabel && <span className="text-slate-500 font-normal">— {soloBrandLabel}</span>}</label>
                        <SelectMulti
                            values={filterOpzioni} onChange={setFilterOpzioni}
                            opzioni={opzioniDisponibili}
                            disabled={!catalogoBrand || !filterOfferte.length}
                            placeholder={!catalogoBrand ? "Seleziona un solo brand dalle tessere" : !filterOfferte.length ? "Prima scegli un'offerta" : "Tutte le opzioni — scrivi per filtrare"}
                            className="glass-input w-full text-sm"
                        />
                    </div>
                </div>

                {/* RIGA MARGINALITÀ (Luca 29/07): filtri suoi, su una riga separata
                    sotto la fila catalogo — attivi con la sola tessera Marginalità. */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mt-4">
                    {/* MARGINALITÀ layer 1 (Luca 28/07): il flusso si divide in
                        prodotti e servizi (dal kind delle categorie del listino). */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Tipo <span className="text-slate-500 font-normal">— Marginalità</span></label>
                        <select className="glass-input w-full disabled:opacity-50" value={margTipo} disabled={!soloMarg}
                            onChange={e => { setMargTipo(e.target.value as "" | "prodotti" | "servizi"); setMargArticoli([]); setMargPick(""); }}>
                            <option value="">{soloMarg ? "Prodotti e servizi" : "Clicca la sola tessera Marginalità"}</option>
                            <option value="prodotti">🛍 Prodotti</option>
                            <option value="servizi">🛠 Servizi</option>
                        </select>
                    </div>

                    {/* MARGINALITÀ layer 2: gli articoli del listino del tipo scelto
                        (multi, come i prodotti del catalogo). */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Articolo <span className="text-slate-500 font-normal">— Marginalità</span></label>
                        <SelectMulti
                            values={margArticoli} onChange={setMargArticoli}
                            opzioni={margArticoliDisponibili}
                            disabled={!soloMarg || !margTipo}
                            placeholder={!soloMarg ? "Clicca la sola tessera Marginalità" : !margTipo ? "Prima scegli Prodotti o Servizi" : `Tutti i ${margTipo} — scrivi per filtrare`}
                            className="glass-input w-full text-sm"
                        />
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
                </div>

                {/* CTA Buttons */}
                <div className="mt-8 flex gap-3">
                    <button type="button" className="primary-btn h-10 px-8 text-sm" onClick={() => { setFilterVenditore(""); setFilterCodice(""); setFilterBrand(""); setFilterProdotti([]); setProdPick(""); setFilterCategoria(""); setFilterOfferte([]); setOffPick(""); setFilterOpzioni([]); setOpzPick(""); setMargTipo(""); setMargArticoli([]); setMargPick(""); setFilterNegozio(""); setFilterCodiceAttivazione(""); setFilterCliente(""); setFilterCellulare(""); setFilterImei(""); setDaDataAttivazione(""); setADataAttivazione(""); }}>Annulla filtri</button>
                    <button type="button" className="px-8 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-semibold hover:bg-emerald-500/20 transition-all flex items-center gap-2" onClick={handleExportCsv}>
                        Scarica CSV
                    </button>
                </div>
            </div>

            {/* Results Table */}
            <div className="glass-card overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-slate-400">Caricamento contratti...</div>
                ) : (
                    <div className="overflow-x-auto w-full">
                        <table className="w-full text-left text-sm text-slate-300">
                            <thead className="bg-white/[0.03] text-xs uppercase text-slate-400">
                                <tr>
                                    <th className="px-4 py-4 font-semibold">Venditore</th>
                                    <th className="px-4 py-4 font-semibold">Brand</th>
                                    <th className="px-4 py-4 font-semibold">Categoria</th>
                                    <th className="px-4 py-4 font-semibold">Prodotto</th>
                                    <th className="px-4 py-4 font-semibold">Offerta</th>
                                    <th className="px-4 py-4 font-semibold">Cliente</th>
                                    <th className="px-4 py-4 font-semibold">Negozio</th>
                                    {/* Segnalazione 76: "Codice Attivazione" si chiama Codice
                                        contratto; prima di esso la colonna Codice ins. */}
                                    <th className="px-4 py-4 font-semibold">Codice ins.</th>
                                    <th className="px-4 py-4 font-semibold">Codice contratto</th>
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
                                        {/* Segnalazione 95: colonna Categoria (badge, asse 2) + Prodotto (asse 3). */}
                                        {/* la categoria FINE del catalogo (Wallet ≠ Ric. Auto); colore della macro */}
                                        <td className="px-4 py-3">{(() => { const d = categoriaDef((row.raw?.categoria_macro as string) || categoriaDi(row.brand, row.raw?.categoria as string, row.prodotto)); const fine = ((row.raw?.dettagli as Record<string, unknown>)?.categoria_catalogo as string) || d.label; return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap" style={{ color: d.color, borderColor: d.color + "55", backgroundColor: d.color + "18" }}>{fine}</span>; })()}</td>
                                        <td className="px-4 py-3 text-slate-300">{row.prodotto}</td>
                                        <td className="px-4 py-3 text-slate-400 text-xs">{String((row.raw?.offerta as string) || ((row.raw?.dettagli as Record<string, unknown>)?.Offerta as string) || "—")}</td>
                                        <td className="px-4 py-3 text-slate-300 font-medium">{row.cliente}</td>
                                        <td className="px-4 py-3 text-slate-400 text-xs">{row.negozio}</td>
                                        <td className="px-4 py-3 text-slate-400 text-xs">{codInsDi(row) || "—"}</td>
                                        <td className="px-4 py-3 text-slate-400 font-mono text-xs">{row.codice_attivazione}</td>
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
                                                {!["extra", "marginalità", "marginalita"].includes(String(row.brand || "").trim().toLowerCase()) && <button
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
                                                {canDeleteButton && (
                                                    <button onClick={() => { setDelTarget(row); setDelMotivo(""); setDelMsg(""); }}
                                                        className="p-1.5 rounded bg-rose-500/15 text-rose-400 hover:bg-rose-500/25 transition-colors"
                                                        title={canDeleteDirect ? "Elimina contratto" : "Richiedi eliminazione (approvazione amministrazione)"}>
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {visibleData.length === 0 && (
                                    <tr>
                                        <td colSpan={12} className="px-4 py-8 text-center text-slate-500">
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
                // Segnalazione 67/71: il codice di inserimento vive nei dettagli ma si
                // mostra (e si modifica) nel box "Dati contratto". La chiave cambia da
                // brand a brand: uso quella davvero presente, altrimenti la standard.
                const codInsKey = (() => {
                    const d = (row.raw?.dettagli as Record<string, unknown>) || {};
                    if (d["Cod.Ins."] !== undefined) return "Cod.Ins.";
                    return Object.keys(d).find(k => /^cod\.?\s?ins/i.test(k)) ?? "Cod.Ins.";
                })();
                // esclusa dai "Dettagli" per non averla due volte
                const detEditable = det.filter(([k, v]) => k !== codInsKey && (v === null || typeof v !== "object"));
                const detReadonly = det.filter(([, v]) => v !== null && typeof v === "object");
                // SOLO le richieste di QUESTO contratto (prima contava tutte le pendenti)
                const pendingForThis = contractReqs.filter(r => r.status === "pending" && r.contract_id === row.id);
                // campi con richiesta in corso -> evidenziati nel dettaglio
                const pendingKeys = pendingForThis.flatMap(r => Object.keys(r.changes || {}).filter(k => !k.startsWith("__")));
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
                    if (k === "contract::brand") return BRAND_CANONICI;  // lista ufficiale: un brand senza vendite (es. TIM) deve comunque esserci
                    if (k === "contract::prodotto") return uniqueProdotti;
                    if (k === "contract::categoria") return CATEGORIE_CANONICHE;  // solo categorie ufficiali, mai valori grezzi tipo "SKY FIBRA"
                    // Segnalazione 71/68: il codice di inserimento va a tendina con i
                    // codici VERI del brand (elenco unico condiviso con Registra
                    // Contratto). Prima si ricavavano dai contratti gia' salvati,
                    // quindi comparivano solo i codici gia' usati (per Kena il solo
                    // "Collatina") e per i brand senza storico non compariva nulla.
                    if (/^dettagli::cod\.?\s?ins/i.test(k)) {
                        return codiciPerBrand(row.brand, uniqueNegozi);
                    }
                    return null;
                };
                const renderField = (k: string, label: string, kind?: string) => {
                    const orig = originalOf(row, k);
                    const inRichiesta = pendingKeys.includes(k);
                    if (detailMode === "view") {
                        return (
                            <div className={inRichiesta ? "rounded-lg ring-2 ring-amber-400/60 bg-amber-400/10 px-2 py-1.5 -mx-2" : undefined}>
                                <span className="text-[11px] uppercase tracking-wider text-slate-500">{label}{inRichiesta && <span className="ml-1.5 text-amber-300 font-bold normal-case">· modifica richiesta</span>}</span>
                                <p className="text-white text-sm break-words">{fmtVal(orig)}</p>
                            </div>
                        );
                    }
                    let val = editValues[k] ?? "";
                    // Categoria: i contratti storici hanno valori grezzi ("MOBILE", "SKY FIBRA");
                    // nella tendina vanno tradotti nella canonica, cosi' la spunta cade sulla
                    // voce giusta e non compare il doppione in fondo.
                    if (k === "contract::categoria" && val && !CATEGORIE_CANONICHE.includes(val)) {
                        val = CANONICA_BY_ID[categoriaDi(String(row.brand || ""), val, String(row.prodotto || ""))];
                    }
                    let origCmp = orig == null ? "" : String(orig);
                    if (k === "contract::categoria" && origCmp && !CATEGORIE_CANONICHE.includes(origCmp)) {
                        origCmp = CANONICA_BY_ID[categoriaDi(String(row.brand || ""), origCmp, String(row.prodotto || ""))];
                    }
                    const changed = origCmp !== val;
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
                                <textarea rows={2} className={cls} autoComplete="off" value={val} onChange={e => setEditValues(prev => ({ ...prev, [k]: e.target.value }))} />
                            ) : (
                                /* autoComplete/name casuale: senza, Chrome riempiva i campi da solo
                                   e li colorava di GIALLO (segnalazione 71). */
                                <input type={kind === "date" ? "date" : "text"} className={cls} value={val}
                                    autoComplete="off" name={`f-${k}`} data-lpignore="true"
                                    onChange={e => setEditValues(prev => ({ ...prev, [k]: e.target.value }))} />
                            )}
                        </div>
                    );
                };

                {/* Segnalazione 92: era un COMPONENTE definito nel render, quindi a ogni
                    battuta cambiava identita' e React rimontava le caselle, facendo
                    perdere il focus (si inseriva un carattere alla volta). Ora e' una
                    funzione che restituisce JSX: nessun rimontaggio, il focus resta. */}
                const Section = (title: string, children: React.ReactNode) => (
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
                                    {/* Segnalazione 81: scorciatoia ai documenti del cliente. Apre la
                                        scheda cliente, dove ci sono gli allegati delle sue pratiche. */}
                                    {!!row.raw?.client_id && (
                                        <a href={`/clienti?id=${encodeURIComponent(String(row.raw.client_id))}`}
                                            title="Apri i documenti di questo cliente"
                                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 flex items-center gap-1.5">
                                            <FileText className="w-3.5 h-3.5" /> Documenti cliente
                                        </a>
                                    )}
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
                                        <div className="space-y-1.5">
                                            <span>
                                                {pendingForThis.length === 1 ? "C'è una richiesta di modifica" : `Ci sono ${pendingForThis.length} richieste di modifica`} in attesa di approvazione — i campi interessati sono evidenziati qui sotto.
                                            </span>
                                            {pendingForThis.map((pr: any) => (
                                                <div key={pr.id} className="text-xs text-amber-100/90">
                                                    <b>{pr.requested_by_name || "—"}</b>{pr.changes?.__meta?.note ? ` · “${pr.changes.__meta.note}”` : ""}:{" "}
                                                    {Object.entries(pr.changes || {}).filter(([k]) => !k.startsWith("__")).map(([k, c]: any) => `${c.label}: ${fmtVal(c.da)} → ${fmtVal(c.a)}`).join(" · ") || (pr.changes?.__delete ? "richiesta di cancellazione" : "")}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {detailMode === "edit" && (
                                    <div className="rounded-xl border border-indigo-400/30 bg-indigo-400/10 px-4 py-3 text-xs text-indigo-200">
                                        Le modifiche non sono immediate: vengono inviate come richiesta di approvazione all&apos;amministrazione.
                                    </div>
                                )}


                                {(detEditable.length > 0 || detReadonly.length > 0) && (
                                    Section("Dettagli registrazione", <>
                                        {detEditable.map(([k]) => renderField("dettagli::" + k, k))}
                                        {detReadonly.map(([k, v]) => (
                                            <div key={k} className="sm:col-span-2 lg:col-span-3">
                                                <span className="text-[11px] uppercase tracking-wider text-slate-500">{k}</span>
                                                <pre className="text-white text-xs bg-black/30 rounded-lg p-2 overflow-x-auto">{JSON.stringify(v, null, 2)}</pre>
                                            </div>
                                        ))}
                                    </>)
                                )}

                                {Section("Dati contratto", <>
                                    {CONTRACT_FIELDS.map(f => renderField("contract::" + f.key, f.label, f.kind))}
                                    {/* Segnalazione 67/71: il codice inserimento sta nel box Dati
                                        contratto ed e' modificabile come gli altri campi (tendina). */}
                                    {renderField("dettagli::" + codInsKey, "Codice inserimento")}
                                </>)}

                                {Section("Anagrafica cliente", <>
                                    {CLIENT_FIELDS.map(f => renderField("client::" + f.key, f.label, f.kind))}
                                </>)}

                                {Section("Riferimenti sistema", <>
                                    {READONLY_META.map(f => (
                                        <div key={f.key}>
                                            <span className="text-[11px] uppercase tracking-wider text-slate-500">{f.label}</span>
                                            <p className="text-white text-sm font-mono break-all">{fmtVal(row.raw?.[f.key])}</p>
                                        </div>
                                    ))}
                                </>)}

                                {detailMode === "edit" && (
                                    <div className="pt-4 border-t border-white/10 space-y-3">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-400 mb-1">Motivo della modifica <span className="text-rose-400">* obbligatorio</span></label>
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
