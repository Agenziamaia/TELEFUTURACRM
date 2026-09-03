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
import { supabase } from "@/lib/supabaseClient";
import { SelectOpzioni } from "@/components/SelectPersona";
import { PackagePlus, Trash2, Plus } from "lucide-react";

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

/* IL REPARTO SI SCEGLIE LEGGENDO, NON A NUMERO. La tendina è una casella di
   testo: quello che ci si tiene dentro è quello che si vede. Tenerci «2»
   vorrebbe dire che dopo aver scelto «2 · IVA 22%» il campo mostra «2», che a
   chi guarda non dice niente. Il numero lo si estrae al momento di creare —
   e la descrizione può contenere altri «·» (c'è «7 · Usato · regime
   margine»), quindi si prende quello che sta PRIMA del primo. */
const etichettaReparto = (r: { reparto: number; descrizione: string }) => `${r.reparto} · ${r.descrizione}`;
const numeroReparto = (etichetta: string) => {
    const n = Number(String(etichetta || "").split("·")[0].trim());
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
    /** com'era in anagrafica, per accorgersi quando l'operatore la corregge */
    haImeiInAnagrafica: boolean;
    tipoSeriale: string;
    quantita: number;
    seriali: string[];
    costo: number | null;
    azienda: string;
};

/* `utente` non si legge più da qui, ed è voluto: chi ha caricato la merce lo
   scrive il database, prendendolo dalla sessione firmata. Il nome che arriva
   dal browser è un nome che il browser può cambiare. */
