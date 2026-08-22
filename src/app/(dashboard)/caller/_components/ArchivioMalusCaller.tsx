"use client";

// STORICO MALUS del call center ADEGUATO al linguaggio dell'Archivio Malus di
// Ricerca Vendite / Tracking PDA (Luca 05/08): stesse card-filtro coi totali,
// stesse etichette e colori di stato ("In corso" rosso, "Attivo — da scalare"
// ambra, "Compensato" verde), totali per collaboratore e TABELLA episodi al
// posto della vecchia lista piatta. I dati restano quelli di caller_malus
// (episodi in_corso → attivo → compensato); in piu' rispetto a prima:
// conferma inline (niente window.confirm), "Annulla" per riportare un
// compensato tra gli attivi e €/gg ricavato accanto ai giorni — come su RV.
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { SelectPersona } from "@/components/SelectPersona";
import { giornoYmd, type EpisodioCaller, type MalusLive } from "@/lib/callerMalus";

const eur = (n: number) => "€ " + (Math.round(n * 100) / 100).toLocaleString("it-IT");

const formatDataIt = (iso: string | null): string => {
    if (!iso) return "—";
    const [y, m, d] = String(iso).slice(0, 10).split("-");
    return y && m && d ? `${d}/${m}/${y}` : "—";
};

// Pill di stato IDENTICA allo StatoEpisodioBadge di Ricerca Vendite/Tracking.
// Helper chiamato come funzione, MAI componente annidato (regola focus).
function badgeStato(ep: EpisodioCaller) {
    const s =
        ep.stato === "compensato"
            ? { label: "Compensato", color: "var(--tf-4ade80)", bg: "var(--tf-052e16)", border: "var(--tf-22c55e)" }
            : ep.stato === "archiviato"
                // Luca 21/08 sera: malus di licenziati/sospesi non recuperati —
                // partita chiusa ma credito in traccia (come il Tracking PDA)
                ? { label: "📦 Archiviato", color: "var(--tf-cbd5e1)", bg: "var(--tf-1e293b)", border: "var(--tf-64748b)" }
                : ep.stato === "in_corso"
                    ? { label: "In corso", color: "var(--tf-fca5a5)", bg: "var(--tf-450a0a)", border: "var(--tf-dc2626)" }
                    : { label: "Attivo — da scalare", color: "var(--tf-fbbf24)", bg: "var(--tf-451a03)", border: "var(--tf-f59e0b)" };
    return (
        <span
            className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap border"
            style={{ color: s.color, background: s.bg, borderColor: s.border }}
        >
            {s.label}
        </span>
    );
}

const thStyle =
    "py-2 px-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-white/10 whitespace-nowrap";
const tdStyle = "py-2 px-3 border-b border-white/5 text-[12px]";

