"use client";

/* ═══ PAYSTORE — LE RICARICHE TELEFONICHE ═══════════════════════════════════
   Luca 01/09: «creiamo il brand PayStore, associandolo al reparto 1 della
   cassa per emettere scontrini esente IVA. Ora aggiungiamo solo il brand per
   fare gli scontrini; da domani aggiungiamo l'API, e con l'API collegata —
   una volta che il cliente ha pagato — dobbiamo usarla per far partire
   davvero la ricarica.»

   Tre passi e basta: OPERATORE → TAGLIO → NUMERO. Poi la ricarica entra nel
   carrello come qualunque altra riga, e da lì è il percorso di sempre:
   Incasso & Scontrino, con la riga sul reparto esente.

   ⚠️ IL NUMERO È OBBLIGATORIO, e non è un capriccio del modulo. Oggi la
   ricarica la fa l'operatore a mano sul terminale del fornitore, e il numero
   serve a lui; da domani lo prenderà l'API, e una riga incassata senza numero
   sarebbe una ricarica che nessuno può eseguire e che il cliente ha già
   pagato. Per questo la voce di catalogo è `mostra_in_cassa = false`: non si
   può vendere una ricarica dal listino, dove il numero non si chiede.

   ⚠️ IL REPARTO NON LO DECIDE QUESTO FILE. Lo porta la voce di `marg_items`
   agganciata all'operatore (`paystore_operatore`), che l'API dello scontrino
   legge come fonte autoritativa. Se la voce manca, l'operatore qui risulta
   NON VENDIBILE e lo si dice subito: meglio un rifiuto in faccia adesso che
   un rifiuto del registratore a cliente davanti. */

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";

/* I diciotto operatori ricaricabili. `logo` è il file in /public: dove manca,
   si mostra il nome — un riquadro vuoto sarebbe peggio di una scritta.

   ⚠️ `zoom`: i PNG hanno margini trasparenti molto diversi fra loro — il
   WindTre e l'Iliad sono per metà vuoto, il Fastweb è quasi pieno. Senza
   correzione le scritte escono di grandezze diverse e la fila sembra fatta
   male. È la stessa taratura che la griglia dei marchi ha già. */
export const OPERATORI_PAYSTORE: { id: string; label: string; logo?: string; zoom?: number }[] = [
    { id: "tim", label: "TIM", logo: "/op-tim.png" },
    { id: "vodafone", label: "Vodafone", logo: "/op-vodafone.png" },
    { zoom: 2.4, id: "windtre", label: "WindTre", logo: "/op-windtre.png" },
    { zoom: 1.6, id: "iliad", label: "Iliad", logo: "/op-iliad.png" },
    { id: "fastweb", label: "Fastweb Mobile", logo: "/op-fastweb.png" },
    { zoom: 2.1, id: "ho", label: "ho. Mobile", logo: "/op-ho.png" },
    { zoom: 1.15, id: "very", label: "Very Mobile", logo: "/op-very.png" },
    { zoom: 1.15, id: "kena", label: "Kena Mobile", logo: "/op-kena.png" },
    { id: "poste", label: "PosteMobile", logo: "/op-poste.png" },
    { zoom: 1.8, id: "coopvoce", label: "CoopVoce", logo: "/op-coopvoce.png" },
    { zoom: 1.2, id: "lyca", label: "Lycamobile", logo: "/op-lyca.png" },
    { id: "spusu", label: "Spusu", logo: "/op-spusu.png" },
    { zoom: 1.15, id: "tiscali", label: "Tiscali Mobile", logo: "/op-tiscali.png" },
    { id: "unomobile", label: "1Mobile" },
    { id: "digi", label: "Digi Mobil" },
    { id: "optima", label: "Optima Mobile" },
    { id: "withu", label: "WithU Mobile" },
    { id: "daily", label: "Daily Telecom" },
];

type Taglio = { operatore: string; etichetta: string; valore: number };
type Voce = { id: string; paystore_operatore: string; name: string; margin_percent: number | null; reparto: number | null; azienda: string | null };

const eur = (n: number) => "€ " + (Number(n) || 0).toFixed(2).replace(".", ",");

