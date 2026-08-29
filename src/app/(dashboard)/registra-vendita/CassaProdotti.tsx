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
    caricaCatalogo, caricaGiacenze, famiglieDi, cerca, cercaSeriale, sembraSeriale,
    marginePct, perchéSenzaMargine,
    type VoceCassa, type NaturaCassa, type Giacenza, type PezzoSeriale,
} from "@/lib/cassaCatalogo";
import { stessoMagazzino } from "@/lib/negoziNomi";

const eur = (n: number | null | undefined) =>
    n == null ? "—" : "€ " + Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function CassaProdotti({ negozio, venditore, onAdd, servizi }: {
    negozio?: string; venditore?: string;
    onAdd: (r: Record<string, unknown>) => void;
    /** i pulsanti dei servizi che esistono già: restano quelli */
    servizi?: React.ReactNode;
}) {
    const [natura, setNatura] = useState<NaturaCassa | null>(null);
    const [voci, setVoci] = useState<VoceCassa[] | null>(null);
    const [giac, setGiac] = useState<Map<string, Giacenza>>(new Map());
    const [q, setQ] = useState("");
    const [famiglia, setFamiglia] = useState<string | null>(null);
    const [pezzo, setPezzo] = useState<PezzoSeriale | null>(null);
    /* IL PEZZO CHE NON C'È (Luca 29/08, correzione secca): «se il prodotto
       non c'è in magazzino non deve andare nemmeno nel carrello, deve darmi un
       pop up che mi dice che il prodotto non è presente in magazzino».
       Il carrello è la base dello scontrino fiscale: se ci entra qualcosa che
       a magazzino non esiste, il conto non torna già in partenza. */
    const [manca, setManca] = useState<{ nome: string; dettaglio: string } | null>(null);
    const ricerca = useRef<HTMLInputElement | null>(null);

    useEffect(() => { caricaCatalogo().then(setVoci); }, []);
    useEffect(() => { if (negozio) caricaGiacenze(negozio).then(setGiac); }, [negozio]);
    useEffect(() => { if (natura === "prodotto") setTimeout(() => ricerca.current?.focus(), 60); }, [natura]);

    /* IL SERIALE. Un IMEI ha 15 cifre, un ICCID 19: quando quello che si è
       digitato ha quella forma si va a cercare IL pezzo, non l'articolo. */
    useEffect(() => {
        setPezzo(null);
        if (natura !== "prodotto" || !sembraSeriale(q)) return;
        let vivo = true;
        const s = q.replace(/\D/g, "");
        cercaSeriale(s).then((p) => {
            if (!vivo) return;
            if (p) setPezzo(p);
            else setManca({ nome: "Seriale " + s, dettaglio: "Questo seriale non risulta a magazzino né fra gli usati in vendita. Se il telefono è qui davanti a te va prima caricato: finché non c'è, non può essere venduto." });
        });
        return () => { vivo = false; };
    }, [q, natura]);

    const famiglie = useMemo(() => voci ? famiglieDi(voci, "prodotto") : [], [voci]);
    const risultati = useMemo(() => {
        if (!voci || natura !== "prodotto") return [];
        let v = voci.filter((x) => x.natura === "prodotto");
        if (famiglia) v = v.filter((x) => x.famiglia === famiglia);
        if (q.trim()) v = cerca(v, q);
        /* CHI CE L'HA IN NEGOZIO VIENE PRIMA (Luca 29/08: «mentre io scrivo lui
           mi dà la disponibilità degli articoli»): a parità di ricerca il pezzo
           che è sullo scaffale conta più di uno che va ordinato. */
        const n = (x: VoceCassa) => x.codice ? (giac.get(x.codice)?.quantita ?? 0) : 0;
        return [...v].sort((a, b) => (n(b) > 0 ? 1 : 0) - (n(a) > 0 ? 1 : 0)).slice(0, 150);
    }, [voci, natura, famiglia, q, giac]);

    const quanti = (v: VoceCassa) => v.codice ? (giac.get(v.codice)?.quantita ?? null) : null;

    /** In carrello, subito. Il prezzo è quello dell'articolo: si corregge nel
     *  carrello, e solo se l'articolo lo permette. */
    const metti = (v: VoceCassa, extra: Record<string, unknown> = {}) => {
        const n = quanti(v);
        // NON C'È = NON ENTRA. Nessuna eccezione: da qui esce uno scontrino
        // fiscale, e un pezzo che a magazzino non esiste non si può battere.
        if (v.scarica_magazzino && !((n ?? 0) > 0)) {
            setManca({
                nome: v.nome,
                dettaglio: n == null
                    ? `Questo articolo non ha nessuna giacenza nel magazzino di ${negozio || "questo negozio"}: non risulta mai entrato.`
                    : `Nel magazzino di ${negozio || "questo negozio"} la giacenza è ${n}. Non ci sono pezzi da vendere.`,
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
            setManca({ nome: p.nome + " · " + p.seriale, dettaglio: `Questo pezzo si trova a ${p.negozio}, non a ${negozio}. Va prima trasferito con un DDT: da qui non si può vendere.` });
            return;
        }
        onAdd({
            product: p.nome, productId: "ser:" + p.seriale,
            price: p.prezzo, importo: p.prezzo, qty: 1,
            margin: null, totalMargin: null, model: p.nome, imei: p.seriale,
            venditore, negozio, date: new Date().toISOString().slice(0, 10),
            codice: p.codice, barcode: null, costo: p.costo,
            natura: "prodotto", scaricaMagazzino: p.provenienza === "nuovo",
            prezzoModificabile: p.prezzo_modificabile,
            seriale: p.seriale, provenienzaPezzo: p.provenienza,
            usatoId: p.provenienza === "usato" ? p.riferimento : null,
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
    const senzaMagazzino = giac.size === 0;
    return (
        <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                <button onClick={() => { setNatura(null); setQ(""); setFamiglia(null); }} className="rvPill rvPill-sm">← Prodotto o servizio</button>
                <span className="rvLab" style={{ marginBottom: 0 }}>📦 Prodotti — magazzino di {negozio || "—"}</span>
            </div>

            <input ref={ricerca} value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Spara il codice a barre o l'IMEI, oppure scrivi il nome dell'articolo…"
                className="rvIn" style={{ fontSize: 15.5, padding: "13px 15px" }} />

            {senzaMagazzino && (
                <div className="rvNota rvNota-att">
                    <div className="rvNota-t">📭 Il magazzino di questo negozio è ancora vuoto</div>
                    <div className="rvNota-s">Gli articoli si trovano lo stesso, ma finché non c&apos;è la giacenza risultano tutti «non in negozio» e lo scontrino non parte.</div>
                </div>
            )}

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
                            {pezzo.costo != null && <div style={{ fontSize: 11, color: "var(--tf-34d399)", fontWeight: 700 }}>margine {eur((pezzo.prezzo || 0) - pezzo.costo)}</div>}
                        </div>
                        <button onClick={() => mettiPezzo(pezzo)} className="rvAzione">+ In carrello</button>
                    </div>
                </div>
            )}

            {/* i filtri rapidi */}
            {famiglie.length > 1 && (
                <div className="rvPillRow" style={{ gap: 6, marginTop: 12 }}>
                    <button onClick={() => setFamiglia(null)} className={cn("rvPill", "rvPill-sm", !famiglia && "rvPill-on")}>Tutti</button>
                    {famiglie.slice(0, 18).map((f) => (
                        <button key={f.nome} onClick={() => setFamiglia(famiglia === f.nome ? null : f.nome)}
                            className={cn("rvPill", "rvPill-sm", famiglia === f.nome && "rvPill-on")}>
                            {f.nome} <span style={{ opacity: .55 }}>{f.n}</span>
                        </button>
                    ))}
                </div>
            )}

            {/* l'elenco: alto quanto la griglia dei brand, si scorre dentro */}
            <div style={{ marginTop: 12, maxHeight: "46vh", minHeight: 240, overflowY: "auto", paddingRight: 4 }}>
                {voci === null ? <div className="rvVuoto"><b>Carico il magazzino…</b></div>
                    : risultati.length === 0 ? <div className="rvVuoto">🔍<b>Nessun articolo</b><small>prova con un&apos;altra parola o togli il filtro</small></div>
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
                                                {!senza && <i style={{ fontStyle: "normal", fontWeight: 800, color: (pct ?? 0) > 0 ? "var(--tf-34d399)" : "var(--tf-f87171)" }}>{(pct ?? 0) > 0 ? "+" : ""}{Math.round(pct ?? 0)}%</i>}
                                                <i style={{ fontStyle: "normal", marginLeft: "auto", fontWeight: 800, color: ce ? "var(--tf-34d399)" : "var(--tf-fbbf24)" }}>
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
                    <div className="rvFatta" style={{ borderColor: "rgba(245,158,11,.45)" }}>
                        <div className="rvFatta-o" style={{ color: "var(--tf-fbbf24)", background: "rgba(245,158,11,.14)", borderColor: "rgba(245,158,11,.5)" }}>📭</div>
                        <h3>Non è in magazzino</h3>
                        <p><b style={{ color: "var(--tf-e2e8f0)" }}>{manca.nome}</b><br />{manca.dettaglio}</p>
                        <div className="rvFatta-d" style={{ textAlign: "left" }}>
                            <div><span>Cosa fare</span><span style={{ fontWeight: 600, textAlign: "right" }}>caricarlo a magazzino, poi rifare la ricerca</span></div>
                        </div>
                        <button onClick={() => { setManca(null); setQ(""); ricerca.current?.focus(); }} className="rvAzione" style={{ width: "100%" }}>Ho capito</button>
                    </div>
                </div>, document.body)}
        </div>
    );
}
