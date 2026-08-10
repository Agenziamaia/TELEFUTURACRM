"use client";

// CALCOLATORE $$$ (cantiere GARE 10/08, richiesta Luca) — un "registra
// vendita riassunto": pochi click (brand → offerta dal CATALOGO vero) e ti
// dice il commissioning di quella vendita alla soglia scelta. La soglia è
// preselezionata su quella LIVE di rete del mese (motore pay tabellare).
// Le offerte SENZA riga di commissioning sono evidenziate (scoperture):
// per regola non generano pay — quando si tocca il catalogo va aggiunta
// anche la riga di commissioning.
import { useEffect, useMemo, useState } from "react";
import { Calculator, ChevronDown, Loader2, TriangleAlert } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import {
    Avanzamento, PayRiga, Tabellare,
    calcolaAvanzamento, caricaContrattiMese, caricaTabellare, matchRigaTabellare, payPerRiga,
} from "@/lib/commissioning";

type Cat = { id: string; nome: string; ordine: number };
type Prod = { id: string; categoria_id: string; tipo_cliente: string; nome: string; ordine: number; attivo: boolean | null };
type Off = { id: string; prodotto_id: string; nome: string; ordine: number; attivo: boolean | null };

const BRANDS: { id: string; label: string; logo: string; color: string; zoom: number; prefix: string }[] = [
    { id: "windtre", label: "WindTre", logo: "/windtre.png", color: "#FF6B00", zoom: 2.0, prefix: "WindTre" },
    { id: "vodafone", label: "Vodafone", logo: "/vodaphone - Copy.png", color: "#E60000", zoom: 1.7, prefix: "Vodafone" },
    { id: "fastweb", label: "Fastweb", logo: "/fastweb.png", color: "#CC9900", zoom: 1.9, prefix: "Fastweb" },
    { id: "sky", label: "Sky", logo: "/sky.png", color: "#0072C6", zoom: 1.35, prefix: "Sky" },
    { id: "tim", label: "TIM", logo: "/tim-logo-v2.png", color: "#0050FF", zoom: 2.2, prefix: "TIM" },
    { id: "iliad", label: "Iliad", logo: "/iliad.png", color: "#C00028", zoom: 1.14, prefix: "Iliad" },
    { id: "very", label: "Very", logo: "/very-mobile.png", color: "#1FA300", zoom: 1.14, prefix: "Very" },
    { id: "ho", label: "Ho.", logo: "/ho-mobile.png", color: "#E6007E", zoom: 1.14, prefix: "Ho" },
    { id: "kena", label: "Kena", logo: "/kena-mobile-v2.png", color: "#F5A623", zoom: 2.2, prefix: "Kena" },
    { id: "s4", label: "S4", logo: "/energy - Copy.png", color: "#28A745", zoom: 1, prefix: "S4" },
];

