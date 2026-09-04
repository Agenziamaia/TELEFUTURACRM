// @ts-nocheck
"use client";

/* ═══ LA LETTERA LETTA DALL'AI ═════════════════════════════════════════════
   Luca 04/09/2026: «gli diciamo di leggere la lettera di gara nuova che gli
   alleghiamo e a quel punto di compilare i dati della tabella con i nuovi
   valori del mese, e di fare anche un pdf con i cambiamenti».

   Il flusso è: carichi la lettera → il modello la confronta con il mese base
   → esce un elenco di modifiche, una per riga, con vecchio e nuovo valore.
   NIENTE viene scritto finché non spunti le righe e premi Applica: queste
   tabelle decidono i compensi delle persone.

   ⚠️ 04/09 sera — la prima lettura vera ha proposto 334 modifiche tutte
   spuntate. Luca: «mi ha proposto 334 modifiche quando in realtà non c'è
   bisogno. Lui mi deve proporre delle modifiche chiare e chiave, mi deve fare
   anche un riassunto veloce, step by step. Altrimenti è impossibile verificare
   quello che mi dice e rischio di fare danni».
   Da qui questa card fa tre cose diverse da prima:
     1. in cima c'è il RIASSUNTO passo per passo, scritto dal server dalle
        modifiche vere (non raccontato dal modello, che poi diverge);
     2. le modifiche stanno in DUE gruppi — i numeri che pagano, aperti e
        spuntati; le accessorie (descrizioni, note, e le righe nuove che non
        portano nessun importo) chiuse e NON spuntate;
     3. si sceglie la DIVISIONE della lettera, così una lettera del franchising
        non va a proporre righe sul multibrand. */

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { isAdminOrAbove } from "@/lib/roles";
import { leggiAllegato } from "@/lib/ai/allegati";
import { cn } from "@/utils";
import { Sparkles, Loader2, Check, X, FileDown, ChevronDown, ChevronUp, ChevronRight, AlertTriangle, Plus, Minus, PencilLine, Copy, ListChecks } from "lucide-react";

const meseIt = (iso) => {
    const [y, m] = String(iso).split("-").map(Number);
    const s = new Date(y, m - 1, 1).toLocaleDateString("it-IT", { month: "long", year: "numeric" });
    return s.charAt(0).toUpperCase() + s.slice(1);
};
const numIt = (v) => (v === null || v === undefined || v === "" ? "—" :
    typeof v === "number" ? String(v).replace(".", ",") : String(v));

const ICONA = { aggiorna: PencilLine, aggiungi: Plus, rimuovi: Minus };
const COLORE = { aggiorna: "text-amber-300", aggiungi: "text-emerald-300", rimuovi: "text-rose-300" };

const NOME_DIV = { franchising: "Franchising", multibrand: "Multibrand", multibrand_t2: "Multibrand T2 / Dealer" };

/* IL RIASSUNTO. Il server lo scrive già impaginato: una riga di intestazione,
   poi un blocco per pista (titolo in maiuscolo) con le sue righe che cominciano
   per «·». Qui non si reinterpreta niente — si dà solo il peso giusto alle tre
   forme di riga, così si legge in due secondi invece che in due minuti. */
function Riassunto({ testo }) {
    const righe = String(testo || "").split("\n");
    /* ⚠️ le proposte di prima hanno un `riassunto` in PROSA, scritto dal
       modello: senza questo controllo ogni sua frase diventava un titolo in
       maiuscolo. Il formato nuovo si riconosce: o comincia con la riga delle
       divisioni, o contiene almeno una riga puntata. */
    const impaginato = righe.some((r) => r.trim().startsWith("·")) || /^division[ei] lett/i.test(righe[0]?.trim() || "");
    if (!impaginato) {
        return <p className="px-3 py-2.5 border-b border-white/5 bg-white/[0.02] text-[11.5px] text-slate-300 leading-relaxed">{testo}</p>;
    }
    return (
        <div className="px-3 py-2.5 border-b border-white/5 bg-white/[0.02]">
            {righe.map((r, i) => {
                const t = r.trim();
                if (!t) return <div key={i} className="h-2" />;
                if (t.startsWith("·")) {
                    return (
                        <div key={i} className="pl-3 text-[11.5px] text-slate-200 leading-relaxed">
                            <span className="text-slate-600 mr-1.5">·</span>{t.slice(1).trim()}
                        </div>
                    );
                }
                if (/^(division[ei] lett[ae]|nessun cambio)/i.test(t)) {
                    return <div key={i} className="text-[10.5px] text-slate-500 leading-relaxed">{t}</div>;
                }
                return <div key={i} className="text-[10px] font-black uppercase tracking-[0.14em] text-indigo-300 mt-1.5 mb-0.5">{t}</div>;
            })}
        </div>
    );
}

