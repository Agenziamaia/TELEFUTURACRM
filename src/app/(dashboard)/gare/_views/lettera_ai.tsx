// @ts-nocheck
"use client";

/* ═══ LA LETTERA LETTA DALL'AI ═════════════════════════════════════════════
   Luca 04/09/2026: «gli diciamo di leggere la lettera di gara nuova che gli
   alleghiamo e a quel punto di compilare i dati della tabella con i nuovi
   valori del mese, e di fare anche un pdf con i cambiamenti».

   Il flusso è: carichi la lettera → il modello la confronta con il mese base
   → esce un elenco di modifiche, una per riga, con vecchio e nuovo valore.
   NIENTE viene scritto finché non spunti le righe e premi Applica: queste
   tabelle decidono i compensi delle persone. */

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { isAdminOrAbove } from "@/lib/roles";
import { leggiAllegato } from "@/lib/ai/allegati";
import { cn } from "@/utils";
import { Sparkles, Loader2, Check, X, FileDown, ChevronDown, ChevronUp, AlertTriangle, Plus, Minus, PencilLine, Copy } from "lucide-react";

const meseIt = (iso) => {
    const [y, m] = String(iso).split("-").map(Number);
    const s = new Date(y, m - 1, 1).toLocaleDateString("it-IT", { month: "long", year: "numeric" });
    return s.charAt(0).toUpperCase() + s.slice(1);
};
const numIt = (v) => (v === null || v === undefined || v === "" ? "—" :
    typeof v === "number" ? String(v).replace(".", ",") : String(v));

const ICONA = { aggiorna: PencilLine, aggiungi: Plus, rimuovi: Minus };
const COLORE = { aggiorna: "text-amber-300", aggiungi: "text-emerald-300", rimuovi: "text-rose-300" };

/* Il mese si imposta in un modo solo: o si copia quello prima, o si dà la
   lettera all'AI. I due pulsanti stanno QUI, insieme — Luca 04/09: «devi
   darmi solamente queste due opzioni che scelgo e poi vado avanti».
   La lettera NON si carica prima: la si dà da leggere, e se la lettura va a
   buon fine finisce da sola nell'archivio del mese. */
