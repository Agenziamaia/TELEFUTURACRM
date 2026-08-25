"use client";

/* TABELLA DELLE REGOLE DI INGAGGIO — amministrabile (Luca 29/07).
   Una riga per categoria, TRE variabili con le soglie in giorni lavorativi
   (⚡ Da lavorare · ⚠️ Warning · 🔴 Malus) più il malus giornaliero in euro.
   Vuoto = quella variabile non fa scattare quella fascia.
   SOLO L'ADMIN modifica; per tutti gli altri è una tabella di consultazione.
   Ogni salvataggio scrive su tracking_regole e RILEGGE dal DB. */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { impostaRegoleTracking, impostaEsitiTracking, REGOLE_TRACKING_DEFAULT, type RegolaTracking } from "./trackingHelpers";

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

    // ── MALUS DEGLI ESITI AMMINISTRATIVI (Luca 25/08: «Non Conforme genera un
    // malus definitivo e poi un giornaliero finché non viene gestita») — i €
    // si settano QUI, per esito e categoria. Al salvataggio si timbra la
    // decorrenza (lezione incidente sky dello stesso giorno): i valori nuovi
    // valgono solo in avanti — un esito già assegnato non paga la una tantum
    // e il giornaliero conta solo i giorni dalla configurazione in poi.
    type EsitoAdm = { id: string; categoria: string; etichetta: string; brand: string | null; malus_fisso: number | null; malus_giorno: number | null; malus_decorrenza: string | null };
    const [esitiAdm, setEsitiAdm] = useState<EsitoAdm[]>([]);
    const [admBozza, setAdmBozza] = useState<Record<string, { fisso: string; giorno: string }>>({});
    const caricaEsiti = async () => {
        const { data } = await supabase.from("tracking_esiti")
            .select("id, categoria, etichetta, brand, malus_fisso, malus_giorno, malus_decorrenza")
            .eq("lato", "admin").eq("attiva", true).eq("completata", false)
            .order("categoria").order("ordine");
        const rows = (data || []) as EsitoAdm[];
        setEsitiAdm(rows);
        setAdmBozza(Object.fromEntries(rows.map((r) => [r.id, {
            fisso: r.malus_fisso == null ? "" : String(r.malus_fisso),
            giorno: r.malus_giorno == null ? "" : String(r.malus_giorno),
        }])));
    };
    useEffect(() => { caricaEsiti(); }, []);
    const admNum = (v: string) => { if (v.trim() === "") return null; const x = Number(v.replace(",", ".")); return Number.isFinite(x) && x > 0 ? x : null; };
    const admDirty = (r: EsitoAdm) => {
        const b = admBozza[r.id]; if (!b) return false;
        return admNum(b.fisso) !== (r.malus_fisso == null ? null : Number(r.malus_fisso))
            || admNum(b.giorno) !== (r.malus_giorno == null ? null : Number(r.malus_giorno));
    };
    const salvaEsito = async (r: EsitoAdm) => {
        const b = admBozza[r.id]; if (!b) return;
        const { error } = await supabase.from("tracking_esiti").update({
            malus_fisso: admNum(b.fisso), malus_giorno: admNum(b.giorno),
            malus_decorrenza: new Date().toISOString().slice(0, 10),
        }).eq("id", r.id);
        if (error) { alert("Salvataggio non riuscito: " + error.message); return; }
        // cache esiti rinfrescata subito: il tracking ricalcola senza reload
        const { data: tutti } = await supabase.from("tracking_esiti").select("*").order("ordine");
        if (tutti && tutti.length) impostaEsitiTracking(tutti as never);
        await caricaEsiti();
        onSalvate();
    };

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
            // si scrivono SOLO le righe cambiate (revisore 25/08): riscrivere
            // tutte e 6 a ogni salvataggio pareggiava gli updated_at e ha
            // distrutto le prove dell'incidente — le righe intatte non si toccano
            const payload = CATEGORIE_UI.flatMap((c) => {
                const orig = righe.find((r) => r.categoria === c.id);
                const b = { ...bozza[c.id], categoria: c.id, malus_euro: Number(bozza[c.id]?.malus_euro) || 0 };
                const cambiata = !orig || CAMPI.some((k) => nrm(orig[k]) !== nrm(b[k]));
                return cambiata ? [{ ...b, decorrenza: oggiISO, updated_at: new Date().toISOString() }] : [];
            });
            if (!payload.length) { setMsg("Nessuna soglia cambiata: niente da salvare."); return; }
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

            {/* MALUS DEGLI ESITI AMMINISTRATIVI (Luca 25/08): «Non Conforme»
                & co. — € una tantum all'assegnazione + €/giorno finché la
                pratica non viene gestita dall'utente. Decorrenza automatica. */}
            {esitiAdm.length > 0 && (
                <div className="mt-5 overflow-x-auto rounded-xl border border-slate-700">
                    <table className="w-full text-sm" style={{ minWidth: 680 }}>
                        <thead>
                            <tr className="bg-slate-900 text-left">
                                <th className="py-2.5 px-3 text-[11px] uppercase tracking-wider text-slate-400">🔴 Malus degli esiti amministrativi<div className="normal-case font-normal text-[10px] text-slate-500 mt-0.5">una tantum all&apos;assegnazione + €/giorno (giorni aperti) finché la pratica non viene gestita</div></th>
                                <th className="py-2.5 px-3 text-[11px] uppercase tracking-wider text-slate-300" title="€ addebitati una volta sola appena l'esito viene assegnato">€ una tantum</th>
                                <th className="py-2.5 px-3 text-[11px] uppercase tracking-wider text-slate-300" title="€ per ogni giorno col negozio aperto finché la pratica non viene gestita">€ / giorno</th>
                                <th className="py-2.5 px-3 w-24"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {esitiAdm.map((r) => {
                                const cat = CATEGORIE_UI.find((c) => c.id === r.categoria);
                                const b = admBozza[r.id] || { fisso: "", giorno: "" };
                                const inVigore = (r.malus_fisso != null || r.malus_giorno != null) && r.malus_decorrenza;
                                return (
                                    <tr key={r.id} className="border-t border-white/10/60">
                                        <td className="py-2 px-3">
                                            <span className="font-bold" style={{ color: cat?.color || "var(--tf-94a3b8)" }}>{cat?.label || r.categoria}</span>
                                            <span className="text-slate-300 font-semibold ml-2">{r.etichetta}</span>
                                            {r.brand && <span className="text-[10px] text-slate-500 ml-1.5">({r.brand})</span>}
                                            {inVigore && <div className="text-[10px] text-slate-500 mt-0.5" title="I € valgono da questa data: un esito assegnato prima non paga la una tantum e il giornaliero conta solo i giorni successivi.">in vigore dal {String(r.malus_decorrenza).slice(0, 10).split("-").reverse().join("/")}</div>}
                                        </td>
                                        <td className="py-2 px-3">
                                            {admin ? (
                                                <span className="inline-flex items-center gap-1"><span className="text-slate-400">€</span>
                                                    <input value={b.fisso} onChange={(e) => setAdmBozza((p) => ({ ...p, [r.id]: { ...b, fisso: e.target.value } }))}
                                                        inputMode="numeric" placeholder="—"
                                                        className="w-16 text-center rounded-md bg-white/[0.05] border border-white/10 py-1 text-[13px] font-bold text-rose-300 focus:border-indigo-500 outline-none" />
                                                </span>
                                            ) : <span className="font-bold text-rose-300">{r.malus_fisso != null ? `€ ${r.malus_fisso}` : "—"}</span>}
                                        </td>
                                        <td className="py-2 px-3">
                                            {admin ? (
                                                <span className="inline-flex items-center gap-1"><span className="text-slate-400">€</span>
                                                    <input value={b.giorno} onChange={(e) => setAdmBozza((p) => ({ ...p, [r.id]: { ...b, giorno: e.target.value } }))}
                                                        inputMode="numeric" placeholder="—"
                                                        className="w-16 text-center rounded-md bg-white/[0.05] border border-white/10 py-1 text-[13px] font-bold text-rose-300 focus:border-indigo-500 outline-none" />
                                                </span>
                                            ) : <span className="font-bold text-rose-300">{r.malus_giorno != null ? `€ ${r.malus_giorno}` : "—"}</span>}
                                        </td>
                                        <td className="py-2 px-3 text-right">
                                            {admin && admDirty(r) && (
                                                <button onClick={() => salvaEsito(r)} className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[12px] font-bold">💾 Salva</button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
