"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { SelectOpzioni } from "@/components/SelectPersona";
import { VoceAnnidata } from "@/components/VoceAnnidata";
import { Search, Eye, Edit, Trash2, X, ShieldCheck, Check, Clock, Navigation, FileText, ChevronDown } from "lucide-react";
import { cn } from "@/utils";
import { DatePickerInput } from "@/components/DatePickerInput";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { CATEGORIE_CANONICHE, CANONICA_BY_ID, BRAND_CANONICI, MACRO_BY_CATALOGO, categoriaDef, categoriaDi, controlliDi, vaInTracking } from "@/lib/tassonomia";
import { LABEL_SLUG, loadCatalogoBrand, loadCatalogoCategorie, loadMargListino, unisciCataloghi, type CatFiltro, type MargArticolo } from "@/lib/catalogoFiltri";
import { risolviCampi, impostaRegoleCampi } from "@/lib/campiRegole";
import { useActiveStores } from "@/lib/org";
import { trkBrandKey, TRK_BRAND_LOGOS, TRK_LOGO_SCALE } from "@/lib/brandAssets";
import { caricaTutte } from "@/lib/fetchTutte";
import { seesWholeStore } from "@/lib/roles";
import { useVisibleStores, negozioInValues, sameStore } from "@/lib/visibleStores";
import { codiciPerBrand } from "@/lib/codiciInserimento";
import { scaricaXlsx, type CellaXlsx } from "@/lib/exportXlsx";
import { useRolePermissions } from "@/lib/usePermissions";
import { capChoice, CAP_RICERCA_MODIFICA } from "@/lib/capabilities";
import { trovaAppuntamentoDaAgganciare, agganciaVenditaAppuntamento } from "@/lib/matchAppuntamento";

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
    // RIC-03: l'offerta di catalogo era l'unica colonna né visibile né
    // modificabile dal dettaglio; tendina dalle offerte del prodotto scelto.
    { key: "offerta", label: "Offerta" },
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

// RIC-05 (Luca 05/08): il modale si riorganizza in sezioni richiudibili.
// Questi campi contratto stanno nella sezione 🏪 ATTRIBUZIONE & DETTAGLI
// (chi/dove/quando, insieme a Cod.Ins. e ai Dettagli registrazione); il resto
// dei CONTRACT_FIELDS resta nella sezione 📄 DATI DEL CONTRATTO.
const ATTRIB_KEYS = ["venditore", "negozio", "data_registrazione", "data_attivazione", "data"];

// Sezione 📎 ALLEGATI: righe di contract_attachments (bucket storage "contracts")
type Allegato = { id: string; file_url: string; file_name: string; file_type: string | null; created_at: string | null };
const ALLEGATO_EMOJI: Record<string, string> = { documento: "🪪", contratti: "📄", fattura: "🧾" };

const READONLY_META: EditField[] = [
    { key: "id", label: "Codice contratto" },
    { key: "client_id", label: "ID cliente" },
    { key: "created_at", label: "Creato il" },
    { key: "delegated_to", label: "Delegato a" },
    { key: "delegated_by", label: "Delegato da" },
];

// Segnalazione 57: logo per ogni brand nelle tessere di riepilogo.
// RIC-01: mappa loghi/scala condivisa col Tracking (src/lib/brandAssets),
// lookup per chiave normalizzata trkBrandKey — via la copia locale divergente.

const STATI = ["Attivo", "In lavorazione", "Attivato", "Sospeso", "Annullato"];

function fmtVal(v: unknown): string {
    if (v === null || v === undefined || v === "") return "—";
    if (typeof v === "boolean") return v ? "Si" : "No";
    if (typeof v === "object") return JSON.stringify(v);
    // stringhe JSON di OPZIONI (contract::opzioni nelle richieste/riepiloghi):
    // mai JSON grezzo a schermo, chi approva deve capire cosa cambia
    if (typeof v === "string" && v.startsWith("[")) {
        try {
            const a = JSON.parse(v);
            if (Array.isArray(a) && a.every((o) => o && typeof o === "object" && "nome" in o)) {
                return a.length ? a.map((o: { nome?: string; quantita?: number | null }) => String(o.nome || "") + (o.quantita && Number(o.quantita) > 1 ? ` ×${o.quantita}` : "")).join(", ") : "—";
            }
        } catch { /* non era il JSON delle opzioni */ }
    }
    return String(v);
}

// RIC-03: opzioni della vendita (jsonb [{nome, quantita}]) in forma leggibile.
// quantita null = 1 (cosi' le scrive il Registra), quindi si mostra solo se >1.
function fmtOpzioni(v: unknown): string {
    if (!Array.isArray(v) || v.length === 0) return "—";
    return v.map((o: { nome?: unknown; quantita?: unknown }) => {
        const q = Number(o?.quantita ?? 1);
        return String(o?.nome ?? "—") + (q > 1 ? ` ×${q}` : "");
    }).join(" · ");
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

// ── RIC-06 (Luca 05/08): TENDINA MULTI-SELEZIONE per i filtri della pagina ──
// Convenzione unica: values === null → TUTTO selezionato (default, NESSUN
// filtro: si vede anche lo storico fuori dalle opzioni note); array → insieme
// scelto; array VUOTO → nessuna voce spuntata = ZERO risultati. Spuntare di
// nuovo TUTTE le voci ricompatta a null. In testa "Seleziona/Deseleziona
// tutto"; sul bottone la chip riassuntiva ("Tutti" / nome se 1 / "N selezionati").
// Componente a livello di MODULO, mai definito dentro la pagina (regola
// segnalazione 71: identita' stabile, niente rimontaggi/perdita di focus).
// Menu in PORTAL come SelectPersona (i glass-panel creano stacking context
// separati e lo z-index interno non basta — Luca 30/07).
function FiltroMulti({ values, onChange, opzioni, className = "", disabled = false,
    etichettaTutti = "Tutti", testoDisabilitato, etichette }: {
    values: string[] | null;
    onChange: (v: string[] | null) => void;
    opzioni: readonly string[];
    className?: string;
    disabled?: boolean;
    etichettaTutti?: string;          // chip nello stato "tutto selezionato"
    testoDisabilitato?: string;       // chip quando la tendina e' spenta (motivo)
    etichette?: Record<string, string>; // valore → etichetta visuale (es. tipi marginalità)
}) {
    const [aperta, setAperta] = useState(false);
    const [testo, setTesto] = useState("");
    const box = useRef<HTMLDivElement | null>(null);
    const menu = useRef<HTMLDivElement | null>(null);
    const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

    // chiusura al click fuori (campo E tendina: la tendina sta nel portal) + Esc
    useEffect(() => {
        if (!aperta) return;
        const h = (e: MouseEvent) => {
            const t = e.target as Node;
            if (box.current && !box.current.contains(t) && !(menu.current && menu.current.contains(t))) {
                setAperta(false); setTesto("");
            }
        };
        const k = (e: KeyboardEvent) => { if (e.key === "Escape") { setAperta(false); setTesto(""); } };
        document.addEventListener("mousedown", h);
        document.addEventListener("keydown", k);
        return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
    }, [aperta]);

    // posizione della tendina agganciata al campo, viva su scroll/resize
    useEffect(() => {
        if (!aperta) { setPos(null); return; }
        const update = () => {
            const r = box.current?.getBoundingClientRect();
            if (r) setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 230) });
        };
        update();
        window.addEventListener("scroll", update, true);
        window.addEventListener("resize", update);
        return () => { window.removeEventListener("scroll", update, true); window.removeEventListener("resize", update); };
    }, [aperta]);

    const tutte = values === null;
    const visuale = (o: string) => etichette?.[o] ?? o;
    const spuntata = (o: string) => tutte || (values as string[]).includes(o);
    const toggle = (o: string) => {
        // Luca 10/08: dallo stato "tutte" il click ELEGGE la voce a unico
        // filtro attivo (prima la toglieva dall'insieme — controintuitivo);
        // con un sottoinsieme già scelto resta il toggle classico
        if (values === null) { onChange([o]); return; }
        const next = values.includes(o) ? values.filter((x) => x !== o) : [...values, o];
        onChange(opzioni.length > 0 && opzioni.every((x) => next.includes(x)) ? null : next);
    };

    const chip = disabled ? (testoDisabilitato ?? etichettaTutti)
        : tutte ? etichettaTutti
        : values.length === 0 ? "Nessuno selezionato"
        : values.length === 1 ? visuale(values[0])
        : `${values.length} selezionati`;

    // ricerca interna (stesso match di SelectPersona: inclusione o iniziali)
    const q = testo.trim().toLowerCase();
    const filtrate = !q ? opzioni : opzioni.filter((n) => {
        const nome = (visuale(n) + " " + n).toLowerCase();
        if (nome.includes(q)) return true;
        const parole = nome.split(/\s+/);
        return q.split(/\s+/).every((t) => parole.some((p) => p.startsWith(t)));
    });

    const menuBody = pos ? (
        <div ref={menu}
            className="select-persona-menu fixed z-[4000] rounded-xl border border-white/15 bg-[#161a2c] shadow-2xl shadow-black/60 overflow-hidden"
            style={{ top: pos.top, left: pos.left, width: pos.width }}>
            <button type="button"
                onMouseDown={(e) => { e.preventDefault(); onChange(tutte ? [] : null); }}
                className="w-full text-left px-3.5 py-2.5 text-xs font-bold uppercase tracking-wider text-indigo-300 hover:bg-indigo-500/20 border-b border-white/10">
                {tutte ? "Deseleziona tutto" : "Seleziona tutto"}
            </button>
            {opzioni.length > 8 && (
                <div className="p-2 border-b border-white/10">
                    <input value={testo} onChange={(e) => setTesto(e.target.value)}
                        placeholder="Scrivi per filtrare…" autoFocus
                        className="glass-input w-full text-sm" />
                </div>
            )}
            <div className="max-h-64 overflow-y-auto divide-y divide-white/5">
                {filtrate.length > 0 ? filtrate.map((n) => {
                    const sel = spuntata(n);
                    return (
                        <button key={n} type="button"
                            onMouseDown={(e) => { e.preventDefault(); toggle(n); }}
                            className={`w-full text-left px-3.5 py-2.5 text-sm transition-colors hover:bg-indigo-500/20 flex items-center gap-2 ${sel ? "text-indigo-300 font-bold" : "text-slate-100"}`}>
                            <span className={`w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center text-[9px] ${sel ? "border-indigo-400 bg-indigo-500/40" : "border-slate-600"}`}>{sel ? "✓" : ""}</span>
                            <span className="truncate">{visuale(n)}</span>
                        </button>
                    );
                }) : (
                    <div className="px-3.5 py-2.5 text-sm text-slate-500">Nessuna voce corrispondente</div>
                )}
            </div>
        </div>
    ) : null;

    return (
        <div ref={box} className="relative">
            <button type="button" disabled={disabled} onClick={() => setAperta((v) => !v)}
                className={(className || "glass-input w-full text-sm") + " flex items-center justify-between gap-2 text-left disabled:opacity-50"}>
                <span className={"truncate " + (disabled || tutte ? "text-slate-400" : "text-white font-semibold")}>{chip}</span>
                <ChevronDown className={"w-4 h-4 shrink-0 text-slate-400 transition-transform " + (aperta ? "rotate-180" : "")} />
            </button>
            {aperta && !disabled && typeof document !== "undefined" && menuBody && createPortal(menuBody, document.body)}
        </div>
    );
}

// chiave stabile per le dipendenze degli effect: null ("tutto") ≠ [] ("niente")
const kMulti = (v: string[] | null) => (v === null ? "*" : v.join("|"));

// ── RIC-06 v2 (Luca 05/08, secondo giro): badge sull'ANGOLO VISIVO del logo ──
// Il primo tentativo (top:0 + offset orizzontale riscalato) piazzava il
// numeretto sul SOFFITTO della tessera, lontano dal logo (screenshot Luca ore
// 15:44). Ora niente offset calibrati: si misura il riquadro VISIVO reale del
// logo con getBoundingClientRect — che tiene conto anche della scala ottica
// transform — e il badge si incolla alla sua spalla destra in alto, a ogni
// larghezza. Rimisurato da ResizeObserver su logo e contenitore (+load).
// Componente a livello di modulo (regola segnalazione 71).
function LogoConBadge({ brand, logo, n }: { brand: string; logo: string; n: number }) {
    const box = useRef<HTMLSpanElement | null>(null);
    const img = useRef<HTMLImageElement | null>(null);
    const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
    useEffect(() => {
        const el = img.current, cont = box.current;
        if (!el || !cont) return;
        const misura = () => {
            const r = el.getBoundingClientRect(), c = cont.getBoundingClientRect();
            if (r.width === 0 || c.width === 0) return;
            setPos({
                // spalla destra del logo, col badge un filo sovrapposto; mai
                // oltre il bordo della tessera né sopra il suo tetto
                left: Math.min(r.right - c.left - 8, c.width - 26),
                top: Math.max(0, r.top - c.top - 7),
            });
        };
        misura();
        const ro = new ResizeObserver(misura);
        ro.observe(el); ro.observe(cont);
        el.addEventListener("load", misura);   // dimensioni note solo a immagine caricata
        return () => { ro.disconnect(); el.removeEventListener("load", misura); };
    }, [logo]);
    const key = trkBrandKey(brand);
    const colBadge = "var(--tf-94a3b8)";   // neutro, come il Tracking a riposo
    return (
        /* stesso box logo del Tracking (72px, logo 56 + scala ottica per brand) */
        <span ref={box} className="relative h-[72px] w-full flex items-center justify-center" title={brand}>
            <img ref={img} src={logo} alt={brand}
                style={{ maxHeight: 56, maxWidth: "92%", objectFit: "contain", display: "block", transform: `scale(${TRK_LOGO_SCALE[key] || 1})` }} />
            {/* fondo SOLIDO perche' i loghi sbordano (scala ottica); compare
                solo a misura fatta, niente flash nel posto sbagliato */}
            {pos && (
                <span className="absolute text-[11px] font-black leading-none px-1.5 py-[3px] rounded-full"
                    style={{ left: pos.left, top: pos.top, zIndex: 1, color: colBadge, background: "var(--tf-0d1424)", border: `1px solid ${colBadge}66`, opacity: n === 0 ? .5 : 1 }}>
                    {n}
                </span>
            )}
        </span>
    );
}