export function ArchivioMalusCaller({
    puoCompensare,
    utente,
    soloCaller,
    malusAttuali,
    versione,
    onClose,
    onApriPratica,
}: {
    puoCompensare: boolean;
    utente: string;
    soloCaller?: string;
    /** call_id → fotografia LIVE delle pratiche OGGI in fase malus (dalla
     *  pagina): con questa gli in_corso vengono RICALCOLATI al volo lato
     *  client — un in_corso la cui pratica non e' piu' in fase malus si mostra
     *  gia' "Attivo — da scalare" con fine=oggi, coerente col filtro 💸, anche
     *  quando chi guarda non scrive su caller_malus (non-direttori). */
    malusAttuali?: Map<string, MalusLive> | null;
    /** bump a sincronizzazione DB finita: fa ricaricare gli episodi POST-sync */
    versione?: number;
    onClose: () => void;
    /** click su una riga → apre il dettaglio della pratica (10/08) */
    onApriPratica?: (callId: string) => void;
}) {
    const [episodi, setEpisodi] = useState<EpisodioCaller[]>([]);
    const [caricato, setCaricato] = useState(false);
    const [errore, setErrore] = useState<string | null>(null);
    const carica = useCallback(() => {
        // soloCaller (Luca 31/07, come il tracking PDA): il caller vede SOLO il
        // proprio storico — in corso, attivi e compensati
        // esclude i tombstone (malus annullati dal match vendita, mig. 192)
        let q = supabase.from("caller_malus").select("*").or("eliminato.is.null,eliminato.eq.false").order("created_at", { ascending: false }).limit(500);
        if (soloCaller) q = q.eq("caller", soloCaller);
        q.then(({ data, error }) => {
            if (error) setErrore(error.message);
            setEpisodi((data ?? []) as EpisodioCaller[]);
            setCaricato(true);
        });
    }, [soloCaller]);
    // versione cambia quando la sincronizzazione della pagina ha finito di
    // scrivere: si ricarica per mostrare i dati POST-sincronizzazione
    useEffect(() => { void versione; carica(); }, [carica, versione]);

    // Vista RICALCOLATA degli in_corso (stessa logica di sincronizzaMalusCaller,
    // ma senza scritture): pratica ancora in malus con lo stesso `dal` →
    // giorni/importo aggiornati a oggi; pratica NON piu' in malus → chiusura
    // d'ufficio mostrata al volo (attivo, fine=oggi — l'importo resta da
    // scalare). A DB scrive solo la sync dei direttori; qui e' solo la vista.
    const episodiVista = useMemo(() => {
        if (!malusAttuali) return episodi;
        return episodi.map((e) => {
            if (e.stato !== "in_corso") return e;
            const live = malusAttuali.get(e.call_id);
            if (live && live.dal === e.dal) {
                if (live.giorni === Number(e.giorni) && live.importo === Number(e.importo)) return e;
                return { ...e, giorni: live.giorni, importo: live.importo };
            }
            return { ...e, stato: "attivo" as const, al: giornoYmd(new Date()) };
        });
    }, [episodi, malusAttuali]);

    // Dettaglio PRATICA per episodio (Luca 05/08: «da qui non capisco niente»):
    // cliente e numero accanto a ogni riga — senza, episodi di pratiche DIVERSE
    // dello stesso caller sembravano doppioni inspiegabili.
    const [pratiche, setPratiche] = useState<Map<string, { cli: string; num: string; statoOra: string }>>(new Map());
    useEffect(() => {
        const ids = [...new Set(episodi.map((e) => e.call_id).filter(Boolean))];
        if (!ids.length) { setPratiche(new Map()); return; }
        (async () => {
            const m = new Map<string, { cli: string; num: string; statoOra: string }>();
            for (let i = 0; i < ids.length; i += 100) {
                const { data } = await supabase.from("calls").select("id, nome, cognome, ragione_sociale, cellulare, numero, stato").in("id", ids.slice(i, i + 100));
                (data ?? []).forEach((r: { id: string; nome: string | null; cognome: string | null; ragione_sociale: string | null; cellulare: string | null; numero: string | null; stato: string | null }) => {
                    m.set(String(r.id), {
                        cli: (r.ragione_sociale || `${r.nome || ""} ${r.cognome || ""}`).trim() || "—",
                        num: r.cellulare || r.numero || "",
                        statoOra: r.stato || "",
                    });
                });
            }
            setPratiche(m);
        })();
    }, [episodi]);

    const [statoSel, setStatoSel] = useState<"tutti" | "in_corso" | "attivo" | "archiviato" | "compensato">("tutti");
    const [callerSel, setCallerSel] = useState("");
    const [search, setSearch] = useState("");
    const [confermaId, setConfermaId] = useState<number | null>(null);
    const [salvando, setSalvando] = useState(false);
    const [errAzione, setErrAzione] = useState<string | null>(null);

    // Filtri trasversali (ricerca + caller); le card di riepilogo filtrano lo stato.
    const filtratiBase = useMemo(() => {
        const q = search.trim().toLowerCase();
        return episodiVista.filter((e) => {
            if (callerSel && (e.caller || "—") !== callerSel) return false;
            if (q) {
                const p = pratiche.get(e.call_id);
                const match = [e.caller, e.stato_pratica, p?.cli, p?.num].some((v) => (v || "").toLowerCase().includes(q));
                if (!match) return false;
            }
            return true;
        });
    }, [episodiVista, callerSel, search, pratiche]);

    const filtrati = useMemo(
        () => filtratiBase.filter((e) => statoSel === "tutti" || e.stato === statoSel),
        [filtratiBase, statoSel]
    );

    const tot = useMemo(() => {
        const t = { inCorso: { n: 0, eur: 0 }, attivi: { n: 0, eur: 0 }, archiviati: { n: 0, eur: 0 }, compensati: { n: 0, eur: 0 }, totale: 0 };
        for (const e of filtratiBase) {
            const imp = Number(e.importo) || 0;
            t.totale += imp;
            if (e.stato === "compensato") { t.compensati.n++; t.compensati.eur += imp; }
            else if (e.stato === "archiviato") { t.archiviati.n++; t.archiviati.eur += imp; }
            else if (e.stato === "in_corso") { t.inCorso.n++; t.inCorso.eur += imp; }
            else { t.attivi.n++; t.attivi.eur += imp; }
        }
        return t;
    }, [filtratiBase]);

    const callers = useMemo(
        () => Array.from(new Set(episodiVista.map((e) => e.caller || "—"))).sort(),
        [episodiVista]
    );

    // Totali per collaboratore: quanto ha generato, quanto e' ancora da
    // scalare, quanto e' gia' stato compensato (come su Ricerca Vendite).
    const perCaller = useMemo(() => {
        const m = new Map<string, { n: number; inCorso: number; attivi: number; archiviati: number; compensati: number }>();
        for (const e of filtratiBase) {
            const k = e.caller || "—";
            const r = m.get(k) || { n: 0, inCorso: 0, attivi: 0, archiviati: 0, compensati: 0 };
            r.n++;
            const imp = Number(e.importo) || 0;
            if (e.stato === "in_corso") r.inCorso += imp;
            else if (e.stato === "attivo") r.attivi += imp;
            else if (e.stato === "archiviato") r.archiviati += imp;
            else r.compensati += imp;
            m.set(k, r);
        }
        return [...m.entries()].sort((a, b) => (b[1].inCorso + b[1].attivi) - (a[1].inCorso + a[1].attivi));
    }, [filtratiBase]);

    const ordinati = useMemo(
        () => [...filtrati].sort((a, b) => (b.dal || "").localeCompare(a.dal || "")),
        [filtrati]
    );

    const setCompensato = async (ep: EpisodioCaller, compensa: boolean) => {
        setSalvando(true);
        setErrAzione(null);
        const patch = compensa
            ? { stato: "compensato" as const, compensato_il: new Date().toISOString(), compensato_da: utente }
            : { stato: "attivo" as const, compensato_il: null, compensato_da: null };
        const { error } = await supabase.from("caller_malus").update(patch).eq("id", ep.id);
        setSalvando(false);
        setConfermaId(null);
        if (error) { setErrAzione(error.message); return; }
        setEpisodi((prev) => prev.map((e) => (e.id === ep.id ? { ...e, ...patch } : e)));
    };

    // I 4 SPAZI di Luca (21/08 sera), identici all'Archivio del Tracking PDA
    const cards: { id: "tutti" | "in_corso" | "attivo" | "archiviato" | "compensato"; label: string; n: number; val: number; color: string; hint?: string }[] = [
        { id: "tutti", label: "Totale generato", n: filtratiBase.length, val: tot.totale, color: "var(--tf-94a3b8)" },
        { id: "in_corso", label: "In corso ora", n: tot.inCorso.n, val: tot.inCorso.eur, color: "var(--tf-dc2626)", hint: "stanno ancora maturando" },
        { id: "attivo", label: "Attivi — da scalare", n: tot.attivi.n, val: tot.attivi.eur, color: "var(--tf-f59e0b)", hint: "chiusi, in attesa di compensazione" },
        { id: "archiviato", label: "📦 Archiviati", n: tot.archiviati.n, val: tot.archiviati.eur, color: "var(--tf-94a3b8)", hint: "di licenziati/sospesi — si compensano se escono crediti" },
        { id: "compensato", label: "Compensati", n: tot.compensati.n, val: tot.compensati.eur, color: "var(--tf-22c55e)", hint: "gia' scalati dai pagamenti" },
    ];

    return (
        <div
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label="Archivio Malus Call Center"
        >
            {/* LEZIONE VETRO: gli overlay vanno SOLIDI, mai glass */}
            <div
                className="bg-[#0e1526] border border-white/10 rounded-2xl w-[98vw] max-w-none h-[94vh] max-h-none overflow-y-auto shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between py-5 px-7 border-b border-white/10 sticky top-0 bg-[#12141f] z-10">
                    <div>
                        <div className="text-lg font-extrabold text-slate-100">
                            {soloCaller ? "💰 Il mio storico malus" : "💰 Archivio Malus Call Center"}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                            Ogni periodo di malus resta in traccia anche dopo che la pratica e&apos; stata ri-esitata ·
                            attivi = non ancora scalati · archiviati = di licenziati/sospesi, da recuperare se escono crediti ·
                            compensati = gia&apos; scalati dai pagamenti
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="bg-transparent border-none text-slate-500 text-xl cursor-pointer leading-none p-0">
                        ✕
                    </button>
                </div>

                <div className="p-6">
                    {errore && (
                        <div className="mb-4 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[13px]">
                            Archivio non disponibile: {errore}
                            <div className="text-[11px] text-amber-400/70 mt-1">
                                Probabilmente manca la migrazione 119 (tabella caller_malus) su Supabase.
                            </div>
                        </div>
                    )}
                    {errAzione && (
                        <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-[13px]">
                            Errore: {errAzione}
                        </div>
                    )}

                    {/* Riepilogo: le card filtrano l'elenco per stato */}
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 mb-5">
                        {cards.map((c) => {
                            const active = statoSel === c.id;
                            return (
                                <div
                                    key={c.id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setStatoSel(c.id)}
                                    onKeyDown={(e) => e.key === "Enter" && setStatoSel(c.id)}
                                    className="rounded-xl border border-white/10 p-3.5 cursor-pointer select-none transition-all"
                                    style={{ background: active ? c.color + "22" : "var(--tf-1e293b)", borderColor: active ? c.color : undefined }}
                                >
                                    <div className="text-xl font-bold" style={{ color: c.color }}>{eur(c.val)}</div>
                                    <div className="text-[11px] mt-0.5 font-medium" style={{ color: active ? c.color : "var(--tf-94a3b8)" }}>
                                        {c.label} · {c.n}
                                    </div>
                                    {c.hint && <div className="text-[10px] text-slate-500 mt-0.5">{c.hint}</div>}
                                </div>
                            );
                        })}
                    </div>

                    {/* Filtri */}
                    <div className="flex gap-2.5 items-center flex-wrap mb-5">
                        <div className="relative flex-1 min-w-[220px]">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">🔍</span>
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Cerca per caller o stato pratica…"
                                className="bg-white/[0.05] border border-white/10 rounded-lg text-slate-100 text-[13px] py-2 px-3 pl-9 outline-none w-full box-border"
                            />
                        </div>
                        {!soloCaller && callers.length > 1 && (
                            <div className="min-w-[230px]">
                                <SelectPersona
                                    value={callerSel}
                                    onChange={setCallerSel}
                                    opzioni={callers}
                                    placeholder="Tutti i caller — scrivi per filtrare"
                                    className="bg-white/[0.05] border border-white/10 rounded-lg text-slate-100 text-[13px] py-2 px-3 outline-none w-full"
                                />
                            </div>
                        )}
                    </div>

                    {/* Totali per collaboratore */}
                    {perCaller.length > 1 && (
                        <div className="mb-6">
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Totali per collaboratore</div>
                            <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full border-collapse">
                                        <thead>
                                            <tr className="bg-white/[0.04]">
                                                <th className={thStyle}>Caller</th>
                                                <th className={thStyle + " text-center"}>Episodi</th>
                                                <th className={thStyle + " text-right"}>In corso</th>
                                                <th className={thStyle + " text-right"}>Attivi</th>
                                                <th className={thStyle + " text-right"}>Archiviati</th>
                                                <th className={thStyle + " text-right"}>Compensati</th>
                                                <th className={thStyle + " text-right"}>Totale</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {perCaller.map(([nome, r]) => (
                                                <tr
                                                    key={nome}
                                                    className="cursor-pointer hover:bg-indigo-900/20"
                                                    onClick={() => setCallerSel(callerSel === nome ? "" : nome)}
                                                >
                                                    <td className={tdStyle + " text-slate-100 font-semibold"}>{nome}</td>
                                                    <td className={tdStyle + " text-center text-slate-300"}>{r.n}</td>
                                                    <td className={tdStyle + " text-right font-bold text-red-300"}>{r.inCorso ? eur(r.inCorso) : "—"}</td>
                                                    <td className={tdStyle + " text-right font-bold text-amber-300"}>{r.attivi ? eur(r.attivi) : "—"}</td>
                                                    <td className={tdStyle + " text-right text-slate-300"}>{r.archiviati ? eur(r.archiviati) : "—"}</td>
                                                    <td className={tdStyle + " text-right text-emerald-300"}>{r.compensati ? eur(r.compensati) : "—"}</td>
                                                    <td className={tdStyle + " text-right font-black text-slate-100"}>{eur(r.inCorso + r.attivi + r.archiviati + r.compensati)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Elenco episodi */}
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                        Episodi {statoSel !== "tutti" ? `· ${cards.find((c) => c.id === statoSel)?.label}` : ""}
                    </div>
                    {!caricato ? (
                        <div className="bg-white/[0.03] border border-white/10 rounded-xl py-10 px-6 text-center text-slate-500 text-[13px]">
                            Carico…
                        </div>
                    ) : ordinati.length === 0 ? (
                        <div className="bg-white/[0.03] border border-white/10 rounded-xl py-10 px-6 text-center text-slate-500 text-[13px]">
                            Nessun episodio di malus con i filtri selezionati.
                        </div>
                    ) : (
                        <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full border-collapse">
                                    <thead>
                                        <tr className="bg-white/[0.04]">
                                            <th className={thStyle}>Caller</th>
                                            <th className={thStyle}>Pratica</th>
                                            <th className={thStyle}>Stato pratica</th>
                                            <th className={thStyle}>Inizio</th>
                                            <th className={thStyle}>Fine</th>
                                            <th className={thStyle + " text-center"}>GG</th>
                                            <th className={thStyle + " text-right"}>Importo</th>
                                            <th className={thStyle}>Stato</th>
                                            {puoCompensare && <th className={thStyle}></th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {ordinati.map((ep) => {
                                            const giorni = Number(ep.giorni) || 0;
                                            const perGiorno = giorni > 0 ? Math.round((Number(ep.importo) / giorni) * 100) / 100 : 0;
                                            return (
                                                <tr key={ep.id} onClick={() => onApriPratica?.(String(ep.call_id))}
                                                    title="Apri il dettaglio della pratica"
                                                    className={onApriPratica ? "cursor-pointer hover:bg-white/[0.04] transition-colors" : undefined}>
                                                    <td className={tdStyle + " text-slate-100 font-semibold"}>{ep.caller || "—"}</td>
                                                    <td className={tdStyle}>
                                                        {(() => { const p = pratiche.get(ep.call_id); return p ? (
                                                            <>
                                                                <div className="text-slate-100 font-semibold truncate max-w-[180px]" title={p.cli}>{p.cli}</div>
                                                                <div className="text-[10px] text-slate-500 font-mono">{p.num}{p.statoOra && p.statoOra !== ep.stato_pratica ? ` · ora: ${p.statoOra}` : ""}</div>
                                                            </>
                                                        ) : <span className="text-slate-600">—</span>; })()}
                                                    </td>
                                                    <td className={tdStyle + " text-slate-300"}>{ep.stato_pratica || "—"}</td>
                                                    <td className={tdStyle + " text-slate-400 whitespace-nowrap"}>{formatDataIt(ep.dal)}</td>
                                                    <td className={tdStyle + " text-slate-400 whitespace-nowrap"}>
                                                        {ep.al ? formatDataIt(ep.al) : <span className="text-red-400 font-semibold">in corso</span>}
                                                    </td>
                                                    <td className={tdStyle + " text-center text-slate-300"}>
                                                        {giorni}
                                                        {perGiorno > 0 && <div className="text-[10px] text-slate-600">{perGiorno}€/gg</div>}
                                                    </td>
                                                    <td className={tdStyle + " text-right font-black text-slate-100 whitespace-nowrap"}>{eur(Number(ep.importo))}</td>
                                                    <td className={tdStyle}>
                                                        {badgeStato(ep)}
                                                        {ep.stato === "compensato" && ep.compensato_il && (
                                                            <div className="text-[10px] text-slate-500 mt-0.5">
                                                                {formatDataIt(ep.compensato_il)}{ep.compensato_da ? ` · ${ep.compensato_da}` : ""}
                                                            </div>
                                                        )}
                                                    </td>
                                                    {puoCompensare && (
                                                        <td className={tdStyle + " whitespace-nowrap text-right"} onClick={(e) => e.stopPropagation()}>
                                                            {/* anche gli ARCHIVIATI si compensano: e' il caso "sono
                                                                usciti crediti a favore del licenziato" (Luca 21/08) */}
                                                            {(ep.stato === "attivo" || ep.stato === "archiviato") && (
                                                                confermaId === ep.id ? (
                                                                    <span className="inline-flex gap-1.5">
                                                                        <button
                                                                            type="button"
                                                                            disabled={salvando}
                                                                            onClick={() => setCompensato(ep, true)}
                                                                            className="px-2 py-1 rounded-md bg-emerald-600 text-white text-[11px] font-bold disabled:opacity-40"
                                                                            title="Da fare solo quando viene pagato nelle gare di commissioning"
                                                                        >
                                                                            Confermi?
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setConfermaId(null)}
                                                                            className="px-2 py-1 rounded-md border border-white/15 text-slate-400 text-[11px]"
                                                                        >
                                                                            ✕
                                                                        </button>
                                                                    </span>
                                                                ) : (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setConfermaId(ep.id)}
                                                                        className="px-2 py-1 rounded-md border border-emerald-600 text-emerald-300 text-[11px] font-bold hover:bg-emerald-600/10"
                                                                    >
                                                                        ✓ Compensa
                                                                    </button>
                                                                )
                                                            )}
                                                            {ep.stato === "compensato" && (
                                                                <button
                                                                    type="button"
                                                                    disabled={salvando}
                                                                    onClick={() => setCompensato(ep, false)}
                                                                    className="px-2 py-1 rounded-md border border-white/15 text-slate-500 text-[11px] hover:text-slate-300"
                                                                    title="Riporta l'episodio tra gli attivi"
                                                                >
                                                                    Annulla
                                                                </button>
                                                            )}
                                                        </td>
                                                    )}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className="py-2.5 px-4 border-t border-white/10 text-slate-500 text-xs">
                                {ordinati.length} episodi · la compensazione automatica arrivera&apos; con il sistema gare/commissioning
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
