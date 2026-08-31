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
//   🚚 Trasferimenti — merce da un negozio all'altro con DDT progressivo:
//                  in transito → accettato dal magazzino che riceve
//   📚 Articoli  — anagrafica articoli dall'export del gestionale (task Luca
//                  13/08): solo i riferimenti (codice, barcode, descrizione,
//                  gruppo/listino, sottogruppo, marca), divisi per brand.
//                  Import col runner scripts/import_mag_articoli.js.
// Stati unità: disponibile · in_arrivo · in_transito (negozio = destinazione,
// il mittente lo vede spedito nel DDT) · venduto (deflaggato ma ricercabile).
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
import { SelectOpzioni } from "@/components/SelectPersona";
import { cn } from "@/utils";
import { stessoMagazzino } from "@/lib/negoziNomi";

type Unita = {
    id: string; seriale: string; tipo_seriale: string; codice: string | null; descrizione: string;
    azienda: string | null; negozio: string; stato: string; valore: number | null;
    caricato_il: string; caricato_da: string | null; venduto_il: string | null; venduto_da: string | null;
    contract_id: string | null; ddt_id: string | null;
    storia: { quando: string; evento: string; negozio?: string; operatore?: string; note?: string }[];
};
/** Quello che l'anagrafica dice di un codice. `gruppo` e `marca` non sono
 *  decorazione: da lì si ricava l'operatore telefonico. */
type DatiArticolo = { descrizione: string; prezzo: number | null; gruppo: string | null; marca: string | null };
type Ddt = {
    id: string; numero: number; da_negozio: string; a_negozio: string; stato: string;
    creato_da: string | null; creato_il: string; accettato_da: string | null; accettato_il: string | null; note: string | null;
};
type Articolo = {
    codice: string; barcode: string | null; descrizione: string;
    gruppo: string | null; sottogruppo: string | null; marca: string | null;
    iva_acquisto: string | null; iva_vendita: string | null;
    costo_ultimo: number | null; prezzo: number | null; attivo: boolean;
};

const STATI_LABEL: Record<string, string> = {
    disponibile: "🟢 Disponibile", in_arrivo: "📦 In arrivo", in_transito: "🚚 In transito", annullato: "🗑 Tolto dal magazzino",
    spedito: "📤 Spedito", venduto: "⚪ Venduto",
};
const gg = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleDateString("it-IT") : "—";
const gghh = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const eur = (v: number | null | undefined) => v == null ? "—" : v.toLocaleString("it-IT", { style: "currency", currency: "EUR" });

