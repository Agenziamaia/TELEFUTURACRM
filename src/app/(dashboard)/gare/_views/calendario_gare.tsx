"use client";

// CALENDARIO GARE (v2 del Prospect, direttiva Luca 11/08): il dato dei giorni
// lavorativi è la base di TUTTE le proiezioni di commissioning — vive QUI
// dentro Gare. Per ogni mese: giorni lavorativi (calcolo automatico lun-sab
// meno festivi, con override), ORA DI SCATTO del giorno (prima di quell'ora
// il giorno corrente non conta come trascorso) e GIORNO del mese da cui la
// proiezione diventa visibile (a inizio mese mezza giornata sballa tutto).
// GIORNI CONGELATI (task Luca 13/08): dalla griglia si "congelano" i giorni
// in cui tutti i negozi sono chiusi (es. 13-17 agosto) — escono dal conteggio
// automatico come i festivi, così il totale non si scrive più a mano.
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Save } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { dbError, notify } from "../../amministrazione/_views/toast";
import { giorniLavorativiMese } from "@/lib/commissioning";

const meseCorrente = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const inputCls = "bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white w-16 text-center";
const GIORNI_SETT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

export function CalendarioGareView() {
    const [mese, setMese] = useState(meseCorrente());
    const monthISO = `${mese}-01`;
    const [info, setInfo] = useState<Awaited<ReturnType<typeof giorniLavorativiMese>> | null>(null);
    const [giorni, setGiorni] = useState("");
    const [ora, setOra] = useState("19");
    const [dal, setDal] = useState("1");
    const [congelati, setCongelati] = useState<Set<number>>(new Set());

    const load = useCallback(async () => {
        setInfo(null);
        const v = await giorniLavorativiMese(monthISO);
        const { data: row } = await supabase.from("pay_giorni_lavorativi")
            .select("giorni, ora_scatto, proiezione_dal, congelati").eq("month", monthISO).maybeSingle();
        setInfo(v);
        setGiorni(row?.giorni == null ? "" : String(row.giorni));
        setOra(String(row?.ora_scatto ?? 19));
        setDal(String(row?.proiezione_dal ?? 1));
        setCongelati(new Set(((row?.congelati as number[] | null) || []).map(Number)));
    }, [monthISO]);
    useEffect(() => { load(); }, [load]);

    const [y, m] = mese.split("-").map(Number);
    const nGiorni = new Date(y, m, 0).getDate();
    const festivi = useMemo(() => new Set((info?.festivi || []).map(f => Number(f.slice(8, 10)))), [info]);

    const toggleGiorno = (g: number) => {
        const dow = new Date(y, m - 1, g).getDay();
        if (dow === 0 || festivi.has(g)) return; // domeniche e festivi sono già fuori
        setCongelati(prev => {
            const next = new Set(prev);
            if (next.has(g)) next.delete(g); else next.add(g);
            return next;
        });
    };

    const salva = async () => {
        const g = giorni.trim() === "" ? null : Number(giorni);
        if (g != null && (!Number.isFinite(g) || g < 1 || g > 31)) { notify("Giorni lavorativi: numero tra 1 e 31 (vuoto = calcolo automatico)"); return; }
        const o = Number(ora), d = Number(dal);
        if (!Number.isFinite(o) || o < 0 || o > 23) { notify("Ora di scatto: 0-23"); return; }
        if (!Number.isFinite(d) || d < 1 || d > 31) { notify("Giorno di visibilità proiezione: 1-31"); return; }
        const { error } = await supabase.from("pay_giorni_lavorativi")
            .upsert({ month: monthISO, giorni: g, ora_scatto: o, proiezione_dal: d, congelati: [...congelati].sort((a, b) => a - b) });
        if (dbError("Salvataggio calendario gare", error)) return;
        notify("Calendario gare salvato ✓", "ok"); load();
    };

    return (
        <div className="max-w-2xl space-y-4">
            <div className="glass-panel rounded-2xl p-5">
                <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                    <div className="text-sm font-semibold text-white flex items-center gap-2"><CalendarDays size={18} /> Calendario gare</div>
                    <input type="month" value={mese} onChange={e => setMese(e.target.value)}
                        className="bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2 text-sm text-white" />
                </div>
                <div className="text-[12px] text-slate-400 mb-4">
                    Questi numeri guidano TUTTE le proiezioni di commissioning (Calcolatore oggi, viste gare domani).
                    {info && <> Calcolo automatico del mese: <b className="text-slate-200">{info.override ? "—" : info.totali} giorni lavorativi</b> (lun-sab meno festivi e congelati) · trascorsi a ora: <b className="text-slate-200">{info.trascorsi}</b>.</>}
                </div>

                {/* GRIGLIA DEL MESE: click su un giorno = congelato ❄️ (tutti i
                    negozi chiusi, fuori dal conteggio). Domeniche e festivi
                    sono già esclusi dal calcolo e non si toccano. */}
                <div className="mb-1 text-[12px] font-semibold text-slate-300">❄️ Giorni congelati <span className="font-normal text-slate-500">(tutti i negozi chiusi: click per congelare/scongelare — il conteggio si aggiorna al salvataggio)</span></div>
                <div className="grid grid-cols-7 gap-1 mb-2 select-none">
                    {GIORNI_SETT.map(d => <div key={d} className="text-center text-[10px] font-bold uppercase tracking-widest text-slate-500 py-1">{d}</div>)}
                    {Array.from({ length: (new Date(y, m - 1, 1).getDay() + 6) % 7 }, (_, i) => <div key={"v" + i} />)}
                    {Array.from({ length: nGiorni }, (_, i) => i + 1).map(g => {
                        const dow = new Date(y, m - 1, g).getDay();
                        const fisso = dow === 0 || festivi.has(g); // già fuori dal calcolo
                        const freddo = congelati.has(g);
                        return (
                            <button key={g} type="button" onClick={() => toggleGiorno(g)} disabled={fisso}
                                title={fisso ? (dow === 0 ? "Domenica: già esclusa dal calcolo" : "Festivo: già escluso dal calcolo") : freddo ? "Congelato: click per scongelare" : "Click per congelare (tutti i negozi chiusi)"}
                                className={`h-9 rounded-lg border text-xs font-semibold transition-all ${fisso
                                    ? "bg-rose-500/10 border-rose-500/20 text-rose-300/60 cursor-not-allowed"
                                    : freddo
                                        ? "bg-sky-500/25 border-sky-400/60 text-sky-100 shadow shadow-sky-500/20"
                                        : "bg-white/[0.04] border-white/10 text-slate-300 hover:bg-white/[0.1]"}`}>
                                {freddo ? "❄️" : g}
                            </button>
                        );
                    })}
                </div>
                {congelati.size > 0 && (
                    <div className="text-[11px] text-sky-300 mb-4">❄️ Congelati: {[...congelati].sort((a, b) => a - b).join(", ")} — non contano né nei totali né nei trascorsi.</div>
                )}

                <div className="space-y-3">
                    <label className="flex items-center justify-between gap-3 text-sm text-slate-300">
                        <span>📅 Giorni lavorativi del mese <span className="text-slate-500">(vuoto = automatico{info && !info.override ? `, ora ${info.totali}` : ""} — coi congelati il numero a mano non serve più)</span></span>
                        <input value={giorni} onChange={e => setGiorni(e.target.value)} placeholder="auto" className={inputCls} />
                    </label>
                    <label className="flex items-center justify-between gap-3 text-sm text-slate-300">
                        <span>🕖 Ora di scatto del giorno <span className="text-slate-500">(da quest&apos;ora il giorno corrente conta come trascorso)</span></span>
                        <input value={ora} onChange={e => setOra(e.target.value)} className={inputCls} />
                    </label>
                    <label className="flex items-center justify-between gap-3 text-sm text-slate-300">
                        <span>🔭 Proiezione visibile dal giorno <span className="text-slate-500">(prima si mostra solo il dato attuale)</span></span>
                        <input value={dal} onChange={e => setDal(e.target.value)} className={inputCls} />
                    </label>
                </div>
                <div className="mt-4 text-right">
                    <button onClick={salva} className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 inline-flex items-center gap-2"><Save size={15} /> Salva</button>
                </div>
            </div>
        </div>
    );
}
