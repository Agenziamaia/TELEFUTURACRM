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
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Boxes, FileDown, Loader2, PackagePlus, Search, Truck } from "lucide-react";
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
        <div className="p-6 max-w-[1500px]">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
                <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Boxes size={26} /> Magazzino</h1>
                <div className="flex gap-2">
                    {([["giacenze", "📦 Giacenze"], ["ricerca", "🔍 Ricerca seriale"], ["trasferimenti", "🚚 Trasferimenti"], ["articoli", "📚 Articoli"]] as const).map(([k, l]) => (
                        <button key={k} onClick={() => setTab(k)}
                            className={cn("px-4 py-2 rounded-xl text-sm font-semibold border transition",
                                tab === k ? "bg-indigo-600 text-white border-transparent" : "text-slate-300 border-white/10 bg-white/[0.04] hover:bg-white/[0.08]")}>
                            {l}
                        </button>
                    ))}
                </div>
            </div>
            {loading ? (
                <div className="flex justify-center py-16 text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
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

    const selCls = "glass-input !h-9 text-sm";
    const btn = (attivo: boolean) => cn("px-3 h-9 rounded-lg text-xs font-bold border transition",
        attivo ? "bg-indigo-600 text-white border-transparent" : "text-slate-300 border-white/10 bg-white/[0.04] hover:bg-white/[0.08]");
    const colonne = ["Codice", "Descrizione", "Giacenza", "Altrove", "In arrivo", "Valore"];

    return (
        <div className="space-y-4">
            <div className="glass-panel rounded-2xl p-4 space-y-3">
                {/* DOVE GUARDO — il mio negozio è già scelto */}
                <div className="flex items-center gap-2 flex-wrap">
                    {mioNegozio && negozi.includes(mioNegozio) && (
                        <button onClick={() => setNegozio(mioNegozio)} className={btn(negozio === mioNegozio)}>🏠 {mioNegozio}</button>
                    )}
                    <button onClick={() => setNegozio("")} className={btn(!negozio)}>🌐 Tutti i negozi</button>
                    <div className="w-52"><SelectOpzioni className="glass-input w-full text-sm"
                        value={negozio && negozio !== mioNegozio ? negozio : ""} onChange={setNegozio}
                        opzioni={negozi} placeholder="…o un altro punto vendita" /></div>
                    <span className="w-px h-6 bg-white/10 mx-1" />
                    <button onClick={() => setSoloDisponibili(true)} className={btn(soloDisponibili)}>📗 Solo disponibili</button>
                    <button onClick={() => setSoloDisponibili(false)} className={btn(!soloDisponibili)}
                        title="Mostra anche quello che qui non c'è ma sta in un altro negozio">📚 Tutti gli articoli</button>
                </div>
                {/* I FILTRI FINI */}
                <div className="flex items-end gap-3 flex-wrap">
                    <label className="text-xs text-slate-400">Cerca<br />
                        <input value={cerca} onChange={e => setCerca(e.target.value)} placeholder="codice o descrizione…"
                            className={cn(selCls, "w-56")} /></label>
                    <label className="text-xs text-slate-400">Operatore<br />
                        <div className="w-44 mt-0.5"><SelectOpzioni className="glass-input w-full text-sm"
                            value={operatore} onChange={setOperatore}
                            opzioni={[...operatoriPresenti, "(nessuno)"]} placeholder="Tutti" /></div></label>
                    <label className="text-xs text-slate-400">Azienda<br />
                        <div className="w-56 mt-0.5"><SelectOpzioni className="glass-input w-full text-sm"
                            value={azienda ? (nomiAzienda[azienda] || azienda) : ""}
                            onChange={(v) => setAzienda(v ? (Object.keys(nomiAzienda).find(k => nomiAzienda[k] === v) || v) : "")}
                            opzioni={aziende.map(a => nomiAzienda[a] || a)} placeholder="Tutte le società" /></div></label>
                    <label className="text-xs text-slate-400">Stato<br />
                        <div className="w-44 mt-0.5"><SelectOpzioni className="glass-input w-full text-sm" disabled={!!dataStorica}
                            value={stato ? (STATI_LABEL[stato] || stato) : ""}
                            onChange={(v) => setStato(v ? (Object.keys(STATI_LABEL).find(k => STATI_LABEL[k] === v) || "") : "")}
                            opzioni={Object.values(STATI_LABEL)} placeholder="Tutti" /></div></label>
                    <label className="text-xs text-slate-400" title="Fotografia del magazzino a quella data: caricato entro la data e non ancora venduto">Giacenza alla data<br />
                        <input type="date" value={dataStorica} onChange={e => setDataStorica(e.target.value)} className={selCls} /></label>
                    {dataStorica && <button onClick={() => setDataStorica("")} className="text-xs text-slate-400 hover:text-white pb-2">✕ oggi</button>}
                    <div className="flex-1" />
                    <button onClick={esporta} disabled={!righe.length}
                        className="px-3 h-9 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-40">
                        <FileDown size={14} /> Excel
                    </button>
                </div>
                {dataStorica && (
                    <p className="text-[11px] text-amber-300/80">
                        La fotografia a una data passata vale sui soli pezzi con seriale: le quantità non hanno una storia per riga.
                    </p>
                )}
            </div>
            {daCestinare && (
                <div className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-4" onClick={() => !cestinando && setDaCestinare(null)}>
                    <div className="glass-card rounded-2xl p-6 w-[min(460px,92vw)]" onClick={e => e.stopPropagation()}>
                        <div className="text-lg font-bold text-white mb-1">Togliere dal magazzino?</div>
                        <p className="text-sm text-slate-300 mb-1">{daCestinare.titolo}</p>
                        <p className="text-xs text-slate-400 mb-4">
                            {daCestinare.seriale
                                ? <>pezzo <span className="font-mono">{daCestinare.seriale}</span> · {daCestinare.negozio}</>
                                : <>{daCestinare.quantita} pezzi · {daCestinare.negozio}</>}
                        </p>
                        {/* niente sparisce davvero: resta scritto chi, quando e perché */}
                        <p className="text-[11px] text-slate-500 mb-3">
                            {daCestinare.seriale
                                ? "Il pezzo non sarà più vendibile né trasferibile, ma la sua storia resta."
                                : "La giacenza va a zero con una rettifica: il movimento resta scritto."}
                        </p>
                        <input value={motivo} onChange={e => setMotivo(e.target.value)} autoFocus
                            placeholder="perché? (rubato, rotto, mai arrivato…)"
                            className="glass-input w-full text-sm mb-4" />
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => { setDaCestinare(null); setMotivo(""); }} disabled={cestinando}
                                className="px-4 h-9 rounded-lg text-sm text-slate-300 border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-40">Annulla</button>
                            <button onClick={cestina} disabled={cestinando}
                                className="px-4 h-9 rounded-lg text-sm font-bold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-40 inline-flex items-center gap-2">
                                {cestinando && <Loader2 className="w-4 h-4 animate-spin" />}Sì, toglilo
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <div className="glass-card overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-white/[0.03] text-xs uppercase text-slate-400">
                        <tr>{colonne.map((cta, i) => (
                            <th key={i} className={cn("px-4 py-3 font-semibold cursor-pointer select-none", i >= 2 && "text-center")}
                                onClick={() => setSort(s => ({ col: i, desc: s.col === i ? !s.desc : false }))}
                                title={i === 3 ? "Quanti ce ne sono negli ALTRI punti vendita" : undefined}>
                                {cta}{sort.col === i ? (sort.desc ? " ↓" : " ↑") : ""}
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
                                        className={cn("border-t border-white/5", apribile && "cursor-pointer hover:bg-white/[0.03]", apertaQui && "bg-white/[0.05]")}>
                                        <td className="px-4 py-2 font-mono text-xs text-slate-400">
                                            {apribile && <span className="mr-1.5 text-slate-500">{apertaQui ? "▾" : "▸"}</span>}{r.codice}
                                        </td>
                                        <td className="px-4 py-2 text-white">
                                            {r.descrizione}
                                            {r.operatore && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 align-middle">{r.operatore}</span>}
                                        </td>
                                        <td className={cn("px-4 py-2 text-center font-bold", r.giacenza > 0 ? "text-emerald-300" : r.giacenza < 0 ? "text-rose-300" : "text-slate-600")}>{r.giacenza}</td>
                                        <td className="px-4 py-2 text-center text-amber-300/90">{r.altrove || "—"}</td>
                                        <td className="px-4 py-2 text-center text-sky-300">{r.inArrivo || "—"}</td>
                                        <td className="px-4 py-2 text-center tabular-nums">{eur(r.valore)}</td>
                                    </tr>
                                    {apertaQui && (
                                        <tr className="bg-black/20">
                                            <td colSpan={6} className="px-6 py-3">
                                                {r.pezzi.length > 0 ? (
                                                    <div className="space-y-1">
                                                        <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">I pezzi, uno per uno</div>
                                                        {r.pezzi.map(p => (
                                                            <div key={p.id} className="flex items-center gap-3 text-xs">
                                                                <span className="font-mono text-slate-300 w-44">{p.seriale}</span>
                                                                <span className={cn("px-2 py-0.5 rounded text-[11px]",
                                                                    p.negozio === negozio || (!negozio && p.negozio === mioNegozio)
                                                                        ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300")}>
                                                                    {p.negozio}
                                                                </span>
                                                                <span className="text-slate-500">{STATI_LABEL[p.stato] || p.stato}</span>
                                                                <span className="text-slate-400 tabular-nums ml-auto">{eur(p.valore)}</span>
                                                                {puoCancellare && (
                                                                    <button title="Togli questo pezzo dal magazzino"
                                                                        onClick={(e) => { e.stopPropagation(); setDaCestinare({ titolo: r.descrizione, codice: r.codice, pezzoId: p.id, seriale: p.seriale, negozio: p.negozio }); }}
                                                                        className="text-slate-500 hover:text-rose-400 transition px-1">🗑</button>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : r.qtaPer.length === 0 ? (
                                                    <div className="text-xs text-slate-400">Nessun dettaglio da mostrare.</div>
                                                ) : null}
                                                {r.qtaPer.length > 0 && (
                                                    <div className={cn("space-y-1", r.pezzi.length > 0 && "mt-3 pt-3 border-t border-white/5")}>
                                                        <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">Merce a quantità, negozio per negozio</div>
                                                        {r.qtaPer.map(q => (
                                                            <div key={q.negozio + q.azienda} className="flex items-center gap-3 text-xs">
                                                                <span className={cn("px-2 py-0.5 rounded text-[11px] w-36",
                                                                    q.negozio === negozio || (!negozio && q.negozio === mioNegozio)
                                                                        ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300")}>
                                                                    {q.negozio}
                                                                </span>
                                                                <span className="text-slate-500">{nomiAzienda[q.azienda] || q.azienda}</span>
                                                                <span className="text-slate-300 ml-auto"><b className={q.quantita < 0 ? "text-rose-300" : "text-emerald-300"}>{q.quantita}</b> pezzi</span>
                                                                {q.inArrivo > 0 && <span className="text-sky-300">+{q.inArrivo} in arrivo</span>}
                                                                {puoCancellare && q.quantita !== 0 && (
                                                                    <button title="Azzera questa giacenza (resta scritto chi e perché)"
                                                                        onClick={(e) => { e.stopPropagation(); setDaCestinare({ titolo: r.descrizione, codice: r.codice, negozio: q.negozio, azienda: q.azienda, quantita: q.quantita }); }}
                                                                        className="text-slate-500 hover:text-rose-400 transition px-1">🗑</button>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                {Object.keys(r.altrovePer).length > 0 && (
                                                    <div className="mt-3 pt-3 border-t border-white/5">
                                                        <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">Dove sta, negli altri negozi</div>
                                                        <div className="flex flex-wrap gap-2">
                                                            {Object.entries(r.altrovePer).sort((a, b) => b[1] - a[1]).map(([neg, n]) => (
                                                                <span key={neg} className="text-xs px-2 py-1 rounded-lg bg-white/[0.05] text-slate-300">
                                                                    {neg} <b className="text-amber-300">{n}</b>
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
                        {!righe.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">
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
            <div className="glass-panel rounded-2xl p-4 flex items-center gap-2">
                <Search size={18} className="text-slate-400 shrink-0" />
                <input value={testo} onChange={e => setTesto(e.target.value)} onKeyDown={e => e.key === "Enter" && cerca()}
                    placeholder="Cerca IMEI / SIM / seriale…" className="flex-1 bg-transparent outline-none text-white text-sm py-2" />
                <button onClick={cerca} disabled={busy || testo.trim().length < 5}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold disabled:opacity-40">
                    {busy ? "Cerco…" : "Cerca"}
                </button>
            </div>
            {schede && !schede.length && <div className="glass-panel rounded-2xl p-6 text-center text-slate-400 text-sm">Nessuna traccia di questo seriale: né a magazzino, né negli usati, né nelle vendite.</div>}
            {schede?.map((sc, i) => (
                <div key={i} className="glass-panel rounded-2xl p-5">
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
                        <div className="text-sm font-bold text-white">{sc.titolo}</div>
                        <span className="text-xs font-semibold text-slate-300 bg-white/[0.06] border border-white/10 rounded-full px-2.5 py-1">{sc.stato}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mb-3">{sc.sotto}</div>
                    <div className="space-y-1.5">
                        {sc.eventi.sort((a, b) => String(a.quando).localeCompare(String(b.quando))).map((e, j) => (
                            <div key={j} className="flex items-start gap-2 text-[12px] text-slate-300">
                                <span className="text-slate-500 font-mono shrink-0 w-32">{gghh(e.quando)}</span>
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
                <div className="flex gap-2">
                    <button onClick={() => { setApriNuovo(v => !v); setApriCarico(false); }} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold inline-flex items-center gap-2"><Truck size={15} /> Nuovo trasferimento</button>
                    {puoCaricare && <button onClick={() => { setApriCarico(v => !v); setApriNuovo(false); }} className="px-4 py-2 rounded-xl border border-white/15 text-slate-200 text-sm font-semibold inline-flex items-center gap-2"><PackagePlus size={15} /> Carico merce</button>}
                </div>
            )}
            {apriCarico && <Carico negozi={negozi} aziende={aziende} utente={utente} dopo={() => { setApriCarico(false); ricarica(); }} />}
            {apriNuovo && <NuovoTrasferimento unita={unita} negozi={negozi} utente={utente} dopo={() => { setApriNuovo(false); caricaDdt(); ricarica(); }} />}
            <div className="glass-card overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-white/[0.03] text-xs uppercase text-slate-400">
                        <tr><th className="px-4 py-3">DDT</th><th className="px-4 py-3">Tragitto</th><th className="px-4 py-3">Unità</th><th className="px-4 py-3">Stato</th><th className="px-4 py-3">Creato</th><th className="px-4 py-3 text-center w-40">Azioni</th></tr>
                    </thead>
                    <tbody>
                        {ddt.map(d => {
                            const n = unitaDiDdt(d.id).length;
                            return (
                                <tr key={d.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                                    <td className="px-4 py-2 font-mono text-xs">n.{d.numero}</td>
                                    <td className="px-4 py-2 text-white">{d.da_negozio} → {d.a_negozio}</td>
                                    <td className="px-4 py-2">{d.stato === "accettato" ? "✓" : n}</td>
                                    <td className="px-4 py-2">{d.stato === "in_transito" ? "🚚 In transito" : d.stato === "accettato" ? `✅ Accettato da ${d.accettato_da} il ${gg(d.accettato_il)}` : d.stato}</td>
                                    <td className="px-4 py-2 text-xs text-slate-500">{gghh(d.creato_il)}{d.creato_da ? ` · ${d.creato_da}` : ""}</td>
                                    <td className="px-4 py-2 text-center">
                                        <button onClick={() => stampa(d)} className="text-xs text-slate-300 border border-white/10 rounded-lg px-2 py-1 mr-1">🖨 DDT</button>
                                        {gestisce && d.stato === "in_transito" && (
                                            <button onClick={() => accetta(d)} className="text-xs text-emerald-300 border border-emerald-500/40 rounded-lg px-2 py-1">✓ Accetta</button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                        {!ddt.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Nessun trasferimento ancora.</td></tr>}
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
    const selCls = "glass-input !h-9 text-sm";
    return (
        <div className="glass-panel rounded-2xl p-5 space-y-3">
            <div className="text-sm font-bold text-white">🚚 Nuovo trasferimento</div>
            <div className="flex items-end gap-3 flex-wrap">
                <label className="text-xs text-slate-400">Da<br />
                    <select value={da} onChange={e => { setDa(e.target.value); setScelte(new Set()); }} className={selCls}><option value="">—</option>{negozi.map(n => <option key={n}>{n}</option>)}</select></label>
                <label className="text-xs text-slate-400">A<br />
                    <select value={a} onChange={e => setA(e.target.value)} className={selCls}><option value="">—</option>{negozi.filter(n => n !== da).map(n => <option key={n}>{n}</option>)}</select></label>
                <label className="text-xs text-slate-400 flex-1 min-w-[200px]">Note<br />
                    <input value={note} onChange={e => setNote(e.target.value)} placeholder="facoltative, finiscono sul DDT" className={selCls + " w-full"} /></label>
            </div>
            {da && (
                <>
                    <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Filtra le unità disponibili…" className="glass-input !h-9 text-sm w-full" />
                    <div className="max-h-64 overflow-y-auto space-y-1">
                        {disponibili.map(u => (
                            <label key={u.id} className="flex items-center gap-2 text-[12px] text-slate-300 px-2 py-1 rounded-lg hover:bg-white/[0.04] cursor-pointer">
                                <input type="checkbox" checked={scelte.has(u.id)} onChange={e => setScelte(p => { const s = new Set(p); if (e.target.checked) s.add(u.id); else s.delete(u.id); return s; })} />
                                <span className="text-white">{u.descrizione}</span>
                                <span className="font-mono text-slate-500">{u.seriale}</span>
                                {u.azienda && <span className="text-slate-600">· {u.azienda}</span>}
                            </label>
                        ))}
                        {!disponibili.length && <div className="text-xs text-slate-500 italic px-2 py-3">Niente di disponibile a {da}.</div>}
                    </div>
                </>
            )}
            <div className="text-right">
                <button onClick={crea} disabled={busy || !da || !a || !scelte.size}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold disabled:opacity-40">
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
    const selCls = "glass-input !h-9 text-sm";
    return (
        <div className="glass-panel rounded-2xl p-5 space-y-3">
            <div className="text-sm font-bold text-white">📥 Carico merce</div>
            <div className="flex items-end gap-3 flex-wrap">
                <label className="text-xs text-slate-400 flex-1 min-w-[220px]">Descrizione articolo<br />
                    <input value={descrizione} onChange={e => setDescrizione(e.target.value)} placeholder='es. "iPhone 15 128GB Nero"' className={selCls + " w-full"} /></label>
                <label className="text-xs text-slate-400">Codice<br />
                    <input value={codice} onChange={e => setCodice(e.target.value)} className={selCls + " w-28"} /></label>
                <label className="text-xs text-slate-400">Tipo seriale<br />
                    <select value={tipo} onChange={e => setTipo(e.target.value)} className={selCls}><option value="imei">IMEI</option><option value="sim">SIM (ICCID)</option><option value="seriale">Seriale</option></select></label>
                <label className="text-xs text-slate-400">Negozio<br />
                    <select value={negozio} onChange={e => setNegozio(e.target.value)} className={selCls}><option value="">—</option>{negozi.map(n => <option key={n}>{n}</option>)}</select></label>
                <label className="text-xs text-slate-400">Azienda<br />
                    <select value={azienda} onChange={e => setAzienda(e.target.value)} className={selCls}><option value="">—</option>{Array.from(new Set([...aziende, "T1", "T2"])).map(a => <option key={a}>{a}</option>)}</select></label>
                <label className="text-xs text-slate-400">Valore unitario €<br />
                    <input value={valore} onChange={e => setValore(e.target.value)} className={selCls + " w-24"} /></label>
            </div>
            <label className="text-xs text-slate-400 block">Seriali (uno per riga — spara pure col lettore barcode)<br />
                <textarea value={seriali} onChange={e => setSeriali(e.target.value)} rows={5} className="glass-input w-full text-sm font-mono mt-1" /></label>
            <div className="text-right">
                <button onClick={salva} disabled={busy || !descrizione.trim() || !negozio || !seriali.trim()}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-40">
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

    if (loading) return <div className="flex justify-center py-16 text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>;
    return (
        <div className="space-y-4">
            {/* chips dei GRUPPI coi conteggi: la divisione per brand a colpo d'occhio */}
            <div className="flex flex-wrap gap-1.5">
                <button onClick={() => setGruppo("")}
                    className={cn("px-3 py-1.5 rounded-xl border text-xs font-semibold transition",
                        !gruppo ? "bg-indigo-600 text-white border-transparent" : "text-slate-300 border-white/10 bg-white/[0.04] hover:bg-white/[0.08]")}>
                    Tutti · {articoli.length}
                </button>
                {gruppi.map(([g, n]) => (
                    <button key={g} onClick={() => setGruppo(gruppo === g ? "" : g)}
                        className={cn("px-3 py-1.5 rounded-xl border text-xs font-semibold transition",
                            gruppo === g ? "bg-indigo-600 text-white border-transparent" : "text-slate-300 border-white/10 bg-white/[0.04] hover:bg-white/[0.08]")}>
                        {g} · {n}
                    </button>
                ))}
            </div>
            <div className="glass-panel rounded-2xl p-4 flex items-end gap-3 flex-wrap">
                <label className="text-xs text-slate-400">Marca<br />
                    <SelectOpzioni value={marca} onChange={setMarca} opzioni={marche} placeholder="Tutte" className="w-44" />
                </label>
                <label className="text-xs text-slate-400 flex-1 min-w-[220px]">Cerca (codice, barcode, descrizione)<br />
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input value={cerca} onChange={e => setCerca(e.target.value)} placeholder="Es. Galaxy A16, 8032325…"
                            className="glass-input !h-9 text-sm w-full pl-9" />
                    </div>
                </label>
                <button onClick={esporta} disabled={!filtrati.length}
                    className="px-3 h-9 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-40">
                    <FileDown size={14} /> Excel
                </button>
            </div>
            <div className="glass-card overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-white/[0.03] text-xs uppercase text-slate-400">
                        <tr>
                            <th className="px-4 py-3 font-semibold">Codice</th>
                            <th className="px-4 py-3 font-semibold">Barcode</th>
                            <th className="px-4 py-3 font-semibold">Descrizione</th>
                            <th className="px-4 py-3 font-semibold">Sottogruppo</th>
                            <th className="px-4 py-3 font-semibold">Marca</th>
                            <th className="px-4 py-3 font-semibold text-center">Prezzo</th>
                            {vedeCosti && <th className="px-4 py-3 font-semibold text-center">Costo ult.</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {visibili.map(a => (
                            <tr key={a.codice} className="border-t border-white/5 hover:bg-white/[0.03]">
                                <td className="px-4 py-2 font-mono text-xs text-slate-400 whitespace-nowrap">{a.codice}</td>
                                <td className="px-4 py-2 font-mono text-xs text-slate-500 whitespace-nowrap">{a.barcode || "—"}</td>
                                <td className="px-4 py-2 text-slate-200">{a.descrizione}</td>
                                <td className="px-4 py-2 text-xs text-slate-400">{a.sottogruppo || "—"}</td>
                                <td className="px-4 py-2 text-xs text-slate-400">{a.marca || "—"}</td>
                                <td className="px-4 py-2 text-center tabular-nums">{eur(a.prezzo)}</td>
                                {vedeCosti && <td className="px-4 py-2 text-center tabular-nums text-slate-400">{eur(a.costo_ultimo)}</td>}
                            </tr>
                        ))}
                        {!filtrati.length && <tr><td colSpan={vedeCosti ? 7 : 6} className="px-4 py-10 text-center text-slate-500">Nessun articolo con questi filtri.</td></tr>}
                    </tbody>
                </table>
                {filtrati.length > TETTO && (
                    <div className="px-4 py-3 text-xs text-slate-500 border-t border-white/5">
                        Mostro i primi {TETTO} di {filtrati.length.toLocaleString("it-IT")} articoli — affina coi filtri o usa l&apos;Excel per l&apos;elenco completo.
                    </div>
                )}
            </div>
        </div>
    );
}
