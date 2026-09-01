"use client";

/* ═══ PAYSTORE — LE RICARICHE VENDUTE ══════════════════════════════════════
   Il registro esiste dal 01/09, insieme al brand. Questa è la finestra da cui
   si guarda: quante ne abbiamo fatte, per quanti euro, chi, dove — e
   soprattutto QUALI SONO DA GUARDARE.

   ⚠️ LE RICARICHE DA GUARDARE STANNO IN CIMA. Una ricarica incassata e non
   erogata è l'unica ragione per cui uno apre questa schermata di fretta: se
   stesse in fondo a un elenco, tanto valeva non scriverla. Oggi non ce ne
   sono, perché il credito lo carica una persona subito dopo l'incasso e la
   riga nasce 'manuale'. Da domani, con l'API, questo riquadro è il posto in
   cui si vede che qualcosa non è partito.

   ⚠️ I NUMERI DEI CLIENTI NON PASSANO DAL BROWSER PER CASO: la tabella è
   revocata, i dati arrivano da una rotta server che controlla il permesso di
   sezione. Nell'elenco il numero si vede — serve a ritrovare la ricarica di
   un cliente che chiama — ma non esiste una query aperta che li tiri fuori
   tutti.

   Il livello di questa schermata è quello di docs/STANDARD_DESIGN.md: gli
   strumenti sono quelli di Analisi, il periodo si sceglie, ogni numero si
   può interrogare. */

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { RefreshCw, ChevronLeft, ChevronRight, AlertTriangle, Plus, Power, Trash2, Check } from "lucide-react";
import { cn } from "@/utils";
import { SelectOpzioni } from "@/components/SelectPersona";
import { OPERATORI_PAYSTORE } from "../../registra-vendita/PayStore";
/* ⚠️ `_charts` è JS con i default nei parametri: TypeScript ne deduce tipi
   sbagliati. Si importano così, come dice lo standard. */
import * as G from "../../analisi/_charts";
const BarStack = G.BarStack as unknown as (p: Record<string, unknown>) => React.ReactElement;
const RaceBars = G.RaceBars as unknown as (p: Record<string, unknown>) => React.ReactElement;
const Donut = G.Donut as unknown as (p: Record<string, unknown>) => React.ReactElement;
const Delta = G.Delta as unknown as (p: Record<string, unknown>) => React.ReactElement;
const Tip = G.Tip as unknown as (p: Record<string, unknown>) => React.ReactElement;
const TipRiga = G.TipRiga as unknown as (p: Record<string, unknown>) => React.ReactElement;
const TipTitolo = G.TipTitolo as unknown as (p: Record<string, unknown>) => React.ReactElement;

