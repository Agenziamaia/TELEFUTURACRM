"use client";

/* ═══ CHAT OMNICANALE — le tre colonne ════════════════════════════════════
   Lista · Conversazione · Radar. La grafica è quella del master layout di
   Luca (26/08), portata sulle convenzioni del CRM: niente Tailwind da CDN
   (ce l'abbiamo già), niente `db` finto — i dati arrivano da `dati.ts`.

   ⚠️ QUESTA VISTA NON DECIDE NIENTE. Riceve un `Radar` che è già della forma
   giusta e disegna i moduli nell'ordine che il caso impone. Le regole di
   Luca vivono nei tipi e nello strato dati, non negli `if` di qui: è il
   motivo per cui un prospect non può mostrare l'LTV nemmeno per errore —
   quel campo, sul suo tipo, non esiste.

   I pulsanti «Next Best Action» in fondo alla colonna destra sono TBD e
   quindi NON ci sono: meglio uno spazio pulito che un bottone che non fa
   niente.                                                                */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useVisibleStores } from "@/lib/visibleStores";
import { cn } from "@/utils";
import { caricaConversazioni, caricaMessaggi, caricaRadar, inviaMessaggio } from "./dati";
import type { ChatOmni, MessaggioOmni, Radar, TabOmni } from "./tipi";

