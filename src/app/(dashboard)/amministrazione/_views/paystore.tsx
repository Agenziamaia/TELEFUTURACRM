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
import { createPortal } from "react-dom";
import Image from "next/image";
import { RefreshCw, ChevronLeft, ChevronRight, Plus, Power, Trash2, Check } from "lucide-react";
import { cn } from "@/utils";
import { SelectOpzioni } from "@/components/SelectPersona";
import { OPERATORI_PAYSTORE } from "../../registra-vendita/PayStore";
import { STATI_RICARICA } from "@/lib/paystore";
import { FiltroMulti } from "@/components/FiltroMulti";
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
/* ⚠️ IL GIORNO È QUELLO DI ROMA. `toISOString()` è UTC: fra mezzanotte e le
   due del mattino d'estate «oggi» sarebbe ancora ieri, e le ricariche
   incassate nella giornata appena chiusa non risulterebbero «rimaste
   indietro» proprio nelle ore in cui uno le va a guardare. */
const oggiISO = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
const primoDelMese = () => oggiISO().slice(0, 8) + "01";
/** il giorno di N giorni fa, in ora di Roma */
const giornoMeno = (n: number) => new Date(Date.now() - n * 86400000).toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
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

type Riga = { id: string; creata_il: string; negozio: string | null; venditore: string | null; operatore: string; operatore_nome: string | null; numero: string; taglio: string | null; importo: number; stato: string; errore: string | null; azienda: string | null; nota: string | null; stato_da: string | null; stato_il: string | null; con_attivazione: boolean | null; scontrino_emesso: boolean | null; scontrino_errore: string | null; reparto_usato: number | null; scontrino_stato: string | null };
type Taglio = { id: string; operatore: string; etichetta: string; valore: number; ordine: number; attivo: boolean; origine: string };
type Dati = {
    da: string; a: string;
    totale: { quante: number; euro: number; euroPrima: number };
    daGuardare: number;
    senzaScontrino: number;
    rimasteIndietro: number;
    troncato: boolean;
    perStato: { stato: string; quante: number }[];
    perGiorno: { giorno: string; quante: number; euro: number; parti: { operatore: string; nome: string; quante: number; euro: number }[] }[];
    perOperatore: { operatore: string; nome: string; quante: number; euro: number }[];
    perNegozio: { negozio: string; quante: number; euro: number }[];
    ultime: Riga[];
    negozi: string[]; operatori: string[];
    tagli: Taglio[];
    perOrigine: { conAttivazione: boolean; quante: number; euro: number }[];
};

/* i codici delle due società, scritti come li conosce chi legge */
const SOCIETA: Record<string, string> = { T1: "Telefutura", T2: "Telefutura 2" };

/* Gli stati come li ha detti Luca: «da fare sarà lo stato di tutte le
   ricariche che scontrineremo fino a quando non colleghiamo le API; poi
   aggiungiamo la possibilità di definire lo stato come effettuata e andata a
   buon fine, piuttosto che fallita, piuttosto che da fare».
   Non descrivono COME è stata fatta, ma se il credito è partito — che è la
   sola domanda che conta quando il cliente ha già pagato. */
/* ⚠️ LA TINTA È UNA CLASSE, non un colore scritto in linea. `--rv-acc` ha già
   la sua variante per il tema chiaro: i colori esadecimali che avevo messo qui
   davano, con l'interruttore ☀️, un contrasto misurato fra 1,2 e 1,6 dove ne
   servono 4,5 — cioè filtri invisibili su una pagina di scontrini.
   `ok_manuale` va sul ciano e non su un secondo verde: automatico e manuale
   sono i due che Luca ha chiesto di poter distinguere. */
const TINTA_STATO: Record<string, string> = {
    sospeso: "rvT-ambra", ok_automatico: "rvT-verde", ok_manuale: "rvT-ciano",
    fallita: "rvT-rosso", annullata: "rvT-grigio",
};

const STATI: Record<string, { testo: string; colore: string; sfondo: string }> = {
    /* «fatta» non bastava: dice che il credito è partito, non CHI l'ha fatto
       partire. Con l'API accesa la differenza è tutta lì — l'automatico è la
       norma, il manuale è l'eccezione da guardare (Luca 02/09). */
    sospeso: { testo: "in sospeso", colore: "text-amber-300", sfondo: "bg-amber-500/15 border-amber-400/40" },
    ok_automatico: { testo: "ok automatico", colore: "text-emerald-300", sfondo: "bg-emerald-500/15 border-emerald-400/40" },
    ok_manuale: { testo: "ok manuale", colore: "text-teal-300", sfondo: "bg-teal-500/12 border-teal-400/35" },
    fallita: { testo: "NON partita", colore: "text-rose-300", sfondo: "bg-rose-500/15 border-rose-400/40" },
    annullata: { testo: "annullata", colore: "text-slate-400", sfondo: "bg-white/5 border-white/15" },
};
const ORDINE_STATI = [...STATI_RICARICA];

/* Lo stato dello SCONTRINO, che è una cosa diversa dallo stato della ricarica:
   il primo dice se il documento è uscito, il secondo se il credito è partito.
   Verde tenue quando è tutto a posto — non deve attirare l'occhio: attira
   quando c'è qualcosa da fare. */
