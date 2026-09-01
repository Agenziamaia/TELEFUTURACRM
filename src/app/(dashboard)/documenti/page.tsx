"use client";

/* ═══ DOCUMENTI EMESSI ═══════════════════════════════════════════════════════
 *
 * Luca 01/09 sera: «dobbiamo creare una sezione di documenti dentro il lab di
 * vendite, dove mettiamo tutti gli scontrini che un negozio fa, ma anche le
 * fatture. Il senso è dare la possibilità di vedere tutti gli scontrini fatti
 * ai punti vendita: ogni punto vendita vede i suoi, l'amministrazione li vede
 * tutti. Se qualcosa non torna, o non si ricordano se hanno fatto uno
 * scontrino, cliccano e si apre il dettaglio di quello che c'era nel carrello
 * coi dati del cliente. E il punto vendita può fare una richiesta di modifica
 * del pagamento, che arriva in amministrazione.»
 *
 * DA DOVE VENGONO I DOCUMENTI. Non da una tabella nuova: dalla coda di stampa
 * (`print_jobs`), che è l'unico posto dove un documento esiste davvero — con
 * dentro l'XML mandato al registratore. Quell'XML è la fonte più fedele che
 * abbiamo: contiene le righe una per una, i reparti IVA e le forme di
 * pagamento ESATTAMENTE come sono finite sulla carta. Una tabella parallela
 * avrebbe potuto divergere dallo scontrino vero; questa no, per costruzione.
 *
 * IL DESIGN È QUELLO DI REGISTRA VENDITA (richiesta di Luca: «siamo dentro il
 * lab delle vendite, dobbiamo andare in continuità»): stessa cassetta di
 * classi `rv*`, stessi campi, stessa tabella. I riquadri in alto sono quelli
 * del Magazzino — quelli che filtrano premendoli — perché lì la forma è già
 * stata provata sul campo oggi.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import { useVisibleStores, stessoMagazzino } from "@/lib/visibleStores";
import { SelectMulti } from "@/components/SelectPersona";
import { FileDown, RefreshCw } from "lucide-react";

const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
const eur = (n: number | null | undefined) =>
    n == null ? "—" : "€ " + Number(n).toFixed(2).replace(".", ",");
const eurTondo = (n: number) =>
    new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(n) || 0);
const gg = (s: string | null) => (s ? new Date(s).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");
const ora = (s: string | null) => (s ? new Date(s).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "");

/* ── COSA C'È DENTRO UN DOCUMENTO ────────────────────────────────────────────
   L'XML del registratore si legge una volta sola, qui, e diventa righe e
   pagamenti. È volutamente tollerante: un documento vecchio, o di un modello
   diverso, non deve far sparire la riga dall'elenco — al massimo si apre e
   dice che il dettaglio non c'è. */
type RigaDoc = { descrizione: string; quantita: number; prezzo: number; reparto: number | null };
type PagDoc = { descrizione: string; importo: number; tipo: number };

function leggiXml(xml: string | null): { righe: RigaDoc[]; pagamenti: PagDoc[] } {
    const righe: RigaDoc[] = [], pagamenti: PagDoc[] = [];
    if (!xml) return { righe, pagamenti };
    const dec = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
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
    return { righe, pagamenti };
}

/** Il numero del documento, che il registratore restituisce nell'esito e ogni
 *  famiglia scrive a modo suo: il Custom in chiaro («fiscale stampato (n. 12)»),
 *  l'Epson dentro il suo XML di risposta. Se non c'è, non si inventa. */
function numeroDoc(result: string | null): string | null {
    if (!result) return null;
    const a = result.match(/\(n\.\s*([0-9-]+)\)/i);
    if (a) return a[1];
    const b = result.match(/<(?:fiscalReceiptNumber|zRepNumber|receiptNumber)>([^<]+)</i);
    if (b) return b[1].trim();
    const c = result.match(/"(?:numero|nDoc|docNumber)"\s*:\s*"?([0-9-]+)"?/i);
    return c ? c[1] : null;
}

