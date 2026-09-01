"use client";

/* ═══ DOCUMENTI EMESSI ═══════════════════════════════════════════════════════
 *
 * Luca 01/09 sera: «dobbiamo creare una sezione di documenti dentro il lab di
 * vendite, dove mettiamo tutti gli scontrini che un negozio fa, ma anche le
 * fatture. Ogni punto vendita vede i suoi, l'amministrazione li vede tutti. Se
 * qualcosa non torna, cliccano e si apre il dettaglio di quello che hanno
 * scontrinato. E il punto vendita può fare una richiesta di modifica del
 * pagamento, che arriva in amministrazione.»
 *
 * DA DOVE VENGONO I DOCUMENTI. Non da una tabella nuova: dalla coda di stampa
 * (`print_jobs`), che è l'unico posto dove un documento esiste davvero — con
 * dentro l'XML mandato al registratore. Quell'XML contiene le righe una per
 * una, i reparti IVA e le forme di pagamento ESATTAMENTE come sono finite
 * sulla carta. Una tabella parallela avrebbe potuto divergere dallo scontrino
 * vero; questa no, per costruzione.
 *
 * ═══ COSA HA CAMBIATO LA REVISIONE DI STASERA ═══════════════════════════════
 * Due agenti — uno sulla sostanza, uno sul disegno — hanno trovato quindici
 * difetti su misura. I tre che contano davvero, e come sono chiusi qui:
 *
 *  ① CHI NON HA NEGOZI VEDEVA TUTTO. `if (!seesAll && stores.length)`: con la
 *    lista vuota il filtro non veniva applicato e la query tornava l'intero
 *    parco. Non è teorico — c'è un utente attivo con zero negozi assegnati che
 *    vedeva tutti e 14 i punti vendita. Sotto non c'è nessuna rete: la policy
 *    di `print_jobs` è «basta essere loggati». Ora si fallisce CHIUSI: lista
 *    vuota significa «non ho negozi», non «non ho restrizioni».
 *
 *  ② I GEMELLI SI SPEZZAVANO. Lo scontrino è archiviato sotto il negozio
 *    PROPRIETARIO del registratore, non sotto quello che vende: chi è
 *    assegnato al solo Collatina W3 vedeva 3 documenti su 6 fatti dal suo
 *    stesso bancone. L'ambito si espande ora ai gemelli di sede fisica, come
 *    fa già tutto il resto della pagina.
 *
 *  ③ IL NUMERO NON C'È SU META' DEL PARCO. Sui registratori Custom l'esito è
 *    `{"ok":true,"msg":"fiscale stampato","matricola":"…"}`: il numero non lo
 *    riporta — misurato su 224 documenti veri, zero. Non lo si inventa e non
 *    si finge: quei documenti si cercano per matricola, ora, e la pagina dice
 *    apertamente perché il numero manca.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { Fragment, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import { useVisibleStores, stessoMagazzino, negozioInValues } from "@/lib/visibleStores";
import { SelectMulti, SelectOpzioni } from "@/components/SelectPersona";
import { FileDown, RefreshCw, Receipt, Loader2 } from "lucide-react";

const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
/** Gli euro come li scrive il resto del CRM: col punto delle migliaia. Prima
 *  questa tabella diceva «€ 1249,00» e quella del Magazzino «1.249,00 €». */
const eur = (n: number | null | undefined) => n == null ? "—"
    : Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const eurTondo = (n: number) =>
    new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(n) || 0);
