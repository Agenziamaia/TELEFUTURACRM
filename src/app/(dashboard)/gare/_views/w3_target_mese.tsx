// @ts-nocheck
"use client";

/* ═══ I TARGET DEL MESE, IN DUE TEMPI ══════════════════════════════════════
   Luca 05/09/2026: «a inizio mese arriva il PowerPoint con le soglie
   generalizzate per categoria, dopo 5-6 giorni arriva l'Excel coi target
   precisi». Questa card fa esattamente quel giro, e solo quello:

     ① porta avanti i punti vendita dal mese prima (chi è in gara, con che
        codice, in che cluster, con che peso) — SENZA i target vecchi;
     ② dal PowerPoint: target di cluster × peso del negozio = target
        provvisorio, che è la regola misurata sul file dell'operatore
        (San Paolo STRADA 1 a peso pieno 60/90/115/140, Mazzini stesso
        cluster a 0,8 → 48/72/92/112);
     ③ dal file Target: i numeri veri sostituiscono i provvisori e
        riallineano cluster e pesi, così il mese dopo parte già giusto.

   ⚠️ OGNI PASSO PASSA DA UN'ANTEPRIMA. Prima si vede negozio per negozio
   cosa cambierebbe, poi si applica. Sono le soglie che una persona deve
   raggiungere per essere pagata. */

import { useEffect, useState } from "react";
import { cn } from "@/utils";
import { Target, Loader2, Upload, Sparkles, Check, X, ChevronDown, ChevronUp, ArrowRight } from "lucide-react";

const meseIt = (iso) => {
    const [y, m] = String(iso).split("-").map(Number);
    const s = new Date(y, m - 1, 1).toLocaleDateString("it-IT", { month: "long", year: "numeric" });
    return s.charAt(0).toUpperCase() + s.slice(1);
};
const nf = (v) => (v === null || v === undefined || v === "" ? "—"
    : Array.isArray(v) ? (v.length ? v.join(" · ") : "vuoto") : String(v).replace(".", ","));

/* Il file dell'operatore ha le intestazioni sulla TERZA riga e i dati dalla
   quarta. Le colonne si trovano PER NOME, non per posizione: l'anno scorso ne
   hanno aggiunta una in mezzo e tutto quello che contava le posizioni si è
   spostato di una casella senza dare errore. */
const COLONNE = {
    cod_gara: ["COD_GARA"],
    peso_mobile: ["PESO POS MOBILE"],
    peso_biz: ["PESO POS BIZ"],
    peso_fix: ["PESO POS FIX"],
    cluster_mobile: ["CLUSTER MOBILE + POSIZIONE", "CLUSTER MOBILE"],
    cluster_piva: ["CLUSTER PIVA (RS)", "CLUSTER PIVA"],
    cluster_fisso: ["CLUSTER FISSO + POSIZIONE", "CLUSTER FISSO"],
};
const norm = (v) => String(v ?? "").toUpperCase().replace(/\s+/g, " ").trim();

