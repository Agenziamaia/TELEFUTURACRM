"use client";
/* ═══════════════════════════════════════════════════════════════════════════
   PRODOTTI E SERVIZI — la cassa (Luca 29/08, primo negozio: Donna Olimpia)

   Fin qui questa parte serviva solo a registrare le vendite a marginalità per
   la gara e per l'archivio. Da oggi il CRM emette anche lo scontrino e tiene
   il magazzino fiscale, quindi la domanda cambia: non più «quanto ci
   guadagniamo su questa voce» ma «quale pezzo sto vendendo, ce l'ho, e quanto
   mi è costato».

   IL FLUSSO, come lo ha descritto Luca:
     entro → mi chiede PRODOTTO o SERVIZIO
     · PRODOTTO → si apre la ricerca del magazzino. Scrivo o SPARO: un codice
       articolo, un codice a barre, un IMEI. Mentre scrivo vedo gli articoli
       CON LA LORO DISPONIBILITÀ. Clicco e va dritto in carrello.
     · SERVIZIO → i pulsanti che esistono già (Assistenza, Backup, …)
   Niente più passaggio intermedio per il prezzo: i prezzi si sistemano nel
   carrello, che è il posto dove si guarda il conto.

   «Telefono Cash» sparisce come categoria: un telefono è un prodotto, si
   trova sparando il suo IMEI.

   ⚠️  Questa schermata segue  docs/REGOLE_REGISTRA_VENDITA.md : solo classi
   `.rv*`, nessuno stile scritto a mano, il colore dal contenitore, i modali
   in un portal. Se la modifichi, resta dentro quelle regole.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/utils";
import {
    caricaCatalogo, caricaGiacenze, caricaGruppi, cerca, cercaSeriale, sembraSeriale, puoEssereSeriale, normalizzaSeriale, iconaArticolo,
    marginePct, perchéSenzaMargine,
    type VoceCassa, type NaturaCassa, type Giacenza, type PezzoSeriale, type GruppoCassa,
} from "@/lib/cassaCatalogo";
import { stessoMagazzino } from "@/lib/negoziNomi";

const eur = (n: number | null | undefined) =>
    n == null ? "—" : "€ " + Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function CassaProdotti({ negozio, venditore, onAdd, servizi, scorciatoie, giaInCarrello, fiscale }: {
    negozio?: string; venditore?: string;
    /** questo negozio emette davvero lo scontrino? Se no, il reparto IVA
     *  mancante non è un motivo per rifiutare una vendita: il server lo
     *  controlla solo fuori dalla modalità di prova, e qui deve valere la
     *  stessa regola (revisore 29/08). */
    fiscale?: boolean;
    onAdd: (r: Record<string, unknown>) => void;
    /** i pulsanti dei servizi che esistono già: restano quelli */
    servizi?: React.ReactNode;
    /** le scorciatoie dentro i PRODOTTI (Luca 29/08): SIM, ESIM e le voci a
     *  marginalità. Non sono merce di magazzino — servono a non far cercare
     *  niente a chi sta al banco. */
    scorciatoie?: React.ReactNode;
    /** quanti pezzi di ogni codice sono GIÀ nel carrello. Senza questo il
     *  controllo di giacenza guarda solo il magazzino, e cliccando tre volte
     *  su un articolo che ne ha uno passano tutte e tre — che è poi l'unico
     *  modo di venderne due uguali, quindi la strada normale (revisore 29/08). */
    giaInCarrello?: Record<string, number>;
}) {
    const [natura, setNatura] = useState<NaturaCassa | null>(null);
    const [voci, setVoci] = useState<VoceCassa[] | null>(null);
    const [giac, setGiac] = useState<Map<string, Giacenza>>(new Map());
    const [q, setQ] = useState("");
    const [pezzo, setPezzo] = useState<PezzoSeriale | null>(null);
    const [gruppi, setGruppi] = useState<GruppoCassa[]>([]);
    const [gruppoAperto, setGruppoAperto] = useState<string | null>(null);
    /* IL PEZZO CHE NON C'È (Luca 29/08, correzione secca): «se il prodotto
       non c'è in magazzino non deve andare nemmeno nel carrello, deve darmi un
       pop up che mi dice che il prodotto non è presente in magazzino».
       Il carrello è la base dello scontrino fiscale: se ci entra qualcosa che
       a magazzino non esiste, il conto non torna già in partenza. */
    const [manca, setManca] = useState<{ nome: string; dettaglio: string; titolo?: string; cosaFare?: string } | null>(null);
    /* IL MAGAZZINO NON È ANCORA CARICATO QUI (Luca 29/08). Oggi esiste solo a
       Donna Olimpia: negli altri negozi la ricerca trova gli articoli — il
       catalogo è dell'azienda, non del negozio — e ogni clic risponderebbe
       «non risulta mai entrato», che è vero ma sembra un difetto. Meglio
       dirlo una volta sola, in cima, e mandare al banco chi deve vendere. */
    const [caricate, setCaricate] = useState(false);
    const senzaMagazzino = caricate && giac.size === 0;
    const ricerca = useRef<HTMLInputElement | null>(null);

    useEffect(() => { caricaCatalogo().then(setVoci); caricaGruppi().then(setGruppi); }, []);
    useEffect(() => { setCaricate(false); if (negozio) caricaGiacenze(negozio).then((g) => { setGiac(g); setCaricate(true); }); }, [negozio]);
    useEffect(() => { if (natura === "prodotto") setTimeout(() => ricerca.current?.focus(), 60); }, [natura]);

    /* IL SERIALE. Un IMEI ha 15 cifre, un ICCID 19: quando quello che si è
       digitato ha quella forma si va a cercare IL pezzo, non l'articolo. */
    useEffect(() => {
        setPezzo(null);
        if (natura !== "prodotto" || !puoEssereSeriale(q)) return;
        let vivo = true;
        /* NON `replace(/\D/g,"")`: le lettere fanno parte del seriale — il
           4S44MM dell'Apple Watch diventava «444» e non si trovava più. */
        const s = normalizzaSeriale(q);
        // il seriale certo (15 o 19 cifre) merita il pop-up se non c'è; una
        // ricerca qualunque no: chi scrive «iphone 15 pro» cerca un articolo
        const certo = sembraSeriale(q);
        /* MEZZO SECONDO DI PAZIENZA. Ora che si prova a cercare un pezzo per
           qualunque parola alfanumerica, senza attesa si partirebbe a ogni
           tasto: un IMEI digitato a mano sono quindici interrogazioni. Il
           lettore di codici incolla tutto insieme e non se ne accorge. */
        const t = setTimeout(() => {
            cercaSeriale(s).then((p) => {
                if (!vivo) return;
                if (p) setPezzo(p);
                else if (certo) setManca({ nome: "Seriale " + s, dettaglio: "Questo seriale non risulta a magazzino né fra gli usati in vendita. Se il telefono è qui davanti a te va prima caricato: finché non c'è, non può essere venduto." });
            });
        }, 250);
        return () => { vivo = false; clearTimeout(t); };
    }, [q, natura]);

    /* L'elenco compare SOLO quando si cerca (Luca 29/08: i filtri per famiglia
       non servivano, «sopra ho i pulsanti rapidi e sotto scrivo il codice»).
       Senza ricerca, centocinquanta articoli a caso sono rumore: la strada è
       scrivere o sparare, e la risposta arriva. */
    const risultati = useMemo(() => {
        if (!voci || natura !== "prodotto" || !q.trim()) return [];
        const v = cerca(voci.filter((x) => x.natura === "prodotto"), q);
        /* CHI CE L'HA IN NEGOZIO VIENE PRIMA (Luca 29/08: «mentre io scrivo lui
           mi dà la disponibilità degli articoli»): a parità di ricerca il pezzo
           che è sullo scaffale conta più di uno che va ordinato. */
        const n = (x: VoceCassa) => x.codice ? (giac.get(x.codice)?.quantita ?? 0) : 0;
        return [...v].sort((a, b) => (n(b) > 0 ? 1 : 0) - (n(a) > 0 ? 1 : 0)).slice(0, 150);
    }, [voci, natura, q, giac]);

    /** Quanti se ne possono ancora vendere: quelli a magazzino MENO quelli
     *  che il venditore ha già messo nel carrello. */
    const quanti = (v: VoceCassa) => {
        if (!v.codice) return null;
        const g = giac.get(v.codice)?.quantita;
        if (g == null) return null;
        return Number(g) - Number(giaInCarrello?.[v.codice] || 0);
    };

    /** In carrello, subito. Il prezzo è quello dell'articolo: si corregge nel
     *  carrello, e solo se l'articolo lo permette. */
    const metti = (v: VoceCassa, extra: Record<string, unknown> = {}) => {
        const n = quanti(v);
        /* SENZA REPARTO NON SI BATTE (revisore 29/08). Il reparto è l'aliquota
           con cui la voce finisce sullo scontrino: senza, il registratore la
           SCARTA. E il caso peggiore non è che non si stampi — è il carrello
           misto: una cover più una SIM senza reparto passavano il pre-check
           («almeno una riga è stampabile»), si incassava il totale intero e
           usciva lo scontrino della sola cover. Corrispettivo incassato e non
           certificato. Meglio dirlo qui, prima che i soldi siano sul banco. */
        if (v.reparto == null && fiscale) {
            setManca({
                titolo: "Manca il reparto IVA",
                nome: v.nome,
                dettaglio: "Questo articolo non ha un reparto IVA assegnato, quindi il registratore di cassa non può stamparlo — e battere l'incasso senza certificarlo non si può fare.",
                cosaFare: "assegnarlo in Amministrazione → Fiscalità → Articoli",
            });
            return;
        }
        /* SE SONO PEZZI, SI SPARA L'IMEI (revisore 29/08). `mag_disponibilita`
           somma le quantità sfuse e i pezzi con seriale: cliccando «ZTE Blade
           A36 — 12 in negozio» dall'elenco entrava una riga SENZA seriale, che
           allo scarico diventa un movimento a quantità su una riga di giacenza
           che per quel codice non esiste (nasce a −1) mentre i 12 IMEI restano
           tutti disponibili, rivendibili. A Donna sono 73 codici / 135 pezzi:
           il primo telefono venduto avrebbe dato l'allarme «sotto zero». */
        const g = v.codice ? giac.get(v.codice) : null;
        if (v.scarica_magazzino && g && (g.pezziAQuantita || 0) <= 0 && (g.pezziConSeriale || 0) > 0) {
            setManca({
                titolo: "Questo si vende col seriale",
                nome: v.nome,
                dettaglio: `Di questo articolo il magazzino tiene ${g.pezziConSeriale} pezzi singoli, ognuno col suo IMEI: si vende il pezzo, non l'articolo. Così si sa quale è uscito.`,
                cosaFare: "spara o scrivi l'IMEI del pezzo che hai in mano",
            });
            return;
        }
        // NON C'È = NON ENTRA. Nessuna eccezione: da qui esce uno scontrino
        // fiscale, e un pezzo che a magazzino non esiste non si può battere.
        if (v.scarica_magazzino && !((n ?? 0) > 0)) {
            const inCarrello = Number(giaInCarrello?.[v.codice || ""] || 0);
            setManca({
                nome: v.nome,
                titolo: senzaMagazzino ? "Il magazzino non è ancora caricato" : undefined,
                cosaFare: senzaMagazzino ? "per ora usa i pulsanti qui sopra" : undefined,
                dettaglio: senzaMagazzino
                    ? `Il magazzino di ${negozio || "questo negozio"} non è ancora stato caricato nel CRM, quindi da qui non si può vendere niente. I pulsanti di selezione rapida qui sopra funzionano come sempre.`
                    : n == null
                    ? `Questo articolo non ha nessuna giacenza nel magazzino di ${negozio || "questo negozio"}: non risulta mai entrato.`
                    : inCarrello > 0
                        ? `Ne hai già ${inCarrello} nel carrello e in magazzino non ce ne sono altri.`
                        : `Nel magazzino di ${negozio || "questo negozio"} non ci sono pezzi da vendere.`,
            });
            return;
        }
        onAdd({
            product: v.nome, productId: v.id,
            price: v.prezzo, importo: v.prezzo, qty: 1,
            margin: null, totalMargin: null, model: null, imei: null,
            venditore, negozio, date: new Date().toISOString().slice(0, 10),
            codice: v.codice, barcode: v.barcode, costo: v.costo,
            natura: v.natura, scaricaMagazzino: v.scarica_magazzino,
            prezzoModificabile: v.prezzo_modificabile,
            reparto: v.reparto, iva: v.iva, famiglia: v.famiglia,
            /* DI CHI È LA MERCE. La verità sta nella giacenza — è chi ha i
               pezzi che li vende — e l'anagrafica fa da ripiego. Da qui la
               società arriva sia allo scarico (che toglie il pezzo
               all'inventario giusto) sia allo scontrino (che lo emette dalla
               società giusta): prima si scaricava sempre Telefutura 1. */
            azienda: (v.codice ? giac.get(v.codice)?.azienda : null) || v.azienda || null,
            // quanto ce n'era QUANDO è stato messo: serve al carrello per dire
            // «questo non ce l'hai» senza rileggere il magazzino a ogni tasto
            giacenzaAllAggiunta: n,
            ...extra,
        });
        setQ(""); ricerca.current?.focus();
    };

    const mettiPezzo = (p: PezzoSeriale) => {
        // il pezzo esiste, ma è di un altro negozio: da qui non si vende.
        // I negozi doppi (Magliana W3/Multi, Acilia, Collatina) condividono il
        // magazzino: lì il pezzo è a casa sua anche col nome diverso.
        if (negozio && p.negozio && !stessoMagazzino(p.negozio, negozio)) {
            setManca({ titolo: "È in un altro negozio", nome: p.nome + " · " + p.seriale, dettaglio: `Questo pezzo si trova a ${p.negozio}, non a ${negozio}.`, cosaFare: "trasferirlo con un DDT, poi rifare la ricerca" });
            return;
        }
        const usato = p.provenienza === "usato";
        /* IL PEZZO DEVE ESSERE ANCORA LÌ. `cassa_seriali` esclude già i
           venduti, ma fra la ricerca e il clic può passare un collega — e un
           pezzo in transito o impegnato per un DDT non è vendibile. */
        if (!usato && p.stato && p.stato !== "disponibile") {
            setManca({ titolo: "Il pezzo non è disponibile", nome: p.nome + " · " + p.seriale, dettaglio: `Questo pezzo risulta «${p.stato}»: o è impegnato per un trasferimento, o qualcuno l'ha appena venduto.`, cosaFare: "controllare la scheda del pezzo in Magazzino" });
            return;
        }
        // senza reparto il registratore lo scarta: vedi metti()
        if (!usato && p.reparto == null && fiscale) {
            setManca({
                titolo: "Manca il reparto IVA",
                nome: p.nome + " · " + p.seriale,
                dettaglio: "Questo pezzo non ha un reparto IVA assegnato — l'articolo non è in anagrafica, oppure non è configurato — quindi il registratore di cassa non può stamparlo.",
                cosaFare: "assegnare il codice articolo e il reparto in Fiscalità → Articoli",
            });
            return;
        }
        onAdd({
            /* L'USATO PRENDE LA FORMA CHE IL CRM CONOSCE GIÀ (revisore 29/08).
               Prima usciva con productId "ser:<imei>" e l'usatoId in cima
               all'oggetto: `scaricaUsatiVenduti` cerca invece
               productId==="vendita_usato" e l'usatoId DENTRO `units`, quindi
               non combaciava niente e il telefono restava «in vendita» per
               sempre — rivendibile da un altro negozio il giorno dopo.
               Usando la forma di sempre si riusa tutto il flusso già provato:
               passaggio a venduto, prezzo, cliente collegato, storico. */
            product: usato ? "Vendita Usato" : p.nome,
            productId: usato ? "vendita_usato" : "ser:" + p.seriale,
            price: p.prezzo, importo: p.prezzo, qty: 1,
            margin: null, totalMargin: null, model: p.nome, imei: p.seriale,
            units: usato ? [{ usatoId: p.riferimento, imei: p.seriale, model: p.nome, prezzo: p.prezzo }] : null,
            venditore, negozio, date: new Date().toISOString().slice(0, 10),
            codice: p.codice, barcode: null, costo: p.costo,
            /* SCARICA ANCHE SENZA CODICE ARTICOLO (revisore 29/08). Prima era
               `!usato && !!p.codice`: i quattro telefoni caricati senza codice
               non scaricavano nulla e non producevano nemmeno la segnalazione.
               Un pezzo con un seriale si marca venduto per il seriale. */
            natura: "prodotto", scaricaMagazzino: !usato,
            prezzoModificabile: p.prezzo_modificabile,
            seriale: p.seriale, provenienzaPezzo: p.provenienza,
            reparto: p.reparto ?? null,
            azienda: p.azienda || null,
            giacenzaAllAggiunta: 1,
        });
        setQ(""); setPezzo(null); ricerca.current?.focus();
    };

    // ── la scelta iniziale: prodotto o servizio ────────────────────────────
    if (!natura) return (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button onClick={() => setNatura("prodotto")} className="rvScelta" style={{ ["--rv-acc" as string]: "var(--tf-8b5cf6)", minWidth: 200 }}>
                <em>📦</em><b>Prodotto</b>
                <span style={{ display: "block", fontSize: 11, color: "var(--tf-8892b0)", marginTop: 3 }}>dal magazzino — codice, barcode o IMEI</span>
            </button>
            <button onClick={() => setNatura("servizio")} className="rvScelta" style={{ ["--rv-acc" as string]: "var(--tf-8b5cf6)", minWidth: 200 }}>
                <em>🔧</em><b>Servizio</b>
                <span style={{ display: "block", fontSize: 11, color: "var(--tf-8892b0)", marginTop: 3 }}>assistenza, backup, riparazione…</span>
            </button>
        </div>
    );

    if (natura === "servizio") return (
        <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <button onClick={() => setNatura(null)} className="rvPill rvPill-sm">← Prodotto o servizio</button>
                <span className="rvLab" style={{ marginBottom: 0 }}>🔧 Servizi</span>
            </div>
            {servizi}
        </div>
    );

    // ── PRODOTTI: la ricerca del magazzino ─────────────────────────────────
    return (
        <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                <button onClick={() => { setNatura(null); setQ(""); }} className="rvPill rvPill-sm">← Prodotto o servizio</button>
                <span className="rvLab" style={{ marginBottom: 0 }}>📦 Prodotti — magazzino di {negozio || "—"}</span>
            </div>

            {/* I GRUPPI A DUE LIVELLI (Luca 29/08): si preme «Accessori» e si
                aprono i pezzi che si vendono davvero. Dentro ogni pulsante c'è
                un articolo VERO, con il suo prezzo e la sua giacenza: se non
                c'è in magazzino il clic dà il pop-up come tutti gli altri. */}
            {gruppi.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                    <div className="rvPillRow" style={{ gap: 6 }}>
                        {gruppi.map((g) => (
                            <button key={g.id} onClick={() => setGruppoAperto(gruppoAperto === g.id ? null : g.id)}
                                className={cn("rvPill", gruppoAperto === g.id && "rvPill-on")}>
                                {g.icona ? g.icona + " " : ""}{g.nome} <span style={{ opacity: .55 }}>{g.voci.length}</span>
                            </button>
                        ))}
                    </div>
                    {gruppoAperto && (() => {
                        const g = gruppi.find((x) => x.id === gruppoAperto);
                        if (!g) return null;
                        return (
                            <div className="rvSub" style={{ marginTop: 8 }}>
                                <div className="rvRapidoG">
                                    {g.voci.map((vc) => {
                                        const art = vc.codice ? (voci || []).find((x) => x.codice === vc.codice) : null;
                                        const n = art ? quanti(art) : null;
                                        const ce = (n ?? 0) > 0;
                                        /* ANCHE QUESTE HANNO LA LORO ICONA (Luca 29/08):
                                           «le SIM le hanno già, per le altre creale».
                                           Un pulsante di solo testo si legge, uno con
                                           l'icona si RICONOSCE — e al banco si va a
                                           colpo d'occhio. L'icona si ricava dal nome
                                           dell'articolo, l'unica cosa che di lui
                                           sappiamo di sicuro. */
                                        const nome = vc.etichetta || art?.nome || vc.codice;
                                        return (
                                            <button key={vc.id} onClick={() => art && metti(art)} disabled={!art}
                                                title={art ? undefined : "articolo non più in anagrafica"}
                                                className={cn("rvRapido", !ce && "rvRapido-off")}>
                                                <em>{iconaArticolo(nome, art?.famiglia, art?.gruppo)}</em>
                                                <b>{nome}</b>
                                                {art?.prezzo != null && <small>{eur(art.prezzo)}</small>}
                                                <i className={cn("rvGiac", ce ? "rvGiac-si" : "rvGiac-no")} style={{ fontSize: 11 }}>
                                                    {n == null ? "—" : ce ? `${n} in negozio` : "non in negozio"}
                                                </i>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })()}
                </div>
            )}

            {senzaMagazzino && (
                <div className="rvNota rvNota-att" style={{ marginBottom: 12 }}>
                    <b>Il magazzino di {negozio || "questo negozio"} non è ancora caricato.</b> La ricerca qui sotto
                    mostra il catalogo dell&apos;azienda, ma senza giacenze non si può vendere da lì:
                    usa i pulsanti di selezione rapida, che funzionano come sempre.
                </div>
            )}

            {/* SELEZIONE RAPIDA: SIM, ESIM e le voci a marginalità */}
            {scorciatoie && <div style={{ marginBottom: 14 }}>{scorciatoie}</div>}

            <input ref={ricerca} value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Spara il codice a barre o l'IMEI, oppure scrivi il nome dell'articolo…"
                className="rvIn" style={{ fontSize: 15.5, padding: "13px 15px" }} />

            {/* il pezzo trovato dal seriale: è QUELLO, non l'articolo generico */}
            {pezzo && (
                <div className="rvBox" style={{ marginTop: 10 }}>
                    <div className="rvBoxT">{pezzo.provenienza === "usato" ? "♻️ Usato in vendita" : "📱 Pezzo a magazzino"}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 800, color: "var(--tf-f8fafc)" }}>{pezzo.nome}</div>
                            <div style={{ fontSize: 11.5, color: "var(--tf-8892b0)", fontFamily: "monospace", marginTop: 2 }}>{pezzo.seriale} · {pezzo.negozio || "—"}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 16, fontWeight: 900, color: "var(--tf-f8fafc)" }}>{eur(pezzo.prezzo)}</div>
                            {pezzo.costo != null && <div className="rvGiac rvGiac-si" style={{ fontSize: 11 }}>margine {eur((pezzo.prezzo || 0) - pezzo.costo)}</div>}
                        </div>
                        <button onClick={() => mettiPezzo(pezzo)} className="rvAzione">+ In carrello</button>
                    </div>
                </div>
            )}

            {/* l'elenco: alto quanto la griglia dei brand, si scorre dentro */}
            <div style={{ marginTop: 12, maxHeight: "46vh", minHeight: 240, overflowY: "auto", paddingRight: 4 }}>
                {voci === null ? <div className="rvVuoto"><b>Carico il magazzino…</b></div>
                    : !q.trim() ? <div className="rvVuoto">🔎<b>Cerca un articolo</b><small>spara il codice a barre o l&apos;IMEI, oppure scrivi il nome</small></div>
                        : risultati.length === 0 ? <div className="rvVuoto">🔍<b>Nessun articolo</b><small>prova con un&apos;altra parola</small></div>
                        : (
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,250px),1fr))", gap: 8 }}>
                                {risultati.map((v) => {
                                    const n = quanti(v);
                                    const pct = marginePct(v.prezzo, v.costo);
                                    const senza = perchéSenzaMargine(v);
                                    const ce = (n ?? 0) > 0;
                                    return (
                                        <button key={v.id} onClick={() => metti(v)} className="rvTessera"
                                            style={{ flexDirection: "column", alignItems: "stretch", gap: 5, minHeight: 78, textAlign: "left", padding: "10px 12px", opacity: ce ? 1 : .72 }}>
                                            <span style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.3 }}>{v.nome}</span>
                                            <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 11 }}>
                                                <b style={{ fontSize: 13.5 }}>{eur(v.prezzo)}</b>
                                                {!senza && <i className={cn("rvMargPct", (pct ?? 0) > 0 ? "rvMargPct-si" : "rvMargPct-no")}>{(pct ?? 0) > 0 ? "+" : ""}{Math.round(pct ?? 0)}%</i>}
                                                <i className={cn("rvGiac", ce ? "rvGiac-si" : "rvGiac-no")} style={{ marginLeft: "auto" }}>
                                                    {ce ? `${n} in negozio` : "non in negozio"}
                                                </i>
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
            </div>

            {/* IN UN PORTAL: le sezioni hanno un backdrop-blur, e un elemento
                a schermo intero reso lì dentro verrebbe ancorato al riquadro
                invece che alla finestra (misurato ieri: 420×130 al posto di
                1200×713). */}
            {manca && typeof document !== "undefined" && createPortal(
                <div className="rvFattaSfondo" onClick={(e) => { if (e.target === e.currentTarget) setManca(null); }}>
                    <div className="rvFatta rvFatta-att">
                        <div className="rvFatta-o rvFatta-att-o">📭</div>
                        <h3>{manca.titolo || "Non è in magazzino"}</h3>
                        <p><b style={{ color: "var(--tf-e2e8f0)" }}>{manca.nome}</b><br />{manca.dettaglio}</p>
                        <div className="rvFatta-d" style={{ textAlign: "left" }}>
                            <div><span>Cosa fare</span><span style={{ fontWeight: 600, textAlign: "right" }}>{manca.cosaFare || "caricarlo a magazzino, poi rifare la ricerca"}</span></div>
                        </div>
                        <button onClick={() => { setManca(null); setQ(""); ricerca.current?.focus(); }} className="rvAzione" style={{ width: "100%" }}>Ho capito</button>
                    </div>
                </div>, document.body)}
        </div>
    );
}
