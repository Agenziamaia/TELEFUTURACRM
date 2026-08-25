"use client";

/* TABELLA DELLE REGOLE DI INGAGGIO — amministrabile (Luca 29/07).
   Una riga per categoria, TRE variabili con le soglie in giorni lavorativi
   (⚡ Da lavorare · ⚠️ Warning · 🔴 Malus) più il malus giornaliero in euro.
   Vuoto = quella variabile non fa scattare quella fascia.
   SOLO L'ADMIN modifica; per tutti gli altri è una tabella di consultazione.
   Ogni salvataggio scrive su tracking_regole e RILEGGE dal DB. */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { impostaRegoleTracking, REGOLE_TRACKING_DEFAULT, type RegolaTracking } from "./trackingHelpers";

const CATEGORIE_UI: { id: string; label: string; color: string }[] = [
    { id: "mnp", label: "MNP", color: "var(--tf-38bdf8)" },
    { id: "fisso", label: "Fisso", color: "var(--tf-818cf8)" },
    { id: "finanziamento", label: "Finanziamento", color: "var(--tf-f59e0b)" },
    { id: "piva", label: "P.IVA", color: "var(--tf-a78bfa)" },
    { id: "energia", label: "Energia", color: "var(--tf-22c55e)" },
    { id: "sky", label: "Sky", color: "var(--tf-6366f1)" },
];
const VARIABILI: { prefisso: "senza" | "succ" | "compl"; label: string; desc: string }[] = [
    { prefisso: "senza", label: "Mai aggiornata", desc: "giorni dall'inserimento, pratica senza NESSUN aggiornamento" },
    { prefisso: "succ", label: "Ferma dopo un aggiornamento", desc: "giorni dall'ULTIMO aggiornamento (dal secondo in poi)" },
    { prefisso: "compl", label: "Non completata", desc: "giorni dall'inserimento finché la pratica non è completata" },
];
const FASCE: { suffisso: "lavorare" | "warning" | "malus"; icona: string; colore: string }[] = [
    { suffisso: "lavorare", icona: "⚡", colore: "var(--tf-eab308)" },
    { suffisso: "warning", icona: "⚠️", colore: "var(--tf-f97316)" },
    { suffisso: "malus", icona: "🔴", colore: "var(--tf-ef4444)" },
];

