"use client";

/* ═══ PAYSTORE — LE RICARICHE TELEFONICHE ═══════════════════════════════════
   Luca 01/09: «creiamo il brand PayStore, associandolo al reparto 1 della
   cassa per emettere scontrini esente IVA. Ora aggiungiamo solo il brand per
   fare gli scontrini; da domani aggiungiamo l'API, e con l'API collegata —
   una volta che il cliente ha pagato — dobbiamo usarla per far partire
   davvero la ricarica.»

   Qui vivono DUE cose, e servono a due strade diverse:
   • il PANNELLO (questa pagina): le ricariche «sciolte», quelle senza nessuna
     attivazione. Operatore → importo → numero, e la riga va in carrello.
   • il COMPOSITORE (`CompositoreTagli`, esportato): lo usa anche il carrello,
     sulle ricariche che il CRM associa da sé alla SIM appena venduta.

   ⚠️ L'IMPORTO SI COMPONE COI TAGLI, non si scrive. PayStore vende tagli
   fissi: per fare 40 € si fanno due ricariche da 20, non una da 40 che non
   esiste. Luca 01/09: «devi trovare un modo per far sì che quando vado a
   selezionare l'importo posso scegliere tra i vari tagli, selezionandone
   anche più di 1 per ogni singolo taglio». Quindi ogni clic aggiunge una
   unità, e il totale è la somma. Sullo scontrino esce una riga sola (è una
   sola operazione esente per il cliente); nel registro delle ricariche ne
   escono DUE, perché due sono le operazioni che il fornitore deve eseguire.

   ⚠️ IL NUMERO È OBBLIGATORIO. Oggi la ricarica la fa una persona sul
   terminale del fornitore e il numero serve a lei; da domani lo prenderà
   l'API, e una riga incassata senza numero sarebbe una ricarica che nessuno
   può eseguire e che il cliente ha già pagato.

   ⚠️ IL REPARTO NON LO DECIDE QUESTO FILE. Lo porta la voce di `marg_items`
   agganciata all'operatore (`paystore_operatore`), che l'API dello scontrino
   legge come fonte autoritativa. Se la voce manca, l'operatore risulta NON
   VENDIBILE e lo si dice subito: meglio un rifiuto adesso che un rifiuto del
   registratore a cliente davanti. */

import { useCallback, useEffect, useMemo, useState } from "react";
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

/** Il brand di una vendita → l'operatore da ricaricare. Solo per le tre reti
 *  che vendiamo con la SIM in mano; gli altri si ricaricano solo «sciolti». */
export const OPERATORE_DEL_BRAND: Record<string, string> = {
    windtre: "windtre", vodafone: "vodafone", fastweb: "fastweb",
    tim: "tim", very: "very", ho: "ho", kena: "kena", iliad: "iliad",
};

export type Taglio = { operatore: string; etichetta: string; valore: number };
export type VocePayStore = { id: string; paystore_operatore: string; name: string; margin_percent: number | null; reparto: number | null; azienda: string | null };
/** Un pezzo di composizione: quel taglio, preso n volte. */
export type PezzoRicarica = { etichetta: string; valore: number; n: number };

export const nomeOperatore = (id: string) => OPERATORI_PAYSTORE.find((o) => o.id === id)?.label || id;
const eur = (n: number) => "€ " + (Number(n) || 0).toFixed(2).replace(".", ",");
export const totaleComposto = (pezzi: PezzoRicarica[]) => (pezzi || []).reduce((s, p) => s + p.valore * p.n, 0);
/** Quante ricariche vere sono: è il numero di operazioni che il fornitore dovrà fare. */
export const quanteRicariche = (pezzi: PezzoRicarica[]) => (pezzi || []).reduce((s, p) => s + p.n, 0);

/** La descrizione che finisce sullo scontrino. Il registratore taglia a 38
 *  caratteri: il totale e il numero devono starci entrambi, perché è con
 *  quelli che un cliente contesta una ricarica sbagliata. */
export function descrizioneRicarica(operatore: string, importo: number, numero: string): string {
    /* ⚠️ LA VIRGOLA, non il punto: sullo scontrino di un negozio italiano
       «12.5» si legge male e sembra un codice. I tagli a listino sono interi,
       ma l'importo libero degli operatori senza listino no. */
    const n = Math.round(Number(importo) * 100) / 100;
    const cifra = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ",");
    const base = ("RICARICA " + nomeOperatore(operatore) + " " + cifra).toUpperCase();
    const coda = " " + numero;
    return (base.slice(0, Math.max(0, 38 - coda.length)).trim() + coda).slice(0, 38);
}

