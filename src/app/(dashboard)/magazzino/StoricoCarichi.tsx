"use client";

/* ═══ STORICO DEI CARICAMENTI ════════════════════════════════════════════════
 *
 * Luca 03/09: «dobbiamo integrare un bottone alla destra di Carico merce,
 * chiamandolo Storico Caricamenti, che deve aprire un pop up a comparsa sullo
 * schermo con tutto lo storico dei caricamenti della merce, dove si vede la
 * data, l'user, il negozio, il contenuto e tutto».
 *
 * ── DA DOVE VIENE LO STORICO ───────────────────────────────────────────────
 * Non da una tabella nuova: un carico che entra in un negozio LASCIA un
 * documento di trasporto, e quello è già il registro — con la data, chi l'ha
 * fatto, dove è andato, di quale società e cosa conteneva. Inventare una
 * seconda tabella vorrebbe dire due verità che col tempo divergono.
 * L'unico carico che un documento non ce l'ha è quello IN UFFICIO — la merce
 * è già lì, non si trasporta niente — e quello si ricostruisce dai movimenti
 * di magazzino, raggruppati per operatore e istante.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabaseClient";
import { SelectOpzioni } from "@/components/SelectPersona";
import { History, X, Loader2, FileText, Package } from "lucide-react";

const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
const eur = (n: number | null | undefined) => n == null ? "—"
    : Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const quando = (s: string) => {
    const d = new Date(s);
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" })
        + " " + d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
};

type Riga = { codice: string | null; descrizione: string; quantita: number; seriale: string | null; valore: number | null };
type Carico = {
    id: string;
    quando: string;
    chi: string;
    negozio: string;
    azienda: string | null;
    /** il numero del documento, se il carico ne ha prodotto uno */
    numero: number | null;
    anno: number | null;
    stato: string | null;
    /** «diretto» = già a scaffale · «da accettare» = il negozio deve prenderlo in carico */
    come: string;
    righe: Riga[];
};

const pezziDi = (r: Riga) => r.seriale ? 1 : (Number(r.quantita) || 0);

