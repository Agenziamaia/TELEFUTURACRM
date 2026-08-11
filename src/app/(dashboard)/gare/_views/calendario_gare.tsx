"use client";

// CALENDARIO GARE (v2 del Prospect, direttiva Luca 11/08): il dato dei giorni
// lavorativi è la base di TUTTE le proiezioni di commissioning — vive QUI
// dentro Gare. Per ogni mese: giorni lavorativi (calcolo automatico lun-sab
// meno festivi, con override), ORA DI SCATTO del giorno (prima di quell'ora
// il giorno corrente non conta come trascorso) e GIORNO del mese da cui la
// proiezione diventa visibile (a inizio mese mezza giornata sballa tutto).
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Save } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { dbError, notify } from "../../amministrazione/_views/toast";
import { giorniLavorativiMese } from "@/lib/commissioning";

const meseCorrente = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const inputCls = "bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white w-16 text-center";

export function CalendarioGareView() {
    const [mese, setMese] = useState(meseCorrente());
    const monthISO = `${mese}-01`;
    const [info, setInfo] = useState<Awaited<ReturnType<typeof giorniLavorativiMese>> | null>(null);
    const [giorni, setGiorni] = useState("");
    const [ora, setOra] = useState("19");
    const [dal, setDal] = useState("1");

    const load = useCallback(async () => {
        setInfo(null);
        const [v, row] = await Promise.all([
            giorniLavorativiMese(monthISO),
            supabase.from("pay_giorni_lavorativi").select("giorni, ora_scatto, proiezione_dal").eq("month", monthISO).maybeSingle(),
        ]);
        setInfo(v);
        setGiorni(row.data?.giorni == null ? "" : String(row.data.giorni));
        setOra(String(row.data?.ora_scatto ?? 19));
        setDal(String(row.data?.proiezione_dal ?? 1));
    }, [monthISO]);
    useEffect(() => { load(); }, [load]);

    const salva = async () => {
        const g = giorni.trim() === "" ? null : Number(giorni);
        if (g != null && (!Number.isFinite(g) || g < 1 || g > 31)) { notify("Giorni lavorativi: numero tra 1 e 31 (vuoto = calcolo automatico)"); return; }
        const o = Number(ora), d = Number(dal);
        if (!Number.isFinite(o) || o < 0 || o > 23) { notify("Ora di scatto: 0-23"); return; }
        if (!Number.isFinite(d) || d < 1 || d > 31) { notify("Giorno di visibilità proiezione: 1-31"); return; }
        const { error } = await supabase.from("pay_giorni_lavorativi")
            .upsert({ month: monthISO, giorni: g, ora_scatto: o, proiezione_dal: d });
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
                    Questi tre numeri guidano TUTTE le proiezioni di commissioning (Calcolatore oggi, viste gare domani).
                    {info && <> Calcolo automatico del mese: <b className="text-slate-200">{info.override ? "—" : info.totali} giorni lavorativi</b> (lun-sab meno festivi) · trascorsi a ora: <b className="text-slate-200">{info.trascorsi}</b>.</>}
                </div>
                <div className="space-y-3">
                    <label className="flex items-center justify-between gap-3 text-sm text-slate-300">
                        <span>📅 Giorni lavorativi del mese <span className="text-slate-500">(vuoto = automatico{info && !info.override ? `, ora ${info.totali}` : ""})</span></span>
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
