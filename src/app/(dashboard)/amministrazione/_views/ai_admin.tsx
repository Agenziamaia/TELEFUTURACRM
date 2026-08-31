"use client";

/* ═══ SPESA E USO DELL'AI ══════════════════════════════════════════════════
   Luca 31/08: «un resoconto dei token che stiamo utilizzando, di quanto
   stiamo spendendo diviso per categorie — email spende questo, WhatsApp
   questo, l'assistente questo — e posso filtrare per utenza».
   Tetto: trenta euro al mese.

   ⚠️ SI MISURA IL GESTO, MAI IL CONTENUTO. Qui dentro non c'è, e non deve mai
   entrare, il testo di una domanda, il titolo di una conversazione o
   «l'argomento» di cui si parla — che sembra innocuo e non lo è, perché per
   produrlo bisogna leggere. L'assistente vale quello che vale perché la gente
   ci mette dentro le cose vere, e le mette solo finché è sicura che nessuno
   le legge: un pannello che mostrasse di cosa si parla ucciderebbe in un mese
   la cosa che deve far crescere, e i grafici continuerebbero a salire mentre
   il valore sparisce.

   E la lettura più importante non è il totale: è il rapporto fra la spesa che
   una PERSONA ha chiesto e quella che gira DA SOLA. La prima non si taglia —
   è il prodotto. La seconda sì. */

import { useCallback, useEffect, useState } from "react";
import { Sparkles, RefreshCw, TrendingUp, Bot, User, AlertTriangle, Wallet } from "lucide-react";
import { cn } from "@/utils";

type Dati = {
    ok: boolean; giorni: number;
    mese: { speso: number; proiezione: number; tetto: number; avviso: number; allarme: number; chiesta: number; automatica: number };
    perSezione: Record<string, { euro: number; chiamate: number; righe: number }>;
    perUtenza: Record<string, { tipo: string; label: string; euro: number; chiamate: number }>;
    perGiorno: Record<string, { euro: number; richieste: number }>;
    sprechi: { troncate: number; errori: number; senzaCredito: number; passaggiMedi: number | null };
    persone: { id: string; nome: string; ruolo: string; negozio: string | null; domande: number; giorniAttivi: number; euro: number; ultima: string | null }[];
    totali: { righe: number; chiamate: number; tokenIn: number; tokenOut: number };
};