/** Legge una volta il listino e le voci di catalogo. Lo usano il pannello e
 *  il carrello: due letture separate darebbero due verità. */
export function usaCatalogoPayStore() {
    const [tagli, setTagli] = useState<Taglio[] | null>(null);
    const [voci, setVoci] = useState<Record<string, VocePayStore>>({});
    const [errore, setErrore] = useState<string | null>(null);
    useEffect(() => {
        let vivo = true;
        (async () => {
            const [t, v] = await Promise.all([
                supabase.from("paystore_tagli").select("operatore, etichetta, valore").eq("attivo", true).order("ordine"),
                supabase.from("marg_items").select("id, paystore_operatore, name, margin_percent, reparto, azienda")
                    .eq("brand", "PayStore").eq("active", true).not("paystore_operatore", "is", null),
            ]);
            if (!vivo) return;
            if (t.error || v.error) { setErrore((t.error || v.error)?.message || "errore"); setTagli([]); return; }
            setTagli((t.data || []).map((r) => ({ ...r, valore: Number(r.valore) })) as Taglio[]);
            const m: Record<string, VocePayStore> = {};
            (v.data || []).forEach((r) => { m[String(r.paystore_operatore)] = r as VocePayStore; });
            setVoci(m);
        })();
        return () => { vivo = false; };
    }, []);
    return { tagli, voci, errore };
}

/* ═══ IL COMPOSITORE ════════════════════════════════════════════════════════
   Un clic sul taglio ne aggiunge uno. Sotto, quello che si è composto, con la
   possibilità di togliere. Se l'operatore non ha listino resta il campo
   libero — meglio un campo aperto che tagli inventati, perché un taglio che
   il fornitore non ha è una ricarica che non parte. */
