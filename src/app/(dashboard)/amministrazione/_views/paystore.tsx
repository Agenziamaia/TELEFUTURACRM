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
import { RefreshCw, ChevronLeft, ChevronRight, Plus, Power, Trash2, Check, Loader2, Copy } from "lucide-react";
import { cn } from "@/utils";
import { NOME_SOCIETA } from "@/lib/societa";
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
/** il giorno (di Roma) in cui è stata fatta una ricarica.
 *  ⚠️ `creata_il.slice(0,10)` è il giorno di GREENWICH: fra mezzanotte e le due
 *  d'estate una vendita di stanotte risulterebbe di ieri — e con il
 *  nascondimento delle già fatte, sparirebbe il giorno stesso in cui è nata. */
const giornoRoma = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
/** il giorno di N giorni fa.
 *  ⚠️ La sottrazione si fa sulla DATA, non sui millisecondi: la notte del
 *  cambio dell'ora un giorno dura 23 o 25 ore, e `- n*86400000` sbagliava di
 *  un giorno — «Ieri» impostava lo stesso periodo di «Oggi». */
const giornoMeno = (n: number) => {
    const [y, m, g] = oggiISO().split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1, g - n));
    return d.toISOString().slice(0, 10);
};
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

type Riga = { perche?: string; id: string; creata_il: string; negozio: string | null; venditore: string | null; operatore: string; operatore_nome: string | null; numero: string; taglio: string | null; importo: number; stato: string; errore: string | null; azienda: string | null; nota: string | null; stato_da: string | null; stato_il: string | null; con_attivazione: boolean | null; scontrino_emesso: boolean | null; scontrino_errore: string | null; reparto_usato: number | null; scontrino_stato: string | null; tentativi?: number | null; tentata_il?: string | null; rif_fornitore?: string | null; ambiente?: string | null; inviata_il?: string | null };
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
/* ⚠️ IL NOME DELLE SOCIETÀ NON SI RISCRIVE A OGNI SCHERMATA: era in quattro
   grafie diverse nel CRM, e due file destinati allo stesso commercialista non
   si incrociavano. Sta in `@/lib/societa`, una volta. */
const SOCIETA = NOME_SOCIETA;

/* ═══ COPIARE IL NUMERO SENZA APRIRE NIENTE ════════════════════════════════
   Luca 03/09: «a fianco ai numeri mettici un bottoncino che clicco e mi copia
   il numero, senza aprirmi il dettaglio della ricarica».
   Serve tutti i giorni: il numero va incollato nel portale PayStore, in una
   chat, in una ricerca — e selezionarlo a mano dentro una riga cliccabile vuol
   dire aprire la scheda ogni volta.

   ⚠️ `stopPropagation` NON BASTA DA SOLO: la riga apre la scheda sul `click`,
   e il gesto di copia parte da qui — se non si ferma la risalita, si copia E si
   apre. Si ferma anche il `mousedown`, perché è lì che la riga prende il fuoco.

   ⚠️ E LA COPIA PUÒ FALLIRE: `navigator.clipboard` esiste solo in pagina
   sicura, e su un CRM aperto in http su rete locale non c'è. Il ripiego con la
   selezione nascosta funziona ovunque, e se fallisce anche quello si dice. */