export function LetteraAI({ brand, month, colore = "var(--tf-818cf8)", vuoto = false, prevMonth, onCopia, copiando = false, onFatto }) {
    const { user } = useAuth();
    const [proposte, setProposte] = useState(null);
    const [inArchivio, setInArchivio] = useState("");
    const [lavoro, setLavoro] = useState("");
    const [errore, setErrore] = useState("");
    const [aperta, setAperta] = useState(true);
    const [scelte, setScelte] = useState({});           // id proposta -> Set di indici

    const puoi = isAdminOrAbove(user?.role);

    const carica = async () => {
        const d = await fetch(`/api/ai/gare-lettera?brand=${brand}&month=${month}`, { credentials: "include", cache: "no-store" }).then((r) => r.json());
        setProposte(d.proposte || []);
    };
    useEffect(() => { setProposte(null); setErrore(""); carica(); }, [brand, month]); // eslint-disable-line

    /* la lettera si legge QUI nel browser: al server va solo il testo, non il file */
    const leggiEProponi = async (file) => {
        if (!file) return;
        setErrore(""); setLavoro("Leggo la lettera…");
        try {
            const a = await leggiAllegato(file, 60000);
            if (!a.testo) throw new Error(a.problema || "non sono riuscito a leggerla");
            setLavoro(`Confronto ${Math.round(a.testo.length / 1000)}k caratteri con ${meseIt(month)} precedente…`);
            const r = await fetch("/api/ai/gare-lettera", {
                method: "POST", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ azione: "proponi", brand, month, testo: a.testo, lettera_nome: file.name }),
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
                }
            } catch { /* la proposta c'è comunque: l'archivio non deve bloccare il lavoro */ }
            await carica();
        } catch (e) { setErrore(String(e?.message || e)); }
        setLavoro("");
    };

    const decidi = async (p, azione) => {
        const sel = scelte[p.id];
        if (azione === "applica") {
            const quante = sel ? sel.size : (p.diff || []).length;
            if (!quante) return setErrore("Non hai spuntato nessuna modifica.");
            if (!window.confirm(`Applico ${quante} modifiche a ${meseIt(month)}? Le tabelle della gara vengono scritte subito.`)) return;
        }
        setLavoro(azione === "applica" ? "Applico…" : "Scarto…");
        try {
            const r = await fetch("/api/ai/gare-lettera", {
                method: "POST", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ azione, brand, month, id: p.id, scelte: sel ? [...sel] : null }),
            });
            const d = await r.json();
            if (!r.ok || d.error) throw new Error(d.error || "non riuscito");
            if (d.errori?.length) setErrore("Alcune righe non sono passate: " + d.errori.join(" · "));
            await carica();
            if (azione === "applica" && onFatto) onFatto();
        } catch (e) { setErrore(String(e?.message || e)); }
        setLavoro("");
    };

    const spunta = (p, i) => setScelte((s) => {
        const cur = new Set(s[p.id] || (p.diff || []).map((_, k) => String(k)));
        const k = String(i); cur.has(k) ? cur.delete(k) : cur.add(k);
        return { ...s, [p.id]: cur };
    });
    const spuntata = (p, i) => (scelte[p.id] ? scelte[p.id].has(String(i)) : true);

    /* il PDF dei cambiamenti: si stampa la stessa tabella che stai guardando,
       senza costruire un secondo documento che poi diverge da questo */
    const stampa = (p) => {
        const righe = (p.diff || []).map((m, i) => {
            const che = m.operazione === "aggiungi" ? "Aggiunta" : m.operazione === "rimuovi" ? "Rimossa" : "Modificata";
            const dove = m.operazione === "aggiungi"
                ? Object.entries(m.dati || {}).map(([k, v]) => `${k}: ${numIt(v)}`).join(" · ")
                : `${m.campo || ""}`;
            const val = m.operazione === "aggiorna" ? `${numIt(m.da)} → <b>${numIt(m.a)}</b>` : "";
            return `<tr><td>${i + 1}</td><td>${m.tabella}</td><td>${che}</td><td>${dove}</td><td>${val}</td><td>${m.motivo || ""}</td></tr>`;
        }).join("");
        const w = window.open("", "_blank");
        w.document.write(`<!doctype html><meta charset="utf-8"><title>Cambiamenti gara ${brand} ${meseIt(month)}</title>
<style>body{font-family:Arial,Helvetica,sans-serif;margin:28px;color:#111}h1{font-size:19px;margin:0 0 2px}
p.sub{color:#666;font-size:12px;margin:0 0 16px}table{border-collapse:collapse;width:100%;font-size:11px}
th{background:#2b2fd6;color:#fff;text-align:left;padding:6px}td{border-bottom:1px solid #ddd;padding:6px;vertical-align:top}
.r{background:#f6f5ff;padding:10px 12px;border-left:3px solid #2b2fd6;font-size:12px;margin-bottom:14px}
.av{color:#8a5a00;font-size:11px;margin-top:12px}</style>
<h1>Cambiamenti della gara — ${brand.toUpperCase()} · ${meseIt(month)}</h1>
<p class="sub">Confronto con ${meseIt(p.mese_base || month)} · lettera: ${p.lettera_nome || "—"} · proposta del ${new Date(p.created_at).toLocaleString("it-IT")}</p>
${p.riassunto ? `<div class="r">${p.riassunto}</div>` : ""}
<table><thead><tr><th>#</th><th>Tabella</th><th>Cosa</th><th>Dove</th><th>Valore</th><th>Perché</th></tr></thead><tbody>${righe}</tbody></table>
${(p.avvisi || []).length ? `<div class="av"><b>Da controllare a mano:</b><br>${(p.avvisi || []).join("<br>")}</div>` : ""}`);
        w.document.close(); w.focus(); setTimeout(() => w.print(), 400);
    };

    return (
        <div className="glass-panel rounded-2xl overflow-hidden">
            {vuoto ? (
                /* il mese non è ancora impostato: si sceglie da dove partire */
                <div className="p-5 text-center space-y-3">
                    <p className="text-sm text-slate-400">Lato azienda non ancora impostato per {meseIt(month)}. Da dove partiamo?</p>
                    <div className="flex flex-wrap items-center justify-center gap-2.5">
                        {onCopia && (
                            <button onClick={onCopia} disabled={copiando || !!lavoro}
                                className={cn("flex items-center gap-2 px-3.5 py-2 rounded-xl text-[12px] font-bold border transition-colors",
                                    "bg-white/[0.04] border-white/10 text-slate-200 hover:bg-white/[0.08]", (copiando || lavoro) && "opacity-40")}>
                                {copiando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                                Copia le regole di {prevMonth ? meseIt(prevMonth) : "il mese prima"}
                            </button>
                        )}
                        {puoi && (
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
                        La lettera non serve caricarla prima: dalla qui, viene letta e poi finisce da sola in archivio.
                    </p>
                </div>
            ) : (
                <div className="px-4 py-3 flex items-center gap-2 cursor-pointer select-none" onClick={() => setAperta((v) => !v)}>
                    <Sparkles className="w-4 h-4" style={{ color: colore }} />
                    <h3 className="text-[13px] font-bold text-slate-200 tracking-wide">Lettera dell&apos;operatore</h3>
                    <span className="text-[10px] text-slate-500">l&apos;AI propone le modifiche, ad applicarle sei tu</span>
                    <div className="ml-auto flex items-center gap-2">
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

            {(aperta && (!vuoto || (proposte && proposte.length) || errore)) && (
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
                        return (
                            <div key={p.id} className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
                                <div className="px-3 py-2.5 flex flex-wrap items-center gap-2 border-b border-white/5">
                                    <span className={cn("text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border",
                                        bozza ? "bg-amber-500/15 text-amber-300 border-amber-500/25"
                                            : p.stato === "applicata" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25"
                                                : "bg-white/5 text-slate-500 border-white/10")}>{p.stato}</span>
                                    <span className="text-[11px] text-slate-300 font-semibold">{diff.length} modifiche proposte</span>
                                    <span className="text-[10px] text-slate-500">da {p.lettera_nome || "lettera"} · base {meseIt(p.mese_base || month)} · {new Date(p.created_at).toLocaleString("it-IT")}</span>
                                    <div className="ml-auto flex items-center gap-1.5">
                                        <button onClick={() => stampa(p)} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] text-slate-300">
                                            <FileDown className="w-3.5 h-3.5" /> PDF cambiamenti
                                        </button>
                                        {bozza && puoi && (
                                            <>
                                                <button onClick={() => decidi(p, "applica")} disabled={!!lavoro}
                                                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-[11px] font-bold text-emerald-300">
                                                    <Check className="w-3.5 h-3.5" /> Applica le spuntate
                                                </button>
                                                <button onClick={() => decidi(p, "scarta")} disabled={!!lavoro}
                                                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-rose-500/20 text-[11px] text-slate-400 hover:text-rose-300">
                                                    <X className="w-3.5 h-3.5" /> Scarta
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {p.riassunto && <p className="px-3 py-2 text-[11px] text-slate-300 leading-relaxed border-b border-white/5">{p.riassunto}</p>}

                                <div className="max-h-[360px] overflow-auto">
                                    <table className="w-full text-[11px]">
                                        <thead className="sticky top-0 bg-[#151827]">
                                            <tr className="text-slate-500 text-[9px] uppercase tracking-wider">
                                                {bozza && <th className="w-8 py-1.5"></th>}
                                                <th className="text-left px-2 py-1.5">Tabella</th>
                                                <th className="text-left px-2 py-1.5">Dove</th>
                                                <th className="text-left px-2 py-1.5">Valore</th>
                                                <th className="text-left px-2 py-1.5">Perché</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {diff.map((m, i) => {
                                                const Ico = ICONA[m.operazione] || PencilLine;
                                                return (
                                                    <tr key={i} className={cn("border-t border-white/5", bozza && !spuntata(p, i) && "opacity-35")}>
                                                        {bozza && (
                                                            <td className="text-center">
                                                                <input type="checkbox" checked={spuntata(p, i)} onChange={() => spunta(p, i)}
                                                                    className="accent-indigo-500 w-3.5 h-3.5" />
                                                            </td>
                                                        )}
                                                        <td className="px-2 py-1.5">
                                                            <span className={cn("inline-flex items-center gap-1 font-semibold", COLORE[m.operazione])}>
                                                                <Ico className="w-3 h-3" />{m.tabella}
                                                            </span>
                                                        </td>
                                                        <td className="px-2 py-1.5 text-slate-300">
                                                            {m.operazione === "aggiungi"
                                                                ? Object.entries(m.dati || {}).filter(([, v]) => v !== null && v !== "").map(([k, v]) => `${k}: ${numIt(v)}`).join(" · ")
                                                                : (m.campo || "—")}
                                                        </td>
                                                        <td className="px-2 py-1.5 whitespace-nowrap">
                                                            {m.operazione === "aggiorna" ? (
                                                                <><span className="text-slate-500 line-through">{numIt(m.da)}</span>
                                                                    <span className="mx-1 text-slate-600">→</span>
                                                                    <span className="font-bold text-white">{numIt(m.a)}</span></>
                                                            ) : <span className="text-slate-600">—</span>}
                                                        </td>
                                                        <td className="px-2 py-1.5 text-slate-500">{m.motivo || ""}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

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
