"use client";

/* GARE W3 PER PUNTO VENDITA — lato azienda. TABELLA UNICA dei target
   (proposta Luca 14/08): Mobile e Fisso cambiano col negozio selezionato,
   sotto le tre righe di RETE (Business P.IVA, Luce&Gas, Assicurazioni)
   uguali per tutti — tutto in una griglia sola, soglie editabili sia lato
   negozio (pay_target_pdv, badge «modificata» vs lettera, ↺ ripristino)
   sia lato rete (pay_soglie, il fino-a si riallinea a catena da solo).
     🏪 Franchising    — gara sul singolo punto vendita (5 PDV dal Target)
     🏬 Multibrand     — gara unica a punti cumulati per Ragione Sociale */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { dbError, notify } from "../../amministrazione/_views/toast";
import { cn } from "@/utils";

interface TargetPdv {
    id: string; cod_gara: string; negozio: string;
    peso_mobile: number | null; peso_fix: number | null;
    cluster_mobile: string | null; soglie_mobile: number[] | null; soglie_mobile_lettera: number[] | null;
    cluster_fisso: string | null; soglie_fisso: number[] | null; soglie_fisso_lettera: number[] | null;
    extra?: { premi?: number[] } | null;
}
interface NegozioSeg { gara: string; store_name: string }
interface SogliaRete { id: string; pista: string; tier: number; soglia_da: number; bonus: number | null }

const SEGMENTI = [
    { id: "franchising", label: "🏪 Franchising", regola: "gara sul singolo punto vendita" },
    { id: "multibrand", label: "🏬 Multibrand", regola: "gara unica a punti cumulati, per Ragione Sociale" },
] as const;
const RS_MULTIBRAND = [
    { id: "MB-T1", label: "Telefutura", sub: "Donna Olimpia" },
    { id: "MB-T2", label: "Telefutura 2", sub: "Promontori + Garbatella" },
] as const;
// le tre gare di RETE nella tabella unica (ordine e etichette)
const RETE = [
    { pista: "business_piva", label: "💼 Business P.IVA", nota: "per Ragione Sociale" },
    { pista: "lucegas", label: "⚡ Luce & Gas", nota: "per Ragione Sociale" },
    { pista: "assicurazioni", label: "🛡 Assicurazioni", nota: "target concordato" },
] as const;

