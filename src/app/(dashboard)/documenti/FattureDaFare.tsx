"use client";

/* ═══ LE FATTURE DA EMETTERE ═════════════════════════════════════════════════
   Luca 04/09: «deve arrivare un flash all'amministrazione che deve avere una
   sezione ben fatta all'interno di documenti dove cliccando sul flash lo
   riporta direttamente lì, dove a quel punto può esitarla come fatta».

   Questa non è una lista di documenti già emessi come il resto di Documenti:
   è una LISTA DI LAVORO. Per questo è fatta a schede e non a tabella — chi
   deve emettere una fattura non cerca una riga, legge un cliente: ragione
   sociale, partita IVA, dove mandarla, cosa fatturare e quanto. Tutto quello
   che serve deve stare sotto gli occhi senza aprire altro, e il pulsante
   «copia» lo consegna in un colpo solo al gestionale della contabilità.

   Le richieste le crea la cassa quando il cliente chiede fattura: in quel caso
   NON esce nessuno scontrino (sarebbero due documenti per la stessa
   operazione) ma i soldi si incassano lo stesso, e qui si vede anche come.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, RefreshCw, Copy, Check } from "lucide-react";

const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
const eur = (n: number | null | undefined) => n == null ? "—"
    : "€ " + Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const quando = (s: string | null) => s
    ? new Date(s).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "—";

export type Fattura = {
    id: string;
    contratto_id: string | null;
    negozio: string;
    societa: string | null;
    creato_da: string | null;
    created_at: string;
    totale: number;
    client_id: string | null;
    cliente_tipo: string | null;
    ragione_sociale: string | null;
    nome: string | null;
    cognome: string | null;
    cf_piva: string | null;
    codice_destinatario: string | null;
    pec: string | null;
    indirizzo: string | null;
    cap: string | null;
    citta: string | null;
    email: string | null;
    telefono: string | null;
    righe: { descrizione?: string; quantita?: number; prezzo?: number }[] | null;
    pagamenti: { forma?: string; importo?: number }[] | null;
    stato: string;
    numero_fattura: string | null;
    fatta_il: string | null;
    fatta_da: string | null;
    note: string | null;
};

const intestatario = (f: Fattura) =>
    (f.ragione_sociale || `${f.nome || ""} ${f.cognome || ""}`.trim() || f.cf_piva || "cliente senza nome").trim();

/* IL BLOCCHETTO DA INCOLLARE NEL GESTIONALE. Un campo per riga, nell'ordine in
   cui li chiede un'anagrafica di fatturazione: si incolla e si va. */
function testoDaCopiare(f: Fattura): string {
    const r = [
        intestatario(f),
        f.cf_piva ? `P.IVA / C.F.: ${f.cf_piva}` : "",
        [f.indirizzo, [f.cap, f.citta].filter(Boolean).join(" ")].filter(Boolean).join(" — "),
        f.codice_destinatario ? `Codice destinatario: ${f.codice_destinatario}` : "",
        f.pec ? `PEC: ${f.pec}` : "",
        f.email ? `Email: ${f.email}` : "",
        f.telefono ? `Telefono: ${f.telefono}` : "",
        "",
        ...(f.righe || []).map((x) => `${x.quantita || 1} × ${x.descrizione || "voce"} — ${eur(x.prezzo)}`),
        `TOTALE: ${eur(f.totale)}`,
    ];
    return r.filter((x) => x !== "").join("\n");
}