export default function MagazzinoPage() {
    const { user } = useAuth();
    // consultazione per tutti; trasferimenti per chi gestisce; il CARICO
    // merce solo amministrazione in su (segnalazione Francesco 12/08)
    const gestisce = ["admin", "dev", "direttore_generale", "store_manager"].includes(user?.role || "");
    const puoCaricare = isAdminOrAbove(user?.role);
    const [tab, setTab] = useState<"giacenze" | "ricerca" | "trasferimenti" | "articoli">("giacenze");

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
                    {([["giacenze", "📦 Giacenze"], ["ricerca", "🔍 Ricerca seriale"], ["trasferimenti", "🚚 Trasferimenti"], ["articoli", "📚 Articoli"]] as const).map(([k, l]) => (
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
            ) : tab === "ricerca" ? (
                <RicercaSeriale unita={unita} />
            ) : tab === "articoli" ? (
                <Articoli vedeCosti={puoCaricare} />
            ) : (
                <Trasferimenti unita={unita} negozi={negozi} aziende={aziende} gestisce={gestisce} puoCaricare={puoCaricare} utente={user?.name || "—"} ricarica={carica} />
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
    const [negozio, setNegozio] = useState(mioNegozio && negozi.includes(mioNegozio) ? mioNegozio : "");
    const [azienda, setAzienda] = useState("");
    const [stato, setStato] = useState("");
    const [operatore, setOperatore] = useState("");
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
                const { error } = await supabase.from("mag_movimenti").insert({
                    codice: daCestinare.codice, negozio: daCestinare.negozio, azienda: daCestinare.azienda,
                    tipo: "rettifica", quantita: -(daCestinare.quantita || 0), operatore: utente,
                    nota: `tolto dal magazzino${motivo.trim() ? ": " + motivo.trim() : ""}`,
                });
                if (error) throw error;
            }
            setDaCestinare(null); setMotivo("");
            ricarica();
        } catch (e) {
            alert("Non sono riuscito a toglierlo: " + ((e as Error)?.message || "errore"));
        } finally { setCestinando(false); }
    };
    const [sort, setSort] = useState<{ col: number; desc: boolean }>({ col: 1, desc: false });

    /* I GEMELLI SONO LO STESSO SCAFFALE (revisore 31/08). Magliana W3 e
       Magliana Multi sono due insegne in un locale solo, e la cassa già lo sa:
       lascia battere l'IMEI del gemello. La griglia invece confrontava il nome
       esatto, quindi mostrava quei pezzi in colonna «Altrove» — come se
       fossero a Ostia — e suggeriva di farsi un DDT per merce a due passi. */
    const nelloScopo = useCallback((neg: string) => !negozio || stessoMagazzino(neg, negozio), [negozio]);

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
                if (stato && u.stato !== stato) continue;
                vivo = u.stato === "disponibile";
                arrivo = u.stato === "in_transito" || u.stato === "in_arrivo";
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
                   quantità non hanno uno stato per riga, hanno due colonne. */
                if (stato === "in_transito") continue;
                if (stato === "disponibile" && !(Number(g.quantita) > 0)) continue;
                if (stato === "in_arrivo" && !(Number(g.inArrivo) > 0)) continue;
                const k = `${g.codice}|${g.descrizione}`;
                const r = m.get(k) || nuova(g.codice, g.descrizione);
                if (nelloScopo(g.negozio)) {
                    r.giacenza += stato === "in_arrivo" ? 0 : Number(g.quantita);
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
        if (operatore) out = out.filter(r => operatore === "(nessuno)" ? !r.operatore : r.operatore === operatore);
        if (cerca.trim()) {
            const q = cerca.trim().toLowerCase();
            out = out.filter(r => `${r.codice} ${r.descrizione}`.toLowerCase().includes(q));
        }
        // «solo disponibili» = quello che c'è QUI; «tutti» tiene anche ciò che
        // sta solo altrove, che è il motivo per cui la colonna esiste
        /* LE RIGHE SOTTO ZERO RESTANO SEMPRE VISIBILI (revisore 31/08). Il
           29/08 la query era stata aperta apposta alle giacenze negative —
           «un magazzino che nasconde i conti che non tornano non serve a
           niente» — e «solo disponibili» le avrebbe rimesse sotto il tappeto:
           una riga a −1 è la prova che qualcosa è uscito senza esserci, ed è
           esattamente quello che si deve vedere entrando. */
        out = out.filter(r => soloDisponibili
            ? (r.giacenza !== 0 || r.inArrivo > 0)
            : (r.giacenza !== 0 || r.inArrivo > 0 || r.altrove > 0));

        const val = (r: Riga, c: number) => c === 0 ? r.codice : c === 1 ? r.descrizione
            : c === 2 ? r.giacenza : c === 3 ? r.altrove : c === 4 ? r.inArrivo : r.valore;
        out.sort((a, b) => {
            const va = val(a, sort.col), vb = val(b, sort.col);
            const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
            return sort.desc ? -cmp : cmp;
        });
        return out;
    }, [unita, quantita, anagrafica, negozio, azienda, stato, operatore, cerca, soloDisponibili, dataStorica, sort, nelloScopo]);

    // gli operatori che hanno davvero qualcosa in questa vista
    const operatoriPresenti = useMemo(() => {
        const s = new Set<string>();
        unita.forEach(u => { const o = operatoreDi(anagrafica.get(u.codice || ""), u.descrizione, u.codice || ""); if (o) s.add(o); });
        quantita.forEach(q => { const o = operatoreDi(anagrafica.get(q.codice), q.descrizione, q.codice); if (o) s.add(o); });
        return Array.from(s).sort();
    }, [unita, quantita, anagrafica]);

    const esporta = () => {
        const dati: CellaXlsx[][] = righe.map(r => [r.codice, r.descrizione, r.operatore || "—", r.giacenza, r.altrove, r.inArrivo, Math.round(r.valore * 100) / 100]);
        scaricaXlsx(`giacenze_${negozio || "tutti"}_${new Date().toISOString().slice(0, 10)}.xlsx`,
            ["Codice", "Descrizione", "Operatore", "Giacenza", "Altrove", "In arrivo", "Valore €"], dati, "Giacenze");
    };

    const colonne = ["Codice", "Descrizione", "Giacenza", "Altrove", "In arrivo", "Valore"];
    /** «è nel negozio che sto guardando?» — decide il colore della pastiglia
     *  del luogo, e prima era scritto due volte uguale dentro l'elemento. */
    const quiDa = (neg: string) => neg === negozio || (!negozio && neg === mioNegozio);

    return (
        <div className="space-y-4">
            <div className="rvBox">
                <div className="rvBoxT">🔎 Cosa guardo</div>
                {/* DOVE GUARDO — il mio negozio è già scelto */}
                <div className="rvBarra rvBarra-c">
                    {mioNegozio && negozi.includes(mioNegozio) && (
                        <button onClick={() => setNegozio(mioNegozio)} className={cn("rvPill rvPill-sm", negozio === mioNegozio && "rvPill-on")}>🏠 {mioNegozio}</button>
                    )}
                    <button onClick={() => setNegozio("")} className={cn("rvPill rvPill-sm", !negozio && "rvPill-on")}>🌐 Tutti i negozi</button>
                    {/* la className SOSTITUISCE il default di SelectOpzioni (non
                        si fondono): va addosso all'<input>, quindi `.rvIn` e
                        basta — un `.rvSel > div` non aggancerebbe niente. */}
                    <div className="rvCampo rvCampo-md"><SelectOpzioni className="rvIn"
                        value={negozio && negozio !== mioNegozio ? negozio : ""} onChange={setNegozio}
                        opzioni={negozi} placeholder="…o un altro punto vendita" /></div>
                    <span className="rvSep" />
                    <button onClick={() => setSoloDisponibili(true)} className={cn("rvPill rvPill-sm", soloDisponibili && "rvPill-on")}>📗 Solo disponibili</button>
                    <button onClick={() => setSoloDisponibili(false)} className={cn("rvPill rvPill-sm", !soloDisponibili && "rvPill-on")}
                        title="Mostra anche quello che qui non c'è ma sta in un altro negozio">📚 Tutti gli articoli</button>
                </div>
                {/* I FILTRI FINI */}
                <div className="rvBarra mt-3">
                    <label className="rvCampo rvCampo-lg"><span className="rvLab">Cerca</span>
                        <input value={cerca} onChange={e => setCerca(e.target.value)} placeholder="codice o descrizione…"
                            className="rvIn" /></label>
                    <div className="rvCampo rvCampo-sm"><span className="rvLab">Operatore</span>
                        <SelectOpzioni className="rvIn"
                            value={operatore} onChange={setOperatore}
                            opzioni={[...operatoriPresenti, "(nessuno)"]} placeholder="Tutti" /></div>
                    <div className="rvCampo rvCampo-lg"><span className="rvLab">Azienda</span>
                        <SelectOpzioni className="rvIn"
                            value={azienda ? (nomiAzienda[azienda] || azienda) : ""}
                            onChange={(v) => setAzienda(v ? (Object.keys(nomiAzienda).find(k => nomiAzienda[k] === v) || v) : "")}
                            opzioni={aziende.map(a => nomiAzienda[a] || a)} placeholder="Tutte le società" /></div>
                    <div className="rvCampo rvCampo-sm"><span className="rvLab">Stato</span>
                        <SelectOpzioni className="rvIn" disabled={!!dataStorica}
                            value={stato ? (STATI_LABEL[stato] || stato) : ""}
                            onChange={(v) => setStato(v ? (Object.keys(STATI_LABEL).find(k => STATI_LABEL[k] === v) || "") : "")}
                            opzioni={Object.values(STATI_LABEL)} placeholder="Tutti" /></div>
                    <label className="rvCampo rvCampo-md" title="Fotografia del magazzino a quella data: caricato entro la data e non ancora venduto">
                        <span className="rvLab">Giacenza alla data</span>
                        <input type="date" value={dataStorica} onChange={e => setDataStorica(e.target.value)} className="rvIn" /></label>
                    {dataStorica && <button onClick={() => setDataStorica("")} className="rvPill rvPill-sm">✕ oggi</button>}
                    <span className="rvSpazio" />
                    <button onClick={esporta} disabled={!righe.length} className="rvAzione rvAzione-sm">
                        <FileDown size={14} className="inline-block align-[-2px] mr-1.5" /> Excel
                    </button>
                </div>
                {dataStorica && (
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
                            {daCestinare.seriale
                                ? "Il pezzo non sarà più vendibile né trasferibile, ma la sua storia resta."
                                : "La giacenza va a zero con una rettifica: il movimento resta scritto."}
                        </p>
                        {/* niente sparisce davvero: resta scritto chi, quando e perché */}
                        <div className="rvFatta-d">
                            <div><span>{daCestinare.seriale ? "Pezzo" : "Quantità"}</span>
                                <span>{daCestinare.seriale ? daCestinare.seriale : `${daCestinare.quantita} pezzi`}</span></div>
                            <div><span>Negozio</span><span>{daCestinare.negozio}</span></div>
                        </div>
                        <label className="rvCampo"><span className="rvLab">Perché lo togli</span>
                            <input value={motivo} onChange={e => setMotivo(e.target.value)} autoFocus
                                placeholder="rubato, rotto, mai arrivato…" className="rvIn" /></label>
                        <div className="rvBarra rvBarra-c mt-4 justify-end">
                            <button onClick={() => { setDaCestinare(null); setMotivo(""); }} disabled={cestinando}
                                className="rvPill">Annulla</button>
                            <button onClick={cestina} disabled={cestinando} className="rvAzione rvAzione-no">
                                {cestinando && <Loader2 className="w-4 h-4 animate-spin inline-block align-[-3px] mr-2" />}Sì, toglilo
                            </button>
                        </div>
                    </div>
                </div>, document.body)}
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
                            const apribile = r.pezzi.length > 0 || r.altrove > 0;
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
                                                                <span className="rvDettR-mono">{p.seriale}</span>
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
                            {soloDisponibili && " Prova «📚 Tutti gli articoli» per vedere anche quello che sta in un altro negozio."}
                            {!unita.length && !quantita.length && " Il magazzino parte vuoto: il primo carico si fa da 🚚 Trasferimenti → 📥 Carico merce."}
                        </td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

/* ── 🔍 RICERCA SERIALE (deep search con timeline) ───────────────────── */
function RicercaSeriale({ unita }: { unita: Unita[] }) {
    const [testo, setTesto] = useState("");
    const [busy, setBusy] = useState(false);
    type Evento = { quando: string; testo: string };
    type Scheda = { titolo: string; sotto: string; stato: string; eventi: Evento[] };
    const [schede, setSchede] = useState<Scheda[] | null>(null);

    const cerca = async () => {
        const s = testo.trim().replace(/[\s./-]/g, "");
        if (s.length < 5) return;
        setBusy(true);
        const out: Scheda[] = [];
        // 1) magazzino
        for (const u of unita.filter(x => x.seriale.replace(/[\s./-]/g, "").includes(s))) {
            const eventi: Evento[] = [
                { quando: u.caricato_il, testo: `📥 Caricato a ${u.negozio}${u.caricato_da ? ` da ${u.caricato_da}` : ""}` },
                ...(u.storia || []).map(e => ({ quando: e.quando, testo: `${e.evento}${e.negozio ? ` · ${e.negozio}` : ""}${e.operatore ? ` · ${e.operatore}` : ""}${e.note ? ` — ${e.note}` : ""}` })),
            ];
            if (u.venduto_il) eventi.push({ quando: u.venduto_il, testo: `💰 Venduto${u.venduto_da ? ` da ${u.venduto_da}` : ""}${u.contract_id ? ` · pratica ${u.contract_id}` : ""}` });
            out.push({ titolo: `${u.descrizione} · ${u.seriale}`, sotto: `Magazzino — ${u.negozio}${u.azienda ? ` · ${u.azienda}` : ""}`, stato: STATI_LABEL[u.stato] || u.stato, eventi });
        }
        // 2) usati (gestione usati)
        const us = await supabase.from("usati").select("id, model, imei, status, store, created_at, sold_date, venditore, status_history").ilike("imei", `%${s}%`).limit(10);
        for (const u of (us.data ?? []) as Record<string, unknown>[]) {
            const sh = (u.status_history || {}) as Record<string, { date?: string; operatore?: string }>;
            const eventi = Object.entries(sh).map(([k, v]) => ({ quando: String(v?.date || u.created_at), testo: `♻️ ${k}${v?.operatore ? ` · ${v.operatore}` : ""}` }));
            out.push({ titolo: `${u.model} · ${u.imei}`, sotto: `Gestione Usati — ${u.store} (n.${u.id})`, stato: `♻️ ${u.status}`, eventi });
        }
        // 3) vendite CRM (IMEI piatti e terminali della vendita)
        const t = `%${s}%`;
        const ct = await supabase.from("contracts")
            .select("id, venditore, negozio, brand, prodotto, data_registrazione, dettagli")
            .or([`dettagli->>IMEI.ilike.${t}`, `dettagli->>imei.ilike.${t}`, `dettagli->>"IMEI TNP".ilike.${t}`, `dettagli->>"IMEI CB".ilike.${t}`, `dettagli->units.cs."[{\\"imei\\":\\"${s}\\"}]"`, `codice_attivazione.ilike.${t}`].join(","))
            .limit(10);
        for (const c of (ct.data ?? []) as Record<string, unknown>[]) {
            out.push({
                titolo: `${c.brand} · ${c.prodotto}`, sotto: `Vendita ${c.id} — ${c.negozio}`,
                stato: "🧾 Registrata",
                eventi: [{ quando: String(c.data_registrazione), testo: `💰 Venduto il ${gg(String(c.data_registrazione))} da ${c.venditore} · ${c.negozio} · pratica ${c.id}` }],
            });
        }
        setSchede(out); setBusy(false);
    };

    return (
        <div className="space-y-4 max-w-3xl">
            <div className="rvBox">
                <div className="rvBoxT">🔍 Cerca un seriale</div>
                <div className="rvBarra rvBarra-c">
                    {/* l'icona dentro il campo, come la ricerca della cassa:
                        prima erano un'icona, un campo senza cornice e un
                        bottone dentro lo stesso riquadro — tre pezzi per una
                        cosa sola */}
                    <label className="rvCerca rvSpazio">
                        <Search size={16} />
                        <input value={testo} onChange={e => setTesto(e.target.value)} onKeyDown={e => e.key === "Enter" && cerca()}
                            placeholder="Spara o scrivi IMEI / ICCID / seriale…" className="rvIn" />
                    </label>
                    <button onClick={cerca} disabled={busy || testo.trim().length < 5} className="rvAzione">
                        {busy ? "Cerco…" : "Cerca"}
                    </button>
                </div>
                <div className="rvHint">Guarda il magazzino, la gestione usati e le vendite registrate: servono almeno 5 caratteri.</div>
            </div>
            {schede && !schede.length && (
                <div className="rvTabBox">
                    <div className="rvVuoto">🔎<b>Nessuna traccia di questo seriale</b><small>né a magazzino, né negli usati, né nelle vendite</small></div>
                </div>
            )}
            {schede?.map((sc, i) => (
                <div key={i} className="rvBox">
                    <div className="rvCardT-riga">
                        <span className="rvNome">{sc.titolo}</span>
                        <span className="rvBadge rvBadge-empty">{sc.stato}</span>
                    </div>
                    <div className="rvSotto">{sc.sotto}</div>
                    <div className="rvDett">
                        {sc.eventi.sort((a, b) => String(a.quando).localeCompare(String(b.quando))).map((e, j) => (
                            <div key={j} className="rvDettR">
                                <span className="rvDettR-mono shrink-0 w-32">{gghh(e.quando)}</span>
                                <span>{e.testo}</span>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

/* ── 🚚 TRASFERIMENTI + 📥 CARICO ─────────────────────────────────────── */
function Trasferimenti({ unita, negozi, aziende, gestisce, puoCaricare, utente, ricarica }: {
    unita: Unita[]; negozi: string[]; aziende: string[]; gestisce: boolean; puoCaricare: boolean; utente: string; ricarica: () => void;
}) {
    const [ddt, setDdt] = useState<Ddt[]>([]);
    const [apriNuovo, setApriNuovo] = useState(false);
    const [apriCarico, setApriCarico] = useState(false);
    const caricaDdt = useCallback(async () => {
        const { data } = await supabase.from("mag_ddt").select("*").order("numero", { ascending: false }).limit(200);
        setDdt((data ?? []) as Ddt[]);
    }, []);
    useEffect(() => { caricaDdt(); }, [caricaDdt]);

    const unitaDiDdt = (id: string) => unita.filter(u => u.ddt_id === id);
    const accetta = async (d: Ddt) => {
        if (!window.confirm(`Accettare il DDT n.${d.numero} (${d.da_negozio} → ${d.a_negozio})? Le unità diventano disponibili a ${d.a_negozio}.`)) return;
        const mie = unitaDiDdt(d.id);
        /* SOLO I PEZZI CHE STANNO DAVVERO VIAGGIANDO (revisore 31/08).
           L'update portava a «disponibile» tutte le unità del DDT senza
           guardare da dove venivano: un pezzo partito, poi cestinato
           dall'amministrazione («mai arrivato»), tornava vendibile appena il
           negozio ricevente premeva «Accetta». */
        let saltati = 0;
        for (const u of mie) {
            const { data } = await supabase.from("mag_unita").update({
                stato: "disponibile", ddt_id: null,
                storia: [...(u.storia || []), { quando: new Date().toISOString(), evento: "📤 Spedito e accettato", negozio: d.a_negozio, operatore: utente, note: `DDT n.${d.numero} da ${d.da_negozio}` }],
            }).eq("id", u.id).eq("stato", "in_transito").select("id");
            if (!data?.length) saltati++;
        }
        if (saltati) alert(`${saltati} ${saltati === 1 ? "pezzo non è stato accettato perché non risulta più in viaggio" : "pezzi non sono stati accettati perché non risultano più in viaggio"} (venduti o tolti dal magazzino nel frattempo).`);
        await supabase.from("mag_ddt").update({ stato: "accettato", accettato_da: utente, accettato_il: new Date().toISOString() }).eq("id", d.id);
        caricaDdt(); ricarica();
    };
    const stampa = (d: Ddt) => {
        const mie = unitaDiDdt(d.id);
        const w = window.open("", "_blank"); if (!w) return;
        w.document.write(`<html><head><title>DDT ${d.numero}</title><style>body{font-family:sans-serif;padding:32px;color:#111}h1{font-size:20px}table{border-collapse:collapse;width:100%;margin-top:16px}td,th{border:1px solid #999;padding:6px 10px;font-size:13px;text-align:left}p{font-size:13px}</style></head><body>
<h1>Documento di trasporto n. ${d.numero}/${new Date(d.creato_il).getFullYear()}</h1>
<p><b>Mittente:</b> ${d.da_negozio} &nbsp;&nbsp; <b>Destinatario:</b> ${d.a_negozio}<br/><b>Data:</b> ${gghh(d.creato_il)} &nbsp;&nbsp; <b>Causale:</b> trasferimento tra punti vendita${d.note ? `<br/><b>Note:</b> ${d.note}` : ""}</p>
<table><tr><th>#</th><th>Codice</th><th>Descrizione</th><th>Seriale</th></tr>
${mie.map((u, i) => `<tr><td>${i + 1}</td><td>${u.codice || ""}</td><td>${u.descrizione}</td><td>${u.seriale}</td></tr>`).join("")}
</table><p style="margin-top:40px">Firma mittente ______________________ &nbsp;&nbsp;&nbsp; Firma destinatario ______________________</p>
<script>window.print()</script></body></html>`);
        w.document.close();
    };

    return (
        <div className="space-y-4">
            {gestisce && (
                <div className="rvPillRow">
                    {/* pastiglie, non bottoni verdi: aprono un riquadro, non
                        salvano niente — il verde promette (regola 7) */}
                    <button onClick={() => { setApriNuovo(v => !v); setApriCarico(false); }}
                        className={cn("rvPill", apriNuovo && "rvPill-on")}><Truck size={15} className="inline-block align-[-3px] mr-1.5" /> Nuovo trasferimento</button>
                    {puoCaricare && <button onClick={() => { setApriCarico(v => !v); setApriNuovo(false); }}
                        className={cn("rvPill", apriCarico && "rvPill-on")}><PackagePlus size={15} className="inline-block align-[-3px] mr-1.5" /> Carico merce</button>}
                </div>
            )}
            {apriCarico && <Carico negozi={negozi} aziende={aziende} utente={utente} dopo={() => { setApriCarico(false); ricarica(); }} />}
            {apriNuovo && <NuovoTrasferimento unita={unita} negozi={negozi} utente={utente} dopo={() => { setApriNuovo(false); caricaDdt(); ricarica(); }} />}
            <div className="rvTabBox">
                <table className="rvTab">
                    <thead>
                        <tr><th>DDT</th><th>Tragitto</th><th className="rvTab-c">Unità</th><th>Stato</th><th>Creato</th><th className="rvTab-c">Azioni</th></tr>
                    </thead>
                    <tbody>
                        {ddt.map(d => {
                            const n = unitaDiDdt(d.id).length;
                            return (
                                <tr key={d.id} className="rvTab-riga">
                                    <td className="rvTab-cod">n.{d.numero}</td>
                                    <td className="rvTab-nome">{d.da_negozio} → {d.a_negozio}</td>
                                    <td className="rvTab-n">{d.stato === "accettato" ? "✓" : n}</td>
                                    <td>{d.stato === "in_transito" ? "🚚 In transito" : d.stato === "accettato" ? `✅ Accettato da ${d.accettato_da} il ${gg(d.accettato_il)}` : d.stato}</td>
                                    <td className="rvTab-min">{gghh(d.creato_il)}{d.creato_da ? ` · ${d.creato_da}` : ""}</td>
                                    <td className="rvTab-c">
                                        <span className="rvPillRow rvPillRow-dritta justify-center">
                                            <button onClick={() => stampa(d)} className="rvPill rvPill-sm">🖨 DDT</button>
                                            {gestisce && d.stato === "in_transito" && (
                                                <button onClick={() => accetta(d)} className="rvPill rvPill-sm rvPill-si">✓ Accetta</button>
                                            )}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                        {!ddt.length && <tr><td colSpan={6} className="rvTab-vuoto">Nessun trasferimento ancora.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function NuovoTrasferimento({ unita, negozi, utente, dopo }: { unita: Unita[]; negozi: string[]; utente: string; dopo: () => void }) {
    const [da, setDa] = useState(""); const [a, setA] = useState(""); const [note, setNote] = useState("");
    const [filtro, setFiltro] = useState(""); const [scelte, setScelte] = useState<Set<string>>(new Set());
    const [busy, setBusy] = useState(false);
    const disponibili = useMemo(() =>
        unita.filter(u => u.stato === "disponibile" && u.negozio === da &&
            (!filtro || `${u.descrizione} ${u.seriale} ${u.codice || ""}`.toLowerCase().includes(filtro.toLowerCase()))),
        [unita, da, filtro]);
    const crea = async () => {
        if (!da || !a || da === a || !scelte.size) return;
        setBusy(true);
        const { data: d, error } = await supabase.from("mag_ddt").insert({ da_negozio: da, a_negozio: a, creato_da: utente, note: note.trim() || null }).select().single();
        if (error || !d) { setBusy(false); alert("DDT non creato: " + (error?.message || "")); return; }
        for (const id of scelte) {
            const u = unita.find(x => x.id === id); if (!u) continue;
            await supabase.from("mag_unita").update({
                stato: "in_transito", negozio: a, ddt_id: (d as Ddt).id,
                storia: [...(u.storia || []), { quando: new Date().toISOString(), evento: "🚚 In transito", negozio: `${da} → ${a}`, operatore: utente, note: `DDT n.${(d as Ddt).numero}` }],
            }).eq("id", id);
        }
        setBusy(false); dopo();
    };
    return (
        <div className="rvBox">
            <div className="rvBoxT">🚚 Nuovo trasferimento</div>
            <div className="rvBarra">
                {/* le tendine di sistema sono sparite anche qui: al loro posto
                    il selettore del CRM, che si scrive per filtrare */}
                <div className="rvCampo rvCampo-md"><span className="rvLab">Da</span>
                    <SelectOpzioni className="rvIn" value={da} onChange={v => { setDa(v); setScelte(new Set()); }}
                        opzioni={negozi} placeholder="scegli il negozio…" /></div>
                <div className="rvCampo rvCampo-md"><span className="rvLab">A</span>
                    <SelectOpzioni className="rvIn" value={a} onChange={setA}
                        opzioni={negozi.filter(n => n !== da)} placeholder="scegli il negozio…" /></div>
                <label className="rvCampo rvCampo-flex"><span className="rvLab">Note</span>
                    <input value={note} onChange={e => setNote(e.target.value)} placeholder="facoltative, finiscono sul DDT" className="rvIn" /></label>
            </div>
            {da && (
                <div className="rvSub mt-3">
                    <label className="rvCerca">
                        <Search size={16} />
                        <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Filtra le unità disponibili…" className="rvIn" />
                    </label>
                    <div className="rvDett max-h-64 overflow-y-auto mt-2 pr-1">
                        {disponibili.map(u => (
                            <label key={u.id} className="rvDettR rvDettR-cl">
                                <input type="checkbox" checked={scelte.has(u.id)} onChange={e => setScelte(p => { const s = new Set(p); if (e.target.checked) s.add(u.id); else s.delete(u.id); return s; })} />
                                <span className="rvTab-nome">{u.descrizione}</span>
                                <span className="rvDettR-mono">{u.seriale}</span>
                                {u.azienda && <span className="rvTab-min">· {u.azienda}</span>}
                            </label>
                        ))}
                        {!disponibili.length && <div className="rvVuoto"><b>Niente di disponibile a {da}</b></div>}
                    </div>
                </div>
            )}
            <div className="rvBarra rvBarra-c mt-3 justify-end">
                <button onClick={crea} disabled={busy || !da || !a || !scelte.size} className="rvAzione">
                    {busy ? "Creo…" : `Crea DDT (${scelte.size} unità)`}
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
