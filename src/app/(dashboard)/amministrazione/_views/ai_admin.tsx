"use client";

/* ═══ SPESA E USO DELL'AI ══════════════════════════════════════════════════
   Luca 31/08: «un resoconto dei token, di quanto stiamo spendendo diviso per
   categorie, e posso filtrare per utenza». Tetto: trenta euro al mese.

   ⚠️ RIFATTA il 31/08 sera. La prima versione l'avevo disegnata a mano —
   barre di div, nessun tooltip, nessun filtro — e Luca: «molto old style, non
   è in linea con il design del CRM; ci passo sopra e non dice quanto abbiamo
   speso quel giorno, non posso filtrare per utente, non posso verificare
   QUANDO hanno speso». Aveva ragione su tutto, e la cosa peggiore è che
   l'avevo già annotato: gli strumenti di Analisi esistevano, e li ho
   ignorati. Qui si usano quelli — stessi grafici, stessi tooltip, stesso
   selettore di periodo: chi conosce Analisi non deve imparare niente.

   ⚠️ SI MISURA IL GESTO, MAI IL CONTENUTO. Qui dentro non entra il testo di
   una domanda, il titolo di una conversazione o «l'argomento» — che sembra
   innocuo e non lo è, perché per produrlo bisogna leggere. L'assistente vale
   quello che vale perché la gente ci mette dentro le cose vere, e le mette
   solo finché è sicura che nessuno le legge.

   E la lettura che conta non è il totale: è il rapporto fra la spesa CHIESTA
   da una persona e quella che gira DA SOLA. La prima è il prodotto e non si
   taglia; la seconda sì. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkles, RefreshCw, ChevronLeft, ChevronRight, Bot, User, AlertTriangle, X } from "lucide-react";
import { cn } from "@/utils";
import { SelectOpzioni } from "@/components/SelectPersona";
/* ⚠️ `_charts` è scritto in JS con i default nei parametri: TypeScript ne
   deduce tipi strettissimi e sbagliati (`media: null`, `colore` obbligatorio
   anche dove non serve). Si prendono come sono, invece di storpiare le
   chiamate per accontentare un'inferenza che non descrive niente. */
import * as G from "../../analisi/_charts";
const AreaChart = G.AreaChart as unknown as (p: Record<string, unknown>) => React.ReactElement;
const BarStack = G.BarStack as unknown as (p: Record<string, unknown>) => React.ReactElement;
const RaceBars = G.RaceBars as unknown as (p: Record<string, unknown>) => React.ReactElement;
const Donut = G.Donut as unknown as (p: Record<string, unknown>) => React.ReactElement;
const Delta = G.Delta as unknown as (p: Record<string, unknown>) => React.ReactElement;
const Ring = G.Ring as unknown as (p: Record<string, unknown>) => React.ReactElement;
const Tip = G.Tip as unknown as (p: Record<string, unknown>) => React.ReactElement;
const TipRiga = G.TipRiga as unknown as (p: Record<string, unknown>) => React.ReactElement;
const TipTitolo = G.TipTitolo as unknown as (p: Record<string, unknown>) => React.ReactElement;
const fmtN = G.fmtN as (v: number, dec?: number) => string;

const COLORI: Record<string, string> = {
    assistente: "#818cf8", triage_whatsapp: "#25D366", triage_email: "#38bdf8",
    omnichat: "#f472b6", motore_storico: "#64748b",
};
const NOMI: Record<string, string> = {
    assistente: "Assistente personale", triage_whatsapp: "Triage WhatsApp",
    triage_email: "Triage Email", omnichat: "Omnichat", motore_storico: "Motori (prima del 31/08)",
};
const EMOJI: Record<string, string> = {
    assistente: "✨", triage_whatsapp: "💬", triage_email: "📧", omnichat: "🔀", motore_storico: "⚙️",
};

/* ⚠️ Gli euro dell'AI sono CENTESIMI: `fmtEuro` di Analisi arrotonda
   all'unità e mostrerebbe «0 €» su tutto. Qui servono i decimali, e sotto il
   centesimo si dice «meno di un centesimo» invece di un falso zero. */
