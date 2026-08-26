"use client";

/* ═══ LA LISTA UNIFICATA DELL'OMNICHAT ════════════════════════════════════
   L'unica cosa che l'Omnichat riscrive: la colonna di sinistra, che fonde
   WhatsApp, email e chat interna in un ordine solo — non letti davanti, poi
   il più recente. Tutto il resto (il thread, la scrittura, gli allegati, la
   modifica, le cartelle della posta, i chip dei numeri) resta quello delle
   inbox vere, che vengono riusate così come sono.

   Il perimetro è già applicato dentro `caricaConversazioni`: qui non arriva
   niente che l'utente non possa vedere. */

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useVisibleStores } from "@/lib/visibleStores";
import { cn } from "@/utils";
import { caricaConversazioni } from "./dati";
import type { ChatOmni, TabOmni } from "./tipi";

const FILTRI: { id: TabOmni; label: string; colore: string }[] = [
    { id: "tutti", label: "Tutti", colore: "text-white" },
    { id: "interna", label: "Staff", colore: "text-indigo-300" },
    { id: "wa", label: "WhatsApp", colore: "text-emerald-300" },
    { id: "email", label: "Mail", colore: "text-sky-300" },
];

export function ListaOmni({ attivaId, onScegli }: { attivaId: string | null; onScegli: (c: ChatOmni) => void }) {
    const { user } = useAuth();
    const { stores } = useVisibleStores();
    const [filtro, setFiltro] = useState<TabOmni>("tutti");
    const [cerca, setCerca] = useState("");
    const [chats, setChats] = useState<ChatOmni[] | null>(null);
    const [errore, setErrore] = useState<string | null>(null);

    useEffect(() => {
        let vivo = true;
        setErrore(null);
        caricaConversazioni({ id: user?.id || null, role: user?.role || null, stores })
            .then((c) => { if (vivo) setChats(c); })
            .catch((e) => { if (vivo) { setChats([]); setErrore(String((e as Error)?.message || e)); } });
        return () => { vivo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id, user?.role, stores.join("|")]);

    const lista = useMemo(() => {
        const q = cerca.trim().toLowerCase();
        return (chats || [])
            .filter((c) => filtro === "tutti" || c.canale === filtro)
            .filter((c) => !q || `${c.nome} ${c.anteprima} ${c.sottotitolo || ""} ${c.numero || ""}`.toLowerCase().includes(q));
    }, [chats, filtro, cerca]);

    const nonLetti = useMemo(() => (chats || []).filter((c) => c.daLeggere).length, [chats]);

    return (
        <div className="h-full flex flex-col min-h-0">
            <div className="px-3 pt-3 pb-2 border-b border-white/5 space-y-2 shrink-0">
                <div className="flex items-center justify-between gap-2">
                    <h2 className="text-white font-semibold text-sm flex items-center gap-2">
                        ✨ Omnichat
                        {nonLetti > 0 && (
                            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-sky-500 text-white text-[10px] font-bold flex items-center justify-center">
                                {nonLetti > 99 ? "99+" : nonLetti}
                            </span>
                        )}
                    </h2>
                </div>
                <input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca in tutti i canali…"
                    className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-600 outline-none focus:border-indigo-500/50" />
                <div className="flex bg-white/[0.04] p-0.5 rounded-xl border border-white/5">
                    {FILTRI.map((f) => (
                        <button key={f.id} onClick={() => setFiltro(f.id)}
                            className={cn("flex-1 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all",
                                filtro === f.id ? `bg-white/[0.07] ${f.colore}` : "text-slate-500 hover:text-white")}>
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {errore && <div className="m-3 text-[11px] text-rose-300 border border-rose-500/40 bg-rose-500/10 rounded-lg px-3 py-2">⚠️ {errore}</div>}

            <div className="flex-1 overflow-y-auto p-2 space-y-0.5 min-h-0">
                {chats === null && <p className="text-xs text-slate-500 text-center py-8">Carico le conversazioni…</p>}
                {chats !== null && !lista.length && (
                    <p className="text-xs text-slate-500 text-center py-8 px-4 leading-relaxed">
                        {cerca ? "Nessuna conversazione con queste parole." : "Nessuna conversazione in questo canale."}
                    </p>
                )}
                {lista.map((c) => (
                    <button key={c.id} onClick={() => onScegli(c)}
                        className={cn("w-full text-left p-2.5 rounded-xl flex gap-2.5 transition-colors border",
                            attivaId === c.id ? "bg-white/[0.06] border-white/10" : "border-transparent hover:bg-white/[0.03]")}>
                        <div className="relative shrink-0">
                            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black border border-white/5",
                                c.canale === "wa" ? "bg-emerald-500/10 text-emerald-400"
                                    : c.canale === "email" ? "bg-sky-500/10 text-sky-400"
                                        : "bg-indigo-500/10 text-indigo-400")}>
                                {c.iniziali}
                            </div>
                            {/* il pallino del canale serve solo quando i canali sono mescolati */}
                            {filtro === "tutti" && (
                                <span className={cn("absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[#0f111a] flex items-center justify-center text-[8px] font-bold text-white",
                                    c.canale === "wa" ? "bg-emerald-500" : c.canale === "email" ? "bg-sky-500" : "bg-indigo-500")}>
                                    {c.canale === "wa" ? "W" : c.canale === "email" ? "@" : "I"}
                                </span>
                            )}
                            {c.daLeggere && <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-sky-400 rounded-full border-2 border-[#0f111a]" />}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-baseline gap-2">
                                <span className={cn("text-[13px] truncate", c.daLeggere || attivaId === c.id ? "font-bold text-white" : "font-medium text-slate-300")}>{c.nome}</span>
                                <span className="text-[10px] text-slate-500 tabular-nums shrink-0">{c.ora}</span>
                            </div>
                            <p className={cn("text-[11px] truncate", c.daLeggere ? "text-indigo-300 font-medium" : "text-slate-500")}>
                                {c.sottotitolo || c.anteprima || "—"}
                            </p>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}