/** La descrizione che finisce sullo scontrino. Il registratore taglia a 38
 *  caratteri: il taglio e il numero devono starci entrambi, perché è con
 *  quelli che un cliente contesta una ricarica sbagliata. */
export function descrizioneRicarica(etichetta: string, numero: string): string {
    const base = etichetta.toUpperCase().replace(/\s+/g, " ").trim();
    const coda = " " + numero;
    return (base.slice(0, Math.max(0, 38 - coda.length)) + coda).slice(0, 38);
}

export default function PayStore({
    venditore, negozio, onAdd, onIndietro, righeInCarrello,
}: {
    venditore: string; negozio: string;
    onAdd: (voce: Record<string, unknown>) => void;
    onIndietro: () => void;
    righeInCarrello: number;
}) {
    const [tagli, setTagli] = useState<Taglio[] | null>(null);
    const [voci, setVoci] = useState<Record<string, Voce>>({});
    const [errore, setErrore] = useState<string | null>(null);
    const [op, setOp] = useState<string | null>(null);
    const [scelto, setScelto] = useState<Taglio | null>(null);
    const [libero, setLibero] = useState("");
    const [num, setNum] = useState("");
    const [fatto, setFatto] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            const [t, v] = await Promise.all([
                supabase.from("paystore_tagli").select("operatore, etichetta, valore").eq("attivo", true).order("ordine"),
                supabase.from("marg_items").select("id, paystore_operatore, name, margin_percent, reparto, azienda")
                    .eq("brand", "PayStore").eq("active", true).not("paystore_operatore", "is", null),
            ]);
            if (t.error || v.error) { setErrore((t.error || v.error)?.message || "errore"); setTagli([]); return; }
            setTagli((t.data || []).map((r) => ({ ...r, valore: Number(r.valore) })) as Taglio[]);
            const m: Record<string, Voce> = {};
            (v.data || []).forEach((r) => { m[String(r.paystore_operatore)] = r as Voce; });
            setVoci(m);
        })();
    }, []);

    const opObj = OPERATORI_PAYSTORE.find((o) => o.id === op) || null;
    const voce = op ? voci[op] : null;
    const listino = useMemo(() => (tagli || []).filter((t) => t.operatore === op), [tagli, op]);
    const importo = scelto ? scelto.valore : Number(String(libero).replace(",", ".")) || 0;
    const etichetta = scelto ? scelto.etichetta : (opObj ? `${opObj.label} ${importo} euro` : "");
    const cifre = String(num).replace(/\D/g, "");
    // la stessa regola dei numeri del CRM: 7–11 cifre
    const numOk = cifre.length >= 7 && cifre.length <= 11;
    const pronto = !!op && !!voce && importo > 0 && numOk;

    const salva = () => {
        if (!pronto || !voce || !opObj) return;
        const pct = Number(voce.margin_percent || 0);
        const margine = (importo * pct) / 100;
        onAdd({
            product: descrizioneRicarica(etichetta, cifre),
            /* ⚠️ `mi_<id>`: è così che l'API dello scontrino risale alla voce e
               quindi al reparto 1. Senza, la riga finisce fra le escluse e il
               registratore rifiuta tutto lo scontrino. */
            productId: "mi_" + voce.id,
            price: importo, importo, qty: 1,
            margin: margine, totalMargin: margine,
            venditore, negozio, date: new Date().toISOString().slice(0, 10),
            reparto: voce.reparto ?? 1,
            azienda: voce.azienda ?? null,
            linked: false, priceRequired: false,
            codice: null, scaricaMagazzino: false,
            model: null, imei: null,
            /* quello che serve a far partire la ricarica: oggi lo legge una
               persona, da domani l'API. Viaggia con la riga fino al
               salvataggio, che lo scrive in `paystore_ricariche`. */
            paystore: { operatore: op, operatoreNome: opObj.label, numero: cifre, taglio: etichetta, importo },
        });
        setFatto("🛒 " + etichetta + " · " + cifre + " — in carrello");
        setTimeout(() => setFatto(null), 3500);
        setOp(null); setScelto(null); setLibero(""); setNum("");
    };

    return (
        <div className="psRoot">
            {fatto && <div className="rvEsito rvEsito-ok psAvviso">{fatto}</div>}
            {errore && <div className="rvEsito rvEsito-no psAvviso">Catalogo ricariche non letto: {errore}</div>}

            {/* ── 1 · OPERATORE ─────────────────────────────────────────── */}
            <div className="rvCat psPasso">
                <div className="rvCatT"><b>1 · Operatore da ricaricare</b></div>
                <div className="psGriglia">
                    {OPERATORI_PAYSTORE.map((o) => {
                        const vendibile = !!voci[o.id];
                        return (
                            <button key={o.id} type="button" title={vendibile ? o.label : `${o.label}: manca la voce a catalogo, non è vendibile`}
                                onClick={() => { if (!vendibile) return; setOp(o.id); setScelto(null); setLibero(""); }}
                                className={"rvTessera psOp" + (op === o.id ? " rvTessera-on" : "") + (vendibile ? "" : " psOp-no")}>
                                {o.logo
                                    ? <Image src={o.logo} alt={o.label} width={150} height={40} className={o.zoom ? "psZoom" + String(o.zoom).replace(".", "") : ""} />
                                    : <span>{o.label}</span>}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── 2 · TAGLIO ────────────────────────────────────────────── */}
            {op && (
                <div className="rvCat psPasso">
                    <div className="rvCatT"><b>2 · Taglio{listino.length ? ` · listino ${opObj?.label}` : ""}</b></div>
                    {listino.length > 0 ? (
                        <div className="psGriglia psGriglia-t">
                            {listino.map((t) => (
                                <button key={t.etichetta} type="button" onClick={() => { setScelto(t); setLibero(""); }}
                                    className={"rvTessera psTaglio" + (scelto?.etichetta === t.etichetta ? " rvTessera-on" : "")}>
                                    <b>{t.valore} €</b>
                                    <i>{t.etichetta}</i>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div>
                            <div className="rvLab">Importo</div>
                            <input className="rvIn psLibero" placeholder="€" inputMode="decimal"
                                value={libero} onChange={(e) => { setLibero(e.target.value.replace(/[^0-9,.]/g, "")); setScelto(null); }} />
                            <div className="rvNota rvNota-info">
                                <div className="rvNota-t">⚠ Listino non ancora censito per {opObj?.label}</div>
                                <div className="rvNota-s">L&apos;importo si scrive a mano. Con l&apos;API i tagli arriveranno da soli, per tutti gli operatori.</div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── 3 · NUMERO ────────────────────────────────────────────── */}
            {op && importo > 0 && (
                <div className="rvCat psPasso">
                    <div className="rvCatT"><b>3 · Numero da ricaricare</b></div>
                    <input className="rvIn psNum" placeholder="3XXXXXXXXX" inputMode="numeric" autoComplete="off"
                        value={num} onChange={(e) => setNum(e.target.value.replace(/\D/g, "").slice(0, 11))} />
                    <div className={"rvEsito psEsito " + (cifre.length === 0 ? "" : numOk ? "rvEsito-ok" : "rvEsito-no")}>
                        {cifre.length === 0 ? "Da 7 a 11 cifre" : numOk ? `✓ ${cifre.length} cifre` : `${cifre.length} cifre — ne servono almeno 7`}
                    </div>
                </div>
            )}

            {/* ── SALVA ─────────────────────────────────────────────────── */}
            {pronto && (
                <div className="rvCat psPasso psPronta">
                    <div className="psPronto">
                        <div>
                            <b>{etichetta} · {eur(importo)}</b>
                            <i>{cifre}</i>
                        </div>
                        <button type="button" className="rvAzione rvAzione-att" onClick={salva}>💾 Salva ricarica</button>
                    </div>
                </div>
            )}

            <div className="psFila">
                <button type="button" className="rvAzione rvAzione-sm psIndietro" onClick={onIndietro}>
                    ← Altro brand
                </button>
                {righeInCarrello > 0 && (
                    <span className="rvBadge rvBadge-acc">
                        {righeInCarrello} ricaric{righeInCarrello === 1 ? "a" : "he"} in carrello
                    </span>
                )}
            </div>
        </div>
    );
}