const eur = (v: number) => {
    const n = Number(v) || 0;
    if (n > 0 && n < 0.005) return "<0,01 €";
    return n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
};
const oggiISO = () => new Date().toISOString().slice(0, 10);
const primoDelMese = () => oggiISO().slice(0, 8) + "01";
const MESI = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
const gg = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
const TUTTI = "Tutti · azienda intera";

type Dati = {
    ok: boolean; da: string; a: string; persona: string; canale: string; canaliVisti: string[];
    mese: { speso: number; spesoPrima: number; delta: number; proiezione: number | null; tetto: number; avviso: number; allarme: number; chiesta: number; automatica: number; suMeseCorrente: boolean };
    giorni: { giorno: string; euro: number; richieste: number; chiamate: number; parti: { sezione: string; euro: number }[] }[];
    perSezione: { sezione: string; euro: number; chiamate: number; automatica: boolean; tokenIn: number; tokenOut: number; dedotte: number; righe: number }[];
    perUtenza: { tipo: string; id: string; label: string; euro: number; chiamate: number }[];
    persone: { id: string; nome: string; ruolo: string; negozio: string | null; domande: number; giorniAttivi: number; euro: number; ultima: string | null; delta: number; serie: number[] }[];
    sprechi: { troncate: number; errori: number; senzaCredito: number; passaggiMedi: number | null; attesaMedia: number | null };
    totali: { righe: number; chiamate: number; tokenIn: number; tokenOut: number };
};

