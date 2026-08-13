"use client";

/* PARTNERSHIP REWARD W3 — la gara Customer Base del franchising (lettera
   agosto slide 14-17 + colonne 38-47 del Target excel). Premi erogati sul
   punto vendita. Regola premio (Luca 13/08): 100% del target → premio pieno;
   80-99% → premio all'80%; sotto l'80% → niente.
   RIDISEGNATO 14/08 (feedback Luca «confusionario»): regola in una riga,
   una sola colonna premio, correzione manuale nascosta dietro ✎, i
   modificatori in quattro righe secche. Sos Caring e qualità polizze non
   sono calcolabili da noi (report settimanale / riscontro T6-T13): si
   registrano nella correzione manuale finché non integriamo i report. */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { dbError, notify } from "../../amministrazione/_views/toast";

interface RigaEvento { id: string; nome: string; punti: number; ordine: number }
interface PdvPr {
    id: string; cod_gara: string; negozio: string;
    extra: {
        pr?: { target: number | null; premio80: number | null; premio: number | null };
        ass_rs?: { premio500_da: number | null; premio750_da: number | null; decurt_sotto: number | null };
        protetti?: { rs_decurt_sotto: number | null; rs_decurt_eur: number | null; rs_premio_da: number | null; rs_premio_eur: number | null };
        correzioni?: { eur: number | null; nota: string };
    } | null;
}

const eur = (v: number | null | undefined) =>
    v == null ? "—" : `${Number(v).toLocaleString("it-IT")} €`;

