// @ts-nocheck
"use client";

// MASTER (ex Regia — Luca 21/08 notte): la plancia dell'admin.
// · Due lenti con lo switch: 🎯 CODICI (di inserimento) ↔ 🏪 NEGOZI.
//   - Codici: «so dove spostare le attivazioni» — SOLO operatori telefonici
//     (la Marginalità è roba di negozio, coi codici non c'entra niente);
//     OGNI brand ha il SUO filtro codici indipendente (multi), così si
//     vedono anche 4 brand insieme con 4 filtri diversi.
//   - Negozi: il quadro di cosa produce il punto vendita — tendina multi
//     negozi condivisa + carta Marginalità.
// · Per ogni brand: TUTTE le piste con le LORO soglie di gara (tabellare
//   AZIENDA) su barre interattive con le tacche S1..S8, più lo scoppiato per
//   categoria. Tutto è cliccabile: dal numero si arriva alla LISTA DEI
//   CONTRATTI (chi l'ha fatto, dove, con che codice) coi link diretti a
//   Ricerca Vendite e Tracking PDA.
// · Le gare sono MENSILI: con un periodo su più mesi le soglie si spengono
//   (resta la produzione), dentro un mese sono ritagliate sui giorni scelti.

import { useMemo, useState } from "react";
import { SelectMulti } from "@/components/SelectPersona";
import { contestoVfFw, calcolaAvanzamento } from "@/lib/commissioning";
import { cn } from "@/utils";
import { Tip, TipRiga, TipTitolo, SogliaBar, fmtPt, fmtN } from "./_charts";
import { GARA, LogoBrand, righeOperatore, DrillPanel } from "./_widgets";

const norm = (s) => String(s || "").trim().toLowerCase();
const PISTA_LABEL = { mobile: "Mobile", fisso: "Fisso", assicurazioni: "Assicurazioni", lucegas: "Luce & Gas", sky: "Punti Sky", cb: "Customer Base", business_mobile: "Business mobile", business_fisso: "Business fisso", soluzioni_digitali: "Soluzioni digitali", vas: "VAS", luce: "Luce", gas: "Gas", partnership: "Partnership" };
const PISTA_EMOJI = { mobile: "📱", fisso: "🌐", assicurazioni: "🛡", lucegas: "⚡", sky: "🟣", cb: "🔁", business_mobile: "💼", business_fisso: "💼", soluzioni_digitali: "🧩", vas: "✨", luce: "💡", gas: "🔥" };

