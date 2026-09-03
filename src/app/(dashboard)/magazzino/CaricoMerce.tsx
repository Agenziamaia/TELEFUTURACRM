"use client";

/* ═══ CARICO MERCE ═══════════════════════════════════════════════════════════
 *
 * Luca, 03/09: «dobbiamo lavorare sulla funzione per caricare la merce.
 * Attualmente è posizionata un po' per errore dentro i trasferimenti, invece
 * deve stare dentro Giacenze con un pulsante in alto. Nel processo chiediamo
 * l'articolo e poi le quantità; QUALORA l'articolo preveda un campo IMEI, a
 * quel punto va richiesto anche l'IMEI. Il carico lo possono fare solo
 * dall'amministrazione in su, e bisogna selezionare il negozio in cui si sta
 * caricando. Questa merce parte sempre dall'ufficio, per cui se non la stanno
 * caricando in ufficio bisogna sempre generare un DDT. Mi immagino un processo
 * a step, un po' come Registra Vendita.»
 *
 * E poi, sulle tre domande che gli ho fatto:
 *  · la SOCIETÀ si specifica sempre al carico — «magari trova un modo di
 *    attribuire gli articoli a una società, anche selezionando più articoli
 *    insieme»;
 *  · la merce caricata su un altro negozio **non passa dal magazzino
 *    dell'ufficio**: è un carico, non un prelievo. Con il flag «carico
 *    diretto» entra subito a scaffale; con «il negozio deve accettare» resta
 *    in transito come un trasferimento che arriva dall'ufficio. In ogni caso
 *    nasce un DDT;
 *  · l'IMEI lo dichiara l'ARTICOLO (`mag_articoli.ha_imei`), e un articolo che
 *    non esiste si crea qui dentro senza uscire dal flusso.
 *
 * UN DOCUMENTO, UNA SOCIETÀ. Se il carico contiene merce di tutte e due le
 * società escono DUE documenti, uno per partita IVA: è la stessa regola che
 * vale per i trasferimenti e per gli scontrini, e non è una complicazione
 * nostra — è che un documento di trasporto ha un solo mittente fiscale.
 *
 * ── QUI NON SI SCRIVE A MAGAZZINO ──────────────────────────────────────────
 * Questa schermata RACCOGLIE e basta: alla fine chiama `mag_carico_merce`, che
 * fa tutto in una transazione sola. La prima versione scriveva da qui, in
 * quattro o cinque colpi, e la revisione ostile ha misurato dove finiva:
 *  · un documento nato e le sue righe fallite = un protocollo bruciato e un
 *    documento che nessun bottone può più chiudere;
 *  · la prima società passata e la seconda no = un riprova che raddoppiava le
 *    quantità della prima.
 * E soprattutto: le righe con i seriali si scrivevano tutte insieme, con gli
 * IMEI separati da virgola. Per il resto del gestionale un seriale vuol dire
 * UN pezzo (`pezziDi()`), quindi cinque telefoni contavano uno e
 * all'accettazione sparivano. Adesso una riga di documento è UN pezzo, e il
 * pezzo nasce insieme al documento.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabaseClient";
import { SelectOpzioni } from "@/components/SelectPersona";
import { PackagePlus, Trash2, Plus, X } from "lucide-react";

const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
const eur = (n: number | null | undefined) => n == null ? "—"
    : Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

/** L'ufficio è il punto di partenza della merce: caricare LÌ non muove niente. */
const UFFICIO = "Ufficio";

/** Come si chiama il numero che sta addosso al pezzo. Il vecchio carico lo
 *  faceva scegliere e aveva ragione: un ICCID marcato «imei» è una bugia che
 *  poi va a finire sulla scheda del pezzo e nella sua storia. */
const TIPI_SERIALE = [
    { v: "imei", et: "IMEI", nota: "telefoni" },
    { v: "iccid", et: "ICCID", nota: "SIM" },
    { v: "seriale", et: "Seriale", nota: "tutto il resto" },
];

/* IL PREZZO SERVE, e non è una pignoleria: la rotta che già crea articoli lo
   pretende da sempre (Luca 29/08: «senza, in cassa quell'articolo non si può
   vendere»). Due porte per la stessa cosa devono chiedere le stesse cose. */
const prezzoValido = (v: string) => {
    const n = Number(String(v || "").replace(",", "."));
    return v.trim() !== "" && Number.isFinite(n) && n >= 0 && n <= 100000;
};
/* IL REPARTO È UNA TENDINA VERA, la stessa della scheda articolo che già
   esiste in Articoli: un `<select>` tiene il NUMERO come valore e mostra il
   nome con l'aliquota accanto. Prima tenevo il numero in una casella di testo
   e me lo ritagliavo dall'etichetta: funzionava, ma era un passaggio in più
   che poteva rompersi — e tre descrizioni un «·» ce l'hanno già dentro. */
const numeroReparto = (v: string) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 1 && n <= 40 ? n : 0;
};

type ArticoloTrovato = {
    codice: string; descrizione: string; barcode: string | null;
    ha_imei: boolean; prezzo: number | null; costo_ultimo: number | null;
    gruppo: string | null; marca: string | null; reparto: number | null;
};

type Riga = {
    chiave: string;
    codice: string;
    descrizione: string;
    /** come si conta QUESTA riga. Parte da `mag_articoli.ha_imei`, ma si può
     *  cambiare: l'anagrafica non sa tutto (v. `unoPerUno` più sotto). */
    unoPerUno: boolean;
    tipoSeriale: string;
    quantita: number;
    seriali: string[];
    costo: number | null;
    azienda: string;
};

