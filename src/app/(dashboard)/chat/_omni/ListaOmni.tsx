"use client";

/* ═══ LA LISTA UNIFICATA DELL'OMNICHAT ════════════════════════════════════
   L'unica cosa che l'Omnichat riscrive: la colonna di sinistra, che fonde
   WhatsApp, email e chat interna in un ordine solo — non letti davanti, poi
   il più recente. Tutto il resto (il thread, la scrittura, gli allegati, la
   modifica, le cartelle della posta, i chip dei numeri) resta quello delle
   inbox vere, che vengono riusate così come sono.

   Il perimetro è già applicato dentro `caricaConversazioni`: qui non arriva
   niente che l'utente non possa vedere. */

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useVisibleStores } from "@/lib/visibleStores";
import { cn } from "@/utils";
import { seesAllStores } from "@/lib/roles";
import { caricaConversazioni, elencoNegozi, elencoPersone, membriNegozio } from "./dati";
import type { ChatOmni } from "./tipi";

export function ListaOmni({ attivaId, onScegli, onNuova }: { attivaId: string | null; onScegli: (c: ChatOmni) => void; onNuova?: () => void }) {
    const { user } = useAuth();
    const { stores } = useVisibleStores();
    // COME ORDINARE (Luca 26/08: «che tu metta i non letti davanti ha senso,
    // però dammi la possibilità di decidere»). Due modi soli, perché sono i
    // due modi in cui si guarda davvero una lista: «cosa è successo adesso»
    // e «cosa devo ancora sbrigare». La scelta si ricorda: è il modo di
    // leggere di quella persona, non un filtro di perimetro.
    // DI DEFAULT I NON LETTI DAVANTI (Luca 27/08: «di default mettimi che mi
    // dai le chat non lette prima e poi io posso cambiarle in recenti»): si
    // apre la chat per sbrigare quello che aspetta, non per guardare l'orario.
    const [ordine, setOrdine] = useState<"recenti" | "nonletti">(() => {
        if (typeof window === "undefined") return "nonletti";
        return (localStorage.getItem("crm_omni_ordine") as "recenti" | "nonletti") || "nonletti";
    });
    useEffect(() => { try { localStorage.setItem("crm_omni_ordine", ordine); } catch { } }, [ordine]);
    const [cerca, setCerca] = useState("");
    const [chats, setChats] = useState<ChatOmni[] | null>(null);
    // «VEDI COME» (Luca 26/08): «dammi la possibilità di selezionare un punto
    // vendita o un utente e allora io vedo quello che vede lui — essendo un
    // omnichat vedrò tutte le sue chat WhatsApp, tutte le mail e tutte le chat
    // interne». È il modo giusto di guardare più numerazioni: non una griglia
    // di numeri, ma immedesimarsi in chi lavora. Chi non vede tutta la rete
    // non ha il selettore: vedrebbe solo se stesso.
    const [comeChi, setComeChi] = useState<string>("io");
    const [persone, setPersone] = useState<{ id: string; nome: string; role: string; negozio: string | null }[]>([]);
    const [negozi, setNegozi] = useState<string[]>([]);
    const puoImmedesimarsi = seesAllStores(user?.role);
    const [errore, setErrore] = useState<string | null>(null);

    useEffect(() => {
        if (!puoImmedesimarsi) return;
        let vivo = true;
        // ⚠️ I NEGOZI VENGONO DA `stores`, non da useVisibleStores: per chi
        // vede tutta la rete quella lista è vuota per costruzione, ed è il
        // motivo per cui nel selettore comparivano solo le persone.
        // allSettled e non all: se cade una delle due, l'altra deve comunque
        // riempire il selettore (prima restavano vuote tutte e due)
        Promise.allSettled([elencoPersone(), elencoNegozi()]).then(([p, n]) => {
            if (!vivo) return;
            if (p.status === "fulfilled") setPersone(p.value); else setErrore(String(p.reason?.message || p.reason));
            if (n.status === "fulfilled") setNegozi(n.value); else setErrore(String(n.reason?.message || n.reason));
        });
        return () => { vivo = false; };
    }, [puoImmedesimarsi]);

    // la lista NON era viva (Francesco 27/08: «mando un messaggio e non
    // compare tra i recenti»): un giro ogni 25s + il colpo immediato
    // dell'evento tf-omni-refresh emesso dagli invii
    const [tick, setTick] = useState(0);
    useEffect(() => {
        const iv = setInterval(() => setTick((t) => t + 1), 25000);
        const su = () => setTimeout(() => setTick((t) => t + 1), 900);
        window.addEventListener("tf-omni-refresh", su);
        return () => { clearInterval(iv); window.removeEventListener("tf-omni-refresh", su); };
    }, []);
    const prospettivaPrec = useRef<string | null>(null);
    useEffect(() => {
        let vivo = true;
        setErrore(null);
        // chi guardo: me stesso, un negozio (come lo vedrebbe il suo store
        // manager) oppure una persona con il SUO ruolo e il SUO negozio
        const p = comeChi.startsWith("u:") ? persone.find((x) => x.id === comeChi.slice(2)) : null;
        const neg = comeChi.startsWith("n:") ? comeChi.slice(2) : null;
        // lo spinner solo al CAMBIO di prospettiva: sul refresh silenzioso
        // la lista resta al suo posto e si aggiorna sotto le dita
        if (prospettivaPrec.current !== comeChi) { setChats(null); prospettivaPrec.current = comeChi; }
        (async () => {
            // per un NEGOZIO servono anche i suoi: numero e casella sono del
            // punto vendita, le chat interne sono di ciascuno
            const membri = neg ? await membriNegozio(neg) : null;
            const chi = p
                ? { id: p.id, role: p.role, stores: p.negozio ? [p.negozio] : [], membri: null, reale: user?.id || null, ruoloReale: user?.role || null, soloNegozio: null }
                : neg
                    ? { id: user?.id || null, role: "store_manager", stores: [neg], membri, reale: user?.id || null, ruoloReale: user?.role || null, soloNegozio: neg }
                    : { id: user?.id || null, role: user?.role || null, stores, membri: null, reale: user?.id || null, soloNegozio: null };
            const lista = await caricaConversazioni(chi);
            // immedesimandomi in UNA persona il proprietario è sempre lei: il
            // nome non va in lista (lo dice già la fascia gialla) ma serve
            // alla testata della chat in sola lettura
            return p ? lista.map((x) => (x.canale === "interna" ? { ...x, proprietarioNome: x.proprietarioNome || p.nome } : x)) : lista;
        })()
            .then((c) => { if (vivo) setChats(c); })
            .catch((e) => { if (vivo) { setChats([]); setErrore(String((e as Error)?.message || e)); } });
        return () => { vivo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id, user?.role, stores.join("|"), comeChi, persone.length, tick]);

    /* ── IL SELETTORE «VEDI COME» ─────────────────────────────────────────
       Con 150 collaboratori una tendina è inservibile: si scrive e si filtra
       (Luca 27/08). Negozi e persone nello stesso elenco, perché il modo in
       cui uno cerca è «Magliana» o «Alessio», non «prima scelgo la
       categoria». */
    const [apertoSel, setApertoSel] = useState(false);
    const [cercaChi, setCercaChi] = useState("");
    const etichettaChi = useMemo(() => {
        if (comeChi.startsWith("n:")) return `🏪 ${comeChi.slice(2)}`;
        if (comeChi.startsWith("u:")) return `👤 ${persone.find((x) => x.id === comeChi.slice(2))?.nome || "collaboratore"}`;
        return "👁 Quello che vedo io";
    }, [comeChi, persone]);
    const opzioni = useMemo(() => {
        const q = cercaChi.trim().toLowerCase();
        const neg = negozi.filter((n) => !q || n.toLowerCase().includes(q))
            .map((n) => ({ chiave: `n:${n}`, icona: "🏪", nome: n, sotto: "punto vendita" }));
        const per = persone.filter((p) => !q || `${p.nome} ${p.negozio || ""}`.toLowerCase().includes(q))
            .map((p) => ({ chiave: `u:${p.id}`, icona: "👤", nome: p.nome, sotto: p.negozio || p.role.replace(/_/g, " ") }));
        return [...neg, ...per];
    }, [negozi, persone, cercaChi]);

    const lista = useMemo(() => {
        const q = cerca.trim().toLowerCase();
        const out = (chats || [])
            .filter((c) => !q || `${c.nome} ${c.anteprima} ${c.sottotitolo || ""} ${c.numero || ""} ${c.perChi || ""}`.toLowerCase().includes(q));
        // arriva già in ordine di tempo: «non letti prima» li fa risalire
        // SENZA mescolarli — dentro ogni fascia il tempo continua a scendere
        if (ordine === "nonletti") {
            return [...out].sort((a, b) => (a.daLeggere === b.daLeggere ? 0 : a.daLeggere ? -1 : 1));
        }
        return out;
    }, [chats, cerca, ordine]);

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
                    {onNuova && (
                        <button type="button" onClick={onNuova} title="Nuova conversazione: chat interna, WhatsApp o email"
                            className="shrink-0 flex items-center gap-1 rounded-lg bg-sky-500/15 border border-sky-500/40 px-2 py-1 text-[11px] font-bold text-sky-300 hover:bg-sky-500/25 transition-colors">
                            ➕ Nuova
                        </button>
                    )}
                </div>
                {puoImmedesimarsi && (
                    <div className="relative">
                        <button type="button" onClick={() => { setApertoSel((v) => !v); setCercaChi(""); }}
                            title="Guarda la posta e le chat con gli occhi di un negozio o di una persona"
                            className={cn("w-full flex items-center justify-between gap-2 border rounded-xl px-2.5 py-1.5 text-[11px] text-white outline-none transition-colors",
                                comeChi === "io" ? "bg-white/[0.04] border-white/10 hover:border-white/20"
                                    : "bg-amber-400/10 border-amber-400/30 hover:border-amber-400/50")}>
                            <span className="truncate">{etichettaChi}</span>
                            <span className="text-slate-500 shrink-0">▾</span>
                        </button>
                        {apertoSel && (
                            <>
                                <div className="fixed inset-0 z-20" onClick={() => setApertoSel(false)} />
                                <div className="absolute z-30 mt-1 left-0 right-0 rounded-xl border border-white/10 bg-[#141726] shadow-2xl overflow-hidden">
                                    <div className="p-2 border-b border-white/5">
                                        <input autoFocus value={cercaChi} onChange={(e) => setCercaChi(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Escape") setApertoSel(false);
                                                // invio = prendi il primo della lista filtrata
                                                if (e.key === "Enter" && opzioni.length) { setComeChi(opzioni[0].chiave); setApertoSel(false); }
                                            }}
                                            placeholder="Scrivi un negozio o una persona…"
                                            className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-white placeholder-slate-600 outline-none focus:border-indigo-500/50" />
                                    </div>
                                    <div className="max-h-64 overflow-y-auto py-1">
                                        <button type="button" onClick={() => { setComeChi("io"); setApertoSel(false); }}
                                            className={cn("w-full text-left px-3 py-1.5 text-[11px] hover:bg-white/[0.06] flex items-center gap-2",
                                                comeChi === "io" ? "text-white font-bold" : "text-slate-300")}>
                                            👁 Quello che vedo io
                                        </button>
                                        {!opzioni.length && (
                                            <p className="px-3 py-3 text-[11px] text-slate-500">Nessun negozio e nessuna persona con queste lettere.</p>
                                        )}
                                        {opzioni.map((o) => (
                                            <button key={o.chiave} type="button" onClick={() => { setComeChi(o.chiave); setApertoSel(false); }}
                                                className={cn("w-full text-left px-3 py-1.5 hover:bg-white/[0.06] flex items-center gap-2",
                                                    comeChi === o.chiave ? "bg-white/[0.06]" : "")}>
                                                <span className="shrink-0">{o.icona}</span>
                                                <span className="flex-1 min-w-0">
                                                    <span className={cn("block truncate text-[11px]", comeChi === o.chiave ? "text-white font-bold" : "text-slate-200")}>{o.nome}</span>
                                                    {o.sotto && <span className="block truncate text-[9px] text-slate-500">{o.sotto}</span>}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}
                <input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca in tutti i canali…"
                    className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-600 outline-none focus:border-indigo-500/50" />
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[9px] uppercase tracking-widest text-slate-600 font-bold">Ordina</span>
                    <div className="flex bg-white/[0.04] p-0.5 rounded-lg border border-white/5">
                        {([["recenti", "Recenti"], ["nonletti", "Non letti prima"]] as const).map(([id, lab]) => (
                            <button key={id} onClick={() => setOrdine(id)}
                                className={cn("px-2 py-0.5 rounded-md text-[10px] font-bold transition-colors",
                                    ordine === id ? "bg-white/[0.08] text-white" : "text-slate-500 hover:text-slate-300")}>
                                {lab}
                            </button>
                        ))}
                    </div>
                </div>
                {/* ⚠️ NIENTE SOTTOFILTRI PER CANALE (Luca 26/08): «esiste già
                    sopra» — le quattro schede in cima sono le stesse quattro
                    voci, e ripeterle qui sotto è solo rumore. L'Omnichat è la
                    scheda che LE COMPRENDE tutte: se voglio il dettaglio di un
                    canale clicco la sua scheda in alto. */}
            </div>

            {comeChi !== "io" && (
                <div className="mx-3 mt-2 text-[10px] text-amber-200/90 bg-amber-400/10 border border-amber-400/25 rounded-lg px-2.5 py-1.5">
                    {comeChi.startsWith("n:") ? (
                        <>Stai guardando il punto vendita <b>{comeChi.slice(2)}</b>: il suo numero, la sua casella e le chat interne di chi ci lavora — ognuna con il nome di chi ce l&apos;ha.</>
                    ) : (
                        <>Stai guardando con gli occhi di <b>{persone.find((x) => x.id === comeChi.slice(2))?.nome || "un collega"}</b>: la lista è la sua, non la tua.</>
                    )}
                </div>
            )}
            {errore && <div className="m-3 text-[11px] text-rose-300 border border-rose-500/40 bg-rose-500/10 rounded-lg px-3 py-2">⚠️ {errore}</div>}

            <div className="flex-1 overflow-y-auto p-2 space-y-0.5 min-h-0">
                {chats === null && <p className="text-xs text-slate-500 text-center py-8">Carico le conversazioni…</p>}
                {chats !== null && !lista.length && (
                    <p className="text-xs text-slate-500 text-center py-8 px-4 leading-relaxed">
                        {cerca ? "Nessuna conversazione con queste parole." : "Nessuna conversazione."}
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
                            {/* nell'Omnichat i canali sono SEMPRE mescolati: il pallino dice da dove arriva */}
                            {(
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
                                {/* di chi è: solo guardando un negozio, dove la stessa
                                    lista tiene le chat interne di più persone */}
                                {c.perChi && <span className="text-amber-300/80 font-semibold">di {c.perChi} · </span>}
                                {c.sottotitolo || c.anteprima || "—"}
                            </p>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}