type Doc = {
    id: string;
    quando: string;
    negozio: string;
    tipo: "scontrino" | "fattura";
    fiscale: boolean;
    prova: boolean;
    stato: string;
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

export default function DocumentiPage() {
    const { user } = useAuth();
    const { seesAll, stores: negoziVisibili, loaded: visibilitaPronta } = useVisibleStores();

    const [docs, setDocs] = useState<Doc[] | null>(null);
    const [errore, setErrore] = useState("");
    const [caricando, setCaricando] = useState(false);

    /* ── I FILTRI ──────────────────────────────────────────────────────────── */
    const [tipo, setTipo] = useState<"" | "scontrino" | "fattura">("");
    const [scelti, setScelti] = useState<string[]>([]);
    const [cerca, setCerca] = useState("");        // numero documento o IMEI o descrizione
    const [utenti, setUtenti] = useState<string[]>([]);
    const oggi = new Date().toISOString().slice(0, 10);
    const [dal, setDal] = useState(oggi);
    const [al, setAl] = useState(oggi);
    const [aperto, setAperto] = useState<string | null>(null);

    /* ── LA LETTURA ────────────────────────────────────────────────────────
       Si legge per INTERVALLO DI DATE, non «gli ultimi N»: un negozio che
       cerca lo scontrino di martedì non deve scoprire che l'elenco si ferma a
       ieri. Il filtro dei negozi è quello della visibilità dell'utente, che è
       la stessa regola di tutto il resto del CRM. */
    const carica = useCallback(async () => {
        if (!visibilitaPronta) return;
        setCaricando(true); setErrore("");
        try {
            let q = supabase.from("print_jobs")
                .select("id, negozio, kind, status, result, request_xml, meta, created_at")
                .in("kind", ["fiscal_receipt", "non_fiscal"])
                .gte("created_at", `${dal}T00:00:00`)
                .lte("created_at", `${al}T23:59:59`)
                .order("created_at", { ascending: false })
                .limit(2000);
            if (!seesAll && negoziVisibili.length) q = q.in("negozio", negoziVisibili);
            const { data, error } = await q;
            if (error) throw error;
            type Riga = { id: string; negozio: string; kind: string; status: string; result: string | null; request_xml: string | null; meta: Record<string, unknown> | null; created_at: string };
            setDocs(((data ?? []) as Riga[]).map((r) => {
                const m = (r.meta || {}) as Record<string, unknown>;
                const { righe, pagamenti } = leggiXml(r.request_xml);
                return {
                    id: r.id,
                    quando: r.created_at,
                    negozio: r.negozio,
                    tipo: "scontrino" as const,
                    fiscale: r.kind === "fiscal_receipt",
                    prova: m.testMode === true,
                    stato: r.status,
                    totale: m.total != null ? Number(m.total) : (righe.reduce((s, x) => s + x.prezzo * x.quantita, 0) || null),
                    numero: numeroDoc(r.result),
                    matricola: (r.result || "").match(/"matricola"\s*:\s*"([^"]+)"/)?.[1] || null,
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
    }, [dal, al, seesAll, negoziVisibili, visibilitaPronta]);

    useEffect(() => { carica(); }, [carica]);

    /* I NEGOZI CHE SI POSSONO SCEGLIERE sono quelli visibili all'utente: chi ne
       ha tre in assegnazione ne sceglie fra tre, l'amministrazione fra tutti. */
    const negozi = useMemo(() => {
        const s = new Set<string>(negoziVisibili);
        (docs || []).forEach(d => s.add(d.negozio));
        return Array.from(s).filter(Boolean).sort();
    }, [negoziVisibili, docs]);

    const miei = useMemo(() =>
        user?.negozio ? negozi.filter(n => stessoMagazzino(n, user.negozio as string)) : [], [negozi, user?.negozio]);

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

    /* I RIQUADRI CONTANO PRIMA DEL PROPRIO FILTRO — la regola di Magazzino e di
       Gestione Usati: un riquadro spento deve dire quanti ce ne sarebbero, se no
       nessuno lo preme mai. */
    const base = useMemo(() => (docs || []).filter(passa), [docs, passa]);
    const conta = useMemo(() => {
        const s = base.filter(d => d.tipo === "scontrino");
        const f = base.filter(d => d.tipo === "fattura");
        const somma = (l: Doc[]) => l.filter(d => d.stato === "done" && !d.prova).reduce((a, d) => a + (d.totale || 0), 0);
        return {
            scontrini: s.length, fatture: f.length,
            valScontrini: somma(s), valFatture: somma(f),
            falliti: base.filter(d => d.stato === "error").length,
        };
    }, [base]);

    const righe = useMemo(() => (tipo ? base.filter(d => d.tipo === tipo) : base), [base, tipo]);

    const esporta = () => {
        const righeCsv = [
            ["Data", "Ora", "Negozio", "Tipo", "Numero", "Totale €", "Cliente", "Operatore", "Stato", "Voci"].join(";"),
            ...righe.map(d => [gg(d.quando), ora(d.quando), d.negozio, d.fiscale ? "Fiscale" : "Non fiscale",
                d.numero || "", String(d.totale ?? "").replace(".", ","), d.cliente || "", d.operatore || "",
                d.stato, d.righe.map(r => r.descrizione).join(" + ")].join(";")),
        ].join("\n");
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob(["﻿" + righeCsv], { type: "text/csv;charset=utf-8" }));
        a.download = `documenti_${dal}_${al}.csv`; a.click();
    };

    /* ── LA RICHIESTA DI CORREZIONE ───────────────────────────────────────────
       Luca: «il punto vendita può fare una richiesta di modifica del pagamento
       — in questo caso ha esito carta e si è sbagliato — cambiandola per
       contanti; questa modifica arriva in amministrazione».
       Il documento NON si tocca: uno scontrino emesso è emesso. Si apre una
       richiesta, e chi di dovere decide. È successo davvero oggi a Merulana:
       la cassa dava errore, il venditore ha battuto «carta» per far uscire lo
       scontrino, ma il cliente aveva pagato in contanti. */
    const [chiedendo, setChiedendo] = useState<Doc | null>(null);
    const [nuovaForma, setNuovaForma] = useState("Contanti");
    const [perche, setPerche] = useState("");
    const [inviando, setInviando] = useState(false);
    const [fatta, setFatta] = useState("");

    const inviaRichiesta = async () => {
        if (!chiedendo || inviando) return;
        setInviando(true);
        try {
            const vecchia = chiedendo.pagamenti.map(p => `${p.descrizione} ${eur(p.importo)}`).join(" + ") || "—";
            const { error } = await supabase.from("admin_tasks").insert({
                tipo: "correzione_pagamento",
                titolo: `🧾 ${chiedendo.negozio}: correggere il pagamento di uno scontrino da ${eur(chiedendo.totale)}`,
                dettaglio: `${user?.name || "un operatore"} chiede di correggere la forma di pagamento del documento del `
                    + `${gg(chiedendo.quando)} alle ${ora(chiedendo.quando)}${chiedendo.numero ? ` (n. ${chiedendo.numero})` : ""}.\n`
                    + `Sullo scontrino risulta: ${vecchia}.\nIl cliente ha invece pagato: ${nuovaForma}.\n`
                    + (perche.trim() ? `Motivo: ${perche.trim()}\n` : "")
                    + `Voci: ${chiedendo.righe.map(r => `${r.descrizione} ${eur(r.prezzo)}`).join(" · ")}`,
                link: "/documenti",
                target_role: "amministrativo",
                created_by: user?.name || null,
            });
            if (error) throw error;
            setFatta("Richiesta inviata all'amministrazione.");
            setChiedendo(null); setPerche("");
        } catch (e) {
            setFatta("Non sono riuscito a inviarla: " + ((e as Error)?.message || "riprova"));
        } finally { setInviando(false); }
    };

    const QUADRI = [
        { id: "" as const, icona: "🧾", et: "Tutti i documenti", n: conta.scontrini + conta.fatture, val: conta.valScontrini + conta.valFatture, tinta: "rvT-indaco" },
        { id: "scontrino" as const, icona: "🧾", et: "Scontrini", n: conta.scontrini, val: conta.valScontrini, tinta: "rvT-verde" },
        { id: "fattura" as const, icona: "📄", et: "Fatture", n: conta.fatture, val: conta.valFatture, tinta: "rvT-ciano" },
    ];

    return (
        <div className="rvWrap">
            <div className="rvBox">
                <div className="rvTitolo">
                    <h2>🧾 Documenti emessi</h2>
                    <p>Gli scontrini e le fatture dei punti vendita. Apri un documento per vedere cosa c&apos;era nel carrello.</p>
                </div>

                {/* ═══ I RIQUADRI ═══ premendone uno si vede solo quello. Il numero
                    grande dice quante righe vedrai; sotto, quanto valgono i
                    documenti riusciti e non di prova. */}
                <div className="rvCampo rvCampo-flex mt-3"><span className="rvLab">Cosa è stato emesso</span>
                    <div className="rvRapidoG rvRapidoG-kpi">
                        {QUADRI.map(q => (
                            <button key={q.id || "tutti"} type="button" onClick={() => setTipo(t => (t === q.id ? "" : q.id) as typeof tipo)}
                                className={cn("rvRapido", q.tinta, tipo === q.id && "rvRapido-on", !q.n && tipo !== q.id && "rvRapido-off")}>
                                <em className={q.n > 999 ? "rvNum-s" : "rvNum-m"}>{q.n.toLocaleString("it-IT")}</em>
                                <b>{q.icona} {q.et}{tipo === q.id ? " ✓" : ""}</b>
                                <small>{eurTondo(q.val)} incassati</small>
                            </button>
                        ))}
                    </div>
                    <div className="rvHint">
                        I valori contano solo i documenti riusciti e non di prova.
                        {conta.falliti > 0 ? ` ${conta.falliti} non sono usciti dalla stampante: restano in elenco perché il tentativo c'è stato.` : ""}
                    </div>
                </div>

                {/* ═══ I FILTRI ═══ */}
                <div className="rvBarra mt-3">
                    <label className="rvCampo rvCampo-lg"><span className="rvLab">Cerca</span>
                        <input value={cerca} onChange={e => setCerca(e.target.value)} className="rvIn"
                            placeholder="numero documento, IMEI, articolo o cliente — l'IMEI puoi spararlo col lettore" /></label>
                    <div className="rvCampo rvCampo-md"><span className="rvLab">Punto vendita</span>
                        <SelectMulti className="rvIn" values={scelti} onChange={setScelti} opzioni={negozi}
                            maxVoci={30} tuttiLabel="🌐 Tutti i miei negozi" placeholder="vuoto = tutti quelli che vedo" /></div>
                    <div className="rvCampo rvCampo-md"><span className="rvLab">Operatore</span>
                        <SelectMulti className="rvIn" values={utenti} onChange={setUtenti} opzioni={operatori}
                            maxVoci={30} tuttiLabel="Tutti" placeholder="chiunque" /></div>
                    <label className="rvCampo"><span className="rvLab">Dal</span>
                        <input type="date" value={dal} max={al} onChange={e => setDal(e.target.value)} className="rvIn" /></label>
                    <label className="rvCampo"><span className="rvLab">Al</span>
                        <input type="date" value={al} min={dal} onChange={e => setAl(e.target.value)} className="rvIn" /></label>
                    <button onClick={() => { setTipo(""); setCerca(""); setUtenti([]); setScelti(miei); setDal(oggi); setAl(oggi); }}
                        className="rvPill rvPill-sm" title="Rimette tutto com'è entrando: i miei negozi, oggi">↺ Reset</button>
                    <button onClick={carica} disabled={caricando} className="rvPill rvPill-sm">
                        <RefreshCw size={13} className="inline-block align-[-2px] mr-1" />{caricando ? "carico…" : "aggiorna"}
                    </button>
                    <button onClick={esporta} disabled={!righe.length} className="rvAzione rvAzione-sm">
                        <FileDown size={14} className="inline-block align-[-2px] mr-1.5" /> Excel
                    </button>
                </div>

                {errore && <div className="rvNota rvNota-ko mt-3">{errore}</div>}
                {fatta && <div className="rvNota mt-3">{fatta}</div>}

                {/* ═══ L'ELENCO ═══ */}
                <div className="rvTabBox mt-3">
                    <table className="rvTab">
                        <thead>
                            <tr>
                                <th>Quando</th><th>Punto vendita</th><th>Documento</th>
                                <th>Contenuto</th><th>Operatore</th><th className="rvTab-c">Totale</th>
                            </tr>
                        </thead>
                        <tbody>
                            {docs === null && <tr><td colSpan={6} className="rvTab-vuoto">Carico…</td></tr>}
                            {docs !== null && !righe.length && (
                                <tr><td colSpan={6} className="rvTab-vuoto">
                                    Nessun documento con questi filtri. Prova ad allargare le date: l&apos;elenco parte da oggi.
                                </td></tr>
                            )}
                            {righe.map(d => {
                                const apertaQui = aperto === d.id;
                                return (
                                    <tr key={d.id} onClick={() => setAperto(apertaQui ? null : d.id)}
                                        className={cn("rvTab-riga rvTab-cl", apertaQui && "rvTab-on")}>
                                        <td className="rvTab-min">{gg(d.quando)}<br /><b>{ora(d.quando)}</b></td>
                                        <td className="rvTab-min">{d.negozio}{d.azienda ? <><br /><span className="rvBadge rvBadge-acc">{d.azienda}</span></> : null}</td>
                                        <td className="rvTab-min">
                                            {d.numero ? <b>n. {d.numero}</b> : <span className="rvTab-min">senza numero</span>}
                                            <br />
                                            {d.prova
                                                ? <span className="rvBadge rvBadge-warn">di prova</span>
                                                : d.fiscale ? <span className="rvBadge rvBadge-ok">fiscale</span>
                                                    : <span className="rvBadge">non fiscale</span>}
                                            {d.stato === "error" && <span className="rvBadge rvBadge-ko ml-1">non uscito</span>}
                                            {d.stato === "pending" && <span className="rvBadge rvBadge-warn ml-1">in coda</span>}
                                        </td>
                                        <td className="rvTab-nome">
                                            {d.righe.length
                                                ? d.righe.map(r => r.descrizione).join(" · ")
                                                : <span className="rvTab-min">dettaglio non disponibile</span>}
                                            {d.cliente && <><br /><span className="rvTab-min">cliente: {d.cliente}</span></>}
                                        </td>
                                        <td className="rvTab-min">{d.operatore || "—"}</td>
                                        <td className="rvTab-n">{eur(d.totale)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* ═══ IL DETTAGLIO ═══ quello che c'era nel carrello, come è
                    finito sulla carta: righe, reparti IVA e forme di pagamento
                    lette dall'XML mandato al registratore. */}
                {aperto && (() => {
                    const d = righe.find(x => x.id === aperto);
                    if (!d) return null;
                    return (
                        <div className="rvScheda mt-3">
                            <div className="rvDettT">
                                🧾 {d.negozio} · {gg(d.quando)} alle {ora(d.quando)}
                                {d.numero ? ` · documento n. ${d.numero}` : ""}
                                {d.matricola ? ` · matricola ${d.matricola}` : ""}
                            </div>
                            <div className="rvDett">
                                {d.righe.length ? d.righe.map((r, i) => (
                                    <div key={i} className="rvDettR">
                                        <span>{r.descrizione}</span>
                                        {r.quantita > 1 && <span className="rvTab-min">× {r.quantita}</span>}
                                        {r.reparto != null && <span className="rvBadge rvBadge-acc">reparto {r.reparto}</span>}
                                        <span className="rvDove-fine">{eur(r.prezzo * r.quantita)}</span>
                                    </div>
                                )) : <div className="rvTab-min">Di questo documento non abbiamo il dettaglio delle righe.</div>}
                            </div>
                            <div className="rvDett">
                                <div className="rvDettT">Come è stato pagato</div>
                                {d.pagamenti.length ? d.pagamenti.map((p, i) => (
                                    <div key={i} className="rvDettR">
                                        <span>{p.descrizione || NOME_PAG[p.tipo] || "—"}</span>
                                        <span className="rvTab-min">{NOME_PAG[p.tipo] || `tipo ${p.tipo}`}</span>
                                        <span className="rvDove-fine">{eur(p.importo)}</span>
                                    </div>
                                )) : <div className="rvTab-min">Nessuna forma di pagamento registrata.</div>}
                            </div>
                            <div className="rvPillRow mt-2">
                                {d.contrattoId && (
                                    <a href={`/ricerca-vendite?id=${encodeURIComponent(d.contrattoId)}`} className="rvPill rvPill-sm">
                                        ↗ Apri la vendita
                                    </a>
                                )}
                                <button onClick={() => { setChiedendo(d); setNuovaForma("Contanti"); setFatta(""); }} className="rvPill rvPill-sm">
                                    ✏️ Chiedi la correzione del pagamento
                                </button>
                            </div>
                        </div>
                    );
                })()}

                {/* ═══ LA RICHIESTA ═══ il documento non si tocca: si chiede. */}
                {chiedendo && (
                    <div className="rvScheda mt-3">
                        <div className="rvDettT">✏️ Correzione della forma di pagamento</div>
                        <div className="rvNota">
                            Lo scontrino emesso non si modifica: questa è una <b>richiesta</b> che arriva
                            all&apos;amministrazione, con dentro cosa risulta e cosa dici tu.
                        </div>
                        <div className="rvBarra mt-2">
                            <label className="rvCampo rvCampo-md"><span className="rvLab">Il cliente ha pagato con</span>
                                <select value={nuovaForma} onChange={e => setNuovaForma(e.target.value)} className="rvIn">
                                    <option>Contanti</option>
                                    <option>Carta</option>
                                    <option>Bonifico</option>
                                    <option>Non riscosso / credito</option>
                                    <option>Finanziamento</option>
                                </select></label>
                            <label className="rvCampo rvCampo-lg"><span className="rvLab">Cosa è successo</span>
                                <input value={perche} onChange={e => setPerche(e.target.value)} className="rvIn"
                                    placeholder="es. la cassa dava errore e ho battuto carta per far uscire lo scontrino" /></label>
                        </div>
                        <div className="rvPillRow mt-2">
                            <button onClick={inviaRichiesta} disabled={inviando} className="rvPill rvPill-on">
                                {inviando ? "invio…" : "Invia all'amministrazione"}
                            </button>
                            <button onClick={() => setChiedendo(null)} className="rvPill rvPill-sm">Annulla</button>
                        </div>
                    </div>
                )}

                {/* ═══ LE FATTURE ═══ ci sono nei filtri perché il posto è questo,
                    ma il CRM non ne emette ancora: dirlo è meglio che lasciare un
                    riquadro a zero che sembra un guasto. */}
                {tipo === "fattura" && !conta.fatture && (
                    <div className="rvNota rvNota-warn mt-3">
                        <b>Le fatture non sono ancora emesse dal CRM.</b> Il posto è questo e i filtri le
                        aspettano: manca la parte che le crea — numerazione, dati fiscali del cliente e
                        invio allo SdI. Appena c&apos;è, compaiono qui insieme agli scontrini.
                    </div>
                )}
            </div>
        </div>
    );
}
