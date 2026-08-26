"use client";

/* ═══ LA SPALLA DELL'OMNICHAT ═════════════════════════════════════════════
   La colonna che dice chi hai davanti, e che è il motivo per cui l'Omnichat
   esiste: le tre inbox restano quelle di sempre — stesse funzioni, stessa
   grafica — e qui accanto compare quello che nessuna delle tre sa dire.

   In cima l'AI: recap della conversazione, cosa conviene fare, e due o tre
   risposte pronte da mandare con un clic. Sotto, i dati del cliente secondo
   le regole di Luca: valore generato, telefono a rate, cronologia. Se il
   contatto non è in anagrafica lo dice e si ferma lì; se è un collega, il
   confronto delle attivazioni di oggi.

   ⚠️ Le regole di rendering NON stanno qui: stanno nei tipi (`Radar` è una
   union) e in `dati.ts`. Questa vista disegna la forma che riceve — è il
   motivo per cui un prospect non può mostrare l'LTV nemmeno per sbaglio. */

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/utils";
import { caricaRadar, caricaMessaggi } from "./dati";
import type { ChatOmni, Radar } from "./tipi";

const euro = (v: number) => v.toLocaleString("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });

type Suggerimenti = { recap: string; analisi: string; risposte: string[] } | null;

export function RadarOmni({ chat, onUsaRisposta }: { chat: ChatOmni | null; onUsaRisposta?: (t: string) => void }) {
    const { user } = useAuth();
    const [radar, setRadar] = useState<Radar | null>(null);
    const [errore, setErrore] = useState<string | null>(null);
    const [ai, setAi] = useState<Suggerimenti>(null);
    const [aiCarico, setAiCarico] = useState(false);
    const [aiErrore, setAiErrore] = useState<string | null>(null);
    const [aperto, setAperto] = useState<string | null>(null);
    const [valoreStaff, setValoreStaff] = useState(false);

    useEffect(() => {
        if (!chat) { setRadar(null); setAi(null); return; }
        let vivo = true;
        setRadar(null); setAi(null); setErrore(null); setAiErrore(null); setAperto(null); setValoreStaff(false);
        caricaRadar(chat, { id: user?.id || null, nome: user?.name || null })
            .then((r) => { if (vivo) setRadar(r); })
            .catch((e) => { if (vivo) setErrore(String((e as Error)?.message || e)); });
        return () => { vivo = false; };
    }, [chat?.id, user?.id, user?.name]);   // eslint-disable-line react-hooks/exhaustive-deps

    // L'AI NON PARTE DA SOLA: costa, e su una lista lunga si aprirebbero
    // decine di chiamate solo scorrendo. Parte quando il venditore la chiede.
    const chiediAi = async () => {
        if (!chat || aiCarico) return;
        setAiCarico(true); setAiErrore(null);
        try {
            const msg = await caricaMessaggi(chat, user?.id || null);
            const contesto = radar?.tipo === "cliente"
                ? [
                    `valore generato ${euro(radar.ltv.euro)}`,
                    radar.hardware ? `telefono a rate: ${radar.hardware.nome}, ${radar.hardware.rate} rate su ${radar.hardware.rateTotali}` : null,
                    radar.timeline.length ? `${radar.timeline.length} giornate di operazioni a storico` : null,
                ].filter(Boolean).join(" · ")
                : radar?.tipo === "staff" ? `collega: oggi ${radar.kpi.loro.pezzi} pezzi contro i tuoi ${radar.kpi.tuo.pezzi}` : null;
            const r = await fetch("/api/ai/omnichat", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    canale: chat.canale, nome: chat.nome, stato: radar?.stato,
                    messaggi: msg.map((m) => ({ verso: m.verso, testo: m.testo })), contesto,
                }),
            }).then((x) => x.json());
            if (!r?.ok) throw new Error(r?.error || "l'AI non ha risposto");
            // meglio dirlo che mostrare un riquadro bianco con scritto «rileggi»
            if (!r.recap && !r.analisi && !(r.risposte || []).length) throw new Error("l'AI non ha prodotto niente: riprova");
            setAi({ recap: r.recap || "", analisi: r.analisi || "", risposte: r.risposte || [] });
        } catch (e) {
            setAiErrore(String((e as Error)?.message || e));
        } finally {
            setAiCarico(false);
        }
    };

    if (!chat) {
        return (
            <div className="h-full flex items-center justify-center p-6 text-center">
                <p className="text-xs text-slate-500 leading-relaxed">Apri una conversazione:<br />qui compare chi hai davanti.</p>
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto">
            {/* TESTATA — lo status è binario per i clienti, «Staff» per i colleghi */}
            <div className="h-28 relative overflow-hidden border-b border-white/5 bg-gradient-to-br from-white/[0.05] to-transparent shrink-0">
                <div className={cn("absolute -top-10 -right-10 w-32 h-32 blur-3xl rounded-full",
                    radar?.coloreUmore === "emerald" ? "bg-emerald-500/20" : "bg-indigo-500/20")} />
                <div className="absolute bottom-4 left-5 flex items-end gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-lg font-black text-white">
                        {chat.iniziali}
                    </div>
                    <div className="pb-0.5 min-w-0">
                        <h3 className="font-black text-white text-base tracking-wide truncate max-w-[220px]">{chat.nome}</h3>
                        {radar && (
                            <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-widest mt-1 inline-block border",
                                radar.stato === "Cliente Registrato" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                    : radar.stato === "Non Registrato" ? "bg-slate-500/10 text-slate-400 border-slate-500/20"
                                        : "bg-indigo-500/10 text-indigo-400 border-indigo-500/20")}>
                                {radar.stato}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <div className="p-4 space-y-4">
                {errore && <div className="text-[11px] text-rose-300 border border-rose-500/40 bg-rose-500/10 rounded-lg px-3 py-2">⚠️ {errore}</div>}
                {!radar && !errore && <p className="text-xs text-slate-500 text-center py-6">Leggo la scheda…</p>}

                {/* ── AI: recap, analisi, risposte pronte ── */}
                <div className="relative p-4 rounded-2xl bg-white/[0.02] border border-white/5 overflow-hidden">
                    <span className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
                    <div className="flex items-center justify-between gap-2 mb-2">
                        <h4 className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-1.5">
                            <span className="text-indigo-400">✨</span> Assistente
                        </h4>
                        <button onClick={chiediAi} disabled={aiCarico}
                            className={cn("text-[10px] font-bold px-2 py-1 rounded-lg border transition-colors",
                                aiCarico ? "border-white/10 text-slate-500" : "border-indigo-500/40 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20")}>
                            {aiCarico ? "leggo…" : ai ? "rileggi" : "leggi la chat"}
                        </button>
                    </div>
                    {aiErrore && <p className="text-[11px] text-rose-300">⚠️ {aiErrore}</p>}
                    {!ai && !aiCarico && !aiErrore && (
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                            Riassume la conversazione, dice cosa conviene fare e prepara due o tre risposte da mandare.
                        </p>
                    )}
                    {ai && (
                        <div className="space-y-3">
                            {ai.recap && <p className="text-xs text-slate-200 leading-relaxed">{ai.recap}</p>}
                            {ai.analisi && (
                                <p className="text-[11px] text-amber-200/90 leading-relaxed border-l-2 border-amber-400/40 pl-2">{ai.analisi}</p>
                            )}
                            {ai.risposte.length > 0 && (
                                <div className="space-y-1.5">
                                    <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Risposte pronte</p>
                                    {ai.risposte.map((r, i) => (
                                        <button key={i} onClick={() => onUsaRisposta?.(r)}
                                            title="Clicca per metterla nel campo di scrittura"
                                            className="w-full text-left text-[11px] text-slate-300 bg-white/[0.03] border border-white/10 rounded-lg px-2.5 py-2 hover:border-indigo-500/40 hover:bg-indigo-500/[0.06] transition-colors">
                                            {r}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ── CASO A: cliente registrato ── */}
                {radar?.tipo === "cliente" && (
                    <>
                        <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4">
                            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Valore generato</h4>
                            <div className="text-2xl font-black text-white leading-none tracking-tight">{euro(radar.ltv.euro)}</div>
                            <p className="text-[10px] text-slate-500 mt-1.5">{radar.ltv.nota}</p>
                        </div>

                        {radar.hardware && (
                            <div>
                                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Ecosistema &amp; hardware</h4>
                                <div className="bg-white/[0.02] border border-white/5 p-3 rounded-xl">
                                    <div className="flex justify-between items-start mb-2 gap-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">📱</span>
                                            <div className="min-w-0">
                                                <h5 className="text-[11px] font-bold text-white truncate">{radar.hardware.nome}</h5>
                                                {radar.hardware.finanziaria && <p className="text-[9px] text-slate-400">{radar.hardware.finanziaria}</p>}
                                            </div>
                                        </div>
                                        <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 shrink-0">{radar.hardware.stato}</span>
                                    </div>
                                    <div className="flex justify-between items-end mb-1">
                                        <span className="text-[9px] font-bold text-slate-400">Rate {radar.hardware.rate}/{radar.hardware.rateTotali}{radar.hardware.stimata ? " ~" : ""}</span>
                                        <span className="text-[9px] font-bold text-indigo-400"
                                            title={radar.hardware.stimata ? "Durata non registrata a catalogo: stimata sui 24 mesi standard" : undefined}>
                                            scade tra {radar.hardware.scade}
                                        </span>
                                    </div>
                                    <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${radar.hardware.percentuale}%` }} />
                                    </div>
                                </div>
                            </div>
                        )}

                        {radar.timeline.length > 0 && (
                            <div>
                                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Cronologia</h4>
                                <div className="relative border-l border-white/10 ml-3 space-y-3 pb-2">
                                    {radar.timeline.map((ev) => {
                                        const on = aperto === ev.id;
                                        return (
                                            <div key={ev.id} className="relative">
                                                <span className={cn("absolute -left-[15px] top-2.5 w-7 h-7 rounded-full border flex items-center justify-center text-[11px]", ev.coloreIcona)}>{ev.icona}</span>
                                                <div className="ml-5">
                                                    <button onClick={() => setAperto(on ? null : ev.id)}
                                                        className={cn("w-full text-left p-3 rounded-xl border transition-all",
                                                            on ? "bg-white/[0.05] border-sky-500/60" : "bg-white/[0.02] border-white/5 hover:border-white/20")}>
                                                        <p className="text-[9px] text-slate-400 mb-0.5">{ev.data}</p>
                                                        <h5 className={cn("font-bold text-[12px]", on ? "text-white" : "text-slate-200")}>
                                                            {ev.titolo} <span className="text-slate-500 text-[10px] ml-1">{on ? "▴" : "▾"}</span>
                                                        </h5>
                                                        <p className="text-[10px] text-slate-500 mt-0.5">{ev.sottotitolo}</p>
                                                        {on && ev.dettagli && (
                                                            <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
                                                                {ev.dettagli.map((d, i) => (
                                                                    <div key={i} className="flex items-center gap-2 bg-white/[0.02] border border-white/5 p-2 rounded-lg">
                                                                        <span className="w-6 h-6 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center text-[10px] shrink-0">{d.logo}</span>
                                                                        <div className="flex-1 min-w-0">
                                                                            <div className="flex justify-between items-center gap-2">
                                                                                <span className="text-[10px] font-bold text-white truncate">{d.brand}</span>
                                                                                {d.stato && <span className="text-[8px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 rounded shrink-0">{d.stato}</span>}
                                                                            </div>
                                                                            {d.desc && <p className="text-[10px] text-slate-500 truncate">{d.desc}</p>}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* ── CASO B: non è in anagrafica ── */}
                {radar?.tipo === "prospect" && (
                    <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-5 text-center">
                        <div className="w-14 h-14 bg-white/[0.02] border border-white/10 rounded-full flex items-center justify-center text-xl mx-auto mb-2">👤</div>
                        <h4 className="text-[13px] font-bold text-white mb-1.5">Anagrafica inesistente</h4>
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                            Crea l&apos;anagrafica per sbloccare il valore generato, i contratti e la cronologia.
                        </p>
                    </div>
                )}

                {/* ── CASO C: collega ── */}
                {radar?.tipo === "staff" && (
                    <div>
                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Attivazioni di oggi</h4>
                        <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4 space-y-4">
                            {[radar.kpi.loro, radar.kpi.tuo].map((p, i) => (
                                <div key={p.nome + i}>
                                    <div className="flex justify-between items-end mb-1">
                                        <span className={cn("text-[11px] font-bold", i === 0 ? "text-white" : "text-slate-400")}>{p.nome}</span>
                                        <span className={cn("text-[11px] font-bold", i === 0 ? "text-indigo-400" : "text-emerald-400")}>{p.pezzi} pz</span>
                                    </div>
                                    <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                                        <div className={cn("h-full rounded-full", i === 0 ? "bg-indigo-500" : "bg-emerald-500")}
                                            style={{ width: `${Math.round((p.pezzi / radar.kpi.maxPezzi) * 100)}%` }} />
                                    </div>
                                </div>
                            ))}
                            <div className="pt-1 border-t border-white/5">
                                <button onClick={() => setValoreStaff((v) => !v)}
                                    className="w-full flex justify-between items-center text-[10px] font-bold text-slate-400 hover:text-white transition-colors">
                                    ESPLODI VALORE GENERATO <span>{valoreStaff ? "▴" : "▾"}</span>
                                </button>
                                {valoreStaff && (
                                    <div className="grid grid-cols-2 gap-2 mt-3">
                                        <div className="bg-white/[0.02] border border-white/5 p-2 rounded-lg text-center">
                                            <span className="text-[9px] text-slate-500 uppercase block">{radar.kpi.loro.nome}</span>
                                            <span className="text-[12px] font-black text-indigo-400">{euro(radar.kpi.loro.valore)}</span>
                                        </div>
                                        <div className="bg-white/[0.02] border border-white/5 p-2 rounded-lg text-center">
                                            <span className="text-[9px] text-slate-500 uppercase block">Tu</span>
                                            <span className="text-[12px] font-black text-emerald-400">{euro(radar.kpi.tuo.valore)}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