async function leggiTarget(file) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const griglia = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null });
    // la riga delle intestazioni è quella che contiene COD_GARA
    const iH = griglia.findIndex((r) => (r || []).some((c) => norm(c) === "COD_GARA"));
    if (iH < 0) throw new Error("non trovo la colonna COD_GARA: è il file dei target giusto?");
    const head = (griglia[iH] || []).map(norm);
    const dove = (nomi) => { for (const n of nomi) { const i = head.indexOf(norm(n)); if (i >= 0) return i; } return -1; };
    /* ⚠️ ALCUNE INTESTAZIONI SONO FRASI INTERE e cambiano in coda: «TARGET
       Assicurazioni per RS Extra Premio di 500€ per PDV MAGGIORE o UGUALE».
       Cercarle per uguaglianza le manca tutte e le voci restano vuote senza
       che nessuno se ne accorga (misurato: `ass_rs` tornava tutto null).
       Si cerca l'inizio, che è la parte che dice cosa sono. */
    const dovePref = (inizio) => head.findIndex((h) => h.startsWith(norm(inizio)));
    const idx = Object.fromEntries(Object.entries(COLONNE).map(([k, v]) => [k, dove(v)]));
    if (idx.cod_gara < 0) throw new Error("manca la colonna COD_GARA");
    /* le soglie sono i numeri SUBITO DOPO la colonna del cluster: nel file di
       agosto mobile ne ha quattro, fisso cinque, P.IVA quattro. Si prendono
       finché sono numeri e l'intestazione parla di soglia — così se un mese ne
       aggiungono una la si prende comunque. */
    const soglieDopo = (iCluster) => {
        if (iCluster < 0) return [];
        const out = [];
        for (let c = iCluster + 1; c < head.length; c++) {
            if (!/^SOGLIA/.test(head[c])) break;
            out.push(c);
        }
        return out;
    };
    const cols = {
        mobile: soglieDopo(idx.cluster_mobile),
        piva: soglieDopo(idx.cluster_piva),
        fisso: soglieDopo(idx.cluster_fisso),
    };
    const num = (v) => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
    const righe = [];
    for (let r = iH + 1; r < griglia.length; r++) {
        const row = griglia[r] || [];
        const cod = String(row[idx.cod_gara] ?? "").trim();
        if (!cod) continue;
        /* ⚠️ LO ZERO IN FONDO NON È UNA SOGLIA. Nel file di agosto la P.IVA ha
           quattro colonne ma l'ultima vale 0: è «questa soglia non c'è». A
           database infatti ce ne sono tre. Senza togliere gli zeri di coda ogni
           importazione avrebbe proposto un cambiamento che non esiste — e chi
           legge un elenco di finti cambiamenti smette di leggerlo. */
        const prendi = (lista) => {
            const v = [];
            for (const c of lista) {
                const x = num(row[c]);
                if (x === null) break;               // buco in mezzo: si ferma qui
                v.push(x);
            }
            while (v.length && v[v.length - 1] === 0) v.pop();
            return v.length ? v : null;
        };
        righe.push({
            cod_gara: cod,
            peso_mobile: idx.peso_mobile >= 0 ? num(row[idx.peso_mobile]) : null,
            peso_biz: idx.peso_biz >= 0 ? num(row[idx.peso_biz]) : null,
            peso_fix: idx.peso_fix >= 0 ? num(row[idx.peso_fix]) : null,
            cluster_mobile: idx.cluster_mobile >= 0 ? (row[idx.cluster_mobile] ?? null) : null,
            cluster_piva: idx.cluster_piva >= 0 ? (row[idx.cluster_piva] ?? null) : null,
            cluster_fisso: idx.cluster_fisso >= 0 ? (row[idx.cluster_fisso] ?? null) : null,
            soglie_mobile: prendi(cols.mobile),
            soglie_piva: prendi(cols.piva),
            soglie_fisso: prendi(cols.fisso),
            /* ⚠️ IL FILE PORTA ANCHE I SOLDI. Partnership Reward (target in
               punti e premio in euro), soglie assicurazioni per ragione
               sociale, decurtazioni e premi W3 Protetti: sono le voci da cui
               `extra` era stato costruito a mano ad agosto, e senza leggerle
               qui non le aggiornerebbe più nessuno. Le colonne si prendono
               per nome; se un mese cambiano intestazione, la voce resta fuori
               invece di scrivere un numero a caso. */
            extra: (() => {
                const q = (inizio) => { const i = dovePref(inizio); return i >= 0 ? num(row[i]) : null; };
                const qn = (inizio) => { const i = dovePref(inizio); if (i < 0) return null; const m = String(row[i] ?? "").match(/-?\d+(?:[.,]\d+)?/); return m ? Number(m[0].replace(",", ".")) : null; };
                const out = {};
                const prTarget = q("TARGET PARTNERSHIP REWARD"), prP80 = q("80% PREMIO PARTNERSHIP REWARD"), prP = q("PREMIO PARTNERSHIP REWARD");
                if (prTarget !== null && prP !== null) out.pr = { target: prTarget, premio80: prP80, premio: prP };
                const a50 = q("TARGET ASSICURAZIONI PER RS EXTRA PREMIO DI 500");
                const a75 = q("TARGET ASSICURAZIONI PER RS EXTRA PREMIO DI 750");
                const aDec = q("TARGET ASSICURAZIONI PER RS DECURTAZIONE PREMIO");
                if (a50 !== null || a75 !== null || aDec !== null) out.ass_rs = { premio500_da: a50, premio750_da: a75, decurt_sotto: aDec };
                const pSotto = qn("TARGET W3 PROTETTI DECURTAZIONE PREMIO"), pDec = q("IMPORTO DECURTAZIONE W3 PROTETTI");
                const pDa = qn("TARGET W3 PROTETTI PREMIO"), pPre = q("IMPORTO PREMIO W3 PROTETTI");
                if (pSotto !== null || pDa !== null) out.protetti = { rs_decurt_sotto: pSotto, rs_decurt_eur: pDec, rs_premio_da: pDa, rs_premio_eur: pPre };
                out.raw = row;
                return Object.keys(out).length > 1 ? out : null;
            })(),
        });
    }
    if (!righe.length) throw new Error("nessuna riga con un COD_GARA sotto le intestazioni");
    return righe;
}