const gg = (s: string | null) => (s ? new Date(s).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");
const ora = (s: string | null) => (s ? new Date(s).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "");
/** Il corpo del numero segue la LUNGHEZZA DELLA STRINGA, non la cifra: è la
 *  regola scritta nella cassetta (globals 985), ed è la stessa che usa il
 *  Magazzino. Decidendo sul valore, «1.000» usciva a 17px invece che a 24. */
const corpoNumero = (t: string) => t.length >= 11 ? "rvNum-s" : t.length >= 8 ? "rvNum-m" : undefined;

/* GIORNO LOCALE → ISTANTE UTC. Il database vive in UTC: chiedere
   `>= '2026-09-01T00:00:00'` significa chiedere dalle 02:00 di Roma. Con gli
   orari di negozio non si nota, ma la prima chiusura fatta a mezzanotte
   finirebbe nel giorno sbagliato — e una chiusura nel giorno sbagliato è un
   problema fiscale, non estetico. */
const inizioGiorno = (d: string) => new Date(`${d}T00:00:00`).toISOString();
const fineGiorno = (d: string) => new Date(`${d}T23:59:59.999`).toISOString();

/* ── COSA C'È DENTRO UN DOCUMENTO ────────────────────────────────────────────
   L'XML del registratore si legge una volta sola, qui, e diventa righe e
   pagamenti. Due dialetti, non uno:
     · FISCALE     <printRecItem …/> + <printRecTotal …/>
     · NON FISCALE <printerNonFiscal><printNormal data="E.Telefono  x1  EUR 1.00"/>
   Il secondo prima non veniva letto affatto: 73 documenti su 224 si aprivano
   dicendo «dettaglio non disponibile» mentre il dettaglio era lì dentro. */
type RigaDoc = { descrizione: string; quantita: number; prezzo: number; reparto: number | null };
type PagDoc = { descrizione: string; importo: number; tipo: number };

const dec = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

function leggiXml(xml: string | null): { righe: RigaDoc[]; pagamenti: PagDoc[]; diagnostica: boolean; totaleDichiarato: number | null } {
    const righe: RigaDoc[] = [], pagamenti: PagDoc[] = [];
    if (!xml) return { righe, pagamenti, diagnostica: false, totaleDichiarato: null };
    const attr = (t: string, n: string) => { const m = t.match(new RegExp(`${n}="([^"]*)"`)); return m ? dec(m[1]) : ""; };

    for (const m of xml.matchAll(/<printRecItem\b[^>]*\/>/g)) {
        const t = m[0];
        righe.push({
            descrizione: attr(t, "description"),
            quantita: Number(attr(t, "quantity")) || 1,
            prezzo: Number(attr(t, "unitPrice")) || 0,
            reparto: attr(t, "department") ? Number(attr(t, "department")) : null,
        });
    }
    for (const m of xml.matchAll(/<printRecTotal\b[^>]*\/>/g)) {
        const t = m[0];
        pagamenti.push({ descrizione: attr(t, "description"), importo: Number(attr(t, "payment")) || 0, tipo: Number(attr(t, "paymentType")) || 0 });
    }

    /* IL NON FISCALE È UN FOGLIO BATTUTO A MACCHINA, non un elenco di articoli:
       dentro ci sono intestazioni, separatori, il totale e i pagamenti. Prima
       si prendeva OGNI riga come un articolo — 488 righe su 675 non lo erano —
       e dove mancava `meta.total` il documento veniva contato DOPPIO, perché
       la riga «TOTALE» finiva fra la merce. Si legge a sezioni, come è scritto. */
    let diagnostica = false, totaleDichiarato: number | null = null;
    if (!righe.length) {
        let neiPagamenti = false;
        for (const m of xml.matchAll(/<printNormal\b[^>]*\/>/g)) {
            const t = dec(m[0].match(/data="([^"]*)"/)?.[1] || "");
            if (!t.trim()) continue;
            /* LE PROVE DI COLLEGAMENTO NON SONO DOCUMENTI: «== CHECK COLLATINA
               W3 ==» è il tasto che verifica se la cassa risponde. */
            if (/^\s*=+\s*CHECK/i.test(t)) { diagnostica = true; continue; }
            if (/^\s*[-=_.*]{3,}\s*$/.test(t)) continue;                 // separatore
            if (/^\s*\*{2,}/.test(t)) continue;                          // intestazione
            if (/^\s*\(PROVA\)/i.test(t)) continue;
            if (/^\s*azienda\s*:/i.test(t)) continue;
            if (/non valido ai fini fiscali|documento non fiscale/i.test(t)) continue;
            if (/^\s*pagament/i.test(t)) { neiPagamenti = true; continue; }

            const p = t.match(/EUR\s*([0-9]+(?:[.,][0-9]+)?)\s*$/i);
            const importo = p ? Number(p[1].replace(",", ".")) || 0 : 0;
            const q = t.match(/\sx\s*([0-9]+)\b/i);
            const desc = t.replace(/EUR\s*[0-9]+(?:[.,][0-9]+)?\s*$/i, "").replace(/\sx\s*[0-9]+\b/i, "").trim();
            if (/^\s*tot(ale)?\b/i.test(desc)) { totaleDichiarato = importo; continue; }
            if (!desc || !p) continue;      // senza prezzo non è né merce né pagamento
            if (neiPagamenti) pagamenti.push({ descrizione: desc, importo, tipo: /cart|elettron|pos\b/i.test(desc) ? 2 : 0 });
            else righe.push({ descrizione: desc, quantita: q ? Number(q[1]) || 1 : 1, prezzo: importo, reparto: null });
        }
    }
    return { righe, pagamenti, diagnostica, totaleDichiarato };
}

/** Il numero del documento. L'Epson lo riporta nel suo XML di risposta; il
 *  Custom NON lo riporta affatto (verificato su 224 documenti: zero). Se non
 *  c'è, non si inventa — e la pagina lo dice, invece di lasciare una colonna
 *  misteriosamente vuota su nove negozi su quattordici. */
function numeroDoc(result: string | null): string | null {
    if (!result) return null;
    const a = result.match(/\(n\.\s*([0-9-]+)\)/i);
    if (a) return a[1];
    const b = result.match(/<(?:fiscalReceiptNumber|zRepNumber|receiptNumber)>([^<]+)</i);
    if (b) return b[1].trim();
    const c = result.match(/"(?:numero|nDoc|docNumber)"\s*:\s*"?([0-9-]+)"?/i);
    return c ? c[1] : null;
}

/** La matricola del registratore. Il Custom la mette nel suo JSON, l'Epson in
 *  `<serialNumber>`: prima si leggeva solo la prima, e sui documenti Epson non
 *  restava NIENTE con cui cercare — né numero né matricola. */
function matricolaDoc(result: string | null): string | null {
    if (!result) return null;
    return result.match(/"matricola"\s*:\s*"([^"]+)"/)?.[1]
        || result.match(/<serialNumber>([^<]+)</i)?.[1]?.trim()
        || null;
}

/* ── COM'È ANDATA DAVVERO ────────────────────────────────────────────────────
   `error` non vuol dire «non è uscito». Su 46 fallimenti, 40 hanno questo
   esito: «esito mai ricevuto: l'agente del negozio ha ritirato il lavoro ma
   non ha mai riportato com'è andata». Significa ESITO IGNOTO — la carta può
   benissimo essere uscita. Dire «non uscito» a un negozio che sta cercando di
   capire se ha fatto uno scontrino è la risposta sbagliata, e su quella
   risposta uno rifà lo scontrino e batte due volte. */