export default function CaricoMerce({ negozi, aziende, nomiAzienda, dopo, chiudi }: {
    negozi: string[]; aziende: string[]; nomiAzienda: Record<string, string>;
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
    useEffect(() => {
        if (!negozio || inUfficio) { setCasse(null); return; }
        let vivo = true;
        (async () => {
            const { data } = await supabase.from("pos_rt").select("azienda").eq("negozio", negozio);
            if (vivo) setCasse(Array.from(new Set((data ?? []).map((r: { azienda: string }) => r.azienda).filter(Boolean))));
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

    /* Cambiare negozio può togliere di mezzo una società: le righe che la
       portavano restano senza, e il passo 3 lo dice. */
    useEffect(() => {
        setRighe(r => r.map(x => x.azienda && !aziendeDelNegozio.includes(x.azienda) ? { ...x, azienda: "" } : x));
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
            unoPerUno: !!a.ha_imei, haImeiInAnagrafica: !!a.ha_imei, tipoSeriale: "imei",
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
    const [reparti, setReparti] = useState<{ reparto: number; descrizione: string }[]>([]);
    useEffect(() => {
        supabase.from("pos_reparti").select("reparto,descrizione").eq("attivo", true).order("reparto")
            .then(({ data }) => setReparti((data ?? []) as { reparto: number; descrizione: string }[]));
    }, []);

    const [nuovo, setNuovo] = useState<{ codice: string; descrizione: string; haImei: boolean; costo: string; prezzo: string; reparto: string } | null>(null);
    const creaArticolo = async () => {
        if (!nuovo || !nuovo.codice.trim() || !nuovo.descrizione.trim() || !numeroReparto(nuovo.reparto)) return;
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
        });
        setBusy(false);
        if (error) { setEsito({ ok: false, testo: "Articolo non creato: " + error.message }); return; }
        const a = data as { codice: string; descrizione: string; ha_imei: boolean; costo_ultimo: number | null };
        aggiungi({ ...a, barcode: null, gruppo: null, marca: null, reparto: Number(nuovo.reparto), prezzo: null } as ArticoloTrovato);
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
                ...(r.unoPerUno ? { seriali: r.seriali } : { quantita: pezziDi(r) }),
            })),
        });
        setBusy(false);
        if (error) { setEsito({ ok: false, testo: error.message }); return; }

        const r = data as { pezzi: number; documenti: { numero: number; azienda: string }[] };
        const docs = (r.documenti || []).map(d => `n.${d.numero} (${nomiAzienda[d.azienda] || d.azienda})`).join(" e ");

        /* L'ANAGRAFICA IMPARA DA QUELLO CHE È SUCCESSO. Il flag `ha_imei` l'ho
           dedotto dalla storia: chi non aveva storia è rimasto a «si conta a
           quantità», e chi aveva tutte e due le forme è rimasto a «uno per
           uno». Se l'operatore ha corretto la riga, la correzione vale anche
           per la prossima volta — se no la ricorregge ogni volta a mano.
           Se la scrittura non passa non è un guaio: la merce è entrata, e
           questo è solo un promemoria per il carico successivo. */
        const daImparare = righe.filter(x => x.unoPerUno !== x.haImeiInAnagrafica);
        if (daImparare.length) {
            await Promise.all(Array.from(new Set(daImparare.map(x => x.codice))).map(cod => {
                const v = daImparare.find(x => x.codice === cod)!.unoPerUno;
                return supabase.from("mag_articoli").update({ ha_imei: v }).eq("codice", cod);
            })).catch(() => {});
        }

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

    /* ═══ IL DISEGNO ════════════════════════════════════════════════════════ */
    const PASSI = [
        { n: 1 as const, et: "Dove entra" },
        { n: 2 as const, et: "Cosa entra" },
        { n: 3 as const, et: "Di chi è" },
        { n: 4 as const, et: "Come arriva" },
    ];
    const puoAndare = (n: number) => n === 1 || (n === 2 && !!negozio) || (n >= 3 && !!negozio && righe.length > 0);

    return (
        <div className="rvBox">
            <div className="rvTesta">
                <h2 className="rvTit"><PackagePlus size={22} /> Carico merce</h2>
                <button onClick={chiudi} className="rvPill rvPill-sm">Chiudi</button>
            </div>

            {/* I PASSI, come in Registra Vendita: si vede dove si è e quanto manca */}
            <div className="rvPillRow">
                {PASSI.map(p => (
                    <button key={p.n} type="button" disabled={!puoAndare(p.n)} onClick={() => setPasso(p.n)}
                        className={cn("rvPill rvPill-sm", passo === p.n && "rvPill-on")}>
                        {p.n}. {p.et}
                    </button>
                ))}
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
                        </div>
                    </div>
                    <div className="rvBarra rvBarra-c mt-3 justify-end">
                        <button onClick={() => setPasso(2)} disabled={!negozio} className="rvAzione">Avanti →</button>
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
                            <button onClick={() => setNuovo({ codice: "", descrizione: cerca, haImei: false, costo: "", prezzo: "", reparto: "" })}
                                className="rvPill rvPill-sm mt-2">➕ Crea l&apos;articolo</button>
                        </div>
                    )}

                    {nuovo && (
                        <div className="rvStoria rvScheda mt-3">
                            <div className="rvDettT">➕ Nuovo articolo</div>
                            <div className="rvBarra mt-2">
                                <label className="rvCampo rvCampo-sm"><span className="rvLab">Codice</span>
                                    <input value={nuovo.codice} onChange={e => setNuovo({ ...nuovo, codice: e.target.value })} className="rvIn" /></label>
                                <label className="rvCampo rvCampo-flex"><span className="rvLab">Descrizione</span>
                                    <input value={nuovo.descrizione} onChange={e => setNuovo({ ...nuovo, descrizione: e.target.value })} className="rvIn" /></label>
                                <label className="rvCampo rvCampo-xs"><span className="rvLab">Costo €</span>
                                    <input value={nuovo.costo} onChange={e => setNuovo({ ...nuovo, costo: e.target.value })} className="rvIn" /></label>
                                <label className="rvCampo rvCampo-xs"><span className="rvLab">Prezzo €</span>
                                    <input value={nuovo.prezzo} onChange={e => setNuovo({ ...nuovo, prezzo: e.target.value })} className="rvIn" /></label>
                            </div>
                            <div className="rvBarra mt-2">
                                <div className="rvCampo rvCampo-md"><span className="rvLab">Reparto IVA <span className="rvLabX">(senza, l&apos;articolo non esce sullo scontrino)</span></span>
                                    <SelectOpzioni className="rvIn" value={nuovo.reparto}
                                        onChange={v => setNuovo({ ...nuovo, reparto: v })}
                                        opzioni={reparti.map(etichettaReparto)} placeholder="scegli…" /></div>
                            </div>
                            <div className="rvCampo mt-2"><span className="rvLab">Ogni pezzo ha il suo numero (IMEI, ICCID…)?</span>
                                <div className="rvPillRow">
                                    <button onClick={() => setNuovo({ ...nuovo, haImei: false })} className={cn("rvPill rvPill-sm", !nuovo.haImei && "rvPill-on")}>No, si conta a quantità</button>
                                    <button onClick={() => setNuovo({ ...nuovo, haImei: true })} className={cn("rvPill rvPill-sm", nuovo.haImei && "rvPill-on")}>Sì, uno per uno</button>
                                </div>
                            </div>
                            <div className="rvPillRow mt-2">
                                <button onClick={creaArticolo} disabled={busy || !nuovo.codice.trim() || !nuovo.descrizione.trim() || !numeroReparto(nuovo.reparto)} className="rvAzione rvAzione-sm">Crea e aggiungi</button>
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
                                            <input type="number" min={1} className="rvQta" value={r.quantita || ""}
                                                onChange={e => cambia(r.chiave, { quantita: Number(e.target.value) })} /></label>
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
                            <div className="rvNota-s">{manca.slice(0, 4).join(" · ")}</div>
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
    );
}