export default function RicercaContratto() {
    const { user } = useAuth();
    const [contractList, setContractList] = useState<ContrattoRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    // Filter state — RIC-06 (Luca 05/08): TUTTE le tendine sono multi-selezione
    // (FiltroMulti). Convenzione: null = tutto selezionato (nessun filtro,
    // default); array = insieme scelto; array vuoto = zero risultati.
    const [filterVenditori, setFilterVenditori] = useState<string[] | null>(null);
    const [filterCodice, setFilterCodice] = useState("");
    const [filterBrand, setFilterBrand] = useState("");
    // Filtro prodotto multiplo (richiesta Luca #7): piu' prodotti dello stesso brand insieme.
    const [filterProdotti, setFilterProdotti] = useState<string[] | null>(null);
    // ── FILTRI DAL CATALOGO (regole Luca 28/07): categoria sempre filtrabile;
    //    prodotto e offerta SOLO con un brand solo selezionato dalle tessere
    //    (altrimenti "milioni di variabili"); entrambi MULTI-selezione.
    //    Le liste arrivano da catalog_* (incluse le voci spente: lo storico
    //    le contiene), non piu' dai distinct dello storico.
    const [filterCategorie, setFilterCategorie] = useState<string[] | null>(null);
    // MOD-30 (Luca 10/08): tipologia cliente PRIMA della categoria. Filtra su
    // contracts.tipo_cliente ('Consumer'/'Business' — backfill 10/08 dal
    // clients.tipo per le righe storiche nate senza).
    const [filterTipoCliente, setFilterTipoCliente] = useState<string[] | null>(null);
    const [filterOfferte, setFilterOfferte] = useState<string[] | null>(null);
    // OPZIONI (Luca 28/07): quarto anello della catena — si sbloccano dopo
    // l'offerta; multi, match sul jsonb contracts.opzioni [{nome,quantita}]:
    // la vendita deve contenerle TUTTE (@>), come da regola originaria.
    const [filterOpzioni, setFilterOpzioni] = useState<string[] | null>(null);
    // catNames = categorie del CATALOGO che il brand vende davvero (in ordine
    // di catalogo, Wallet e Ric. Auto SEPARATE — Luca 28/07: non c'è altro modo
    // di distinguere un'offerta wallet da una a ricarica automatica). Il filtro
    // interroga dettagli->>categoria_catalogo (scritto dal registra e
    // backfillato sullo storico); le vendite mobile vecchie SENZA il dato
    // stanno nella voce dedicata "Mobile (storico)".
    // RIC-03: struttura e loader (con cache) vivono in src/lib/catalogoFiltri,
    // condivisi tra questi filtri e il modale di modifica contratto.
    const [catalogoBrand, setCatalogoBrand] = useState<CatFiltro | null>(null);
    // MARGINALITÀ a DUE LAYER (Luca 28/07): prima il TIPO (prodotti/servizi,
    // da marg_categories.kind — Kasko/Servizi sono servizi; SIM/ESIM/Telefono
    // Cash/Prodotti sono prodotti), poi gli ARTICOLI del listino di quel tipo.
    // Attivi solo con la sola tessera Marginalità selezionata.
    const [margTipi, setMargTipi] = useState<string[] | null>(null);
    const [margArticoli, setMargArticoli] = useState<string[] | null>(null);
    const [margListino, setMargListino] = useState<MargArticolo[] | null>(null);
    const [filterNegozi, setFilterNegozi] = useState<string[] | null>(null);
    const [filterCodiciIns, setFilterCodiciIns] = useState<string[] | null>(null);
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
    // MOD-1b (Luca 08/08): carico le regole campi vendita a DB così il modale
    // può ricalcolare i campi che le OPZIONI si portano dietro (senza, userebbe
    // solo il fallback statico). Stessa fonte del pannello Catalogo / Registra.
    useEffect(() => {
        supabase.from("catalog_campi_regole").select("*").order("ordine")
            .then(({ data }) => { if (data) impostaRegoleCampi(data as Parameters<typeof impostaRegoleCampi>[0]); });
    }, []);
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
    // RIC-06 (Luca 05/08): tessere brand in due pezzi — l'ELENCO (con ordine)
    // e' stabile e arriva da fetchFilters (solo RBAC: una tessera filtrata a
    // zero mostra 0 sbiadito, NON sparisce ne' cambia posto); i NUMERI sono i
    // conteggi faceted che seguono i filtri attivi (effect dedicato sotto).
    const [brandBase, setBrandBase] = useState<{ brand: string; n: number }[]>([]);
    const [facetCounts, setFacetCounts] = useState<Record<string, number>>({});
    const brandCounts = useMemo(
        () => brandBase.map(({ brand }) => ({ brand, n: facetCounts[brand] ?? 0 })),
        [brandBase, facetCounts]);
    const [prodByBrand, setProdByBrand] = useState<Record<string, string[]>>({});
    const [codeByBrand, setCodeByBrand] = useState<Record<string, string[]>>({});
    // uniqueProdotti (distinct dello storico) rimosso con RIC-03: la tendina
    // Prodotto del modale ora attinge al catalogo del brand, non allo storico.
    const [uniqueNegozi, setUniqueNegozi] = useState<string[]>([]);
    // BUG NEGOZIO (Luca 05/08): la tendina Negozio del MODALE nasceva da
    // uniqueNegozi (distinct dei contratti), quindi un punto vendita nuovo e
    // ancora senza vendite — caso "Agenzia", creato per attribuire le vendite
    // outbound — non compariva MAI. Nel modale la fonte sono TUTTI i negozi
    // ATTIVI della tabella stores (uffici/Agenzia inclusi) UNITI ai valori
    // storici dei contratti (radici legacy tipo "Magliana"), dedup. I FILTRI
    // di pagina restano su uniqueNegozi: filtrare su un negozio senza vendite
    // non serve a niente.
    const negoziAttivi = useActiveStores();
    const negoziModale = useMemo(
        () => Array.from(new Set([...negoziAttivi, ...uniqueNegozi])).sort(),
        [negoziAttivi, uniqueNegozi]);

    // RBAC: Store-Based Visibility Logic
    // Ruoli reali (roles.ts): la vecchia lista era ancora quella del mock, quindi
    // dev/direttore_generale/amministrativo finivano filtrati sul proprio nome e
    // non vedevano NESSUN contratto.
    // Il "vede tutto" arriva dalla FONTE UNICA della visibilita': per l'amministrativo
    // non basta piu' il ruolo (l'admin puo' restringergli i negozi visibili).
    const { seesAll: isGlobalView, stores: visStores, loaded: visLoaded } = useVisibleStores();
    const wholeStore = seesWholeStore(user?.role);
    // ── RIC-04: la ROTELLINA decide come si modificano le vendite ─────────────
    // Modalità dalla capacità CAP_RICERCA_MODIFICA (diretta / richiesta /
    // nessuna), amministrata da Amministrazione → Utenti → Permessi. Il
    // pannello, quando la si usa, scrive TUTTE le opzioni del gruppo come righe
    // esplicite: quindi "rotellina impostata" = almeno una riga presente.
    // A rotellina VERGINE il perimetro dei bottoni resta quello storico per
    // ruolo (nulla cambia per nessuno); la modalità di SALVATAGGIO segue
    // comunque la capacità, il cui default fotografa la regola di Luca 04/08:
    // amministrativo in su diretta, il resto con autorizzazione.
    const { perms: capPerms } = useRolePermissions(user?.role, user?.grade, user?.id);
    const modRicerca = capChoice(user?.role, CAP_RICERCA_MODIFICA, capPerms);
    // LA ROTELLINA COMANDA SEMPRE (Luca 04/08 sera): niente perimetri storici
    // "a rotellina vergine" — il caso store specialist ha mostrato il paradosso:
    // l'opzione predefinita ("con autorizzazione") risultava selezionata nel
    // pannello ma la pagina applicava la vecchia lista ruoli e la matita non
    // compariva. Ora: default = amministrazione diretta, tutti gli altri con
    // autorizzazione; chi non deve proprio modificare si mette su "Sola
    // consultazione" dalla rotellina (per ruolo o per grado).
    const modificaDiretta = modRicerca === "diretta";
    const canEditContract = modRicerca !== "nessuna";
    const canApprove = modificaDiretta;
    const canDeleteDirect = modificaDiretta;
    const canDeleteButton = modRicerca !== "nessuna";
    const [delTarget, setDelTarget] = useState<any>(null);
    const [delMotivo, setDelMotivo] = useState("");
    const [delBusy, setDelBusy] = useState(false);
    const [delMsg, setDelMsg] = useState("");
    const eseguiEliminazione = async () => {
        if (!delTarget || delBusy) return;
        setDelBusy(true); setDelMsg("");
        if (canDeleteDirect) {
            // NUOVO DISEGNO (Luca 06/08): si elimina SOLO la riga contracts —
            // la vendita sparisce da RV, Gestione, Tracking e commissioning
            // futuro. NON si toccano: anagrafica clients, righe
            // contract_attachments (FK ora ON DELETE SET NULL + client_id,
            // mig. 20260806010000) né i file nel bucket: i documenti restano
            // visibili nella scheda cliente. Le richieste restano per lo storico.
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
    // LABEL_SLUG (etichetta brand -> slug catalogo) ora vive in catalogoFiltri.
    // un solo brand attivo dalle tessere (o unico brand presente) = si puo' filtrare per prodotto/offerta
    const soloBrandLabel = selBrands.size === 1 ? Array.from(selBrands)[0] : (selBrands.size === 0 && brandCounts.length === 1 ? brandCounts[0].brand : null);
    const soloSlug = soloBrandLabel ? (LABEL_SLUG[soloBrandLabel] || null) : null;
    const _prevSlug = useRef<string | null>(null);
    // CATEGORIE FINI anche con più brand (Luca 28/07): la tendina elenca sempre
    // le categorie del catalogo — lo storico è al 100% classificato (backfill
    // completato con la regola pagamento: EasyPay/IBAN → Ric. Auto, niente → Wallet).
    const [catNomiAll, setCatNomiAll] = useState<string[]>([]);
    useEffect(() => {
        (async () => { setCatNomiAll((await loadCatalogoCategorie()).map((c) => c.nome)); })();
    }, []);
    useEffect(() => {
        if (_prevSlug.current !== soloSlug) {
            _prevSlug.current = soloSlug;
            // cambio brand = si riparte: anche la CATEGORIA, che in modalità
            // catalogo elenca voci specifiche del brand (conseguenzialità).
            // null = tutto selezionato (stato di default delle tendine).
            setFilterProdotti(null); setFilterOfferte(null); setFilterOpzioni(null); setFilterCategorie(null);
        }
        if (!soloSlug) { setCatalogoBrand(null); return; }
        let alive = true;
        // FRESH sempre (Luca 10/08): la cache in memoria congelava il flag
        // attivo/spento — riaccendevi un'offerta dal pannello e qui restava ⛔
        // finché non ricaricavi la pagina. Due query leggere a ogni tessera.
        loadCatalogoBrand(soloSlug, { fresh: true }).then((t) => { if (alive) setCatalogoBrand(t); });
        return () => { alive = false; };
    }, [soloSlug]); // eslint-disable-line react-hooks/exhaustive-deps
    // CASCATA SENZA TESSERA SINGOLA (esito Luca 12/08: "Consumer, Fisso, ma poi
    // prodotto e offerta non sono selezionabili"): con più brand attivi si
    // carica l'UNIONE dei cataloghi di tutti i brand visibili — tipo cliente e
    // categoria tagliano le liste, la ricerca interna della tendina fa il resto.
    const [catalogoUnione, setCatalogoUnione] = useState<CatFiltro | null>(null);
    useEffect(() => {
        if (soloSlug) { setCatalogoUnione(null); return; }
        const slugs = Array.from(new Set(uniqueBrands.map((b) => LABEL_SLUG[b]).filter(Boolean)));
        if (!slugs.length) { setCatalogoUnione(null); return; }
        let alive = true;
        Promise.all(slugs.map((s) => loadCatalogoBrand(s)))
            .then((liste) => { if (alive) setCatalogoUnione(unisciCataloghi(liste)); })
            .catch(() => { if (alive) setCatalogoUnione(null); });
        return () => { alive = false; };
    }, [soloSlug, uniqueBrands]); // eslint-disable-line react-hooks/exhaustive-deps
    // il catalogo su cui lavora la cascata: quello del brand singolo, o l'unione
    const catalogoAttivo = catalogoBrand ?? catalogoUnione;
    // CONSEGUENZIALITÀ (Luca 28/07): le offerte seguono i prodotti scelti; senza
    // prodotti ma con una categoria, seguono i prodotti di quella categoria —
    // e comunque si restringono alle offerte DELLA categoria (la stessa offerta
    // può esistere sia in Wallet sia in Ric. Auto).
    // TIPO CLIENTE nella cascata (Luca 10/08): "Fisso" esiste sia Consumer sia
    // Business con lo stesso nome — senza questo taglio le offerte business
    // finivano nella tendina anche col filtro Consumer attivo
    const _tipoOk = useCallback((tipi?: string[]) =>
        !filterTipoCliente?.length || (tipi || []).some((t) => filterTipoCliente.includes(t)),
        [filterTipoCliente]);
    const offerteDisponibili = useMemo(() => {
        if (!catalogoAttivo) return [];
        // RIC-06: categorie/prodotti sono insiemi (null = tutto selezionato =
        // nessuna restrizione); con piu' categorie scelte si fa l'UNIONE.
        const base = filterProdotti?.length ? filterProdotti
            : filterCategorie?.length ? filterCategorie.flatMap((c) => catalogoAttivo.prodsByCat[c] || [])
            : null;
        // le SPENTE scendono in fondo (Luca 10/08): sopra restano le vive
        const ordina = (arr: string[]) => arr.filter((o) => _tipoOk(catalogoAttivo.offTipi?.[o])).sort((a, b) =>
            (catalogoAttivo.offSpenta?.[a] ? 1 : 0) - (catalogoAttivo.offSpenta?.[b] ? 1 : 0) || a.localeCompare(b));
        if (!base) return ordina([...catalogoAttivo.offNames]);
        let set = new Set<string>();
        base.forEach((pn) => (catalogoAttivo.offByProd[pn] || []).forEach((o) => set.add(o)));
        if (filterCategorie?.length) {
            const s2 = new Set(filterCategorie.flatMap((c) => catalogoAttivo.offsByCat[c] || []));
            set = new Set(Array.from(set).filter((o) => s2.has(o)));
        }
        return ordina(Array.from(set));
    }, [catalogoAttivo, filterProdotti, filterCategorie, _tipoOk]);
    // etichette ⛔ per le offerte spente nella tendina (il VALORE resta il nome
    // pulito: i filtri e lo storico non cambiano)
    const offEtichette = useMemo(() => {
        const out: Record<string, string> = {};
        offerteDisponibili.forEach((o) => { if (catalogoAttivo?.offSpenta?.[o]) out[o] = o + " · ⛔ spenta"; });
        return out;
    }, [offerteDisponibili, catalogoAttivo]);
    // le OPZIONI si sbloccano con almeno un'offerta scelta: unione delle loro
    const opzioniDisponibili = useMemo(() => {
        if (!catalogoAttivo || !filterOfferte?.length) return [];
        const set = new Set<string>();
        filterOfferte.forEach((on) => (catalogoAttivo.opzByOff[on] || []).forEach((z) => set.add(z)));
        return Array.from(set).sort();
    }, [catalogoAttivo, filterOfferte]);
    // Sola tessera Marginalità attiva → si accendono i due layer dedicati.
    const soloMarg = !!soloBrandLabel && ["marginalità", "marginalita"].includes(soloBrandLabel.toLowerCase());
    useEffect(() => {
        if (!soloMarg) { setMargTipi(null); setMargArticoli(null); return; }
        setFilterCategorie(null);   // la categoria nascosta non deve restare a filtrare
        let alive = true;
        loadMargListino().then((l) => { if (alive) setMargListino(l); });
        return () => { alive = false; };
    }, [soloMarg]);
    // articoli del listino dei TIPI scelti (null = nessun tipo scelto → tendina spenta)
    const margArticoliDisponibili = useMemo(
        () => (margListino ?? []).filter(x => margTipi?.includes(x.kind)).map(x => x.name),
        [margListino, margTipi]);
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
            // caricaTutte: senza, il tetto server 1000 tagliava le pratiche piu'
            // recenti e i filtri non offrivano i loro brand/prodotti/codici.
            const { data } = await caricaTutte<Record<string, unknown>>((from, to) => {
                let q = supabase.from("contracts").select("venditore, brand, prodotto, negozio, dettagli");
                // stesso RBAC di applicaFiltriRicerca (caso Veronica 12/08): il
                // lock sul nome vince e copre TUTTE le proprie vendite, ovunque
                if (!isGlobalView) {
                    if (lockedVenditore) q = q.eq("venditore", lockedVenditore);
                    else if (lockedStores) q = q.in("negozio", lockedStores);
                }
                if (isTecnico) q = q.or("brand.ilike.%extra%,brand.ilike.%marginal%,prodotto.ilike.%sost%");
                return q.order("id").range(from, to);
            });
            if (data) {
                setUniqueBrands(Array.from(new Set(data.map((r: any) => r.brand).filter(Boolean))).sort() as string[]);
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
                // RIC-06: ELENCO stabile delle tessere brand (segnalazione 57),
                // ordinato per volume storico — i numeri visibili sono i
                // conteggi faceted, ma presenza e ordine non ballano coi filtri.
                const bb: Record<string, number> = {};
                (data as any[]).forEach(r => { if (r.brand) bb[r.brand] = (bb[r.brand] || 0) + 1; });
                setBrandBase(Object.entries(bb).map(([brand, n]) => ({ brand, n })).sort((a, b) => b.n - a.n));
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

    // RIC-06: un filtro con insieme esplicitamente VUOTO ("Deseleziona tutto"
    // senza rispuntare nulla) = per definizione ZERO risultati: niente query.
    // NB: e' diverso dal default null ("tutto selezionato" = nessun filtro).
    const filtroVuoto =
        [filterVenditori, filterNegozi, filterCodiciIns, filterProdotti, filterOfferte, filterOpzioni]
            .some((v) => v !== null && v.length === 0)
        || (!soloMarg && filterCategorie !== null && filterCategorie.length === 0)
        || (soloMarg && ((margTipi !== null && margTipi.length === 0) || (margArticoli !== null && margArticoli.length === 0)));

    // ── RIC-06: FILTRI CONDIVISI tra l'elenco e i conteggi delle tessere ──────
    // Un solo posto per tutte le condizioni: `conTessere: false` applica tutto
    // TRANNE la selezione brand delle tessere (faceted classico — ogni tessera
    // mostra quanti risultati darebbe quel brand con gli altri filtri attivi).
    // Le tendine multi (null = tutto) passano da eq a .in sull'insieme scelto.
    const applicaFiltriRicerca = (q0: any, conTessere: boolean) => {
        let query = q0;
        if (filterVenditori !== null) query = query.in("venditore", filterVenditori);
        if (filterNegozi !== null) query = query.in("negozio", filterNegozi);
        if (filterCodice) query = query.ilike("id", `%${filterCodice}%`);
        if (filterBrand && filterBrand !== "") query = query.ilike("brand", `%${filterBrand}%`);
        if (filterProdotti !== null) query = query.in("prodotto", filterProdotti);
        if (filterOfferte !== null) query = query.in("offerta", filterOfferte);
        // opzioni selezionate: la vendita deve contenerle TUTTE (@> sul jsonb).
        // NB serve la STRINGA JSON: con l'array JS supabase-js serializza un
        // array Postgres (graffe) e il jsonb risponde "invalid input syntax
        // for type json" — era l'errore alla selezione di un'opzione (12/08)
        if (filterOpzioni !== null && filterOpzioni.length > 0) query = query.contains("opzioni", JSON.stringify(filterOpzioni.map((o) => ({ nome: o }))));
        // CATEGORIA = sempre quella FINE del catalogo, con uno o più brand
        // (Luca 28/07): dettagli->>categoria_catalogo copre il 100% dello
        // storico dopo il backfill (regola pagamento per i mobile vecchi).
        if (filterCategorie !== null && !soloMarg) query = query.in("dettagli->>categoria_catalogo", filterCategorie);
        // MOD-30: tipologia cliente (Consumer/Business) — la Marginalità non ha
        // tipo cliente, per lei il filtro resta spento come la categoria
        if (filterTipoCliente !== null && !soloMarg) query = query.in("tipo_cliente", filterTipoCliente);
        // Segnalazione 55 (chiarita): il Tecnico vede SOLO i contratti brand Extra
        // (di tutto il proprio negozio). Gli altri: Extra nascosti salvo checkbox.
        if (isTecnico) query = query.or("brand.ilike.%extra%,brand.ilike.%marginal%,prodotto.ilike.%sost%");
        // Segnalazione 53: si filtra sul codice di inserimento (dettagli['Cod.Ins.']),
        // non piu' sul codice contratto. Chiave con punti -> va quotata per PostgREST.
        if (filterCodiciIns !== null) query = query.in('dettagli->>"Cod.Ins."', filterCodiciIns);
        if (filterCellulare) query = query.ilike("clients.cellulare", `%${filterCellulare}%`);
        // Segnalazione 80: i filtri data valgono per elenco E tessere insieme.
        // Le date sono in formato AAAA-MM-GG, quindi il confronto e' diretto.
        const _daIso = dataIso(daDataAttivazione), _aIso = dataIso(aDataAttivazione);
        if (_daIso) query = query.gte("data_attivazione", _daIso);
        if (_aIso) query = query.lte("data_attivazione", _aIso);

        // tessere brand a selezione positiva: con una selezione attiva
        // passano SOLO i brand scelti; nello stato di default (nessuna
        // selezione) la MARGINALITÀ resta esclusa — si vede solo cliccandola.
        // I conteggi faceted SALTANO questo blocco (conTessere: false).
        if (conTessere) {
            if (selBrands.size > 0) query = query.in("brand", Array.from(selBrands));
            else query = query.neq("brand", "Marginalità").neq("brand", "Extra");
        }

        // MARGINALITÀ a due layer: gli articoli scelti vincono; coi soli
        // tipi selezionati passano tutti gli articoli di quei tipi.
        if (soloMarg) {
            if (margArticoli !== null && margArticoli.length > 0) query = query.in("prodotto", margArticoli);
            else if (margTipi !== null && margTipi.length > 0) {
                const names = (margListino ?? []).filter((x) => margTipi.includes(x.kind)).map((x) => x.name);
                if (names.length) query = query.in("prodotto", names);
            }
        }

        // IMEI / SERIALE sul CONTRATTO: IMEI piatti (anche `imei` minuscolo —
        // le vendite usato lo scrivono così, segnalazione 12/08), terminali
        // `units` dell'usato (anche finanziato), codice attivazione. Usato dal
        // campo IMEI dedicato E dal campo cliente quando digitano lì un numero.
        const orSeriale = (grezzo: string) => {
            const s = grezzo.trim().replace(/[",()]/g, "").replace(/[\s./-]/g, "");
            if (!s) return null;
            const t = `%${s}%`;
            return [
                `codice_attivazione.ilike.${t}`,
                `dettagli->>IMEI.ilike.${t}`,
                `dettagli->>imei.ilike.${t}`,
                `dettagli->>"IMEI TNP".ilike.${t}`,
                `dettagli->>"IMEI CB".ilike.${t}`,
                `dettagli->units.cs."[{\\"imei\\":\\"${s}\\"}]"`,
            ].join(",");
        };
        // Campo IMEI dedicato (esito Luca 12/08: l'input c'era ma non filtrava nulla)
        if (filterImei) {
            const o = orSeriale(filterImei);
            if (o) query = query.or(o);
        }
        if (filterCliente) {
            const safe = filterCliente.trim().replace(/[",()]/g, "");
            // (Luca 11/08: l'IMEI di un usato venduto trovava zero perché il
            // campo cerca solo sull'anagrafica): se la stringa è tutta cifre
            // si cerca sul contratto con le condizioni seriale qui sopra.
            const soloCifre = safe.replace(/[\s./-]/g, "");
            if (/^\d{8,20}$/.test(soloCifre)) {
                query = query.or(orSeriale(soloCifre)!);
            } else if (safe) {
                // Segnalazione 36. Prima: .or("clients.nome.ilike.…") — PostgREST
                // legge "clients" come colonna e "nome" come operatore, e risponde
                // 400 PGRST100 "failed to parse logic tree". Le condizioni su una
                // tabella agganciata vanno passate con referencedTable.
                // Video Ferrarelli (Luca 05/08): il placeholder prometteva "Nome,
                // C.F. o P.IVA" ma cf_piva NON era tra le colonne cercate — il
                // filtro per codice fiscale non trovava mai nulla. Aggiunti
                // cf_piva e il referente business (nome_ref/cognome_ref).
                // FILTRO INTELLIGENTE (Luca 10/08): "Mario Rossi" non trovava
                // nulla perché la stringa intera non sta né in nome né in
                // cognome. Ora si spezza in PAROLE e ognuna deve combaciare con
                // uno dei campi (gli .or ripetuti sulla stessa tabella vanno in
                // AND) — nome+cognome funziona in qualsiasi ordine.
                const tokens = safe.split(/\s+/).filter(Boolean).slice(0, 6);
                for (const tk of tokens) {
                    const term = `%${tk}%`;
                    query = query.or(
                        `nome.ilike.${term},cognome.ilike.${term},ragione_sociale.ilike.${term},cf_piva.ilike.${term},nome_ref.ilike.${term},cognome_ref.ilike.${term}`,
                        { referencedTable: "clients" }
                    );
                }
            }
        }

        // RBAC: tutti i negozi visibili (negozioInValues include anche la radice
        // legacy: i contratti storici salvavano "Magliana" senza suffisso).
        // CASO VERONICA (Luca 12/08): chi è bloccato sul PROPRIO nome vede le
        // proprie vendite OVUNQUE le abbia fatte — il filtro negozio sopra il
        // filtro venditore le nascondeva (le sue W3 stavano su un negozio fuori
        // dalla sua visibilità e il brand WindTre spariva dalle tessere).
        if (!isGlobalView) {
            if (lockedVenditore) query = query.eq("venditore", lockedVenditore);
            else if (lockedStores) query = query.in("negozio", lockedStores);
        }
        return query;
    };

    const fetchData = async () => {
        if (!visReady) return; // la lista dei negozi visibili non e' ancora arrivata
        setLoading(true);
        try {
            if (filtroVuoto) { setContractList([]); setTotalCount(0); return; }
            let query = supabase
                .from("contracts")
                // Anagrafica COMPLETA anche dalla lista: il dettaglio aperto da qui
                // mostrava "—" su tutti i campi non selezionati (il DB era pieno,
                // la query portava solo i 4 campi delle colonne).
                .select("*, clients!inner(nome, cognome, ragione_sociale, cellulare, telefono_fisso, email, cf_piva, indirizzo, cap, citta, tipo, nome_ref, cognome_ref)", { count: "exact" });

            // Server-side filters (condivisi con le tessere: applicaFiltriRicerca)
            query = applicaFiltriRicerca(query, true);

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

    // Segnalazione 57 + RIC-06 (Luca 05/08): i numeretti delle tessere seguono
    // i FILTRI ATTIVI. Faceted classico: per ogni brand si conta quanti
    // risultati darebbe applicando TUTTI i filtri correnti TRANNE la selezione
    // brand delle tessere (conTessere: false) — il numero dice cosa
    // succederebbe cliccando la tessera. Stessa query dell'elenco (stesso
    // builder, stesso join clients!inner), quindi i conti tornano col
    // "Trovati N". caricaTutte: il tetto server 1000 troncava i conteggi in
    // silenzio sui volumi reali. Debounce come il fetch dell'elenco.
    useEffect(() => {
        if (!visReady) return;
        const timer = setTimeout(async () => {
            if (filtroVuoto) { setFacetCounts({}); return; }
            const { data } = await caricaTutte<{ brand: string | null }>((from, to) =>
                applicaFiltriRicerca(supabase.from("contracts").select("brand, clients!inner(id)"), false)
                    .order("id").range(from, to));
            const m: Record<string, number> = {};
            (data ?? []).forEach((r) => { if (r.brand) m[r.brand] = (m[r.brand] || 0) + 1; });
            setFacetCounts(m);
        }, 300);
        return () => clearTimeout(timer);
    }, [isGlobalView, visKey, visReady, lockedVenditore, isTecnico, kMulti(filterVenditori), filterCodice, filterBrand, kMulti(filterProdotti), kMulti(filterOfferte), kMulti(filterOpzioni), kMulti(filterCategorie), kMulti(filterTipoCliente), kMulti(filterNegozi), kMulti(filterCodiciIns), filterCliente, filterCellulare, daDataAttivazione, aDataAttivazione, Array.from(selBrands).join("|"), kMulti(margTipi), kMulti(margArticoli), (margListino ?? []).length, contractList.length]); // eslint-disable-line react-hooks/exhaustive-deps

    // Segnalazione 47: quando cambia un filtro, torna a pagina 1. Prima, se eri a
    // pagina 2+ e applicavi un filtro (es. un Prodotto) con pochi risultati, la
    // pagina corrente restava oltre l'ultima e la lista appariva VUOTA — sembrava
    // che "non generasse alcun risultato".
    const firstFilterRun = useRef(true);
    useEffect(() => {
        if (firstFilterRun.current) { firstFilterRun.current = false; return; }
        setPage(1);
    }, [kMulti(filterVenditori), filterCodice, filterBrand, kMulti(filterProdotti), kMulti(filterOfferte), kMulti(filterCategorie), kMulti(filterTipoCliente), kMulti(filterNegozi), kMulti(filterCodiciIns), filterCliente, filterCellulare, filterImei, Array.from(selBrands).join("|"), daDataAttivazione, aDataAttivazione, kMulti(margTipi), kMulti(margArticoli), kMulti(filterOpzioni)]);

    // Debounced fetch (riparte anche quando arriva la lista dei negozi visibili)
    useEffect(() => {
        const timer = setTimeout(fetchData, 300);
        return () => clearTimeout(timer);
    }, [page, visKey, visReady, kMulti(filterVenditori), filterCodice, filterBrand, kMulti(filterProdotti), kMulti(filterOfferte), kMulti(filterCategorie), kMulti(filterTipoCliente), kMulti(filterNegozi), kMulti(filterCodiciIns), filterCliente, filterCellulare, filterImei, Array.from(selBrands).join("|"), daDataAttivazione, aDataAttivazione, kMulti(margTipi), kMulti(margArticoli), kMulti(filterOpzioni), (margListino ?? []).length, catalogoBrand?.slug ?? ""]);

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

    // GLB-03: da CSV a vero .xlsx \u2014 via il quoting manuale, celle passate cos\u00ec come sono.
    // EXPORT COMPLETO (esito Luca 12/08): la lista in memoria \u00e8 SOLO la pagina
    // video da 25 righe \u2014 l'Excel rif\u00e0 la query filtrata intera via caricaTutte
    // (tetto server 1000 superato a blocchi; tiebreaker .order(id) obbligatorio
    // per non perdere/duplicare righe tra i blocchi).
    const [exporting, setExporting] = useState(false);
    const handleExportExcel = async () => {
        if (exporting || filtroVuoto) return;
        setExporting(true);
        try {
            const { data, error } = await caricaTutte<Record<string, unknown>>((from, to) =>
                applicaFiltriRicerca(
                    supabase.from("contracts").select("*, clients!inner(nome, cognome, ragione_sociale, cellulare, telefono_fisso, email, cf_piva, indirizzo, cap, citta, tipo, nome_ref, cognome_ref)"),
                    true
                ).order("created_at", { ascending: false }).order("id").range(from, to));
            if (error) throw new Error(String((error as { message?: string }).message || "export"));
            const tutte = (data ?? []).map((row: any) => mapContractToRow(row, row.clients));
            if (tutte.length === 0) return;
            // Segnalazione 76: anche nell'esport il Codice ins. e il nome corretto della colonna
            const headers = ["Venditore", "Brand", "Categoria", "Prodotto", "Offerta", "Cliente", "Negozio", "Codice ins.", "Codice contratto", "Data Registrazione", "Data Attivazione", "Stato"];
            const rows: CellaXlsx[][] = tutte.map(r => [
                r.venditore, r.brand, ((r.raw?.dettagli as Record<string, unknown>)?.categoria_catalogo as string) || (r.raw?.categoria as string) || "", r.prodotto, (r.raw?.offerta as string) || ((r.raw?.dettagli as Record<string, unknown>)?.Offerta as string) || "", r.cliente, r.negozio, codInsDi(r), r.codice_attivazione, r.data_registrazione, r.data_attivazione, r.stato
            ]);
            await scaricaXlsx(`contratti_${new Date().toISOString().split('T')[0]}`, headers, rows, "Contratti");
        } catch {
            // errore gi\u00e0 visibile all'utente col bottone che si riattiva
        } finally { setExporting(false); }
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
    // RIC-05: stato aperto/chiuso delle 4 sezioni del modale (locale, si
    // resetta a ogni apertura da openContract).
    const [openSecs, setOpenSecs] = useState<Record<string, boolean>>({});
    const toggleSec = (id: string) => setOpenSecs(p => ({ ...p, [id]: !p[id] }));
    // SPOSTA CONTRATTO AD ALTRO CLIENTE (Luca 08/08, caso Butnaru/Fei): quando
    // la vendita è registrata sulla scheda cliente sbagliata, si cambia il
    // client_id invece di forzare il CF (che è univoco). Solo modifica diretta.
    const [spostaOpen, setSpostaOpen] = useState(false);
    const [spostaQuery, setSpostaQuery] = useState("");
    const [spostaHits, setSpostaHits] = useState<{ id: string; nome: string; cognome: string; ragione_sociale: string; cf_piva: string; cellulare: string }[]>([]);
    const [spostaBusy, setSpostaBusy] = useState(false);
    // VENDITA MISTA (Luca 10/08): quando la vendita da spostare ha più righe,
    // si SCEGLIE cosa spostare (spunte) — il "tutto insieme" cieco trascinava
    // anche prodotti di un'altra persona (caso sost. SIM Butnaru → Fei).
    const [pickerSposta, setPickerSposta] = useState<null | { target: string; righe: { id: string; etichetta: string; sub: string; sel: boolean }[]; done: (ids: string[] | null) => void }>(null);
    useEffect(() => {
        const q = spostaQuery.trim();
        if (!spostaOpen || q.length < 3) { setSpostaHits([]); return; }
        let vivo = true;
        const t = setTimeout(async () => {
            const like = `%${q}%`;
            const { data } = await supabase.from("clients")
                .select("id, nome, cognome, ragione_sociale, cf_piva, cellulare")
                .or(`cf_piva.ilike.${like},nome.ilike.${like},cognome.ilike.${like},ragione_sociale.ilike.${like},cellulare.ilike.${like}`)
                .limit(8);
            if (vivo) setSpostaHits((data as typeof spostaHits) || []);
        }, 250);
        return () => { vivo = false; clearTimeout(t); };
    }, [spostaQuery, spostaOpen]);
    // NUCLEO RIUSABILE (10/08): sposta TUTTE le righe della stessa vendita
    // (stesso cliente + stessa data: CTR + marginalità EXT insieme) sulla
    // scheda del cliente giusto, POI ritenta il MATCH APPUNTAMENTO col CF
    // della scheda nuova: al submit non era potuto scattare (il CF era quello
    // sbagliato) e senza questo la vendita spostata restava orfana
    // dell'appuntamento e il caller perdeva la cooperation (caso Butnaru/Fei).
    // Usato dal bottone 🔀 Sposta cliente E dal flusso guidato di approvazione.
    const spostaVenditaSuCliente = async (contractId: string, nuovo: { id: string; etichetta: string }, firma: string): Promise<{ ok: boolean; msg: string }> => {
        const { data: c } = await supabase.from("contracts").select("id, client_id, data, negozio, clients(nome, cognome, ragione_sociale)").eq("id", contractId).single();
        if (!c || !(c as any).client_id) return { ok: false, msg: "Il contratto non ha un cliente collegato: impossibile spostare." };
        const vc = (c as any).clients as { nome?: string; cognome?: string; ragione_sociale?: string } | null;
        const vecchioNome = vc ? (vc.ragione_sociale || `${vc.nome || ""} ${vc.cognome || ""}`.trim()) : "—";
        const { data: righeV } = await supabase.from("contracts").select("id, storia, brand, prodotto, offerta").eq("client_id", (c as any).client_id).eq("data", (c as any).data || "");
        const righe = ((righeV || []) as { id: string; storia: unknown; brand?: string | null; prodotto?: string | null; offerta?: string | null }[]);
        let daSpostare: { id: string; storia: unknown }[] = righe.length ? righe : [{ id: contractId, storia: [] as unknown }];
        // Più righe nella stessa vendita → l'operatore SCEGLIE cosa spostare
        // (default: tutte spuntate). Le righe non spuntate restano dove sono.
        if (righe.length > 1) {
            const scelte = await new Promise<string[] | null>(done => setPickerSposta({
                target: nuovo.etichetta,
                righe: righe.map(r => ({
                    id: r.id,
                    etichetta: [r.prodotto, r.offerta].filter(Boolean).join(" · ") || r.brand || r.id,
                    sub: r.id + (r.brand ? " · " + r.brand : ""),
                    sel: true,
                })),
                done,
            }));
            setPickerSposta(null);
            if (!scelte || !scelte.length) return { ok: false, msg: "Spostamento annullato." };
            daSpostare = righe.filter(r => scelte.includes(r.id));
        }
        const stamp = new Date().toISOString();
        for (const rg of daSpostare) {
            const storia = Array.isArray(rg.storia) ? [...rg.storia] : [];
            storia.push({ at: stamp, user: firma, campo: "Cliente", da: vecchioNome, a: nuovo.etichetta });
            const { error } = await supabase.from("contracts").update({ client_id: nuovo.id, storia }).eq("id", rg.id);
            if (error) return { ok: false, msg: `Spostamento riga ${rg.id} NON riuscito: ${error.message}` };
        }
        let msg = `Vendita spostata su «${nuovo.etichetta}» (${daSpostare.length} rig${daSpostare.length === 1 ? "a" : "he"}).`;
        // ── RETRO-MATCH appuntamento sul CF della scheda giusta ──
        try {
            const { data: nc } = await supabase.from("clients").select("cf_piva, cf_ref").eq("id", nuovo.id).maybeSingle();
            const cfN = (nc as { cf_piva?: string | null; cf_ref?: string | null } | null)?.cf_piva || "";
            if (cfN) {
                const cand = await trovaAppuntamentoDaAgganciare(cfN, (nc as any)?.cf_ref || null, (c as any).negozio || null, (c as any).data || "");
                if (cand) {
                    const a = cand.appuntamento;
                    const ids = daSpostare.map(r => r.id);
                    if (cand.stessoNegozio) {
                        const okCoop = window.confirm(`📞 «${nuovo.etichetta}» ha un appuntamento APERTO del call center (${a.created_by || "caller"}, ${a.date || ""}${a.store ? " — " + a.store : ""}).\n\nAgganciare questa vendita? L'appuntamento diventa ATTIVATO e la cooperation va al caller.`);
                        if (okCoop) {
                            const ok = await agganciaVenditaAppuntamento(a.id, ids, firma, true);
                            msg += ok ? ` Appuntamento del ${a.date || "—"} ATTIVATO con cooperation a ${a.created_by || "caller"}.` : " ⚠️ Aggancio all'appuntamento NON riuscito (riprova dal calendario).";
                        }
                    } else {
                        const ok = await agganciaVenditaAppuntamento(a.id, ids, firma, false);
                        msg += ok ? ` Appuntamento del ${a.date || "—"} segnato attivato (altro negozio).` : " ⚠️ Aggancio all'appuntamento NON riuscito.";
                    }
                }
            }
        } catch { /* retro-match best-effort: lo spostamento resta valido */ }
        return { ok: true, msg };
    };
    const spostaContrattoA = async (nuovo: { id: string; nome: string; cognome: string; ragione_sociale: string }) => {
        if (!selectedContract || spostaBusy) return;
        const nomeNuovo = nuovo.ragione_sociale || `${nuovo.nome || ""} ${nuovo.cognome || ""}`.trim() || nuovo.id;
        if (!selectedContract.raw?.client_id) { alert("Il contratto non ha un cliente collegato: impossibile spostare."); return; }
        if (!window.confirm(`Spostare questa vendita (contratto + eventuali marginalità dello stesso giorno) dal cliente «${selectedContract.cliente}» al cliente «${nomeNuovo}»?\nI dati restano invariati, cambia solo la scheda cliente.`)) return;
        setSpostaBusy(true);
        try {
            const r = await spostaVenditaSuCliente(selectedContract.id, { id: nuovo.id, etichetta: nomeNuovo }, user?.name || "—");
            if (!r.ok) { alert(r.msg); setSpostaBusy(false); return; }
            setSpostaOpen(false); setSpostaQuery(""); setSpostaHits([]);
            setSelectedContract(null);
            await fetchData();
            alert("✅ " + r.msg);
        } catch (e) { alert("Errore: " + (e instanceof Error ? e.message : "riprova")); }
        setSpostaBusy(false);
    };
    const openContract = (row: ContrattoRow, mode: "view" | "edit") => {
        const vals: Record<string, string> = {};
        CONTRACT_FIELDS.forEach(f => { vals[`contract::${f.key}`] = row.raw?.[f.key] == null ? "" : String(row.raw[f.key]); });
        CLIENT_FIELDS.forEach(f => { vals[`client::${f.key}`] = row.client?.[f.key] == null ? "" : String(row.client[f.key]); });
        dettagliOf(row).forEach(([k, v]) => {
            if (v !== null && typeof v === "object") return; // oggetti annidati: sola lettura
            vals[`dettagli::${k}`] = v == null ? "" : String(v);
        });
        // OPZIONI contrattualizzate (Luca 07/08): jsonb → JSON canonico,
        // l'editor dedicato vive in "Dati del contratto"
        vals["contract::opzioni"] = JSON.stringify(Array.isArray(row.raw?.opzioni) ? row.raw.opzioni : []);
        setSpostaOpen(false); setSpostaQuery(""); setSpostaHits([]);   // reset pannello sposta
        setEditValues(vals);
        setReqNote("");
        setReqMsg(null);
        // RIC-05: default delle sezioni richiudibili — in EDIT solo "Dati del
        // contratto" aperta (si va dritti al punto), in VISTA Dati + Attribuzione.
        setOpenSecs(mode === "edit" ? { contratto: true } : { contratto: true, attrib: true });
        setSelectedContract(row);
        setDetailMode(mode);
    };

    const originalOf = (row: ContrattoRow, key: string): unknown => {
        const i = key.indexOf("::");
        const scope = key.slice(0, i), field = key.slice(i + 2);
        if (scope === "contract" && field === "opzioni") return JSON.stringify(Array.isArray(row.raw?.opzioni) ? row.raw.opzioni : []);
        if (scope === "contract") return row.raw?.[field];
        if (scope === "client") return row.client?.[field];
        return (row.raw?.dettagli as Record<string, unknown> | undefined)?.[field];
    };

    const labelOf = (key: string): string => {
        const i = key.indexOf("::");
        const scope = key.slice(0, i), field = key.slice(i + 2);
        if (scope === "contract" && field === "opzioni") return "Opzioni";
        if (scope === "contract") return CONTRACT_FIELDS.find(f => f.key === field)?.label || field;
        if (scope === "client") return (CLIENT_FIELDS.find(f => f.key === field)?.label || field) + " (cliente)";
        // RIC-03: la categoria fine viaggia come chiave dei dettagli ma nel
        // modale si presenta "Categoria": stessa voce anche nelle richieste.
        if (field === "categoria_catalogo") return "Categoria (catalogo)";
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

    // ── RIC-05: ALLEGATI della pratica nel modale (Luca 05/08) ────────────────
    // Come sono salvati (verificato su registra-vendita + una riga vera a DB):
    // file nel bucket storage "contracts" sotto <client_id>/<file>, riferimenti
    // nella tabella contract_attachments (contract_id, file_url, file_name,
    // file_type documento/contratti/fattura/altro, created_at). NB: il Registra
    // aggancia gli allegati al PRIMO contratto del carrello: le altre righe
    // della stessa vendita possono risultare senza — per quelle resta il
    // bottone "Documenti cliente" in alto.
    const [allegati, setAllegati] = useState<Allegato[]>([]);
    const [attDelId, setAttDelId] = useState<string | null>(null);
    const [attBusy, setAttBusy] = useState(false);
    const [attMsg, setAttMsg] = useState<string | null>(null);
    const ricaricaAllegati = async (contractId: string) => {
        const { data } = await supabase.from("contract_attachments")
            .select("id, file_url, file_name, file_type, created_at")
            .eq("contract_id", contractId)
            .order("created_at", { ascending: true });
        setAllegati((data ?? []) as Allegato[]);
    };
    useEffect(() => {
        setAttDelId(null); setAttMsg(null);
        if (!selectedContract) { setAllegati([]); return; }
        ricaricaAllegati(selectedContract.id);
    }, [selectedContract?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Eliminazione allegato: SOLO per chi ha la modifica DIRETTA (rotellina).
    // Il formato `changes` delle richieste porta solo campi contract/client/
    // dettagli (applicaCambiamenti non saprebbe applicare un'eliminazione di
    // riga in contract_attachments), quindi — scelta pragmatica dichiarata —
    // chi salva "con autorizzazione" vede gli allegati in sola lettura con nota.
    const eliminaAllegato = async (a: Allegato) => {
        if (!selectedContract || attBusy) return;
        setAttBusy(true); setAttMsg(null);
        // 1) riferimento sul contratto (riga contract_attachments) — PRIMA il
        //    DB, che è la verità; il file fisico si valuta dopo.
        const { error } = await supabase.from("contract_attachments").delete().eq("id", a.id);
        if (error) { setAttMsg("⚠️ Allegato NON eliminato: " + error.message); setAttBusy(false); return; }
        // 2) file dallo storage SOLO se nessun'altra riga lo referenzia
        //    (ref-count, Luca 06/08): col riuso dei documenti lo stesso
        //    file_url può stare su PIÙ righe (altri contratti del cliente) —
        //    cancellare il file avrebbe rotto anche quelle. Best-effort: se
        //    fallisce resta un orfano nel bucket, mai un riferimento rotto.
        try {
            const { count, error: cntErr } = await supabase.from("contract_attachments")
                .select("id", { count: "exact", head: true }).eq("file_url", a.file_url);
            // verifica 06/08: su errore count è null — senza il check il file
            // veniva cancellato SENZA conteggio (l'opposto del best-effort)
            if (!cntErr && count === 0) {
                const path = decodeURIComponent(a.file_url.split("/object/public/contracts/")[1] || "");
                if (path) await supabase.storage.from("contracts").remove([path]);
            }
        } catch { /* best-effort */ }
        // 3) traccia nella storia del contratto, come le altre modifiche dirette
        try {
            const storia: any[] = Array.isArray(selectedContract.raw?.storia) ? [...(selectedContract.raw.storia as any[])] : [];
            storia.push({ at: new Date().toISOString(), user: `${user?.name || "—"} (modifica diretta)`, campo: "Allegato eliminato", da: a.file_name, a: "—" });
            await supabase.from("contracts").update({ storia }).eq("id", selectedContract.id);
            setSelectedContract(prev => prev && prev.id === selectedContract.id ? { ...prev, storia, raw: { ...prev.raw, storia } } : prev);
        } catch { /* best-effort: l'eliminazione è già avvenuta */ }
        setAttDelId(null); setAttBusy(false);
        await ricaricaAllegati(selectedContract.id);
    };

    // ── RIC-03: catalogo del brand del contratto APERTO nel modale ────────────
    // Indipendente dal catalogo dei filtri (catalogoBrand segue le tessere, il
    // modale può aprirsi su qualunque riga). Segue il brand in EDITING: se lo
    // si cambia, le tendine categoria/prodotto/offerta cambiano con lui.
    const editBrand = selectedContract ? (editValues["contract::brand"] || selectedContract.brand) : "";
    const [catalogoModale, setCatalogoModale] = useState<CatFiltro | null>(null);
    const [margModale, setMargModale] = useState<MargArticolo[] | null>(null);
    useEffect(() => {
        setCatalogoModale(null);
        if (!selectedContract || !editBrand) return;
        let alive = true;
        // PROBLEMA CACHE (Luca 05/08): il loader ha cache di modulo, quindi se
        // l'amministrazione aggiorna il catalogo il modale mostrava la versione
        // vecchia fino al reload della pagina. In EDIT si passa { fresh: true }:
        // le tendine riflettono SEMPRE il DB attuale (e la cache, riaggiornata,
        // serve dati freschi anche a vista e filtri). In vista basta la cache.
        const fresh = detailMode === "edit";
        if (_isExtraBrand(editBrand)) {
            // per la Marginalità i "prodotti" sono gli articoli del listino
            loadMargListino({ fresh }).then((l) => { if (alive) setMargModale(l); });
            return () => { alive = false; };
        }
        const slug = LABEL_SLUG[editBrand] || null;
        if (!slug) return;
        loadCatalogoBrand(slug, { fresh }).then((t) => { if (alive) setCatalogoModale(t); });
        return () => { alive = false; };
    }, [selectedContract, editBrand, detailMode]);

    // ── RIC-04: APPLICAZIONE dei cambiamenti al contratto ─────────────────────
    // Percorso UNICO condiviso tra l'approvazione di una richiesta e il
    // salvataggio diretto (rotellina "diretta"): patch del contratto, sync dei
    // derivati (categoria/macro/controlli), patch del cliente e righe di storia.
    // `changes` è nel formato delle richieste ({ "scope::campo": {da,a,label} });
    // `firmaStoria` è chi compare nelle righe di storia. Ritorna null se tutto
    // ok, altrimenti il messaggio d'errore da mostrare (niente resta "a metà"
    // senza che si veda — segnalazione 32).
    // Ritorno: null = ok · string = errore · {cfConflitto} = il CF richiesto
    // appartiene GIÀ a un altro cliente → il chiamante offre lo spostamento
    // guidato della vendita su quella scheda (10/08, caso Butnaru/Fei v2).
    type EsitoApplica = string | { cfConflitto: { id: string; nome: string; cf: string } } | null;
    const applicaCambiamenti = async (contractId: string, changes: Record<string, any>, firmaStoria: string): Promise<EsitoApplica> => {
        const { data: c } = await supabase.from("contracts").select("*").eq("id", contractId).single();
        if (!c) return "Contratto " + contractId + " non trovato.";
        const contractPatch: Record<string, unknown> = {};
        const clientPatch: Record<string, unknown> = {};
        const det: Record<string, unknown> = { ...((c.dettagli as Record<string, unknown>) || {}) };
        let detTouched = false;
        const storia: any[] = Array.isArray(c.storia) ? [...c.storia] : [];
        const stamp = new Date().toISOString();
        const leggibiliOpz = (x: unknown): string => {
            try { const a = JSON.parse(String(x || "[]")); return Array.isArray(a) && a.length ? a.map((o: { nome?: string; quantita?: number | null }) => String(o.nome || "") + (o.quantita && Number(o.quantita) > 1 ? " ×" + o.quantita : "")).join(", ") : "—"; } catch { return "—"; }
        };
        Object.entries(changes || {}).forEach(([k, raw]) => {
            if (k.startsWith("__")) return;   // "__meta" = motivazione, non un campo
            const v = raw as { da: any; a: any; label?: string };
            const i = k.indexOf("::");
            const scope = k.slice(0, i), field = k.slice(i + 2);
            if (scope === "contract" && field === "opzioni") {
                // OPZIONI (Luca 07/08): viaggiano come JSON canonico → jsonb;
                // si risincronizza anche la stringa dei dettagli (formato del
                // Registra) e la storia resta leggibile, mai JSON grezzo
                let arr: { nome: string; quantita: number | null }[] = [];
                try { const px = JSON.parse(String(v.a || "[]")); if (Array.isArray(px)) arr = px; } catch { arr = []; }
                contractPatch.opzioni = arr;
                det["Opzioni"] = arr.map(o => o.nome + (o.quantita && Number(o.quantita) > 1 ? ` (${o.quantita})` : "")).join(", ");
                detTouched = true;
                storia.push({ at: stamp, user: firmaStoria, campo: "Opzioni", da: leggibiliOpz(v.da), a: leggibiliOpz(v.a) });
                return;
            }
            if (scope === "contract") contractPatch[field] = v.a === "" ? null : v.a;
            else if (scope === "client") clientPatch[field] = v.a === "" ? null : v.a;
            else if (scope === "dettagli") { det[field] = coerceLike(det[field], String(v.a)); detTouched = true; }
            storia.push({
                at: stamp, user: firmaStoria,
                campo: v.label || field, da: fmtVal(v.da), a: fmtVal(v.a),
            });
        });
        // ── RIC-03: SYNC DEI DERIVATI (decisione Luca 04/08: la
        // riclassificazione ha effetto completo ovunque). Tracking, filtri e
        // target leggono categoria_macro/controlli, non la chiave nei dettagli:
        // senza questo blocco la modifica "non si vedrebbe" da nessuna parte.
        const chiavi = Object.keys(changes || {});
        if (chiavi.includes("dettagli::categoria_catalogo")) {
            // la categoria FINE porta con sé etichetta canonica e macro
            const macro = MACRO_BY_CATALOGO[String(det.categoria_catalogo || "")];
            if (macro) {
                contractPatch.categoria = CANONICA_BY_ID[macro];
                contractPatch.categoria_macro = macro;
            }
        }
        // MNP / Tipo TNP / Tipo CB cambiati -> controlli (mnp, finanziamento,
        // rata) ricalcolati dai dettagli aggiornati, come fa il Registra alla
        // nascita della pratica.
        if (chiavi.some((k) => /^dettagli::(MNP|mnp|Tipo TNP|Tipo CB|tnpTipo|cbTnpTipo)$/.test(k))) {
            contractPatch.controlli = controlliDi(det);
        }
        if (detTouched) contractPatch.dettagli = det;
        contractPatch.storia = storia;
        // GUARDIA CF PRIMA DI OGNI SCRITTURA (fix 10/08): prima stava DOPO
        // l'update del contratto → applicazione PARZIALE (campi contratto
        // scritti, cliente no) e righe di storia duplicate a ogni ritentativo.
        // Ora il conflitto ferma tutto in anticipo e torna STRUTTURATO, così
        // il chiamante può proporre lo spostamento guidato della vendita.
        if (Object.keys(clientPatch).length > 0 && c.client_id && clientPatch.cf_piva) {
            const { data: gia } = await supabase.from("clients")
                .select("id, nome, cognome, ragione_sociale").ilike("cf_piva", String(clientPatch.cf_piva)).neq("id", c.client_id).limit(1);
            if (gia && gia[0]) {
                const g = gia[0] as { id: string; nome?: string; cognome?: string; ragione_sociale?: string };
                const chi = g.ragione_sociale || `${g.nome || ""} ${g.cognome || ""}`.trim() || "un altro cliente";
                return { cfConflitto: { id: g.id, nome: chi, cf: String(clientPatch.cf_piva) } };
            }
        }
        const { error: cErr } = await supabase.from("contracts").update(contractPatch).eq("id", contractId);
        if (cErr) return "Modifica NON applicata al contratto: " + cErr.message;
        if (Object.keys(clientPatch).length > 0 && c.client_id) {
            const { error: clErr } = await supabase.from("clients").update(clientPatch).eq("id", c.client_id);
            if (clErr) {
                if (/uq_clients_cf_piva|duplicate key/i.test(clErr.message)) return `Il codice fiscale ${clientPatch.cf_piva || ""} è già registrato su un altro cliente: non può stare su due schede. Spostate il contratto alla scheda giusta (bottone 🔀 Sposta cliente).`;
                return "Modifica NON applicata al cliente: " + clErr.message;
            }
        }
        return null;
    };

    // Il dettaglio aperto mostrerebbe ancora i valori vecchi e sembrerebbe che
    // il salvataggio/approvazione non abbia fatto nulla: si ricarica dal DB.
    const ricaricaAperto = async (contractId: string) => {
        if (!selectedContract || selectedContract.id !== contractId) return;
        const { data: fresh } = await supabase
            .from("contracts")
            .select("*, clients(nome, cognome, ragione_sociale, cellulare, telefono_fisso, email, cf_piva, indirizzo, cap, citta, tipo, nome_ref, cognome_ref)")
            .eq("id", contractId).single();
        if (fresh) {
            const cl = (fresh as any).clients || null;
            setSelectedContract(mapContractToRow(fresh as any, cl));
        }
    };

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

    // RIC-04: salvataggio DIRETTO (rotellina "diretta") — applica subito con lo
    // stesso percorso dell'approvazione e lascia in contract_change_requests
    // una riga già approvata con review_note "modifica diretta": lo Storico
    // Approvazioni resta completo anche senza passaggio dall'amministrazione.
    const salvaDiretto = async () => {
        if (!selectedContract || Object.keys(pendingChanges).length === 0 || saving) return;
        setSaving(true);
        const esito = await applicaCambiamenti(selectedContract.id, pendingChanges,
            `${user?.name || "—"} (modifica diretta)`);
        if (esito && typeof esito === "object" && "cfConflitto" in esito) {
            // stesso flusso guidato dell'approvazione: qui l'admin è già nel
            // modale, quindi in alternativa può usare il bottone 🔀 Sposta cliente
            const g = esito.cfConflitto;
            setSaving(false);
            const okSposta = window.confirm(
                `Il codice fiscale ${g.cf} appartiene già a «${g.nome}»: non può stare su due schede.\n\n` +
                `OK = SPOSTA questa vendita sulla scheda di «${g.nome}» (CF invariato).\nAnnulla = non fare nulla.`);
            if (!okSposta) { setReqMsg(`CF già di «${g.nome}»: nessuna modifica applicata. In alternativa usa 🔀 Sposta cliente.`); return; }
            const sp = await spostaVenditaSuCliente(selectedContract.id, { id: g.id, etichetta: g.nome }, user?.name || "—");
            setReqMsg((sp.ok ? "✅ " : "") + sp.msg);
            if (sp.ok) { setDetailMode("view"); setSelectedContract(null); await fetchData(); }
            return;
        }
        if (esito) { setSaving(false); setReqMsg(esito as string); return; }
        const payload: Record<string, unknown> = { ...pendingChanges };
        if (reqNote.trim()) payload.__meta = { note: reqNote.trim() };
        const { error: tErr } = await supabase.from("contract_change_requests").insert({
            contract_id: selectedContract.id,
            requested_by: user?.id || null,
            requested_by_name: user?.name || "—",
            changes: payload,
            status: "approved",
            reviewed_by: user?.id || null,
            reviewed_by_name: user?.name || "—",
            reviewed_at: new Date().toISOString(),
            review_note: "modifica diretta",
        });
        setSaving(false);
        setReqMsg(tErr
            ? "Modifiche applicate al contratto, ma la traccia nello storico approvazioni non è stata salvata: " + tErr.message
            : "Modifiche applicate al contratto.");
        setDetailMode("view");
        await fetchData();
        await ricaricaAperto(selectedContract.id);
    };

    const decideRequest = async (req: any, approve: boolean, note?: string) => {
        setReqBusy(req.id);
        // Richiesta di CANCELLAZIONE (changes.__delete): approvare = eliminare
        // SOLO la riga contracts (nuovo disegno Luca 06/08) — anagrafica,
        // allegati e file restano agganciati al cliente (client_id +
        // FK SET NULL, mig. 20260806010000); la richiesta resta per lo storico.
        if (approve && (req.changes || {}).__delete) {
            const { error: dErr } = await supabase.from("contracts").delete().eq("id", req.contract_id);
            if (dErr) { setReqBusy(null); alert("Contratto NON eliminato: " + dErr.message); return; }
            await supabase.from("contract_change_requests").update({ status: "rejected", review_note: "Contratto eliminato", reviewed_by_name: user?.name || "—", reviewed_at: new Date().toISOString() }).eq("contract_id", req.contract_id).eq("status", "pending").neq("id", req.id);
        } else if (approve) {
            // RIC-04: stessa applicazione del salvataggio diretto (funzione
            // unica applicaCambiamenti). Se qualcosa va storto la richiesta
            // resta in attesa (gli errori non venivano letti — segnalazione 32).
            const firma = `${req.requested_by_name || "—"} → approvata da ${user?.name || "—"}`;
            let esito = await applicaCambiamenti(req.contract_id, req.changes || {}, firma);
            // ── FLUSSO GUIDATO CF DUPLICATO (10/08, caso Butnaru/Fei) ──
            // La richiesta "cambia CF" in realtà significa quasi sempre "la
            // vendita è intestata al cliente sbagliato". Invece del vicolo
            // cieco: proponiamo di SPOSTARE la vendita sulla scheda giusta,
            // poi riapplichiamo il resto della richiesta su quella scheda
            // (il CF a quel punto coincide e passa da solo).
            if (esito && typeof esito === "object" && "cfConflitto" in esito) {
                const g = esito.cfConflitto;
                const okSposta = window.confirm(
                    `Il codice fiscale ${g.cf} appartiene già a «${g.nome}»: non può stare su due schede.\n\n` +
                    `Questa richiesta in realtà dice che la vendita è intestata al cliente SBAGLIATO.\n\n` +
                    `OK = SPOSTA la vendita (contratto + marginalità dello stesso giorno) sulla scheda di «${g.nome}» e applica le altre correzioni lì.\n` +
                    `Annulla = non fare nulla (la richiesta resta in attesa).`);
                if (!okSposta) { setReqBusy(null); return; }
                const sp = await spostaVenditaSuCliente(req.contract_id, { id: g.id, etichetta: g.nome }, firma);
                if (!sp.ok) { setReqBusy(null); alert(sp.msg); return; }
                // riapplica la richiesta sulla scheda giusta: il cf_piva ora
                // coincide col cliente puntato → nessun conflitto; gli altri
                // campi (contratto/dettagli/cliente) vengono applicati normalmente
                esito = await applicaCambiamenti(req.contract_id, req.changes || {}, firma);
                if (esito && typeof esito === "string") { setReqBusy(null); alert("Vendita spostata, ma il resto della richiesta non è passato: " + esito); return; }
                await supabase.from("contract_change_requests").update({
                    status: "approved",
                    reviewed_by: user?.id || null,
                    reviewed_by_name: user?.name || "—",
                    reviewed_at: new Date().toISOString(),
                    review_note: `Gestita SPOSTANDO la vendita sulla scheda di «${g.nome}» (CF invariato). ${sp.msg}${note ? " · " + note : ""}`,
                }).eq("id", req.id);
                setReqBusy(null);
                await loadChangeReqs();
                await fetchData();
                await ricaricaAperto(req.contract_id);
                setReqMsg("✅ " + sp.msg);
                alert("✅ " + sp.msg);
                return;
            }
            if (esito) { setReqBusy(null); alert(esito as string); return; }
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
        await ricaricaAperto(req.contract_id);
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
                        const logo = TRK_BRAND_LOGOS[trkBrandKey(brand)];
                        // Qui non c'e' filtro KPI: il badge resta neutro, come
                        // il Tracking a riposo.
                        const colBadge = "var(--tf-94a3b8)";
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
                                className={cn("relative flex-1 min-w-0 flex items-center justify-center rounded-2xl border px-3 py-2 transition-all",
                                    active
                                        ? "border-indigo-400/80 bg-indigo-500/20 ring-1 ring-indigo-400/40 shadow-lg shadow-indigo-500/25 brightness-110"
                                        : "border-white/15 bg-white/[0.05] opacity-70 grayscale-[60%] hover:opacity-90 hover:grayscale-[30%]")}>
                                {/* RIC-01: box logo alla misura del Tracking (72px, logo 56
                                    + scala ottica per brand): loghi grandi uguali ovunque.
                                    RIC-06 v2 (Luca 05/08, screenshot 15:44): il numeretto
                                    si incolla all'ANGOLO VISIVO del logo (LogoConBadge,
                                    getBoundingClientRect) — il primo giro con top:0 lo
                                    spediva sul soffitto della tessera. Emoji 💰 e testo:
                                    badge ancorato all'elemento stesso (wrapper relative). */}
                                {!isExtra && logo ? (
                                    <LogoConBadge brand={brand} logo={logo} n={n} />
                                ) : (
                                    <span className="h-[72px] w-full flex items-center justify-center" title={brand}>
                                        <span className="relative inline-flex items-center justify-center max-w-full">
                                            {isExtra ? <span className="text-4xl">💰</span>
                                                : <span className="text-base font-bold text-slate-200 truncate max-w-full">{brand}</span>}
                                            <span className="absolute text-[11px] font-black leading-none px-1.5 py-[3px] rounded-full"
                                                style={{ left: "calc(100% - 8px)", top: -7, zIndex: 1, color: colBadge, background: "var(--tf-0d1424)", border: `1px solid ${colBadge}66`, opacity: n === 0 ? .5 : 1 }}>
                                                {n}
                                            </span>
                                        </span>
                                    </span>
                                )}
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
                                <>
                                    <p className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">Azione definitiva: la vendita sparisce da Ricerca Vendite, Gestione PDA, Tracking PDA e dal commissioning. Non si può annullare.</p>
                                    <p className="text-xs text-emerald-300/90 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">🗂 Restano conservati: l&apos;anagrafica del cliente e tutti gli allegati (documento d&apos;identità, contratto, altro) — li ritrovi nella scheda cliente.</p>
                                </>
                            ) : (
                                <>
                                    <label className="block text-sm font-medium text-slate-300">Motivo dell&apos;eliminazione <span className="text-rose-400">*</span></label>
                                    <textarea className="glass-input w-full min-h-[90px] resize-y text-sm" placeholder="Es. pratica duplicata / inserita per errore…"
                                        value={delMotivo} onChange={e => setDelMotivo(e.target.value)} />
                                    <p className="text-xs text-slate-500">La pratica sarà eliminata solo dopo l&apos;approvazione dell&apos;amministrazione (arriva anche nel fulmine ⚡). Anagrafica del cliente e allegati restano comunque conservati nella sua scheda.</p>
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
                                                ❌ Richiesta di CANCELLAZIONE della pratica{(r.changes?.__meta?.note) ? ` — motivo: “${r.changes.__meta.note}”` : ""} · approvare = eliminare definitivamente la vendita (anagrafica e allegati del cliente restano conservati)
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

                    {/* 1. Venditore — multi (RIC-06); il team resta in cima (segn. 26).
                        Se bloccato dal RBAC mostra il proprio nome, il filtro vero
                        resta lockedVenditore lato query. */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Venditore</label>
                        <FiltroMulti
                            disabled={!canPickVenditore}
                            testoDisabilitato={lockedVenditore || "Tutti"}
                            values={filterVenditori} onChange={setFilterVenditori}
                            opzioni={[...venditoriTeam, ...venditoriAltri]}
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
                        {/* RIC-06: multi-selezione, piu' negozi insieme */}
                        <FiltroMulti
                            values={filterNegozi} onChange={setFilterNegozi}
                            opzioni={uniqueNegozi}
                            etichettaTutti={isGlobalView ? "Tutti i negozi" : "Tutti i miei negozi"}
                            className="glass-input w-full text-sm"
                        />
                    </div>

                    {/* 7. Codice di inserimento */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Codice di inserimento</label>
                        {/* Segnalazione 53: tendina dei codici di inserimento (Cod.Ins.),
                            suddivisi per brand; se un brand e' selezionato mostra solo i suoi.
                            RIC-06: multi-selezione. */}
                        <FiltroMulti
                            values={filterCodiciIns} onChange={setFilterCodiciIns}
                            opzioni={[...new Set(filterBrand ? (codeByBrand[filterBrand] || []) : Object.values(codeByBrand).flat())]}
                            etichettaTutti="Tutti i codici"
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
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6 mt-6 pt-6 border-t border-white/5">
                    {/* 4-ante. Tipo cliente (MOD-30, Luca 10/08): PRIMA della categoria. */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Tipo cliente</label>
                        <FiltroMulti
                            values={filterTipoCliente} disabled={soloMarg}
                            testoDisabilitato="La Marginalità non ha tipo cliente"
                            onChange={setFilterTipoCliente}
                            opzioni={["Consumer", "Business"]}
                            etichettaTutti="Tutti i tipi"
                            className="glass-input w-full text-sm"
                        />
                    </div>

                    {/* 4-bis. Categoria (dal catalogo): sempre in fila — con la sola
                        Marginalità si spegne (per lei c'è la riga sotto). */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Categoria {catalogoBrand && soloBrandLabel && <span className="text-slate-500 font-normal">— {soloBrandLabel}</span>}</label>
                        {/* CONSEGUENZIALITÀ: cambiare le categorie azzera prodotti e
                            offerte (che si restringono alle nuove categorie). RIC-06: multi. */}
                        <FiltroMulti
                            values={filterCategorie} disabled={soloMarg}
                            testoDisabilitato="Per la Marginalità: riga sotto"
                            onChange={(v) => { setFilterCategorie(v); setFilterProdotti(null); setFilterOfferte(null); setFilterOpzioni(null); }}
                            opzioni={catalogoAttivo ? catalogoAttivo.catNames.filter((cn) => (catalogoAttivo.prodsByCat[cn] || []).some((pn) => _tipoOk(catalogoAttivo.prodTipi?.[pn]))) : catNomiAll}
                            etichettaTutti="Tutte le categorie"
                            className="glass-input w-full text-sm"
                        />
                    </div>

                    {/* 5. Prodotto (multiplo, dal CATALOGO): serve UN solo brand attivo
                        dalle tessere, altrimenti le variabili esplodono (regola Luca). */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Prodotto {soloBrandLabel && <span className="text-slate-500 font-normal">— {soloBrandLabel}</span>}</label>
                        {/* la lista segue le categorie scelte (unione). RIC-06: multi
                            con checkbox, default tutto selezionato. */}
                        <FiltroMulti
                            values={filterProdotti} onChange={setFilterProdotti}
                            opzioni={catalogoAttivo ? (filterCategorie?.length ? Array.from(new Set(filterCategorie.flatMap((c) => catalogoAttivo.prodsByCat[c] || []))) : catalogoAttivo.prodNames).filter((pn) => _tipoOk(catalogoAttivo.prodTipi?.[pn])) : []}
                            disabled={!catalogoAttivo}
                            testoDisabilitato="Carico il catalogo…"
                            etichettaTutti="Tutti i prodotti"
                            className="glass-input w-full text-sm"
                        />
                    </div>

                    {/* 5-bis. Offerta (multiplo, dal CATALOGO): stessa regola del prodotto;
                        se ci sono prodotti selezionati offre solo le loro offerte. */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Offerta {soloBrandLabel && <span className="text-slate-500 font-normal">— {soloBrandLabel}</span>}</label>
                        <FiltroMulti
                            values={filterOfferte} onChange={setFilterOfferte}
                            opzioni={offerteDisponibili}
                            etichette={offEtichette}
                            disabled={!catalogoAttivo}
                            testoDisabilitato="Carico il catalogo…"
                            etichettaTutti="Tutte le offerte"
                            className="glass-input w-full text-sm"
                        />
                    </div>
                    {/* OPZIONI (Luca 28/07): si sbloccano dopo l'offerta; multi. */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Opzioni {soloBrandLabel && <span className="text-slate-500 font-normal">— {soloBrandLabel}</span>}</label>
                        <FiltroMulti
                            values={filterOpzioni} onChange={setFilterOpzioni}
                            opzioni={opzioniDisponibili}
                            disabled={!catalogoAttivo || !filterOfferte?.length}
                            testoDisabilitato={!catalogoAttivo ? "Carico il catalogo…" : "Prima scegli un'offerta"}
                            etichettaTutti="Tutte le opzioni"
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
                        {/* RIC-06: multi anche qui (e via la <select> nuda, contro la
                            regola di progetto); cambiare i tipi azzera gli articoli. */}
                        <FiltroMulti
                            values={margTipi}
                            onChange={(v) => { setMargTipi(v); setMargArticoli(null); }}
                            opzioni={["prodotti", "servizi"]}
                            etichette={{ prodotti: "🛍 Prodotti", servizi: "🛠 Servizi" }}
                            disabled={!soloMarg}
                            testoDisabilitato="Clicca la sola tessera Marginalità"
                            etichettaTutti="Prodotti e servizi"
                            className="glass-input w-full"
                        />
                    </div>

                    {/* MARGINALITÀ layer 2: gli articoli del listino del tipo scelto
                        (multi, come i prodotti del catalogo). */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Articolo <span className="text-slate-500 font-normal">— Marginalità</span></label>
                        <FiltroMulti
                            values={margArticoli} onChange={setMargArticoli}
                            opzioni={margArticoliDisponibili}
                            disabled={!soloMarg || !margTipi?.length}
                            testoDisabilitato={!soloMarg ? "Clicca la sola tessera Marginalità" : "Prima scegli Prodotti o Servizi"}
                            etichettaTutti="Tutti gli articoli"
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
                    <button type="button" className="primary-btn h-10 px-8 text-sm" onClick={() => { setFilterVenditori(null); setFilterCodice(""); setFilterBrand(""); setFilterProdotti(null); setFilterCategorie(null); setFilterTipoCliente(null); setFilterOfferte(null); setFilterOpzioni(null); setMargTipi(null); setMargArticoli(null); setFilterNegozi(null); setFilterCodiciIns(null); setFilterCliente(""); setFilterCellulare(""); setFilterImei(""); setDaDataAttivazione(""); setADataAttivazione(""); }}>Annulla filtri</button>
                    <button type="button" disabled={exporting} className="px-8 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-semibold hover:bg-emerald-500/20 transition-all flex items-center gap-2 disabled:opacity-50" onClick={handleExportExcel}>
                        {exporting ? "Esportazione…" : "Scarica Excel"}
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
                                    {/* Con la sola tessera Marginalità (esito Luca 12/08) la colonna
                                        Offerta non dice nulla: diventa Importo, il € della vendita */}
                                    <th className="px-4 py-4 font-semibold">{soloMarg ? "Importo" : "Offerta"}</th>
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
                                        <td className="px-4 py-3 text-slate-400 text-xs">{(() => {
                                            if (soloMarg) {
                                                const det = (row.raw?.dettagli as Record<string, unknown>) || {};
                                                const imp = Number(det.importo ?? det.price ?? NaN);
                                                return isNaN(imp) ? "—" : <span className="text-emerald-300 font-semibold tabular-nums">{imp.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>;
                                            }
                                            return String((row.raw?.offerta as string) || ((row.raw?.dettagli as Record<string, unknown>)?.Offerta as string) || "—");
                                        })()}</td>
                                        <td className="px-4 py-3 text-slate-300 font-medium">{row.cliente}</td>
                                        <td className="px-4 py-3 text-slate-400 text-xs">{row.negozio}</td>
                                        <td className="px-4 py-3 text-slate-400 text-xs">{codInsDi(row) || "—"}</td>
                                        <td className="px-4 py-3 text-slate-400 font-mono text-xs">{row.codice_attivazione}</td>
                                        {/* orario di REGISTRAZIONE accanto alla data (Luca 10/08):
                                            created_at — quando la vendita è stata battuta nel CRM */}
                                        <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                                            {row.data_attivazione}
                                            {(() => {
                                                const t = new Date(String(row.raw?.created_at || ""));
                                                return isNaN(t.getTime()) ? null : (
                                                    <span className="ml-1.5 text-slate-600 tabular-nums" title="Orario di registrazione nel CRM">
                                                        {t.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                                                    </span>
                                                );
                                            })()}
                                        </td>
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
                                                    store manager. RIC-02: compare SOLO sulle pratiche
                                                    che il Tracking mostra davvero — stesso predicato
                                                    vaInTracking del suo filtro "lavorabili" — e mai su
                                                    quelle cestinate dal Tracking (tracking_nascosto):
                                                    prima portava su una lista vuota senza spiegazioni. */}
                                                {vaInTracking(row.raw) && !row.raw.tracking_nascosto && <button
                                                    onClick={() => {
                                                        const q = encodeURIComponent(row.cliente || "");
                                                        window.location.href = `/pda/tracking?q=${q}&id=${encodeURIComponent(row.id)}`;
                                                    }}
                                                    className="p-1.5 rounded bg-teal-500/20 text-teal-300 hover:bg-teal-500/30 transition-colors"
                                                    title="Apri in Tracking PDA">
                                                    <Navigation className="w-4 h-4" />
                                                </button>}
                                                {canEditContract && (
                                                    <button onClick={() => openContract(row, "edit")} className="p-1.5 rounded bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 transition-colors" title={modificaDiretta ? "Modifica contratto (si applica subito)" : "Modifica (richiede approvazione amministrazione)"}><Edit className="w-4 h-4" /></button>
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
                // riga a marginalità: fuori dal catalogo, tendine dedicate
                const isMarg = _isExtraBrand(editBrand || row.brand);
                // esclusi dai "Dettagli" per non averli due volte: il codice
                // inserimento (sta nel box Dati contratto) e la categoria di
                // catalogo (RIC-03: governata dalla tendina Categoria, mai piu'
                // testo libero — un refuso rompeva il filtro della pagina).
                // le OPZIONI non sono un dettaglio: vivono in "Dati del contratto"
                // (editor dedicato); "Offerta" e "menu_brand" sono doppioni di
                // campi gia' governati altrove (Luca 07/08)
                const detEditable = det.filter(([k, v]) => k !== codInsKey && k !== "categoria_catalogo" && k !== "Opzioni" && k !== "Offerta" && k !== "menu_brand" && (v === null || typeof v !== "object"));
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
                    // FIX Agenzia (Luca 05/08): negozi ATTIVI da stores (uffici
                    // inclusi) + radici storiche dei contratti — non piu' il solo
                    // distinct dello storico, che nascondeva i negozi senza vendite.
                    if (k === "contract::negozio") return negoziModale;
                    if (k === "contract::brand") return BRAND_CANONICI;  // lista ufficiale: un brand senza vendite (es. TIM) deve comunque esserci
                    // RIC-03: la catena categoria→prodotto→offerta arriva dal
                    // CATALOGO del brand della riga (come i filtri in alto), non
                    // piu' dai distinct dello storico ne' dalle 8 macro.
                    if (k === "dettagli::categoria_catalogo") return catalogoModale?.catNames ?? [];
                    if (k === "contract::prodotto") {
                        if (isMarg) return (margModale ?? []).map((x) => x.name);  // articoli del listino marginalità
                        if (!catalogoModale) return [];
                        const cat = editValues["dettagli::categoria_catalogo"] || "";
                        return cat ? (catalogoModale.prodsByCat[cat] || []) : catalogoModale.prodNames;
                    }
                    if (k === "contract::offerta") {
                        // assegnabile anche alle vendite pre-catalogo (Luca 04/08):
                        // offerte del prodotto scelto, incluse le disattivate.
                        if (isMarg || !catalogoModale) return [];
                        const prod = editValues["contract::prodotto"] || "";
                        if (prod) return catalogoModale.offByProd[prod] || [];
                        const cat = editValues["dettagli::categoria_catalogo"] || "";
                        return cat ? (catalogoModale.offsByCat[cat] || []) : catalogoModale.offNames;
                    }
                    if (k === "contract::categoria") return CATEGORIE_CANONICHE;  // resta solo per le righe Marginalità (fuori catalogo)
                    // Segnalazione 71/68: il codice di inserimento va a tendina con i
                    // codici VERI del brand (elenco unico condiviso con Registra
                    // Contratto). Prima si ricavavano dai contratti gia' salvati,
                    // quindi comparivano solo i codici gia' usati (per Kena il solo
                    // "Collatina") e per i brand senza storico non compariva nulla.
                    if (/^dettagli::cod\.?\s?ins/i.test(k)) {
                        // fallback (energia/brand non censiti): tutti i negozi
                        // attivi + radici storiche, non solo quelli con vendite
                        return codiciPerBrand(row.brand, negoziModale);
                    }
                    return null;
                };
                // RIC-03: conseguenzialità del catalogo anche nel modale, come nei
                // filtri in alto — cambiare categoria azzera prodotto e offerta;
                // cambiare prodotto mantiene l'offerta solo se gli appartiene ancora.
                const aggiornaCampo = (k: string, v: string) => {
                    setEditValues(prev => {
                        const next = { ...prev, [k]: v };
                        if (k === "dettagli::categoria_catalogo" && !isMarg) {
                            next["contract::prodotto"] = "";
                            next["contract::offerta"] = "";
                        }
                        if (k === "contract::prodotto" && !isMarg && catalogoModale) {
                            const offs = catalogoModale.offByProd[v] || [];
                            if (next["contract::offerta"] && !offs.includes(next["contract::offerta"])) next["contract::offerta"] = "";
                        }
                        // offerta cambiata (diretta o a cascata) → le opzioni non
                        // le appartengono piu': si riparte pulite; ma se si RITORNA
                        // all'offerta originale si riseminano quelle salvate (senza
                        // questo, un giro categoria-e-ritorno svuotava le opzioni
                        // in silenzio — verifica avversaria 07/08)
                        if (next["contract::offerta"] !== prev["contract::offerta"]) {
                            next["contract::opzioni"] = next["contract::offerta"] === String(row.raw?.offerta ?? "")
                                ? JSON.stringify(Array.isArray(row.raw?.opzioni) ? row.raw.opzioni : [])
                                : "[]";
                        }
                        return next;
                    });
                };
                const renderField = (k: string, label: string, kind?: string) => {
                    const orig = originalOf(row, k);
                    const inRichiesta = pendingKeys.includes(k);
                    if (detailMode === "view") {
                        return (
                            <div key={k} className={inRichiesta ? "rounded-lg ring-2 ring-amber-400/60 bg-amber-400/10 px-2 py-1.5 -mx-2" : undefined}>
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
                                /* regola di progetto: tendine = SelectOpzioni, mai <select> nudi */
                                <SelectOpzioni className={cls} value={val}
                                    onChange={v => setEditValues(prev => ({ ...prev, [k]: v }))}
                                    opzioni={Array.from(new Set([...STATI, val].filter(Boolean)))}
                                    placeholder="— scrivi o scegli" />
                            ) : opts ? (
                                /* il valore corrente resta selezionabile anche se fuori
                                   lista ([...opts, val]): lo storico pre-catalogo non si perde */
                                <SelectOpzioni className={cls} value={val}
                                    onChange={v => aggiornaCampo(k, v)}
                                    opzioni={Array.from(new Set([...opts, val].filter(Boolean)))}
                                    placeholder="— scrivi o scegli" />
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

                // ── OPZIONI CONTRATTUALIZZATE (Luca 07/08): editor in "Dati del
                //    contratto" — le opzioni vanno in GARA, non sono un dettaglio.
                //    Regole del Registra replicate: gruppo ¹ mutuamente esclusivo,
                //    tetto condiviso Bundle+Accessori ≤ 3, quantità sui vincolati;
                //    le opzioni salvate fuori catalogo restano visibili e rimovibili.
                const _ropKasko = (n: string) => /kasko/i.test(n);
                const _ropBundle = (n: string) => !_ropKasko(n) && /bundle/i.test(n);
                const _ropAcc = (n: string) => !_ropKasko(n) && /accessori/i.test(n);
                const MAX_OPZ_VINC = 3;
                const opzSel = ((): { nome: string; quantita: number | null }[] => {
                    try { const a = JSON.parse(editValues["contract::opzioni"] || "[]"); return Array.isArray(a) ? a : []; } catch { return []; }
                })();
                const opzWrite = (arr: { nome: string; quantita: number | null }[]) => {
                    setEditValues(prev => ({ ...prev, ["contract::opzioni"]: JSON.stringify(arr) }));
                    // toccando le opzioni apro la sezione Campi vendita: se l'opzione
                    // aggiunta richiede campi nuovi, il venditore li vede e li compila (MOD-1b)
                    setOpenSecs(p => ({ ...p, campi: true }));
                };
                const opzQta = (o: { quantita: number | null }) => Math.max(1, Number(o.quantita || 1));
                const opzVinc = opzSel.filter(o => _ropBundle(o.nome) || _ropAcc(o.nome)).reduce((sm, o) => sm + opzQta(o), 0);

                // ── MOD-1b (Luca 08/08): i CAMPI VENDITA che le OPZIONI si portano
                //    dietro. Le regole del catalogo (catalog_campi_regole con
                //    condizione opzioni) + i campi dinamici Bundle/Accessori/Kasko
                //    (Codice Bundle N / Imei Accessorio N / Seriale Kasko) danno i
                //    campi ATTESI per l'offerta+opzioni; quelli NON ancora nei
                //    dettagli sono i "campi da compilare" — la sezione 🧾 li mostra
                //    e si apre da sola per suggerirli.
                const _norm = (s: string) => String(s || "").trim().toLowerCase();
                // Il contratto può portare una grafia vecchia dell'offerta (caso
                // Underground «9.99» vs catalogo «9,99», Luca 20/08): opzioni e
                // campi si cercano per nome ESATTO e sparivano dal modale. Se il
                // nome non è a catalogo ma esiste un gemello che differisce solo
                // per punto/virgola/spazi/maiuscole, si usa quello.
                const _offKey = (s: string) => _norm(s).replace(/\./g, ",");
                const offertaCanonica = (nome: string): string => {
                    if (!nome || !catalogoModale || (catalogoModale.offNames || []).includes(nome)) return nome;
                    return (catalogoModale.offNames || []).find(n => _offKey(n) === _offKey(nome)) || nome;
                };
                const campiDinamiciDaOpzioni = (): string[] => {
                    const out: string[] = []; let nAcc = 0; let kasko = false;
                    opzSel.forEach(o => {
                        if (_ropKasko(o.nome)) { kasko = true; return; }
                        if (_ropBundle(o.nome)) { const q = opzQta(o); for (let i = 1; i <= q; i++) out.push("Codice " + o.nome + (q > 1 ? " (" + i + ")" : "")); }
                        else if (_ropAcc(o.nome)) nAcc += opzQta(o);
                    });
                    for (let i = 1; i <= nAcc; i++) out.push("Imei Accessorio " + i);
                    if (kasko) out.push("Seriale Kasko");
                    return out;
                };
                const campiAttesi: string[] = (isMarg || detailMode === "view") ? [] : (() => {
                    const slug = LABEL_SLUG[String(editBrand || row.brand)] || String(editBrand || row.brand || "").toLowerCase();
                    const tipoCli = _norm(String(row.client?.tipo ?? "")) === "business" ? "Business" : "Consumer";
                    const cat = String(editValues["dettagli::categoria_catalogo"] || (row.raw?.dettagli as Record<string, unknown> | undefined)?.categoria_catalogo || row.raw?.categoria || "");
                    const prod = String(editValues["contract::prodotto"] || row.prodotto || "");
                    const off = offertaCanonica(String(editValues["contract::offerta"] || ""));
                    const attive = opzSel.map(o => String(o.nome));
                    const base = risolviCampi(slug, tipoCli, cat, prod, off, attive).map(c => c.nome);
                    return Array.from(new Set([...base, ...campiDinamiciDaOpzioni()]));
                })();
                // campi già presenti nei dettagli (qualunque forma) → non "mancanti".
                // Il Registra RINOMINA alcune chiavi al salvataggio (registra-vendita
                // ~4573): "Seriale SIM (ICCID)"→"ICCID", "Codice Inserimento"→"Cod.Ins."
                // — vanno normalizzate o un campo compilato risulterebbe mancante
                // (falso positivo + rischio chiave doppia al ri-salvataggio).
                const _RENAME_DET: Record<string, string> = { "Seriale SIM (ICCID)": "ICCID", "Codice Inserimento": "Cod.Ins." };
                const _detNomi = new Set(det.map(([k]) => k));
                const _presente = (n: string) => _detNomi.has(n) || _detNomi.has(_RENAME_DET[n] || "\u0000");
                const campiMancanti = campiAttesi.filter(n => n && !_presente(n) && n !== "Codice Inserimento" && n !== "Offerta" && n !== "Seriale SIM (ICCID)");

                const renderOpzioni = () => {
                    if (detailMode === "view" || isMarg) {
                        const inRichiesta = pendingKeys.includes("contract::opzioni");
                        return (
                            <div className={cn("sm:col-span-2 lg:col-span-3", inRichiesta && "rounded-lg ring-2 ring-amber-400/60 bg-amber-400/10 px-2 py-1.5 -mx-2")}>
                                <span className="text-[11px] uppercase tracking-wider text-slate-500">Opzioni{inRichiesta && <span className="ml-1.5 text-amber-300 font-bold normal-case">· modifica richiesta</span>}</span>
                                <p className="text-white text-sm break-words">{fmtOpzioni(row.raw?.opzioni)}</p>
                            </div>
                        );
                    }
                    const off = offertaCanonica(editValues["contract::offerta"] || "");
                    const meta = catalogoModale?.opzMetaByOff?.[off] || [];
                    const fuoriCat = opzSel.filter(o => !meta.some(m => m.nome === o.nome)).map(o => ({ nome: o.nome, tipo: null as string | null, gruppo: null as string | null }));
                    const tutte = [...meta, ...fuoriCat];
                    const changed = editValues["contract::opzioni"] !== String(originalOf(row, "contract::opzioni") ?? "[]");
                    const toggle = (m: { nome: string; tipo: string | null; gruppo: string | null }) => {
                        const on = opzSel.some(o => o.nome === m.nome);
                        if (on) { opzWrite(opzSel.filter(o => o.nome !== m.nome)); return; }
                        if ((_ropBundle(m.nome) || _ropAcc(m.nome)) && opzVinc >= MAX_OPZ_VINC) return;
                        let next = opzSel;
                        if (m.gruppo) { const stesse = new Set(tutte.filter(x => x.gruppo === m.gruppo).map(x => x.nome)); next = next.filter(o => !stesse.has(o.nome)); }
                        opzWrite([...next, { nome: m.nome, quantita: (m.tipo === "numero" || _ropBundle(m.nome) || _ropAcc(m.nome)) ? 1 : null }]);
                    };
                    const setQta = (nome: string, q: number) => {
                        const cur = opzSel.find(o => o.nome === nome); if (!cur) return;
                        let n = Math.max(1, q || 1);
                        if (_ropBundle(nome) || _ropAcc(nome)) { const altre = opzVinc - opzQta(cur); n = Math.max(1, Math.min(n, MAX_OPZ_VINC - altre)); }
                        opzWrite(opzSel.map(o => o.nome === nome ? { ...o, quantita: n } : o));
                    };
                    const haVinc = tutte.some(m => _ropBundle(m.nome) || _ropAcc(m.nome));
                    return (
                        <div className={cn("sm:col-span-2 lg:col-span-3", changed && "rounded-lg ring-1 ring-amber-400/50 bg-amber-400/5 p-2 -m-2")}>
                            <span className="text-[11px] uppercase tracking-wider text-slate-500">
                                Opzioni{haVinc && <span className={cn("normal-case font-bold ml-1.5", opzVinc >= MAX_OPZ_VINC ? "text-amber-300" : "text-slate-500")}>Bundle+Accessori: {opzVinc}/{MAX_OPZ_VINC}</span>}
                            </span>
                            {tutte.length === 0 ? (
                                <p className="text-xs text-slate-500 mt-1">{off ? "L'offerta non ha opzioni a catalogo." : "Scegli prima l'offerta: le opzioni arrivano dal catalogo."}</p>
                            ) : (
                                <div className="flex flex-wrap gap-2 mt-1.5">
                                    {tutte.map(m => {
                                        const sel = opzSel.find(o => o.nome === m.nome);
                                        const bloccata = !sel && (_ropBundle(m.nome) || _ropAcc(m.nome)) && opzVinc >= MAX_OPZ_VINC;
                                        return (
                                            <span key={m.nome} className="inline-flex items-center gap-1.5">
                                                <button type="button" onClick={() => toggle(m)} disabled={bloccata}
                                                    title={bloccata ? `Massimo ${MAX_OPZ_VINC} elementi tra Bundle e Accessori` : undefined}
                                                    className={cn("px-3 py-1.5 rounded-full text-[11px] font-bold border transition-colors",
                                                        sel ? "border-indigo-400/70 bg-indigo-500/20 text-white" : "border-white/15 bg-white/5 text-slate-400 hover:bg-white/10",
                                                        bloccata && "opacity-35 cursor-not-allowed")}>
                                                    {sel ? "✓ " : ""}{m.nome}{m.gruppo ? " ¹" : ""}
                                                </button>
                                                {sel && sel.quantita != null && (
                                                    <input type="number" min={1} value={opzQta(sel)}
                                                        onChange={e => setQta(m.nome, parseInt(e.target.value || "1", 10) || 1)}
                                                        className="w-14 glass-input text-xs text-right" />
                                                )}
                                            </span>
                                        );
                                    })}
                                </div>
                            )}
                            <p className="text-[10px] text-slate-600 mt-1.5">Le opzioni vanno in gara e nei compensi. Le voci di marginalità già nate dalla vendita (es. bundle) NON si ricalcolano da qui.</p>
                        </div>
                    );
                };

                {/* Segnalazione 92 (regola ancora valida): funzione che RESTITUISCE JSX,
                    mai un componente definito nel render — cambierebbe identita' a ogni
                    battuta e React rimonterebbe le caselle (focus perso).
                    RIC-05 (Luca 05/08): sezione RICHIUDIBILE — intestazione-icona
                    cliccabile con chevron e riassunto inline quando e' chiusa. */}
                const SectionC = (id: string, icona: string, titolo: string, riassunto: string, children: React.ReactNode) => {
                    const open = !!openSecs[id];
                    return (
                        <div className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
                            <button type="button" onClick={() => toggleSec(id)} aria-expanded={open}
                                className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-white/[0.05] transition-colors">
                                <span className="text-base leading-none shrink-0">{icona}</span>
                                <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider shrink-0">{titolo}</span>
                                {!open && riassunto && <span className="text-xs text-slate-400 truncate flex-1 min-w-0">{riassunto}</span>}
                                <ChevronDown className={cn("w-4 h-4 text-slate-400 shrink-0 ml-auto transition-transform", !open && "-rotate-90")} />
                            </button>
                            {open && <div className="px-4 pb-4 pt-3 border-t border-white/10 space-y-4">{children}</div>}
                        </div>
                    );
                };
                // RIC-05: spartizione dei CONTRACT_FIELDS tra le sezioni 📄 e 🏪
                // (ATTRIB_KEYS nell'ordine voluto: venditore, negozio, date).
                const contrattoFields = CONTRACT_FIELDS.filter(f => !ATTRIB_KEYS.includes(f.key));
                const attribFields = ATTRIB_KEYS.map(k => CONTRACT_FIELDS.find(f => f.key === k)).filter(Boolean) as EditField[];
                // riassunti inline delle sezioni chiuse
                const tipoCliente = String(row.client?.tipo || "");
                const isBusiness = tipoCliente.toLowerCase() === "business";
                const dataBreve = (s: string) => { const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}` : (s && s !== "—" ? s : ""); };
                const riasDati = [editBrand || row.brand, row.prodotto, row.stato].filter(s => s && s !== "—").join(" · ");
                const riasAttrib = [row.negozio, row.venditore, dataBreve(row.data_attivazione)].filter(s => s && s !== "—").join(" · ");

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
                                    {/* SPOSTA a un altro cliente (Luca 08/08): solo modifica diretta,
                                        per correggere una vendita intestata alla scheda sbagliata */}
                                    {detailMode === "edit" && modificaDiretta && !isMarg && (
                                        <button onClick={() => setSpostaOpen(v => !v)}
                                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 flex items-center gap-1.5">
                                            🔀 Sposta cliente
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
                                {/* SPOSTA CONTRATTO AD ALTRO CLIENTE (Luca 08/08) */}
                                {spostaOpen && detailMode === "edit" && modificaDiretta && (
                                    <div className="rounded-xl border border-amber-400/40 bg-amber-400/[0.06] p-4 space-y-3">
                                        <div className="text-sm font-bold text-amber-200">🔀 Sposta a un altro cliente</div>
                                        <p className="text-xs text-slate-400">Cerca la scheda cliente giusta (CF, nome o cellulare): il contratto <b className="text-slate-200">{row.id}</b> verrà intestato a quella scheda. I dati del contratto restano invariati.</p>
                                        <input value={spostaQuery} onChange={e => setSpostaQuery(e.target.value)} autoFocus
                                            placeholder="CF, nome, cognome o cellulare…" className="glass-input w-full text-sm" />
                                        <div className="space-y-1.5 max-h-56 overflow-y-auto">
                                            {spostaQuery.trim().length < 3 ? <p className="text-[11px] text-slate-500">Scrivi almeno 3 caratteri.</p>
                                                : spostaHits.length === 0 ? <p className="text-[11px] text-slate-500">Nessun cliente trovato.</p>
                                                    : spostaHits.filter(h => h.id !== row.raw?.client_id).map(h => {
                                                        const nome = h.ragione_sociale || `${h.nome || ""} ${h.cognome || ""}`.trim() || "—";
                                                        return (
                                                            <button key={h.id} disabled={spostaBusy} onClick={() => spostaContrattoA(h)}
                                                                className="w-full flex items-center gap-2 text-left rounded-lg bg-white/[0.03] border border-white/10 px-3 py-2 hover:bg-white/[0.07] hover:border-amber-400/40 disabled:opacity-50">
                                                                <span className="text-xs font-semibold text-slate-100 truncate flex-1">{nome}</span>
                                                                <span className="text-[10px] font-mono text-slate-400">{h.cf_piva || "senza CF"}</span>
                                                                {h.cellulare && <span className="text-[10px] text-slate-500">· {h.cellulare}</span>}
                                                                <span className="text-[10px] font-bold text-amber-300">sposta →</span>
                                                            </button>
                                                        );
                                                    })}
                                        </div>
                                    </div>
                                )}
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
                                        {modificaDiretta
                                            ? "Hai la modifica diretta: il salvataggio applica subito i cambiamenti al contratto (restano tracciati nello Storico Approvazioni)."
                                            : "Le modifiche non sono immediate: vengono inviate come richiesta di approvazione all'amministrazione."}
                                    </div>
                                )}


                                {/* RIC-05: contenuto in 4 SEZIONI RICHIUDIBILI (Luca 05/08).
                                    Solo disposizione: pendingChanges/labelOf/evidenza ambra
                                    e le logiche di salvataggio restano identiche. */}
                                <div className="space-y-3">
                                    {SectionC("anagrafica", isBusiness ? "🏢" : "👤", "Anagrafica cliente",
                                        [row.cliente, tipoCliente].filter(s => s && s !== "—").join(" · "),
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                            {CLIENT_FIELDS.map(f => renderField("client::" + f.key, f.label, f.kind))}
                                        </div>)}

                                    {SectionC("contratto", "📄", "Dati del contratto", riasDati,
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                            {contrattoFields.map(f => (
                                                // RIC-03: per le righe a catalogo la Categoria mostrata e
                                                // modificata e' quella FINE (dettagli.categoria_catalogo),
                                                // la stessa su cui filtra la pagina; canonica e macro si
                                                // derivano all'approvazione. La Marginalità resta sulla
                                                // canonica (fuori catalogo).
                                                f.key === "categoria" && !isMarg
                                                    ? renderField("dettagli::categoria_catalogo", "Categoria")
                                                    : renderField("contract::" + f.key, f.label, f.kind)
                                            ))}
                                            {/* OPZIONI (Luca 07/08): parte integrante del contratto —
                                                editor a chips col catalogo dell'offerta, quantita' e
                                                tetto Bundle+Accessori come nel Registra. */}
                                            {renderOpzioni()}
                                        </div>)}

                                    {SectionC("campi", "🧾", "Campi vendita",
                                        campiMancanti.length ? `${detEditable.length} campi · ${campiMancanti.length} da compilare` : (detEditable.length ? `${detEditable.length} campi` : "nessun campo"),
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                            {detEditable.length === 0 && campiMancanti.length === 0 && <p className="text-sm text-slate-500 sm:col-span-2 lg:col-span-3">Nessun campo vendita su questa pratica.</p>}
                                            {detEditable.map(([k]) => renderField("dettagli::" + k, k))}
                                            {/* MOD-1b: i campi che le OPZIONI scelte si portano dietro e
                                                che non sono ancora compilati — evidenziati, da riempire */}
                                            {campiMancanti.length > 0 && detailMode === "edit" && (
                                                <div className="sm:col-span-2 lg:col-span-3 rounded-lg border border-amber-400/40 bg-amber-400/[0.06] p-3">
                                                    <div className="text-[11px] font-bold text-amber-300 uppercase tracking-wider mb-2">⚠ Campi richiesti dalle opzioni — da compilare</div>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                        {campiMancanti.map((k) => renderField("dettagli::" + k, k))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>)}

                                    {SectionC("allegati", "📎", "Allegati",
                                        allegati.length === 0 ? "nessun documento sulla pratica" : `${allegati.length} ${allegati.length === 1 ? "documento" : "documenti"}`,
                                        <div className="space-y-2">
                                            {attMsg && <div className="text-sm font-medium text-rose-300">{attMsg}</div>}
                                            {allegati.length === 0 ? (
                                                <p className="text-sm text-slate-500">
                                                    Nessun allegato agganciato a questa pratica.
                                                    {row.raw?.client_id ? " Gli altri documenti del cliente sono nella sua scheda (bottone “Documenti cliente” in alto)." : ""}
                                                </p>
                                            ) : allegati.map(a => {
                                                const isImg = /\.(jpe?g|png|webp|gif|heic)$/i.test(a.file_name || a.file_url);
                                                const emoji = ALLEGATO_EMOJI[String(a.file_type || "").toLowerCase()] || "📁";
                                                return (
                                                    <div key={a.id} className="flex items-center gap-3 rounded-lg bg-white/5 border border-white/10 px-3 py-2">
                                                        <a href={a.file_url} target="_blank" rel="noopener noreferrer" className="shrink-0" title="Apri in una nuova scheda">
                                                            {isImg
                                                                ? <img src={a.file_url} alt={a.file_name} className="w-10 h-10 rounded-md object-cover border border-white/10" />
                                                                : <span className="w-10 h-10 rounded-md bg-white/5 border border-white/10 flex items-center justify-center text-lg">{emoji}</span>}
                                                        </a>
                                                        <div className="min-w-0 flex-1">
                                                            <a href={a.file_url} target="_blank" rel="noopener noreferrer"
                                                                className="text-sm font-medium text-white hover:text-indigo-300 hover:underline break-all">
                                                                {a.file_name || "allegato"}
                                                            </a>
                                                            <p className="text-[11px] text-slate-500">
                                                                {emoji} {String(a.file_type || "altro")}{a.created_at ? " · " + new Date(a.created_at).toLocaleDateString("it-IT") : ""}
                                                            </p>
                                                        </div>
                                                        {/* 🗑 SOLO in edit e SOLO con modifica DIRETTA (stesse regole
                                                            della rotellina); conferma esplicita inline. */}
                                                        {detailMode === "edit" && modificaDiretta && (attDelId === a.id ? (
                                                            <div className="flex items-center gap-1.5 shrink-0">
                                                                <span className="text-[11px] font-semibold text-rose-300">Eliminare?</span>
                                                                <button disabled={attBusy} onClick={() => eliminaAllegato(a)}
                                                                    className="px-2 py-1 rounded-md text-[11px] font-bold bg-rose-500/20 border border-rose-500/40 text-rose-300 hover:bg-rose-500/30 disabled:opacity-50">
                                                                    {attBusy ? "Attendere…" : "Sì, elimina"}
                                                                </button>
                                                                <button disabled={attBusy} onClick={() => setAttDelId(null)}
                                                                    className="px-2 py-1 rounded-md text-[11px] font-semibold bg-white/5 text-slate-300 hover:bg-white/10">
                                                                    Annulla
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <button onClick={() => setAttDelId(a.id)} title="Elimina questo allegato"
                                                                className="p-1.5 rounded-md bg-rose-500/10 text-rose-400 hover:bg-rose-500/25 transition-colors shrink-0">
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        ))}
                                                    </div>
                                                );
                                            })}
                                            {detailMode === "edit" && !modificaDiretta && allegati.length > 0 && (
                                                <p className="text-xs text-slate-500 italic">
                                                    Gli allegati qui sono in sola lettura: l&apos;eliminazione richiede la modifica diretta — chiedi all&apos;amministrazione.
                                                </p>
                                            )}
                                        </div>)}

                                    {SectionC("attrib", "🏪", "Attribuzione & dettagli", riasAttrib,
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                            {attribFields.map(f => renderField("contract::" + f.key, f.label, f.kind))}
                                            {/* Segnalazione 67/71: codice inserimento modificabile a
                                                tendina (chiave nei dettagli, varia per brand). */}
                                            {renderField("dettagli::" + codInsKey, "Codice inserimento")}
                                            {/* i CAMPI VENDITA sono nella sezione 🧾 dedicata (Luca 07/08) */}
                                            {/* Mai più JSON grezzo (Luca/Francesco 10-11/08): followup,
                                                units e ogni altro valore annidato diventano righe
                                                leggibili — e spariscono se vuoti (VoceAnnidata). */}
                                            {detReadonly.map(([k, v]) => (
                                                <VoceAnnidata key={k} nome={k} valore={v}
                                                    wrapperClassName="sm:col-span-2 lg:col-span-3"
                                                    labelClassName="text-[11px] uppercase tracking-wider text-slate-500" />
                                            ))}
                                            {READONLY_META.map(f => (
                                                <div key={f.key}>
                                                    <span className="text-[11px] uppercase tracking-wider text-slate-500">{f.label}</span>
                                                    <p className="text-white text-sm font-mono break-all">{fmtVal(row.raw?.[f.key])}</p>
                                                </div>
                                            ))}
                                        </div>)}
                                </div>

                                {detailMode === "edit" && (
                                    <div className="pt-4 border-t border-white/10 space-y-3">
                                        <div>
                                            {/* RIC-04: col salvataggio diretto il motivo non blocca (resta
                                                comunque nella traccia dello storico approvazioni) */}
                                            <label className="block text-xs font-semibold text-slate-400 mb-1">Motivo della modifica {modificaDiretta
                                                ? <span className="text-slate-500 font-normal">(facoltativo: resta nello storico)</span>
                                                : <span className="text-rose-400">* obbligatorio</span>}</label>
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
                                            onClick={modificaDiretta ? salvaDiretto : submitChangeRequest}
                                            className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold bg-indigo-500 hover:bg-indigo-600 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            {saving ? (modificaDiretta ? "Salvataggio..." : "Invio...")
                                                : nChanges === 0 ? "Nessuna modifica"
                                                : modificaDiretta ? "Salva le modifiche" : "Invia richiesta di approvazione"}
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
            {/* PICKER righe da spostare (vendita mista, Luca 10/08) — portal sul
                body: deve funzionare sia dal modale sia dal pannello richieste */}
            {pickerSposta && createPortal(
                <div className="fixed inset-0 z-[6000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={e => { if (e.target === e.currentTarget) pickerSposta.done(null); }}>
                    <div className="w-full max-w-md rounded-2xl border border-amber-400/40 bg-[#0e1526] p-6 shadow-2xl">
                        <h3 className="text-base font-bold text-white mb-1">Cosa sposto su «{pickerSposta.target}»?</h3>
                        <p className="text-xs text-slate-400 mb-4">Questa vendita ha più righe. Togli la spunta a ciò che deve <b className="text-slate-200">RESTARE sul cliente attuale</b> (es. prodotti di un'altra persona registrati nella stessa vendita).</p>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            {pickerSposta.righe.map((r, i) => (
                                <label key={r.id} className="flex items-center gap-2.5 rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 cursor-pointer hover:bg-white/[0.07]">
                                    <input type="checkbox" checked={r.sel} className="accent-amber-400"
                                        onChange={() => setPickerSposta(p => p ? { ...p, righe: p.righe.map((x, xi) => xi === i ? { ...x, sel: !x.sel } : x) } : p)} />
                                    <span className="min-w-0">
                                        <span className="block text-sm font-semibold text-slate-100 truncate">{r.etichetta}</span>
                                        <span className="block text-[10px] font-mono text-slate-500 truncate">{r.sub}</span>
                                    </span>
                                </label>
                            ))}
                        </div>
                        <div className="flex justify-end gap-2.5 mt-5">
                            <button onClick={() => pickerSposta.done(null)}
                                className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-300 border border-white/15 hover:bg-white/5">Annulla</button>
                            <button onClick={() => pickerSposta.done(pickerSposta.righe.filter(r => r.sel).map(r => r.id))}
                                disabled={!pickerSposta.righe.some(r => r.sel)}
                                className="px-4 py-2 rounded-xl text-sm font-bold text-black bg-amber-400 hover:bg-amber-300 disabled:opacity-40">
                                Sposta {pickerSposta.righe.filter(r => r.sel).length} rig{pickerSposta.righe.filter(r => r.sel).length === 1 ? "a" : "he"} →
                            </button>
                        </div>
                    </div>
                </div>, document.body)}
        </div>
    );
}