export function Master({ items, righeGara, dati, labels, nG, oggi }) {
    const [lente, setLente] = useState("codici");         // "codici" | "negozi"
    const [codSel, setCodSel] = useState({ w3: [], vf: [], sky: [], fw: [] });
    const [negSel, setNegSel] = useState([]);
    const [drill, setDrill] = useState(null);

    const negoziTutti = useMemo(() => {
        const per = new Map();
        for (const it of items) { if (it.negozio === "—") continue; per.set(it.negozio, (per.get(it.negozio) || 0) + 1); }
        return [...per.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    }, [items]);

    // items del brand + filtro della lente attiva
    const itemsDi = (b) => items.filter((it) => it.brandGara === b);
    const filtra = (arr, b) => lente === "codici"
        ? (codSel[b]?.length ? arr.filter((x) => codSel[b].includes(x.cod_ins)) : arr)
        : (negSel.length ? arr.filter((x) => negSel.some((n) => norm(n) === norm(x.negozio))) : arr);

    // righe RAW per il motore azienda (solo mese singolo), con la stessa lente
    const inA = (c) => contestoVfFw("fastweb", c.cod_ins, c.negozio, c.categoria) === "vodafone";
    const rawDi = (b) => {
        if (!righeGara) return null;
        if (b === "w3") return righeGara.w3;
        if (b === "sky") return righeGara.sky;
        if (b === "vf") return [...righeGara.vf, ...righeGara.fw.filter(inA)].filter((c) => !(/mnp/i.test(String(c.prodotto || "")) && /vodafone|fastweb|\bho\b|ho\./i.test(String(c.provenienza || ""))));
        return null;
    };
    const filtraRaw = (arr, b) => !arr ? null : lente === "codici"
        ? (codSel[b]?.length ? arr.filter((c) => codSel[b].includes(c.cod_ins || "—")) : arr)
        : (negSel.length ? arr.filter((c) => negSel.some((n) => norm(n) === norm(c.negozio))) : arr);

    const TABS = { w3: dati.aw3, vf: dati.avf, sky: dati.asky, fw: null };

    return (
        <div className="space-y-4">
            {/* ── plancia: lente + filtri globali ─────────────────────── */}
            <div className="an-in rounded-2xl border border-fuchsia-400/25 bg-fuchsia-500/10 px-4 py-3 flex flex-wrap items-center gap-3 justify-between">
                <div className="min-w-0">
                    <p className="text-sm text-fuchsia-100"><b>🎛 Master</b> — {lente === "codici" ? "produzione per CODICE di inserimento: qui decidi dove spostare le attivazioni." : "produzione per PUNTO VENDITA: il quadro di cosa sta facendo il negozio."}</p>
                    <p className="text-[10px] text-fuchsia-200/60 mt-0.5">ogni numero si apre: clicca barre, categorie e chip per arrivare ai singoli contratti → 🔍 Ricerca · 🧭 Tracking</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {lente === "negozi" && (
                        <SelectMulti values={negSel} onChange={setNegSel} opzioni={negoziTutti} placeholder="tutti i negozi…" maxVoci={100} className="min-w-[220px]" />
                    )}
                    <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/10">
                        {[{ id: "codici", l: "🎯 Codici" }, { id: "negozi", l: "🏪 Negozi" }].map((x) => (
                            <button key={x.id} onClick={() => setLente(x.id)} className={cn("px-3.5 py-2 rounded-lg text-xs font-black transition-all", lente === x.id ? "bg-fuchsia-500/80 text-white shadow-lg shadow-fuchsia-500/30" : "text-slate-400 hover:text-white")}>{x.l}</button>
                        ))}
                    </div>
                </div>
            </div>

            {!righeGara && (
                <p className="an-in text-[11px] text-amber-200/90 bg-amber-400/10 border border-amber-400/20 rounded-xl px-3 py-2">📅 Le gare sono mensili: con un periodo su più mesi le soglie si spengono — resta la produzione. Scegli un periodo dentro un solo mese per vederle.</p>
            )}

            {["w3", "vf", "sky", "fw"].map((b, i) => (
                <CartaMaster key={b} b={b} lente={lente}
                    tab={TABS[b]} raw={filtraRaw(rawDi(b), b)}
                    sue={filtra(itemsDi(b), b)} sueTutte={itemsDi(b)}
                    codici={codSel[b]} setCodici={(v) => setCodSel((p) => ({ ...p, [b]: v }))}
                    apri={setDrill} labels={labels} delay={i * 60} />
            ))}

            {lente === "negozi" && <CartaMargMaster dati={dati} negSel={negSel} labels={labels} nG={nG} oggi={oggi} delay={280} />}

            <DrillPanel drill={drill} chiudi={() => setDrill(null)} labels={labels} />
        </div>
    );
}

/* ═══ LA CARTA DI UN BRAND NEL MASTER ══════════════════════════════════ */
function CartaMaster({ b, lente, tab, raw, sue, sueTutte, codici, setCodici, apri, labels, delay }) {
    const G = GARA[b];
    // codici visti su QUESTO brand (dal non filtrato: il filtro non si auto-nasconde le voci)
    const codiciBrand = useMemo(() => {
        const per = new Map();
        for (const it of sueTutte) { if (it.cod_ins === "—") continue; per.set(it.cod_ins, (per.get(it.cod_ins) || 0) + 1); }
        return [...per.entries()].sort((x, y) => y[1] - x[1]).map(([k]) => k);
    }, [sueTutte]);

    const av = useMemo(() => (tab && raw) ? calcolaAvanzamento(tab, raw) : null, [tab, raw]);
    const righe = useMemo(() => righeOperatore(b, sue), [b, sue]);
    const punti = Math.round(sue.reduce((s, x) => s + x.punti, 0) * 100) / 100;
    const senzaRiga = sue.filter((it) => it.senzaRiga).length;
    const escluse = sue.filter((it) => it.esclusa).length;

    const filtroLabel = lente === "codici"
        ? (codici.length ? `${codici.length} codici` : "tutti i codici")
        : "filtro negozi in alto";

    const drillPista = (chiave, nome) => apri({
        titolo: `${G.label} · ${nome} — contratti nel filtro`,
        sub: filtroLabel,
        items: sue.filter((it) => it.pista === chiave),
    });

    return (
        <div className="glass-card an-card rounded-2xl p-4 an-in relative overflow-hidden" style={{ animationDelay: `${delay}ms` }}>
            <span className="absolute inset-y-3 left-0 w-[3px] rounded-full" style={{ background: G.colore, boxShadow: `0 0 10px ${G.colore}` }} />
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3 pl-2">
                <div className="flex items-center gap-3 min-w-0">
                    <LogoBrand chiave={G.chiave} colore={G.colore} alt={G.label} h={38} origine="left" />
                    <span className="text-[10px] text-slate-500 whitespace-nowrap tabular-nums">{fmtN(sue.length)} pezzi{b !== "fw" ? <> · <b className="text-slate-300">{fmtPt(punti)}</b> pt</> : null} <span className="text-slate-600">({filtroLabel})</span></span>
                </div>
                {lente === "codici" && (
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">🎯 Codici</span>
                        <SelectMulti values={codici} onChange={setCodici} opzioni={codiciBrand} placeholder="tutti…" maxVoci={100} className="min-w-[200px]" />
                    </div>
                )}
            </div>

            {!sue.length ? <p className="text-xs text-slate-500 py-4 text-center">Nessuna vendita {G.label} nel filtro.</p> : (
                <div className="grid lg:grid-cols-2 gap-x-5 gap-y-2 pl-2">
                    {/* ── piste con le LORO soglie (tabellare azienda) ─────── */}
                    <div className="space-y-2">
                        {b === "fw" ? (
                            <p className="text-[11px] text-slate-500 rounded-xl bg-white/[.04] border border-white/[.06] px-3 py-3">🟡 La gara Fastweb T2 corre a <b className="text-slate-300">pezzi</b> (niente tabellare a soglie): il dettaglio per categoria è qui a destra. Il Fastweb sui codici T1 conta nella carta Vodafone (lettera A).</p>
                        ) : av ? (
                            [...tab.piste].sort((x, y) => x.ordine - y.ordine).map((p) => {
                                const st = av.piste[p.chiave];
                                if (!st || (!st.punti && !st.pezzi)) return null;
                                const scala = tab.soglie.filter((s) => s.pista === p.chiave).sort((x, y) => x.tier - y.tier);
                                return (
                                    <SogliaBar key={p.chiave}
                                        emoji={PISTA_EMOJI[p.chiave] || "▫️"} label={PISTA_LABEL[p.chiave] || p.nome}
                                        punti={st.punti} pezzi={st.pezzi} soglie={scala} colore={G.colore}
                                        gate={st.gate || null}
                                        malus={b === "w3" && p.chiave === "mobile" && av.malus30Mobile ? "malus −30% (fisso S1 o <6 P.IVA)" : null}
                                        onClick={() => drillPista(p.chiave, PISTA_LABEL[p.chiave] || p.nome)}
                                    />
                                );
                            })
                        ) : (
                            <p className="text-[11px] text-slate-500 rounded-xl bg-white/[.04] border border-white/[.06] px-3 py-3">📅 Soglie spente: periodo su più mesi{tab ? "" : " (o tabellare azienda assente)"} — la produzione del filtro resta qui a destra.</p>
                        )}
                    </div>

                    {/* ── scoppiato per categoria (cliccabile → contratti) ──── */}
                    <div className="space-y-1">
                        {righe.map((r) => {
                            const pt = Math.round(r.items.reduce((s, x) => s + x.punti, 0) * 100) / 100;
                            const maxPt = Math.max(1, b === "fw" ? sue.length : punti);
                            return (
                                <Tip key={r.label} block tip={<div>
                                    <TipTitolo>{r.emoji} {r.label}</TipTitolo>
                                    <TipRiga l="pezzi" r={fmtN(r.items.length)} colore={r.colore} />
                                    {b !== "fw" && <TipRiga l="punti" r={fmtPt(pt)} />}
                                    {r.det.map(([l, v]) => <TipRiga key={l} l={l} r={fmtN(v)} />)}
                                    <p className="text-[10px] text-indigo-300 mt-1">👆 clicca per l'elenco contratti</p>
                                </div>}>
                                    <div onClick={(e) => { e.stopPropagation(); apri({ titolo: `${G.label} · ${r.label}`, sub: filtroLabel, items: r.items }); }}
                                        className="grid grid-cols-[minmax(120px,1.2fr)_2fr_auto_auto] items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5 transition-colors cursor-pointer">
                                        <span className="text-xs font-semibold text-slate-200 truncate">{r.emoji} {r.label}</span>
                                        <span className="h-2 rounded-full bg-white/5 overflow-hidden">
                                            <span className="block h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(3, ((b === "fw" ? r.items.length : pt) / maxPt) * 100)}%`, background: `linear-gradient(90deg, ${r.colore}55, ${r.colore})` }} />
                                        </span>
                                        <span className="text-[11px] font-black text-white tabular-nums text-right w-14">{b === "fw" ? `${fmtN(r.items.length)} pz` : `${fmtPt(pt)} pt`}</span>
                                        <span className="text-[10px] text-slate-500 tabular-nums text-right w-12">{b === "fw" ? "" : `${fmtN(r.items.length)} pz`}</span>
                                    </div>
                                </Tip>
                            );
                        })}
                        <div className="flex flex-wrap gap-1.5 pt-1">
                            {escluse > 0 && <span onClick={() => apri({ titolo: `${G.label} · MNP escluse da lettera`, sub: filtroLabel, items: sue.filter((it) => it.esclusa) })} className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] text-slate-400 cursor-pointer hover:bg-white/10">🚫 {escluse} MNP escluse</span>}
                            {senzaRiga > 0 && <span onClick={() => apri({ titolo: `${G.label} · senza punti`, sub: filtroLabel, items: sue.filter((it) => it.senzaRiga) })} className="px-2 py-0.5 rounded-md bg-amber-400/10 border border-amber-400/25 text-[10px] text-amber-200 cursor-pointer hover:bg-amber-400/20">⚠ {senzaRiga} senza punti</span>}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ═══ MARGINALITÀ nel Master (SOLO lente Negozi: è roba di negozio) ════ */
function CartaMargMaster({ dati, negSel, labels, nG, oggi, delay }) {
    const righe = useMemo(() => (dati.ext || []).filter((r) => !negSel.length || negSel.some((n) => norm(n) === norm(r.negozio))), [dati.ext, negSel]);
    const venduto = righe.reduce((s, r) => s + (Number(r.prezzo) || 0), 0);
    const catDi = (p) => dati.margMap?.get(norm(p))?.cat || (/bundle/i.test(String(p || "")) ? "Bundle" : /(telefono|tnp|smartphone|iphone)/i.test(String(p || "")) ? "Telefoni" : "Altro");
    const icona = (nome) => nome === "Telefoni" ? "📱" : nome === "Bundle" ? "🎁" : (dati.margIcone?.get(nome) || "🧩");
    const perCat = useMemo(() => {
        const per = {};
        for (const r of righe) { const c = catDi(r.prodotto); (per[c] ??= { val: 0, qty: 0 }); per[c].val += Number(r.prezzo) || 0; per[c].qty += Math.max(1, Number(r.qty) || 1); }
        return Object.entries(per).sort((a, b) => b[1].val - a[1].val);
    }, [righe]);
    const perNegozio = useMemo(() => {
        const per = {};
        for (const r of righe) { (per[r.negozio] ??= 0); per[r.negozio] += Number(r.prezzo) || 0; }
        return Object.entries(per).sort((a, b) => b[1] - a[1]);
    }, [righe]);
    const eur = (v) => `${fmtN(Math.round(v))} €`;
    return (
        <div className="glass-card an-card rounded-2xl p-4 an-in relative overflow-hidden" style={{ animationDelay: `${delay}ms` }}>
            <span className="absolute inset-y-3 left-0 w-[3px] rounded-full" style={{ background: "#22c55e", boxShadow: "0 0 10px #22c55e" }} />
            <div className="flex items-center gap-3 mb-3 pl-2">
                <LogoBrand chiave="marginalita" colore="#22c55e" alt="Marginalità" h={34} origine="left" />
                <span className="text-[10px] text-slate-500 tabular-nums">venduto <b className="text-slate-200">{eur(venduto)}</b> · {fmtN(righe.reduce((s, r) => s + Math.max(1, Number(r.qty) || 1), 0))} pezzi <span className="text-slate-600">(roba di negozio: coi codici non c'entra)</span></span>
            </div>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 pl-2">
                <div className="space-y-1">
                    {perCat.slice(0, 7).map(([c, v]) => (
                        <div key={c} className="flex items-center gap-2 text-[11px]">
                            <span className="text-slate-300 flex-1 truncate">{icona(c)} {c}</span>
                            <b className="text-white tabular-nums">{eur(v.val)}</b>
                            <span className="text-[10px] text-slate-500 tabular-nums w-12 text-right">{fmtN(v.qty)} pz</span>
                        </div>
                    ))}
                </div>
                <div className="space-y-1">
                    {perNegozio.slice(0, 7).map(([n, v]) => (
                        <div key={n} className="flex items-center gap-2 text-[11px]">
                            <span className="text-slate-300 flex-1 truncate">🏪 {n}</span>
                            <b className="text-white tabular-nums">{eur(v)}</b>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
