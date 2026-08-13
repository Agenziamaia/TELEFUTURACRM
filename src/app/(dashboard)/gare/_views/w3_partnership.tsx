"use client";

/* PARTNERSHIP REWARD W3 — la gara Customer Base del franchising (lettera
   agosto slide 14-17 + colonne 38-47 del Target excel). I premi sono erogati
   sul punto vendita. Regola premio (confermata da Luca 13/08): raggiunto il
   100% del target → premio pieno; tra l'80% e il 99% → premio all'80%;
   sotto l'80% → niente.
   Modificatori che corrono sul premio Partnership:
     - assicurazioni (target RS concordato — Collatina in startup fuori gara):
       sotto la soglia di decurtazione −500 €/PDV, ai target 500/750 €/PDV
     - W3 Protetti: per PDV <1 → −500 € · ≥3 → +350 € (l'excel li dà anche
       a livello RS: <4 → −2000 · ≥12 → +1400)
     - Sos Caring (accelerazione ±ppt da report settimanale W3) e qualità
       polizze (riscontro a T6/T13): OGGI NON CALCOLABILI da noi → campo
       correzione manuale per PDV (extra.correzioni), finché non impariamo
       a leggere i report dell'azienda e li integriamo nel processo. */

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
    // correzioni manuali in bozza: id riga → { eur, nota } come testo
    const [draft, setDraft] = useState<Record<string, { eur: string; nota: string }>>({});

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
    useEffect(() => { setDraft({}); carica(); }, [monthISO]);   // eslint-disable-line react-hooks/exhaustive-deps

    const bozza = (r: PdvPr) => draft[r.id] ?? {
        eur: r.extra?.correzioni?.eur == null ? "" : String(r.extra.correzioni.eur),
        nota: r.extra?.correzioni?.nota ?? "",
    };
    const sporca = (r: PdvPr) => {
        const b = draft[r.id];
        if (!b) return false;
        const orig = bozzaSalvata(r);
        return b.eur !== orig.eur || b.nota !== orig.nota;
    };
    const bozzaSalvata = (r: PdvPr) => ({
        eur: r.extra?.correzioni?.eur == null ? "" : String(r.extra.correzioni.eur),
        nota: r.extra?.correzioni?.nota ?? "",
    });
    const salva = async (r: PdvPr) => {
        const b = bozza(r);
        const n = Number(String(b.eur).replace(",", "."));
        const correzioni = { eur: b.eur.trim() === "" ? null : (Number.isFinite(n) ? n : null), nota: b.nota.trim() };
        const extra = { ...(r.extra || {}), correzioni };
        const { error } = await supabase.from("pay_target_pdv").update({ extra }).eq("id", r.id);
        if (dbError("Salvataggio correzione Partnership", error)) return;
        notify(`Correzione di ${r.negozio} salvata ✓`, "ok");
        setDraft(prev => { const c = { ...prev }; delete c[r.id]; return c; });
        carica();
    };

    if (!pdv.length) return null;
    // i valori RS (assicurazioni, Protetti) sono identici su tutte le righe
    const rs = pdv[0].extra!;

    return (
        <div className="glass-panel rounded-2xl p-5" style={{ borderLeft: `4px solid ${colore}` }}>
            <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-3">
                🏅 Partnership Reward — la gara Customer Base: target a punti per punto vendita, premi erogati sul punto vendita
            </div>

            {/* Target e premi per PDV */}
            <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                    <thead>
                        <tr className="text-[10px] uppercase tracking-wider text-slate-500 bg-white/[0.04]">
                            <th className="text-left font-semibold px-3 py-1.5">Negozio</th>
                            <th className="px-2 py-1.5 font-semibold text-center">Target punti CB</th>
                            <th className="px-2 py-1.5 font-semibold text-center">80-99% del target</th>
                            <th className="px-2 py-1.5 font-semibold text-center">Target pieno</th>
                            <th className="px-2 py-1.5 font-semibold text-left">Correzione manuale (Sos Caring / qualità polizze)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pdv.map(r => {
                            const b = bozza(r);
                            return (
                                <tr key={r.id} className="border-t border-white/[0.04] hover:bg-white/[0.02]">
                                    <td className="px-3 py-1.5 font-semibold text-white whitespace-nowrap">🏬 {r.negozio}</td>
                                    <td className="px-2 py-1.5 text-center text-[15px] font-bold text-white tabular-nums">{r.extra?.pr?.target ?? "—"}</td>
                                    <td className="px-2 py-1.5 text-center text-slate-300 tabular-nums">{eur(r.extra?.pr?.premio80)}</td>
                                    <td className="px-2 py-1.5 text-center font-semibold text-emerald-200 tabular-nums">{eur(r.extra?.pr?.premio)}</td>
                                    <td className="px-2 py-1.5">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <input value={b.eur} placeholder="± €"
                                                onChange={e => setDraft(prev => ({ ...prev, [r.id]: { ...bozza(r), eur: e.target.value } }))}
                                                className="bg-white/[0.05] border border-white/10 rounded-lg px-1.5 py-1 text-xs text-white w-16 text-center tabular-nums" />
                                            <input value={b.nota} placeholder="nota (es. Sos Caring +20ppt)"
                                                onChange={e => setDraft(prev => ({ ...prev, [r.id]: { ...bozza(r), nota: e.target.value } }))}
                                                className="bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1 text-xs text-slate-200 w-52" />
                                            {sporca(r) && (
                                                <button onClick={() => salva(r)} className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold">💾</button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">
                Regola premio: al 100% del target → premio pieno · tra 80% e 99% → premio all&apos;80% · sotto l&apos;80% → nessun premio.
                La correzione manuale copre Sos Caring e qualità polizze finché non integriamo i report dell&apos;azienda.
            </p>

            {/* Eventi che fanno punti */}
            <button onClick={() => setEventiAperti(v => !v)} className="text-sm font-bold text-white flex items-center gap-2 mt-4 mb-1.5">
                🎯 Eventi Customer Base e punteggi <span className="text-xs font-normal text-slate-500">{eventiAperti ? "▾" : `▸ ${eventi.length} eventi`}</span>
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
                    <p className="text-[11px] text-slate-500 mt-1">Eventi CB Mobile Consumer con Cluster Card; escluse le offerte Caring Untied &amp; Easy Pay; Più Sicuri e Professional Cloud non contano per la Partnership.</p>
                </div>
            )}

            {/* Modificatori del premio */}
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                    <p className="text-xs font-bold text-white mb-1">🛡 W3 Protetti</p>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                        Per punto vendita: meno di 1 installato → <span className="text-rose-300 font-semibold">−500 €</span> sul premio Partnership · almeno 3 → <span className="text-emerald-300 font-semibold">+350 €</span>.
                        A livello Ragione Sociale (excel): sotto {rs.protetti?.rs_decurt_sotto ?? 4} → −{Number(rs.protetti?.rs_decurt_eur ?? 2000).toLocaleString("it-IT")} € · da {rs.protetti?.rs_premio_da ?? 12} → +{Number(rs.protetti?.rs_premio_eur ?? 1400).toLocaleString("it-IT")} €.
                    </p>
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                    <p className="text-xs font-bold text-white mb-1">📋 Assicurazioni (target di Ragione Sociale, concordato)</p>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                        Sotto {rs.ass_rs?.decurt_sotto ?? 30} polizze → <span className="text-rose-300 font-semibold">−500 €/PDV</span> sul premio Partnership ·
                        da {rs.ass_rs?.premio500_da ?? 45} → <span className="text-emerald-300 font-semibold">+500 €/PDV</span> ·
                        da {rs.ass_rs?.premio750_da ?? 60} → <span className="text-emerald-300 font-semibold">+750 €/PDV</span>.
                        Target concordato (Collatina in startup è fuori gara).
                    </p>
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                    <p className="text-xs font-bold text-white mb-1">🚑 Sos Caring (accelerazione del premio)</p>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                        % MNP out allarmate su GA+CB della Ragione Sociale: sotto 10% → +30ppt · 10-20% → +20ppt · 20-30% → +10ppt · da 30% → −500 €/PDV.
                        Si legge dal report settimanale W3: per ora si registra nella correzione manuale.
                    </p>
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                    <p className="text-xs font-bold text-white mb-1">⭐ Qualità polizze (T6 / T13)</p>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                        Polizze ancora attive: a T6 da 95% → +250 € · sotto 90% → −250 € · a T13 da 80% → +500 € · sotto 75% → −500 €.
                        Arriva col riscontro dell&apos;azienda: per ora si registra nella correzione manuale.
                    </p>
                </div>
            </div>
        </div>
    );
}