export function W3PartnershipPanel({ mese, colore }: { mese: string; colore: string }) {
    const monthISO = `${mese}-01`;
    const [pdv, setPdv] = useState<PdvPr[]>([]);
    const [eventi, setEventi] = useState<RigaEvento[]>([]);
    const [eventiAperti, setEventiAperti] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);   // riga con la correzione aperta
    const [draft, setDraft] = useState<{ eur: string; nota: string }>({ eur: "", nota: "" });

    const carica = async () => {
        const [t, e] = await Promise.all([
            supabase.from("pay_target_pdv").select("id, cod_gara, negozio, extra")
                .eq("brand", "windtre").eq("month", monthISO).order("negozio"),
            supabase.from("pay_righe").select("id, nome, punti, ordine")
                .eq("brand", "windtre").eq("month", monthISO).eq("lato", "azienda")
                .eq("pista", "partnership").eq("attivo", true).order("ordine"),
        ]);
        // solo il franchising: il cod_gara dei PDV è numerico (i multibrand usano MB-*)
        setPdv(((t.data ?? []) as PdvPr[]).filter(r => /^\d+$/.test(r.cod_gara) && r.extra?.pr));
        setEventi((e.data ?? []) as RigaEvento[]);
    };
    useEffect(() => { setEditId(null); carica(); }, [monthISO]);   // eslint-disable-line react-hooks/exhaustive-deps

    const apriEdit = (r: PdvPr) => {
        setEditId(r.id);
        setDraft({
            eur: r.extra?.correzioni?.eur == null ? "" : String(r.extra.correzioni.eur),
            nota: r.extra?.correzioni?.nota ?? "",
        });
    };
    const salva = async (r: PdvPr) => {
        const n = Number(String(draft.eur).replace(",", "."));
        const correzioni = { eur: draft.eur.trim() === "" ? null : (Number.isFinite(n) ? n : null), nota: draft.nota.trim() };
        const extra = { ...(r.extra || {}), correzioni };
        const { error } = await supabase.from("pay_target_pdv").update({ extra }).eq("id", r.id);
        if (dbError("Salvataggio correzione Partnership", error)) return;
        notify(`Correzione di ${r.negozio} salvata ✓`, "ok");
        setEditId(null);
        carica();
    };

    if (!pdv.length) return null;
    // i valori RS (assicurazioni, Protetti) sono identici su tutte le righe
    const rs = pdv[0].extra!;

    return (
        <div className="glass-panel rounded-2xl p-5" style={{ borderLeft: `4px solid ${colore}` }}>
            <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">
                🏅 Partnership Reward — la gara sulla gestione della Customer Base: ogni negozio ha un target di punti, il premio è suo
            </div>
            {/* LA regola, in una riga sola */}
            <div className="flex flex-wrap gap-1.5 mb-4 text-[11px]">
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-200 font-semibold">100% del target → premio pieno</span>
                <span className="px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-200 font-semibold">80-99% → premio all&apos;80%</span>
                <span className="px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/25 text-rose-200 font-semibold">sotto l&apos;80% → niente</span>
            </div>

            {/* Target e premi per negozio */}
            <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                    <thead>
                        <tr className="text-[10px] uppercase tracking-wider text-slate-500 bg-white/[0.04]">
                            <th className="text-left font-semibold px-3 py-1.5">Negozio</th>
                            <th className="px-2 py-1.5 font-semibold text-center">🎯 Target punti</th>
                            <th className="px-2 py-1.5 font-semibold text-center">🏆 Premio</th>
                            <th className="px-2 py-1.5 font-semibold text-center w-14">✎</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pdv.map(r => {
                            const corr = r.extra?.correzioni;
                            return (
                                <Rows key={r.id}>
                                    <tr className="border-t border-white/[0.04] hover:bg-white/[0.02]">
                                        <td className="px-3 py-2 font-semibold text-white whitespace-nowrap">
                                            🏬 {r.negozio}
                                            {corr?.eur != null && (
                                                <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-200"
                                                    title={corr.nota || "correzione manuale"}>
                                                    ✎ {corr.eur > 0 ? "+" : ""}{Number(corr.eur).toLocaleString("it-IT")} €
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-2 py-2 text-center text-[17px] font-black text-white tabular-nums">{r.extra?.pr?.target ?? "—"}</td>
                                        <td className="px-2 py-2 text-center">
                                            <span className="text-[15px] font-bold text-emerald-200 tabular-nums">{eur(r.extra?.pr?.premio)}</span>
                                            <span className="block text-[10px] text-slate-500">{eur(r.extra?.pr?.premio80)} tra 80% e 99%</span>
                                        </td>
                                        <td className="px-2 py-2 text-center">
                                            <button onClick={() => editId === r.id ? setEditId(null) : apriEdit(r)}
                                                title="Correzione manuale (Sos Caring, qualità polizze…)"
                                                className="text-slate-500 hover:text-white transition-colors">✎</button>
                                        </td>
                                    </tr>
                                    {editId === r.id && (
                                        <tr className="bg-white/[0.02]">
                                            <td colSpan={4} className="px-3 py-2">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-[11px] text-slate-400">Correzione premio {r.negozio}:</span>
                                                    <input value={draft.eur} placeholder="± €" autoFocus
                                                        onChange={e => setDraft(d => ({ ...d, eur: e.target.value }))}
                                                        className="bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1 text-xs text-white w-20 text-center tabular-nums" />
                                                    <input value={draft.nota} placeholder="nota (es. Sos Caring +20ppt dal report)"
                                                        onChange={e => setDraft(d => ({ ...d, nota: e.target.value }))}
                                                        className="bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1 text-xs text-slate-200 w-64" />
                                                    <button onClick={() => salva(r)} className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold">💾 Salva</button>
                                                    <button onClick={() => setEditId(null)} className="text-[11px] text-slate-500 hover:text-slate-300">annulla</button>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </Rows>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Cosa muove il premio: quattro righe, senza prosa */}
            <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-1.5">
                <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1">Cosa muove il premio</p>
                <p className="text-[12px] text-slate-300">🛡 <b>W3 Protetti</b> (per negozio): sotto 1 <span className="text-rose-300 font-semibold">−500 €</span> · da 3 <span className="text-emerald-300 font-semibold">+350 €</span></p>
                <p className="text-[12px] text-slate-300">📋 <b>Assicurazioni</b> (target di rete concordato, Collatina in startup fuori gara): sotto {rs.ass_rs?.decurt_sotto ?? 30} <span className="text-rose-300 font-semibold">−500 €/negozio</span> · da {rs.ass_rs?.premio500_da ?? 45} <span className="text-emerald-300 font-semibold">+500</span> · da {rs.ass_rs?.premio750_da ?? 60} <span className="text-emerald-300 font-semibold">+750 €/negozio</span></p>
                <p className="text-[12px] text-slate-300">🚑 <b>Sos Caring</b>: MNP out sotto 10% <span className="text-emerald-300 font-semibold">+30%</span> · sotto 20% <span className="text-emerald-300 font-semibold">+20%</span> · sotto 30% <span className="text-emerald-300 font-semibold">+10%</span> del premio · da 30% <span className="text-rose-300 font-semibold">−500 €/negozio</span> — <span className="text-slate-500">dal report settimanale W3, per ora con ✎</span></p>
                <p className="text-[12px] text-slate-300">⭐ <b>Qualità polizze</b>: T6 <span className="text-emerald-300 font-semibold">+250</span>/<span className="text-rose-300 font-semibold">−250</span> · T13 <span className="text-emerald-300 font-semibold">+500</span>/<span className="text-rose-300 font-semibold">−500 €</span> — <span className="text-slate-500">al riscontro dell&apos;azienda, per ora con ✎</span></p>
            </div>

            {/* Eventi che fanno punti */}
            <button onClick={() => setEventiAperti(v => !v)} className="text-sm font-bold text-white flex items-center gap-2 mt-4 mb-1.5">
                🎯 Quali eventi fanno punti <span className="text-xs font-normal text-slate-500">{eventiAperti ? "▾" : `▸ ${eventi.length} eventi`}</span>
            </button>
            {eventiAperti && (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr className="text-[10px] uppercase tracking-wider text-slate-500 bg-white/[0.04]">
                                <th className="text-left font-semibold px-3 py-1.5">Evento</th>
                                <th className="px-2 py-1.5 font-semibold text-center w-20">Punti</th>
                            </tr>
                        </thead>
                        <tbody>
                            {eventi.map(e => (
                                <tr key={e.id} className="border-t border-white/[0.04] hover:bg-white/[0.03]">
                                    <td className="px-3 py-1 text-slate-200">{e.nome}</td>
                                    <td className="px-2 py-1 text-center font-bold text-white tabular-nums">{Number(e.punti).toLocaleString("it-IT")}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <p className="text-[11px] text-slate-500 mt-1">Eventi Customer Base mobile consumer con Cluster Card; escluse le offerte Caring Untied &amp; Easy Pay; Più Sicuri e Professional Cloud non contano per la Partnership.</p>
                </div>
            )}
        </div>
    );
}

// wrapper senza markup per tenere insieme riga + riga di modifica nella tabella
function Rows({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
