"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/utils";
import { Loader2, Plus, Trash2, Copy, Flag, Users } from "lucide-react";
import { notify, dbError } from "../../amministrazione/_views/toast";
import { MoneyInput } from "../../amministrazione/_views/money";
import { addMonths, monthLabel } from "../../amministrazione/_views/months";
import { type SogliaRag, type PayRag, REWARD_TIPI_RAG, UM_SOGLIA, eur } from "./shared";

/* Tab RAGAZZI: la gara interna semplificata (soglie di gruppo + pay a tabella retroattivo
   oppure moltiplicatore). Questo layout diventerà la vista dei ragazzi col login. */

export function RagazziTab({ garaId, month, nota }: { garaId: string; month: string; nota?: string }) {
    const [soglie, setSoglie] = useState<SogliaRag[]>([]);
    const [pay, setPay] = useState<PayRag[]>([]);
    const [loading, setLoading] = useState(true);
    const [prevHas, setPrevHas] = useState(false);
    const [copying, setCopying] = useState(false);
    const [confirmDel, setConfirmDel] = useState<string | null>(null);
    const prevMonth = addMonths(month, -1);

    const load = useCallback(async () => {
        setLoading(true);
        const [s, p, ps] = await Promise.all([
            supabase.from("gare_ragazzi_soglie").select("id,tier,nome,soglia_valore,soglia_um,reward_tipo,reward_valore,reward_um,reward_descr,descrizione,premio_note").eq("brand", garaId).eq("month", month).order("tier"),
            supabase.from("gare_ragazzi_pay").select("id,attivazione,importo,retroattivo,tier_min,note").eq("brand", garaId).eq("month", month).order("sort_order").order("created_at"),
            supabase.from("gare_ragazzi_soglie").select("id").eq("brand", garaId).eq("month", prevMonth).limit(1),
        ]);
        if (!dbError("Caricamento gara ragazzi", s.error)) setSoglie((s.data as SogliaRag[]) || []);
        setPay((p.data as PayRag[]) || []);
        setPrevHas(((ps.data as { id: string }[]) || []).length > 0);
        setLoading(false);
    }, [garaId, month, prevMonth]);
    useEffect(() => {
        load();
    }, [load]);

    const copyPrev = async () => {
        if (copying) return;
        setCopying(true);
        const { data, error } = await supabase.rpc("gare_copy_month", { p_brand: garaId, p_from: prevMonth, p_to: month, p_livello: "ragazzi" });
        if (!dbError("Copia mese precedente", error)) {
            notify(`Gara ragazzi copiata da ${monthLabel(prevMonth)} ✓ (${JSON.stringify(data)})`, "ok");
            load();
        }
        setCopying(false);
    };

    /* soglie */
    const updS = (id: string, patch: Partial<SogliaRag>) => setSoglie((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const saveS = async (r: SogliaRag) => {
        const { error } = await supabase.from("gare_ragazzi_soglie").update({
            tier: r.tier, nome: r.nome, soglia_valore: r.soglia_valore, soglia_um: r.soglia_um,
            reward_tipo: r.reward_tipo, reward_valore: r.reward_valore, reward_um: r.reward_um,
            reward_descr: r.reward_descr, descrizione: r.descrizione, premio_note: r.premio_note,
        }).eq("id", r.id);
        dbError("Salvataggio soglia", error);
    };
    const addSoglia = async () => {
        const tier = (soglie[soglie.length - 1]?.tier || 0) + 1;
        const { error } = await supabase.from("gare_ragazzi_soglie").insert({
            brand: garaId, month, tier, nome: tier === 1 ? "Soglia di squadra" : `Soglia ${tier}`,
            soglia_valore: 0, soglia_um: "punti", reward_tipo: "pay_tabella",
        });
        if (!dbError("Creazione soglia", error)) load();
    };
    const delSoglia = async (id: string) => {
        const { error } = await supabase.from("gare_ragazzi_soglie").delete().eq("id", id);
        if (!dbError("Eliminazione soglia", error)) load();
        setConfirmDel(null);
    };

    /* pay */
    const updP = (id: string, patch: Partial<PayRag>) => setPay((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const saveP = async (r: PayRag) => {
        const { error } = await supabase.from("gare_ragazzi_pay").update({
            attivazione: r.attivazione, importo: r.importo, retroattivo: r.retroattivo, tier_min: r.tier_min, note: r.note,
        }).eq("id", r.id);
        dbError("Salvataggio pay", error);
    };
    const [nAtt, setNAtt] = useState("");
    const [nImp, setNImp] = useState<number | null>(null);
    const addPay = async () => {
        if (!nAtt.trim()) {
            notify("Indica il tipo di attivazione (es. SIM MNP, Fisso, Luce & Gas)");
            return;
        }
        const { error } = await supabase.from("gare_ragazzi_pay").insert({ brand: garaId, month, attivazione: nAtt.trim(), importo: nImp ?? 0, sort_order: pay.length });
        if (!dbError("Creazione pay", error)) {
            setNAtt("");
            setNImp(null);
            load();
        }
    };
    const delPay = async (id: string) => {
        const { error } = await supabase.from("gare_ragazzi_pay").delete().eq("id", id);
        if (!dbError("Eliminazione pay", error)) load();
        setConfirmDel(null);
    };

    if (loading)
        return (
            <div className="flex justify-center py-16 text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin" />
            </div>
        );

    const hasPayTable = soglie.some((s) => s.reward_tipo === "pay_tabella");

    return (
        <div className="space-y-4">
            {nota && (
                <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-indigo-400" /> {nota}
                </p>
            )}

            {!soglie.length && !pay.length && prevHas && (
                <div className="glass-panel p-5 text-center space-y-3">
                    <p className="text-sm text-slate-400">Gara ragazzi non ancora impostata per {monthLabel(month)}.</p>
                    <button onClick={copyPrev} disabled={copying} className={cn("primary-btn flex items-center gap-2 mx-auto", copying && "opacity-40")}>
                        {copying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                        Copia da {monthLabel(prevMonth)}
                    </button>
                </div>
            )}

            {/* Soglie di gruppo */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                        <Flag className="w-3.5 h-3.5 text-emerald-400" /> Soglie di gruppo
                    </h4>
                    <button onClick={addSoglia} className="text-xs text-indigo-300 hover:text-indigo-200 flex items-center gap-1">
                        <Plus className="w-3.5 h-3.5" /> soglia
                    </button>
                </div>
                {soglie.map((s) => (
                    <div key={s.id} className="glass-card p-3 rounded-xl space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">tier {s.tier}</span>
                            <input value={s.nome} onChange={(e) => updS(s.id, { nome: e.target.value })} onBlur={() => saveS(s)} className="glass-input flex-1 min-w-[140px] py-1 text-sm font-medium" />
                            <input type="number" step="1" value={s.soglia_valore ?? ""} onChange={(e) => updS(s.id, { soglia_valore: e.target.value ? Number(e.target.value) : 0 })} onBlur={() => saveS(s)} className="glass-input w-24 py-1 text-sm text-center" title="Soglia di gruppo" />
                            <select value={s.soglia_um} onChange={(e) => { updS(s.id, { soglia_um: e.target.value }); saveS({ ...s, soglia_um: e.target.value }); }} className="glass-input w-auto py-1 text-xs">
                                {UM_SOGLIA.map((u) => <option key={u} value={u}>{u}</option>)}
                            </select>
                            <select value={s.reward_tipo} onChange={(e) => { updS(s.id, { reward_tipo: e.target.value }); saveS({ ...s, reward_tipo: e.target.value }); }} className="glass-input w-auto py-1 text-xs" title="Cosa scatta al raggiungimento">
                                {REWARD_TIPI_RAG.map((t) => <option key={t} value={t}>{t === "pay_tabella" ? "pay a tabella" : t}</option>)}
                            </select>
                            {s.reward_tipo !== "pay_tabella" && (
                                <input type="number" step="0.01" value={s.reward_valore ?? ""} onChange={(e) => updS(s.id, { reward_valore: e.target.value ? Number(e.target.value) : null })} onBlur={() => saveS(s)} placeholder={s.reward_tipo === "moltiplicatore" ? "x" : "€"} className="glass-input w-20 py-1 text-sm text-center" />
                            )}
                            {confirmDel === s.id ? (
                                <span className="flex items-center gap-1">
                                    <button onClick={() => delSoglia(s.id)} className="text-[10px] px-2 py-1 rounded bg-rose-500/20 text-rose-300">Elimina</button>
                                    <button onClick={() => setConfirmDel(null)} className="text-[10px] text-slate-500 px-1">Annulla</button>
                                </span>
                            ) : (
                                <button onClick={() => setConfirmDel(s.id)} className="text-slate-500 hover:text-rose-400 p-1"><Trash2 className="w-4 h-4" /></button>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <input value={s.descrizione ?? ""} onChange={(e) => updS(s.id, { descrizione: e.target.value || null })} onBlur={() => saveS(s)} placeholder="come si conteggia, in parole semplici (visibile ai ragazzi)…" className="glass-input flex-1 min-w-[200px] py-1 text-xs text-slate-400" />
                            <input value={s.reward_descr ?? ""} onChange={(e) => updS(s.id, { reward_descr: e.target.value || null })} onBlur={() => saveS(s)} placeholder="descrizione premio (es. moltiplicatore del canone)…" className="glass-input flex-1 min-w-[160px] py-1 text-xs text-slate-400" />
                            <input value={s.premio_note ?? ""} onChange={(e) => updS(s.id, { premio_note: e.target.value || null })} onBlur={() => saveS(s)} placeholder="extra (es. cena squadra)…" className="glass-input w-44 py-1 text-xs text-slate-400" />
                        </div>
                    </div>
                ))}
                {!soglie.length && <p className="text-xs text-slate-600 px-1">Nessuna soglia. Aggiungine una: è il cuore della gara ragazzi.</p>}
            </div>

            {/* Tabella pay */}
            {hasPayTable && (
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tabella pay per attivazione</h4>
                        <span className="text-[11px] text-slate-500">
                            {pay.length} voci · potenziale {eur(pay.reduce((a, r) => a + Number(r.importo || 0), 0))} / pezzo mix
                        </span>
                    </div>
                    <div className="space-y-1.5">
                        {pay.map((r) => (
                            <div key={r.id} className="glass-card p-2.5 rounded-lg flex flex-wrap items-center gap-2">
                                <input value={r.attivazione} onChange={(e) => updP(r.id, { attivazione: e.target.value })} onBlur={() => saveP(r)} className="glass-input flex-1 min-w-[140px] py-1 text-sm" />
                                <MoneyInput value={r.importo} onChange={(v) => updP(r.id, { importo: v ?? 0 })} onCommit={() => saveP(r)} wrapClass="w-28" className="py-1 text-sm" />
                                <button
                                    onClick={() => { updP(r.id, { retroattivo: !r.retroattivo }); saveP({ ...r, retroattivo: !r.retroattivo }); }}
                                    className={cn("text-[10px] px-2 py-1 rounded-full border", r.retroattivo ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/20" : "text-slate-500 border-white/10")}
                                    title="Retroattivo: si paga su tutte le attivazioni dal 1° pezzo"
                                >
                                    retroattivo
                                </button>
                                {soglie.length > 1 && (
                                    <select value={r.tier_min} onChange={(e) => { updP(r.id, { tier_min: Number(e.target.value) }); saveP({ ...r, tier_min: Number(e.target.value) }); }} className="glass-input w-auto py-1 text-xs" title="Vale dal tier">
                                        {soglie.map((s) => <option key={s.tier} value={s.tier}>dal tier {s.tier}</option>)}
                                    </select>
                                )}
                                <input value={r.note ?? ""} onChange={(e) => updP(r.id, { note: e.target.value || null })} onBlur={() => saveP(r)} placeholder="note…" className="glass-input flex-1 min-w-[100px] py-1 text-xs text-slate-400" />
                                {confirmDel === r.id ? (
                                    <span className="flex items-center gap-1">
                                        <button onClick={() => delPay(r.id)} className="text-[10px] px-2 py-1 rounded bg-rose-500/20 text-rose-300">Elimina</button>
                                        <button onClick={() => setConfirmDel(null)} className="text-[10px] text-slate-500 px-1">Annulla</button>
                                    </span>
                                ) : (
                                    <button onClick={() => setConfirmDel(r.id)} className="text-slate-500 hover:text-rose-400 p-1"><Trash2 className="w-4 h-4" /></button>
                                )}
                            </div>
                        ))}
                    </div>
                    <div className="glass-card p-2.5 rounded-lg flex flex-wrap items-center gap-2">
                        <input value={nAtt} onChange={(e) => setNAtt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addPay()} placeholder="Nuova attivazione (es. SIM MNP, Fisso FTTH, Luce & Gas)" className="glass-input flex-1 min-w-[180px] py-1.5 text-sm" />
                        <MoneyInput value={nImp} onChange={setNImp} wrapClass="w-28" className="py-1.5 text-sm" placeholder="€" />
                        <button onClick={addPay} className="primary-btn text-sm px-3 py-1.5">Aggiungi</button>
                    </div>
                    <p className="text-[11px] text-slate-600">
                        Raggiunta la soglia di squadra: € a tabella per OGNI attivazione del mese, dal primo pezzo.
                    </p>
                </div>
            )}
        </div>
    );
}
