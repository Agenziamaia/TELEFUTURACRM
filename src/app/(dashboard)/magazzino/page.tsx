"use client";

// MAGAZZINO E GIACENZE (task Luca 12/08, riga 9d7fe69a) — modulo di
// consultazione universale stile Gestione Usati: chi lavora in negozio vede
// l'inventario in tempo reale senza poterlo alterare; carico e trasferimenti
// (con DDT) sono dei ruoli di gestione. Tre sezioni:
//   📦 Giacenze  — filtri azienda/negozio/stato/data storica, griglia
//                  ordinabile (codice, descrizione, giacenza, in arrivo,
//                  valore), export Excel
//   🔍 Ricerca   — barra unica IMEI/SIM/seriale → timeline del ciclo di vita
//                  (magazzino + usati + vendite CRM)
//   🚚 Trasferimenti — TUTTE le situazioni in cui della merce si muove fra
//                  punti vendita: invio, cessione fra le due società, passaggio
//                  fra insegne gemelle, merce a quantità, reso a fornitore,
//                  accettazione parziale, rifiuto, annullamento. Il ragionamento
//                  sta in src/lib/trasferimenti.ts; le righe dei documenti (lo
//                  storico che il mittente rivede per sempre) in mag_ddt_righe.
//   📚 Articoli  — anagrafica articoli dall'export del gestionale (task Luca
//                  13/08): solo i riferimenti (codice, barcode, descrizione,
//                  gruppo/listino, sottogruppo, marca), divisi per brand.
//                  Import col runner scripts/import_mag_articoli.js.
// Stati unità: disponibile · in_arrivo · in_transito (negozio = destinazione;
// chi l'ha spedito lo segue in Trasferimenti) · venduto · annullato.
//
// ⚠️  VESTITO (Luca 31/08). «Le modifiche che hai fatto sul magazzino sono
// corrette, però dobbiamo adattarlo esteticamente al resto del gestionale:
// alla sezione di Registra Vendita, per come l'abbiamo ridefinita — quelle
// tendine, quelle caselle, quei formati, quei colori, quelle sfumature.»
// Da qui in poi questa pagina segue  docs/REGOLE_REGISTRA_VENDITA.md :
// solo classi `.rv*` di globals.css, niente stile scritto dentro l'elemento,
// il colore dal contenitore (`--rv-acc`), i modali in un portal. Se manca una
// classe si aggiunge ALLA CASSETTA — non si fa un'eccezione qui.
// Il COMPORTAMENTO non è cambiato: filtri, conteggi, colonna «Altrove»,
// esplosione dei pezzi, cestino, DDT ed export sono gli stessi di prima.
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Boxes, FileDown, Loader2, PackagePlus, Search, Truck } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import { isAdminOrAbove } from "@/lib/roles";
import { caricaTutte } from "@/lib/fetchTutte";
import { scaricaXlsx, type CellaXlsx } from "@/lib/exportXlsx";
import { SelectOpzioni, SelectMulti } from "@/components/SelectPersona";
import { cn } from "@/utils";
import { splitNegozi, stessoMagazzino } from "@/lib/negoziNomi";
import { ddtHtml, ddtRaccolta, type AziendaDdt, type NegozioDdt, type VettoreDdt, type DatiDdt, type RigaDdt as RigaStampa } from "@/lib/ddtDocumento";
import { storiaCompleta, pezzoOra, NOME_EVENTO, type EventoPezzo } from "@/lib/magazzinoStoria";
/* Il RAGIONAMENTO sui trasferimenti — le situazioni in cui della merce si
   muove fra punti vendita, e cosa deve succedere in ognuna — sta tutto in
   src/lib/trasferimenti.ts. Qui si usa, non si ripete. */
import {
    SITUAZIONI, PERIODI, STATI_DDT, STATI_RIGA, TIPI_DDT, RIGHE_APERTE,
    aperto, inRitardo, fermo, giorniInViaggio, eCessione, daFatturare, tipoDi,
    nellaSituazione, estremi, pezziDi, valoreRiga, cosaMancaPerEmettere, nomeCorto, soloConNegozio,
    type Ddt, type RigaDdt, type Situazione, type Periodo,
} from "@/lib/trasferimenti";

type Unita = {
    id: string; seriale: string; tipo_seriale: string; codice: string | null; descrizione: string;
    azienda: string | null; negozio: string; stato: string; valore: number | null;
    caricato_il: string; caricato_da: string | null; venduto_il: string | null; venduto_da: string | null;
    /* a quanto è uscito davvero (migrazione 20260831190000). `valore` NON è il
       costo — è il prezzo di LISTINO col quale il pezzo è entrato (l'import
       scrive `x.prezzo`; verificato: 560 pezzi su 587 coincidono con
       `mag_articoli.prezzo`, ZERO con `costo_ultimo`). Lo scostamento fra i
       due è quindi lo sconto fatto al cliente, non il margine. */
    prezzo_vendita: number | null;
    contract_id: string | null; ddt_id: string | null;
    storia: { quando: string; evento: string; negozio?: string; operatore?: string; note?: string }[];
};
/** Quello che l'anagrafica dice di un codice. `gruppo` e `marca` non sono
 *  decorazione: da lì si ricava l'operatore telefonico. */
type DatiArticolo = { descrizione: string; prezzo: number | null; gruppo: string | null; marca: string | null };
type Articolo = {
    codice: string; barcode: string | null; descrizione: string;
    gruppo: string | null; sottogruppo: string | null; marca: string | null;
    iva_acquisto: string | null; iva_vendita: string | null;
    costo_ultimo: number | null; prezzo: number | null; attivo: boolean;
};

/* COME SI CHIAMA UNO STATO quando lo legge una persona (Luca 31/08).
   «Spedito» non esisteva nemmeno come stato vero — era una voce morta della
   tendina — e comunque fra due nostri negozi non si spedisce: si TRASFERISCE.
   «In transito» diventa «In viaggio», che è quello che vuol dire: la merce è
   partita da un negozio e non è ancora stata accettata nell'altro. */
const STATI_LABEL: Record<string, string> = {
    disponibile: "🟢 Disponibile", in_arrivo: "📦 In arrivo", in_transito: "🚚 In viaggio",
    trasferito: "📤 Trasferito", annullato: "🗑 Tolto dal magazzino", venduto: "🧾 Venduto",
};
/* GLI STATI CHE SI FILTRANO, E SONO PULSANTI (Luca 31/08: «gli stati diventano
   dei pulsanti, e nel momento in cui entro nel magazzino ho prefleggati i
   disponibili e quelli in arrivo»).
   Sono TRE, e le assenze sono volute:
   · «in viaggio» non sta qui — «non mi interessa nemmeno vedere i prodotti in
     transito dentro il magazzino». Chi ha spedito li ritrova in Trasferimenti,
     che è il posto dove un trasferimento si segue;
   · «tolto dal magazzino» non è uno stato — «un articolo eliminato è un
     articolo eliminato». Resta nella storia del pezzo, non fra la merce. */
const STATI_FILTRO: { id: string; et: string; spiega: string }[] = [
    { id: "disponibile", et: "🟢 Disponibili", spiega: "Quello che c'è adesso sullo scaffale" },
    { id: "in_arrivo", et: "📦 In arrivo", spiega: "Ordinato o in viaggio verso qui: non si vende ancora" },
];
/* IL VENDUTO NON È UNO STATO, È UN'ALTRA DOMANDA (revisore design 31/08).
   Premendolo cambiano le colonne, il filtro di data cambia mestiere, due
   pastiglie spariscono e l'Excel esporta un altro file: è un cambio di
   schermata travestito da filtro. Il CRM ha già il posto giusto — la fila
   «📄 Documenti / 📦 Merce mossa» dei Trasferimenti — e con lei arriva il
   conteggio, che nelle Giacenze non c'era da nessuna parte. */
const gg = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleDateString("it-IT") : "—";
const gghh = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const eur = (v: number | null | undefined) => v == null ? "—" : v.toLocaleString("it-IT", { style: "currency", currency: "EUR" });

export default function MagazzinoPage() {
    const { user } = useAuth();
    // consultazione per tutti; trasferimenti per chi gestisce; il CARICO
    // merce solo amministrazione in su (segnalazione Francesco 12/08)
    const gestisce = ["admin", "dev", "direttore_generale", "store_manager"].includes(user?.role || "");
    const puoCaricare = isAdminOrAbove(user?.role);
    const [tab, setTab] = useState<"giacenze" | "trasferimenti" | "articoli">("giacenze");
    /* IL SECONDO CLIC DELLA CRONISTORIA ARRIVA QUI (revisore 31/08). La storia
       di un pezzo offre «apri il documento di trasporto» con `?ddt=<numero>`,
       ma questa pagina non leggeva nessun parametro: si ricaricava sulle
       Giacenze e il documento restava da cercare a mano. Il numero entra nel
       campo di ricerca dei Trasferimenti, che sa già trovarlo («n.5»). */
    const [ddtCercato, setDdtCercato] = useState("");
    useEffect(() => {
        const n = new URLSearchParams(window.location.search).get("ddt");
        if (n) { setTab("trasferimenti"); setDdtCercato("n." + n); }
    }, []);

    /* LE DUE SOCIETÀ, COL LORO NOME (Francesco 29/08: «non è possibile
       filtrare tra Telefutura e Telefutura 2»). Il filtro c'era, ma diceva
       «T1» e «T2»: codici che in magazzino non significano niente. */
    const [nomiAzienda, setNomiAzienda] = useState<Record<string, string>>({});

    const [negozi, setNegozi] = useState<string[]>([]);
    const [unita, setUnita] = useState<Unita[]>([]);
    /* LE QUANTITÀ (Luca 29/08: «il magazzino è l'unica fonte»). Fin qui questa
       schermata contava SOLO i pezzi con un seriale — un telefono, un modem —
       perché è una riga per pezzo. Ma venti cover uguali sono un numero, non
       venti righe: senza queste, gli accessori non sarebbero comparsi mai,
       nemmeno dopo averli caricati. */
    const [quantita, setQuantita] = useState<RigaQta[]>([]);
    const [anagrafica, setAnagrafica] = useState<Map<string, DatiArticolo>>(new Map());
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        supabase.from("pos_rt").select("azienda,ragione_sociale,piva").not("piva", "is", null)
            .then(({ data }) => {
                const m: Record<string, string> = {};
                (data ?? []).forEach((r: { azienda: string; ragione_sociale: string | null }) => {
                    if (r.azienda && r.ragione_sociale) m[r.azienda] = r.ragione_sociale;
                });
                setNomiAzienda(m);
            });
    }, []);

    const carica = useCallback(async () => {
        setLoading(true);
        const [st, un, gi] = await Promise.all([
            supabase.from("stores").select("name, is_ufficio").order("name"),
            caricaTutte<Unita>((from, to) =>
                supabase.from("mag_unita").select("*").order("caricato_il", { ascending: false }).range(from, to) as never),
            caricaTutte<{ codice: string; negozio: string; azienda: string; quantita: number; in_arrivo: number }>((from, to) =>
                /* ANCHE LE RIGHE SOTTO ZERO (revisore 29/08). Era
                   `.or("quantita.gt.0,in_arrivo.gt.0")`: una giacenza andata a
                   −1 — cioè la prova che qualcosa è stato venduto senza
                   esserci — non compariva da nessuna parte. Un magazzino che
                   nasconde i conti che non tornano non serve a niente. */
                supabase.from("mag_giacenze").select("codice,negozio,azienda,quantita,in_arrivo").or("quantita.neq.0,in_arrivo.gt.0").range(from, to) as never),
        ]);
        setNegozi(((st.data ?? []) as { name: string; is_ufficio?: boolean | null }[]).filter(s => !s.is_ufficio).map(s => s.name));
        setUnita((un.data ?? []) as Unita[]);
        /* IL NOME, IL VALORE E DI CHI È (Luca 31/08). L'anagrafica serviva per
           descrizione e prezzo; ora porta anche `gruppo` e `marca`, perché è
           lì che sta scritto l'operatore telefonico: un telefono di listino ha
           `gruppo = 'LISTINO WIND3'`, un accessorio no. Si legge per l'unione
           dei codici — quantità E pezzi con seriale — se no il filtro per
           operatore vedrebbe metà magazzino. */
        const righeQ = (gi.data ?? []) as { codice: string; negozio: string; azienda: string; quantita: number; in_arrivo: number }[];
        const codici = [...new Set([
            ...righeQ.map(r => r.codice),
            ...((un.data ?? []) as Unita[]).map(u => u.codice).filter(Boolean) as string[],
        ])];
        const anag = new Map<string, DatiArticolo>();
        for (let i = 0; i < codici.length; i += 300) {
            const { data } = await supabase.from("mag_articoli")
                .select("codice,descrizione,prezzo,gruppo,marca").in("codice", codici.slice(i, i + 300));
            (data ?? []).forEach((a: DatiArticolo & { codice: string }) =>
                anag.set(a.codice, { descrizione: a.descrizione, prezzo: a.prezzo, gruppo: a.gruppo, marca: a.marca }));
        }
        setAnagrafica(anag);
        setQuantita(righeQ.map(r => ({
            ...r,
            inArrivo: Number(r.in_arrivo || 0),
            descrizione: anag.get(r.codice)?.descrizione || r.codice,
            valore: Number(anag.get(r.codice)?.prezzo || 0) * Number(r.quantita),
        })));
        setLoading(false);
    }, []);
    useEffect(() => { carica(); }, [carica]);

    /* prima l'elenco nasceva dai soli pezzi con seriale: una società che
       avesse solo accessori non sarebbe MAI comparsa nel filtro */
    const aziende = useMemo(() => Array.from(new Set([
        ...(unita.map(u => u.azienda).filter(Boolean) as string[]),
        ...quantita.map(q => q.azienda).filter(Boolean),
    ])).sort(), [unita, quantita]);

    return (
        /* la tinta della sezione sta sul contenitore, non nei bottoni
           (regola 2): è l'indaco del CRM, e tutto quello che sta dentro —
           pastiglie, riquadri, frecce d'ordinamento — la eredita. */
        <div className="max-w-[1500px]">
            <div className="rvTesta">
                <h1 className="rvTit"><Boxes size={25} /> Magazzino</h1>
                <div className="rvPillRow">
                    {/* LA RICERCA SERIALE NON È PIÙ UNA SCHEDA A PARTE (Luca
                        31/08): «il campo di ricerca seriale potrebbe essere un
                        campo che integriamo dentro le giacenze, così abbiamo
                        tutto in un'unica sezione». Il campo «Cerca» delle
                        Giacenze prende anche gli IMEI, e ogni seriale a schermo
                        si clicca e racconta la sua storia — compreso quello che
                        gli è successo fuori dal magazzino, che era il motivo per
                        cui la scheda separata esisteva. */}
                    {([["giacenze", "📦 Giacenze"], ["trasferimenti", "🚚 Trasferimenti"], ["articoli", "📚 Articoli"]] as const).map(([k, l]) => (
                        <button key={k} onClick={() => setTab(k)} className={cn("rvPill", tab === k && "rvPill-on")}>
                            {l}
                        </button>
                    ))}
                </div>
            </div>
            {loading ? (
                <div className="rvCarico"><Loader2 className="w-6 h-6 animate-spin" /> Carico il magazzino…</div>
            ) : tab === "giacenze" ? (
                <Giacenze unita={unita} quantita={quantita} negozi={negozi} aziende={aziende} nomiAzienda={nomiAzienda}
                    anagrafica={anagrafica} mioNegozio={user?.negozio || ""} puoCancellare={puoCaricare}
                    ricarica={carica} utente={user?.name || "—"} />
            ) : tab === "articoli" ? (
                <Articoli vedeCosti={puoCaricare} />
            ) : (
                <Trasferimenti unita={unita} quantita={quantita} negozi={negozi} aziende={aziende}
                    nomiAzienda={nomiAzienda} anagrafica={anagrafica} mioNegozio={user?.negozio || ""}
                    gestisce={gestisce} puoCaricare={puoCaricare} utente={user?.name || "—"} ricarica={carica}
                    cercaIniziale={ddtCercato} />
            )}
        </div>
    );
}

/* ── 📦 GIACENZE ─────────────────────────────────────────────────────── */
/** Una riga di giacenza a QUANTITÀ: gli accessori, il materiale di consumo.
 *  Non hanno un seriale, quindi non stanno in mag_unita — ma sono magazzino
 *  esattamente come un telefono (Luca 29/08: «il magazzino è l'unica fonte»). */
type RigaQta = { codice: string; descrizione: string; negozio: string; azienda: string; quantita: number; inArrivo: number; valore: number };

/* GLI OPERATORI TELEFONICI (Luca 31/08). «Ci sono articoli che corrispondono
   a un operatore telefonico, altri che non sono associati a un operatore.»
   Non è un campo dell'anagrafica: sta scritto nel GRUPPO, che il gestionale
   compila come «LISTINO WIND3», «LISTINO VODAFONE». Le SIM stanno invece
   tutte insieme in «Usim abbonamento e ricaricabili», e lì l'operatore lo
   dice il nome dell'articolo.
   «LISTINO SBS» non è un operatore: SBS fa accessori. */
/* Sulle SIM il brand è ATTACCATO al nome — `SIMILIAD`, `SIMKENA`, `SIMSKY`,
   `ESIMFASTW` — e a volte sta solo nel CODICE (`SIM 128K PLUS UNICA 4G VOD`).
   Le regex con il confine di parola perdevano 13 SIM su 47, e Iliad, Kena e
   Sky non comparivano nemmeno nella tendina (revisore 31/08). */
const OPERATORI: [string, RegExp][] = [
    ["WindTre", /wind ?tre|wind ?3|\bwind\b|\bwt\b|\bw3\b/i],
    ["Vodafone", /vodafone|\bvoda\b|\bvod\b/i],
    ["Fastweb", /fastweb|fastw/i],
    ["TIM", /\btim\b/i],
    ["Iliad", /iliad/i],
    ["Very Mobile", /\bvery\b/i],
    ["Kena", /kena/i],
    ["ho. Mobile", /ho\.? ?mobile|\bho\b/i],
    ["Sky", /\bsky\b/i],
];
/** L'operatore di un articolo, o `null` se non ne ha uno. */
function operatoreDi(a: DatiArticolo | undefined, descrizione: string, codice?: string): string | null {
    const g = String(a?.gruppo || "");
    // il listino di un operatore: è lui, senza margine di dubbio
    const m = g.match(/^\s*LISTINO\s+(.+)$/i);
    if (m) {
        const nome = m[1].trim();
        const trovato = OPERATORI.find(([, rx]) => rx.test(nome));
        if (trovato) return trovato[0];
        return null;   // LISTINO SBS e simili: fornitori di accessori, non operatori
    }
    // le SIM stanno tutte in un gruppo solo: l'operatore lo dice il nome
    if (/usim|sim/i.test(g) || /^e?sim|sost/i.test(descrizione)) {
        // il brand può stare nel nome o nel codice: si guardano entrambi
        const testo = `${descrizione} ${codice || ""}`;
        const trovato = OPERATORI.find(([, rx]) => rx.test(testo));
        if (trovato) return trovato[0];
    }
    return null;
}