export function CompositoreTagli({
    operatore, tagli, pezzi, onCambia, compatto = false,
}: {
    operatore: string;
    tagli: Taglio[] | null;
    pezzi: PezzoRicarica[];
    onCambia: (p: PezzoRicarica[]) => void;
    compatto?: boolean;
}) {
    const listino = useMemo(() => (tagli || []).filter((t) => t.operatore === operatore), [tagli, operatore]);
    const [libero, setLibero] = useState("");
    const tot = totaleComposto(pezzi);

    const aggiungi = useCallback((t: Taglio) => {
        const i = pezzi.findIndex((p) => p.etichetta === t.etichetta);
        onCambia(i >= 0
            ? pezzi.map((p, k) => (k === i ? { ...p, n: p.n + 1 } : p))
            : [...pezzi, { etichetta: t.etichetta, valore: t.valore, n: 1 }]);
    }, [pezzi, onCambia]);

    const togli = useCallback((etichetta: string) => {
        onCambia(pezzi.map((p) => (p.etichetta === etichetta ? { ...p, n: p.n - 1 } : p)).filter((p) => p.n > 0));
    }, [pezzi, onCambia]);

    if (!listino.length) {
        /* nessun listino per questo operatore: importo a mano, e si dice che è
           un ripiego — con l'API i tagli arriveranno da soli */
        return (
            <div>
                <div className="psFila">
                    <input className="rvIn psLibero" placeholder="€" inputMode="decimal" value={libero}
                        onChange={(e) => setLibero(e.target.value.replace(/[^0-9,.]/g, ""))} />
                    <button type="button" className="psPiu" disabled={!(Number(libero.replace(",", ".")) > 0)}
                        onClick={() => {
                            const v = Number(libero.replace(",", "."));
                            if (v > 0) { aggiungi({ operatore, etichetta: `${nomeOperatore(operatore)} ${v} euro`, valore: v }); setLibero(""); }
                        }}>+ aggiungi</button>
                </div>
                <Composto pezzi={pezzi} tot={tot} onTogli={togli} />
                {!compatto && (
                    <div className="rvNota rvNota-info">
                        <div className="rvNota-t">⚠ Listino non ancora censito per {nomeOperatore(operatore)}</div>
                        <div className="rvNota-s">L&apos;importo si scrive a mano. Con l&apos;API i tagli arriveranno da soli, per tutti gli operatori.</div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div>
            <div className={compatto ? "psGriglia psGriglia-mini" : "psGriglia psGriglia-t"}>
                {listino.map((t) => {
                    const n = pezzi.find((p) => p.etichetta === t.etichetta)?.n || 0;
                    return (
                        <button key={t.etichetta} type="button" onClick={() => aggiungi(t)}
                            title={`Aggiungi una ricarica da ${t.valore} € (${t.etichetta})`}
                            className={"rvTessera psTaglio" + (n > 0 ? " rvTessera-on" : "")}>
                            <b>{t.valore} €</b>
                            {!compatto && <i>{t.etichetta}</i>}
                            {n > 0 && <span className="psQta">×{n}</span>}
                        </button>
                    );
                })}
            </div>
            <Composto pezzi={pezzi} tot={tot} onTogli={togli} />
        </div>
    );
}

/** Quello che si è composto finora, con il conto e il modo di disfarlo. */
function Composto({ pezzi, tot, onTogli }: { pezzi: PezzoRicarica[]; tot: number; onTogli: (e: string) => void }) {
    if (!pezzi.length) return null;
    return (
        <div className="psComposto">
            {pezzi.map((p) => (
                <button key={p.etichetta} type="button" className="psPezzo" onClick={() => onTogli(p.etichetta)}
                    title={`Togli una ricarica da ${p.valore} €`}>
                    {p.valore} €{p.n > 1 ? <b> ×{p.n}</b> : null} <i>✕</i>
                </button>
            ))}
            <span className="psTot">= {eur(tot)}</span>
            {quanteRicariche(pezzi) > 1 && (
                <span className="psQuante">{quanteRicariche(pezzi)} ricariche da fare</span>
            )}
        </div>
    );
}

/* ═══ IL PANNELLO — LE RICARICHE SCIOLTE ════════════════════════════════════ */
export default function PayStore({
    venditore, negozio, onAdd, onIndietro, righeInCarrello,
}: {
    venditore: string; negozio: string;
    onAdd: (voce: Record<string, unknown>) => void;
    onIndietro: () => void;
    righeInCarrello: number;
}) {
    const { tagli, voci, errore } = usaCatalogoPayStore();
    const [op, setOp] = useState<string | null>(null);
    const [pezzi, setPezzi] = useState<PezzoRicarica[]>([]);
    const [num, setNum] = useState("");
    const [fatto, setFatto] = useState<string | null>(null);

    const opObj = OPERATORI_PAYSTORE.find((o) => o.id === op) || null;
    const voce = op ? voci[op] : null;
    const importo = totaleComposto(pezzi);
    const cifre = String(num).replace(/\D/g, "");
    // la stessa regola dei numeri del CRM: 7–11 cifre
    const numOk = cifre.length >= 7 && cifre.length <= 11;
    const pronto = !!op && !!voce && importo > 0 && numOk;

    const salva = () => {
        if (!pronto || !voce || !opObj) return;
        const pct = Number(voce.margin_percent || 0);
        const margine = (importo * pct) / 100;
        onAdd({
            product: descrizioneRicarica(op!, importo, cifre),
            /* ⚠️ `mi_<id>`: è così che l'API dello scontrino risale alla voce e
               quindi al reparto 1. Senza, la riga finisce fra le escluse e il
               registratore rifiuta tutto lo scontrino. */
            productId: "mi_" + voce.id,
            price: importo, importo, qty: 1,
            margin: margine, totalMargin: margine,
            venditore, negozio, date: new Date().toISOString().slice(0, 10),
            reparto: voce.reparto ?? 1,
            azienda: voce.azienda ?? null,
            linked: false, priceRequired: false, priceLocked: true,
            codice: null, scaricaMagazzino: false,
            model: null, imei: null,
            /* quello che serve a far partire la ricarica: oggi lo legge una
               persona, da domani l'API. `pezzi` sono le operazioni vere — 40 €
               composti da due tagli da 20 sono DUE ricariche. */
            paystore: { operatore: op, operatoreNome: opObj.label, numero: cifre, pezzi, importo, sciolta: true },
        });
        setFatto("🛒 " + nomeOperatore(op!) + " " + eur(importo) + " · " + cifre + " — in carrello");
        setTimeout(() => setFatto(null), 3500);
        setOp(null); setPezzi([]); setNum("");
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
                                onClick={() => { if (!vendibile) return; setOp(o.id); setPezzi([]); }}
                                className={"rvTessera psOp" + (op === o.id ? " rvTessera-on" : "") + (vendibile ? "" : " psOp-no")}>
                                {o.logo
                                    ? <Image src={o.logo} alt={o.label} width={150} height={40} className={o.zoom ? "psZoom" + String(o.zoom).replace(".", "") : ""} />
                                    : <span>{o.label}</span>}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── 2 · IMPORTO, composto coi tagli ───────────────────────── */}
            {op && (
                <div className="rvCat psPasso">
                    <div className="rvCatT"><b>2 · Importo{(tagli || []).some((t) => t.operatore === op) ? ` · tagli ${opObj?.label}` : ""}</b></div>
                    <CompositoreTagli operatore={op} tagli={tagli} pezzi={pezzi} onCambia={setPezzi} />
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
                            <b>{nomeOperatore(op!)} · {eur(importo)}</b>
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