/** Il mese si imposta in un modo solo: o si copia quello prima, o si dà la
   lettera all'AI. I due pulsanti stanno QUI, insieme — Luca 04/09: «devi
   darmi solamente queste due opzioni che scelgo e poi vado avanti».
   La lettera NON si carica prima: la si dà da leggere, e se la lettura va a
   buon fine finisce da sola nell'archivio del mese. */
export function LetteraAI({ brand, month, colore = "var(--tf-818cf8)", onFatto = () => {} }) {
    const { user } = useAuth();
    const [proposte, setProposte] = useState(null);
    const [inArchivio, setInArchivio] = useState("");
    /* lo stato del mese se lo guarda da solo: questa card vive nella pagina
       Gare accanto all'archivio lettere, non dentro il tab dell'azienda —
       su WindTre quel tab compare solo in un ramo e la card non si vedeva. */
    const [statoMese, setStatoMese] = useState(null);   // { vuoto, prevHas }
    const [divisioni, setDivisioni] = useState([]);     // le gare impostate nel mese
    const [divisione, setDivisione] = useState("");     // "" = riconosci dal nome del file
    const [copiando, setCopiando] = useState(false);
    const prevMonth = (() => {
        const [y, m] = String(month).slice(0, 7).split("-").map(Number);
        const d = new Date(y, m - 2, 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    })();
    const [lavoro, setLavoro] = useState("");
    const [errore, setErrore] = useState("");
    const [aperta, setAperta] = useState(true);
    const [scelte, setScelte] = useState({});           // id proposta -> Set di indici
    const [accAperte, setAccAperte] = useState({});     // id proposta -> gruppo accessorio aperto

    const puoi = isAdminOrAbove(user?.role);

    /* ⚠️ lo stato del mese si decide con le due query sulle piste e BASTA.
       Prima stava nello stesso Promise.all della fetch all'AI: se quella
       falliva (rete, 500 in HTML) `statoMese` restava null per sempre e la
       card non compariva più — proprio il caso che non deve succedere. */
    const carica = async () => {
        try {
            const [ora, prima] = await Promise.all([
                supabase.from("gare_azienda_piste").select("id,gara").eq("brand", brand).eq("month", month),
                supabase.from("gare_azienda_piste").select("id").eq("brand", brand).eq("month", prevMonth).limit(1),
            ]);
            setStatoMese({ vuoto: !(ora.data || []).length, prevHas: !!(prima.data || []).length });
            setDivisioni([...new Set((ora.data || []).map((p) => p.gara).filter(Boolean))]);
        } catch { setStatoMese({ vuoto: true, prevHas: false }); }
        try {
            const d = await fetch(`/api/ai/gare-lettera?brand=${brand}&month=${month}`, { credentials: "include", cache: "no-store" }).then((r) => r.json());
            setProposte(d.proposte || []);
        } catch { setProposte([]); }
    };

    const copiaMesePrima = async () => {
        setCopiando(true); setErrore("");
        const { error } = await supabase.rpc("gare_copy_month", { p_brand: brand, p_from: prevMonth, p_to: month, p_livello: "azienda" });
        if (error) setErrore("Copia non riuscita: " + error.message);
        await carica();
        setCopiando(false);
        if (!error && onFatto) onFatto();
    };
    /* cambiando operatore o mese si riparte da zero, DIVISIONE COMPRESA: una
       scelta rimasta da prima punterebbe a una gara che qui non esiste, e il
       server la rifiuta (giustamente) con un errore che sembra un guasto. */
    useEffect(() => { setProposte(null); setStatoMese(null); setErrore(""); setInArchivio(""); setDivisione(""); setDivisioni([]); carica(); }, [brand, month]); // eslint-disable-line

    /* LA DIVISIONE DAL NOME DEL FILE. «GARA SETTEMBRE FRANCHISING.pptx» parla
       solo del franchising: darla anche al multibrand ha prodotto, il 04/09,
       109 proposte su piste che quella lettera non nomina nemmeno. Se il nome
       non dice niente si legge tutto, come prima, ma lo si sa. */
    const dalNome = (nome, elenco) => {
        const n = String(nome || "").toLowerCase();
        if (/multibrand[\s_-]*(t2|2)|dealer/.test(n)) return elenco.includes("multibrand_t2") ? "multibrand_t2" : "";
        if (/multibrand/.test(n)) return elenco.includes("multibrand") ? "multibrand" : "";
        if (/franchising|retail/.test(n)) return elenco.includes("franchising") ? "franchising" : "";
        return "";
    };

    /* la lettera si legge QUI nel browser: al server va solo il testo, non il file */
    const leggiEProponi = async (file) => {
        if (!file) return;
        setErrore("");
        try {
            /* ⚠️ SU UN MESE VUOTO LA BASE SE LA PREPARA LUI. La lettera si legge
               CONTRO qualcosa: il server rifiuta un mese senza righe, e ha
               ragione — le proposte devono puntare a righe nate in QUESTO mese,
               non a quelle del mese già pagato. Ma per Luca i due pulsanti sono
               alternative («o copio le regole del mese prima o leggo la lettera
               con l'AI»): se sceglie l'AI, la copia la faccio io qui, in
               silenzio, e poi correggo. Senza questo il pulsante era offerto
               esattamente nello stato in cui il server lo rifiuta, e te ne
               accorgevi dopo un minuto di lettura del PDF. */
            if (statoMese?.vuoto) {
                setLavoro(`Preparo la base con ${meseIt(prevMonth)}…`);
                const { error } = await supabase.rpc("gare_copy_month", { p_brand: brand, p_from: prevMonth, p_to: month, p_livello: "azienda" });
                if (error) throw new Error(`non sono riuscito a copiare ${meseIt(prevMonth)} come base: ${error.message}`);
                setStatoMese((v) => ({ ...v, vuoto: false }));
                if (onFatto) onFatto();
            }
            /* ⚠️ sul mese appena copiato l'elenco delle divisioni è ancora
               vuoto (la card l'aveva letto quando il mese non esisteva): senza
               rileggerlo, il riconoscimento dal nome del file non scatterebbe
               MAI sulla prima lettura di un mese nuovo — cioè proprio quella. */
            let elenco = divisioni;
            if (!elenco.length) {
                const { data } = await supabase.from("gare_azienda_piste").select("gara").eq("brand", brand).eq("month", month);
                elenco = [...new Set((data || []).map((x) => x.gara).filter(Boolean))];
                setDivisioni(elenco);
            }
            const div = divisione === "tutte" ? "" : (divisione || dalNome(file.name, elenco));
            setLavoro("Leggo la lettera…");
            const a = await leggiAllegato(file, 60000);
            if (!a.testo) throw new Error(a.problema || "non sono riuscito a leggerla");
            setLavoro(`Confronto ${Math.round(a.testo.length / 1000)}k caratteri${div ? ` con le piste ${NOME_DIV[div] || div}` : ""} di ${meseIt(month)}…`);
            const r = await fetch("/api/ai/gare-lettera", {
                method: "POST", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ azione: "proponi", brand, month, testo: a.testo, lettera_nome: file.name, divisione: div || null }),
            });
            const d = await r.json();
            if (!r.ok || d.error) throw new Error(d.error || "il server non ha risposto");
            // letta bene: adesso la lettera va in archivio, con il file vero
            setLavoro("Archivio la lettera…");
            try {
                const pulito = file.name.replace(/[^A-Za-z0-9àèéìòù._ -]/g, "_");
                const path = `lettere/${brand}/${String(month).slice(0, 7)}/${Date.now()}-${pulito}`;
                const { error } = await supabase.storage.from("contracts").upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
                if (!error) {
                    await supabase.from("gare_lettere").insert({ brand, month, filename: file.name, path, created_by: user?.name || null });
                    setInArchivio(file.name);
                    /* la card «Lettere di gara» sta SOPRA questa: senza questo
                       avviso continuava a dire «nessuna per Settembre» mentre
                       qui sotto c'era scritto che era stata archiviata. */
                    if (onFatto) onFatto();
                }
            } catch { /* la proposta c'è comunque: l'archivio non deve bloccare il lavoro */ }
            await carica();
        } catch (e) { setErrore(String(e?.message || e)); }
        setLavoro("");
    };

    /* ── LE SPUNTE ────────────────────────────────────────────────────────
       Di default sono accese SOLO le modifiche del gruppo chiave (i numeri).
       Prima erano accese tutte e trecentotrentaquattro: premere «Applica le
       spuntate» era un piede sul grilletto. Le proposte vecchie, che il campo
       `chiave` non ce l'hanno, nascono con NESSUNA spunta: si scelgono a mano. */
    /* le righe GIÀ APPLICATE (si applica anche in due volte: prima i numeri,
       poi le accessorie) non si ripropongono e non si possono rispuntare */
    const fatte = (p) => new Set(((p.applicato || {}).indici || []).map(String));
    const esitoDi = (p, i) => ((p.applicato || {}).esiti || {})[String(i)] || "chiusa";
    const SCRITTE = ["aggiornata", "rimossa", "aggiunta"];
    /* Di default si accendono le modifiche sui NUMERI, meno quelle già chiuse
       e meno le PERICOLOSE: togliere una pista si porta via a cascata tutte le
       sue soglie, voci e regole, e quella casella la accende una persona. */
    const indiciChiave = (p) => {
        const g = fatte(p);
        return new Set((p.diff || []).map((m, i) => (m.chiave && !m.pericolosa && !g.has(String(i)) ? String(i) : null)).filter(Boolean));
    };
    const selDi = (p) => scelte[p.id] || indiciChiave(p);
    const spunta = (p, i) => setScelte((s) => {
        if (fatte(p).has(String(i))) return s;
        const cur = new Set(s[p.id] || indiciChiave(p));
        const k = String(i); cur.has(k) ? cur.delete(k) : cur.add(k);
        return { ...s, [p.id]: cur };
    });
    const spuntata = (p, i) => selDi(p).has(String(i));
    const spuntaGruppo = (p, indici, acceso) => setScelte((s) => {
        const g = fatte(p);
        const cur = new Set(s[p.id] || indiciChiave(p));
        indici.forEach((i) => (acceso && !g.has(String(i)) ? cur.add(String(i)) : cur.delete(String(i))));
        return { ...s, [p.id]: cur };
    });

    const decidi = async (p, azione) => {
        if (azione === "applica") {
            const quante = selDi(p).size;
            if (!quante) return setErrore("Non hai spuntato nessuna modifica.");
            if (!window.confirm(`Applico ${quante} ${quante === 1 ? "modifica" : "modifiche"} a ${meseIt(month)}? Le tabelle della gara vengono scritte subito.`)) return;
        }
        setLavoro(azione === "applica" ? "Applico…" : "Scarto…");
        try {
            const r = await fetch("/api/ai/gare-lettera", {
                method: "POST", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ azione, brand, month, id: p.id, scelte: azione === "applica" ? [...selDi(p)] : null }),
            });
            const d = await r.json();
            if (!r.ok || d.error) throw new Error(d.error || "non riuscito");
            const guai = [
                ...(d.avviso ? [d.avviso] : []),
                ...(d.errori?.length ? ["Alcune righe non sono passate: " + d.errori.join(" · ")] : []),
            ];
            if (guai.length) setErrore(guai.join(" — "));
            // le spunte tenute in memoria non valgono più: le righe applicate
            // adesso sono chiuse, e la selezione si ricalcola da quelle rimaste
            setScelte((s) => { const c = { ...s }; delete c[p.id]; return c; });
            await carica();
            if (azione === "applica" && onFatto) onFatto();
        } catch (e) { setErrore(String(e?.message || e)); }
        setLavoro("");
    };

    /* il PDF dei cambiamenti: prima il riassunto passo per passo, POI il
       dettaglio — raggruppato per pista come nel riassunto, così il foglio che
       porti in riunione si legge nello stesso ordine della schermata */
    const stampa = (p) => {
        // ⚠️ i nomi delle voci contengono & e < (Casa&Famiglia, <90%): finiscono
        // in una pagina HTML, quindi si scappano SEMPRE prima di scriverli
        const esc = (v) => String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
        const diff = p.diff || [];
        const gruppi = [];
        diff.forEach((m, i) => {
            const g = m.gruppo || m.tabella || "—";
            let riga = gruppi.find((x) => x.nome === g);
            if (!riga) { riga = { nome: g, voci: [] }; gruppi.push(riga); }
            riga.voci.push({ m, i });
        });
        const blocchi = gruppi.map((g) => {
            const righe = g.voci.map(({ m, i }) => {
                const che = m.operazione === "aggiungi" ? "Aggiunta" : m.operazione === "rimuovi" ? "Rimossa" : "Modificata";
                const testo = m.riga || `${m.tabella} · ${m.campo || ""} ${m.operazione === "aggiorna" ? `${numIt(m.da)} → ${numIt(m.a)}` : ""}`;
                const perche = fatte(p).has(String(i)) ? `${esc(m.motivo)} <i>(${esc(esitoDi(p, i))})</i>` : esc(m.motivo);
                return `<tr><td>${i + 1}</td><td>${esc(m.tabella)}</td><td>${che}</td><td>${m.chiave ? "<b>numeri</b>" : ""}</td><td>${esc(testo)}</td><td>${perche}</td></tr>`;
            }).join("");
            return `<h2>${esc(g.nome)}</h2><table><thead><tr><th>#</th><th>Tabella</th><th>Cosa</th><th>Peso</th><th>Modifica</th><th>Perché</th></tr></thead><tbody>${righe}</tbody></table>`;
        }).join("");
        const w = window.open("", "_blank");
        if (!w) { setErrore("Il browser ha bloccato la finestra della stampa: sbloccala e riprova."); return; }
        w.document.write(`<!doctype html><meta charset="utf-8"><title>Cambiamenti gara ${brand} ${meseIt(month)}</title>
<style>body{font-family:Arial,Helvetica,sans-serif;margin:28px;color:#111}h1{font-size:19px;margin:0 0 2px}
h2{font-size:12px;text-transform:uppercase;letter-spacing:.09em;color:#2b2fd6;margin:18px 0 4px;border-bottom:1px solid #d8d7f5;padding-bottom:3px}
p.sub{color:#666;font-size:12px;margin:0 0 16px}table{border-collapse:collapse;width:100%;font-size:11px;margin-bottom:4px}
th{background:#2b2fd6;color:#fff;text-align:left;padding:5px}td{border-bottom:1px solid #ddd;padding:5px;vertical-align:top}
.r{background:#f6f5ff;padding:10px 12px;border-left:3px solid #2b2fd6;font-size:12px;margin-bottom:14px;white-space:pre-wrap;line-height:1.5}
.av{color:#8a5a00;font-size:11px;margin-top:12px}</style>
<h1>Cambiamenti della gara — ${brand.toUpperCase()} · ${meseIt(month)}</h1>
<p class="sub">Confronto con ${meseIt(p.mese_base || month)} · lettera: ${esc(p.lettera_nome || "—")} · proposta del ${new Date(p.created_at).toLocaleString("it-IT")} · ${diff.length} modifiche</p>
${p.riassunto ? `<div class="r">${esc(p.riassunto)}</div>` : ""}
${blocchi}
${(p.avvisi || []).length ? `<div class="av"><b>Da controllare a mano:</b><br>${(p.avvisi || []).map(esc).join("<br>")}</div>` : ""}`);
        w.document.close(); w.focus(); setTimeout(() => w.print(), 400);
    };

    /* una tabella di modifiche: la stessa forma per i due gruppi.
       ⚠️ è una FUNZIONE che si chiama, non un componente scritto dentro il
       render: definire un componente qui dentro ne crea uno nuovo a ogni giro
       e React rimonta tutta la tabella a ogni spunta — con trenta righe si
       perde la posizione dello scorrimento a ogni click. */
    const tabella = (p, voci, bozza, chiuse) => (
        <div className="max-h-[340px] overflow-auto">
            <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-[#151827]">
                    <tr className="text-slate-500 text-[9px] uppercase tracking-wider">
                        {bozza && <th className="w-8 py-1.5"></th>}
                        <th className="text-left px-2 py-1.5">Pista</th>
                        <th className="text-left px-2 py-1.5">Modifica</th>
                        <th className="text-left px-2 py-1.5">Tabella</th>
                        <th className="text-left px-2 py-1.5">Perché</th>
                    </tr>
                </thead>
                <tbody>
                    {voci.map(({ m, i }) => {
                        const Ico = ICONA[m.operazione] || PencilLine;
                        const gia = chiuse.has(String(i));
                        const esito = gia ? esitoDi(p, i) : "";
                        const scritta = SCRITTE.includes(esito);
                        return (
                            <tr key={i} className={cn("border-t border-white/5",
                                gia ? (scritta ? "opacity-45 bg-emerald-500/[0.05]" : "bg-amber-500/[0.07]")
                                    : bozza && !spuntata(p, i) && "opacity-35")}>
                                {bozza && (
                                    <td className="text-center">
                                        {gia ? (scritta ? <Check className="w-3.5 h-3.5 text-emerald-400 mx-auto" />
                                                        : <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mx-auto" />)
                                            : <input type="checkbox" checked={spuntata(p, i)} onChange={() => spunta(p, i)}
                                                className="accent-indigo-500 w-3.5 h-3.5" />}
                                    </td>
                                )}
                                <td className="px-2 py-1.5 text-slate-400 whitespace-nowrap">{m.gruppo || "—"}</td>
                                <td className="px-2 py-1.5 text-slate-200">
                                    {m.riga || (m.operazione === "aggiorna"
                                        ? <>{m.campo}: <span className="text-slate-500 line-through">{numIt(m.da)}</span> <span className="text-slate-600">→</span> <span className="font-bold text-white">{numIt(m.a)}</span></>
                                        : Object.entries(m.dati || {}).filter(([, v]) => v !== null && v !== "").map(([k, v]) => `${k}: ${numIt(v)}`).join(" · "))}
                                </td>
                                <td className="px-2 py-1.5">
                                    <span className={cn("inline-flex items-center gap-1 font-semibold", COLORE[m.operazione])}>
                                        <Ico className="w-3 h-3" />{m.tabella}
                                    </span>
                                </td>
                                <td className="px-2 py-1.5 text-slate-500">
                                    {gia ? <span className={scritta ? "text-emerald-400/80" : "text-amber-300"}>{esito}</span>
                                        : <>{m.pericolosa && <span className="text-rose-300 font-semibold">cancella tutta la pista · </span>}{m.motivo || ""}</>}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );

    return (
        <div className="glass-panel rounded-2xl overflow-hidden">
            {statoMese === null ? (
                <div className="px-4 py-3 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
                    <span className="text-[12px] text-slate-500">Guardo com&apos;è messo {meseIt(month)}…</span>
                </div>
            ) : statoMese.vuoto ? (
                /* il mese non è ancora impostato: si sceglie da dove partire */
                <div className="p-5 text-center space-y-3">
                    <p className="text-sm text-slate-400">Lato azienda non ancora impostato per {meseIt(month)}. Da dove partiamo?</p>
                    <div className="flex flex-wrap items-center justify-center gap-2.5">
                        {puoi && statoMese.prevHas && (
                            <button onClick={copiaMesePrima} disabled={copiando || !!lavoro}
                                className={cn("flex items-center gap-2 px-3.5 py-2 rounded-xl text-[12px] font-bold border transition-colors",
                                    "bg-white/[0.04] border-white/10 text-slate-200 hover:bg-white/[0.08]", (copiando || lavoro) && "opacity-40")}>
                                {copiando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                                Copia le regole di {meseIt(prevMonth)}
                            </button>
                        )}
                        {puoi && statoMese.prevHas && (
                            <label className={cn("flex items-center gap-2 px-3.5 py-2 rounded-xl text-[12px] font-bold cursor-pointer border transition-colors",
                                lavoro ? "bg-white/5 border-white/10 text-slate-500" : "bg-indigo-500/20 border-indigo-400/30 text-indigo-200 hover:bg-indigo-500/30")}>
                                {lavoro ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                {lavoro || "Leggi la lettera con l'AI"}
                                <input type="file" className="hidden" disabled={!!lavoro}
                                    accept=".pdf,.pptx,.xlsx,.xls,.csv,.txt"
                                    onChange={(e) => leggiEProponi(e.target.files?.[0])} />
                            </label>
                        )}
                    </div>
                    <p className="text-[11px] text-slate-500">
                        {statoMese.prevHas
                            ? "La lettera non serve caricarla prima: dalla qui, viene letta e poi finisce da sola in archivio."
                            : `Per questo operatore non c'è ancora nessun mese impostato: le regole vanno create una prima volta a mano, poi ogni mese si copiano e si correggono con la lettera.`}
                    </p>
                </div>
            ) : (
                <div className="px-4 py-3 flex flex-wrap items-center gap-2 cursor-pointer select-none" onClick={() => setAperta((v) => !v)}>
                    <Sparkles className="w-4 h-4" style={{ color: colore }} />
                    <h3 className="text-[13px] font-bold text-slate-200 tracking-wide">Lettera dell&apos;operatore</h3>
                    <span className="text-[10px] text-slate-500">l&apos;AI propone le modifiche, ad applicarle sei tu</span>
                    <div className="ml-auto flex items-center gap-2">
                        {puoi && divisioni.length > 1 && (
                            /* QUALE PARTE DELLA GARA parla questa lettera. Con «riconosci
                               dal nome» una «GARA SETTEMBRE FRANCHISING.pptx» va solo
                               sulle piste del franchising. */
                            <select value={divisione} onChange={(e) => setDivisione(e.target.value)} onClick={(e) => e.stopPropagation()}
                                className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-slate-300 outline-none">
                                <option value="">Divisione: dal nome del file</option>
                                {divisioni.map((d) => <option key={d} value={d}>Solo {NOME_DIV[d] || d}</option>)}
                                <option value="tutte">Tutte le divisioni</option>
                            </select>
                        )}
                        {puoi && (
                            <label onClick={(e) => e.stopPropagation()}
                                className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-colors",
                                    lavoro ? "bg-white/5 text-slate-500" : "bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25")}>
                                {lavoro ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                {lavoro || `Leggi la lettera di ${meseIt(month)}`}
                                <input type="file" className="hidden" disabled={!!lavoro}
                                    accept=".pdf,.pptx,.xlsx,.xls,.csv,.txt"
                                    onChange={(e) => leggiEProponi(e.target.files?.[0])} />
                            </label>
                        )}
                        {aperta ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                    </div>
                </div>
            )}

            {(statoMese !== null && aperta && (!statoMese.vuoto || (proposte && proposte.length) || errore)) && (
                <div className="px-4 pb-3 border-t border-white/5 pt-3 space-y-3">
                    {inArchivio && (
                        <p className="text-[11px] text-emerald-300/80">«{inArchivio}» è stata archiviata fra le lettere di {meseIt(month)}.</p>
                    )}
                    {errore && (
                        <div className="flex items-start gap-2 rounded-lg bg-rose-500/10 border border-rose-500/20 px-3 py-2 text-[11px] text-rose-200">
                            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span>{errore}</span>
                        </div>
                    )}
                    {proposte === null ? (
                        <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin text-slate-500" /></div>
                    ) : !proposte.length ? (
                        <p className="text-xs text-slate-500 py-1">
                            Nessuna lettura per {meseIt(month)}. Dai la lettera dell&apos;operatore: il modello la confronta con il mese precedente e ti propone riga per riga cosa cambia.
                        </p>
                    ) : proposte.map((p) => {
                        const diff = p.diff || [];
                        const bozza = p.stato === "bozza";
                        const conIndice = diff.map((m, i) => ({ m, i }));
                        const gChiave = conIndice.filter(({ m }) => m.chiave);
                        const gResto = conIndice.filter(({ m }) => !m.chiave);
                        const accApert = !!accAperte[p.id];
                        const nSpunte = selDi(p).size;
                        // una volta sola per proposta, non una per riga
                        const chiuse = fatte(p);
                        const nFatte = chiuse.size;
                        return (
                            <div key={p.id} className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
                                <div className="px-3 py-2.5 flex flex-wrap items-center gap-2 border-b border-white/5">
                                    <span className={cn("text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border",
                                        bozza ? "bg-amber-500/15 text-amber-300 border-amber-500/25"
                                            : p.stato === "applicata" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25"
                                                : "bg-white/5 text-slate-500 border-white/10")}>{p.stato}</span>
                                    <span className="text-[11px] text-slate-300 font-semibold">
                                        {gChiave.length} sui numeri{gResto.length ? ` · ${gResto.length} accessorie` : ""}
                                        {nFatte ? <span className="text-emerald-400/80 font-normal"> · {nFatte} già applicate</span> : null}
                                    </span>
                                    <span className="text-[10px] text-slate-500">da {p.lettera_nome || "lettera"} · base {meseIt(p.mese_base || month)} · {new Date(p.created_at).toLocaleString("it-IT")}</span>
                                    <div className="ml-auto flex items-center gap-1.5">
                                        <button onClick={() => stampa(p)} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] text-slate-300">
                                            <FileDown className="w-3.5 h-3.5" /> PDF cambiamenti
                                        </button>
                                        {bozza && puoi && (
                                            <>
                                                <button onClick={() => decidi(p, "applica")} disabled={!!lavoro || !nSpunte}
                                                    className={cn("flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold",
                                                        nSpunte ? "bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300" : "bg-white/5 text-slate-600")}>
                                                    <Check className="w-3.5 h-3.5" /> Applica le {nSpunte} spuntate
                                                </button>
                                                <button onClick={() => decidi(p, "scarta")} disabled={!!lavoro}
                                                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-rose-500/20 text-[11px] text-slate-400 hover:text-rose-300">
                                                    <X className="w-3.5 h-3.5" /> Scarta
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {p.riassunto && <Riassunto testo={p.riassunto} />}

                                {/* ① I NUMERI. Aperti e spuntati: sono quelli che pagano. */}
                                {gChiave.length > 0 && (
                                    <>
                                        <div className="px-3 py-1.5 flex items-center gap-2 bg-emerald-500/[0.06] border-b border-white/5">
                                            <ListChecks className="w-3.5 h-3.5 text-emerald-300" />
                                            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-300">Modifiche sui numeri — {gChiave.length}</span>
                                            {bozza && (
                                                <div className="ml-auto flex items-center gap-1.5">
                                                    <button onClick={() => spuntaGruppo(p, gChiave.map((x) => x.i), true)} className="text-[10px] text-slate-400 hover:text-slate-200">tutte</button>
                                                    <span className="text-slate-700">·</span>
                                                    <button onClick={() => spuntaGruppo(p, gChiave.map((x) => x.i), false)} className="text-[10px] text-slate-400 hover:text-slate-200">nessuna</button>
                                                </div>
                                            )}
                                        </div>
                                        {tabella(p, gChiave, bozza, chiuse)}
                                    </>
                                )}

                                {/* ② LE ACCESSORIE. Chiuse e non spuntate: descrizioni,
                                    note, e le righe nuove senza un importo — quelle che
                                    non si possono verificare a colpo d'occhio. Ci sono,
                                    ma non si applicano per sbaglio insieme alle altre. */}
                                {gResto.length > 0 && (
                                    <>
                                        <div className="px-3 py-1.5 flex items-center gap-2 bg-white/[0.03] border-y border-white/5 cursor-pointer select-none"
                                            onClick={() => setAccAperte((s) => ({ ...s, [p.id]: !s[p.id] }))}>
                                            {accApert ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />}
                                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Accessorie — {gResto.length}</span>
                                            <span className="text-[10px] text-slate-600">descrizioni, note, righe senza importo · non spuntate</span>
                                            {bozza && accApert && (
                                                <div className="ml-auto flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                                    <button onClick={() => spuntaGruppo(p, gResto.map((x) => x.i), true)} className="text-[10px] text-slate-400 hover:text-slate-200">tutte</button>
                                                    <span className="text-slate-700">·</span>
                                                    <button onClick={() => spuntaGruppo(p, gResto.map((x) => x.i), false)} className="text-[10px] text-slate-400 hover:text-slate-200">nessuna</button>
                                                </div>
                                            )}
                                        </div>
                                        {accApert && tabella(p, gResto, bozza, chiuse)}
                                    </>
                                )}

                                {!diff.length && (
                                    <p className="px-3 py-3 text-[11px] text-slate-500">Nessuna modifica proposta da questa lettura.</p>
                                )}

                                {(p.avvisi || []).length > 0 && (
                                    <div className="px-3 py-2 border-t border-white/5 bg-amber-500/[0.06]">
                                        <p className="text-[10px] font-bold text-amber-300 uppercase tracking-wider mb-1">Da controllare a mano</p>
                                        <ul className="text-[11px] text-amber-200/80 space-y-0.5">
                                            {(p.avvisi || []).map((a, i) => <li key={i}>· {a}</li>)}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
