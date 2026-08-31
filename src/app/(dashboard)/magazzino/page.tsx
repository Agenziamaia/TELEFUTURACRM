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
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Boxes, FileDown, Loader2, PackagePlus, Search, Truck } from "lucide-react";
import { famigliaDalNome } from "@/lib/cassaCatalogo";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import { isAdminOrAbove } from "@/lib/roles";
import { caricaTutte } from "@/lib/fetchTutte";
import { scaricaXlsx, type CellaXlsx } from "@/lib/exportXlsx";
import { SelectOpzioni, SelectMulti } from "@/components/SelectPersona";
import { cn } from "@/utils";
import { splitNegozi, stessoMagazzino } from "@/lib/negoziNomi";
import { useRolePermissions } from "@/lib/usePermissions";
import { capAllowed, CAP_MAGAZZINO, CAP_MAGAZZINO_VALORI } from "@/lib/capabilities";
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
type DatiArticolo = { descrizione: string; prezzo: number | null; costo_ultimo?: number | null; gruppo: string | null; marca: string | null };
type Articolo = {
    codice: string; barcode: string | null; descrizione: string;
    gruppo: string | null; sottogruppo: string | null; marca: string | null;
    iva_acquisto: string | null; iva_vendita: string | null;
    costo_ultimo: number | null; prezzo: number | null; attivo: boolean;
    /** in cassa quel prezzo si può correggere? (Luca 29/08) */
    prezzo_modificabile?: boolean;
    /** il numero che il registratore stampa sulla riga: decide l'IVA */
    reparto?: number | null;
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
/* ═══ I QUADRATONI DELLE GIACENZE (Luca 01/09) ═══════════════════════════
   «Voglio la stessa logica, anche grafica, di Gestione Usati: quei quadratoni
   grandi col menu e il filtraggio impostato in quel modo.»

   La grammatica che si copia è quella: un multi-selettore disegnato a griglia,
   ogni riquadro con l'icona, l'etichetta, la spunta quando è acceso e il
   numero grande sotto; i riquadri a zero restano a schermo, spenti, perché
   zero è un'informazione.
   Il MARKUP invece non si copia: Gestione Usati è scritta a mano con le
   utility, e con lei si porterebbe dentro anche il suo difetto — nel tema
   chiaro tre di quei pulsanti hanno il testo quasi bianco su fondo chiaro,
   perché `text-purple-100`, `text-blue-100` e `text-orange-100` non sono
   rimappati. Il magazzino segue le sue regole, e la classe giusta esisteva
   già: `.rvRapido`, nata per i pulsanti rapidi della cassa, che ha le sue
   righe per il tema chiaro e non usa le media query sulla finestra.

   QUALI RIQUADRI: solo quelli alimentati da dati che esistono davvero. Niente
   «Venduti» e niente «In viaggio» — `mag_unita` ha zero venduti e non c'è
   nessun DDT in transito: sarebbero due riquadri che dicono sempre zero, e
   restano pastiglie-vista. */
const QUADRI: {
    id: string; icona: string; et: string; unita: string;
    tinta?: string; spiega: string; vista?: "trasferiti" | "venduto"; euro?: boolean;
}[] = [
    { id: "altrove", icona: "🌐", et: "Altrove", unita: "articoli", tinta: "rvT-viola", spiega: "Quello che qui non c'è ma sta in un altro punto vendita: si può farsi mandare" },
    { id: "_all", icona: "📦", et: "Tutto", unita: "articoli", tinta: "rvT-indaco", spiega: "Tutta la merce ancora tua nei punti vendita che stai guardando: a scaffale, in arrivo, sotto zero e quella che sta solo negli altri" },
    { id: "disponibile", icona: "🟢", et: "Disponibili", unita: "articoli", tinta: "rvT-verde", spiega: "Gli articoli con giacenza maggiore di zero: quello che c'è adesso sullo scaffale" },
    { id: "in_arrivo", icona: "🚛", et: "In arrivo", unita: "articoli", tinta: "rvT-ciano", spiega: "Ordinato o in viaggio verso qui: non si vende ancora" },
    { id: "trasferiti", icona: "🚚", et: "Trasferiti", unita: "righe", spiega: "Apre la lista della merce in viaggio che ti riguarda: partita da qui e non ancora accettata, o in arrivo con un documento da accettare", vista: "trasferiti" },
    { id: "venduto", icona: "🧾", et: "Venduti", unita: "pezzi", spiega: "Apre il venduto pezzo per pezzo, con l'IMEI e il prezzo di uscita", vista: "venduto" },
    { id: "sotto_zero", icona: "⚠️", et: "Sotto zero", unita: "articoli", tinta: "rvT-rosso", spiega: "Righe a saldo negativo: è uscito qualcosa che a magazzino non c'era" },
    { id: "val_vendita", icona: "💰", et: "Valore a listino", unita: "€", tinta: "rvT-ambra", spiega: "Quanto vale, ai prezzi di listino, la merce a scaffale nei punti vendita che stai guardando", euro: true },
    { id: "val_acquisto", icona: "🏷️", et: "Valore a costo", unita: "€", tinta: "rvT-bronzo", spiega: "Quanto è costata la merce a scaffale nei punti vendita che stai guardando", euro: true },
];

/* IL CORPO DEL NUMERO SEGUE LA SUA LUNGHEZZA. Non è un vezzo: a 24px un
   importo a sei cifre col simbolo misura 145px e nel riquadro ce ne stanno
   124 — usciva dal bordo. Le soglie sono misurate su quei 124, e si calcolano
   sulla STESSA stringa che va a schermo: non possono divergere da quello che
   si vede. Il numero non si tronca mai — un numero tagliato è un numero falso. */
const corpoNumero = (t: string) => t.length >= 11 ? "rvNum-s" : t.length >= 8 ? "rvNum-m" : undefined;



/* IL VENDUTO NON È UNO STATO, È UN'ALTRA DOMANDA (revisore design 31/08).
   Premendolo cambiano le colonne, il filtro di data cambia mestiere, due
   pastiglie spariscono e l'Excel esporta un altro file: è un cambio di
   schermata travestito da filtro. Il CRM ha già il posto giusto — la fila
   «📄 Documenti / 📦 Merce mossa» dei Trasferimenti — e con lei arriva il
   conteggio, che nelle Giacenze non c'era da nessuna parte. */
/** Euro TONDI, per i riquadri di sintesi. Su mezzo milione i centesimi non
 *  dicono niente e allungano il numero fuori dal riquadro (Luca 01/09). Nelle
 *  tabelle invece `eur()` resta com'è: lì il centesimo è il conto. */
const eurTondo = (n: number | null | undefined) => n == null ? "—"
    : Number(n).toLocaleString("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 });

const gg = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleDateString("it-IT") : "—";
const gghh = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const eur = (v: number | null | undefined) => v == null ? "—" : v.toLocaleString("it-IT", { style: "currency", currency: "EUR" });

export default function MagazzinoPage() {
    const { user } = useAuth();
    /* CHI VEDE QUANTO VALE IL MAGAZZINO (Luca 01/09). I due riquadri in cima
       alle Giacenze, affiancati, dicono il margine dell'intero magazzino: non
       è un dato da bancone. Il diritto si decide dalla rotellina in
       Amministrazione → Utenti → Permessi, come tutte le altre capacità, e di
       partenza è dall'amministrativo in su. */
    const { perms } = useRolePermissions(user?.role, user?.grade, user?.id);
    const vedeValori = !!user && capAllowed(user.role, CAP_MAGAZZINO.section, CAP_MAGAZZINO_VALORI, perms);
    // consultazione per tutti; trasferimenti per chi gestisce; il CARICO
    // merce solo amministrazione in su (segnalazione Francesco 12/08)
    const gestisce = ["admin", "dev", "direttore_generale", "store_manager"].includes(user?.role || "");
    const puoCaricare = isAdminOrAbove(user?.role);
    const [tab, setTab] = useState<"giacenze" | "trasferimenti" | "articoli">("giacenze");
    /* LA SEZIONE ARRIVA DALL'INDIRIZZO (Luca 01/09): il magazzino è diventato
       un hub nel menù — Giacenze, Trasferimenti, Articoli — e ogni voce deve
       portare dove dice. I pulsanti in alto restano: chi è già dentro cambia
       sezione senza tornare al menù. */
    useEffect(() => {
        const t = new URLSearchParams(window.location.search).get("tab");
        if (t === "giacenze" || t === "trasferimenti" || t === "articoli") setTab(t);
    }, []);
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
                .select("codice,descrizione,prezzo,costo_ultimo,gruppo,marca").in("codice", codici.slice(i, i + 300));
            (data ?? []).forEach((a: DatiArticolo & { codice: string }) =>
                anag.set(a.codice, { descrizione: a.descrizione, prezzo: a.prezzo, gruppo: a.gruppo, marca: a.marca }));
        }
        setAnagrafica(anag);
        setQuantita(righeQ.map(r => ({
            ...r,
            inArrivo: Number(r.in_arrivo || 0),
            descrizione: anag.get(r.codice)?.descrizione || r.codice,
            valore: Number(anag.get(r.codice)?.prezzo || 0) * Number(r.quantita),
            /* IL COSTO, separato dal prezzo. Prima esisteva un solo campo
               «valore» e ci finivano dentro tutti e due: le quantità al PREZZO
               DI LISTINO e i pezzi con seriale al COSTO D'ACQUISTO, sommati.
               Quel totale non era né l'uno né l'altro (576.648,99 € contro i
               590.905 di vendita e i 407.116 di acquisto).
               `costo_ultimo` sopra i 5.000 € non è un costo: è un codice a
               barre finito nel campo sbagliato — ce n'era uno, un caricatore
               da 39,95 € con 8.018.420.000.000 di costo. */
            costo: (() => { const c = Number(anag.get(r.codice)?.costo_ultimo || 0); return c > 0 && c <= 5000 ? c * Number(r.quantita) : 0; })(),
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
                    anagrafica={anagrafica} mioNegozio={user?.negozio || ""} puoCancellare={puoCaricare} vedeValori={vedeValori}
                    ricarica={carica} utente={user?.name || "—"} />
            ) : tab === "articoli" ? (
                <Articoli vedeCosti={puoCaricare} puoDefinire={puoCaricare} />
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
type FiltroId = "_all" | "disponibile" | "in_arrivo" | "altrove" | "sotto_zero";
type RigaQta = { codice: string; descrizione: string; negozio: string; azienda: string; quantita: number; inArrivo: number; valore: number; costo: number };

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

function Giacenze({ unita, quantita, negozi, aziende, nomiAzienda, anagrafica, mioNegozio, puoCancellare, vedeValori, ricarica, utente }: {
    unita: Unita[]; quantita: RigaQta[]; negozi: string[]; aziende: string[];
    nomiAzienda: Record<string, string>; anagrafica: Map<string, DatiArticolo>;
    mioNegozio: string; puoCancellare: boolean;
    /** vede i due riquadri col valore del magazzino? (rotellina Permessi) */
    vedeValori: boolean;
    ricarica: () => void; utente: string;
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
    /* UN RIQUADRO ALLA VOLTA. Da quando premere ISOLA invece di sommare, le
       tre variabili di prima — stati, soloDisponibili, sottoZero — erano solo
       la codifica di «quale riquadro è premuto»: una sola è più semplice, non
       più complessa, e chiude tutta la classe di errori in cui il numero e la
       tabella dicevano cose diverse.
       Si entra su «Disponibili»: dietro al bancone la prima domanda è «ce
       l'ho?», e «In arrivo» è a un clic col suo numero già a schermo. */
    const [quadro, setQuadro] = useState<FiltroId>("disponibile");
    /* TRE DOMANDE, NON DUE (Luca 01/09, col confronto sugli Usati): una fila
       sola di pastiglie — Disponibili e In arrivo accese, Trasferiti e Venduti
       spente — e premendo una delle due spente si apre la sua schermata coi
       suoi filtri. Prima «quello che ho venduto» stava in una riga a parte, in
       fondo, staccata dagli stati a cui appartiene. */
    const [vista, setVista] = useState<"giacenze" | "venduto" | "trasferiti">("giacenze");
    const vistaVenduto = vista === "venduto";
    const vistaTrasf = vista === "trasferiti";
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
        giacenza: number; inArrivo: number; altrove: number;
        /** quanto vale se lo vendo ai prezzi di listino */ valore: number;
        /** quanto mi è costato */ costo: number;
        operatore: string | null;
        pezzi: { id: string; seriale: string; negozio: string; stato: string; valore: number | null }[];
        /* le quantità, negozio per negozio e società per società: il cestino
           deve poter togliere UNA riga precisa, non un totale */
        qtaPer: { negozio: string; azienda: string; quantita: number; inArrivo: number }[];
        altrovePer: Record<string, number>;
    };

    /* LA REGOLA DI OGNI RIQUADRO È SCRITTA UNA VOLTA SOLA, e serve sia al
       numero grande sia alla tabella: non possono più dire due cose diverse.
       Prima erano due scritture separate e divergevano davvero: «Tutto»
       contava le sole righe di qui ma la tabella mostrava anche quelle che
       stanno solo altrove; «Disponibili» contava giacenza>0 ma la tabella
       rimetteva dentro le righe negative; e premere «Altrove» produceva lo
       stesso identico stato di «Tutto», accendendo il riquadro sbagliato. */
    const REGOLA: Record<FiltroId, (r: Riga) => boolean> = useMemo(() => ({
        _all: r => r.giacenza !== 0 || r.inArrivo > 0 || r.altrove > 0,
        disponibile: r => r.giacenza > 0,     // «devono essere quelli con giacenza maggiore di 0» (Luca)
        in_arrivo: r => r.inArrivo > 0,
        altrove: r => r.giacenza === 0 && r.inArrivo === 0 && r.altrove > 0,
        sotto_zero: r => r.giacenza < 0,
    }), []);
    /* quanti PEZZI stanno dietro quelle righe: è il secondo numero, quello
       della riga piccola. «Sotto zero» conta i pezzi CHE MANCANO, che è la
       domanda vera quando una giacenza va sotto. */
    const PEZZI: Record<FiltroId, (r: Riga) => number> = useMemo(() => ({
        _all: r => Math.max(r.giacenza, 0) + r.inArrivo + r.altrove,
        disponibile: r => r.giacenza,
        in_arrivo: r => r.inArrivo,
        altrove: r => r.altrove,
        sotto_zero: r => -r.giacenza,
    }), []);

    const righeGrezze = useMemo(() => {
        const m = new Map<string, Riga>();
        const nuova = (codice: string, descrizione: string): Riga => ({
            chiave: `${codice}|${descrizione}`, codice: codice || "—", descrizione,
            giacenza: 0, inArrivo: 0, altrove: 0, valore: 0, costo: 0,
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
                if (vivo) { r.giacenza++; r.costo += Number(u.valore || 0); r.valore += Number(anagrafica.get(u.codice || "")?.prezzo || 0); r.pezzi.push({ id: u.id, seriale: u.seriale, negozio: u.negozio, stato: u.stato, valore: u.valore }); }
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
                    r.costo += Number(g.costo || 0);
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
        return out;
    }, [unita, quantita, anagrafica, scelti, azienda, operatori, cerca, dataStorica, nelloScopo]);

    /* I QUADRATONI CONTANO PRIMA DEL PROPRIO FILTRO (è la regola di Gestione
       Usati, dove `kpiData` applica tutto tranne gli stati): se contassero
       dopo, il riquadro spento direbbe zero e nessuno lo premerebbe mai. */
    /* OGNI RIQUADRO DICE QUANTE RIGHE VEDRAI PREMENDOLO. È l'unica regola che
       tiene: prima «Totale» diceva 1667 anche stando a Mazzini, che di articoli
       ne ha 135, perché contava pure quelli che stanno negli altri negozi.
       E «Disponibili» contava PEZZI mentre «Totale» contava ARTICOLI: due
       riquadri identici, due unità diverse, nessun rapporto fra i numeri.
       Adesso il numero grande è sempre lo stesso mestiere — quante righe —
       e i pezzi stanno nella riga piccola sotto, dove sono un dettaglio. */
    /* I RIQUADRI CONTANO PRIMA DEL PROPRIO FILTRO — è la regola di Gestione
       Usati: un riquadro spento deve dire quanti ce ne sarebbero, se no
       nessuno lo preme mai. Ma conta con LA STESSA REGOLA che poi filtra la
       tabella, così il numero grande è una promessa verificabile: premi,
       guardi la tabella, e le righe sono quelle. */
    const conteggi = useMemo(() => {
        const ids = Object.keys(REGOLA) as FiltroId[];
        const righeN = {} as Record<FiltroId, number>, pezzi = {} as Record<FiltroId, number>;
        ids.forEach(k => { righeN[k] = 0; pezzi[k] = 0; });
        let val_vendita = 0, val_acquisto = 0;
        for (const r of righeGrezze) {
            for (const k of ids) if (REGOLA[k](r)) { righeN[k]++; pezzi[k] += PEZZI[k](r); }
            /* i due valori sono di quello che sta A SCAFFALE: valorizzare la
               merce in arrivo, che ancora non è nostra, gonfia un numero su
               cui si decide. */
            if (r.giacenza > 0) { val_vendita += r.valore; val_acquisto += r.costo; }
        }
        return { righe: righeN, pezzi, val_vendita, val_acquisto };
    }, [righeGrezze, REGOLA, PEZZI]);

    /* QUANTA MERCE RESTA FUORI DAI DUE VALORI, e si dice invece di tacere
       (regola 7). Oggi: 32 pezzi con seriale non hanno un prezzo di listino e
       2.420 pezzi a quantità non hanno un costo d'acquisto — i due totali sono
       calcolati su quello che c'è, e chi legge deve saperlo. */
    const { senzaPrezzo, senzaCosto } = useMemo(() => {
        let p = 0, c = 0;
        for (const r of righeGrezze) {
            if (r.giacenza === 0 && r.inArrivo === 0) continue;
            if (!r.valore && r.giacenza > 0) p += r.giacenza;
            if (!r.costo && r.giacenza > 0) c += r.giacenza;
        }
        return { senzaPrezzo: p, senzaCosto: c };
    }, [righeGrezze]);

    const righe = useMemo(() => {
        /* la fotografia a una data passata non conosce «in arrivo» né
           «altrove»: vale la giacenza e basta, come già era. */
        const regola = dataStorica ? (r: Riga) => r.giacenza !== 0 : REGOLA[quadro];
        const out = righeGrezze.filter(regola);
        const val = (r: Riga, c: number) => c === 0 ? r.codice : c === 1 ? r.descrizione
            : c === 2 ? r.giacenza : c === 3 ? r.altrove : c === 4 ? r.inArrivo : r.valore;
        out.sort((a, b) => {
            const va = val(a, sort.col), vb = val(b, sort.col);
            const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
            return sort.desc ? -cmp : cmp;
        });
        return out;
    }, [righeGrezze, quadro, dataStorica, sort, REGOLA]);

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
        /* SI CONTA ANCHE SENZA ENTRARCI (revisore design 01/09). Prima questa
           riga tornava un elenco vuoto finché non si premeva, quindi il
           riquadro «Venduti» diceva 0 e si spegneva: a colpo d'occhio
           «qui non c'è niente». Un riquadro di conteggio deve contare. */
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
    }, [unita, anagrafica, dal, al, azienda, operatori, cerca, nelloScopo]);

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
    /* LA MERCE USCITA DA QUI E NON ANCORA ARRIVATA. «In arrivo» racconta già
       i pezzi che vengono VERSO di noi (su un pezzo in viaggio il negozio è la
       destinazione); questa è l'altra faccia, che nessuna schermata mostrava:
       quello che è partito e di cui siamo ancora responsabili finché qualcuno
       non lo accetta. Si legge dai DDT in transito, che sono la prova
       documentale del passaggio. */
    const [inViaggio, setInViaggio] = useState<{ id: string; numero: string | null; da_negozio: string; a_negozio: string; emesso_il: string; seriale: string | null; codice: string | null; descrizione: string | null; qta: number | null }[] | null>(null);
    useEffect(() => {
        // si carica al montaggio, non al clic: il riquadro deve poter contare
        let vivo = true;
        (async () => {
            const { data: ddt, error } = await supabase.from("mag_ddt")
                .select("id,numero,da_negozio,a_negozio,emesso_il").eq("stato", "in_transito").order("emesso_il", { ascending: false }).limit(200);
            if (error) console.error("ddt in transito:", error.message);
            const ids = (ddt ?? []).map((d: { id: string }) => d.id);
            const righeDdt = ids.length
                ? (await supabase.from("mag_ddt_righe").select("ddt_id,seriale,codice,descrizione,qta").in("ddt_id", ids)).data ?? []
                : [];
            if (!vivo) return;
            const perId = new Map((ddt ?? []).map((d: { id: string }) => [d.id, d]));
            setInViaggio((righeDdt as { ddt_id: string; seriale: string | null; codice: string | null; descrizione: string | null; qta: number | null }[])
                .map(r => { const d = perId.get(r.ddt_id) as { id: string; numero: string | null; da_negozio: string; a_negozio: string; emesso_il: string }; return { ...d, seriale: r.seriale, codice: r.codice, descrizione: r.descrizione, qta: r.qta }; })
                /* ANCHE QUELLI CHE ARRIVANO, non solo quelli partiti. La merce
                   che l'import ha trovato «in arrivo» viaggia con un documento
                   il cui mittente è «Import»: guardando solo `da_negozio`,
                   chi la riceve non la vedrebbe da nessuna parte. In viaggio è
                   in viaggio: riguarda tutti e due i capi. */
                .filter(r => !scelti.length
                    || scelti.some(x => stessoMagazzino(r.da_negozio, x) || stessoMagazzino(r.a_negozio, x))));
        })();
        return () => { vivo = false; };
    }, [scelti]);

    /* PREMERE UN QUADRATONE. Stessa logica di Gestione Usati: i riquadri di
       stato si sommano in OR, e l'ultimo acceso non si spegne — una tabella
       senza nemmeno uno stato non mostra niente e sembra rotta. */
    /* PREMERE UN RIQUADRO ISOLA QUEL GRUPPO. Non si sommano: «se non voglio
       vedere i disponibili ma i venduti, mi passa dai disponibili ai venduti»
       (Luca). Due di loro — Trasferiti e Venduti — sono un'altra schermata:
       cambiano colonne, filtri di data ed Excel, e stanno nella stessa fila
       perché per chi guarda sono la stessa domanda, «cosa c'è e dov'è finito». */
    /* COSA FA OGNI CLIC.
       · un riquadro di FILTRO isola quel gruppo: «se non voglio vedere i
         disponibili ma i venduti, mi passa dai disponibili ai venduti»
         (Luca 01/09), e la stessa frase vale fra due filtri;
       · un riquadro di SCHERMATA — quelli col filetto e la freccia — entra
         nella sua lista e LASCIA IL FILTRO DOV'ERA: premendolo di nuovo si
         torna esattamente a quello che si stava guardando;
       · i due valori sono una lettura, non un filtro: non si premono. */
    const premiQuadro = (id: string) => {
        const q = QUADRI.find(x => x.id === id);
        if (!q || q.euro) return;
        if (q.vista) { setVista(vista === q.vista ? "giacenze" : q.vista); return; }
        setVista("giacenze");
        setQuadro(id as FiltroId);
    };
    /* Dentro una schermata NESSUN filtro mostra la spunta: dire «Disponibili è
       acceso» mentre a schermo c'è il venduto è un'etichetta che mente. */
    const quadroAcceso = (id: string) => vista !== "giacenze"
        ? QUADRI.find(q => q.id === id)?.vista === vista
        : id === quadro;

    const azzeraFiltri = () => {
        setScelti(mieiNegozi.length ? mieiNegozi : []);
        setQuadro("disponibile"); setVista("giacenze");
        setAzienda(""); setOperatori([]); setCerca(""); setDataStorica("");
    };

    /** «è nel negozio che sto guardando?» — decide il colore della pastiglia
     *  del luogo, e prima era scritto due volte uguale dentro l'elemento. */
    const quiDa = (neg: string) => scelti.length ? nelloScopo(neg) : neg === mioNegozio;

    /* I MIEI NEGOZI: il mio e chi divide con me il magazzino. */
    const mieiNegozi = useMemo(() =>
        mioNegozio ? negozi.filter(n => stessoMagazzino(n, mioNegozio)) : [], [negozi, mioNegozio]);
    const sonoIMiei = mieiNegozi.length > 0 && scelti.length === mieiNegozi.length
        && mieiNegozi.every(n => scelti.includes(n));
    /* GIÀ SCELTI ALL'INGRESSO: la domanda normale, dietro al bancone, è
       «cos'ho qui» — non «cos'ha il gruppo». Una volta sola: se poi uno
       allarga a tutti i negozi, non gli si richiude sotto le mani. */
    const primaVolta = useRef(true);
    useEffect(() => {
        if (!primaVolta.current || !mieiNegozi.length) return;
        primaVolta.current = false;
        setScelti(mieiNegozi);
    }, [mieiNegozi]);

    return (
        <div className="space-y-4">
            <div className="rvBox">
                {/* I DUE VALORI IN ALTO A DESTRA (Luca 01/09), come negli Usati:
                    non sono filtri e non si premono, e fuori dalla griglia non
                    devono più stare nella sagoma di un conteggio — che è il
                    motivo per cui uscivano dal bordo e disallineavano la fila. */}
                <div className="rvBoxTop">
                    <div className="rvBoxT">🔎 Cosa guardo</div>
                    <div className="rvValori">
                        {(vedeValori ? QUADRI.filter(q => q.euro) : []).map(q => (
                            <div key={q.id} className={cn("rvValore", q.tinta)} title={q.spiega}>
                                <em>{eurTondo(q.id === "val_vendita" ? conteggi.val_vendita : conteggi.val_acquisto)}</em>
                                <b>{q.icona} {q.et}</b>
                                <small>su {conteggi.righe.disponibile.toLocaleString("it-IT")} articoli a scaffale</small>
                            </div>
                        ))}
                    </div>
                </div>
                {/* DOVE GUARDO — il mio negozio è già scelto */}
                <div className="rvLab">Dove guardo</div>
                <div className="rvBarra rvBarra-c">
                    {/* «I MIEI» sono il mio negozio E il suo gemello (Luca 01/09):
                        chi sta a Magliana ha un magazzino solo diviso su due
                        insegne, e vederne metà non serve a niente. È già scelto
                        all'ingresso: la domanda normale è «cos'ho qui». */}
                    {mieiNegozi.length > 0 && (
                        <button onClick={() => setScelti(mieiNegozi)}
                            className={cn("rvPill rvPill-sm", sonoIMiei && "rvPill-on")}>
                            🏪 I miei{mieiNegozi.length > 1 ? <span className="rvLabX"> · {mieiNegozi.length} insegne</span> : ""}{sonoIMiei ? " ✓" : ""}
                        </button>
                    )}
                    <button onClick={() => setScelti([])} className={cn("rvPill rvPill-sm", !scelti.length && "rvPill-on")}>🌐 Tutti i negozi{!scelti.length ? " ✓" : ""}</button>
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
                {/* ═══ I QUADRATONI ═══════════════════════════════════════
                    Il numero è calcolato PRIMA del proprio filtro (come
                    `kpiData` negli Usati): un riquadro spento deve dire quanti
                    ce ne sarebbero, se no nessuno lo premerebbe mai. E i
                    riquadri a zero restano a schermo, spenti: zero è
                    un'informazione — «Sotto zero: 0» vuol dire che i conti
                    tornano, e non vederlo non è la stessa cosa. */}
                {/* ═══ I QUADRATONI ═══════════════════════════════════════
                    OGNUNO DICE QUANTE RIGHE VEDRAI PREMENDOLO, e premerlo
                    ISOLA quel gruppo (Luca 01/09: «se non voglio vedere i
                    disponibili ma i venduti, mi passa dai disponibili ai
                    venduti; se clicco su Totale me li fai vedere tutti»).
                    Prima si sommavano fra loro e partivano in due accesi: il
                    primo clic su «In arrivo» lo SPEGNEVA e la tabella non
                    cambiava — sembrava rotto.
                    E il numero grande fa sempre lo stesso mestiere: quante
                    righe. I pezzi stanno nella riga piccola, dove sono un
                    dettaglio; prima «Totale 1667 articoli» e «Disponibili
                    12.546 pezzi» stavano affiancati come se fossero un
                    rapporto, e non lo erano. */}
                <div className="rvCampo rvCampo-flex mt-3"><span className="rvLab">Cosa c&apos;è in magazzino</span>
                    <div className="rvRapidoG rvRapidoG-kpi">
                        {QUADRI.filter(q => !q.euro).map(q => {
                            const on = quadroAcceso(q.id);
                            const euro = false;
                            // il numero grande: quante righe vedrai premendo
                            const n = q.id === "trasferiti" ? (inViaggio?.length ?? 0)
                                : q.id === "venduto" ? venduti.length
                                    : euro ? (q.id === "val_vendita" ? conteggi.val_vendita : conteggi.val_acquisto)
                                        : conteggi.righe[q.id as FiltroId];
                            const testo = euro ? eurTondo(n) : n.toLocaleString("it-IT");
                            // la riga piccola: sempre «unità · secondo numero»
                            const sotto = euro ? `su ${conteggi.righe.disponibile.toLocaleString("it-IT")} articoli`
                                : q.id === "trasferiti" ? `${q.unita} · ${new Set((inViaggio ?? []).map(r => r.id)).size} documenti`
                                    : q.id === "venduto" ? `${q.unita} · nel periodo scelto`
                                        : q.id === "sotto_zero" ? `${q.unita} · ${conteggi.pezzi.sotto_zero.toLocaleString("it-IT")} mancanti`
                                            : `${q.unita} · ${conteggi.pezzi[q.id as FiltroId].toLocaleString("it-IT")} pezzi`;
                            const cls = cn("rvRapido", q.tinta, euro && "rvRapido-statico",
                                q.vista ? cn("rvRapido-vista", on && "rvRapido-vista-on") : on && "rvRapido-on",
                                !on && !n && "rvRapido-off");
                            const dentro = (
                                <>
                                    <em className={corpoNumero(testo)}>{testo}</em>
                                    <b>{q.icona} {q.et}{on ? " ✓" : ""}</b>
                                    <small>{sotto}</small>
                                </>
                            );
                            return euro
                                ? <div key={q.id} title={q.spiega} className={cls}>{dentro}</div>
                                : <button key={q.id} type="button" onClick={() => premiQuadro(q.id)} title={q.spiega} className={cls}>{dentro}</button>;
                        })}
                    </div>
                    <div className="rvHint">
                        Premi un riquadro per vedere solo quello; il numero grande dice quante righe vedrai.
                        I due col filetto e la freccia ↗ non filtrano questa tabella: aprono la loro lista,
                        con le sue colonne e il suo Excel — premili di nuovo per tornare qui.
                        {senzaPrezzo > 0 || senzaCosto > 0 ? ` I due valori escludono ${senzaPrezzo ? `${senzaPrezzo} pezzi senza prezzo di listino` : ""}${senzaPrezzo && senzaCosto ? " e " : ""}${senzaCosto ? `${senzaCosto} senza costo d'acquisto` : ""}.` : ""}
                    </div>
                </div>
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
                            🕰 Storico</button>
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
                    <button onClick={azzeraFiltri} className="rvPill rvPill-sm"
                        title="Rimette tutto com'è entrando: i miei negozi, disponibili e in arrivo">
                        ↺ Reset
                    </button>
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
            {vistaTrasf ? (
                /* LA MERCE CHE È USCITA E NON È ANCORA ARRIVATA. Finché
                   l'altro negozio non accetta il documento, quei pezzi sono
                   ancora responsabilità di chi li ha spediti — ed è l'unica
                   schermata che lo dice. */
                <div className="rvTabBox">
                    <table className="rvTab">
                        <thead>
                            <tr><th>Documento</th><th>Da → A</th><th>Emesso</th><th>Pezzo</th><th className="rvTab-c">Qtà</th></tr>
                        </thead>
                        <tbody>
                            {inViaggio === null && <tr><td colSpan={5} className="rvTab-vuoto">Carico…</td></tr>}
                            {inViaggio?.length === 0 && (
                                <tr><td colSpan={5} className="rvTab-vuoto">
                                    Niente in viaggio: tutto quello che è partito è già stato accettato.
                                </td></tr>
                            )}
                            {(inViaggio ?? []).map((r, i) => (
                                <tr key={`${r.id}-${r.seriale || r.codice || i}`} className="rvTab-riga">
                                    <td className="rvTab-cod">{r.numero || "—"}</td>
                                    <td className="rvTab-nome">{r.da_negozio} → {r.a_negozio}</td>
                                    <td className="rvTab-min">{gg(r.emesso_il)}</td>
                                    <td className="rvTab-nome">{r.descrizione || r.codice || "—"}{r.seriale ? <span className="rvTab-min"> · {r.seriale}</span> : null}</td>
                                    <td className="rvTab-n">{r.seriale ? 1 : (r.qta ?? 1)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : vistaVenduto ? (
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
                            {quadro !== "altrove" && " Prova il riquadro «🌐 Altrove» per vedere quello che sta in un altro negozio."}
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
       partita IVA, senza indirizzi, senza la firma. */
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
        // stampa è quello che si aspetta chi preme «DDT», e la copia e' una sola
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
        if (visibili.length > 60 && !confirm(`Stai per mettere ${visibili.length} documenti in un file solo (${visibili.length} pagine, una per documento). Vado avanti?`)) return;
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
                                                    <button onClick={() => stampa(d)} className="rvPill rvPill-sm" title="Il documento pronto da firmare (una copia: se ne servono altre, si ristampa)">🖨 DDT</button>
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
{/* CAUSALE, ASPETTO, TRASPORTO E NOTE NON SI MOSTRANO PIÙ (Luca 01/09:
                                                        «queste informazioni non servono, quando apro un
                                                        trasferimento mostrami solo il contenuto»).
                                                        Restano nel documento e finiscono sul DDT stampato,
                                                        dove servono davvero: a schermo chi apre una riga
                                                        vuole sapere cosa c'è dentro, non com'è confezionato.
                                                        Il destinatario esterno resta, quando c'è: quello
                                                        dice a CHI sta andando la merce, che è contenuto. */}
                                                    {d.destinatario && (
                                                        <div className="rvDettR">
                                                            <span className="rvTab-min">Destinatario</span>
                                                            <span><b>{d.destinatario}</b>{d.destinatario_piva ? ` · P.IVA ${d.destinatario_piva}` : ""}</span>
                                                        </div>
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

/* ── 📚 ARTICOLI ─────────────────────────────────────────────────────────
   Luca 31/08: «per quanto riguarda la selezione degli articoli c'è molta
   confusione… mi piacerebbe riportare l'impostazione che abbiamo inserito
   all'interno di registra vendita anche qui dentro articoli… devo poter
   filtrare anche per brand per esempio».

   PERCHÉ ERA CONFUSO, misurato sui 17.061 articoli veri: i «gruppi» del
   gestionale non sono famiglie di prodotto, sono LISTINI DI FORNITORE —
   «LISTINO SBS» (4.974 pezzi), «ACCESSORI SYSTEMAITALIA» (2.716). Chi cerca
   una pellicola non pensa «SBS». E il sottogruppo manca su 10.702 articoli,
   la marca su 13.454: non ci si può filtrare sopra.

   COSA C'È ADESSO, come alla cassa: una fila di FAMIGLIE con l'icona e il
   conteggio, e dentro ognuna le sue sotto-voci. Le famiglie non stanno a
   database perché non sono una scelta di assortimento come i gruppi della
   cassa: sono la lettura di un export che arriva già fatto così: se un
   giorno il gestionale cambia, si cambia qui e si vede subito.

   Tre assi di filtro, non uno: FAMIGLIA (cosa è), OPERATORE (di chi è il
   listino — la stessa deduzione che usa Giacenze) e MARCA (chi lo produce).
   ------------------------------------------------------------------------ */

/** Le famiglie, in ordine: vince la PRIMA che riconosce l'articolo. Perciò
 *  «Telefoni» sta prima di «Accessori»: gli smartphone dei listini operatore
 *  hanno il gruppo del listino, e finirebbero fra gli accessori. */
const FAMIGLIE: { id: string; icona: string; nome: string; dentro: (g: string, s: string, d: string, c: string) => boolean }[] = [
    { id: "telefoni", icona: "📱", nome: "Telefoni", dentro: (_g, s) => /smartphone|^telefoni$|mobile phone/.test(s) },
    { id: "usato", icona: "♻️", nome: "Usato", dentro: (g) => g === "usato" },
    /* I RICAMBI SONO UNA FAMIGLIA A SÉ (Luca 01/09: «fanno parte del mondo
       dell'assistenza tecnica, così come display e tutto il resto»). Nel
       gestionale non esistono come categoria: stanno dentro «Accessori» (391)
       e nei listini dei fornitori.
       QUANTI SONO DAVVERO: ~430, non di più. Ho provato a riconoscere anche
       flat, flex, scocche, connettori e altoparlanti, e sui dati veri erano
       tutti falsi positivi — «Flat HDMI cable» è un cavo, «Auricolare a
       capsula» è un auricolare, «Antenna adapter» è un adattatore TV, e
       l'unico «BACK COVER» è un iPhone usato rotto. Quello che il catalogo
       distingue per davvero sono i DISPLAY e le BATTERIE (codice `BATT…`
       attaccato al modello: 279 su 291). Il resto dei ricambi, se c'è,
       nell'export non si vede — e inventarlo sarebbe peggio che dirlo. */
    {
        id: "ricambi", icona: "🧩", nome: "Ricambi", dentro: (_g, _s, d, c) =>
            /^\s*display|^\s*glue\b|display (iphone|samsung|per|redmi|xiaomi)|nudo batterie/.test(d)
            || /^batt/.test(c),
    },
    { id: "sim", icona: "📶", nome: "SIM ed eSIM", dentro: (g, s) => /usim/.test(g) || s === "sim" },
    { id: "internet", icona: "🛜", nome: "Internet e router", dentro: (_g, s) => /internet key|internet device|router|hub|offerta casa/.test(s) },
    { id: "indossabili", icona: "⌚", nome: "Wearable e smart device", dentro: (_g, s) => /wearable|smart device|smart pass|iot/.test(s) },
    { id: "tablet", icona: "💻", nome: "Tablet e computer", dentro: (_g, s) => /tablet|mini pc|console|camera/.test(s) },
    /* UTILITY (Luca 01/09: «questi non sono articoli, questi devono essere
       Utily, cose come acconto ecc»). Dentro il gruppo «SERVIZI» del gestionale
       convivono due cose diverse: i SERVIZI che si vendono davvero — assistenza
       36,60 €, backup 20 €, taglio SIM 5 € — e le VOCI TECNICHE, che merce non
       sono e nemmeno servizio: gli acconti (uno per trattamento IVA), il cambio
       righe generiche `ART22_GENERICO` / `ART74_GENERICO` che
       servono solo a battere un importo a una certa aliquota.
       Si riconoscono da come sono scritte: il gestionale marca le voci di
       sistema col dollaro (`$ACCONTO$22`, `$SM$CI_1`) e le generiche col
       suffisso `_GENERICO`. Sta PRIMA di «Servizi» perché quasi tutte hanno
       proprio quel gruppo. */
    {
        id: "utility", icona: "🧮", nome: "Utility", dentro: (_g, _s, d, c) =>
            /^\$/.test(c) || /_generico$/.test(c) || /acconto|caparra|anticipo/.test(d),
    },
    { id: "servizi", icona: "🧾", nome: "Servizi e ricariche", dentro: (g, s) => /^(servizi|ricariche|kpoint)$/.test(g) || /ricariche|carte servizi|^servizi$/.test(s) },
    { id: "accessori", icona: "🧰", nome: "Accessori", dentro: (g, s) => /accessori|listino sbs|systemaitalia/.test(g) || /accessori/.test(s) },
];
const ALTRO = { id: "altro", icona: "📦", nome: "Altro" };

/** La famiglia di un articolo. Mai `null`: quello che non si riconosce sta in
 *  «Altro», che è una risposta onesta — nasconderlo no. */
/* NOMI CHE DICONO IL DISPOSITIVO, non l'articolo. Dentro «Accessori» il nome
   porta quasi sempre il telefono a cui l'accessorio serve — «Book Case for
   Samsung Galaxy A34» — e una sotto-voce «Telefoni» dentro gli accessori è
   una bugia utile a nessuno: si preferisce ammettere di non sapere. */
const NON_DICONO_COSA_E = new Set(["Telefoni", "Tablet", "SIM", "eSIM", "Usato"]);
const LEGGO_DAL_NOME = new Set(["accessori", "servizi", "altro", "ricambi"]);   // «utility» no: i loro nomi sono già la voce
function sottoVoceDalNome(a: Articolo, fam: string): string | null {
    /* Solo dove il gestionale tace davvero. Dentro «Usato» o «Telefoni» il
       nome è il MODELLO, e leggerlo come famiglia produce sotto-voci
       inventate: un Galaxy Z Flip che diventa «Custodie e cover». */
    if (!LEGGO_DAL_NOME.has(fam)) return null;
    const f = famigliaDalNome(a.descrizione, a.codice);
    return f && !NON_DICONO_COSA_E.has(f) ? f : null;
}

function famigliaDi(a: { gruppo: string | null; sottogruppo: string | null; descrizione?: string; codice?: string }): string {
    const g = String(a.gruppo || "").toLowerCase();
    const s = String(a.sottogruppo || "").toLowerCase();
    const d = String(a.descrizione || "").toLowerCase();
    const c = String(a.codice || "").toLowerCase();
    return (FAMIGLIE.find(f => f.dentro(g, s, d, c)) || ALTRO).id;
}

/* QUANDO UN ARTICOLO NON È PRONTO PER LA CASSA, e perché. Veniva dalla scheda
   del pannello amministrativo, che da oggi non c'è più: la definizione e la
   consultazione erano due schede diverse sugli stessi dati, e chi definiva non
   vedeva quello che vedevano i ragazzi. */
function problemaDi(a: Articolo): string | null {
    /* SENZA REPARTO LA RIGA NON VA SULLO SCONTRINO: fuori dalla modalità di
       prova il server la esclude, e il cliente paga una cosa che sul foglio
       non c'è. Oggi sono tre articoli, due dei quali Galaxy S24 da 899 e 959 €. */
    if (a.reparto == null) return "senza reparto IVA: sullo scontrino la riga verrebbe esclusa";
    if (a.prezzo == null) return "senza prezzo di vendita: in cassa non si può vendere";
    if (a.costo_ultimo == null) return "senza costo d'acquisto: il margine resta ignoto";
    if (a.costo_ultimo > 5000) return "il costo sembra un codice a barre finito nel campo sbagliato";
    if (a.costo_ultimo > a.prezzo) return "costa più di quanto lo vendiamo";
    return null;
}

function Articoli({ vedeCosti, puoDefinire }: { vedeCosti: boolean; puoDefinire: boolean }) {
    const [articoli, setArticoli] = useState<Articolo[]>([]);
    const [loading, setLoading] = useState(true);
    const [famiglia, setFamiglia] = useState("");
    const [sotto, setSotto] = useState("");
    const [operatore, setOperatore] = useState("");
    const [marca, setMarca] = useState("");
    const [cerca, setCerca] = useState("");
    /* LA SECONDA FILA PARTE CHIUSA (revisore 31/08). Misurata a 1366×768 col
       menù aperto, la prima riga di merce cadeva a y=454: tre righe di tabella
       visibili. Su iPad verticale otto file di pastiglie e la prima riga a
       y=543. Chi entra per leggere un prezzo — il caso normale — non deve
       pagare 160 pixel per un filtro che non aprirà. */
    /* GLI USATI FUORI DALL'ANAGRAFICA (Luca 01/09: «hanno una rotazione
       piuttosto veloce e sono quasi sempre pezzi unici, non so quanto ci
       conviene tenerli nel tracciamento degli articoli»).
       I NUMERI GLI DANNO RAGIONE: dei 3.217 articoli «USATO» che l'export del
       gestionale riversa qui, 3.214 non hanno giacenza da nessuna parte e
       NESSUNO è mai stato venduto passando da un codice articolo. Sono il 19%
       del catalogo e non servono a niente: un pezzo unico non si riordina, e
       un'anagrafica serve a riordinare.
       Gli usati veri stanno nella sezione Usati, uno per uno: 278 pezzi, 277
       col loro IMEI, con acquisto, lavorazione, vendita e margine. Rotazione
       mediana 7 giorni. Lì hanno senso; qui erano rumore.
       Restano raggiungibili con un pulsante: nascondere non è cancellare. */
    /* LA DEFINIZIONE, dall'amministrativo in su (Luca 01/09). Prezzo, costo e
       «in cassa si può correggere» si scrivono da qui, e la scrittura passa
       dal server: la tabella non è più modificabile dal browser. Chi non ha
       il ruolo consulta e basta, e il costo non lo vede proprio. */
    const [bozza, setBozza] = useState<Record<string, Partial<Articolo>>>({});
    const [salvando, setSalvando] = useState("");
    const [erroreSalva, setErroreSalva] = useState("");
    const [soloProblemi, setSoloProblemi] = useState(false);
    const [nuovo, setNuovo] = useState<Record<string, string> | null>(null);
    /* LA SCHEDA DELL'ARTICOLO (Luca 01/09): «cliccando su ogni articolo mi
       deve aprire una pagina con le varie disponibilità sui punti vendita e
       anche una sezione di storico con le ultime movimentazioni», e «devo
       avere anche la possibilità di modificarlo, dall'amministrativo in su».
       La modifica sta QUI e non nelle celle della tabella: la tabella si legge
       di corsa al banco, e un campo di testo dentro una riga che scorre è il
       modo migliore per cambiare il prezzo dell'articolo sbagliato. */
    const [scheda, setScheda] = useState<Articolo | null>(null);
    const [dispon, setDispon] = useState<{ negozio: string; quantita: number; in_arrivo: number; azienda: string | null }[] | null>(null);
    const [movim, setMovim] = useState<{ id: string; negozio: string; tipo: string; quantita: number; creato_il: string; operatore: string | null; nota: string | null; seriale: string | null }[] | null>(null);

    useEffect(() => {
        if (!scheda) { setDispon(null); setMovim(null); return; }
        let vivo = true;
        (async () => {
            const [g, m] = await Promise.all([
                supabase.from("mag_giacenze").select("negozio,quantita,in_arrivo,azienda")
                    .eq("codice", scheda.codice).order("negozio"),
                supabase.from("mag_movimenti").select("id,negozio,tipo,quantita,creato_il,operatore,nota,seriale")
                    .eq("codice", scheda.codice).order("creato_il", { ascending: false }).limit(40),
            ]);
            if (!vivo) return;
            if (g.error) console.error("giacenze articolo:", g.error.message);
            if (m.error) console.error("movimenti articolo:", m.error.message);
            setDispon((g.data ?? []) as never);
            setMovim((m.data ?? []) as never);
        })();
        return () => { vivo = false; };
    }, [scheda]);
    /* I REPARTI, per NOME e non per numero (dati alla mano: tre reparti sono
       tutti «N2 non soggetta», due «N5 regime del margine», due al 4%. Se uno
       sceglie il 6 invece del 3 lo scontrino esce identico, ma i totali per
       reparto — quelli che finiscono nel corrispettivo giornaliero — si
       spezzano in due. Quindi si sceglie il significato, e il numero segue). */
    const [reparti, setReparti] = useState<{ reparto: number; descrizione: string; aliquota: number | null; natura: string | null }[]>([]);
    useEffect(() => {
        supabase.from("pos_reparti").select("reparto,descrizione,aliquota,natura")
            .eq("attivo", true).order("reparto")
            .then(({ data, error }) => { if (error) console.error("reparti:", error.message); setReparti((data ?? []) as never); });
    }, []);
    const etichettaReparto = (n: number | null | undefined) => {
        if (n == null) return "—";
        const r = reparti.find(x => x.reparto === n);
        return r ? `${n} · ${r.descrizione}` : `${n}`;
    };
    /* GLI USATI NON SONO IN ANAGRAFICA e non c'è più niente da spiegare:
       la nota l'ha letta chi doveva (Luca 01/09: «toglimi sta voce che non
       serve»). Dei 3.217 articoli «USATO» dell'export, 3.214 non avevano
       giacenza e nessuno era mai stato venduto da qui; i pezzi veri stanno in
       Usati, uno per uno col loro IMEI. */
    const mostraUsato = false;
    const [apriSotto, setApriSotto] = useState(false);
    const [tutteLeSotto, setTutteLeSotto] = useState(false);

    useEffect(() => {
        (async () => {
            const { data } = await caricaTutte<Articolo>((from, to) =>
                supabase.from("mag_articoli").select("*").order("codice").range(from, to) as never);
            setArticoli((data ?? []) as Articolo[]);
            setLoading(false);
        })();
    }, []);

    /* Famiglia e operatore si calcolano UNA volta per articolo: su 17.000
       righe rifarlo a ogni battuta nella ricerca si sente. */
    const arricchiti = useMemo(() => articoli.map(a => ({
        ...a,
        _fam: famigliaDi(a),
        _op: operatoreDi(a, a.descrizione, a.codice),
        /* LA SOTTO-VOCE. Il sottogruppo quando c'è; se manca — 10.702
           articoli su 17.061 — si legge dal NOME con la stessa lista che dà
           le icone alla cassa: «Book Wallet Lite Case» è una custodia, non
           «LISTINO SBS». Solo se non si riconosce nemmeno così si ripiega
           sul listino del fornitore, che almeno dice da dove arriva. */
        _sotto: (a.sottogruppo || "").trim()
            || sottoVoceDalNome(a, famigliaDi(a))
            || (a.gruppo || "").trim() || "Senza sottogruppo",
    })).filter(a => mostraUsato || a._fam !== "usato").map(a => ({
        ...a,
        /* LA CHIAVE, senza maiuscole né spazi doppi. Il gestionale scrive lo
           stesso sottogruppo in due modi — «IOT» e «IoT», «INTERNET DEVICES» e
           «INTERNET DEVICE» — e senza normalizzare uscivano due pulsanti per
           la stessa cosa, ognuno con metà degli articoli. */
        _k: a._sotto.toUpperCase().replace(/\s+/g, " ").replace(/S$/, ""),
    })), [articoli, mostraUsato]);

    /* I CONTEGGI SEGUONO I FILTRI (Luca 01/09: «questi filtri devono essere
       adattivi, ho selezionato da sistemare ma non si aggiornano con la
       quantità aggiornata»). Si contano gli articoli che superano TUTTO tranne
       la famiglia e la sotto-voce: se contassi anche quelli, ogni pastiglia
       direbbe zero tranne quella accesa, che è inutile. Così invece la fila
       risponde alla domanda vera — «di quelli da sistemare, quanti sono
       telefoni e quanti accessori». */
    const passaFiltri = useMemo(() => {
        const q = cerca.trim().toLowerCase();
        return arricchiti.filter(a => {
            if (soloProblemi && !problemaDi(a)) return false;
            if (operatore && a._op !== operatore) return false;
            if (marca && a.marca !== marca) return false;
            if (q && !`${a.codice} ${a.barcode || ""} ${a.descrizione}`.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [arricchiti, soloProblemi, operatore, marca, cerca]);

    const conteggi = useMemo(() => {
        const m = new Map<string, number>();
        passaFiltri.forEach(a => m.set(a._fam, (m.get(a._fam) || 0) + 1));
        return m;
    }, [passaFiltri]);
    /* Quali famiglie ESISTONO in assoluto: le pastiglie restano ferme anche
       quando un filtro le porta a zero. Farle sparire mentre si scrive
       significa che il pulsante che stavi per premere si sposta. */
    const famiglieVive = useMemo(() => {
        const m = new Set<string>();
        arricchiti.forEach(a => m.add(a._fam));
        return m;
    }, [arricchiti]);

    /* Le sotto-voci della famiglia scelta, con quante ne contengono. Se ce
       n'è UNA sola non si mostra la fila: un pulsante che non divide niente
       è solo una riga in più da leggere. */
    const sottoVoci = useMemo(() => {
        if (!famiglia) return [] as [string, number, string, boolean][];
        const m = new Map<string, { n: number; grafie: Map<string, number> }>();
        passaFiltri.filter(a => a._fam === famiglia).forEach(a => {
            const c = m.get(a._k) || { n: 0, grafie: new Map<string, number>() };
            c.n++; c.grafie.set(a._sotto, (c.grafie.get(a._sotto) || 0) + 1);
            m.set(a._k, c);
        });
        // a schermo si scrive la grafia più diffusa, non la chiave in maiuscolo
        /* I RIPIEGHI IN FONDO (revisore 31/08). Quando il sottogruppo manca si
           ripiega sul GRUPPO, che è il nome del fornitore: ordinando per
           numerosità, «LISTINO SBS» finiva primo e più grosso, come se fosse
           una categoria. Non lo è, e adesso lo dice: sta in coda e si chiama
           «Non classificati». */
        const listini = new Set(passaFiltri.filter(a => !((a.sottogruppo || "").trim())
            && !sottoVoceDalNome(a, a._fam)).map(a => a._k));
        const v = Array.from(m.entries())
            .map(([k, c]) => {
                const grafia = Array.from(c.grafie.entries()).sort((x, y) => y[1] - x[1])[0][0];
                return [k, c.n, listini.has(k) ? `Non classificati (${grafia})` : grafia, listini.has(k)] as [string, number, string, boolean];
            })
            .sort((x, y) => (x[3] === y[3] ? y[1] - x[1] : x[3] ? 1 : -1));
        return v.length > 1 ? v : [];
    }, [passaFiltri, famiglia]);

    /* Le tendine mostrano solo quello che esiste DENTRO la selezione: offrire
       «Apple» quando si sta guardando le SIM è un filtro che dà zero righe. */
    const nelPerimetro = useMemo(() =>
        arricchiti.filter(a => (!famiglia || a._fam === famiglia) && (!sotto || a._k === sotto)),
        [arricchiti, famiglia, sotto]);
    const operatori = useMemo(() =>
        Array.from(new Set(nelPerimetro.map(a => a._op).filter(Boolean))).sort() as string[], [nelPerimetro]);
    const marche = useMemo(() =>
        Array.from(new Set(nelPerimetro.map(a => a.marca).filter(Boolean))).sort() as string[], [nelPerimetro]);

    const filtrati = useMemo(() =>
        passaFiltri.filter(a => (!famiglia || a._fam === famiglia) && (!sotto || a._k === sotto)),
        [passaFiltri, famiglia, sotto]);
    // «da sistemare» conta su tutto: è il numero che dice quanto lavoro resta
    const conProblema = useMemo(() => arricchiti.filter(a => a.attivo && problemaDi(a)).length, [arricchiti]);

    const TETTO = 300;
    /* SI GIRA PAGINA (Luca 01/09: «altrimenti non riesco a vedere gli altri»).
       Prima si vedevano i primi 300 e basta: con 8.292 articoli in una famiglia,
       gli altri 7.992 esistevano solo nell'Excel. */
    const [pagina, setPagina] = useState(0);
    const pagine = Math.max(1, Math.ceil(filtrati.length / TETTO));
    // cambiando filtro si torna alla prima: restare a pagina 12 di una lista
    // che adesso ne ha 3 vuol dire guardare una tabella vuota senza capire
    useEffect(() => { setPagina(0); }, [famiglia, sotto, operatore, marca, cerca, soloProblemi]);
    const pag = Math.min(pagina, pagine - 1);
    const visibili = filtrati.slice(pag * TETTO, (pag + 1) * TETTO);
    const nomeFam = (id: string) => (FAMIGLIE.find(f => f.id === id) || ALTRO).nome;

    /* Cambiare famiglia azzera la sotto-voce e i filtri: restare con «Apple»
       addosso passando da Telefoni a Servizi vuol dire una tabella vuota e
       un minuto perso a capire perché. */
    const scegliFamiglia = (id: string) => {
        setFamiglia(f => (f === id ? "" : id));
        setSotto(""); setOperatore(""); setMarca("");
    };

    const val = (a: Articolo, k: keyof Articolo) => (bozza[a.codice] && k in bozza[a.codice] ? bozza[a.codice][k] : a[k]);
    const cambia = (a: Articolo, k: keyof Articolo, v: unknown) =>
        setBozza(p => ({ ...p, [a.codice]: { ...p[a.codice], [k]: v } }));

    const salva = async (a: Articolo) => {
        const b = bozza[a.codice];
        if (!b || salvando) return;
        setSalvando(a.codice); setErroreSalva("");
        try {
            const r = await fetch("/api/magazzino/articoli", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ azione: "salva", codice: a.codice, ...b }),
            });
            const j = await r.json().catch(() => ({} as { ok?: boolean; error?: string }));
            if (!r.ok || !j.ok) throw new Error(j.error || "riprova");
            // si aggiorna la riga in mano, senza ricaricare 17.000 articoli
            setArticoli(p => p.map(x => (x.codice === a.codice ? { ...x, ...b } as Articolo : x)));
            setBozza(p => { const n = { ...p }; delete n[a.codice]; return n; });
        } catch (e) {
            setErroreSalva(`«${a.descrizione}»: ${(e as Error)?.message || "non salvato"}`);
        } finally { setSalvando(""); }
    };

    const creaArticolo = async () => {
        if (!nuovo || salvando) return;
        setSalvando("__nuovo"); setErroreSalva("");
        try {
            const r = await fetch("/api/magazzino/articoli", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ azione: "crea", ...nuovo }),
            });
            const j = await r.json().catch(() => ({} as { ok?: boolean; error?: string }));
            if (!r.ok || !j.ok) throw new Error(j.error || "riprova");
            setArticoli(p => [{
                codice: String(nuovo.codice).trim(), barcode: nuovo.barcode || null,
                descrizione: String(nuovo.descrizione).trim(),
                gruppo: nuovo.gruppo || null, sottogruppo: nuovo.sottogruppo || null, marca: nuovo.marca || null,
                iva_acquisto: null, iva_vendita: null,
                costo_ultimo: nuovo.costo_ultimo ? Number(nuovo.costo_ultimo) : null,
                prezzo: Number(nuovo.prezzo), attivo: true,
            } as Articolo, ...p]);
            setNuovo(null);
        } catch (e) {
            setErroreSalva((e as Error)?.message || "non creato");
        } finally { setSalvando(""); }
    };

    const esporta = () => {
        const dati: CellaXlsx[][] = filtrati.map(a => [
            a.codice, a.barcode || "", a.descrizione, nomeFam(a._fam), a._sotto, a._op || "", a.marca || "",
            a.prezzo ?? "", ...(vedeCosti ? [a.costo_ultimo ?? ""] : []),
        ]);
        // il nome porta i filtri: due export diversi non devono chiamarsi uguale
        const pezzi = [famiglia || "tutti", sotto, operatore, marca, cerca].filter(Boolean)
            .map(x => String(x).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")).filter(Boolean);
        scaricaXlsx(`articoli_${pezzi.join("_")}_${new Date().toISOString().slice(0, 10)}.xlsx`,
            ["Codice", "Barcode", "Descrizione", "Famiglia", "Sottogruppo", "Operatore", "Marca", "Prezzo €", ...(vedeCosti ? ["Costo €"] : [])],
            dati, "Articoli");
    };

    const totGiac = (dispon ?? []).reduce((n, r) => n + Number(r.quantita || 0), 0);
    const totArrivo = (dispon ?? []).reduce((n, r) => n + Number(r.in_arrivo || 0), 0);
    const inModifica = scheda ? bozza[scheda.codice] : null;

    const pannelloScheda = scheda && createPortal(
        <div className="rvFattaSfondo" onClick={e => { if (e.target === e.currentTarget) { setScheda(null); } }}>
            <div className="rvStoria rvScheda">
                <div className="rvStoria-t">
                    <div>
                        <div className="rvStoria-tit">{scheda.descrizione}</div>
                        <div className="rvStoria-sot">
                            {scheda.codice}{scheda.barcode ? ` · ${scheda.barcode}` : ""}
                            {scheda.marca ? ` · ${scheda.marca}` : ""}
                            {" · "}{etichettaReparto(scheda.reparto)}
                        </div>
                    </div>
                    <button type="button" className="rvPill rvPill-sm" onClick={() => setScheda(null)}>Chiudi</button>
                </div>

                {problemaDi(scheda) && (
                    <div className="rvNota rvNota-att">
                        <div className="rvNota-t">Da sistemare</div>
                        <div className="rvNota-s">{problemaDi(scheda)}</div>
                    </div>
                )}

                {/* ── DOVE SI TROVA ── */}
                <div className="rvCampo">
                    <span className="rvLab">Disponibilità nei punti vendita
                        {dispon && <span className="rvLabX"> — {totGiac} pezzi{totArrivo ? `, ${totArrivo} in arrivo` : ""}</span>}</span>
                    {dispon === null ? <div className="rvTab-min">Carico…</div>
                        : dispon.length === 0 ? <div className="rvTab-min">Nessun pezzo in nessun magazzino.</div>
                            : (
                                <div className="rvTabBox">
                                    <table className="rvTab">
                                        <thead><tr><th>Punto vendita</th><th>Società</th><th className="rvTab-c">Pezzi</th><th className="rvTab-c">In arrivo</th></tr></thead>
                                        <tbody>
                                            {dispon.map(r => (
                                                <tr key={r.negozio + (r.azienda || "")} className="rvTab-riga">
                                                    <td className="rvTab-nome">{r.negozio}</td>
                                                    <td className="rvTab-min">{r.azienda || "—"}</td>
                                                    <td className="rvTab-n">{r.quantita}</td>
                                                    <td className="rvTab-n rvTab-min">{r.in_arrivo || "—"}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                </div>

                {/* ── COSA GLI È SUCCESSO ── */}
                <div className="rvCampo">
                    <span className="rvLab">Ultime movimentazioni
                        {movim && movim.length >= 40 && <span className="rvLabX"> — le 40 più recenti</span>}</span>
                    {movim === null ? <div className="rvTab-min">Carico…</div>
                        : movim.length === 0 ? <div className="rvTab-min">Nessun movimento registrato per questo articolo.</div>
                            : (
                                <div className="rvTabBox">
                                    <table className="rvTab">
                                        <thead><tr><th>Quando</th><th>Cosa</th><th>Dove</th><th className="rvTab-c">Qtà</th><th>Chi</th></tr></thead>
                                        <tbody>
                                            {movim.map(m => (
                                                <tr key={m.id} className="rvTab-riga">
                                                    <td className="rvTab-min">{new Date(m.creato_il).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                                                    <td className="rvTab-nome">{m.tipo}{m.seriale ? ` · ${m.seriale}` : ""}</td>
                                                    <td className="rvTab-min">{m.negozio}</td>
                                                    <td className="rvTab-n">{m.quantita}</td>
                                                    <td className="rvTab-min">{m.operatore || "—"}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                </div>

                {/* ── LA DEFINIZIONE, dall'amministrativo in su ── */}
                {puoDefinire ? (
                    <>
                        <div className="rvBarra">
                            <label className="rvCampo rvCampo-flex"><span className="rvLab">Descrizione</span>
                                <input className="rvIn" value={String(val(scheda, "descrizione") ?? "")}
                                    onChange={e => cambia(scheda, "descrizione", e.target.value)} />
                            </label>
                            <label className="rvCampo rvCampo-sm"><span className="rvLab">Marca</span>
                                <input className="rvIn" value={String(val(scheda, "marca") ?? "")}
                                    onChange={e => cambia(scheda, "marca", e.target.value)} />
                            </label>
                        </div>
                        <div className="rvBarra">
                            <label className="rvCampo rvCampo-sm"><span className="rvLab">Prezzo di vendita €</span>
                                <input className="rvIn" inputMode="decimal" value={String(val(scheda, "prezzo") ?? "")}
                                    onChange={e => cambia(scheda, "prezzo", e.target.value)} />
                            </label>
                            <label className="rvCampo rvCampo-sm"><span className="rvLab">Costo d&apos;acquisto €</span>
                                <input className="rvIn" inputMode="decimal" value={String(val(scheda, "costo_ultimo") ?? "")}
                                    onChange={e => cambia(scheda, "costo_ultimo", e.target.value)} />
                            </label>
                            {/* IL REPARTO SI SCEGLIE PER SIGNIFICATO, non per numero: tre
                                reparti sono «non soggetta», due «regime del margine», due
                                al 4%. Sbagliarne uno non cambia lo scontrino ma spacca in
                                due i totali del corrispettivo giornaliero. */}
                            <label className="rvCampo rvCampo-sm"><span className="rvLab">Reparto IVA</span>
                                <select className="rvIn" value={String(val(scheda, "reparto") ?? "")}
                                    onChange={e => cambia(scheda, "reparto", e.target.value)}>
                                    <option value="">— da assegnare —</option>
                                    {reparti.map(r => (
                                        <option key={r.reparto} value={r.reparto}>
                                            {r.reparto} · {r.descrizione}{r.aliquota != null ? ` (${r.aliquota}%)` : r.natura ? ` (${r.natura})` : ""}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>
                        <div className="rvBarra rvBarra-c">
                            <button type="button"
                                onClick={() => cambia(scheda, "prezzo_modificabile", !val(scheda, "prezzo_modificabile"))}
                                className={cn("rvPill rvPill-sm", val(scheda, "prezzo_modificabile") && "rvPill-on")}>
                                {val(scheda, "prezzo_modificabile") ? "🔓 in cassa il prezzo si può correggere" : "🔒 in cassa il prezzo è fisso"}
                            </button>
                            <button type="button"
                                onClick={() => cambia(scheda, "attivo", !val(scheda, "attivo"))}
                                className={cn("rvPill rvPill-sm", !val(scheda, "attivo") && "rvPill-no")}>
                                {val(scheda, "attivo") ? "Attivo" : "Spento: non si vende"}
                            </button>
                            <span className="rvSpazio" />
                            <button type="button" className="rvAzione rvAzione-sm"
                                disabled={!inModifica || salvando === scheda.codice}
                                onClick={async () => { await salva(scheda); const f = articoli.find(x => x.codice === scheda.codice); if (f) setScheda({ ...f, ...bozza[scheda.codice] } as Articolo); }}>
                                {salvando === scheda.codice ? "…" : inModifica ? "Salva le modifiche" : "Nessuna modifica"}
                            </button>
                        </div>
                        {erroreSalva && <div className="rvErr">{erroreSalva}</div>}
                    </>
                ) : (
                    <div className="rvNota">
                        <div className="rvNota-s">
                            Prezzo di vendita <b>{eur(scheda.prezzo)}</b> · {etichettaReparto(scheda.reparto)}.
                            La definizione degli articoli si cambia dall&apos;amministrazione.
                        </div>
                    </div>
                )}
            </div>
        </div>, document.body);

    const pannelloNuovo = nuovo && createPortal(
        <div className="rvFattaSfondo" onClick={e => { if (e.target === e.currentTarget) setNuovo(null); }}>
            <div className="rvStoria">
                <div className="rvStoria-t">
                    <div>
                        <div className="rvStoria-tit">Nuovo articolo</div>
                        <div className="rvStoria-sot">
                            Gli articoli arrivano dall&apos;export del gestionale: qui si aggiunge quello che lì non c&apos;è.
                            Il <b>codice</b> è la chiave e non si ripete; il <b>prezzo di vendita</b> senza il quale in cassa non si può vendere.
                        </div>
                    </div>
                </div>
                <div className="rvBarra">
                    <label className="rvCampo rvCampo-sm"><span className="rvLab">Codice *</span>
                        <input className="rvIn" value={nuovo.codice} onChange={e => setNuovo({ ...nuovo, codice: e.target.value })} />
                    </label>
                    <label className="rvCampo rvCampo-flex"><span className="rvLab">Descrizione *</span>
                        <input className="rvIn" value={nuovo.descrizione} onChange={e => setNuovo({ ...nuovo, descrizione: e.target.value })} />
                    </label>
                </div>
                <div className="rvBarra">
                    <label className="rvCampo rvCampo-sm"><span className="rvLab">Prezzo di vendita € *</span>
                        <input className="rvIn" inputMode="decimal" value={nuovo.prezzo} onChange={e => setNuovo({ ...nuovo, prezzo: e.target.value })} />
                    </label>
                    <label className="rvCampo rvCampo-sm"><span className="rvLab">Costo d&apos;acquisto €</span>
                        <input className="rvIn" inputMode="decimal" value={nuovo.costo_ultimo} onChange={e => setNuovo({ ...nuovo, costo_ultimo: e.target.value })} />
                    </label>
                    <label className="rvCampo rvCampo-sm"><span className="rvLab">Reparto IVA</span>
                        <select className="rvIn" value={nuovo.reparto} onChange={e => setNuovo({ ...nuovo, reparto: e.target.value })}>
                            <option value="">— da assegnare —</option>
                            {reparti.map(r => (
                                <option key={r.reparto} value={r.reparto}>
                                    {r.reparto} · {r.descrizione}{r.aliquota != null ? ` (${r.aliquota}%)` : r.natura ? ` (${r.natura})` : ""}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
                <div className="rvBarra">
                    <label className="rvCampo rvCampo-sm"><span className="rvLab">Marca</span>
                        <input className="rvIn" value={nuovo.marca} onChange={e => setNuovo({ ...nuovo, marca: e.target.value })} />
                    </label>
                    <label className="rvCampo rvCampo-sm"><span className="rvLab">Barcode</span>
                        <input className="rvIn" value={nuovo.barcode} onChange={e => setNuovo({ ...nuovo, barcode: e.target.value })} />
                    </label>
                </div>
                {erroreSalva && <div className="rvErr">{erroreSalva}</div>}
                <div className="rvBarra rvBarra-c">
                    <button type="button" className="rvPill rvPill-sm" onClick={() => setNuovo(null)}>Annulla</button>
                    <span className="rvSpazio" />
                    <button type="button" className="rvAzione rvAzione-sm" onClick={creaArticolo}
                        disabled={!nuovo.codice.trim() || !nuovo.descrizione.trim() || !nuovo.prezzo.trim() || salvando === "__nuovo"}>
                        {salvando === "__nuovo" ? "…" : "Crea l'articolo"}
                    </button>
                </div>
            </div>
        </div>, document.body);

    if (loading) return <div className="rvCarico"><Loader2 className="w-6 h-6 animate-spin" /> Carico l&apos;anagrafica articoli…</div>;
    return (
        <div className="space-y-4">
            {/* ── LE FAMIGLIE ──
                Ogni fila di pastiglie porta la sua etichetta, come in Giacenze
                e in Registra Vendita (revisore 31/08): senza, chi entra la
                prima volta non sa che la prima riga dice «cosa è» e la seconda
                «di che tipo». E l'etichetta dice «di catalogo» apposta: alla
                cassa «Accessori» sono 12 codici scelti a mano, qui sono 9.711
                righe lette da un export — stessa parola, due perimetri. */}
            <div className="rvCampo">
            <span className="rvLab">Famiglia di catalogo</span>
            <div className="rvPillRow">
                <button onClick={() => scegliFamiglia("")} className={cn("rvPill", !famiglia && "rvPill-on")}>
                    Tutti <b className="rvPillN">{passaFiltri.length.toLocaleString("it-IT")}</b>
                </button>
                {[...FAMIGLIE, ALTRO].map(f => {
                    if (!famiglieVive.has(f.id)) return null;   // in catalogo non esiste proprio
                    const n = conteggi.get(f.id) || 0;
                    return (
                        <button key={f.id} onClick={() => scegliFamiglia(f.id)}
                            className={cn("rvPill", famiglia === f.id && "rvPill-on")}>
                            {f.icona} {f.nome}
                            {/* IL CONTEGGIO SPARISCE QUANDO NON È PIÙ VERO
                                (revisore 31/08): è calcolato su tutto il catalogo,
                                quindi con una ricerca in corso direbbe «9.711»
                                sopra una tabella di quaranta righe. Un numero
                                assente è onesto, uno sbagliato no. */}
                            <b className="rvPillN">{n.toLocaleString("it-IT")}</b>
                        </button>
                    );
                })}
            </div>
            </div>

            {/* ── LE SOTTO-VOCI: chiuse finché non servono ──
                Niente `rvPillRow-fitta`: la sua imbottitura (0,2,0) scavalca
                quella di `rvPill-sm` (0,1,0) e le due file finivano identiche.
                Era nata per far stare otto categorie su una riga sola a
                1920px; qui le righe restano comunque tre, quindi non compra
                niente e costa la gerarchia. */}
            {sottoVoci.length > 0 && (
                <div className="rvCampo">
                    <span className="rvLab">Tipo, dentro {nomeFam(famiglia)}
                        {!apriSotto && <span className="rvLabX"> — {sottoVoci.length} voci</span>}</span>
                    <div className="rvPillRow">
                        <button onClick={() => { setApriSotto(a => !a); if (apriSotto) { setSotto(""); setTutteLeSotto(false); } }}
                            className="rvPill rvPill-sm">
                            {apriSotto ? "− chiudi" : `+ scegli il tipo`}
                        </button>
                        {apriSotto && (
                            <>
                                <button onClick={() => setSotto("")} className={cn("rvPill rvPill-sm", !sotto && "rvPill-on")}>
                                    Tutta la famiglia
                                </button>
                                {(tutteLeSotto ? sottoVoci : sottoVoci.slice(0, 12)).map(([k, n, etichetta]) => (
                                    <button key={k} onClick={() => setSotto(sotto === k ? "" : k)}
                                        className={cn("rvPill rvPill-sm", sotto === k && "rvPill-on")}>
                                        {etichetta} <b className="rvPillN">{n.toLocaleString("it-IT")}</b>
                                    </button>
                                ))}
                                {/* sotto la dodicesima la coda pesa meno dell'1% */}
                                {!tutteLeSotto && sottoVoci.length > 12 && (
                                    <button onClick={() => setTutteLeSotto(true)} className="rvPill rvPill-sm">
                                        altre {sottoVoci.length - 12}…
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}

            <div className="rvBox">
                <div className="rvBoxT">📚 Anagrafica articoli</div>
                <div className="rvBarra">
                    {/* OPERATORE = di chi è il listino. Non è un campo
                        dell'anagrafica: si deduce dal gruppo e dal nome, con la
                        stessa funzione che usa Giacenze — due letture diverse
                        dello stesso dato divergono sempre. */}
                    {/* LA TENDINA RESTA FINCHÉ IL FILTRO È ACCESO (revisore 31/08).
                        Prima compariva solo se c'erano valori: stringendo con una
                        sotto-voce spariva CON il filtro ancora attivo, e restava una
                        tabella vuota senza niente da togliere — l'unica uscita era
                        ricliccare una famiglia, e non lo sapeva nessuno. */}
                    {/* SEMPRE MONTATE, spente quando non c'è niente da scegliere
                        (revisore 31/08). Comparire e sparire sposta il campo Cerca
                        di 128 pixel mentre lo stai raggiungendo, e su iPad fa
                        passare la barra da una riga a due. Peggio: sparivano COL
                        FILTRO ANCORA ACCESO, e restava una tabella vuota senza
                        niente da togliere. Una tendina spenta dice «qui non
                        serve»; una sparita non dice niente. */}
                    <div className="rvCampo rvCampo-sm"><span className="rvLab">Operatore</span>
                        <SelectOpzioni value={operatore} onChange={setOperatore}
                            opzioni={operatore && !operatori.includes(operatore) ? [operatore, ...operatori] : operatori}
                            disabled={!operatori.length && !operatore} placeholder="Tutti" className="rvIn" />
                    </div>
                    <div className="rvCampo rvCampo-sm"><span className="rvLab">Marca</span>
                        <SelectOpzioni value={marca} onChange={setMarca}
                            opzioni={marca && !marche.includes(marca) ? [marca, ...marche] : marche}
                            disabled={!marche.length && !marca} placeholder="Tutte" className="rvIn" />
                    </div>
                    <label className="rvCampo rvCampo-flex"><span className="rvLab">Cerca <span className="rvLabX">(codice, barcode, descrizione)</span></span>
                        <span className="rvCerca">
                            <Search size={16} />
                            <input value={cerca} onChange={e => setCerca(e.target.value)} placeholder="Es. Galaxy A16, 8032325…"
                                className="rvIn" />
                        </span>
                    </label>
                    <span className="rvSpazio" />
                    {/* «DA SISTEMARE» viene dalla scheda del pannello amministrativo,
                        che da oggi non c'è più: definizione e consultazione erano due
                        schede diverse sugli stessi dati, e chi definiva non vedeva
                        quello che vedevano i ragazzi. */}
                    {puoDefinire && (
                        <button onClick={() => setSoloProblemi(x => !x)}
                            className={cn("rvPill rvPill-sm", soloProblemi && "rvPill-on")}>
                            ⚠️ Da sistemare{conProblema > 0 ? ` · ${conProblema.toLocaleString("it-IT")}` : ""}
                        </button>
                    )}
                    {puoDefinire && (
                        <button onClick={() => { setNuovo({ codice: "", descrizione: "", prezzo: "", costo_ultimo: "", marca: "", barcode: "", reparto: "" }); setErroreSalva(""); }}
                            className="rvAzione rvAzione-sm">+ Nuovo articolo</button>
                    )}
                    <button onClick={esporta} disabled={!filtrati.length} className="rvAzione rvAzione-sm">
                        <FileDown size={14} className="inline-block align-[-2px] mr-1.5" /> Excel
                    </button>
                </div>
            </div>

            <div className="rvTabBox">
                <table className="rvTab">
                    <thead>
                        <tr>
                            {/* NIENTE COLONNA BARCODE (revisore 31/08): su iPad si
                                prendeva 118px con `white-space:nowrap` mentre la
                                Descrizione — la sola che si legga davvero — ne
                                aveva 112 e andava a capo cinque volte. Il barcode
                                non si legge da una griglia: si spara col lettore
                                nel campo Cerca, che lo comprende, e sta nell'Excel. */}
                            <th>Codice</th>
                            <th>Descrizione</th>
                            <th>Sottogruppo</th>
                            <th>Operatore</th>
                            <th>Marca</th>
                            <th className="rvTab-c">Prezzo</th>
                            {vedeCosti && <th className="rvTab-c">Costo ult.</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {visibili.map(a => (
                            <tr key={a.codice} className="rvTab-riga rvTab-riga-cli"
                                onClick={() => { setScheda(a); setErroreSalva(""); }}>
                                <td className="rvTab-cod">{a.codice}</td>
                                <td className="rvTab-nome">{a.descrizione}</td>
                                <td className="rvTab-min">{a._sotto}</td>
                                <td className="rvTab-min">{a._op || "—"}</td>
                                <td className="rvTab-min">{a.marca || "—"}</td>
                                <td className="rvTab-n">{eur(a.prezzo)}</td>
                                {vedeCosti && <td className="rvTab-n rvTab-min">{eur(a.costo_ultimo)}</td>}
                            </tr>
                        ))}
                        {!filtrati.length && <tr><td colSpan={vedeCosti ? 7 : 6} className="rvTab-vuoto">
                            {cerca.trim()
                                ? <>«{cerca.trim()}» non si trova{famiglia ? <> dentro <b>{nomeFam(famiglia)}</b></> : null}{sotto ? " in questo tipo" : ""}. Prova a svuotare la ricerca o a premere «Tutti».</>
                                : sotto ? <>Nessun articolo in questo tipo con i filtri scelti: prova «Tutta la famiglia».</>
                                    : (operatore || marca) ? <>Nessun articolo di {[operatore, marca].filter(Boolean).join(" · ")} qui dentro: rimetti le tendine su «Tutti».</>
                                        : <>Nessun articolo con questi filtri.</>}
                        </td></tr>}
                    </tbody>
                </table>
                {pannelloScheda}{pannelloNuovo}
                {filtrati.length > TETTO && (
                    <div className="rvTab-pie">
                        <div className="rvBarra rvBarra-c">
                            <button type="button" className="rvPill rvPill-sm" disabled={pag === 0}
                                onClick={() => setPagina(p => Math.max(0, p - 1))}>← Indietro</button>
                            <span className="rvTab-min">
                                Pagina <b>{pag + 1}</b> di {pagine.toLocaleString("it-IT")} — articoli {(pag * TETTO + 1).toLocaleString("it-IT")}–{Math.min((pag + 1) * TETTO, filtrati.length).toLocaleString("it-IT")} di {filtrati.length.toLocaleString("it-IT")}
                            </span>
                            <button type="button" className="rvPill rvPill-sm" disabled={pag >= pagine - 1}
                                onClick={() => setPagina(p => Math.min(pagine - 1, p + 1))}>Avanti →</button>
                            <span className="rvSpazio" />
                            <span className="rvTab-min">L&apos;Excel le porta tutte.</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
