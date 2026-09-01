"use client";

import { useEffect, useMemo, useState } from "react";

/* Cassa & Scontrini (spec Luca) — SOLO Amministrazione. Da qui si vede TUTTO l'attivo
   fiscale dei negozi: scontrini/fatture emessi, incassi della cassa automatica, chiusure
   Z, con importi e stato; più i dispositivi configurati (RT per negozio/azienda). Sola
   lettura: legge la coda print_jobs che pilota i dispositivi sul LAN. */

interface Cassa { richiesto: number | null; incassato: number | null; resto: number | null; }
interface Job {
    id: string; negozio: string | null; kind: string; status: string;
    created_at: string; updated_at: string | null; device_url: string | null;
    total: number | null; sconto: number | null; azienda: string | null;
    testMode: boolean | null; coupon: string | null; cassa: Cassa | null;
}
interface Disp { negozio: string; azienda: string; rt_url: string; piva: string | null; ragione_sociale: string | null; is_default: boolean; }

const eur = (n: number | null | undefined) => n == null ? "—" : "€ " + (Number(n) || 0).toFixed(2).replace(".", ",");
const dt = (s: string | null) => { if (!s) return "—"; try { return new Date(s).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch { return "—"; } };
const isOggi = (s: string) => { try { const d = new Date(s), n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate(); } catch { return false; } };

const KIND: Record<string, { label: string; cls: string }> = {
    fiscal_receipt: { label: "Scontrino fiscale", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30" },
    non_fiscal: { label: "Doc. prova", cls: "bg-slate-500/15 text-slate-300 border-slate-400/30" },
    cash_collect: { label: "Incasso cassa", cls: "bg-sky-500/15 text-sky-300 border-sky-400/30" },
    z_report: { label: "Chiusura Z", cls: "bg-violet-500/15 text-violet-300 border-violet-400/30" },
};
const kindLabel = (k: string) => KIND[k]?.label || k;
const STATO: Record<string, string> = {
    done: "text-emerald-300", sent: "text-sky-300", pending: "text-amber-300", error: "text-rose-300",
};

export function CassaScontriniView() {
    const [jobs, setJobs] = useState<Job[]>([]);
    const [disp, setDisp] = useState<Disp[]>([]);
    const [loading, setLoading] = useState(true);
    const [errore, setErrore] = useState("");
    const [fNeg, setFNeg] = useState("");
    const [fKind, setFKind] = useState("");
    /* ═══ L'INTERRUTTORE FISCALE (Luca 01/09) ═══════════════════════════════
       «Come facciamo ad abilitarli fiscalmente?» Fin qui `test_mode` si
       cambiava solo a mano sul database: tutti e quindici i negozi stampano
       un DOCUMENTO NON FISCALE (PROVA) e il registratore non viene coinvolto.
       Da qui si accende, un negozio alla volta — perché così si accende: uno,
       si guarda che gli scontrini escano, e poi gli altri. */
    const [modal, setModal] = useState<{
        puoi: boolean;
        senzaReparto: string[]; articoliSenzaReparto: number;
        negozi: { negozio: string; fiscale: boolean; haStampato: boolean; registratori: { azienda: string; rt_url: string }[] }[];
    } | null>(null);
    const [cambio, setCambio] = useState<{ negozio: string; fiscale: boolean } | null>(null);
    const [salvo, setSalvo] = useState("");

    const caricaModalita = async () => {
        try {
            const r = await fetch("/api/vendita/modalita-fiscale");
            const j = await r.json().catch(() => ({}));
            if (j?.ok) setModal(j);
        } catch { /* il pannello resta senza: non è il cuore della pagina */ }
    };
    useEffect(() => { caricaModalita(); }, []);

    const applicaModalita = async () => {
        if (!cambio) return;
        setSalvo(cambio.negozio);
        try {
            const r = await fetch("/api/vendita/modalita-fiscale", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(cambio),
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok || !j.ok) throw new Error(j.error || "non riuscito");
            setCambio(null);
            await caricaModalita();
        } catch (e: any) { setErrore(String(e?.message || e)); }
        finally { setSalvo(""); }
    };

    const load = async () => {
        setLoading(true); setErrore("");
        try {
            const res = await fetch("/api/vendita/pos-attivita");
            const j = await res.json().catch(() => ({}));
            if (!res.ok || !j.ok) throw new Error(j.error || "caricamento fallito");
            setJobs(Array.isArray(j.jobs) ? j.jobs : []);
            setDisp(Array.isArray(j.dispositivi) ? j.dispositivi : []);
        } catch (e: any) { setErrore(String(e?.message || e)); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    const negozi = useMemo(() => [...new Set(jobs.map((j) => j.negozio).filter(Boolean))] as string[], [jobs]);
    const stats = useMemo(() => {
        const s = { incassatoOggi: 0, scontriniOggi: 0, erroriOggi: 0, incassiOggi: 0 };
        for (const j of jobs) {
            if (!isOggi(j.created_at)) continue;
            if (j.status === "error") s.erroriOggi++;
            if (j.kind === "cash_collect") { if (j.cassa?.incassato) s.incassatoOggi += j.cassa.incassato; s.incassiOggi++; }
            if (j.kind === "fiscal_receipt" || j.kind === "non_fiscal") s.scontriniOggi++;
        }
        return s;
    }, [jobs]);

    const rows = useMemo(() => jobs.filter((j) =>
        (!fNeg || j.negozio === fNeg) && (!fKind || j.kind === fKind)), [jobs, fNeg, fKind]);

    const Stat = ({ label, val, cls }: { label: string; val: string | number; cls?: string }) => (
        <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
            <div className={"text-lg font-bold tabular-nums " + (cls || "text-white")}>{val}</div>
            <div className="text-[11px] text-slate-400">{label}</div>
        </div>
    );

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-2">
                <div>
                    <h2 className="text-lg font-bold text-white">🧾 Cassa &amp; Scontrini</h2>
                    <p className="text-xs text-slate-400">Scontrini/fatture, incassi cassa e chiusure Z di tutti i negozi. Sola lettura.</p>
                </div>
                <button onClick={load} className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10">↻ Aggiorna</button>
            </div>

            {/* ═══ MODALITÀ FISCALE ═══════════════════════════════════════════
                Un interruttore per negozio. Non è un'impostazione: è il momento
                in cui un punto vendita comincia a emettere documenti commerciali
                veri, che si annullano solo con una procedura fiscale. Per questo
                si preme uno alla volta e con una conferma che dice cosa cambia. */}
            {modal?.puoi && (
                <div className="glass-panel rounded-2xl p-4">
                    <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">🧾 Modalità fiscale</div>
                    <p className="text-[12px] text-slate-500 leading-relaxed mb-3">
                        In <b className="text-slate-400">prova</b> il CRM stampa un promemoria non fiscale e il registratore telematico non viene coinvolto.
                        In <b className="text-emerald-300">fiscale</b> esce il documento commerciale vero.
                        Si accende un negozio alla volta: il primo giorno se ne accende uno, si guarda che gli scontrini escano, e poi gli altri.
                    </p>

                    {(modal.senzaReparto.length > 0 || modal.articoliSenzaReparto > 0) && (
                        <div className="rounded-xl bg-amber-500/10 border border-amber-400/40 px-3 py-2 mb-3 text-xs text-amber-200">
                            <b>Da sistemare prima di accendere.</b> In prova il reparto IVA non viene controllato; in fiscale una riga senza reparto
                            fa <b>rifiutare l&apos;intera vendita</b>, col cliente davanti.
                            {modal.senzaReparto.length > 0 && <div className="mt-1">Voci di catalogo senza reparto: {modal.senzaReparto.join(", ")}</div>}
                            {modal.articoliSenzaReparto > 0 && <div className="mt-1">Articoli di magazzino senza reparto: <b>{modal.articoliSenzaReparto}</b> — li trovi in Magazzino → Articoli → «Da sistemare».</div>}
                        </div>
                    )}

                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {modal.negozi.map((n) => (
                            <div key={n.negozio} className={"rounded-xl border px-3 py-2.5 flex items-center justify-between gap-2 "
                                + (n.fiscale ? "bg-emerald-500/10 border-emerald-400/40" : "bg-white/[0.03] border-white/10")}>
                                <div className="min-w-0">
                                    <div className="text-sm font-semibold text-white truncate">{n.negozio}</div>
                                    <div className="text-[11px] text-slate-400">
                                        {n.fiscale ? "documenti fiscali" : "documenti di prova"}
                                        {" · "}
                                        {n.registratori.length ? `${n.registratori.length} registrator${n.registratori.length === 1 ? "e" : "i"}` : <span className="text-rose-300">nessun registratore</span>}
                                        {!n.haStampato && <span className="text-amber-300"> · non stampa da 24h</span>}
                                    </div>
                                </div>
                                <button onClick={() => setCambio({ negozio: n.negozio, fiscale: !n.fiscale })}
                                    disabled={salvo === n.negozio || (!n.fiscale && !n.registratori.length)}
                                    className={"shrink-0 px-3 py-2 rounded-lg text-xs font-bold border disabled:opacity-40 "
                                        + (n.fiscale ? "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                                            : "bg-emerald-500/20 border-emerald-400/50 text-emerald-100 hover:bg-emerald-500/30")}>
                                    {salvo === n.negozio ? "…" : n.fiscale ? "Rimetti in prova" : "Accendi il fiscale"}
                                </button>
                            </div>
                        ))}
                    </div>

                    {cambio && (
                        <div className="mt-3 rounded-xl bg-black/30 border border-white/15 p-3">
                            <div className="text-sm font-semibold text-white mb-1">
                                {cambio.fiscale ? `Accendere la cassa fiscale a ${cambio.negozio}?` : `Rimettere ${cambio.negozio} in prova?`}
                            </div>
                            <div className="text-xs text-slate-400 mb-3">
                                {cambio.fiscale
                                    ? <>Da adesso ogni vendita di quel negozio emette un <b className="text-emerald-300">documento commerciale vero</b>, che si annulla solo con una procedura fiscale. Il registratore deve essere acceso e collegato.</>
                                    : <>Da adesso quel negozio torna a stampare promemoria <b>non fiscali</b>. Gli incassi continuano a essere registrati nel CRM, ma il cliente non riceve un documento valido.</>}
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setCambio(null)} className="px-3 py-2 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 text-slate-300">Annulla</button>
                                <button onClick={applicaModalita} disabled={!!salvo}
                                    className="px-3 py-2 rounded-lg text-xs font-bold bg-emerald-500/25 border border-emerald-400/50 text-emerald-100 disabled:opacity-40">
                                    {salvo ? "…" : cambio.fiscale ? "Sì, accendi" : "Sì, rimetti in prova"}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Stat label="Incassato oggi (cassa)" val={eur(stats.incassatoOggi)} cls="text-emerald-300" />
                <Stat label="Incassi oggi" val={stats.incassiOggi} cls="text-sky-300" />
                <Stat label="Scontrini oggi" val={stats.scontriniOggi} />
                <Stat label="Errori oggi" val={stats.erroriOggi} cls={stats.erroriOggi ? "text-rose-300" : "text-white"} />
            </div>

            {/* Dispositivi configurati (RT) */}
            {!!disp.length && (
                <div className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-1.5">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Registratori telematici configurati</div>
                    <div className="flex flex-wrap gap-2">
                        {disp.map((d) => (
                            <div key={d.negozio + d.azienda} className="text-xs rounded-lg bg-white/5 border border-white/10 px-2.5 py-1.5">
                                <span className="text-slate-200 font-semibold">{d.negozio} · {d.azienda}</span>
                                {d.is_default && <span className="ml-1 text-[10px] text-emerald-300">default</span>}
                                <div className="text-slate-400">{d.ragione_sociale || "—"}{d.piva ? ` · P.IVA ${d.piva}` : ""}</div>
                                <div className="text-slate-500 font-mono">{d.rt_url}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Filtri */}
            <div className="flex flex-wrap items-center gap-2">
                <select value={fNeg} onChange={(e) => setFNeg(e.target.value)} className="rounded-lg bg-white/5 border border-white/10 text-slate-100 text-sm px-2.5 py-1.5 outline-none focus:border-violet-400/60">
                    <option value="" className="bg-slate-800">Tutti i negozi</option>
                    {negozi.map((n) => <option key={n} value={n} className="bg-slate-800">{n}</option>)}
                </select>
                {([["", "Tutti"], ["fiscal_receipt", "Scontrini"], ["cash_collect", "Cassa"], ["z_report", "Chiusura Z"], ["non_fiscal", "Prova"]] as [string, string][]).map(([k, lab]) => (
                    <button key={k} onClick={() => setFKind(k)} className={"px-3 py-1.5 rounded-lg text-xs font-semibold border transition " + (fKind === k ? "bg-violet-500/25 border-violet-400/50 text-white" : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10")}>{lab}</button>
                ))}
            </div>

            {errore && <p className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-lg p-2">{errore}</p>}
            {loading ? (
                <p className="text-sm text-slate-400 py-6 text-center animate-pulse">Caricamento…</p>
            ) : (
                <div className="overflow-x-auto rounded-xl border border-white/10">
                    <table className="w-full text-sm min-w-[720px]">
                        <thead>
                            <tr className="text-[11px] uppercase tracking-wide text-slate-500 bg-white/5">
                                <th className="text-left px-3 py-2">Ora</th>
                                <th className="text-left px-3 py-2">Negozio</th>
                                <th className="text-left px-3 py-2">Tipo</th>
                                <th className="text-left px-3 py-2">Azienda</th>
                                <th className="text-right px-3 py-2">Importo</th>
                                <th className="text-left px-3 py-2">Dettaglio</th>
                                <th className="text-left px-3 py-2">Stato</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {rows.map((j) => (
                                <tr key={j.id} className="hover:bg-white/[0.03]">
                                    <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{dt(j.created_at)}</td>
                                    <td className="px-3 py-2 text-slate-200">{j.negozio || "—"}</td>
                                    <td className="px-3 py-2"><span className={"px-2 py-0.5 rounded-full text-[11px] font-semibold border " + (KIND[j.kind]?.cls || "bg-white/5 text-slate-400 border-white/10")}>{kindLabel(j.kind)}</span>{j.testMode && <span className="ml-1 text-[10px] text-amber-300/80">prova</span>}</td>
                                    <td className="px-3 py-2 text-slate-400">{j.azienda || "—"}</td>
                                    <td className="px-3 py-2 text-right tabular-nums text-slate-100">
                                        {j.kind === "cash_collect" ? eur(j.cassa?.incassato ?? j.cassa?.richiesto) : (j.total != null ? eur(j.total) : "—")}
                                    </td>
                                    <td className="px-3 py-2 text-[11px] text-slate-400">
                                        {j.kind === "cash_collect" ? `rich. ${eur(j.cassa?.richiesto)} · resto ${eur(j.cassa?.resto)}` : ""}
                                        {j.sconto ? `sconto ${eur(j.sconto)}${j.coupon ? ` (${j.coupon})` : ""}` : ""}
                                    </td>
                                    <td className={"px-3 py-2 font-semibold " + (STATO[j.status] || "text-slate-400")}>{j.status}</td>
                                </tr>
                            ))}
                            {!rows.length && <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">Nessuna attività.</td></tr>}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