export function W3PdvPanel({ mese, colore, seg: segProp, onSeg }: { mese: string; colore: string; seg?: string; onSeg?: (s: string) => void }) {
    const monthISO = `${mese}-01`;
    const [targets, setTargets] = useState<TargetPdv[]>([]);
    const [negozi, setNegozi] = useState<NegozioSeg[]>([]);
    const [rete, setRete] = useState<SogliaRete[]>([]);
    const [segInterno, setSegInterno] = useState<string>("franchising");
    const seg = segProp ?? segInterno;
    const setSeg = (s: string) => { setSegInterno(s); onSeg?.(s); };
    const [pdvSel, setPdvSel] = useState<string>("");
    // modifiche manuali in corso: `${targetId}|${campo}|${idx}` → testo (negozio)
    const [draft, setDraft] = useState<Record<string, string>>({});
    // e `${pista}|${tier}` → testo (rete)
    const [draftRete, setDraftRete] = useState<Record<string, string>>({});

    // pay a pezzo della gara Business (25/35/45 alla soglia): EDITABILE qui —
    // vive nei pay_tiers di TUTTE le righe business_piva (la scala è unica),
    // il salvataggio la riscrive su ogni riga (Luca 14/08: la tabella target
    // è il riferimento per i KPI di rete, bonus e pay a pezzo compresi)
    const [bizRows, setBizRows] = useState<{ id: string; pay_tiers: number[] }[]>([]);
    const payPezzoBiz = bizRows[0]?.pay_tiers ?? [];
    const carica = async () => {
        const [t, n, s, bz] = await Promise.all([
            supabase.from("pay_target_pdv").select("id, cod_gara, negozio, peso_mobile, peso_fix, cluster_mobile, soglie_mobile, soglie_mobile_lettera, cluster_fisso, soglie_fisso, soglie_fisso_lettera, extra").eq("brand", "windtre").eq("month", monthISO).order("negozio"),
            supabase.from("gare_azienda_negozi").select("gara, store_name").eq("brand", "w3").eq("month", monthISO).order("store_name"),
            supabase.from("pay_soglie").select("id, pista, tier, soglia_da, bonus").eq("brand", "windtre").eq("month", monthISO).eq("lato", "azienda")
                .in("pista", ["business_piva", "lucegas", "assicurazioni"]).order("tier"),
            supabase.from("pay_righe").select("id, pay_tiers").eq("brand", "windtre").eq("month", monthISO).eq("lato", "azienda")
                .eq("pista", "business_piva").eq("attivo", true),
        ]);
        setTargets((t.data ?? []) as TargetPdv[]);
        setNegozi((n.data ?? []) as NegozioSeg[]);
        setRete(((s.data ?? []) as SogliaRete[]).map(x => ({ ...x, soglia_da: Number(x.soglia_da), bonus: x.bonus == null ? null : Number(x.bonus) })));
        setBizRows(((bz.data ?? []) as { id: string; pay_tiers: unknown }[]).map(x => ({ id: x.id, pay_tiers: Array.isArray(x.pay_tiers) ? (x.pay_tiers as unknown[]).map(Number) : [] })));
    };
    useEffect(() => { setDraft({}); setDraftRete({}); carica(); }, [monthISO]);   // eslint-disable-line react-hooks/exhaustive-deps

    const negozioDi = (s: string) => negozi.filter(n => n.gara === s).map(n => n.store_name);
    // il Target usa il nome secco ("Magliana"), lo schema quello con suffisso
    // ("Magliana W3"): il match corre sul prefisso comune
    const targetDi = (store: string): TargetPdv | undefined =>
        targets.find(t => store.toLowerCase().startsWith(t.negozio.toLowerCase()) || t.negozio.toLowerCase().startsWith(store.toLowerCase()));

    const stores = negozioDi(seg);
    useEffect(() => {
        if (stores.length && !stores.includes(pdvSel)) setPdvSel(stores[0]);
    }, [seg, negozi]);   // eslint-disable-line react-hooks/exhaustive-deps

    const [rsSel, setRsSel] = useState<string>("MB-T1");
    const target = seg === "franchising"
        ? (pdvSel ? targetDi(pdvSel) : undefined)
        : targets.find(t => t.cod_gara.startsWith(rsSel));
    const segInfo = SEGMENTI.find(s => s.id === seg);

    /* ---- celle del NEGOZIO (pay_target_pdv, come prima) ---- */
    const chiave = (tid: string, campo: string, i: number) => `${tid}|${campo}|${i}`;
    const valCella = (t: TargetPdv, campo: "mobile" | "fisso", i: number): string => {
        const d = draft[chiave(t.id, campo, i)];
        if (d != null) return d;
        const arr = campo === "mobile" ? t.soglie_mobile : t.soglie_fisso;
        return arr?.[i] == null ? "" : String(arr[i]);
    };
    const dirtyPdv = (t: TargetPdv) => Object.keys(draft).some(k => k.startsWith(t.id + "|"));
    const salvaPdv = async (t: TargetPdv) => {
        const nuovi = (campo: "mobile" | "fisso", arr: number[] | null) =>
            (arr || []).map((v, i) => {
                const d = draft[chiave(t.id, campo, i)];
                if (d == null) return Number(v);
                const n = Number(String(d).replace(",", "."));
                return Number.isFinite(n) ? n : Number(v);
            });
        const patch = { soglie_mobile: nuovi("mobile", t.soglie_mobile), soglie_fisso: nuovi("fisso", t.soglie_fisso) };
        const { error } = await supabase.from("pay_target_pdv").update(patch).eq("id", t.id);
        if (dbError("Salvataggio soglie PDV", error)) return;
        notify(`Soglie di ${t.negozio} salvate ✓`, "ok");
        setDraft(prev => { const c = { ...prev }; Object.keys(c).forEach(k => { if (k.startsWith(t.id + "|")) delete c[k]; }); return c; });
        carica();
    };
    const ripristina = async (t: TargetPdv) => {
        if (!window.confirm(`Le soglie di ${t.negozio} tornano a quelle originali della lettera?`)) return;
        const { error } = await supabase.from("pay_target_pdv")
            .update({ soglie_mobile: t.soglie_mobile_lettera, soglie_fisso: t.soglie_fisso_lettera }).eq("id", t.id);
        if (dbError("Ripristino soglie", error)) return;
        notify("Soglie riportate alla lettera ✓", "ok");
        setDraft(prev => { const c = { ...prev }; Object.keys(c).forEach(k => { if (k.startsWith(t.id + "|")) delete c[k]; }); return c; });
        carica();
    };

    /* ---- celle di RETE (pay_soglie): il fino-a si riallinea a catena ---- */
    const reteDi = (pista: string) => rete.filter(r => r.pista === pista).sort((a, b) => a.tier - b.tier);
    const valRete = (pista: string, tier: number): string => {
        const d = draftRete[`${pista}|${tier}`];
        if (d != null) return d;
        const r = rete.find(x => x.pista === pista && x.tier === tier);
        return r ? String(r.soglia_da) : "";
    };
    const dirtyRete = Object.keys(draftRete).length > 0;
    const num = (v: string, fallback: number | null) => {
        const n = Number(String(v).replace(",", "."));
        return Number.isFinite(n) ? n : fallback;
    };
    const salvaRete = async () => {
        // soglie: per ogni pista toccata, nuove soglia_da + fino-a a catena
        const pisteToccate = new Set(Object.keys(draftRete).filter(k => !k.startsWith("b|") && !k.startsWith("pz|")).map(k => k.split("|")[0]));
        for (const pista of pisteToccate) {
            const scala = reteDi(pista).map(r => {
                const d = draftRete[`${pista}|${r.tier}`];
                return { ...r, soglia_da: d == null ? r.soglia_da : (num(d, r.soglia_da) as number) };
            });
            for (let i = 0; i < scala.length; i++) {
                const soglia_a = i < scala.length - 1 ? scala[i + 1].soglia_da - 1 : null;
                const { error } = await supabase.from("pay_soglie")
                    .update({ soglia_da: scala[i].soglia_da, soglia_a }).eq("id", scala[i].id);
                if (dbError("Salvataggio target di rete", error)) return;
            }
        }
        // bonus (assicurazioni, valore GLOBALE di rete): chiavi b|pista|tier
        for (const k of Object.keys(draftRete).filter(x => x.startsWith("b|"))) {
            const [, pista, tier] = k.split("|");
            const r = rete.find(x => x.pista === pista && x.tier === Number(tier));
            if (!r) continue;
            const v = draftRete[k].trim();
            const { error } = await supabase.from("pay_soglie")
                .update({ bonus: v === "" ? null : num(v, r.bonus) }).eq("id", r.id);
            if (dbError("Salvataggio bonus", error)) return;
        }
        // pay a pezzo business: chiavi pz|tier — la scala è unica, si riscrive
        // il valore su TUTTE le righe business (il commissioning legge da lì)
        const pzKeys = Object.keys(draftRete).filter(x => x.startsWith("pz|"));
        if (pzKeys.length) {
            for (const row of bizRows) {
                const tiers = [...row.pay_tiers];
                for (const k of pzKeys) {
                    const i = Number(k.split("|")[1]);
                    const v = num(draftRete[k], tiers[i]);
                    if (v != null) tiers[i] = v;
                }
                const { error } = await supabase.from("pay_righe").update({ pay_tiers: tiers }).eq("id", row.id);
                if (dbError("Salvataggio pay a pezzo business", error)) return;
            }
        }
        notify("Target di rete salvati ✓", "ok");
        setDraftRete({});
        carica();
    };

    if (!negozi.length && !targets.length) return null;
    const maxT = 5;   // colonne della tabella unica (fisso e L&G arrivano a 5)
    const inputCls = (mod: boolean) => cn(
        "bg-white/[0.05] border rounded-lg px-1.5 py-1 text-[15px] font-bold text-white w-16 text-center tabular-nums",
        mod ? "border-amber-400/60" : "border-white/10");

    return (
        <div className="glass-panel rounded-2xl p-5" style={{ borderLeft: `4px solid ${colore}` }}>
            <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-3">
                🎯 Target del mese — Mobile e Fisso corrono sul negozio selezionato; Business, Luce &amp; Gas e Assicurazioni sono di rete, uguali per tutti
                {seg !== "franchising" && " (le gare di rete valgono solo per il franchising: sui multibrand non contano)"}
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
                {SEGMENTI.map(s => (
                    <button key={s.id} onClick={() => setSeg(s.id)}
                        title={s.regola}
                        className={cn("px-4 py-2 rounded-xl border text-sm font-bold transition-all",
                            seg === s.id ? "border-amber-400/70 bg-amber-500/15 text-white" : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/25")}>
                        {s.label}
                    </button>
                ))}
                {segInfo && <span className="text-[11px] text-slate-500 self-center">{segInfo.regola}</span>}
            </div>
            {seg === "franchising" && stores.length > 1 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                    {stores.map(n => (
                        <button key={n} onClick={() => setPdvSel(n)}
                            className={cn("px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all",
                                pdvSel === n ? "border-white/40 bg-white/10 text-white" : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-slate-200")}>
                            🏬 {n}
                        </button>
                    ))}
                </div>
            )}
            {seg === "multibrand" && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                    {RS_MULTIBRAND.map(rs => (
                        <button key={rs.id} onClick={() => setRsSel(rs.id)}
                            className={cn("px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all",
                                rsSel === rs.id ? "border-white/40 bg-white/10 text-white" : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-slate-200")}>
                            🏢 {rs.label} <span className="font-normal opacity-70">({rs.sub})</span>
                        </button>
                    ))}
                </div>
            )}
            {target && seg === "franchising" ? (
                <>
                    {/* TABELLA UNICA: negozio sopra, rete sotto */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr className="text-[10px] uppercase tracking-wider text-slate-500 bg-white/[0.04]">
                                    <th className="text-left font-semibold px-3 py-1.5 min-w-[210px]">Gara</th>
                                    {Array.from({ length: maxT }, (_, i) => <th key={i} className="px-1.5 py-1.5 font-semibold text-center w-24">S{i + 1}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {([
                                    { campo: "mobile" as const, label: "📱 Mobile", cluster: target.cluster_mobile, peso: target.peso_mobile, arr: target.soglie_mobile, lett: target.soglie_mobile_lettera },
                                    { campo: "fisso" as const, label: "🏠 Fisso", cluster: target.cluster_fisso, peso: target.peso_fix, arr: target.soglie_fisso, lett: target.soglie_fisso_lettera },
                                ]).map(riga => (
                                    <tr key={riga.campo} className="border-t border-white/5">
                                        <td className="px-3 py-2 whitespace-nowrap">
                                            <span className="font-semibold text-white">{riga.label}</span>
                                            <span className="text-[11px] text-slate-500"> · 🏬 {target.negozio}{riga.cluster ? ` · ${riga.cluster}` : ""}{riga.peso != null && riga.peso !== 1 ? ` · peso ${riga.peso}` : ""}</span>
                                        </td>
                                        {Array.from({ length: maxT }, (_, i) => {
                                            if (!riga.arr || riga.arr[i] == null) return <td key={i} className="px-1.5 py-2 text-center text-slate-700">—</td>;
                                            const orig = riga.lett?.[i];
                                            const attuale = draft[chiave(target.id, riga.campo, i)] ?? String(riga.arr[i]);
                                            const modificata = orig != null && Number(attuale) !== Number(orig);
                                            return (
                                                <td key={i} className="px-1.5 py-2 text-center align-top" title={orig != null && modificata ? `lettera: ${orig}` : undefined}>
                                                    <input value={valCella(target, riga.campo, i)}
                                                        onChange={e => setDraft(prev => ({ ...prev, [chiave(target.id, riga.campo, i)]: e.target.value }))}
                                                        className={inputCls(modificata)} />
                                                    {modificata && <div className="text-[9px] text-amber-300/90 mt-0.5">modificata</div>}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                                <tr className="bg-white/[0.03]">
                                    <td colSpan={1 + maxT} className="px-3 py-1.5 text-[10px] uppercase tracking-widest font-bold text-slate-400">
                                        🌐 Rete — uguali per tutti i negozi
                                    </td>
                                </tr>
                                {RETE.map(rt => {
                                    const scala = reteDi(rt.pista);
                                    if (!scala.length) return null;
                                    return (
                                        <tr key={rt.pista} className="border-t border-white/5">
                                            <td className="px-3 py-2 whitespace-nowrap">
                                                <span className="font-semibold text-white">{rt.label}</span>
                                                <span className="text-[11px] text-slate-500"> · {rt.nota}</span>
                                            </td>
                                            {Array.from({ length: maxT }, (_, i) => {
                                                const r = scala.find(x => x.tier === i + 1);
                                                if (!r) return <td key={i} className="px-1.5 py-2 text-center text-slate-700">—</td>;
                                                return (
                                                    <td key={i} className="px-1.5 py-2 text-center align-top">
                                                        <input value={valRete(rt.pista, r.tier)}
                                                            onChange={e => setDraftRete(prev => ({ ...prev, [`${rt.pista}|${r.tier}`]: e.target.value }))}
                                                            className={inputCls(draftRete[`${rt.pista}|${r.tier}`] != null)} />
                                                        {rt.pista === "assicurazioni" && (
                                                            <div className="mt-1 inline-flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-1.5 py-0.5"
                                                                title="Premio a volume complessivo di rete alla soglia (globale, non per negozio) — editabile">
                                                                <span className="text-[10px]">🎁</span>
                                                                <input value={draftRete[`b|${rt.pista}|${r.tier}`] ?? (r.bonus == null ? "" : String(r.bonus))}
                                                                    onChange={e => setDraftRete(prev => ({ ...prev, [`b|${rt.pista}|${r.tier}`]: e.target.value }))}
                                                                    className="bg-transparent text-[11px] font-semibold text-emerald-200 tabular-nums w-12 text-center outline-none" />
                                                                <span className="text-[10px] font-bold text-emerald-300/90">€</span>
                                                            </div>
                                                        )}
                                                        {rt.pista === "business_piva" && payPezzoBiz[i] != null && (
                                                            <div className="mt-1 inline-flex items-center gap-1 bg-sky-500/10 border border-sky-500/30 rounded-lg px-1.5 py-0.5"
                                                                title="Pay a pezzo alla soglia: ogni evento business paga questo importo (premio a evento, non un bonus) — editabile, il commissioning si aggiorna da solo">
                                                                <span className="text-[10px]">💶</span>
                                                                <input value={draftRete[`pz|${i}`] ?? String(payPezzoBiz[i])}
                                                                    onChange={e => setDraftRete(prev => ({ ...prev, [`pz|${i}`]: e.target.value }))}
                                                                    className="bg-transparent text-[11px] font-semibold text-sky-200 tabular-nums w-9 text-center outline-none" />
                                                                <span className="text-[10px] font-bold text-sky-300/90">€/pezzo</span>
                                                            </div>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                        {dirtyPdv(target) && (
                            <button onClick={() => salvaPdv(target)} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold">💾 Salva soglie {target.negozio}</button>
                        )}
                        {dirtyRete && (
                            <button onClick={salvaRete} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold">💾 Salva target di rete</button>
                        )}
                        <button onClick={() => ripristina(target)} className="text-[11px] text-slate-500 hover:text-slate-300" title="Le soglie del negozio tornano a quelle originali della lettera/Target">↺ negozio come da lettera</button>
                    </div>
                </>
            ) : target && seg === "multibrand" ? (
                /* MULTIBRAND: gara unica a punti cumulati — una riga */
                (() => {
                    const arr = target.soglie_mobile;
                    if (!arr?.length) return null;
                    const premi = target.extra?.premi || [];
                    return (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm border-collapse">
                                <thead>
                                    <tr className="text-[10px] uppercase tracking-wider text-slate-500 bg-white/[0.04]">
                                        <th className="text-left font-semibold px-3 py-1.5">Gara</th>
                                        {arr.map((_, i) => <th key={i} className="px-1.5 py-1.5 font-semibold text-center w-24">S{i + 1}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="border-t border-white/5">
                                        <td className="px-3 py-1.5 font-semibold text-white whitespace-nowrap">🏆 Punti cumulati <span className="text-slate-500 font-normal text-xs">(mobile → assicurazioni)</span></td>
                                        {arr.map((v, i) => {
                                            const orig = target.soglie_mobile_lettera?.[i];
                                            const attuale = draft[chiave(target.id, "mobile", i)] ?? String(v);
                                            const modificata = orig != null && Number(attuale) !== Number(orig);
                                            return (
                                                <td key={i} className="px-1.5 py-2 text-center align-top" title={orig != null && modificata ? `lettera: ${orig}` : undefined}>
                                                    <input value={valCella(target, "mobile", i)}
                                                        onChange={e => setDraft(prev => ({ ...prev, [chiave(target.id, "mobile", i)]: e.target.value }))}
                                                        className={inputCls(modificata)} />
                                                    {modificata && <div className="text-[9px] text-amber-300/90 mt-0.5">modificata</div>}
                                                    {premi[i] != null && (
                                                        <div className="mt-1 inline-flex items-center gap-0.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-1.5 py-0.5"
                                                            title={`Premio alla soglia: ${Number(premi[i]).toLocaleString("it-IT")} €`}>
                                                            <span className="text-[10px]">🎁</span>
                                                            <span className="text-[11px] font-semibold text-emerald-200 tabular-nums">{Number(premi[i]).toLocaleString("it-IT")}</span>
                                                            <span className="text-[10px] font-bold text-emerald-300/90">€</span>
                                                        </div>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                </tbody>
                            </table>
                            <p className="text-[11px] text-slate-500 mt-1.5">Punti: GA mobile 1 · TIED 1 · MNP 1 · Fisso 3 · P.IVA 2 · Luce&amp;Gas 2 · CB 1 (lettera multibrand). {rsSel === "MB-T2" ? "Telefutura 2 ha 2 negozi: 1° al 100% + 2° scontato del 15% (lettera multipos) = target ×1,85." : ""}</p>
                            <div className="flex items-center gap-3 mt-2">
                                {dirtyPdv(target) && (
                                    <button onClick={() => salvaPdv(target)} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold">💾 Salva soglie {target.negozio}</button>
                                )}
                                <button onClick={() => ripristina(target)} className="text-[11px] text-slate-500 hover:text-slate-300" title="Torna alle soglie originali della lettera">↺ come da lettera</button>
                            </div>
                        </div>
                    );
                })()
            ) : (
                <div className="text-sm text-slate-500">Nessun target per questo punto vendita nel mese: importa il foglio Target Wind3.</div>
            )}
            <p className="text-[11px] text-slate-500 mt-3">Soglie da lettera/Target ({target?.cod_gara || "—"}), ritoccabili: la cella del negozio che si discosta dall&apos;originale mostra «modificata». Il pay per attivazione sta nella scheda 💶 Commissioning €.</p>
        </div>
    );
}