const MESI = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
const oggiISO = () => new Date().toISOString().slice(0, 10);
const primoDelMese = () => oggiISO().slice(0, 8) + "01";
const eur = (n: number) => (Number(n) || 0).toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const eurC = (n: number) => (Number(n) || 0).toLocaleString("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
/* ⚠️ I COLORI VERI DEI MARCHI, gli stessi del resto del CRM (Luca 01/09:
   «sistemi i colori dei brand e allineameli»). Vodafone è rosso, WindTre
   arancione, TIM blu: chi guarda l'elenco riconosce l'operatore dal colore
   prima di leggere il nome, e lo riconosce perché è lo stesso che vede nel
   Tracking e in Ricerca Vendite. Prima venivano da una palette generica
   assegnata per posizione, e Vodafone era viola.
   Gli operatori che il CRM non vende — quelli che si possono solo ricaricare
   — non hanno un colore di marchio: prendono una tinta neutra della palette,
   distinta per posizione. */
const TINTE = ["#94a3b8", "#818cf8", "#34d399", "#38bdf8", "#f472b6", "#a78bfa", "#fb923c", "#4ade80"];
const COLORI_PS: Record<string, string> = {
    tim: "#0050ff", vodafone: "#e60000", windtre: "#f97316", iliad: "#c00028",
    fastweb: "#eab308", ho: "#9b26b6", very: "#84cc16", kena: "#e4002b",
    poste: "#ffd400", coopvoce: "#e2001a", lyca: "#f5a300", tiscali: "#00a0dd",
    digi: "#e30613", optima: "#00a651", spusu: "#e5007d", unomobile: "#0072c6",
    withu: "#00c389", daily: "#004b93",
};
const tintaOp = (op: string) => {
    if (COLORI_PS[op]) return COLORI_PS[op];
    const i = OPERATORI_PAYSTORE.findIndex((o) => o.id === op);
    return TINTE[(i < 0 ? OPERATORI_PAYSTORE.length : i) % TINTE.length];
};
/* i negozi non hanno un colore di marchio: una scala che li distingue e basta */
const TINTE_NEG = ["#f8b516", "#818cf8", "#34d399", "#38bdf8", "#f472b6", "#a78bfa", "#fb923c", "#4ade80", "#facc15", "#22d3ee"];
const TUTTI_N = "Tutti i negozi";
const TUTTI_O = "Tutti gli operatori";
const nomeOp = (id: string) => OPERATORI_PAYSTORE.find((o) => o.id === id)?.label || id;

type Riga = { id: string; creata_il: string; negozio: string | null; venditore: string | null; operatore: string; operatore_nome: string | null; numero: string; taglio: string | null; importo: number; stato: string; errore: string | null; azienda: string | null; nota: string | null; stato_da: string | null; stato_il: string | null };
type Taglio = { id: string; operatore: string; etichetta: string; valore: number; ordine: number; attivo: boolean; origine: string };
type Dati = {
    da: string; a: string;
    totale: { quante: number; euro: number; euroPrima: number };
    daGuardare: Riga[];
    perStato: { stato: string; quante: number }[];
    perGiorno: { giorno: string; quante: number; euro: number; parti: { operatore: string; nome: string; quante: number; euro: number }[] }[];
    perOperatore: { operatore: string; nome: string; quante: number; euro: number }[];
    perNegozio: { negozio: string; quante: number; euro: number }[];
    ultime: Riga[];
    negozi: string[]; operatori: string[];
    tagli: Taglio[];
};

/* i codici delle due società, scritti come li conosce chi legge */
const SOCIETA: Record<string, string> = { T1: "Telefutura", T2: "Telefutura 2" };

/* Gli stati come li ha detti Luca: «da fare sarà lo stato di tutte le
   ricariche che scontrineremo fino a quando non colleghiamo le API; poi
   aggiungiamo la possibilità di definire lo stato come effettuata e andata a
   buon fine, piuttosto che fallita, piuttosto che da fare».
   Non descrivono COME è stata fatta, ma se il credito è partito — che è la
   sola domanda che conta quando il cliente ha già pagato. */
const STATI: Record<string, { testo: string; colore: string; sfondo: string }> = {
    da_fare: { testo: "da fare", colore: "text-amber-300", sfondo: "bg-amber-500/15 border-amber-400/40" },
    fatta: { testo: "fatta", colore: "text-emerald-300", sfondo: "bg-emerald-500/15 border-emerald-400/40" },
    fallita: { testo: "NON partita", colore: "text-rose-300", sfondo: "bg-rose-500/15 border-rose-400/40" },
    annullata: { testo: "annullata", colore: "text-slate-500", sfondo: "bg-white/5 border-white/15" },
};
const ORDINE_STATI = ["da_fare", "fatta", "fallita", "annullata"];

export function PayStoreAdminView() {
    const [tipoP, setTipoP] = useState<"mese" | "range">("mese");
    const [ym, setYm] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1 }; });
    const [range, setRange] = useState({ da: primoDelMese(), a: oggiISO() });
    const [negozio, setNegozio] = useState("");
    const [operatore, setOperatore] = useState("");
    /* ⚠️ LO STATO SI FILTRA QUI, non nella rotta: il server manda comunque
       tutto il periodo perché i totali e il giorno-per-giorno devono restare
       quelli veri — un filtro «solo le da fare» non deve far sembrare che si
       sia incassato meno. Filtra l'ELENCO, che è dove si lavora. */
    const [stato, setStato] = useState("");
    const [giornoAperto, setGiornoAperto] = useState<string | null>(null);
    const [vista, setVista] = useState<"registro" | "tagli">("registro");
    /* cosa comanda il pannello di destra: il giorno per giorno, oppure il
       dettaglio dei punti vendita quando si clicca la torta (Luca 01/09) */
    const [destra, setDestra] = useState<"giorni" | "negozi">("giorni");
    const [torta, setTorta] = useState<"operatori" | "negozi">("negozi");
    const [d, setD] = useState<Dati | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [caricando, setCaricando] = useState(true);

    const periodo = useMemo(() => {
        if (tipoP === "range") return range;
        const mm = String(ym.m).padStart(2, "0");
        const ultimo = new Date(Date.UTC(ym.y, ym.m, 0)).getUTCDate();
        const fine = `${ym.y}-${mm}-${String(ultimo).padStart(2, "0")}`;
        return { da: `${ym.y}-${mm}-01`, a: fine > oggiISO() ? oggiISO() : fine };
    }, [tipoP, ym, range]);

    const carica = useCallback(async () => {
        setCaricando(true); setErr(null);
        try {
            const r = await fetch(`/api/paystore/registro?da=${periodo.da}&a=${periodo.a}${negozio ? `&negozio=${encodeURIComponent(negozio)}` : ""}${operatore ? `&operatore=${operatore}` : ""}`, { cache: "no-store" }).then((x) => x.json());
            if (!r?.ok) throw new Error(r?.error || "non sono riuscito a leggere il registro");
            setD(r);
        } catch (e) { setErr(String((e as Error)?.message || e)); }
        finally { setCaricando(false); }
    }, [periodo.da, periodo.a, negozio, operatore]);
    useEffect(() => { void carica(); }, [carica]);

    if (err) return <div className="m-4 text-sm text-rose-300 border border-rose-500/40 bg-rose-500/10 rounded-xl px-4 py-3">⚠️ {err}</div>;
    if (!d) return <div className="p-10 text-center text-sm text-slate-500">Conto le ricariche…</div>;

    /* ⚠️ IL FILTRO DELLO STATO VALE SOLO SULL'ELENCO. Negozio e operatore li
       applica il server, perché devono cambiare anche i totali e i grafici;
       lo stato no — «solo le da fare» non deve far sembrare che si sia
       incassato meno di quanto si è incassato. */
    const righe = stato ? d.ultime.filter((r) => r.stato === stato) : d.ultime;
    const oggiS = oggiISO();
    const daGuardareDavvero = d.daGuardare.filter((r) => r.stato === "fallita" || r.creata_il.slice(0, 10) < oggiS);
    /* le ricariche per ora della giornata, dalla prima all'ultima: si usa
       quando i giorni con vendite sono uno o due */
    const giorniPieni = d.perGiorno.filter((g) => g.quante > 0).length;
    const aOre = giorniPieni > 0 && giorniPieni <= 2;
    /* ⚠️ NIENTE `useMemo` QUI: siamo dopo i `return` anticipati (errore, dati
       non ancora arrivati), e un hook dopo un ritorno condizionale cambia
       l'ordine degli hook fra un render e l'altro — React se ne accorge e la
       pagina non si apre più. Il calcolo è su duecento righe: costa niente. */
    const perOra = (() => {
        if (!aOre) return [];
        const m = new Map<number, { euro: number; ops: Map<string, { euro: number; quante: number }> }>();
        for (const r of d.ultime) {
            const h = new Date(r.creata_il).getHours();
            const c = m.get(h) || { euro: 0, ops: new Map() };
            c.euro += Number(r.importo || 0);
            const o = c.ops.get(r.operatore) || { euro: 0, quante: 0 };
            o.euro += Number(r.importo || 0); o.quante += 1;
            c.ops.set(r.operatore, o); m.set(h, c);
        }
        if (!m.size) return [];
        const ore = [...m.keys()];
        const da = Math.min(...ore), a2 = Math.max(...ore);
        return Array.from({ length: a2 - da + 1 }, (_, i) => {
            const h = da + i, c = m.get(h);
            return {
                ora: h, euro: c?.euro || 0,
                parti: [...(c?.ops || new Map()).entries()].map(([operatore, v]) => ({ operatore, euro: v.euro, quante: v.quante })).sort((x, y) => y.euro - x.euro),
            };
        });
    })();
    const media = d.perGiorno.length ? d.totale.euro / d.perGiorno.length : 0;
    const dettaglio = giornoAperto ? d.perGiorno.find((g) => g.giorno === giornoAperto) : null;

    return (
        <div className="space-y-5 an-in">
            {/* ══ TESTATA ══════════════════════════════════════════════════ */}
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0d1022]/80 p-5 sm:p-6 an-scuro">
                <div className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full opacity-25 blur-3xl"
                    style={{ background: "radial-gradient(circle, #f8b516, transparent 65%)", animation: "anAurora 16s ease-in-out infinite" }} />
                <div className="pointer-events-none absolute -bottom-32 -right-16 w-[28rem] h-[28rem] rounded-full opacity-20 blur-3xl"
                    style={{ background: "radial-gradient(circle, #818cf8, transparent 65%)", animation: "anAurora 22s ease-in-out infinite reverse" }} />

                <div className="relative flex flex-wrap items-center gap-3 justify-between">
                    <div>
                        <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                            <Image src="/paystore.png" alt="" width={110} height={32} className="h-7 w-auto object-contain" />
                            Ricariche PayStore
                        </h1>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                            Ogni ricarica venduta dai negozi. Esenti IVA, reparto 1 — art. 74 DPR 633/72.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 justify-end">
                        <div className="flex gap-0.5 p-0.5 rounded-xl bg-white/5 border border-white/10">
                            {[
                                { id: "mese", label: "Mese", vai: () => setTipoP("mese") },
                                { id: "range", label: "Periodo", vai: () => setTipoP("range") },
                                { id: "oggi", label: "Oggi", vai: () => { setTipoP("range"); setRange({ da: oggiISO(), a: oggiISO() }); } },
                            ].map((v) => {
                                const oggiSecco = tipoP === "range" && range.da === oggiISO() && range.a === oggiISO();
                                const attivo = v.id === "oggi" ? oggiSecco : v.id === "mese" ? tipoP === "mese" : tipoP === "range" && !oggiSecco;
                                return <button key={v.id} onClick={v.vai}
                                    className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-all", attivo ? "bg-amber-500/80 text-black shadow" : "text-slate-400 hover:text-white")}>{v.label}</button>;
                            })}
                        </div>
                        {tipoP === "mese" ? (
                            <div className="flex items-center gap-2">
                                <button onClick={() => setYm((v) => v.m === 1 ? { y: v.y - 1, m: 12 } : { y: v.y, m: v.m - 1 })}
                                    className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10"><ChevronLeft className="w-4 h-4" /></button>
                                <span className="min-w-[130px] text-center text-sm font-bold text-white">{MESI[ym.m - 1]} {ym.y}</span>
                                <button onClick={() => setYm((v) => {
                                    const n = v.m === 12 ? { y: v.y + 1, m: 1 } : { y: v.y, m: v.m + 1 };
                                    const o = new Date(); return (n.y > o.getFullYear() || (n.y === o.getFullYear() && n.m > o.getMonth() + 1)) ? v : n;
                                })} className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10"><ChevronRight className="w-4 h-4" /></button>
                            </div>
                        ) : (
                            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                <span className="text-slate-500">dal</span>
                                <input type="date" value={range.da} max={oggiISO()} onChange={(e) => setRange((r) => ({ ...r, da: e.target.value }))}
                                    className="an-data glass-input px-2 py-1.5 rounded-lg text-xs" />
                                <span className="text-slate-500">al</span>
                                <input type="date" value={range.a} min={range.da} max={oggiISO()} onChange={(e) => setRange((r) => ({ ...r, a: e.target.value }))}
                                    className="an-data glass-input px-2 py-1.5 rounded-lg text-xs" />
                            </div>
                        )}
                        <div className="flex gap-0.5 p-0.5 rounded-xl bg-white/5 border border-white/10">
                            {[{ id: "registro", label: "Registro" }, { id: "tagli", label: "Listino tagli" }].map((v) => (
                                <button key={v.id} onClick={() => setVista(v.id as "registro" | "tagli")}
                                    className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-all", vista === v.id ? "bg-white/15 text-white" : "text-slate-400 hover:text-white")}>{v.label}</button>
                            ))}
                        </div>
                        <button onClick={() => void carica()} disabled={caricando}
                            className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10">
                            <RefreshCw className={cn("w-4 h-4", caricando && "animate-spin")} />
                        </button>
                    </div>
                </div>

                {/* ══ I FILTRI ═══════════════════════════════════════════════
                    Luca 01/09: «dammi la possibilità di filtrare per brand,
                    punto vendita, range di periodo, stato. Con dei bei bottoni
                    come abbiamo fatto in tracking pda per i brand e in
                    magazzino per gli altri pulsanti di filtro.»
                    Le tessere dei marchi sono quelle del Tracking — logo,
                    colore del brand, conteggio in alto — e le pastiglie sono
                    quelle del Magazzino. Chi conosce quelle due schermate qui
                    non deve imparare niente. */}
                <div className="relative mt-4">
                    <div className="psFiltroGriglia">
                        {d.operatori.map((o) => {
                            const q = d.perOperatore.find((x) => x.operatore === o);
                            const solo = operatore === o;
                            const spento = !!operatore && !solo;
                            const logo = OPERATORI_PAYSTORE.find((x) => x.id === o)?.logo;
                            const col = tintaOp(o);
                            return (
                                <button key={o} type="button" title={solo ? `${nomeOp(o)} — filtro attivo, clicca per togliere` : `Mostra solo ${nomeOp(o)}`}
                                    onClick={() => setOperatore(solo ? "" : o)}
                                    className="psMarchio"
                                    style={{
                                        borderColor: solo ? col + "99" : "var(--tf-w60)",
                                        background: solo ? col + "18" : "var(--tf-w20)",
                                        opacity: spento ? .35 : 1,
                                        filter: spento ? "grayscale(1)" : "none",
                                    }}>
                                    {logo
                                        ? <Image src={logo} alt={nomeOp(o)} width={140} height={44} className={OPERATORI_PAYSTORE.find((x) => x.id === o)?.zoom ? "psZoom" + String(OPERATORI_PAYSTORE.find((x) => x.id === o)?.zoom).replace(".", "") : ""} />
                                        : <span className="text-[11px] font-bold" style={{ color: col }}>{nomeOp(o)}</span>}
                                    <span className="psMarchioN" style={{ color: col, borderColor: col + "66" }}>{q?.quante ?? 0}</span>
                                </button>
                            );
                        })}
                    </div>

                    <div className="rvPillRow mt-3" style={{ "--rv-acc": "#f8b516" } as React.CSSProperties}>
                        <button onClick={() => setNegozio("")} className={cn("rvPill rvPill-sm", !negozio && "rvPill-on")}>Tutti i negozi</button>
                        {d.negozi.map((n) => (
                            <button key={n} onClick={() => setNegozio(negozio === n ? "" : n)} className={cn("rvPill rvPill-sm", negozio === n && "rvPill-on")}>
                                {n}<span className="psPillN">{d.perNegozio.find((x) => x.negozio === n)?.quante ?? 0}</span>
                            </button>
                        ))}
                    </div>

                    <div className="rvPillRow mt-2" style={{ "--rv-acc": "#818cf8" } as React.CSSProperties}>
                        <button onClick={() => setStato("")} className={cn("rvPill rvPill-sm", !stato && "rvPill-on")}>Tutti gli stati</button>
                        {ORDINE_STATI.map((x) => {
                            const n = d.ultime.filter((r) => r.stato === x).length;
                            if (!n && x !== "da_fare") return null;
                            return (
                                <button key={x} onClick={() => setStato(stato === x ? "" : x)}
                                    className={cn("rvPill rvPill-sm", stato === x && "rvPill-on")}>
                                    {STATI[x].testo}<span className="psPillN">{n}</span>
                                </button>
                            );
                        })}
                        {(negozio || operatore || stato) && (
                            <button onClick={() => { setNegozio(""); setOperatore(""); setStato(""); }} className="rvPill rvPill-sm psPillVia">
                                ✕ togli i filtri
                            </button>
                        )}
                    </div>
                </div>

                {/* ── LE COSE DA GUARDARE, in cima ─────────────────────────── */}
                {/* ⚠️ «DA FARE» OGGI NON È UN ALLARME: è lo stato normale di ogni
                    ricarica finché l'API non è collegata, e un riquadro rosso su
                    tutte insegna solo a non guardarlo. Allarme è quello che NON
                    è partito (fallita) e quello che è rimasto indietro — una da
                    fare di ieri vuol dire che il credito non è mai stato
                    caricato. */}
                {daGuardareDavvero.length > 0 && (
                    <div className="relative mt-4 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-3">
                        <div className="flex items-center gap-2 text-rose-200 font-bold text-sm mb-2">
                            <AlertTriangle className="w-4 h-4" /> {daGuardareDavvero.length === 1 ? "Una ricarica rimasta indietro" : `${daGuardareDavvero.length} ricariche rimaste indietro`}
                            <span className="font-normal text-rose-200/70 text-[11px]">— incassate in un giorno già chiuso, o non partite: il credito non risulta caricato</span>
                        </div>
                        <div className="space-y-1">
                            {daGuardareDavvero.slice(0, 8).map((r) => (
                                <div key={r.id} className="flex flex-wrap items-center gap-x-3 text-[12px]">
                                    <span className="text-slate-200 font-semibold">{nomeOp(r.operatore)} {eurC(r.importo)}</span>
                                    <span className="font-mono text-slate-400">{r.numero}</span>
                                    <span className="text-slate-500">{r.negozio} · {new Date(r.creata_il).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                                    <span className={cn("font-bold", STATI[r.stato]?.colore)}>{STATI[r.stato]?.testo || r.stato}</span>
                                    {r.errore && <span className="text-rose-300/80 truncate max-w-[300px]">«{r.errore}»</span>}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {vista === "registro" && (
                    <div className="relative mt-5 grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5">
                        {/* la composizione: chi si ricarica di più */}
                        {/* ⚠️ LA TORTA COMANDA IL PANNELLO DI DESTRA (Luca 01/09):
                            «un semplice grafico a torta di peso, dove se ci clicco
                            lo spazio di destra si dedica al dettaglio dei punti
                            vendita». Due modi — chi ricarica di più e dove si
                            ricarica di più — e in entrambi il clic porta il
                            dettaglio a fianco, dove c'è lo spazio per leggerlo. */}
                        <div className="flex flex-col gap-3">
                            <div className={cn("rounded-2xl border bg-black/20 p-3 cursor-pointer transition",
                                destra === "negozi" ? "border-amber-400/40" : "border-white/10 hover:border-white/25")}
                                onClick={() => setDestra(destra === "negozi" ? "giorni" : "negozi")}
                                title="Clicca per vedere il dettaglio qui a fianco">
                                <div className="flex items-center justify-between mb-2 gap-2">
                                    <div className="flex gap-0.5 p-0.5 rounded-lg bg-white/5 border border-white/10">
                                        {[{ id: "negozi", l: "Negozi" }, { id: "operatori", l: "Operatori" }].map((v) => (
                                            <button key={v.id} onClick={(e) => { e.stopPropagation(); setTorta(v.id as "negozi" | "operatori"); }}
                                                className={cn("px-2 py-1 rounded-md text-[10px] font-bold transition", torta === v.id ? "bg-white/15 text-white" : "text-slate-400 hover:text-white")}>
                                                {v.l}
                                            </button>
                                        ))}
                                    </div>
                                    <span className="text-[10px] text-slate-500">{destra === "negozi" ? "aperto ▸" : "clicca"}</span>
                                </div>
                                {(torta === "negozi" ? d.perNegozio.length : d.perOperatore.length) ? (
                                    <Donut size={186} unit="€" centro={eur(d.totale.euro)}
                                        slices={torta === "negozi"
                                            ? d.perNegozio.map((n, i) => ({ label: n.negozio, val: n.euro, colore: TINTE_NEG[i % TINTE_NEG.length], sub: `${n.quante} ricarich${n.quante === 1 ? "a" : "e"}` }))
                                            : d.perOperatore.map((o) => ({ label: nomeOp(o.operatore), val: o.euro, colore: tintaOp(o.operatore), sub: `${o.quante} ricarich${o.quante === 1 ? "a" : "e"}` }))} />
                                ) : <p className="text-xs text-slate-500 py-6 text-center">Nessuna ricarica nel periodo.</p>}
                            </div>
                        </div>

                        <div className="flex flex-col gap-4">
                            {/* i quattro numeri, tutti interrogabili */}
                            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                                {[
                                    { t: "Ricariche", v: String(d.totale.quante), c: "#f8b516", n: "Quante ne sono state vendute nel periodo scelto." },
                                    { t: "Incassato", v: eur(d.totale.euro), c: "#34d399", n: "La somma dei tagli. È esente IVA: sullo scontrino è tutto imponibile zero." },
                                    { t: "Media al giorno", v: eur(media), c: "#818cf8", n: `Su ${d.perGiorno.length} giorni del periodo, compresi quelli senza vendite.` },
                                    { t: "Periodo prima", v: eur(d.totale.euroPrima), c: "#64748b", n: "Lo stesso numero di giorni, subito prima. Serve a capire se stiamo crescendo." },
                                ].map((k) => (
                                    <Tip key={k.t} content={<><TipTitolo>{k.t}</TipTitolo><TipRiga l="" r={k.n} /></>}>
                                        <div className="rounded-2xl border border-white/10 bg-black/20 px-3.5 py-3 cursor-help">
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{k.t}</p>
                                            <p className="text-2xl font-black tabular-nums mt-0.5" style={{ color: k.c }}>{k.v}</p>
                                            {k.t === "Incassato" && d.totale.euroPrima > 0 && (
                                                <Delta v={d.totale.euro - d.totale.euroPrima} euro />
                                            )}
                                        </div>
                                    </Tip>
                                ))}
                            </div>

                            {/* il pannello che la torta comanda */}
                            {destra === "negozi" ? (
                                <div className="rounded-2xl border border-amber-400/25 bg-amber-500/[0.05] p-3.5">
                                    <div className="flex items-baseline justify-between mb-2">
                                        <h3 className="text-sm font-bold text-white">
                                            {torta === "negozi" ? "Quanto ricarica ogni negozio" : "Quanto pesa ogni operatore"}
                                        </h3>
                                        <button onClick={() => setDestra("giorni")} className="text-[11px] text-slate-400 hover:text-white">← torna al giorno per giorno</button>
                                    </div>
                                    <RaceBars unit="€" righe={(torta === "negozi"
                                        ? d.perNegozio.map((n, i) => ({ label: n.negozio, val: n.euro, colore: TINTE_NEG[i % TINTE_NEG.length], sub: `${n.quante} ricarich${n.quante === 1 ? "a" : "e"}` }))
                                        : d.perOperatore.map((o) => ({ label: nomeOp(o.operatore), val: o.euro, colore: tintaOp(o.operatore), sub: `${o.quante} ricarich${o.quante === 1 ? "a" : "e"}` })))} />
                                    <p className="text-[11px] text-slate-500 mt-2">
                                        Le ricariche non hanno margine di listino: PayStore le addebita al valore pieno
                                        {" "}(verificato sui 108 tagli del loro catalogo).
                                    </p>
                                </div>
                            ) : (
                            <div className="rounded-2xl border border-white/10 bg-black/20 p-3.5">
                                <div className="flex items-baseline justify-between mb-1">
                                    <h3 className="text-sm font-bold text-white">{aOre ? "Ora per ora" : "Giorno per giorno"}</h3>
                                    <span className="text-[11px] text-slate-500">{aOre ? "quando si ricarica, nella giornata" : "clicca una barra per vedere quel giorno"}</span>
                                </div>
                                <div className="min-h-[190px]">
                                    {/* ⚠️ UN GIORNO SOLO NON FA UNA SERIE. Con un giorno il
                                        grafico diventa un rettangolo di colore alto duecento
                                        pixel, che non somiglia più a un grafico. Nei primi
                                        giorni — e ogni volta che si guarda «Oggi» — la
                                        domanda utile è un'altra: a che ora si ricarica. */}
                                    {aOre ? (
                                        <BarStack h={200} unit="€" oggi={-1} media={null}
                                            giorni={perOra.map((h) => ({
                                                n: h.ora, label: String(h.ora).padStart(2, "0"),
                                                tot: h.euro,
                                                parti: h.parti.map((x) => ({ label: nomeOp(x.operatore), val: x.euro, colore: tintaOp(x.operatore), sub: `${x.quante} ricarich${x.quante === 1 ? "a" : "e"}` })),
                                            }))} />
                                    ) : d.perGiorno.some((g) => g.euro > 0) ? (
                                        /* ⚠️ `BarStack` non conosce il clic: si intercetta la
                                           posizione orizzontale e si risale al giorno. Meno
                                           elegante di una prop, ma non tocca un componente che
                                           usano tutte le altre schermate. È lo stesso modo della
                                           sezione AI. */
                                        <div onClick={(e) => {
                                            const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                            const i = Math.floor(((e.clientX - box.left) / box.width) * d.perGiorno.length);
                                            const g = d.perGiorno[Math.max(0, Math.min(d.perGiorno.length - 1, i))];
                                            if (g) setGiornoAperto(giornoAperto === g.giorno ? null : g.giorno);
                                        }} className="cursor-pointer"
>
                                        <BarStack h={200} unit="€"
                                            giorni={d.perGiorno.map((g) => ({
                                                n: Number(g.giorno.slice(8, 10)),
                                                label: g.giorno.slice(8, 10) + "/" + g.giorno.slice(5, 7),
                                                tot: g.euro,
                                                parti: g.parti.map((p) => ({ label: nomeOp(p.operatore), val: p.euro, colore: tintaOp(p.operatore), sub: `${p.quante} ricarich${p.quante === 1 ? "a" : "e"}` })),
                                            }))}
                                            oggi={d.perGiorno.findIndex((g) => g.giorno === oggiISO())} media={media || null} />
                                        </div>
                                    ) : (
                                        <p className="text-xs text-slate-500 py-12 text-center">Nessuna ricarica in questo periodo.</p>
                                    )}
                                </div>
                            </div>
                            )}

                            {/* il giorno aperto */}
                            {dettaglio && (
                                <div className="rounded-2xl border border-amber-400/30 bg-amber-500/[0.06] p-3.5">
                                    <div className="flex items-baseline justify-between mb-2">
                                        <h3 className="text-sm font-bold text-white">
                                            {new Date(dettaglio.giorno + "T12:00:00").toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
                                            <span className="text-slate-400 font-normal"> · {dettaglio.quante} ricariche · {eurC(dettaglio.euro)}</span>
                                        </h3>
                                        <button onClick={() => setGiornoAperto(null)} className="text-[11px] text-slate-400 hover:text-white">chiudi</button>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                                        {d.ultime.filter((r) => r.creata_il.slice(0, 10) === dettaglio.giorno).map((r) => (
                                            <div key={r.id} className="flex items-center gap-2 text-[12px] py-0.5 border-b border-white/5">
                                                <i className="w-2 h-2 rounded-full shrink-0" style={{ background: tintaOp(r.operatore) }} />
                                                <span className="text-slate-200">{nomeOp(r.operatore)}</span>
                                                <span className="font-mono text-slate-500">{r.numero}</span>
                                                <span className="ml-auto font-bold text-white tabular-nums">{eurC(r.importo)}</span>
                                                <span className="text-slate-600 text-[10px]">{new Date(r.creata_il).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {vista === "registro" ? (
                <>
                    {/* ── LE ULTIME ────────────────────────────────────────── */}
                    <div className="glass-card an-card rounded-2xl p-4">
                        <div className="flex items-baseline justify-between mb-3">
                            <h3 className="text-sm font-bold text-white">
                                {stato ? `Le ${STATI[stato].testo}` : "Le ultime"} {righe.length}
                                {righe.length !== d.ultime.length && <span className="text-slate-500 font-normal"> di {d.ultime.length}</span>}
                            </h3>
                            <span className="text-[11px] text-slate-500 tabular-nums">{eurC(righe.reduce((t, r) => t + Number(r.importo || 0), 0))}</span>
                        </div>
                        {righe.length === 0 ? (
                            <p className="text-xs text-slate-500 py-6 text-center">
                                {d.ultime.length ? "Nessuna ricarica con questi filtri." : "Ancora nessuna ricarica registrata in questo periodo."}
                            </p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-[12px]">
                                    <thead>
                                        <tr className="text-slate-500 text-[10px] uppercase tracking-widest">
                                            <th className="text-left font-bold py-1.5">Quando</th>
                                            <th className="text-left font-bold">Operatore</th>
                                            <th className="text-left font-bold">Taglio</th>
                                            <th className="text-left font-bold">Numero</th>
                                            <th className="text-right font-bold">Importo</th>
                                            <th className="text-left font-bold pl-3">Negozio</th>
                                            <th className="text-left font-bold">Chi</th>
                                            {/* con quale partita IVA è uscita: è il dato per cui
                                                esiste la regola delle due società di Donna */}
                                            <th className="text-left font-bold">Società</th>
                                            <th className="text-left font-bold">Stato</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {righe.map((r) => (
                                            <tr key={r.id} className="border-t border-white/5">
                                                <td className="py-1.5 text-slate-400 whitespace-nowrap">{new Date(r.creata_il).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                                                <td className="text-slate-200 font-semibold">
                                                    {/* ⚠️ IL NOME LO DECIDE IL CODICE OPERATORE, non quello
                                                        salvato sulla riga: nel registro convivono «WindTre»
                                                        scritto dal flusso normale e «WINDTRE» scritto dal
                                                        recupero, e nell'elenco sembravano due operatori. */}
                                                    <MarchioRiga op={r.operatore} />
                                                </td>
                                                <td className="text-slate-500">{r.taglio || "—"}</td>
                                                <td className="font-mono text-slate-300">
                                                    {/* ⚠️ IL NUMERO SI PUÒ SCRIVERE QUI. Una ricarica venduta
                                                        prima che la vendita si portasse dentro il numero — o
                                                        dal listino invece che dal pannello — non ce l'ha: senza,
                                                        nessuno la può eseguire, e il cliente ha già pagato. */}
                                                    {r.numero ? r.numero : <NumeroMancante r={r} onCambiato={() => void carica()} />}
                                                </td>
                                                <td className="text-right font-bold text-white tabular-nums">{eurC(r.importo)}</td>
                                                <td className="pl-3 text-slate-400">{r.negozio || "—"}</td>
                                                <td className="text-slate-400">{r.venditore || "—"}</td>
                                                <td className="text-slate-400">{SOCIETA[r.azienda || ""] || "—"}</td>
                                                <td>
                                                    {/* ⚠️ LO STATO SI CAMBIA DA QUI. Finché le ricariche si
                                                        fanno sul terminale del fornitore, l'unico modo che il
                                                        CRM ha di sapere se il credito è partito è che glielo
                                                        dica chi l'ha caricato — e resta scritto chi è stato. */}
                                                    <StatoRicarica r={r} onCambiato={() => void carica()} />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <ListinoTagli tagli={d.tagli} onCambiato={() => void carica()} />
            )}
        </div>
    );
}

/* ── IL MARCHIO NELLA RIGA ──────────────────────────────────────────────────
   Luca 01/09: «rendila anche un po' più carina con i brand al posto dei nomi».
   Dove il logo c'è si vede il logo — si riconosce prima di leggere; dove non
   c'è (cinque operatori su diciotto non hanno un file) resta il nome con il
   pallino del suo colore, che è meglio di un buco. */
function MarchioRiga({ op }: { op: string }) {
    const o = OPERATORI_PAYSTORE.find((x) => x.id === op);
    /* ⚠️ NIENTE ZOOM QUI. Le scale della griglia servono a pareggiare i loghi
       dentro una tessera di 58 pixel; su una riga alta 22 lo stesso 2,4 di
       WindTre lo fa sbordare sopra e sotto. Qui basta il tetto d'altezza. */
    if (o?.logo) return (
        <span className="psLogoRiga" title={o.label}>
            <Image src={o.logo} alt={o.label} width={110} height={26} />
        </span>
    );
    return (
        <span className="inline-flex items-center gap-1.5">
            <i className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: tintaOp(op) }} />
            {nomeOp(op)}
        </span>
    );
}

/* ── IL NUMERO CHE MANCA ────────────────────────────────────────────────── */
function NumeroMancante({ r, onCambiato }: { r: Riga; onCambiato: () => void }) {
    const [apre, setApre] = useState(false);
    const [val, setVal] = useState("");
    const [lavoro, setLavoro] = useState(false);
    const ok = val.replace(/\D/g, "").length >= 7 && val.replace(/\D/g, "").length <= 11;
    if (!apre) return (
        <button onClick={() => setApre(true)} className="text-[11px] font-bold text-rose-300 border border-rose-400/40 bg-rose-500/10 rounded-lg px-2 py-0.5 hover:bg-rose-500/20">
            manca — scrivilo
        </button>
    );
    return (
        <span className="inline-flex items-center gap-1">
            <input autoFocus value={val} inputMode="numeric" placeholder="3XXXXXXXXX"
                onChange={(e) => setVal(e.target.value.replace(/\D/g, "").slice(0, 11))}
                className="glass-input rounded-lg px-2 py-0.5 text-[12px] w-[130px] font-mono" />
            <button disabled={!ok || lavoro} onClick={async () => {
                setLavoro(true);
                try {
                    const x = await fetch("/api/paystore/registro", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ azione: "numero", id: r.id, numero: val }) });
                    if (x.ok) { onCambiato(); setApre(false); }
                } finally { setLavoro(false); }
            }} className="p-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 text-emerald-200 disabled:opacity-30">
                <Check className="w-3 h-3" />
            </button>
        </span>
    );
}

/* ── LO STATO DI UNA RICARICA ───────────────────────────────────────────────
   Tre parole e due clic: «da fare» finché il credito non è partito, «fatta»
   quando qualcuno l'ha caricato, «NON partita» quando è andata storta — e
   quella è la riga che conta, perché il cliente ha già pagato. */
function StatoRicarica({ r, onCambiato }: { r: Riga; onCambiato: () => void }) {
    const [apre, setApre] = useState(false);
    const [lavoro, setLavoro] = useState(false);
    const st = STATI[r.stato] || { testo: r.stato, colore: "text-slate-400", sfondo: "bg-white/5 border-white/15" };

    const cambia = async (stato: string) => {
        setLavoro(true);
        try {
            const x = await fetch("/api/paystore/registro", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ azione: "stato", id: r.id, stato }) });
            if (x.ok) onCambiato();
        } finally { setLavoro(false); setApre(false); }
    };

    return (
        <div className="relative">
            <button onClick={() => setApre(!apre)} disabled={lavoro}
                title={r.stato_da ? `${STATI[r.stato]?.testo} — ${r.stato_da}, ${r.stato_il ? new Date(r.stato_il).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}` : "clicca per cambiare"}
                className={cn("px-2 py-0.5 rounded-lg border text-[11px] font-bold whitespace-nowrap", st.sfondo, st.colore)}>
                {st.testo} ▾
            </button>
            {apre && (
                <>
                    <div className="fixed inset-0 z-20" onClick={() => setApre(false)} />
                    <div className="absolute right-0 z-30 mt-1 rounded-xl border border-white/15 bg-[#0d1022] shadow-xl p-1 min-w-[150px]">
                        {ORDINE_STATI.filter((x) => x !== r.stato).map((x) => (
                            <button key={x} onClick={() => void cambia(x)}
                                className={cn("block w-full text-left px-3 py-1.5 rounded-lg text-[12px] font-semibold hover:bg-white/10", STATI[x].colore)}>
                                {STATI[x].testo}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

/* ── IL LISTINO DEI TAGLI ───────────────────────────────────────────────────
   Provvisorio per costruzione: oggi lo teniamo a mano, domani lo riscrive
   l'API del fornitore. Sta qui perché un taglio che il fornitore cambia non
   deve richiedere un rilascio — e perché scoprire al banco che il taglio non
   c'è è il modo peggiore di scoprirlo. */
function ListinoTagli({ tagli, onCambiato }: { tagli: Taglio[]; onCambiato: () => void }) {
    const [op, setOp] = useState(OPERATORI_PAYSTORE[0].id);
    const [etichetta, setEtichetta] = useState("");
    const [valore, setValore] = useState("");
    const [lavoro, setLavoro] = useState<string | null>(null);
    const [errore, setErrore] = useState<string | null>(null);

    const chiama = async (body: Record<string, unknown>, chiave: string) => {
        setLavoro(chiave); setErrore(null);
        try {
            const r = await fetch("/api/paystore/registro", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            const j = await r.json();
            if (!r.ok || !j.ok) throw new Error(j.error || "non riuscito");
            onCambiato();
        } catch (e) { setErrore(String((e as Error)?.message || e)); }
        finally { setLavoro(null); }
    };

    const delOp = tagli.filter((t) => t.operatore === op).sort((a, b) => a.ordine - b.ordine || a.valore - b.valore);
    const conListino = new Set(tagli.map((t) => t.operatore));

    return (
        <div className="glass-card an-card rounded-2xl p-4 space-y-4">
            <div>
                <h3 className="text-sm font-bold text-white">Listino dei tagli</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                    Quello che il negozio vede quando sceglie l&apos;operatore. Gli operatori senza listino restano a
                    <b className="text-slate-300"> importo libero</b>: meglio un campo aperto che tagli inventati, perché un
                    taglio che il fornitore non ha è una ricarica che non parte. Con l&apos;API questo elenco si riempirà da solo.
                </p>
            </div>

            {errore && <div className="text-xs text-rose-300 border border-rose-500/40 bg-rose-500/10 rounded-lg px-3 py-2">⚠️ {errore}</div>}

            <div className="flex flex-wrap gap-1.5">
                {OPERATORI_PAYSTORE.map((o) => (
                    <button key={o.id} onClick={() => setOp(o.id)}
                        className={cn("px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition",
                            op === o.id ? "border-amber-400/60 bg-amber-500/15 text-amber-100" : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-white")}>
                        {o.label}
                        <span className={cn("ml-1.5 text-[10px]", conListino.has(o.id) ? "text-emerald-300" : "text-slate-600")}>
                            {conListino.has(o.id) ? tagli.filter((t) => t.operatore === o.id).length : "libero"}
                        </span>
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {delOp.map((t) => (
                    <div key={t.id} className={cn("flex items-center gap-2 rounded-xl border px-3 py-2",
                        t.attivo ? "border-white/10 bg-black/20" : "border-amber-400/25 bg-amber-500/[0.05] opacity-70")}>
                        <span className="text-lg font-black text-white tabular-nums">{Number(t.valore)} €</span>
                        <span className="text-[11px] text-slate-400 truncate">{t.etichetta}</span>
                        {t.origine !== "manuale" && <span className="text-[9px] text-emerald-300 uppercase tracking-widest">api</span>}
                        <div className="ml-auto flex gap-1">
                            <button title={t.attivo ? "Spegnilo: sparisce dal pannello del negozio" : "Riaccendilo"}
                                onClick={() => void chiama({ azione: t.attivo ? "spegni" : "accendi", id: t.id }, t.id)}
                                disabled={lavoro === t.id}
                                className={cn("p-1.5 rounded-lg border", t.attivo ? "border-white/10 text-slate-400 hover:text-amber-200" : "border-amber-400/50 text-amber-200")}>
                                <Power className="w-3 h-3" />
                            </button>
                            <button title="Elimina" onClick={() => void chiama({ azione: "elimina", id: t.id }, t.id)} disabled={lavoro === t.id}
                                className="p-1.5 rounded-lg border border-white/10 text-slate-500 hover:text-rose-300 hover:border-rose-400/40">
                                <Trash2 className="w-3 h-3" />
                            </button>
                        </div>
                    </div>
                ))}
                {delOp.length === 0 && (
                    <p className="text-xs text-slate-500 col-span-full py-4">
                        Nessun taglio per {nomeOp(op)}: al banco l&apos;importo si scrive a mano.
                    </p>
                )}
            </div>

            <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-white/10">
                <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Etichetta del fornitore</label>
                    <input value={etichetta} onChange={(e) => setEtichetta(e.target.value)} placeholder={`es. ${nomeOp(op).toUpperCase()} 20 euro`}
                        className="glass-input rounded-lg px-2.5 py-1.5 text-xs w-[240px]" />
                </div>
                <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Importo</label>
                    <input value={valore} inputMode="decimal" onChange={(e) => setValore(e.target.value.replace(/[^0-9,.]/g, ""))} placeholder="20"
                        className="glass-input rounded-lg px-2.5 py-1.5 text-xs w-[90px]" />
                </div>
                <button disabled={lavoro === "nuovo" || !etichetta.trim() || !(Number(valore.replace(",", ".")) > 0)}
                    onClick={() => void chiama({ azione: "salva", operatore: op, etichetta, valore: Number(valore.replace(",", ".")), ordine: delOp.length + 1 }, "nuovo")
                        .then(() => { setEtichetta(""); setValore(""); })}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-bold border border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-30 flex items-center gap-1">
                    {lavoro === "nuovo" ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />} Aggiungi a {nomeOp(op)}
                </button>
            </div>
        </div>
    );
}

export default PayStoreAdminView;