type Esito = { et: string; tono: string; spiega: string };
function esitoDi(stato: string, result: string | null): Esito | null {
    if (stato === "done") return null;
    if (stato === "pending") return { et: "in coda", tono: "rvBadge-warn", spiega: "è ancora in attesa che la cassa lo ritiri." };
    if (stato === "sent") return { et: "in stampa", tono: "rvBadge-warn", spiega: "la cassa l'ha ritirato e sta stampando: fra poco si saprà com'è andata." };
    if (stato === "error") {
        if (/esito mai ricevuto|chiuso d'ufficio/i.test(result || ""))
            return { et: "esito ignoto", tono: "rvBadge-warn", spiega: "la cassa l'ha ritirato ma non ha mai detto com'è andata: la carta può essere uscita lo stesso. Prima di rifarlo, guarda lo scontrino." };
        /* «NON USCITO» ERA FALSO, e Luca l'ha fotografato: a Garbatella il
           rullo aveva stampato l'articolo e il totale, e il display chiedeva
           ancora «DIFFERENZA 109,89». Quando la cassa rifiuta a metà, le righe
           della merce SONO GIÀ USCITE e il documento resta APERTO: dirgli che
           non è uscito lo porta a rifarlo, cioè a scontrinare due volte. */
        if (/PRINTER ERROR/i.test(result || ""))
            return { et: "rimasto aperto", tono: "rvBadge-ko",
                spiega: "la cassa ha stampato le righe e poi ha rifiutato il totale: dal rullo esce mezzo scontrino e il documento resta aperto. Chiudilo o annullalo DALLA CASSA prima di rifarlo, se no lo batti due volte." };
        return { et: "non uscito", tono: "rvBadge-ko", spiega: "la cassa ha risposto con un errore: il documento non è stato emesso." };
    }
    return { et: stato, tono: "rvBadge-empty", spiega: "" };
}

type Doc = {
    id: string;
    quando: string;
    negozio: string;
    tipo: "scontrino" | "fattura";
    fiscale: boolean;
    storno: boolean;
    prova: boolean;
    stato: string;
    result: string | null;
    totale: number | null;
    numero: string | null;
    matricola: string | null;
    cliente: string | null;
    operatore: string | null;
    contrattoId: string | null;
    azienda: string | null;
    righe: RigaDoc[];
    pagamenti: PagDoc[];
};

const NOME_PAG: Record<number, string> = { 0: "Contanti", 1: "Assegno", 2: "Carta / elettronico", 3: "Ticket", 4: "Non riscosso" };
/* MILLE, non tremila: e' il `max-rows` di PostgREST su questo progetto —
   provato, `.limit(3000)` restituisce comunque 1000. Scrivendo 3000 l'avviso
   di troncamento non sarebbe uscito MAI, e a una settimana di documenti per
   l'amministrazione (~1.250) l'elenco si sarebbe tagliato in silenzio.
   Il conteggio esatto arriva a parte (`count`), cosi' la pagina non dice
   «1.000 documenti» quando ce ne sono quattromila. */
const TETTO = 1000;

/* ELENCO CHIUSO. `SelectOpzioni` e' una casella a testo libero: svuotandola si
   poteva mandare in amministrazione «Il cliente ha invece pagato: » — una
   richiesta che non chiede niente. Il bottone si spegne se il valore non e'
   uno di questi. */
const FORME_PAGAMENTO = ["Contanti", "Carta", "Bonifico", "Non riscosso / credito", "Finanziamento"];

function Documenti() {
    const { user } = useAuth();
    const { seesAll, stores: negoziVisibili, loaded: visibilitaPronta } = useVisibleStores();

    const [docs, setDocs] = useState<Doc[] | null>(null);
    const [errore, setErrore] = useState("");
    const [caricando, setCaricando] = useState(false);
    const [quantiInTutto, setQuantiInTutto] = useState<number | null>(null);
    const [tuttiNegozi, setTuttiNegozi] = useState<string[]>([]);
    const [uffici, setUffici] = useState<string[]>([]);

    /* ── I FILTRI ──────────────────────────────────────────────────────────── */
    const [tipo, setTipo] = useState<"" | "scontrino" | "fattura">("");
    const [scelti, setScelti] = useState<string[]>([]);
    const [cerca, setCerca] = useState("");
    const [utenti, setUtenti] = useState<string[]>([]);
    const oggi = new Date().toLocaleDateString("sv-SE");
    const [dal, setDal] = useState(oggi);
    const [al, setAl] = useState(oggi);
    const [aperto, setAperto] = useState<string | null>(null);
    const [sort, setSort] = useState<{ col: number; desc: boolean }>({ col: 0, desc: true });

    /* CHI ARRIVA DA UNA TASK ATTERRA SUL DOCUMENTO, non sull'elenco di oggi.
       La richiesta di correzione porta con sé id e data: senza, Claudia apriva
       «/documenti» e trovava la giornata corrente dei SUOI negozi — cioè non il
       documento. È lo stesso errore già corretto il 31/08 sul bonifico. */
    /* `useSearchParams` E NON `window.location`, che e' la prassi di casa
       altrove: qui l'indirizzo cambia SENZA che la pagina si rimonti — chi e'
       gia' su Documenti e clicca un'altra task resterebbe fermo sul documento
       di prima. Il nonce `t=` che mette UrgentTasks serve proprio a questo, e
       con `window.location` letto una volta sola non sarebbe servito a niente. */
    const parametri = useSearchParams();
    useEffect(() => {
        const d = parametri.get("doc"), g = parametri.get("giorno");
        if (g && /^\d{4}-\d{2}-\d{2}$/.test(g)) { setDal(g); setAl(g); }
        if (d) setAperto(d);
    }, [parametri]);

    /* TUTTI I NOMI DEI NEGOZI, che servono per trovare i gemelli di sede
       fisica: «Collatina W3» e «Collatina Multi» sono lo stesso bancone. */
    useEffect(() => {
        supabase.from("stores").select("name, is_ufficio").order("name").then(({ data }) => {
            const righe = (data ?? []) as { name: string; is_ufficio?: boolean }[];
            setTuttiNegozi(righe.map(r => r.name).filter(Boolean));
            setUffici(righe.filter(r => r.is_ufficio).map(r => r.name));
        });
    }, []);

    /* L'AMBITO: i negozi visibili PIÙ i loro gemelli. `null` = nessun limite
       (solo per chi vede tutto). Un array VUOTO è un limite legittimo, e la
       query deve rispettarlo tornando zero righe. */
    const ambito = useMemo<string[] | null>(() => {
        if (seesAll) return null;
        const out = new Set(negoziVisibili);
        negoziVisibili.forEach(v => tuttiNegozi.forEach(n => { if (stessoMagazzino(n, v)) out.add(n); }));
        return negozioInValues(Array.from(out));
    }, [seesAll, negoziVisibili, tuttiNegozi]);

    /* ── LA LETTURA ──────────────────────────────────────────────────────────
       Per INTERVALLO DI DATE, non «gli ultimi N»: un negozio che cerca lo
       scontrino di martedì non deve scoprire che l'elenco si ferma a ieri. */
    const carica = useCallback(async () => {
        if (!visibilitaPronta) return;
        setCaricando(true); setErrore("");
        try {
            let q = supabase.from("print_jobs")
                .select("id, negozio, kind, status, result, request_xml, meta, created_at", { count: "exact" })
                .in("kind", ["fiscal_receipt", "non_fiscal", "fiscal_void"])
                .gte("created_at", inizioGiorno(dal))
                .lte("created_at", fineGiorno(al))
                .order("created_at", { ascending: false })
                .limit(TETTO);
            /* SI FALLISCE CHIUSI. Senza l'`if` sulla lunghezza: lista vuota →
               `.in("negozio", [])` → zero righe, che è la risposta giusta per
               chi non ha negozi. Prima, zero negozi significava vedere tutto. */
            if (ambito) q = q.in("negozio", ambito);
            const { data, error, count } = await q;
            if (error) throw error;
            type Riga = { id: string; negozio: string; kind: string; status: string; result: string | null; request_xml: string | null; meta: Record<string, unknown> | null; created_at: string };
            const grezze = (data ?? []) as Riga[];
            setQuantiInTutto(count ?? null);
            /* LE PROVE DI COLLEGAMENTO FUORI SUBITO: «== CHECK COLLATINA W3 ==»
               e' il tasto che verifica se la cassa risponde, non un documento. */
            const lette = grezze.map(r => ({ r, x: leggiXml(r.request_xml) })).filter(o => !o.x.diagnostica);
            setDocs(lette.map(({ r, x }) => {
                const m = (r.meta || {}) as Record<string, unknown>;
                const { righe, pagamenti, totaleDichiarato } = x;
                return {
                    id: r.id,
                    quando: r.created_at,
                    negozio: r.negozio,
                    tipo: "scontrino" as const,
                    fiscale: r.kind !== "non_fiscal",
                    storno: r.kind === "fiscal_void",
                    prova: m.testMode === true,
                    stato: r.status,
                    result: r.result,
                    /* IL TOTALE, in ordine di attendibilita': quello che abbiamo
                       scritto noi nel `meta`, poi quello STAMPATO sul documento,
                       e solo per ultimo la somma delle righe. */
                    totale: m.total != null ? Number(m.total)
                        : totaleDichiarato != null ? totaleDichiarato
                        : (righe.reduce((a, r) => a + r.prezzo * r.quantita, 0) || null),
                    numero: numeroDoc(r.result),
                    matricola: matricolaDoc(r.result),
                    cliente: (m.cliente as string) || null,
                    operatore: (m.operatore as string) || null,
                    contrattoId: (m.contrattoId as string) || null,
                    azienda: (m.azienda as string) || null,
                    righe, pagamenti,
                };
            }));
        } catch (e) {
            setErrore((e as Error)?.message || "non sono riuscito a leggere i documenti");
        } finally { setCaricando(false); }
    }, [dal, al, ambito, visibilitaPronta]);

    useEffect(() => { carica(); }, [carica]);

    /* I NEGOZI CHE SI POSSONO SCEGLIERE sono quelli visibili all'utente, gemelli
       compresi: chi ne ha tre ne sceglie fra tre, l'amministrazione fra tutti. */
    const negozi = useMemo(() => {
        const s = new Set<string>(seesAll ? tuttiNegozi : (ambito || []));
        (docs || []).forEach(d => s.add(d.negozio));
        return Array.from(s).filter(Boolean).sort();
    }, [seesAll, tuttiNegozi, ambito, docs]);

    /* «I MIEI NEGOZI» PER CHI STA IN UFFICIO NON ESISTE. Claudia e Sandra hanno
       `primary_store = "Ufficio"`: preselezionando il loro negozio, il filtro
       scartava OGNI documento e Documenti si apriva vuota — 171 documenti letti,
       0 a schermo. E la task di correzione le portava proprio li'. Un ufficio
       non batte scontrini: per loro non si preseleziona niente, e vedono tutto
       quello che gli e' stato dato. */
    const miei = useMemo(() => {
        const n = user?.negozio as string | undefined;
        if (!n || uffici.some(u => stessoMagazzino(u, n))) return [];
        return negozi.filter(x => stessoMagazzino(x, n));
    }, [negozi, user?.negozio, uffici]);

    /* GIÀ SUL PROPRIO NEGOZIO ALL'INGRESSO, una volta sola: dietro il bancone la
       domanda è «cosa ho battuto io», non «cosa ha battuto il gruppo». Se poi
       uno allarga a tutti, non gli si richiude sotto le mani. */
    const primaVolta = useRef(true);
    useEffect(() => {
        if (!primaVolta.current || !miei.length) return;
        primaVolta.current = false; setScelti(miei);
    }, [miei]);

    const operatori = useMemo(() => Array.from(new Set((docs || []).map(d => d.operatore).filter(Boolean) as string[])).sort(), [docs]);

    /* ── CHI PASSA I FILTRI ───────────────────────────────────────────────── */
    const passa = useCallback((d: Doc) => {
        if (scelti.length && !scelti.some(n => stessoMagazzino(n, d.negozio))) return false;
        if (utenti.length && !utenti.includes(d.operatore || "")) return false;
        const q = cerca.trim().toLowerCase();
        if (q) {
            const qs = q.replace(/[\s./-]/g, "");
            const dentro = (d.numero || "").toLowerCase().includes(q)
                || (d.cliente || "").toLowerCase().includes(q)
                || (d.matricola || "").toLowerCase().includes(q)
                || d.righe.some(r => r.descrizione.toLowerCase().includes(q)
                    || (qs.length >= 6 && r.descrizione.replace(/[\s./-]/g, "").toLowerCase().includes(qs)));
            if (!dentro) return false;
        }
        return true;
    }, [scelti, utenti, cerca]);

    /* I RIQUADRI CONTANO PRIMA DEL PROPRIO FILTRO — la regola di Magazzino: un
       riquadro spento deve dire quanti ce ne sarebbero, se no non lo preme
       nessuno. */
    const base = useMemo(() => (docs || []).filter(passa), [docs, passa]);
    const conta = useMemo(() => {
        const s = base.filter(d => d.tipo === "scontrino");
        const f = base.filter(d => d.tipo === "fattura");
        /* GLI ANNULLI RESTANO FUORI DAL CONTO. Un `fiscal_void` e' solo un
           riferimento al documento annullato (`VOID 0012 0034 …`): non porta
           ne' righe ne' totale, quindi non si sa quanto vale. Moltiplicarlo
           per −1 sottraeva zero e faceva credere che il conto ne tenesse
           conto. Meglio dirlo sotto che fingerlo qui. */
        const somma = (l: Doc[]) => l.filter(d => d.stato === "done" && !d.prova && !d.storno).reduce((a, d) => a + (d.totale || 0), 0);
        return {
            scontrini: s.length, fatture: f.length,
            valScontrini: somma(s), valFatture: somma(f),
            incerti: base.filter(d => d.stato !== "done").length,
            senzaNumero: base.filter(d => d.stato === "done" && !d.numero).length,
            storni: base.filter(d => d.storno && d.stato === "done").length,
        };
    }, [base]);

    const righe = useMemo(() => {
        const l = tipo ? base.filter(d => d.tipo === tipo) : base;
        const chiave = (d: Doc): string | number => {
            switch (sort.col) {
                case 1: return d.negozio || "";
                /* «n. 12» dopo «n. 3», non prima: come testo l'ordine e'
                   quello dell'alfabeto, e su un elenco di scontrini non vuol
                   dire niente. */
                case 2: return d.numero ? Number(d.numero) || d.numero : (d.matricola || "");
                case 3: return d.righe.map(r => r.descrizione).join(" ");
                case 4: return d.operatore || "";
                case 5: return d.totale ?? -1;
                default: return d.quando;
            }
        };
        return [...l].sort((a, b) => {
            const x = chiave(a), y = chiave(b);
            const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "it");
            return sort.desc ? -c : c;
        });
    }, [base, tipo, sort]);

    const esporta = () => {
        const righeCsv = [
            ["Data", "Ora", "Negozio", "Tipo", "Numero", "Matricola", "Totale €", "Cliente", "Operatore", "Esito", "Voci"].join(";"),
            ...righe.map(d => [gg(d.quando), ora(d.quando), d.negozio,
                d.storno ? "Annullo" : d.fiscale ? "Fiscale" : "Non fiscale",
                d.numero || "", d.matricola || "", String(d.totale ?? "").replace(".", ","), d.cliente || "", d.operatore || "",
                esitoDi(d.stato, d.result)?.et || "emesso", d.righe.map(r => r.descrizione).join(" + ")].join(";")),
        ].join("\n");
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob(["﻿" + righeCsv], { type: "text/csv;charset=utf-8" }));
        a.download = `documenti_${dal}_${al}.csv`; a.click();
    };

    /* ── LA RICHIESTA DI CORREZIONE ───────────────────────────────────────────
       Luca: «il punto vendita può fare una richiesta di modifica del pagamento
       — ha esito carta e si è sbagliato — cambiandola per contanti; questa
       modifica arriva in amministrazione».
       Il documento NON si tocca: uno scontrino emesso è emesso. Si apre una
       richiesta, e chi di dovere decide. È successo davvero oggi a Merulana:
       la cassa dava errore, il venditore ha battuto «carta» per far uscire lo
       scontrino, ma il cliente aveva pagato in contanti. */
    const [chiedendo, setChiedendo] = useState<Doc | null>(null);
    const [nuovaForma, setNuovaForma] = useState("Contanti");
    const [perche, setPerche] = useState("");
    const [inviando, setInviando] = useState(false);
    const [fatta, setFatta] = useState("");
    const [fallita, setFallita] = useState("");

    /* ── RIFAI IL DOCUMENTO (Luca 01/09 sera) ────────────────────────────────
       «In Documenti, quando c'è scritto NON USCITO in rosso, un tasto per rifare
       lo scontrino se non è uscito.» Rimette in coda la STESSA richiesta verso lo
       STESSO registratore (nuovo job; l'originale in errore resta come storico).
       ⚠️ Doppia stampa: su «esito ignoto» / «rimasto aperto» la carta può essere
       uscita lo stesso → si CONFERMA guardando prima lo scontrino / la cassa. */
    const [rifacendo, setRifacendo] = useState<Doc | null>(null);
    const [rifaLoad, setRifaLoad] = useState(false);
    const [rifaOk, setRifaOk] = useState("");
    const [rifaKo, setRifaKo] = useState("");

    const rifaiDocumento = async (d: Doc) => {
        if (rifaLoad) return;
        setRifaLoad(true); setRifaOk(""); setRifaKo("");
        try {
            const res = await fetch("/api/vendita/ristampa", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jobId: d.id }),
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok || !j.ok) { setRifaKo(j.error || "non sono riuscito a rimetterlo in coda"); return; }
            setRifaOk("Rimesso in coda: la cassa lo ritira e lo stampa fra pochi secondi. Chiudi SuiteMobile se è un registratore Custom.");
            carica();
        } catch (e) {
            setRifaKo("Errore di rete: " + ((e as Error)?.message || "riprova"));
        } finally { setRifaLoad(false); }
    };

    const inviaRichiesta = async () => {
        if (!chiedendo || inviando) return;
        setInviando(true); setFatta(""); setFallita("");
        try {
            const vecchia = chiedendo.pagamenti.map(p => `${p.descrizione} ${eur(p.importo)}`).join(" + ") || "—";
            const giorno = new Date(chiedendo.quando).toLocaleDateString("sv-SE");
            const { error } = await supabase.from("admin_tasks").insert({
                tipo: "correzione_pagamento",
                titolo: `🧾 ${chiedendo.negozio}: correggere il pagamento di uno scontrino da ${eur(chiedendo.totale)}`,
                /* IL DETTAGLIO PORTA LA CHIAVE CERTA. Il numero non c'è sui
                   Custom, l'ora da sola non basta (a Merulana alle 17:37 ci
                   sono più documenti): l'id del lavoro di stampa è l'unica
                   cosa che identifica un documento senza ambiguità. */
                dettaglio: `${user?.name || "un operatore"} chiede di correggere la forma di pagamento del documento del `
                    + `${gg(chiedendo.quando)} alle ${ora(chiedendo.quando)}`
                    + `${chiedendo.numero ? ` (n. ${chiedendo.numero})` : chiedendo.matricola ? ` (cassa ${chiedendo.matricola})` : ""}.\n`
                    + `Sullo scontrino risulta: ${vecchia}.\nIl cliente ha invece pagato: ${nuovaForma}.\n`
                    + (perche.trim() ? `Motivo: ${perche.trim()}\n` : "")
                    + `Voci: ${chiedendo.righe.map(r => `${r.descrizione} ${eur(r.prezzo)}`).join(" · ")}\n`
                    + `Documento: ${chiedendo.id}`,
                link: `/documenti?doc=${encodeURIComponent(chiedendo.id)}&giorno=${giorno}`,
                target_role: "amministrativo",
                created_by: user?.name || null,
            });
            if (error) throw error;
            setFatta("Richiesta inviata all'amministrazione: la trovano nelle loro cose da fare, col documento allegato.");
            setPerche("");
        } catch (e) {
            setFallita("Non sono riuscito a inviarla: " + ((e as Error)?.message || "riprova"));
        } finally { setInviando(false); }
    };

    const QUADRI = [
        { id: "" as const, icona: "🧾", et: "Tutti", n: conta.scontrini + conta.fatture, val: conta.valScontrini + conta.valFatture, tinta: "rvT-indaco" },
        { id: "scontrino" as const, icona: "🧾", et: "Scontrini", n: conta.scontrini, val: conta.valScontrini, tinta: "rvT-verde" },
        { id: "fattura" as const, icona: "📄", et: "Fatture", n: conta.fatture, val: conta.valFatture, tinta: "rvT-ciano" },
    ];
    const COLONNE = ["Quando", "Punto vendita", "Documento", "Contenuto", "Operatore", "Totale"];

    /* IL DETTAGLIO, che si apre DENTRO la riga: un pannello in fondo alla
       tabella, con trecento righe caricate, compare a migliaia di pixel dalla
       riga che l'ha aperto — cioè fuori schermo. */
    const dettaglio = (d: Doc) => {
        const es = esitoDi(d.stato, d.result);
        return (
            <div className="rvDett">
                {es && (
                    <div className={cn("rvNota", es.tono === "rvBadge-ko" ? "rvNota-ko" : "rvNota-att")}>
                        <div className="rvNota-t">Questo documento è «{es.et}»</div>
                        <div className="rvNota-s">{es.spiega}</div>
                        {d.result && <div className="rvTab-min">La cassa ha risposto: {d.result.slice(0, 300)}</div>}
                        {/* RIFAI IL DOCUMENTO (Luca 01/09): il tasto sta QUI, dentro
                            l'avviso rosso «non uscito», dove lo si legge. Solo sui
                            documenti in errore; con conferma perché un fiscale non si
                            batte per sbaglio, e con l'avviso doppia-stampa dove serve. */}
                        {d.stato === "error" && (
                            rifacendo?.id === d.id ? (
                                <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                                    {es.et !== "non uscito" && (
                                        <div className="rvNota-t">
                                            ⚠️ Attenzione: la carta potrebbe essere <b>già uscita</b>.
                                            {es.et === "rimasto aperto"
                                                ? " Chiudi o annulla il documento DALLA CASSA, poi rifallo — se no lo batti due volte."
                                                : " Guarda lo scontrino PRIMA di rifarlo — se no lo batti due volte."}
                                        </div>
                                    )}
                                    <div className="rvPillRow mt-1">
                                        <button onClick={() => rifaiDocumento(d)} disabled={rifaLoad} className="rvPill rvPill-on">
                                            {rifaLoad ? "rimetto in coda…" : "✅ Sì, rifai lo scontrino"}
                                        </button>
                                        <button onClick={() => { setRifacendo(null); setRifaOk(""); setRifaKo(""); }} className="rvPill rvPill-sm">Annulla</button>
                                    </div>
                                    {rifaOk && <div className="rvNota rvNota-info mt-2"><div className="rvNota-t">✓ Rimesso in coda</div><div className="rvNota-s">{rifaOk}</div></div>}
                                    {rifaKo && <div className="rvNota rvNota-ko mt-2"><div className="rvNota-t">Non rifatto</div><div className="rvNota-s">{rifaKo}</div></div>}
                                </div>
                            ) : (
                                <div className="rvPillRow mt-2">
                                    <button onClick={(e) => { e.stopPropagation(); setRifacendo(d); setRifaOk(""); setRifaKo(""); }} className="rvPill rvPill-sm">
                                        🖨️ Rifai il documento
                                    </button>
                                </div>
                            )
                        )}
                    </div>
                )}
                <div className="rvDettT">
                    Cosa è stato scontrinato
                    {d.matricola ? ` · cassa ${d.matricola}` : ""}
                    {d.cliente ? ` · cliente ${d.cliente}` : ""}
                </div>
                {d.righe.length ? d.righe.map((r, i) => (
                    <div key={i} className="rvDettR">
                        <span>{r.descrizione}</span>
                        {r.quantita > 1 && <span className="rvTab-min">× {r.quantita}</span>}
                        {r.reparto != null && <span className="rvBadge rvBadge-acc">reparto {r.reparto}</span>}
                        <span className="rvDove-fine">{eur(r.prezzo * r.quantita)}</span>
                    </div>
                )) : <div className="rvTab-min">Di questo documento non abbiamo il dettaglio delle righe.</div>}

                <div className="rvDettT mt-2">Come è stato pagato</div>
                {d.pagamenti.length ? d.pagamenti.map((p, i) => (
                    <div key={i} className="rvDettR">
                        <span>{p.descrizione || NOME_PAG[p.tipo] || "—"}</span>
                        <span className="rvTab-min">{NOME_PAG[p.tipo] || `tipo ${p.tipo}`}</span>
                        <span className="rvDove-fine">{eur(p.importo)}</span>
                    </div>
                )) : (
                    <div className="rvTab-min">
                        {d.fiscale ? "Nessuna forma di pagamento registrata." : "I documenti non fiscali non registrano la forma di pagamento."}
                    </div>
                )}

                <div className="rvPillRow mt-2">
                    {d.contrattoId && (
                        <a href={`/ricerca-vendite?id=${encodeURIComponent(d.contrattoId)}`} className="rvPill rvPill-sm">
                            ↗ Apri la vendita
                        </a>
                    )}
                    {/* LA CORREZIONE SI CHIEDE SOLO SU UN DOCUMENTO USCITO: su
                        uno mai emesso, o di prova, non c'è niente da correggere
                        — e la richiesta farebbe perdere tempo a due persone. */}
                    {d.stato === "done" && !d.prova && d.fiscale && !d.storno ? (
                        <button onClick={(e) => { e.stopPropagation(); setChiedendo(chiedendo?.id === d.id ? null : d); setNuovaForma("Contanti"); setFatta(""); setFallita(""); }}
                            className={cn("rvPill rvPill-sm", chiedendo?.id === d.id && "rvPill-on")}>✏️ Chiedi la correzione del pagamento</button>
                    ) : (
                        <span className="rvTab-min">
                            {d.storno ? "Questo è un annullo: non ha una forma di pagamento da correggere."
                                : d.prova ? "Documento di prova: non c'è niente da correggere."
                                : !d.fiscale ? "Documento non fiscale: la forma di pagamento non c'è."
                                    : "Documento non emesso: non c'è niente da correggere."}
                        </span>
                    )}
                </div>

                {/* ═══ LA CORREZIONE SI CHIEDE QUI, SOTTO IL SUO BOTTONE ═══
                    Stava in fondo alla pagina, e il revisore l'ha misurato: con
                    una giornata di un negozio a schermo il bottone era a 1.107px
                    e il modulo a 4.589 — QUATTRO SCHERMATE più sotto. È lo stesso
                    errore che avevo appena corretto per il dettaglio, rifatto
                    venti righe dopo. Il documento non si tocca: si chiede, e lo
                    si chiede guardandolo. */}
                {chiedendo?.id === d.id && (
                    <div className="rvDett mt-2" onClick={(e) => e.stopPropagation()}>
                        <div className="rvDettT">✏️ Correzione della forma di pagamento</div>
                        <div className="rvNota rvNota-info">
                            <div className="rvNota-s">
                                Lo scontrino emesso non si modifica: questa è una <b>richiesta</b> che arriva
                                all&apos;amministrazione, con dentro cosa risulta, cosa dici tu e il documento allegato.
                            </div>
                        </div>
                        <div className="rvBarra mt-2">
                            <div className="rvCampo rvCampo-md"><span className="rvLab">Il cliente ha pagato con</span>
                                <SelectOpzioni className="rvIn" value={nuovaForma} onChange={setNuovaForma}
                                    opzioni={FORME_PAGAMENTO} /></div>
                            <label className="rvCampo rvCampo-lg"><span className="rvLab">Cosa è successo</span>
                                <input value={perche} onChange={e => setPerche(e.target.value)} className="rvIn"
                                    placeholder="es. la cassa dava errore" /></label>
                        </div>
                        <div className="rvPillRow mt-2">
                            <button onClick={inviaRichiesta} disabled={inviando || !FORME_PAGAMENTO.includes(nuovaForma)} className="rvPill rvPill-on">
                                {inviando ? "invio…" : "Invia all'amministrazione"}
                            </button>
                            <button onClick={() => setChiedendo(null)} className="rvPill rvPill-sm">Annulla</button>
                        </div>
                        {/* L'ESITO STA ACCANTO AL BOTTONE che l'ha prodotto. In cima
                            al riquadro era a 4.298px di distanza: chi premeva
                            «Invia» non vedeva né il «fatto» né l'errore. */}
                        {fatta && <div className="rvNota rvNota-info"><div className="rvNota-t">✓ Richiesta inviata</div><div className="rvNota-s">{fatta}</div></div>}
                        {fallita && <div className="rvNota rvNota-ko"><div className="rvNota-t">Richiesta non inviata</div><div className="rvNota-s">{fallita}</div></div>}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="max-w-[1500px]">
            <div className="rvTesta">
                <h1 className="rvTit"><Receipt size={25} /> Documenti</h1>
                <div className="rvPillRow">
                    <button onClick={carica} disabled={caricando} className="rvPill rvPill-sm">
                        <RefreshCw size={13} className="inline-block align-[-2px] mr-1" />{caricando ? "carico…" : "aggiorna"}
                    </button>
                    <button onClick={esporta} disabled={!righe.length} className="rvAzione rvAzione-sm">
                        <FileDown size={14} className="inline-block align-[-2px] mr-1.5" /> Excel
                    </button>
                </div>
            </div>

            <div className="rvBox">
                {/* ═══ I RIQUADRI ═══ premendone uno si vede solo quello. */}
                <div className="rvCampo rvCampo-flex"><span className="rvLab">Cosa è stato emesso</span>
                    <div className="rvRapidoG rvRapidoG-kpi rvRapidoG-pochi">
                        {QUADRI.map(q => {
                            const t = q.n.toLocaleString("it-IT");
                            return (
                                <button key={q.id || "tutti"} type="button" onClick={() => setTipo(x => (x === q.id ? "" : q.id) as typeof tipo)}
                                    className={cn("rvRapido", q.tinta, tipo === q.id && "rvRapido-on", !q.n && tipo !== q.id && "rvRapido-off")}>
                                    <em className={corpoNumero(t)}>{t}</em>
                                    <b>{q.icona} {q.et}</b>
                                    <small>{eurTondo(q.val)} incassati</small>
                                </button>
                            );
                        })}
                    </div>
                    <div className="rvHint">
                        I valori contano solo i documenti riusciti e non di prova.
                        {conta.incerti > 0 ? ` ${conta.incerti} non risultano emessi: restano in elenco perché il tentativo c'è stato — apri la riga per sapere cos'ha risposto la cassa.` : ""}
                    </div>
                </div>

                {/* ═══ I FILTRI ═══ */}
                <div className="rvBarra mt-3">
                    <label className="rvCampo rvCampo-lg"><span className="rvLab">Cerca</span>
                        <input value={cerca} onChange={e => setCerca(e.target.value)} className="rvIn"
                            placeholder="numero, IMEI, articolo o cliente" /></label>
                    <div className="rvCampo rvCampo-md"><span className="rvLab">Punto vendita</span>
                        <SelectMulti className="rvIn" values={scelti} onChange={setScelti} opzioni={negozi}
                            maxVoci={30} tuttiLabel="🌐 Tutti i miei negozi" placeholder="tutti quelli che vedo" /></div>
                    <div className="rvCampo rvCampo-md"><span className="rvLab">Operatore</span>
                        <SelectMulti className="rvIn" values={utenti} onChange={setUtenti} opzioni={operatori}
                            maxVoci={30} tuttiLabel="Tutti" placeholder="chiunque" /></div>
                    <label className="rvCampo"><span className="rvLab">Dal</span>
                        <input type="date" value={dal} max={al} onChange={e => setDal(e.target.value)} className="rvIn" /></label>
                    <label className="rvCampo"><span className="rvLab">Al</span>
                        <input type="date" value={al} min={dal} onChange={e => setAl(e.target.value)} className="rvIn" /></label>
                    <button onClick={() => { setTipo(""); setCerca(""); setUtenti([]); setScelti(miei); setDal(oggi); setAl(oggi); }}
                        className="rvPill rvPill-sm" title="Rimette tutto com'è entrando: i miei negozi, oggi">↺ Reset</button>
                </div>
                <div className="rvHint">L&apos;IMEI puoi spararlo col lettore dentro «Cerca»: lo trova dentro le voci dello scontrino.</div>

                {errore && <div className="rvNota rvNota-ko mt-3"><div className="rvNota-t">Non sono riuscito a leggere i documenti</div><div className="rvNota-s">{errore}</div></div>}

                {/* ═══ LE FATTURE ═══ la spiegazione sta PRIMA della tabella: chi
                    preme «Fatture» e trova vuoto deve leggere subito perché, non
                    scoprirlo in fondo alla pagina dopo aver cambiato le date. */}
                {tipo === "fattura" && !conta.fatture && (
                    <div className="rvNota rvNota-att mt-3">
                        <div className="rvNota-t">Le fatture non sono ancora emesse dal CRM</div>
                        <div className="rvNota-s">
                            Il posto è questo e il filtro le aspetta: manca la parte che le crea —
                            numerazione, dati fiscali del cliente e invio allo SdI. Non dipende dalle
                            date: allargarle non farà comparire niente.
                        </div>
                    </div>
                )}

                {/* ═══ L'ELENCO ═══ */}
                {docs === null ? (
                    <div className="rvCarico"><Loader2 className="w-6 h-6 animate-spin" /> Carico i documenti…</div>
                ) : (
                    <div className="rvTabBox mt-3">
                        <table className="rvTab rvTab-large">
                            <thead>
                                <tr>
                                    {COLONNE.map((c, i) => (
                                        <th key={i} className={cn("rvTab-ord", i === 5 && "rvTab-eur")}
                                            onClick={() => setSort(s => ({ col: i, desc: s.col === i ? !s.desc : i === 0 || i === 5 }))}>
                                            {c}{sort.col === i ? <i>{sort.desc ? "↓" : "↑"}</i> : null}
                                        </th>))}
                                </tr>
                            </thead>
                            <tbody>
                                {!righe.length && (
                                    <tr><td colSpan={6} className="rvTab-vuoto">
                                        {tipo === "fattura"
                                            ? "Le fatture non sono ancora emesse dal CRM: qui non comparirà niente finché non ci sarà la parte che le crea."
                                            : "Nessun documento con questi filtri. Prova ad allargare le date: l'elenco parte da oggi."}
                                    </td></tr>
                                )}
                                {righe.map(d => {
                                    const apertaQui = aperto === d.id;
                                    const es = esitoDi(d.stato, d.result);
                                    return (
                                        <Fragment key={d.id}>
                                            <tr onClick={() => setAperto(apertaQui ? null : d.id)}
                                                className={cn("rvTab-riga rvTab-cl", apertaQui && "rvTab-on")}>
                                                <td className="rvTab-min">
                                                    <span className="rvTab-ap">{apertaQui ? "▾" : "▸"}</span>
                                                    {gg(d.quando)} <b>{ora(d.quando)}</b>
                                                </td>
                                                <td className="rvTab-min">{d.negozio}{d.azienda ? <><br /><span className="rvBadge rvBadge-acc">{d.azienda}</span></> : null}</td>
                                                <td className="rvTab-min">
                                                    {d.numero ? <b>n. {d.numero}</b>
                                                        : d.matricola ? <span>cassa {d.matricola}</span>
                                                            : <span>senza numero</span>}
                                                    <br />
                                                    {/* LA PASTIGLIA VERDE SOLO SU UN DOCUMENTO DAVVERO
                                                        EMESSO: «fiscale» accanto a «rimasto aperto» sono
                                                        due affermazioni che si contraddicono nella stessa
                                                        cella (revisione design). */}
                                                    {d.storno ? <span className="rvBadge rvBadge-ko">annullo</span>
                                                        : d.prova ? <span className="rvBadge rvBadge-warn">di prova</span>
                                                            : !d.fiscale ? <span className="rvBadge rvBadge-empty">non fiscale</span>
                                                                : d.stato === "done" ? <span className="rvBadge rvBadge-ok">fiscale</span>
                                                                    : <span className="rvBadge rvBadge-empty">fiscale</span>}
                                                    {es && <span className={cn("rvBadge ml-1", es.tono)}>{es.et}</span>}
                                                </td>
                                                <td className="rvTab-nome">
                                                    {d.righe.length
                                                        ? d.righe.map(r => r.descrizione).join(" · ")
                                                        : <span className="rvTab-min">dettaglio non disponibile</span>}
                                                    {d.cliente && <><br /><span className="rvTab-min">cliente: {d.cliente}</span></>}
                                                </td>
                                                <td className="rvTab-min">{d.operatore || "—"}</td>
                                                <td className="rvTab-eur">{eur(d.totale)}</td>
                                            </tr>
                                            {apertaQui && (
                                                <tr className="rvTab-det"><td colSpan={6}>{dettaglio(d)}</td></tr>
                                            )}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                        {/* IL PIÈ DI PAGINA DICE QUANTI E, SE MANCA QUALCOSA, CHE MANCA.
                            Un elenco troncato in silenzio è un elenco che mente. */}
                        <div className="rvTab-pie">
                            {righe.length.toLocaleString("it-IT")} document{righe.length === 1 ? "o" : "i"}
{quantiInTutto != null && quantiInTutto > (docs?.length || 0)
                                ? ` — ma nel periodo scelto ce ne sono ${quantiInTutto.toLocaleString("it-IT")}: il database ne consegna al massimo ${TETTO.toLocaleString("it-IT")} per volta, e i più vecchi restano fuori da questo elenco e dai riquadri. Stringi l'intervallo di date.`
                                : ""}
                            {conta.senzaNumero > 0 ? ` · ${conta.senzaNumero} senza numero: i registratori Custom non lo riportano al CRM, e quei documenti si cercano per matricola.` : ""}
                            {conta.storni > 0 ? ` · ${conta.storni} annull${conta.storni === 1 ? "o" : "i"}: restano fuori dagli incassi, perché il documento di annullo non porta con sé l'importo.` : ""}
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}

/* IL CONFINE DI ATTESA lo chiede Next per `useSearchParams`: senza, la pagina
   non si costruisce. */
export default function DocumentiPage() {
    return <Suspense fallback={<div className="rvCarico">Carico i documenti…</div>}><Documenti /></Suspense>;
}
