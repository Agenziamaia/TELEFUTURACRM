"use client";
/* ═══════════════════════════════════════════════════════════════════════════
   LA CASSA — prodotti e servizi (Luca 28/08 notte)

   Sostituisce la scelta «marginalità», che era un listino di REGOLE scritte a
   mano (Accessori = 24,59%, PLX = 8 € fissi). Lì il margine era una stima
   sempre uguale; qui è un numero: prezzo di vendita meno costo d'acquisto,
   preso dall'articolo vero.

   Due schede, come le vuole Luca:
     📦 PRODOTTI — hanno una giacenza, venderli scarica il magazzino
     🔧 SERVIZI  — assistenza, backup: prezzo e margine, niente da scaricare
   e dentro ciascuna i filtri rapidi, che sono le famiglie del catalogo.

   Le SIM, le sostituzioni e i gettoni degli operatori NON sono qui apposta:
   li mette il CRM da sé quando registri la vendita del brand. Il venditore
   non deve cercarli — se li ritrova nel carrello.

   La riga che esce ha la STESSA forma di prima (product, price, qty,
   margin…), con in più `codice`, `costo` e `natura`: così il carrello, lo
   scontrino fiscale e il salvataggio continuano a funzionare come sempre, e
   in più sanno cosa scaricare dal magazzino.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/utils";
import {
    caricaCatalogo, caricaGiacenze, famiglieDi, cerca,
    margineEuro, marginePct, perchéSenzaMargine,
    type VoceCassa, type NaturaCassa, type Giacenza,
} from "@/lib/cassaCatalogo";

const eur = (n: number | null | undefined) =>
    n == null ? "—" : "€ " + Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function CassaProdotti({ negozio, venditore, onAdd, onClose }: {
    negozio?: string; venditore?: string;
    onAdd: (r: Record<string, unknown>) => void;
    onClose?: () => void;
}) {
    const [voci, setVoci] = useState<VoceCassa[] | null>(null);
    const [giac, setGiac] = useState<Map<string, Giacenza>>(new Map());
    const [natura, setNatura] = useState<NaturaCassa>("prodotto");
    const [famiglia, setFamiglia] = useState<string | null>(null);
    const [q, setQ] = useState("");
    const [scelta, setScelta] = useState<VoceCassa | null>(null);
    const [prezzo, setPrezzo] = useState("");
    const [qta, setQta] = useState("1");
    const ricercaRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => { caricaCatalogo().then(setVoci); }, []);
    useEffect(() => { if (negozio) caricaGiacenze(negozio).then(setGiac); }, [negozio]);
    // la cassa si usa con le mani sulla tastiera (o col lettore di codici):
    // il cursore parte nella ricerca, e ci torna dopo ogni aggiunta
    useEffect(() => { ricercaRef.current?.focus(); }, [natura]);

    const famiglie = useMemo(() => voci ? famiglieDi(voci, natura) : [], [voci, natura]);
    const risultati = useMemo(() => {
        if (!voci) return [];
        let v = voci.filter((x) => x.natura === natura);
        if (famiglia) v = v.filter((x) => x.famiglia === famiglia);
        v = cerca(v, q);
        // senza ricerca non si scaricano 2.200 righe addosso a nessuno
        return q.trim() || famiglia ? v.slice(0, 120) : v.slice(0, 60);
    }, [voci, natura, famiglia, q]);

    const quanti = (v: VoceCassa) => v.codice ? (giac.get(v.codice)?.quantita ?? null) : null;

    const apri = (v: VoceCassa) => {
        setScelta(v);
        setPrezzo(v.prezzo != null ? String(v.prezzo) : "");
        setQta("1");
    };

    const aggiungi = () => {
        if (!scelta) return;
        const p = parseFloat(String(prezzo).replace(",", "."));
        if (!(p >= 0)) return;
        const n = Math.max(1, parseInt(qta) || 1);
        const marg = margineEuro(p, scelta.costo, 1);
        onAdd({
            // ── la forma di sempre: carrello, scontrino e salvataggio non cambiano
            product: scelta.nome,
            productId: scelta.id,
            price: p,
            importo: p,
            qty: n,
            margin: marg,
            totalMargin: marg == null ? null : marg * n,
            model: null, imei: null,
            venditore, negozio, date: new Date().toISOString().slice(0, 10),
            // ── quello che prima non c'era: da qui nasce lo scarico
            codice: scelta.codice,
            barcode: scelta.barcode,
            costo: scelta.costo,
            natura: scelta.natura,
            scaricaMagazzino: scelta.scarica_magazzino,
            reparto: scelta.reparto,
            iva: scelta.iva,
            famiglia: scelta.famiglia,
        });
        setScelta(null); setQ(""); ricercaRef.current?.focus();
    };

    const margLive = scelta ? margineEuro(parseFloat(String(prezzo).replace(",", ".")), scelta.costo, 1) : null;
    const pctLive = scelta ? marginePct(parseFloat(String(prezzo).replace(",", ".")), scelta.costo) : null;

    return (
        <div className="rvCard" style={{ borderLeft: "4px solid #7c3aed", ["--rv-acc" as string]: "var(--tf-8b5cf6)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                <div className="rvCardT" style={{ marginBottom: 0 }}>🧾 Cassa — prodotti e servizi</div>
                {onClose && <button onClick={onClose} className="rvPill rvPill-sm">✕ Chiudi</button>}
            </div>

            {/* le due nature */}
            <div className="rvPillRow" style={{ marginBottom: 12 }}>
                {([["prodotto", "📦 Prodotti"], ["servizio", "🔧 Servizi"]] as const).map(([k, l]) => (
                    <button key={k} onClick={() => { setNatura(k); setFamiglia(null); setQ(""); }}
                        className={cn("rvPill", natura === k && "rvPill-on")}>{l}</button>
                ))}
            </div>

            {/* la ricerca: ci si scrive o ci si spara dentro un codice a barre */}
            <input ref={ricercaRef} value={q} onChange={(e) => setQ(e.target.value)}
                placeholder={natura === "prodotto" ? "Cerca o spara il codice a barre…" : "Cerca un servizio…"}
                className="rvIn" style={{ marginBottom: 10 }} />

            {/* i filtri rapidi */}
            {famiglie.length > 1 && (
                <div className="rvPillRow" style={{ gap: 6, marginBottom: 12, maxHeight: 92, overflowY: "auto" }}>
                    <button onClick={() => setFamiglia(null)} className={cn("rvPill", "rvPill-sm", !famiglia && "rvPill-on")}>Tutti</button>
                    {famiglie.slice(0, 24).map((f) => (
                        <button key={f.nome} onClick={() => setFamiglia(famiglia === f.nome ? null : f.nome)}
                            className={cn("rvPill", "rvPill-sm", famiglia === f.nome && "rvPill-on")}>
                            {f.nome} <span style={{ opacity: .6 }}>{f.n}</span>
                        </button>
                    ))}
                </div>
            )}

            {voci === null ? (
                <div className="rvVuoto"><b>Carico il catalogo…</b></div>
            ) : risultati.length === 0 ? (
                <div className="rvVuoto">🔍<b>Nessun articolo</b><small>prova con un'altra parola o togli il filtro</small></div>
            ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,230px),1fr))", gap: 8 }}>
                    {risultati.map((v) => {
                        const n = quanti(v);
                        const pct = marginePct(v.prezzo, v.costo);
                        const senza = perchéSenzaMargine(v);
                        return (
                            <button key={v.id} onClick={() => apri(v)} className="rvTessera"
                                style={{ flexDirection: "column", alignItems: "stretch", gap: 4, minHeight: 82, textAlign: "left", padding: "10px 12px" }}>
                                <span style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.3 }}>{v.nome}</span>
                                <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 11 }}>
                                    <b style={{ fontSize: 13 }}>{eur(v.prezzo)}</b>
                                    {senza
                                        ? <i style={{ fontStyle: "normal", color: "var(--tf-8892b0)" }}>margine ignoto</i>
                                        : <i style={{ fontStyle: "normal", color: (pct ?? 0) > 0 ? "var(--tf-34d399)" : "var(--tf-f87171)", fontWeight: 800 }}>
                                            {(pct ?? 0) > 0 ? "+" : ""}{Math.round(pct ?? 0)}%
                                        </i>}
                                    {v.scarica_magazzino && (
                                        <i style={{ fontStyle: "normal", marginLeft: "auto", fontWeight: 800, color: n == null ? "var(--tf-64748b)" : n > 0 ? "var(--tf-34d399)" : "var(--tf-fbbf24)" }}>
                                            {n == null ? "giacenza ignota" : n > 0 ? `${n} in negozio` : "esaurito"}
                                        </i>
                                    )}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* il pannello della riga scelta */}
            {scelta && (
                <div className="rvBox" style={{ marginTop: 12 }}>
                    <div className="rvBoxT">{scelta.nome}</div>
                    <div className="rvG3">
                        <div><div className="rvLab">Prezzo di vendita *</div>
                            <input value={prezzo} onChange={(e) => setPrezzo(e.target.value)} className="rvIn" inputMode="decimal" autoFocus /></div>
                        <div><div className="rvLab">Quantità</div>
                            <input value={qta} onChange={(e) => setQta(e.target.value.replace(/\D/g, ""))} className="rvIn" inputMode="numeric" /></div>
                        <div><div className="rvLab">Costo d&apos;acquisto</div>
                            <input value={scelta.costo != null ? eur(scelta.costo) : "non a listino"} readOnly className="rvIn rvIn-lock" /></div>
                    </div>
                    <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        {margLive == null
                            ? <span className="rvEsito rvEsito-no" style={{ marginTop: 0 }}>⚠ {perchéSenzaMargine(scelta)}: il margine di questa riga non si può calcolare</span>
                            : <span className={cn("rvEsito", margLive > 0 ? "rvEsito-ok" : "rvEsito-no")} style={{ marginTop: 0 }}>
                                {margLive > 0 ? "Guadagno" : "PERDITA"} {eur(Math.abs(margLive) * (parseInt(qta) || 1))}
                                {pctLive != null && ` · ${Math.round(pctLive)}% sul prezzo`}
                            </span>}
                        <button onClick={aggiungi} className="rvAzione" style={{ marginLeft: "auto" }}>+ Aggiungi al carrello</button>
                        <button onClick={() => setScelta(null)} className="rvPill">Annulla</button>
                    </div>
                </div>
            )}
        </div>
    );
}