export function FattureDaFare({ puoiEsitare, apriId }: { puoiEsitare: boolean; apriId?: string | null }) {
    const [righe, setRighe] = useState<Fattura[] | null>(null);
    const [filtro, setFiltro] = useState<"da_fare" | "fatta" | "">("da_fare");
    const [aperta, setAperta] = useState<string | null>(apriId || null);
    const [numero, setNumero] = useState("");
    const [nota, setNota] = useState("");
    const [salvo, setSalvo] = useState(false);
    const [errore, setErrore] = useState("");
    const [copiata, setCopiata] = useState<string | null>(null);
    const [ricarica, setRicarica] = useState(0);
    const scrollaA = useRef<string | null>(apriId || null);

    const carica = useCallback(async () => {
        const { data } = await supabase.from("fatture_richieste")
            .select("*").order("created_at", { ascending: false }).limit(500);
        setRighe((data || []) as Fattura[]);
    }, []);
    useEffect(() => { void carica(); }, [carica, ricarica]);

    /* IL FLASH PORTA QUI E DEVE TROVARE LA SUA RIGA APERTA. Se la richiesta è
       già stata esitata il filtro «da fare» la nasconderebbe: si allarga da
       solo, se no il link porta a una pagina che sembra vuota. */
    useEffect(() => {
        if (!apriId || !righe) return;
        const f = righe.find((x) => x.id === apriId);
        if (f && f.stato !== "da_fare" && filtro === "da_fare") setFiltro("");
        setAperta(apriId);
    }, [apriId, righe, filtro]);

    /* ⚠️ IL NUMERO NON DEVE MIGRARE DA UNA SCHEDA ALL'ALTRA (revisore 04/09).
       `numero` e `nota` sono uno stato solo per tutte le schede, e l'effetto
       del deep link riapre una scheda a ogni cambio di filtro: si scriveva
       «124/2026» su una richiesta, si toccava un filtro, e quel numero
       ricompariva dentro la scheda di un altro cliente già pronto da
       confermare. Cambiando scheda si riparte puliti, sempre. */
    useEffect(() => { setNumero(""); setNota(""); setErrore(""); }, [aperta]);

    useEffect(() => {
        if (!scrollaA.current || !righe) return;
        const el = document.getElementById("fat-" + scrollaA.current);
        if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); scrollaA.current = null; }
    }, [righe]);

    const viste = useMemo(() => (righe || []).filter((f) => !filtro || f.stato === filtro), [righe, filtro]);
    const daFare = useMemo(() => (righe || []).filter((f) => f.stato === "da_fare"), [righe]);
    const totDaFare = daFare.reduce((s, f) => s + Number(f.totale || 0), 0);

    const esita = async (f: Fattura, annulla: boolean) => {
        setErrore(""); setSalvo(true);
        try {
            const { data, error } = await supabase.rpc("fattura_esita", {
                p_id: f.id,
                p_numero: annulla ? null : numero.trim(),
                p_note: nota.trim() || null,
                p_annulla: annulla,
            });
            if (error) throw error;
            if (!(data as { ok?: boolean } | null)?.ok) throw new Error("non riuscita");
            setNumero(""); setNota(""); setAperta(null); setRicarica((x) => x + 1);
        } catch (e) {
            setErrore((e as Error)?.message || "Non sono riuscito a salvare. Riprova.");
        } finally { setSalvo(false); }
    };

    const copia = async (f: Fattura) => {
        try {
            await navigator.clipboard.writeText(testoDaCopiare(f));
            setCopiata(f.id);
            setTimeout(() => setCopiata(null), 1800);
        } catch { setErrore("Il browser non mi lascia copiare: seleziona il testo a mano."); }
    };

    if (righe === null) return (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-10 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Carico le richieste di fattura…
        </div>
    );

    return (
        <div className="space-y-4">
            {/* ── LA BARRA: quante ne restano e quanto valgono ─────────────── */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="rvBox px-4 py-3">
                    <div className="text-[11px] text-slate-400">Da emettere</div>
                    <div className="text-2xl font-black text-white tabular-nums">{daFare.length}</div>
                </div>
                <div className="rvBox px-4 py-3">
                    <div className="text-[11px] text-slate-400">Valore</div>
                    <div className="text-2xl font-black text-sky-300 tabular-nums">{eur(totDaFare)}</div>
                </div>
                <div className="flex gap-2 ml-auto">
                    {([["da_fare", "Da emettere"], ["fatta", "Emesse"], ["", "Tutte"]] as const).map(([id, et]) => (
                        <button key={id} type="button" onClick={() => setFiltro(id)}
                            className={cn("px-3 py-2 rounded-xl text-xs font-bold border transition",
                                filtro === id ? "bg-sky-500/25 border-sky-400/60 text-white"
                                    : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10")}>
                            {et}
                        </button>
                    ))}
                    <button type="button" onClick={() => setRicarica((x) => x + 1)}
                        className="px-3 py-2 rounded-xl text-xs font-bold border bg-white/5 border-white/10 text-slate-300 hover:bg-white/10">
                        <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {errore && <div className="rvNota rvNota-ko">{errore}</div>}

            {!viste.length && (
                <div className="rvNota rvNota-info">
                    {filtro === "da_fare"
                        ? "Nessuna fattura in attesa. Quando un cliente ne chiede una alla cassa, la richiesta arriva qui."
                        : "Nessuna richiesta in questo stato."}
                </div>
            )}

            {viste.map((f) => {
                const apertaQui = aperta === f.id;
                const daFareQui = f.stato === "da_fare";
                const dove = f.codice_destinatario
                    ? `SdI ${f.codice_destinatario}` : f.pec ? `PEC ${f.pec}` : "manca dove mandarla";
                return (
                    <div key={f.id} id={"fat-" + f.id}
                        className={cn("rvBox p-4 space-y-3 transition",
                            apriId === f.id && "ring-2 ring-sky-400/60",
                            !daFareQui && "opacity-75")}>

                        <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-lg font-bold text-white truncate">{intestatario(f)}</span>
                                    {f.cliente_tipo === "business"
                                        ? <span className="rvBadge rvBadge-mini">business</span>
                                        : <span className="rvBadge rvBadge-mini">privato</span>}
                                    {f.stato === "fatta" && <span className="rvBadge rvBadge-ok">fattura {f.numero_fattura}</span>}
                                    {f.stato === "annullata" && <span className="rvBadge rvBadge-empty">annullata</span>}
                                </div>
                                <div className="text-[12px] text-slate-400 mt-0.5">
                                    {f.cf_piva || "senza partita IVA"} · {[f.indirizzo, f.cap, f.citta].filter(Boolean).join(", ") || "senza indirizzo"}
                                </div>
                                <div className={cn("text-[12px] mt-0.5", f.codice_destinatario || f.pec ? "text-sky-300" : "text-rose-300")}>
                                    {dove}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-2xl font-black text-white tabular-nums">{eur(f.totale)}</div>
                                <div className="text-[11px] text-slate-500">
                                    {quando(f.created_at)} · {f.negozio}{f.societa ? ` · ${f.societa}` : ""}
                                </div>
                                {f.creato_da && <div className="text-[11px] text-slate-500">venduto da {f.creato_da}</div>}
                            </div>
                        </div>

                        {/* ── COSA FATTURARE, e come è entrato l'incasso ────── */}
                        <div className="grid gap-3 md:grid-cols-2">
                            <div className="rounded-xl bg-black/25 border border-white/10 p-3">
                                <div className="text-[11px] text-slate-400 mb-1.5">Da fatturare</div>
                                <div className="space-y-1">
                                    {(f.righe || []).length
                                        ? (f.righe || []).map((r, i) => (
                                            <div key={i} className="flex items-baseline justify-between gap-3 text-[13px]">
                                                <span className="text-slate-200 truncate">{r.quantita || 1} × {r.descrizione || "voce"}</span>
                                                <span className="text-slate-300 tabular-nums shrink-0">{eur(r.prezzo)}</span>
                                            </div>
                                        ))
                                        : <div className="text-[12px] text-slate-500">nessun dettaglio</div>}
                                </div>
                            </div>
                            <div className="rounded-xl bg-black/25 border border-white/10 p-3">
                                <div className="text-[11px] text-slate-400 mb-1.5">Incassato in negozio</div>
                                <div className="space-y-1">
                                    {(f.pagamenti || []).length
                                        ? (f.pagamenti || []).map((p, i) => (
                                            <div key={i} className="flex items-baseline justify-between gap-3 text-[13px]">
                                                <span className="text-slate-200">{p.forma || "—"}</span>
                                                <span className="text-slate-300 tabular-nums">{eur(p.importo)}</span>
                                            </div>
                                        ))
                                        : <div className="text-[12px] text-slate-500">nessun incasso registrato</div>}
                                </div>
                                <div className="text-[11px] text-slate-500 mt-2">
                                    I soldi sono già entrati: qui manca solo il documento.
                                </div>
                            </div>
                        </div>

                        {f.note && <div className="rvNota rvNota-att">{f.note}</div>}
                        {f.stato !== "da_fare" && f.fatta_da && (
                            <div className="text-[11px] text-slate-500">
                                {f.stato === "fatta" ? "Emessa" : "Annullata"} da {f.fatta_da} il {quando(f.fatta_il)}
                            </div>
                        )}

                        {/* ── LE AZIONI ─────────────────────────────────────── */}
                        <div className="flex flex-wrap items-center gap-2">
                            <button type="button" onClick={() => copia(f)}
                                className="px-3 py-2 rounded-xl text-xs font-bold border bg-white/5 border-white/10 text-slate-200 hover:bg-white/10 inline-flex items-center gap-1.5">
                                {copiata === f.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                {copiata === f.id ? "Copiati" : "Copia i dati"}
                            </button>
                            {f.contratto_id && (
                                <a href={`/ricerca-vendite?id=${encodeURIComponent(f.contratto_id)}`}
                                    className="px-3 py-2 rounded-xl text-xs font-bold border bg-white/5 border-white/10 text-slate-200 hover:bg-white/10">
                                    Apri la vendita
                                </a>
                            )}
                            {daFareQui && puoiEsitare && !apertaQui && (
                                <button type="button" onClick={() => { setAperta(f.id); setNumero(""); setNota(""); }}
                                    className="ml-auto primary-btn px-4 py-2 text-xs font-bold">
                                    Segna come emessa
                                </button>
                            )}
                        </div>

                        {daFareQui && puoiEsitare && apertaQui && (
                            <div className="rounded-xl bg-sky-500/10 border border-sky-400/30 p-3 space-y-2">
                                <div className="text-[12px] text-sky-100">
                                    Scrivi il numero della fattura che hai emesso: resta agganciato a questa vendita,
                                    così fra sei mesi si sa quale documento copre quell&apos;incasso.
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <input value={numero} onChange={(e) => setNumero(e.target.value)}
                                        placeholder="es. 124/2026" autoFocus
                                        className="flex-1 min-w-[160px] rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-sm text-white placeholder:text-slate-600" />
                                    <input value={nota} onChange={(e) => setNota(e.target.value)}
                                        placeholder="nota (facoltativa)"
                                        className="flex-1 min-w-[160px] rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-sm text-white placeholder:text-slate-600" />
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <button type="button" disabled={salvo || !numero.trim()} onClick={() => esita(f, false)}
                                        className="primary-btn px-4 py-2 text-xs font-bold disabled:opacity-40">
                                        {salvo ? "Salvo…" : "Fattura emessa"}
                                    </button>
                                    <button type="button" disabled={salvo} onClick={() => esita(f, true)}
                                        className="px-3 py-2 rounded-xl text-xs font-bold border bg-rose-500/10 border-rose-400/30 text-rose-200 hover:bg-rose-500/20 disabled:opacity-40">
                                        Non va fatturata
                                    </button>
                                    <button type="button" onClick={() => setAperta(null)}
                                        className="px-3 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-200">
                                        Annulla
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