export function AiAdminView() {
    const [tipoP, setTipoP] = useState<"mese" | "range">("mese");
    const [ym, setYm] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1 }; });
    const [range, setRange] = useState({ da: primoDelMese(), a: oggiISO() });
    const [persona, setPersona] = useState("");
    const [canale, setCanale] = useState("");
    /* il giorno su cui si è cliccato: apre il dettaglio diviso per canale —
       «il day over day interattivo, filtrabile, cliccabile» (Luca 31/08) */
    const [giornoAperto, setGiornoAperto] = useState<string | null>(null);
    const [d, setD] = useState<Dati | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [caricando, setCaricando] = useState(true);

    const periodo = useMemo(() => {
        if (tipoP === "range") return range;
        const mm = String(ym.m).padStart(2, "0");
        const ultimo = new Date(Date.UTC(ym.y, ym.m, 0)).getUTCDate();
        const fine = `${ym.y}-${mm}-${String(ultimo).padStart(2, "0")}`;
        return { da: `${ym.y}-${mm}-01`, a: fine > oggiISO() ? oggiISO() : fine };
    }, [tipoP, ym, range]);

    const carica = useCallback(async () => {
        setCaricando(true); setErr(null);
        try {
            const r = await fetch(`/api/ai/spesa?da=${periodo.da}&a=${periodo.a}${persona ? `&persona=${persona}` : ""}${canale ? `&canale=${canale}` : ""}`, { cache: "no-store" }).then((x) => x.json());
            if (!r?.ok) throw new Error(r?.error || "non sono riuscito a leggere i consumi");
            setD(r);
        } catch (e) { setErr(String((e as Error)?.message || e)); }
        finally { setCaricando(false); }
    }, [periodo.da, periodo.a, persona, canale]);
    useEffect(() => { void carica(); }, [carica]);

    if (err) return <div className="m-4 text-sm text-rose-300 border border-rose-500/40 bg-rose-500/10 rounded-xl px-4 py-3">⚠️ {err}</div>;
    if (!d) return <div className="p-10 text-center text-sm text-slate-500">Conto quanto costa…</div>;

    const m = d.mese;
    const quota = m.tetto > 0 ? m.speso / m.tetto : 0;
    const colore = quota >= m.allarme ? "#fb7185" : quota >= m.avviso ? "#fbbf24" : "#34d399";
    const chiPersona = persona ? d.persone.find((p) => p.id === persona) : null;
    const attivi = d.persone.filter((p) => p.domande > 0);
    const fermi = d.persone.filter((p) => p.domande === 0);
    const maxGiorno = Math.max(0.0001, ...d.giorni.map((g) => g.euro));

    return (
        <div className="p-4 sm:p-6 space-y-5 an-in">
            {/* ══ TESTATA: periodo, filtro persona, tetto ══════════════════ */}
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0d1022]/80 p-5 sm:p-6 an-scuro">
                <div className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full opacity-25 blur-3xl"
                    style={{ background: "radial-gradient(circle, #818cf8, transparent 65%)", animation: "anAurora 16s ease-in-out infinite" }} />
                <div className="pointer-events-none absolute -bottom-32 -right-16 w-[28rem] h-[28rem] rounded-full opacity-20 blur-3xl"
                    style={{ background: "radial-gradient(circle, #34d399, transparent 65%)", animation: "anAurora 22s ease-in-out infinite reverse" }} />

                <div className="relative flex flex-wrap items-center gap-3 justify-between">
                    <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                        <Sparkles className="w-6 h-6 text-indigo-300" /> Spesa e uso dell&apos;AI
                    </h1>
                    <div className="flex flex-wrap items-center gap-2 justify-end">
                        <div className="flex gap-0.5 p-0.5 rounded-xl bg-white/5 border border-white/10">
                            {[
                                { id: "mese", label: "Mese", vai: () => setTipoP("mese") },
                                { id: "range", label: "Periodo", vai: () => setTipoP("range") },
                                { id: "oggi", label: "Oggi", vai: () => { setTipoP("range"); setRange({ da: oggiISO(), a: oggiISO() }); } },
                            ].map((v) => {
                                const oggiSecco = tipoP === "range" && range.da === oggiISO() && range.a === oggiISO();
                                const attivo = v.id === "oggi" ? oggiSecco : v.id === "mese" ? tipoP === "mese" : tipoP === "range" && !oggiSecco;
                                return <button key={v.id} onClick={v.vai}
                                    className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-all", attivo ? "bg-indigo-500/80 text-white shadow" : "text-slate-400 hover:text-white")}>{v.label}</button>;
                            })}
                        </div>
                        {tipoP === "mese" ? (
                            <div className="flex items-center gap-2">
                                <button onClick={() => setYm((v) => v.m === 1 ? { y: v.y - 1, m: 12 } : { y: v.y, m: v.m - 1 })}
                                    className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10"><ChevronLeft className="w-4 h-4" /></button>
                                <span className="min-w-[130px] text-center text-sm font-bold text-white">{MESI[ym.m - 1]} {ym.y}</span>
                                <button onClick={() => setYm((v) => {
                                    const n = v.m === 12 ? { y: v.y + 1, m: 1 } : { y: v.y, m: v.m + 1 };
                                    const o = new Date(); return (n.y > o.getFullYear() || (n.y === o.getFullYear() && n.m > o.getMonth() + 1)) ? v : n;
                                })} className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10"><ChevronRight className="w-4 h-4" /></button>
                            </div>
                        ) : (
                            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                <span className="text-slate-500">dal</span>
                                <input type="date" value={range.da} max={oggiISO()} onChange={(e) => setRange((r) => ({ ...r, da: e.target.value }))}
                                    className="an-data glass-input px-2 py-1.5 rounded-lg text-xs" />
                                <span className="text-slate-500">al</span>
                                <input type="date" value={range.a} min={range.da} max={oggiISO()} onChange={(e) => setRange((r) => ({ ...r, a: e.target.value }))}
                                    className="an-data glass-input px-2 py-1.5 rounded-lg text-xs" />
                            </div>
                        )}
                        <button onClick={() => void carica()} disabled={caricando}
                            className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10">
                            <RefreshCw className={cn("w-4 h-4", caricando && "animate-spin")} />
                        </button>
                    </div>
                </div>

                {/* filtro persona — richiesto da Luca: «non c'è nessun filtro per gli utenti» */}
                <div className="relative mt-3 flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-[11px] font-bold text-slate-300">
                        📅 {gg(d.da)} → {gg(d.a)}
                    </span>
                    <span className="text-xs text-slate-500">Guarda:</span>
                    {/* ⚠️ la tendina della CASA, non quella del browser (Luca
                        31/08: «è rimasta indietro»). Quella nativa si disegna
                        col tema del sistema — bianca su un CRM scuro — e non si
                        può filtrare scrivendo. `SelectOpzioni` lavora con
                        stringhe: si mostrano i nomi e si risale all'id. */}
                    {/* ⚠️ `className` SOSTITUISCE lo stile del campo, non lo
                        aggiunge: passando solo la larghezza restava senza
                        sfondo né bordo — «si vede poco» (Luca). Si usa `rvIn`,
                        la stessa classe dei campi di Registra Vendita. */}
                    <SelectOpzioni className="rvIn !w-auto min-w-[230px] !py-1.5 !text-[13px]" placeholder="tutti…"
                        value={persona ? (d.persone.find((p) => p.id === persona)?.nome || "") : TUTTI}
                        opzioni={[TUTTI, ...d.persone.filter((p) => p.domande > 0).map((p) => p.nome)]}
                        onChange={(v) => setPersona(v === TUTTI || !v ? "" : (d.persone.find((p) => p.nome === v)?.id || ""))} />
                    {persona && (
                        <button onClick={() => setPersona("")} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-500/20 border border-indigo-400/40 text-[11px] font-bold text-indigo-200">
                            {chiPersona?.nome} <X className="w-3 h-3" />
                        </button>
                    )}
                    {/* I CANALI, come chip: un clic filtra TUTTA la schermata.
                        Si mostrano solo quelli che nel periodo hanno speso
                        qualcosa — un pulsante che non fa niente è peggio di
                        un pulsante che manca. */}
                    <span className="text-xs text-slate-500 ml-1">Canale:</span>
                    {["", ...(d.canaliVisti || [])].map((k) => {
                        const attivo = canale === k;
                        return (
                            <button key={k || "tutti"} onClick={() => { setCanale(k); setGiornoAperto(null); }}
                                className={cn("px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all",
                                    attivo ? "text-white shadow" : "text-slate-400 border-white/10 bg-white/5 hover:text-white")}
                                style={attivo ? { background: (COLORI[k] || "#818cf8") + "33", borderColor: (COLORI[k] || "#818cf8") + "88" } : undefined}>
                                {k ? `${EMOJI[k] || "•"} ${NOMI[k] || k}` : "Tutti"}
                            </button>
                        );
                    })}
                </div>

                {/* ── i numeri grossi ─────────────────────────────────────── */}
                <div className="relative mt-5 grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6 items-center">
                    <Ring value={Math.min(m.speso, m.tetto)} max={m.tetto} colore={colore} size={148}
                        centro={<>
                            <span className="text-2xl font-black text-white tabular-nums leading-none">{eur(m.speso)}</span>
                            <span className="text-[10px] text-slate-400 mt-1">su {eur(m.tetto)}</span>
                            <span className="text-[10px] text-slate-500">{fmtN(quota * 100, 0)}% del tetto</span>
                        </>}
                        sotto={m.proiezione != null
                            ? <span className="text-[10px] text-slate-500">a fine mese {eur(m.proiezione)}</span>
                            : <span className="text-[10px] text-slate-500">prima {eur(m.spesoPrima)}</span>}
                        tip={<div>
                            <TipTitolo>Il tetto del mese</TipTitolo>
                            <TipRiga l="speso" r={eur(m.speso)} colore={colore} />
                            <TipRiga l="tetto" r={eur(m.tetto)}  />
                            {m.proiezione != null && <TipRiga l="a fine mese" r={eur(m.proiezione)}  />}
                            <TipRiga l="periodo prima" r={eur(m.spesoPrima)}  />
                        </div>} />

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                            { t: "Chiesto da una persona", v: eur(m.chiesta), i: User, c: "#818cf8",
                              n: "È il prodotto: qualcuno l'ha voluta. Non si taglia — semmai si vuole che cresca." },
                            { t: "Girato da solo", v: eur(m.automatica), i: Bot, c: "#64748b",
                              n: "I motori che classificano chat e posta. È qui che si interviene, se serve." },
                            { t: m.proiezione != null ? "A fine mese" : "Periodo prima", v: eur(m.proiezione ?? m.spesoPrima), i: Sparkles, c: "#34d399",
                              n: m.proiezione != null ? "Di questo passo, contando i giorni già trascorsi." : "Lo stesso numero di giorni, subito prima." },
                            { t: "Chiamate", v: fmtN(d.totali.chiamate), i: RefreshCw, c: "#38bdf8",
                              n: "Quante volte abbiamo parlato col modello: i triage ne accorpano fino a sessanta per riga." },
                        ].map((x) => (
                            <Tip key={x.t} block tip={<div><TipTitolo>{x.t}</TipTitolo><p className="text-[11px] text-slate-400 max-w-[15rem] leading-relaxed">{x.n}</p></div>}>
                                <div className="glass-card an-card rounded-2xl p-3 h-full">
                                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                                        <x.i className="w-3 h-3" style={{ color: x.c }} /> {x.t}
                                    </div>
                                    <div className="mt-1 text-lg font-black tabular-nums text-white">{x.v}</div>
                                </div>
                            </Tip>
                        ))}
                    </div>
                </div>

                {quota >= m.avviso && (
                    <p className="relative mt-3 text-xs" style={{ color: colore }}>
                        {quota >= m.allarme
                            ? "⚠️ Oltre l'85% del tetto. Al limite si fermano prima i motori automatici: l'assistente delle persone resta acceso."
                            : "Superato il 60% del tetto."}
                    </p>
                )}
            </div>

            {/* ══ IL GIORNO PER GIORNO — «quanto abbiamo speso quel giorno» ══ */}
            <div className="glass-card an-card rounded-2xl p-4">
                <div className="flex items-baseline justify-between mb-1">
                    <h3 className="text-sm font-bold text-white">Giorno per giorno</h3>
                    <span className="text-[11px] text-slate-500">passa sopra per il dettaglio · clicca per aprire il giorno</span>
                </div>
                <p className="text-[11px] text-slate-500 mb-3">
                    Ogni barra è un giorno, divisa per motore. Se il costo e le richieste delle persone salgono insieme
                    è adozione — e sono soldi ben spesi; se sale solo il costo, qualcosa gira a vuoto.
                </p>
                <div onClick={(e) => {
                    /* BarStack non conosce il clic: si intercetta la posizione
                       orizzontale e si risale al giorno. Meno elegante di una
                       prop, ma non tocca un componente che usano tutte le
                       altre schermate. */
                    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    const i = Math.floor(((e.clientX - box.left) / box.width) * d.giorni.length);
                    const g = d.giorni[Math.max(0, Math.min(d.giorni.length - 1, i))];
                    if (g) setGiornoAperto(giornoAperto === g.giorno ? null : g.giorno);
                }} className="cursor-pointer">
                <BarStack h={190} unit="€"
                    giorni={d.giorni.map((g) => ({
                        n: Number(g.giorno.slice(8, 10)),
                        label: gg(g.giorno),
                        tot: g.euro,
                        parti: g.parti.map((p) => ({
                            label: NOMI[p.sezione] || p.sezione,
                            val: p.euro,
                            colore: COLORI[p.sezione] || "#818cf8",
                            sub: eur(p.euro),
                        })),
                    }))}
                    oggi={d.giorni.findIndex((g) => g.giorno === oggiISO())}
                    media={d.giorni.length ? d.giorni.reduce((s, g) => s + g.euro, 0) / d.giorni.length : null} />
                </div>

                {/* IL DETTAGLIO DEL GIORNO, che è la cosa che mancava: si
                    clicca una barra e si vede quel giorno diviso per canale. */}
                {giornoAperto && (() => {
                    const g = d.giorni.find((x) => x.giorno === giornoAperto);
                    if (!g) return null;
                    const parti = [...g.parti].sort((x, y) => y.euro - x.euro);
                    return (
                        <div className="mt-4 rounded-2xl border border-indigo-400/30 bg-indigo-500/[0.06] p-4 an-in">
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <span className="text-xs font-bold uppercase tracking-widest text-indigo-300">
                                        {new Date(g.giorno + "T12:00:00").toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
                                    </span>
                                    <div className="text-2xl font-black text-white tabular-nums">{eur(g.euro)}</div>
                                    <div className="text-[11px] text-slate-400">
                                        {fmtN(g.chiamate)} chiamate · {fmtN(g.richieste)} chieste da una persona
                                    </div>
                                </div>
                                <button onClick={() => setGiornoAperto(null)} className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/5"><X className="w-4 h-4" /></button>
                            </div>
                            {parti.length === 0 ? <p className="text-xs text-slate-500">Nessuna spesa in questo giorno.</p> : (
                                <div className="space-y-1.5">
                                    {parti.map((p) => (
                                        <button key={p.sezione} onClick={() => setCanale(p.sezione)}
                                            className="w-full flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/5 transition-colors text-left">
                                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORI[p.sezione] || "#818cf8" }} />
                                            <span className="flex-1 text-xs text-slate-200">{EMOJI[p.sezione] || "•"} {NOMI[p.sezione] || p.sezione}</span>
                                            <span className="relative h-2 w-32 rounded-full bg-white/5 overflow-hidden">
                                                <span className="absolute inset-y-0 left-0 rounded-full"
                                                    style={{ width: Math.max(3, (p.euro / Math.max(...parti.map((x) => x.euro))) * 100) + "%", background: COLORI[p.sezione] || "#818cf8" }} />
                                            </span>
                                            <span className="w-16 text-right text-xs font-bold tabular-nums text-white">{eur(p.euro)}</span>
                                            <span className="w-14 text-right text-[10px] tabular-nums text-slate-500">
                                                {fmtN((p.euro / (g.euro || 1)) * 100, 0)}%
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                            <p className="mt-2 text-[10px] text-slate-500">Clicca un canale per filtrarci sopra tutta la schermata.</p>
                        </div>
                    );
                })()}
            </div>

            {/* ══ DOVE VANNO I SOLDI + ANDAMENTO ═══════════════════════════ */}
            <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-4">
                <div className="glass-card an-card rounded-2xl p-4 flex flex-col items-center">
                    <h3 className="text-sm font-bold text-white mb-3 self-start">Dove vanno i soldi</h3>
                    <Donut size={168} unit="€"
                        slices={d.perSezione.map((s) => ({
                            label: NOMI[s.sezione] || s.sezione, emoji: EMOJI[s.sezione] || "•",
                            val: s.euro, colore: COLORI[s.sezione] || "#818cf8",
                            det: [{ l: "chiamate", r: fmtN(s.chiamate) }, { l: "spesa", r: eur(s.euro) }],
                        }))}
                        centro={<>
                            <span className="text-lg font-black text-white tabular-nums">{eur(m.speso)}</span>
                            <span className="text-[10px] text-slate-500">nel periodo</span>
                        </>} />
                    <div className="mt-3 w-full space-y-1">
                        {d.perSezione.map((s) => (
                            <div key={s.sezione} className="flex items-center gap-2 text-[11px]">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORI[s.sezione] || "#818cf8" }} />
                                <span className="flex-1 text-slate-300 truncate">
                                    {NOMI[s.sezione] || s.sezione}
                                    {s.dedotte > 0 && (
                                        <span title={`${s.dedotte} righe su ${s.righe} non erano firmate dal motore: l'attribuzione è dedotta dall'ORARIO in cui sono state scritte — i due motori automatici girano a minuti diversi. Dal 31/08 si firmano da soli.`}
                                            className="ml-1 text-[9px] text-amber-300/80 cursor-help">◔ dedotte</span>
                                    )}
                                </span>
                                <span className="tabular-nums text-slate-400">{fmtN(s.chiamate)}×</span>
                                <span className="tabular-nums font-bold text-white">{eur(s.euro)}</span>
                            </div>
                        ))}
                    </div>
                    {d.perSezione.some((s) => s.dedotte > 0) && (
                        <p className="mt-2 text-[10px] text-slate-500 leading-relaxed">
                            ◔ Le righe scritte prima del 31/08 non dicevano da quale motore venivano: l&apos;attribuzione
                            è ricostruita dall&apos;orario, perché i due motori automatici girano a minuti diversi.
                            Da oggi si firmano da soli.
                        </p>
                    )}
                </div>

                <div className="glass-card an-card rounded-2xl p-4">
                    <h3 className="text-sm font-bold text-white mb-1">Come sta andando</h3>
                    <p className="text-[11px] text-slate-500 mb-2">La linea è il costo del giorno; passandoci sopra dice la cifra esatta e quante richieste sono arrivate da persone.</p>
                    <AreaChart h={200} unit="€" colore="#818cf8"
                        serie={d.giorni.map((g) => ({
                            x: gg(g.giorno),
                            y: g.euro,
                            det: [
                                { l: "spesa", r: eur(g.euro), colore: "#818cf8" },
                                { l: "richieste di persone", r: fmtN(g.richieste) },
                                { l: "chiamate totali", r: fmtN(g.chiamate) },
                            ],
                        }))}
                        oggi={d.giorni.findIndex((g) => g.giorno === oggiISO())} />
                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                        <span>Giorno più caro: <b className="text-slate-300">{eur(maxGiorno)}</b></span>
                        <span className="flex items-center gap-1">rispetto al periodo prima <Delta v={m.delta} euro /></span>
                    </div>
                </div>
            </div>

            {/* ══ CHI LA USA ═══════════════════════════════════════════════ */}
            <div className="glass-card an-card rounded-2xl p-4">
                <h3 className="text-sm font-bold text-white mb-1">Chi ci lavora davvero</h3>
                <p className="text-[11px] text-slate-500 mb-3">
                    In ordine di GIORNI attivi, non di domande: chi ne fa sessanta in un giorno ha fatto una prova,
                    chi ne fa tre al giorno per venti giorni l&apos;ha adottata. Clicca un nome per vedere solo lui.
                </p>
                <div onClick={(e) => {
                    const el = (e.target as HTMLElement).closest("[data-p]");
                    if (el) setPersona(String(el.getAttribute("data-p")));
                }}>
                    <RaceBars unit="gg" vuoto="Nessuno ha usato l'assistente in questo periodo."
                        righe={attivi.slice(0, 15).map((p) => ({
                            k: p.id, label: p.nome, sub: p.negozio || p.ruolo, val: p.giorniAttivi,
                            colore: "#818cf8", me: p.id === persona,
                            det: [
                                { l: "giorni attivi", r: String(p.giorniAttivi), colore: "#818cf8" },
                                { l: "domande", r: fmtN(p.domande) },
                                { l: "spesa", r: eur(p.euro) },
                                { l: "ultima volta", r: p.ultima ? gg(p.ultima.slice(0, 10)) : "—" },
                            ],
                        }))} />
                </div>
                {/* i nomi cliccabili: la RaceBars non li conosce, glieli si mette sopra */}
                <div className="sr-only">{attivi.map((p) => <span key={p.id} data-p={p.id}>{p.nome}</span>)}</div>
            </div>

            {/* ══ CHI NON LA USA + SPRECHI ═════════════════════════════════ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="glass-card an-card rounded-2xl p-4">
                    <h3 className="text-sm font-bold text-white mb-1">Ce l&apos;hanno e non la usano</h3>
                    <p className="text-[11px] text-slate-500 mb-3">
                        ⭐ La lista che vale di più, ed è una lista di nomi da chiamare — non un grafico.
                        Solo fra chi l&apos;assistente ce l&apos;ha: gli altri non sono un problema di adozione.
                    </p>
                    {fermi.length === 0 ? <p className="text-xs text-emerald-300 py-3">Nessuno: la usano tutti. 🎉</p> : (
                        <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                            {fermi.map((p) => (
                                <div key={p.id} className="flex items-center gap-2 text-xs rounded-lg px-2 py-1.5 bg-white/[0.03]">
                                    <span className="flex-1 text-slate-200 truncate">{p.nome}</span>
                                    <span className="text-[10px] text-slate-500">{p.ruolo}</span>
                                    <span className="text-[10px] text-slate-600 truncate max-w-[7rem]">{p.negozio || ""}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="glass-card an-card rounded-2xl p-4">
                    <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-300" /> Pagato e non consegnato
                    </h3>
                    <p className="text-[11px] text-slate-500 mb-3">
                        L&apos;unico riquadro dove il colpevole siamo noi: qui non c&apos;è niente da chiedere agli utenti,
                        c&apos;è da sistemare il codice.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                        {[
                            { t: "Risposte troncate", v: d.sprechi.troncate, n: "pagate, e all'utente è arrivata una scusa" },
                            { t: "Errori", v: d.sprechi.errori, n: "chiamate fallite" },
                            { t: "Senza credito", v: d.sprechi.senzaCredito, n: "il fornitore ci ha fermati" },
                            { t: "Passaggi medi", v: d.sprechi.passaggiMedi != null ? Math.round(d.sprechi.passaggiMedi * 10) / 10 : "—", n: "se salgono, l'assistente gira a vuoto fra un dato e l'altro" },
                        ].map((x) => (
                            <Tip key={x.t} block tip={<div><TipTitolo>{x.t}</TipTitolo><p className="text-[11px] text-slate-400 max-w-[14rem]">{x.n}</p></div>}>
                                <div className="rounded-xl bg-white/[0.03] border border-white/5 p-3">
                                    <div className="text-[10px] uppercase tracking-wider text-slate-500">{x.t}</div>
                                    <div className={cn("text-2xl font-black tabular-nums", Number(x.v) > 0 ? "text-amber-300" : "text-slate-500")}>{x.v}</div>
                                </div>
                            </Tip>
                        ))}
                    </div>
                    {d.sprechi.attesaMedia != null && (
                        <p className="mt-3 text-[11px] text-slate-500">
                            Attesa media di una risposta: <b className="text-slate-300">{fmtN(d.sprechi.attesaMedia / 1000, 1)} s</b>
                        </p>
                    )}
                </div>
            </div>

            {/* ══ SU COSA SI SPENDE ════════════════════════════════════════ */}
            {d.perUtenza.length > 0 && (
                <div className="glass-card an-card rounded-2xl p-4">
                    <h3 className="text-sm font-bold text-white mb-1">Su cosa si spende</h3>
                    <p className="text-[11px] text-slate-500 mb-3">Le utenze: una casella, un numero, una persona.</p>
                    <RaceBars unit="€" vuoto="Nessuna utenza con spesa nel periodo."
                        righe={d.perUtenza.slice(0, 12).map((u) => ({
                            k: u.tipo + u.id, label: u.label,
                            sub: u.tipo === "casella_email" ? "casella" : u.tipo === "numero_wa" ? "numero" : "persona",
                            val: u.euro, colore: u.tipo === "casella_email" ? "#38bdf8" : u.tipo === "numero_wa" ? "#25D366" : "#818cf8",
                            det: [{ l: "spesa", r: eur(u.euro) }, { l: "chiamate", r: fmtN(u.chiamate) }],
                        }))} />
                </div>
            )}

            <p className="text-[11px] text-slate-600 leading-relaxed px-1">
                Qui si contano i gesti: quante domande, quando, quanto costano. Mai il testo di una domanda,
                mai il titolo di una conversazione, mai l&apos;argomento — l&apos;assistente vale quello che vale
                perché i ragazzi ci mettono dentro le cose vere, e le mettono solo finché sanno che nessuno le legge.
            </p>
        </div>
    );
}
