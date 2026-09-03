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
 * ═══════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { SelectOpzioni } from "@/components/SelectPersona";
import { PackagePlus, Search, Trash2, Plus } from "lucide-react";

const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
const eur = (n: number | null | undefined) => n == null ? "—"
    : Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

/** L'ufficio è il punto di partenza della merce: caricare LÌ non muove niente. */
const UFFICIO = "Ufficio";

type ArticoloTrovato = {
    codice: string; descrizione: string; barcode: string | null;
    ha_imei: boolean; prezzo: number | null; costo_ultimo: number | null;
    gruppo: string | null; marca: string | null; reparto: number | null;
};

type Riga = {
    chiave: string;
    codice: string;
    descrizione: string;
    haImei: boolean;
    /** quanti pezzi: sui serializzati è il numero di seriali inseriti */
    quantita: number;
    seriali: string[];
    costo: number | null;
    azienda: string;
};

export default function CaricoMerce({ negozi, aziende, nomiAzienda, utente, dopo, chiudi }: {
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
            const { data } = await supabase.from("mag_articoli")
                .select("codice,descrizione,barcode,ha_imei,prezzo,costo_ultimo,gruppo,marca,reparto")
                .or(`descrizione.ilike.%${q}%,codice.ilike.%${q}%,barcode.ilike.%${q}%`)
                .eq("attivo", true).limit(40);
            if (!vivo) return;
            const lista = (data ?? []) as ArticoloTrovato[];
            setTrovati(lista); setNessuno(!lista.length); setCercando(false);
        }, 250);
        return () => { vivo = false; clearTimeout(t); };
    }, [cerca]);

    /** La società di partenza: quella del negozio scelto, se ne ha una sola. */
    const aziendeDelNegozio = useMemo(() => aziende.filter(Boolean), [aziende]);
    const aziendaDiDefault = aziendeDelNegozio.length === 1 ? aziendeDelNegozio[0] : "";

    const aggiungi = (a: ArticoloTrovato) => {
        setRighe(r => [...r, {
            chiave: `${a.codice}|${Date.now()}|${Math.random().toString(36).slice(2, 7)}`,
            codice: a.codice, descrizione: a.descrizione, haImei: !!a.ha_imei,
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
       carico che non si fa. */
    const [nuovo, setNuovo] = useState<{ codice: string; descrizione: string; haImei: boolean; costo: string; prezzo: string } | null>(null);
    const creaArticolo = async () => {
        if (!nuovo || !nuovo.codice.trim() || !nuovo.descrizione.trim()) return;
        setBusy(true);
        const a = {
            codice: nuovo.codice.trim().toUpperCase(),
            descrizione: nuovo.descrizione.trim(),
            ha_imei: nuovo.haImei,
            costo_ultimo: nuovo.costo.trim() ? Number(nuovo.costo.replace(",", ".")) : null,
            prezzo: nuovo.prezzo.trim() ? Number(nuovo.prezzo.replace(",", ".")) : null,
            attivo: true, fonte: "carico merce",
        };
        const { error } = await supabase.from("mag_articoli").insert(a);
        setBusy(false);
        if (error) { setEsito({ ok: false, testo: "Articolo non creato: " + error.message }); return; }
        aggiungi({ ...a, barcode: null, gruppo: null, marca: null, reparto: null } as ArticoloTrovato);
        setNuovo(null);
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
    const pezziDi = (r: Riga) => r.haImei ? r.seriali.length : (Number(r.quantita) || 0);
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
            if (r.haImei && !r.seriali.length) out.push(`«${r.descrizione}» vuole gli IMEI: non ne hai inserito nessuno`);
            if (!r.haImei && pezziDi(r) <= 0) out.push(`«${r.descrizione}»: quanti pezzi?`);
            if (!r.azienda) out.push(`«${r.descrizione}»: di quale società è?`);
        });
        /* GLI STESSI SERIALI DUE VOLTE non sono due pezzi: sono un errore di
           battitura o un lettore che ha sparato due volte. */
        const tutti = righe.flatMap(r => r.seriali);
        const doppi = tutti.filter((s, i) => tutti.indexOf(s) !== i);
        if (doppi.length) out.push(`seriale ripetuto: ${Array.from(new Set(doppi)).slice(0, 3).join(", ")}`);
        return out;
    }, [negozio, righe]);

    /* ═══ LA CONFERMA ═══════════════════════════════════════════════════════ */
    const conferma = useCallback(async () => {
        if (manca.length || busy) return;
        setBusy(true); setEsito(null);
        try {
            /* I SERIALI GIÀ IN CASA si fermano qui: due pezzi con lo stesso
               IMEI sono un pezzo contato due volte, e da lì in poi il magazzino
               non torna più. */
            const tuttiSer = righe.flatMap(r => r.seriali);
            if (tuttiSer.length) {
                const { data: gia } = await supabase.from("mag_unita").select("seriale").in("seriale", tuttiSer);
                const esistono = (gia ?? []).map((x: { seriale: string }) => x.seriale);
                if (esistono.length) {
                    setEsito({ ok: false, testo: `Questi seriali sono già a magazzino: ${esistono.slice(0, 5).join(", ")}${esistono.length > 5 ? "…" : ""}. Il carico non è partito.` });
                    setBusy(false); return;
                }
            }

            const documenti: string[] = [];
            for (const [az, gruppo] of Object.entries(perSocieta)) {
                let ddtId: string | null = null;
                let numero: number | null = null;

                /* IL DOCUMENTO NASCE SOLO SE LA MERCE SI SPOSTA. In ufficio la
                   merce è già dov'è: non c'è nessun trasporto da documentare. */
                if (!inUfficio) {
                    const { data: d, error: eD } = await supabase.from("mag_ddt").insert({
                        da_negozio: UFFICIO, a_negozio: negozio,
                        azienda_da: az, azienda_a: az,
                        tipo: "trasferimento",
                        stato: conAccettazione ? "in_transito" : "accettato",
                        causale: conAccettazione
                            ? "Carico merce dall'ufficio — in attesa di accettazione"
                            : "Carico merce dall'ufficio — consegnata",
                        creato_da: utente,
                        ...(conAccettazione ? {} : { accettato_da: utente, accettato_il: new Date().toISOString() }),
                    }).select("id, numero").single();
                    if (eD || !d) throw new Error("documento non creato: " + (eD?.message || ""));
                    ddtId = (d as { id: string }).id;
                    numero = (d as { numero: number }).numero;
                    documenti.push(`n.${numero} (${nomiAzienda[az] || az})`);

                    const righeDoc = gruppo.map((r, i) => ({
                        ddt_id: ddtId, riga: i + 1, codice: r.codice, descrizione: r.descrizione,
                        quantita: pezziDi(r), seriale: r.haImei ? r.seriali.join(", ") : null,
                        valore_unitario: r.costo,
                        negozio_da: UFFICIO, negozio_a: negozio, azienda_da: az, azienda_a: az,
                        stato: conAccettazione ? "in_viaggio" : "accettata",
                    }));
                    const { error: eR } = await supabase.from("mag_ddt_righe").insert(righeDoc);
                    if (eR) throw new Error("righe del documento: " + eR.message);
                }

                /* ⚠️ LA MERCE ENTRA SOLO SE È GIÀ ARRIVATA. Col flag
                   dell'accettazione resta appesa al documento e il negozio la
                   prende in carico dai Trasferimenti: caricarla adesso vorrebbe
                   dire averla a scaffale prima che qualcuno l'abbia vista. */
                if (!conAccettazione || inUfficio) {
                    const conImei = gruppo.filter(r => r.haImei);
                    const aQta = gruppo.filter(r => !r.haImei);
                    if (conImei.length) {
                        const unita = conImei.flatMap(r => r.seriali.map(s => ({
                            seriale: s, tipo_seriale: "imei", codice: r.codice, descrizione: r.descrizione,
                            azienda: az, negozio, valore: r.costo, stato: "disponibile",
                            caricato_da: utente, ddt_id: ddtId,
                            storia: [{ quando: new Date().toISOString(), evento: "carico", negozio, operatore: utente,
                                note: inUfficio ? "carico merce in ufficio" : `carico merce dall'ufficio${numero ? ` — DDT n.${numero}` : ""}` }],
                        })));
                        const { error } = await supabase.from("mag_unita").insert(unita);
                        if (error) throw new Error("pezzi con seriale: " + error.message);
                    }
                    if (aQta.length) {
                        const mov = aQta.map(r => ({
                            codice: r.codice, negozio, azienda: az, tipo: "carico",
                            quantita: pezziDi(r), costo_unitario: r.costo, operatore: utente,
                            ddt_id: ddtId,
                            nota: inUfficio ? "carico merce in ufficio" : `carico merce dall'ufficio${numero ? ` — DDT n.${numero}` : ""}`,
                        }));
                        const { error } = await supabase.from("mag_movimenti").insert(mov);
                        if (error) throw new Error("movimenti di magazzino: " + error.message);
                    }
                }
            }

            setEsito({
                ok: true,
                testo: inUfficio
                    ? `Caricati ${totPezzi} pezzi in ufficio.`
                    : conAccettazione
                        ? `${totPezzi} pezzi in viaggio verso ${negozio}. Documenti ${documenti.join(" e ")}: il negozio li trova in Trasferimenti e deve accettarli.`
                        : `Caricati ${totPezzi} pezzi a ${negozio}, già a scaffale. Documenti ${documenti.join(" e ")}.`,
            });
            setRighe([]); setPasso(1); dopo();
        } catch (e) {
            setEsito({ ok: false, testo: (e as Error)?.message || "carico non riuscito" });
        } finally { setBusy(false); }
    }, [manca, busy, righe, perSocieta, negozio, inUfficio, conAccettazione, utente, nomiAzienda, totPezzi, dopo]);

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
                            <button onClick={() => setNuovo({ codice: "", descrizione: cerca, haImei: false, costo: "", prezzo: "" })}
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
                            <div className="rvCampo mt-2"><span className="rvLab">Ogni pezzo ha il suo IMEI?</span>
                                <div className="rvPillRow">
                                    <button onClick={() => setNuovo({ ...nuovo, haImei: false })} className={cn("rvPill rvPill-sm", !nuovo.haImei && "rvPill-on")}>No, si conta a quantità</button>
                                    <button onClick={() => setNuovo({ ...nuovo, haImei: true })} className={cn("rvPill rvPill-sm", nuovo.haImei && "rvPill-on")}>Sì, uno per uno</button>
                                </div>
                            </div>
                            <div className="rvPillRow mt-2">
                                <button onClick={creaArticolo} disabled={busy || !nuovo.codice.trim() || !nuovo.descrizione.trim()} className="rvAzione rvAzione-sm">Crea e aggiungi</button>
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
                                    {r.haImei ? (
                                        <label className="rvCampo rvCampo-flex"><span className="rvLab">IMEI <span className="rvLabX">(uno per riga)</span></span>
                                            <textarea rows={3} className="rvIn font-mono"
                                                value={r.seriali.join("\n")}
                                                onChange={e => cambia(r.chiave, { seriali: e.target.value.split(/[\n,;\s]+/).map(s => s.trim()).filter(Boolean) })} /></label>
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