const euro = (v: number) => v.toLocaleString("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });

const TABS: { id: TabOmni; label: string; colore: string }[] = [
    { id: "tutti", label: "Tutti", colore: "text-white" },
    { id: "interna", label: "Staff", colore: "text-indigo-400" },
    { id: "wa", label: "WhatsApp", colore: "text-emerald-400" },
    { id: "email", label: "Mail", colore: "text-sky-400" },
];

export function ModuloChatOmni() {
    const { user } = useAuth();
    const { stores } = useVisibleStores();
    const [tab, setTab] = useState<TabOmni>("tutti");
    const [chats, setChats] = useState<ChatOmni[] | null>(null);
    const [attivaId, setAttivaId] = useState<string | null>(null);
    const [messaggi, setMessaggi] = useState<MessaggioOmni[] | null>(null);
    const [radar, setRadar] = useState<Radar | null>(null);
    const [testo, setTesto] = useState("");
    const [apertoId, setApertoId] = useState<string | null>(null);
    const [valoreStaff, setValoreStaff] = useState(false);
    const [errore, setErrore] = useState<string | null>(null);
    const [invio, setInvio] = useState(false);
    const fondo = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let vivo = true;
        setErrore(null);
        caricaConversazioni({ id: user?.id || null, role: user?.role || null, stores })
            .then((c) => { if (vivo) setChats(c); })
            // ⚠️ senza questo, al primo errore lo stato restava null e la
            // schermata diceva «Carico…» per sempre, con l'errore solo in
            // console: un guasto che sembra lentezza
            .catch((e) => { if (vivo) { setChats([]); setErrore(String(e?.message || e)); } });
        return () => { vivo = false; };
    }, [user?.id, user?.role, stores.join("|")]);   // eslint-disable-line react-hooks/exhaustive-deps

    // la lista del tab: «Tutti» fonde i canali, gli altri filtrano
    const lista = useMemo(
        () => (chats || []).filter((c) => tab === "tutti" || c.canale === tab),
        [chats, tab]);

    // la conversazione aperta deve sempre esistere DENTRO il tab corrente:
    // cambiando tab, se quella di prima non c'è più si prende la prima
    const attiva = useMemo(
        () => lista.find((c) => c.id === attivaId) || lista[0] || null,
        [lista, attivaId]);

    useEffect(() => {
        if (!attiva) { setMessaggi(null); setRadar(null); return; }
        let vivo = true;
        setMessaggi(null); setRadar(null); setApertoId(null); setValoreStaff(false);
        caricaMessaggi(attiva, user?.id || null)
            .then((m) => { if (vivo) setMessaggi(m); })
            .catch((e) => { if (vivo) { setMessaggi([]); setErrore(String(e?.message || e)); } });
        caricaRadar(attiva, { id: user?.id || null, nome: user?.name || null })
            .then((r) => { if (vivo) setRadar(r); })
            .catch((e) => { if (vivo) setErrore(String(e?.message || e)); });
        return () => { vivo = false; };
    }, [attiva?.id, user?.id, user?.name]);   // eslint-disable-line react-hooks/exhaustive-deps

    // niente scroll quando non c'è ancora niente da scorrere
    useEffect(() => { if (messaggi?.length) fondo.current?.scrollIntoView({ behavior: "smooth" }); }, [messaggi]);

    const cambiaTab = useCallback((t: TabOmni) => { setTab(t); setAttivaId(null); }, []);

    // INVIO: passa dalle stesse API della Chat vera. Dopo l'invio si
    // ricaricano i messaggi invece di aggiungere una bolla ottimista: su
    // WhatsApp il messaggio nasce lato server e la bolla finta resterebbe lì
    // anche se l'invio fallisse a metà strada.
    const manda = useCallback(async () => {
        if (!attiva || !testo.trim() || invio) return;
        setInvio(true); setErrore(null);
        try {
            await inviaMessaggio(attiva, testo, user?.id || null);
            setTesto("");
            setMessaggi(await caricaMessaggi(attiva, user?.id || null));
        } catch (e) {
            setErrore(`Non sono riuscito a inviare: ${String((e as Error)?.message || e)}`);
        } finally {
            setInvio(false);
        }
    }, [attiva, testo, invio, user?.id]);

    const accento = attiva?.canale === "wa" ? "emerald" : attiva?.canale === "email" ? "sky" : "indigo";

    return (
        <div className="flex h-[calc(100vh-var(--tf-topbar,64px))] overflow-hidden text-slate-300">

            {/* ══ 1 · LISTA ══ */}
            <aside className="w-[340px] shrink-0 border-r border-white/5 bg-white/[0.015] flex flex-col">
                <div className="p-5 border-b border-white/5">
                    <h2 className="text-xl font-bold text-white tracking-tight mb-4 flex items-center gap-2">
                        Comunicazioni
                        <span className="bg-indigo-500/20 text-indigo-400 text-[10px] px-2 py-0.5 rounded-full border border-indigo-500/30">Beta</span>
                    </h2>
                    <div className="flex bg-white/[0.04] p-1 rounded-xl border border-white/5">
                        {TABS.map((t) => (
                            <button key={t.id} onClick={() => cambiaTab(t.id)}
                                className={cn("flex-1 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all",
                                    tab === t.id ? `bg-white/[0.06] border border-white/5 ${t.colore}` : "text-slate-500 hover:text-white")}>
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>
                {errore && (
                    <div className="mx-3 mt-3 text-[11px] text-rose-300 border border-rose-500/40 bg-rose-500/10 rounded-lg px-3 py-2">
                        ⚠️ {errore}
                    </div>
                )}
                <div className="flex-1 overflow-y-auto p-3 space-y-1">
                    {chats === null && <p className="text-xs text-slate-500 text-center py-8">Carico le conversazioni…</p>}
                    {chats !== null && !lista.length && <p className="text-xs text-slate-500 text-center py-8">Nessuna conversazione in questo canale.</p>}
                    {lista.map((c) => (
                        <button key={c.id} onClick={() => setAttivaId(c.id)}
                            className={cn("w-full text-left p-3 rounded-2xl flex gap-3 transition-colors border",
                                attiva?.id === c.id ? "bg-white/[0.05] border-white/10" : "border-transparent hover:bg-white/[0.02]")}>
                            <div className="relative shrink-0">
                                <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center text-sm font-black border border-white/5",
                                    c.canale === "wa" ? "bg-emerald-500/10 text-emerald-400"
                                        : c.canale === "email" ? "bg-sky-500/10 text-sky-400"
                                            : "bg-indigo-500/10 text-indigo-400")}>
                                    {c.iniziali}
                                </div>
                                {/* il pallino del canale serve SOLO su «Tutti»: negli
                                    altri tab il canale è già quello scelto */}
                                {tab === "tutti" && (
                                    <span className={cn("absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[#0b0b12] flex items-center justify-center text-[8px] font-bold text-white",
                                        c.canale === "wa" ? "bg-emerald-500" : c.canale === "email" ? "bg-sky-500" : "bg-indigo-500")}>
                                        {c.canale === "wa" ? "W" : c.canale === "email" ? "@" : "I"}
                                    </span>
                                )}
                                {c.daLeggere && <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-sky-400 rounded-full border-2 border-[#0b0b12]" />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-baseline gap-2 mb-1">
                                    <span className={cn("text-sm truncate", c.daLeggere || attiva?.id === c.id ? "font-bold text-white" : "font-medium text-slate-300")}>{c.nome}</span>
                                    <span className="text-[10px] text-slate-500 tabular-nums shrink-0">{c.ora}</span>
                                </div>
                                <p className={cn("text-xs truncate", c.daLeggere ? "text-indigo-300 font-medium" : "text-slate-500")}>
                                    {c.sottotitolo || c.anteprima}
                                </p>
                            </div>
                        </button>
                    ))}
                </div>
            </aside>

            {/* ══ 2 · CONVERSAZIONE ══ */}
            <section className="flex-1 min-w-0 flex flex-col border-r border-white/5">
                {!attiva ? (
                    <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">Scegli una conversazione a sinistra.</div>
                ) : (
                    <>
                        <header className="h-[75px] px-8 border-b border-white/5 flex items-center shrink-0">
                            <div className="min-w-0">
                                <h3 className="font-bold text-white text-lg tracking-wide truncate">{attiva.nome}</h3>
                                <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                                    {attiva.canale === "email" ? (attiva.sottotitolo || "—")
                                        : attiva.canale === "wa" ? (attiva.numero || "WhatsApp")
                                            : "Chat interna"}
                                </p>
                            </div>
                        </header>

                        <div className="flex-1 overflow-y-auto p-8 space-y-6">
                            {messaggi === null && <p className="text-xs text-slate-500 text-center">Carico i messaggi…</p>}
                            {messaggi?.length === 0 && <p className="text-xs text-slate-500 text-center">Nessun messaggio in questa conversazione.</p>}
                            {(messaggi || []).map((m) => (
                                <div key={m.id} className={cn("flex", m.verso === "out" ? "justify-end" : "justify-start")}>
                                    <div className={cn("p-4 rounded-2xl shadow-lg",
                                        m.isMail ? "bg-white/5 border border-white/10 text-slate-200 w-full"
                                            : m.verso === "out"
                                                ? cn("text-white rounded-tr-sm max-w-[70%]", attiva.canale === "wa" ? "bg-emerald-600" : "bg-indigo-600")
                                                : "bg-white/[0.04] border border-white/5 text-slate-200 rounded-tl-sm max-w-[70%]")}>
                                        {m.autore && <p className="text-[10px] font-bold tracking-widest mb-1.5 opacity-60 uppercase">{m.autore}</p>}
                                        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{m.testo}</p>
                                        <span className={cn("text-[9px] block mt-2 opacity-60 tabular-nums", m.verso === "out" ? "text-right" : "text-left")}>{m.ora}</span>
                                    </div>
                                </div>
                            ))}
                            <div ref={fondo} />
                        </div>

                        {/* LA BARRA CAMBIA COL CANALE (regola 1): sulla chat interna
                            compaiono le scorciatoie di reparto, su WhatsApp e mail
                            l'input è quello standard del canale. */}
                        <div className="p-6 shrink-0 border-t border-white/5">
                            {attiva.canale === "interna" && (
                                <div className="flex flex-wrap gap-1.5 mb-2">
                                    {["#vendita", "#pratica", "#magazzino", "#urgente"].map((t) => (
                                        <button key={t} onClick={() => setTesto((p) => (p ? `${p} ${t}` : t))}
                                            className="text-[10px] font-bold px-2 py-1 rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20">
                                            {t}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <div className={cn("flex items-center gap-3 bg-white/[0.04] border border-white/10 rounded-2xl p-2 transition-colors",
                                accento === "emerald" ? "focus-within:border-emerald-500/50" : accento === "sky" ? "focus-within:border-sky-500/50" : "focus-within:border-indigo-500/50")}>
                                <input value={testo} onChange={(e) => setTesto(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); manda(); } }}
                                    disabled={invio}
                                    placeholder={attiva.canale === "email" ? "Scrivi la risposta…" : "Scrivi un messaggio…"}
                                    className="flex-1 bg-transparent border-none outline-none text-sm text-white px-4 placeholder-slate-600" />
                                <button disabled={invio || !testo.trim()} onClick={manda} title="Invia"
                                    className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 transition-opacity",
                                        (invio || !testo.trim()) && "opacity-40 cursor-not-allowed",
                                        accento === "emerald" ? "bg-emerald-500" : accento === "sky" ? "bg-sky-500" : "bg-indigo-600")}>
                                    {invio ? "…" : "➤"}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </section>

            {/* ══ 3 · RADAR ══ */}
            <aside key={attiva?.id || "vuoto"} className="w-[420px] shrink-0 bg-white/[0.015] overflow-y-auto">
                {!attiva || !radar ? (
                    <p className="text-xs text-slate-500 text-center py-10">{attiva ? "Preparo il radar…" : ""}</p>
                ) : (
                    <div className="flex flex-col h-full">
                        {/* TESTATA CON STATUS BINARIO (regola 2) */}
                        <div className="h-32 relative overflow-hidden border-b border-white/5 shrink-0 bg-gradient-to-br from-white/[0.04] to-transparent">
                            <div className={cn("absolute -top-10 -right-10 w-32 h-32 blur-3xl rounded-full",
                                radar.coloreUmore === "emerald" ? "bg-emerald-500/20" : "bg-indigo-500/20")} />
                            <div className="absolute bottom-5 left-6 flex items-end gap-4">
                                <div className="w-14 h-14 rounded-2xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-xl font-black text-white">
                                    {attiva.iniziali}
                                </div>
                                <div className="pb-0.5">
                                    <h3 className="font-black text-white text-lg tracking-wide">{attiva.nome}</h3>
                                    <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-widest mt-1 inline-block border",
                                        radar.stato === "Cliente Registrato" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                            : radar.stato === "Non Registrato" ? "bg-slate-500/10 text-slate-400 border-slate-500/20"
                                                : "bg-indigo-500/10 text-indigo-400 border-indigo-500/20")}>
                                        {radar.stato}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 p-6 space-y-6">
                            {/* AI SUMMARY — primo per tutti e tre i casi */}
                            <div className="relative p-5 rounded-2xl bg-white/[0.02] border border-white/5 overflow-hidden">
                                <span className={cn("absolute top-0 left-0 w-1 h-full", radar.coloreUmore === "emerald" ? "bg-emerald-500" : "bg-indigo-500")} />
                                <h4 className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2 mb-3">
                                    <span className={radar.coloreUmore === "emerald" ? "text-emerald-400" : "text-indigo-400"}>✨</span> AI Summary
                                </h4>
                                <p className="text-xs text-slate-300 leading-relaxed">{radar.aiSummary}</p>
                            </div>

                            {/* CASO A — cliente registrato */}
                            {radar.tipo === "cliente" && (
                                <>
                                    <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-5">
                                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Valore Generato (LTV)</h4>
                                        <div className="text-3xl font-black text-white leading-none tracking-tight">{euro(radar.ltv.euro)}</div>
                                        <p className="text-[10px] text-slate-500 mt-2">{radar.ltv.nota}</p>
                                    </div>

                                    {/* il modulo hardware ESISTE SOLO se c'è una rata in
                                        corso: `hardware` è null e sparisce del tutto */}
                                    {radar.hardware && (
                                        <div>
                                            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Ecosistema &amp; Hardware</h4>
                                            <div className="bg-white/[0.02] border border-white/5 p-4 rounded-xl">
                                                <div className="flex justify-between items-start mb-2 gap-2">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <span className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">📱</span>
                                                        <div className="min-w-0">
                                                            <h5 className="text-xs font-bold text-white truncate">{radar.hardware.nome}</h5>
                                                            {radar.hardware.finanziaria && <p className="text-[9px] text-slate-400">Finanziamento {radar.hardware.finanziaria}</p>}
                                                        </div>
                                                    </div>
                                                    <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 shrink-0">{radar.hardware.stato}</span>
                                                </div>
                                                <div className="mt-4 pt-3 border-t border-white/5">
                                                    <div className="flex justify-between items-end mb-1.5">
                                                        <span className="text-[9px] font-bold text-slate-400">Rate pagate ({radar.hardware.rate}/{radar.hardware.rateTotali}{radar.hardware.stimata ? " ~" : ""})</span>
                                                        <span className="text-[9px] font-bold text-indigo-400" title={radar.hardware.stimata ? "La durata del finanziamento non è registrata a catalogo: stimata sui 24 mesi standard" : undefined}>Scade tra {radar.hardware.scade}</span>
                                                    </div>
                                                    <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                                                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${radar.hardware.percentuale}%` }} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {radar.timeline.length > 0 && (
                                        <div>
                                            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Cronologia Eventi</h4>
                                            <div className="relative border-l border-white/10 ml-4 space-y-4 pb-4">
                                                {radar.timeline.map((ev) => {
                                                    const aperto = apertoId === ev.id;
                                                    return (
                                                        <div key={ev.id} className="relative">
                                                            <span className={cn("absolute -left-[18px] top-3 w-8 h-8 rounded-full border flex items-center justify-center text-xs", ev.coloreIcona)}>{ev.icona}</span>
                                                            <div className="ml-6">
                                                                <button onClick={() => setApertoId(aperto ? null : ev.id)} disabled={!ev.dettagli}
                                                                    className={cn("w-full text-left p-4 rounded-xl border transition-all",
                                                                        aperto ? "bg-white/[0.05] border-sky-500/60" : "bg-white/[0.02] border-white/5 hover:border-white/20")}>
                                                                    <p className="text-[9px] text-slate-400 mb-1">{ev.data}</p>
                                                                    <h5 className={cn("font-bold text-sm", aperto ? "text-white" : "text-slate-200")}>
                                                                        {ev.titolo} {ev.dettagli && <span className="text-slate-500 text-[10px] ml-1">{aperto ? "▴" : "▾"}</span>}
                                                                    </h5>
                                                                    <p className="text-[10px] text-slate-500 mt-1">{ev.sottotitolo}</p>
                                                                    {aperto && ev.dettagli && (
                                                                        <div className="mt-4 pt-4 border-t border-white/5 space-y-3">
                                                                            {ev.dettagli.map((d, i) => (
                                                                                <div key={i} className="flex items-center gap-3 bg-white/[0.02] border border-white/5 p-3 rounded-lg">
                                                                                    <span className="w-8 h-8 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center text-xs shrink-0">{d.logo}</span>
                                                                                    <div className="flex-1 min-w-0">
                                                                                        <div className="flex justify-between items-center gap-2">
                                                                                            <span className="text-[10px] font-bold text-white truncate">{d.brand}</span>
                                                                                            {d.stato && <span className="text-[8px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded shrink-0">{d.stato}</span>}
                                                                                        </div>
                                                                                        <p className="text-[10px] text-slate-500 truncate">{d.desc}</p>
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

                            {/* CASO B — prospect: solo l'avviso, niente numeri */}
                            {radar.tipo === "prospect" && (
                                <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-6 text-center">
                                    <div className="w-16 h-16 bg-white/[0.02] border border-white/10 rounded-full flex items-center justify-center text-2xl mx-auto mb-3">👤</div>
                                    <h4 className="text-sm font-bold text-white mb-2">Anagrafica inesistente</h4>
                                    <p className="text-xs text-slate-500 leading-relaxed">
                                        Crea l&apos;anagrafica per sbloccare il valore generato, i contratti e la cronologia delle operazioni.
                                    </p>
                                </div>
                            )}

                            {/* CASO C — collega */}
                            {radar.tipo === "staff" && (
                                <div>
                                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Confronto attivazioni odierne</h4>
                                    <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5 space-y-5">
                                        {[radar.kpi.loro, radar.kpi.tuo].map((p, i) => (
                                            <div key={p.nome + i}>
                                                <div className="flex justify-between items-end mb-1">
                                                    <span className={cn("text-xs font-bold", i === 0 ? "text-white" : "text-slate-400")}>{p.nome}</span>
                                                    <span className={cn("text-xs font-bold", i === 0 ? "text-indigo-400" : "text-emerald-400")}>{p.pezzi} pz</span>
                                                </div>
                                                <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                                                    <div className={cn("h-full rounded-full", i === 0 ? "bg-indigo-500" : "bg-emerald-500")}
                                                        style={{ width: `${Math.round((p.pezzi / radar.kpi.maxPezzi) * 100)}%` }} />
                                                </div>
                                            </div>
                                        ))}
                                        <div className="pt-2 border-t border-white/5">
                                            <button onClick={() => setValoreStaff((v) => !v)}
                                                className="w-full flex justify-between items-center text-[10px] font-bold text-slate-400 hover:text-white transition-colors">
                                                ESPLODI VALORE GENERATO <span>{valoreStaff ? "▴" : "▾"}</span>
                                            </button>
                                            {valoreStaff && (
                                                <div className="grid grid-cols-2 gap-3 mt-4">
                                                    <div className="bg-white/[0.02] border border-white/5 p-3 rounded-lg text-center">
                                                        <span className="text-[9px] text-slate-500 uppercase block mb-1">Valore {radar.kpi.loro.nome}</span>
                                                        <span className="text-sm font-black text-indigo-400">{euro(radar.kpi.loro.valore)}</span>
                                                    </div>
                                                    <div className="bg-white/[0.02] border border-white/5 p-3 rounded-lg text-center">
                                                        <span className="text-[9px] text-slate-500 uppercase block mb-1">Valore tuo</span>
                                                        <span className="text-sm font-black text-emerald-400">{euro(radar.kpi.tuo.valore)}</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* NEXT BEST ACTION: TBD, quindi assenti (Luca 26/08) */}
                        </div>
                    </div>
                )}
            </aside>
        </div>
    );
}