export function RegoleTracking({ admin, onSalvate }: { admin: boolean; onSalvate: () => void }) {
    const [righe, setRighe] = useState<RegolaTracking[]>([]);
    const [bozza, setBozza] = useState<Record<string, RegolaTracking>>({});
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState("");

    const carica = async () => {
        const { data } = await supabase.from("tracking_regole").select("*").order("categoria");
        const rows = (data && data.length ? data : REGOLE_TRACKING_DEFAULT) as RegolaTracking[];
        setRighe(rows);
        setBozza(Object.fromEntries(rows.map((r) => [r.categoria, { ...r }])));
        impostaRegoleTracking(rows);
    };
    useEffect(() => { carica(); }, []);

    const campo = (cat: string, chiave: keyof RegolaTracking) => {
        const v = bozza[cat]?.[chiave];
        return v === null || v === undefined ? "" : String(v);
    };
    const setCampo = (cat: string, chiave: keyof RegolaTracking, valore: string) => {
        setBozza((p) => ({
            ...p,
            [cat]: { ...p[cat], [chiave]: valore.trim() === "" ? null : Math.max(0, parseInt(valore, 10) || 0) },
        }));
    };

    const modificata = righe.some((r) => JSON.stringify(r) !== JSON.stringify(bozza[r.categoria]));

    const salva = async () => {
        if (busy) return;
        setBusy(true); setMsg("");
        try {
            // DECORRENZA (incidente sky 25/08: la regola accesa ha ricostruito
            // 119 malus RETROATTIVI da luglio): la riga davvero CAMBIATA entra
            // in vigore OGGI — i contatori non contano mai giorni precedenti;
            // le righe intatte conservano la loro data. Confronto normalizzato
            // (a DB malus_euro arriva come stringa).
            const oggiISO = new Date().toISOString().slice(0, 10);
            const CAMPI: (keyof RegolaTracking)[] = ["senza_lavorare", "senza_warning", "senza_malus", "succ_lavorare", "succ_warning", "succ_malus", "compl_lavorare", "compl_warning", "compl_malus", "malus_euro"];
            const nrm = (v: unknown) => v == null || v === "" ? null : Number(v);
            const payload = CATEGORIE_UI.map((c) => {
                const orig = righe.find((r) => r.categoria === c.id);
                const b = { ...bozza[c.id], categoria: c.id, malus_euro: Number(bozza[c.id]?.malus_euro) || 0 };
                const cambiata = !orig || CAMPI.some((k) => nrm(orig[k]) !== nrm(b[k]));
                return { ...b, decorrenza: cambiata ? oggiISO : (orig?.decorrenza ? String(orig.decorrenza).slice(0, 10) : null), updated_at: new Date().toISOString() };
            });
            const { error } = await supabase.from("tracking_regole").upsert(payload, { onConflict: "categoria" });
            if (error) { setMsg("⚠️ Salvataggio non riuscito: " + error.message); return; }
            await carica();          // rilettura dal DB: quello che vedi è ciò che vale
            onSalvate();             // il tracking ricalcola subito le fasce
            setMsg("✅ Regole salvate: il tracking le sta già applicando.");
        } finally { setBusy(false); }
    };

    return (
        <div className="p-5">
            <div className="overflow-x-auto rounded-xl border border-slate-700">
                <table className="w-full text-sm" style={{ minWidth: 760 }}>
                    <thead>
                        <tr className="bg-slate-900 text-left">
                            <th className="py-2.5 px-3 text-[11px] uppercase tracking-wider text-slate-400">Categoria</th>
                            {VARIABILI.map((v) => (
                                <th key={v.prefisso} className="py-2.5 px-3 text-[11px] uppercase tracking-wider text-slate-300" title={v.desc}>
                                    {v.label}
                                    <div className="normal-case font-normal text-[10px] text-slate-500 mt-0.5">{v.desc}</div>
                                </th>
                            ))}
                            <th className="py-2.5 px-3 text-[11px] uppercase tracking-wider text-slate-300" title="Euro maturati per ogni giorno oltre la soglia di malus">€ / giorno<br /><span className="normal-case font-normal text-[10px] text-slate-500">in malus</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        {CATEGORIE_UI.map((c) => (
                            <tr key={c.id} className="border-t border-white/10/60">
                                <td className="py-2.5 px-3">
                                    <span className="inline-flex items-center gap-2 font-extrabold" style={{ color: c.color }}>
                                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />{c.label}
                                    </span>
                                    {bozza[c.id]?.decorrenza && (
                                        <div className="text-[10px] text-slate-500 mt-0.5"
                                            title="Le soglie di questa categoria valgono da questa data: i contatori non contano i giorni precedenti — un cambio di regole non è mai retroattivo.">
                                            in vigore dal {String(bozza[c.id].decorrenza).slice(0, 10).split("-").reverse().join("/")}
                                        </div>
                                    )}
                                </td>
                                {VARIABILI.map((v) => (
                                    <td key={v.prefisso} className="py-2 px-3">
                                        <div className="flex items-center gap-1.5">
                                            {FASCE.map((f) => {
                                                const chiave = `${v.prefisso}_${f.suffisso}` as keyof RegolaTracking;
                                                return (
                                                    <label key={f.suffisso} className="flex items-center gap-1" title={`${f.icona} soglia in giorni lavorativi (vuoto = non attiva)`}>
                                                        <span className="text-xs">{f.icona}</span>
                                                        {admin ? (
                                                            <input value={campo(c.id, chiave)} onChange={(e) => setCampo(c.id, chiave, e.target.value)}
                                                                inputMode="numeric" placeholder="—"
                                                                className="w-11 text-center rounded-md bg-white/[0.05] border border-white/10 py-1 text-[13px] font-bold text-slate-100 focus:border-indigo-500 outline-none" />
                                                        ) : (
                                                            <span className="w-11 text-center py-1 text-[13px] font-bold" style={{ color: campo(c.id, chiave) ? f.colore : "var(--tf-475569)" }}>{campo(c.id, chiave) || "—"}</span>
                                                        )}
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </td>
                                ))}
                                <td className="py-2 px-3">
                                    {admin ? (
                                        <div className="flex items-center gap-1">
                                            <span className="text-slate-400">€</span>
                                            <input value={campo(c.id, "malus_euro")} onChange={(e) => setCampo(c.id, "malus_euro", e.target.value)}
                                                inputMode="numeric"
                                                className="w-14 text-center rounded-md bg-white/[0.05] border border-white/10 py-1 text-[13px] font-bold text-rose-300 focus:border-indigo-500 outline-none" />
                                        </div>
                                    ) : (
                                        <span className="font-bold text-rose-300">€ {campo(c.id, "malus_euro") || "0"}</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="mt-3 py-2.5 px-3.5 bg-slate-900 rounded-lg text-[11px] text-slate-400 leading-relaxed">
                <strong className="text-slate-200">Regole speciali fisse (per stato):</strong> P.IVA
                &quot;Cliente irreperibile&quot; → subito ⚡, ⚠️ a 2 gg, 🔴 oltre 4 gg · Sky &quot;WM Sospetta&quot; → ⚡ ·
                Sky &quot;Attesa matricola&quot; ferma da 5 gg / &quot;Aperto Sparks&quot; da 3 gg → ⚡ · categorie fuori
                tracking: solo gli stati critici (doc mancante, contattare cliente/supporto, ricaduta, KO reinserito) → ⚠️.
                Il malus vale <strong className="text-slate-200">(giorni oltre la soglia 🔴 + 1) × €/giorno</strong> sulla variabile più in ritardo.
            </div>

            {admin && (
                <div className="mt-4 flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-500">{msg || (modificata ? "Modifiche non ancora salvate" : "Le soglie a video sono quelle in vigore")}</span>
                    <button onClick={salva} disabled={busy || !modificata}
                        className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-[13px] font-bold">
                        {busy ? "Salvataggio…" : "Salva le regole"}
                    </button>
                </div>
            )}
            {!admin && <p className="mt-3 text-[11px] text-slate-600">Le soglie si modificano solo dall&apos;amministratore.</p>}
        </div>
    );
}