function CopiaNumero({ numero }: { numero: string }) {
    const [fatto, setFatto] = useState<"" | "ok" | "no">("");
    const copia = async (e: React.MouseEvent) => {
        e.stopPropagation(); e.preventDefault();
        const testo = String(numero || "").replace(/\s/g, "");
        let riuscito = false;
        try {
            if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(testo); riuscito = true; }
        } catch { /* si prova il ripiego qui sotto */ }
        if (!riuscito) {
            try {
                const t = document.createElement("textarea");
                t.value = testo; t.style.position = "fixed"; t.style.opacity = "0";
                document.body.appendChild(t); t.select();
                riuscito = document.execCommand("copy");
                document.body.removeChild(t);
            } catch { riuscito = false; }
        }
        setFatto(riuscito ? "ok" : "no");
        setTimeout(() => setFatto(""), 1400);
    };
    return (
        <button type="button" onClick={copia} onMouseDown={(e) => e.stopPropagation()}
            title={fatto === "ok" ? "copiato" : fatto === "no" ? "non sono riuscito a copiarlo" : `copia ${numero}`}
            aria-label={`copia il numero ${numero}`}
            className={cn("psCopia", fatto === "ok" && "psCopia-ok", fatto === "no" && "psCopia-no")}>
            {fatto === "ok" ? "✓" : fatto === "no" ? "✕" : <Copy className="w-3 h-3" />}
        </button>
    );
}

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
    /* ⚠️ «NON PARTITA» NON SI CAPIVA (Luca 03/09: «non riesco a capire lo stato
       non partito a cosa si riferisce»). Vuol dire che il credito NON è uscito:
       PayStore l'ha rifiutata, o non siamo riusciti a mandarla. Il perché sta
       sulla riga, e adesso lo dice il suggerimento. */
    fallita: { testo: "credito NON erogato", colore: "text-rose-300", sfondo: "bg-rose-500/15 border-rose-400/40" },
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
    /* ⚠️ «MESE» NON È PIÙ UNA MODALITÀ, È UNA SCORCIATOIA. Il selettore in cima
       aveva due grammatiche — «mese con le frecce» oppure «intervallo» — e in
       fondo alla pagina ce n'era un terzo con le scorciatoie. Adesso il periodo
       è sempre un intervallo, e «Mese» lo imposta come gli altri tre pulsanti.
       Lo stato resta perché `periodo` lo legge, ma parte già su `range`. */
    const [tipoP, setTipoP] = useState<"mese" | "range">("range");
    const [ym, setYm] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1 }; });
    const [range, setRange] = useState({ da: primoDelMese(), a: oggiISO() });   // si apre sul mese in corso
    /* i negozi in una tendina multiselezione: null = tutti (la convenzione del
       FiltroMulti che il CRM usa già in Ricerca Vendite e nel Calendario) */
    const [negoziSel, setNegoziSel] = useState<string[] | null>(null);
    /* ⚠️ LA SOCIETÀ È UN FILTRO A SÉ, NON UN NEGOZIO. Luca 03/09: «alla destra
       di quella tendina mettimi un altro filtro che mi filtra Telefutura o
       Telefutura 2». Non si può ricavare dal negozio: quasi tutte le insegne
       hanno una cassa per società, e la stessa Magliana vende sotto entrambe.
       "" = tutte e due. */
    const [societa, setSocieta] = useState<string>("");
    /* «senza scontrino» e «rimaste indietro»: due pulsanti che filtrano la
       lista, non due elenchi da leggere */
    const [allarme, setAllarme] = useState("");
    /* ⚠️ QUELLO CHE HAI APPENA SEGNATO NON SPARISCE DA SOTTO IL DITO. Misurato:
       delle 79 sospese di oggi, 71 uscivano dall'elenco nell'istante in cui le
       si marcava «fatta» — un clic sbagliato e la riga era in mezzo a 89
       nascoste. Le righe toccate in questa sessione restano finché non si
       ricarica la pagina. */
    const [toccate, setToccate] = useState<Set<string>>(new Set());
    /* ⚠️ LE GIÀ FATTE DEI GIORNI SCORSI NON STANNO IN ELENCO (Luca 02/09): «le
       ricariche dei giorni PRECEDENTI che sono in ok devono nascondersi».
       Una ricarica chiusa e passata non chiede più niente a nessuno: sta in
       mezzo e basta. Quelle di OGGI restano — la giornata è ancora aperta e
       serve vedere cosa è uscito dal banco. Si riaprono con questo
       interruttore, premendo lo stato «ok», o tornando indietro col periodo. */
    /* `null` = non l'ha ancora toccato nessuno: allora decide il periodo —
       su OGGI si vede tutto, sullo storico si vede quello che resta da fare.
       Appena qualcuno preme, comanda la sua scelta, e comanda su tutte e due
       le viste: prima, sulla vista di oggi, premere non faceva assolutamente
       niente perché non c'era niente da nascondere per costruzione. */
    /* ═══ QUALI STATI SI VEDONO ════════════════════════════════════════════
       Luca 03/09: «anziché quel filtro "completate" che non serve a niente,
       quando filtro un qualsiasi giorno mi dà già preselezionati in sospeso,
       non partita e annullata, e mi lascia non cliccati ok automatico e ok
       manuale, che posso aggiungere io. Così togliamo questo flusso delle
       completate in elenco, che crea confusione».

       ⚠️ ED È MEGLIO DEL PULSANTE CHE HO TOLTO. Quello nascondeva le completate
       con una regola sua — «chiusa, scontrino emesso, reparto giusto, numero
       c'è» — che nessuno poteva indovinare guardando lo schermo: le righe
       sparivano e il perché stava nel codice. Adesso quello che si vede è
       scritto sulle pastiglie: tre accese, due spente, e si cambia premendo.
       Vale per QUALUNQUE periodo — oggi, ieri, sette giorni, un mese — senza
       regole diverse a seconda del giorno. */
    /* ⚠️ CERCARE UN NUMERO È LA DOMANDA PIÙ FREQUENTE DI TUTTE, e finora non
       c'era: quando un cliente telefona dicendo «non mi è arrivata la
       ricarica», l'unico appiglio è il suo numero — e senza questo campo si
       scorrevano duecento righe a occhio. */
    const [cerca, setCerca] = useState("");
    const DA_SISTEMARE = ["sospeso", "fallita", "annullata"];
    const [stati, setStati] = useState<Set<string>>(() => new Set(DA_SISTEMARE));
    /* ⚠️ LA RIGA SI APRE, NON SI SFOGLIA. Su una ricarica che non è andata la
       domanda non è mai «quanto era»: è «cosa c'era intorno» — quale vendita,
       quale cliente, chi l'ha corretta e quante volte l'abbiamo mandata. Tutto
       questo in una tabella non ci sta, e in una tabella larga meno che mai. */
    const [aperta, setAperta] = useState<string | null>(null);
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
    const [vista, setVista] = useState<"registro" | "tagli" | "chiavi">("registro");
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
    useEffect(() => { setQuante(200); }, [periodo.da, periodo.a, negoziSel, societa, stati, origine, allarme, operatore, cerca]);
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
    const rimastaIndietro = (r: Riga) => r.stato === "fallita" || (r.stato === "sospeso" && giornoRoma(r.creata_il) < oggiS);
    /* Ogni filtro è una funzione a sé, così il contatore di un pulsante si può
       calcolare CON GLI ALTRI FILTRI ATTIVI e senza il proprio.
       ⚠️ È la differenza fra un numero e una bugia: contando ogni pulsante
       sull'insieme intero, «Donna» + «senza scontrino» mostrava 7 sul quadrato
       e ZERO righe sotto. Il numero su un pulsante deve dire quante righe si
       vedranno premendolo. */
    /* ⚠️ «CHIUSA» NON VUOL DIRE SOLO CHE IL CREDITO È PARTITO. Lo stato parla
       della ricarica; una riga può avere il credito erogato e restare aperta
       sul FISCALE — misurato al primo giro: fra le 72 che nascondevo c'erano
       2 clienti che avevano pagato e NON avevano lo scontrino, 2 di cui non si
       sapeva se lo scontrino fosse uscito, e tutte e 8 le righe dell'archivio
       finite sul reparto 3 invece che sull'1, cioè ricariche assoggettate a
       IVA per sbaglio (art. 74). Sparivano proprio dal posto dove
       l'amministrazione le deve trovare.
       Si nasconde solo quello che non chiede più niente a nessuno: credito
       partito, documento uscito, reparto giusto, numero scritto. */
    /* ⚠️ IL NASCONDIMENTO AUTOMATICO NON C'È PIÙ. Prima le ricariche già a
       posto sparivano da sole secondo una regola scritta nel codice — chiusa,
       scontrino emesso, reparto giusto, numero presente — e chi guardava non
       poteva sapere perché una riga non ci fosse. Adesso lo dicono le
       pastiglie: quello che si vede è quello che è acceso.
       `toccate` resta: una riga su cui si è appena agito NON deve sparire sotto
       le dita mentre la si guarda. */
    /* le cifre e basta: chi cerca scrive «333 12 34 567» o «+39 333…», e un
       confronto letterale non troverebbe niente */
    const soloCifre = (x: string) => String(x || "").replace(/\D/g, "");
    const cercaN = soloCifre(cerca);
    const F = {
        /* ⚠️ IL NUMERO VINCE SUGLI ALTRI FILTRI. Chi cerca un numero lo cerca
           perché un cliente ha chiamato: se lo stato o il negozio lo tenessero
           fuori, la risposta sarebbe «non risulta» su una ricarica che c'è. */
        cerca: (r: Riga) => !cercaN || soloCifre(r.numero).includes(cercaN),
        stato: (r: Riga) => !!cercaN || toccate.has(r.id) || stati.has(r.stato),
        negozio: (r: Riga) => !!cercaN || !negoziSel || negoziSel.includes(String(r.negozio || "")),
        societa: (r: Riga) => !!cercaN || !societa || String(r.azienda || "—") === societa,
        origine: (r: Riga) => !!cercaN || !origine || String(r.con_attivazione === true) === origine,
        allarme: (r: Riga) => !!cercaN || !allarme
            || (allarme === "scontrino" && r.scontrino_stato === "errore")
            || (allarme === "indietro" && rimastaIndietro(r)),
    };
    const tutte = d.ultime;
    const righe = tutte.filter((r) => F.cerca(r) && F.stato(r) && F.negozio(r) && F.societa(r) && F.origine(r) && F.allarme(r));
    /** quante righe resterebbero premendo questo pulsante, con quello che è
     *  già premuto adesso */
    const quanteCon = (tranne: (keyof typeof F)[], cond: (r: Riga) => boolean) =>
        tutte.filter((r) => cond(r) && (Object.keys(F) as (keyof typeof F)[])
            .every((k) => tranne.includes(k) || F[k](r))).length;
    /* ⚠️ I DUE ALLARMI CONTANO QUELLO CHE SI VEDRÀ, SEMPRE. Prima, a filtri
       spenti, usavano i numeri del server — che non sanno dei filtri: il
       quadrato prometteva 9 righe senza scontrino e la lista ne mostrava 7. */
    const senzaScontrino = quanteCon(["allarme", "stato"], (r) => r.scontrino_stato === "errore");
    const daGuardareDavvero = quanteCon(["allarme", "stato"], rimastaIndietro);
    /* ⚠️ IL GRAFICO PARLA DI GIORNI, e le ore le mostra solo se gliele chiedi
       (Luca 02/09): «questo grafico deve darmi l'andamento giorno per giorno,
       poi nel momento in cui io clicco su un giorno a quel punto mi esplode
       l'andamento orario». Prima passava da solo alle ore quando i giorni con
       vendite erano uno o due — comodo la prima settimana, ma vuol dire che
       l'andamento dei giorni, che è la domanda normale, non si poteva vedere.
       L'unica eccezione resta il periodo di UN GIORNO SOLO («Oggi»): lì i
       giorni sono una barra sola, che non è un grafico. */
    /* ═══ UN SOLO SISTEMA DI FILTRAGGIO ═══════════════════════════════════
       Luca 02/09: «nel momento in cui vado a filtrare sotto, anche la parte di
       sopra deve modificarsi: dev'essere un blocco unico, i filtri che applico
       restituiscono la lista sotto e il grafico si adatta sopra».
       Prima i quattro numeri e i grafici venivano dal server, calcolati sul
       periodo intero: filtrare su un negozio cambiava l'elenco e lasciava i
       totali di tutti, e la pagina lo doveva scrivere in fondo per non mentire.
       Adesso si calcolano qui, sulle stesse righe che si vedono.

       ⚠️ TRANNE IL NASCONDIMENTO DELLE COMPLETATE, che non è un filtro sulla
       realtà ma un modo di leggere l'elenco: se togliesse anche i soldi,
       l'incassato CALEREBBE man mano che le ricariche vengono fatte — cioè
       l'esatto contrario di quello che è successo. */
    /* ⚠️ E LA SOCIETÀ È UN FILTRO COME GLI ALTRI. Dimenticarla qui vuol dire
       che premendo «Telefutura 2» l'elenco scende a 121 righe mentre i quadrati
       in cima continuano a dire 326 e 4.007 € — il difetto esatto contro cui è
       scritto il commento qui sopra, ripetuto sul filtro nuovo. */
    const perTotali = tutte.filter((r) => F.negozio(r) && F.societa(r) && F.stato(r) && F.origine(r) && F.allarme(r));
    const somma = (g: Riga[]) => g.reduce((x, r) => x + Number(r.importo || 0), 0);
    const raggruppa = <K extends string | number>(g: Riga[], chiave: (r: Riga) => K) => {
        const m = new Map<K, { quante: number; euro: number }>();
        for (const r of g) {
            const k = chiave(r); const v = m.get(k) || { quante: 0, euro: 0 };
            v.quante++; v.euro += Number(r.importo || 0); m.set(k, v);
        }
        return m;
    };
    const totaleV = { quante: perTotali.length, euro: somma(perTotali) };
    /* i giorni del periodo restano quelli del server: servono a dire «media al
       giorno» anche sui giorni in cui non si è venduto niente */
    const giorniPeriodo = d.perGiorno.map((g) => g.giorno);
    const perGiornoMap = raggruppa(perTotali, (r) => r.creata_il.slice(0, 10));
    const perGiornoV = giorniPeriodo.map((giorno) => {
        const v = perGiornoMap.get(giorno) || { quante: 0, euro: 0 };
        const dentro = perTotali.filter((r) => r.creata_il.slice(0, 10) === giorno);
        const ops = raggruppa(dentro, (r) => r.operatore);
        return {
            giorno, quante: v.quante, euro: v.euro,
            parti: [...ops.entries()].map(([operatore, o]) => ({ operatore, nome: nomeOp(operatore), quante: o.quante, euro: o.euro })).sort((a, b) => b.euro - a.euro),
        };
    });
    const perOperatoreV = [...raggruppa(perTotali, (r) => r.operatore).entries()]
        .map(([operatore, v]) => ({ operatore, nome: nomeOp(operatore), quante: v.quante, euro: v.euro }))
        .sort((a, b) => b.euro - a.euro);
    const perNegozioV = [...raggruppa(perTotali, (r) => String(r.negozio || "—")).entries()]
        .map(([negozio, v]) => ({ negozio, quante: v.quante, euro: v.euro }))
        .sort((a, b) => b.euro - a.euro);
    /* ⚠️ IL CONFRONTO COL PERIODO PRIMA VALE SOLO SENZA FILTRI. Il server lo
       calcola sul periodo intero, e le righe di prima non ce le abbiamo:
       confrontare «solo Magliana, oggi» con «tutti i negozi, ieri» sarebbe un
       numero che sembra un paragone e non lo è. */
    const filtriAccesi = !!(negoziSel || societa || stato || origine || allarme);

    const unGiornoSolo = perGiornoV.length === 1;
    const aOre = unGiornoSolo || giornoAperto != null;
    const giornoDelleOre = unGiornoSolo ? perGiornoV[0].giorno : giornoAperto;
    /* ⚠️ NIENTE `useMemo` QUI: siamo dopo i `return` anticipati (errore, dati
       non ancora arrivati), e un hook dopo un ritorno condizionale cambia
       l'ordine degli hook fra un render e l'altro — React se ne accorge e la
       pagina non si apre più. Il calcolo è su duecento righe: costa niente. */
    const perOra = (() => {
        if (!aOre || !giornoDelleOre) return [];
        const m = new Map<number, { euro: number; ops: Map<string, { euro: number; quante: number }> }>();
        for (const r of perTotali.filter((x) => x.creata_il.slice(0, 10) === giornoDelleOre)) {
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
    const media = perGiornoV.length ? totaleV.euro / perGiornoV.length : 0;
    const dettaglio = giornoAperto ? perGiornoV.find((g) => g.giorno === giornoAperto) : null;

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
                        {/* ⚠️ UN PERIODO SOLO, E STA QUI (Luca 02/09): «i campi di data e
                            range sono due — sopra e sotto — e quelli sotto mi piacciono di
                            più: hanno quattro pulsanti veloci e poi il range. Portami questa
                            impostazione ma mettila sopra».
                            Prima erano due controlli sullo stesso stato, scritti in due
                            grammatiche diverse: quello in cima ragionava per «mese o
                            intervallo», quello in fondo per scorciatoie. Due modi di dire la
                            stessa cosa nella stessa pagina sono uno di troppo. */}
                        <div className="flex flex-wrap items-center gap-1.5">
                            {[
                                { id: "oggi", et: "Oggi", da: oggiISO(), a: oggiISO() },
                                { id: "ieri", et: "Ieri", da: giornoMeno(1), a: giornoMeno(1) },
                                { id: "7gg", et: "7 giorni", da: giornoMeno(6), a: oggiISO() },
                                { id: "mese", et: "Mese", da: primoDelMese(), a: oggiISO() },
                            ].map((v) => {
                                const on = periodo.da === v.da && periodo.a === v.a;
                                return (
                                    <button key={v.id} aria-pressed={on}
                                        onClick={() => { setTipoP("range"); setRange({ da: v.da, a: v.a }); }}
                                        className={cn("rvPill rvPill-tinta rvT-ambra", on && "rvPill-on")}>
                                        {v.et}{on ? " ✓" : ""}
                                    </button>
                                );
                            })}
                            <input type="date" value={periodo.da} max={oggiISO()} title="dal"
                                onChange={(e) => { setTipoP("range"); setRange({ da: e.target.value, a: periodo.a < e.target.value ? e.target.value : periodo.a }); }}
                                className="an-data glass-input px-2.5 py-1.5 rounded-lg text-xs" />
                            <span className="text-[11px] text-slate-500">→</span>
                            <input type="date" value={periodo.a} min={periodo.da} max={oggiISO()} title="al"
                                onChange={(e) => { setTipoP("range"); setRange({ da: periodo.da, a: e.target.value }); }}
                                className="an-data glass-input px-2.5 py-1.5 rounded-lg text-xs" />
                        </div>
                        <div className="flex gap-0.5 p-0.5 rounded-xl bg-white/5 border border-white/10">
                            {[{ id: "registro", label: "Registro" }, { id: "tagli", label: "Listino tagli" }, { id: "chiavi", label: "Credenziali" }].map((v) => (
                                <button key={v.id} onClick={() => setVista(v.id as "registro" | "tagli" | "chiavi")}
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
                            const q = perOperatoreV.find((x) => x.operatore === o);
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
                                {(torta === "negozi" ? perNegozioV.length : perOperatoreV.length) ? (
                                    <Donut size={186} unit="€" centro={eur(totaleV.euro)}
                                        slices={torta === "negozi"
                                            ? perNegozioV.map((n, i) => ({ label: n.negozio, val: n.euro, colore: TINTE_NEG[i % TINTE_NEG.length], sub: `${n.quante} ricarich${n.quante === 1 ? "a" : "e"}` }))
                                            : perOperatoreV.map((o) => ({ label: nomeOp(o.operatore), val: o.euro, colore: tintaOp(o.operatore), sub: `${o.quante} ricarich${o.quante === 1 ? "a" : "e"}` }))} />
                                ) : <p className="text-xs text-slate-500 py-6 text-center">Nessuna ricarica nel periodo.</p>}
                            </div>
                        </div>

                        <div className="flex flex-col gap-4">
                            {/* i quattro numeri, tutti interrogabili */}
                            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                                {[
                                    { t: "Ricariche", v: String(totaleV.quante), c: "#f8b516", n: "Quante ne sono state vendute nel periodo scelto." },
                                    { t: "Incassato", v: eur(totaleV.euro), c: "#34d399", n: "La somma dei tagli. È esente IVA: sullo scontrino è tutto imponibile zero." },
                                    { t: "Media al giorno", v: eur(media), c: "#818cf8", n: `Su ${perGiornoV.length} giorni del periodo, compresi quelli senza vendite.` },
                                    /* ⚠️ NON SI CONFRONTA UN PEZZO CON UN TUTTO. Il periodo prima lo calcola il
   server sull'intero, e le sue righe non ce le abbiamo: con un filtro acceso
   accostare «solo Magliana, oggi» a «tutti i negozi, ieri» darebbe un numero
   che sembra un paragone e non lo è. */
{ t: "Periodo prima", v: filtriAccesi ? "—" : eur(d.totale.euroPrima), c: "#64748b",
  n: filtriAccesi ? "Con un filtro acceso non si confronta: il periodo prima è calcolato su tutto." : "Lo stesso numero di giorni, subito prima. Serve a capire se stiamo crescendo." },
                                ].map((k) => (
                                    <Tip key={k.t} content={<><TipTitolo>{k.t}</TipTitolo><TipRiga l="" r={k.n} /></>}>
                                        <div className="rounded-2xl border border-white/10 bg-black/20 px-3.5 py-3 cursor-help">
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{k.t}</p>
                                            <p className="text-2xl font-black tabular-nums mt-0.5" style={{ color: k.c }}>{k.v}</p>
                                            {k.t === "Incassato" && !filtriAccesi && d.totale.euroPrima > 0 && (
                                                <Delta v={totaleV.euro - d.totale.euroPrima} euro />
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
                                        ? perNegozioV.map((n, i) => ({ label: n.negozio, val: n.euro, colore: TINTE_NEG[i % TINTE_NEG.length], sub: `${n.quante} ricarich${n.quante === 1 ? "a" : "e"}` }))
                                        : perOperatoreV.map((o) => ({ label: nomeOp(o.operatore), val: o.euro, colore: tintaOp(o.operatore), sub: `${o.quante} ricarich${o.quante === 1 ? "a" : "e"}` })))} />
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
                                    ) : perGiornoV.some((g) => g.euro > 0) ? (
                                        /* ⚠️ `BarStack` non conosce il clic: si intercetta la
                                           posizione orizzontale e si risale al giorno. Meno
                                           elegante di una prop, ma non tocca un componente che
                                           usano tutte le altre schermate. È lo stesso modo della
                                           sezione AI. */
                                        <div onClick={(e) => {
                                            const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                            const i = Math.floor(((e.clientX - box.left) / box.width) * perGiornoV.length);
                                            const g = perGiornoV[Math.max(0, Math.min(perGiornoV.length - 1, i))];
                                            if (g) setGiornoAperto(giornoAperto === g.giorno ? null : g.giorno);
                                        }} className="cursor-pointer"
>
                                        {/* ⚠️ una barra non può essere larga mezzo schermo: a
                                            inizio mese i giorni sono due, e con `flex-1` diventavano
                                            due lastroni di colore che non somigliano a un grafico */}
                                        <BarStack h={200} unit="€" barraMax={110}
                                            giorni={perGiornoV.map((g) => ({
                                                n: Number(g.giorno.slice(8, 10)),
                                                label: g.giorno.slice(8, 10) + "/" + g.giorno.slice(5, 7),
                                                tot: g.euro,
                                                parti: g.parti.map((p) => ({ label: nomeOp(p.operatore), val: p.euro, colore: tintaOp(p.operatore), sub: `${p.quante} ricarich${p.quante === 1 ? "a" : "e"}` })),
                                            }))}
                                            oggi={perGiornoV.findIndex((g) => g.giorno === oggiISO())} media={media || null} />
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
                            {/* ⚠️ IL PERIODO NON STA PIÙ QUI. Era in questa fascia con
                                quattro scorciatoie e il range, e in cima con un altro
                                selettore: due controlli sullo stesso stato, scritti in due
                                grammatiche diverse. Luca 02/09 ha scelto questo — «mi piace
                                di più per come è statica» — e l'ha voluto SOPRA. Qui restano
                                solo i filtri che tagliano l'elenco: dove, com'è andata, da
                                dove arriva, e i due allarmi. */}
                            {/* ⚠️ IL PRIMO CAMPO DELLA FASCIA, e non per gusto: quando un
                                cliente telefona «non mi è arrivata la ricarica», l'unica cosa
                                che ha in mano è il suo numero. Cercarlo deve costare un gesto,
                                non lo scorrimento di duecento righe. */}
                            <div className="rvCampo">
                                <span className="rvLab">Numero del cliente</span>
                                <div className="rvPillRow items-center">
                                    <input value={cerca} inputMode="numeric" placeholder="333 1234567"
                                        onChange={(e) => setCerca(e.target.value)}
                                        className="an-data glass-input px-3 py-2 rounded-lg text-[13px] font-mono"
                                        style={{ width: 150 }} />
                                    {cerca && (
                                        <button onClick={() => setCerca("")} className="rvPill rvPill-sm rvPill-via">✕</button>
                                    )}
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
                                    etichettaTutti="Tutti i negozi" className="min-w-[210px] max-w-[250px] !py-2.5"
                                    etichette={Object.fromEntries(d.negozi.map((n) => [n, `${n} · ${quanteCon(["negozio"], (r) => String(r.negozio || "") === n)}`]))} />
                            </div>

                            <div className="rvCampo">
                                <span className="rvLab">Società</span>
                                <div className="rvPillRow">
                                    {/* ⚠️ E LA TERZA PASTIGLIA NON È UN VEZZO. A database ci sono
                                        righe con la società VUOTA — succede col carrello misto,
                                        dove a decidere è la merce — e con due sole pastiglie
                                        sparivano da entrambe: fra queste ce n'erano tre SOSPESE
                                        per 84 €, cioè proprio quelle da lavorare. Compare solo
                                        se ce ne sono. */}
                                    {(["T1", "T2", ...(tutte.some((r) => !r.azienda) ? ["—"] : [])] as const).map((x) => {
                                        const n = quanteCon(["societa"], (r) => String(r.azienda || "—") === x);
                                        const on = societa === x;
                                        return (
                                            <button key={x} aria-pressed={on}
                                                /* si preme per accendere, si ripreme per tornare a tutte e
                                                   due: due pastiglie non hanno bisogno di un terzo pulsante
                                                   «tutte» che occupa spazio per dire niente */
                                                onClick={() => setSocieta((v) => (v === x ? "" : x))}
                                                title={x === "—" ? `${n} ricariche senza società: il carrello era misto, la società la sa solo lo scontrino`
                                                    : `${n} ricarich${n === 1 ? "a" : "e"} di ${SOCIETA[x]}`}
                                                className={cn("rvPill rvPill-tinta", x === "T1" ? "rvT-ciano" : x === "T2" ? "rvT-viola" : "rvT-ambra", on && "rvPill-on")}>
                                                {x === "—" ? "senza società" : SOCIETA[x]}{on ? " ✓" : ""}<span className="rvPillN">{n}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="rvCampo">
                                <span className="rvLab">Com&apos;è andata</span>
                                <div className="rvPillRow">
                                    {ORDINE_STATI.map((x) => {
                                        const n = quanteCon(["stato"], (r) => r.stato === x);
                                        if (!n && !DA_SISTEMARE.includes(x)) return null;
                                        const on = stati.has(x);
                                        return (
                                            <button key={x} aria-pressed={on}
                                                onClick={() => setStati((v) => {
                                                    /* ⚠️ NON SI PUÒ SPEGNERE TUTTO. Un elenco vuoto non è un
                                                       filtro: è una schermata che sembra rotta. Togliendo
                                                       l'ultima pastiglia si torna alle tre di partenza. */
                                                    const nuovo = new Set(v);
                                                    if (nuovo.has(x)) nuovo.delete(x); else nuovo.add(x);
                                                    return nuovo.size ? nuovo : new Set(DA_SISTEMARE);
                                                })}
                                                title={`${n} ricarich${n === 1 ? "a" : "e"} in questo stato — premi per ${on ? "toglierle dall'" : "aggiungerle all'"}elenco`}
                                                className={cn("rvPill rvPill-tinta", TINTA_STATO[x], on && "rvPill-on")}>
                                                {STATI[x].testo}{on ? " ✓" : ""}<span className="rvPillN">{n}</span>
                                            </button>
                                        );
                                    })}
                                    {/* ⚠️ IL PULSANTE «COMPLETATE IN ELENCO» È SPARITO (Luca 03/09:
                                        «non serve a niente e crea confusione»). Nascondeva le
                                        ricariche a posto con una regola scritta nel codice che
                                        nessuno poteva indovinare guardando lo schermo. Adesso quello
                                        che si vede sta tutto sulle pastiglie qui sopra: tre accese
                                        di partenza, due spente, e si cambia premendo. */}
                                    {[...stati].sort().join() !== [...DA_SISTEMARE].sort().join() && (
                                        <button onClick={() => setStati(new Set(DA_SISTEMARE))}
                                            className="rvPill rvPill-tinta rvT-grigio"
                                            title="torna ai tre stati di partenza: in sospeso, non partita, annullata">
                                            ↺ solo da sistemare
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
                                                aria-pressed={on} className={cn("rvPill rvPill-tinta rvT-indaco", on && "rvPill-on")}
                                                title={o.conAttivazione ? "vendute insieme a un'attivazione" : "ricariche vendute da sole"}>
                                                {o.conAttivazione ? "con attivazione" : "sciolte"}{on ? " ✓" : ""}
                                                <span className="rvPillN">{quanteCon(["origine"], (r) => (r.con_attivazione === true) === o.conAttivazione)}</span>
                                            </button>
                                        );
                                    })}
                                    {(negoziSel || societa || stato || origine || allarme || operatore) && (
                                        <button /* ⚠️ NON rispegne «mostra le già fatte»: un pulsante che promette
                                                di togliere filtri e fa vedere MENO righe di prima è la cosa
                                                più confusa che possa fare. Quello è un filtro che allarga. */
                                            onClick={() => { setNegoziSel(null); setSocieta(""); setStato(""); setOrigine(""); setAllarme(""); setOperatore(""); }}
                                            className="rvPill rvPill-via">✕ togli i filtri</button>
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
                                            <small>{q.n ? q.sub : (negoziSel || stato || origine) ? "nessuna con questi filtri" : "tutto a posto"}</small>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="rvHint psFascia-hint">
                            Premi un riquadro o una pastiglia per vedere solo quelle: il numero dice quante righe
                            vedrai. Questi filtri valgono per <b>tutta la pagina</b> — i quattro numeri, i grafici e
                            l'elenco raccontano sempre la stessa cosa.
                            {" "}Di partenza sono accesi i tre stati <b>da sistemare</b>: le già fatte si aggiungono
                            premendo la loro pastiglia.
                            {" "}Cercando un <b>numero</b>, invece, gli altri filtri si sospendono: chi cerca un numero
                            lo fa perché un cliente ha chiamato, e una risposta «non risulta» su una ricarica che
                            esiste sarebbe la cosa peggiore.
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
                                {/* ⚠️ IL NASCONDIMENTO SI DICE. È l'unico «filtro» che è
                                    acceso senza che nessuno l'abbia premuto, e nell'unico caso
                                    in cui non c'è nient'altro da elencare era anche l'unico a
                                    non comparire: la lista diceva «91 di 180» e non spiegava. */}
                                {/* ⚠️ COSA SI STA GUARDANDO, scritto per esteso: gli stati
                                    accesi si dicono sempre, perché di partenza tre sono accesi e
                                    due no — e chi non lo sa si chiede dove sono finite le altre. */}
                                {cercaN && (
                                    <span className="text-[11px] font-semibold text-indigo-300">
                                        {" · "}numero che contiene {cercaN} — gli altri filtri sono sospesi
                                    </span>
                                )}
                                {!cercaN && <span className="text-[11px] font-semibold text-amber-300/90">
                                    {" · "}{[
                                        [...ORDINE_STATI].filter((x) => stati.has(x)).map((x) => STATI[x].testo).join(", "),
                                        allarme === "scontrino" ? "senza scontrino" : allarme === "indietro" ? "rimaste indietro" : null,
                                        origine ? (origine === "true" ? "con attivazione" : "sciolte") : null,
                                        negoziSel ? (negoziSel.length === 1 ? negoziSel[0] : `${negoziSel.length} negozi`) : null,
                                        societa ? (SOCIETA[societa] || "senza società") : null,
                                    ].filter(Boolean).join(" · ")}
                                </span>}
                            </h3>
                            {/* ⚠️ DI COSA PARLA QUESTO NUMERO. Con le già fatte nascoste
                                qui si leggeva 778 € mentre il quadrato «Incassato» diceva
                                1.710: 932 € di scarto, taciuto, senza aver premuto niente. */}
                            <span className="text-[11px] text-slate-500 tabular-nums">
                                {eurC(righe.reduce((t, r) => t + Number(r.importo || 0), 0))}
                                {righe.length !== d.ultime.length ? " in elenco" : ""}
                            </span>
                        </div>
                        {righe.length === 0 ? (
                            <div className="py-8 text-center">
                                <p className="text-xs text-slate-500">
                                    {!d.ultime.length ? "Ancora nessuna ricarica registrata in questo periodo."
                                        /* ⚠️ «VUOTO» SU UN REGISTRO DI SOLDI INCASSATI è il messaggio
                                            peggiore possibile. Di partenza si vedono solo i tre stati da
                                            sistemare: se non ce n'è nessuna, la notizia è buona e va detta
                                            così — non con un elenco vuoto che sembra un guasto. */
                                        : !stati.has("ok_automatico") && !stati.has("ok_manuale")
                                            ? "Niente da sistemare in questo periodo: le ricariche sono tutte a posto."
                                            : "Nessuna ricarica con questi filtri."}
                                </p>
                                {/* la via d'uscita sta dentro il vuoto, non venti righe più
                                    su: chi ci arriva sta cercando proprio quella */}
                                {!stati.has("ok_automatico") && (
                                    <button onClick={() => setStati(new Set(ORDINE_STATI))}
                                        className="rvPill rvPill-sm rvPill-tinta rvT-grigio mt-3">
                                        👁 mostra anche quelle già fatte
                                    </button>
                                )}
                                {d.ultime.length > 0 && (negoziSel || origine || allarme || operatore) && (
                                    <button onClick={() => { setNegoziSel(null); setOrigine(""); setAllarme(""); setOperatore(""); }}
                                        className="rvPill rvPill-sm rvPill-via mt-3 ml-2">✕ togli i filtri</button>
                                )}
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="psTab text-[12px]">
                                    <thead>
                                        <tr className="text-slate-500 text-[10px] uppercase tracking-widest">
                                            <th className="text-left font-bold py-1.5">Quando</th>
                                            <th className="text-left font-bold">Operatore</th>
                                            {/* ⚠️ LA COLONNA «TAGLIO» È STATA TOLTA (Luca 03/09): «non
                                                serve, il dato del brand lo abbiamo a sinistra e l'importo a
                                                destra». Diceva «VODAFONE 10 euro» fra una colonna col marchio
                                                Vodafone e una con 10,00 €: la stessa cosa, tre volte. */}
                                            <th className="text-left font-bold">Numero</th>
                                            <th className="text-right font-bold">Importo</th>
                                            <th className="text-left font-bold pl-3">Negozio</th>
                                            <th className="text-left font-bold">Chi</th>
                                            <th className="text-left font-bold">Scontrino</th>
                                            {/* con quale partita IVA è uscita: è il dato per cui
                                                esiste la regola delle due società di Donna */}
                                            <th className="text-left font-bold">Società</th>
                                            <th className="text-left font-bold">Stato</th>
                                            {/* ⚠️ IL PERCHÉ HA UNA COLONNA SUA. Luca 04/09: «mi stai
                                                sporcando lo stato mettendo la descrizione sotto,
                                                invece mettimi l'errore e il motivo alla destra
                                                creando una colonna in più». Aveva ragione: una
                                                pastiglia di stato con due righe di testo sotto non
                                                è più una pastiglia, e la colonna perdeva la sua
                                                forma. Qui il motivo sta accanto, e occupa lo spazio
                                                che era già stato lasciato libero. */}
                                            <th className="text-left font-bold">Perché</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {/* il filo fra le righe lo mette `.psTab`: scritto anche sul
                                            `<tr>`, con `border-collapse:separate` i due bordi non si
                                            fondevano e la riga restava separata da due fili di colori
                                            diversi */}
                                        {righe.slice(0, quante).map((r) => (
                                            <tr key={r.id} onClick={() => setAperta(r.id)} style={{ cursor: "pointer" }}>
                                                <td className="py-1.5 text-slate-400 whitespace-nowrap">{new Date(r.creata_il).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                                                <td className="text-slate-200 font-semibold">
                                                    {/* ⚠️ IL NOME LO DECIDE IL CODICE OPERATORE, non quello
                                                        salvato sulla riga: nel registro convivono «WindTre»
                                                        scritto dal flusso normale e «WINDTRE» scritto dal
                                                        recupero, e nell'elenco sembravano due operatori. */}
                                                    <MarchioRiga op={r.operatore} />
                                                    {/* il segnalino stava nella colonna «Taglio», tolta: qui
                                                        dice la stessa cosa accanto al marchio */}
                                                    {r.con_attivazione && <span className="psConSim" title="ricarica della SIM appena venduta: il numero è quello dell'attivazione">📶</span>}
                                                </td>
                                                {/* anche qui: quando il numero manca c'è un campo da
                                                    scrivere, e scriverci dentro non deve aprire la scheda */}
                                                <td className="font-mono text-slate-300" onClick={(e) => { if (!r.numero) e.stopPropagation(); }}>
                                                    {/* ⚠️ IL NUMERO SI PRENDE DALLO SCONTRINO, non si chiede a
                                                        chi guarda: è stampato nella descrizione della riga. Il
                                                        campo a mano resta per i casi in cui lo scontrino non
                                                        c'è — ma è l'eccezione, non la regola. */}
                                                    {r.numero ? <span className="inline-flex items-center gap-1.5">{r.numero}<CopiaNumero numero={r.numero} /></span>
                                                        : <NumeroMancante r={r} onCambiato={() => { setToccate((t) => new Set(t).add(r.id)); void carica(); }} />}
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
                                                {/* ⚠️ QUI IL CLIC SI FERMA (Luca 03/09: «se clicco sullo
                                                    stato deve funzionare solo quello, la scheda si apre
                                                    cliccando su qualsiasi altra parte della riga»).
                                                    Dentro questa cella ci sono una tendina che dichiara
                                                    partito un credito e un pulsante che lo eroga davvero:
                                                    lasciar salire il clic alla riga voleva dire che ogni
                                                    volta si apriva anche la scheda, sopra il menu che si
                                                    stava usando. */}
                                                <td onClick={(e) => e.stopPropagation()}>
                                                    {/* ⚠️ LO STATO SI CAMBIA DA QUI. Finché le ricariche si
                                                        fanno sul terminale del fornitore, l'unico modo che il
                                                        CRM ha di sapere se il credito è partito è che glielo
                                                        dica chi l'ha caricato — e resta scritto chi è stato.
                                                        Accanto, il pulsante che la fa partire davvero. */}
                                                    <div className="flex items-center gap-1.5">
                                                        <StatoRicarica r={r} onCambiato={() => { setToccate((t) => new Set(t).add(r.id)); void carica(); }} />
                                                        <RifaiRicarica r={r} onFatto={() => void carica()} />
                                                    </div>
                                                </td>
                                                {/* ⚠️ PERCHÉ NON È PARTITA, IN CHIARO. Vale per due casi
                                                    diversi e vanno distinti a colpo d'occhio:
                                                    · in SOSPESO → il motivo per cui il motore non la fa da
                                                      solo, calcolato con le sue stesse regole (se no la
                                                      schermata racconterebbe una versione diversa dai fatti);
                                                    · NON PARTITA → l'errore vero che ha risposto PayStore,
                                                      che è l'unica cosa che dice se si può rifare o no.
                                                    Sulle ricariche riuscite la cella resta vuota: una colonna
                                                    piena di trattini è rumore. */}
                                                <td className="align-top" onClick={(e) => e.stopPropagation()}>
                                                    {(r.stato === "fallita" && r.errore) ? (
                                                        <div className="psPerche psPerche-ko" title={r.errore}>{r.errore}</div>
                                                    ) : (r.stato === "sospeso" && r.perche) ? (
                                                        <div className="psPerche" title={r.perche}>{r.perche}</div>
                                                    ) : null}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {/* la scheda della riga aperta: sta qui perché è qui che vive
                                    l'elenco, e da qui si ricarica quando una correzione cambia
                                    qualcosa */}
                                {aperta && <SchedaRicarica id={aperta} onChiudi={() => setAperta(null)} onCambiato={() => void carica()} />}
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
                vista === "chiavi" ? <CredenzialiPayStore /> :
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
    /* ⚠️ LA CONFERMA STA DENTRO IL CRM, NON NEL BROWSER (Luca 02/09: «questo
       form dobbiamo integrarlo nel CRM, non esterno su web»).
       Un `window.confirm` scrive «crm.telefuturasrl.com says» in cima e mette
       due bottoni di sistema: davanti a un gesto che EROGA DENARO VERO,
       quell'aspetto da avviso del browser è il primo motivo per cliccare OK
       senza leggere. Qui si legge cosa parte, su quale numero e con quale
       plafond — e l'esito si vede nello stesso posto, invece che in un secondo
       avviso che si chiude e sparisce. */
    const [chiedo, setChiedo] = useState(false);
    const [esito, setEsito] = useState<{ ok: boolean; titolo: string; testo: string; righe?: [string, string][] } | null>(null);
    // su una già fatta non c'è niente da rifare
    if (r.stato === "ok_automatico" || r.stato === "ok_manuale") return null;

    /* ⚠️ FORZARE VUOL DIRE EROGARE SENZA LA PROVA DELL'INCASSO. Si può, perché
       lo scontrino che «non risulta» spesso c'è davvero e la cliente è al banco
       — ma lo si fa premendo un pulsante diverso, non lo stesso. */
    /* «fatturata» VALE QUANTO «emesso» (04/09): il cliente ha chiesto fattura,
       quindi lo scontrino non doveva uscire. La prova dell'incasso c'è — è
       l'altro documento — e il credito può partire da solo. Senza questa riga
       ogni ricarica venduta con fattura andava forzata a mano, e lo storico
       diceva «forzata: lo scontrino non risultava agganciato», che è falso. */
    const senzaScontrino = r.scontrino_stato !== "emesso" && r.scontrino_stato !== "fatturata";
    const esegui = async (forza = false) => {
        setLavoro(true);
        try {
            const x = await fetch("/api/paystore/esegui", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.id, forza }) });
            const j = await x.json().catch(() => ({}));
            if (x.ok && j?.ok) {
                setEsito(j.collaudo ? {
                    ok: false, titolo: "Era una prova",
                    testo: "La chiamata è andata a buon fine, ma siamo in COLLAUDO: nessun credito è stato erogato davvero e lo stato della ricarica resta com'era.",
                    righe: [["Operazione", String(j.operationId ?? "—")]],
                } : j.gia ? {
                    ok: true, titolo: "Risultava già fatta",
                    testo: "PayStore l'aveva già eseguita: non ne è partita una seconda, e qui l'ho segnata come fatta.",
                    righe: [["Operazione", String(j.operationId ?? "—")]],
                } : {
                    ok: true, titolo: "Ricarica eseguita",
                    testo: `${eurC(r.importo)} di credito ${nomeOp(r.operatore)} sono partiti sul numero ${r.numero}.`,
                    righe: [["Operazione", String(j.operationId ?? "—")], ["Ricevuta", String(j.receiptId ?? "—")],
                    ...(j.saldo != null ? [["Plafond rimasto", eurC(j.saldo)] as [string, string]] : [])],
                });
            } else {
                setEsito({
                    ok: false,
                    titolo: j?.definitivo === false ? "Non so com'è andata" : "Non è partita",
                    testo: j?.error || `errore ${x.status}`,
                    righe: j?.correlationId ? [["Riferimento PayStore", String(j.correlationId)]] : undefined,
                });
            }
            onFatto();
        } catch (e) {
            setEsito({ ok: false, titolo: "Non è partita", testo: String((e as Error)?.message || e) });
        } finally { setLavoro(false); setChiedo(false); }
    };

    return (
        <>
            <button onClick={() => setChiedo(true)} disabled={lavoro || !r.numero}
                title={r.numero ? "Fai partire questa ricarica adesso, tramite l'API di PayStore" : "manca il numero da ricaricare"}
                className="psRifai" aria-label="rifai la ricarica">
                {lavoro ? "…" : "↻"}
            </button>

            {chiedo && createPortal(
                <div className="rvFattaSfondo" onClick={() => !lavoro && setChiedo(false)}>
                    <div className="rvFatta rvFatta-att" onClick={(e) => e.stopPropagation()}>
                        <div className="rvFatta-o rvFatta-att-o">⚡</div>
                        <h3>Faccio partire questa ricarica?</h3>
                        <p>
                            Il credito parte davvero, sul plafond del punto vendita, e <b>non si annulla</b>.
                        </p>
                        <div className="rvFatta-d">
                            <div><span>Operatore</span><span>{nomeOp(r.operatore)}</span></div>
                            <div><span>Importo</span><span>{eurC(r.importo)}</span></div>
                            <div><span>Numero</span><span style={{ fontFamily: "monospace" }}>{r.numero}</span></div>
                            <div><span>Plafond di</span><span>{r.negozio || "—"}{r.azienda ? ` · ${SOCIETA[r.azienda] || r.azienda}` : ""}</span></div>
                        </div>
                        {senzaScontrino && (
                            <div className="rvNota rvNota-att" style={{ marginTop: 0, marginBottom: 14, textAlign: "left" }}>
                                <div className="rvNota-t">⚠️ Lo scontrino non risulta agganciato</div>
                                <div className="rvNota-s">
                                    Spesso c&apos;è davvero e il CRM non l&apos;ha trovato. Ma se non è stato emesso,
                                    erogare vuol dire regalare il credito: fallo solo se lo scontrino ce l&apos;hai
                                    davanti. Resta scritto che l&apos;hai forzata tu.
                                </div>
                            </div>
                        )}
                        <div className="rvBarra rvBarra-c justify-center">
                            <button onClick={() => setChiedo(false)} disabled={lavoro} className="rvPill">Lascia stare</button>
                            <button onClick={() => void esegui(senzaScontrino)} disabled={lavoro}
                                className={cn("rvAzione", senzaScontrino ? "rvAzione-no" : "rvAzione-att")}>
                                {lavoro ? "⏳ sto chiamando PayStore…"
                                    : senzaScontrino ? "⚡ Forza e fai partire" : "⚡ Fai partire"}
                            </button>
                        </div>
                    </div>
                </div>, document.body)}

            {esito && createPortal(
                <div className="rvFattaSfondo" onClick={() => setEsito(null)}>
                    <div className={cn("rvFatta", !esito.ok && "rvFatta-att")} onClick={(e) => e.stopPropagation()}>
                        <div className={cn("rvFatta-o", !esito.ok && "rvFatta-att-o")}>{esito.ok ? "✓" : "⚠️"}</div>
                        <h3>{esito.titolo}</h3>
                        <p>{esito.testo}</p>
                        {!!esito.righe?.length && (
                            <div className="rvFatta-d">
                                {esito.righe.map(([k, v]) => <div key={k}><span>{k}</span><span>{v}</span></div>)}
                            </div>
                        )}
                        <div className="rvBarra rvBarra-c justify-center">
                            <button onClick={() => setEsito(null)} className="rvAzione">Ho capito</button>
                        </div>
                    </div>
                </div>, document.body)}
        </>
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
                title={[
                    r.stato === "fallita" ? "Il credito NON è uscito: PayStore l'ha rifiutata o non siamo riusciti a mandarla." : null,
                    r.errore || null,
                    r.stato_da ? `${STATI[r.stato]?.testo} — ${r.stato_da}${r.stato_il ? ", " + new Date(r.stato_il).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}` : null,
                ].filter(Boolean).join("\n") || "clicca per cambiare"}
                className={cn("px-2 py-0.5 rounded-lg border text-[11px] font-bold whitespace-nowrap", st.sfondo, st.colore)}>
                {st.testo} ▾
            </button>
            {/* ⚠️ QUANDO È STATA FATTA, DENTRO LA STESSA CASELLA (Luca 03/09).
                Il registro diceva «ok manuale» e basta: su una ricarica il
                MOMENTO è mezzo dato — serve a incrociarla con lo scontrino,
                col turno di chi era al banco e con la telefonata del cliente
                che dice «non mi è arrivata». Sta sotto la pastiglia e non
                aggiunge una colonna a una tabella già larga. */}
            {(() => {
                const q = r.inviata_il || (r.stato !== "sospeso" ? r.stato_il : null);
                if (!q) return null;
                const d = new Date(q);
                const oggi = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
                const suo = d.toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
                return (
                    <div className="psQuando" title={d.toLocaleString("it-IT", { timeZone: "Europe/Rome" })}>
                        {suo === oggi ? "" : d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", timeZone: "Europe/Rome" }) + " "}
                        {d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" })}
                    </div>
                );
            })()}
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
    const conListino = new Set(tagli.filter((t) => t.attivo).map((t) => t.operatore));

    /* ═══ IL LISTINO VERO LO SA PAYSTORE ═══════════════════════════════════
       Luca 02/09: «dall'API riesci a prenderti tutti i tagli VERI e verificare
       che Registra Vendita li stia riportando correttamente?»
       Questa tabella è nostra, scritta a mano, e se non combacia col catalogo
       del fornitore succedono due cose che non si vedono subito: un taglio che
       loro hanno e noi no non si può vendere; uno che noi mostriamo e loro non
       hanno si vende e poi non parte, col cliente che ha già pagato.
       ⚠️ SI GUARDA PRIMA, SI SCRIVE DOPO: il confronto non tocca niente. */
    const [confronto, setConfronto] = useState<{ daAggiungere: { operatore: string; valore: number }[]; daSpegnere: { operatore: string; valore: number }[]; catalogo: number; prodottiNonRiconosciuti?: string[]; operatoriNonVisti?: string[]; catalogoGrezzo?: string[] } | null>(null);
    const [sync, setSync] = useState(false);
    const chiediCatalogo = async (applica: boolean) => {
        setSync(true); setErrore(null);
        try {
            const r = await fetch("/api/paystore/tagli/sync", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ applica }),
            });
            const j = await r.json();
            if (!r.ok || !j.ok) throw new Error(j.error || "non riuscito");
            if (applica) { setConfronto(null); onCambiato(); } else setConfronto(j);
        } catch (e) { setErrore(String((e as Error)?.message || e)); }
        finally { setSync(false); }
    };
    const senzaListino = OPERATORI_PAYSTORE.filter((o) => !conListino.has(o.id));

    return (
        <div className="glass-card an-card rounded-2xl p-4 space-y-4">
            <div>
                <h3 className="text-sm font-bold text-white">Listino dei tagli</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                    Quello che il negozio vede quando sceglie l&apos;operatore. Gli operatori senza listino restano a
                    <b className="text-slate-300"> importo libero</b>: meglio un campo aperto che tagli inventati, perché un
                    taglio che il fornitore non ha è una ricarica che non parte.
                </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-2.5">
                <div className="rvLab">Il listino contro il catalogo vero</div>
                <div className="rvPillRow items-center">
                    <button onClick={() => void chiediCatalogo(false)} disabled={sync}
                        className="rvPill rvPill-tinta rvT-indaco">{sync ? "chiedo a PayStore…" : "👁 Confronta col catalogo"}</button>
                    {confronto && !!(confronto.daAggiungere.length || confronto.daSpegnere.length) && (
                        <button onClick={() => void chiediCatalogo(true)} disabled={sync}
                            className="rvPill rvPill-on rvT-verde">✓ Allinea il listino</button>
                    )}
                </div>
                {confronto && (
                    <div className="rvNota rvNota-info">
                        <div className="rvNota-t">
                            {confronto.daAggiungere.length || confronto.daSpegnere.length
                                ? `${confronto.daAggiungere.length} da aggiungere · ${confronto.daSpegnere.length} da spegnere`
                                : "✓ Il listino combacia col catalogo"}
                        </div>
                        <div className="rvNota-s">
                            PayStore ha {confronto.catalogo} tagli in tutto.
                            {!!confronto.daAggiungere.length && <> Mancano da noi: {confronto.daAggiungere.map((x) => `${nomeOp(x.operatore)} ${x.valore}€`).join(", ")}.</>}
                            {!!confronto.daSpegnere.length && <> Ci sono da noi e non da loro: {confronto.daSpegnere.map((x) => `${nomeOp(x.operatore)} ${x.valore}€`).join(", ")} — si spengono, non si cancellano, se no le ricariche già vendute che li citano diventano inspiegabili.</>}
                        </div>
                    </div>
                )}
                {/* ⚠️ QUELLO CHE NON HO SAPUTO LEGGERE. Un nome di prodotto che
                    non riesco a tradurre non vuol dire «operatore assente»: vuol
                    dire che la mia mappa è incompleta. Qui si vedono i nomi veri
                    che usa PayStore, ed è da lì che si corregge. */}
                {confronto && !!(confronto.operatoriNonVisti?.length || confronto.prodottiNonRiconosciuti?.length) && (
                    <div className="rvNota rvNota-att">
                        <div className="rvNota-t">🔤 Nomi che non ho saputo tradurre</div>
                        <div className="rvNota-s">
                            {!!confronto.operatoriNonVisti?.length && <>
                                Nel catalogo che ho letto non compaiono: <b>{confronto.operatoriNonVisti.map(nomeOp).join(", ")}</b>.
                                I loro tagli NON sono stati proposti per lo spegnimento — non so se mancano davvero.{" "}
                            </>}
                            {!!confronto.prodottiNonRiconosciuti?.length && <>
                                Prodotti che PayStore chiama così e che non ho collegato a nessun operatore:{" "}
                                <b>{confronto.prodottiNonRiconosciuti.slice(0, 12).join(" · ")}</b>.
                            </>}
                        </div>
                    </div>
                )}
                {confronto && !!confronto.catalogoGrezzo?.length && (
                    <details className="rvNota rvNota-info">
                        <summary className="rvNota-t" style={{ cursor: "pointer" }}>
                            📇 I {confronto.catalogoGrezzo.length} prodotti che PayStore ci mostra
                        </summary>
                        <div className="rvNota-s mt-1">{confronto.catalogoGrezzo.join(" · ")}</div>
                    </details>
                )}
                {!!senzaListino.length && (
                    <div className="rvNota rvNota-att">
                        <div className="rvNota-t">⚠️ {senzaListino.length} operator{senzaListino.length === 1 ? "e" : "i"} senza listino</div>
                        <div className="rvNota-s">
                            {senzaListino.map((o) => o.label).join(", ")}: al banco l&apos;importo si scrive a mano, e un
                            importo che PayStore non ha è una ricarica che non parte.
                        </div>
                    </div>
                )}
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

/* ═══ LE CREDENZIALI, CARICATE UNA VOLTA E MAI PIÙ VISTE ══════════════════
   Sedici terne, una per negozio e per società. Il foglio lo apre il BROWSER,
   ne ricava le righe e le manda al server, che le cifra: non passano da un
   file del progetto (dove finirebbero nel repository e da lì non si tolgono
   più) né da nessun altro posto. Da quel momento la schermata dice
   «configurata», mai il valore.

   ⚠️ PRIMA SI GUARDA, POI SI SALVA. Il pulsante «guarda cosa farebbe» mostra
   l'accoppiamento nome-PayStore → nostro negozio senza scrivere niente: una
   credenziale agganciata al negozio sbagliato vuol dire far partire una
   ricarica sul conto di un'altra società, ed è un errore che si vede solo
   dall'estratto conto. */
function CredenzialiPayStore() {
    const [righe, setRighe] = useState<{ negozio: string; azienda: string; identificativo: string | null; attivo: boolean; aggiornato_il: string }[]>([]);
    const [esiti, setEsiti] = useState<{ societa: string; identificativo: string; negozio: string | null; esito: string }[]>([]);
    const [busy, setBusy] = useState(false);
    const [ko, setKo] = useState("");
    type Firma = { negozio: string; azienda: string | null; ricariche: number; ok: boolean; firmerebbe: string | null; perche: string | null };
    const [verifica, setVerifica] = useState<Firma[]>([]);
    /* ⚠️ IL PLAFOND È DENARO CARICATO IN ANTICIPO, uno per punto vendita.
       Quando finisce, le ricariche di quel negozio smettono di partire — e
       senza questa riga la prima cosa che qualcuno nota è un cliente al banco
       che non riceve il credito. */
    type Saldo = { negozio: string; azienda: string; identificativo: string | null; saldo: number | null; errore: string | null };
    const [saldi, setSaldi] = useState<{ saldi: Saldo[]; totale: number; muti: number } | null>(null);
    const [chiedoSaldi, setChiedoSaldi] = useState(false);
    type Ric = { inSospeso: number; operazioniTrovate: number; daFareDavvero: number; problemi: string[]; giaFatte: { id: string; negozio: string|null; numero: string; importo: number; operationId: number }[]; segnate?: number };
    const [ricEsito, setRicEsito] = useState<Ric | null>(null);
    const [ric, setRic] = useState(false);
    const riconcilia = async (applica: boolean) => {
        setRic(true); setKo("");
        try {
            const r = await fetch("/api/paystore/riconcilia", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ applica }),
            }).then((x) => x.json());
            if (!r?.ok) throw new Error(r?.error || "non riuscita");
            setRicEsito(r);
        } catch (e) { setKo((e as Error).message); }
        finally { setRic(false); }
    };
    const guardaSaldi = async () => {
        setChiedoSaldi(true); setKo("");
        try {
            const r = await fetch("/api/paystore/saldo").then((x) => x.json());
            if (!r?.ok) throw new Error(r?.error || "non riesco a leggere il plafond");
            setSaldi(r);
        } catch (e) { setKo((e as Error).message); }
        finally { setChiedoSaldi(false); }
    };

    const carica = useCallback(async () => {
        const r = await fetch("/api/paystore/credenziali").then((x) => x.json()).catch(() => null);
        if (r?.ok) { setRighe(r.righe || []); setVerifica(r.verifica || []); }
        else setKo(r?.error || "non riesco a leggere le credenziali");
    }, []);
    useEffect(() => { void carica(); }, [carica]);

    /* il foglio si legge QUI, nel browser: le colonne sono quelle che manda
       PayStore — società, identificativo, client id, client secret, signing key */
    const leggiFoglio = async (f: File): Promise<{ societa: string; identificativo: string; clientId: string; secret: string; signingKey: string }[]> => {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const griglia = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, blankrows: false }) as unknown as string[][];
        const out: { societa: string; identificativo: string; clientId: string; secret: string; signingKey: string }[] = [];
        let soc = "";
        for (const r of griglia.slice(1)) {
            const c = (r || []).map((x) => String(x ?? "").trim());
            if (c[0]) soc = c[0];
            if (!c[1] || !c[2]) continue;
            out.push({ societa: soc, identificativo: c[1], clientId: c[2], secret: c[3] || "", signingKey: c[4] || "" });
        }
        return out;
    };

    const manda = async (f: File, prova: boolean) => {
        if (busy) return;
        setBusy(true); setKo(""); setEsiti([]);
        try {
            const lette = await leggiFoglio(f);
            if (!lette.length) throw new Error("nel foglio non ho trovato righe con società, identificativo e client id");
            const r = await fetch("/api/paystore/credenziali", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ righe: lette, prova }),
            }).then((x) => x.json());
            if (!r?.ok) throw new Error(r?.error || "non salvate");
            setEsiti(r.esiti || []);
            if (!prova) await carica();
        } catch (e) { setKo((e as Error)?.message || "non riuscito"); }
        finally { setBusy(false); }
    };

    return (
        <div className="glass-card an-card rounded-2xl p-4 space-y-4">
            <div>
                <h3 className="text-sm font-bold text-white">🔐 Credenziali PayStore</h3>
                <div className="rvNota-s mt-1">
                    Una per negozio e per società. La ricarica parte sulla credenziale della <b>cassa</b> su cui è
                    uscito lo scontrino — a Donna lo stesso bancone batte su due registratori di due società diverse.
                    I segreti si cifrano sul server: da qui non si rileggono più, si vede solo che ci sono.
                </div>
            </div>

            <div className="rvPillRow items-center">
                <button onClick={() => void guardaSaldi()} disabled={chiedoSaldi}
                    className="rvPill rvPill-tinta rvT-verde">
                    {chiedoSaldi ? "leggo…" : "💰 Quanto credito c'è"}
                </button>
                {/* ⚠️ LA DOMANDA CHE IL REGISTRO DA SOLO NON SA RISPONDERE:
                    «questa ricarica il negozio l'ha già caricata a mano?».
                    Una riga in sospeso dice che NOI non l'abbiamo fatta. */}
                <button onClick={() => void riconcilia(false)} disabled={ric}
                    className="rvPill rvPill-tinta rvT-indaco">
                    {ric ? "chiedo…" : "🔎 Quali ha già fatto PayStore"}
                </button>
                <label className="rvPill rvPill-tinta rvT-indaco" style={{ cursor: "pointer" }}>
                    👁 Guarda cosa farebbe
                    <input type="file" accept=".xlsx,.xls" hidden disabled={busy}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) void manda(f, true); e.target.value = ""; }} />
                </label>
                <label className={cn("rvPill rvPill-on rvT-verde", busy && "opacity-50")} style={{ cursor: busy ? "default" : "pointer" }}>
                    {busy ? "leggo…" : "✓ Carica e cifra"}
                    <input type="file" accept=".xlsx,.xls" hidden disabled={busy}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) void manda(f, false); e.target.value = ""; }} />
                </label>
            </div>
            {ko && <div className="rvNota rvNota-ko"><div className="rvNota-s">{ko}</div></div>}

            {ricEsito && (
                <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-2">
                    <div className="rvLab">Cosa risulta a PayStore</div>
                    {ricEsito.segnate != null ? (
                        <div className="rvNota rvNota-info"><div className="rvNota-t">✓ {ricEsito.segnate} segnate come già fatte</div>
                            <div className="rvNota-s">Restano {ricEsito.daFareDavvero} davvero da fare.</div></div>
                    ) : (
                        <div className={cn("rvNota", ricEsito.giaFatte.length ? "rvNota-att" : "rvNota-info")}>
                            <div className="rvNota-t">
                                {ricEsito.giaFatte.length
                                    ? `⚠️ ${ricEsito.giaFatte.length} di queste PayStore le ha GIÀ fatte`
                                    : "✓ Nessuna di queste risulta già fatta da PayStore"}
                            </div>
                            <div className="rvNota-s">
                                Su {ricEsito.inSospeso} in sospeso, PayStore riporta {ricEsito.operazioniTrovate} operazioni
                                riuscite nel periodo. {ricEsito.daFareDavvero} risultano davvero da fare.
                                {!!ricEsito.giaFatte.length && <> Premendo «rifai» su quelle già fatte si erogherebbe il credito <b>una seconda volta</b>: qui si marcano invece come fatte.</>}
                            </div>
                        </div>
                    )}
                    {!!ricEsito.problemi?.length && (
                        <div className="rvNota rvNota-ko"><div className="rvNota-t">Non ho potuto chiedere a tutti</div>
                            <div className="rvNota-s">{ricEsito.problemi.join(" · ")}</div></div>
                    )}
                    {!!ricEsito.giaFatte?.length && ricEsito.segnate == null && (
                        <>
                            <table className="psTab text-[12px]"><tbody>
                                {ricEsito.giaFatte.slice(0, 20).map((g) => (
                                    <tr key={g.id}>
                                        <td className="text-white font-semibold">{g.negozio}</td>
                                        <td className="font-mono text-slate-400">{g.numero}</td>
                                        <td className="text-right text-emerald-300">{eurC(g.importo)}</td>
                                        <td className="text-[11px] text-slate-500">operazione {g.operationId}</td>
                                    </tr>
                                ))}
                            </tbody></table>
                            <button onClick={() => void riconcilia(true)} disabled={ric}
                                className="rvPill rvPill-on rvT-verde">✓ Segnale come già fatte</button>
                        </>
                    )}
                </div>
            )}

            {saldi && (
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="rvLab">
                        Plafond · {eurC(saldi.totale)} in tutto
                        {!!saldi.muti && <span className="text-rose-300"> · {saldi.muti} non {saldi.muti === 1 ? "ha" : "hanno"} risposto</span>}
                    </div>
                    <div className="rvNota-s mt-1 mb-2">
                        È il credito già caricato su PayStore, uno per punto vendita. Quando finisce, le ricariche di
                        quel negozio non partono più.
                    </div>
                    <table className="psTab text-[12px]">
                        <tbody>
                            {saldi.saldi.map((s, i) => (
                                <tr key={i}>
                                    <td className="text-white font-semibold">{s.negozio}</td>
                                    <td><span className="rvBadge rvBadge-acc">{SOCIETA[s.azienda] || s.azienda}</span></td>
                                    <td className={cn("text-right font-bold",
                                        s.saldo == null ? "text-rose-300"
                                            : s.saldo < 50 ? "text-rose-300"
                                                : s.saldo < 150 ? "text-amber-300" : "text-emerald-300")}>
                                        {s.saldo == null ? "—" : eurC(s.saldo)}
                                    </td>
                                    <td className="text-[11px] text-slate-500">{s.errore || (s.saldo != null && s.saldo < 50 ? "sta finendo" : "")}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {esiti.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    {/* ⚠️ IL TOTALE IN CIMA. Con sedici righe tutte rosse, il fatto che
                        NON sia entrato niente si capiva solo leggendole una per una: e
                        una schermata dove il fallimento totale sembra un dettaglio è
                        peggio di una che non dice niente. */}
                    {(() => {
                        const ko = esiti.filter((e) => /NON salvata|nessun negozio/.test(e.esito)).length;
                        return ko > 0 ? (
                            <div className="rvNota rvNota-ko" style={{ marginTop: 0, marginBottom: 10 }}>
                                <div className="rvNota-t">⛔ {ko} su {esiti.length} non {ko === 1 ? "è entrata" : "sono entrate"}</div>
                                <div className="rvNota-s">L'accoppiamento col negozio può essere giusto lo stesso: guarda l'ultima colonna per il perché.</div>
                            </div>
                        ) : null;
                    })()}
                    <div className="rvLab">Accoppiamento</div>
                    <table className="psTab text-[12px] mt-1">
                        <tbody>
                            {esiti.map((e, i) => (
                                <tr key={i}>
                                    <td className="text-slate-400">{e.societa}</td>
                                    <td className="text-slate-300">{e.identificativo}</td>
                                    <td>{e.negozio ? <b className="text-white">→ {e.negozio}</b> : <span className="text-rose-300">→ nessun negozio</span>}</td>
                                    <td className={cn("text-[11px]", /NON|nessun/.test(e.esito) ? "text-rose-300" : "text-emerald-300")}>{e.esito}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ⚠️ LA PROVA DA FARE PRIMA DI EROGARE UN EURO, e non costa niente.
                Firmare con la terna di un altro punto vendita addebita il SUO
                plafond, e non dà nessun errore: ce ne si accorge a fine mese, su
                ricariche già erogate. È l'unico errore che dopo non si scopre
                più — quindi si guarda prima, qui. */}
            {verifica.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="rvLab">
                        Chi firmerebbe cosa — {verifica.filter((v) => v.ok).length}/{verifica.length} coperte
                    </div>
                    <div className="rvNota-s mt-1 mb-2">
                        Per ogni negozio e società che nel registro ha davvero delle ricariche, la credenziale che
                        partirebbe. Nessuna ricarica viene eseguita: è solo una lettura.
                    </div>
                    <table className="psTab text-[12px]">
                        <tbody>
                            {verifica.map((v, i) => (
                                <tr key={i}>
                                    <td className="text-white font-semibold">{v.negozio}</td>
                                    <td><span className="rvBadge rvBadge-acc">{SOCIETA[v.azienda || ""] || v.azienda || "—"}</span></td>
                                    <td className="text-slate-500 text-[11px]">{v.ricariche} ricarich{v.ricariche === 1 ? "e" : "e"}</td>
                                    <td className={v.ok ? "text-emerald-300" : "text-rose-300"}>
                                        {v.ok ? <>✓ {v.firmerebbe}</> : "⛔ scoperta"}
                                    </td>
                                    <td className="text-[11px] text-slate-500">{v.perche || ""}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <div>
                <div className="rvLab">Configurate adesso ({righe.length})</div>
                {righe.length === 0 ? (
                    <p className="text-xs text-slate-500 py-3">Nessuna credenziale caricata: le ricariche non possono ancora partire da sole.</p>
                ) : (
                    <table className="psTab text-[12px] mt-1">
                        <tbody>
                            {righe.map((r) => (
                                <tr key={r.negozio + r.azienda}>
                                    <td className="text-white font-semibold">{r.negozio}</td>
                                    <td><span className="rvBadge rvBadge-acc">{SOCIETA[r.azienda] || r.azienda}</span></td>
                                    <td className="text-slate-500">{r.identificativo || "—"}</td>
                                    <td className="text-emerald-300">✓ configurata</td>
                                    <td className="text-slate-500 text-[11px]">{new Date(r.aggiornato_il).toLocaleDateString("it-IT")}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

/* ═══ LA SCHEDA DI UNA RICARICA ════════════════════════════════════════════
   Luca 03/09: «la possibilità di cliccare su ogni riga e vedere tutte le
   informazioni: la vendita collegata nel caso non fosse una semplice ricarica,
   il cliente collegato coi suoi dati, eventuali cambiamenti, eventuali errori
   generati e risottomissioni, con l'utente, il giorno e l'orario».

   ⚠️ È QUI CHE SI CORREGGE, E SOLO DA QUI. Cambiare operatore o numero su una
   ricarica già venduta è un gesto da amministrazione: il numero sbagliato manda
   il credito a una persona sbagliata, l'operatore sbagliato lo manda a un
   gestore che quel taglio non ce l'ha. Ogni correzione resta scritta col nome
   di chi l'ha fatta. */
function SchedaRicarica({ id, onChiudi, onCambiato }: { id: string; onChiudi: () => void; onCambiato: () => void }) {
    type Ev = { quando: string; chi: string | null; tipo: string; testo: string };
    type Dett = {
        ricarica: Record<string, unknown>;
        vendita: Record<string, unknown> | null;
        cliente: { id: string; nome: string | null; cognome: string | null; ragione_sociale: string | null; cf_piva: string | null; cellulare: string | null; email: string | null } | null;
        insieme: { id: string; brand: string; categoria: string; prodotto: string | null; stato: string | null }[];
        scontrino: { id: string; created_at: string; status: string; negozio: string; kind: string; certo: boolean; quanti: number; meta: Record<string, unknown> | null } | null;
        comeTrovate: string;
        righeScontrino: number | null;
        sorelle: { id: string; operatore: string; numero: string; importo: number; stato: string }[];
        eventi: Ev[]; puoCorreggere: boolean;
    };
    const [d, setD] = useState<Dett | null>(null);
    const [ko, setKo] = useState("");
    const [op, setOp] = useState(""); const [num, setNum] = useState("");
    const [salvo, setSalvo] = useState(false);

    const carica = useCallback(async () => {
        try {
            const r = await fetch(`/api/paystore/ricarica?id=${id}`).then((x) => x.json());
            if (!r?.ok) throw new Error(r?.error || "non riesco a leggere");
            setD(r); setOp(String(r.ricarica.operatore || "")); setNum(String(r.ricarica.numero || ""));
        } catch (e) { setKo((e as Error).message); }
    }, [id]);
    useEffect(() => { void carica(); }, [carica]);

    const correggi = async () => {
        setSalvo(true); setKo("");
        try {
            const r = await fetch("/api/paystore/ricarica", {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, operatore: op, numero: num }),
            }).then((x) => x.json());
            if (!r?.ok) throw new Error(r?.error || "non salvata");
            await carica(); onCambiato();
        } catch (e) { setKo((e as Error).message); }
        finally { setSalvo(false); }
    };

    const r = d?.ricarica as Record<string, any> | undefined;
    const cambiato = !!r && (op !== String(r.operatore || "") || num !== String(r.numero || ""));
    const partita = !!r && (r.stato === "ok_automatico" || r.stato === "ok_manuale");
    const quando = (x: string | null | undefined) => x
        ? new Date(x).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" })
        : "—";

    return createPortal(
        <div className="rvFattaSfondo" onClick={onChiudi}>
            <div className="psScheda" onClick={(e) => e.stopPropagation()}>
                {!d ? <div className="p-8 text-center text-slate-500 text-sm">
                    <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" /> leggo…
                </div> : (<>
                    <div className="psScheda-t">
                        <div>
                            <div className="flex items-center gap-2">
                                <MarchioRiga op={String(r!.operatore)} />
                                <span className="text-xl font-black text-white">{eurC(Number(r!.importo))}</span>
                                <span className="font-mono text-slate-400 text-[13px]">{String(r!.numero || "senza numero")}</span>
                            </div>
                            <div className="text-[11px] text-slate-500 mt-1">
                                {String(r!.negozio || "—")}{r!.azienda ? ` · ${SOCIETA[String(r!.azienda)] || r!.azienda}` : ""}
                                {r!.venditore ? ` · venduta da ${r!.venditore}` : ""} · {quando(String(r!.creata_il))}
                            </div>
                        </div>
                        <button onClick={onChiudi} className="rvPill rvPill-sm">✕ chiudi</button>
                    </div>

                    {ko && <div className="rvNota rvNota-ko"><div className="rvNota-s">{ko}</div></div>}

                    <div className="psScheda-g">
                        {/* ── CORREZIONE ─────────────────────────────────────── */}
                        <div className="psBlocco">
                            <div className="rvLab">Correggere</div>
                            {partita ? (
                                <div className="rvNota-s">
                                    Questa ricarica è <b>già stata erogata</b>: correggerla adesso cambierebbe il
                                    racconto, non il credito. Se serve rifarla, rimettila prima in sospeso dal registro.
                                </div>
                            ) : !d.puoCorreggere ? (
                                <div className="rvNota-s">La correggono l&apos;amministrazione e la direzione.</div>
                            ) : (<>
                                <div className="rvNota-s mb-2">
                                    Se il negozio ha sbagliato gestore o numero, si sistema qui e poi si rimanda.
                                    ⚠️ La chiave di sicurezza viene azzerata: il prossimo invio parte davvero da capo,
                                    e non ripesca l&apos;esito del tentativo sbagliato.
                                </div>
                                <div className="rvPillRow items-end">
                                    <label className="rvCampo"><span className="rvLab">Gestore</span>
                                        <select value={op} onChange={(e) => setOp(e.target.value)} className="ctbSel" style={{ minWidth: 150 }}>
                                            {OPERATORI_PAYSTORE.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                                        </select></label>
                                    <label className="rvCampo"><span className="rvLab">Numero</span>
                                        <input value={num} inputMode="numeric" onChange={(e) => setNum(e.target.value.replace(/\D/g, ""))}
                                            className="ctbNum" style={{ maxWidth: 150, textAlign: "left" }} /></label>
                                    <button onClick={() => void correggi()} disabled={!cambiato || salvo}
                                        className={cn("rvPill", cambiato && "rvPill-on rvT-verde")}>
                                        {salvo ? "salvo…" : "✓ Salva la correzione"}
                                    </button>
                                </div>
                            </>)}
                        </div>

                        {/* ── LA VENDITA E IL CLIENTE ────────────────────────── */}
                        <div className="psBlocco">
                            <div className="rvLab">Da dove viene</div>
                            {d.vendita ? (<>
                                <div className="psDato"><span>Vendita</span><span>
                                    <a href={`/documenti?q=${String(d.vendita.id)}`} className="text-indigo-300 hover:underline">
                                        {String(d.vendita.brand || "")} · {String(d.vendita.prodotto || d.vendita.categoria || "")}
                                    </a></span></div>
                                <div className="psDato"><span>Registrata</span><span>{String(d.vendita.data_registrazione || "—")}</span></div>
                            </>) : (
                                <div className="rvNota-s">Ricarica al banco, senza una vendita collegata.</div>
                            )}
                            {/* ⚠️ IL DOCUMENTO SI APRE DA QUI (Luca 03/09). Quando una
                                ricarica non torna, la prima cosa che si guarda è lo
                                scontrino: averlo a due clic di distanza — sezione
                                Documenti, cerca il giorno, cerca il negozio — vuol dire
                                non guardarlo. */}
                            {d.scontrino ? (
                                <div className="psDato"><span>Scontrino</span><span>
                                    <a href={`/documenti?doc=${d.scontrino.id}&giorno=${String(d.scontrino.created_at).slice(0, 10)}`}
                                        target="_blank" rel="noreferrer"
                                        className="text-indigo-300 hover:underline font-semibold">
                                        🧾 apri il documento
                                    </a>
                                    <span className="text-slate-500 text-[11px]">
                                        {" "}· {d.scontrino.negozio} · {new Date(d.scontrino.created_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" })}
                                        {/* ⚠️ NON È «QUANTE COSE C'ERANO»: è il numero di righe di
                                            carrello di quel gruppo società, e tre ricariche battute
                                            insieme ci stanno dentro in una sola. Chiamarlo col suo
                                            nome costa due parole e evita una conclusione sbagliata. */}
                                        {d.righeScontrino ? ` · ${d.righeScontrino} rig${d.righeScontrino === 1 ? "a" : "he"} di carrello` : ""}
                                        {d.scontrino.status !== "done" ? " · NON uscito" : ""}
                                        {/* ⚠️ SI DICE SE È UNA CERTEZZA O UN ACCOSTAMENTO. Quando il
                                            documento porta scritto il contratto siamo sicuri; quando lo
                                            si è preso per vicinanza di orario, no — e chi legge deve
                                            saperlo prima di trarne conclusioni. */}
                                        {!d.scontrino.certo
                                            ? (d.scontrino.quanti > 1
                                                /* se i candidati erano più d'uno, dirlo: «da confermare»
                                                   e «ce n'erano tre nella stessa finestra» chiedono due
                                                   livelli di attenzione diversi */
                                                ? ` · accostato per orario fra ${d.scontrino.quanti} documenti vicini: da confermare`
                                                : " · accostato per orario, da confermare")
                                            : ""}
                                    </span>
                                </span></div>
                            ) : (
                                <div className="psDato"><span>Scontrino</span>
                                    <span className="text-slate-500">nessun documento agganciato</span></div>
                            )}
                            {d.cliente && (
                                <div className="psCliente">
                                    {/* ⚠️ «VENDITA DIRETTA» NON È UN CLIENTE: è il segnaposto
                                        delle vendite al banco senza anagrafica, condiviso da
                                        1.183 righe. Farne un collegamento porta a una scheda
                                        che non esiste. */}
                                    <div className="psDato"><span>Cliente</span><span>
                                        {/DIRETTA|ANONIM/i.test(String(d.cliente.id))
                                            ? <span className="text-slate-500">venduta al banco, senza anagrafica</span>
                                            : <a href={`/clienti?q=${encodeURIComponent(d.cliente.cf_piva || d.cliente.id)}`} className="text-indigo-300 hover:underline font-semibold">
                                                {d.cliente.ragione_sociale || `${d.cliente.nome || ""} ${d.cliente.cognome || ""}`.trim() || d.cliente.id}
                                            </a>}
                                    </span></div>
                                    {d.cliente.cf_piva && <div className="psDato"><span>CF / P.IVA</span><span className="font-mono">{d.cliente.cf_piva}</span></div>}
                                    {d.cliente.cellulare && <div className="psDato"><span>Cellulare</span><span className="font-mono">{d.cliente.cellulare}</span></div>}
                                </div>
                            )}
                            {/* ⚠️ E SI DICE COME LE ABBIAMO TROVATE. Su una vendita al
                                banco senza anagrafica l'accostamento è per orario, non una
                                certezza: scriverlo è la differenza fra un'informazione e
                                un'affermazione. */}
                            {d.insieme.length ? (
                                <div className="mt-2">
                                    <div className="rvLab">Venduta insieme a</div>
                                    {d.insieme.map((x) => (
                                        <div key={x.id} className="psDato"><span>{x.brand}</span><span>{x.prodotto || x.categoria}</span></div>
                                    ))}
                                    {!!d.comeTrovate && <div className="text-[11px] text-slate-500 mt-1">{d.comeTrovate}</div>}
                                </div>
                            ) : (
                                <div className="psDato"><span>Venduta insieme a</span>
                                    <span className="text-slate-500">{d.comeTrovate || "niente: era sola"}</span></div>
                            )}
                            {!!d.sorelle.length && (
                                <div className="mt-2">
                                    <div className="rvLab">Altre ricariche dello stesso scontrino</div>
                                    {d.sorelle.map((x) => (
                                        <div key={x.id} className="psDato">
                                            <span>{nomeOp(x.operatore)} · {x.numero}</span><span>{eurC(x.importo)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* ── COM'È ANDATA ───────────────────────────────────── */}
                        <div className="psBlocco">
                            <div className="rvLab">Com&apos;è andata</div>
                            <div className="psDato"><span>Stato</span><span>{STATI[String(r!.stato)]?.testo || String(r!.stato)}</span></div>
                            <div className="psDato"><span>Scontrino</span><span>{String(r!.scontrino_stato || "non risulta")}</span></div>
                            {!!r!.tentativi && <div className="psDato"><span>Invii a PayStore</span><span>{String(r!.tentativi)}</span></div>}
                            {!!r!.rif_fornitore && <div className="psDato"><span>Operazione PayStore</span><span className="font-mono">{String(r!.rif_fornitore)}</span></div>}
                            {!!r!.inviata_il && <div className="psDato"><span>Erogata il</span><span>{quando(String(r!.inviata_il))}</span></div>}
                            {!!r!.ambiente && <div className="psDato"><span>Ambiente</span><span>{String(r!.ambiente)}</span></div>}
                            {!!r!.errore && <div className="rvNota rvNota-ko" style={{ marginTop: 8 }}><div className="rvNota-s">{String(r!.errore)}</div></div>}
                            {!!r!.nota && <div className="rvNota rvNota-info" style={{ marginTop: 8 }}><div className="rvNota-s">{String(r!.nota)}</div></div>}
                        </div>

                        {/* ── IL DIARIO ──────────────────────────────────────── */}
                        <div className="psBlocco psBlocco-largo">
                            <div className="rvLab">Cosa è successo, in ordine</div>
                            {d.eventi.length ? (
                                <div className="psDiario">
                                    {d.eventi.map((e, i) => (
                                        <div key={i} className={cn("psEv", `psEv-${e.tipo}`)}>
                                            <div className="psEv-q">{quando(e.quando)}</div>
                                            <div className="psEv-t">{e.testo}</div>
                                            <div className="psEv-c">{e.chi || "—"}</div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="rvNota-s">
                                    Nessun movimento registrato. ⚠️ Il diario è nato il 03/09: quello che è successo
                                    prima non c&apos;è, e non è che non sia successo.
                                </div>
                            )}
                        </div>
                    </div>
                </>)}
            </div>
        </div>, document.body);
}
