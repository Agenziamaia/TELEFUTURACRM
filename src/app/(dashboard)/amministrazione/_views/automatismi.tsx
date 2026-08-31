"use client";

/* ═══ HUB AUTOMATISMI ══════════════════════════════════════════════════════
   Luca 31/08: «creami una sezione dedicata agli automatismi… nel futuro ne
   costruiremo tanti, quindi crealo già come Hub. Da qui voglio vedere in ogni
   sezione i relativi automatismi e funzionamenti, e voglio poter modificare
   tempistiche, destinatari e tutto ciò che è possibile modificare, nonché
   verificare che effettivamente funzionano. L'hub in sé deve avere una Main
   Page che raccoglie tutte le varie sezioni, un po' come abbiamo fatto in AI».

   Come è fatto, e perché così:
   • la MAIN PAGE non elenca: conta. Quanti lavori girano, quanti sono andati
     bene negli ultimi sette giorni, quanti sono fermi, e qual è il prossimo.
     È la domanda vera — «sta funzionando tutto?» — non «cosa c'è».
   • ogni AREA ha la sua scheda, e dentro la scheda ogni automatismo dice cosa
     fa in italiano, quando gira (in italiano, e con l'ora di Roma accanto a
     quella UTC del database), com'è andata l'ultima corsa e cosa gli si può
     cambiare.
   • VERIFICARE non vuol dire fidarsi del verde: c'è un bottone che lo fa
     partire davvero. Dove si può, la prova non manda niente a nessuno — e
     quando invece qualcosa lo fa sul serio, il bottone lo dice prima.

   ⚠️ LE COSE ROSSE STANNO IN CIMA. Un lavoro spento o fallito è la sola
   ragione per cui uno apre questa pagina: se sta in fondo all'elenco, tanto
   valeva non scriverla. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Play, Check, X, Power, Clock, Cog } from "lucide-react";
import { cn } from "@/utils";
/* ⚠️ `_charts` è JS con i default nei parametri: TypeScript ne deduce tipi
   strettissimi e sbagliati. Si prendono come sono — è la stessa nota che sta
   in cima alla sezione AI, e il motivo per cui docs/STANDARD_DESIGN.md dice
   di importarli così. */
import * as G from "../../analisi/_charts";
const Ring = G.Ring as unknown as (p: Record<string, unknown>) => React.ReactElement;
const BarStack = G.BarStack as unknown as (p: Record<string, unknown>) => React.ReactElement;
const Tip = G.Tip as unknown as (p: Record<string, unknown>) => React.ReactElement;
const TipRiga = G.TipRiga as unknown as (p: Record<string, unknown>) => React.ReactElement;
const TipTitolo = G.TipTitolo as unknown as (p: Record<string, unknown>) => React.ReactElement;
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import {
    AUTOMATISMI, AREE, leggiPianificazione, oraItaliana, scorciatoieOrario,
    type Automatismo, type AreaAuto,
} from "@/lib/automatismi";

/* ⚠️ `corse` e `ko` sono l'esito VERO della chiamata HTTP, non quello della
   riga SQL. La riga SQL è `select net.http_post(...)`: mette la chiamata in
   coda e riesce sempre — su 1.898 corse registrate, 1.898 «succeeded», mentre
   una chiamata su quattro non arrivava. `sql_*` resta accanto per distinguere
   «non è nemmeno partito» da «è partito e non è arrivato». */
type StatoCron = {
    jobname: string; schedule: string; active: boolean; rotta: string | null;
    ultima_il: string | null; ultima_esito: string | null; ultimo_errore: string | null;
    corse_7g: number; ko_7g: number; aperte: number;
    sql_corse_7g: number; sql_ko_7g: number;
};
type Giorno = { giorno: string; jobname: string; ok: number; ko: number };

/* ⚠️ UN COLORE PER AUTOMATISMO, non uno solo per «è andata bene». Con un
   verde unico le quattordici colonne diventano un muro identico e non
   dicono niente: gli automatismi girano a orario fisso, quindi il totale è
   per forza piatto. Quello che cambia — e che si vuole vedere — è CHI ha
   lavorato quel giorno, e se un pezzo è sparito. */
const TINTE = ["#818cf8", "#34d399", "#38bdf8", "#fbbf24", "#a78bfa", "#f472b6"];
const LAVORO_A_AUTO = new Map<string, { nome: string; emoji: string; colore: string }>();
AUTOMATISMI.forEach((a, i) => a.lavori.forEach((l) =>
    LAVORO_A_AUTO.set(l.nome, { nome: a.nome, emoji: a.emoji, colore: TINTE[i % TINTE.length] })));
type Evento = { quando: string; chi: string; azione: string; bersaglio: string; dettaglio: string | null };
type Config = { id: string; parametri: Record<string, unknown>; aggiornato_il: string; aggiornato_da: string | null };