export default function StoricoCarichi({ aperto, chiudi, negozi, nomiAzienda }: {
    aperto: boolean; chiudi: () => void; negozi: string[]; nomiAzienda: Record<string, string>;
}) {
    const [carichi, setCarichi] = useState<Carico[] | null>(null);
    const [errore, setErrore] = useState("");
    const [apertaId, setApertaId] = useState<string | null>(null);

    // ── i filtri: quelli che si usano davvero guardando uno storico ────────
    const [cerca, setCerca] = useState("");
    const [negozio, setNegozio] = useState("");
    const [chi, setChi] = useState("");
    const [dal, setDal] = useState("");
    const [al, setAl] = useState("");

    const carica = useCallback(async () => {
        setErrore(""); setCarichi(null);
        try {
            /* ① I CARICHI CON UN DOCUMENTO. La causale è quella che scrive la
               RPC del carico: è l'unica cosa che distingue un carico da un
               trasferimento fra negozi, che nasce nella stessa tabella. */
            const { data: dd, error: e1 } = await supabase.from("mag_ddt")
                .select("id, numero, anno, creato_il, creato_da, a_negozio, azienda_da, stato, causale")
                .ilike("causale", "Carico merce%")
                .order("creato_il", { ascending: false }).limit(400);
            if (e1) throw new Error(e1.message);
            const doc = (dd ?? []) as { id: string; numero: number; anno: number | null; creato_il: string; creato_da: string | null; a_negozio: string; azienda_da: string | null; stato: string; causale: string }[];

            const righePerDdt: Record<string, Riga[]> = {};
            for (let i = 0; i < doc.length; i += 100) {
                const ids = doc.slice(i, i + 100).map(d => d.id);
                const { data: rr } = await supabase.from("mag_ddt_righe")
                    .select("ddt_id, codice, descrizione, quantita, seriale, valore_unitario").in("ddt_id", ids);
                (rr ?? []).forEach((r: { ddt_id: string; codice: string | null; descrizione: string; quantita: number; seriale: string | null; valore_unitario: number | null }) => {
                    (righePerDdt[r.ddt_id] ||= []).push({ codice: r.codice, descrizione: r.descrizione, quantita: r.quantita, seriale: r.seriale, valore: r.valore_unitario });
                });
            }

            /* ② I CARICHI IN UFFICIO non hanno documento — la merce è già lì.
               Si ricostruiscono dai movimenti, raggruppati per chi li ha fatti
               e per istante: la RPC li scrive tutti dentro la stessa
               transazione, quindi portano lo stesso `creato_il` al millisecondo. */
            const { data: mm } = await supabase.from("mag_movimenti")
                .select("creato_il, operatore, negozio, azienda, codice, quantita, costo_unitario, nota, ddt_id")
                .ilike("nota", "carico merce in ufficio%")
                .is("ddt_id", null)
                .order("creato_il", { ascending: false }).limit(600);
            const perLotto: Record<string, Carico> = {};
            (mm ?? []).forEach((m: { creato_il: string; operatore: string | null; negozio: string; azienda: string | null; codice: string; quantita: number; costo_unitario: number | null }) => {
                const k = `${m.creato_il}|${m.operatore}|${m.negozio}|${m.azienda}`;
                (perLotto[k] ||= {
                    id: "uff:" + k, quando: m.creato_il, chi: m.operatore || "—",
                    negozio: m.negozio, azienda: m.azienda, numero: null, anno: null,
                    stato: null, come: "in ufficio", righe: [],
                }).righe.push({ codice: m.codice, descrizione: m.codice, quantita: m.quantita, seriale: null, valore: m.costo_unitario });
            });

            const tutti: Carico[] = [
                ...doc.map(d => ({
                    id: d.id, quando: d.creato_il, chi: d.creato_da || "—",
                    negozio: d.a_negozio, azienda: d.azienda_da, numero: d.numero, anno: d.anno,
                    stato: d.stato,
                    come: /consegnata/i.test(d.causale) ? "diretto" : "da accettare",
                    righe: righePerDdt[d.id] || [],
                })),
                ...Object.values(perLotto),
            ].sort((a, b) => b.quando.localeCompare(a.quando));
            setCarichi(tutti);
        } catch (e) {
            setErrore((e as Error)?.message || "non sono riuscito a leggere lo storico");
            setCarichi([]);
        }
    }, []);

    useEffect(() => { if (aperto) carica(); }, [aperto, carica]);

    /* La pagina sotto sta ferma, e Esc chiude: come la finestra del carico. */
    useEffect(() => {
        if (!aperto) return;
        const esc = (e: KeyboardEvent) => { if (e.key === "Escape") chiudi(); };
        window.addEventListener("keydown", esc);
        const prima = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { window.removeEventListener("keydown", esc); document.body.style.overflow = prima; };
    }, [aperto, chiudi]);

    const persone = useMemo(
        () => Array.from(new Set((carichi ?? []).map(c => c.chi).filter(Boolean))).sort(), [carichi]);

    const visti = useMemo(() => {
        const q = cerca.trim().toLowerCase();
        return (carichi ?? []).filter(c => {
            if (negozio && c.negozio !== negozio) return false;
            if (chi && c.chi !== chi) return false;
            const g = c.quando.slice(0, 10);
            if (dal && g < dal) return false;
            if (al && g > al) return false;
            /* LA RICERCA GUARDA ANCHE DENTRO: chi cerca un IMEI o un codice non
               sa in quale carico è finito — è esattamente la domanda che si fa. */
            if (q && !(`${c.chi} ${c.negozio} n.${c.numero ?? ""} `
                + c.righe.map(r => `${r.descrizione} ${r.codice || ""} ${r.seriale || ""}`).join(" ")
            ).toLowerCase().includes(q)) return false;
            return true;
        });
    }, [carichi, negozio, chi, dal, al, cerca]);

    const totPezzi = visti.reduce((t, c) => t + c.righe.reduce((s, r) => s + pezziDi(r), 0), 0);

    if (!aperto || typeof document === "undefined") return null;

    return createPortal(
        <div className="fixed inset-0 z-[120] overflow-y-auto flex items-start justify-center p-4 bg-black/65 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) chiudi(); }}>
            <div className="rvBox rvBox-sopra w-full max-w-6xl my-4">
                <div className="rvTesta">
                    <h2 className="rvTit"><History size={22} /> Storico caricamenti</h2>
                    <button onClick={chiudi} className="rvPill rvPill-sm" title="Chiudi (Esc)">
                        <X size={14} className="inline-block align-[-2px] mr-1" /> Chiudi
                    </button>
                </div>

                <div className="rvBarra mt-3">
                    <label className="rvCampo rvCampo-el-lg"><span className="rvLab">Cerca <span className="rvLabX">(articolo, codice, IMEI, numero del documento)</span></span>
                        <input className="rvIn" value={cerca} onChange={e => setCerca(e.target.value)} placeholder="cerca anche dentro al contenuto…" /></label>
                    <div className="rvCampo rvCampo-el"><span className="rvLab">Negozio</span>
                        <SelectOpzioni className="rvIn" value={negozio} onChange={setNegozio} opzioni={negozi} placeholder="tutti" /></div>
                    <div className="rvCampo rvCampo-el"><span className="rvLab">Chi l&apos;ha fatto</span>
                        <SelectOpzioni className="rvIn" value={chi} onChange={setChi} opzioni={persone} placeholder="chiunque" /></div>
                    {/* le due date insieme, in un campo solo: separate prendevano
                        due dodicesimi di riga a testa e spingevano «Azzera» a capo */}
                    <div className="rvCampo rvCampo-el-lg"><span className="rvLab">Dal … al</span>
                        <div className="rvBarra rvBarra-c">
                            <input type="date" className="rvIn rvCampo-flex" value={dal} onChange={e => setDal(e.target.value)} />
                            <input type="date" className="rvIn rvCampo-flex" value={al} onChange={e => setAl(e.target.value)} />
                        </div>
                    </div>
                    <div className="rvCampo"><span className="rvLab">&nbsp;</span>
                        <div className="rvPillRow">
                            <button className="rvPill" onClick={() => { setCerca(""); setNegozio(""); setChi(""); setDal(""); setAl(""); }}>↺ Azzera</button>
                        </div>
                    </div>
                </div>

                {errore && <div className="rvNota rvNota-ko mt-3"><div className="rvNota-s">{errore}</div></div>}

                {carichi === null ? (
                    <div className="rvDdt-att"><Loader2 size={26} className="animate-spin" /><b>Leggo lo storico…</b></div>
                ) : !visti.length ? (
                    <div className="rvNota rvNota-info mt-3"><div className="rvNota-s">
                        {carichi.length ? "Nessun caricamento con questi filtri." : "Non è ancora stato caricato niente da qui."}
                    </div></div>
                ) : (
                    <>
                        <div className="rvTabBox mt-3">
                            <table className="rvTab">
                                <thead><tr>
                                    <th>Quando</th><th>Chi</th><th>Negozio</th><th>Società</th>
                                    <th>Come</th><th>Contenuto</th><th className="rvTab-eur">Pezzi</th>
                                </tr></thead>
                                <tbody>
                                    {visti.map(c => {
                                        const pezzi = c.righe.reduce((s, r) => s + pezziDi(r), 0);
                                        const val = c.righe.reduce((s, r) => s + pezziDi(r) * (Number(r.valore) || 0), 0);
                                        const apr = apertaId === c.id;
                                        return (
                                            /* la chiave sta sul frammento, non sulle due righe dentro:
                                               una lista di frammenti senza chiave React la ricostruisce
                                               da capo a ogni disegno */
                                            <Fragment key={c.id}>
                                                <tr className={cn("rvTab-riga rvTab-cl", apr && "rvTab-on")}
                                                    onClick={() => setApertaId(apr ? null : c.id)}>
                                                    <td className="rvTab-min"><span className="rvTab-ap">{apr ? "▾" : "▸"}</span>{quando(c.quando)}</td>
                                                    <td className="rvTab-min">{c.chi}</td>
                                                    <td className="rvTab-min">{c.negozio}</td>
                                                    <td className="rvTab-min">{c.azienda ? <span className="rvBadge rvBadge-acc">{nomiAzienda[c.azienda] || c.azienda}</span> : "—"}</td>
                                                    <td className="rvTab-min">
                                                        {c.numero != null
                                                            ? <><FileText size={12} className="inline-block align-[-2px] mr-1" />n.{c.numero}{c.anno ? `/${c.anno}` : ""}</>
                                                            : <><Package size={12} className="inline-block align-[-2px] mr-1" />in ufficio</>}
                                                        {c.come === "da accettare" && <span className="rvBadge rvBadge-warn ml-1">da accettare</span>}
                                                    </td>
                                                    {/* IL CONTENUTO IN SINTESI: il primo articolo e quanti altri.
                                                        Tutto per esteso farebbe righe alte cinque volte, e la
                                                        ricerca ci guarda dentro lo stesso. */}
                                                    <td className="rvTab-nome">
                                                        {c.righe.length
                                                            ? <>{c.righe[0].descrizione}{c.righe.length > 1 ? <span className="rvTab-min"> e altri {c.righe.length - 1} articol{c.righe.length === 2 ? "o" : "i"}</span> : null}</>
                                                            : <span className="rvTab-min">nessuna riga</span>}
                                                    </td>
                                                    <td className="rvTab-eur"><b>{pezzi}</b></td>
                                                </tr>
                                                {apr && (
                                                    <tr className="rvTab-det"><td colSpan={7}>
                                                        <div className="rvDett">
                                                            <div className="rvDettT">Cosa è entrato — {pezzi} pezz{pezzi === 1 ? "o" : "i"}{val > 0 ? ` · ${eur(val)} a costo` : ""}</div>
                                                            {c.righe.map((r, i) => (
                                                                <div key={i} className="rvDettR">
                                                                    <span className="rvTab-nome">{r.descrizione}</span>
                                                                    {r.codice && <span className="rvTab-cod">{r.codice}</span>}
                                                                    {r.seriale && <span className="rvTab-cod" title="numero di serie">{r.seriale}</span>}
                                                                    <span className="rvSpazio" />
                                                                    {r.valore != null && <span className="rvTab-min">{eur(r.valore)}</span>}
                                                                    <span className="rvTab-min"><b>{pezziDi(r)}</b> pz</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </td></tr>
                                                )}
                                            </Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                            <div className="rvTab-pie">
                                {visti.length.toLocaleString("it-IT")} caricament{visti.length === 1 ? "o" : "i"} · {totPezzi.toLocaleString("it-IT")} pezzi
                                {carichi.length > visti.length ? ` (su ${carichi.length} in tutto)` : ""}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>,
        document.body);
}