const SCONTRINO: Record<string, { testo: string; classe: string; nota: string }> = {
    emesso: { testo: "emesso", classe: "text-emerald-300 bg-emerald-500/[0.08] border-emerald-500/25", nota: "il registratore ha stampato lo scontrino" },
    errore: { testo: "NON uscito", classe: "text-rose-200 bg-rose-500/20 border-rose-400/50 font-bold", nota: "il lavoro di stampa è fallito: l'amministrazione deve verificare" },
    in_pausa: { testo: "in pausa", classe: "text-amber-200 bg-amber-500/18 border-amber-400/45 font-bold", nota: "la vendita è stata messa da parte: lo scontrino non è ancora uscito" },
};

export function PayStoreAdminView() {
    const [tipoP, setTipoP] = useState<"mese" | "range">("mese");
    const [ym, setYm] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1 }; });
    const [range, setRange] = useState({ da: primoDelMese(), a: oggiISO() });
    /* i negozi in una tendina multiselezione: null = tutti (la convenzione del
       FiltroMulti che il CRM usa già in Ricerca Vendite e nel Calendario) */
    const [negoziSel, setNegoziSel] = useState<string[] | null>(null);
    /* «senza scontrino» e «rimaste indietro»: due pulsanti che filtrano la
       lista, non due elenchi da leggere */
    const [allarme, setAllarme] = useState("");
    /* ⚠️ LE GIÀ FATTE DEI GIORNI SCORSI NON STANNO IN ELENCO (Luca 02/09): «le
       ricariche dei giorni PRECEDENTI che sono in ok devono nascondersi».
       Una ricarica chiusa e passata non chiede più niente a nessuno: sta in
       mezzo e basta. Quelle di OGGI restano — la giornata è ancora aperta e
       serve vedere cosa è uscito dal banco. Si riaprono con questo
       interruttore, premendo lo stato «ok», o tornando indietro col periodo. */
    const [mostraChiuse, setMostraChiuse] = useState(false);
    /* ⚠️ QUANTE SE NE DISEGNANO, non quante ne arrivano. Il server manda tutte
       le righe del periodo — a trenta giorni sono un paio di migliaia — e la
       pagina ne disegna un blocco per volta, dicendo sempre quante ne restano.
       Il tetto è una scelta di disegno, non un pezzo di verità che sparisce. */
    const [quante, setQuante] = useState(200);
    const [operatore, setOperatore] = useState("");
    /* ⚠️ LO STATO SI FILTRA QUI, non nella rotta: il server manda comunque
       tutto il periodo perché i totali e il giorno-per-giorno devono restare
       quelli veri — un filtro «solo le da fare» non deve far sembrare che si
       sia incassato meno. Filtra l'ELENCO, che è dove si lavora. */
    const [stato, setStato] = useState("");
    // "true" = solo quelle nate con un'attivazione, "false" = solo le sciolte
    const [origine, setOrigine] = useState("");
    const [giornoAperto, setGiornoAperto] = useState<string | null>(null);
    /* ⚠️ IL GIORNO APERTO NON SOPRAVVIVE AL CAMBIO DI PERIODO: apro il primo
       settembre, passo ad agosto, e il grafico resta intitolato «martedì 1
       settembre» con dentro il vuoto. */
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

    /* ⚠️ CAMBIANDO FILTRO O PERIODO SI RIPARTE DA 200. `setQuante` sapeva solo
       crescere: dopo quattro «mostrane altre 500» ogni cambio di mese
       ridisegnava duemiladuecento righe in un colpo. */
    useEffect(() => { setQuante(200); }, [periodo.da, periodo.a, negoziSel, stato, origine, allarme, operatore]);
    useEffect(() => { setGiornoAperto(null); }, [periodo.da, periodo.a]);
    const carica = useCallback(async () => {
        setCaricando(true); setErr(null);
        try {
            /* ⚠️ IL NEGOZIO NON VA PIÙ AL SERVER. Con la tendina si possono
               scegliere più negozi insieme, e il server filtrava per uno solo:
               il filtro si applica qui, sulle righe, e i totali della testata
               restano quelli del periodo intero — che è quello che serve
               guardando l'insieme. */
            const r = await fetch(`/api/paystore/registro?da=${periodo.da}&a=${periodo.a}${operatore ? `&operatore=${operatore}` : ""}`, { cache: "no-store" }).then((x) => x.json());
            if (!r?.ok) throw new Error(r?.error || "non sono riuscito a leggere il registro");
            setD(r);
        } catch (e) { setErr(String((e as Error)?.message || e)); }
        finally { setCaricando(false); }
    }, [periodo.da, periodo.a, operatore]);
    useEffect(() => { void carica(); }, [carica]);

    if (err) return <div className="m-4 text-sm text-rose-300 border border-rose-500/40 bg-rose-500/10 rounded-xl px-4 py-3">⚠️ {err}</div>;
    if (!d) return <div className="p-10 text-center text-sm text-slate-500">Conto le ricariche…</div>;

    /* ⚠️ IL FILTRO DELLO STATO VALE SOLO SULL'ELENCO. Negozio e operatore li
       applica il server, perché devono cambiare anche i totali e i grafici;
       lo stato no — «solo le da fare» non deve far sembrare che si sia
       incassato meno di quanto si è incassato. */
    const oggiS = oggiISO();
    /* ⚠️ I FILTRI VALGONO SULL'ELENCO, non sui totali della testata: «solo le
       rimaste indietro» non deve far sembrare che si sia incassato meno di
       quanto si è incassato. Il periodo lo dicono i quattro numeroni in alto,
       la lista dice quello che si sta guardando adesso — e sotto la lista c'è
       scritto quante sono e quanto valgono. */
    const rimastaIndietro = (r: Riga) => r.stato === "fallita" || (r.stato === "sospeso" && r.creata_il.slice(0, 10) < oggiS);
    /* Ogni filtro è una funzione a sé, così il contatore di un pulsante si può
       calcolare CON GLI ALTRI FILTRI ATTIVI e senza il proprio.
       ⚠️ È la differenza fra un numero e una bugia: contando ogni pulsante
       sull'insieme intero, «Donna» + «senza scontrino» mostrava 7 sul quadrato
       e ZERO righe sotto. Il numero su un pulsante deve dire quante righe si
       vedranno premendolo. */
    /* già fatta, e di un giorno che non è oggi */
    const chiusaVecchia = (r: Riga) =>
        (r.stato === "ok_automatico" || r.stato === "ok_manuale") && r.creata_il.slice(0, 10) < oggiS;
    /* ⚠️ TRE MODI DI RIVEDERLE, e sono tutti espliciti: l'interruttore, il
       filtro sullo stato «ok» (chiederle è già chiedere di vederle), e il
       periodo che non arriva a oggi — cioè quando si torna indietro a
       guardare una giornata chiusa, dove nascondere le fatte vorrebbe dire
       mostrare una giornata vuota. */
    const periodoPassato = periodo.a < oggiS;
    const mostraTutte = mostraChiuse || periodoPassato || stato === "ok_automatico" || stato === "ok_manuale";
    const F = {
        chiuse: (r: Riga) => mostraTutte || !chiusaVecchia(r),
        negozio: (r: Riga) => !negoziSel || negoziSel.includes(String(r.negozio || "")),
        stato: (r: Riga) => !stato || r.stato === stato,
        origine: (r: Riga) => !origine || String(r.con_attivazione === true) === origine,
        allarme: (r: Riga) => !allarme
            || (allarme === "scontrino" && r.scontrino_stato === "errore")
            || (allarme === "indietro" && rimastaIndietro(r)),
    };
    const tutte = d.ultime;
    const righe = tutte.filter((r) => F.chiuse(r) && F.negozio(r) && F.stato(r) && F.origine(r) && F.allarme(r));
    /* quante ne sta tenendo da parte: si dice, se no sembra che manchino */
    const nascoste = mostraTutte ? 0
        : tutte.filter((r) => chiusaVecchia(r) && F.negozio(r) && F.origine(r) && F.allarme(r)).length;
    /** quante righe resterebbero premendo questo pulsante, con quello che è
     *  già premuto adesso */
    /* ⚠️ `tranne` è una LISTA. Le pastiglie degli stati «ok» devono contare
       anche le righe che il nascondimento tiene fuori: premerle è il modo di
       farle riapparire, e un pulsante che dice 0 non lo preme nessuno. */
    const quanteCon = (tranne: (keyof typeof F)[], cond: (r: Riga) => boolean) =>
        tutte.filter((r) => cond(r) && (Object.keys(F) as (keyof typeof F)[])
            .every((k) => tranne.includes(k) || F[k](r))).length;
    /* ⚠️ I DUE ALLARMI SI CONTANO SUL PERIODO INTERO, dal server, quando non
       c'è nessun altro filtro attivo: sono l'unica ragione per cui uno apre
       questa schermata di fretta, e devono dire il numero vero anche se la
       lista ne disegna un pezzo per volta. Con un filtro attivo, invece,
       contano quello che il filtro lascia — se no promettono righe che non si
       vedranno. */
    const senzaAltri = !negoziSel && !stato && !origine;
    const senzaScontrino = senzaAltri ? d.senzaScontrino : quanteCon(["allarme"], (r) => r.scontrino_stato === "errore");
    const daGuardareDavvero = senzaAltri ? d.rimasteIndietro : quanteCon(["allarme"], rimastaIndietro);
    /* ⚠️ IL GRAFICO PARLA DI GIORNI, e le ore le mostra solo se gliele chiedi
       (Luca 02/09): «questo grafico deve darmi l'andamento giorno per giorno,
       poi nel momento in cui io clicco su un giorno a quel punto mi esplode
       l'andamento orario». Prima passava da solo alle ore quando i giorni con
       vendite erano uno o due — comodo la prima settimana, ma vuol dire che
       l'andamento dei giorni, che è la domanda normale, non si poteva vedere.
       L'unica eccezione resta il periodo di UN GIORNO SOLO («Oggi»): lì i
       giorni sono una barra sola, che non è un grafico. */
    const unGiornoSolo = d.perGiorno.length === 1;
    const aOre = unGiornoSolo || giornoAperto != null;
    const giornoDelleOre = unGiornoSolo ? d.perGiorno[0].giorno : giornoAperto;
    /* ⚠️ NIENTE `useMemo` QUI: siamo dopo i `return` anticipati (errore, dati
       non ancora arrivati), e un hook dopo un ritorno condizionale cambia
       l'ordine degli hook fra un render e l'altro — React se ne accorge e la
       pagina non si apre più. Il calcolo è su duecento righe: costa niente. */
    const perOra = (() => {
        if (!aOre || !giornoDelleOre) return [];
        const m = new Map<number, { euro: number; ops: Map<string, { euro: number; quante: number }> }>();
        for (const r of d.ultime.filter((x) => x.creata_il.slice(0, 10) === giornoDelleOre)) {
            /* ⚠️ L'ORA È QUELLA DI ROMA. `getHours()` è l'ora del computer di
               chi guarda: da un portatile con il fuso sbagliato l'istogramma
               delle ore raccontava un'altra giornata. */
            const h = Number(new Date(r.creata_il).toLocaleString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", hour12: false }).slice(0, 2));
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
                                    {/* il numero NON prende il colore del marchio: su pastiglia bianca
                                        Poste misurava 1,43 di contrasto. Il marchio si riconosce dal
                                        logo e dal bordo. */}
                                    <span className="psMarchioN" style={{ borderColor: col + "66" }}>{q?.quante ?? 0}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

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
                                    <h3 className="text-sm font-bold text-white">
                                        {aOre ? "Ora per ora" : "Giorno per giorno"}
                                        {aOre && giornoDelleOre && <span className="text-amber-300 font-semibold"> · {new Date(giornoDelleOre + "T12:00:00").toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}</span>}
                                    </h3>
                                    {aOre && !unGiornoSolo
                                        ? <button onClick={() => setGiornoAperto(null)} className="text-[11px] text-amber-300 hover:text-white font-semibold">← torna ai giorni</button>
                                        : <span className="text-[11px] text-slate-500">{aOre ? "quando si ricarica, nella giornata" : "clicca una barra per aprire quel giorno"}</span>}
                                </div>
                                <div className="min-h-[190px]">
                                    {/* ⚠️ UN GIORNO SOLO NON FA UNA SERIE. Con un giorno il
                                        grafico diventa un rettangolo di colore alto duecento
                                        pixel, che non somiglia più a un grafico. Nei primi
                                        giorni — e ogni volta che si guarda «Oggi» — la
                                        domanda utile è un'altra: a che ora si ricarica. */}
                                    {aOre ? (
                                        <BarStack h={200} unit="€" oggi={-1} media={null} barraMax={110}
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
                                        {/* ⚠️ una barra non può essere larga mezzo schermo: a
                                            inizio mese i giorni sono due, e con `flex-1` diventavano
                                            due lastroni di colore che non somigliano a un grafico */}
                                        <BarStack h={200} unit="€" barraMax={110}
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
                    {/* ══ I FILTRI, SOTTO IL GRAFICO (Luca 02/09) ═══════════════
                        «Apro la pagina di PayStore: devo vedere sopra i brand, poi
                        il grafico, e sotto il grafico i filtri dei punti vendita e
                        degli stati.» Ha ragione sull'ordine: i marchi dicono di che
                        cosa si parla, il grafico dice come sta andando, i filtri
                        servono dopo — quando si è visto l'insieme e si vuole
                        guardare un pezzo. */}
                    {/* ══ I FILTRI, SOTTO IL GRAFICO ═══════════════════════════
                        ⚠️ LA GRAMMATICA È QUELLA DEL MAGAZZINO, non una nuova.
                        Le tre regole scritte lì (`magazzino/page.tsx`) valgono
                        anche qui, ed erano state riscritte da capo al primo giro:
                          1. ogni fila di pastiglie ha sopra la sua etichetta;
                          2. ogni riquadro dice QUANTE RIGHE VEDRAI premendolo;
                          3. i riquadri a zero restano a schermo, spenti — «zero
                             scontrini persi» è la notizia buona della giornata, e
                             non vederla non è la stessa cosa che leggerla.
                        In più: due colonne dichiarate invece di `ml-auto`. Con
                        `flex-wrap`, quando la riga trabocca l'ultimo elemento va a
                        capo e il margine automatico lo incolla a destra di una
                        riga vuota: su un portatile da 1280 con la barra laterale
                        aperta i due quadrati cadevano da soli sotto 698 px di
                        niente — e bastava premere un filtro per provocarlo, perché
                        compariva «togli i filtri» e la riga non ci stava più. */}
                    <div className="glass-card an-card rounded-2xl p-4 psFascia">
                        <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
                            {/* ⚠️ IL PERIODO STA ANCHE QUI (Luca 02/09): «tra i filtri il
                                range per filtrare per data, così posso tornare indietro e a
                                quel punto posso vedere tutti i dati». È lo STESSO stato del
                                selettore in cima — un controllo solo, due posti dove si
                                prende — perché due periodi diversi che si contraddicono
                                sarebbero peggio di nessun periodo. Tornare indietro rimette
                                in elenco anche le già fatte, che di oggi sono nascoste. */}
                            <div className="rvCampo">
                                <span className="rvLab">Quando</span>
                                <div className="rvPillRow items-center">
                                    {[
                                        { id: "oggi", et: "Oggi", da: oggiISO(), a: oggiISO() },
                                        { id: "ieri", et: "Ieri", da: giornoMeno(1), a: giornoMeno(1) },
                                        { id: "7gg", et: "7 giorni", da: giornoMeno(6), a: oggiISO() },
                                        { id: "mese", et: "Mese", da: primoDelMese(), a: oggiISO() },
                                    ].map((v) => {
                                        const on = tipoP === "range" && range.da === v.da && range.a === v.a;
                                        return (
                                            <button key={v.id} aria-pressed={on}
                                                onClick={() => { setTipoP("range"); setRange({ da: v.da, a: v.a }); }}
                                                className={cn("rvPill rvPill-sm rvPill-tinta rvT-ambra", on && "rvPill-on")}>
                                                {v.et}{on ? " ✓" : ""}
                                            </button>
                                        );
                                    })}
                                    <input type="date" value={periodo.da} max={oggiISO()} title="dal"
                                        onChange={(e) => { setTipoP("range"); setRange({ da: e.target.value, a: periodo.a < e.target.value ? e.target.value : periodo.a }); }}
                                        className="an-data glass-input px-2 py-1 rounded-lg text-xs" />
                                    <span className="text-[11px] text-slate-500">→</span>
                                    <input type="date" value={periodo.a} min={periodo.da} max={oggiISO()} title="al"
                                        onChange={(e) => { setTipoP("range"); setRange({ da: periodo.da, a: e.target.value }); }}
                                        className="an-data glass-input px-2 py-1 rounded-lg text-xs" />
                                </div>
                            </div>
                            <div className="rvCampo">
                                <span className="rvLab">Dove</span>
                                {/* i negozi sono quattordici: una tendina, non quattordici
                                    pastiglie. ⚠️ `className` in FiltroMulti SOSTITUIVA lo
                                    stile invece di aggiungersi: passando solo la larghezza
                                    la casella restava nuda, senza cornice e con il testo
                                    più grande di tutta la fascia. */}
                                <FiltroMulti values={negoziSel} onChange={setNegoziSel} opzioni={d.negozi}
                                    etichettaTutti="Tutti i negozi" className="min-w-[200px] max-w-[240px]"
                                    etichette={Object.fromEntries(d.negozi.map((n) => [n, `${n} · ${quanteCon(["negozio"], (r) => String(r.negozio || "") === n)}`]))} />
                            </div>

                            <div className="rvCampo">
                                <span className="rvLab">Com&apos;è andata</span>
                                <div className="rvPillRow">
                                    {ORDINE_STATI.map((x) => {
                                        const n = quanteCon(["stato", "chiuse"], (r) => r.stato === x);
                                        if (!n && x !== "sospeso") return null;
                                        const on = stato === x;
                                        return (
                                            <button key={x} onClick={() => setStato(on ? "" : x)} aria-pressed={on}
                                                title={`${n} ricarich${n === 1 ? "a" : "e"} in questo stato`}
                                                className={cn("rvPill rvPill-sm rvPill-tinta", TINTA_STATO[x], on && "rvPill-on")}>
                                                {STATI[x].testo}{on ? " ✓" : ""}<span className="rvPillN">{n}</span>
                                            </button>
                                        );
                                    })}
                                    {/* ⚠️ QUANTE NE STA TENENDO DA PARTE. Nascondere in silenzio
                                        è come non averle mai registrate: il numero c'è, e si
                                        riaprono con un clic. */}
                                    {nascoste > 0 && (
                                        <button onClick={() => setMostraChiuse(true)}
                                            title="le ricariche già fatte nei giorni scorsi: chiuse e passate, non chiedono più niente"
                                            className="rvPill rvPill-sm rvPill-tinta rvT-grigio">
                                            👁 mostra le già fatte<span className="rvPillN">{nascoste}</span>
                                        </button>
                                    )}
                                    {mostraChiuse && (
                                        <button onClick={() => setMostraChiuse(false)} aria-pressed
                                            className="rvPill rvPill-sm rvPill-tinta rvT-grigio rvPill-on">
                                            👁 già fatte in elenco ✓
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="rvCampo">
                                <span className="rvLab">Da dove arriva</span>
                                <div className="rvPillRow">
                                    {(d.perOrigine || []).filter((o) => o.quante > 0).map((o) => {
                                        const on = origine === String(o.conAttivazione);
                                        return (
                                            <button key={String(o.conAttivazione)} onClick={() => setOrigine(on ? "" : String(o.conAttivazione))}
                                                aria-pressed={on} className={cn("rvPill rvPill-sm rvPill-tinta rvT-indaco", on && "rvPill-on")}
                                                title={o.conAttivazione ? "vendute insieme a un'attivazione" : "ricariche vendute da sole"}>
                                                {o.conAttivazione ? "con attivazione" : "sciolte"}{on ? " ✓" : ""}
                                                <span className="rvPillN">{quanteCon(["origine"], (r) => (r.con_attivazione === true) === o.conAttivazione)}</span>
                                            </button>
                                        );
                                    })}
                                    {(negoziSel || stato || origine || allarme || operatore) && (
                                        <button onClick={() => { setNegoziSel(null); setStato(""); setOrigine(""); setAllarme(""); setOperatore(""); setMostraChiuse(false); }}
                                            className="rvPill rvPill-sm rvPill-via">✕ togli i filtri</button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* ⚠️ I DUE ALLARMI SONO DIVENTATI FILTRI (Luca 02/09): «me li
                            rendi due quadrati che sono due filtri che posso cliccare,
                            a quel punto la lista sotto si regola in virtù dei filtri
                            che clicco sopra». Elencare le righe dentro un riquadro
                            rosso era un doppione della lista che sta già sotto — e su
                            62 ricariche diventava un muro. */}
                        <div className="rvCampo">
                            <span className="rvLab psLab-ko">Da sistemare</span>
                            <div className="rvRapidoG rvRapidoG-kpi psQuadri">
                                {[
                                    { id: "scontrino", n: senzaScontrino, et: "🧾 Senza scontrino", sub: "senza documento",
                                        tip: "il registratore non ha stampato: il cliente ha pagato e non ha il documento fiscale" },
                                    { id: "indietro", n: daGuardareDavvero, et: "⏳ Rimaste indietro", sub: "credito non partito",
                                        tip: "incassate in un giorno già chiuso, o non partite: il credito non risulta caricato" },
                                ].map((q) => {
                                    const on = allarme === q.id;
                                    return (
                                        <button key={q.id} type="button" title={q.tip} aria-pressed={on}
                                            disabled={!q.n && !on}
                                            onClick={() => setAllarme(on ? "" : q.id)}
                                            className={cn("rvRapido rvT-rosso", on && "rvRapido-on", q.n > 0 && !on && "rvRapido-sveglia", !q.n && "rvRapido-off")}>
                                            <em className={cn(q.n > 0 && "psNum-sveglia")}>{q.n.toLocaleString("it-IT")}</em>
                                            <b>{q.et}{on ? " ✓" : ""}</b>
                                            {/* ⚠️ «TUTTO A POSTO» SOLO SE LO È DAVVERO. Con un
                                                negozio scelto il numero è zero per quel negozio, ma
                                                nel periodo possono esserci nove ricariche senza
                                                scontrino: su un documento fiscale mancante quella
                                                frase è il giudizio sbagliato. */}
                                            <small>{q.n ? q.sub : senzaAltri ? "tutto a posto" : "nessuna con questi filtri"}</small>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="rvHint psFascia-hint">
                            Premi un riquadro o una pastiglia per vedere solo quelle: il numero dice quante righe
                            vedrai. ⚠️ Questi filtri agiscono <b>solo sulla lista</b>: i quattro numeri in cima e i
                            grafici restano quelli del periodo intero, se no filtrare sembrerebbe aver incassato di
                            meno. <b>Il marchio no</b>: quello in cima cambia anche i totali e i grafici.
                        </div>
                    </div>

                    {/* ── LE ULTIME ────────────────────────────────────────── */}
                    <div className="glass-card an-card rounded-2xl p-4">
                        <div className="flex items-baseline justify-between mb-3">
                            <h3 className="text-sm font-bold text-white">
                                Ricariche {righe.length.toLocaleString("it-IT")}
                                {righe.length !== d.ultime.length && <span className="text-slate-500 font-normal"> di {d.ultime.length.toLocaleString("it-IT")} del periodo</span>}
                                {/* QUALI, non solo quante: premendo «senza scontrino» la
                                    testata diceva ancora «le ultime 4», che è il numero
                                    giusto sotto l'etichetta sbagliata */}
                                {(allarme || stato || origine || negoziSel) && (
                                    <span className="text-[11px] font-semibold text-amber-300/90">
                                        {" · "}{[
                                            allarme === "scontrino" ? "senza scontrino" : allarme === "indietro" ? "rimaste indietro" : null,
                                            stato ? STATI[stato].testo : null,
                                            origine ? (origine === "true" ? "con attivazione" : "sciolte") : null,
                                            negoziSel ? (negoziSel.length === 1 ? negoziSel[0] : `${negoziSel.length} negozi`) : null,
                                        ].filter(Boolean).join(" · ")}
                                    </span>
                                )}
                            </h3>
                            <span className="text-[11px] text-slate-500 tabular-nums">{eurC(righe.reduce((t, r) => t + Number(r.importo || 0), 0))}</span>
                        </div>
                        {righe.length === 0 ? (
                            <div className="py-8 text-center">
                                <p className="text-xs text-slate-500">
                                    {d.ultime.length ? "Nessuna ricarica con questi filtri." : "Ancora nessuna ricarica registrata in questo periodo."}
                                </p>
                                {/* la via d'uscita sta dentro il vuoto, non venti righe più
                                    su: chi ci arriva sta cercando proprio quella */}
                                {d.ultime.length > 0 && (
                                    <button onClick={() => { setNegoziSel(null); setStato(""); setOrigine(""); setAllarme(""); setOperatore(""); }}
                                        className="rvPill rvPill-sm rvPill-via mt-3">✕ togli i filtri</button>
                                )}
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="psTab text-[12px]">
                                    <thead>
                                        <tr className="text-slate-500 text-[10px] uppercase tracking-widest">
                                            <th className="text-left font-bold py-1.5">Quando</th>
                                            <th className="text-left font-bold">Operatore</th>
                                            <th className="text-left font-bold">Taglio</th>
                                            <th className="text-left font-bold">Numero</th>
                                            <th className="text-right font-bold">Importo</th>
                                            <th className="text-left font-bold pl-3">Negozio</th>
                                            <th className="text-left font-bold">Chi</th>
                                            <th className="text-left font-bold">Scontrino</th>
                                            {/* con quale partita IVA è uscita: è il dato per cui
                                                esiste la regola delle due società di Donna */}
                                            <th className="text-left font-bold">Società</th>
                                            <th className="text-left font-bold">Stato</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {/* il filo fra le righe lo mette `.psTab`: scritto anche sul
                                            `<tr>`, con `border-collapse:separate` i due bordi non si
                                            fondevano e la riga restava separata da due fili di colori
                                            diversi */}
                                        {righe.slice(0, quante).map((r) => (
                                            <tr key={r.id}>
                                                <td className="py-1.5 text-slate-400 whitespace-nowrap">{new Date(r.creata_il).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                                                <td className="text-slate-200 font-semibold">
                                                    {/* ⚠️ IL NOME LO DECIDE IL CODICE OPERATORE, non quello
                                                        salvato sulla riga: nel registro convivono «WindTre»
                                                        scritto dal flusso normale e «WINDTRE» scritto dal
                                                        recupero, e nell'elenco sembravano due operatori. */}
                                                    <MarchioRiga op={r.operatore} />
                                                </td>
                                                <td className="text-slate-400">
                                                    {/* ⚠️ NON UN TRATTINO MUTO. Luca 02/09: «ci sono
                                                        delle ricariche dove non è selezionato il taglio».
                                                        Misurate: nessuna nasce così da una vendita al banco —
                                                        sono righe RICOSTRUITE dopo il fatto (dallo scontrino o
                                                        dalla vendita), di cui si conosce l'importo e non il
                                                        tasto premuto. Quelle il cui importo corrisponde a un
                                                        taglio del listino ora lo prendono da lì; restano solo
                                                        gli importi COMPOSTI (23 €, 26 €), che un taglio non
                                                        ce l'hanno perché sono somme. Dirlo è meglio che
                                                        lasciare un trattino che sembra un difetto. */}
                                                    {r.taglio || (
                                                        <span className="rvBadge rvBadge-empty" title={r.nota || "riga ricostruita dopo la vendita: si conosce l'importo, non il taglio premuto. Di solito perché l'importo è una somma di più tagli, che nel listino non esiste come pezzo singolo."}>
                                                            taglio non registrato
                                                        </span>
                                                    )}
                                                    {r.con_attivazione && <span className="psConSim" title="ricarica della SIM appena venduta: il numero è quello dell'attivazione">📶</span>}
                                                </td>
                                                <td className="font-mono text-slate-300">
                                                    {/* ⚠️ IL NUMERO SI PRENDE DALLO SCONTRINO, non si chiede a
                                                        chi guarda: è stampato nella descrizione della riga. Il
                                                        campo a mano resta per i casi in cui lo scontrino non
                                                        c'è — ma è l'eccezione, non la regola. */}
                                                    {r.numero ? r.numero : <NumeroMancante r={r} onCambiato={() => void carica()} />}
                                                </td>
                                                <td className="text-right font-bold text-white tabular-nums">{eurC(r.importo)}</td>
                                                <td className="pl-3 text-slate-400">{r.negozio || "—"}</td>
                                                <td className="text-slate-400">{r.venditore || "—"}</td>
                                                <td>
                                                    {r.scontrino_stato ? (
                                                        <span title={SCONTRINO[r.scontrino_stato]?.nota}
                                                            className={cn("inline-block px-2 py-0.5 rounded-lg border text-[10.5px] whitespace-nowrap", SCONTRINO[r.scontrino_stato]?.classe)}>
                                                            {SCONTRINO[r.scontrino_stato]?.testo || r.scontrino_stato}
                                                        </span>
                                                    ) : <span className="text-slate-600 text-[11px]" title="non abbiamo trovato il lavoro di stampa di questa vendita">non risulta</span>}
                                                </td>
                                                <td className="text-slate-400">{SOCIETA[r.azienda || ""] || "—"}</td>
                                                <td>
                                                    {/* ⚠️ LO STATO SI CAMBIA DA QUI. Finché le ricariche si
                                                        fanno sul terminale del fornitore, l'unico modo che il
                                                        CRM ha di sapere se il credito è partito è che glielo
                                                        dica chi l'ha caricato — e resta scritto chi è stato.
                                                        Accanto, il pulsante che la fa partire davvero. */}
                                                    <div className="flex items-center gap-1.5">
                                                        <StatoRicarica r={r} onCambiato={() => void carica()} />
                                                        <RifaiRicarica r={r} onFatto={() => void carica()} />
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {/* ⚠️ QUANTE NE MANCANO, SCRITTO. Un elenco che si
                                    ferma senza dirlo è un elenco che mente: qui le
                                    righe ci sono tutte, se ne disegnano un blocco
                                    per volta e il resto si chiede. */}
                                {/* ⚠️ SE IL DATABASE HA TAGLIATO, LO DICE. Ventimila righe
                                    sono nove mesi al ritmo di oggi, ma un «Periodo» su un anno
                                    intero le supera — e un elenco che si ferma senza dirlo è un
                                    elenco che mente. */}
                                {d.troncato && (
                                    <div className="rvNota rvNota-att mt-3">
                                        <div className="rvNota-t">⚠️ L&apos;elenco è tagliato</div>
                                        <div className="rvNota-s">
                                            Il periodo scelto contiene più di 20.000 ricariche e il database ne consegna
                                            al massimo quelle: le più vecchie restano fuori da questo elenco <b>e dai
                                            totali qui sopra</b>. Restringi l&apos;intervallo di date.
                                        </div>
                                    </div>
                                )}
                                {righe.length > quante && (
                                    <div className="text-center pt-3">
                                        <button onClick={() => setQuante((q) => q + 500)} className="rvPill rvPill-sm rvPill-tinta rvT-indaco">
                                            mostrane altre 500
                                            <span className="rvPillN">{(righe.length - quante).toLocaleString("it-IT")} ancora</span>
                                        </button>
                                    </div>
                                )}
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

/* ── RIFARE LA RICARICA ─────────────────────────────────────────────────────
   Luca 02/09: «un pulsante che di fatto la rinvia, perché magari ho verificato
   che dal sospeso ora la ricarica va fatta: devo poter cliccare lì e la
   ricarica si collega direttamente all'API di PayStore e la rifà».

   ⚠️ CHIEDE CONFERMA, e la conferma dice cosa sta per succedere: quanto, su
   che numero, e — quando siamo in collaudo — che nessun credito partirà
   davvero. Un pulsante che eroga denaro non si preme per sbaglio. */
function RifaiRicarica({ r, onFatto }: { r: Riga; onFatto: () => void }) {
    const [lavoro, setLavoro] = useState(false);
    // su una già fatta non c'è niente da rifare
    if (r.stato === "ok_automatico" || r.stato === "ok_manuale") return null;

    const esegui = async () => {
        if (!r.numero) { alert("Manca il numero da ricaricare: scrivilo prima di eseguire."); return; }
        const conferma = `Faccio partire questa ricarica adesso?\n\n` +
            `${nomeOp(r.operatore)} · ${eurC(r.importo)}\nsul numero ${r.numero}\n\n` +
            `Verrà chiamata l'API di PayStore.`;
        if (!window.confirm(conferma)) return;
        setLavoro(true);
        try {
            const x = await fetch("/api/paystore/esegui", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.id }) });
            const j = await x.json().catch(() => ({}));
            if (x.ok && j?.ok) {
                alert(j.collaudo
                    ? `Ambiente di COLLAUDO: la chiamata è andata a buon fine (operazione ${j.operationId}) ma NESSUN credito è stato erogato. Lo stato resta invariato.`
                    : j.gia
                        ? `Risultava già eseguita da PayStore (operazione ${j.operationId}): l'ho segnata come fatta.`
                        : `Ricarica eseguita. Operazione ${j.operationId}, ricevuta ${j.receiptId}.`);
            } else {
                alert((j?.definitivo === false
                    ? "⚠️ " : "⛔ ") + (j?.error || `errore ${x.status}`));
            }
            onFatto();
        } catch (e) {
            alert("⛔ " + String((e as Error)?.message || e));
        } finally { setLavoro(false); }
    };

    return (
        <button onClick={() => void esegui()} disabled={lavoro || !r.numero}
            title={r.numero ? "Fai partire questa ricarica adesso, tramite l'API di PayStore" : "manca il numero da ricaricare"}
            className="psRifai" aria-label="rifai la ricarica">
            {lavoro ? "…" : "↻"}
        </button>
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
    /* ⚠️ IL MENU ESCE DAL CONTENITORE, altrimenti non si vede. La tabella sta
       dentro un `overflow-x-auto` — serve a far scorrere le colonne su uno
       schermo stretto — e un contenitore che scorre in orizzontale TAGLIA
       anche in verticale: il menu dell'ultima riga finiva sotto il bordo e non
       si poteva cliccare (Luca 02/09), e aprirlo verso l'alto non sarebbe
       bastato, perché lo avrebbe tagliato dall'altra parte.
       Perciò va in un portale, in posizione fissa, con le coordinate prese dal
       pulsante: fuori dal contenitore non lo taglia più niente. Sopra o sotto
       lo decide lo spazio che c'è. */
    const [pos, setPos] = useState<{ x: number; y: number; sopra: boolean } | null>(null);
    const [lavoro, setLavoro] = useState(false);
    const st = STATI[r.stato] || { testo: r.stato, colore: "text-slate-400", sfondo: "bg-white/5 border-white/15" };
    const ALTEZZA_MENU = 132;   // tre voci più i bordi

    /* se la pagina scorre, un menu in posizione fissa resterebbe dov'era:
       si chiude, che è quello che uno si aspetta */
    useEffect(() => {
        if (!pos) return;
        const chiudi = () => setPos(null);
        window.addEventListener("scroll", chiudi, true);
        window.addEventListener("resize", chiudi);
        return () => { window.removeEventListener("scroll", chiudi, true); window.removeEventListener("resize", chiudi); };
    }, [pos]);

    const cambia = async (stato: string) => {
        setLavoro(true);
        try {
            const x = await fetch("/api/paystore/registro", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ azione: "stato", id: r.id, stato }) });
            const j = await x.json().catch(() => ({}));
            /* ⚠️ UN RIFIUTO SI DEVE VEDERE. Prima il codice era `if (x.ok)
               onCambiato()`: quando la rotta rispondeva «stato non valido»
               non succedeva NIENTE — nessun errore, nessun cambiamento, e
               dall'altra parte sembrava che il pannello non si aggiornasse.
               Un'azione che fallisce in silenzio è peggio di una che fallisce
               e lo dice. */
            if (x.ok && j?.ok) onCambiato();
            else alert("Non sono riuscito a cambiare lo stato: " + (j?.error || `errore ${x.status}`));
        } catch (e) {
            alert("Non sono riuscito a cambiare lo stato: " + String((e as Error)?.message || e));
        } finally { setLavoro(false); setPos(null); }
    };

    return (
        <>
            <button onClick={(e) => {
                if (pos) { setPos(null); return; }
                const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const sopra = window.innerHeight - b.bottom < ALTEZZA_MENU;
                setPos({ x: b.right, y: sopra ? b.top - 4 : b.bottom + 4, sopra });
            }} disabled={lavoro}
                title={r.stato_da ? `${STATI[r.stato]?.testo} — ${r.stato_da}, ${r.stato_il ? new Date(r.stato_il).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}` : "clicca per cambiare"}
                className={cn("px-2 py-0.5 rounded-lg border text-[11px] font-bold whitespace-nowrap", st.sfondo, st.colore)}>
                {st.testo} ▾
            </button>
            {pos && createPortal(
                <>
                    <div className="fixed inset-0 z-[2000]" onClick={() => setPos(null)} />
                    {/* ⚠️ il fondo passa da una classe, non da `bg-[#0d1022]`: quel colore
                        non è in nessuna lista di conversione, quindi nel tema chiaro il
                        menu restava una scatola nera con dentro voci a 3:1 — ed è il
                        menu con cui si dichiara che il credito di un cliente è partito */}
                    <div className="fixed z-[2001] rounded-xl border border-white/15 psMenuStato shadow-2xl p-1 min-w-[150px]"
                        style={{ left: pos.x, top: pos.y, transform: `translate(-100%, ${pos.sopra ? "-100%" : "0"})` }}>
                        {ORDINE_STATI.filter((x) => x !== r.stato).map((x) => (
                            <button key={x} onClick={() => void cambia(x)}
                                className={cn("block w-full text-left px-3 py-1.5 rounded-lg text-[12px] font-semibold hover:bg-white/10", STATI[x].colore)}>
                                {STATI[x].testo}
                            </button>
                        ))}
                    </div>
                </>, document.body)}
        </>
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