function Giacenze({ unita, quantita, negozi, aziende, nomiAzienda, anagrafica, mioNegozio, puoCancellare, ricarica, utente }: {
    unita: Unita[]; quantita: RigaQta[]; negozi: string[]; aziende: string[];
    nomiAzienda: Record<string, string>; anagrafica: Map<string, DatiArticolo>;
    mioNegozio: string; puoCancellare: boolean; ricarica: () => void; utente: string;
}) {
    /* IL MIO NEGOZIO, GIÀ SPUNTATO (Luca 31/08, «un pochettino come funziona
       Gestione Usato»): chi lavora al banco entra e vede la SUA merce, senza
       dover scegliere niente. Poi può allargare a tutti o guardare un altro
       punto vendita. Chi un negozio non ce l'ha in scheda — amministrazione,
       direzione — entra su «tutti», che è la sua vista naturale. */
    /* PIÙ NEGOZI INSIEME (Luca 31/08): «devo poter selezionare anche più
       negozi contemporaneamente». Lista vuota = tutti, che è la stessa cosa
       ma si scrive una volta sola invece di spuntarne quindici. */
    const [scelti, setScelti] = useState<string[]>(mioNegozio && negozi.includes(mioNegozio) ? [mioNegozio] : []);

    const [azienda, setAzienda] = useState("");
    /* GLI STATI SONO PULSANTI, E SI SOMMANO (Luca 31/08). Entrando si vede
       quello che c'è e quello che sta arrivando: sono le due domande che uno
       al banco si fa davvero. Gli altri si aggiungono e si tolgono. Toglierli
       TUTTI non ha senso — sarebbe una tabella vuota — quindi l'ultimo acceso
       non si spegne. */
    const [stati, setStati] = useState<string[]>(["disponibile", "in_arrivo"]);
    const [vista, setVista] = useState<"giacenze" | "venduto">("giacenze");
    const vistaVenduto = vista === "venduto";
    /* LA VISTA DEL VENDUTO (Luca 31/08): «nel momento in cui clicco su venduto
       la giacenza non mi interessa: mi dà articolo per articolo direttamente
       con l'IMEI». E il filtro di data smette di essere una fotografia del
       passato e diventa un INTERVALLO sulla data di vendita. Parte dal mese in
       corso: è la domanda normale («cosa ho venduto questo mese»), e tiene la
       tabella di una misura leggibile. */
    const _primoDelMese = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; };
    const [dal, setDal] = useState(_primoDelMese);
    const [al, setAl] = useState("");
    /* LA CRONISTORIA DI UN PEZZO, DA QUI (Luca 31/08): «il campo di ricerca
       seriale lo integriamo dentro le giacenze, così clicco sull'IMEI e mi dà
       tutta la cronistoria di quel prodotto». Il seriale su cui è aperta. */
    const [seriale, setSeriale] = useState<string | null>(null);
    /* ANCHE GLI OPERATORI A PIÙ SELEZIONI (Luca 31/08): «lo stesso vale per la
       tendina dell'operatore». Chi cerca «cosa ho di WindTre e Fastweb» lo
       chiede una volta, non due. Vuoto = tutti. */
    const [operatori, setOperatori] = useState<string[]>([]);

    /* SOLO QUELLO CHE C'È, di partenza (Luca 31/08). Con «tutti gli articoli»
       compaiono anche quelli che qui non ci sono ma stanno in un altro
       negozio: serve a chi vuole sapere se può farsi mandare un pezzo. */
    const [soloDisponibili, setSoloDisponibili] = useState(true);
    const [dataStorica, setDataStorica] = useState("");
    const [cerca, setCerca] = useState("");
    const [aperta, setAperta] = useState<string | null>(null);
    /* IL CESTINO (Luca 31/08): «solamente l'amministrativo deve avere la
       possibilità di cancellare dei prodotti dentro il magazzino».
       Non si cancella davvero niente: un pezzo passa ad «annullato» con la sua
       storia, una quantità riceve una RETTIFICA. Il magazzino è la base dello
       scontrino fiscale — una riga che sparisce senza lasciare traccia è un
       buco nell'inventario che nessuno può più spiegare. */
    const [daCestinare, setDaCestinare] = useState<null | {
        titolo: string; codice: string;
        pezzoId?: string; seriale?: string;
        negozio: string; azienda?: string; quantita?: number;
    }>(null);
    const [motivo, setMotivo] = useState("");
    /* QUANTI NE TOLGO (Luca 31/08). Azzerare tutta la giacenza era una scure:
       se di dodici cover se ne rompono due, se ne tolgono DUE. Parte pieno col
       totale — il caso più comune resta «tolgo tutto» — ma si può correggere. */
    const [quantiTolgo, setQuantiTolgo] = useState("");
    const [cestinando, setCestinando] = useState(false);

    const cestina = async () => {
        if (!daCestinare || cestinando) return;
        setCestinando(true);
        try {
            const quando = new Date().toISOString();
            if (daCestinare.pezzoId) {
                const vecchia = unita.find(u => u.id === daCestinare.pezzoId)?.storia || [];
                const { error } = await supabase.from("mag_unita").update({
                    stato: "annullato",
                    storia: [...vecchia, { quando, evento: "annullato", negozio: daCestinare.negozio, operatore: utente, note: motivo.trim() || "tolto dal magazzino" }],
                }).eq("id", daCestinare.pezzoId).neq("stato", "venduto");
                if (error) throw error;
            } else {
                // la quantità si azzera con una rettifica: il saldo lo rifà il
                // trigger, e resta scritto CHI ha tolto quanto e perché
                const tot = daCestinare.quantita || 0;
                const n = Math.min(Math.abs(parseInt(quantiTolgo, 10) || tot), Math.abs(tot)) * (tot < 0 ? -1 : 1);
                const { error } = await supabase.from("mag_movimenti").insert({
                    codice: daCestinare.codice, negozio: daCestinare.negozio, azienda: daCestinare.azienda,
                    tipo: "rettifica", quantita: -n, operatore: utente,
                    nota: `tolti ${Math.abs(n)} dal magazzino${motivo.trim() ? ": " + motivo.trim() : ""}`,
                });
                if (error) throw error;
            }
            setDaCestinare(null); setMotivo(""); setQuantiTolgo("");
            ricarica();
        } catch (e) {
            alert("Non sono riuscito a toglierlo: " + ((e as Error)?.message || "errore"));
        } finally { setCestinando(false); }
    };
    const [sort, setSort] = useState<{ col: number; desc: boolean }>({ col: 1, desc: false });
    /* ENTRANDO NEL VENDUTO SI GUARDA L'ULTIMO (revisore 31/08). L'ordinamento è
       condiviso fra le due tabelle, che hanno colonne diverse: restando su
       «Descrizione» il venduto si apriva in ordine alfabetico, mentre la
       domanda è sempre «cosa è uscito per ultimo». */
    useEffect(() => { setSort(vistaVenduto ? { col: 3, desc: true } : { col: 1, desc: false }); }, [vistaVenduto]);

    /* I GEMELLI SONO LO STESSO SCAFFALE (revisore 31/08). Magliana W3 e
       Magliana Multi sono due insegne in un locale solo, e la cassa già lo sa:
       lascia battere l'IMEI del gemello. La griglia invece confrontava il nome
       esatto, quindi mostrava quei pezzi in colonna «Altrove» — come se
       fossero a Ostia — e suggeriva di farsi un DDT per merce a due passi. */
    /* «Dentro quello che sto guardando». Nessuno scelto = tutti. I gemelli
       contano come uno: Magliana W3 e Magliana Multi sono lo stesso scaffale. */
    const nelloScopo = useCallback((neg: string) =>
        !scelti.length || scelti.some(s => stessoMagazzino(neg, s)), [scelti]);

    /* LA GRIGLIA. Ogni riga è un ARTICOLO, e porta due numeri diversi:
         · giacenza — quanti ce ne sono in quello che stai guardando
         · altrove  — quanti ce ne sono NEGLI ALTRI negozi
       Il secondo è la richiesta di Luca: «immagina un ragazzo che lavora in un
       punto vendita: gli fa comodo capire se di quel telefono c'è giacenza
       negli altri negozi, che può richiedere». */
    type Riga = {
        chiave: string; codice: string; descrizione: string;
        giacenza: number; inArrivo: number; altrove: number; valore: number;
        operatore: string | null;
        pezzi: { id: string; seriale: string; negozio: string; stato: string; valore: number | null }[];
        /* le quantità, negozio per negozio e società per società: il cestino
           deve poter togliere UNA riga precisa, non un totale */
        qtaPer: { negozio: string; azienda: string; quantita: number; inArrivo: number }[];
        altrovePer: Record<string, number>;
    };

    const righe = useMemo(() => {
        const m = new Map<string, Riga>();
        const nuova = (codice: string, descrizione: string): Riga => ({
            chiave: `${codice}|${descrizione}`, codice: codice || "—", descrizione,
            giacenza: 0, inArrivo: 0, altrove: 0, valore: 0,
            operatore: operatoreDi(anagrafica.get(codice), descrizione, codice),
            pezzi: [], qtaPer: [], altrovePer: {},
        });

        // ── i pezzi con un seriale
        for (const u of unita) {
            if (azienda && u.azienda !== azienda) continue;
            let vivo: boolean, arrivo = false;
            if (dataStorica) {
                const fine = dataStorica + "T23:59:59";
                if (u.caricato_il > fine) continue;
                if (u.venduto_il && u.venduto_il <= fine) continue;
                vivo = true;
            } else {
                /* «IN VIAGGIO» VISTO DA CHI LO ASPETTA È «IN ARRIVO» (Luca
                   31/08). Su un pezzo `in_transito` il campo `negozio` è già
                   la DESTINAZIONE: per questo negozio quella merce sta
                   arrivando, e non serve un secondo stato per dirlo. Chi l'ha
                   spedito la segue in Trasferimenti, che è il posto giusto. */
                vivo = u.stato === "disponibile";
                arrivo = u.stato === "in_transito" || u.stato === "in_arrivo";
                /* SI CONTANO SEMPRE ENTRAMBE LE COLONNE: quali RIGHE compaiono
                   si decide in fondo, guardando i pulsanti. Filtrare qui
                   lasciava a zero la colonna che il pulsante non aveva acceso,
                   pur restando intestata «In arrivo» — e un numero falso è
                   peggio di una riga in meno.
                   Venduto e annullato non stanno in questa griglia: il venduto
                   ha la sua vista pezzo per pezzo, l'annullato non è più merce. */
                if (!vivo && !arrivo) continue;
            }
            const k = `${u.codice || ""}|${u.descrizione}`;
            const r = m.get(k) || nuova(u.codice || "", u.descrizione);
            if (nelloScopo(u.negozio)) {
                if (vivo) { r.giacenza++; r.valore += Number(u.valore || 0); r.pezzi.push({ id: u.id, seriale: u.seriale, negozio: u.negozio, stato: u.stato, valore: u.valore }); }
                if (arrivo) { r.inArrivo++; r.pezzi.push({ id: u.id, seriale: u.seriale, negozio: u.negozio, stato: u.stato, valore: u.valore }); }
            } else if (vivo) {
                r.altrove++;
                r.altrovePer[u.negozio] = (r.altrovePer[u.negozio] || 0) + 1;
                r.pezzi.push({ id: u.id, seriale: u.seriale, negozio: u.negozio, stato: u.stato, valore: u.valore });
            }
            m.set(k, r);
        }

        /* le QUANTITÀ entrano nella stessa griglia: chi guarda il magazzino
           vuole sapere cosa c'è, non in che forma è tenuto. La fotografia a
           una data passata resta sui soli pezzi con seriale — per le quantità
           servirebbe ricostruire dai movimenti, e finché non serve è meglio
           non mostrare un numero che non è quello. */
        if (!dataStorica) {
            for (const g of quantita) {
                if (azienda && g.azienda !== azienda) continue;
                /* IL FILTRO NON DEVE PERDERE LE QUANTITÀ (revisore 29/08): le
                   quantità non hanno uno stato per riga, hanno DUE COLONNE —
                   quanto c'è e quanto arriva. Il pulsante acceso decide quale
                   delle due si guarda, e la riga compare se almeno una delle
                   due colonne guardate ha qualcosa dentro. */
                const k = `${g.codice}|${g.descrizione}`;
                const r = m.get(k) || nuova(g.codice, g.descrizione);
                if (nelloScopo(g.negozio)) {
                    /* LE DUE COLONNE SI RIEMPIONO SEMPRE (revisore 31/08). Il
                       pulsante decide quali RIGHE compaiono, non quali numeri
                       si azzerano: con «solo disponibili» la colonna «In
                       arrivo» andava a zero pur restando intestata così, e a
                       Donna Olimpia si leggeva «0 SIM Fastweb in arrivo» con 40
                       pezzi ordinati. Chi legge quel numero riordina. */
                    r.giacenza += Number(g.quantita);
                    // la merce in arrivo NON è giacenza: non si vende quello che
                    // sullo scaffale non c'è. Ma sapere che arriva serve.
                    r.inArrivo += Number(g.inArrivo || 0);
                    r.valore += Number(g.valore || 0);
                } else if (Number(g.quantita) > 0) {
                    r.altrove += Number(g.quantita);
                    r.altrovePer[g.negozio] = (r.altrovePer[g.negozio] || 0) + Number(g.quantita);
                }
                r.qtaPer.push({ negozio: g.negozio, azienda: g.azienda, quantita: Number(g.quantita), inArrivo: Number(g.inArrivo || 0) });
                m.set(k, r);
            }
        }

        let out = Array.from(m.values());
        if (operatori.length) out = out.filter(r =>
            operatori.some(o => o === "(nessuno)" ? !r.operatore : r.operatore === o));
        /* LA RICERCA PRENDE ANCHE I SERIALI (Luca 31/08: «il campo di ricerca
           seriale lo integriamo dentro le giacenze, così abbiamo tutto in
           un'unica sezione»). Un IMEI si spara col lettore e arriva con dei
           separatori: si tolgono. Sotto le 4 cifre non si cerca per seriale —
           «128» beccherebbe mezzo magazzino. */
        if (cerca.trim()) {
            const q = cerca.trim().toLowerCase();
            const qs = q.replace(/[\s./-]/g, "");
            out = out.filter(r => `${r.codice} ${r.descrizione}`.toLowerCase().includes(q)
                || (qs.length >= 4 && r.pezzi.some(p => p.seriale.toLowerCase().replace(/[\s./-]/g, "").includes(qs))));
        }
        // «solo disponibili» = quello che c'è QUI; «tutti» tiene anche ciò che
        // sta solo altrove, che è il motivo per cui la colonna esiste
        /* LE RIGHE SOTTO ZERO RESTANO SEMPRE VISIBILI (revisore 31/08). Il
           29/08 la query era stata aperta apposta alle giacenze negative —
           «un magazzino che nasconde i conti che non tornano non serve a
           niente» — e «solo disponibili» le avrebbe rimesse sotto il tappeto:
           una riga a −1 è la prova che qualcosa è uscito senza esserci, ed è
           esattamente quello che si deve vedere entrando. */
        /* QUI SI DECIDE CHI COMPARE — un posto solo per tutte e due le forme
           della merce, pezzi con seriale e quantità (revisore 31/08: prima i
           due rami filtravano in modo diverso e la stessa vista dava numeri
           coerenti sugli accessori e zeri sui telefoni).
           Con la fotografia a una data passata gli stati non si applicano — i
           pulsanti sono spenti — quindi vale la giacenza e basta. */
        const vuoleDisp = !!dataStorica || stati.includes("disponibile");
        const vuoleArr = !dataStorica && stati.includes("in_arrivo");
        out = out.filter(r => {
            const qui = (vuoleDisp && r.giacenza !== 0) || (vuoleArr && r.inArrivo > 0);
            return soloDisponibili ? qui : (qui || r.altrove > 0);
        });

        const val = (r: Riga, c: number) => c === 0 ? r.codice : c === 1 ? r.descrizione
            : c === 2 ? r.giacenza : c === 3 ? r.altrove : c === 4 ? r.inArrivo : r.valore;
        out.sort((a, b) => {
            const va = val(a, sort.col), vb = val(b, sort.col);
            const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
            return sort.desc ? -cmp : cmp;
        });
        return out;
    }, [unita, quantita, anagrafica, scelti, azienda, stati, operatori, cerca, soloDisponibili, dataStorica, sort, nelloScopo]);

    /* ═══ IL VENDUTO, PEZZO PER PEZZO ═══════════════════════════════════
       Luca 31/08: «nel momento in cui clicco su venduto la giacenza non mi
       interessa: voglio verificare il venduto del magazzino, quindi mi dà
       articolo per articolo direttamente con l'IMEI, il prezzo al quale l'ho
       venduto e il giorno in cui l'ho venduto».
       Qui una riga NON è un articolo: è un pezzo. Sommare non servirebbe a
       niente — due iPhone uguali venduti in due giorni a due prezzi diversi
       sono due fatti diversi, e schiacciarli in «2» li nasconde entrambi. */
    type PezzoVenduto = {
        id: string; seriale: string; codice: string; descrizione: string;
        negozio: string; azienda: string | null; operatore: string | null;
        venduto_il: string | null; venduto_da: string | null;
        prezzo: number | null; costo: number | null; contract_id: string | null;
    };
    const venduti = useMemo<PezzoVenduto[]>(() => {
        if (!vistaVenduto) return [];
        /* GLI ESTREMI SONO ISTANTI, NON STRINGHE (revisore 31/08).
           `venduto_il` è un `timestamptz` e arriva in UTC, mentre «dal
           01/08» è una data di ROMA: confrontarli come testo spostava il
           confine di due ore. Una vendita del 1° alle 00:30 spariva dal mese,
           e una del 1° settembre all'01:00 entrava nel totale di agosto
           mostrando «01/09». Chi somma la colonna per chiudere il mese
           sommava un numero sbagliato. */
        const da = dal ? new Date(dal + "T00:00:00").toISOString() : null;
        const a = al ? new Date(al + "T23:59:59.999").toISOString() : null;
        const q = cerca.trim().toLowerCase(), qs = q.replace(/[\s./-]/g, "");
        let out = unita.filter(u => {
            if (u.stato !== "venduto") return false;
            if (azienda && u.azienda !== azienda) return false;
            if (!nelloScopo(u.negozio)) return false;
            /* SENZA DATA NON SI FINGE (regola 7). Un pezzo venduto a cui manca
               `venduto_il` è un dato incompleto: entra solo quando l'intervallo
               è aperto, così si vede che c'è invece di sparire dentro un filtro
               che non poteva valutarlo. */
            if (u.venduto_il) { if (da && u.venduto_il < da) return false; if (a && u.venduto_il > a) return false; }
            else if (da || a) return false;
            if (q && !(`${u.codice || ""} ${u.descrizione}`.toLowerCase().includes(q)
                || (qs.length >= 4 && u.seriale.toLowerCase().replace(/[\s./-]/g, "").includes(qs)))) return false;
            return true;
        }).map(u => ({
            id: u.id, seriale: u.seriale, codice: u.codice || "—", descrizione: u.descrizione,
            negozio: u.negozio, azienda: u.azienda, venduto_il: u.venduto_il, venduto_da: u.venduto_da,
            operatore: operatoreDi(anagrafica.get(u.codice || ""), u.descrizione, u.codice || ""),
            prezzo: u.prezzo_vendita == null ? null : Number(u.prezzo_vendita),
            costo: u.valore == null ? null : Number(u.valore),
            contract_id: u.contract_id,
        }));
        if (operatori.length) out = out.filter(r => operatori.some(o => o === "(nessuno)" ? !r.operatore : r.operatore === o));
        // il più recente in cima: è quello che si va a cercare
        out.sort((x, y) => String(y.venduto_il || "").localeCompare(String(x.venduto_il || "")));
        return out;
    }, [unita, anagrafica, vistaVenduto, dal, al, azienda, operatori, cerca, nelloScopo]);

    /* quanti venduti restano fuori dall'intervallo perché la data non ce l'hanno */
    const senzaData = useMemo(() => !vistaVenduto ? 0 : unita.filter(u =>
        u.stato === "venduto" && !u.venduto_il && nelloScopo(u.negozio)
        && (!azienda || u.azienda === azienda)).length, [unita, vistaVenduto, azienda, nelloScopo]);

    // gli operatori che hanno davvero qualcosa in questa vista
    const operatoriPresenti = useMemo(() => {
        const s = new Set<string>();
        unita.forEach(u => { const o = operatoreDi(anagrafica.get(u.codice || ""), u.descrizione, u.codice || ""); if (o) s.add(o); });
        quantita.forEach(q => { const o = operatoreDi(anagrafica.get(q.codice), q.descrizione, q.codice); if (o) s.add(o); });
        return Array.from(s).sort();
    }, [unita, quantita, anagrafica]);

    /* L'EXCEL ESPORTA QUELLO CHE SI STA GUARDANDO, non un'altra cosa
       (regola 7). Col venduto a schermo, un file di giacenze sarebbe un file
       che non c'entra niente con la domanda che uno ha appena fatto. */
    const esporta = () => {
        const dove = scelti.length ? scelti.join("+").replace(/\s+/g, "") : "tutti";
        const oggi = new Date().toISOString().slice(0, 10);
        if (vistaVenduto) {
            const dati: CellaXlsx[][] = vendutiOrdinati.map(v => [v.seriale, v.codice, v.descrizione, v.operatore || "—",
                v.negozio, v.venduto_il ? v.venduto_il.slice(0, 10) : "—", v.venduto_da || "—",
                v.costo == null ? "" : Math.round(v.costo * 100) / 100,
                v.prezzo == null ? "" : Math.round(v.prezzo * 100) / 100]);
            scaricaXlsx(`venduto_${dove}_${dal || "inizio"}_${al || oggi}.xlsx`,
                ["IMEI / seriale", "Codice", "Descrizione", "Operatore", "Negozio", "Venduto il", "Venduto da", "A listino €", "Venduto a €"],
                dati, "Venduto");
            return;
        }
        const dati: CellaXlsx[][] = righe.map(r => [r.codice, r.descrizione, r.operatore || "—", r.giacenza, r.altrove, r.inArrivo, Math.round(r.valore * 100) / 100]);
        scaricaXlsx(`giacenze_${dove}_${oggi}.xlsx`,
            ["Codice", "Descrizione", "Operatore", "Giacenza", "Altrove", "In arrivo", "Valore €"], dati, "Giacenze");
    };

    const colonne = ["Codice", "Descrizione", "Giacenza", "Altrove", "In arrivo", "Valore"];
    /* Le colonne del VENDUTO: qui una riga è un pezzo, quindi «giacenza» e
       «altrove» non vogliono dire niente e al loro posto ci sono le due cose
       che Luca ha chiesto — quando è uscito e a quanto. */
    const COL_VENDUTO = ["IMEI / seriale", "Descrizione", "Negozio", "Venduto il", "Venduto da", "A listino", "Venduto a"];
    const vendutiOrdinati = useMemo(() => {
        const val = (r: PezzoVenduto, c: number): string | number =>
            c === 0 ? r.seriale : c === 1 ? r.descrizione : c === 2 ? r.negozio
                : c === 3 ? (r.venduto_il || "") : c === 4 ? (r.venduto_da || "")
                    : c === 5 ? (r.costo ?? -1) : (r.prezzo ?? -1);
        const out = [...venduti];
        out.sort((a, b) => {
            const va = val(a, sort.col), vb = val(b, sort.col);
            const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
            return sort.desc ? -cmp : cmp;
        });
        return out;
    }, [venduti, sort]);
    /** «è nel negozio che sto guardando?» — decide il colore della pastiglia
     *  del luogo, e prima era scritto due volte uguale dentro l'elemento. */
    const quiDa = (neg: string) => scelti.length ? nelloScopo(neg) : neg === mioNegozio;

    return (
        <div className="space-y-4">
            <div className="rvBox">
                <div className="rvBoxT">🔎 Cosa guardo</div>
                {/* DOVE GUARDO — il mio negozio è già scelto */}
                <div className="rvLab">Dove guardo</div>
                <div className="rvBarra rvBarra-c">
                    {mioNegozio && negozi.includes(mioNegozio) && (
                        <button onClick={() => setScelti([mioNegozio])}
                            className={cn("rvPill rvPill-sm", scelti.length === 1 && scelti[0] === mioNegozio && "rvPill-on")}>🏠 {mioNegozio}</button>
                    )}
                    <button onClick={() => setScelti([])} className={cn("rvPill rvPill-sm", !scelti.length && "rvPill-on")}>🌐 Tutti i negozi</button>
                    {/* PIÙ NEGOZI INSIEME (Luca 31/08). Il primo tentativo usava
                        `SelectOpzioni` — una tendina a scelta SINGOLA — passandole
                        `value=""` e aggiungendo la voce presa a una lista fuori.
                        Non funzionava: il componente si tiene il testo scelto, e
                        siccome `value` restava "" e non cambiava mai, l'effetto
                        che lo azzera non ripartiva — dopo la prima scelta il campo
                        restava pieno e sembrava bloccato. In questo stesso file
                        c'era GIÀ `SelectMulti`, con le spunte e la voce «Tutti»:
                        bastava usarlo.
                        La className SOSTITUISCE il default (non si fondono): va
                        addosso all'<input>, quindi `.rvIn` e basta. */}
                    <div className="rvCampo rvCampo-lg"><SelectMulti className="rvIn"
                        values={scelti} onChange={setScelti} opzioni={negozi}
                        maxVoci={30} tuttiLabel="🌐 Tutti i negozi"
                        placeholder="Scegli i punti vendita — vuoto = tutti" /></div>
                    {/* le pastiglie di quello che hai scelto le disegna già
                        `SelectMulti`: rifarle qui le raddoppiava, con due
                        grafiche diverse (revisore 31/08) */}
                </div>
                {/* ── OGNI ASSE COL SUO NOME (revisore design 31/08) ──
                    Erano cinque pastiglie identiche in fila, tre accese,
                    separate da un filo che ho misurato a 1,38:1 — cioè da
                    niente. Chi entra per la prima volta legge «Solo quello che
                    ho qui» come un quarto stato, e a schermo stretto la coppia
                    si spezzava lasciando il divisorio a separare le cose
                    sbagliate. La grammatica di casa c'era già: in Registra
                    Vendita ogni `.rvPillRow` ha sopra la sua etichetta. */}
                {!vistaVenduto && (
                    <div className="rvBarra rvBarra-t mt-3">
                        <div className="rvCampo"><span className="rvLab">In che stato</span>
                            <div className="rvPillRow">
                                {STATI_FILTRO.map(x => {
                                    const on = stati.includes(x.id);
                                    return (
                                        <button key={x.id} title={dataStorica ? "Con la fotografia a una data passata gli stati non si applicano: togli la data" : x.spiega}
                                            /* CON LA FOTOGRAFIA ALLA DATA NON GOVERNANO NIENTE
                                               (revisore 31/08): quel ramo non consulta gli stati e i
                                               pulsanti davano tutti lo stesso risultato. La tendina di
                                               prima era `disabled`; convertendola in pulsanti la
                                               disabilitazione s'era persa. */
                                            disabled={!!dataStorica}
                                            /* l'ultimo acceso non si spegne: una tabella senza nemmeno
                                               uno stato non mostra niente e sembra rotta */
                                            onClick={() => setStati(p => on ? (p.length > 1 ? p.filter(y => y !== x.id) : p) : [...p, x.id])}
                                            className={cn("rvPill rvPill-sm", on && "rvPill-on")}>{x.et}</button>
                                    );
                                })}
                            </div>
                            {/* la spiegazione non può vivere solo nel tooltip: sui monitor da
                                negozio il passaggio del mouse non c'è (regola 7) */}
                            <div className="rvHint">«In arrivo» è ordinato o in viaggio verso qui: non si vende ancora.</div>
                        </div>
                        <div className="rvCampo"><span className="rvLab">Cosa conto</span>
                            <div className="rvPillRow">
                                <button onClick={() => setSoloDisponibili(true)}
                                    className={cn("rvPill rvPill-sm", soloDisponibili && "rvPill-on")}>📗 Solo quello che ho qui</button>
                                <button onClick={() => setSoloDisponibili(false)}
                                    className={cn("rvPill rvPill-sm", !soloDisponibili && "rvPill-on")}
                                    title="Mostra anche quello che qui non c'è ma sta in un altro negozio">📚 Anche quello che sta altrove</button>
                            </div>
                        </div>
                    </div>
                )}
                {/* I FILTRI FINI */}
                <div className="rvBarra mt-3">
                    <label className="rvCampo rvCampo-lg"><span className="rvLab">Cerca</span>
                        <input value={cerca} onChange={e => setCerca(e.target.value)} placeholder="codice, descrizione o IMEI — puoi spararlo col lettore"
                            className="rvIn" /></label>
                    {/* IL SERIALE CHE A MAGAZZINO NON C'È PIÙ (revisore 31/08).
                        La scheda «Ricerca seriale» è stata tolta, e con lei
                        l'unico modo di cercare un pezzo che in `mag_unita` non
                        sta: 219 telefoni di permuta e 468 vendite con un IMEI
                        che il magazzino non ha mai visto — più i pezzi
                        cestinati, che la griglia giustamente non mostra ma la
                        cui storia esiste. In tutto 626 seriali che ieri si
                        trovavano e stamattina no.
                        La scheda della storia funziona già su un seriale che
                        non è a magazzino: mancava solo come chiamarla. */}
                    {cerca.trim().replace(/[\s./-]/g, "").length >= 8 && (
                        <button onClick={() => setSeriale(cerca.trim().replace(/[\s./-]/g, ""))}
                            className="rvPill rvPill-sm" title="Cerca questo seriale ovunque: magazzino, permute, vendite">
                            🕰 Storia di questo seriale</button>
                    )}
                    <div className="rvCampo rvCampo-md"><span className="rvLab">Operatore</span>
                        <SelectMulti className="rvIn"
                            values={operatori} onChange={setOperatori}
                            opzioni={[...operatoriPresenti, "(nessuno)"]}
                            maxVoci={20} tuttiLabel="Tutti gli operatori"
                            placeholder="Tutti — scrivi per filtrare" /></div>
                    <div className="rvCampo rvCampo-lg"><span className="rvLab">Azienda</span>
                        <SelectOpzioni className="rvIn"
                            value={azienda ? (nomiAzienda[azienda] || azienda) : ""}
                            onChange={(v) => setAzienda(v ? (Object.keys(nomiAzienda).find(k => nomiAzienda[k] === v) || v) : "")}
                            opzioni={aziende.map(a => nomiAzienda[a] || a)} placeholder="Tutte le società" /></div>
                    {/* LA DATA CAMBIA MESTIERE COL FILTRO DELLO STATO (Luca
                        31/08: «quel range di data diventa un range di data
                        adattabile in virtù del filtro dello stato»). Sul
                        venduto una fotografia a una data non vuol dire niente:
                        quello che serve è «dal … al …». */}
                    {vistaVenduto ? (
                        <>
                            {/* le due date e il loro azzeramento stanno INSIEME (revisore
                                design 31/08): andando a capo, «✕ tutto» finiva da solo su
                                una riga sua, staccato da quello che governa */}
                            <div className="rvCampo rvCampo-lg"><span className="rvLab">Venduto dal … al</span>
                                <div className="rvBarra rvBarra-c">
                                    <input type="date" value={dal} onChange={e => setDal(e.target.value)} className="rvIn rvCampo-sm" />
                                    <input type="date" value={al} onChange={e => setAl(e.target.value)} className="rvIn rvCampo-sm" />
                                    {(dal || al) && <button onClick={() => { setDal(""); setAl(""); }} className="rvPill rvPill-sm"
                                        title="Tutto il venduto, da sempre">✕ tutto</button>}
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <label className="rvCampo rvCampo-md" title="Fotografia del magazzino a quella data: caricato entro la data e non ancora venduto">
                                <span className="rvLab">Giacenza alla data</span>
                                <input type="date" value={dataStorica} onChange={e => setDataStorica(e.target.value)} className="rvIn" /></label>
                            {dataStorica && <button onClick={() => setDataStorica("")} className="rvPill rvPill-sm">✕ oggi</button>}
                        </>
                    )}
                    <span className="rvSpazio" />
                    <button onClick={esporta} disabled={vistaVenduto ? !venduti.length : !righe.length} className="rvAzione rvAzione-sm">
                        <FileDown size={14} className="inline-block align-[-2px] mr-1.5" /> Excel
                    </button>
                </div>
                {/* la nota della fotografia sta DENTRO il ramo che la usa
                    (revisore design 31/08): nella vista del venduto restava a
                    schermo mentre il campo che la governa era sparito */}
                {dataStorica && !vistaVenduto && (
                    <div className="rvNota rvNota-att">
                        <div className="rvNota-t">📅 La fotografia a una data passata</div>
                        <div className="rvNota-s">Vale sui soli pezzi con seriale: le quantità non hanno una storia per riga.</div>
                    </div>
                )}
            </div>
            {/* ── LE DUE DOMANDE, COL LORO CONTEGGIO ────────────────────────
                Non è un filtro fra i filtri: premendo «quello che ho venduto»
                cambiano le colonne, la data cambia mestiere e l'Excel esporta
                un altro file. Stessa forma della fila «📄 Documenti / 📦 Merce
                mossa» dei Trasferimenti — e finalmente il conteggio, che nelle
                Giacenze non c'era da nessuna parte. */}
            <div className="rvPillRow">
                <button onClick={() => setVista("giacenze")} className={cn("rvPill", !vistaVenduto && "rvPill-on")}>
                    📦 Quello che ho<b className="rvPillN">{vistaVenduto ? "—" : righe.length}</b></button>
                <button onClick={() => setVista("venduto")} className={cn("rvPill", vistaVenduto && "rvPill-on")}
                    title="Il venduto, pezzo per pezzo, con l'IMEI e il prezzo di uscita">
                    🧾 Quello che ho venduto{vistaVenduto && <b className="rvPillN">{venduti.length}</b>}</button>
            </div>
            {/* IN UN PORTAL (regola 6): oggi sopra non c'è nessun riquadro
                sfocato, ma il giorno che il magazzino finisce dentro una card
                col backdrop-filter questo modale diventerebbe grande quanto la
                card — è già successo alla cassa, misurato 420×130. */}
            {daCestinare && typeof document !== "undefined" && createPortal(
                <div className="rvFattaSfondo" onClick={(e) => { if (e.target === e.currentTarget && !cestinando) setDaCestinare(null); }}>
                    <div className="rvFatta rvFatta-att">
                        <div className="rvFatta-o rvFatta-att-o">🗑</div>
                        <h3>Togliere dal magazzino?</h3>
                        <p>
                            <b>{daCestinare.titolo}</b><br />
                            {/* DI QUALE NEGOZIO (revisore 31/08): il pannello
                                dei dettagli elenca anche gli altri punti
                                vendita, ognuno col suo cestino — un
                                amministratore poteva rettificare la giacenza di
                                Promontori stando a Magliana senza accorgersene. */}
                            <b>{daCestinare.negozio}</b><br />
                            {daCestinare.seriale
                                ? "Il pezzo non sarà più vendibile né trasferibile, ma la sua storia resta."
                                : "La giacenza scende con una rettifica: il movimento resta scritto."}
                        </p>
                        {/* niente sparisce davvero: resta scritto chi, quando e perché */}
                        <div className="rvFatta-d">
                            <div><span>{daCestinare.seriale ? "Pezzo" : "A magazzino"}</span>
                                <span>{daCestinare.seriale ? daCestinare.seriale : `${daCestinare.quantita} pezzi`}</span></div>
                            <div><span>Negozio</span><span>{daCestinare.negozio}</span></div>
                        </div>
                        {/* QUANTI NE TOLGO: di dodici cover se ne rompono due, non
                            dodici. Parte col totale, perché «tolgo tutto» resta il
                            caso più comune. */}
                        {!daCestinare.seriale && (
                            <label className="rvCampo"><span className="rvLab">Quanti ne togli</span>
                                <input type="number" min={1} max={Math.abs(daCestinare.quantita || 1)}
                                    value={quantiTolgo === "" ? String(Math.abs(daCestinare.quantita || 0)) : quantiTolgo}
                                    onChange={e => setQuantiTolgo(e.target.value)}
                                    className="rvIn" /></label>
                        )}
                        <label className="rvCampo"><span className="rvLab">Perché lo togli</span>
                            <input value={motivo} onChange={e => setMotivo(e.target.value)} autoFocus
                                placeholder="rubato, rotto, mai arrivato…" className="rvIn" /></label>
                        <div className="rvBarra rvBarra-c mt-4 justify-end">
                            <button onClick={() => { setDaCestinare(null); setMotivo(""); setQuantiTolgo(""); }} disabled={cestinando}
                                className="rvPill">Annulla</button>
                            <button onClick={cestina} disabled={cestinando} className="rvAzione rvAzione-no">
                                {cestinando && <Loader2 className="w-4 h-4 animate-spin inline-block align-[-3px] mr-2" />}Sì, toglilo
                            </button>
                        </div>
                    </div>
                </div>, document.body)}
            {/* ═══ LA TABELLA CAMBIA MESTIERE COL VENDUTO (Luca 31/08) ═══
                «La giacenza non mi interessa: mi dà articolo per articolo
                direttamente con l'IMEI.» Non è la stessa tabella filtrata
                diversamente — è un'altra domanda, e vuole altre colonne. */}
            {vistaVenduto && senzaData > 0 && (dal || al) && (
                /* NON SI NASCONDE MERCE VENDUTA (revisore 31/08). Un pezzo
                   uscito a cui manca la data non può stare dentro un
                   intervallo, ma non deve nemmeno sparire: nella griglia non
                   c'è (è venduto) e qui sarebbe invisibile. Il suggerimento
                   c'era, ma usciva solo a tabella vuota. */
                <div className="rvNota rvNota-att">
                    <div className="rvNota-t">⚠️ {senzaData} {senzaData === 1 ? "pezzo venduto senza data di uscita" : "pezzi venduti senza data di uscita"}</div>
                    <div className="rvNota-s">
                        Un intervallo non può contenerli. <button onClick={() => { setDal(""); setAl(""); }}
                            className="rvPill rvPill-sm">Mostrali</button>
                    </div>
                </div>
            )}
            {vistaVenduto ? (
                <div className="rvTabBox">
                    <table className="rvTab">
                        <thead>
                            <tr>
                                {COL_VENDUTO.map((cta, i) => (
                                    <th key={i} className={cn("rvTab-ord", i >= 5 && "rvTab-c")}
                                        onClick={() => setSort(s2 => ({ col: i, desc: s2.col === i ? !s2.desc : i >= 3 }))}>
                                        {cta}{sort.col === i ? <i>{sort.desc ? "↓" : "↑"}</i> : null}
                                    </th>))}
                            </tr>
                        </thead>
                        <tbody>
                            {vendutiOrdinati.map(v2 => {
                                const sconto = v2.prezzo != null && v2.costo != null ? v2.prezzo - v2.costo : null;
                                return (
                                    <tr key={v2.id} className="rvTab-riga">
                                        {/* IL SERIALE SI CLICCA E RACCONTA (Luca 31/08) */}
                                        <td className="rvTab-cod">
                                            <button onClick={() => setSeriale(v2.seriale)} className="rvSerial"
                                                title="Tutta la storia di questo pezzo">{v2.seriale}</button>
                                        </td>
                                        <td className="rvTab-nome">
                                            {v2.descrizione}
                                            {v2.operatore && <span className="rvBadge rvBadge-acc ml-2 align-middle">{v2.operatore}</span>}
                                        </td>
                                        <td className="rvTab-min">{v2.negozio}</td>
                                        <td className="rvTab-min">{gg(v2.venduto_il)}</td>
                                        <td className="rvTab-min">{v2.venduto_da || "—"}</td>
                                        <td className="rvTab-n">{eur(v2.costo)}</td>
                                        {/* uno zero col colore del «tutto a posto» è un numero
                                            che mente (regola 7): un pezzo uscito a zero euro
                                            è la cosa che si va a cercare, non da rassicurare */}
                                        <td className={cn("rvTab-n rvGiac", v2.prezzo == null || v2.prezzo === 0 ? "rvGiac-zero" : sconto != null && sconto < 0 ? "rvGiac-ko" : "rvGiac-si")}>
                                            {eur(v2.prezzo)}
                                            {/* quanto sopra o sotto il listino: è la domanda vera di
                                                chi guarda il venduto di un negozio */}
                                            {sconto != null && Math.abs(sconto) >= 0.01 && (
                                                <span className="rvTab-min"> ({sconto > 0 ? "+" : ""}{eur(sconto)})</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {!vendutiOrdinati.length && <tr><td colSpan={COL_VENDUTO.length} className="rvTab-vuoto">
                                Nessun pezzo venduto con questi filtri.
                                {(dal || al) && " L'intervallo di date parte dal primo del mese: prova «✕ tutto»."}
                            </td></tr>}
                        </tbody>
                    </table>
                </div>
            ) : (
            <div className="rvTabBox">
                <table className="rvTab">
                    <thead>
                        <tr>{colonne.map((cta, i) => (
                            <th key={i} className={cn("rvTab-ord", i >= 2 && "rvTab-c")}
                                onClick={() => setSort(s => ({ col: i, desc: s.col === i ? !s.desc : false }))}
                                title={i === 3 ? "Quanti ce ne sono negli ALTRI punti vendita" : undefined}>
                                {cta}{sort.col === i ? <i>{sort.desc ? "↓" : "↑"}</i> : null}
                            </th>))}
                        </tr>
                    </thead>
                    <tbody>
                        {righe.map((r) => {
                            /* SI APRE ANCHE LA MERCE A QUANTITÀ (Luca 31/08):
                               «il cestino me l'hai messo solo in corrispondenza
                               degli IMEI, così non posso cestinare gli articoli
                               che un IMEI non ce l'hanno».
                               Era `pezzi.length > 0 || altrove > 0`: un articolo a
                               sola quantità, presente solo dove stai guardando, non
                               si apriva — e dentro c'era il suo cestino, che quindi
                               non esisteva. Sono la stragrande maggioranza del
                               magazzino: 1.548 articoli, di cui appena 73 codici
                               hanno un seriale. */
                            const apribile = r.pezzi.length > 0 || r.qtaPer.length > 0 || r.altrove > 0;
                            const apertaQui = aperta === r.chiave;
                            return (
                                <Fragment key={r.chiave}>
                                    <tr onClick={() => apribile && setAperta(apertaQui ? null : r.chiave)}
                                        className={cn("rvTab-riga", apribile && "rvTab-cl", apertaQui && "rvTab-on")}>
                                        <td className="rvTab-cod">
                                            {apribile && <span className="rvTab-ap">{apertaQui ? "▾" : "▸"}</span>}{r.codice}
                                        </td>
                                        <td className="rvTab-nome">
                                            {r.descrizione}
                                            {r.operatore && <span className="rvBadge rvBadge-acc ml-2 align-middle">{r.operatore}</span>}
                                        </td>
                                        <td className={cn("rvTab-n rvGiac", r.giacenza > 0 ? "rvGiac-si" : r.giacenza < 0 ? "rvGiac-ko" : "rvGiac-zero")}>{r.giacenza}</td>
                                        <td className={cn("rvTab-n rvGiac", r.altrove ? "rvGiac-no" : "rvGiac-zero")}>{r.altrove || "—"}</td>
                                        <td className={cn("rvTab-n rvGiac", r.inArrivo ? "rvGiac-arr" : "rvGiac-zero")}>{r.inArrivo || "—"}</td>
                                        <td className="rvTab-n">{eur(r.valore)}</td>
                                    </tr>
                                    {apertaQui && (
                                        <tr className="rvTab-det">
                                            <td colSpan={6}>
                                                {r.pezzi.length > 0 ? (
                                                    <div className="rvDett">
                                                        <div className="rvDettT">I pezzi, uno per uno</div>
                                                        {r.pezzi.map(p => (
                                                            <div key={p.id} className="rvDettR">
                                                                {/* IL SERIALE SI CLICCA E RACCONTA (Luca 31/08):
                                                                    «clicco sull'IMEI specifico e mi dà tutta la
                                                                    cronistoria di quel prodotto» */}
                                                                <button onClick={(e) => { e.stopPropagation(); setSeriale(p.seriale); }}
                                                                    className="rvSerial" title="Tutta la storia di questo pezzo">{p.seriale}</button>
                                                                <span className={cn("rvBadge rvBadge-w", quiDa(p.negozio) ? "rvBadge-ok" : "rvBadge-warn")}>
                                                                    {p.negozio}
                                                                </span>
                                                                <span className="rvTab-min">{STATI_LABEL[p.stato] || p.stato}</span>
                                                                <span className="rvDove-fine">{eur(p.valore)}</span>
                                                                {puoCancellare && (
                                                                    <button title="Togli questo pezzo dal magazzino"
                                                                        onClick={(e) => { e.stopPropagation(); setDaCestinare({ titolo: r.descrizione, codice: r.codice, pezzoId: p.id, seriale: p.seriale, negozio: p.negozio }); }}
                                                                        className="rvCestino">🗑</button>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : r.qtaPer.length === 0 ? (
                                                    <div className="rvTab-min">Nessun dettaglio da mostrare.</div>
                                                ) : null}
                                                {r.qtaPer.length > 0 && (
                                                    <div className="rvDett">
                                                        <div className="rvDettT">Merce a quantità, negozio per negozio</div>
                                                        {r.qtaPer.map(q => (
                                                            <div key={q.negozio + q.azienda} className="rvDettR">
                                                                <span className={cn("rvBadge rvBadge-w", quiDa(q.negozio) ? "rvBadge-ok" : "rvBadge-warn")}>
                                                                    {q.negozio}
                                                                </span>
                                                                <span className="rvTab-min">{nomiAzienda[q.azienda] || q.azienda}</span>
                                                                <span className="rvDove-fine"><b className={cn("rvGiac", q.quantita < 0 ? "rvGiac-ko" : "rvGiac-si")}>{q.quantita}</b> pezzi</span>
                                                                {q.inArrivo > 0 && <span className="rvGiac rvGiac-arr">+{q.inArrivo} in arrivo</span>}
                                                                {puoCancellare && q.quantita !== 0 && (
                                                                    <button title="Azzera questa giacenza (resta scritto chi e perché)"
                                                                        onClick={(e) => { e.stopPropagation(); setDaCestinare({ titolo: r.descrizione, codice: r.codice, negozio: q.negozio, azienda: q.azienda, quantita: q.quantita }); }}
                                                                        className="rvCestino">🗑</button>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                {Object.keys(r.altrovePer).length > 0 && (
                                                    <div className="rvDett">
                                                        <div className="rvDettT">Dove sta, negli altri negozi</div>
                                                        {/* niente `.rvPill` qui: si accenderebbero al passaggio del
                                                            mouse e sembrerebbero premibili (regola 7) */}
                                                        <div className="rvPillRow">
                                                            {Object.entries(r.altrovePer).sort((a, b) => b[1] - a[1]).map(([neg, n]) => (
                                                                <span key={neg} className="rvTag">
                                                                    {neg} <b className="rvGiac rvGiac-no">{n}</b>
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            );
                        })}
                        {!righe.length && <tr><td colSpan={6} className="rvTab-vuoto">
                            Nessun articolo con questi filtri.
                            {soloDisponibili && " Prova «📚 Anche quello che sta altrove» per vedere quello che sta in un altro negozio."}
                            {!unita.length && !quantita.length && " Il magazzino parte vuoto: il primo carico si fa da 🚚 Trasferimenti → 📥 Carico merce."}
                        </td></tr>}
                    </tbody>
                </table>
            </div>
            )}
            {/* la cronistoria del pezzo, sopra tutto */}
            {seriale && <StoriaPezzo seriale={seriale} chiudi={() => setSeriale(null)} />}
        </div>
    );
}

/* ══ 🕰 LA STORIA DI UN PEZZO ═══════════════════════════════════════════
   Luca 31/08: «devo poter verificare tutta la storia di quel seriale: se è
   stato trasferito da un negozio all'altro, quando è stato comprato, da quale
   utente è stato caricato, chi ha inviato il trasferimento, chi l'ha accettato
   e in quale punto vendita, e se è stato venduto qual è l'utente che ha fatto
   la vendita. Una timeline come quella dentro ai clienti: clicco su ogni step
   e mi dà il dettaglio, ci clicco di nuovo e mi porta al documento.»

   Gli eventi li scrive un TRIGGER sul database, non questo codice: qualunque
   strada tocchi il pezzo lascia la sua traccia, anche quelle che scriveremo
   domani. Qui si legge e si mostra. ══════════════════════════════════════ */
function StoriaPezzo({ seriale, chiudi }: { seriale: string; chiudi: () => void }) {
    const [eventi, setEventi] = useState<EventoPezzo[] | null>(null);
    const [ora, setOra] = useState<Record<string, unknown> | null>(null);
    const [aperto, setAperto] = useState<string | null>(null);

    useEffect(() => {
        let vivo = true;
        setEventi(null); setOra(null);
        Promise.all([storiaCompleta(seriale), pezzoOra(seriale)]).then(([e, o]) => {
            if (!vivo) return;
            setEventi(e); setOra(o as Record<string, unknown> | null);
        });
        return () => { vivo = false; };
    }, [seriale]);

    // ESC chiude, come ogni altro modale del CRM
    useEffect(() => {
        const k = (e: KeyboardEvent) => { if (e.key === "Escape") chiudi(); };
        window.addEventListener("keydown", k);
        return () => window.removeEventListener("keydown", k);
    }, [chiudi]);

    if (typeof document === "undefined") return null;
    const stato = String(ora?.stato || "");

    return createPortal(
        /* IN UN PORTAL (regola 6): un `position:fixed` dentro un elemento con
           backdrop-filter si aggancia a QUELLO, non alla finestra. */
        <div className="rvFattaSfondo" onClick={(e) => { if (e.target === e.currentTarget) chiudi(); }}>
            <div className="rvStoria">
                <div className="rvStoria-t">
                    <div>
                        <div className="rvStoria-tit">{String(ora?.descrizione || "Pezzo")}</div>
                        <div className="rvStoria-sot">
                            <span className="rvDettR-mono">{seriale}</span>
                            {ora?.codice ? <> · cod. {String(ora.codice)}</> : null}
                            {stato ? <> · {STATI_LABEL[stato] || stato}</> : null}
                        </div>
                    </div>
                    <button onClick={chiudi} className="rvPill rvPill-sm">✕ Chiudi</button>
                </div>

                {/* DOV'È ADESSO E QUANTO VALE: la fotografia, prima del racconto */}
                {ora && (
                    <div className="rvBarra rvBarra-c">
                        <span className="rvTag">📍 {String(ora.negozio || "—")}</span>
                        {ora.azienda ? <span className="rvTag">🏢 {String(ora.azienda)}</span> : null}
                        {ora.valore != null && <span className="rvTag">🏷 a listino {eur(Number(ora.valore))}</span>}
                        {ora.prezzo_vendita != null && <span className="rvTag">🧾 venduto a {eur(Number(ora.prezzo_vendita))}</span>}
                    </div>
                )}

                {eventi === null ? (
                    <div className="rvCarico"><Loader2 className="w-5 h-5 animate-spin" /> Cerco la sua storia…</div>
                ) : eventi.length === 0 ? (
                    /* NON SI FINGE UNA STORIA CHE NON C'È (regola 7). Il registro
                       parte dal 31/08: per i pezzi caricati prima c'è la riga di
                       carico ricostruita, e nient'altro. Dirlo è meglio che
                       mostrare un riquadro vuoto che sembra un guasto. */
                    <div className="rvNota rvNota-att">
                        <div className="rvNota-t">Di questo pezzo non risulta nessun passaggio</div>
                        <div className="rvNota-s">Il registro dei movimenti parte dal 31/08/2026. Se il pezzo è entrato prima ed è rimasto fermo, non c&apos;è altro da raccontare.</div>
                    </div>
                ) : (
                    <div className="rvTml">
                        {eventi.map(e => {
                            const nome = NOME_EVENTO[e.evento] || { et: e.evento, ico: "•" };
                            const dettagli = Object.entries(e.dettaglio || {}).filter(([, v]) => v != null && v !== "");
                            const apribile = dettagli.length > 0 || !!e.note;
                            const su = aperto === e.id;
                            return (
                                <div key={e.id} className="rvTml-r">
                                    <div className="rvTml-p">{nome.ico}</div>
                                    <div role={apribile ? "button" : undefined} tabIndex={apribile ? 0 : undefined}
                                        onClick={() => apribile && setAperto(su ? null : e.id)}
                                        onKeyDown={(ev) => { if (apribile && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); setAperto(su ? null : e.id); } }}
                                        className={cn("rvTml-c", apribile && "rvTml-cl")}>
                                        <div className="rvTml-q">{gghh(e.quando)}</div>
                                        <div className="rvTml-e">
                                            {nome.et}
                                            {apribile && <span className="rvTml-fr">{su ? "▴" : "▾"}</span>}
                                        </div>
                                        <div className="rvTml-d">
                                            {e.negozioDa && e.negozio && e.negozioDa !== e.negozio
                                                ? <>{e.negozioDa} → <b>{e.negozio}</b></>
                                                : e.negozio || "—"}
                                            {e.operatore ? <> · {e.operatore}</> : null}
                                        </div>
                                        {su && (
                                            <div className="rvTml-x">
                                                {dettagli.map(([k, v]) => (
                                                    <div key={k} className="rvDettR">
                                                        <span className="rvTab-min">{k}</span>
                                                        <span className="rvDove-fine">{String(v)}</span>
                                                    </div>
                                                ))}
                                                {e.note && <div className="rvTab-min">{e.note}</div>}
                                                {/* IL SECONDO CLIC PORTA AL DOCUMENTO (Luca 31/08) */}
                                                {e.vaiA && (
                                                    <a href={e.vaiA} className="rvPill rvPill-sm rvTml-doc mt-2"
                                                        onClick={(ev) => ev.stopPropagation()}>
                                                        {e.documento === "ddt" ? "🚚 Apri il documento di trasporto" : "🧾 Apri la vendita"}
                                                    </a>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>, document.body);
}

/* ── 🚚 TRASFERIMENTI ──────────────────────────────────────────────────────
   IL RAGIONAMENTO STA IN  src/lib/trasferimenti.ts : lì sono elencate le
   dodici situazioni in cui della merce si muove fra punti vendita e cosa deve
   succedere in ognuna. Qui c'è la schermata che le racconta e le filtra.

   Luca 31/08: «Nel magazzino non mi interessa nemmeno vedere i prodotti in
   transito: se vado sui trasferimenti, lì dobbiamo approfondire i dettagli.»
   Quindi la sezione ha DUE viste sugli stessi filtri:
     · 📄 Documenti  — i DDT, con lo stato e le azioni
     · 📦 Merce mossa — UNA RIGA PER PEZZO, che è lo «storico dei prodotti che
       sono stati trasferiti» che oggi non esiste: `mag_unita.ddt_id` viene
       azzerato all'accettazione, quindi dalla riga del pezzo la prova sparisce
       nel momento esatto in cui il trasferimento riesce. Le righe del
       documento no: restano, e portano il negozio di partenza.
   Regole di stile: docs/REGOLE_REGISTRA_VENDITA.md. */

/** Una riga con dentro anche il suo documento: serve alla vista «merce» e
 *  all'export, dove ogni riga si legge da sola. */
type RigaWithDdt = RigaDdt & { ddt: Ddt };

/* ── LE OPERAZIONI ─────────────────────────────────────────────────────────
   Stanno fuori dai componenti perché le usano in due: il form quando spedisce
   (e per i gemelli accetta subito) e la tabella quando si prende in carico.
   La giacenza non si scrive MAI a mano (regola §8): si scrive un movimento e
   il saldo si muove da sé. */

const oraIso = () => new Date().toISOString();

/** Aggiunge una tappa alla `storia` del pezzo. È un di più — la storia vera la
 *  scrive il trigger su `mag_eventi` — ma la Ricerca seriale la legge ancora. */
const conTappa = (storia: Unita["storia"] | undefined, evento: string, negozio: string, operatore: string, note: string) =>
    [...(storia || []), { quando: oraIso(), evento, negozio, operatore, note }];

/** LA STORIA COM'È ADESSO, non com'era quando si è aperta la pagina.
 *  `storia` è un campo jsonb che si riscrive INTERO: partire da una copia
 *  vecchia vuol dire cancellare le tappe scritte nel frattempo. Il caso che
 *  lo rendeva certo sono i gemelli, dove partenza e accettazione avvengono
 *  nello stesso clic: la seconda scriveva sopra la prima e il «partito con un
 *  DDT» spariva. Una query sola per tutti i pezzi coinvolti. */
async function storieCorrenti(ids: string[]): Promise<Map<string, Unita["storia"]>> {
    const puliti = ids.filter(Boolean);
    if (!puliti.length) return new Map();
    const { data } = await supabase.from("mag_unita").select("id,storia").in("id", puliti);
    return new Map(((data ?? []) as { id: string; storia: Unita["storia"] }[]).map(r => [r.id, r.storia || []]));
}

/** Il pezzo non è più in viaggio: perché? Non si tira a indovinare, si guarda
 *  (regola §7: quando un numero non si sa, si dice perché). */
async function perchePersa(unitaId: string): Promise<string> {
    const { data } = await supabase.from("mag_unita").select("stato").eq("id", unitaId).maybeSingle();
    const s = (data as { stato?: string } | null)?.stato;
    if (s === "venduto") return "venduta_in_viaggio";
    if (s === "annullato") return "annullata_in_viaggio";
    return "mancante";
}

/** PRENDERE IN CARICO. `quante[riga]` dice quanti pezzi sono arrivati davvero:
 *  è qui che vive «ne sono arrivati 5 su 6». */
async function prendiInCarico(
    d: Ddt, righe: RigaDdt[], quante: Record<string, number>, motivo: string, utente: string,
): Promise<{ esiti: Record<string, string>; avvisi: string[] }> {
    const esiti: Record<string, string> = {};
    const avvisi: string[] = [];
    const mov: Record<string, unknown>[] = [];
    let presi: string[] = [];        // le righe che ho DAVVERO preso io
    const vive = righe.filter(x => x.stato === "in_viaggio");
    const storie = await storieCorrenti(vive.map(r => r.unita_id || ""));
    const quando = oraIso();

    /* IL DOCUMENTO SENZA RIGHE NON SI ACCETTA. `[].every(...)` è `true`: un
       documento a cui le righe non sono state lette — o non sono mai state
       scritte — si chiudeva «accettato» senza aver mosso un pezzo. */
    if (!vive.length) return { esiti, avvisi: ["Questo documento non ha righe in viaggio: non l'ho chiuso. Se le righe dovrebbero esserci, ricarica la pagina."] };

    for (const r of vive) {
        const chiesti = pezziDi(r);
        const n = Math.max(0, Math.min(chiesti, Number(quante[r.id] ?? chiesti)));
        let stato = n >= chiesti ? "accettata" : "mancante";

        /* ── PRIMA SI PRENDE LA RIGA, POI SI MUOVE LA MERCE ───────────────
           `.eq("stato","in_viaggio")` non è una precauzione teorica: quindici
           punti vendita guardano la stessa lista, e chi ha la scheda aperta da
           cinque minuti vede ancora «Accetta» su un documento che un altro ha
           già preso in carico. Senza questa condizione il secondo clic scriveva
           un SECONDO `trasferimento_in`: −n al mittente una volta, +n al
           destinatario due. La merce a quantità — l'84% del magazzino — era
           l'unica strada senza guardia; i pezzi con seriale ce l'avevano già
           sulla loro riga (`.eq("stato","in_transito")`).
           Chi non prende la riga non tocca niente. */
        const { data: presa } = await supabase.from("mag_ddt_righe").update({
            stato, quantita_accettata: n,
            motivo: n < chiesti && motivo.trim() ? motivo.trim() : null,
            chiusa_il: quando, chiusa_da: utente,
        }).eq("id", r.id).eq("stato", "in_viaggio").select("id");
        if (!presa?.length) {
            avvisi.push(`${r.descrizione}: l'aveva già presa in carico qualcun altro`);
            continue;
        }
        presi.push(r.id);

        if (r.unita_id) {
            if (n > 0) {
                /* SOLO I PEZZI CHE STANNO DAVVERO VIAGGIANDO: un pezzo venduto o
                   cestinato mentre era in viaggio tornerebbe vendibile appena
                   qualcuno preme «accetta».
                   E la SOCIETÀ segue la merce (regola §8a): se il documento è una
                   cessione, all'arrivo il pezzo è dell'altra società — se no lo
                   scontrino uscirebbe dalla cassa sbagliata. La si scrive solo se
                   si sa: metterla a NULL vorrebbe dire togliere al pezzo il suo
                   proprietario. */
                const nuovaSoc = d.azienda_a || r.azienda_a;
                const { data } = await supabase.from("mag_unita").update({
                    stato: "disponibile", ddt_id: null,
                    ...(nuovaSoc ? { azienda: nuovaSoc } : {}),
                    storia: conTappa(storie.get(r.unita_id), "📦 Arrivato e accettato", r.negozio_a, utente, `DDT n.${d.numero} da ${r.negozio_da}`),
                }).eq("id", r.unita_id).eq("stato", "in_transito").select("id");
                if (!data?.length) {
                    // non era più in viaggio: la riga è mia, la correggo
                    stato = await perchePersa(r.unita_id);
                    await supabase.from("mag_ddt_righe").update({ stato, quantita_accettata: 0 }).eq("id", r.id);
                    avvisi.push(`${r.descrizione} (${r.seriale}): ${STATI_RIGA[stato]?.et.toLowerCase() || stato}`);
                }
            }
        } else if (n > 0 && r.codice) {
            mov.push({
                codice: r.codice, negozio: r.negozio_a, azienda: d.azienda_a || r.azienda_a || d.azienda_da,
                tipo: "trasferimento_in", quantita: n, ddt_id: d.id, operatore: utente,
                nota: `arrivato con DDT n.${d.numero} da ${r.negozio_da}`,
            });
        }
        esiti[r.id] = stato;
    }

    if (mov.length) {
        const { error } = await supabase.from("mag_movimenti").insert(mov);
        if (error) {
            /* IL MOVIMENTO NON È PASSATO: le righe tornano in viaggio, se no il
               documento direbbe «arrivato» su merce che non è entrata da
               nessuna parte e non si potrebbe più riprovare. */
            await supabase.from("mag_ddt_righe").update({ stato: "in_viaggio", quantita_accettata: null, chiusa_il: null, chiusa_da: null })
                .in("id", presi).is("unita_id", null);
            avvisi.push(`le quantità non sono entrate a magazzino (${error.message}): quelle righe sono tornate «in viaggio», riprova`);
            /* E VANNO TOLTE ANCHE DA `presi` (revisore 31/08). Qui il filtro
               veniva calcolato e BUTTATO VIA: si svuotava `esiti` ma `presi`
               restava pieno, quindi il documento si chiudeva lo stesso come
               «parziale» mentre le sue righe erano tornate «in viaggio». Da
               quel momento non c'era più nessun bottone che le recuperasse —
               «accetta» e «annulla» vogliono un documento in transito — e la
               merce restava fuori da ogni negozio: uscita dal mittente, mai
               entrata dal destinatario. Misurato: 6 kit SIM in nessun luogo. */
            const aQuantita = presi.filter(id => !righe.find(r => r.id === id)?.unita_id);
            aQuantita.forEach(id => { delete esiti[id]; });
            presi = presi.filter(id => !aQuantita.includes(id));
        }
    }

    if (!presi.length) return { esiti, avvisi: [...avvisi, "Non ho preso in carico niente: il documento resta com'era."] };

    const finali = righe.map(r => esiti[r.id] || r.stato);
    const tutto = finali.every(s => ["accettata", "venduta_in_viaggio"].includes(s));
    /* e anche il DOCUMENTO si chiude una volta sola */
    await supabase.from("mag_ddt").update({
        stato: tutto ? "accettato" : "parziale",
        accettato_da: utente, accettato_il: quando, chiuso_da: utente, chiuso_il: quando,
        // il perché lo scrive l'operatore: qui non si inventa (regola §7)
        motivo: tutto ? null : (motivo.trim() || null),
        // una cessione fra società resta in elenco finché non c'è la fattura
        ...(eCessione(d) && !d.fattura_stato ? { fattura_stato: "da_emettere" } : {}),
    }).eq("id", d.id).eq("stato", "in_transito");
    return { esiti, avvisi };
}

/** RIMANDARE INDIETRO tutto quello che sta ancora viaggiando: è il corpo sia
 *  dell'annullamento (lo fa il mittente, prima che arrivi) sia del rifiuto in
 *  blocco (lo fa chi riceve). Il DOCUMENTO NON SI CANCELLA: resta col suo
 *  numero, marcato — un progressivo con i buchi non è un progressivo. */
async function rimandaIndietro(
    d: Ddt, righe: RigaDdt[], esito: "annullato" | "rifiutato", motivo: string, utente: string,
): Promise<string[]> {
    const avvisi: string[] = [];
    const mov: Record<string, unknown>[] = [];
    const presi: string[] = [];
    const vive = righe.filter(x => x.stato === "in_viaggio");
    const storie = await storieCorrenti(vive.map(r => r.unita_id || ""));
    const quando = oraIso();
    const et = esito === "annullato" ? "annullato dal mittente" : "respinto";

    for (const r of vive) {
        /* «respinta» e «tornata indietro» non sono la stessa cosa: la prima
           dice che chi riceveva l'ha rifiutata, la seconda che il mittente ha
           revocato. In tutti e due i casi la riga è CHIUSA — la merce è
           rientrata — e non finisce fra le differenze da decidere. */
        let stato = esito === "rifiutato" ? "rifiutata" : "rientrata";
        // prima si PRENDE la riga: se l'ha già chiusa un altro, non si rientra
        // due volte la stessa merce (la stessa trappola dell'accettazione)
        const { data: presa } = await supabase.from("mag_ddt_righe").update({
            stato, motivo: motivo.trim() || et, chiusa_il: quando, chiusa_da: utente,
        }).eq("id", r.id).eq("stato", "in_viaggio").select("id");
        if (!presa?.length) { avvisi.push(`${r.descrizione}: qualcun altro l'aveva già chiusa`); continue; }
        presi.push(r.id);

        if (r.unita_id) {
            const { data } = await supabase.from("mag_unita").update({
                stato: "disponibile", negozio: r.negozio_da, ddt_id: null,
                ...(r.azienda_da ? { azienda: r.azienda_da } : {}),
                storia: conTappa(storie.get(r.unita_id), "↩️ Tornato al mittente", r.negozio_da, utente, `DDT n.${d.numero} ${et}`),
            }).eq("id", r.unita_id).eq("stato", "in_transito").select("id");
            if (!data?.length) {
                stato = await perchePersa(r.unita_id);
                await supabase.from("mag_ddt_righe").update({ stato }).eq("id", r.id);
                avvisi.push(`${r.descrizione} (${r.seriale}): ${STATI_RIGA[stato]?.et.toLowerCase() || stato} — non è tornato indietro`);
            }
        } else if (r.codice) {
            mov.push({
                codice: r.codice, negozio: r.negozio_da, azienda: r.azienda_da || d.azienda_da,
                tipo: "trasferimento_in", quantita: r.quantita, ddt_id: d.id, operatore: utente,
                nota: `rientrato: DDT n.${d.numero} ${et}`,
            });
        }
    }

    let quantitaOk = true;
    if (mov.length) {
        const { error } = await supabase.from("mag_movimenti").insert(mov);
        if (error) {
            quantitaOk = false;
            await supabase.from("mag_ddt_righe").update({ stato: "in_viaggio", chiusa_il: null, chiusa_da: null })
                .in("id", presi).is("unita_id", null);
            avvisi.push(`le quantità non sono rientrate a magazzino (${error.message}): quelle righe sono tornate «in viaggio», riprova`);
        }
    }
    /* IL DOCUMENTO SI CHIUDE SOLO SE LA MERCE È TORNATA DAVVERO (revisore
       31/08). Prima si chiudeva comunque: le righe tornavano «in viaggio» ma
       il documento risultava annullato, e da lì non c'era più nessun bottone
       che le riprendesse — «accetta» e «annulla» vogliono un documento in
       transito. La merce restava fuori da ogni negozio. Ora, se le quantità
       non sono rientrate, il documento resta in viaggio e si riprova. */
    if (quantitaOk) {
        await supabase.from("mag_ddt").update({
            stato: esito, motivo: motivo.trim() || et, chiuso_da: utente, chiuso_il: quando,
        }).eq("id", d.id).eq("stato", "in_transito");
    } else {
        avvisi.push(`il documento n.${d.numero} resta IN VIAGGIO: riprova quando il magazzino accetta il rientro`);
    }
    return avvisi;
}

/** CHIUDERE UNA DIFFERENZA. La merce che non è arrivata non si riassorbe di
 *  nascosto: qualcuno deve dire se è tornata al mittente o se è persa. */
async function chiudiDifferenza(
    d: Ddt, r: RigaDdt, come: "rientrata" | "ammanco", motivo: string, utente: string,
): Promise<string[]> {
    const avvisi: string[] = [];
    const quando = oraIso();
    const restano = pezziDi(r) - Number(r.quantita_accettata || 0);
    const storia = (await storieCorrenti([r.unita_id || ""])).get(r.unita_id || "");

    /* ANCHE QUI SI PRENDE PRIMA LA RIGA: il bottone «Chiudi la differenza» sta
       su una lista caricata all'apertura della pagina, e due amministrativi
       che premono «è tornata al mittente» scriverebbero due rientri della
       stessa merce. */
    const { data: presa } = await supabase.from("mag_ddt_righe").update({
        stato: come, motivo: motivo.trim() || null, chiusa_il: quando, chiusa_da: utente,
    }).eq("id", r.id).eq("stato", r.stato).select("id");
    if (!presa?.length) return ["Questa differenza l'aveva già chiusa qualcun altro: ricarica la pagina."];

    if (r.unita_id) {
        const patch = come === "rientrata"
            ? { stato: "disponibile", negozio: r.negozio_da, ddt_id: null,
                ...(r.azienda_da ? { azienda: r.azienda_da } : {}),
                storia: conTappa(storia, "↩️ Tornato al mittente", r.negozio_da, utente, `differenza del DDT n.${d.numero}`) }
            : { stato: "annullato", ddt_id: null,
                storia: conTappa(storia, "🗑 Ammanco", r.negozio_a, utente, `mai arrivato col DDT n.${d.numero}${motivo.trim() ? ": " + motivo.trim() : ""}`) };
        const { data } = await supabase.from("mag_unita").update(patch).eq("id", r.unita_id).eq("stato", "in_transito").select("id");
        if (!data?.length) avvisi.push(`${r.descrizione}: il pezzo non risulta più in viaggio, la riga è stata comunque chiusa`);
    } else if (come === "rientrata" && r.codice && restano > 0) {
        const { error } = await supabase.from("mag_movimenti").insert({
            codice: r.codice, negozio: r.negozio_da, azienda: r.azienda_da || d.azienda_da,
            tipo: "trasferimento_in", quantita: restano, ddt_id: d.id, operatore: utente,
            nota: `rientro della differenza del DDT n.${d.numero}`,
        });
        if (error) {
            await supabase.from("mag_ddt_righe").update({ stato: r.stato, chiusa_il: null, chiusa_da: null }).eq("id", r.id);
            avvisi.push(`il rientro non è stato scritto (${error.message}): la differenza è rimasta aperta, riprova`);
        }
    }
    /* AMMANCO A QUANTITÀ: non serve nessun movimento. Il `trasferimento_out`
       della partenza ha già tolto quei pezzi al mittente e nessuno li ha mai
       caricati altrove — la perdita è già dentro i conti. Scriverne un altro
       la conterebbe due volte. */
    return avvisi;
}

function Trasferimenti({ unita, quantita, negozi, aziende, nomiAzienda, anagrafica, mioNegozio, gestisce, puoCaricare, utente, ricarica, cercaIniziale }: {
    unita: Unita[]; quantita: RigaQta[]; negozi: string[]; aziende: string[];
    nomiAzienda: Record<string, string>; anagrafica: Map<string, DatiArticolo>;
    mioNegozio: string; gestisce: boolean; puoCaricare: boolean; utente: string; ricarica: () => void;
    /** il documento su cui atterrare, quando ci si arriva dalla storia di un pezzo */
    cercaIniziale?: string;
}) {
    const [ddt, setDdt] = useState<Ddt[]>([]);
    const [righe, setRighe] = useState<RigaDdt[]>([]);
    /* La tabella delle righe arriva con la migrazione 20260831180000, che Luca
       applica a mano. Finché non c'è, la sezione non deve rompersi: si accorge
       da sé e lo dice, invece di mostrare una schermata di errore. */
    const [righeVive, setRigheVive] = useState<boolean | null>(null);
    const [socDati, setSocDati] = useState<Record<string, AziendaDdt>>({});
    const [negDati, setNegDati] = useState<Record<string, NegozioDdt>>({});
    const [casse, setCasse] = useState<{ negozio: string; azienda: string; is_default: boolean | null }[]>([]);
    /* CHI PORTA LA MERCE (Luca 31/08). Sta in tabella, non nel codice: un
       corriere è un fornitore. Se non c'è, il documento lascia il riquadro
       vuoto — che è la verità, non un dato inventato. */
    const [vettore, setVettore] = useState<VettoreDdt | null>(null);
    const [carico, setCarico] = useState(true);

    const caricaTutto = useCallback(async () => {
        setCarico(true);
        const [d, a, s, p, v] = await Promise.all([
            supabase.from("mag_ddt").select("*").order("creato_il", { ascending: false }).limit(500),
            supabase.from("aziende").select("codice,ragione_sociale,logo_url,piva,codice_fiscale,sede,cap,citta,provincia,rea,telefono,email"),
            supabase.from("stores").select("name,address,civico,cap,citta,provincia,azienda,is_ufficio").order("name"),
            supabase.from("pos_rt").select("negozio,azienda,is_default"),
            supabase.from("vettori").select("ragione_sociale,piva,codice_fiscale,sede,cap,citta,provincia")
                .eq("predefinito", true).eq("attivo", true).maybeSingle(),
        ]);
        setVettore((v.data as VettoreDdt) ?? null);
        setDdt((d.data ?? []) as Ddt[]);
        const az: Record<string, AziendaDdt> = {};
        ((a.data ?? []) as AziendaDdt[]).forEach(x => { az[x.codice] = x; });
        setSocDati(az);
        const ng: Record<string, NegozioDdt> = {};
        ((s.data ?? []) as (NegozioDdt & { is_ufficio?: boolean | null })[]).forEach(x => { ng[x.name] = x; });
        setNegDati(ng);
        setCasse((p.data ?? []) as { negozio: string; azienda: string; is_default: boolean | null }[]);

        /* PAGINATE. Con `.limit(5000)` i documenti più vecchi perdevano le
           righe in silenzio, e la schermata diceva «questo documento non ha
           righe» — che è una spiegazione falsa (regola §7). `caricaTutte` è lo
           stesso paginatore che usa la scheda Giacenze. */
        const r = await caricaTutte<RigaDdt>((from, to) =>
            supabase.from("mag_ddt_righe").select("*").order("creato_il", { ascending: false }).range(from, to) as never);
        if (r.error) { setRigheVive(false); setRighe([]); }
        else { setRigheVive(true); setRighe((r.data ?? []) as RigaDdt[]); }
        setCarico(false);
    }, []);
    useEffect(() => { caricaTutto(); }, [caricaTutto]);

    /* I MIEI NEGOZI. I gemelli contano come uno: chi sta a Magliana W3 riceve
       anche quello che arriva al Multi — è lo stesso bancone. */
    const miei = useMemo(() => splitNegozi(mioNegozio).filter(Boolean), [mioNegozio]);
    const mio = useCallback((n: string) => miei.some(m => stessoMagazzino(n, m)), [miei]);

    /* UNA MAPPA, non un filtro per documento. `conteggi` chiama `righeDi` sette
       volte per ogni documento: con 500 documenti e 5.000 righe erano ~3.500
       scansioni complete a ogni tasto premuto nel campo «Cerca». */
    const righePer = useMemo(() => {
        const m = new Map<string, RigaDdt[]>();
        righe.forEach(r => { const l = m.get(r.ddt_id); if (l) l.push(r); else m.set(r.ddt_id, [r]); });
        m.forEach(l => l.sort((a, b) => a.riga - b.riga));
        return m;
    }, [righe]);
    const VUOTE: RigaDdt[] = useMemo(() => [], []);
    const righeDi = useCallback((id: string) => righePer.get(id) ?? VUOTE, [righePer, VUOTE]);

    /* ── I FILTRI ───────────────────────────────────────────────────────── */
    const [situazione, setSituazione] = useState<Situazione>("tutti");
    const [cerca, setCerca] = useState(cercaIniziale || "");
    const [daNeg, setDaNeg] = useState<string[]>([]);
    const [aNeg, setANeg] = useState<string[]>([]);
    const [stati, setStati] = useState<string[]>([]);
    const [tipi, setTipi] = useState<string[]>([]);
    const [soc, setSoc] = useState<string[]>([]);
    const [persone, setPersone] = useState<string[]>([]);
    const [periodo, setPeriodo] = useState<Periodo>("sempre");
    const [dal, setDal] = useState(""); const [al, setAl] = useState("");
    const [vista, setVista] = useState<"documenti" | "merce">("documenti");
    const [apriNuovo, setApriNuovo] = useState(false);
    const [apriCarico, setApriCarico] = useState(false);
    const [apertoId, setApertoId] = useState<string | null>(null);

    const azzera = () => {
        setSituazione("tutti"); setCerca(""); setDaNeg([]); setANeg([]); setStati([]);
        setTipi([]); setSoc([]); setPersone([]); setPeriodo("sempre"); setDal(""); setAl("");
    };
    const filtriAccesi = !!(cerca.trim() || daNeg.length || aNeg.length || stati.length || tipi.length
        || soc.length || persone.length || periodo !== "sempre" || dal || al || situazione !== "tutti");

    // le etichette sono quello che si legge nelle tendine; qui si torna alle chiavi
    const chiaviStato = useMemo(() => Object.fromEntries(Object.entries(STATI_DDT).map(([k, v]) => [v.et, k])), []);
    const chiaviTipo = useMemo(() => Object.fromEntries(Object.entries(TIPI_DDT).map(([k, v]) => [v.et, k])), []);
    const chiaviSoc = useMemo(() => Object.fromEntries(aziende.map(c => [nomiAzienda[c] || c, c])), [aziende, nomiAzienda]);

    const gente = useMemo(() => Array.from(new Set(ddt.flatMap(d =>
        [d.creato_da, d.accettato_da, d.chiuso_da].filter(Boolean) as string[]))).sort(), [ddt]);

    /** Il testo cercato tocca il documento o una delle sue righe? Chi sta al
     *  banco cerca l'IMEI del telefono che aspetta, non il numero del DDT. */
    const ddtPerTesto = useMemo(() => {
        const q = cerca.trim().toLowerCase();
        if (!q) return null;
        const s = new Set<string>();
        righe.forEach(r => {
            if (`${r.descrizione} ${r.seriale || ""} ${r.codice || ""}`.toLowerCase().includes(q)) s.add(r.ddt_id);
        });
        return s;
    }, [cerca, righe]);

    const passaFiltri = useCallback((d: Ddt) => {
        const q = cerca.trim().toLowerCase();
        if (q) {
            const suo = `n.${d.numero} ${d.da_negozio} ${d.a_negozio} ${d.creato_da || ""} ${d.accettato_da || ""} ${d.note || ""} ${d.destinatario || ""}`.toLowerCase();
            if (!suo.includes(q) && !ddtPerTesto?.has(d.id)) return false;
        }
        if (daNeg.length && !daNeg.some(n => stessoMagazzino(d.da_negozio, n))) return false;
        if (aNeg.length && !aNeg.some(n => stessoMagazzino(d.a_negozio, n))) return false;
        if (stati.length && !stati.map(e => chiaviStato[e]).includes(d.stato)) return false;
        if (tipi.length && !tipi.map(e => chiaviTipo[e]).includes(d.tipo || "trasferimento")) return false;
        if (soc.length) {
            const c = soc.map(e => chiaviSoc[e]);
            if (!c.includes(d.azienda_da || "") && !c.includes(d.azienda_a || "")) return false;
        }
        if (persone.length && ![d.creato_da, d.accettato_da, d.chiuso_da].some(p => p && persone.includes(p))) return false;
        const est = estremi(periodo);
        const da = dal ? new Date(dal + "T00:00:00").toISOString() : est.da;
        const a = al ? new Date(al + "T23:59:59").toISOString() : est.a;
        if (da && d.creato_il < da) return false;
        if (a && d.creato_il > a) return false;
        return true;
    }, [cerca, ddtPerTesto, daNeg, aNeg, stati, tipi, soc, persone, periodo, dal, al, chiaviStato, chiaviTipo, chiaviSoc]);

    /* I contatori delle situazioni si contano sul FILTRATO, non sul totale:
       se guardi «questo mese», «in ritardo» deve dire quanti sono in ritardo
       questo mese — se no il numero della pastiglia e quello che vedi dopo
       averla premuta non coincidono. */
    const filtrati = useMemo(() => ddt.filter(passaFiltri), [ddt, passaFiltri]);
    const conteggi = useMemo(() => {
        const ora = Date.now();
        const out = {} as Record<Situazione, number>;
        SITUAZIONI.forEach(s => { out[s.id] = filtrati.filter(d => nellaSituazione(s.id, d, righeDi(d.id), miei, ora)).length; });
        return out;
    }, [filtrati, righeDi, miei]);

    const visibili = useMemo(() => {
        const ora = Date.now();
        return filtrati.filter(d => nellaSituazione(situazione, d, righeDi(d.id), miei, ora));
    }, [filtrati, situazione, righeDi, miei]);

    const merce: RigaWithDdt[] = useMemo(() => {
        const q = cerca.trim().toLowerCase();
        const per = new Map(visibili.map(d => [d.id, d]));
        return righe
            .filter(r => per.has(r.ddt_id))
            .filter(r => !q || `${r.descrizione} ${r.seriale || ""} ${r.codice || ""}`.toLowerCase().includes(q)
                || `n.${per.get(r.ddt_id)!.numero} ${r.negozio_da} ${r.negozio_a}`.toLowerCase().includes(q))
            .map(r => ({ ...r, ddt: per.get(r.ddt_id)! }))
            .sort((a, b) => b.creato_il.localeCompare(a.creato_il));
    }, [righe, visibili, cerca]);

    /* ── COSA MANCA PERCHÉ UN DDT SIA VALIDO ────────────────────────────── */
    const manca = useMemo(() => cosaMancaPerEmettere(
        Object.values(socDati),
        Object.values(negDati).filter(n => negozi.includes(n.name)) as { name: string; address: string | null; civico: string | null; cap: string | null; citta: string | null }[],
    ), [socDati, negDati, negozi]);

    /* ── CHI PUÒ FARE COSA ───────────────────────────────────────────────
       Chi non può, non vede il bottone: una cosa che non si può fare non si
       finge cliccabile (regola §7). */
    const puoAccettare = (d: Ddt) => gestisce && d.stato === "in_transito" && (puoCaricare || mio(d.a_negozio));
    const puoAnnullare = (d: Ddt) => gestisce && d.stato === "in_transito" && (puoCaricare || mio(d.da_negozio));

    /* ── LE AZIONI A SCHERMO ─────────────────────────────────────────────── */
    type Azione = { d: Ddt; modo: "accetta" | "rifiuta" | "annulla" | "fattura" | "differenza"; riga?: RigaDdt };
    const [azione, setAzione] = useState<Azione | null>(null);
    const [quante, setQuante] = useState<Record<string, number>>({});
    const [motivo, setMotivo] = useState("");
    const [rifRiga, setRifRiga] = useState("");
    const [comeChiudo, setComeChiudo] = useState<"rientrata" | "ammanco">("rientrata");
    const [inCorso, setInCorso] = useState(false);

    /* IL BOTTONE NON PROMETTE PIÙ DI QUELLO CHE FA (regola §7). Prendere in
       carico CON differenze non è una presa in carico pulita: il verde
       direbbe «è andato tutto bene» mentre si sta scrivendo che manca
       qualcosa. Ambra, e la riga sopra dice quanti pezzi ballano. */
    const differenzeInCorso = useMemo(() => {
        if (azione?.modo !== "accetta") return false;
        return righeDi(azione.d.id).filter(r => r.stato === "in_viaggio")
            .some(r => Math.max(0, Math.min(pezziDi(r), Number(quante[r.id] ?? pezziDi(r)))) < pezziDi(r));
    }, [azione, quante, righeDi]);

    const apriAzione = (d: Ddt, modo: Azione["modo"], riga?: RigaDdt) => {
        setMotivo(""); setRifRiga(d.fattura_rif || ""); setComeChiudo("rientrata");
        const q: Record<string, number> = {};
        righeDi(d.id).forEach(r => { if (r.stato === "in_viaggio") q[r.id] = pezziDi(r); });
        setQuante(q);
        setAzione({ d, modo, riga });
    };

    const conferma = async () => {
        if (!azione || inCorso) return;
        setInCorso(true);
        try {
            const { d, modo, riga } = azione;
            const rs = righeDi(d.id);
            let avvisi: string[] = [];
            if (modo === "accetta") ({ avvisi } = await prendiInCarico(d, rs, quante, motivo, utente));
            else if (modo === "rifiuta") avvisi = await rimandaIndietro(d, rs, "rifiutato", motivo, utente);
            else if (modo === "annulla") avvisi = await rimandaIndietro(d, rs, "annullato", motivo, utente);
            else if (modo === "differenza" && riga) avvisi = await chiudiDifferenza(d, riga, comeChiudo, motivo, utente);
            else if (modo === "fattura") {
                await supabase.from("mag_ddt").update({
                    fattura_stato: rifRiga.trim() ? "emessa" : "non_dovuta",
                    fattura_rif: rifRiga.trim() || null,
                    /* LA DATA LOCALE, non quella UTC: `toISOString()` a Roma dopo
                       le 22 restituisce già il giorno dopo, e su un riferimento
                       di fattura la data sbagliata è la data sbagliata. */
                    fattura_il: rifRiga.trim() ? new Date().toLocaleDateString("sv-SE") : null,
                }).eq("id", d.id);
            }
            setAzione(null);
            if (avvisi.length) alert("Fatto, ma c'è da sapere:\n\n· " + avvisi.join("\n· "));
            await caricaTutto(); ricarica();
        } catch (e) {
            alert("Non è andata: " + ((e as Error)?.message || "errore"));
        } finally { setInCorso(false); }
    };

    /* ── LA STAMPA DEL DOCUMENTO ─────────────────────────────────────────
       `ddtHtml` esisteva ma non era attaccata a nessun pulsante: il DDT che
       usciva era la tabellina scritta a mano dentro questa pagina, senza
       partita IVA, senza indirizzi, senza le tre copie. */
    /* I DATI DI UN DOCUMENTO PER LA STAMPA, in una funzione sola: li usano il
       pulsante «DDT» di una riga e l'archivio del periodo. Prima stavano dentro
       `stampa`, e l'archivio avrebbe dovuto rifarli — due copie della stessa
       regola, che divergono al primo ritocco (il reso a fornitore ne è pieno). */
    const perStampa = (d: Ddt) => {
        const rs = righeDi(d.id);
        const dati: DatiDdt = {
            numero: d.numero, anno: d.anno ?? new Date(d.creato_il).getFullYear(), creato_il: d.creato_il,
            da_negozio: d.da_negozio, a_negozio: d.a_negozio,
            azienda_da: d.azienda_da || "", azienda_a: d.azienda_a || "",
            causale: d.causale || "Trasferimento tra sedi", aspetto: d.aspetto || "A vista",
            trasporto: d.trasporto || "A cura del mittente",
            colli: d.colli, inizio_trasporto: d.inizio_trasporto,
            creato_da: d.creato_da, note: d.note,
        };
        /* IL RESO A FORNITORE. Il generatore prende il destinatario da
           `aziende[azienda_a]` e il luogo di consegna da `negozi[a_negozio]`:
           per un reso quella società è la NOSTRA e quel negozio non esiste,
           quindi il documento usciva con «Spett.le Telefutura» e «manca
           l'indirizzo» (revisore 31/08). Qui il fornitore entra da quelle due
           porte, coi dati che l'operatore ha compilato al momento dell'invio —
           senza toccare il generatore, che è di un altro cantiere. */
        const esterno = !!d.destinatario;
        if (esterno) dati.azienda_a = "__fornitore";
        const azStampa: Record<string, AziendaDdt> = esterno ? {
            ...socDati,
            __fornitore: {
                codice: "__fornitore", ragione_sociale: d.destinatario || "", logo_url: null,
                piva: d.destinatario_piva, codice_fiscale: d.destinatario_piva,
                sede: [d.destinatario_indirizzo, d.destinatario_civico].filter(Boolean).join(", ") || null,
                cap: d.destinatario_cap, citta: d.destinatario_citta, provincia: d.destinatario_provincia,
                rea: null, telefono: null, email: null,
            },
        } : socDati;
        const negStampa: Record<string, NegozioDdt> = esterno ? {
            ...negDati,
            [d.a_negozio]: {
                name: d.a_negozio, address: d.destinatario_indirizzo, civico: d.destinatario_civico,
                cap: d.destinatario_cap, citta: d.destinatario_citta, provincia: d.destinatario_provincia,
            },
        } : negDati;
        /* SUL DOCUMENTO CI VA SOLO LA MERCE CHE VIAGGIA (revisore 31/08).
           Qui finivano TUTTE le righe: se fra la spunta e il clic un telefono
           veniva venduto al banco, il codice se ne accorgeva e lo segnava «mai
           partita» — ma il DDT stampato elencava lo stesso tre IMEI e scriveva
           «Totale beni 3» mentre nel pacco ce n'erano due. Un documento di
           trasporto che descrive merce che non viaggia è un documento falso. */
        const stampabili: RigaStampa[] = rs
            .filter(r => !["mai_partita", "annullata_in_viaggio"].includes(r.stato))
            .map(r => ({
                codice: r.codice, descrizione: r.descrizione, seriale: r.seriale, quantita: pezziDi(r),
            }));
        return { d: dati, righe: stampabili, az: azStampa, neg: negStampa, vettore };
    };

    /** Apre una finestra col documento e chiede la stampa. */
    const apriPerStampa = (html: string) => {
        const w = window.open("", "_blank");
        if (!w) { alert("Il browser ha bloccato la finestra della stampa: sbloccala e riprova."); return; }
        // il generatore fa il documento, non chiede la stampa: la finestra di
        // stampa è quello che si aspetta chi preme «DDT», e le copie sono tre
        const chiedi = "<" + "script>window.addEventListener('load',function(){window.print()})<" + "/script>";
        w.document.write(html.replace("</body>", chiedi + "</body>"));
        w.document.close();
    };

    const stampa = (d: Ddt) => {
        const x = perStampa(d);
        apriPerStampa(ddtHtml(x.d, x.righe, x.az, x.neg, x.vettore));
    };

    /* ARCHIVIO DEI DOCUMENTI DEL PERIODO (Luca 31/08): «tutto lo storico delle
       DDT, dove possiamo anche fare un export complessivo dei PDF
       mensilmente». Prende i documenti che stanno a schermo — cioè quelli che
       i filtri hanno selezionato, periodo compreso — e ne fa UN file, ognuno a
       pagina nuova. Dal più vecchio al più recente: un archivio si legge
       nell'ordine in cui le cose sono successe, non al contrario. */
    const stampaArchivio = () => {
        if (!visibili.length) return;
        if (visibili.length > 60 && !confirm(`Stai per mettere ${visibili.length} documenti in un file solo (${visibili.length * 3} pagine). Vado avanti?`)) return;
        const ordinati = [...visibili].sort((a, b) => String(a.creato_il).localeCompare(String(b.creato_il)));
        const p = PERIODI.find(x => x.id === periodo);
        const quando = dal || al ? `${dal || "inizio"} — ${al || "oggi"}` : (p ? p.et.toLowerCase() : "");
        apriPerStampa(ddtRaccolta(ordinati.map(perStampa), `Documenti di trasporto — ${quando} (${ordinati.length})`));
    };

    const esporta = () => {
        const dati: CellaXlsx[][] = merce.map(r => [
            gghh(r.creato_il), `n.${r.ddt.numero}/${r.ddt.anno ?? ""}`,
            TIPI_DDT[r.ddt.tipo || "trasferimento"]?.et || r.ddt.tipo,
            r.codice, r.descrizione, r.seriale || "", pezziDi(r), r.quantita_accettata ?? "",
            r.negozio_da, r.negozio_a,
            nomiAzienda[r.azienda_da || ""] || r.azienda_da || "", nomiAzienda[r.azienda_a || ""] || r.azienda_a || "",
            STATI_RIGA[r.stato]?.et || r.stato, r.motivo || "",
            r.ddt.creato_da || "", r.ddt.accettato_da || "",
            valoreRiga(r) == null ? "" : Math.round(valoreRiga(r)! * 100) / 100,
        ]);
        scaricaXlsx(`trasferimenti_${new Date().toISOString().slice(0, 10)}.xlsx`,
            ["Quando", "DDT", "Tipo", "Codice", "Articolo", "Seriale", "Pezzi", "Arrivati", "Da", "A",
                "Società di partenza", "Società di arrivo", "Esito", "Perché", "Spedito da", "Accettato da", "Valore €"],
            dati, "Trasferimenti");
    };

    /* ── QUELLO CHE SI VEDE ──────────────────────────────────────────────── */
    const rigaTragitto = (d: Ddt) => (
        <>
            <span className="rvTab-nome">{d.da_negozio}</span>
            <span className="rvFrec"> → </span>
            <span className="rvTab-nome">{d.a_negozio}</span>
            {eCessione(d) && (
                <div className="rvTab-min">{nomeCorto(nomiAzienda[d.azienda_da || ""]) || d.azienda_da} → {nomeCorto(nomiAzienda[d.azienda_a || ""]) || d.azienda_a}</div>
            )}
        </>
    );

    const pastigliaStato = (d: Ddt) => {
        const s = STATI_DDT[d.stato] || { et: d.stato, ico: "•", tono: "rvBadge-empty" };
        const gg2 = giorniInViaggio(d);
        return (
            <>
                <span className={cn("rvBadge", s.tono)}>{s.ico} {s.et}</span>
                {aperto(d) && (
                    <div className={cn("rvTab-min", fermo(d) ? "rvGiac rvGiac-ko" : inRitardo(d) ? "rvGiac rvGiac-no" : undefined)}>
                        {gg2 === 0 ? "partito oggi" : `da ${gg2} ${gg2 === 1 ? "giorno" : "giorni"}`}
                    </div>
                )}
                {d.stato === "accettato" && d.accettato_da && <div className="rvTab-min">{d.accettato_da} · {gg(d.accettato_il)}</div>}
                {d.stato === "parziale" && d.motivo && <div className="rvTab-min">{d.motivo}</div>}
                {(d.stato === "annullato" || d.stato === "rifiutato") && d.motivo && <div className="rvTab-min">{d.motivo}</div>}
            </>
        );
    };

    return (
        <div className="space-y-4">
            {/* SI DICE PRIMA, NON DOPO (regola §7): un DDT emesso senza la sede
                legale delle società non è valido, e accorgersene in stampa vuol
                dire accorgersene quando il corriere è già partito. */}
            {manca.length > 0 && (
                <div className="rvPrima">
                    <div className="rvPrima-t">⚠️ Un documento di trasporto emesso adesso non sarebbe valido</div>
                    {manca.slice(0, 6).map(m => (
                        <div key={m} className="rvManca rvManca-qui"><i>·</i>{m}<u>Amministrazione → Negozi</u></div>
                    ))}
                    {manca.length > 6 && <div className="rvManca rvManca-qui"><i>·</i>…e altre {manca.length - 6} cose</div>}
                </div>
            )}
            {righeVive === false && (
                <div className="rvNota rvNota-att">
                    <div className="rvNota-t">🧱 Manca la tabella delle righe dei documenti</div>
                    <div className="rvNota-s">
                        La sezione funziona a metà: i documenti si vedono, ma cosa contengono no — e la merce a
                        quantità non si può spedire. Si applica la migrazione <b>20260831180000_trasferimenti.sql</b>.
                    </div>
                </div>
            )}

            {/* ── LE SITUAZIONI: le domande che si fanno ogni giorno ───────── */}
            <div className="rvPillRow">
                {SITUAZIONI.filter(s => miei.length || !soloConNegozio.includes(s.id)).map(s => (
                    <button key={s.id} onClick={() => setSituazione(s.id)} title={s.spiega}
                        className={cn("rvPill", situazione === s.id && "rvPill-on")}>
                        {s.ico} {s.et}<b className="rvPillN">{conteggi[s.id] ?? 0}</b>
                    </button>
                ))}
            </div>

            {/* ── I FILTRI ─────────────────────────────────────────────────── */}
            <div className="rvBox">
                <div className="rvBoxT">🔎 Filtra i trasferimenti</div>
                <div className="rvBarra">
                    <label className="rvCampo rvCampo-flex"><span className="rvLab">Cerca</span>
                        <span className="rvCerca">
                            <Search size={16} />
                            <input value={cerca} onChange={e => setCerca(e.target.value)} className="rvIn"
                                placeholder="IMEI, articolo, numero del DDT, persona…" />
                        </span>
                    </label>
                    <div className="rvCampo rvCampo-md"><span className="rvLab">Parte da</span>
                        <SelectMulti className="rvIn" values={daNeg} onChange={setDaNeg} opzioni={negozi}
                            tuttiLabel="Tutti i negozi" placeholder="tutti" /></div>
                    <div className="rvCampo rvCampo-md"><span className="rvLab">Arriva a</span>
                        <SelectMulti className="rvIn" values={aNeg} onChange={setANeg} opzioni={negozi}
                            tuttiLabel="Tutti i negozi" placeholder="tutti" /></div>
                    <div className="rvCampo rvCampo-sm"><span className="rvLab">Stato</span>
                        <SelectMulti className="rvIn" values={stati} onChange={setStati}
                            opzioni={Object.values(STATI_DDT).map(s => s.et)} tuttiLabel="Tutti gli stati" placeholder="tutti" /></div>
                    <div className="rvCampo rvCampo-md"><span className="rvLab">Tipo di movimento</span>
                        <SelectMulti className="rvIn" values={tipi} onChange={setTipi}
                            opzioni={Object.values(TIPI_DDT).map(t => t.et)} tuttiLabel="Tutti i tipi" placeholder="tutti" /></div>
                    <div className="rvCampo rvCampo-md"><span className="rvLab">Società coinvolta</span>
                        <SelectMulti className="rvIn" values={soc} onChange={setSoc}
                            opzioni={aziende.map(c => nomiAzienda[c] || c)} tuttiLabel="Tutte e due" placeholder="tutte" /></div>
                    <div className="rvCampo rvCampo-md"><span className="rvLab">Chi l&apos;ha toccato</span>
                        <SelectMulti className="rvIn" values={persone} onChange={setPersone} opzioni={gente}
                            tuttiLabel="Chiunque" placeholder="chiunque" /></div>
                </div>
                <div className="rvBarra rvBarra-c mt-3">
                    <div className="rvCampo"><span className="rvLab">Quando</span>
                        <div className="rvPillRow">
                            {PERIODI.map(p => (
                                <button key={p.id} onClick={() => { setPeriodo(p.id); setDal(""); setAl(""); }}
                                    className={cn("rvPill rvPill-sm", periodo === p.id && !dal && !al && "rvPill-on")}>{p.et}</button>
                            ))}
                        </div>
                    </div>
                    <label className="rvCampo rvCampo-xs"><span className="rvLab">Dal</span>
                        <input type="date" value={dal} onChange={e => { setDal(e.target.value); setPeriodo("sempre"); }} className="rvIn" /></label>
                    <label className="rvCampo rvCampo-xs"><span className="rvLab">Al</span>
                        <input type="date" value={al} onChange={e => { setAl(e.target.value); setPeriodo("sempre"); }} className="rvIn" /></label>
                    <span className="rvSpazio" />
                    {filtriAccesi && <button onClick={azzera} className="rvPill rvPill-sm">✕ Azzera i filtri</button>}
                </div>
            </div>

            {/* ── LE DUE VISTE E LE AZIONI ─────────────────────────────────── */}
            <div className="rvBarra rvBarra-c">
                <div className="rvPillRow">
                    <button onClick={() => setVista("documenti")} className={cn("rvPill", vista === "documenti" && "rvPill-on")}>
                        📄 Documenti<b className="rvPillN">{visibili.length}</b></button>
                    <button onClick={() => setVista("merce")} className={cn("rvPill", vista === "merce" && "rvPill-on")}>
                        📦 Merce mossa<b className="rvPillN">{merce.length}</b></button>
                </div>
                <span className="rvSpazio" />
                {gestisce && (
                    <button onClick={() => { setApriNuovo(v => !v); setApriCarico(false); }}
                        className={cn("rvPill", apriNuovo && "rvPill-on")}>
                        <Truck size={15} className="inline-block align-[-3px] mr-1.5" /> Nuovo trasferimento</button>
                )}
                {puoCaricare && (
                    <button onClick={() => { setApriCarico(v => !v); setApriNuovo(false); }}
                        className={cn("rvPill", apriCarico && "rvPill-on")}>
                        <PackagePlus size={15} className="inline-block align-[-3px] mr-1.5" /> Carico merce</button>
                )}
                <button onClick={esporta} disabled={!merce.length} className="rvPill rvPill-sm">
                    <FileDown size={14} className="inline-block align-[-2px] mr-1.5" />Excel</button>
                {/* l'archivio dei documenti del periodo, in un file solo */}
                <button onClick={stampaArchivio} disabled={!visibili.length} className="rvPill rvPill-sm"
                    title="Tutti i documenti che vedi, in un unico PDF — uno per pagina">
                    📄 PDF di tutti ({visibili.length})</button>
            </div>

            {apriCarico && <Carico negozi={negozi} aziende={aziende} utente={utente} dopo={() => { setApriCarico(false); ricarica(); }} />}
            {apriNuovo && (
                <NuovoTrasferimento unita={unita} quantita={quantita} negozi={negozi} negDati={negDati} casse={casse}
                    nomiAzienda={nomiAzienda} anagrafica={anagrafica} mioNegozio={mioNegozio} utente={utente}
                    righeVive={righeVive !== false}
                    dopo={() => { setApriNuovo(false); caricaTutto(); ricarica(); }} />
            )}

            {carico ? (
                <div className="rvCarico"><Loader2 className="w-6 h-6 animate-spin" /> Carico i trasferimenti…</div>
            ) : vista === "documenti" ? (
                <div className="rvTabBox">
                    <table className="rvTab">
                        <thead>
                            {/* QUATTRO COLONNE, NON OTTO (regola §5: la finestra non è tutta
                                per il contenuto — il menù di sinistra si prende 256px, e a 1073
                                al magazzino ne restano 817). Con otto colonne l'azione principale
                                — «Accetta» — finiva fuori dallo schermo, raggiungibile solo
                                scorrendo la tabella di lato: misurato. Il tipo, la data e chi ha
                                spedito non sono spariti, sono entrati nella cella a cui
                                appartengono. */}
                            <tr>
                                <th>Documento</th><th>Tragitto</th>
                                <th className="rvTab-c">Merce</th><th>Stato e cosa fare</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibili.map(d => {
                                const rs = righeDi(d.id);
                                const pezzi = rs.reduce((s, r) => s + pezziDi(r), 0);
                                const val = rs.reduce((s, r) => s + (valoreRiga(r) ?? 0), 0);
                                const senzaValore = rs.some(r => valoreRiga(r) == null);
                                const t = TIPI_DDT[d.tipo || "trasferimento"] || TIPI_DDT.trasferimento;
                                const apertaQui = apertoId === d.id;
                                return (
                                    <Fragment key={d.id}>
                                        <tr className={cn("rvTab-riga rvTab-cl", apertaQui && "rvTab-on")}
                                            onClick={() => setApertoId(apertaQui ? null : d.id)}>
                                            <td className="rvTab-cod">
                                                <span className="rvTab-ap">{apertaQui ? "▾" : "▸"}</span>
                                                n.{d.numero}/{d.anno ?? new Date(d.creato_il).getFullYear()}
                                                <div className="rvTab-min">{nomeCorto(nomiAzienda[d.azienda_da || ""]) || d.azienda_da || "—"}</div>
                                                <div className="rvTab-min">{gghh(d.creato_il)}</div>
                                                {d.creato_da && <div className="rvTab-min">{d.creato_da}</div>}
                                            </td>
                                            <td>
                                                <span className="rvTag whitespace-nowrap" title={t.spiega}>{t.ico} {t.corto}</span>
                                                <div className="mt-1">{rigaTragitto(d)}</div>
                                            </td>
                                            {/* i pezzi e quanto valgono stanno nella stessa casella: una
                                                colonna in meno è l'azione principale ancora sullo schermo
                                                quando la finestra è stretta e il menù è aperto */}
                                            <td className="rvTab-n whitespace-nowrap"
                                                title={senzaValore ? "Di qualche riga non si sa il valore d'acquisto: il totale è per difetto" : undefined}>
                                                {rs.length ? <>{pezzi} <span className="rvTab-min">{rs.length === 1 ? "riga" : "righe"} {rs.length}</span></> : "—"}
                                                {val > 0 && <div className="rvTab-min">{senzaValore ? "almeno " : ""}{eur(val)}</div>}
                                            </td>
                                            <td onClick={e => e.stopPropagation()}>
                                                {pastigliaStato(d)}
                                                {/* NIENTE `-dritta` qui (a differenza della vecchia riga di
                                                    due bottoni): con tre azioni, forzare la riga unica spingeva
                                                    «Accetta» fuori dallo schermo a 1073 col menù aperto. Meglio
                                                    che vadano a capo. */}
                                                <span className="rvPillRow mt-2">
                                                    <button onClick={() => stampa(d)} className="rvPill rvPill-sm" title="Il documento in tre copie, pronto da firmare">🖨 DDT</button>
                                                    {puoAccettare(d) && <button onClick={() => apriAzione(d, "accetta")} className="rvPill rvPill-sm rvPill-si">✓ Accetta</button>}
                                                    {/* RESPINGERE IN BLOCCO è un'azione vera, non un caso di scuola:
                                                        arriva il pacco sbagliato, o arriva rotto, e chi riceve non lo
                                                        prende. Il codice per rimandare tutto indietro c'era già ma
                                                        non aveva un bottone: senza, l'unica strada era accettare
                                                        tutto e poi disfare. */}
                                                    {puoAccettare(d) && <button onClick={() => apriAzione(d, "rifiuta")} className="rvPill rvPill-sm">↩️ Respingi</button>}
                                                    {puoAnnullare(d) && <button onClick={() => apriAzione(d, "annulla")} className="rvPill rvPill-sm">🚫 Annulla</button>}
                                                    {puoCaricare && daFatturare(d) && <button onClick={() => apriAzione(d, "fattura")} className="rvPill rvPill-sm rvPill-no">🧾 Fattura</button>}
                                                </span>
                                            </td>
                                        </tr>
                                        {apertaQui && (
                                            <tr className="rvTab-det"><td colSpan={4}>
                                                <div className="rvDett">
                                                    <div className="rvDettT">Il documento</div>
                                                    <div className="rvDettR">
                                                        <span className="rvTab-min">Causale</span><span>{d.causale || "—"}</span>
                                                        <span className="rvSep" />
                                                        <span className="rvTab-min">Aspetto</span><span>{d.aspetto || "—"}</span>
                                                        <span className="rvSep" />
                                                        <span className="rvTab-min">Trasporto</span><span>{d.trasporto || "—"}</span>
                                                        {d.colli != null && <><span className="rvSep" /><span className="rvTab-min">Colli</span><span>{d.colli}</span></>}
                                                    </div>
                                                    {d.destinatario && (
                                                        <div className="rvDettR">
                                                            <span className="rvTab-min">Destinatario</span>
                                                            <span><b>{d.destinatario}</b>{d.destinatario_piva ? ` · P.IVA ${d.destinatario_piva}` : ""}</span>
                                                            <span className="rvTab-min">
                                                                {[[d.destinatario_indirizzo, d.destinatario_civico].filter(Boolean).join(", "),
                                                                [d.destinatario_cap, d.destinatario_citta, d.destinatario_provincia ? `(${d.destinatario_provincia})` : null].filter(Boolean).join(" ")]
                                                                    .filter(Boolean).join(" — ")}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {d.note && (
                                                        <div className="rvDettR"><span className="rvTab-min">Note</span><span>{d.note}</span></div>
                                                    )}
                                                    {eCessione(d) && (
                                                        <div className="rvDettR">
                                                            <span className="rvBadge rvBadge-warn">🧾 Cessione fra società</span>
                                                            <span>{d.fattura_stato === "emessa"
                                                                ? `Fatturata${d.fattura_rif ? ` — ${d.fattura_rif}` : ""}${d.fattura_il ? ` del ${gg(d.fattura_il)}` : ""}`
                                                                : d.fattura_stato === "non_dovuta" ? "Segnata come non da fatturare"
                                                                    : "Il DDT va seguito da fattura: non risulta ancora emessa."}</span>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="rvDett">
                                                    <div className="rvDettT">Cosa c&apos;è dentro</div>
                                                    {!rs.length && <div className="rvTab-min">{righeVive === false
                                                        ? "Le righe non si possono leggere finché la migrazione non è applicata."
                                                        : "Non trovo righe per questo documento. Può essere nato prima del registro delle righe, oppure l'emissione si è interrotta a metà: prima di prenderlo in carico ricarica la pagina, e se restano zero avvisa l'amministrazione."}</div>}
                                                    {rs.map(r => {
                                                        const sr = STATI_RIGA[r.stato] || { et: r.stato, ico: "•", tono: "rvBadge-empty" };
                                                        const n = pezziDi(r);
                                                        const arrivati = r.quantita_accettata;
                                                        return (
                                                            <div key={r.id} className="rvDettR">
                                                                <span className={cn("rvBadge rvBadge-w", sr.tono)}>{sr.ico} {sr.et}</span>
                                                                <span className="rvTab-nome">{r.descrizione}</span>
                                                                {r.seriale
                                                                    ? <span className="rvDettR-mono">{r.seriale}</span>
                                                                    : <span><b className="rvGiac rvGiac-si">{n}</b> pz{arrivati != null && arrivati < n ? <> · <b className="rvGiac rvGiac-no">{arrivati}</b> arrivati</> : null}</span>}
                                                                {r.codice && <span className="rvTab-cod">{r.codice}</span>}
                                                                {r.motivo && <span className="rvTab-min">— {r.motivo}</span>}
                                                                {puoCaricare && RIGHE_APERTE.includes(r.stato) && (
                                                                    <button onClick={() => apriAzione(d, "differenza", r)} className="rvPill rvPill-sm">Chiudi la differenza</button>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </td></tr>
                                        )}
                                    </Fragment>
                                );
                            })}
                            {!visibili.length && <tr><td colSpan={4} className="rvTab-vuoto">
                                {ddt.length
                                    ? "Nessun documento con questi filtri."
                                    : "Non è ancora partito nessun trasferimento. Il primo si fa da 🚚 Nuovo trasferimento."}
                            </td></tr>}
                        </tbody>
                    </table>
                    {!!visibili.length && (
                        <div className="rvTab-pie">
                            {visibili.length} {visibili.length === 1 ? "documento" : "documenti"} ·
                            {" "}{visibili.filter(aperto).length} ancora in viaggio ·
                            {" "}{visibili.filter(d => inRitardo(d)).length} in ritardo
                        </div>
                    )}
                </div>
            ) : (
                <div className="rvTabBox">
                    <table className="rvTab">
                        <thead>
                            <tr>
                                <th>Articolo</th><th>Seriale / quantità</th>
                                <th>Da → A</th><th>Documento</th><th>Com&apos;è finita</th>
                            </tr>
                        </thead>
                        <tbody>
                            {merce.slice(0, 500).map(r => {
                                const sr = STATI_RIGA[r.stato] || { et: r.stato, ico: "•", tono: "rvBadge-empty" };
                                const n = pezziDi(r);
                                return (
                                    <tr key={r.id} className="rvTab-riga">
                                        <td><span className="rvTab-nome">{r.descrizione}</span>
                                            {r.codice && <div className="rvTab-cod">{r.codice}</div>}</td>
                                        <td>{r.seriale
                                            ? <span className="rvDettR-mono">{r.seriale}</span>
                                            : <span><b className="rvGiac rvGiac-si">{n}</b> pz{r.quantita_accettata != null && r.quantita_accettata < n ? <span className="rvTab-min"> · {r.quantita_accettata} arrivati</span> : null}</span>}</td>
                                        <td><span className="rvTab-nome">{r.negozio_da}</span><span className="rvFrec"> → </span><span className="rvTab-nome">{r.negozio_a}</span>
                                            {r.azienda_da !== r.azienda_a && <div className="rvTab-min">{nomeCorto(nomiAzienda[r.azienda_da || ""]) || r.azienda_da} → {nomeCorto(nomiAzienda[r.azienda_a || ""]) || r.azienda_a}</div>}</td>
                                        <td className="rvTab-cod">n.{r.ddt.numero}/{r.ddt.anno ?? ""}
                                            <div className="rvTab-min">{gghh(r.creato_il)}</div>
                                            <div className="rvTab-min">{r.ddt.creato_da || "—"}{r.ddt.accettato_da ? ` → ${r.ddt.accettato_da}` : ""}</div></td>
                                        <td><span className={cn("rvBadge", sr.tono)}>{sr.ico} {sr.et}</span>
                                            {r.motivo && <div className="rvTab-min">{r.motivo}</div>}</td>
                                    </tr>
                                );
                            })}
                            {!merce.length && <tr><td colSpan={5} className="rvTab-vuoto">
                                {righeVive === false
                                    ? "Le righe dei documenti non sono leggibili: manca la migrazione 20260831180000."
                                    : "Nessuna merce mossa con questi filtri. Qui resta scritto per sempre tutto quello che esce e che entra, anche dopo che il documento è stato accettato."}
                            </td></tr>}
                        </tbody>
                    </table>
                    {merce.length > 500 && <div className="rvTab-pie">Ne mostro 500 su {merce.length}: stringi i filtri, oppure scarica l&apos;Excel che le porta tutte.</div>}
                    {!!merce.length && merce.length <= 500 && (
                        <div className="rvTab-pie">
                            {merce.length} {merce.length === 1 ? "riga" : "righe"} ·
                            {" "}{merce.reduce((s, r) => s + pezziDi(r), 0)} pezzi mossi
                        </div>
                    )}
                </div>
            )}

            {/* ── I MODALI, in un portal (regola §6) ───────────────────────── */}
            {azione && typeof document !== "undefined" && createPortal(
                <div className="rvFattaSfondo" onClick={e => { if (e.target === e.currentTarget && !inCorso) setAzione(null); }}>
                    <div className={cn("rvFatta", azione.modo === "accetta" ? "rvFatta-lg" : "rvFatta-att")}>
                        {azione.modo === "accetta" ? <AccettaModale
                            d={azione.d} righe={righeDi(azione.d.id)} quante={quante} setQuante={setQuante}
                            motivo={motivo} setMotivo={setMotivo} nomiAzienda={nomiAzienda} />
                            : azione.modo === "fattura" ? (
                                <>
                                    <div className="rvFatta-o rvFatta-att-o">🧾</div>
                                    <h3>La fattura di questa cessione</h3>
                                    <p>Il DDT n.{azione.d.numero} è una cessione fra <b>{nomiAzienda[azione.d.azienda_da || ""] || azione.d.azienda_da}</b> e <b>{nomiAzienda[azione.d.azienda_a || ""] || azione.d.azienda_a}</b>: due soggetti diversi, quindi il documento di trasporto da solo non basta.</p>
                                    <label className="rvCampo"><span className="rvLab">Riferimento della fattura</span>
                                        <input value={rifRiga} onChange={e => setRifRiga(e.target.value)} autoFocus className="rvIn"
                                            placeholder="es. 128/2026 — lascia vuoto per «non dovuta»" /></label>
                                    <div className="rvHint">Vuoto = la segno come <b>non dovuta</b>, e il documento esce dall&apos;elenco «da fatturare».</div>
                                </>
                            ) : azione.modo === "differenza" && azione.riga ? (
                                <>
                                    <div className="rvFatta-o rvFatta-att-o">⚠️</div>
                                    <h3>Dove è finita?</h3>
                                    <p><b>{azione.riga.descrizione}</b>{azione.riga.seriale ? <><br />{azione.riga.seriale}</> : null}<br />
                                        Partita da {azione.riga.negozio_da} col DDT n.{azione.d.numero} e mai arrivata a {azione.riga.negozio_a}.</p>
                                    <div className="rvCampo"><span className="rvLab">Cosa è successo</span>
                                        <div className="rvPillRow">
                                            <button onClick={() => setComeChiudo("rientrata")} className={cn("rvPill rvPill-sm", comeChiudo === "rientrata" && "rvPill-on")}>↩️ È tornata al mittente</button>
                                            <button onClick={() => setComeChiudo("ammanco")} className={cn("rvPill rvPill-sm", comeChiudo === "ammanco" && "rvPill-on")}>🔴 È persa (ammanco)</button>
                                        </div>
                                    </div>
                                    <label className="rvCampo mt-3"><span className="rvLab">Perché</span>
                                        <input value={motivo} onChange={e => setMotivo(e.target.value)} className="rvIn" placeholder="mai partita, rubata, errore di conteggio…" /></label>
                                </>
                            ) : (
                                <>
                                    <div className="rvFatta-o rvFatta-att-o">{azione.modo === "annulla" ? "🚫" : "↩️"}</div>
                                    <h3>{azione.modo === "annulla" ? "Annullare il documento?" : "Respingere tutta la merce?"}</h3>
                                    <p>
                                        DDT n.{azione.d.numero} · {azione.d.da_negozio} → {azione.d.a_negozio}<br />
                                        Tutto quello che sta ancora viaggiando torna <b>{azione.d.da_negozio}</b>.
                                        Il documento non si cancella: resta col suo numero, marcato {azione.modo === "annulla" ? "annullato" : "respinto"}.
                                    </p>
                                    <label className="rvCampo"><span className="rvLab">Perché</span>
                                        <input value={motivo} onChange={e => setMotivo(e.target.value)} autoFocus className="rvIn"
                                            placeholder={azione.modo === "annulla" ? "spedizione sbagliata, ci ripensiamo…" : "merce danneggiata, non è quella che avevo chiesto…"} /></label>
                                </>
                            )}
                        <div className="rvBarra rvBarra-c mt-4 justify-end">
                            <button onClick={() => setAzione(null)} disabled={inCorso} className="rvPill">Lascia stare</button>
                            {/* IL PERCHÉ SI CHIEDE, non si inventa (regola §7): prima
                                accettare con differenze passava col campo vuoto e il
                                documento si scriveva da solo «arrivato con differenze»,
                                che sembrava una motivazione data dall'operatore. */}
                            <button onClick={conferma} disabled={inCorso || (azione.modo === "fattura" ? false : azione.modo === "accetta" ? (differenzeInCorso && !motivo.trim()) : !motivo.trim())}
                                className={cn("rvAzione", azione.modo === "accetta" ? (differenzeInCorso ? "rvAzione-att" : undefined) : azione.modo === "fattura" ? "rvAzione-att" : "rvAzione-no")}>
                                {inCorso && <Loader2 className="w-4 h-4 animate-spin inline-block align-[-3px] mr-2" />}
                                {azione.modo === "accetta" ? (differenzeInCorso ? "Prendo in carico con differenze" : "Prendo in carico")
                                    : azione.modo === "fattura" ? (rifRiga.trim() ? "Segna fatturata" : "Segna non dovuta")
                                        : azione.modo === "annulla" ? "Sì, annulla" : azione.modo === "differenza" ? "Chiudi la riga" : "Sì, respingi"}
                            </button>
                        </div>
                    </div>
                </div>, document.body)}
        </div>
    );
}

/** IL CONTROLLO ALL'ARRIVO. Non è una domanda sì/no: chi riceve APRE il pacco
 *  e conta. «Ne sono arrivati 5 su 6» deve poterlo dire qui, se no lo dirà a
 *  voce e il magazzino resterà sbagliato per sempre. */
function AccettaModale({ d, righe, quante, setQuante, motivo, setMotivo, nomiAzienda }: {
    d: Ddt; righe: RigaDdt[]; quante: Record<string, number>;
    setQuante: (f: (p: Record<string, number>) => Record<string, number>) => void;
    motivo: string; setMotivo: (v: string) => void; nomiAzienda: Record<string, string>;
}) {
    const vive = righe.filter(r => r.stato === "in_viaggio");
    const attesi = vive.reduce((s, r) => s + pezziDi(r), 0);
    const presi = vive.reduce((s, r) => s + Math.max(0, Math.min(pezziDi(r), Number(quante[r.id] ?? pezziDi(r)))), 0);
    const differenze = presi !== attesi;
    return (
        <>
            <div className="rvFatta-o">📦</div>
            <h3>È arrivato tutto?</h3>
            <p>
                DDT n.{d.numero} · {d.da_negozio} → {d.a_negozio}<br />
                Spunta quello che hai davvero in mano. {eCessione(d) && (
                    <b>La merce passa a {nomiAzienda[d.azienda_a || ""] || d.azienda_a}: è una cessione, servirà la fattura.</b>
                )}
            </p>
            <div className="rvDett max-h-72 overflow-y-auto pr-1">
                {vive.map(r => {
                    const n = pezziDi(r);
                    const preso = Math.max(0, Math.min(n, Number(quante[r.id] ?? n)));
                    return (
                        <label key={r.id} className="rvDettR rvDettR-cl">
                            <input type="checkbox" checked={preso > 0}
                                onChange={e => setQuante(p => ({ ...p, [r.id]: e.target.checked ? n : 0 }))} />
                            <span className="rvTab-nome">{r.descrizione}</span>
                            {r.seriale
                                ? <span className="rvDettR-mono">{r.seriale}</span>
                                : <>
                                    <span className="rvTab-min">di {n}</span>
                                    <input type="number" min={0} max={n} value={preso} onClick={e => e.stopPropagation()}
                                        onChange={e => setQuante(p => ({ ...p, [r.id]: Number(e.target.value) }))}
                                        className="rvQta" />
                                </>}
                            {preso < n && <span className="rvBadge rvBadge-warn">{n - preso} non {n - preso === 1 ? "arrivato" : "arrivati"}</span>}
                        </label>
                    );
                })}
                {!vive.length && <div className="rvTab-min">Non c&apos;è più niente in viaggio su questo documento.</div>}
            </div>
            <div className="rvCartRiga">
                <span>Attesi</span><b>{attesi}</b>
                <span>In mano</span><b className={cn("rvGiac", differenze ? "rvGiac-no" : "rvGiac-si")}>{presi}</b>
            </div>
            {differenze && (
                <label className="rvCampo"><span className="rvLab">Cosa non torna <span className="rvLabX">(finisce sul documento e resta scritto)</span></span>
                    <input value={motivo} onChange={e => setMotivo(e.target.value)} className="rvIn"
                        placeholder="il pacco ne conteneva uno in meno…" /></label>
            )}
        </>
    );
}

/* ── 🚚 NUOVO TRASFERIMENTO ────────────────────────────────────────────────
   Tre cose che prima non c'erano, e sono le tre situazioni che Luca ha
   chiesto di guardare:
   · LA MERCE A QUANTITÀ. Accessori e SIM sono l'84% del magazzino e non si
     potevano trasferire affatto: non avendo un seriale non avevano un
     `ddt_id` dove scriversi. Ora sono righe del documento come le altre, e la
     giacenza si muove con un movimento — mai scritta a mano (regola §8).
   · LA SOCIETÀ DELLA MERCE. Un DDT lo emette un soggetto: a Donna Olimpia
     convivono Telefutura e Telefutura 2, e la merce resta di chi è. Un
     documento trasporta merce di UNA società sola — due società, due
     documenti — e se le società di partenza e arrivo sono diverse non è un
     trasferimento ma una CESSIONE, con la fattura al seguito.
   · I GEMELLI. Magliana W3 e Magliana Multi sono due insegne nello stesso
     locale: la merce non si sposta di un metro, cambia solo proprietario.
     Tenerla «in transito» vorrebbe dire rendere invendibile per giorni un
     telefono che sta a quaranta centimetri: il documento si emette e si
     chiude nello stesso atto. */
function NuovoTrasferimento({ unita, quantita, negozi, negDati, casse, nomiAzienda, anagrafica, mioNegozio, utente, righeVive, dopo }: {
    unita: Unita[]; quantita: RigaQta[]; negozi: string[];
    negDati: Record<string, NegozioDdt & { azienda?: string | null }>;
    casse: { negozio: string; azienda: string; is_default: boolean | null }[];
    nomiAzienda: Record<string, string>; anagrafica: Map<string, DatiArticolo>;
    mioNegozio: string; utente: string; righeVive: boolean; dopo: () => void;
}) {
    const [fuori, setFuori] = useState(false);
    const [da, setDa] = useState(splitNegozi(mioNegozio)[0] || "");
    const [a, setA] = useState("");
    /* IL DESTINATARIO ESTERNO, campo per campo. Su un DDT il destinatario è un
       soggetto fiscale: ragione sociale, partita IVA e luogo di consegna. In
       una riga di testo libero finivano tutti insieme, e il documento usciva
       intestato alla società che spedisce (revisore 31/08). */
    const [dest, setDest] = useState(""); const [destPiva, setDestPiva] = useState("");
    const [destVia, setDestVia] = useState(""); const [destCiv, setDestCiv] = useState("");
    const [destCap, setDestCap] = useState(""); const [destCitta, setDestCitta] = useState("");
    const [destProv, setDestProv] = useState("");
    const [soc, setSoc] = useState("");
    const [note, setNote] = useState(""); const [colli, setColli] = useState("");
    const [aspetto, setAspetto] = useState("A vista");
    const [trasporto, setTrasporto] = useState("A cura del mittente");
    const [filtro, setFiltro] = useState("");
    const [pezzi, setPezzi] = useState<Set<string>>(new Set());
    const [qta, setQta] = useState<Record<string, number>>({});
    const [busy, setBusy] = useState(false);

    /* LE SOCIETÀ CHE QUEL NEGOZIO HA DAVVERO A MAGAZZINO. Non quelle
       dell'anagrafica: a Donna la tabella dice T2, ma sullo scaffale ci sono
       135 pezzi di T1 e 4 di T2. */
    const societa = useMemo(() => Array.from(new Set([
        ...unita.filter(u => u.negozio === da && u.stato === "disponibile").map(u => u.azienda),
        ...quantita.filter(q => q.negozio === da && q.quantita > 0).map(q => q.azienda),
    ].filter(Boolean) as string[])).sort(), [unita, quantita, da]);
    useEffect(() => { setSoc(societa.length === 1 ? societa[0] : ""); setPezzi(new Set()); setQta({}); }, [da, societa]);

    /** Di chi sarà la merce all'arrivo. È la STESSA regola del trigger
     *  `mag_ddt_numera` (migrazione 20260831200000), ricalcata passo per
     *  passo: la merce resta di chi è, e solo se il negozio di arrivo quella
     *  società non ce l'ha in nessuna forma si tratta di una cessione vera.
     *  Se qui si dicesse una cosa e il documento ne scrivesse un'altra,
     *  l'avviso «attenzione, è una cessione» sarebbe peggio di niente. */
    const aziendaArrivo = useMemo(() => {
        if (fuori || !a || !soc) return soc;
        // 1. il negozio di arrivo ha un registratore di quella società
        if (casse.some(c => c.negozio === a && c.azienda === soc)) return soc;
        /* 2. oppure ne ha già la merce A SCAFFALE — e «a scaffale» vuol dire
              disponibile (revisore 31/08). `unita` arriva senza filtro di
              stato: dentro ci sono i venduti, gli annullati e soprattutto i
              pezzi IN VIAGGIO, che per convenzione portano già il negozio di
              destinazione. Senza questo filtro, il secondo DDT sulla stessa
              tratta trovava il pezzo del PRIMO — ancora in viaggio, non ancora
              accettato — e concludeva che quel negozio ha già merce di quella
              società: stessa tratta, due esiti fiscali diversi, e il secondo
              senza fattura. */
        if (unita.some(u => u.negozio === a && u.azienda === soc && u.stato === "disponibile")) return soc;
        if (quantita.some(g => g.negozio === a && g.azienda === soc && Number(g.quantita) > 0)) return soc;
        // 3. altrimenti è la sua, e allora è una cessione
        const suo = negDati[a]?.azienda
            || casse.filter(c => c.negozio === a).sort((x, y) => Number(y.is_default) - Number(x.is_default))[0]?.azienda;
        return suo || soc;
    }, [fuori, a, soc, casse, negDati, unita, quantita]);

    const gemelli = !fuori && !!da && !!a && stessoMagazzino(da, a);
    const tipo = tipoDi(da, a, soc, aziendaArrivo, fuori);

    const q = filtro.trim().toLowerCase();
    const disponibili = useMemo(() => unita.filter(u =>
        u.stato === "disponibile" && u.negozio === da && (!soc || u.azienda === soc)
        && (!q || `${u.descrizione} ${u.seriale} ${u.codice || ""}`.toLowerCase().includes(q))),
        [unita, da, soc, q]);
    const sfusi = useMemo(() => quantita.filter(g =>
        g.negozio === da && (!soc || g.azienda === soc) && Number(g.quantita) > 0
        && (!q || `${g.descrizione} ${g.codice}`.toLowerCase().includes(q))),
        [quantita, da, soc, q]);
    const perCodice = useMemo(() => new Map(sfusi.map(g => [g.codice, g])), [sfusi]);

    const scelti = Object.entries(qta).filter(([, n]) => Number(n) > 0);
    const totPezzi = pezzi.size + scelti.reduce((s, [, n]) => s + Number(n), 0);

    /* TUTTO QUELLO CHE BLOCCA STA IN UNA FUNZIONE SOLA (regola §7): il bottone
       verde promette, e se promette deve mantenere. */
    const cosaManca = useMemo(() => {
        const out: string[] = [];
        if (!righeVive) out.push("manca la tabella delle righe dei documenti: applica la migrazione 20260831180000");
        if (!da) out.push("scegli il negozio da cui parte la merce");
        if (fuori) {
            /* SI DICE PRIMA (regola §7): un DDT senza i dati del destinatario non
               è valido, e il generatore direbbe di compilarli «in Amministrazione
               → Negozi» — un'istruzione che per un fornitore non si può eseguire.
               Quindi si chiedono qui, e senza non si emette. */
            if (!dest.trim()) out.push("scrivi la ragione sociale del fornitore a cui rendi la merce");
            if (!destPiva.trim()) out.push("scrivi la partita IVA del fornitore: sul documento è obbligatoria");
            if (!destVia.trim() || !destCiv.trim()) out.push("scrivi via e civico del fornitore: è il luogo di consegna");
            if (!destCap.trim() || !destCitta.trim()) out.push("scrivi CAP e città del fornitore");
        }
        else if (!a) out.push("scegli il negozio che riceve");
        else if (a === da) out.push("partenza e arrivo sono lo stesso negozio");
        if (societa.length > 1 && !soc) out.push("scegli di quale società è la merce: un documento ne trasporta una sola");
        if (!totPezzi) out.push("non hai scelto niente da spedire");
        scelti.forEach(([cod, n]) => {
            const g = perCodice.get(cod);
            if (g && Number(n) > Number(g.quantita)) out.push(`di «${g.descrizione}» ne stai spedendo ${n} ma a ${da} ce ne sono ${g.quantita}`);
        });
        return out;
    }, [righeVive, da, a, fuori, dest, destPiva, destVia, destCiv, destCap, destCitta, soc, societa, totPezzi, scelti, perCodice]);

    const crea = async () => {
        if (cosaManca.length || busy) return;
        setBusy(true);
        try {
            const aNome = fuori ? dest.trim() : a;
            const { data: creato, error } = await supabase.from("mag_ddt").insert({
                da_negozio: da, a_negozio: aNome,
                // LA SOCIETÀ SEGUE LA MERCE: passata esplicita, se no il trigger
                // la dedurrebbe dal NEGOZIO — e a Donna sarebbe quella sbagliata
                azienda_da: soc || null,
                /* E ANCHE QUELLA DI ARRIVO, con lo stesso valore che l'operatore
                   ha appena letto nel riquadro sopra. Lasciarla al trigger
                   faceva uscire due esiti fiscali diversi sulla stessa tratta a
                   minuti di distanza: la sua ricerca sui pezzi del negozio di
                   arrivo non filtra lo stato, e per convenzione un pezzo in
                   transito porta GIÀ il negozio di destinazione — quindi il
                   primo DDT usciva «cessione» e il secondo «beni propri».
                   Se il software mostra «la merce passa da X a Y», il documento
                   deve dire X → Y (regola §7). */
                azienda_a: (fuori ? soc : aziendaArrivo) || null,
                tipo, stato: fuori ? "uscito" : "in_transito",
                aspetto, trasporto, colli: colli.trim() ? Number(colli) : null,
                creato_da: utente, note: note.trim() || null,
                destinatario: fuori ? dest.trim() : null,
                destinatario_piva: fuori ? (destPiva.trim() || null) : null,
                destinatario_indirizzo: fuori ? (destVia.trim() || null) : null,
                destinatario_civico: fuori ? (destCiv.trim() || null) : null,
                destinatario_cap: fuori ? (destCap.trim() || null) : null,
                destinatario_citta: fuori ? (destCitta.trim() || null) : null,
                destinatario_provincia: fuori ? (destProv.trim().toUpperCase() || null) : null,
                ...(fuori ? { causale: "Reso a fornitore", chiuso_da: utente, chiuso_il: oraIso() } : {}),
            }).select().single();
            if (error || !creato) throw new Error(error?.message || "il documento non è stato creato");
            const d = creato as Ddt;

            const righe = [
                ...Array.from(pezzi).map(id => unita.find(u => u.id === id)).filter(Boolean).map((u, i) => ({
                    ddt_id: d.id, riga: i + 1, codice: u!.codice, descrizione: u!.descrizione,
                    unita_id: u!.id, seriale: u!.seriale, quantita: 1,
                    valore_unitario: u!.valore ?? anagrafica.get(u!.codice || "")?.prezzo ?? null,
                    negozio_da: da, negozio_a: aNome, azienda_da: d.azienda_da, azienda_a: d.azienda_a,
                    stato: fuori ? "uscita" : "in_viaggio",
                })),
                ...scelti.map(([cod, n], i) => {
                    const g = perCodice.get(cod)!;
                    return {
                        ddt_id: d.id, riga: pezzi.size + i + 1, codice: cod, descrizione: g.descrizione,
                        unita_id: null, seriale: null, quantita: Number(n),
                        valore_unitario: anagrafica.get(cod)?.prezzo ?? null,
                        negozio_da: da, negozio_a: aNome, azienda_da: d.azienda_da, azienda_a: d.azienda_a,
                        stato: fuori ? "uscita" : "in_viaggio",
                    };
                }),
            ];
            const { error: er } = await supabase.from("mag_ddt_righe").insert(righe);
            if (er) throw new Error("le righe del documento non sono state scritte: " + er.message);

            /* I PEZZI CON SERIALE ESCONO DALLA DISPONIBILITÀ DI CHI SPEDISCE.
               `.eq("stato","disponibile")` è la guardia: fra l'apertura della
               pagina e questo clic il pezzo può essere stato venduto al banco
               o tolto dall'amministrazione. Se non si muove NON si fa finta di
               niente — il documento direbbe che sta viaggiando una cosa che non
               è mai partita: la riga si chiude subito e chi ha spedito lo legge
               a schermo (regola §7). */
            const storiePartenza = await storieCorrenti(Array.from(pezzi));
            const perse: { id: string; nome: string }[] = [];
            await Promise.all(Array.from(pezzi).map(async id => {
                const u = unita.find(x => x.id === id);
                const { data } = await supabase.from("mag_unita").update(fuori
                    ? { stato: "annullato", ddt_id: d.id, storia: conTappa(storiePartenza.get(id), "📤 Uscito dal gruppo", da, utente, `reso a ${aNome} — DDT n.${d.numero}`) }
                    : { stato: "in_transito", negozio: a, ddt_id: d.id, storia: conTappa(storiePartenza.get(id), "🚚 Partito con un DDT", `${da} → ${a}`, utente, `DDT n.${d.numero}`) }
                ).eq("id", id).eq("stato", "disponibile").select("id");
                if (!data?.length) perse.push({ id, nome: `${u?.descrizione || "un pezzo"} (${u?.seriale || id})` });
            }));
            if (perse.length) {
                /* «MAI PARTITA», non «non arrivata»: la riga è già CHIUSA e non
                   ha bisogno di nessuna decisione — quel pezzo è ancora dal
                   mittente, o è stato venduto, o è stato cestinato. Chiamarla
                   «mancante» la metteva fra le differenze aperte, e poi il
                   modale raccontava un viaggio che non è mai cominciato. */
                await supabase.from("mag_ddt_righe").update({
                    stato: "mai_partita", quantita_accettata: 0,
                    motivo: "non era più disponibile alla partenza: venduto o tolto dal magazzino nel frattempo",
                    chiusa_il: oraIso(), chiusa_da: utente,
                }).eq("ddt_id", d.id).in("unita_id", perse.map(x => x.id));
                alert(`Il documento è partito, ma ${perse.length === 1 ? "un pezzo non era più disponibile" : `${perse.length} pezzi non erano più disponibili`}:\n\n· ${perse.map(x => x.nome).join("\n· ")}\n\nQuelle righe sono segnate «mai partita»: la merce è rimasta a ${da}.`);
            }

            // le quantità: un movimento, e il saldo si muove da sé
            let uscitaOk = true;
            if (scelti.length) {
                const { error: em } = await supabase.from("mag_movimenti").insert(scelti.map(([cod, n]) => ({
                    codice: cod, negozio: da, azienda: soc || d.azienda_da,
                    tipo: fuori ? "rettifica" : "trasferimento_out",
                    quantita: fuori ? -Number(n) : Number(n),
                    ddt_id: d.id, operatore: utente,
                    nota: fuori ? `reso a ${aNome} — DDT n.${d.numero}` : `trasferimento a ${aNome} — DDT n.${d.numero}`,
                })));
                if (em) {
                    uscitaOk = false;
                    /* LE RIGHE A QUANTITÀ SI CHIUDONO SUBITO (revisore 31/08).
                       La guardia esisteva ma copriva SOLO i gemelli: fuori da
                       lì il documento partiva con le righe «in viaggio» e la
                       giacenza del mittente intatta. Chi riceve preme
                       «accetta» e scrive il +n senza che sia mai esistito il
                       −n: venti cover in più nel gruppo, nate dal nulla.
                       Ora quelle righe nascono già chiuse come «mai partita»,
                       che è la verità: dal magazzino non è uscito niente. */
                    await supabase.from("mag_ddt_righe").update({
                        stato: "mai_partita", quantita_accettata: 0,
                        motivo: `la merce non è uscita dal magazzino di ${da}: ${em.message}`,
                        chiusa_il: oraIso(), chiusa_da: utente,
                    }).eq("ddt_id", d.id).is("unita_id", null);
                    alert(`Il documento n.${d.numero} è emesso, ma le quantità NON sono uscite dal magazzino:\n\n${em.message}\n\nQuelle righe sono segnate «mai partita»: la merce è rimasta a ${da}. Rifai il trasferimento quando è sistemato.`);
                }
            }

            /* I GEMELLI: la merce non si muove, il documento si chiude subito.
               Se restasse in viaggio, un telefono a quaranta centimetri
               resterebbe invendibile finché l'altra insegna non preme un
               bottone — e le due insegne sono la stessa persona. */
            /* MA NON SE LA MERCE NON È USCITA. Accettare dopo un
               `trasferimento_out` fallito scriverebbe il `trasferimento_in`
               senza il suo contrario: merce creata dal nulla, +n a destinazione
               e nessun −n alla partenza (revisore 31/08). */
            if (gemelli && uscitaOk) {
                const { data: rr } = await supabase.from("mag_ddt_righe").select("*").eq("ddt_id", d.id);
                const lista = (rr ?? []) as RigaDdt[];
                const tutte: Record<string, number> = {};
                lista.forEach(r => { tutte[r.id] = pezziDi(r); });
                const { avvisi } = await prendiInCarico(d, lista, tutte, "", utente);
                if (avvisi.length) alert("Il passaggio fra gemelli è stato emesso, ma:\n\n· " + avvisi.join("\n· "));
            } else if (gemelli) {
                alert("Il documento è emesso ma NON si è chiuso da solo: la merce non è uscita dal magazzino di partenza. Sistemala e poi prendilo in carico a mano.");
            }
            dopo();
        } catch (e) {
            alert("Trasferimento non partito: " + ((e as Error)?.message || "errore"));
        } finally { setBusy(false); }
    };

    return (
        <div className="rvBox">
            <div className="rvBoxT">🚚 Nuovo trasferimento</div>
            <div className="rvPillRow">
                <button onClick={() => setFuori(false)} className={cn("rvPill rvPill-sm", !fuori && "rvPill-on")}>🔁 Da un negozio a un altro</button>
                <button onClick={() => setFuori(true)} className={cn("rvPill rvPill-sm", fuori && "rvPill-on")}>📤 Reso a un fornitore</button>
            </div>
            <div className="rvBarra mt-3">
                <div className="rvCampo rvCampo-md"><span className="rvLab">Parte da</span>
                    <SelectOpzioni className="rvIn" value={da} onChange={setDa} opzioni={negozi} placeholder="scegli il negozio…" /></div>
                {fuori ? (
                    <>
                        <label className="rvCampo rvCampo-md"><span className="rvLab">A chi</span>
                            <input value={dest} onChange={e => setDest(e.target.value)} className="rvIn" placeholder="ragione sociale del fornitore" /></label>
                        <label className="rvCampo rvCampo-sm"><span className="rvLab">Partita IVA</span>
                            <input value={destPiva} onChange={e => setDestPiva(e.target.value)} className="rvIn" placeholder="11 cifre" /></label>
                        <label className="rvCampo rvCampo-flex"><span className="rvLab">Via</span>
                            <input value={destVia} onChange={e => setDestVia(e.target.value)} className="rvIn" placeholder="via o piazza" /></label>
                        <label className="rvCampo rvCampo-xs"><span className="rvLab">Civico</span>
                            <input value={destCiv} onChange={e => setDestCiv(e.target.value)} className="rvIn" /></label>
                        <label className="rvCampo rvCampo-xs"><span className="rvLab">CAP</span>
                            <input value={destCap} onChange={e => setDestCap(e.target.value)} className="rvIn" /></label>
                        <label className="rvCampo rvCampo-sm"><span className="rvLab">Città</span>
                            <input value={destCitta} onChange={e => setDestCitta(e.target.value)} className="rvIn" /></label>
                        <label className="rvCampo rvCampo-xs"><span className="rvLab">Prov.</span>
                            <input value={destProv} onChange={e => setDestProv(e.target.value)} maxLength={2} className="rvIn" /></label>
                    </>
                ) : (
                    <div className="rvCampo rvCampo-md"><span className="rvLab">Arriva a</span>
                        <SelectOpzioni className="rvIn" value={a} onChange={setA} opzioni={negozi.filter(n => n !== da)} placeholder="scegli il negozio…" /></div>
                )}
                {societa.length > 1 && (
                    <div className="rvCampo"><span className="rvLab">Società della merce</span>
                        <div className="rvPillRow">
                            {societa.map(c => (
                                <button key={c} onClick={() => { setSoc(c); setPezzi(new Set()); setQta({}); }}
                                    className={cn("rvPill rvPill-sm", soc === c && "rvPill-on")}>{nomiAzienda[c] || c}</button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* CHE COSA STA SUCCEDENDO, detto prima di premere */}
            {!!da && (!!a || fuori) && (
                <div className={cn("rvNota", tipo === "trasferimento" ? "rvNota-info" : tipo === "gemelli" ? "rvNota-scelta" : "rvNota-att")}>
                    <div className="rvNota-t">{TIPI_DDT[tipo].ico} {TIPI_DDT[tipo].et}</div>
                    <div className="rvNota-s">
                        {TIPI_DDT[tipo].spiega}
                        {tipo === "cessione" && soc && (
                            <> Qui la merce passa da <b>{nomiAzienda[soc] || soc}</b> a <b>{nomiAzienda[aziendaArrivo || ""] || aziendaArrivo}</b>.</>
                        )}
                    </div>
                </div>
            )}

            {/* CON DUE SOCIETÀ NELLO STESSO NEGOZIO la merce non si sceglie prima
                di dire di chi è: le righe a quantità sono una per società e lo
                stesso codice comparirebbe due volte con una casella sola. Donna
                Olimpia è esattamente questo caso. */}
            {da && societa.length > 1 && !soc && (
                <div className="rvNota rvNota-info">
                    <div className="rvNota-t">🏛 Di quale società è la merce?</div>
                    <div className="rvNota-s">A {da} convivono {societa.map(c => nomiAzienda[c] || c).join(" e ")}. Un documento di trasporto lo emette un soggetto solo: scegli qui sopra, e sotto compare la sua merce.</div>
                </div>
            )}
            {da && (societa.length <= 1 || !!soc) && (
                <div className="rvSub mt-3">
                    <label className="rvCerca">
                        <Search size={16} />
                        <input value={filtro} onChange={e => setFiltro(e.target.value)} className="rvIn"
                            placeholder="Filtra la merce di questo negozio…" />
                    </label>
                    <div className="rvDett max-h-72 overflow-y-auto mt-2 pr-1">
                        {!!disponibili.length && <div className="rvDettT">Pezzi con seriale</div>}
                        {disponibili.slice(0, 200).map(u => (
                            <label key={u.id} className="rvDettR rvDettR-cl">
                                <input type="checkbox" checked={pezzi.has(u.id)}
                                    onChange={e => setPezzi(p => { const s = new Set(p); if (e.target.checked) s.add(u.id); else s.delete(u.id); return s; })} />
                                <span className="rvTab-nome">{u.descrizione}</span>
                                <span className="rvDettR-mono">{u.seriale}</span>
                                {u.azienda && <span className="rvTab-min">· {nomiAzienda[u.azienda] || u.azienda}</span>}
                            </label>
                        ))}
                        {disponibili.length > 200 && <div className="rvTab-min">…e altri {disponibili.length - 200}: scrivi qualcosa per restringere.</div>}
                        {!!sfusi.length && <div className="rvDettT mt-2">Merce a quantità <span className="rvLabX">(accessori, SIM: prima non si poteva spedire)</span></div>}
                        {sfusi.slice(0, 200).map(g => (
                            <div key={g.codice + g.azienda} className="rvDettR">
                                <span className="rvTab-nome">{g.descrizione}</span>
                                <span className="rvTab-cod">{g.codice}</span>
                                <span className="rvTab-min">a scaffale <b className="rvGiac rvGiac-si">{g.quantita}</b></span>
                                <span className="rvSpazio" />
                                <input type="number" min={0} max={g.quantita} value={qta[g.codice] ?? ""} placeholder="0"
                                    onChange={e => setQta(p => ({ ...p, [g.codice]: Number(e.target.value) }))}
                                    className="rvQta" />
                            </div>
                        ))}
                        {sfusi.length > 200 && <div className="rvTab-min">…e altri {sfusi.length - 200}: scrivi qualcosa per restringere.</div>}
                        {!disponibili.length && !sfusi.length && (
                            <div className="rvVuoto">📭<b>Niente da spedire a {da}</b>
                                <small>{soc ? `di ${nomiAzienda[soc] || soc}` : ""}{q ? ` con «${filtro}»` : ""}</small></div>
                        )}
                    </div>
                </div>
            )}

            <div className="rvBarra mt-3">
                <label className="rvCampo rvCampo-xs"><span className="rvLab">Colli</span>
                    <input type="number" min={1} value={colli} onChange={e => setColli(e.target.value)} className="rvIn" placeholder="1" /></label>
                <label className="rvCampo rvCampo-sm"><span className="rvLab">Aspetto dei beni</span>
                    <input value={aspetto} onChange={e => setAspetto(e.target.value)} className="rvIn" /></label>
                <label className="rvCampo rvCampo-md"><span className="rvLab">Trasporto a cura di</span>
                    <input value={trasporto} onChange={e => setTrasporto(e.target.value)} className="rvIn" /></label>
                <label className="rvCampo rvCampo-flex"><span className="rvLab">Note</span>
                    <input value={note} onChange={e => setNote(e.target.value)} className="rvIn" placeholder="facoltative, finiscono sul documento" /></label>
            </div>

            {/* COSA MANCA, sopra il bottone e non dentro un tooltip: sui monitor
                da negozio il passaggio del mouse non esiste (regola §7). */}
            {cosaManca.length > 0 ? (
                <div className="rvPrima">
                    <div className="rvPrima-t">Prima di emettere il documento</div>
                    {cosaManca.map(m => <div key={m} className="rvManca rvManca-qui"><i>·</i>{m}</div>)}
                </div>
            ) : (
                <div className="rvPronto">✓ {totPezzi} {totPezzi === 1 ? "pezzo pronto" : "pezzi pronti"} da {da} {fuori ? `a ${dest}` : `a ${a}`}{gemelli ? " — stesso locale, il documento si chiude subito" : ""}</div>
            )}
            <div className="rvBarra rvBarra-c mt-3 justify-end">
                <button onClick={crea} disabled={busy || cosaManca.length > 0} className="rvAzione">
                    {busy && <Loader2 className="w-4 h-4 animate-spin inline-block align-[-3px] mr-2" />}
                    {busy ? "Emetto il documento…" : `Emetti il DDT (${totPezzi})`}
                </button>
            </div>
        </div>
    );
}

function Carico({ negozi, aziende, utente, dopo }: { negozi: string[]; aziende: string[]; utente: string; dopo: () => void }) {
    const [descrizione, setDescrizione] = useState(""); const [codice, setCodice] = useState("");
    const [negozio, setNegozio] = useState(""); const [azienda, setAzienda] = useState("");
    const [valore, setValore] = useState(""); const [tipo, setTipo] = useState("imei");
    const [seriali, setSeriali] = useState(""); const [busy, setBusy] = useState(false);
    const salva = async () => {
        const lista = seriali.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
        if (!descrizione.trim() || !negozio || !lista.length) return;
        setBusy(true);
        const v = valore.trim() === "" ? null : Number(valore.replace(",", "."));
        const { error } = await supabase.from("mag_unita").insert(lista.map(s => ({
            seriale: s, tipo_seriale: tipo, codice: codice.trim() || null, descrizione: descrizione.trim(),
            azienda: azienda || null, negozio, valore: v, caricato_da: utente,
            storia: [{ quando: new Date().toISOString(), evento: "📥 Carico", negozio, operatore: utente }],
        })));
        setBusy(false);
        if (error) { alert("Carico non riuscito: " + error.message); return; }
        dopo();
    };
    return (
        <div className="rvBox">
            <div className="rvBoxT">📥 Carico merce</div>
            <div className="rvBarra">
                <label className="rvCampo rvCampo-flex"><span className="rvLab">Descrizione articolo</span>
                    <input value={descrizione} onChange={e => setDescrizione(e.target.value)} placeholder='es. "iPhone 15 128GB Nero"' className="rvIn" /></label>
                <label className="rvCampo rvCampo-xs"><span className="rvLab">Codice</span>
                    <input value={codice} onChange={e => setCodice(e.target.value)} className="rvIn" /></label>
                <div className="rvCampo rvCampo-md"><span className="rvLab">Negozio</span>
                    <SelectOpzioni className="rvIn" value={negozio} onChange={setNegozio}
                        opzioni={negozi} placeholder="scegli il negozio…" /></div>
                <div className="rvCampo rvCampo-sm"><span className="rvLab">Azienda</span>
                    <SelectOpzioni className="rvIn" value={azienda} onChange={setAzienda}
                        opzioni={Array.from(new Set([...aziende, "T1", "T2"]))} placeholder="—" /></div>
                <label className="rvCampo rvCampo-xs"><span className="rvLab">Valore unitario €</span>
                    <input value={valore} onChange={e => setValore(e.target.value)} className="rvIn" /></label>
            </div>
            {/* TRE VOCI E UNA SOLA VALIDA: una tendina si può svuotare, e un
                carico senza tipo di seriale finirebbe a DB con il campo vuoto.
                Le pastiglie non hanno lo stato «niente» (regola 7). */}
            {/* `.rvCampo`, non un <div> nudo: `.rvLab` ha `margin-bottom`, e su
                uno <span> INLINE quel margine non si applica — era l'unica
                etichetta della pagina attaccata al suo controllo. */}
            <div className="rvCampo mt-3">
                <span className="rvLab">Tipo seriale</span>
                <div className="rvPillRow">
                    {([["imei", "IMEI"], ["sim", "SIM (ICCID)"], ["seriale", "Seriale"]] as const).map(([k, l]) => (
                        <button key={k} onClick={() => setTipo(k)} className={cn("rvPill rvPill-sm", tipo === k && "rvPill-on")}>{l}</button>
                    ))}
                </div>
            </div>
            <label className="rvCampo mt-3"><span className="rvLab">Seriali <span className="rvLabX">(uno per riga — spara pure col lettore barcode)</span></span>
                <textarea value={seriali} onChange={e => setSeriali(e.target.value)} rows={5} className="rvIn font-mono" /></label>
            <div className="rvBarra rvBarra-c mt-3 justify-end">
                <button onClick={salva} disabled={busy || !descrizione.trim() || !negozio || !seriali.trim()} className="rvAzione">
                    {busy ? "Carico…" : "Carica le unità"}
                </button>
            </div>
        </div>
    );
}

/* ── 📚 ARTICOLI (task Luca 13/08) ───────────────────────────────────────
   Anagrafica articoli dall'export giacenze del gestionale: SOLO i
   riferimenti (niente disponibilità). La divisione "per brand" corre su due
   assi: GRUPPO = listino/famiglia del gestionale (chips coi conteggi),
   MARCA = produttore (tendina, valorizzata soprattutto sui device).
   I costi li vede solo amministrazione in su; il prezzo lo vedono tutti. */
function Articoli({ vedeCosti }: { vedeCosti: boolean }) {
    const [articoli, setArticoli] = useState<Articolo[]>([]);
    const [loading, setLoading] = useState(true);
    const [gruppo, setGruppo] = useState("");
    const [marca, setMarca] = useState("");
    const [cerca, setCerca] = useState("");

    useEffect(() => {
        (async () => {
            const { data } = await caricaTutte<Articolo>((from, to) =>
                supabase.from("mag_articoli").select("*").order("codice").range(from, to) as never);
            setArticoli((data ?? []) as Articolo[]);
            setLoading(false);
        })();
    }, []);

    const gruppi = useMemo(() => {
        const m = new Map<string, number>();
        articoli.forEach(a => { const g = a.gruppo || "Senza gruppo"; m.set(g, (m.get(g) || 0) + 1); });
        return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
    }, [articoli]);
    const marche = useMemo(() =>
        Array.from(new Set(articoli.map(a => a.marca).filter(Boolean))).sort() as string[], [articoli]);

    const filtrati = useMemo(() => articoli.filter(a => {
        if (gruppo && (a.gruppo || "Senza gruppo") !== gruppo) return false;
        if (marca && a.marca !== marca) return false;
        if (cerca) {
            const q = cerca.toLowerCase();
            if (!`${a.codice} ${a.barcode || ""} ${a.descrizione}`.toLowerCase().includes(q)) return false;
        }
        return true;
    }), [articoli, gruppo, marca, cerca]);

    const TETTO = 300;
    const visibili = filtrati.slice(0, TETTO);

    const esporta = () => {
        const dati: CellaXlsx[][] = filtrati.map(a => [
            a.codice, a.barcode || "", a.descrizione, a.gruppo || "", a.sottogruppo || "", a.marca || "",
            a.prezzo ?? "", ...(vedeCosti ? [a.costo_ultimo ?? ""] : []),
        ]);
        scaricaXlsx(`articoli_${gruppo || "tutti"}_${new Date().toISOString().slice(0, 10)}.xlsx`,
            ["Codice", "Barcode", "Descrizione", "Gruppo", "Sottogruppo", "Marca", "Prezzo €", ...(vedeCosti ? ["Costo €"] : [])],
            dati, "Articoli");
    };

    if (loading) return <div className="rvCarico"><Loader2 className="w-6 h-6 animate-spin" /> Carico l&apos;anagrafica articoli…</div>;
    return (
        <div className="space-y-4">
            {/* chips dei GRUPPI coi conteggi: la divisione per brand a colpo
                d'occhio. `rvPillRow-fitta` stringe il contorno, non il testo:
                i gruppi sono tanti e devono stare in poche righe. */}
            <div className="rvPillRow rvPillRow-fitta">
                <button onClick={() => setGruppo("")} className={cn("rvPill rvPill-sm", !gruppo && "rvPill-on")}>
                    Tutti · {articoli.length}
                </button>
                {gruppi.map(([g, n]) => (
                    <button key={g} onClick={() => setGruppo(gruppo === g ? "" : g)}
                        className={cn("rvPill rvPill-sm", gruppo === g && "rvPill-on")}>
                        {g} · {n}
                    </button>
                ))}
            </div>
            <div className="rvBox">
                <div className="rvBoxT">📚 Anagrafica articoli</div>
                <div className="rvBarra">
                    {/* la className SOSTITUISCE il default di SelectOpzioni: con
                        `w-44` il campo restava senza vestito (niente bordo, né
                        angoli, né imbottitura) — ci vuole `.rvIn` diretta. */}
                    <div className="rvCampo rvCampo-sm"><span className="rvLab">Marca</span>
                        <SelectOpzioni value={marca} onChange={setMarca} opzioni={marche} placeholder="Tutte" className="rvIn" />
                    </div>
                    <label className="rvCampo rvCampo-flex"><span className="rvLab">Cerca <span className="rvLabX">(codice, barcode, descrizione)</span></span>
                        <span className="rvCerca">
                            <Search size={16} />
                            <input value={cerca} onChange={e => setCerca(e.target.value)} placeholder="Es. Galaxy A16, 8032325…"
                                className="rvIn" />
                        </span>
                    </label>
                    <span className="rvSpazio" />
                    <button onClick={esporta} disabled={!filtrati.length} className="rvAzione rvAzione-sm">
                        <FileDown size={14} className="inline-block align-[-2px] mr-1.5" /> Excel
                    </button>
                </div>
            </div>
            <div className="rvTabBox">
                <table className="rvTab">
                    <thead>
                        <tr>
                            <th>Codice</th>
                            <th>Barcode</th>
                            <th>Descrizione</th>
                            <th>Sottogruppo</th>
                            <th>Marca</th>
                            <th className="rvTab-c">Prezzo</th>
                            {vedeCosti && <th className="rvTab-c">Costo ult.</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {visibili.map(a => (
                            <tr key={a.codice} className="rvTab-riga">
                                <td className="rvTab-cod">{a.codice}</td>
                                <td className="rvTab-cod">{a.barcode || "—"}</td>
                                <td className="rvTab-nome">{a.descrizione}</td>
                                <td className="rvTab-min">{a.sottogruppo || "—"}</td>
                                <td className="rvTab-min">{a.marca || "—"}</td>
                                <td className="rvTab-n">{eur(a.prezzo)}</td>
                                {vedeCosti && <td className="rvTab-n rvTab-min">{eur(a.costo_ultimo)}</td>}
                            </tr>
                        ))}
                        {!filtrati.length && <tr><td colSpan={vedeCosti ? 7 : 6} className="rvTab-vuoto">Nessun articolo con questi filtri.</td></tr>}
                    </tbody>
                </table>
                {filtrati.length > TETTO && (
                    <div className="rvTab-pie">
                        Mostro i primi {TETTO} di {filtrati.length.toLocaleString("it-IT")} articoli — affina coi filtri o usa l&apos;Excel per l&apos;elenco completo.
                    </div>
                )}
            </div>
        </div>
    );
}