const eur = (n: number) => (n < 0.01 && n > 0 ? "<0,01 €" : n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €");
const num = (n: number) => n.toLocaleString("it-IT");
const NOMI: Record<string, string> = {
    assistente: "Assistente personale", triage_whatsapp: "Triage WhatsApp",
    triage_email: "Triage Email", omnichat: "Omnichat", motore_storico: "Motori (prima del 31/08)",
};

export function AiAdminView() {
    const [d, setD] = useState<Dati | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [giorni, setGiorni] = useState(30);
    const [caricando, setCaricando] = useState(true);

    const carica = useCallback(async () => {
        setCaricando(true); setErr(null);
        try {
            const r = await fetch(`/api/ai/spesa?giorni=${giorni}`, { cache: "no-store" }).then((x) => x.json());
            if (!r?.ok) throw new Error(r?.error || "non sono riuscito a leggere i consumi");
            setD(r);
        } catch (e) { setErr(String((e as Error)?.message || e)); }
        finally { setCaricando(false); }
    }, [giorni]);
    useEffect(() => { void carica(); }, [carica]);

    if (err) return <div className="m-4 text-sm text-rose-300 border border-rose-500/40 bg-rose-500/10 rounded-xl px-4 py-3">⚠️ {err}</div>;
    if (!d) return <div className="p-8 text-center text-sm text-slate-500">Conto quanto costa…</div>;

    const m = d.mese;
    const quota = m.tetto > 0 ? m.speso / m.tetto : 0;
    const colore = quota >= m.allarme ? "rose" : quota >= m.avviso ? "amber" : "emerald";
    const sezioni = Object.entries(d.perSezione).sort((a, b) => b[1].euro - a[1].euro);
    const utenze = Object.values(d.perUtenza).sort((a, b) => b.euro - a.euro).slice(0, 12);
    const giorniOrd = Object.entries(d.perGiorno).sort((a, b) => a[0].localeCompare(b[0]));
    const maxGiorno = Math.max(...giorniOrd.map(([, v]) => v.euro), 0.0001);
    /* «chi non la usa» è la vista che Luca ha chiesto di più, e vale SOLO fra
       chi l'assistente ce l'ha: gli altri non sono un problema di adozione. */
    const attivi = d.persone.filter((p) => p.domande > 0).sort((a, b) => b.giorniAttivi - a.giorniAttivi || b.domande - a.domande);
    const fermi = d.persone.filter((p) => p.domande === 0);

    return (
        <div className="p-4 sm:p-6 space-y-5">
            {/* ── il mese, contro il tetto ────────────────────────────────── */}
            <div className="rounded-3xl border border-white/10 bg-[#0d1022]/80 p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                            <Sparkles className="w-3.5 h-3.5" /> Spesa del mese
                        </div>
                        <div className="mt-1.5 flex items-baseline gap-3">
                            <span className="text-4xl font-black tabular-nums text-white">{eur(m.speso)}</span>
                            <span className="text-sm text-slate-400">su {eur(m.tetto)} di tetto</span>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                            Di questo passo il mese si chiude a <b className="text-slate-300">{eur(m.proiezione)}</b>
                            {m.proiezione > m.tetto ? <span className="text-amber-300"> — sopra il tetto</span> : null}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <select value={giorni} onChange={(e) => setGiorni(Number(e.target.value))}
                            className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300">
                            <option value={7}>ultimi 7 giorni</option>
                            <option value={30}>ultimi 30 giorni</option>
                            <option value={90}>ultimi 90 giorni</option>
                        </select>
                        <button onClick={() => void carica()} disabled={caricando}
                            className="p-2 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:bg-white/5">
                            <RefreshCw className={cn("w-4 h-4", caricando && "animate-spin")} />
                        </button>
                    </div>
                </div>
                <div className="mt-4 h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all",
                        colore === "rose" ? "bg-rose-500" : colore === "amber" ? "bg-amber-400" : "bg-emerald-500")}
                        style={{ width: Math.min(100, quota * 100) + "%" }} />
                </div>
                {quota >= m.avviso && (
                    <p className={cn("mt-2 text-xs", colore === "rose" ? "text-rose-300" : "text-amber-300")}>
                        {colore === "rose"
                            ? "Siamo oltre l'85% del tetto: al limite si fermano prima i motori automatici, l'assistente delle persone resta acceso."
                            : "Superato il 60% del tetto."}
                    </p>
                )}
            </div>

            {/* ── chiesto da una persona / girato da solo ─────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                    { t: "Chiesto da una persona", v: m.chiesta, i: User, c: "indigo",
                      n: "È il prodotto: qualcuno l'ha voluta. Questa spesa non si taglia — semmai si vuole che cresca." },
                    { t: "Girato da solo", v: m.automatica, i: Bot, c: "slate",
                      n: "I motori che classificano chat e posta, senza che nessuno chieda niente. È qui che si interviene se serve." },
                ].map((x) => (
                    <div key={x.t} className="glass-card rounded-2xl p-4 border border-white/10">
                        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                            <x.i className="w-3.5 h-3.5" /> {x.t}
                        </div>
                        <div className="mt-1 text-2xl font-black tabular-nums text-white">{eur(x.v)}</div>
                        <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">{x.n}</p>
                    </div>
                ))}
            </div>

            {/* ── dove vanno i soldi ──────────────────────────────────────── */}
            <div className="glass-card rounded-2xl p-4 border border-white/10">
                <h3 className="text-sm font-bold text-white mb-3">Dove vanno i soldi, questo mese</h3>
                {sezioni.length === 0 ? <p className="text-xs text-slate-500">Ancora niente in questo mese.</p> : (
                    <div className="space-y-2">
                        {sezioni.map(([k, v]) => {
                            const p = m.speso > 0 ? v.euro / m.speso : 0;
                            return (
                                <div key={k} className="flex items-center gap-3">
                                    <span className="w-44 shrink-0 text-xs text-slate-300">{NOMI[k] || k}</span>
                                    <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
                                        <div className="h-full bg-indigo-500/70 rounded-full" style={{ width: Math.max(2, p * 100) + "%" }} />
                                    </div>
                                    <span className="w-20 text-right text-xs font-bold tabular-nums text-white">{eur(v.euro)}</span>
                                    <span className="w-24 text-right text-[11px] tabular-nums text-slate-500">{num(v.chiamate)} chiamate</span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── l'andamento ─────────────────────────────────────────────── */}
            <div className="glass-card rounded-2xl p-4 border border-white/10">
                <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-indigo-300" /> Come sta andando
                </h3>
                <p className="text-[11px] text-slate-500 mb-3">
                    La barra è il costo del giorno, il punto sono le richieste fatte da persone. Se salgono insieme
                    è adozione, ed è una buona notizia; se sale solo il costo, qualcosa gira a vuoto.
                </p>
                <div className="flex items-end gap-[3px] h-24">
                    {giorniOrd.map(([g, v]) => (
                        <div key={g} className="flex-1 min-w-[3px] relative group" title={`${g}: ${eur(v.euro)} · ${v.richieste} richieste`}>
                            <div className="w-full bg-indigo-500/60 rounded-t" style={{ height: Math.max(2, (v.euro / maxGiorno) * 96) + "px" }} />
                            {v.richieste > 0 && <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-emerald-400" />}
                        </div>
                    ))}
                </div>
            </div>

            {/* ── le utenze ───────────────────────────────────────────────── */}
            <div className="glass-card rounded-2xl p-4 border border-white/10">
                <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-indigo-300" /> Su cosa si spende
                </h3>
                {utenze.length === 0 ? <p className="text-xs text-slate-500">Nessuna utenza con spesa in questo mese.</p> : (
                    <table className="w-full text-xs">
                        <thead><tr className="text-slate-500 text-[10px] uppercase tracking-wider">
                            <th className="text-left pb-2">Utenza</th><th className="text-left pb-2">Tipo</th>
                            <th className="text-right pb-2">Chiamate</th><th className="text-right pb-2">Spesa</th>
                        </tr></thead>
                        <tbody>
                            {utenze.map((u, i) => (
                                <tr key={i} className="border-t border-white/5">
                                    <td className="py-1.5 text-slate-200">{u.label}</td>
                                    <td className="py-1.5 text-slate-500">{u.tipo === "casella_email" ? "casella" : u.tipo === "numero_wa" ? "numero" : "persona"}</td>
                                    <td className="py-1.5 text-right tabular-nums text-slate-400">{num(u.chiamate)}</td>
                                    <td className="py-1.5 text-right tabular-nums font-bold text-white">{eur(u.euro)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* ── gli sprechi: pagato e non consegnato ────────────────────── */}
            <div className="glass-card rounded-2xl p-4 border border-white/10">
                <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-300" /> Pagato e non consegnato
                </h3>
                <p className="text-[11px] text-slate-500 mb-3">
                    È l&apos;unico riquadro dove il colpevole siamo noi: qui non c&apos;è niente da chiedere agli utenti,
                    c&apos;è da sistemare il codice.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                        { t: "Risposte troncate", v: d.sprechi.troncate, n: "pagate, e all'utente è arrivata una scusa" },
                        { t: "Errori", v: d.sprechi.errori, n: "chiamate fallite" },
                        { t: "Senza credito", v: d.sprechi.senzaCredito, n: "il fornitore ci ha fermati" },
                        { t: "Passaggi medi", v: d.sprechi.passaggiMedi != null ? Math.round(d.sprechi.passaggiMedi * 10) / 10 : "—", n: "se salgono, gira a vuoto" },
                    ].map((x) => (
                        <div key={x.t} className="rounded-xl bg-white/[0.03] border border-white/5 p-3">
                            <div className="text-[10px] uppercase tracking-wider text-slate-500">{x.t}</div>
                            <div className={cn("text-xl font-black tabular-nums", Number(x.v) > 0 ? "text-amber-300" : "text-slate-400")}>{x.v}</div>
                            <div className="text-[10px] text-slate-600 mt-0.5 leading-tight">{x.n}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── chi la usa e chi no ─────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="glass-card rounded-2xl p-4 border border-white/10">
                    <h3 className="text-sm font-bold text-white mb-1">Chi ci lavora davvero</h3>
                    <p className="text-[11px] text-slate-500 mb-3">
                        In ordine di GIORNI attivi, non di domande: chi ne fa sessanta in un giorno ha fatto una prova,
                        chi ne fa tre al giorno per venti giorni l&apos;ha adottata.
                    </p>
                    {attivi.length === 0 ? <p className="text-xs text-slate-500">Ancora nessuno in questo periodo.</p> : (
                        <div className="space-y-1.5">
                            {attivi.slice(0, 12).map((p, i) => (
                                <div key={p.id} className="flex items-center gap-2 text-xs">
                                    <span className="w-5 text-slate-600 tabular-nums">{i + 1}</span>
                                    <span className="flex-1 text-slate-200 truncate">{p.nome}</span>
                                    <span className="text-slate-500">{p.giorniAttivi} gg</span>
                                    <span className="w-14 text-right tabular-nums text-slate-400">{num(p.domande)} dom.</span>
                                    <span className="w-16 text-right tabular-nums text-white font-bold">{eur(p.euro)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="glass-card rounded-2xl p-4 border border-white/10">
                    <h3 className="text-sm font-bold text-white mb-1">Ce l&apos;hanno e non la usano</h3>
                    <p className="text-[11px] text-slate-500 mb-3">
                        ⭐ È la lista che vale di più, ed è una lista di nomi da chiamare — non un grafico.
                        Sono persone a cui l&apos;assistente è acceso e che non l&apos;hanno mai aperto.
                    </p>
                    {fermi.length === 0 ? <p className="text-xs text-emerald-300">Nessuno: la usano tutti.</p> : (
                        <div className="space-y-1.5 max-h-64 overflow-y-auto">
                            {fermi.map((p) => (
                                <div key={p.id} className="flex items-center gap-2 text-xs">
                                    <span className="flex-1 text-slate-300 truncate">{p.nome}</span>
                                    <span className="text-slate-600">{p.ruolo}</span>
                                    <span className="text-slate-600 truncate max-w-[7rem]">{p.negozio || ""}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <p className="text-[11px] text-slate-600 leading-relaxed px-1">
                Qui si contano i gesti: quante domande, quando, quanto costano. Mai il testo di una domanda,
                mai il titolo di una conversazione, mai l&apos;argomento — l&apos;assistente vale quello che vale
                perché i ragazzi ci mettono dentro le cose vere, e le mettono solo finché sanno che nessuno le legge.
            </p>
        </div>
    );
}
