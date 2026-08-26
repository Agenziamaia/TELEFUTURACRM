"use client";

/* ═══ LA CHAT INTERNA DI UN ALTRO — SOLA LETTURA ══════════════════════════
   Quando mi immedesimo in una persona o in un negozio, le chat interne che
   vedo sono LE SUE: il thread della pagina Chat non può mostrarle, perché è
   costruito sulle conversazioni a cui partecipo IO (e infatti diceva
   «Seleziona una conversazione» — Luca 27/08, chat di Alessio con Tommaso).

   Qui la conversazione si legge e basta. Non c'è la casella per scrivere, e
   non è una mancanza: rispondere sarebbe scrivere in una chat privata
   spacciandosi per un altro. Per parlare a quella persona c'è la mia chat
   con lei, nella scheda Chat interna. */

import { useEffect, useState } from "react";
import { cn } from "@/utils";
import { caricaMessaggi } from "./dati";
import type { ChatOmni, MessaggioOmni } from "./tipi";

export function ThreadAltrui({ chat, diChi }: { chat: ChatOmni; diChi: string | null }) {
    const [msg, setMsg] = useState<MessaggioOmni[] | null>(null);
    const [errore, setErrore] = useState<string | null>(null);

    useEffect(() => {
        let vivo = true;
        setMsg(null); setErrore(null);
        // il «me» qui è il PROPRIETARIO della chat: i suoi messaggi vanno a
        // destra, come li vedrebbe lui
        caricaMessaggi(chat, chat.proprietarioId || null)
            .then((m) => { if (vivo) setMsg(m); })
            .catch((e) => { if (vivo) { setMsg([]); setErrore(String((e as Error)?.message || e)); } });
        return () => { vivo = false; };
    }, [chat.id, chat.proprietarioId]);

    return (
        <div className="h-full w-full flex flex-col min-h-0 bg-[#0b0d14]">
            <div className="h-14 shrink-0 px-4 flex items-center gap-3 border-b border-white/5">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-white/5 flex items-center justify-center text-[11px] font-black text-indigo-300">
                    {chat.iniziali}
                </div>
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{chat.nome}</p>
                    <p className="text-[11px] text-amber-300/80 truncate">
                        chat interna di {diChi || "un collega"} · sola lettura
                    </p>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
                {msg === null && <p className="text-xs text-slate-500 text-center py-8">Carico la conversazione…</p>}
                {errore && <p className="text-[11px] text-rose-300 border border-rose-500/40 bg-rose-500/10 rounded-lg px-3 py-2">⚠️ {errore}</p>}
                {msg !== null && !msg.length && !errore && (
                    <p className="text-xs text-slate-500 text-center py-8">Nessun messaggio in questa conversazione.</p>
                )}
                {(msg || []).map((m) => (
                    <div key={m.id} className={cn("flex", m.verso === "out" ? "justify-end" : "justify-start")}>
                        <div className={cn("max-w-[78%] rounded-2xl px-3 py-2 border",
                            m.verso === "out"
                                ? "bg-indigo-500/15 border-indigo-500/25 text-slate-100"
                                : "bg-white/[0.04] border-white/10 text-slate-200")}>
                            {m.autore && <p className="text-[10px] font-bold text-slate-400 mb-0.5">{m.autore}</p>}
                            <p className="text-[13px] whitespace-pre-wrap break-words">{m.testo || "—"}</p>
                            <p className="text-[9px] text-slate-500 text-right mt-0.5 tabular-nums">{m.ora}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="shrink-0 px-4 py-3 border-t border-white/5 text-[11px] text-slate-500">
                Stai leggendo la chat di {diChi || "un collega"}: da qui non si risponde.
                Per scrivere a <b className="text-slate-400">{chat.nome}</b> usa la tua chat interna.
            </div>
        </div>
    );
}