const meseCorrente = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const euro = (v: number | null | undefined) =>
    v == null ? "—" : v.toLocaleString("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 2 });

export default function CalcolatorePage() {
    const [mese, setMese] = useState(meseCorrente());          // "YYYY-MM"
    const monthISO = `${mese}-01`;
    const [brand, setBrand] = useState<string | null>(null);
    const meta = BRANDS.find(b => b.id === brand) || null;

    // catalogo del brand
    const [cats, setCats] = useState<Cat[]>([]);
    const [prods, setProds] = useState<Prod[]>([]);
    const [offs, setOffs] = useState<Off[]>([]);
    const [caricaCat, setCaricaCat] = useState(false);

    // tabellare + avanzamento live
    const [tab, setTab] = useState<Tabellare | null>(null);
    const [avz, setAvz] = useState<Avanzamento | null>(null);
    const [caricaTab, setCaricaTab] = useState(false);

    // selezione
    const [tipoCli, setTipoCli] = useState<string | null>(null);
    const [catId, setCatId] = useState<string | null>(null);
    const [prodId, setProdId] = useState<string | null>(null);
    const [offId, setOffId] = useState<string | null>(null);
    const [tierSel, setTierSel] = useState<number | null>(null);   // null = non ancora toccata (usa live)
    const [mostraScoperte, setMostraScoperte] = useState(false);

    useEffect(() => {
        if (!brand) return;
        let vivo = true;
        setCaricaCat(true); setTab(null); setAvz(null);
        setTipoCli(null); setCatId(null); setProdId(null); setOffId(null); setTierSel(null);
        (async () => {
            const [cRes, pRes] = await Promise.all([
                supabase.from("catalog_categorie").select("id, nome, ordine").order("ordine").limit(500),
                supabase.from("catalog_prodotti").select("id, categoria_id, tipo_cliente, nome, ordine, attivo").eq("brand_id", brand).order("ordine").limit(500),
            ]);
            const prodotti = ((pRes.data || []) as Prod[]).filter(p => p.attivo !== false);
            const ids = prodotti.map(p => p.id);
            const oRes = ids.length
                ? await supabase.from("catalog_offerte").select("id, prodotto_id, nome, ordine, attivo").in("prodotto_id", ids).order("ordine").limit(2000)
                : { data: [] as Off[] };
            if (!vivo) return;
            setCats((cRes.data || []) as Cat[]);
            setProds(prodotti);
            setOffs(((oRes.data || []) as Off[]).filter(o => o.attivo !== false));
            setCaricaCat(false);
        })();
        (async () => {
            setCaricaTab(true);
            const t = await caricaTabellare(brand, monthISO);
            if (!vivo) return;
            setTab(t);
            if (t) {
                const bm = BRANDS.find(b => b.id === brand);
                const contratti = await caricaContrattiMese(bm?.prefix || brand, monthISO);
                if (!vivo) return;
                setAvz(calcolaAvanzamento(t, contratti));
            }
            setCaricaTab(false);
        })();
        return () => { vivo = false; };
    }, [brand, monthISO]);

    // albero derivato
    const tipiCliente = useMemo(() => [...new Set(prods.map(p => p.tipo_cliente).filter(Boolean))], [prods]);
    const prodsTipo = useMemo(() => prods.filter(p => !tipoCli || p.tipo_cliente === tipoCli), [prods, tipoCli]);
    const catsVisibili = useMemo(() => {
        const conProd = new Set(prodsTipo.map(p => p.categoria_id));
        return cats.filter(c => conProd.has(c.id));
    }, [cats, prodsTipo]);
    const prodsCat = useMemo(() => prodsTipo.filter(p => p.categoria_id === catId), [prodsTipo, catId]);
    const offsProd = useMemo(() => offs.filter(o => o.prodotto_id === prodId), [offs, prodId]);

    const catSel = cats.find(c => c.id === catId) || null;
    const prodSel = prods.find(p => p.id === prodId) || null;
    const offSel = offs.find(o => o.id === offId) || null;

    // risoluzione riga pay
    const riga: PayRiga | null = useMemo(() => {
        if (!tab || !offSel || !prodSel || !catSel) return null;
        return matchRigaTabellare(tab.righe, {
            tipo_cliente: prodSel.tipo_cliente, categoria: catSel.nome, prodotto: prodSel.nome, offerta: offSel.nome,
        });
    }, [tab, offSel, prodSel, catSel]);

    const scalaRiga = useMemo(() =>
        (tab && riga?.pista) ? tab.soglie.filter(s => s.pista === riga.pista).sort((a, b) => a.tier - b.tier) : [],
    [tab, riga]);
    const tierLive = riga?.pista && avz ? (avz.piste[riga.pista]?.tier ?? 0) : 0;
    const tier = tierSel == null ? tierLive : tierSel;
    const pay = riga ? payPerRiga(riga, riga.gettone ? 0 : tier) : null;

    // scoperture: offerte del catalogo senza riga pay
    const scoperte = useMemo(() => {
        if (!tab) return [];
        const out: { tipo: string; cat: string; prod: string; off: string }[] = [];
        for (const o of offs) {
            const p = prods.find(x => x.id === o.prodotto_id); if (!p) continue;
            const c = cats.find(x => x.id === p.categoria_id); if (!c) continue;
            const r = matchRigaTabellare(tab.righe, { tipo_cliente: p.tipo_cliente, categoria: c.nome, prodotto: p.nome, offerta: o.nome });
            if (!r) out.push({ tipo: p.tipo_cliente, cat: c.nome, prod: p.nome, off: o.nome });
        }
        return out;
    }, [tab, offs, prods, cats]);

    const Pill = ({ on, children, onClick, colore }: { on: boolean; children: React.ReactNode; onClick: () => void; colore?: string }) => (
        <button onClick={onClick}
            className={`px-4 py-2 rounded-xl text-sm font-semibold border transition ${on ? "text-white" : "text-slate-300 border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"}`}
            style={on ? { background: colore || meta?.color || "#6366f1", borderColor: "transparent" } : undefined}>
            {children}
        </button>
    );

    return (
        <div className="p-6 max-w-[1500px]">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
                <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Calculator size={26} /> Calcolatore $$$</h1>
                <input type="month" value={mese} onChange={e => { setMese(e.target.value); setTierSel(null); }}
                    className="bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2 text-sm text-white" />
            </div>

            {/* ① BRAND a soli loghi */}
            <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
                {BRANDS.map(b => {
                    const on = brand === b.id;
                    return (
                        <button key={b.id} onClick={() => setBrand(b.id)}
                            className="glass-panel rounded-2xl flex items-center justify-center transition overflow-hidden"
                            style={{ height: 76, border: on ? `2px solid ${b.color}` : "1px solid rgba(255,255,255,0.08)", opacity: brand && !on ? 0.55 : 1 }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={b.logo} alt={b.label}
                                style={{ height: 60, width: "auto", maxWidth: "94%", objectFit: "contain", transform: b.zoom === 1 ? "none" : `scale(${b.zoom})`, transformOrigin: "center" }} />
                        </button>
                    );
                })}
            </div>

            {brand && (caricaCat || caricaTab) && (
                <div className="flex items-center gap-2 text-slate-400 text-sm mb-4"><Loader2 className="animate-spin" size={16} /> Carico catalogo e tabellare…</div>
            )}

            {brand && !caricaTab && !tab && (
                <div className="glass-panel rounded-2xl p-4 mb-5 border border-amber-500/40 text-amber-200 text-sm flex items-center gap-2">
                    <TriangleAlert size={18} /> Nessun tabellare caricato per {meta?.label} · {mese}: il pay non è calcolabile finché non si caricano piste, soglie e righe.
                </div>
            )}

            <div className="grid gap-5" style={{ gridTemplateColumns: "minmax(0,1fr) 360px" }}>
                <div className="min-w-0">
                    {/* ② TIPO CLIENTE + CATEGORIA + PRODOTTO + OFFERTA */}
                    {brand && !caricaCat && (
                        <div className="glass-panel rounded-2xl p-5 mb-5">
                            <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">Tipo cliente</div>
                            <div className="flex gap-2 flex-wrap mb-4">
                                {tipiCliente.map(t => (
                                    <Pill key={t} on={tipoCli === t} onClick={() => { setTipoCli(t); setCatId(null); setProdId(null); setOffId(null); setTierSel(null); }}>
                                        {t === "Business" ? "🏢 Business" : "👤 Consumer"}
                                    </Pill>
                                ))}
                            </div>
                            {tipoCli && <>
                                <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">Categoria</div>
                                <div className="flex gap-2 flex-wrap mb-4">
                                    {catsVisibili.map(c => (
                                        <Pill key={c.id} on={catId === c.id} onClick={() => { setCatId(c.id); setProdId(null); setOffId(null); setTierSel(null); }}>{c.nome}</Pill>
                                    ))}
                                </div>
                            </>}
                            {catId && <>
                                <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">Prodotto</div>
                                <div className="flex gap-2 flex-wrap mb-4">
                                    {prodsCat.map(p => (
                                        <Pill key={p.id} on={prodId === p.id} onClick={() => { setProdId(p.id); setOffId(null); setTierSel(null); }}>{p.nome}</Pill>
                                    ))}
                                </div>
                            </>}
                            {prodId && <>
                                <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">Offerta</div>
                                <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }}>
                                    {offsProd.map(o => {
                                        const on = offId === o.id;
                                        const r = tab && catSel && prodSel ? matchRigaTabellare(tab.righe, { tipo_cliente: prodSel.tipo_cliente, categoria: catSel.nome, prodotto: prodSel.nome, offerta: o.nome }) : null;
                                        return (
                                            <button key={o.id} onClick={() => { setOffId(o.id); setTierSel(null); }}
                                                className="rounded-xl px-3 py-3 text-sm font-semibold text-left border transition"
                                                style={{
                                                    background: on ? (meta?.color || "#6366f1") : "rgba(255,255,255,0.04)",
                                                    borderColor: on ? "transparent" : tab && !r ? "rgba(245,158,11,0.45)" : "rgba(255,255,255,0.10)",
                                                    color: on ? "#fff" : "#cbd5e1",
                                                }}>
                                                {o.nome}
                                                {tab && !r && <span className="block text-[10px] font-normal mt-0.5 text-amber-400">🚫 senza commissioning</span>}
                                            </button>
                                        );
                                    })}
                                    {!offsProd.length && <div className="text-slate-500 text-sm">Nessuna offerta per questo prodotto.</div>}
                                </div>
                            </>}
                        </div>
                    )}

                    {/* ③ RISULTATO */}
                    {offSel && (
                        <div className="glass-panel rounded-2xl p-6" style={{ borderLeft: `4px solid ${meta?.color || "#6366f1"}` }}>
                            {!tab ? (
                                <div className="text-amber-300 text-sm">Tabellare non caricato per questo mese: nessun pay calcolabile.</div>
                            ) : !riga ? (
                                <div className="text-amber-300 font-semibold flex items-center gap-2">
                                    <TriangleAlert size={20} /> Questa offerta non ha una riga di commissioning: NON genera pay.
                                    <span className="text-slate-400 text-xs font-normal">Va aggiunta la riga al tabellare (regola del catalogo).</span>
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-start justify-between flex-wrap gap-4">
                                        <div>
                                            <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">{riga.nome}</div>
                                            <div className="text-5xl font-black text-white leading-none">{euro(pay)}</div>
                                            <div className="text-slate-400 text-sm mt-2">
                                                {riga.gettone
                                                    ? "💰 Gettone unico — paga sempre, senza soglia"
                                                    : tier <= 0
                                                        ? '"Di cui base" — sotto la 1ª soglia'
                                                        : `alla Soglia ${tier} · retroattivo dal 1° pezzo`}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            {riga.pista && <div className="text-slate-300 text-sm font-semibold">{tab.piste.find(p => p.chiave === riga.pista)?.nome || riga.pista}</div>}
                                            {riga.punti > 0 && <div className="text-slate-400 text-sm mt-1">vale <b className="text-white">{riga.punti}</b> in soglia</div>}
                                        </div>
                                    </div>
                                    {!riga.gettone && scalaRiga.length > 0 && (
                                        <div className="mt-5">
                                            <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">
                                                Soglia — preselezionata su quella attuale di rete{avz && riga.pista ? ` (S${tierLive || "0"} · ${avz.piste[riga.pista]?.punti ?? 0} punti)` : ""}
                                            </div>
                                            <div className="flex gap-2 flex-wrap">
                                                <Pill on={tier === 0} onClick={() => setTierSel(0)}>Base</Pill>
                                                {scalaRiga.map(s => (
                                                    <Pill key={s.tier} on={tier === s.tier} onClick={() => setTierSel(s.tier)}>
                                                        S{s.tier} <span className="opacity-70 font-normal">({s.soglia_da}{s.soglia_a ? `–${s.soglia_a}` : "+"})</span>
                                                    </Pill>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {riga.note && <div className="text-slate-500 text-xs mt-4">{riga.note}</div>}
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* ④ AVANZAMENTO RETE + SCOPERTURE */}
                <div className="space-y-4">
                    {tab && (
                        <div className="glass-panel rounded-2xl p-5">
                            <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-3">Avanzamento rete · {mese}</div>
                            {!avz ? <div className="text-slate-500 text-sm">Calcolo…</div> : tab.piste.map(p => {
                                const a = avz.piste[p.chiave]; if (!a) return null;
                                const target = a.prossima?.soglia_da ?? a.soglia?.soglia_da ?? 0;
                                const perc = target > 0 ? Math.min(100, Math.round(a.punti / target * 100)) : 100;
                                return (
                                    <div key={p.chiave} className="mb-4 last:mb-0">
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="text-slate-200 font-semibold">{p.nome}</span>
                                            <span className="text-slate-400">{a.punti} punti · {a.tier > 0 ? `S${a.tier}` : "sotto soglia"}</span>
                                        </div>
                                        <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                                            <div className="h-full rounded-full" style={{ width: `${perc}%`, background: meta?.color || "#6366f1" }} />
                                        </div>
                                        {a.mancano != null && <div className="text-[11px] text-slate-500 mt-1">mancano {a.mancano} alla S{a.prossima?.tier}</div>}
                                    </div>
                                );
                            })}
                            {avz && avz.scartati.length > 0 && (
                                <div className="text-[11px] text-amber-400/80 mt-2">
                                    {avz.scartati.reduce((s, x) => s + x.n, 0)} vendite del mese senza riga pay (non contate)
                                </div>
                            )}
                        </div>
                    )}
                    {tab && (
                        <div className="glass-panel rounded-2xl p-5">
                            <button onClick={() => setMostraScoperte(v => !v)} className="w-full flex items-center justify-between text-sm font-semibold text-slate-200">
                                <span>🚫 Offerte senza commissioning ({scoperte.length})</span>
                                <ChevronDown size={16} className={mostraScoperte ? "rotate-180 transition" : "transition"} />
                            </button>
                            {mostraScoperte && (
                                <div className="mt-3 max-h-[420px] overflow-auto space-y-1">
                                    {scoperte.map((s, i) => (
                                        <div key={i} className="text-xs text-slate-400 border-b border-white/5 pb-1">
                                            <span className="text-slate-500">{s.tipo} · {s.cat} · {s.prod} →</span> <span className="text-slate-300">{s.off}</span>
                                        </div>
                                    ))}
                                    {!scoperte.length && <div className="text-xs text-emerald-400">Tutte le offerte hanno una riga pay 🎉</div>}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