/* `utente` non si legge più da qui, ed è voluto: chi ha caricato la merce lo
   scrive il database, prendendolo dalla sessione firmata. Il nome che arriva
   dal browser è un nome che il browser può cambiare. */
export default function CaricoMerce({ aperto, negozi, aziende, nomiAzienda, dopo, chiudi }: {
    aperto: boolean; negozi: string[]; aziende: string[]; nomiAzienda: Record<string, string>;
    utente: string; dopo: () => void; chiudi: () => void;
}) {
    const [passo, setPasso] = useState<1 | 2 | 3 | 4>(1);
    const [negozio, setNegozio] = useState("");
    const [righe, setRighe] = useState<Riga[]>([]);
    const [conAccettazione, setConAccettazione] = useState(true);
    const [busy, setBusy] = useState(false);
    const [esito, setEsito] = useState<{ ok: boolean; testo: string } | null>(null);

    /* IN UFFICIO NON NASCE NESSUN DOCUMENTO: la merce è già lì, non si sta
       trasportando niente. È la regola che Luca ha dato in una riga sola. */
    const inUfficio = negozio === UFFICIO;

    /* ═══ LE SOCIETÀ CHE HANNO UNA CASSA IN QUEL NEGOZIO ════════════════════
       Non tutte le società stanno in tutti i negozi: a Garbatella e Promontori
       c'è solo Telefutura 2. Caricare lì merce dell'altra società vuol dire
       che il giorno che la si vende la riga ESCE dallo scontrino in silenzio —
       il server la scarta con «non ha un registratore in questo negozio».
       Meglio non fargliela nemmeno scegliere.
       In UFFICIO invece non si vende: lì entra la merce di tutte e due. */
    const [casse, setCasse] = useState<string[] | null>(null);
    const [casseKo, setCasseKo] = useState("");
    const [casseInCorso, setCasseInCorso] = useState(false);
    useEffect(() => {
        if (!negozio || inUfficio) { setCasse(null); setCasseKo(""); return; }
        let vivo = true;
        setCasseInCorso(true); setCasse(null); setCasseKo("");
        (async () => {
            const { data, error } = await supabase.from("pos_rt").select("azienda").eq("negozio", negozio);
            if (!vivo) return;
            setCasseInCorso(false);
            /* SE NON SI SA, NON SI TIRA A INDOVINARE. Prima l'errore veniva
               buttato via e la lista restava vuota: l'operatore si vedeva
               offrire tutte e due le società ovunque, assegnava, faceva
               quattro passi, e alla fine il database gli diceva di no. */
            if (error) { setCasseKo(error.message); return; }
            setCasse(Array.from(new Set((data ?? []).map((r: { azienda: string }) => r.azienda).filter(Boolean))));
        })();
        return () => { vivo = false; };
    }, [negozio, inUfficio]);

    /* IL RIPIEGO CONTA: a magazzino vuoto `aziende` è vuoto, e senza ripiego
       al passo 3 non ci sarebbe nessun bottone da premere — proprio nel caso
       che il messaggio delle Giacenze pubblicizza («il primo carico si fa
       qui»). */
    const aziendeDelNegozio = useMemo(() => {
        const tutte = Array.from(new Set([...aziende.filter(Boolean), "T1", "T2"]));
        return casse?.length ? tutte.filter(a => casse.includes(a)) : tutte;
    }, [aziende, casse]);
    const aziendaDiDefault = aziendeDelNegozio.length === 1 ? aziendeDelNegozio[0] : "";

    /* CAMBIARE NEGOZIO PUÒ TOGLIERE DI MEZZO UNA SOCIETÀ: le righe che la
       portavano restano senza, e il passo 3 lo dice.
       E QUANDO LE CASSE ARRIVANO, se ce n'è una sola, la si mette anche alle
       righe aggiunte PRIMA: l'elenco delle casse si legge dal server, e nei
       primi istanti le società sono ancora due — chi aggiungeva in fretta si
       ritrovava metà carico con la società e metà senza. */
    useEffect(() => {
        setRighe(r => r.map(x => {
            if (x.azienda && !aziendeDelNegozio.includes(x.azienda)) return { ...x, azienda: "" };
            if (!x.azienda && aziendeDelNegozio.length === 1) return { ...x, azienda: aziendeDelNegozio[0] };
            return x;
        }));
    }, [aziendeDelNegozio]);

    /* ═══ PASSO 2 — LA RICERCA DEGLI ARTICOLI ═══════════════════════════════
       Non si può tenere in pagina un catalogo da 17.000 voci: si cerca sul
       server, come fa il pannello prodotti di Registra Vendita. */
    const [cerca, setCerca] = useState("");
    const [trovati, setTrovati] = useState<ArticoloTrovato[]>([]);
    const [cercando, setCercando] = useState(false);
    const [nessuno, setNessuno] = useState(false);

    useEffect(() => {
        const q = cerca.trim();
        if (q.length < 2) { setTrovati([]); setNessuno(false); return; }
        let vivo = true;
        setCercando(true);
        const t = setTimeout(async () => {
            /* le virgole e le parentesi spezzerebbero il filtro `or`: dentro
               una ricerca scritta a mano ci finisce di tutto */
            const s = q.replace(/[,()\\]/g, " ").trim();
            const { data, error } = await supabase.from("mag_articoli")
                .select("codice,descrizione,barcode,ha_imei,prezzo,costo_ultimo,gruppo,marca,reparto")
                .or(`descrizione.ilike.%${s}%,codice.ilike.%${s}%,barcode.ilike.%${s}%`)
                /* L'USATO NON SI CARICA A MAGAZZINO (Luca 03/09: «fanno
                   confusione, l'usato vive in un'altra sezione»). Erano 3.237
                   articoli su 17.083 — uno su cinque — che non si possono
                   caricare per definizione e che riempivano la ricerca.
                   `usato` è una colonna calcolata dal database dai tre indizi
                   che finora stavano scritti in tre posti diversi: gruppo
                   USATO, codice RITUSATO*, reparto 7 / ART.36. */
                .eq("usato", false)
                .eq("attivo", true).limit(40);
            if (!vivo) return;
            const lista = (data ?? []) as ArticoloTrovato[];
            /* SE LA RICERCA FALLISCE NON SI DICE «non esiste»: proporre di
               creare un articolo che magari c'è già è il modo più veloce per
               ritrovarsi due codici per lo stesso prodotto. */
            setTrovati(lista); setNessuno(!error && !lista.length); setCercando(false);
        }, 250);
        return () => { vivo = false; clearTimeout(t); };
    }, [cerca]);

    const aggiungi = (a: ArticoloTrovato) => {
        setRighe(r => [...r, {
            chiave: `${a.codice}|${Date.now()}|${Math.random().toString(36).slice(2, 7)}`,
            codice: a.codice, descrizione: a.descrizione,
            unoPerUno: !!a.ha_imei, tipoSeriale: "imei",
            quantita: a.ha_imei ? 0 : 1, seriali: [],
            costo: a.costo_ultimo, azienda: aziendaDiDefault,
        }]);
        setCerca(""); setTrovati([]);
    };

    const togli = (k: string) => setRighe(r => r.filter(x => x.chiave !== k));
    const cambia = (k: string, patch: Partial<Riga>) => setRighe(r => r.map(x => x.chiave === k ? { ...x, ...patch } : x));

    /* ═══ CREARE UN ARTICOLO SENZA USCIRE DAL FLUSSO ════════════════════════
       Luca: «se un articolo non esiste e non lo trova nella lista, gli chiede:
       lo vuoi creare? E procede alla creazione come se il flusso partisse da
       lì». Un carico che si interrompe per andare in un'altra schermata è un
       carico che non si fa.

       IL REPARTO IVA È OBBLIGATORIO, e non è una formalità: un articolo senza
       reparto, il giorno che lo si vende, ESCE dallo scontrino — il server lo
       scarta con «reparto IVA non assegnato». Merce venduta, riga assente. */
    type Reparto = { reparto: number; descrizione: string; aliquota: string | null; natura: string | null };
    const [reparti, setReparti] = useState<Reparto[]>([]);
    useEffect(() => {
        supabase.from("pos_reparti").select("reparto,descrizione,aliquota,natura").eq("attivo", true).order("reparto")
            /* IL 7 È L'USATO, e l'usato non entra a magazzino: offrirlo qui
               vorrebbe dire far creare da questa porta proprio la cosa che
               questa porta non deve far entrare. */
            .then(({ data }) => setReparti(((data ?? []) as Reparto[]).filter(r => r.reparto !== 7)));
    }, []);

    const [nuovo, setNuovo] = useState<{ codice: string; barcode: string; descrizione: string; marca: string; haImei: boolean; costo: string; prezzo: string; reparto: string } | null>(null);
    const creaArticolo = async () => {
        if (!nuovo || !nuovo.codice.trim() || !nuovo.descrizione.trim() || !numeroReparto(nuovo.reparto) || !prezzoValido(nuovo.prezzo)) return;
        setBusy(true); setEsito(null);
        const num = (s: string) => s.trim() ? Number(s.replace(",", ".")) : null;
        /* PASSA DAL DATABASE, non dal browser: su `mag_articoli` chi è loggato
           ha il permesso di LEGGERE e basta — l'insert dal browser falliva
           sempre, per chiunque, admin compreso. E il ruolo si controlla di là,
           dove non si può mentire su chi si è. */
        const { data, error } = await supabase.rpc("mag_crea_articolo", {
            p_codice: nuovo.codice.trim(),
            p_descrizione: nuovo.descrizione.trim(),
            p_reparto: numeroReparto(nuovo.reparto),
            p_ha_imei: nuovo.haImei,
            p_costo: num(nuovo.costo),
            p_prezzo: num(nuovo.prezzo),
            p_barcode: nuovo.barcode.trim() || null,
            p_marca: nuovo.marca.trim() || null,
        });
        setBusy(false);
        if (error) { setEsito({ ok: false, testo: "Articolo non creato: " + error.message }); return; }
        const a = data as { codice: string; descrizione: string; ha_imei: boolean; costo_ultimo: number | null; barcode: string | null };
        aggiungi({ ...a, gruppo: null, marca: nuovo.marca.trim() || null, reparto: numeroReparto(nuovo.reparto), prezzo: num(nuovo.prezzo) } as ArticoloTrovato);
        setNuovo(null); setCerca("");
    };

    /* ═══ PASSO 3 — DI CHI È LA MERCE ═══════════════════════════════════════
       «Magari trova un modo di attribuire gli articoli a una società, anche
       selezionando più articoli insieme». Si spuntano le righe e si preme la
       società: due gesti invece di una tendina per riga. */
    const [spuntate, setSpuntate] = useState<Set<string>>(new Set());
    const spunta = (k: string) => setSpuntate(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
    const assegna = (az: string) => {
        setRighe(r => r.map(x => spuntate.has(x.chiave) || !spuntate.size ? { ...x, azienda: az } : x));
        setSpuntate(new Set());
    };

    /* ═══ QUANTI PEZZI, E QUANTO VALGONO ════════════════════════════════════ */
    const pezziDi = (r: Riga) => r.unoPerUno ? r.seriali.length : (Number(r.quantita) || 0);
    const totPezzi = righe.reduce((a, r) => a + pezziDi(r), 0);
    const totValore = righe.reduce((a, r) => a + pezziDi(r) * (Number(r.costo) || 0), 0);
    const perSocieta = useMemo(() => {
        const m: Record<string, Riga[]> = {};
        righe.forEach(r => { (m[r.azienda || "?"] ||= []).push(r); });
        return m;
    }, [righe]);

    /* ═══ COSA MANCA, DETTO PRIMA ═══════════════════════════════════════════ */
    const manca = useMemo(() => {
        const out: string[] = [];
        if (!negozio) out.push("scegli dove sta entrando la merce");
        if (!righe.length) out.push("aggiungi almeno un articolo");
        righe.forEach(r => {
            if (r.unoPerUno && !r.seriali.length) out.push(`«${r.descrizione}» si conta uno per uno: non hai inserito nessun numero`);
            if (!r.unoPerUno && pezziDi(r) <= 0) out.push(`«${r.descrizione}»: quanti pezzi?`);
            if (!r.azienda) out.push(`«${r.descrizione}»: di quale società è?`);
        });
        /* GLI STESSI SERIALI DUE VOLTE non sono due pezzi: sono un errore di
           battitura o un lettore che ha sparato due volte. */
        const tutti = righe.flatMap(r => r.seriali);
        const doppi = tutti.filter((s, i) => tutti.indexOf(s) !== i);
        if (doppi.length) out.push(`seriale ripetuto: ${Array.from(new Set(doppi)).slice(0, 3).join(", ")}`);
        return out;
    }, [negozio, righe]);

    /* ═══ LA CONFERMA — una chiamata sola ═══════════════════════════════════ */
    const conferma = useCallback(async () => {
        if (manca.length || busy) return;
        setBusy(true); setEsito(null);
        const { data, error } = await supabase.rpc("mag_carico_merce", {
            p_negozio: negozio,
            p_con_accettazione: !inUfficio && conAccettazione,
            p_righe: righe.map(r => ({
                codice: r.codice, descrizione: r.descrizione, azienda: r.azienda,
                costo: r.costo, tipo_seriale: r.tipoSeriale,
                /* si DICE come va contata, non lo si fa dedurre dalla forma
                   dei dati: una riga «uno per uno» rimasta senza numeri deve
                   dare un errore che lo spiega, non sparire in silenzio */
                uno_per_uno: r.unoPerUno,
                ...(r.unoPerUno ? { seriali: r.seriali } : { quantita: pezziDi(r) }),
            })),
        });
        setBusy(false);
        if (error) { setEsito({ ok: false, testo: error.message }); return; }

        const r = data as { pezzi: number; documenti: { numero: number; azienda: string }[] };
        const docs = (r.documenti || []).map(d => `n.${d.numero} (${nomiAzienda[d.azienda] || d.azienda})`).join(" e ");

        /* L'ANAGRAFICA IMPARA — ma lo fa il DATABASE, dentro la stessa
           transazione del carico. Qui c'era un UPDATE su `mag_articoli`
           scritto dal browser: la stessa tabella che, due passi più su,
           dichiaro non scrivibile dal browser. Falliva sempre e in silenzio
           (supabase-js non lancia, restituisce un errore che nessuno
           guardava), quindi chi correggeva «uno per uno» su un articolo lo
           ricorreggeva ogni volta, per sempre. */

        setEsito({
            ok: true,
            testo: inUfficio
                ? `Caricati ${r.pezzi} pezzi in ufficio.`
                : conAccettazione
                    ? `${r.pezzi} pezzi in viaggio verso ${negozio}. Document${docs.includes(" e ") ? "i" : "o"} ${docs}: il negozio li trova in Trasferimenti e deve accettarli.`
                    : `Caricati ${r.pezzi} pezzi a ${negozio}, già a scaffale. Document${docs.includes(" e ") ? "i" : "o"} ${docs}.`,
        });
        setRighe([]); setSpuntate(new Set()); setPasso(1); dopo();
    }, [manca, busy, righe, negozio, inUfficio, conAccettazione, nomiAzienda, dopo]);

    /* ═══ IL DISEGNO ════════════════════════════════════════════════════════
       Luca 03/09: «deve aprirmi una sezione a parte in sovrapposizione, che è
       stile registra vendita con la timeline sopra e gli step che ci siamo
       detti prima». Quindi: un portale a tutto schermo, e la stessa timeline
       ad anelli di Registra Vendita — non una fila di pastiglie che assomiglia
       vagamente a dei passi, ma proprio quella, con le stesse classi.

       LA PERCENTUALE NON SI REGALA. L'anello di un passo si chiude solo quando
       quel passo è finito davvero: le righe hanno i loro pezzi, ogni riga ha
       la sua società. È la regola di Registra Vendita («niente 100%
       regalati») e serve a far vedere DOVE manca qualcosa senza doverci
       tornare sopra. */
    const rigaCompleta = (r: Riga) => pezziDi(r) > 0;
    const PASSI = [
        {
            n: 1 as const, et: "Dove entra", ico: "🏪", abil: true,
            perc: negozio && (inUfficio || (!!casse?.length && !casseKo)) ? 100 : 0,
        },
        {
            n: 2 as const, et: "Cosa entra", ico: "📦", abil: !!negozio,
            perc: !righe.length ? 0 : righe.every(rigaCompleta) ? 100 : 50,
        },
        {
            n: 3 as const, et: "Di chi è", ico: "🏢", abil: !!negozio && righe.length > 0,
            perc: !righe.length ? 0 : righe.every(r => !!r.azienda) ? 100
                : righe.some(r => !!r.azienda) ? 50 : 0,
        },
        {
            n: 4 as const, et: "Come arriva", ico: "🚚", abil: !!negozio && righe.length > 0,
            perc: !righe.length ? 0 : manca.length ? 50 : 100,
        },
    ];
    const railPct = Math.min(100, (PASSI.filter(p => p.perc >= 100).length / (PASSI.length - 1)) * 100);

    /* Il lavoro non si perde chiudendo: il pannello resta montato e sparisce
       il portale, quindi riaprendolo si ritrova il carrello com'era. È il
       motivo per cui qui non c'è nessun «sei sicuro?» — Luca l'ha già detto
       per la finestra del pagamento: chiudere deve solo chiudere. */
    useEffect(() => {
        if (!aperto) return;
        const esc = (e: KeyboardEvent) => { if (e.key === "Escape") chiudi(); };
        window.addEventListener("keydown", esc);

        /* LA PAGINA SOTTO STA FERMA (Luca 03/09: «quando ho questa finestra
           aperta, se scrollo con il mouse mi scorre anche la pagina sotto»).
           Con la rotella sopra la finestra si scorre la finestra; appena il
           puntatore ne esce — o quando dentro non c'è più niente da scorrere —
           il browser passa la rotella a quello che c'è dietro, e la tabella
           delle giacenze scivolava via sotto la sovrapposizione.
           Si rimette il valore di PRIMA, non «auto»: se un giorno un'altra
           finestra avrà già bloccato la pagina, riaprirla non deve sbloccarla. */
        const prima = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            window.removeEventListener("keydown", esc);
            document.body.style.overflow = prima;
        };
    }, [aperto, chiudi]);

    if (!aperto) return null;

    return createPortal(
        <div className="fixed inset-0 z-[120] overflow-y-auto flex items-start justify-center p-4 bg-black/65 backdrop-blur-sm">
        <div className="rvBox rvBox-sopra w-full max-w-5xl my-4">
            <div className="rvTesta">
                <h2 className="rvTit"><PackagePlus size={22} /> Carico merce</h2>
                <button onClick={chiudi} className="rvPill rvPill-sm" title="Chiudi (Esc) — quello che hai messo nel carico resta">
                    <X size={14} className="inline-block align-[-2px] mr-1" /> Chiudi
                </button>
            </div>

            {/* LA TIMELINE, quella vera di Registra Vendita */}
            <div className="rvsteps">
                <div className="rvsteps-rail"><i style={{ width: railPct + "%" }} /></div>
                {PASSI.map(p => {
                    const attivo = passo === p.n;
                    const fatto = p.perc >= 100;
                    const sub = fatto ? "Completo" : attivo ? "Sei qui"
                        : p.perc > 0 ? p.perc + "%" : p.abil ? "Da fare" : "Bloccato";
                    return (
                        <button key={p.n} type="button" disabled={!p.abil}
                            onClick={() => { if (p.abil) setPasso(p.n); }}
                            title={!p.abil ? "Finisci prima i passi che vengono prima" : attivo ? "Sei qui" : "Vai a " + p.et}
                            className={cn("rvnode-step", attivo && "is-active", fatto && "is-done", !p.abil && "is-locked")}>
                            <span className="rvnode-ring" style={{ background: `conic-gradient(${fatto ? "#22c55e" : "#6d5cff"} ${p.perc}%, var(--rv-track) 0)` }}>
                                <span className="rvnode"><span>{p.ico}</span></span>
                                {fatto && <span className="rvnode-check">✓</span>}
                            </span>
                            <span className="rvnode-lab">{p.et}</span>
                            <span className="rvnode-sub">{sub}</span>
                        </button>
                    );
                })}
            </div>

            {esito && (
                <div className={cn("rvNota mt-3", esito.ok ? "rvNota-info" : "rvNota-ko")}>
                    <div className="rvNota-t">{esito.ok ? "✓ Carico registrato" : "Carico non riuscito"}</div>
                    <div className="rvNota-s">{esito.testo}</div>
                </div>
            )}

            {/* ── 1. DOVE ─────────────────────────────────────────────────── */}
            {passo === 1 && (
                <div className="mt-3">
                    <div className="rvBarra">
                        <div className="rvCampo rvCampo-md"><span className="rvLab">In quale negozio entra la merce</span>
                            <SelectOpzioni className="rvIn" value={negozio} onChange={setNegozio}
                                opzioni={negozi} placeholder="scegli…" /></div>
                    </div>
                    <div className="rvNota rvNota-info mt-3">
                        <div className="rvNota-s">
                            La merce parte sempre dall&apos;ufficio. Se la stai caricando in un negozio,
                            nasce un <b>documento di trasporto</b> — uno per società — che il negozio ritrova in Trasferimenti.
                            {negozio && inUfficio && <> Qui invece stai caricando <b>in ufficio</b>: nessun documento, la merce è già dov&apos;è.</>}
                            {negozio && !inUfficio && casse?.length === 1 && <> A {negozio} c&apos;è solo la cassa di <b>{nomiAzienda[casse[0]] || casse[0]}</b>: la merce entra tutta lì.</>}
                            {negozio && !inUfficio && casseInCorso && <> Sto guardando quali società hanno una cassa qui…</>}
                        </div>
                    </div>
                    {/* SE NON SI SA CHI HA UNA CASSA QUI, NON SI TIRA AVANTI. Offrire
                        tutte e due le società «per non bloccare» vuol dire far fare
                        quattro passi all'operatore e poi rifiutargli il carico. */}
                    {casseKo && (
                        <div className="rvNota rvNota-ko mt-3">
                            <div className="rvNota-t">Non riesco a sapere quali società hanno una cassa a {negozio}</div>
                            <div className="rvNota-s">{casseKo} — riprova fra un momento: senza questo, la merce rischia di finire sulla società sbagliata.</div>
                        </div>
                    )}
                    {negozio && !inUfficio && casse && !casse.length && (
                        <div className="rvNota rvNota-ko mt-3">
                            <div className="rvNota-t">A {negozio} non c&apos;è nessun registratore</div>
                            <div className="rvNota-s">Qui la merce non si può vendere, quindi non ha senso caricarla. Se il negozio è nuovo, la cassa si aggiunge in Amministrazione → Negozi.</div>
                        </div>
                    )}
                    <div className="rvBarra rvBarra-c mt-3 justify-end">
                        <button onClick={() => setPasso(2)}
                            disabled={!negozio || (!inUfficio && (casseInCorso || !!casseKo || !casse?.length))}
                            className="rvAzione">Avanti →</button>
                    </div>
                </div>
            )}

            {/* ── 2. COSA ─────────────────────────────────────────────────── */}
            {passo === 2 && (
                <div className="mt-3">
                    <label className="rvCampo rvCampo-flex"><span className="rvLab">Cerca l&apos;articolo <span className="rvLabX">(nome, codice o codice a barre — spara pure col lettore)</span></span>
                        <input value={cerca} onChange={e => setCerca(e.target.value)} className="rvIn"
                            placeholder="almeno due lettere…" autoFocus /></label>

                    {cercando && <div className="rvTab-min mt-2">cerco…</div>}

                    {!!trovati.length && (
                        <div className="rvDett mt-2">
                            {trovati.map(a => (
                                <div key={a.codice} className="rvDettR">
                                    <span className="rvTab-nome">{a.descrizione}</span>
                                    <span className="rvTab-cod">{a.codice}</span>
                                    {a.ha_imei && <span className="rvBadge rvBadge-acc">IMEI</span>}
                                    {a.marca && <span className="rvTab-min">{a.marca}</span>}
                                    <span className="rvSpazio" />
                                    <span className="rvTab-min">{eur(a.costo_ultimo)}</span>
                                    <button onClick={() => aggiungi(a)} className="rvPill rvPill-sm">
                                        <Plus size={13} className="inline-block align-[-2px]" /> aggiungi</button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* NON C'È? SI CREA QUI. */}
                    {nessuno && !nuovo && (
                        <div className="rvNota rvNota-att mt-2">
                            <div className="rvNota-t">Nessun articolo con «{cerca}»</div>
                            <div className="rvNota-s">Se non esiste ancora, puoi crearlo adesso senza uscire dal carico.</div>
                            <button onClick={() => setNuovo({ codice: "", barcode: "", descrizione: cerca, marca: "", haImei: false, costo: "", prezzo: "", reparto: "" })}
                                className="rvPill rvPill-sm mt-2">➕ Crea l&apos;articolo</button>
                        </div>
                    )}

                    {nuovo && (
                        <div className="rvStoria rvScheda mt-3">
                            <div className="rvDettT">➕ Nuovo articolo</div>
                            {/* UN ARTICOLO HA DUE CODICI (Luca 03/09: «quando crei
                                un articolo i codici sono due e poi c'è la
                                descrizione — vatti a vedere come è composto un
                                articolo importato da Suite Mobile»). Guardato:
                                `0TSAGAA5OU7127` è il codice interno,
                                `8032325398960` il codice a barre, e poi il nome.
                                Il 77% del listino generale ce li ha tutti e due.
                                Chiederne uno solo vuol dire un articolo che al
                                banco, col lettore, non si trova. */}
                            <div className="rvBarra mt-2">
                                <label className="rvCampo rvCampo-sm"><span className="rvLab">Codice <span className="rvLabX">(interno)</span></span>
                                    <input value={nuovo.codice} onChange={e => setNuovo({ ...nuovo, codice: e.target.value })} className="rvIn" autoFocus /></label>
                                <label className="rvCampo rvCampo-sm"><span className="rvLab">Codice a barre <span className="rvLabX">(sparalo col lettore)</span></span>
                                    <input value={nuovo.barcode} onChange={e => setNuovo({ ...nuovo, barcode: e.target.value })} className="rvIn font-mono" /></label>
                                <label className="rvCampo rvCampo-flex"><span className="rvLab">Descrizione</span>
                                    <input value={nuovo.descrizione} onChange={e => setNuovo({ ...nuovo, descrizione: e.target.value })} className="rvIn" /></label>
                            </div>
                            <div className="rvBarra mt-2">
                                <label className="rvCampo rvCampo-xs"><span className="rvLab">Costo €</span>
                                    <input value={nuovo.costo} onChange={e => setNuovo({ ...nuovo, costo: e.target.value })} className="rvIn" inputMode="decimal" /></label>
                                <label className="rvCampo rvCampo-xs"><span className="rvLab">Prezzo € <span className="rvLabX">(serve)</span></span>
                                    <input value={nuovo.prezzo} onChange={e => setNuovo({ ...nuovo, prezzo: e.target.value })} className="rvIn" inputMode="decimal" /></label>
                                <label className="rvCampo rvCampo-sm"><span className="rvLab">Marca</span>
                                    <input value={nuovo.marca} onChange={e => setNuovo({ ...nuovo, marca: e.target.value })} className="rvIn" /></label>
                                {/* l'etichetta sta su UNA riga: andando a capo
                                    spingeva giù la sua tendina e la riga si
                                    disallineava. Il perché lo dice il rifiuto,
                                    quando serve, invece di occupare due righe
                                    sempre. */}
                                <label className="rvCampo rvCampo-md"><span className="rvLab">Reparto IVA <span className="rvLabX">(serve)</span></span>
                                    <select className="rvIn" value={nuovo.reparto} onChange={e => setNuovo({ ...nuovo, reparto: e.target.value })}>
                                        <option value="">— scegli —</option>
                                        {reparti.map(r => (
                                            <option key={r.reparto} value={r.reparto}>
                                                {r.reparto} · {r.descrizione}{r.aliquota != null ? ` (${r.aliquota}%)` : r.natura ? ` (${r.natura})` : ""}
                                            </option>
                                        ))}
                                    </select></label>
                            </div>
                            <div className="rvCampo mt-2"><span className="rvLab">Ogni pezzo ha il suo numero (IMEI, ICCID…)?</span>
                                <div className="rvPillRow">
                                    <button onClick={() => setNuovo({ ...nuovo, haImei: false })} className={cn("rvPill rvPill-sm", !nuovo.haImei && "rvPill-on")}>No, si conta a quantità</button>
                                    <button onClick={() => setNuovo({ ...nuovo, haImei: true })} className={cn("rvPill rvPill-sm", nuovo.haImei && "rvPill-on")}>Sì, uno per uno</button>
                                </div>
                            </div>
                            <div className="rvPillRow mt-2">
                                <button onClick={creaArticolo} disabled={busy || !nuovo.codice.trim() || !nuovo.descrizione.trim() || !numeroReparto(nuovo.reparto) || !prezzoValido(nuovo.prezzo)} className="rvAzione rvAzione-sm">Crea e aggiungi</button>
                                <button onClick={() => setNuovo(null)} className="rvPill rvPill-sm">Annulla</button>
                            </div>
                        </div>
                    )}

                    {/* LE RIGHE AGGIUNTE */}
                    {!!righe.length && (
                        <div className="rvDett mt-3">
                            <div className="rvDettT">Nel carico ({totPezzi} pezz{totPezzi === 1 ? "o" : "i"})</div>
                            {righe.map(r => (
                                <div key={r.chiave} className="rvDettR">
                                    <span className="rvTab-nome">{r.descrizione}</span>
                                    <span className="rvTab-cod">{r.codice}</span>

                                    {/* COME SI CONTA QUESTA RIGA. L'anagrafica propone, l'operatore
                                        decide: `ha_imei` l'ho dedotto dalla storia dei pezzi, e la
                                        storia non sa tutto — un articolo nuovo non ce l'ha, e 23
                                        articoli hanno tutte e due le forme (telefoni a IMEI e
                                        accessori a quantità sotto lo stesso codice). Senza questo
                                        interruttore quei carichi non si potevano proprio fare. */}
                                    <div className="rvPillRow">
                                        <button onClick={() => cambia(r.chiave, { unoPerUno: false, seriali: [], quantita: r.quantita || 1 })}
                                            className={cn("rvPill rvPill-sm", !r.unoPerUno && "rvPill-on")}>a quantità</button>
                                        <button onClick={() => cambia(r.chiave, { unoPerUno: true, quantita: 0 })}
                                            className={cn("rvPill rvPill-sm", r.unoPerUno && "rvPill-on")}>uno per uno</button>
                                    </div>

                                    {r.unoPerUno ? (
                                        <>
                                            <label className="rvCampo rvCampo-flex"><span className="rvLab">Numeri <span className="rvLabX">(uno per riga)</span></span>
                                                <textarea rows={3} className="rvIn font-mono"
                                                    value={r.seriali.join("\n")}
                                                    onChange={e => cambia(r.chiave, { seriali: e.target.value.split(/[\n,;\s]+/).map(s => s.trim()).filter(Boolean) })} /></label>
                                            <div className="rvCampo rvCampo-xs"><span className="rvLab">Che numero è</span>
                                                <div className="rvPillRow">
                                                    {TIPI_SERIALE.map(t => (
                                                        <button key={t.v} onClick={() => cambia(r.chiave, { tipoSeriale: t.v })} title={t.nota}
                                                            className={cn("rvPill rvPill-sm", r.tipoSeriale === t.v && "rvPill-on")}>{t.et}</button>
                                                    ))}
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <label className="rvCampo rvCampo-xs"><span className="rvLab">Quantità</span>
                                            {/* mezzo telefono non esiste: senza `step` il campo accettava 2,7 */}
                                            <input type="number" min={1} step={1} className="rvQta" value={r.quantita || ""}
                                                onChange={e => cambia(r.chiave, { quantita: Math.floor(Number(e.target.value) || 0) })} /></label>
                                    )}
                                    <span className="rvTab-min">{pezziDi(r)} pz</span>
                                    <span className="rvSpazio" />
                                    <button onClick={() => togli(r.chiave)} className="rvCestino" title="Togli dal carico">
                                        <Trash2 size={14} /></button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="rvBarra rvBarra-c mt-3 justify-end">
                        <button onClick={() => setPasso(1)} className="rvPill rvPill-sm">← Indietro</button>
                        <button onClick={() => setPasso(3)} disabled={!righe.length} className="rvAzione">Avanti →</button>
                    </div>
                </div>
            )}

            {/* ── 3. DI CHI È ─────────────────────────────────────────────── */}
            {passo === 3 && (
                <div className="mt-3">
                    <div className="rvHint">
                        Spunta le righe e premi la società: se non spunti niente, la società si applica a tutte.
                        Chi possiede il pezzo decide da quale cassa uscirà lo scontrino quando lo si vende.
                    </div>
                    <div className="rvPillRow mt-2">
                        {aziendeDelNegozio.map(a => (
                            <button key={a} onClick={() => assegna(a)} className="rvAzione rvAzione-sm">
                                🏢 {nomiAzienda[a] || a} {spuntate.size ? `→ ${spuntate.size} righe` : "→ tutte"}
                            </button>
                        ))}
                    </div>
                    <div className="rvDett mt-3">
                        {righe.map(r => (
                            <div key={r.chiave} className={cn("rvDettR", spuntate.has(r.chiave) && "rvTab-on")}>
                                <label className="rvCampo rvCampo-xs">
                                    <input type="checkbox" checked={spuntate.has(r.chiave)} onChange={() => spunta(r.chiave)} />
                                </label>
                                <span className="rvTab-nome">{r.descrizione}</span>
                                <span className="rvTab-min">{pezziDi(r)} pz</span>
                                <span className="rvSpazio" />
                                {r.azienda
                                    ? <span className="rvBadge rvBadge-acc">{nomiAzienda[r.azienda] || r.azienda}</span>
                                    : <span className="rvBadge rvBadge-ko">manca la società</span>}
                            </div>
                        ))}
                    </div>
                    <div className="rvBarra rvBarra-c mt-3 justify-end">
                        <button onClick={() => setPasso(2)} className="rvPill rvPill-sm">← Indietro</button>
                        <button onClick={() => setPasso(4)} className="rvAzione">Avanti →</button>
                    </div>
                </div>
            )}

            {/* ── 4. COME ARRIVA ──────────────────────────────────────────── */}
            {passo === 4 && (
                <div className="mt-3">
                    {!inUfficio && (
                        <div className="rvCampo"><span className="rvLab">Come arriva in negozio</span>
                            <div className="rvPillRow">
                                <button onClick={() => setConAccettazione(true)} className={cn("rvPill", conAccettazione && "rvPill-on")}>
                                    📦 Il negozio deve accettarla
                                </button>
                                <button onClick={() => setConAccettazione(false)} className={cn("rvPill", !conAccettazione && "rvPill-on")}>
                                    ⚡ Carico diretto
                                </button>
                            </div>
                            <div className="rvHint">
                                {conAccettazione
                                    ? "La merce resta in viaggio e il negozio la prende in carico dai Trasferimenti: a scaffale ci finisce quando qualcuno l'ha vista davvero."
                                    : "La merce entra subito a scaffale, e il documento nasce già accettato. Da usare quando la consegna l'hai già fatta tu."}
                            </div>
                        </div>
                    )}

                    <div className="rvDett mt-3">
                        <div className="rvDettT">Riepilogo</div>
                        <div className="rvDettR"><span>Entra a</span><span className="rvSpazio" /><b>{negozio}</b></div>
                        <div className="rvDettR"><span>Pezzi</span><span className="rvSpazio" /><b>{totPezzi}</b></div>
                        <div className="rvDettR"><span>Valore a costo</span><span className="rvSpazio" /><b>{eur(totValore)}</b></div>
                        {Object.entries(perSocieta).map(([az, g]) => (
                            <div key={az} className="rvDettR">
                                <span>{nomiAzienda[az] || az}</span>
                                <span className="rvTab-min">{g.length} rig{g.length === 1 ? "a" : "he"} · {g.reduce((a, r) => a + pezziDi(r), 0)} pz</span>
                                <span className="rvSpazio" />
                                <span className="rvTab-min">{inUfficio ? "nessun documento" : "un documento di trasporto"}</span>
                            </div>
                        ))}
                    </div>

                    {!!manca.length && (
                        <div className="rvNota rvNota-att mt-3">
                            <div className="rvNota-t">Prima di caricare</div>
                            <div className="rvNota-s">{manca.slice(0, 4).join(" · ")}
                                {manca.length > 4 && <> · <b>e altre {manca.length - 4} cose</b></>}</div>
                        </div>
                    )}

                    <div className="rvBarra rvBarra-c mt-3 justify-end">
                        <button onClick={() => setPasso(3)} className="rvPill rvPill-sm">← Indietro</button>
                        <button onClick={conferma} disabled={busy || !!manca.length} className="rvAzione">
                            {busy ? "carico…" : inUfficio ? "Carica in ufficio" : conAccettazione ? "Invia al negozio" : "Carica subito"}
                        </button>
                    </div>
                </div>
            )}
        </div>
        </div>,
        document.body,
    );
}