export function W3TargetMese({ mese, colore = "var(--tf-f59e0b)", onFatto }) {
    const [stato, setStato] = useState(null);       // { righe, prevHas, mesePrima }
    const [aperta, setAperta] = useState(true);
    const [lavoro, setLavoro] = useState("");
    const [errore, setErrore] = useState("");
    const [anteprima, setAnteprima] = useState(null); // { titolo, azione, corpo, righe, note }

    const month = String(mese).slice(0, 7) + "-01";

    const carica = async () => {
        try {
            const d = await fetch(`/api/gare/w3-target?month=${month}`, { credentials: "include", cache: "no-store" }).then((r) => r.json());
            setStato(d.error ? { righe: [], prevHas: 0, mesePrima: "", errore: d.error } : d);
        } catch { setStato({ righe: [], prevHas: 0, mesePrima: "" }); }
    };
    useEffect(() => { setStato(null); setAnteprima(null); setErrore(""); carica(); }, [month]); // eslint-disable-line

    const chiedi = async (corpo) => {
        const r = await fetch("/api/gare/w3-target", {
            method: "POST", credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ month, ...corpo }),
        });
        const d = await r.json();
        if (!r.ok || d.error) throw new Error(d.error || "il server non ha risposto");
        return d;
    };

    const portaAvanti = async () => {
        setErrore(""); setLavoro("Preparo…");
        try {
            const d = await chiedi({ azione: "porta-avanti" });
            setAnteprima({
                titolo: `Porto avanti ${d.anteprima.length} punti vendita da ${meseIt(stato.mesePrima)}`,
                nota: "Vengono copiati codice, cluster e peso. I target restano vuoti: li riempie la lettera, o il file dell'operatore quando arriva.",
                azione: { azione: "porta-avanti" },
                colonne: ["negozio", "cod_gara", "cluster_mobile", "peso_mobile", "peso_fix"],
                righe: d.anteprima,
            });
        } catch (e) { setErrore(String(e?.message || e)); }
        setLavoro("");
    };

    const dallaLettera = async (file) => {
        if (!file) return;
        setErrore(""); setLavoro("Leggo la lettera…");
        try {
            const { leggiAllegato } = await import("@/lib/ai/allegati");
            const a = await leggiAllegato(file, 60000);
            if (!a.testo) throw new Error(a.problema || "non sono riuscito a leggerla");
            setLavoro("Cerco la tabella dei cluster…");
            const c = await chiedi({ azione: "leggi-cluster", testo: a.testo });
            const quanti = Object.keys(c.cluster.mobile || {}).length + Object.keys(c.cluster.fisso || {}).length;
            if (!quanti) throw new Error("nella lettera non ho trovato nessuna tabella di target per cluster");
            setLavoro("Applico i pesi dei negozi…");
            const d = await chiedi({ azione: "da-lettera", cluster: c.cluster });
            setAnteprima({
                titolo: `${d.quanti} punti vendita cambierebbero target`,
                nota: `Target di cluster letti dalla lettera × il peso di ogni negozio. ${[...(c.avvisi || []), ...(d.senza || [])].join(" · ")}`,
                azione: { azione: "da-lettera", cluster: c.cluster },
                /* ⚠️ SE MANCA UN CLUSTER NON SI APPLICA. Il modello ne salta
                   qualcuno, e lo fa in silenzio: sei letture identiche della
                   stessa lettera, tre complete e tre con un cluster in meno e
                   un avviso che diceva il falso. Applicando quella, un negozio
                   resta senza target — e la riga grigia in fondo non la legge
                   nessuno. Quindi il pulsante si spegne e si dice perché. */
                blocco: (c.mancanti || []).length
                    ? `Nella lettera non ho trovato ${c.mancanti.length === 1 ? "un cluster" : `${c.mancanti.length} cluster`}: ${c.mancanti.join(" · ")}. Applicando adesso quei negozi resterebbero senza target: riprova la lettura, o mettili a mano.`
                    : "",
                righe: d.anteprima,
            });
        } catch (e) { setErrore(String(e?.message || e)); }
        setLavoro("");
    };

    const dalFile = async (file) => {
        if (!file) return;
        setErrore(""); setLavoro("Leggo il file dei target…");
        try {
            const righe = await leggiTarget(file);
            setLavoro(`Confronto ${righe.length} righe…`);
            const d = await chiedi({ azione: "da-file", righe });
            setAnteprima({
                titolo: `${d.quanti} punti vendita da aggiornare`,
                nota: [`Dal file dell'operatore: ${righe.length} righe lette.`,
                       d.ignorate?.length ? `Codici gara che non abbiamo: ${d.ignorate.join(", ")}` : ""].filter(Boolean).join(" "),
                azione: { azione: "da-file", righe },
                diff: true,
                righe: d.anteprima,
            });
        } catch (e) { setErrore(String(e?.message || e)); }
        setLavoro("");
    };

    /* il peso vale per tutte e tre le piste del negozio (mobile, business,
       fisso): nel file dell'operatore sono tre colonne, ma sono lo stesso
       sconto — e nell'unico caso in cui differiscono (Collatina, business a 1
       mentre mobile e fisso stanno a 0,5) la differenza la porta il file. Qui
       si tocca quello del mobile e del fisso, che sono le due gare per PDV. */
    const salvaPeso = async (r, quale, valore) => {
        const attuale = quale === "mobile" ? r.peso_mobile : r.peso_fix;
        const v = String(valore).trim() === "" ? null : Number(String(valore).replace(",", "."));
        if (v !== null && (!Number.isFinite(v) || !(v > 0) || v > 1)) {
            setErrore("Il peso è una frazione maggiore di zero e fino a 1 (0,7 = sconto del 30%). Per togliere il negozio dalla gara si svuota la casella.");
            return;
        }
        if (v === (attuale === null || attuale === undefined ? null : Number(attuale))) return;
        setErrore("");
        try {
            await chiedi({ azione: "peso", id: r.id, quale, peso: v, applica: true });
            await carica();
            if (onFatto) onFatto();
        } catch (e) { setErrore(String(e?.message || e)); }
    };

    const applica = async () => {
        if (!anteprima) return;
        if (!window.confirm(`Scrivo le modifiche su ${meseIt(month)}? I target sono le soglie che le persone devono raggiungere.`)) return;
        setLavoro("Scrivo…"); setErrore("");
        try {
            const d = await chiedi({ ...anteprima.azione, applica: true });
            setAnteprima(null);
            await carica();
            if (onFatto) onFatto();
            if (d.errori?.length) setErrore("Alcune righe non sono passate: " + d.errori.join(" · "));
        } catch (e) { setErrore(String(e?.message || e)); }
        setLavoro("");
    };

    if (!stato) {
        return (
            <div className="glass-panel rounded-2xl px-4 py-5 flex justify-center">
                <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
            </div>
        );
    }

    const vuoto = !stato.righe?.length;
    const senzaTarget = (stato.righe || []).filter((r) => !r.soglie_mobile?.length && !r.soglie_fisso?.length).length;

    return (
        <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="px-4 py-3 flex items-center gap-2 cursor-pointer select-none" onClick={() => setAperta((v) => !v)}>
                <Target className="w-4 h-4" style={{ color: colore }} />
                <h3 className="text-[13px] font-bold text-slate-200 tracking-wide">Target per punto vendita</h3>
                <span className="text-[10px] text-slate-500">
                    {vuoto ? `nessun punto vendita su ${meseIt(month)}`
                        : senzaTarget ? `${stato.righe.length} punti vendita · ${senzaTarget} ancora senza target`
                            : `${stato.righe.length} punti vendita`}
                </span>
                <div className="ml-auto">{aperta ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}</div>
            </div>

            {aperta && (
                <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
                    {errore && (
                        <div className="rounded-lg bg-rose-500/10 border border-rose-500/25 px-3 py-2 text-xs text-rose-200">{errore}</div>
                    )}

                    {vuoto ? (
                        <div className="text-center py-3 space-y-2.5">
                            <p className="text-sm text-slate-400">
                                {stato.prevHas
                                    ? `${meseIt(month)} non ha ancora i punti vendita in gara.`
                                    : `Non c'è nessun mese da cui partire: i punti vendita vanno inseriti una prima volta a mano.`}
                            </p>
                            {!!stato.prevHas && (
                                <button onClick={portaAvanti} disabled={!!lavoro}
                                    className={cn("inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-[12px] font-bold border transition-colors",
                                        "bg-white/[0.04] border-white/10 text-slate-200 hover:bg-white/[0.08]", lavoro && "opacity-40")}>
                                    {lavoro ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                                    Porta avanti i {stato.prevHas} punti vendita da {meseIt(stato.mesePrima)}
                                </button>
                            )}
                        </div>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-center gap-2">
                                <label className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer border transition-colors",
                                    lavoro ? "bg-white/5 border-white/10 text-slate-500" : "bg-indigo-500/15 border-indigo-400/25 text-indigo-200 hover:bg-indigo-500/25")}>
                                    {lavoro ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                    {lavoro || "① Target dalla lettera (cluster × peso)"}
                                    <input type="file" className="hidden" disabled={!!lavoro}
                                        accept=".pdf,.pptx,.xlsx,.xls,.csv,.txt"
                                        onChange={(e) => dallaLettera(e.target.files?.[0])} />
                                </label>
                                <label className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer border transition-colors",
                                    lavoro ? "bg-white/5 border-white/10 text-slate-500" : "bg-amber-500/15 border-amber-400/25 text-amber-200 hover:bg-amber-500/25")}>
                                    <Upload className="w-3.5 h-3.5" />
                                    ② Importa il file Target dell&apos;operatore
                                    <input type="file" className="hidden" disabled={!!lavoro}
                                        accept=".xlsx,.xls" onChange={(e) => dalFile(e.target.files?.[0])} />
                                </label>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                                            <th className="text-left font-bold py-1.5 pr-3">Negozio</th>
                                            <th className="text-left font-bold py-1.5 pr-3">Cluster</th>
                                            <th className="text-right font-bold py-1.5 pr-3">Peso mob.</th>
                                            <th className="text-right font-bold py-1.5 pr-3">Peso fisso</th>
                                            <th className="text-left font-bold py-1.5 pr-3">Mobile</th>
                                            <th className="text-left font-bold py-1.5">Fisso</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {stato.righe.map((r) => (
                                            <tr key={r.id} className="border-t border-white/5">
                                                <td className="py-1.5 pr-3 font-bold text-slate-100">{r.negozio}</td>
                                                <td className="py-1.5 pr-3 text-slate-400">{r.cluster_mobile || "—"}</td>
                                                {/* IL PESO È LO SCONTO, e mobile e fisso ne hanno uno
                                                    ciascuno: nel file dell'operatore sono due colonne
                                                    distinte. Si correggono qui perché cambiano di rado ma
                                                    cambiano (Collatina dal 50 al 70% da settembre), e da qui
                                                    si propagano sui target al primo ricalcolo. */}
                                                {["mobile", "fisso"].map((q) => (
                                                    <td key={q} className="py-1.5 pr-3 text-right">
                                                        <input type="number" min="0.05" max="1" step="0.05"
                                                            defaultValue={(q === "mobile" ? r.peso_mobile : r.peso_fix) ?? ""}
                                                            onBlur={(e) => salvaPeso(r, q, e.target.value)}
                                                            className="w-16 bg-transparent border border-white/10 rounded px-1.5 py-0.5 text-right text-slate-200
                                                                       focus:border-amber-400/50 focus:outline-none" />
                                                    </td>
                                                ))}
                                                <td className="py-1.5 pr-3 text-indigo-200">{nf(r.soglie_mobile)}</td>
                                                <td className="py-1.5 text-cyan-200">{nf(r.soglie_fisso)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    {anteprima && (
                        <div className="rounded-xl border border-amber-400/30 bg-amber-500/[0.06] p-3 space-y-2">
                            <div className="flex items-center gap-2">
                                <span className="text-[11px] font-bold text-amber-200 uppercase tracking-wider">Anteprima · niente è ancora scritto</span>
                                <span className="text-xs text-slate-300">{anteprima.titolo}</span>
                                <div className="ml-auto flex items-center gap-1.5">
                                    <button onClick={applica} disabled={!!lavoro || !anteprima.righe?.length || !!anteprima.blocco}
                                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-40">
                                        <Check className="w-3.5 h-3.5" /> Applica
                                    </button>
                                    <button onClick={() => setAnteprima(null)}
                                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-slate-400 hover:bg-white/5">
                                        <X className="w-3.5 h-3.5" /> Annulla
                                    </button>
                                </div>
                            </div>
                            {anteprima.blocco && (
                                <p className="rounded-lg bg-rose-500/10 border border-rose-500/25 px-2.5 py-1.5 text-[11px] font-bold text-rose-200">
                                    {anteprima.blocco}
                                </p>
                            )}
                            {anteprima.nota && <p className="text-[11px] text-slate-400">{anteprima.nota}</p>}
                            {!anteprima.righe?.length ? (
                                <p className="text-xs text-slate-400">Non cambia niente: quello che c'è già combacia.</p>
                            ) : (
                                <div className="max-h-64 overflow-auto">
                                    <table className="w-full text-[11px]">
                                        <tbody>
                                            {anteprima.righe.map((r, i) => (
                                                <tr key={i} className="border-t border-white/5 align-top">
                                                    <td className="py-1.5 pr-3 font-bold text-slate-100 whitespace-nowrap">{r.negozio}</td>
                                                    <td className="py-1.5 text-slate-300">
                                                        {Object.entries(r).filter(([k]) => k !== "negozio").map(([k, v]) => (
                                                            <div key={k} className="flex flex-wrap gap-1.5">
                                                                <span className="text-slate-500">{k.replace(/_/g, " ")}</span>
                                                                {v && typeof v === "object" && "a" in v ? (
                                                                    <>
                                                                        <span className="text-slate-400 line-through">{nf(v.da)}</span>
                                                                        <ArrowRight className="w-3 h-3 mt-0.5 text-slate-600" />
                                                                        <span className="font-bold text-emerald-200">{nf(v.a)}</span>
                                                                        {v.peso !== undefined && <span className="text-slate-600">({v.cluster} × {v.peso})</span>}
                                                                    </>
                                                                ) : <span className="text-slate-300">{nf(v)}</span>}
                                                            </div>
                                                        ))}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