const quando = (iso: string | null) => {
    if (!iso) return "mai";
    const d = new Date(iso);
    const min = Math.round((Date.now() - d.getTime()) / 60000);
    if (min < 1) return "adesso";
    if (min < 60) return `${min} min fa`;
    if (min < 60 * 24) return `${Math.round(min / 60)} h fa`;
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

export function AutomatismiView() {
    const { user } = useAuth();
    const [cron, setCron] = useState<StatoCron[] | null>(null);
    const [conf, setConf] = useState<Record<string, Config>>({});
    const [errore, setErrore] = useState<string | null>(null);
    const [area, setArea] = useState<AreaAuto | "tutte">("tutte");
    const [ricarico, setRicarico] = useState(false);

    const [giorni, setGiorni] = useState<Giorno[]>([]);
    const [storia, setStoria] = useState<Evento[]>([]);
    const carica = useCallback(async () => {
        setRicarico(true); setErrore(null);
        const [c, k, g, e] = await Promise.all([
            supabase.rpc("automatismi_cron"),
            supabase.from("automatismi_config").select("id, parametri, aggiornato_il, aggiornato_da"),
            supabase.rpc("automatismi_giorni", { giorni: 14 }),
            supabase.rpc("automatismi_storia", { quanti: 12 }),
        ]);
        /* UN ERRORE VA DETTO, e anche il silenzio sospetto: se la lettura non
           torna nemmeno un lavoro non è che sono tutti rotti — è che questa
           sessione non ha il diritto di leggerli, e dipingere di rosso quattro
           automatismi sani sarebbe la bugia opposta a quella di prima. */
        const righe = (c.data as StatoCron[]) || [];
        if (c.error) setErrore(c.error.message);
        else if (!righe.length) setErrore("Non ricevo nessun lavoro: o la sessione non ha i permessi per leggerli, o il database non risponde. I riquadri qui sotto NON vogliono dire che gli automatismi sono fermi.");
        else if (k.error) setErrore("Lo stato dei lavori l'ho letto, i parametri no (" + k.error.message + "): quelli mostrati sono i valori di fabbrica, non per forza quelli attivi.");
        setCron(righe);
        const m: Record<string, Config> = {};
        ((k.data ?? []) as Config[]).forEach((r) => { m[r.id] = r; });
        setConf(m);
        setGiorni((g.data as Giorno[]) || []);
        setStoria((e.data as Evento[]) || []);
        setRicarico(false);
    }, []);
    useEffect(() => { carica(); }, [carica]);

    const perNome = useMemo(() => {
        const m = new Map<string, StatoCron>();
        (cron ?? []).forEach((j) => m.set(j.jobname, j));
        return m;
    }, [cron]);

    /* LA SALUTE DI UN AUTOMATISMO, in una parola sola. «Fermo» batte tutto:
       un lavoro spento non fallisce mai, e sembrerebbe sanissimo. */
    const salute = useCallback((a: Automatismo): { stato: "fermo" | "guasto" | "muto" | "ok" | "ignoto"; perche: string } => {
        const trovati = a.lavori.map((l) => ({ l, j: perNome.get(l.nome) }));
        // BASTA UNO CHE MANCA: se sparisce la rete di sicurezza e resta la
        // corsa vera, la scheda non deve restare verde
        const mancanti = trovati.filter((x) => !x.j).map((x) => x.l.nome);
        if (mancanti.length) return { stato: "ignoto", perche: `non trovo nel database: ${mancanti.join(", ")}` };
        const lavori = trovati.map((x) => x.j!) as StatoCron[];
        if (lavori.some((j) => !j.active)) return { stato: "fermo", perche: "spento: non parte più" };
        const ko = lavori.reduce((t, j) => t + Number(j.ko_7g || 0), 0);
        const corse = lavori.reduce((t, j) => t + Number(j.corse_7g || 0), 0);
        if (ko > 0) return { stato: "guasto", perche: `${ko} chiamate su ${corse} non sono arrivate, in sette giorni` };
        const sqlKo = lavori.reduce((t, j) => t + Number(j.sql_ko_7g || 0), 0);
        if (sqlKo > 0) return { stato: "guasto", perche: `${sqlKo} corse non sono nemmeno partite, in sette giorni` };
        if (!corse) return { stato: "muto", perche: lavori.some((j) => Number(j.aperte || 0) > 0) ? "chiamate partite e nessuna risposta ancora raccolta" : "non è partito negli ultimi sette giorni" };
        return { stato: "ok", perche: `${corse} chiamate, tutte arrivate` };
    }, [perNome]);

    const COLORE = {
        ok: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
        muto: "text-slate-300 bg-white/5 border-white/15",
        guasto: "text-rose-200 bg-rose-500/12 border-rose-500/35",
        fermo: "text-amber-200 bg-amber-500/12 border-amber-400/35",
        ignoto: "text-violet-200 bg-violet-500/12 border-violet-500/35",
    } as const;
    const PAROLA = { ok: "in salute", muto: "silenzioso", guasto: "guasto", fermo: "fermo", ignoto: "non trovato" } as const;

    // ── la main page: i numeri, non l'elenco ──────────────────────────────
    const numeri = useMemo(() => {
        const tutti = AUTOMATISMI.map((a) => ({ a, s: salute(a) }));
        const malato = (st: string) => st === "guasto" || st === "fermo" || st === "ignoto";
        const lavori = (cron ?? []);
        const nomiCensiti = new Set(AUTOMATISMI.flatMap((a) => a.lavori.map((l) => l.nome)));
        const censiti = lavori.filter((j) => nomiCensiti.has(j.jobname));
        return {
            automatismi: AUTOMATISMI.length,
            aree: new Set(AUTOMATISMI.map((a) => a.area)).size,
            lavori: censiti.length,
            // ⚠️ gli stessi insiemi: prima le corse contavano TUTTI i lavori del
            // database e i problemi solo quelli del registro, e si arrivava a
            // «3 fallite» accanto a «0 da sistemare»
            corse7: censiti.reduce((t, j) => t + Number(j.corse_7g || 0), 0),
            ko7: censiti.reduce((t, j) => t + Number(j.ko_7g || 0) + Number(j.sql_ko_7g || 0), 0),
            problemi: tutti.filter((x) => malato(x.s.stato)),
            perArea: AREE.map((ar) => ({
                ...ar,
                quanti: AUTOMATISMI.filter((a) => a.area === ar.id).length,
                rotti: tutti.filter((x) => x.a.area === ar.id && malato(x.s.stato)).length,
            })),
            ultimaCorsa: censiti.reduce<string | null>((t, j) => (j.ultima_il && (!t || j.ultima_il > t) ? j.ultima_il : t), null),
        };
    }, [cron, salute]);

    const visibili = area === "tutte" ? AUTOMATISMI : AUTOMATISMI.filter((a) => a.area === area);

    return (
        <div className="space-y-5">
            {/* ══ LA MAIN PAGE, nella lingua della casa (Luca 01/09) ═══════
                La prima versione elencava cinque riquadri piatti e un grafico
                disegnato a mano. Qui gli strumenti sono quelli di Analisi e
                della sezione AI — anello, barre, tooltip — perché chi conosce
                quelle schermate non deve imparare niente di nuovo, e perché
                sotto quel livello non si consegna più (docs/STANDARD_DESIGN.md).

                La domanda a cui risponde la pagina è una sola: «sta girando
                tutto?». Per questo al centro c'è la SALUTE, non un elenco. */}
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0d1022]/80 p-5 sm:p-6 an-scuro">
                <div className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full opacity-25 blur-3xl"
                    style={{ background: "radial-gradient(circle, #818cf8, transparent 65%)", animation: "anAurora 16s ease-in-out infinite" }} />
                <div className="pointer-events-none absolute -bottom-32 -right-16 w-[28rem] h-[28rem] rounded-full opacity-20 blur-3xl"
                    style={{ background: "radial-gradient(circle, #34d399, transparent 65%)", animation: "anAurora 22s ease-in-out infinite reverse" }} />

                <div className="relative flex flex-wrap items-center gap-3 justify-between">
                    <div>
                        <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                            <Cog className="w-6 h-6 text-indigo-300" /> Automatismi
                        </h1>
                        <p className="text-[11px] text-slate-500 mt-0.5">Tutto quello che il CRM fa da solo, in un posto solo.</p>
                    </div>
                    <button onClick={carica} disabled={ricarico}
                        className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10">
                        {ricarico ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    </button>
                </div>

                {errore && (
                    <p className="relative mt-3 text-[11px] text-rose-200 bg-rose-500/10 border border-rose-500/25 rounded-lg px-3 py-2">
                        {errore}
                    </p>
                )}

                {/* ── LE CATEGORIE, che è la cosa che Luca ha chiesto: ogni
                       automatismo ha la sua, e da qui si filtra. Le aree senza
                       nemmeno un automatismo NON compaiono: un pulsante che
                       apre il vuoto è peggio di un pulsante che manca. ────── */}
                <div className="relative mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-500">Categoria:</span>
                    <button onClick={() => setArea("tutte")}
                        className={cn("px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all",
                            area === "tutte" ? "border-indigo-400/60 bg-indigo-500/25 text-white" : "border-white/10 bg-white/5 text-slate-400 hover:text-white")}>
                        Tutte · {numeri.automatismi}
                    </button>
                    {numeri.perArea.filter((ar) => ar.quanti > 0).map((ar) => (
                        <button key={ar.id} onClick={() => setArea(ar.id)} title={ar.cosa}
                            className={cn("px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all",
                                area === ar.id ? "border-indigo-400/60 bg-indigo-500/25 text-white" : "border-white/10 bg-white/5 text-slate-400 hover:text-white")}>
                            {ar.emoji} {ar.nome} · {ar.quanti}
                            {ar.rotti > 0 && <span className="ml-1.5 text-rose-300">● {ar.rotti}</span>}
                        </button>
                    ))}
                </div>
                {area !== "tutte" && (
                    <p className="relative mt-1.5 text-[11px] text-slate-500">{AREE.find((x) => x.id === area)?.cosa}</p>
                )}

                {/* ── il cuore: quanto è in salute, e come sono andati i giorni ── */}
                <div className="relative mt-5 grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
                    <div className="flex flex-col items-center lg:items-start gap-4">
                        {(() => {
                            const sani = numeri.automatismi - numeri.problemi.length;
                            const col = numeri.problemi.length ? "#fb7185" : "#34d399";
                            return (
                                <Ring value={sani} max={Math.max(1, numeri.automatismi)} colore={col} size={176}
                                    centro={<>
                                        <span className="text-[32px] font-black text-white tabular-nums leading-none">{sani}<span className="text-slate-500 text-lg">/{numeri.automatismi}</span></span>
                                        <span className="text-[11px] mt-1.5" style={{ color: col }}>
                                            {numeri.problemi.length ? `${numeri.problemi.length} da sistemare` : "girano tutti"}
                                        </span>
                                    </>}
                                    sotto={null}
                                    tip={<div>
                                        <TipTitolo>La salute degli automatismi</TipTitolo>
                                        <TipRiga l="in salute" r={String(sani)} colore="#34d399" />
                                        <TipRiga l="da sistemare" r={String(numeri.problemi.length)} colore="#fb7185" />
                                        <TipRiga l="lavori pianificati" r={String(numeri.lavori)} />
                                    </div>} />
                            );
                        })()}
                        <div className="w-full space-y-1.5">
                            {numeri.perArea.filter((ar) => ar.quanti > 0).map((ar) => (
                                <button key={ar.id} onClick={() => setArea(ar.id)}
                                    className="w-full flex items-center gap-2 rounded-lg bg-white/[0.03] border border-white/5 px-2.5 py-1.5 text-left hover:bg-white/[0.06] transition-colors">
                                    <span className="text-sm">{ar.emoji}</span>
                                    <span className="flex-1 text-[11px] text-slate-300 truncate">{ar.nome}</span>
                                    {ar.rotti > 0 && <span className="text-[10px] font-bold text-rose-300">{ar.rotti} ●</span>}
                                    <span className="text-xs font-black tabular-nums text-white">{ar.quanti}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="min-w-0 flex flex-col">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
                            {[
                                { t: "Lavori pianificati", v: String(numeri.lavori), c: "#818cf8", n: "Quante voci ci sono nel calendario del database: un automatismo può averne più d'una — per esempio una corsa vera e un secondo tentativo di riserva." },
                                { t: "Chiamate in 7 giorni", v: String(numeri.corse7), c: "#38bdf8", n: numeri.ultimaCorsa ? `L'ultima è partita ${quando(numeri.ultimaCorsa)}.` : "Nessuna corsa negli ultimi sette giorni." },
                                { t: "Non arrivate", v: String(numeri.ko7), c: numeri.ko7 ? "#fb7185" : "#64748b", n: "Chiamate partite e mai arrivate a destinazione, o rifiutate. ⚠️ È l'esito VERO della chiamata, non quello della riga SQL: quella riesce sempre, anche quando la chiamata si perde." },
                                { t: "Da sistemare", v: String(numeri.problemi.length), c: numeri.problemi.length ? "#fbbf24" : "#34d399", n: "Automatismi spenti, guasti o che non trovo più nel database. «Spento» conta come problema: un lavoro fermo non fallisce mai, e sembrerebbe sanissimo." },
                            ].map((x) => (
                                <Tip key={x.t} block tip={<div><TipTitolo>{x.t}</TipTitolo><p className="text-[11px] text-slate-400 max-w-[16rem] leading-relaxed">{x.n}</p></div>}>
                                    <div className="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2 h-full">
                                        <div className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-slate-500 truncate">{x.t}</div>
                                        <div className="mt-0.5 text-lg font-black tabular-nums" style={{ color: x.c }}>{x.v}</div>
                                    </div>
                                </Tip>
                            ))}
                        </div>

                        {/* L'ANDAMENTO. Un totale non dice se sta peggiorando:
                            questa serie sì — verde quello che è arrivato, rosso
                            quello che no. Adesso è il grafico della casa: si
                            passa sopra e dice il giorno, non è più una fila di
                            rettangoli muti. */}
                        <div className="flex items-baseline justify-between mb-1">
                            <h3 className="text-sm font-bold text-white">Gli ultimi quattordici giorni</h3>
                            <span className="text-[11px] text-slate-500">passa sopra una barra per il dettaglio del giorno</span>
                        </div>
                        {/* la legenda: senza, quattro colori sono quattro colori */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
                            {AUTOMATISMI.filter((a) => a.lavori.some((l) => giorni.some((g) => g.jobname === l.nome))).map((a, i) => (
                                <span key={a.id} className="flex items-center gap-1.5 text-[11px] text-slate-400">
                                    <i className="w-2.5 h-2.5 rounded-sm" style={{ background: LAVORO_A_AUTO.get(a.lavori[0].nome)?.colore || TINTE[i % TINTE.length] }} />
                                    {a.nome}
                                </span>
                            ))}
                            <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
                                <i className="w-2.5 h-2.5 rounded-sm" style={{ background: "#fb7185" }} /> non arrivate
                            </span>
                        </div>
                        <div className="flex-1 min-h-[180px]">
                            {giorni.length > 0 ? (
                                <BarStack h={190} unit="chiamate"
                                    giorni={(() => {
                                        /* una barra per giorno, divisa per automatismo. Le corse
                                           perse hanno la loro fetta rossa: piccola quanto è vera,
                                           senza gonfiarla per farla vedere — a leggerle ci pensa
                                           la riga qui sotto, che le nomina per data. */
                                        const perGiorno = new Map<string, Map<string, { ok: number; ko: number }>>();
                                        for (const g of giorni) {
                                            const d = perGiorno.get(g.giorno) || new Map();
                                            const c = d.get(g.jobname) || { ok: 0, ko: 0 };
                                            c.ok += Number(g.ok || 0); c.ko += Number(g.ko || 0);
                                            d.set(g.jobname, c); perGiorno.set(g.giorno, d);
                                        }
                                        return [...perGiorno.entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([gg, d]) => {
                                            const parti = [...d.entries()]
                                                .filter(([, v]) => v.ok > 0)
                                                .map(([job, v]) => {
                                                    const a = LAVORO_A_AUTO.get(job);
                                                    return { label: a ? a.emoji + " " + a.nome : job, val: v.ok, colore: a?.colore || "#64748b", sub: String(v.ok) };
                                                })
                                                .sort((x, y) => y.val - x.val);
                                            const ko = [...d.values()].reduce((t, v) => t + v.ko, 0);
                                            if (ko) parti.push({ label: "non arrivate", val: ko, colore: "#fb7185", sub: String(ko) });
                                            return {
                                                n: Number(gg.slice(8, 10)),
                                                label: gg.slice(8, 10) + "/" + gg.slice(5, 7),
                                                tot: parti.reduce((t, x) => t + x.val, 0),
                                                parti,
                                            };
                                        });
                                    })()}
                                    oggi={-1} media={null} />
                            ) : (
                                <p className="text-xs text-slate-500 py-8 text-center">Ancora nessuna corsa registrata.</p>
                            )}
                        </div>
                        {/* le giornate storte, dette per nome: in una barra da
                            quattrocento corse nove perse sono due pixel, e due
                            pixel non sono una risposta. */}
                        {(() => {
                            const storti = [...giorni.reduce((m, g) => {
                                if (g.ko) m.set(g.giorno, (m.get(g.giorno) || 0) + Number(g.ko));
                                return m;
                            }, new Map<string, number>()).entries()].sort((x, y) => x[0].localeCompare(y[0]));
                            if (!storti.length) return (
                                <p className="text-[11px] text-emerald-300/80 mt-2">Nessuna corsa persa in quattordici giorni.</p>
                            );
                            return (
                                <p className="text-[11px] text-slate-400 mt-2">
                                    <span className="text-rose-300 font-bold">Giornate con corse perse:</span>{" "}
                                    {storti.map(([gg, n], i) => (
                                        <span key={gg}>{i > 0 && ", "}
                                            <span className="text-slate-200 font-semibold tabular-nums">{gg.slice(8, 10)}/{gg.slice(5, 7)}</span>
                                            <span className="text-slate-500"> ({n})</span>
                                        </span>
                                    ))}
                                </p>
                            );
                        })()}
                    </div>
                </div>

                {/* le cose rotte, sotto il cuore e prima di tutto il resto */}

                {storia.length > 0 && (
                    <details className="pt-1">
                        <summary className="text-[10px] font-bold uppercase tracking-widest text-slate-500 cursor-pointer hover:text-slate-300">Chi ha toccato cosa</summary>
                        <div className="mt-2 space-y-1">
                            {storia.map((e, i) => (
                                <div key={i} className="flex flex-wrap items-baseline gap-2 text-[11px]">
                                    <span className="text-slate-500 tabular-nums w-[92px] shrink-0">{new Date(e.quando).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                                    <span className="text-slate-200 font-bold">{e.chi}</span>
                                    <span className={cn(e.azione === "spento" ? "text-amber-300" : e.azione === "acceso" ? "text-emerald-300" : "text-slate-400")}>{e.azione}</span>
                                    <span className="text-slate-400">{e.bersaglio}</span>
                                    {e.dettaglio && <span className="text-slate-600">— {e.dettaglio}</span>}
                                </div>
                            ))}
                        </div>
                    </details>
                )}
            </div>

            {/* ── le schede ── */}
            {visibili.map((a) => (
                <SchedaAutomatismo key={a.id} a={a} perNome={perNome} conf={conf[a.id]}
                    salute={salute(a)} colore={COLORE} parola={PAROLA}
                    chiSono={user?.name || null} ricarica={carica} />
            ))}
            {!visibili.length && (
                <div className="glass-card p-6 text-center text-sm text-slate-500">
                    In quest&apos;area non c&apos;è ancora nessun automatismo. Quando ne nascerà uno comparirà qui, con il suo orario e i suoi parametri.
                </div>
            )}
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────────── */

/** Quattordici giorni di chiamate: quante sono arrivate e quante no. */
function Andamento({ giorni }: { giorni: Giorno[] }) {
    const perGiorno = useMemo(() => {
        const m = new Map<string, { ok: number; ko: number }>();
        for (const g of giorni) {
            const c = m.get(g.giorno) || { ok: 0, ko: 0 };
            c.ok += Number(g.ok || 0); c.ko += Number(g.ko || 0);
            m.set(g.giorno, c);
        }
        return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    }, [giorni]);
    const tetto = Math.max(1, ...perGiorno.map(([, v]) => v.ok + v.ko));
    const totKo = perGiorno.reduce((t, [, v]) => t + v.ko, 0);
    return (
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="flex flex-wrap items-baseline gap-2 mb-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Ultimi 14 giorni</p>
                <span className="text-[10px] text-slate-500">
                    {totKo ? <><b className="text-rose-300">{totKo}</b> chiamate non arrivate</> : "tutte le chiamate sono arrivate"}
                </span>
            </div>
            <div className="flex items-end gap-1 h-16">
                {perGiorno.map(([g, v]) => {
                    const tot = v.ok + v.ko;
                    return (
                        <div key={g} className="flex-1 min-w-[6px] flex flex-col justify-end gap-[1px]"
                            title={`${g}: ${v.ok} arrivate${v.ko ? `, ${v.ko} no` : ""}`}>
                            {v.ko > 0 && <div className="w-full rounded-t bg-rose-400/80" style={{ height: `${Math.max(3, (v.ko / tetto) * 100)}%` }} />}
                            <div className="w-full rounded-sm bg-emerald-400/50" style={{ height: `${Math.max(2, (v.ok / tetto) * 100)}%` }} />
                            <div className="text-[8px] text-slate-600 text-center tabular-nums">{g.slice(8, 10)}</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function SchedaAutomatismo({ a, perNome, conf, salute, colore, parola, chiSono, ricarica }: {
    a: Automatismo;
    perNome: Map<string, StatoCron>;
    conf?: Config;
    salute: { stato: keyof typeof colore; perche: string };
    colore: Record<string, string>;
    parola: Record<string, string>;
    chiSono: string | null;
    ricarica: () => void;
}) {
    const [bozza, setBozza] = useState<Record<string, string>>({});
    const [salvo, setSalvo] = useState(false);
    const [esito, setEsito] = useState<string | null>(null);
    const [provo, setProvo] = useState(false);
    const [orari, setOrari] = useState<Record<string, string>>({});
    const [apriOrario, setApriOrario] = useState<Record<string, boolean>>({});
    const [tocco, setTocco] = useState<string | null>(null);

    const valore = (chiave: string): string => {
        if (bozza[chiave] !== undefined) return bozza[chiave];
        const p = a.parametri.find((x) => x.chiave === chiave)!;
        const salvato = (conf?.parametri as Record<string, unknown> | undefined)?.[chiave];
        const v = salvato !== undefined && salvato !== null ? salvato : p.predefinito;
        return Array.isArray(v) ? v.join("\n") : String(v);
    };
    const cambiato = a.parametri.some((p) => bozza[p.chiave] !== undefined);

    const salva = async () => {
        setSalvo(true); setEsito(null);
        /* SI SALVA SOLO QUELLO CHE HAI TOCCATO. Scrivendo anche gli altri si
           congelavano nel database i valori di fabbrica: da lì in poi
           cambiarli nel codice non avrebbe più avuto effetto, e nessuno se ne
           sarebbe accorto. */
        const parametri: Record<string, unknown> = { ...(conf?.parametri || {}) };
        const guai: string[] = [];
        for (const p of a.parametri) {
            if (bozza[p.chiave] === undefined) continue;
            const v = bozza[p.chiave];
            if (p.tipo === "email") {
                const grezzi = v.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
                const brutti = grezzi.filter((x) => !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(x));
                if (brutti.length) guai.push(`non sono indirizzi: ${brutti.join(", ")}`);
                else if (!grezzi.length) guai.push(`«${p.nome}» è vuoto: se lo salvi così, l'automatismo non manderà niente a nessuno`);
                parametri[p.chiave] = grezzi;
            } else if (p.tipo === "numero") {
                const n = Number(String(v).replace(",", "."));
                if (!Number.isFinite(n)) guai.push(`«${p.nome}»: «${v}» non è un numero`);
                else if (p.min != null && n < p.min) guai.push(`«${p.nome}» non può stare sotto ${p.min}`);
                else if (p.max != null && n > p.max) guai.push(`«${p.nome}» non può superare ${p.max}`);
                else parametri[p.chiave] = Math.round(n);
            } else parametri[p.chiave] = v;
        }
        if (guai.length) { setEsito("⛔ " + guai.join(" · ")); setSalvo(false); return; }
        const { error } = await supabase.from("automatismi_config").upsert({
            id: a.id, parametri, aggiornato_il: new Date().toISOString(), aggiornato_da: chiSono,
        }, { onConflict: "id" });
        setEsito(error ? `⛔ ${error.message}` : "✓ Salvato: da adesso vale questo.");
        if (!error) setBozza({});
        setSalvo(false);
        ricarica();
    };

    const pianifica = async (nome: string) => {
        const q = (orari[nome] || "").trim();
        if (!q) return;
        setTocco(nome); setEsito(null);
        const { error } = await supabase.rpc("automatismi_pianifica", { nome, quando: q });
        setEsito(error ? `⛔ ${error.message}` : `✓ «${nome}» adesso gira: ${leggiPianificazione(q)}`);
        setTocco(null);
        if (!error) { setOrari((p) => { const n = { ...p }; delete n[nome]; return n; }); ricarica(); }
    };

    const interruttore = async (nome: string, acceso: boolean) => {
        /* SPEGNERE È DISTRUTTIVO, e va chiesto. Prima il bottone innocuo (la
           prova, che non manda niente) chiedeva conferma e questo no: un clic
           e il lavoro che porta ferie e malattia al consulente non partiva
           più. E adesso resta scritto DAVVERO chi l'ha spento e perché. */
        let perche: string | null = null;
        if (!acceso) {
            perche = window.prompt(`Stai per SPEGNERE «${nome}»: da adesso non partirà più, finché non lo riaccendi tu.\n\nScrivi perché lo stai spegnendo (resta scritto, con il tuo nome):`, "");
            if (perche === null) return;
        }
        setTocco(nome); setEsito(null);
        const { error } = await supabase.rpc("automatismi_interruttore", { nome, acceso, perche });
        setEsito(error ? `⛔ ${error.message}` : acceso ? `✓ «${nome}» riacceso.` : `⏸ «${nome}» spento: non partirà più finché non lo riaccendi.`);
        setTocco(null);
        if (!error) ricarica();
    };

    const prova = async () => {
        if (!a.prova) return;
        if (!a.prova.sicura && !window.confirm(`${a.prova.spiega}\n\nVado avanti?`)) return;
        setProvo(true); setEsito(null);
        try {
            const r = await fetch(a.rotta, {
                method: "POST", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(a.prova.corpo),
            });
            const j = await r.json().catch(() => ({}));
            // ⚠️ il codice HTTP non basta: le rotte del triage rispondono 200
            // anche quando dicono di no, e una sessione scaduta risponde 200
            // con un errore dentro. Comanda il contenuto.
            const male = !r.ok || j?.error || j?.errore || j?.ok === false;
            setEsito((male ? "⛔ " : "✓ ") + risposta(j, r.status));
        } catch (e) {
            setEsito("⛔ " + (e instanceof Error ? e.message : "la prova non è partita"));
        }
        setProvo(false);
        ricarica();
    };

    return (
        <div className="glass-card p-5 space-y-3">
            <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-black text-white">{a.emoji} {a.nome}</h3>
                        <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold border", colore[salute.stato])}>
                            {parola[salute.stato]}
                        </span>
                        <span className="text-[10px] text-slate-600">{salute.perche}</span>
                    </div>
                    <p className="text-[12px] text-slate-400 leading-relaxed mt-1.5">{a.cosaFa}</p>
                    {a.perche && <p className="text-[11px] text-slate-600 italic mt-1">{a.perche}</p>}
                </div>
                {a.prova && (
                    <button onClick={prova} disabled={provo}
                        title={a.prova.spiega}
                        className={cn("px-3 py-2 rounded-xl text-[11px] font-bold border flex items-center gap-1.5 disabled:opacity-40 whitespace-nowrap",
                            a.prova.sicura
                                ? "border-sky-500/40 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25"
                                : "border-amber-400/40 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25")}>
                        {provo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} {a.prova.etichetta}
                    </button>
                )}
            </div>

            {/* i lavori: quando gira, com'è andata, e i due comandi */}
            <div className="space-y-2">
                {a.lavori.map((l) => {
                    const j = perNome.get(l.nome);
                    const roma = j ? oraItaliana(j.schedule) : null;
                    return (
                        <div key={l.nome} className={cn("rounded-xl border p-3", j?.active === false ? "border-amber-400/35 bg-amber-500/[0.07]" : "border-white/10 bg-black/20")}>
                            <div className="flex flex-wrap items-center gap-2">
                                <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                <span className="text-[12px] font-bold text-slate-100">{j ? leggiPianificazione(j.schedule) : "non trovato nel database"}</span>
                                {roma && <span className="text-[11px] text-emerald-300">= {roma} in Italia</span>}
                                <span className="ml-auto text-[10px] text-slate-500">{l.ruolo}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11px]">
                                <span className="text-slate-400">ultima chiamata: <b className={j?.ultima_esito === "ok" ? "text-emerald-300" : j?.ultima_esito && j.ultima_esito !== "in corso" ? "text-rose-300" : "text-slate-500"}>{quando(j?.ultima_il ?? null)}</b>{j?.ultima_esito && j.ultima_esito !== "ok" ? ` · ${ESITO[j.ultima_esito] || j.ultima_esito}` : ""}</span>
                                <span className="text-slate-500">7 giorni: {Number(j?.corse_7g || 0)} chiamate{Number(j?.ko_7g || 0) > 0 ? <b className="text-rose-300"> · {Number(j?.ko_7g)} non arrivate</b> : null}{Number(j?.sql_ko_7g || 0) > 0 ? <b className="text-rose-300"> · {Number(j?.sql_ko_7g)} nemmeno partite</b> : null}</span>
                                {j?.ultimo_errore && <span className="text-rose-300/80 truncate max-w-[380px]" title={j.ultimo_errore}>«{j.ultimo_errore}»</span>}
                            </div>
                            {j && (
                                <div className="mt-2">
                                    {/* ⚠️ DI DEFAULT NON SI VEDE NESSUN CRON. Questa pagina
                                        la apre Luca, non un sistemista: «0 5 1 * *» è una
                                        sintassi da imparare per fare una cosa che si sa già
                                        dire in italiano. L'orario si cambia con le scelte
                                        sensate per QUEL lavoro; il campo grezzo resta sotto,
                                        per i casi che le scorciatoie non coprono. */}
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button onClick={() => setApriOrario((p) => ({ ...p, [l.nome]: !p[l.nome] }))}
                                            className={cn("px-2.5 py-1.5 rounded-lg text-[10px] font-bold border flex items-center gap-1",
                                                apriOrario[l.nome] ? "border-indigo-400/50 bg-indigo-500/15 text-indigo-100" : "border-white/15 text-slate-400 hover:text-white hover:border-white/30")}>
                                            <Clock className="w-3 h-3" /> Cambia orario
                                        </button>
                                        <button onClick={() => interruttore(l.nome, !j.active)} disabled={tocco === l.nome}
                                            title={j.active ? "Spegnilo: smette di partire, e resta scritto chi è stato e perché" : "Riaccendilo"}
                                            className={cn("px-2.5 py-1.5 rounded-lg text-[10px] font-bold border flex items-center gap-1 disabled:opacity-30",
                                                j.active ? "border-white/15 text-slate-400 hover:text-amber-200 hover:border-amber-400/40" : "border-amber-400/50 bg-amber-500/15 text-amber-100")}>
                                            <Power className="w-3 h-3" /> {j.active ? "Spegni" : "Riaccendi"}
                                        </button>
                                    </div>

                                    {apriOrario[l.nome] && (
                                        <div className="mt-2 rounded-xl border border-indigo-400/20 bg-indigo-500/[0.06] p-3 space-y-2">
                                            {(() => {
                                                const scelte = scorciatoieOrario(j.schedule);
                                                const attuale = (orari[l.nome] ?? j.schedule).trim();
                                                if (!scelte.length) return null;
                                                return (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {scelte.map((sc) => (
                                                            <button key={sc.cron} onClick={() => setOrari((p) => ({ ...p, [l.nome]: sc.cron }))}
                                                                className={cn("px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition",
                                                                    attuale === sc.cron
                                                                        ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-100"
                                                                        : "border-white/12 bg-white/[0.03] text-slate-300 hover:bg-white/10 hover:text-white")}>
                                                                {sc.etichetta}
                                                            </button>
                                                        ))}
                                                    </div>
                                                );
                                            })()}

                                            <div className="flex flex-wrap items-center gap-2">
                                                <label className="text-[10px] text-slate-500">oppure a mano (formato cron, ora UTC):</label>
                                                <input value={orari[l.nome] ?? j.schedule}
                                                    onChange={(e) => setOrari((p) => ({ ...p, [l.nome]: e.target.value }))}
                                                    placeholder="minuto ora giorno mese giorno-settimana"
                                                    title="Esempi: «0 5 1 * *» = il primo del mese alle 5:00 UTC. Ogni dieci minuti si scrive con l'asterisco, barra, dieci."
                                                    className="glass-input !h-8 px-2 text-[11px] font-mono w-[200px]" />
                                            </div>

                                            {(() => {
                                                const q = (orari[l.nome] ?? j.schedule).trim();
                                                const cambiato = q !== j.schedule.trim();
                                                const r = oraItaliana(q);
                                                return (
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className={cn("text-[11px]", cambiato ? "text-slate-200" : "text-slate-500")}>
                                                            {cambiato ? "diventa: " : "adesso: "}
                                                            <b className={cambiato ? "text-indigo-200" : ""}>{leggiPianificazione(q)}</b>
                                                            {r ? <span className="text-emerald-300"> · {r} in Italia</span> : null}
                                                        </span>
                                                        <button onClick={() => pianifica(l.nome)} disabled={tocco === l.nome || !cambiato}
                                                            className="ml-auto px-2.5 py-1.5 rounded-lg text-[10px] font-bold border border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-30 flex items-center gap-1">
                                                            {tocco === l.nome ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Salva l'orario
                                                        </button>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* cosa si può cambiare */}
            {a.parametri.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Cosa si può cambiare</p>
                    {a.parametri.map((p) => (
                        <div key={p.chiave} className="space-y-1">
                            <div className="flex flex-wrap items-baseline gap-2">
                                <span className="text-[12px] font-bold text-slate-200">{p.nome}</span>
                                <span className="text-[10px] text-slate-500">{p.spiega}</span>
                            </div>
                            {p.tipo === "email" ? (
                                <textarea value={valore(p.chiave)} rows={Math.max(2, valore(p.chiave).split("\n").length)}
                                    onChange={(e) => setBozza((b) => ({ ...b, [p.chiave]: e.target.value }))}
                                    className="glass-input w-full text-[12px] px-2 py-1.5 font-mono" />
                            ) : p.tipo === "numero" ? (
                                <input type="number" min={p.min} max={p.max} value={valore(p.chiave)}
                                    onChange={(e) => setBozza((b) => ({ ...b, [p.chiave]: e.target.value }))}
                                    className="glass-input !h-8 px-2 text-[12px] w-[120px]" />
                            ) : (
                                <input value={valore(p.chiave)}
                                    onChange={(e) => setBozza((b) => ({ ...b, [p.chiave]: e.target.value }))}
                                    className="glass-input !h-8 px-2 text-[12px] w-full" />
                            )}
                        </div>
                    ))}
                    <div className="flex flex-wrap items-center gap-2">
                        <button onClick={salva} disabled={!cambiato || salvo}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-bold border border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-30 flex items-center gap-1.5">
                            {salvo ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Salva
                        </button>
                        {cambiato && (
                            <button onClick={() => setBozza({})} className="px-3 py-1.5 rounded-lg text-[11px] font-bold border border-white/10 text-slate-400 hover:bg-white/5 flex items-center gap-1.5">
                                <X className="w-3 h-3" /> Annulla
                            </button>
                        )}
                        {conf?.aggiornato_il && !cambiato && (
                            <span className="text-[10px] text-slate-600">
                                cambiato {quando(conf.aggiornato_il)}{conf.aggiornato_da ? ` da ${conf.aggiornato_da}` : ""} — prima valevano i valori di fabbrica
                            </span>
                        )}
                    </div>
                </div>
            )}

            {a.registro && (
                <p className="text-[10px] text-slate-600">
                    Oltre alla chiamata, questo automatismo tiene un registro suo in <code className="font-mono text-slate-500">{a.registro.tabella}</code>: lì resta scritto quali mesi sono partiti davvero e con quale esito — la chiamata può arrivare e il lavoro decidere comunque di non spedire.
                </p>
            )}
            {esito && (
                <p className={cn("text-[11px] rounded-lg px-3 py-2 border",
                    esito.startsWith("⛔") ? "text-rose-200 bg-rose-500/10 border-rose-500/25" : "text-emerald-200 bg-emerald-500/10 border-emerald-500/25")}>{esito}</p>
            )}
        </div>
    );
}

const ESITO: Record<string, string> = {
    ok: "arrivata", errore: "errore di rete", scaduta: "scaduta senza risposta",
    rifiutata: "rifiutata dal server", persa: "risposta non più leggibile", "in corso": "in corso",
};

/** La risposta di una prova, detta a parole invece che in JSON. */
function risposta(j: Record<string, unknown>, stato: number): string {
    if (j?.errore || j?.error) return String(j.errore || j.error);
    // «saltata» è la parola del triage, «saltato» quella del report: due
    // rotte, due vocabolari — e leggerne uno solo faceva passare per «fatte 0»
    // una corsa che non era proprio partita
    if (j?.saltata || j?.saltato) return `non è partita: ${String(j.saltata || j.saltato)}`;
    if (typeof j?.esito === "string" && j.esito) return j.esito;
    if (j?.prova && j?.ferie) {
        const f = j.ferie as { righe: number; persone: number };
        const m = (j.malattia as { righe: number; persone: number }) || { righe: 0, persone: 0 };
        return `il mese di ${String(j.etichetta || "")} uscirebbe con ${f.righe} righe di ferie (${f.persone} persone) e ${m.righe} di malattia (${m.persone}); nessuna email è partita.`;
    }
    if (typeof j?.fatte === "number" || typeof j?.classificate === "number") {
        return `fatte ${Number(j.fatte ?? j.classificate)} in questa corsa.`;
    }
    if (j?.ok === false) return "la rotta ha risposto, ma dice di no.";
    if (j?.ok) return "ha risposto ed è andata bene.";
    return `il server ha risposto ${stato}.`;
}
